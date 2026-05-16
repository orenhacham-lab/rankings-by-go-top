import { cn } from '@/lib/utils'

interface BadgeProps {
  children: React.ReactNode
  variant?: 'default' | 'success' | 'warning' | 'danger' | 'info' | 'neutral'
  className?: string
}

export default function Badge({ children, variant = 'default', className }: BadgeProps) {
  return (
    <span
      className={cn(
        'inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium',
        {
          'bg-slate-100 dark:bg-slate-700 text-slate-700 dark:text-slate-300': variant === 'default' || variant === 'neutral',
          'bg-green-100 dark:bg-green-900 text-green-700 dark:text-green-400': variant === 'success',
          'bg-yellow-100 dark:bg-yellow-900 text-yellow-700 dark:text-yellow-400': variant === 'warning',
          'bg-red-100 dark:bg-red-900 text-red-700 dark:text-red-400': variant === 'danger',
          'bg-blue-100 dark:bg-blue-900 text-blue-700 dark:text-blue-400': variant === 'info',
        },
        className
      )}
    >
      {children}
    </span>
  )
}
