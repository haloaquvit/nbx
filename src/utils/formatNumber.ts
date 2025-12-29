/**
 * Format number with thousand separators (comma)
 * @param value - Number or string to format
 * @param decimals - Number of decimal places (default: 2)
 * @returns Formatted string with thousand separators
 *
 * Examples:
 * formatCurrency(1000) => "1,000.00"
 * formatCurrency(1000000) => "1,000,000.00"
 * formatCurrency(1000000, 0) => "1,000,000"
 */
export function formatCurrency(value: number | string | null | undefined, decimals: number = 2): string {
  if (value === null || value === undefined || value === '') return '0';

  const numValue = typeof value === 'string' ? parseFloat(value) : value;

  if (isNaN(numValue)) return '0';

  // Use en-US locale to get comma as thousand separator (not dot like id-ID)
  // This is consistent with input parsing which expects commas
  return new Intl.NumberFormat('en-US', {
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals,
  }).format(numValue);
}

/**
 * Format number with thousand separators without decimals
 * @param value - Number or string to format
 * @returns Formatted string with thousand separators, no decimals
 *
 * Example:
 * formatNumber(1000000) => "1,000,000"
 */
export function formatNumber(value: number | string | null | undefined): string {
  return formatCurrency(value, 0);
}

/**
 * Parse formatted number string back to number
 * @param value - Formatted string with commas or dots as thousand separator
 * @returns Number value
 *
 * Example:
 * parseFormattedNumber("1,000,000") => 1000000
 * parseFormattedNumber("1.000.000") => 1000000 (Indonesian format)
 */
export function parseFormattedNumber(value: string): number {
  if (!value) return 0;
  // Remove both dots and commas (thousand separators for different locales)
  const cleaned = value.replace(/[.,]/g, '');
  const parsed = parseFloat(cleaned);
  return isNaN(parsed) ? 0 : parsed;
}

/**
 * Format money value (Rupiah) with thousand separators
 * Automatically removes unnecessary decimals (.00)
 * @param value - Number or string to format
 * @returns Formatted string
 *
 * Examples:
 * formatMoney(1000000) => "1,000,000"
 * formatMoney(1000000.50) => "1,000,000.50"
 * formatMoney(1000000.00) => "1,000,000"
 */
export function formatMoney(value: number | string | null | undefined): string {
  if (value === null || value === undefined || value === '') return '0';

  const numValue = typeof value === 'string' ? parseFloat(value) : value;

  if (isNaN(numValue)) return '0';

  // Check if it has decimal part
  const hasDecimals = numValue % 1 !== 0;

  // Use en-US locale for comma thousand separator (consistent with input parsing)
  return new Intl.NumberFormat('en-US', {
    minimumFractionDigits: hasDecimals ? 2 : 0,
    maximumFractionDigits: 2,
  }).format(numValue);
}

/**
 * Format number with commas as thousand separators
 * Alias for formatNumber - for backwards compatibility
 * @param value - Number or string to format
 * @returns Formatted string with thousand separators
 */
export function formatNumberWithCommas(value: number | string | null | undefined): string {
  return formatNumber(value);
}

/**
 * Parse number string with commas back to number
 * Alias for parseFormattedNumber - for backwards compatibility
 * @param value - Formatted string with commas/dots
 * @returns Number value
 */
export function parseNumberWithCommas(value: string): number {
  return parseFormattedNumber(value);
}
