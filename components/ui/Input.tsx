import { cn } from '@/lib/utils'
import { InputHTMLAttributes, forwardRef } from 'react'

interface InputProps extends InputHTMLAttributes<HTMLInputElement> {
  label?: string
  error?: string
  hint?: string
}

// Types that should render LTR (URLs, domains, email, phone numbers, passwords)
const LTR_TYPES = new Set(['email', 'url', 'tel', 'password', 'number'])

const Input = forwardRef<HTMLInputElement, InputProps>(
  ({ label, error, hint, className, id, type, ...props }, ref) => {
    const inputId = id || label?.toLowerCase().replace(/\s+/g, '-')
    // LTR fields keep the native direction; everything else stays RTL
    const directionClass = type && LTR_TYPES.has(type) ? 'dir-ltr text-left' : ''

    return (
      <div className="flex flex-col gap-1">
        {label && (
          <label htmlFor={inputId} className="text-sm font-medium text-body">
            {label}
          </label>
        )}
        <input
          ref={ref}
          id={inputId}
          type={type}
          dir={type && LTR_TYPES.has(type) ? 'ltr' : undefined}
          className={cn(
            'w-full px-3 py-2 text-sm rounded-control border border-line bg-surface placeholder-muted text-ink transition-colors',
            'focus:outline-none focus:ring-2 focus:ring-action focus:border-transparent',
            error && 'border-bad focus:ring-bad',
            directionClass,
            className
          )}
          {...props}
        />
        {error && <p className="text-xs text-bad">{error}</p>}
        {hint && !error && <p className="text-xs text-muted">{hint}</p>}
      </div>
    )
  }
)
Input.displayName = 'Input'

export default Input
