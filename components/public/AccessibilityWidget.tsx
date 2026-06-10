'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import Link from 'next/link'

const STORAGE_KEY = 'a11y-settings-v2'

type A11yState = {
  textLevel: number    // -3..+3: negative = smaller, positive = larger
  zoomLevel: number    // -3..+3: negative = zoom out, positive = zoom in
  readableFont: boolean
  persistentDesc: boolean
  showDescriptions: boolean
  highlightLinks: boolean
  highlightHeadings: boolean
  invertColors: boolean
  blackYellow: boolean
  highContrast: boolean
  sepia: boolean
  grayscale: boolean
  stopAnimations: boolean
  keyboardNav: boolean
  blackCursor: boolean
  bigCursor: boolean
}

const DEFAULT_STATE: A11yState = {
  textLevel: 0,
  zoomLevel: 0,
  readableFont: false,
  persistentDesc: false,
  showDescriptions: false,
  highlightLinks: false,
  highlightHeadings: false,
  invertColors: false,
  blackYellow: false,
  highContrast: false,
  sepia: false,
  grayscale: false,
  stopAnimations: false,
  keyboardNav: false,
  blackCursor: false,
  bigCursor: false,
}

// index = level + 3 (level -3 → index 0, level 0 → index 3, level +3 → index 6)
const TEXT_CLASSES = ['a11y-text-n3', 'a11y-text-n2', 'a11y-text-n1', '', 'a11y-text-1', 'a11y-text-2', 'a11y-text-3']
const ZOOM_VALUES  = [0.75, 0.833, 0.917, 1, 1.1, 1.2, 1.3]

function injectStyle(id: string, css: string | null) {
  if (typeof document === 'undefined') return
  const existing = document.getElementById(id)
  if (css) {
    const el = (existing ?? (() => {
      const s = document.createElement('style')
      s.id = id
      document.head.appendChild(s)
      return s
    })()) as HTMLStyleElement
    if (el.textContent !== css) el.textContent = css
  } else {
    existing?.remove()
  }
}

