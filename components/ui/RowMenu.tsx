'use client'

/**
 * A table row's secondary actions behind one "⋯" button (UX review P1-17, P2-3).
 *
 * A row used to stack four or five text buttons (edit / scan / deactivate /
 * history / delete), which made every keyword row about 95–130px tall and put a
 * red "delete" link on every article. The row now keeps its one main action in
 * view, and the rest are the same actions here, with the same confirmations: an
 * item that deletes only opens the confirmation, it never deletes by itself.
 *
 * The list is drawn in a portal with fixed positioning, because a table scrolls
 * inside its own frame (overflow-x: auto clips an absolutely placed menu). It
 * opens toward the inside of the table (below, or above when there is no room),
 * aligned to the button's inline end, so it works the same in Hebrew and English.
 *
 * Keyboard: Enter/Space/ArrowDown open it on the first item, ArrowUp on the last;
 * arrows, Home and End move; Escape and Tab close it and give focus back.
 */
import { useCallback, useEffect, useId, useLayoutEffect, useRef, useState, type ReactNode } from 'react'
import { createPortal } from 'react-dom'
import Link from 'next/link'
import { MoreHorizontal } from 'lucide-react'
import { cn } from '@/lib/utils'

export interface RowMenuItem {
  key: string
  label: string
  /** A link item navigates; otherwise onSelect runs. */
  href?: string
  onSelect?: () => void
  /** Destructive: drawn in the `bad` tone. It should open a confirmation, not act. */
  danger?: boolean
  disabled?: boolean
  icon?: ReactNode
}

const MENU_WIDTH = 208

export default function RowMenu({ label, items, className }: {
  /** The button's accessible name, e.g. "More actions for <keyword>". */
  label: string
  items: RowMenuItem[]
  className?: string
}) {
  const [open, setOpen] = useState(false)
  const buttonRef = useRef<HTMLButtonElement>(null)
  const listRef = useRef<HTMLDivElement>(null)
  const startAt = useRef<'first' | 'last'>('first')
  const menuId = useId()
  const shown = items.filter(Boolean)

  const close = useCallback((refocus: boolean) => {
    setOpen(false)
    if (refocus) buttonRef.current?.focus()
  }, [])

  // Written straight onto the list (not through state): it is measured and placed
  // in the same layout pass, before the browser paints it.
  const place = useCallback(() => {
    const b = buttonRef.current
    const list = listRef.current
    if (!b || !list) return
    const r = b.getBoundingClientRect()
    const rtl = getComputedStyle(b).direction === 'rtl'
    const height = list.offsetHeight || shown.length * 36 + 8
    const up = r.bottom + 4 + height > window.innerHeight && r.top - 4 - height > 0
    // Aligned to the button's inline END edge, so the list opens into the table.
    const rawLeft = rtl ? r.left : r.right - MENU_WIDTH
    const left = Math.min(Math.max(8, rawLeft), window.innerWidth - MENU_WIDTH - 8)
    list.style.top = `${up ? r.top - 4 - height : r.bottom + 4}px`
    list.style.left = `${left}px`
  }, [shown.length])

  useLayoutEffect(() => {
    if (!open) return
    place()
    const items = listRef.current?.querySelectorAll<HTMLElement>('[role="menuitem"]:not([aria-disabled="true"])')
    if (items && items.length) (startAt.current === 'last' ? items[items.length - 1] : items[0]).focus()
  }, [open, place])

  useEffect(() => {
    if (!open) return
    const onDown = (e: MouseEvent) => {
      const t = e.target as Node
      if (listRef.current?.contains(t) || buttonRef.current?.contains(t)) return
      close(false)
    }
    const onMove = () => close(false)
    document.addEventListener('mousedown', onDown)
    window.addEventListener('resize', onMove)
    window.addEventListener('scroll', onMove, true)
    return () => {
      document.removeEventListener('mousedown', onDown)
      window.removeEventListener('resize', onMove)
      window.removeEventListener('scroll', onMove, true)
    }
  }, [open, close])

  const onButtonKey = (e: React.KeyboardEvent) => {
    if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
      e.preventDefault()
      startAt.current = e.key === 'ArrowUp' ? 'last' : 'first'
      setOpen(true)
    }
  }

  const onListKey = (e: React.KeyboardEvent) => {
    const list = [...(listRef.current?.querySelectorAll<HTMLElement>('[role="menuitem"]:not([aria-disabled="true"])') ?? [])]
    const i = list.indexOf(document.activeElement as HTMLElement)
    const go = (n: number) => { e.preventDefault(); list[(n + list.length) % list.length]?.focus() }
    if (e.key === 'ArrowDown') go(i + 1)
    else if (e.key === 'ArrowUp') go(i - 1)
    else if (e.key === 'Home') go(0)
    else if (e.key === 'End') go(list.length - 1)
    else if (e.key === 'Escape') { e.preventDefault(); close(true) }
    else if (e.key === 'Tab') close(false)
  }

  const itemClass = (item: RowMenuItem) => cn(
    'flex w-full items-center gap-2.5 rounded-control px-3 py-2 text-start text-copy transition-colors duration-100',
    'focus-visible:outline-none focus:bg-sunk hover:bg-sunk',
    item.danger ? 'text-bad' : 'text-ink',
    item.disabled && 'pointer-events-none opacity-50',
  )

  return (
    <div data-row-menu className={cn('inline-flex', className)}>
      <button
        ref={buttonRef}
        type="button"
        aria-label={label}
        title={label}
        aria-haspopup="menu"
        aria-expanded={open}
        aria-controls={open ? menuId : undefined}
        onClick={() => { startAt.current = 'first'; if (open) close(false); else setOpen(true) }}
        onKeyDown={onButtonKey}
        className={cn(
          'grid size-8 place-items-center rounded-control text-muted transition-colors duration-150',
          'hover:bg-sunk hover:text-ink focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-action',
          open && 'bg-sunk text-ink',
        )}
      >
        <MoreHorizontal size={18} strokeWidth={2} aria-hidden="true" />
      </button>
      {open && typeof document !== 'undefined' && createPortal(
        <div
          ref={listRef}
          id={menuId}
          role="menu"
          aria-label={label}
          onKeyDown={onListKey}
          style={{ position: 'fixed', top: -9999, left: -9999, width: MENU_WIDTH }}
          className="z-[90] rounded-card border border-line bg-surface p-1 shadow-pop animate-pop-in"
        >
          {shown.map((item) => item.href && !item.disabled ? (
            <Link
              key={item.key}
              href={item.href}
              role="menuitem"
              tabIndex={-1}
              data-danger={item.danger || undefined}
              onClick={() => close(false)}
              className={itemClass(item)}
            >
              {item.icon}
              <span className="min-w-0 truncate">{item.label}</span>
            </Link>
          ) : (
            <button
              key={item.key}
              type="button"
              role="menuitem"
              tabIndex={-1}
              aria-disabled={item.disabled || undefined}
              data-danger={item.danger || undefined}
              onClick={() => { if (item.disabled) return; close(false); item.onSelect?.() }}
              className={itemClass(item)}
            >
              {item.icon}
              <span className="min-w-0 truncate">{item.label}</span>
            </button>
          ))}
        </div>,
        document.body,
      )}
    </div>
  )
}
