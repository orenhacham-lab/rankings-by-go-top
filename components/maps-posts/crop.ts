/**
 * The 4:3 crop the merchant sets with zoom and two position sliders, as
 *   - the normalized box the server cuts (lib/gbp/image.ts resolveCrop), and
 *   - the style that shows exactly that box in a 4:3 frame.
 * Pure, so the two can be checked against each other.
 */
export interface CropControls { zoom: number; px: number; py: number }

export function cropBox(srcW: number, srcH: number, c: CropControls): { x: number; y: number; w: number; wPx: number; hPx: number; xPx: number; yPx: number } {
  const zoom = Math.min(3, Math.max(1, c.zoom))
  const maxW = Math.min(srcW, (srcH * 4) / 3)
  const wPx = maxW / zoom
  const hPx = (wPx * 3) / 4
  const xPx = Math.min(1, Math.max(0, c.px)) * (srcW - wPx)
  const yPx = Math.min(1, Math.max(0, c.py)) * (srcH - hPx)
  return { x: xPx / srcW, y: yPx / srcH, w: wPx / srcW, wPx, hPx, xPx, yPx }
}

/** Absolute positioning (percent of the 4:3 frame) that shows the crop box. */
export function cropStyle(srcW: number, srcH: number, c: CropControls): { width: string; height: string; left: string; top: string } {
  const b = cropBox(srcW, srcH, c)
  return {
    width: `${(srcW / b.wPx) * 100}%`,
    height: `${(srcH / b.hPx) * 100}%`,
    left: `${(-b.xPx / b.wPx) * 100}%`,
    top: `${(-b.yPx / b.hPx) * 100}%`,
  }
}