function applyState(s: A11yState) {
  if (typeof document === 'undefined') return
  const html = document.documentElement

  // ── Font size ─────────────────────────────────────────────────────────
  html.classList.remove('a11y-text-n3','a11y-text-n2','a11y-text-n1','a11y-text-1','a11y-text-2','a11y-text-3')
  const textClass = TEXT_CLASSES[s.textLevel + 3]
  if (textClass) html.classList.add(textClass)

  // ── Page zoom ─────────────────────────────────────────────────────────
  const zoom = ZOOM_VALUES[s.zoomLevel + 3] ?? 1
  ;(document.body.style as CSSStyleDeclaration & { zoom?: string }).zoom =
    zoom !== 1 ? String(zoom) : ''

  // ── Simple CSS class toggles ──────────────────────────────────────────
  html.classList.toggle('a11y-readable-font',     s.readableFont)
  html.classList.toggle('a11y-highlight-links',   s.highlightLinks)
  html.classList.toggle('a11y-highlight-headings',s.highlightHeadings)
  html.classList.toggle('a11y-stop-animations',   s.stopAnimations)

  // ── Persistent alt-text labels ────────────────────────────────────────
  if (s.persistentDesc) {
    document.querySelectorAll<HTMLImageElement>('img[alt]:not([data-a11y-desc])').forEach((img) => {
      const alt = img.getAttribute('alt') ?? ''
      if (!alt.trim()) return
      const span = document.createElement('span')
      span.className = 'a11y-desc-label'
      span.textContent = alt
      span.setAttribute('aria-hidden', 'true')
      img.setAttribute('data-a11y-desc', '1')
      img.insertAdjacentElement('afterend', span)
    })
  } else {
    document.querySelectorAll('.a11y-desc-label').forEach(el => el.remove())
    document.querySelectorAll('[data-a11y-desc]').forEach(el => el.removeAttribute('data-a11y-desc'))
  }

  // ── Show descriptions (hover title tooltips) ──────────────────────────
  if (s.showDescriptions) {
    document.querySelectorAll<HTMLImageElement>('img').forEach((img) => {
      const alt = img.getAttribute('alt') ?? ''
      if (alt && !img.getAttribute('data-a11y-title-added')) {
        img.setAttribute('data-a11y-title-added', '1')
        if (!img.getAttribute('title')) img.setAttribute('title', alt)
      }
      img.setAttribute('data-a11y-noalt', alt ? 'false' : 'true')
    })
    document.querySelectorAll<HTMLElement>('[aria-label]:not(img)').forEach((el) => {
      const label = el.getAttribute('aria-label') ?? ''
      if (label && !el.getAttribute('title') && !el.getAttribute('data-a11y-title-added')) {
        el.setAttribute('data-a11y-title-added', '1')
        el.setAttribute('title', label)
      }
    })
  } else {
    document.querySelectorAll('[data-a11y-title-added]').forEach(el => {
      el.removeAttribute('data-a11y-title-added')
      el.removeAttribute('data-a11y-noalt')
    })
  }

  // ── CSS filter: invert / sepia / grayscale ────────────────────────────
  const filters: string[] = []
  if (s.invertColors) filters.push('invert(1) hue-rotate(180deg)')
  if (s.sepia)        filters.push('sepia(0.75)')
  if (s.grayscale)    filters.push('grayscale(1)')
  html.style.filter = filters.join(' ')

  // ── Black + Yellow mode ───────────────────────────────────────────────
  injectStyle('a11y-black-yellow', s.blackYellow ? `
    html,body{background:#000!important}
    *{background-color:#000!important!important;color:#ff0!important;border-color:#ff0!important;outline-color:#ff0!important}
    a{color:#ff0!important;text-decoration:underline!important;font-weight:bold!important}
    button,[role=button]{background:#111!important;color:#ff0!important;border:2px solid #ff0!important}
    input,select,textarea{background:#111!important;color:#ff0!important;border:2px solid #ff0!important}
    img{opacity:.85;border:1px solid #ff0!important}
    ::placeholder{color:#ff0!important;opacity:.7!important}
  ` : null)

  // ── High contrast mode ────────────────────────────────────────────────
  injectStyle('a11y-high-contrast', s.highContrast ? `
    html,body{background:#000!important;color:#fff!important}
    *{background-color:#000!important;color:#fff!important!important;border-color:#fff!important;outline-color:#fff!important}
    a{color:#7ad4ff!important;text-decoration:underline!important;font-weight:bold!important}
    button,[role=button]{background:#111!important;color:#fff!important;border:2px solid #fff!important;font-weight:bold!important}
    input,select,textarea{background:#1a1a1a!important;color:#fff!important;border:2px solid #ccc!important}
    input::placeholder,textarea::placeholder{color:#999!important}
    img{opacity:.9;border:1px solid #ccc!important}
    h1,h2,h3,h4,h5,h6{color:#fff!important;font-weight:900!important}
  ` : null)

  // ── Keyboard navigation (enhanced focus ring) ─────────────────────────
  injectStyle('a11y-kb-nav', s.keyboardNav ? `
    *:focus,*:focus-visible{
      outline:3px solid #2563eb!important;
      outline-offset:2px!important;
      box-shadow:0 0 0 5px rgba(37,99,235,.25)!important
    }
  ` : null)

  // ── Custom cursors ────────────────────────────────────────────────────
  const blackArrow = encodeURIComponent(
    `<svg xmlns="http://www.w3.org/2000/svg" width="20" height="24"><path d="M3 1L3 20L7 15L11 22L14 20L10 13L16 13Z" fill="black" stroke="white" stroke-width="1.5" stroke-linejoin="round"/></svg>`
  )
  const bigArrow = encodeURIComponent(
    `<svg xmlns="http://www.w3.org/2000/svg" width="40" height="48"><path d="M5 2L5 40L14 28L20 44L26 41L20 25L32 25Z" fill="black" stroke="white" stroke-width="2.5" stroke-linejoin="round"/></svg>`
  )
  injectStyle('a11y-cursor',
    s.bigCursor
      ? `*,*::before,*::after{cursor:url("data:image/svg+xml,${bigArrow}") 5 2,auto!important}`
      : s.blackCursor
      ? `*,*::before,*::after{cursor:url("data:image/svg+xml,${blackArrow}") 3 1,auto!important}`
      : null
  )
}

