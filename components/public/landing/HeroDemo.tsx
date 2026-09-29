'use client'

/**
 * The hero's live demo: our own screens, drawn with the app's tokens, playing
 * the three things a customer buys in a loop:
 *   1. a keyword climbing in Google (the rank chart draws, the position counts),
 *   2. an article being written (title types, quality checks tick, it is scheduled),
 *   3. an AI answer that recommends the business (the answer streams, the
 *      business is highlighted, the engines that mention it light up).
 *
 * One clock drives it (requestAnimationFrame, in ms since the scene started),
 * so pausing is exact: it stops while the pointer or focus is on the demo,
 * while it is scrolled out of view and while the tab is hidden.
 *
 * COMPLETE AT REST: the server renders scene 1 FINISHED (time = Infinity), and
 * so does a visitor who asked for reduced motion; they switch scenes with the
 * tabs and every scene is simply shown in its final state. The first scene
 * never replays on hydration; motion starts with the next scene.
 *
 * Names and figures in the demo are illustrative, and the caption says so.
 */
import { useCallback, useEffect, useRef, useState, type CSSProperties } from 'react'
import type { LucideIcon } from 'lucide-react'
import {
  BarChart3, Bot, CalendarClock, Check, FileText, KeyRound, LayoutDashboard, Lightbulb, MapPin, PenLine, Send, Sparkles, TrendingUp,
} from 'lucide-react'
import GoTopMark from '@/components/brand/GoTopMark'
import { useReducedMotion } from '@/components/ui/motion'
import { cn } from '@/lib/utils'
import styles from './landing.module.css'

export type HeroDemoCopy = {
  /** The region's accessible name. */
  label: string
  /** Under the stage: says the names and figures are illustrative. */
  caption: string
  tabs: [string, string, string]
  /** One short sentence per scene for screen readers (the drawing itself is decorative). */
  describe: [string, string, string]
  address: string
  /** The app rail: dashboard, keywords, strategy, articles, AI visibility, reports. */
  rail: [string, string, string, string, string, string]
  rank: {
    heading: string
    keyword: string
    positionLabel: string
    period: string
    from: number
    to: number
    columns: [string, string, string]
    rows: { keyword: string; from: number; to: number }[]
    mapsLabel: string
    mapsValue: string
    toast: string
  }
  article: {
    heading: string
    title: string
    subheading: string
    checksTitle: string
    checks: string[]
    draft: string
    scheduled: string
    when: string
    toast: string
  }
  ai: {
    heading: string
    question: string
    intro: string
    items: { name: string; desc: string; you?: boolean }[]
    youTag: string
    mentionedIn: string
    engines: { name: string; on: boolean }[]
    toast: string
  }
}

const SCENE_MS = 7200
/** How long the first scene, shown finished, holds before the loop starts. */
const HOLD_MS = 4000
const SCENE_ICONS: LucideIcon[] = [TrendingUp, PenLine, Sparkles]
const RAIL_ICONS: LucideIcon[] = [LayoutDashboard, KeyRound, Lightbulb, FileText, Sparkles, BarChart3]
/** Which rail item each scene lives under: keywords, articles, AI visibility. */
const RAIL_FOR_SCENE = [1, 3, 4]

// ── time helpers: t is ms since the scene started, Infinity = finished ──
const clamp01 = (x: number) => (x < 0 ? 0 : x > 1 ? 1 : x)
const easeOut = (x: number) => 1 - Math.pow(1 - clamp01(x), 3)
/** 0→1 between `start` and `start + dur`, eased. */
const phase = (t: number, start: number, dur: number) => (t === Infinity ? 1 : easeOut((t - start) / dur))
/** Inline style for an element that enters at `start`: fade + 8px rise (or a pop). */
function enter(t: number, start: number, dur = 320, pop = false): CSSProperties {
  const p = phase(t, start, dur)
  if (p >= 1) return {}
  return {
    opacity: p,
    transform: pop ? `translateY(${(1 - p) * 10}px) scale(${0.96 + 0.04 * p})` : `translateY(${(1 - p) * 8}px)`,
  }
}

