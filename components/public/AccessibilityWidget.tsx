'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import Link from 'next/link'

/**
 * Accessibility widget — public site only.
 *
 * A floating button anchored to the left-middle of the viewport that opens a
 * panel of real, DOM-affecting accessibility controls. State is applied via
 * classes / CSS variables on <html> (see globals.css) and persisted in
 * localStorage so choices survive navigation between pages.
 */

const STORAGE_KEY = 'a11y-settings-v1'

type A11yState = {
  textLevel: number // 0..3
  zoomLevel: number // 0..3
  highlightLinks: boolean
  highlightHeadings: boolean
  contrast: boolean
  grayscale: boolean
  readableFont: boolean
  imageDescriptions: boolean
  bigCursor: boolean
  stopAnimations: boolean
}

const DEFAULT_STATE: A11yState = {
  textLevel: 0,
  zoomLevel: 0,
  highlightLinks: false,
  highlightHeadings: false,
  contrast: false,
  grayscale: false,
  readableFont: false,
  imageDescriptions: false,
  bigCursor: false,
  stopAnimations: false,
}

const ZOOM_VALUES = [1, 1.1, 1.2, 1.3]

function applyState(state: A11yState) {
  if (typeof document === 'undefined') return
  const html = document.documentElement

  // Text size (mutually exclusive levels)
  html.classList.remove('a11y-text-1', 'a11y-text-2', 'a11y-text-3')
  if (state.textLevel > 0) html.classList.add(`a11y-text-${state.textLevel}`)

  // Page zoom (applied to body so the root font-size scaling stays independent)
  // `zoom` is supported in all modern evergreen browsers.
  ;(document.body.style as CSSStyleDeclaration & { zoom?: string }).zoom = String(
    ZOOM_VALUES[state.zoomLevel] ?? 1
  )

  // Boolean class toggles
  html.classList.toggle('a11y-highlight-links', state.highlightLinks)
  html.classList.toggle('a11y-highlight-headings', state.highlightHeadings)
  html.classList.toggle('a11y-readable-font', state.readableFont)
  html.classList.toggle('a11y-big-cursor', state.bigCursor)
  html.classList.toggle('a11y-stop-animations', state.stopAnimations)
  html.classList.toggle('a11y-image-descriptions', state.imageDescriptions)

  // Combined filter (grayscale + contrast) via CSS variables
  html.style.setProperty('--a11y-gray', state.grayscale ? '1' : '0')
  html.style.setProperty('--a11y-contrast', state.contrast ? '1.35' : '1')
  html.classList.toggle('a11y-filter', state.grayscale || state.contrast)

  // Image descriptions — surface alt text as a tooltip and flag missing alts
  if (state.imageDescriptions) {
    document.querySelectorAll('img').forEach((img) => {
      const alt = img.getAttribute('alt') || ''
      if (alt) {
        if (!img.getAttribute('title')) img.setAttribute('title', alt)
        img.setAttribute('data-a11y-noalt', 'false')
      } else {
        img.setAttribute('data-a11y-noalt', 'true')
      }
    })
  } else {
    document.querySelectorAll('img[data-a11y-noalt]').forEach((img) => {
      img.removeAttribute('data-a11y-noalt')
    })
  }
}

