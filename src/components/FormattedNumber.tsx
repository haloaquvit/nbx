import { formatMoney } from '@/utils/formatNumber';

interface FormattedNumberProps {
  value: number | string | null | undefined;
  /** Number of decimal places to show. Default: auto (hide .00) */
  decimals?: number;
  className?: string;
}

/**
 * Component to display formatted numbers with thousand separators
 * Usage: <FormattedNumber value={1000000} />
 * Result: 1,000,000
 */
export function FormattedNumber({ value, decimals, className }: FormattedNumberProps) {
  if (decimals !== undefined) {
    // If decimals specified, use formatCurrency
    const { formatCurrency } = require('@/utils/formatNumber');
    return <span className={className}>{formatCurrency(value, decimals)}</span>;
  }

  // Otherwise use formatMoney (auto hide .00)
  return <span className={className}>{formatMoney(value)}</span>;
}
