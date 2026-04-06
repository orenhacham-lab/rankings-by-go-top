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
          'inline-flex items-center justify-center gap-2 font-medium rounded-lg transition-all duration-150 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 focus-visible:ring-offset-2 disabled:opacity-50 disabled:cursor-not-allowed',
          {
            'bg-blue-600 text-white hover:bg-blue-700 active:bg-blue-800 shadow-sm': variant === 'primary',
            'bg-slate-100 text-slate-700 hover:bg-slate-200 active:bg-slate-300': variant === 'secondary',
            'bg-red-600 text-white hover:bg-red-700 active:bg-red-800 shadow-sm': variant === 'danger',
            'text-slate-600 hover:bg-slate-100 hover:text-slate-900': variant === 'ghost',
            'border border-slate-200 text-slate-700 hover:bg-slate-50 bg-white shadow-sm': variant === 'outline',
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
