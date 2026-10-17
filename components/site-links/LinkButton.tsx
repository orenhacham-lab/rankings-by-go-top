/**
 * An in-app link drawn as the app's button (components/ui/Button: same radius,
 * weight, sizes and colours), so a link that navigates is an <a>, not a <button>
 * inside an <a>. Only for paths inside the app: `href` must start with "/".
 */
import Link from 'next/link'
import { cn } from '@/lib/utils'

export default function LinkButton({ href, children, variant = 'primary', size = 'md', className }: {
  href: `/${string}`
  children: React.ReactNode
  variant?: 'primary' | 'secondary'
  size?: 'sm' | 'md'
  className?: string
}) {
  return (
    <Link
      href={href}
      className={cn(
        'inline-flex select-none items-center justify-center gap-2 rounded-control font-semibold',
        'transition-[background-color,border-color,color,box-shadow,transform] duration-150 ease-snappy active:scale-[0.98]',
        'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-action focus-visible:ring-offset-2 focus-visible:ring-offset-canvas',
        variant === 'primary' && 'bg-action text-action-ink shadow-[inset_0_1px_0_rgb(255_255_255/0.14),0_1px_2px_rgb(20_24_60/0.18)] hover:bg-action-hover',
        variant === 'secondary' && 'border border-line bg-surface text-ink shadow-control hover:border-line-strong hover:bg-sunk/60',
        size === 'sm' ? 'h-8 px-3 text-caption' : 'h-9 px-4 text-copy',
        className,
      )}
    >
      {children}
    </Link>
  )
}