// ─────────────────────────────────────────────────────────────────────────────
// Component
// ─────────────────────────────────────────────────────────────────────────────
export function AccessibilityWidget() {
  const [open, setOpen]   = useState(false)
  const [state, setState] = useState<A11yState>(DEFAULT_STATE)
  const panelRef  = useRef<HTMLDivElement>(null)
  const buttonRef = useRef<HTMLButtonElement>(null)

  // Load persisted state on mount
  useEffect(() => {
    try {
      const raw = localStorage.getItem(STORAGE_KEY)
      if (raw) {
        const parsed = { ...DEFAULT_STATE, ...JSON.parse(raw) } as A11yState
        setState(parsed)
        applyState(parsed)
      }
    } catch { /* ignore malformed storage */ }
  }, [])

  const update = useCallback((next: A11yState) => {
    setState(next)
    applyState(next)
    try { localStorage.setItem(STORAGE_KEY, JSON.stringify(next)) } catch { /* storage unavailable */ }
  }, [])

  const toggle = (key: keyof A11yState) =>
    update({ ...state, [key]: !state[key as keyof A11yState] as never })

  const adjustText = (dir: 1 | -1) =>
    update({ ...state, textLevel: Math.max(-3, Math.min(3, state.textLevel + dir)) })

  const adjustZoom = (dir: 1 | -1) =>
    update({ ...state, zoomLevel: Math.max(-3, Math.min(3, state.zoomLevel + dir)) })

  const reset = () => {
    setState(DEFAULT_STATE)
    applyState(DEFAULT_STATE)
    try { localStorage.removeItem(STORAGE_KEY) } catch { /* ignore */ }
  }

  // Close on Escape
  useEffect(() => {
    if (!open) return
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') { setOpen(false); buttonRef.current?.focus() }
    }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [open])

  // Close on outside click
  useEffect(() => {
    if (!open) return
    const onClick = (e: MouseEvent) => {
      if (
        panelRef.current &&
        !panelRef.current.contains(e.target as Node) &&
        !buttonRef.current?.contains(e.target as Node)
      ) setOpen(false)
    }
    document.addEventListener('mousedown', onClick)
    return () => document.removeEventListener('mousedown', onClick)
  }, [open])

  const activeCount = [
    state.textLevel !== 0,
    state.zoomLevel !== 0,
    state.readableFont,
    state.persistentDesc,
    state.showDescriptions,
    state.highlightLinks,
    state.highlightHeadings,
    state.invertColors,
    state.blackYellow,
    state.highContrast,
    state.sepia,
    state.grayscale,
    state.stopAnimations,
    state.keyboardNav,
    state.blackCursor,
    state.bigCursor,
  ].filter(Boolean).length

  return (
    <>
      {/* ── Floating trigger ── */}
      <button
        ref={buttonRef}
        type="button"
        onClick={() => setOpen((o) => !o)}
        aria-label="פתיחת תפריט נגישות"
        aria-expanded={open}
        aria-haspopup="dialog"
        className="fixed left-3 top-1/2 z-[60] flex h-11 w-11 -translate-y-1/2 items-center justify-center rounded-full text-white ring-1 ring-white/10 backdrop-blur transition-all duration-200 focus:outline-none focus-visible:ring-4 focus-visible:ring-blue-300"
        style={{ background: 'rgba(59,130,246,0.2)', opacity: 0.5, boxShadow: '0 2px 8px rgba(0,0,0,0.08)', border: '1px solid rgba(255,255,255,0.1)' }}
        onMouseEnter={(e) => { e.currentTarget.style.opacity = '0.92'; e.currentTarget.style.background = 'rgba(59,130,246,0.26)' }}
        onMouseLeave={(e) => { e.currentTarget.style.opacity = '0.5';  e.currentTarget.style.background = 'rgba(59,130,246,0.2)'  }}
        onFocus={(e)      => { e.currentTarget.style.opacity = '0.95' }}
        onBlur={(e)       => { e.currentTarget.style.opacity = '0.5'  }}
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

      {/* ── Panel ── */}
      {open && (
        <div
          ref={panelRef}
          role="dialog"
          aria-label="תפריט נגישות"
          dir="rtl"
          className="fixed left-3 top-1/2 z-[61] max-h-[90vh] w-72 max-w-[calc(100vw-1.5rem)] -translate-y-1/2 overflow-y-auto rounded-2xl border border-slate-200 bg-white p-4 shadow-2xl"
        >
          {/* Header */}
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

          {/* Tile grid */}
          <div className="grid grid-cols-2 gap-2">

            {/* 1 — הגדלת גופן */}
            <A11yTile
              label="הגדלת גופן"
              active={state.textLevel > 0}
              badge={state.textLevel > 0 ? state.textLevel : undefined}
              onClick={() => adjustText(1)}
            >
              <IcoFontUp />
            </A11yTile>

            {/* 2 — הקטנת גופן */}
            <A11yTile
              label="הקטנת גופן"
              active={state.textLevel < 0}
              badge={state.textLevel < 0 ? Math.abs(state.textLevel) : undefined}
              onClick={() => adjustText(-1)}
            >
              <IcoFontDown />
            </A11yTile>

            {/* 3 — גופן קריא */}
            <A11yTile label="גופן קריא" active={state.readableFont} onClick={() => toggle('readableFont')}>
              <IcoReadableFont />
            </A11yTile>

            {/* 4 — תיאור קבוע */}
            <A11yTile label="תיאור קבוע" active={state.persistentDesc} onClick={() => toggle('persistentDesc')}>
              <IcoPersistDesc />
            </A11yTile>

            {/* 5 — הצגת תיאור */}
            <A11yTile label="הצגת תיאור" active={state.showDescriptions} onClick={() => toggle('showDescriptions')}>
              <IcoShowDesc />
            </A11yTile>

            {/* 6 — הדגשת קישורים */}
            <A11yTile label="הדגשת קישורים" active={state.highlightLinks} onClick={() => toggle('highlightLinks')}>
              <IcoLinks />
            </A11yTile>

            {/* 7 — הדגשת כותרות */}
            <A11yTile label="הדגשת כותרות" active={state.highlightHeadings} onClick={() => toggle('highlightHeadings')}>
              <IcoHeadings />
            </A11yTile>

            {/* 8 — היפוך צבעים */}
            <A11yTile label="היפוך צבעים" active={state.invertColors} onClick={() => toggle('invertColors')}>
              <IcoInvert />
            </A11yTile>

            {/* 9 — שחור צהוב */}
            <A11yTile label="שחור צהוב" active={state.blackYellow} onClick={() => toggle('blackYellow')}>
              <IcoBlackYellow />
            </A11yTile>

            {/* 10 — ניגודיות גבוהה */}
            <A11yTile label="ניגודיות גבוהה" active={state.highContrast} onClick={() => toggle('highContrast')}>
              <IcoHighContrast />
            </A11yTile>

            {/* 11 — ספיה */}
            <A11yTile label="ספיה" active={state.sepia} onClick={() => toggle('sepia')}>
              <IcoSepia />
            </A11yTile>

            {/* 12 — מונוכרום */}
            <A11yTile label="מונוכרום" active={state.grayscale} onClick={() => toggle('grayscale')}>
              <IcoGrayscale />
            </A11yTile>

            {/* 13 — ביטול הבהובים */}
            <A11yTile label="ביטול הבהובים" active={state.stopAnimations} onClick={() => toggle('stopAnimations')}>
              <IcoStopAnim />
            </A11yTile>

            {/* 14 — ניווט מקלדת */}
            <A11yTile label="ניווט מקלדת" active={state.keyboardNav} onClick={() => toggle('keyboardNav')}>
              <IcoKeyboard />
            </A11yTile>

            {/* 15 — סמן שחור */}
            <A11yTile label="סמן שחור" active={state.blackCursor} onClick={() => toggle('blackCursor')}>
              <IcoCursorBlack />
            </A11yTile>

            {/* 16 — סמן גדול */}
            <A11yTile label="סמן גדול" active={state.bigCursor} onClick={() => toggle('bigCursor')}>
              <IcoCursorBig />
            </A11yTile>

            {/* 17 — הקטנת מסך */}
            <A11yTile
              label="הקטנת מסך"
              active={state.zoomLevel < 0}
              badge={state.zoomLevel < 0 ? Math.abs(state.zoomLevel) : undefined}
              onClick={() => adjustZoom(-1)}
            >
              <IcoZoomOut />
            </A11yTile>

            {/* 18 — הגדלת מסך */}
            <A11yTile
              label="הגדלת מסך"
              active={state.zoomLevel > 0}
              badge={state.zoomLevel > 0 ? state.zoomLevel : undefined}
              onClick={() => adjustZoom(1)}
            >
              <IcoZoomIn />
            </A11yTile>

          </div>

          {/* Accessibility statement link */}
          <Link
            href="/accessibility"
            className="mt-3 flex items-center justify-center gap-2 rounded-lg bg-slate-100 px-3 py-2 text-sm font-medium text-slate-700 transition-colors hover:bg-slate-200 focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-400"
          >
            הצהרת נגישות
          </Link>

          {/* Reset */}
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

// ─────────────────────────────────────────────────────────────────────────────
// Tile
// ─────────────────────────────────────────────────────────────────────────────
function A11yTile({
  label,
  active,
  badge,
  onClick,
  children,
}: {
  label: string
  active: boolean
  badge?: number
  onClick: () => void
  children: React.ReactNode
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
      <span aria-hidden="true">{children}</span>
      <span className="leading-tight">{label}</span>
      {badge != null && (
        <span className="absolute right-1 top-1 flex h-4 min-w-4 items-center justify-center rounded-full bg-blue-600 px-1 text-[10px] font-bold text-white">
          {badge}
        </span>
      )}
    </button>
  )
}

// ─────────────────────────────────────────────────────────────────────────────
// Icons — all 24 × 24 inline SVG
// ─────────────────────────────────────────────────────────────────────────────

function IcoFontUp() {
  return (
    <svg viewBox="0 0 24 24" className="h-6 w-6" fill="none" aria-hidden="true">
      <text x="1" y="18" fontSize="17" fontWeight="800" fontFamily="Arial,sans-serif" fill="currentColor">A</text>
      <polyline points="20,14 20,6" stroke="currentColor" strokeWidth="2" strokeLinecap="round"/>
      <polyline points="17,9 20,6 23,9"  stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
    </svg>
  )
}

function IcoFontDown() {
  return (
    <svg viewBox="0 0 24 24" className="h-6 w-6" fill="none" aria-hidden="true">
      <text x="1" y="18" fontSize="17" fontWeight="800" fontFamily="Arial,sans-serif" fill="currentColor">A</text>
      <polyline points="20,6 20,14" stroke="currentColor" strokeWidth="2" strokeLinecap="round"/>
      <polyline points="17,11 20,14 23,11" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
    </svg>
  )
}

function IcoReadableFont() {
  return (
    <svg viewBox="0 0 24 24" className="h-6 w-6" fill="none" aria-hidden="true">
      <text x="1" y="15" fontSize="13" fontWeight="700" fontFamily="Arial,sans-serif" fill="currentColor">A</text>
      <text x="11" y="19" fontSize="10" fontWeight="400" fontFamily="Arial,sans-serif" fill="currentColor">a</text>
      <line x1="1" y1="21" x2="21" y2="21" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/>
    </svg>
  )
}

function IcoPersistDesc() {
  return (
    <svg viewBox="0 0 24 24" className="h-6 w-6" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <rect x="2" y="3" width="14" height="11" rx="1.5"/>
      <line x1="5" y1="7" x2="13" y2="7"/>
      <line x1="5" y1="10" x2="10" y2="10"/>
      <path d="M17 10l2-2 3 3-5 5-3-3 1-1" fill="currentColor" stroke="none"/>
      <path d="M21 8l-2-2" strokeWidth="1.5"/>
    </svg>
  )
}

function IcoShowDesc() {
  return (
    <svg viewBox="0 0 24 24" className="h-6 w-6" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <rect x="2" y="4" width="20" height="14" rx="2"/>
      <circle cx="12" cy="11" r="2.5"/>
      <path d="M4 11c2-4 12-4 16 0"/>
      <line x1="12" y1="18" x2="12" y2="22"/>
      <line x1="9"  y1="22" x2="15" y2="22"/>
    </svg>
  )
}

function IcoLinks() {
  return (
    <svg viewBox="0 0 24 24" className="h-6 w-6" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71"/>
      <path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71"/>
    </svg>
  )
}

function IcoHeadings() {
  return (
    <svg viewBox="0 0 24 24" className="h-6 w-6" fill="none" aria-hidden="true">
      <text x="2" y="17" fontSize="16" fontWeight="900" fontFamily="Arial,sans-serif" fill="currentColor">H</text>
      <text x="14" y="19" fontSize="9"  fontWeight="700" fontFamily="Arial,sans-serif" fill="currentColor">1</text>
      <line x1="2" y1="20" x2="20" y2="20" stroke="currentColor" strokeWidth="2" strokeLinecap="round"/>
    </svg>
  )
}

function IcoInvert() {
  return (
    <svg viewBox="0 0 24 24" className="h-6 w-6" aria-hidden="true">
      <circle cx="12" cy="12" r="9" fill="none" stroke="currentColor" strokeWidth="1.8"/>
      <path d="M12 3 A9 9 0 0 1 12 21 Z" fill="currentColor"/>
      <line x1="12" y1="3" x2="12" y2="21" stroke="currentColor" strokeWidth="1.5"/>
    </svg>
  )
}

function IcoBlackYellow() {
  return (
    <svg viewBox="0 0 24 24" className="h-6 w-6" aria-hidden="true">
      <rect x="2"  y="4" width="10" height="16" rx="1" fill="currentColor"/>
      <rect x="12" y="4" width="10" height="16" rx="1" fill="#facc15"/>
      <rect x="2"  y="4" width="20" height="16" rx="1" fill="none" stroke="currentColor" strokeWidth="1.5"/>
    </svg>
  )
}

function IcoHighContrast() {
  return (
    <svg viewBox="0 0 24 24" className="h-6 w-6" aria-hidden="true">
      <rect x="2" y="4" width="20" height="16" rx="2" fill="none" stroke="currentColor" strokeWidth="1.8"/>
      <rect x="2" y="4" width="10" height="16" rx="2" fill="currentColor"/>
      <circle cx="15" cy="12" r="3" fill="none" stroke="currentColor" strokeWidth="1.5"/>
    </svg>
  )
}

function IcoSepia() {
  return (
    <svg viewBox="0 0 24 24" className="h-6 w-6" aria-hidden="true">
      <defs>
        <radialGradient id="sepia-grad" cx="40%" cy="40%">
          <stop offset="0%"   stopColor="#d4a96a"/>
          <stop offset="100%" stopColor="#7c4a1e"/>
        </radialGradient>
      </defs>
      <circle cx="12" cy="12" r="9" fill="url(#sepia-grad)" stroke="currentColor" strokeWidth="1.5"/>
      <circle cx="12" cy="12" r="4" fill="none" stroke="rgba(255,255,255,0.5)" strokeWidth="1"/>
    </svg>
  )
}

function IcoGrayscale() {
  return (
    <svg viewBox="0 0 24 24" className="h-6 w-6" aria-hidden="true">
      <defs>
        <linearGradient id="gray-grad" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0%"   stopColor="#f1f5f9"/>
          <stop offset="100%" stopColor="#1e293b"/>
        </linearGradient>
      </defs>
      <circle cx="12" cy="12" r="9" fill="url(#gray-grad)" stroke="currentColor" strokeWidth="1.5"/>
    </svg>
  )
}

function IcoStopAnim() {
  return (
    <svg viewBox="0 0 24 24" className="h-6 w-6" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden="true">
      <circle cx="12" cy="12" r="9"/>
      <line x1="10" y1="8"  x2="10" y2="16"/>
      <line x1="14" y1="8"  x2="14" y2="16"/>
    </svg>
  )
}

function IcoKeyboard() {
  return (
    <svg viewBox="0 0 24 24" className="h-6 w-6" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <rect x="2" y="6" width="20" height="13" rx="2"/>
      <line x1="6"  y1="10" x2="6"  y2="10.01"/>
      <line x1="10" y1="10" x2="10" y2="10.01"/>
      <line x1="14" y1="10" x2="14" y2="10.01"/>
      <line x1="18" y1="10" x2="18" y2="10.01"/>
      <line x1="8"  y1="14" x2="16" y2="14"/>
    </svg>
  )
}

function IcoCursorBlack() {
  return (
    <svg viewBox="0 0 24 24" className="h-6 w-6" aria-hidden="true">
      <path d="M5 3L5 19L9 14L12 21L15 19.5L12 12.5L18 12.5Z" fill="currentColor" stroke="white" strokeWidth="1" strokeLinejoin="round"/>
    </svg>
  )
}

function IcoCursorBig() {
  return (
    <svg viewBox="0 0 24 24" className="h-6 w-6" aria-hidden="true">
      <path d="M3 2L3 17L7 12.5L10 19L13 17.5L10 11L16 11Z" fill="currentColor" stroke="white" strokeWidth="0.8" strokeLinejoin="round"/>
      <path d="M18 14l2-2M18 18l2 2M16 16h3" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/>
    </svg>
  )
}

function IcoZoomOut() {
  return (
    <svg viewBox="0 0 24 24" className="h-6 w-6" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <circle cx="10" cy="10" r="7"/>
      <line x1="21" y1="21" x2="15" y2="15"/>
      <line x1="7"  y1="10" x2="13" y2="10"/>
    </svg>
  )
}

function IcoZoomIn() {
  return (
    <svg viewBox="0 0 24 24" className="h-6 w-6" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <circle cx="10" cy="10" r="7"/>
      <line x1="21" y1="21" x2="15" y2="15"/>
      <line x1="10" y1="7"  x2="10" y2="13"/>
      <line x1="7"  y1="10" x2="13" y2="10"/>
    </svg>
  )
}