export function AccessibilityWidget() {
  const [open, setOpen] = useState(false)
  const [state, setState] = useState<A11yState>(DEFAULT_STATE)
  const panelRef = useRef<HTMLDivElement>(null)
  const buttonRef = useRef<HTMLButtonElement>(null)

  // Load persisted state on mount and apply it
  useEffect(() => {
    try {
      const raw = localStorage.getItem(STORAGE_KEY)
      if (raw) {
        const parsed = { ...DEFAULT_STATE, ...JSON.parse(raw) } as A11yState
        setState(parsed)
        applyState(parsed)
      }
    } catch {
      /* ignore malformed storage */
    }
  }, [])

  // Persist + apply on every change
  const update = useCallback((next: A11yState) => {
    setState(next)
    applyState(next)
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(next))
    } catch {
      /* storage may be unavailable */
    }
  }, [])

  const toggle = (key: keyof A11yState) =>
    update({ ...state, [key]: !state[key] as never })

  const cycle = (key: 'textLevel' | 'zoomLevel') =>
    update({ ...state, [key]: ((state[key] + 1) % 4) as number })

  const reset = () => {
    setState(DEFAULT_STATE)
    applyState(DEFAULT_STATE)
    try {
      localStorage.removeItem(STORAGE_KEY)
    } catch {
      /* ignore */
    }
  }

  // Close on Escape; return focus to the trigger
  useEffect(() => {
    if (!open) return
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        setOpen(false)
        buttonRef.current?.focus()
      }
    }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [open])

  // Close when clicking outside the panel
  useEffect(() => {
    if (!open) return
    const onClick = (e: MouseEvent) => {
      if (
        panelRef.current &&
        !panelRef.current.contains(e.target as Node) &&
        !buttonRef.current?.contains(e.target as Node)
      ) {
        setOpen(false)
      }
    }
    document.addEventListener('mousedown', onClick)
    return () => document.removeEventListener('mousedown', onClick)
  }, [open])

  const activeCount =
    (state.textLevel > 0 ? 1 : 0) +
    (state.zoomLevel > 0 ? 1 : 0) +
    [
      state.highlightLinks,
      state.highlightHeadings,
      state.contrast,
      state.grayscale,
      state.readableFont,
      state.imageDescriptions,
      state.bigCursor,
      state.stopAnimations,
    ].filter(Boolean).length

  return (
    <>
      {/* Trigger — left-middle, frosted glass overlay (very subtle, nearly transparent) */}
      <button
        ref={buttonRef}
        type="button"
        onClick={() => setOpen((o) => !o)}
        aria-label="פתיחת תפריט נגישות"
        aria-expanded={open}
        aria-haspopup="dialog"
        className="fixed left-3 top-1/2 z-[60] flex h-11 w-11 -translate-y-1/2 items-center justify-center rounded-full text-white ring-1 ring-white/10 backdrop-blur transition-all duration-200 focus:outline-none focus-visible:ring-4 focus-visible:ring-blue-300 focus-visible:opacity-90"
        style={{
          background: 'rgba(59, 130, 246, 0.12)',
          opacity: 0.4,
          boxShadow: '0 2px 8px rgba(0,0,0,0.08)',
          border: '1px solid rgba(255,255,255,0.1)',
        }}
        onMouseEnter={(e) => {
          e.currentTarget.style.opacity = '0.85'
          e.currentTarget.style.background = 'rgba(59, 130, 246, 0.18)'
        }}
        onMouseLeave={(e) => {
          e.currentTarget.style.opacity = '0.4'
          e.currentTarget.style.background = 'rgba(59, 130, 246, 0.12)'
        }}
        onFocus={(e) => {
          e.currentTarget.style.opacity = '0.9'
        }}
        onBlur={(e) => {
          e.currentTarget.style.opacity = '0.4'
        }}
      >
        <svg viewBox="0 0 24 24" className="h-7 w-7 fill-current" aria-hidden="true">
          <path d="M12 2a2 2 0 1 1 0 4 2 2 0 0 1 0-4Zm8 5.5c0 .6-.4 1-1 1-1.9.3-3.8.5-5 .6V12l1.8 6.3a1 1 0 0 1-1.9.6L12 14.5l-1.9 4.4a1 1 0 0 1-1.9-.6L10 12V9.1c-1.2-.1-3.1-.3-5-.6a1 1 0 0 1 .3-2c2.4.4 5 .6 6.7.6 1.7 0 4.3-.2 6.7-.6.6-.1 1.1.4 1.3 1Z" />
        </svg>
        {activeCount > 0 && (
          <span className="absolute -right-1 -top-1 flex h-5 min-w-5 items-center justify-center rounded-full bg-amber-400 px-1 text-[11px] font-bold text-slate-900">
            {activeCount}
          </span>
        )}
      </button>

      {open && (
        <div
          ref={panelRef}
          role="dialog"
          aria-label="תפריט נגישות"
          dir="rtl"
          className="fixed left-3 top-1/2 z-[61] max-h-[80vh] w-72 max-w-[calc(100vw-1.5rem)] -translate-y-1/2 overflow-y-auto rounded-2xl border border-slate-200 bg-white p-4 shadow-2xl"
        >
          <div className="mb-3 flex items-center justify-between">
            <h2 className="text-base font-bold text-slate-900">תפריט נגישות</h2>
            <button
              type="button"
              onClick={() => setOpen(false)}
              aria-label="סגירת תפריט נגישות"
              className="flex h-7 w-7 items-center justify-center rounded-full text-slate-500 hover:bg-slate-100 hover:text-slate-800 focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-400"
            >
              <svg viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
                <path d="M6 6l12 12M18 6L6 18" strokeLinecap="round" />
              </svg>
            </button>
          </div>

          <div className="grid grid-cols-2 gap-2">
            <A11yTile label="הגדלת טקסט" active={state.textLevel > 0} badge={state.textLevel || undefined} onClick={() => cycle('textLevel')} icon="A+" />
            <A11yTile label="זום" active={state.zoomLevel > 0} badge={state.zoomLevel || undefined} onClick={() => cycle('zoomLevel')} icon="⤢" />
            <A11yTile label="הדגשת קישורים" active={state.highlightLinks} onClick={() => toggle('highlightLinks')} icon="🔗" />
            <A11yTile label="הדגשת כותרות" active={state.highlightHeadings} onClick={() => toggle('highlightHeadings')} icon="H" />
            <A11yTile label="ניגודיות" active={state.contrast} onClick={() => toggle('contrast')} icon="◑" />
            <A11yTile label="גווני אפור" active={state.grayscale} onClick={() => toggle('grayscale')} icon="▦" />
            <A11yTile label="גופן קריא" active={state.readableFont} onClick={() => toggle('readableFont')} icon="Aa" />
            <A11yTile label="תיאור לתמונות" active={state.imageDescriptions} onClick={() => toggle('imageDescriptions')} icon="🖼" />
            <A11yTile label="סמן גדול" active={state.bigCursor} onClick={() => toggle('bigCursor')} icon="➤" />
            <A11yTile label="חסימת אנימציה" active={state.stopAnimations} onClick={() => toggle('stopAnimations')} icon="⏸" />
          </div>

          <Link
            href="/accessibility"
            className="mt-3 flex items-center justify-center gap-2 rounded-lg bg-slate-100 px-3 py-2 text-sm font-medium text-slate-700 transition-colors hover:bg-slate-200 focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-400"
          >
            הצהרת נגישות
          </Link>

          <button
            type="button"
            onClick={reset}
            className="mt-2 flex w-full items-center justify-center gap-2 rounded-lg bg-red-50 px-3 py-2 text-sm font-bold text-red-700 transition-colors hover:bg-red-100 focus:outline-none focus-visible:ring-2 focus-visible:ring-red-400"
          >
            ביטול נגישות / איפוס
          </button>
        </div>
      )}
    </>
  )
}

function A11yTile({
  label,
  icon,
  active,
  badge,
  onClick,
}: {
  label: string
  icon: string
  active: boolean
  badge?: number
  onClick: () => void
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={active}
      className={`relative flex h-20 flex-col items-center justify-center gap-1 rounded-xl border p-2 text-center text-xs font-medium transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-400 ${
        active
          ? 'border-blue-600 bg-blue-50 text-blue-800'
          : 'border-slate-200 bg-white text-slate-600 hover:bg-slate-50'
      }`}
    >
      <span className="text-lg leading-none" aria-hidden="true">
        {icon}
      </span>
      <span className="leading-tight">{label}</span>
      {badge ? (
        <span className="absolute right-1 top-1 flex h-4 min-w-4 items-center justify-center rounded-full bg-blue-600 px-1 text-[10px] font-bold text-white">
          {badge}
        </span>
      ) : null}
    </button>
  )
}
