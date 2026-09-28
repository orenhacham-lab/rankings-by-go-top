'use client'

import { createContext, useContext } from 'react'
import { cn } from '@/lib/utils'

/**
 * The data table. Dense but calm: a quiet header row in the sunk tone, hairline
 * row dividers, tabular figures, and a hover tint on the row under the pointer.
 * Cells align to the logical START, so a Hebrew table reads from the right and
 * an English one from the left without a class per language. On a narrow screen
 * the table scrolls inside its own frame instead of widening the page.
 *
 * The frame is `relative` so it is the containing block of anything absolutely
 * placed in a cell (every `sr-only` label is): otherwise those escape the scroll
 * clip, and in Hebrew a label in a column scrolled out of view to the left made
 * the whole page wider than a phone (390px wide page measured at 415-475px).
 *
 * ── On a phone (below sm, 640px) ────────────────────────────────────────────
 * A wide table scrolled sideways inside its card, so its last columns were cut
 * on first view (review R15). Two ways out, pick one per table:
 *
 * 1) Drop the secondary columns. `hideBelow="sm"` (or "md") on the column's Th
 *    AND on each of its Td hides that column on a narrow screen; `<TableMeta>`
 *    inside the first cell repeats what matters of it on a caption line there,
 *    visible below sm only. The keywords table works this way.
 *
 *      <Th hideBelow="sm">{t.clicks}</Th>
 *      <Td>{title}<TableMeta>{t.clicks} {clicks}</TableMeta></Td>
 *      <Td hideBelow="sm">{clicks}</Td>
 *
 * 2) Stack the rows. `<Table stackBelowSm>` turns every row into a stacked item
 *    below sm without changing the rows' markup: the header row is hidden, the
 *    title cell takes the first line, an `end` cell (the row's RowMenu or its
 *    one action) sits at the end of that line, and every other cell flows on a
 *    caption line under it as "label value", the label taken from the cell's
 *    `label`. From sm up it is the ordinary table.
 *
 *      <Table stackBelowSm>
 *        <TableHead>…the usual Th row…</TableHead>
 *        <TableBody>
 *          <TableRow>
 *            <Td stack="lead"><Checkbox … /></Td>  → before the title (a selection box)
 *            <Td stack="title">{page}</Td>         → the first line (the default for the first cell)
 *            <Td label={t.clicks}>{clicks}</Td>   → "Clicks 12" on the caption line (the default role)
 *            <Td hideBelow="sm">{secondary}</Td>  → not shown on a phone at all
 *            <Td stack="end"><RowMenu … /></Td>   → the end of the first line
 *          </TableRow>
 *        </TableBody>
 *      </Table>
 *
 *    `stack` is "lead" | "title" | "meta" | "end"; without it the row's first
 *    cell is the title and every other cell is meta. `label` is only shown
 *    while stacked; a meta cell without one shows its value alone.
 */
const StackContext = createContext(false)

interface TableProps {
  children: React.ReactNode
  className?: string
  /** Below sm, render every row as a stacked item instead of a sideways-scrolling row. */
  stackBelowSm?: boolean
}

export function Table({ children, className, stackBelowSm = false }: TableProps) {
  return (
    <StackContext.Provider value={stackBelowSm}>
      <div
        className="relative max-w-full overflow-x-auto rounded-card border border-line bg-surface shadow-card"
        data-table-stack={stackBelowSm ? 'sm' : undefined}
      >
        <table className={cn('w-full text-copy tabular-nums', stackBelowSm && 'max-sm:block', className)}>
          {children}
        </table>
      </div>
    </StackContext.Provider>
  )
}

export function TableHead({ children }: { children: React.ReactNode }) {
  const stacked = useContext(StackContext)
  return (
    <thead className={cn('bg-sunk/70 border-b border-line', stacked && 'max-sm:hidden')}>
      {children}
    </thead>
  )
}

export function TableBody({ children }: { children: React.ReactNode }) {
  const stacked = useContext(StackContext)
  return <tbody className={cn('divide-y divide-line', stacked && 'max-sm:block')}>{children}</tbody>
}

/**
 * Stacked, a row is one wrapping flex line: [lead] title [end], then a
 * zero-height full-width break (the row's ::after, order 1), then the meta
 * cells (order 2) on the caption line.
 */
