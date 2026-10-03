/**
 * Where a tour bubble goes, given the target's box and the viewport. Pure, so
 * the placement is tested for both directions and for a phone's width without a
 * browser (lib/guide/__qa__/guide-tours.qa.ts).
 *
 * Desktop: beside the target on its inline-END side when the target is an entry
 * of the side rail (the sidebar), otherwise under it, then over it,
 * then beside it; the bubble is aligned to the target's inline-START edge and
 * kept inside the viewport. "Start" and "end" follow the direction: in Hebrew the
 * sidebar is on the right, so its bubbles open to the LEFT of it.
 *
 * Phone: a sheet across the bottom of the screen, or across the top when the
 * target is down there, so the bubble never covers what it is pointing at.
 */
export interface Box { left: number; top: number; width: number; height: number }
export interface Viewport { width: number; height: number }
export type Dir = 'rtl' | 'ltr'

export const BUBBLE_WIDTH = 320
export const PHONE_MAX = 767
const GAP = 12
const EDGE = 16

export type Placement =
  | { mode: 'anchored'; left: number; top: number; width: number; side: 'below' | 'above' | 'beside' }
  | { mode: 'sheet'; edge: 'bottom' | 'top' }
  | { mode: 'center' }

const clamp = (v: number, lo: number, hi: number) => Math.max(lo, Math.min(v, Math.max(lo, hi)))

export function placeBubble(target: Box | null, bubbleHeight: number, vp: Viewport, dir: Dir, inSideRail = false): Placement {
  const phone = vp.width <= PHONE_MAX
  if (phone) {
    if (!target) return { mode: 'sheet', edge: 'bottom' }
    const sheetTop = vp.height - bubbleHeight - EDGE
    return { mode: 'sheet', edge: target.top + target.height > sheetTop - GAP ? 'top' : 'bottom' }
  }
  if (!target) return { mode: 'center' }

  const width = Math.min(BUBBLE_WIDTH, vp.width - 2 * EDGE)
  const right = target.left + target.width
  const bottom = target.top + target.height
  const alignedLeft = clamp(dir === 'rtl' ? right - width : target.left, EDGE, vp.width - width - EDGE)

  const below = { side: 'below' as const, left: alignedLeft, top: bottom + GAP }
  const above = { side: 'above' as const, left: alignedLeft, top: target.top - GAP - bubbleHeight }
  const besideLeft = dir === 'rtl' ? target.left - GAP - width : right + GAP
  const beside = {
    side: 'beside' as const,
    left: besideLeft,
    top: clamp(target.top + target.height / 2 - 40, EDGE, vp.height - bubbleHeight - EDGE),
  }

  const fits = (c: { left: number; top: number }) =>
    c.left >= EDGE - 0.5 && c.left + width <= vp.width - EDGE + 0.5 && c.top >= EDGE - 0.5 && c.top + bubbleHeight <= vp.height - EDGE + 0.5

  // An entry of the side rail reads best with the bubble beside it: under it, the
  // bubble would cover the entries that follow.
  const order = inSideRail ? [beside, below, above] : [below, above, beside]
  const pick = order.find(fits)
  if (pick) return { mode: 'anchored', width, ...pick }
  // Nothing fits cleanly (a very tall target): under it, pulled back into view.
  return { mode: 'anchored', width, side: 'below', left: alignedLeft, top: clamp(bottom + GAP, EDGE, vp.height - bubbleHeight - EDGE) }
}
