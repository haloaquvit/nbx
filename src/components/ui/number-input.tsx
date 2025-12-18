import * as React from "react"
import { cn } from "@/lib/utils"

export interface NumberInputProps extends Omit<React.InputHTMLAttributes<HTMLInputElement>, 'onChange' | 'value'> {
  value?: number | string
  onChange?: (value: number | undefined) => void
  min?: number
  max?: number
  step?: number
  allowEmpty?: boolean
  allowNegative?: boolean
  decimalPlaces?: number
}

const NumberInput = React.forwardRef<HTMLInputElement, NumberInputProps>(
  ({
    className,
    value,
    onChange,
    min,
    max,
    step = 1,
    allowEmpty = true,
    allowNegative = false,
    decimalPlaces = 2,
    onBlur,
    ...props
  }, ref) => {
    const [inputValue, setInputValue] = React.useState<string>(() => {
      if (value === undefined || value === null || value === '') return ''
      return String(value)
    })

    // Sync with external value changes
    React.useEffect(() => {
      if (value === undefined || value === null || value === '') {
        setInputValue('')
      } else if (String(value) !== inputValue) {
        setInputValue(String(value))
      }
    }, [value])

    const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
      const newValue = e.target.value

      // Allow empty string
      if (newValue === '') {
        setInputValue('')
        if (onChange) {
          onChange(allowEmpty ? undefined : 0)
        }
        return
      }

      // Allow minus sign for negative numbers
      if (allowNegative && newValue === '-') {
        setInputValue('-')
        return
      }

      // Validate number format
      const numberPattern = allowNegative
        ? /^-?\d*\.?\d*$/
        : /^\d*\.?\d*$/

      if (!numberPattern.test(newValue)) {
        return // Reject invalid input
      }

      // Set the input value (allows partial input like "12.")
      setInputValue(newValue)

      // Parse and validate the number
      const parsedValue = parseFloat(newValue)

      if (!isNaN(parsedValue)) {
        // Check min/max constraints
        let finalValue = parsedValue

        if (min !== undefined && parsedValue < min) {
          finalValue = min
        }
        if (max !== undefined && parsedValue > max) {
          finalValue = max
        }

        if (onChange) {
          onChange(finalValue)
        }
      }
    }

    const handleBlur = (e: React.FocusEvent<HTMLInputElement>) => {
      const currentValue = inputValue

      // Handle empty or invalid values
      if (currentValue === '' || currentValue === '-') {
        if (!allowEmpty) {
          const defaultValue = min !== undefined ? min : 0
          setInputValue(String(defaultValue))
          if (onChange) {
            onChange(defaultValue)
          }
        }
      } else {
        // Format the number on blur
        const parsedValue = parseFloat(currentValue)
        if (!isNaN(parsedValue)) {
          let finalValue = parsedValue

          // Apply min/max constraints
          if (min !== undefined && finalValue < min) {
            finalValue = min
          }
          if (max !== undefined && finalValue > max) {
            finalValue = max
          }

          // Format with decimal places
          const formatted = finalValue.toFixed(decimalPlaces)
          setInputValue(formatted)

          if (onChange && finalValue !== parsedValue) {
            onChange(finalValue)
          }
        }
      }

      // Call original onBlur if provided
      if (onBlur) {
        onBlur(e)
      }
    }

    const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
      // Allow: backspace, delete, tab, escape, enter, decimal point
      if ([46, 8, 9, 27, 13, 110, 190].includes(e.keyCode) ||
        // Allow: Ctrl+A, Ctrl+C, Ctrl+V, Ctrl+X
        (e.keyCode === 65 && e.ctrlKey === true) ||
        (e.keyCode === 67 && e.ctrlKey === true) ||
        (e.keyCode === 86 && e.ctrlKey === true) ||
        (e.keyCode === 88 && e.ctrlKey === true) ||
        // Allow: home, end, left, right
        (e.keyCode >= 35 && e.keyCode <= 39)) {
        return
      }

      // Allow minus sign for negative numbers
      if (allowNegative && e.key === '-' && inputValue === '') {
        return
      }

      // Ensure that it is a number or decimal point
      if ((e.shiftKey || (e.keyCode < 48 || e.keyCode > 57)) &&
          (e.keyCode < 96 || e.keyCode > 105)) {
        e.preventDefault()
      }
    }

    return (
      <input
        type="text"
        inputMode="decimal"
        ref={ref}
        value={inputValue}
        onChange={handleChange}
        onBlur={handleBlur}
        onKeyDown={handleKeyDown}
        className={cn(
          "flex h-9 w-full rounded-md border border-input bg-transparent px-3 py-1 text-sm shadow-sm transition-colors file:border-0 file:bg-transparent file:text-sm file:font-medium placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-50",
          className
        )}
        {...props}
      />
    )
  }
)

NumberInput.displayName = "NumberInput"

export { NumberInput }
