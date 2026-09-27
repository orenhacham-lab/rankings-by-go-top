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

const Button = forwardRef<HTMLButtonElement, ButtonProps>(
  ({ className, variant = 'primary', size = 'md', loading, disabled, children, ...props }, ref) => {
    return (
      <button
        ref={ref}
        disabled={disabled || loading}
        aria-busy={loading || undefined}
        className={cn(
          'inline-flex select-none items-center justify-center gap-2 font-semibold rounded-control',
          'transition-[background-color,border-color,color,box-shadow,transform] duration-150 ease-snappy active:scale-[0.98]',
          'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-action focus-visible:ring-offset-2 focus-visible:ring-offset-canvas',
          'disabled:opacity-50 disabled:cursor-not-allowed disabled:active:scale-100',
          {
            'bg-action text-action-ink hover:bg-action-hover shadow-[inset_0_1px_0_rgb(255_255_255/0.14),0_1px_2px_rgb(20_24_60/0.18)]': variant === 'primary',
            'bg-commit text-commit-ink hover:bg-commit-hover shadow-[inset_0_1px_0_rgb(255_255_255/0.35),inset_0_0_0_1px_rgb(120_70_0/0.14),0_1px_2px_rgb(80_50_0/0.12)]': variant === 'commit',
            'bg-surface text-ink border border-line shadow-control hover:border-line-strong hover:bg-sunk/60': variant === 'secondary' || variant === 'outline',
            'bg-bad text-bad-ink hover:opacity-90 shadow-[inset_0_1px_0_rgb(255_255_255/0.12)]': variant === 'danger',
            'text-body hover:bg-sunk hover:text-ink': variant === 'ghost',
          },
          {
            'text-caption px-3 h-8': size === 'sm',
            'text-copy px-4 h-9': size === 'md',
            'text-[0.9375rem] leading-6 px-5 h-11': size === 'lg',
          },
          className
        )}
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
