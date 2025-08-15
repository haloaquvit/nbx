/**
 * Utility functions for PPN (VAT) calculations
 */

export interface PPNCalculation {
  subtotal: number
  ppnAmount: number
  total: number
}

/**
 * Calculate PPN amount and total from subtotal
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