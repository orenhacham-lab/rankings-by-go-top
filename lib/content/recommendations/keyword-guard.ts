/**
 * Exact primary-keyword guard (Phase 3F.3.1b).
 *
 * Builds two EXACT-normalized sets for filtering topic-idea suggestions:
 *   - keywords: primary keywords that already exist for the project (project
 *     tracked keywords, article-topic keywords, generated articles' topic
 *     keywords, persisted-idea keywords, and RELIABLE WordPress/site-scan focus
 *     keywords).
 *   - titles: exact titles/fingerprints already seen (idea titles + fingerprints,
 *     topic titles, generated-article titles).
 *
 * Matching is EXACT normalized only (normalizeText): trim + lowercase + collapse
 * whitespace + strip edge punctuation. No stemming, no token-overlap, no
 * contains/substring matching — so "הליכון ביתי" never blocks "תחזוקת הליכון
 * ביתי" or "הליכון ביתי מתקפל". Read-only; never rescans WordPress.
 */

import type { createAdminClient } from '@/lib/supabase/admin'
import { getCachedIndex, reassembleReport } from '@/lib/content/wordpress-content-index'
import { slugFromUrl } from '@/lib/content/internal-links'
import type { ScannedTarget } from '@/lib/content/wordpress-content-scan'
import type { ContentTopicIdeaRow } from '@/lib/supabase/types'
import { normalizeText } from './topic-idea-store'

// ── Phase 3G.7 — phrase-level coverage of EXISTING SITE CONTENT ────────────────
// The exact title/keyword guard misses the common real-world case: an existing
// site article "מנורות לילה לשבת – תאורה מותאמת לשקט, נוחות והלכה" (no focus
// keyword in the index) vs a new idea "מנורות לילה לשבת: תאורה מעוצבת
// ופונקציונלית". Both share the same MAIN PHRASE ("מנורות לילה לשבת") — the
// topic is already covered. contentPhrases holds normalized main phrases of
// existing content (title-prefix before separators, full short titles, Hebrew
// slugs, keywords); an idea whose primary keyword OR title-prefix equals such a
// phrase is a duplicate. Matching is EXACT full-phrase equality (≥2 words) after
// punctuation/finals normalization — no token overlap, no substring — so a
// genuinely different long-tail ("מנורות לילה לשבת לחדרי ילדים") stays allowed.

const HE_FINALS_MAP: Record<string, string> = { ך: 'כ', ם: 'מ', ן: 'נ', ף: 'פ', ץ: 'צ' }
/** Aggressive phrase normalization: lowercase, strip ALL punctuation/separators,
 *  fold Hebrew final letters, collapse whitespace. For phrase-set comparison only. */
