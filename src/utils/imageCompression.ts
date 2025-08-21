/**
 * Compress an image file to a maximum size of 100KB
 * @param file - The image file to compress
 * @param maxSizeKB - Maximum file size in KB (default: 100)
 * @param maxWidth - Maximum width in pixels (default: 1200)
 * @param maxHeight - Maximum height in pixels (default: 1200)
 * @returns Promise<File> - Compressed image file
 */
export async function compressImage(
  file: File,
  maxSizeKB: number = 100,
  maxWidth: number = 1200,
  maxHeight: number = 1200
): Promise<File> {
  return new Promise((resolve, reject) => {
    // Check if file is already small enough
    if (file.size <= maxSizeKB * 1024) {
      resolve(file);
      return;
    }

    const canvas = document.createElement('canvas');
    const ctx = canvas.getContext('2d');
    const img = new Image();

    img.onload = () => {
      // Calculate new dimensions while maintaining aspect ratio
      let { width, height } = img;
      
      if (width > height) {
        if (width > maxWidth) {
          height = (height * maxWidth) / width;
          width = maxWidth;
        }
      } else {
        if (height > maxHeight) {
          width = (width * maxHeight) / height;
          height = maxHeight;
        }
      }

      canvas.width = width;
      canvas.height = height;

      // Draw and compress image
      ctx!.drawImage(img, 0, 0, width, height);

      // Try different quality levels to achieve target size
      let quality = 0.9;
      let attempts = 0;
      const maxAttempts = 10;

      const tryCompress = () => {
        canvas.toBlob(
          (blob) => {
            if (!blob) {
              reject(new Error('Failed to compress image'));
              return;
            }

            // If file is still too large and we haven't exhausted attempts, try lower quality
            if (blob.size > maxSizeKB * 1024 && attempts < maxAttempts) {
              quality -= 0.1;
              attempts++;
              if (quality > 0.1) {
                tryCompress();
                return;
              }
            }

            // Create new file with compressed blob
            const compressedFile = new File([blob], file.name, {
              type: file.type,
              lastModified: Date.now()
            });

            resolve(compressedFile);
          },
          file.type,
          quality
        );
      };

      tryCompress();
    };

    img.onerror = () => {
      reject(new Error('Failed to load image'));
    };

    // Create object URL for the image
    const objectUrl = URL.createObjectURL(file);
    img.src = objectUrl;

    // Clean up object URL after image loads
    img.onload = () => {
      URL.revokeObjectURL(objectUrl);
      img.onload(); // Call the original onload
    };
  });
}

/**
 * Format file size in human readable format
 * @param bytes - Size in bytes
 * @returns String representation of file size
 */
export function formatFileSize(bytes: number): string {
  if (bytes === 0) return '0 Bytes';
  
  const k = 1024;
  const sizes = ['Bytes', 'KB', 'MB', 'GB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  
  return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
}

/**
 * Validate if file is an image
 * @param file - File to validate
 * @returns boolean
 */
export function isImageFile(file: File): boolean {
  return file.type.startsWith('image/');
}

/**
 * Get image dimensions
 * @param file - Image file
 * @returns Promise with width and height
 */
export function getImageDimensions(file: File): Promise<{width: number, height: number}> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    const objectUrl = URL.createObjectURL(file);
    
    img.onload = () => {
      URL.revokeObjectURL(objectUrl);
      resolve({
        width: img.naturalWidth,
        height: img.naturalHeight
      });
    };
    
    img.onerror = () => {
      URL.revokeObjectURL(objectUrl);
      reject(new Error('Failed to load image'));
    };
    
    img.src = objectUrl;
  });
}