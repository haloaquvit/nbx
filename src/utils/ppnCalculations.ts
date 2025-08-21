/**
 * Utility functions for PPN (VAT) calculations
 */

export interface PPNCalculation {
  subtotal: number
  ppnAmount: number
  total: number
}

/**
 * Calculate PPN amount and total from subtotal (PPN Exclude mode)
 */
export const calculatePPN = (subtotal: number, ppnPercentage: number): PPNCalculation => {
  const ppnAmount = Math.round((subtotal * ppnPercentage) / 100)
  const total = subtotal + ppnAmount
  
  return {
    subtotal,
    ppnAmount,
    total
  }
}

/**
 * Calculate PPN with include/exclude mode
 */
export const calculatePPNWithMode = (
  amount: number, 
  ppnPercentage: number, 
  mode: 'include' | 'exclude'
): PPNCalculation => {
  if (mode === 'exclude') {
    // PPN Exclude: amount is the subtotal, add PPN on top
    const ppnAmount = Math.round((amount * ppnPercentage) / 100)
    return {
      subtotal: amount,
      ppnAmount,
      total: amount + ppnAmount
    }
  } else {
    // PPN Include: amount already includes PPN, calculate subtotal
    const subtotal = Math.round(amount / (1 + ppnPercentage / 100))
    const ppnAmount = amount - subtotal
    return {
      subtotal,
      ppnAmount,
      total: amount
    }
  }
}

/**
 * Calculate subtotal from total including PPN
 */
export const calculateSubtotalFromTotal = (totalWithPPN: number, ppnPercentage: number): PPNCalculation => {
  const subtotal = Math.round(totalWithPPN / (1 + ppnPercentage / 100))
  const ppnAmount = totalWithPPN - subtotal
  
  return {
    subtotal,
    ppnAmount,
    total: totalWithPPN
  }
}

/**
 * Format PPN percentage for display
 */
export const formatPPNPercentage = (percentage: number): string => {
  return `${percentage}%`
}

/**
 * Get default PPN percentage (11% for Indonesia)
 */
export const getDefaultPPNPercentage = (): number => {
  return 11
}

/**
 * Validate PPN percentage range
 */
export const isValidPPNPercentage = (percentage: number): boolean => {
  return percentage >= 0 && percentage <= 100
}