export function normalizePhrase(s: string | null | undefined): string {
  const t = (s || '')
    .toLowerCase()
    .replace(/["'“”‘’׳״`]+/g, '')
    .replace(/[?!.,:;|()[\]{}<>«»/\\_\-–—…]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
  return Array.from(t, (c) => HE_FINALS_MAP[c] ?? c).join('')
}

/** Title/keyphrase segment separators (same family the anchor derivation uses). */
const PHRASE_SEGMENT_SPLIT = /\s+[–—-]\s+|\s*\|\s*|:\s+/

/** The title's MAIN phrase: the first segment before separators, normalized.
 *  Returns '' when it has fewer than 2 words (single words are too generic to
 *  treat as topic coverage). */
export function titleMainPhrase(title: string | null | undefined): string {
  const first = ((title || '').split(PHRASE_SEGMENT_SPLIT)[0] ?? '').trim()
  const norm = normalizePhrase(first)
  return norm && norm.split(' ').length >= 2 ? norm : ''
}

type Admin = ReturnType<typeof createAdminClient>

// ── Phase 3I.6 — keyword ORIGIN evidence ───────────────────────────────────────
// Zero-result runs die in `guard.keywords.has(nk)`, but the guard only knew
// WHICH source-set a keyword sits in (keywordSourcesOf) — never the concrete
// ROW it came from, so live QA could not say WHAT blocked each idea. The guard
// now records, per normalized keyword, its originating rows (bounded per
// keyword): source kind, the original keyword text, the row's status (idea
// rows) and a short human detail (topic/idea title, scan target type + URL).
// Diagnostics only — NO blocking behavior reads this map.
export interface KeywordOriginEntry {
  source: 'tracking_keyword' | 'topic_keyword' | 'idea_keyword' | 'scan_focus_keyword'
  /** The original (pre-normalization) keyword text on the originating row. */
  original: string
  /** Idea rows: row status (pending/approved/rejected/generated/…); else null. */
  status: string | null
  /** Human context: topic/idea title, or scan target "type url". */
  detail: string
}
const MAX_ORIGINS_PER_KEYWORD = 5

export interface KeywordGuard {
  titles: Set<string>
  keywords: Set<string>
  /** Keywords from existing CONTENT only (excludes persisted ideas) — for the
   *  bulk-approve guard and pending revalidation, so an idea isn't blocked by
   *  itself. Covers project keywords, topic/generated keywords, scan keywords. */
  contentKeywords: Set<string>
  /** Titles from existing CONTENT only (topics + generated articles; no ideas). */
  contentTitles: Set<string>
  /** Phase 3G.7 — normalized MAIN PHRASES of existing content (title-prefixes,
   *  short titles, Hebrew slugs, keywords) incl. scanned site posts/pages, so a
   *  re-angled duplicate of an existing article is caught. Content-only. */
  contentPhrases: Set<string>
  /** Exact normalized NAMES of existing indexed COMMERCIAL entities that OWN a
   *  keyword-intent pair: product / category / page scan targets + Shopify
   *  entities (title + handle). An entity SEEDS long-tail ideas but OWNS its exact
   *  query — a candidate whose primary keyword equals one of these is direct
   *  cannibalization and is hard-rejected (see ownedByExistingEntity). EXACT match
   *  only (never a phrase-prefix), so genuine long-tails are unaffected. */
  entityOwners: Set<string>
  /** Per-source sets for diagnostics/classification (server-side only). */
  sources: {
    tracking: Set<string>
    topics: Set<string>
    ideas: Set<string>
    scan: Set<string>
  }
  /** Phase 3I.6 — normalized keyword → originating rows (bounded). Evidence only. */
  origins: Map<string, KeywordOriginEntry[]>
  /** Up to 10 example scan focus keywords actually included (dev diagnostics). */
  scanSamples: string[]
  counts: {
    existingProjectKeywordCount: number
    existingTopicKeywordCount: number
    existingIdeaKeywordCount: number
    existingScanKeywordCount: number
  }
}

/** Raw project data the guard is built from (pure builder input — testable). */
export interface KeywordGuardData {
  topics: { topic: string; primary_keyword: string | null }[]
  generatedArticleTitles: (string | null)[]
  trackingKeywords: string[]
  ideas: { title: string; primary_keyword: string | null; fingerprint: string; status?: string | null }[]
  scanTargets: Pick<ScannedTarget, 'targetTitle' | 'targetUrl' | 'targetType' | 'keywordAvailable' | 'primaryKeywordCandidate'>[]
  /** Indexed Shopify entities (products/collections/pages/…) — title + handle.
   *  Their exact names become keyword owners (domain-neutral). Optional. */
  shopifyEntities?: { title: string | null; handle: string | null; entity_type?: string | null }[]
}

/** Pure guard construction from already-loaded project data. */
export function buildKeywordGuardFromData(data: KeywordGuardData): KeywordGuard {
  const titles = new Set<string>()
  const keywords = new Set<string>()
  const contentKeywords = new Set<string>()
  const contentTitles = new Set<string>()
  const contentPhrases = new Set<string>()
  const entityOwners = new Set<string>()
  const sources = { tracking: new Set<string>(), topics: new Set<string>(), ideas: new Set<string>(), scan: new Set<string>() }
  const origins = new Map<string, KeywordOriginEntry[]>()
  const scanSamples: string[] = []
  const counts = { existingProjectKeywordCount: 0, existingTopicKeywordCount: 0, existingIdeaKeywordCount: 0, existingScanKeywordCount: 0 }

  // Phase 3G.7 / 3H.1 — content phrases come from TITLES of existing content
  // ONLY (existing articles/pages/topics): title main-phrase + full-title phrase
  // (multi-word only). KEYWORDS are deliberately NOT phrases: a tracked keyword
  // or a topic's primary keyword is not a published article — treating it as
  // "covered" blocked EVERY new idea titled "<core keyword>: <angle>" (Gemini's
  // dominant title pattern) and zeroed all idea sources. Exact keyword blocking
  // (contentKeywords) still catches a true same-keyword duplicate.
  const addContentPhraseFromTitle = (raw: string | null | undefined) => {
    const main = titleMainPhrase(raw)
    if (main) contentPhrases.add(main)
    const full = normalizePhrase(raw)
    if (full && full.split(' ').length >= 2) contentPhrases.add(full)
  }

  const addKeyword = (raw: string | null | undefined, opts: { content: boolean; sourceSet?: Set<string>; bump?: () => void; origin?: KeywordOriginEntry }) => {
    const v = normalizeText(raw)
    if (!v) return
    keywords.add(v)
    if (opts.content) contentKeywords.add(v)
    opts.sourceSet?.add(v)
    opts.bump?.()
    // Phase 3I.6 — record the originating row (evidence only, bounded).
    if (opts.origin) {
      const list = origins.get(v) ?? []
      if (list.length < MAX_ORIGINS_PER_KEYWORD) { list.push(opts.origin); origins.set(v, list) }
    }
  }
  const addTitle = (raw: string | null | undefined, content: boolean) => { const v = normalizeText(raw); if (v) { titles.add(v); if (content) { contentTitles.add(v); addContentPhraseFromTitle(raw) } } }

  // Article topics — title + primary keyword. Covers generated articles too,
  // since every generated_articles.topic_id references a project topic here.
  for (const t of data.topics) {
    addTitle(t.topic, true)
    addKeyword(t.primary_keyword, { content: true, sourceSet: sources.topics, bump: () => counts.existingTopicKeywordCount++, origin: { source: 'topic_keyword', original: t.primary_keyword ?? '', status: null, detail: t.topic } })
  }

  // Generated articles — exact titles (their topic keyword is already covered above).
  for (const title of data.generatedArticleTitles) addTitle(title, true)

  // Project tracked keywords — EXACT keyword blocking only (never phrases).
  for (const kw of data.trackingKeywords) addKeyword(kw, { content: true, sourceSet: sources.tracking, bump: () => counts.existingProjectKeywordCount++, origin: { source: 'tracking_keyword', original: kw, status: null, detail: '' } })

  // Persisted ideas — title + fingerprint + primary keyword. These are NOT
  // content keywords (a pending idea must not block its own approval).
  //
  // Phase 3I.5 — rows with status 'duplicate' are EXCLUDED from the guard: a
  // TRUE duplicate's original (topic / article / pending idea) still blocks
  // through its own entry, while a row that an earlier over-blocking guard
  // WRONGLY marked duplicate stops poisoning future generations forever. On a
  // long-tested niche project the graveyard of such rows had covered the whole
  // natural keyword space, dead-locking site-scan into "primary_keyword_exists"
  // on every run. pending/approved/rejected rows still block (an explicitly
  // rejected idea must not be re-suggested).
  for (const r of data.ideas) {
    if (r.status === 'duplicate') continue
    addTitle(r.title, false)
    if (r.fingerprint) titles.add(r.fingerprint)
    addKeyword(r.primary_keyword, { content: false, sourceSet: sources.ideas, bump: () => counts.existingIdeaKeywordCount++, origin: { source: 'idea_keyword', original: r.primary_keyword ?? '', status: r.status ?? null, detail: r.title } })
  }

  // Reliable WordPress/site-scan focus keywords ONLY (keywordAvailable === true =
  // Yoast/RankMath/AIOSEO focus keyword or a matched generated-article keyword —
  // never a title/slug/heading-derived guess).
  for (const tg of data.scanTargets) {
    if (tg.keywordAvailable && tg.primaryKeywordCandidate) {
      const before = sources.scan.size
      addKeyword(tg.primaryKeywordCandidate, { content: true, sourceSet: sources.scan, bump: () => counts.existingScanKeywordCount++, origin: { source: 'scan_focus_keyword', original: tg.primaryKeywordCandidate, status: null, detail: `${tg.targetType} ${tg.targetUrl}` } })
      if (sources.scan.size > before && scanSamples.length < 10) scanSamples.push(tg.primaryKeywordCandidate.trim())
    }
    // EXACT keyword ownership for EVERY indexed entity (product / category / page /
    // post): the entity name may seed long-tail ideas but OWNS its exact query. A
    // Hebrew slug phrase is added too. This blocks only an EXACT primary-keyword
    // collision, never a longer long-tail. Also add the entity's focus keyword.
    const entName = normalizePhrase(tg.targetTitle)
    if (entName) entityOwners.add(entName)
    const entSlug = slugFromUrl(tg.targetUrl)
    if (/[֐-׿]/.test(entSlug)) { const v = normalizePhrase(entSlug); if (v) entityOwners.add(v) }
    if (tg.keywordAvailable && tg.primaryKeywordCandidate) { const k = normalizePhrase(tg.primaryKeywordCandidate); if (k) entityOwners.add(k) }
    // Phase 3G.7 / 3H.3 — only existing site ARTICLES ('post') cover their
    // title's main phrase. 'page' targets are deliberately EXCLUDED: on
    // ecommerce/service sites, WP pages are commonly entity/landing pages
    // (category-style pages, custom-permalink products, service pages) — those
    // entities must SEED article ideas, never block them as "already covered".
    // Site-scan ideas are BY CONSTRUCTION derived from the site's own entities,
    // so page-title phrases were self-blocking the entire site-scan source.
    // Real informational coverage = posts + own topics/generated articles.
    if (tg.targetType === 'post') {
      addContentPhraseFromTitle(tg.targetTitle)
      const slugPhrase = slugFromUrl(tg.targetUrl)
      if (/[֐-׿]/.test(slugPhrase)) {
        const v = normalizePhrase(slugPhrase)
        if (v && v.split(' ').length >= 2) contentPhrases.add(v)
      }
    }
  }

  // Shopify indexed entities own their exact names too (product/collection/page/…).
  for (const e of data.shopifyEntities ?? []) {
    const t = normalizePhrase(e.title)
    if (t) entityOwners.add(t)
    const h = normalizePhrase((e.handle || '').replace(/-/g, ' '))
    if (h) entityOwners.add(h)
  }

  return { titles, keywords, contentKeywords, contentTitles, contentPhrases, entityOwners, sources, origins, scanSamples, counts }
}

/**
 * HARD exact-match rule (domain-neutral): true when the candidate's primary
 * keyword is EXACTLY (after canonical normalization) the name of an existing
 * indexed commercial entity/page — i.e. that page already owns this exact query.
 * EXACT equality only, so a longer long-tail keyword ("… לאורך זמן") is never
 * blocked by it.
 */
export function ownedByExistingEntity(guard: KeywordGuard, primaryKeyword: string | null | undefined): boolean {
  const k = normalizePhrase(primaryKeyword)
  if (!k) return false
  if (guard.entityOwners.has(k)) return true
  // D.4 — a bare entity name + only GENERIC modifier words (guide/recommended/price/
  // shipping/best/…) does not create a distinct search need: if removing ONLY those
  // generic tokens yields the exact entity name, it still cannibalizes. Domain-neutral.
  const toks = k.split(' ').filter(Boolean)
  const kept = toks.filter((t) => !GENERIC_MODIFIER_TOKENS.has(t))
  if (kept.length > 0 && kept.length < toks.length) {
    const stripped = kept.join(' ')
    if (stripped !== k && guard.entityOwners.has(stripped)) return true
  }
  return false
}

/** Generic modifier words that do NOT create a distinct content need (D.4). Purely
 *  generic commercial/quality/logistics terms — NOT topic-bearing modifiers. Stored
 *  in canonical (normalizePhrase) form so final-letter/casing variants still match. */
const GENERIC_MODIFIER_TOKENS = new Set<string>(
  [
    // Hebrew
    'מדריך', 'מומלץ', 'מומלצת', 'מומלצים', 'איכותי', 'איכותית', 'מחיר', 'מחירים', 'משלוח',
    'הטוב', 'ביותר', 'הכי', 'טוב', 'טובה', 'זול', 'זולה', 'לקנות', 'קניה', 'קנייה', 'אונליין',
    // English
    'best', 'guide', 'price', 'buy', 'cheap', 'top', 'online', 'review', 'reviews',
  ].map((t) => normalizePhrase(t)).filter(Boolean),
)

/** Load the project's guard data and build the guard. Never throws. */
export async function buildKeywordGuard(admin: Admin, projectId: string): Promise<KeywordGuard> {
  const data: KeywordGuardData = { topics: [], generatedArticleTitles: [], trackingKeywords: [], ideas: [], scanTargets: [] }
  try {
    const { data: rows } = await admin.from('article_topics').select('topic, primary_keyword').eq('project_id', projectId)
    data.topics = (rows ?? []) as KeywordGuardData['topics']
  } catch { /* optional */ }
  try {
    const { data: rows } = await admin.from('generated_articles').select('title').eq('project_id', projectId)
    data.generatedArticleTitles = ((rows ?? []) as { title: string | null }[]).map((r) => r.title)
  } catch { /* optional */ }
  try {
    const { data: rows } = await admin.from('tracking_targets').select('keyword').eq('project_id', projectId)
    data.trackingKeywords = ((rows ?? []) as { keyword: string }[]).map((r) => r.keyword)
  } catch { /* optional */ }
  try {
    const { data: rows, error } = await admin.from('content_topic_ideas').select('title, primary_keyword, fingerprint, status').eq('project_id', projectId)
    if (!error) data.ideas = (rows ?? []) as KeywordGuardData['ideas']
  } catch { /* ideas table optional */ }
  try {
    const cacheRow = await getCachedIndex(admin, projectId)
    if (cacheRow) data.scanTargets = (reassembleReport(cacheRow).targets ?? []) as ScannedTarget[]
  } catch { /* scan cache optional */ }
  try {
    // Indexed Shopify entities own their exact names (products/collections/pages).
    const { data: rows } = await admin.from('shopify_entities').select('title, handle, entity_type').eq('project_id', projectId).eq('is_active', true)
    data.shopifyEntities = (rows ?? []) as KeywordGuardData['shopifyEntities']
  } catch { /* shopify entities optional */ }
  return buildKeywordGuardFromData(data)
}

/**
 * Revalidate already-persisted PENDING ideas against the current guard (Phase
 * 3F.3.1c). A pending idea is a conflict if its exact normalized primary keyword
 * is now an existing CONTENT keyword, or its exact normalized title is an
 * existing content title. Pure — the caller marks conflicts 'duplicate'. Uses
 * contentKeywords/contentTitles (excludes ideas) so an idea never conflicts with
 * itself; and since fingerprint = normalize(primary_keyword), two ideas can't
 * share a keyword, so pending-vs-pending self-conflict is impossible.
 */
/**
 * Phase 3G.7 — is a suggested topic ALREADY COVERED by existing site content?
 * True when its normalized primary keyword exactly equals a known content
 * phrase (existing article title-prefix / short title / Hebrew slug), or when
 * its title's main phrase is covered AND the idea brings no distinct primary
 * keyword of its own.
 *
 * Phase 3H.1 — the bare title-prefix rule was part of the systemic zero-results
 * bug: one existing article "בגדי יד שנייה לנשים: המדריך המלא" blocked EVERY
 * future idea using the "<core phrase>: <angle>" title pattern, even ideas with
 * their own distinct long-tail keywords (a different article intent). A covered
 * title prefix now counts as duplication ONLY when the idea's primary keyword
 * is missing, equals the prefix, or is itself a covered phrase — i.e. the idea
 * is a re-angle of the same intent, not a new sub-topic. Full-phrase equality
 * only — long-tail variations with additional words remain allowed.
 */
export function coveredByExistingContent(guard: KeywordGuard, title: string | null | undefined, primaryKeyword: string | null | undefined): boolean {
  const kw = normalizePhrase(primaryKeyword)
  const kwIsPhrase = !!kw && kw.split(' ').length >= 2
  if (kwIsPhrase && guard.contentPhrases.has(kw)) return true
  const main = titleMainPhrase(title)
  if (!main || !guard.contentPhrases.has(main)) return false
  // Covered prefix + a DISTINCT long-tail primary keyword ⇒ a new article
  // intent under the same umbrella — allowed.
  return !kwIsPhrase || kw === main
}

export function partitionPending(
  rows: ContentTopicIdeaRow[],
  guard: KeywordGuard,
): { visible: ContentTopicIdeaRow[]; conflictIds: string[]; conflicts: { id: string; reason: 'primary_keyword_exists' | 'title_exists' | 'covered_by_existing_content' }[] } {
  const visible: ContentTopicIdeaRow[] = []
  const conflictIds: string[] = []
  const conflicts: { id: string; reason: 'primary_keyword_exists' | 'title_exists' | 'covered_by_existing_content' }[] = []
  for (const r of rows) {
    const nk = normalizeText(r.primary_keyword)
    const nt = normalizeText(r.title)
    if (nk && guard.contentKeywords.has(nk)) { conflictIds.push(r.id); conflicts.push({ id: r.id, reason: 'primary_keyword_exists' }); continue }
    if (nt && guard.contentTitles.has(nt)) { conflictIds.push(r.id); conflicts.push({ id: r.id, reason: 'title_exists' }); continue }
    // Phase 3G.7 — re-angled duplicates of existing site articles (same main
    // phrase, different suffix) are hidden + marked duplicate on load.
    if (coveredByExistingContent(guard, r.title, r.primary_keyword)) { conflictIds.push(r.id); conflicts.push({ id: r.id, reason: 'covered_by_existing_content' }); continue }
    visible.push(r)
  }
  return { visible, conflictIds, conflicts }
}

/** Phase 3I.6 — the concrete originating ROWS of a blocking keyword (evidence).
 *  Empty array = the keyword is in guard.keywords without a recorded origin
 *  (only possible for intra-batch additions made by the route's dedupe). */
export function keywordOriginsOf(guard: KeywordGuard, primaryKeyword: string): KeywordOriginEntry[] {
  const v = normalizeText(primaryKeyword)
  return v ? (guard.origins.get(v) ?? []) : []
}

/** Which guard source(s) contain this exact normalized primary keyword (diagnostics). */
export function keywordSourcesOf(guard: KeywordGuard, primaryKeyword: string): string[] {
  const v = normalizeText(primaryKeyword)
  if (!v) return []
  const hits: string[] = []
  if (guard.sources.tracking.has(v)) hits.push('tracking_targets')
  if (guard.sources.topics.has(v)) hits.push('article_topics')
  if (guard.sources.ideas.has(v)) hits.push('content_topic_ideas')
  if (guard.sources.scan.has(v)) hits.push('site_scan')
  return hits
}