const STACKED_ROW =
  'max-sm:flex max-sm:flex-wrap max-sm:items-center max-sm:gap-x-3 max-sm:gap-y-1 max-sm:px-4 max-sm:py-3 ' +
  "max-sm:after:order-1 max-sm:after:h-0 max-sm:after:basis-full max-sm:after:content-['']"

export function TableRow({
  children,
  className,
  onClick,
}: {
  children: React.ReactNode
  className?: string
  onClick?: () => void
}) {
  const stacked = useContext(StackContext)
  return (
    <tr
      className={cn(
        'bg-surface hover:bg-sunk/50 transition-colors duration-150',
        stacked && STACKED_ROW,
        onClick && 'cursor-pointer',
        className
      )}
      onClick={onClick}
    >
      {children}
    </tr>
  )
}

export type TableHideBelow = 'sm' | 'md'
// max-sm too for md: a stacked cell's own max-sm:block would otherwise win below sm.
const HIDE: Record<TableHideBelow, string> = { sm: 'max-sm:hidden', md: 'max-md:hidden max-sm:hidden' }

export function Th({ children, className, hideBelow }: { children?: React.ReactNode; className?: string; hideBelow?: TableHideBelow }) {
  return (
    // No uppercase/tracking-wider — those break Hebrew characters visually
    <th className={cn('h-10 px-4 text-start text-caption font-semibold text-muted whitespace-nowrap', hideBelow && HIDE[hideBelow], className)}>
      {children}
    </th>
  )
}

export type TableStackRole = 'lead' | 'title' | 'meta' | 'end'

/** What a cell becomes below sm inside a `stackBelowSm` table, by its role. */
const STACK: Record<TableStackRole, string> = {
  lead: 'max-sm:shrink-0',
  title: 'max-sm:min-w-0 max-sm:flex-1 max-sm:text-copy max-sm:font-medium max-sm:text-ink',
  end: 'max-sm:ms-auto max-sm:shrink-0',
  meta: 'max-sm:order-2 max-sm:text-caption max-sm:text-body',
}
/** No role given: the first cell of the row is the title, every other one meta. */
const STACK_AUTO =
  STACK.meta +
  ' max-sm:first:order-none max-sm:first:min-w-0 max-sm:first:flex-1 max-sm:first:text-copy max-sm:first:font-medium max-sm:first:text-ink max-sm:first:before:content-none'
/** A meta cell's label, drawn before its value from the cell's data-label. */
const STACK_LABEL = 'max-sm:before:me-1 max-sm:before:text-muted max-sm:before:content-[attr(data-label)]'

export function Td({
  children,
  className,
  hideBelow,
  stack,
  label,
  colSpan,
}: {
  children?: React.ReactNode
  className?: string
  hideBelow?: TableHideBelow
  /** Its place in a stacked row (a `stackBelowSm` table, below sm). */
  stack?: TableStackRole
  /** The column's name, shown before the value on a stacked row's caption line. */
  label?: string
  colSpan?: number
}) {
  const stacked = useContext(StackContext)
  return (
    <td
      colSpan={colSpan}
      data-label={stacked && label ? label : undefined}
      data-stack={stacked ? stack ?? 'auto' : undefined}
      className={cn(
        'px-4 py-3 text-body text-start align-middle',
        stacked && 'max-sm:block max-sm:p-0',
        stacked && (stack ? STACK[stack] : STACK_AUTO),
        stacked && label && (!stack || stack === 'meta') && STACK_LABEL,
        stacked && colSpan !== undefined && colSpan > 1 && 'max-sm:basis-full',
        // After the stacked display, so hiding wins over max-sm:block.
        hideBelow && HIDE[hideBelow],
        className
      )}
    >
      {children}
    </td>
  )
}

/**
 * A caption line under a cell's main content, shown only below sm: what a
 * table that hides secondary columns on a phone (`hideBelow`) repeats in the
 * row's first cell, so no value is lost, only moved.
 */
export function TableMeta({ children, className }: { children: React.ReactNode; className?: string }) {
  return <span className={cn('mt-0.5 block text-caption text-muted sm:hidden', className)}>{children}</span>
}

export function EmptyRow({ colSpan, message }: { colSpan: number; message: string }) {
  const stacked = useContext(StackContext)
  return (
    <tr className={cn(stacked && 'max-sm:block')}>
      <td colSpan={colSpan} className={cn('px-4 py-14 text-center text-muted text-copy', stacked && 'max-sm:block')}>
        {message}
      </td>
    </tr>
  )
}
