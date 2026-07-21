/**
 * CONSTRAINED opportunity discovery (RC3) — pure prompt/schema/validation core.
 *
 * The deterministic pool only reflects STORED evidence; when tracked head terms
 * already own pages and no fresh research exists, that is not proof the business
 * has no opportunities — it is a missing discovery mechanism. This stage lets
 * the model propose NEW long-tail search needs under hard constraints — never
 * unrestricted invention:
 *   - every candidate must be ANCHORED to an exact owned entity/focus string
 *     (enforced by a responseSchema enum + deterministic re-verification);
 *   - no external business names; no volume/popularity claims (volume may only
 *     attach later via an EXACT stored-research match);
 *   - not a bare entity name, not entity+"מדריך", not an attribute/colour/
 *     occasion modifier, not a forced "איך לבחור X" construction;
 *   - meaningfully distinct from published content, pending ideas, and the
 *     existing pool (exact + high-confidence semantic).
 * ONE batched call fills only the pool's deficit; it is skipped entirely when
 * stored evidence already yields enough briefs.
 */

import type { EntityNode, KeywordResearchNode } from './evidence-cluster'
import { normalizePhrase } from './keyword-guard'
import { GENERIC_TOKENS } from './opportunity'
import { distinctiveTokensOf, topicSignature, isHighConfidenceDuplicate, type TopicSignature } from './semantic-dup'
import { containsExternalBusiness, type BrandSafety } from './brand-safety'
import type { OpportunityBrief } from './opportunity-brief'
import { projectContextBlock, type ProjectContext } from './prompt-guidance'

export interface DiscoveryInput {
  language: 'he' | 'en'
  ctx: ProjectContext
  year: number
  deficit: number
  /** Exact owned anchor strings (entity names, category/service names, focus areas). */
  anchors: string[]
  publishedTitles: string[]
  pendingTitles: string[]
}

const NEEDS = ['question', 'comparison', 'how_to', 'problem_solution', 'buyer_guide', 'checklist', 'myths_facts', 'explanation'] as const
const INTENTS = ['informational', 'commercial', 'comparison', 'transactional', 'local'] as const

export function discoveryResponseSchema(anchors: string[]): Record<string, unknown> {
  return {
    type: 'OBJECT',
    properties: {
      needs: {
        type: 'ARRAY',
        items: {
          type: 'OBJECT',
          properties: {
            subject: { type: 'STRING' },
            anchor: { type: 'STRING', enum: anchors },
            need: { type: 'STRING', enum: [...NEEDS] },
            intent: { type: 'STRING', enum: [...INTENTS] },
          },
          required: ['subject', 'anchor', 'need', 'intent'],
        },
      },
    },
    required: ['needs'],
  }
}

export function buildDiscoveryPrompt(input: DiscoveryInput): string {
  const langLabel = input.language === 'he' ? 'Hebrew' : 'English'
  return [
    `You are an SEO strategist doing CONSTRAINED opportunity discovery. Today's year is ${input.year}. Return ALL text in ${langLabel}.`,
    projectContextBlock(input.ctx),
    ``,
    `OWNED ANCHORS (the ONLY allowed subject sources — every proposed need must be anchored to EXACTLY ONE of these strings, verbatim):`,
    JSON.stringify(input.anchors),
    `ALREADY-PUBLISHED titles (do NOT propose anything these already answer):`,
    JSON.stringify(input.publishedTitles.slice(0, 25)),
    `ALREADY-PENDING topics (do NOT propose these or close variants):`,
    JSON.stringify(input.pendingTitles.slice(0, 25)),
    ``,
    `TASK: propose up to ${input.deficit} NEW long-tail SEARCH NEEDS a real user would search, each anchored to one owned anchor. A need is a question, comparison, practical how-to, problem/solution, buyer guide, checklist, myths-vs-facts or focused explanation AROUND the anchor.`,
    `HARD RULES:`,
    `- "subject": a natural multi-word ${langLabel} search phrase for the need. NEVER a bare anchor name, NEVER anchor+"מדריך", NEVER a colour/size/occasion/recipient modifier alone, NEVER the frame "איך לבחור X" unless the choice question is genuinely the need.`,
    `- NEVER mention any business or brand name that is not in the anchors.`,
    `- NEVER claim search volume, demand or popularity.`,
    `- Each need must be meaningfully DISTINCT from the published and pending lists and from the other needs you return.`,
    `- Fewer good needs beat filler — return only defensible needs.`,
    `OUTPUT: ONLY JSON {"needs":[{"subject","anchor","need","intent"}]}.`,
  ].join('\n')
}

