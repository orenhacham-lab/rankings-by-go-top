/**
 * The business owner's own word on how its articles are written, kept per
 * project and read by every article generation (lib/content/article-generation.ts):
 *
 *   instructions  standing instructions in their own words ("write in the first
 *                 person plural", "never mention prices")
 *   exclusions    what the business does NOT sell or do, so an article never
 *                 offers it ("pipe repairs", "deliveries outside the centre")
 *   rules         notes the owner left on an article for the articles that
 *                 follow ("the warranty is 2 years, not 1"): each becomes a
 *                 standing rule, shown and editable in the settings
 *
 * Stored as project_article_styles.writing_guidance
 * (supabase/migrations/20261005200000_project_writing_guidance.sql), whose CHECK
 * is the database's copy of GUIDANCE_LIMITS and the key lists below.
 *
 * EMPTY UNTIL THE OWNER WRITES SOMETHING. No row, no column yet, '{}' or an
 * invalid stored value: no guidance, and the prompt is exactly as before.
 *
 * Plain text only: tags and control characters are removed, lengths are capped.
 * The text goes into the owner's OWN articles' prompt, fenced and quoted, under
 * the generator's accuracy rules, never above them.
 *
 * Pure: no I/O, safe in the browser and on the server.
 */

export type WritingRule = {
  text: string
  /** ISO time the rule was added. */
  at: string
  /** The article the note was left on, when it came from one. */
  articleId: string | null
}

export type WritingGuidance = {
  /**
   * Name the business in the articles the system writes (E-E-A-T). On unless the
   * owner switched it off; a choice made in a topic's brief form still wins.
   */
  mentionBusiness: boolean
  instructions: string
  exclusions: string[]
  rules: WritingRule[]
}

export const GUIDANCE_LIMITS = {
  instructions: 2000,
  exclusion: 120,
  exclusions: 20,
  rule: 300,
  rules: 30,
} as const

export const EMPTY_GUIDANCE: WritingGuidance = Object.freeze({ mentionBusiness: true, instructions: '', exclusions: [], rules: [] }) as unknown as WritingGuidance

const CONTROL_EXCEPT_NEWLINE = /[\u0000-\u0009\u000b-\u001f\u007f‎‏‪-‮⁦-⁩]/g
const CONTROL = /[\u0000-\u001f\u007f‎‏‪-‮⁦-⁩]/g
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

/** One line: no tags, no control or direction-override characters, single spaces, capped. */
export function cleanLine(input: unknown, max: number): string {
  if (typeof input !== 'string') return ''
  return input.replace(/<[^>]*>?/g, ' ').replace(CONTROL, ' ').replace(/\s+/g, ' ').trim().slice(0, max).trim()
}

