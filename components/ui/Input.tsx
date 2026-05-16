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
          <label htmlFor={inputId} className="text-sm font-medium text-slate-700 dark:text-slate-300">
            {label}
          </label>
        )}
        <input
          ref={ref}
          id={inputId}
          type={type}
          dir={type && LTR_TYPES.has(type) ? 'ltr' : undefined}
          className={cn(
            'w-full px-3 py-2 text-sm rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 placeholder-slate-400 dark:placeholder-slate-500 text-slate-900 dark:text-slate-50 transition-colors',
            'focus:outline-none focus:ring-2 focus:ring-blue-500 dark:focus:ring-blue-400 focus:border-transparent dark:focus:border-blue-600',
            error && 'border-red-400 dark:border-red-600 focus:ring-red-400 dark:focus:ring-red-500',
            directionClass,
            className
          )}
          {...props}
        />
        {error && <p className="text-xs text-red-600 dark:text-red-400">{error}</p>}
        {hint && !error && <p className="text-xs text-slate-500 dark:text-slate-400">{hint}</p>}
      </div>
    )
  }
)
Input.displayName = 'Input'

export default Input