export function HeroDemo({ copy, rtl }: { copy: HeroDemoCopy; rtl: boolean }) {
  const reduced = useReducedMotion()
  /**
   * scene: which one is showing; t: ms into it (Infinity = shown finished: the
   * first paint and reduced motion); held: how long the finished first scene
   * has been on screen before the loop takes over.
   */
  const [clock, setClock] = useState<{ scene: number; t: number; held: number }>({ scene: 0, t: Infinity, held: 0 })
  const { scene, t } = clock
  const [hovered, setHovered] = useState(false)
  const [visible, setVisible] = useState(true)
  const stageRef = useRef<HTMLDivElement | null>(null)
  const playing = !reduced && !hovered && visible

  // Out of view or in a hidden tab: stop the clock.
  useEffect(() => {
    const el = stageRef.current
    if (!el || typeof IntersectionObserver === 'undefined') return
    const io = new IntersectionObserver(([e]) => setVisible(e.isIntersecting && document.visibilityState === 'visible'), { threshold: 0.2 })
    io.observe(el)
    const onVis = () => setVisible(document.visibilityState === 'visible' && el.getBoundingClientRect().bottom > 0)
    document.addEventListener('visibilitychange', onVis)
    return () => { io.disconnect(); document.removeEventListener('visibilitychange', onVis) }
  }, [])

  // The clock (a pure updater, so a double-invoked updater cannot skip a scene).
  // The finished first scene holds for HOLD_MS before the loop starts, so it
  // never replays on hydration.
  useEffect(() => {
    if (!playing) return
    let raf = 0
    let last = performance.now()
    const tick = (now: number) => {
      const dt = Math.min(64, now - last)
      last = now
      setClock((c) => {
        if (c.t === Infinity) {
          const held = c.held + dt
          return held < HOLD_MS ? { ...c, held } : { scene: (c.scene + 1) % 3, t: 0, held: 0 }
        }
        const next = c.t + dt
        return next >= SCENE_MS ? { scene: (c.scene + 1) % 3, t: 0, held: 0 } : { ...c, t: next }
      })
      raf = requestAnimationFrame(tick)
    }
    raf = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(raf)
  }, [playing])

  const choose = useCallback((i: number) => {
    setClock({ scene: i, t: reduced ? Infinity : 0, held: 0 })
  }, [reduced])

  const onTabKey = (e: React.KeyboardEvent, i: number) => {
    const fwd = rtl ? 'ArrowLeft' : 'ArrowRight'
    const back = rtl ? 'ArrowRight' : 'ArrowLeft'
    if (e.key !== fwd && e.key !== back) return
    e.preventDefault()
    const next = (i + (e.key === fwd ? 1 : 2)) % 3
    choose(next)
    document.getElementById(`hero-demo-tab-${next}`)?.focus()
  }

  const progress = t === Infinity ? clamp01(clock.held / HOLD_MS) : clamp01(t / SCENE_MS)

  return (
    <figure aria-label={copy.label} className="relative">
      <div
        ref={stageRef}
        onPointerEnter={() => setHovered(true)}
        onPointerLeave={() => setHovered(false)}
        onFocus={() => setHovered(true)}
        onBlur={() => setHovered(false)}
        className={cn(styles.stage, 'relative overflow-hidden rounded-card p-3 shadow-pop sm:p-5 lg:p-6')}
      >
        <div aria-hidden="true" className={cn(styles.stageGrid, 'pointer-events-none absolute inset-0')} />

        {/* Scene tabs */}
        <div role="tablist" aria-label={copy.label} className="relative mb-3 grid grid-cols-3 gap-1 sm:mb-4 sm:flex sm:justify-center sm:gap-1.5">
          {copy.tabs.map((label, i) => {
            const Icon = SCENE_ICONS[i]
            const active = i === scene
            return (
              <button
                key={label}
                id={`hero-demo-tab-${i}`}
                type="button"
                role="tab"
                aria-selected={active}
                aria-controls="hero-demo-panel"
                tabIndex={active ? 0 : -1}
                onClick={() => choose(i)}
                onKeyDown={(e) => onTabKey(e, i)}
                className={cn(
                  'relative flex min-h-9 flex-col items-center justify-center gap-1 overflow-hidden rounded-inset px-1.5 py-1.5 text-center text-caption font-semibold leading-tight',
                  'sm:h-9 sm:flex-row sm:gap-2 sm:rounded-pill sm:px-3.5 sm:py-0 sm:text-copy',
                  'transition-[background-color,color] duration-150 ease-snappy focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-rail-focus/40',
                  active ? 'bg-white/15 text-contrast-ink' : 'text-contrast-ink/65 hover:bg-white/10 hover:text-contrast-ink',
                )}
              >
                <Icon className="size-4" aria-hidden="true" />
                {label}
                {active && !reduced && (
                  <span
                    aria-hidden="true"
                    className="absolute inset-x-3 bottom-0 h-0.5 rounded-pill bg-rail-tagline"
                    style={{ transform: `scaleX(${progress})`, transformOrigin: rtl ? 'right' : 'left' }}
                  />
                )}
              </button>
            )
          })}
        </div>

        {/* The app window */}
        <div className="relative overflow-hidden rounded-inset border border-white/10 bg-canvas text-start shadow-pop">
          <div className="flex items-center gap-1.5 border-b border-line bg-surface px-3 py-2 sm:px-4" aria-hidden="true">
            <span className="size-2.5 rounded-pill bg-line-strong" />
            <span className="size-2.5 rounded-pill bg-line-strong" />
            <span className="size-2.5 rounded-pill bg-line-strong" />
            <span dir="ltr" className="ms-3 truncate rounded-pill border border-line bg-canvas px-3 py-0.5 text-caption text-muted">{copy.address}</span>
          </div>
          <div className="flex h-[27rem] sm:h-[28rem] lg:h-[30rem]">
            <Rail items={copy.rail} active={RAIL_FOR_SCENE[scene]} />
            <div id="hero-demo-panel" role="tabpanel" aria-labelledby={`hero-demo-tab-${scene}`} className="relative min-w-0 flex-1 overflow-hidden p-3 sm:p-5">
              <p className="sr-only">{copy.describe[scene]}</p>
              <div aria-hidden="true" className="h-full">
                {scene === 0 && <RankScene copy={copy.rank} t={t} rtl={rtl} />}
                {scene === 1 && <ArticleScene copy={copy.article} t={t} />}
                {scene === 2 && <AiScene copy={copy.ai} t={t} />}
              </div>
            </div>
          </div>
        </div>
      </div>
      <figcaption className="mt-3 text-center text-caption text-muted">{copy.caption}</figcaption>
    </figure>
  )
}

