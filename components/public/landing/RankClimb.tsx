/**
 * "The rank climb": the public site's one signature element (wave 8, UX
 * decision D). A stepped cobalt polyline that climbs from position 18 to
 * position 3, in horizontal steps (never a smooth curve), with a chip at its
 * end, "#3 on Google". It comes from what the product does, and it is used in
 * exactly three places:
 *   HeroClimb  behind the home hero's headline, at 12% opacity, drawn once;
 *   FlowClimb  the connector of the four-step "how it works" flow, drawn as
 *              the section scrolls in (it reads the Flow frame's data-flow);
 *   CtaClimb   faint in the closing band, still.
 *
 * Server components with no state: the SVG is whole at rest, and the draw is a
 * CSS enhancement inside prefers-reduced-motion: no-preference
 * (landing.module.css). Time runs with the reading direction, so in Hebrew the
 * line climbs from right to left: the SVG mirrors, and the HTML chip and dots
 * are placed with logical (start/end) offsets. Decoration only (aria-hidden).
 */
import { cn } from '@/lib/utils'
import styles from './landing.module.css'

/** The positions the climb passes through, 18 → 3. */
const HERO_RANKS = [18, 15, 12, 9, 7, 5, 3]

/** A stepped path through `levels` (0..1 of the height, top = 0) across `width`. */
function steppedPath(levels: number[], x0: number, x1: number, height: number): string {
  const step = (x1 - x0) / levels.length
  let d = `M${x0} ${(levels[0] * height).toFixed(1)}`
  levels.forEach((lv, i) => {
    if (i > 0) d += ` V${(lv * height).toFixed(1)}`
    d += ` H${(x0 + step * (i + 1)).toFixed(1)}`
  })
  return d
}

// Hero geometry: a 1200×640 box stretched over the hero (preserveAspectRatio none,
// non-scaling stroke). Position 18 sits low at the start, position 3 near the top end.
const HERO_TOP = 0.19
const HERO_BOTTOM = 0.88
const heroLevel = (rank: number) => HERO_TOP + ((rank - 3) / 15) * (HERO_BOTTOM - HERO_TOP)
const HERO_PATH = steppedPath(HERO_RANKS.map(heroLevel), 0, 1140, 640)
const HERO_END_X = `${((1200 - 1140) / 1200) * 100}%`
const HERO_END_Y = `${HERO_TOP * 100}%`

export function HeroClimb({ chip }: { chip: string }) {
  return (
    <div aria-hidden="true" className="pointer-events-none absolute inset-0" data-rank-climb="hero">
      <svg viewBox="0 0 1200 640" preserveAspectRatio="none" className="absolute inset-0 size-full opacity-[0.12] rtl:-scale-x-100">
        <path
          d={HERO_PATH}
          pathLength={1}
          fill="none"
          stroke="var(--color-rail-tagline)"
          strokeWidth={4}
          strokeLinejoin="round"
          className={cn(styles.climbPath, styles.climbDraw)}
        />
      </svg>
      <span
        className={cn(styles.climbPop, 'absolute hidden size-3 -translate-y-1/2 rounded-pill bg-rail-tagline shadow-[0_0_0_6px_rgb(127_195_255/0.18)] ltr:translate-x-1/2 rtl:-translate-x-1/2 lg:block')}
        style={{ insetInlineEnd: HERO_END_X, top: HERO_END_Y }}
      />
      <span
        className={cn(styles.climbPop, 'absolute hidden -translate-y-[calc(100%+14px)] items-center gap-1.5 whitespace-nowrap rounded-pill bg-white/10 px-3 py-1 text-caption font-semibold text-contrast-ink ring-1 ring-white/20 backdrop-blur-sm lg:inline-flex')}
        style={{ insetInlineEnd: `calc(${HERO_END_X} - 1rem)`, top: HERO_END_Y }}
      >
        <span className="size-1.5 rounded-pill bg-ok" />
        {chip}
      </span>
    </div>
  )
}

// Flow geometry: four nodes at the column centres (12.5%, 37.5%, 62.5%, 87.5%),
// one step up between each: positions 18, 12, 7, 3.
const FLOW_RANKS = [18, 12, 7, 3]
const FLOW_LEVELS = [0.84, 0.6, 0.36, 0.12]
const FLOW_PATH = `M125 ${FLOW_LEVELS[0] * 120} H250 V${FLOW_LEVELS[1] * 120} H500 V${FLOW_LEVELS[2] * 120} H750 V${FLOW_LEVELS[3] * 120} H875`

export function FlowClimb({ chip }: { chip: string }) {
  return (
    <div aria-hidden="true" className="pointer-events-none relative hidden h-32 lg:block" data-rank-climb="flow">
      <svg viewBox="0 0 1000 120" preserveAspectRatio="none" className="absolute inset-0 size-full rtl:-scale-x-100">
        <path d={FLOW_PATH} fill="none" stroke="var(--color-line-strong)" strokeWidth={2} strokeDasharray="4 6" vectorEffect="non-scaling-stroke" />
        <path
          d={FLOW_PATH}
          pathLength={1}
          fill="none"
          stroke="var(--color-action)"
          strokeWidth={3}
          strokeLinejoin="round"
          className={cn(styles.climbPath, styles.climbFlow)}
        />
      </svg>
      {FLOW_RANKS.map((rank, i) => (
        <span
          key={rank}
          className={cn(styles.climbDot, 'absolute flex -translate-y-1/2 items-center gap-1.5 ltr:-translate-x-1/2 rtl:translate-x-1/2')}
          style={{ insetInlineStart: `${12.5 + i * 25}%`, top: `${FLOW_LEVELS[i] * 100}%`, '--node-delay': `${300 + i * 420}ms` } as React.CSSProperties}
        >
          <span className="size-3 rounded-pill bg-action shadow-[0_0_0_5px_var(--color-canvas)]" />
        </span>
      ))}
      {FLOW_RANKS.slice(0, 3).map((rank, i) => (
        <span
          key={`n${rank}`}
          className={cn(styles.climbDot, 'absolute translate-y-2 text-caption font-semibold tabular-nums text-muted ltr:-translate-x-1/2 rtl:translate-x-1/2')}
          style={{ insetInlineStart: `${12.5 + i * 25}%`, top: `${FLOW_LEVELS[i] * 100}%`, '--node-delay': `${300 + i * 420}ms` } as React.CSSProperties}
        >
          {rank}
        </span>
      ))}
      <span
        className={cn(styles.climbDot, 'absolute inline-flex -translate-y-[calc(100%+12px)] items-center gap-1.5 whitespace-nowrap rounded-pill bg-contrast px-3 py-1 text-caption font-semibold text-contrast-ink shadow-card ltr:-translate-x-1/2 rtl:translate-x-1/2')}
        style={{ insetInlineStart: '87.5%', top: `${FLOW_LEVELS[3] * 100}%`, '--node-delay': '1700ms' } as React.CSSProperties}
      >
        <span className="size-1.5 rounded-pill bg-ok" />
        {chip}
      </span>
    </div>
  )
}

/** The faint, still climb behind the closing band. */
export function CtaClimb() {
  return (
    <svg aria-hidden="true" viewBox="0 0 1200 640" preserveAspectRatio="none" className="pointer-events-none absolute inset-0 size-full opacity-[0.1] rtl:-scale-x-100" data-rank-climb="cta">
      <path d={HERO_PATH} fill="none" stroke="var(--color-rail-tagline)" strokeWidth={3} strokeLinejoin="round" vectorEffect="non-scaling-stroke" />
    </svg>
  )
}
