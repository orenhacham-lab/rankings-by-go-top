import { cn } from '@/lib/utils'
import { InputHTMLAttributes, forwardRef } from 'react'

interface InputProps extends InputHTMLAttributes<HTMLInputElement> {
  label?: string
  error?: string
  hint?: string
}

// Types that should render LTR (URLs, domains, email, phone numbers, passwords)
const LTR_TYPES = new Set(['email', 'url', 'tel', 'password', 'number'])

/**
 * The one field style (Select and Textarea share it): a white well with a hairline
 * border that darkens on hover, and on focus an accent border with a soft halo —
 * visible from across the screen without shouting. An error swaps both to `bad`.
 */
export const FIELD_CLASSES =
  'w-full rounded-control border border-line bg-surface px-3 text-copy text-ink shadow-control placeholder:text-muted ' +
  'transition-[border-color,box-shadow] duration-150 ease-snappy hover:border-line-strong ' +
  'focus:outline-none focus:border-action focus:ring-4 focus:ring-action/20 ' +
  'disabled:cursor-not-allowed disabled:bg-sunk disabled:text-muted'

export const FIELD_ERROR_CLASSES = 'border-bad hover:border-bad focus:border-bad focus:ring-bad/20'

export const FIELD_LABEL_CLASSES = 'text-caption font-semibold text-ink'

const Input = forwardRef<HTMLInputElement, InputProps>(
  ({ label, error, hint, className, id, type, ...props }, ref) => {
    const inputId = id || label?.toLowerCase().replace(/\s+/g, '-')
    // LTR fields keep the native direction; everything else stays RTL
    const directionClass = type && LTR_TYPES.has(type) ? 'dir-ltr text-left' : ''

    return (
      <div className="flex flex-col gap-1.5">
        {label && (
          <label htmlFor={inputId} className={FIELD_LABEL_CLASSES}>
            {label}
          </label>
        )}
        <input
          ref={ref}
          id={inputId}
          type={type}
          dir={type && LTR_TYPES.has(type) ? 'ltr' : undefined}
          aria-invalid={error ? true : undefined}
          className={cn(
            FIELD_CLASSES,
            'py-2',
            error && FIELD_ERROR_CLASSES,
            directionClass,
            className
          )}
          {...props}
        />
        {error && <p className="text-caption text-bad">{error}</p>}
        {hint && !error && <p className="text-caption text-muted">{hint}</p>}
      </div>
    )
  }
)
Input.displayName = 'Input'

export default Input