function Rail({ items, active }: { items: string[]; active: number }) {
  return (
    <div className="hidden w-48 shrink-0 flex-col gap-1 bg-rail p-3 lg:flex" aria-hidden="true">
      <div className="mb-3 flex items-center gap-2 px-2 pt-1">
        <GoTopMark size={22} />
        <span dir="ltr" className="text-copy font-semibold text-rail-ink">Rankings</span>
      </div>
      {items.map((label, i) => {
        const Icon = RAIL_ICONS[i] ?? LayoutDashboard
        const on = i === active
        return (
          <div
            key={label}
            className={cn(
              'flex h-8 items-center gap-2 rounded-control px-2 text-caption font-medium transition-[background-color,color] duration-300 ease-snappy',
              on ? 'bg-rail-active text-rail-active-ink' : 'text-rail-muted',
            )}
          >
            <Icon className="size-4 shrink-0" />
            <span className="truncate">{label}</span>
          </div>
        )
      })}
    </div>
  )
}

/** The scene's closing notification. `lifted` clears a row of chips at the bottom. */
function Toast({ text, icon: Icon, style, lifted = false }: { text: string; icon: LucideIcon; style: CSSProperties; lifted?: boolean }) {
  return (
    <div className={cn('absolute inset-x-3 flex justify-center sm:inset-x-5', lifted ? 'bottom-16 sm:bottom-20' : 'bottom-3 sm:bottom-5')} style={style}>
      <div className="flex items-center gap-2.5 rounded-inset border border-line bg-surface px-3.5 py-2.5 shadow-pop">
        <span className="flex size-7 items-center justify-center rounded-pill bg-ok-soft text-ok">
          <Icon className="size-4" />
        </span>
        <span className="text-copy font-semibold text-ink">{text}</span>
      </div>
    </div>
  )
}

// ── Scene 1: a keyword climbing ───────────────────────────────────────────
const RANK_SERIES = [18, 17, 15, 12, 10, 7, 5, 3]