export interface DiscoveryCandidate { subject: string; anchor: string; need: string; intent: string }
export interface DiscoveryReconciliation {
  candidates: DiscoveryCandidate[]
  parseFailed: boolean
  emitted: number
  invalidItems: number
  unknownAnchors: string[]
}

export function reconcileDiscovery(text: string, anchors: string[]): DiscoveryReconciliation {
  const anchorSet = new Set(anchors.map((a) => a.trim()))
  const out: DiscoveryReconciliation = { candidates: [], parseFailed: false, emitted: 0, invalidItems: 0, unknownAnchors: [] }
  let parsed: unknown
  try { parsed = JSON.parse(text) } catch {
    const m = (text || '').match(/\{[\s\S]*\}/)
    if (!m) { out.parseFailed = true; return out }
    try { parsed = JSON.parse(m[0]) } catch { out.parseFailed = true; return out }
  }
  const needs = parsed && typeof parsed === 'object' && Array.isArray((parsed as { needs?: unknown }).needs) ? (parsed as { needs: unknown[] }).needs : null
  if (!needs) { out.parseFailed = true; return out }
  out.emitted = needs.length
  for (const n of needs) {
    const o = (n ?? {}) as Record<string, unknown>
    const subject = String(o.subject ?? '').trim()
    const anchor = String(o.anchor ?? '').trim()
    if (!subject || !anchor) { out.invalidItems++; continue }
    if (!anchorSet.has(anchor)) { out.invalidItems++; out.unknownAnchors.push(anchor.slice(0, 60)); continue }
    out.candidates.push({ subject, anchor, need: String(o.need ?? 'explanation'), intent: String(o.intent ?? 'informational') })
  }
  return out
}

export interface DiscoveryValidationCtx {
  anchors: Set<string>
  attributeTokens: Set<string>
  brandSafety: BrandSafety
  isOwnedByEntity: (phrase: string) => boolean
  isCoveredByContent: (title: string, keyword: string) => boolean
  pendingExactKeys: Set<string>
  pendingSignatures: TopicSignature[]
  existingPoolSignatures: TopicSignature[]
  keywordResearch: KeywordResearchNode[]
  relatedEntitiesFor: (subject: string) => { name: string; url?: string | null; type?: string }[]
}

export interface DiscoveryValidationResult {
  accepted: OpportunityBrief[]
  rejected_by_reason: Record<string, number>
  rejected_examples: { subject: string; reason: string }[]
}

const FORCED_CHOICE_RE = /^(?:איך|כיצד)\s+(?:לבחור|בוחרים)\s+\S+$/

/** Deterministic anchoring/ownership/coverage/duplicate gates for DISCOVERED
 *  candidates — every gate typed and counted. Volume attaches ONLY on an exact
 *  stored-research match. */
