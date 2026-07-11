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
        'inline-flex items-center whitespace-nowrap px-3 py-0.5 rounded-full text-xs font-medium',
        {
          'bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-200': variant === 'default' || variant === 'neutral',
          'bg-green-100 dark:bg-green-900 text-green-700 dark:text-green-300': variant === 'success',
          'bg-yellow-100 dark:bg-yellow-900 text-yellow-700 dark:text-yellow-300': variant === 'warning',
          'bg-red-100 dark:bg-red-900 text-red-700 dark:text-red-300': variant === 'danger',
          'bg-blue-100 dark:bg-blue-900 text-blue-700 dark:text-blue-300': variant === 'info',
        },
        className
      )}
    >
      {children}
    </span>
  )
}
