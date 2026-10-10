/**
 * The in-app "free demo" button (components/guide/DemoFloatApp.tsx) floats in the
 * screen's end corner. The app's bottom bars sit in that same corner: the
 * research summary's "Ready to start?" bar, whose "Start" button the pill
 * covered (owner's report of 10 October 2026), a settings card's save row, the
 * article editor's save bar, keyword research's bulk bar. Each of them carries
 * `data-float-clear`, and the pill rises above whichever of them is under it,
 * then settles back when the bar scrolls away.
 *
 * Pure: no React, no DOM (lib/shell/__qa__/float-clearance.qa.ts).
 */
export interface FloatBox { left: number; top: number; width: number; height: number }

/** The marker a bottom bar carries so the floating button never sits on it. */
export const FLOAT_CLEAR_ATTR = 'data-float-clear'
/** Space kept between the bar's top edge and the floating button. */
export const FLOAT_GAP = 12

/**
 * How many pixels the button rises from its resting place (`rest`, its box with
 * no lift) so that it overlaps none of `bars`. A bar that does not reach the
 * button's column, or lies wholly above it, moves nothing. Bars higher than the
 * button's rest spot push it as far as their top edge, so the tallest wins.
 */
export function floatLift(rest: FloatBox, bars: readonly FloatBox[], gap = FLOAT_GAP): number {
  let lift = 0
  const restBottom = rest.top + rest.height
  for (const b of bars) {
    if (b.width <= 0 || b.height <= 0) continue
    const sameColumn = b.left < rest.left + rest.width && rest.left < b.left + b.width
    const reaches = b.top < restBottom && b.top + b.height > rest.top - gap
    if (sameColumn && reaches) lift = Math.max(lift, restBottom - b.top + gap)
  }
  return Math.max(0, Math.round(lift))
}