export function validateDiscoveredCandidates(cands: DiscoveryCandidate[], ctx: DiscoveryValidationCtx): DiscoveryValidationResult {
  const rejected: Record<string, number> = {}
  const examples: { subject: string; reason: string }[] = []
  const reject = (r: string, subject: string) => { rejected[r] = (rejected[r] ?? 0) + 1; if (examples.length < 15) examples.push({ subject: subject.slice(0, 100), reason: r }) }
  const accepted: OpportunityBrief[] = []
  const acceptedSigs: TopicSignature[] = []
  const krByNorm = new Map<string, KeywordResearchNode>()
  for (const kr of ctx.keywordResearch) { const n = normalizePhrase(kr.query || ''); if (n && !krByNorm.has(n)) krByNorm.set(n, kr) }

  for (const c of cands) {
    const subject = c.subject.trim()
    const nSubject = normalizePhrase(subject)
    if (!ctx.anchors.has(c.anchor.trim())) { reject('discovery_unanchored', subject); continue }
    const toks = distinctiveTokensOf(subject)
    if (toks.length < 2) { reject('discovery_subject_too_generic', subject); continue }
    if (toks.every((t) => GENERIC_TOKENS.has(t) || ctx.attributeTokens.has(t))) { reject('discovery_modifier_only', subject); continue }
    // Bare anchor / anchor+"מדריך" / forced choice-frame constructions.
    const nAnchor = normalizePhrase(c.anchor)
    const withoutGuide = nSubject.replace(/\s*מדריך\s*/g, ' ').replace(/\s+/g, ' ').trim()
    if (nSubject === nAnchor || withoutGuide === nAnchor) { reject('discovery_bare_entity', subject); continue }
    if (FORCED_CHOICE_RE.test(subject)) { reject('discovery_forced_choice_frame', subject); continue }
    if (containsExternalBusiness(subject, ctx.brandSafety)) { reject('discovery_external_business', subject); continue }
    if (ctx.isOwnedByEntity(subject)) { reject('exact_existing_keyword_owner', subject); continue }
    if (ctx.pendingExactKeys.has(nSubject)) { reject('pending_exact_duplicate', subject); continue }
    if (ctx.isCoveredByContent(subject, subject)) { reject('covered_by_existing_content', subject); continue }
    const sig = topicSignature(subject, c.intent)
    if (ctx.pendingSignatures.some((p) => isHighConfidenceDuplicate(sig, p))) { reject('pending_semantic_duplicate', subject); continue }
    if (ctx.existingPoolSignatures.some((p) => isHighConfidenceDuplicate(sig, p)) || acceptedSigs.some((p) => isHighConfidenceDuplicate(sig, p))) { reject('brief_semantic_duplicate', subject); continue }

    // Volume ONLY via an exact stored-research match — discovery never claims it.
    const exact = krByNorm.get(nSubject)
    const aligned = exact && (exact.volume ?? 0) > 0 ? { query: exact.query, volume: exact.volume as number } : null
    acceptedSigs.push(sig)
    accepted.push({
      opportunityId: `disc_${(() => { let h = 0x811c9dc5; for (let i = 0; i < nSubject.length; i++) { h ^= nSubject.charCodeAt(i); h = Math.imul(h, 0x01000193) } return (h >>> 0).toString(36) })()}`,
      subject,
      searchNeed: c.need === 'comparison' ? 'comparison' : c.need === 'how_to' ? 'care_howto' : c.need === 'buyer_guide' ? 'selection' : c.need === 'question' ? 'question' : 'informational',
      family: c.need === 'comparison' || c.need === 'buyer_guide' ? 'comparison' : 'informational',
      sourceEvidence: [{ kind: 'site_scan', text: c.anchor }],
      alignedDemandQuery: aligned,
      demandVolumeSource: aligned ? 'keyword_research_cache' : null,
      intendedIntent: (['informational', 'commercial', 'comparison', 'transactional', 'local'].includes(c.intent) ? c.intent : 'informational') as OpportunityBrief['intendedIntent'],
      intendedPageType: 'article',
      existingContentGap: true,
      relatedEntities: ctx.relatedEntitiesFor(subject).slice(0, 6),
      publishedCoverage: [],
      confidence: aligned ? 0.85 : 0.55,
      briefScore: aligned ? 0.6 : 0.35,
    })
  }
  return { accepted, rejected_by_reason: rejected, rejected_examples: examples }
}
