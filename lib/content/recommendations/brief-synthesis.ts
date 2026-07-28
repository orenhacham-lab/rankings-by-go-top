/**
 * Brief synthesis (Phase 4) — ONE batched model call that POLISHES deterministic
 * OpportunityBriefs into publishable topics. The model's job is narrow by design:
 * wording only (title / primaryKeyword / secondaries / intent) for subjects the
 * evidence already supports. It must NOT invent subjects, merge briefs, add
 * topics, claim demand, or produce links — links and user-facing reasons are
 * composed deterministically downstream.
 *
 * The response is reconciled BY BRIEF ID: every brief ends as polished, skipped
 * (typed, model-declared), or missing (counted) — exact accounting, no silent loss.
 */

import type { OpportunityBrief } from './opportunity-brief'

export interface PolishedTopic {
  briefId: string
  title: string
  primaryKeyword: string
  secondaryKeywords: string[]
  intent: string
}
/** A model-declared skip. `skipReason` is the ENUM the responseSchema constrains;
 *  'unspecified' is recorded when the model omitted it (the schema subset cannot make
 *  a field conditionally required — see SKIP_REASONS). `why` stays free text. */
export type SkipReason = (typeof SKIP_REASONS)[number] | 'unspecified'
export interface SkippedBrief { briefId: string; skipReason: SkipReason; why: string }
export interface SynthesisReconciliation {
  polished: PolishedTopic[]
  skipped: SkippedBrief[]
  /** Brief ids absent from the response (parse truncation / model omission). */
  missing: string[]
  /** Response items with an unknown/duplicate briefId or unusable fields. */
  droppedItems: number
  parseFailed: boolean
  /** Model-emitted item count (polished + skipped + dropped). */
  emitted: number
}

/** Compact brief payload — only what wording needs; ids are opaque. */
function briefPayload(briefs: OpportunityBrief[]) {
  return briefs.map((b) => ({
    id: b.opportunityId,
    subject: b.subject,
    need: b.searchNeed,
    intent: b.intendedIntent,
    ...(b.alignedDemandQuery ? { aligned_query: b.alignedDemandQuery.query } : {}),
    ...(b.relatedEntities.length ? { entities: b.relatedEntities.slice(0, 5).map((e) => e.name) } : {}),
    ...(b.publishedCoverage.length ? { covered_titles: b.publishedCoverage.slice(0, 3) } : {}),
  }))
}

/**
 * BRIEF PROVENANCE — replaces the project-owned context block in THIS prompt.
 *
 * The old block asserted `primaryProjectFocus`, which deriveProjectFocus computes as
 * `cats[0]` — array index zero of the site-scan entities, in crawl order, with no
 * scoring. For a multi-topic site that names one arbitrary area as "the central
 * editorial and commercial focus" and then forbids generating outside it, so the model
 * correctly refuses briefs the pipeline had already verified as on-domain (nagler:
 * 0 topics from a 29-brief pool).
 *
 * Synthesis cannot invent a subject: briefId is a responseSchema enum, reconcileSynthesis
 * drops unknown ids, and validatePolished re-anchors any keyword that shares no
 * distinctive token with its brief. So the domain claim protects nothing here and only
 * suppresses. Project NAME and DOMAIN are dropped too — for a wording task they add
 * nothing, and keeping the name while removing the description would invite exactly the
 * inference the old block explicitly forbade.
 */
export function briefProvenanceBlock(): string {
  return [
    `BRIEF PROVENANCE — read this before the rules:`,
    `- Every brief below was derived deterministically from THIS project's own website, its published content, and its own search data. Each one has ALREADY been verified as belonging to this business, and already checked against what the site has published and what is pending.`,
    `- Your job is WORDING ONLY. Do NOT re-judge whether a subject belongs to this business, whether it fits the project's focus, or whether the business "really" covers this area. That judgement was made before you saw it, from data you do not have.`,
    `- A project may legitimately span several unrelated subject areas. Two briefs having nothing to do with each other is normal and is NOT a reason to reject either one.`,
    `- The ONLY names you may use are the ones inside each brief's own "entities". Do not introduce any other business, brand or product name, in any script.`,
  ].join('\n')
}

