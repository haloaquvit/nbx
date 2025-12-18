import * as React from "react";

import { cn } from "@/lib/utils";

const Input = React.forwardRef<HTMLInputElement, React.ComponentProps<"input">>(
  ({ className, type, onChange, value, ...props }, ref) => {
    const innerRef = React.useRef<HTMLInputElement>(null);

    // Combine refs
    React.useImperativeHandle(ref, () => innerRef.current!);

    // Format number with thousand separators, hide .00
    const formatNumber = (val: string | number): string => {
      if (val === undefined || val === null || val === '') return '';

      const strVal = String(val);
      // Remove all non-digit characters except decimal point
      const numStr = strVal.replace(/[^\d.]/g, '');

      // Handle empty or invalid input
      if (!numStr || numStr === '.') return '';

      const parts = numStr.split('.');

      // Add thousand separators to integer part
      if (parts[0]) {
        parts[0] = parts[0].replace(/\B(?=(\d{3})+(?!\d))/g, ',');
      }

      // Only include decimal part if it's not .00
      if (parts.length > 1 && parts[1] && parseFloat('0.' + parts[1]) > 0) {
        return parts[0] + '.' + parts[1];
      }

      return parts[0];
    };

    // Parse formatted number back to raw number
    const parseNumber = (val: string): string => {
      return val.replace(/,/g, '');
    };

    // Check if value looks like a number (for auto-formatting)
    const isNumericValue = (val: any): boolean => {
      if (val === undefined || val === null || val === '') return false;
      const strVal = String(val);
      // Check if it's a pure number or already formatted number
      return /^[\d,]+\.?\d*$/.test(strVal);
    };

    // Determine if we should format this input
    const shouldFormat = type === 'number' || (value !== undefined && isNumericValue(value));

    // Get display value with formatting
    const getDisplayValue = (): string | number | readonly string[] | undefined => {
      if (shouldFormat && value !== undefined && value !== null && value !== '') {
        return formatNumber(value);
      }
      return value;
    };

    const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
      if (type === 'number') {
        const inputVal = e.target.value;
        const rawValue = parseNumber(inputVal);

        // Create synthetic event with raw value for parent
        const syntheticEvent = {
          ...e,
          target: {
            ...e.target,
            value: rawValue,
          },
        } as React.ChangeEvent<HTMLInputElement>;

        onChange?.(syntheticEvent);
      } else {
        onChange?.(e);
      }
    };

    // For number inputs, use text type with formatted display
    if (type === 'number') {
      return (
        <input
          type="text"
          className={cn(
            "flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-base ring-offset-background file:border-0 file:bg-transparent file:text-sm file:font-medium file:text-foreground placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50 md:text-sm",
            className,
          )}
          ref={innerRef}
          value={getDisplayValue()}
          onChange={handleChange}
          {...props}
        />
      );
    }

    return (
      <input
        type={type}
        className={cn(
          "flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-base ring-offset-background file:border-0 file:bg-transparent file:text-sm file:font-medium file:text-foreground placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50 md:text-sm",
          className,
        )}
        ref={innerRef}
        value={getDisplayValue()}
        onChange={onChange}
        {...props}
      />
    );
  },
);
Input.displayName = "Input";

export { Input };
