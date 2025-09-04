import jsPDF from 'jspdf'

/**
 * Compresses a jsPDF document to meet size requirements
 * @param doc - jsPDF document
 * @param filename - Output filename
 * @param maxSizeKB - Maximum file size in KB
 */
export async function saveCompressedPDF(
  doc: jsPDF,
  filename: string,
  maxSizeKB: number = 100
): Promise<void> {
  try {
    // Enable compression in the document
    doc.compress = true
    
    // Get the PDF as array buffer
    const pdfData = doc.output('arraybuffer')
    const currentSizeKB = pdfData.byteLength / 1024
    
    console.log(`PDF size: ${currentSizeKB.toFixed(2)}KB (target: ${maxSizeKB}KB)`)
    
    if (currentSizeKB <= maxSizeKB) {
      // PDF is already within size limit
      doc.save(filename)
      return
    }
    
    console.warn(`PDF exceeds size limit (${currentSizeKB.toFixed(2)}KB > ${maxSizeKB}KB). Consider reducing content or image quality.`)
    
    // Save anyway - jsPDF compression is limited for text-based PDFs
    doc.save(filename)
  } catch (error) {
    console.error('Error compressing PDF:', error)
    // Fallback to regular save
    doc.save(filename)
  }
}

interface CompressionOptions {
  maxSizeKB: number
  initialQuality: number
  minQuality: number
  qualityStep: number
}

/**
 * Compresses a canvas to fit within the specified file size limit
 * @param canvas - HTML Canvas element
 * @param options - Compression options
 * @returns Promise<string> - Compressed image data URL
 */
export async function compressCanvasToSize(
  canvas: HTMLCanvasElement, 
  options: CompressionOptions = {
    maxSizeKB: 100,
    initialQuality: 0.9,
    minQuality: 0.1,
    qualityStep: 0.1
  }
): Promise<string> {
  const { maxSizeKB, initialQuality, minQuality, qualityStep } = options
  const maxSizeBytes = maxSizeKB * 1024

  let quality = initialQuality
  let compressedDataUrl = canvas.toDataURL('image/jpeg', quality)
  
  // Estimate file size (base64 string length * 0.75 approximates the file size)
  let estimatedSize = compressedDataUrl.length * 0.75

  // Keep reducing quality until we reach target size or minimum quality
  while (estimatedSize > maxSizeBytes && quality > minQuality) {
    quality -= qualityStep
    compressedDataUrl = canvas.toDataURL('image/jpeg', quality)
    estimatedSize = compressedDataUrl.length * 0.75
  }

  // If still too large, try reducing canvas resolution
  if (estimatedSize > maxSizeBytes) {
    return await compressCanvasResolution(canvas, maxSizeBytes, minQuality)
  }

  return compressedDataUrl
}

/**
 * Reduces canvas resolution to achieve target file size
 * @param canvas - HTML Canvas element
 * @param maxSizeBytes - Maximum file size in bytes
 * @param quality - JPEG quality
 * @returns Promise<string> - Compressed image data URL
 */
async function compressCanvasResolution(
  canvas: HTMLCanvasElement, 
  maxSizeBytes: number, 
  quality: number
): Promise<string> {
  let scale = 0.8
  const minScale = 0.3
  
  while (scale > minScale) {
    // Create a smaller canvas
    const smallCanvas = document.createElement('canvas')
    const ctx = smallCanvas.getContext('2d')
    
    if (!ctx) throw new Error('Could not get 2D context')
    
    smallCanvas.width = canvas.width * scale
    smallCanvas.height = canvas.height * scale
    
    // Draw the original canvas scaled down
    ctx.drawImage(canvas, 0, 0, smallCanvas.width, smallCanvas.height)
    
    const compressedDataUrl = smallCanvas.toDataURL('image/jpeg', quality)
    const estimatedSize = compressedDataUrl.length * 0.75
    
    if (estimatedSize <= maxSizeBytes) {
      return compressedDataUrl
    }
    
    scale -= 0.1
  }
  
  // If still too large, return the smallest possible version
  const smallCanvas = document.createElement('canvas')
  const ctx = smallCanvas.getContext('2d')!
  
  smallCanvas.width = canvas.width * minScale
  smallCanvas.height = canvas.height * minScale
  
  ctx.drawImage(canvas, 0, 0, smallCanvas.width, smallCanvas.height)
  return smallCanvas.toDataURL('image/jpeg', quality)
}

/**
 * Creates a compressed PDF from an HTML element
 * @param element - HTML element to convert
 * @param filename - PDF filename
 * @param format - PDF format [width, height] in mm
 * @param maxSizeKB - Maximum file size in KB
 */
export async function createCompressedPDF(
  element: HTMLElement,
  filename: string,
  format: [number, number] = [148, 210], // A5-like format
  maxSizeKB: number = 100
): Promise<void> {
  const html2canvas = (await import('html2canvas')).default
  
  try {
    // Temporarily move element to visible area for rendering
    const originalPosition = element.style.position
    const originalLeft = element.style.left
    const originalTop = element.style.top
    const originalZIndex = element.style.zIndex
    
    element.style.position = 'absolute'
    element.style.left = '0px'
    element.style.top = '0px'
    element.style.zIndex = '9999'
    
    // Wait a bit for rendering
    await new Promise(resolve => setTimeout(resolve, 100))

    // Create canvas from the element with optimized settings
    const canvas = await html2canvas(element, {
      scale: 2,
      useCORS: true,
      allowTaint: true,
      backgroundColor: '#ffffff',
      removeContainer: false,
      foreignObjectRendering: false,
      logging: false,
      width: element.offsetWidth,
      height: element.offsetHeight,
      windowWidth: element.offsetWidth,
      windowHeight: element.offsetHeight
    })

    // Restore original position
    element.style.position = originalPosition
    element.style.left = originalLeft
    element.style.top = originalTop
    element.style.zIndex = originalZIndex

    // Check if canvas is empty
    if (canvas.width === 0 || canvas.height === 0) {
      throw new Error('Canvas is empty - element might not be visible')
    }

    // Compress the canvas to fit within size limit
    const compressedImageData = await compressCanvasToSize(canvas, {
      maxSizeKB: maxSizeKB * 0.95, // Leave 5% buffer for PDF overhead
      initialQuality: 0.8,
      minQuality: 0.2,
      qualityStep: 0.1
    })

    // Create PDF
    const pdf = new jsPDF({
      orientation: 'portrait',
      unit: 'mm',
      format: format,
      compress: true // Enable PDF compression
    })

    const [imgWidth, imgHeight] = format
    
    // Calculate aspect ratio to fit the page
    const aspectRatio = canvas.height / canvas.width
    let finalWidth = imgWidth
    let finalHeight = imgWidth * aspectRatio
    
    // If height exceeds page height, scale down
    if (finalHeight > imgHeight) {
      finalHeight = imgHeight
      finalWidth = imgHeight / aspectRatio
    }
    
    // Center the image on the page
    const xOffset = (imgWidth - finalWidth) / 2
    const yOffset = (imgHeight - finalHeight) / 2

    pdf.addImage(compressedImageData, 'JPEG', xOffset, yOffset, finalWidth, finalHeight)
    
    // Save the PDF
    pdf.save(filename)
    
    console.log(`PDF saved: ${filename} (target: ${maxSizeKB}KB)`)
  } catch (error) {
    console.error('Error creating compressed PDF:', error)
    throw error
  }
}