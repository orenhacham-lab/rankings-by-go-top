/**
 * Video studio: the server-authoritative flag and the fixed limits. Server-only.
 *
 * OFF everywhere by default (VIDEO_STUDIO_ENABLED must be exactly 'true'), the
 * same convention as lib/gbp/config.ts. Every limit below is a COST CEILING, not
 * a preference: the model bills by the second of output video, so the duration,
 * the resolution and the number of reference images are decided here and never
 * taken from the request.
 */
export const VIDEO_MODEL = 'gemini-omni-1.2-flash'
export const VIDEO_ENDPOINT = 'https://generativelanguage.googleapis.com/v1beta/interactions'

export const MIN_SECONDS = 3
export const MAX_SECONDS = 15
export const MAX_REFERENCE_IMAGES = 6
export const MAX_PROMPT_CHARS = 800
/** The only resolution sold. 1080p and 4K cost 1.5x and 3x per second. */
export const RESOLUTION = '720p' as const
export const ASPECT_RATIOS = ['9:16', '16:9'] as const
export type AspectRatio = (typeof ASPECT_RATIOS)[number]

export function isVideoStudioEnabled(): boolean {
  return process.env.VIDEO_STUDIO_ENABLED === 'true'
}
