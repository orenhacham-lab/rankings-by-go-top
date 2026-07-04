/**
 * Article-brief validation & sanitization (Phase 2A).
 *
 * Server-side source of truth for validating a manual Article Brief / Topic
 * before it is written to article_topics. Also validates and normalizes the
 * anchors array so only known fields are persisted. NO anchor-placement checks
 * here — that belongs to generation (Phase 3).
 */

export const SEARCH_INTENTS = [
  'informational',
  'commercial',
  'local',
  'comparison',
  'transactional',
  'other',
] as const
export type SearchIntent = (typeof SEARCH_INTENTS)[number]

export const TOPIC_STATUSES = ['suggested', 'approved', 'rejected', 'used'] as const
export type TopicStatus = (typeof TOPIC_STATUSES)[number]

export type AnchorType = 'internal' | 'external'

export interface ArticleAnchor {
  anchor_text: string
  target_url: string
  required: boolean
  type: AnchorType
  note: string
}

export interface TopicBriefInput {
  projectId?: string
  topic?: string
  primary_keyword?: string | null
  secondary_keywords?: unknown
  search_intent?: string | null
  target_audience?: string | null
  language?: string | null
  tone_of_voice?: string | null
  desired_word_count?: number | null
  cta_preference?: string | null
  brief_notes?: string | null
  anchors?: unknown
}

export interface ValidatedTopicBrief {
  topic: string
  primary_keyword: string | null
  secondary_keywords: string[]
  search_intent: string | null
  target_audience: string | null
  language: string | null
  tone_of_voice: string | null
  desired_word_count: number | null
  cta_preference: string | null
  brief_notes: string | null
  anchors_json: ArticleAnchor[]
}

const MAX_ANCHORS = 30
const MAX_SECONDARY_KEYWORDS = 30

// Hosts that are never valid public anchor targets.
const BLOCKED_HOSTS = new Set(['localhost', '127.0.0.1', '0.0.0.0', 'example.com', 'www.example.com', 'example.org', 'example.net'])

/**
 * A usable public http(s) URL. Percent-encoding / encoded characters are FINE
 * (new URL parses them). We only reject: non-http(s), whitespace inside the URL,
 * unparseable URLs, and placeholder hosts (localhost / example.com).
 */
function isHttpUrl(value: string): boolean {
  const v = (value || '').trim()
  if (!v || /\s/.test(v)) return false // no spaces/whitespace inside a URL
  let u: URL
  try {
    u = new URL(v)
  } catch {
    return false
  }
  if (u.protocol !== 'http:' && u.protocol !== 'https:') return false
  const host = u.hostname.toLowerCase()
  if (BLOCKED_HOSTS.has(host) || host.endsWith('.example.com')) return false
  return true
}

function str(v: unknown): string {
  return typeof v === 'string' ? v.trim() : ''
}

/**
 * Validate + normalize the anchors array. Drops unknown fields; enforces
 * per-anchor rules. Returns { anchors } or { error } on the first hard failure.
 */
export function validateAnchors(raw: unknown): { anchors: ArticleAnchor[] } | { error: string } {
  if (raw === undefined || raw === null) return { anchors: [] }
  if (!Array.isArray(raw)) return { error: 'anchors must be an array' }
  if (raw.length > MAX_ANCHORS) return { error: `too many anchors (max ${MAX_ANCHORS})` }

  const anchors: ArticleAnchor[] = []
  for (const item of raw) {
    if (!item || typeof item !== 'object') return { error: 'each anchor must be an object' }
    const o = item as Record<string, unknown>
    const anchor_text = str(o.anchor_text)
    const target_url = str(o.target_url)

    // Skip fully-empty rows (user added a row but left it blank).
    if (!anchor_text && !target_url) continue

    if (target_url && !isHttpUrl(target_url)) {
      return { error: `invalid anchor target_url: ${target_url.slice(0, 80)}` }
    }
    if (target_url && !anchor_text) {
      return { error: 'anchor_text is required when target_url is set' }
    }

    const type: AnchorType = o.type === 'external' ? 'external' : 'internal'
    const required = o.required === true

    anchors.push({
      anchor_text,
      target_url,
      required,
      type,
      note: str(o.note),
    })
  }
  return { anchors }
}

/**
 * Validate a full brief for create/update. Returns the normalized row fields
 * (without project_id/user_id/status, which the route sets) or an error.
 */
export function validateTopicBrief(input: TopicBriefInput): { value: ValidatedTopicBrief } | { error: string } {
  const topic = str(input.topic)
  if (!topic) return { error: 'topic is required' }

  const search_intent = input.search_intent ? str(input.search_intent) : ''
  if (search_intent && !(SEARCH_INTENTS as readonly string[]).includes(search_intent)) {
    return { error: `invalid search_intent (allowed: ${SEARCH_INTENTS.join(', ')})` }
  }

  let secondary_keywords: string[] = []
  if (input.secondary_keywords !== undefined && input.secondary_keywords !== null) {
    if (!Array.isArray(input.secondary_keywords)) return { error: 'secondary_keywords must be an array' }
    secondary_keywords = input.secondary_keywords
      .map((k) => str(k))
      .filter(Boolean)
      .slice(0, MAX_SECONDARY_KEYWORDS)
  }

  let desired_word_count: number | null = null
  if (input.desired_word_count !== undefined && input.desired_word_count !== null && input.desired_word_count !== ('' as unknown)) {
    const n = Number(input.desired_word_count)
    if (!Number.isFinite(n) || n <= 0) return { error: 'desired_word_count must be a positive number' }
    desired_word_count = Math.floor(n)
  }

  const anchorsResult = validateAnchors(input.anchors)
  if ('error' in anchorsResult) return { error: anchorsResult.error }

  return {
    value: {
      topic,
      primary_keyword: str(input.primary_keyword) || null,
      secondary_keywords,
      search_intent: search_intent || null,
      target_audience: str(input.target_audience) || null,
      language: str(input.language) || null,
      tone_of_voice: str(input.tone_of_voice) || null,
      desired_word_count,
      cta_preference: str(input.cta_preference) || null,
      brief_notes: str(input.brief_notes) || null,
      anchors_json: anchorsResult.anchors,
    },
  }
}
