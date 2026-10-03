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
 *
 * The feel is in the details, not in decoration: a hairline top highlight on the
 * filled variants, a one-pixel drop on the bordered ones, a 2% press, and a focus
 * ring that shows for the keyboard and never for the mouse.
 */
interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: 'primary' | 'commit' | 'secondary' | 'danger' | 'ghost' | 'outline'
  size?: 'sm' | 'md' | 'lg'
  loading?: boolean
}

/**
 * The button's classes, for a control that must be another element — a Next
 * <Link> that should look like a button (the 404 and error pages' way home).
 */
export function buttonClasses({ variant = 'primary', size = 'md', className }: { variant?: ButtonProps['variant']; size?: ButtonProps['size']; className?: string } = {}) {
  return cn(
    'inline-flex select-none items-center justify-center gap-2 font-semibold rounded-control',
    'transition-[background-color,border-color,color,box-shadow,transform] duration-150 ease-snappy active:scale-[0.98]',
    'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-action focus-visible:ring-offset-2 focus-visible:ring-offset-canvas',
    'disabled:opacity-50 disabled:cursor-not-allowed disabled:active:scale-100',
    {
      'bg-action text-action-ink hover:bg-action-hover shadow-control': variant === 'primary',
      'bg-commit text-commit-ink hover:bg-commit-hover shadow-control': variant === 'commit',
      'bg-surface text-ink border border-line shadow-control hover:border-line-strong hover:bg-sunk/60': variant === 'secondary' || variant === 'outline',
      'bg-bad text-bad-ink hover:opacity-90 shadow-control': variant === 'danger',
      'text-body hover:bg-sunk hover:text-ink': variant === 'ghost',
    },
    {
      'text-caption px-3 h-8': size === 'sm',
      'text-copy px-4 h-10': size === 'md',
      'text-lead px-5 h-11': size === 'lg',
    },
    className
  )
}

const Button = forwardRef<HTMLButtonElement, ButtonProps>(
  ({ className, variant = 'primary', size = 'md', loading, disabled, children, ...props }, ref) => {
    return (
      <button
        ref={ref}
        disabled={disabled || loading}
        aria-busy={loading || undefined}
        className={buttonClasses({ variant, size, className })}
        {...props}
      >
        {loading && (
          <span aria-hidden="true" className="w-4 h-4 border-2 border-current border-t-transparent rounded-full animate-spin" />
        )}
        {children}
      </button>
    )
  }
)
Button.displayName = 'Button'

export default Button
