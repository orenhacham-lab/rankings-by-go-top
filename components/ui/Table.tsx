import { cn } from '@/lib/utils'

/**
 * The data table. Dense but calm: a quiet header row in the sunk tone, hairline
 * row dividers, tabular figures, and a hover tint on the row under the pointer.
 * Cells align to the logical START, so a Hebrew table reads from the right and
 * an English one from the left without a class per language. On a narrow screen
 * the table scrolls inside its own frame instead of widening the page.
 */
interface TableProps {
  children: React.ReactNode
  className?: string
}

export function Table({ children, className }: TableProps) {
  return (
    <div className="max-w-full overflow-x-auto rounded-card border border-line bg-surface shadow-card">
      <table className={cn('w-full text-copy tabular-nums', className)}>
        {children}
      </table>
    </div>
  )
}

export function TableHead({ children }: { children: React.ReactNode }) {
  return (
    <thead className="bg-sunk/70 border-b border-line">
      {children}
    </thead>
  )
}

export function TableBody({ children }: { children: React.ReactNode }) {
  return <tbody className="divide-y divide-line">{children}</tbody>
}

export function TableRow({
  children,
  className,
  onClick,
}: {
  children: React.ReactNode
  className?: string
  onClick?: () => void
}) {
  return (
    <tr
      className={cn(
        'bg-surface hover:bg-sunk/50 transition-colors duration-150',
        onClick && 'cursor-pointer',
        className
      )}
      onClick={onClick}
    >
      {children}
    </tr>
  )
}

export function Th({ children, className }: { children: React.ReactNode; className?: string }) {
  return (
    // No uppercase/tracking-wider — those break Hebrew characters visually
    <th className={cn('h-10 px-4 text-start text-caption font-semibold text-muted whitespace-nowrap', className)}>
      {children}
    </th>
  )
}

export function Td({ children, className }: { children: React.ReactNode; className?: string }) {
  return (
    <td className={cn('px-4 py-3 text-body text-start align-middle', className)}>
      {children}
    </td>
  )
}

export function EmptyRow({ colSpan, message }: { colSpan: number; message: string }) {
  return (
    <tr>
      <td colSpan={colSpan} className="px-4 py-14 text-center text-muted text-copy">
        {message}
      </td>
    </tr>
  )
}