function RankScene({ copy, t, rtl }: { copy: HeroDemoCopy['rank']; t: number; rtl: boolean }) {
  const draw = phase(t, 250, 1900)
  const position = Math.round(copy.from + (copy.to - copy.from) * draw)
  // Chart geometry: position 1 at the top, 20 at the bottom. Time runs with the
  // reading direction, so in Hebrew the latest week is on the left.
  const W = 320, H = 120, PAD = 8
  const x = (i: number) => {
    const u = PAD + (i / (RANK_SERIES.length - 1)) * (W - PAD * 2)
    return rtl ? W - u : u
  }
  const y = (pos: number) => PAD + ((pos - 1) / 19) * (H - PAD * 2)
  const line = RANK_SERIES.map((p, i) => `${i ? 'L' : 'M'}${x(i).toFixed(1)} ${y(p).toFixed(1)}`).join(' ')
  const area = `${line} L${x(RANK_SERIES.length - 1).toFixed(1)} ${H} L${x(0).toFixed(1)} ${H} Z`
  const last = RANK_SERIES.length - 1
  return (
    <div className="flex h-full flex-col gap-3">
      <div className="flex items-center justify-between gap-2">
        <span className="text-section font-semibold text-ink">{copy.heading}</span>
        <span className="rounded-pill border border-line bg-surface px-2.5 py-0.5 text-caption text-muted">{copy.period}</span>
      </div>

      <div className="rounded-inset border border-line bg-surface p-3 shadow-card sm:p-4">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <div className="truncate text-copy font-semibold text-ink">{copy.keyword}</div>
            <div className="text-caption text-muted">{copy.positionLabel}</div>
          </div>
          <div className="flex items-center gap-2">
            <span className="text-metric font-bold tabular-nums text-ink">{position}</span>
            <span className="inline-flex h-6 items-center gap-0.5 rounded-pill bg-ok-soft px-2 text-caption font-semibold tabular-nums text-ok" style={enter(t, 1900, 300, true)}>
              <TrendingUp className="size-3.5" />
              {copy.from - copy.to}
            </span>
          </div>
        </div>
        <svg viewBox={`0 0 ${W} ${H}`} className="mt-2 h-20 w-full sm:h-24" preserveAspectRatio="none">
          {[0.25, 0.5, 0.75].map((f) => (
            <line key={f} x1="0" x2={W} y1={H * f} y2={H * f} stroke="var(--color-line)" strokeDasharray="3 4" vectorEffect="non-scaling-stroke" />
          ))}
          {/* The line draws by uncovering it in time order (a clip that grows
              from the first week), so the stroke keeps its 2.5px on any width. */}
          <defs>
            <clipPath id="hero-demo-rank-clip">
              <rect x={rtl ? W - W * draw : 0} y="0" width={W * draw} height={H} />
            </clipPath>
          </defs>
          <g clipPath="url(#hero-demo-rank-clip)">
            <path d={area} fill="var(--color-action)" opacity="0.08" />
            <path
              d={line}
              fill="none"
              stroke="var(--color-action)"
              strokeWidth="2.5"
              strokeLinecap="round"
              strokeLinejoin="round"
              vectorEffect="non-scaling-stroke"
            />
          </g>
        </svg>
        {/* The last point, outside the stretched SVG so it stays round. */}
        <div className="relative -mt-20 h-20 sm:-mt-24 sm:h-24" aria-hidden="true">
          <span
            className="absolute size-3 -translate-x-1/2 -translate-y-1/2 rounded-pill border-2 border-surface bg-action shadow-control"
            style={{ left: `${(x(last) / W) * 100}%`, top: `${(y(RANK_SERIES[last]) / H) * 100}%`, ...enter(t, 2050, 260, true) }}
          />
        </div>
      </div>

      <div className="overflow-hidden rounded-inset border border-line bg-surface">
        <div className="grid grid-cols-[1fr_auto_auto] gap-3 border-b border-line bg-sunk px-3 py-1.5 text-caption text-muted sm:px-4">
          <span>{copy.columns[0]}</span>
          <span className="w-12 text-end">{copy.columns[1]}</span>
          <span className="w-12 text-end">{copy.columns[2]}</span>
        </div>
        {copy.rows.map((row, i) => (
          <div key={row.keyword} className="grid grid-cols-[1fr_auto_auto] items-center gap-3 border-b border-line px-3 py-2 last:border-b-0 sm:px-4" style={enter(t, 500 + i * 180)}>
            <span className="truncate text-copy text-ink">{row.keyword}</span>
            <span className="w-12 text-end text-copy font-semibold tabular-nums text-ink">{Math.round(row.from + (row.to - row.from) * phase(t, 700 + i * 180, 1400))}</span>
            <span className="flex w-12 justify-end">
              <span className="inline-flex h-5 items-center gap-0.5 rounded-pill bg-ok-soft px-1.5 text-caption font-semibold tabular-nums text-ok">
                <TrendingUp className="size-3" />
                {row.from - row.to}
              </span>
            </span>
          </div>
        ))}
        <div className="flex items-center justify-between gap-3 bg-action-soft/60 px-3 py-2 sm:px-4" style={enter(t, 1100)}>
          <span className="flex items-center gap-1.5 text-copy text-ink">
            <MapPin className="size-4 text-action" />
            {copy.mapsLabel}
          </span>
          <span className="text-copy font-semibold text-action">{copy.mapsValue}</span>
        </div>
      </div>

      {t !== Infinity && <Toast text={copy.toast} icon={TrendingUp} style={enter(t, 2600, 360, true)} />}
    </div>
  )
}

