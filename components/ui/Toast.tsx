'use client'

/**
 * Toasts for the dashboard shell, including the one kind a long action needs:
 * PROGRESS. A merchant who presses "create the report" or "check now" sees at
 * once that something started, how it is going (a moving bar), and how it ended
 * (the same toast turns into "done" or "failed"), even after scrolling away from
 * the button.
 *
 *   const toasts = useToasts()
 *   await toasts.track({ pending, done, failed }, () => fetch(...))
 *   <ToastHost toasts={toasts.toasts} dismiss={toasts.dismiss} dir={dir} />
 *
 * `track` runs the action with a progress toast and settles it: `done` when the
 * action resolves, `failed` when it throws (our own words, never the error's
 * text). The result, or the error, is passed on unchanged.
 *
 * Design tokens only; an aria-live region so screen readers hear each change.
 * Progress toasts stay until settled; the others leave after a few seconds or
 * on a click. The bar's motion is CSS (.progress-sweep in app/globals.css) and
 * stands still with reduced motion.
 */
import { useCallback, useEffect, useRef, useState } from 'react'
import { Check, TriangleAlert } from 'lucide-react'
import { cn } from '@/lib/utils'

export type ToastKind = 'progress' | 'success' | 'error'
export interface ToastItem { id: number; kind: ToastKind; text: string }
export interface TrackCopy { pending: string; done: string; failed: string }

/** How long a settled toast stays. An error stays longer: it may need reading. */
export const TOAST_MS: Record<Exclude<ToastKind, 'progress'>, number> = { success: 4000, error: 7000 }

export function useToasts() {
  const [toasts, setToasts] = useState<ToastItem[]>([])
  const idRef = useRef(0)
  const timers = useRef(new Map<number, ReturnType<typeof setTimeout>>())

  useEffect(() => {
    const map = timers.current
    return () => { map.forEach((t) => clearTimeout(t)); map.clear() }
  }, [])

  const dismiss = useCallback((id: number) => {
    const t = timers.current.get(id)
    if (t) { clearTimeout(t); timers.current.delete(id) }
    setToasts((list) => list.filter((x) => x.id !== id))
  }, [])

  const expire = useCallback((id: number, kind: ToastKind) => {
    if (kind === 'progress') return
    const old = timers.current.get(id)
    if (old) clearTimeout(old)
    timers.current.set(id, setTimeout(() => dismiss(id), TOAST_MS[kind]))
  }, [dismiss])

  const show = useCallback((kind: ToastKind, text: string): number => {
    const id = ++idRef.current
    if (!text) return id
    setToasts((list) => [...list, { id, kind, text }])
    expire(id, kind)
    return id
  }, [expire])

  /** Turns a toast (a progress one, usually) into its outcome, in place. */
  const settle = useCallback((id: number, kind: Exclude<ToastKind, 'progress'>, text: string) => {
    setToasts((list) => list.some((x) => x.id === id)
      ? list.map((x) => (x.id === id ? { id, kind, text } : x))
      : [...list, { id, kind, text }])
    expire(id, kind)
  }, [expire])

  const success = useCallback((text: string) => show('success', text), [show])
  const error = useCallback((text: string) => show('error', text), [show])

  const track = useCallback(async <T,>(copy: TrackCopy, action: () => Promise<T>): Promise<T> => {
    const id = show('progress', copy.pending)
    try {
      const result = await action()
      settle(id, 'success', copy.done)
      return result
    } catch (e) {
      settle(id, 'error', copy.failed)
      throw e
    }
  }, [show, settle])

  return { toasts, show, settle, success, error, track, dismiss }
}

export function ToastHost({ toasts, dismiss, dir = 'rtl' }: { toasts: ToastItem[]; dismiss: (id: number) => void; dir?: 'rtl' | 'ltr' }) {
  return (
    <div
      dir={dir}
      role="status"
      aria-live="polite"
      className="pointer-events-none fixed inset-x-0 bottom-4 z-[100] flex flex-col items-center gap-2 px-4"
    >
      {toasts.map((t) => (
        <div
          key={`${t.id}-${t.kind}`}
          data-toast={t.kind}
          className={cn(
            'pointer-events-auto w-full max-w-sm overflow-hidden rounded-card border shadow-pop motion-safe:animate-pop-in',
            t.kind === 'error' ? 'border-bad/25 bg-bad-soft text-bad' : t.kind === 'success' ? 'border-ok/25 bg-ok-soft text-ok' : 'border-line bg-surface text-ink',
          )}
        >
          <button
            type="button"
            onClick={() => dismiss(t.id)}
            className="flex w-full items-center gap-2.5 px-4 py-3 text-start text-copy font-medium focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-action"
          >
            {t.kind === 'success' && <Check size={16} strokeWidth={2.4} aria-hidden="true" className="shrink-0" />}
            {t.kind === 'error' && <TriangleAlert size={16} strokeWidth={2} aria-hidden="true" className="shrink-0" />}
            <span className="min-w-0 flex-1">{t.text}</span>
          </button>
          {t.kind === 'progress' && (
            <div aria-hidden="true" className="h-1 w-full overflow-hidden bg-action-soft">
              <div className="progress-sweep h-full rounded-pill bg-action" />
            </div>
          )}
        </div>
      ))}
    </div>
  )
}