/** Build the single batched polishing prompt. */
export function buildBriefSynthesisPrompt(briefs: OpportunityBrief[], langLabel: string, year: number): string {
  return [
    `You are an SEO content editor. Today's year is ${year}. Return ALL text in ${langLabel}.`,
    briefProvenanceBlock(),
    ``,
    `TASK: Below are ${briefs.length} EVIDENCE-BACKED content briefs. For EACH brief, polish it into ONE article topic. The brief IS the opportunity — do NOT invent a different subject, do NOT merge briefs, do NOT add extra topics.`,
    `RULES:`,
    `- "title": one natural, fluent ${langLabel} article title answering the brief's need for its exact subject. Complete words only — never truncate or corrupt a word.`,
    `- TITLE STRUCTURE: choose the structure that genuinely fits EACH brief's "need" — a question title, a comparison ("A מול B"), a practical how-to, a problem/solution, a buyer guide, a checklist, myths-vs-facts, or a focused explanation. VARY structures across the batch: at most ONE title in the whole batch may open with "המדריך המלא"/"המדריך השלם"/"כל מה שצריך לדעת", and no more than TWO titles may share the same opening pattern (e.g. "איך לבחור…", "מה חשוב לדעת…", "מה ההבדל בין…", "המדריך ל…"). NEVER sacrifice accuracy or the brief's subject for variety — a precise plain title beats an awkward varied one.`,
    `- "primaryKeyword": a real search phrase for THIS need. It MUST keep the brief subject's core words. When "aligned_query" exists, use it verbatim or a minimal natural variant of it.`,
    `- "secondaryKeywords": up to 3 phrases someone searching this exact article would use. No duplicates of the primary.`,
    `- "intent": keep the brief's intent unless it is clearly wrong for the title you wrote.`,
    `- NEVER mention search volume, demand, popularity, statistics or "many searches" anywhere.`,
    `- NEVER mention a business, brand or product name that is not in that brief's "entities".`,
    `- Do not duplicate a "covered_titles" topic — angle the title differently, and only skip if no distinct angle exists.`,
    `- SKIPPING: skip ONLY when the wording task itself is impossible, and say which case it is in "skipReason":`,
    `    "cannot_form_title" — no fluent ${langLabel} title can answer this need for this exact subject;`,
    `    "subject_unintelligible" — the subject is not a comprehensible topic;`,
    `    "duplicate_of_covered_title" — this brief's own "covered_titles" already answer it and no distinct angle exists.`,
    `  These are the ONLY valid reasons. "Off-topic", "not the project's field", "outside the business's specialisation" and anything similar are NOT valid — domain fit is not yours to judge (see BRIEF PROVENANCE). A brief you could write a title for must be polished, not skipped.`,
    ``,
    `BRIEFS:`,
    JSON.stringify(briefPayload(briefs)),
    ``,
    `OUTPUT — ONLY valid JSON, no markdown/commentary: {"topics":[{"briefId":string,"skip":boolean,"skipReason":"cannot_form_title"|"subject_unintelligible"|"duplicate_of_covered_title"(only when skip),"why":string(only when skip, <=8 words),"title":string,"primaryKeyword":string,"secondaryKeywords":string[],"intent":"informational"|"commercial"|"comparison"|"transactional"|"local"}]}. Include EVERY briefId from BRIEFS exactly once.`,
  ].join('\n')
}

/** Output budget: title+keyword+3 secondaries+intent ≈ 200 Hebrew tokens per brief. */
export function synthesisOutputBudget(briefCount: number): number {
  return Math.max(1536, Math.min(12288, briefCount * 260 + 800))
}

const SYNTH_INTENTS = ['informational', 'commercial', 'comparison', 'transactional', 'local'] as const

/**
 * The ONLY valid skip reasons — CRAFT failures. A domain-motivated skip ("off-topic",
 * "not the project's field") is deliberately UNREPRESENTABLE: the responseSchema
 * constrains the VALUE, the same mechanism that fixed briefId when prompt wording alone
 * proved insufficient live.
 *
 * LIMITATION, stated rather than papered over: this OpenAPI subset expresses `required`
 * only at object level, and briefId/skip already occupy it, so skipReason cannot be made
 * mandatory-when-skipping. A skip that omits it is recorded as 'unspecified' and counted
 * — NOT rejected, because dropping it would change the exact
 * sent = polished + skipped + missing accounting for an unmeasured benefit. If
 * 'unspecified' turns out to be near zero the enum is holding and it can be hardened.
 */
export const SKIP_REASONS = ['cannot_form_title', 'subject_unintelligible', 'duplicate_of_covered_title'] as const