// ── Scene 2: an article being written ─────────────────────────────────────
function ArticleScene({ copy, t }: { copy: HeroDemoCopy['article']; t: number }) {
  const typed = t === Infinity ? copy.title.length : Math.max(0, Math.min(copy.title.length, Math.floor((t - 250) / 32)))
  const typing = typed < copy.title.length
  const titleDone = 250 + copy.title.length * 32
  const scheduledAt = titleDone + 600 + copy.checks.length * 330 + 300
  const scheduled = t >= scheduledAt
  const BARS = [100, 94, 97, 62]
  return (
    <div className="flex h-full flex-col gap-3">
      <div className="flex items-center justify-between gap-2">
        <span className="text-section font-semibold text-ink">{copy.heading}</span>
        <span
          className={cn(
            'inline-flex h-6 items-center gap-1.5 rounded-pill px-2.5 text-caption font-semibold transition-[background-color,color] duration-300 ease-snappy',
            scheduled ? 'bg-info-soft text-info' : 'bg-sunk text-muted',
          )}
        >
          {scheduled ? <CalendarClock className="size-3.5" /> : <PenLine className="size-3.5" />}
          {scheduled ? `${copy.scheduled} · ${copy.when}` : copy.draft}
        </span>
      </div>

      <div className="grid min-h-0 flex-1 grid-cols-1 gap-3 sm:grid-cols-[1fr_12.5rem]">
        <div className="min-w-0 rounded-inset border border-line bg-surface p-3 shadow-card sm:p-4">
          <div className="min-h-12 text-section font-bold text-ink">
            {copy.title.slice(0, typed)}
            {typing && <span className={styles.caret} />}
          </div>
          <div className="mt-3 space-y-2" style={enter(t, titleDone + 100)}>
            {BARS.map((w, i) => (
              <div key={i} className="h-2 rounded-pill bg-sunk" style={{ width: `${w * phase(t, titleDone + 100 + i * 140, 500)}%` }} />
            ))}
          </div>
          <div className="mt-4 text-copy font-semibold text-ink" style={enter(t, titleDone + 700)}>{copy.subheading}</div>
          <div className="mt-2 space-y-2" style={enter(t, titleDone + 800)}>
            {[96, 88].map((w, i) => (
              <div key={i} className="h-2 rounded-pill bg-sunk" style={{ width: `${w * phase(t, titleDone + 800 + i * 140, 500)}%` }} />
            ))}
          </div>
        </div>

        <div className="hidden rounded-inset border border-line bg-surface p-3 shadow-card sm:block">
          <div className="mb-2 text-caption font-semibold text-muted">{copy.checksTitle}</div>
          <ul className="space-y-2">
            {copy.checks.map((check, i) => {
              const on = t >= titleDone + 600 + i * 330
              return (
                <li key={check} className="flex items-center gap-2 text-caption text-ink">
                  <span
                    className={cn(
                      'flex size-4 shrink-0 items-center justify-center rounded-pill transition-[background-color,color] duration-200 ease-snappy',
                      on ? 'bg-ok text-surface' : 'bg-sunk text-transparent',
                    )}
                  >
                    <Check className="size-3" strokeWidth={3} />
                  </span>
                  <span className={cn('transition-[color] duration-200', on ? 'text-ink' : 'text-muted')}>{check}</span>
                </li>
              )
            })}
          </ul>
        </div>
      </div>

      {/* Phones: the quality checks as one line of chips under the editor. */}
      <div className="flex flex-wrap gap-1.5 sm:hidden">
        {copy.checks.slice(0, 3).map((check, i) => (
          <span key={check} className="inline-flex h-6 items-center gap-1 rounded-pill bg-ok-soft px-2 text-caption font-semibold text-ok" style={enter(t, titleDone + 600 + i * 330, 260, true)}>
            <Check className="size-3" strokeWidth={3} />
            {check}
          </span>
        ))}
      </div>

      {t !== Infinity && <Toast text={copy.toast} icon={Send} style={enter(t, scheduledAt + 500, 360, true)} />}
    </div>
  )
}

