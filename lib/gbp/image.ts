/**
 * The post photo: whatever the merchant picked, cropped to the area they chose
 * and written as a 1200×900 JPEG (4:3). That size is above Google's
 * recommended 720 px and minimum 250 px, and the file lands well inside the
 * 10 KB – 5 MB window (research.md, "Upload media"). The composer crops in the
 * browser for the preview; this server step is the one that counts. EXIF
 * (location, camera) is dropped. Server-only (sharp).
 */
import sharp from 'sharp'

export const GBP_IMAGE_WIDTH = 1200
export const GBP_IMAGE_HEIGHT = 900
export const GBP_IMAGE_MIN_BYTES = 10 * 1024
export const GBP_IMAGE_MAX_BYTES = 5 * 1024 * 1024
/** Upload limit for the source file (it is re-encoded, so it may be larger than Google's 5 MB). */
export const GBP_SOURCE_MAX_BYTES = 12 * 1024 * 1024
/** The crop may be upscaled at most 2.5× to reach 1200 wide. */
export const GBP_CROP_MIN_WIDTH = 480
export const GBP_SOURCE_TYPES = ['image/jpeg', 'image/png', 'image/webp'] as const

export interface CropBox { x: number; y: number; w: number }

export type ImageResult =
  | { ok: true; bytes: Buffer; width: number; height: number }
  | { ok: false; code: 'image_invalid' | 'image_too_small' }

const clamp01 = (n: unknown, d: number) => (typeof n === 'number' && Number.isFinite(n) ? Math.min(1, Math.max(0, n)) : d)

/**
 * Resolve a normalized crop (x, y, width as fractions of the source) to a 4:3
 * pixel box inside the image. Anything missing or odd falls back to the largest
 * centred 4:3 box.
 */
export function resolveCrop(srcW: number, srcH: number, crop?: Partial<CropBox> | null): { left: number; top: number; width: number; height: number } {
  const maxW = Math.min(srcW, Math.floor((srcH * 4) / 3))
  let width = crop && typeof crop.w === 'number' ? Math.round(clamp01(crop.w, 1) * srcW) : maxW
  width = Math.max(1, Math.min(width, maxW))
  const height = Math.min(srcH, Math.round((width * 3) / 4))
  const defLeft = (srcW - width) / 2 / srcW
  const defTop = (srcH - height) / 2 / srcH
  const left = Math.round(Math.min(srcW - width, Math.max(0, clamp01(crop?.x, defLeft) * srcW)))
  const top = Math.round(Math.min(srcH - height, Math.max(0, clamp01(crop?.y, defTop) * srcH)))
  return { left, top, width, height }
}

export async function preparePostImage(input: Buffer, crop?: Partial<CropBox> | null): Promise<ImageResult> {
  if (input.length === 0 || input.length > GBP_SOURCE_MAX_BYTES) return { ok: false, code: 'image_invalid' }
  let meta: Awaited<ReturnType<ReturnType<typeof sharp>['metadata']>>
  let oriented: Buffer
  try {
    // Apply EXIF orientation first, so the crop matches what the merchant saw.
    oriented = await sharp(input, { failOn: 'error', limitInputPixels: 60_000_000 }).rotate().toBuffer()
    meta = await sharp(oriented).metadata()
  } catch {
    return { ok: false, code: 'image_invalid' }
  }
  if (!meta.width || !meta.height || !['jpeg', 'png', 'webp'].includes(meta.format ?? '')) return { ok: false, code: 'image_invalid' }
  const box = resolveCrop(meta.width, meta.height, crop)
  if (box.width < GBP_CROP_MIN_WIDTH) return { ok: false, code: 'image_too_small' }
  let bytes: Buffer
  try {
    bytes = await sharp(oriented)
      .extract(box)
      .resize(GBP_IMAGE_WIDTH, GBP_IMAGE_HEIGHT, { fit: 'cover' })
      .flatten({ background: '#ffffff' })
      .jpeg({ quality: 85, mozjpeg: true })
      .toBuffer()
  } catch {
    return { ok: false, code: 'image_invalid' }
  }
  if (bytes.length < GBP_IMAGE_MIN_BYTES || bytes.length > GBP_IMAGE_MAX_BYTES) {
    // A flat single-colour image can compress under 10 KB; re-encode at full quality once.
    try { bytes = await sharp(bytes).jpeg({ quality: 100 }).toBuffer() } catch { return { ok: false, code: 'image_invalid' } }
    if (bytes.length < GBP_IMAGE_MIN_BYTES || bytes.length > GBP_IMAGE_MAX_BYTES) return { ok: false, code: 'image_invalid' }
  }
  return { ok: true, bytes, width: GBP_IMAGE_WIDTH, height: GBP_IMAGE_HEIGHT }
}