/**
 * ENFORCED structured-output schema (OpenAPI style, uppercase types — the shape
 * @google/genai forwards to generationConfig.responseSchema). briefId is an ENUM
 * of the exact batch ids, so an omitted/renamed/invented id is a provider-side
 * schema violation, not a silent "missing". Prompt wording alone proved
 * insufficient live (Gemini Pro returned a shape the parser could not
 * reconcile — 18/18 briefs "missing").
 */
export function briefSynthesisResponseSchema(briefIds: string[]): Record<string, unknown> {
  return {
    type: 'OBJECT',
    properties: {
      topics: {
        type: 'ARRAY',
        items: {
          type: 'OBJECT',
          properties: {
            briefId: { type: 'STRING', enum: briefIds },
            skip: { type: 'BOOLEAN' },
            skipReason: { type: 'STRING', enum: [...SKIP_REASONS] },
            why: { type: 'STRING' },
            title: { type: 'STRING' },
            primaryKeyword: { type: 'STRING' },
            secondaryKeywords: { type: 'ARRAY', items: { type: 'STRING' } },
            intent: { type: 'STRING', enum: [...SYNTH_INTENTS] },
          },
          required: ['briefId', 'skip'],
        },
      },
    },
    required: ['topics'],
  }
}

export type SynthesisFailureType =
  | 'synthesis_parse_failure'
  | 'synthesis_schema_failure'
  | 'synthesis_all_briefs_missing'
  | 'synthesis_unknown_brief_ids'

/** Exact response diagnostics (Preview only — no prompt, no secrets). */
export interface SynthesisResponseDiagnostics {
  parseFailed: boolean
  topLevelType: string
  topLevelKeys: string[]
  emittedItems: number
  recognizedBriefIds: number
  unknownBriefIds: string[]
  duplicateBriefIds: string[]
  invalidItems: number
  missingBriefIds: string[]
  responseHash: string
  /** Sanitized truncated excerpt for authenticated-Preview diagnosis only. */
  sanitizedExcerpt: string
}

function fnvHash(s: string): string {
  let h = 0x811c9dc5
  for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 0x01000193) }
  return (h >>> 0).toString(16)
}
const sanitizeExcerpt = (text: string) => (text || '').replace(/AIza[0-9A-Za-z_-]{20,}/g, '[key]').replace(/\s+/g, ' ').slice(0, 300)

/** Reconcile the model response against the EXACT brief batch, with full typed
 *  response diagnostics. Accepts `id` as a briefId alias defensively (counted
 *  as recognized) — the responseSchema makes the canonical field authoritative. */
export function reconcileSynthesis(text: string, briefs: OpportunityBrief[]): SynthesisReconciliation & { response: SynthesisResponseDiagnostics } {
  const ids = new Set(briefs.map((b) => b.opportunityId))
  const response: SynthesisResponseDiagnostics = {
    parseFailed: false, topLevelType: 'none', topLevelKeys: [], emittedItems: 0,
    recognizedBriefIds: 0, unknownBriefIds: [], duplicateBriefIds: [], invalidItems: 0,
    missingBriefIds: [], responseHash: fnvHash(text || ''), sanitizedExcerpt: sanitizeExcerpt(text),
  }
  const out: SynthesisReconciliation & { response: SynthesisResponseDiagnostics } = { polished: [], skipped: [], missing: [], droppedItems: 0, parseFailed: false, emitted: 0, response }

  let parsed: unknown
  try { parsed = JSON.parse(text) } catch {
    const m = (text || '').match(/\{[\s\S]*\}|\[[\s\S]*\]/)
    if (!m) { out.parseFailed = true; response.parseFailed = true; out.missing = briefs.map((b) => b.opportunityId); response.missingBriefIds = out.missing; return out }
    try { parsed = JSON.parse(m[0]) } catch { out.parseFailed = true; response.parseFailed = true; out.missing = briefs.map((b) => b.opportunityId); response.missingBriefIds = out.missing; return out }
  }
  response.topLevelType = Array.isArray(parsed) ? 'array' : typeof parsed
  response.topLevelKeys = parsed && typeof parsed === 'object' && !Array.isArray(parsed) ? Object.keys(parsed as object).slice(0, 8) : []

  // SCHEMA SHAPE: only {"topics":[...]} is the contract. A direct array or a
  // renamed wrapper is a SCHEMA failure — never silently coerced.
  const topics = parsed && typeof parsed === 'object' && !Array.isArray(parsed) && Array.isArray((parsed as { topics?: unknown }).topics)
    ? (parsed as { topics: unknown[] }).topics
    : null
  if (topics === null) {
    out.missing = briefs.map((b) => b.opportunityId)
    response.missingBriefIds = out.missing
    return out
  }
  out.emitted = topics.length
  response.emittedItems = topics.length
  const seen = new Set<string>()
  for (const t of topics) {
    const o = (t ?? {}) as Record<string, unknown>
    const briefId = String(o.briefId ?? o.id ?? '').trim()
    if (!briefId || !ids.has(briefId)) { out.droppedItems++; response.invalidItems++; if (briefId) response.unknownBriefIds.push(briefId.slice(0, 40)); continue }
    if (seen.has(briefId)) { out.droppedItems++; response.duplicateBriefIds.push(briefId); continue }
    response.recognizedBriefIds++
    if (o.skip === true) {
      seen.add(briefId)
      const raw = String(o.skipReason ?? '').trim()
      const skipReason: SkipReason = (SKIP_REASONS as readonly string[]).includes(raw) ? (raw as SkipReason) : 'unspecified'
      out.skipped.push({ briefId, skipReason, why: String(o.why ?? '').slice(0, 120) })
      continue
    }
    const title = String(o.title ?? '').trim()
    const primaryKeyword = String(o.primaryKeyword ?? '').trim()
    if (!title || !primaryKeyword) { out.droppedItems++; response.invalidItems++; continue }
    seen.add(briefId)
    out.polished.push({
      briefId, title, primaryKeyword,
      secondaryKeywords: Array.isArray(o.secondaryKeywords) ? o.secondaryKeywords.filter((s): s is string => typeof s === 'string' && !!s.trim()).slice(0, 3) : [],
      intent: typeof o.intent === 'string' ? o.intent : 'informational',
    })
  }
  for (const b of briefs) if (!seen.has(b.opportunityId)) out.missing.push(b.opportunityId)
  response.missingBriefIds = out.missing
  return out
}

