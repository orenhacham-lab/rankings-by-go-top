import { cn } from '@/lib/utils'
import { SelectHTMLAttributes, forwardRef } from 'react'
import { FIELD_CLASSES, FIELD_ERROR_CLASSES, FIELD_LABEL_CLASSES } from './Input'

interface SelectProps extends SelectHTMLAttributes<HTMLSelectElement> {
  label?: string
  error?: string
  options: { value: string; label: string }[]
}

/**
 * A native select in the shared field style. The browser's own arrow is replaced
 * by one drawn at the logical END of the field, so it sits on the left in Hebrew
 * and on the right in English, with room reserved for it on that side only.
 */
const Select = forwardRef<HTMLSelectElement, SelectProps>(
  ({ label, error, options, className, id, ...props }, ref) => {
    const selectId = id || label?.toLowerCase().replace(/\s+/g, '-')
    return (
      <div className="flex flex-col gap-1.5">
        {label && (
          <label htmlFor={selectId} className={FIELD_LABEL_CLASSES}>
            {label}
          </label>
        )}
        <div className="relative">
          <select
            ref={ref}
            id={selectId}
            aria-invalid={error ? true : undefined}
            className={cn(
              FIELD_CLASSES,
              'appearance-none py-2 pe-9 cursor-pointer',
              error && FIELD_ERROR_CLASSES,
              className
            )}
            {...props}
          >
            {options.map((opt) => (
              <option key={opt.value} value={opt.value}>
                {opt.label}
              </option>
            ))}
          </select>
          <svg
            aria-hidden="true"
            viewBox="0 0 16 16"
            className="pointer-events-none absolute end-3 top-1/2 size-4 -translate-y-1/2 text-muted"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.75"
            strokeLinecap="round"
            strokeLinejoin="round"
          >
            <path d="M4 6l4 4 4-4" />
          </svg>
        </div>
        {error && <p className="text-caption text-bad">{error}</p>}
      </div>
    )
  }
)
Select.displayName = 'Select'

export default Select
