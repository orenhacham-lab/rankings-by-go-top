import { cn } from '@/lib/utils'
import { ButtonHTMLAttributes, forwardRef } from 'react'

/**
 * The button, in the app's two action colours and nothing else.
 *
 * It used to be a gradient with a coloured glow and a hover lift, which made
 * every button on a screen compete with every other one. A filled button now
 * means one of exactly two things:
 *   `primary` — an ordinary action: save, generate, connect, publish.
 *   `commit`  — an action that costs money or cannot be taken back: upgrade, buy.
 * Everything else is quiet: `secondary` and `outline` are bordered surfaces,
 * `ghost` is text. `danger` stays filled because a destructive confirm has to
 * read as destructive, and it is never the page's own call to action.
 */
interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: 'primary' | 'commit' | 'secondary' | 'danger' | 'ghost' | 'outline'
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
          'inline-flex items-center justify-center gap-2 font-semibold rounded-control transition-[background-color,color,transform] duration-150 active:scale-[0.98] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-action focus-visible:ring-offset-2 focus-visible:ring-offset-canvas disabled:opacity-50 disabled:cursor-not-allowed',
          {
            'bg-action text-action-ink hover:bg-action-hover': variant === 'primary',
            'bg-commit text-commit-ink hover:bg-commit-hover': variant === 'commit',
            'bg-surface text-body border border-line hover:bg-sunk': variant === 'secondary' || variant === 'outline',
            'bg-bad text-white hover:opacity-90': variant === 'danger',
            'text-body hover:bg-sunk hover:text-ink': variant === 'ghost',
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
