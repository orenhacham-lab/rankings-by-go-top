'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import Link from 'next/link'
import { usePathname } from 'next/navigation'
import {
  AArrowDown, AArrowUp, Accessibility, Captions, CirclePause, Contrast, Droplet, Heading, Highlighter, Keyboard,
  Link as LinkIcon, MessageSquareText, MousePointer2, MousePointerClick, Palette, RotateCcw, SunMoon, Type, X, ZoomIn, ZoomOut,
  type LucideIcon,
} from 'lucide-react'
import { getPublicDictionary } from '@/lib/i18n/getPublicDictionary'
import { publicUiLocale } from '@/lib/i18n/request-locale'
import { getLocaleConfig } from '@/lib/i18n/locales'
import { cn } from '@/lib/utils'

const STORAGE_KEY = 'a11y-settings-v2'

// ── Module-level tooltip state for showDescriptions ───────────────────────────
// Must live outside the component so applyState (called from localStorage) can
// access them without a React ref.
let _descTooltip: HTMLDivElement | null = null
let _descCleanup: Array<() => void> = []
/** The hover label for an image without alt text, in the page's language. */
let _noAltLabel = '(ללא תיאור alt)'
function _setNoAltLabel(label: string) { _noAltLabel = label }

function _positionTip(x: number, y: number) {
  if (!_descTooltip) return
  const W = window.innerWidth
  const tipW = 250
  const left = x + 16 + tipW > W ? x - tipW - 10 : x + 16
  _descTooltip.style.left = `${left}px`
  _descTooltip.style.top  = `${y + 24}px`
}

function _setupDescTooltip() {
  _teardownDescTooltip()
  if (typeof document === 'undefined') return

  const tip = document.createElement('div')
  tip.id = 'a11y-hover-tip'
  tip.style.cssText = 'position:fixed;z-index:99999;pointer-events:none;display:none;' +
    'background:var(--color-ink);color:var(--color-surface);padding:4px 10px;border-radius:var(--radius-control);font-size:12px;' +
    'line-height:1.5;max-width:250px;box-shadow:var(--shadow-pop);word-break:break-word'
  document.body.appendChild(tip)
  _descTooltip = tip

  document.querySelectorAll<HTMLImageElement>('img').forEach((img) => {
    const alt   = img.getAttribute('alt')?.trim()   ?? ''
    const label = alt || _noAltLabel

    const onEnter = (e: MouseEvent) => {
      tip.textContent = label
      tip.style.display = 'block'
      _positionTip(e.clientX, e.clientY)
    }
    const onMove  = (e: MouseEvent) => _positionTip(e.clientX, e.clientY)
    const onLeave = () => { tip.style.display = 'none' }

    img.addEventListener('mouseenter', onEnter as EventListener)
    img.addEventListener('mousemove',  onMove  as EventListener)
    img.addEventListener('mouseleave', onLeave)

    _descCleanup.push(() => {
      img.removeEventListener('mouseenter', onEnter as EventListener)
      img.removeEventListener('mousemove',  onMove  as EventListener)
      img.removeEventListener('mouseleave', onLeave)
    })
  })
}