// ── Scene 3: an AI answer that recommends the business ────────────────────
function AiScene({ copy, t }: { copy: HeroDemoCopy['ai']; t: number }) {
  // The answer streams word by word from 1.1s.
  const pieces = [copy.intro, ...copy.items.flatMap((it) => [it.name, it.desc])]
  const total = pieces.reduce((n, p) => n + p.split(' ').length, 0)
  const STREAM_START = 1100, PER_WORD = 45
  const shownWords = t === Infinity ? total : Math.max(0, Math.floor((t - STREAM_START) / PER_WORD))
  const answerDone = STREAM_START + total * PER_WORD
  // Each piece of the answer shows the words that fall inside the streamed
  // budget, counted from where the piece starts in the whole answer.
  const starts = pieces.map((_, i) => pieces.slice(0, i).reduce((n, p) => n + p.split(' ').length, 0))
  const shown = (i: number) => pieces[i].split(' ').slice(0, Math.max(0, shownWords - starts[i])).join(' ')
  const intro = shown(0)
  const items = copy.items.map((it, i) => ({ ...it, nameShown: shown(1 + i * 2), descShown: shown(2 + i * 2) }))
  const thinking = t !== Infinity && t >= 450 && t < STREAM_START
  return (
    <div className="flex h-full flex-col gap-3">
      <div className="flex items-center justify-between gap-2">
        <span className="text-section font-semibold text-ink">{copy.heading}</span>
        <span className="inline-flex h-6 items-center gap-1.5 rounded-pill border border-line bg-surface px-2.5 text-caption font-semibold text-body">
          <Bot className="size-3.5 text-action" />
          <span dir="ltr">{copy.engines[0]?.name}</span>
        </span>
      </div>

      <div className="flex justify-end" style={enter(t, 150)}>
        <div className="max-w-[85%] rounded-inset bg-action px-3.5 py-2 text-copy text-action-ink">{copy.question}</div>
      </div>

      <div className="min-h-0 flex-1 rounded-inset border border-line bg-surface p-3 shadow-card sm:p-4" style={enter(t, 450)}>
        {thinking ? (
          <div className="flex h-6 items-center gap-1" aria-hidden="true">
            {[0, 1, 2].map((i) => (
              <span key={i} className="size-1.5 rounded-pill bg-muted" style={{ opacity: 0.35 + 0.65 * Math.abs(Math.sin((t / 260) + i * 0.9)) }} />
            ))}
          </div>
        ) : (
          <>
            <p className="text-copy text-body">{intro}</p>
            <ol className="mt-2 space-y-1.5">
              {items.map((it, i) => (it.nameShown ? (
                <li
                  key={it.name}
                  className={cn(
                    'rounded-control px-2 py-1 text-copy transition-[background-color,box-shadow] duration-300 ease-snappy',
                    it.you && (t === Infinity || t > STREAM_START + 600) ? 'bg-action-soft ring-1 ring-action/25' : '',
                  )}
                >
                  <span className="font-semibold tabular-nums text-ink">{i + 1}. {it.nameShown}</span>
                  {it.you && it.nameShown === it.name && (
                    <span className="ms-2 inline-flex h-5 items-center gap-1 rounded-pill bg-action px-2 align-middle text-caption font-semibold text-action-ink" style={enter(t, STREAM_START + 700, 280, true)}>
                      <Sparkles className="size-3" />
                      {copy.youTag}
                    </span>
                  )}
                  {it.descShown && <span className="text-body"> {it.descShown}</span>}
                </li>
              ) : null))}
            </ol>
          </>
        )}
      </div>

      <div className="flex flex-wrap items-center gap-1.5">
        <span className="me-1 text-caption text-muted">{copy.mentionedIn}</span>
        {copy.engines.map((engine, i) => {
          const lit = engine.on && (t === Infinity || t >= answerDone + 150 + i * 150)
          return (
            <span
              key={engine.name}
              dir="ltr"
              className={cn(
                'inline-flex h-6 items-center gap-1 rounded-pill px-2 text-caption font-semibold transition-[background-color,color] duration-200 ease-snappy',
                lit ? 'bg-ok-soft text-ok' : 'bg-sunk text-muted',
              )}
            >
              {lit && <Check className="size-3" strokeWidth={3} />}
              {engine.name}
            </span>
          )
        })}
      </div>

      {t !== Infinity && <Toast text={copy.toast} icon={Sparkles} lifted style={enter(t, answerDone + 1200, 360, true)} />}
    </div>
  )
}
