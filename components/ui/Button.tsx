import { cn } from '@/lib/utils'
import { ButtonHTMLAttributes, forwardRef } from 'react'

interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: 'primary' | 'secondary' | 'danger' | 'ghost' | 'outline'
  size?: 'sm' | 'md' | 'lg'
  loading?: boolean
}

const Button = forwardRef<HTMLButtonElement, ButtonProps>(
  ({ className, variant = 'primary', size = 'md', loading, disabled, children, ...props }, ref) => {
    return (
      <button
        ref={ref}
        disabled={disabled || loading}
        className={cn(
          'inline-flex items-center justify-center gap-2 font-semibold rounded-lg transition-all duration-150 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500 focus-visible:ring-offset-2 disabled:opacity-50 disabled:cursor-not-allowed',
          {
            'bg-gradient-to-r from-blue-600 to-indigo-600 text-white hover:shadow-[0_12px_28px_rgba(79,70,229,0.25)] active:from-blue-700 active:to-indigo-700 shadow-[0_10px_24px_rgba(79,70,229,0.22)] hover:-translate-y-0.5': variant === 'primary',
            'bg-white text-slate-700 border border-slate-200/80 hover:bg-slate-50 active:bg-slate-100 shadow-sm hover:shadow-md': variant === 'secondary',
            'bg-red-600 text-white hover:bg-red-700 active:bg-red-800 shadow-[0_8px_20px_rgba(220,38,38,0.2)] hover:shadow-[0_12px_28px_rgba(220,38,38,0.3)] hover:-translate-y-0.5': variant === 'danger',
            'text-slate-600 hover:bg-slate-100 hover:text-slate-900 active:bg-slate-200': variant === 'ghost',
            'border border-slate-200/80 text-slate-700 hover:bg-slate-50 bg-white shadow-sm hover:shadow-md hover:border-slate-300/80': variant === 'outline',
          },
          {
            'text-xs px-3 py-1.5 h-7': size === 'sm',
            'text-sm px-4 py-2 h-9': size === 'md',
            'text-base px-5 py-2.5 h-11': size === 'lg',
          },
          className
        )}
        {...props}
      >
        {loading && (
          <span className="w-4 h-4 border-2 border-current border-t-transparent rounded-full animate-spin" />
        )}
        {children}
      </button>
    )
  }
)
Button.displayName = 'Button'

export default Button
