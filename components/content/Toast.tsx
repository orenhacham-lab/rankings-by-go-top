'use client'

/**
 * Minimal, dependency-free toast for the Content module. Auto-dismisses after
 * ~3s, supports success/error, non-blocking, RTL-aware. Local to whichever page
 * mounts it (Content Hub + Article Editor).
 */

import { useCallback, useRef, useState } from 'react'

export type ToastKind = 'success' | 'error'
export interface ToastItem { id: number; kind: ToastKind; text: string }

export function useToasts() {
  const [toasts, setToasts] = useState<ToastItem[]>([])
  const idRef = useRef(0)

  const dismiss = useCallback((id: number) => setToasts((list) => list.filter((x) => x.id !== id)), [])
  const push = useCallback((kind: ToastKind, text: string) => {
    if (!text) return
    const id = ++idRef.current
    setToasts((list) => [...list, { id, kind, text }])
    setTimeout(() => setToasts((list) => list.filter((x) => x.id !== id)), 3000)
  }, [])
  const success = useCallback((text: string) => push('success', text), [push])
  const error = useCallback((text: string) => push('error', text), [push])

  return { toasts, success, error, dismiss }
}

export function ToastHost({ toasts, dismiss, dir = 'rtl' }: { toasts: ToastItem[]; dismiss: (id: number) => void; dir?: 'rtl' | 'ltr' }) {
  if (!toasts.length) return null
  return (
    <div dir={dir} className="fixed z-[100] bottom-4 inset-x-0 flex flex-col items-center gap-2 px-4 pointer-events-none">
      {toasts.map((t) => (
        <button
          key={t.id}
          type="button"
          onClick={() => dismiss(t.id)}
          className={`pointer-events-auto max-w-md w-fit rounded-lg px-4 py-2.5 text-sm font-medium shadow-lg border text-white ${
            t.kind === 'success' ? 'bg-green-600 border-green-700' : 'bg-red-600 border-red-700'
          }`}
        >
          {t.text}
        </button>
      ))}
    </div>
  )
}