/** Several lines: the same cleaning, but line breaks stay (at most one empty line in a row). */
export function cleanText(input: unknown, max: number): string {
  if (typeof input !== 'string') return ''
  return input
    .replace(/\r\n?/g, '\n')
    .replace(/<[^>]*>?/g, ' ')
    .replace(CONTROL_EXCEPT_NEWLINE, ' ')
    .split('\n').map((l) => l.replace(/[^\S\n]+/g, ' ').trim()).join('\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim()
    .slice(0, max)
    .trim()
}

/** A list of short lines, cleaned, empty and repeated entries (case-insensitive) dropped, capped. */
function cleanList(input: unknown, each: number, max: number): string[] {
  if (!Array.isArray(input)) return []
  const out: string[] = []
  const seen = new Set<string>()
  for (const item of input) {
    const s = cleanLine(item, each)
    const key = s.toLocaleLowerCase()
    if (!s || seen.has(key)) continue
    seen.add(key)
    out.push(s)
    if (out.length >= max) break
  }
  return out
}

function cleanRule(input: unknown): WritingRule | null {
  if (!input || typeof input !== 'object' || Array.isArray(input)) return null
  const v = input as Record<string, unknown>
  const text = cleanLine(v.text, GUIDANCE_LIMITS.rule)
  if (!text) return null
  const atRaw = typeof v.at === 'string' ? v.at : ''
  const at = atRaw && !Number.isNaN(Date.parse(atRaw)) ? new Date(atRaw).toISOString() : new Date(0).toISOString()
  const idRaw = v.articleId ?? v.article_id
  return { text, at, articleId: typeof idRaw === 'string' && UUID.test(idRaw) ? idRaw.toLowerCase() : null }
}

function cleanRules(input: unknown): WritingRule[] {
  if (!Array.isArray(input)) return []
  const out: WritingRule[] = []
  const seen = new Set<string>()
  for (const item of input) {
    const r = cleanRule(item)
    if (!r || seen.has(r.text.toLocaleLowerCase())) continue
    seen.add(r.text.toLocaleLowerCase())
    out.push(r)
    if (out.length >= GUIDANCE_LIMITS.rules) break
  }
  return out
}

/** A stored value (or anything) → guidance. Lenient: whatever is not valid is left out. */
export function toWritingGuidance(value: unknown): WritingGuidance {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return { mentionBusiness: true, instructions: '', exclusions: [], rules: [] }
  const v = value as Record<string, unknown>
  const mention = v.mentionBusiness ?? v.mention_business
  return {
    mentionBusiness: mention !== false,
    instructions: cleanText(v.instructions, GUIDANCE_LIMITS.instructions),
    exclusions: cleanList(v.exclusions, GUIDANCE_LIMITS.exclusion, GUIDANCE_LIMITS.exclusions),
    rules: cleanRules(v.rules),
  }
}

export function isEmptyGuidance(g: WritingGuidance | null | undefined): boolean {
  return !g || (!g.instructions && g.exclusions.length === 0 && g.rules.length === 0)
}

export type GuidanceField = 'mentionBusiness' | 'instructions' | 'exclusions' | 'rules'
export type ParsedGuidance = { ok: true; guidance: WritingGuidance } | { ok: false; invalid: GuidanceField[] }

/**
 * A save from the settings card, checked strictly: a text over its limit, or
 * more entries than allowed, is refused with the field named (never silently
 * cut, so the owner does not lose words they typed without knowing).
 */
export function parseGuidanceInput(input: unknown): ParsedGuidance {
  if (!input || typeof input !== 'object' || Array.isArray(input)) return { ok: false, invalid: [] }
  const v = input as Record<string, unknown>
  const invalid: GuidanceField[] = []
  if (v.mentionBusiness !== undefined && typeof v.mentionBusiness !== 'boolean') invalid.push('mentionBusiness')
  if (v.instructions !== undefined && typeof v.instructions !== 'string') invalid.push('instructions')
  else if (typeof v.instructions === 'string' && v.instructions.trim().length > GUIDANCE_LIMITS.instructions) invalid.push('instructions')
  const listOk = (raw: unknown, each: number, max: number, pick: (x: unknown) => unknown) =>
    raw === undefined || (Array.isArray(raw) && raw.length <= max && raw.every((x) => typeof pick(x) === 'string' && String(pick(x)).trim().length <= each))
  if (!listOk(v.exclusions, GUIDANCE_LIMITS.exclusion, GUIDANCE_LIMITS.exclusions, (x) => x)) invalid.push('exclusions')
  if (!listOk(v.rules, GUIDANCE_LIMITS.rule, GUIDANCE_LIMITS.rules, (x) => (x && typeof x === 'object' ? (x as { text?: unknown }).text : undefined))) invalid.push('rules')
  if (invalid.length) return { ok: false, invalid }
  return { ok: true, guidance: toWritingGuidance(v) }
}

/** One note left on an article, as a rule. Null when it is empty or too long. */
export function parseRuleInput(text: unknown, articleId: unknown, now: Date): WritingRule | null {
  if (typeof text !== 'string') return null
  const trimmed = text.trim()
  if (!trimmed || trimmed.length > GUIDANCE_LIMITS.rule) return null
  return cleanRule({ text: trimmed, at: now.toISOString(), articleId })
}

export type AddRuleOutcome = { ok: true; guidance: WritingGuidance; duplicate: boolean } | { ok: false; code: 'rules_full' }

/** The guidance with one more rule at the end. The same rule twice is kept once; a full list is refused. */
export function withRule(g: WritingGuidance, rule: WritingRule): AddRuleOutcome {
  if (g.rules.some((r) => r.text.toLocaleLowerCase() === rule.text.toLocaleLowerCase())) return { ok: true, guidance: g, duplicate: true }
  if (g.rules.length >= GUIDANCE_LIMITS.rules) return { ok: false, code: 'rules_full' }
  return { ok: true, guidance: { ...g, rules: [...g.rules, rule] }, duplicate: false }
}

export function sameGuidance(a: WritingGuidance, b: WritingGuidance): boolean {
  return a.mentionBusiness === b.mentionBusiness && a.instructions === b.instructions
    && a.exclusions.length === b.exclusions.length && a.exclusions.every((x, i) => x === b.exclusions[i])
    && a.rules.length === b.rules.length && a.rules.every((r, i) => r.text === b.rules[i].text)
}

/** The stored JSON (snake_case, the migration's CHECK reads these keys). */
export function toGuidanceRow(g: WritingGuidance): Record<string, unknown> {
  return {
    mention_business: g.mentionBusiness,
    instructions: g.instructions,
    exclusions: g.exclusions,
    rules: g.rules.map((r) => ({ text: r.text, at: r.at, article_id: r.articleId })),
  }
}

// ── The prompt ─────────────────────────────────────────────────────────────

/** Quoted for the prompt: the owner's text can never close the fence it sits in. */
function quoted(s: string): string {
  return s.replace(/"""/g, '"​""')
}

/**
 * The prompt lines for the owner's guidance. [] when there is none, so the
 * prompt is exactly as it was before this feature.
 */
export function guidancePromptLines(g: WritingGuidance | null | undefined): string[] {
  if (!g || isEmptyGuidance(g)) return []
  const lines: string[] = []
  if (g.instructions) {
    lines.push(
      `THE BUSINESS OWNER'S STANDING INSTRUCTIONS for every article of this business (follow them; they override the tone and style preferences above, but never the factual-accuracy rules below and never the JSON format):`,
      `"""`,
      quoted(g.instructions),
      `"""`,
    )
  }
  if (g.exclusions.length) {
    lines.push(
      `THE BUSINESS DOES NOT SELL, OFFER OR DO: ${g.exclusions.map((x) => `"${quoted(x)}"`).join('; ')}.`,
      `- Never present any of these as something the business sells, offers or does; never suggest contacting the business for them; never build a section, a call to action or an FAQ answer around them. Mention one only as general background when the topic truly needs it.`,
    )
  }
  if (g.rules.length) {
    lines.push(`RULES THE OWNER SET AFTER READING EARLIER ARTICLES (obey every one; where two conflict, the later one wins):`)
    for (const r of g.rules) lines.push(`  - "${quoted(r.text)}"`)
  }
  return lines
}

export type BusinessContext = {
  /** What the business does, from the settings (the owner's or the site scan's). */
  description: string | null
  /** The city it serves, only for a business the settings mark as local. */
  city: string | null
}

export const BUSINESS_DESCRIPTION_MAX = 600

/** The business context and service-area lines for the prompt. [] when there is neither. */
export function businessContextLines(ctx: BusinessContext | null | undefined): string[] {
  if (!ctx) return []
  const lines: string[] = []
  const description = cleanLine(ctx.description, BUSINESS_DESCRIPTION_MAX)
  if (description) {
    lines.push(`About the business behind this site (context so the article fits what it really does; do not copy it word for word, and follow the brand-name rule below): """${quoted(description)}"""`)
  }
  const city = cleanLine(ctx.city, 80)
  if (city) {
    lines.push(
      `SERVICE AREA: the business is local and serves customers in and around "${quoted(city)}".`,
      `- Where it fits the topic, make that clear: once in the introduction or the first section, once in a relevant section, and in one FAQ answer when natural. Use the place name naturally and sparingly; never add it to every heading, and never claim branches, areas, addresses or opening hours that are not stated here.`,
    )
  }
  return lines
}