/**
 * Typed classification of a provider-SUCCESSFUL response that cannot honor the
 * synthesis contract. null = contract honored. An all-missing response is a
 * CONTRACT failure — never "zero marginal topic quality".
 */
export function classifySynthesisFailure(rec: SynthesisReconciliation & { response: SynthesisResponseDiagnostics }, sentCount: number): SynthesisFailureType | null {
  if (sentCount === 0) return null
  if (rec.parseFailed) return 'synthesis_parse_failure'
  if (rec.response.topLevelType !== 'object' || (rec.response.emittedItems === 0 && rec.response.topLevelKeys.indexOf('topics') === -1)) return 'synthesis_schema_failure'
  if (rec.response.unknownBriefIds.length > 0 && rec.response.recognizedBriefIds === 0) return 'synthesis_unknown_brief_ids'
  if (rec.missing.length === sentCount) return 'synthesis_all_briefs_missing'
  return null
}

/** One model-authored skip, with its brief's SUBJECT resolved (Preview-only). */
export interface SkippedBriefDetail { briefId: string; subject: string | null; skipReason: SkipReason; why: string }

/** Bound on the per-round skip sample carried in diagnostics. */
export const MAX_SKIP_REASON_DETAILS = 30

/**
 * OBSERVABILITY ONLY — resolve each skipped brief's id to its SUBJECT so the
 * model's own `why` is interpretable without a second lookup. The synthesis
 * skip is the single largest loss in the pipeline and, until now, only its
 * COUNT survived (`skipped_by_model`); the reasons were discarded at the call
 * site. This is a bounded SAMPLE of that same set — it never replaces the
 * count, never changes it, and no caller may derive one from the other.
 *
 * PURE: no I/O, no throw. An unknown briefId (impossible via the responseSchema
 * enum, but never assumed) keeps a null subject rather than being dropped, so
 * the sample can never silently lose a skip. Model-authored text is whitespace-
 * collapsed and length-bounded exactly like every other diagnostics excerpt.
 */
export function summarizeSkipReasons(skipped: SkippedBrief[], briefs: OpportunityBrief[], cap = MAX_SKIP_REASON_DETAILS): SkippedBriefDetail[] {
  const subjectById = new Map(briefs.map((b) => [b.opportunityId, b.subject]))
  const out: SkippedBriefDetail[] = []
  for (const s of skipped) {
    if (out.length >= cap) break
    out.push({
      briefId: s.briefId,
      subject: subjectById.get(s.briefId) ?? null,
      skipReason: s.skipReason,
      why: (s.why || '').replace(/\s+/g, ' ').trim().slice(0, 120),
    })
  }
  return out
}
