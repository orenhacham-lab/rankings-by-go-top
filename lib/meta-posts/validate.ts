/**
 * What a Facebook or Instagram post may contain, checked on the server (the only
 * check that counts) and usable by the composer's counter. Pure.
 */
import { countPostChars, clampPostText, isSameSite } from '@/lib/gbp/validate'

export const META_BODY_MAX = 2200
export const META_URL_MAX = 2048
export const META_TARGETS = ['facebook', 'instagram'] as const
export const META_POST_LANGUAGES = ['he', 'en', 'es', 'pt-BR', 'fr', 'it', 'ja', 'de', 'nl', 'pl', 'ko'] as const
export type MetaPostLanguage = typeof META_POST_LANGUAGES[number]

export function normalizeMetaLanguage(v: unknown): MetaPostLanguage | null {
  return typeof v === 'string' && (META_POST_LANGUAGES as readonly string[]).includes(v) ? (v as MetaPostLanguage) : null
}

export type MetaValidationCode =
  | 'body_empty' | 'body_too_long' | 'target_required' | 'target_invalid'
  | 'instagram_needs_image' | 'instagram_unavailable'
  | 'link_invalid' | 'link_not_https' | 'link_other_site' | 'link_too_long'
  | 'schedule_invalid' | 'schedule_in_past' | 'schedule_too_far'

export { countPostChars, clampPostText }

const MIN_LEAD_MS = 5 * 60 * 1000
const MAX_AHEAD_MS = 365 * 24 * 60 * 60 * 1000

export function validateBody(raw: unknown): { ok: true; body: string } | { ok: false; code: 'body_empty' | 'body_too_long' } {
  const body = typeof raw === 'string' ? raw.trim() : ''
  const n = countPostChars(body)
  if (n === 0) return { ok: false, code: 'body_empty' }
  if (n > META_BODY_MAX) return { ok: false, code: 'body_too_long' }
  return { ok: true, body }
}

export interface MetaPostInput {
  body: unknown
  targets: unknown
  link?: unknown
  siteUrl: string | null
  /** The photo, already rebuilt by the server from the project's own article. */
  imageUrl: string | null
  hasInstagram: boolean
  scheduledAt?: unknown
  now?: Date
}
export interface MetaPostChecked { body: string; targets: Array<typeof META_TARGETS[number]>; link: string | null; scheduledAt: string | null }

export function validatePost(input: MetaPostInput): { ok: true; value: MetaPostChecked } | { ok: false; errors: MetaValidationCode[] } {
  const errors: MetaValidationCode[] = []
  const b = validateBody(input.body)
  if (!b.ok) errors.push(b.code)

  const targets: Array<typeof META_TARGETS[number]> = []
  if (!Array.isArray(input.targets) || input.targets.length === 0) errors.push('target_required')
  else for (const t of input.targets) {
    if (!(META_TARGETS as readonly unknown[]).includes(t)) { errors.push('target_invalid'); break }
    if (!targets.includes(t as typeof META_TARGETS[number])) targets.push(t as typeof META_TARGETS[number])
  }
  if (targets.includes('instagram')) {
    if (!input.hasInstagram) errors.push('instagram_unavailable')
    else if (!input.imageUrl) errors.push('instagram_needs_image')
  }

  let link: string | null = null
  const rawLink = typeof input.link === 'string' && input.link.trim() ? input.link.trim() : null
  if (rawLink) {
    let u: URL | null = null
    try { u = new URL(rawLink) } catch { u = null }
    if (rawLink.length > META_URL_MAX) errors.push('link_too_long')
    else if (!u || !u.hostname || u.username || u.password || /\s/.test(rawLink)) errors.push('link_invalid')
    else if (u.protocol !== 'https:') errors.push('link_not_https')
    else if (!isSameSite(u.href, input.siteUrl)) errors.push('link_other_site')
    else link = u.href
  }

  let scheduledAt: string | null = null
  if (input.scheduledAt) {
    const t = typeof input.scheduledAt === 'string' ? Date.parse(input.scheduledAt) : NaN
    const now = (input.now ?? new Date()).getTime()
    if (!Number.isFinite(t)) errors.push('schedule_invalid')
    else if (t < now + MIN_LEAD_MS) errors.push('schedule_in_past')
    else if (t > now + MAX_AHEAD_MS) errors.push('schedule_too_far')
    else scheduledAt = new Date(t).toISOString()
  }
  if (errors.length > 0 || !b.ok) return { ok: false, errors }
  return { ok: true, value: { body: b.body, targets, link, scheduledAt } }
}
