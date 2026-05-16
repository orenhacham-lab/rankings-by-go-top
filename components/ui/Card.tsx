import { cn } from '@/lib/utils'

interface CardProps {
  children: React.ReactNode
  className?: string
  padding?: boolean
}

export function Card({ children, className, padding = true }: CardProps) {
  return (
    <div
      className={cn(
        'bg-white dark:bg-slate-900 rounded-2xl border border-slate-200/60 dark:border-slate-700/60 shadow-[0_10px_30px_rgba(15,23,42,0.04)] dark:shadow-[0_10px_30px_rgba(0,0,0,0.3)] hover:shadow-[0_14px_36px_rgba(15,23,42,0.07)] dark:hover:shadow-[0_14px_36px_rgba(0,0,0,0.4)] transition-all duration-200 hover:-translate-y-0.5',
        padding && 'p-6',
        className
      )}
    >
      {children}
    </div>
  )
}

export function CardHeader({ children, className }: { children: React.ReactNode; className?: string }) {
  return (
    <div className={cn('flex items-center justify-between mb-4', className)}>
      {children}
    </div>
  )
}

export function CardTitle({ children, className }: { children: React.ReactNode; className?: string }) {
  return (
    <h2 className={cn('text-lg font-semibold text-slate-900 dark:text-slate-100', className)}>
      {children}
    </h2>
  )
}
