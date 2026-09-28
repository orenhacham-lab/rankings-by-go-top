/**
 * The Go Top mark's geometry, shared by the inline SVG (GoTopMark.tsx) and the
 * icon files rendered from it (scripts/brand/icons.ts), so the sidebar mark and
 * the favicon can never drift apart.
 *
 * Traced from the raster in /public (gotop-primary.png): a light-blue arrowhead
 * that dissolves into pixels, without the "GO TOP / DIGITAL MARKETING" lettering.
 * The original is built on a 45° lattice, and so is this: inside MARK_TRANSFORM,
 * x runs down-right and y down-left from the apex, so the solid arrowhead is an
 * L-shape and every pixel is one lattice cell.
 */

/** The Go Top light blue, sampled from the mark. Also `--color-brand`. */
export const BRAND_BLUE = '#0086F5'
/** The rail's navy, the ground of the app icon. Also `--color-rail`. */
export const BRAND_NAVY = '#0A1B3D'

const CELL = 6
const GAP = 0.9

/** The solid arrowhead: arms 4 cells thick and 6 cells long. */
export const MARK_SOLID = 'M0 0H36V24H24V36H0Z'

/**
 * The pixels the arms dissolve into, as [along the arm, across it] in cells for
 * the down-right arm. The down-left arm is the same set with the two swapped, so
 * the mark is symmetric.
 */
export const MARK_PIXELS: readonly (readonly [number, number])[] = [
  [6, 0], [6, 1], [6, 3],
  [7, -1], [7, 2],
  [8, 0], [8, 3],
  [9, 1],
  [10, -1], [10, 3],
]

/** Stands the lattice on its point, centred in a 100×100 box. */
export const MARK_TRANSFORM = 'translate(50 17) rotate(45)'

/** Every pixel as a square, in the lattice. */
export function markCells(): { x: number; y: number; size: number }[] {
  const out: { x: number; y: number; size: number }[] = []
  for (const [along, across] of MARK_PIXELS) {
    out.push({ x: along * CELL + GAP / 2, y: across * CELL + GAP / 2, size: CELL - GAP })
    out.push({ x: across * CELL + GAP / 2, y: along * CELL + GAP / 2, size: CELL - GAP })
  }
  return out
}

/** The mark's shapes as SVG markup (for the icon files; the component renders JSX). */
export function markShapes(fill: string): string {
  const rects = markCells().map((c) => `<rect x="${c.x}" y="${c.y}" width="${c.size}" height="${c.size}"/>`).join('')
  return `<g transform="${MARK_TRANSFORM}" fill="${fill}"><path d="${MARK_SOLID}"/>${rects}</g>`
}

/**
 * The app icon: the mark on the navy with 22% corners, the mark scaled to 80% and
 * centred, so it keeps a margin inside the rounded square.
 */
export function appIconSvg(): string {
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100">`
    + `<rect width="100" height="100" rx="22" fill="${BRAND_NAVY}"/>`
    + `<g transform="translate(10 11) scale(0.8)">${markShapes(BRAND_BLUE)}</g>`
    + `</svg>`
}