function _teardownDescTooltip() {
  _descCleanup.forEach(fn => fn())
  _descCleanup = []
  _descTooltip?.remove()
  _descTooltip = null
}
// ─────────────────────────────────────────────────────────────────────────────

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

  // ── Show descriptions (custom hover tooltip) ─────────────────────────
  if (s.showDescriptions) {
    _setupDescTooltip()
  } else {
    _teardownDescTooltip()
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
      outline:3px solid var(--color-action)!important;
      outline-offset:2px!important;
      box-shadow:0 0 0 5px rgb(0 112 214/.25)!important
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
/**
 * The accessibility menu: a 40px button in the start corner, and a panel of
 * eighteen adjustments. Labels follow the page's language (/en is English).
 *
 * Below `md` the button docks INTO the bottom strip, in the start slot that the
 * contact bar and the privacy sheet both keep free for it, so on a phone it
 * never floats over the page (it used to sit on the hero's buttons), and the
 * privacy sheet, laid over the same strip, does not move it: it stays in its
 * slot, above the sheet in the stacking order (z-60 over z-58). From `md` there
 * is no contact bar and it floats at bottom-24.
 */
export function AccessibilityWidget() {
  const pathname = usePathname()
  const locale = publicUiLocale(pathname)
  const t = getPublicDictionary(locale).a11y
  const [open, setOpen]   = useState(false)
  const [state, setState] = useState<A11yState>(DEFAULT_STATE)
  const panelRef  = useRef<HTMLDivElement>(null)
  const buttonRef = useRef<HTMLButtonElement>(null)

  // Declared before the effect that restores saved settings, so the image
  // descriptions it may switch on already speak the page's language.
  useEffect(() => { _setNoAltLabel(t.noAlt) }, [t.noAlt])

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

  // When any CSS filter is applied to <html>, the semi-transparent button disappears.
  // Switching to a solid style makes it clearly visible even through sepia/grayscale/invert.
  const anyColorFilter = state.sepia || state.grayscale || state.invertColors

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

  const tiles: { key: string; label: string; icon: LucideIcon; active: boolean; badge?: number; onClick: () => void }[] = [
    { key: 'fontUp', label: t.fontUp, icon: AArrowUp, active: state.textLevel > 0, badge: state.textLevel > 0 ? state.textLevel : undefined, onClick: () => adjustText(1) },
    { key: 'fontDown', label: t.fontDown, icon: AArrowDown, active: state.textLevel < 0, badge: state.textLevel < 0 ? Math.abs(state.textLevel) : undefined, onClick: () => adjustText(-1) },
    { key: 'readableFont', label: t.readableFont, icon: Type, active: state.readableFont, onClick: () => toggle('readableFont') },
    { key: 'persistentDesc', label: t.persistentDesc, icon: Captions, active: state.persistentDesc, onClick: () => toggle('persistentDesc') },
    { key: 'showDescriptions', label: t.showDescriptions, icon: MessageSquareText, active: state.showDescriptions, onClick: () => toggle('showDescriptions') },
    { key: 'highlightLinks', label: t.highlightLinks, icon: LinkIcon, active: state.highlightLinks, onClick: () => toggle('highlightLinks') },
    { key: 'highlightHeadings', label: t.highlightHeadings, icon: Heading, active: state.highlightHeadings, onClick: () => toggle('highlightHeadings') },
    { key: 'invertColors', label: t.invertColors, icon: SunMoon, active: state.invertColors, onClick: () => toggle('invertColors') },
    { key: 'blackYellow', label: t.blackYellow, icon: Highlighter, active: state.blackYellow, onClick: () => toggle('blackYellow') },
    { key: 'highContrast', label: t.highContrast, icon: Contrast, active: state.highContrast, onClick: () => toggle('highContrast') },
    { key: 'sepia', label: t.sepia, icon: Palette, active: state.sepia, onClick: () => toggle('sepia') },
    { key: 'grayscale', label: t.grayscale, icon: Droplet, active: state.grayscale, onClick: () => toggle('grayscale') },
    { key: 'stopAnimations', label: t.stopAnimations, icon: CirclePause, active: state.stopAnimations, onClick: () => toggle('stopAnimations') },
    { key: 'keyboardNav', label: t.keyboardNav, icon: Keyboard, active: state.keyboardNav, onClick: () => toggle('keyboardNav') },
    { key: 'blackCursor', label: t.blackCursor, icon: MousePointer2, active: state.blackCursor, onClick: () => toggle('blackCursor') },
    { key: 'bigCursor', label: t.bigCursor, icon: MousePointerClick, active: state.bigCursor, onClick: () => toggle('bigCursor') },
    { key: 'zoomOut', label: t.zoomOut, icon: ZoomOut, active: state.zoomLevel < 0, badge: state.zoomLevel < 0 ? Math.abs(state.zoomLevel) : undefined, onClick: () => adjustZoom(-1) },
    { key: 'zoomIn', label: t.zoomIn, icon: ZoomIn, active: state.zoomLevel > 0, badge: state.zoomLevel > 0 ? state.zoomLevel : undefined, onClick: () => adjustZoom(1) },
  ]

  return (
    <>
      {/* ── Floating trigger: 40px, start corner, above the contact bar ── */}
      <button
        ref={buttonRef}
        type="button"
        onClick={() => setOpen((o) => !o)}
        aria-label={t.open}
        aria-expanded={open}
        aria-haspopup="dialog"
        data-a11y-trigger
        data-public-float
        className={cn(
          'fixed start-4 z-[60] flex size-10 items-center justify-center rounded-pill border shadow-pop',
          'transition-[bottom,background-color,border-color] duration-150 ease-snappy',
          'focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-action/20',
          // phone: docked in the bottom strip's start slot (centred on its 40px controls); md+: floating
          'bottom-[calc(0.75rem+env(safe-area-inset-bottom,0px))] md:bottom-24',
          // Solid on purpose: under an invert / sepia / grayscale filter a tinted
          // button would disappear.
          anyColorFilter ? 'border-ink bg-surface text-ink' : 'border-transparent bg-action text-action-ink hover:bg-action-hover',
        )}
      >
        <Accessibility className="size-5" aria-hidden="true" />
        {activeCount > 0 && (
          <span className="absolute -end-1 -top-1 flex h-5 min-w-5 items-center justify-center rounded-pill bg-commit px-1 text-overline font-bold tabular-nums text-commit-ink">
            {activeCount}
          </span>
        )}
      </button>

      {/* ── Panel ── */}
      {open && (
        <div
          ref={panelRef}
          role="dialog"
          aria-label={t.title}
          dir={getLocaleConfig(locale).dir}
          className={cn(
            'fixed start-4 z-[61] max-h-[calc(100dvh-8rem)] w-80 max-w-[calc(100vw-2rem)] animate-pop-in overflow-y-auto',
            'rounded-card border border-line bg-surface p-4 shadow-pop',
            // Opens above the bottom strip on a phone, above the button from md.
            'bottom-[calc(5rem+env(safe-area-inset-bottom,0px))] md:bottom-36',
          )}
        >
          {/* Header */}
          <div className="mb-3 flex items-center justify-between">
            <h2 className="text-section font-semibold text-ink">{t.title}</h2>
            <button
              type="button"
              onClick={() => setOpen(false)}
              aria-label={t.close}
              className="flex size-8 items-center justify-center rounded-control text-muted transition-colors duration-150 ease-snappy hover:bg-sunk hover:text-ink focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-action/20"
            >
              <X className="size-4" aria-hidden="true" />
            </button>
          </div>

          {/* Tile grid */}
          <div className="grid grid-cols-3 gap-2">
            {tiles.map((tile) => (
              <A11yTile key={tile.key} label={tile.label} icon={tile.icon} active={tile.active} badge={tile.badge} onClick={tile.onClick} />
            ))}
          </div>

          {/* Accessibility statement link */}
          <Link
            href={locale === 'he' ? '/accessibility' : '/en/accessibility'}
            className="mt-3 flex h-10 items-center justify-center gap-2 rounded-control border border-line bg-surface text-copy font-semibold text-ink shadow-control transition-colors duration-150 ease-snappy hover:border-line-strong hover:bg-sunk/60 focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-action/20"
          >
            {t.statement}
          </Link>

          {/* Reset */}
          <button
            type="button"
            onClick={reset}
            className="mt-2 flex h-10 w-full items-center justify-center gap-2 rounded-control text-copy font-semibold text-bad transition-colors duration-150 ease-snappy hover:bg-bad-soft focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-bad/20"
          >
            <RotateCcw className="size-4" aria-hidden="true" />
            {t.reset}
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
  icon: Icon,
  active,
  badge,
  onClick,
}: {
  label: string
  icon: LucideIcon
  active: boolean
  badge?: number
  onClick: () => void
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={active}
      className={cn(
        'relative flex h-20 flex-col items-center justify-center gap-1.5 rounded-inset border p-2 text-center text-caption font-medium',
        'transition-[background-color,border-color,color] duration-150 ease-snappy focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-action/20',
        active ? 'border-action bg-action-soft text-action' : 'border-line bg-surface text-body hover:border-line-strong hover:bg-sunk/60',
      )}
    >
      <Icon className="size-5" aria-hidden="true" />
      <span className="leading-tight">{label}</span>
      {badge != null && (
        <span className="absolute end-1 top-1 flex h-4 min-w-4 items-center justify-center rounded-pill bg-action px-1 text-overline font-bold tabular-nums text-action-ink">
          {badge}
        </span>
      )}
    </button>
  )
}
