/**
 * finalizeRecommendationAttempt — the recommendations route's deterministic
 * post-processing, extracted VERBATIM (Increment 2) so a Flash and a Pro attempt can
 * be finalized through the exact same code, non-persisting. This is pure code motion:
 * the guard / salvage / coverage / keyword-collision / intra-run-dedup rules, their
 * order, and the resulting suggestion order are unchanged. No persistence here.
 *
 * The route now calls this once → identical behavior. The QA comparison harness
 * (Increment 4) calls it per attempt with a FRESH cloned guard so attempts stay
 * independent (this function mutates guard.keywords/titles for intra-batch dedup,
 * exactly as the inline route did).
 */
import type { TopicSuggestion } from './types'
import { normalizeText } from './topic-idea-store'
import { keywordSourcesOf, keywordOriginsOf, coveredByExistingContent, ownedByExistingEntity, type KeywordOriginEntry, type KeywordGuard } from './keyword-guard'
import { evaluateArticleWorthiness, type ExistingPageSignal, type SearchIntent } from './opportunity'
import { salvageLongTailKeyword } from './keyword-salvage'
import { dedupeIntraRunSemantic } from './intra-run-dedupe'
import { ExistingCorpus } from './dedupe'

export interface FinalizeSnapshot { guard: KeywordGuard; existingPages: ExistingPageSignal[] }

/** Per-engine-suggestion finalization outcome (additive telemetry for unique-briefId
 *  rescue accounting; does NOT affect filtering). `reason` uses the route post-
 *  processing reason vocabulary. */
export interface FinalizationOutcome { title: string; primaryKeyword: string; removed: boolean; reason?: string }

export interface FinalizedAttemptResult {
  finalSuggestions: TopicSuggestion[]
  filteredPrimaryKeywordExists: number
  filteredTitleExists: number
  filteredCoveredByContent: number
  exactTopicDuplicates: number
  trueContentCoverage: number
  exactExistingKeywordOwner: number
  sourceOnlyEntityExpansion: number
  cannibalizationReviews: number
  keywordCollisionCandidates: number
  keywordCollisionSalvaged: number
  keywordCollisionStillRejected: number
  salvagedExamples: { title: string; from: string; to: string }[]
  filteredExamples: { title: string; primaryKeyword: string; reason: string; sources: string[] }[]
  primaryKeywordMatches: { ideaTitle: string; ideaPrimaryKeyword: string; normalizedPrimaryKeyword: string; ideaSourceContext: string; ideaSuggestedUrl: string | null; rule: 'exact_normalized_primary_keyword'; matches: KeywordOriginEntry[] }[]
  intraRun: ReturnType<typeof dedupeIntraRunSemantic>
  rejectionClassification: {
    exactTopicDuplicates: number; trueContentCoverage: number; exactExistingKeywordOwner: number
    sourceOnlyEntityExpansion: number; cannibalizationReviews: number; keywordCollisionCandidates: number
    keywordCollisionSalvaged: number; keywordCollisionStillRejected: number
    salvagedExamples: { title: string; from: string; to: string }[]
    intraRunSemanticCollisions: number; intraRunCandidatesRemoved: number; intraRunCandidatesMerged: number
    intraRunCollisions: ReturnType<typeof dedupeIntraRunSemantic>['collisions']
  }
  /** Additive: the fate of every engine suggestion (accepted / postproc_rejected + reason). */
  finalizationOutcomes: FinalizationOutcome[]
}

export function finalizeRecommendationAttempt(snapshot: FinalizeSnapshot, engineSuggestions: TopicSuggestion[]): FinalizedAttemptResult {
  const { guard, existingPages } = snapshot
  let filteredPrimaryKeywordExists = 0
  let filteredTitleExists = 0
  let filteredCoveredByContent = 0
  let exactTopicDuplicates = 0
  let trueContentCoverage = 0
  let exactExistingKeywordOwner = 0
  let sourceOnlyEntityExpansion = 0
  let cannibalizationReviews = 0
  let keywordCollisionCandidates = 0
  let keywordCollisionSalvaged = 0
  let keywordCollisionStillRejected = 0
  const salvagedExamples: { title: string; from: string; to: string }[] = []
  const ownedKeywordCorpus = new ExistingCorpus()
  for (const k of guard.keywords) ownedKeywordCorpus.add(k)
  const salvageChecks = {
    isOwnedKeyword: (nk: string) => guard.keywords.has(nk),
    isSemanticKeywordDup: (kw: string) => ownedKeywordCorpus.isDuplicate(kw),
    isCoveredByContent: (title: string, kw: string) => coveredByExistingContent(guard, title, kw) || ownedByExistingEntity(guard, kw),
  }
  const filteredExamples: { title: string; primaryKeyword: string; reason: string; sources: string[] }[] = []
  const primaryKeywordMatches: FinalizedAttemptResult['primaryKeywordMatches'] = []
  const finalizationOutcomes: FinalizationOutcome[] = []

  let fresh = engineSuggestions.filter((s) => {
    const nt = normalizeText(s.title)
    let nk = normalizeText(s.primaryKeyword)
    const rec = (removed: boolean, reason?: string) => { finalizationOutcomes.push({ title: s.title, primaryKeyword: s.primaryKeyword, removed, reason }) }
    const pushEx = (reason: string) => { if (filteredExamples.length < 10) filteredExamples.push({ title: s.title, primaryKeyword: s.primaryKeyword, reason, sources: keywordSourcesOf(guard, s.primaryKeyword) }) }
    if (nt && guard.titles.has(nt)) { exactTopicDuplicates++; filteredTitleExists++; pushEx('title_exists'); rec(true, 'title_exists'); return false }
    if (ownedByExistingEntity(guard, s.primaryKeyword)) { exactExistingKeywordOwner++; pushEx('exact_existing_keyword_owner'); rec(true, 'exact_existing_keyword_owner'); return false }
    if (existingPages.length > 0) {
      const w = evaluateArticleWorthiness({
        primaryKeyword: s.primaryKeyword, title: s.title, secondaryKeywords: s.secondaryKeywords,
        intent: (s.searchIntent as SearchIntent) || 'informational', existingPages,
        hasEvidence: true, businessRelevant: true,
      })
      if (!w.ok && (w.rejection_reason === 'source_only_entity_expansion' || w.rejection_reason === 'weak_entity_modifier')) {
        sourceOnlyEntityExpansion++; pushEx(w.rejection_reason); rec(true, w.rejection_reason); return false
      }
      if (w.cannibalization.outcome === 'review') cannibalizationReviews++
    }
    if (coveredByExistingContent(guard, s.title, s.primaryKeyword)) { trueContentCoverage++; filteredCoveredByContent++; pushEx('covered_by_existing_content'); rec(true, 'covered_by_existing_content'); return false }
    if (nk && guard.contentKeywords.has(nk)) { trueContentCoverage++; filteredCoveredByContent++; pushEx('content_keyword_owned'); rec(true, 'content_keyword_owned'); return false }
    if (nk && guard.keywords.has(nk)) {
      keywordCollisionCandidates++
      const salv = salvageLongTailKeyword({ title: s.title, primaryKeyword: s.primaryKeyword, secondaryKeywords: s.secondaryKeywords }, salvageChecks)
      if (salv.ok && salv.keyword) {
        keywordCollisionSalvaged++
        if (salvagedExamples.length < 10) salvagedExamples.push({ title: s.title, from: s.primaryKeyword, to: salv.keyword })
        s.primaryKeyword = salv.keyword
        nk = normalizeText(salv.keyword)
      } else {
        keywordCollisionStillRejected++
        filteredPrimaryKeywordExists++
        pushEx('primary_keyword_exists')
        if (primaryKeywordMatches.length < 20) {
          const origins = keywordOriginsOf(guard, s.primaryKeyword)
          primaryKeywordMatches.push({
            ideaTitle: s.title, ideaPrimaryKeyword: s.primaryKeyword, normalizedPrimaryKeyword: normalizeText(s.primaryKeyword),
            ideaSourceContext: s.suggestionReason || '', ideaSuggestedUrl: s.suggestedInternalLinks[0]?.url ?? null,
            rule: 'exact_normalized_primary_keyword',
            matches: origins.length ? origins : [{ source: 'idea_keyword', original: s.primaryKeyword, status: 'intra_batch_earlier_idea', detail: '' }],
          })
        }
        rec(true, 'primary_keyword_exists'); return false
      }
    }
    if (nk) { guard.keywords.add(nk); ownedKeywordCorpus.add(nk) }
    if (nt) guard.titles.add(nt)
    rec(false); return true
  })

  const intraRun = dedupeIntraRunSemantic(fresh)
  const survivorSet = new Set(intraRun.survivors)
  // record intra-run removals additively (survivors kept; the rest were removed/merged)
  for (const o of finalizationOutcomes) {
    if (!o.removed && !intraRun.survivors.some((s) => s.title === o.title && s.primaryKeyword === o.primaryKeyword)) {
      // it passed the guard filter but did not survive intra-run dedup
      o.removed = true; o.reason = 'intra_run_removed'
    }
  }
  void survivorSet
  fresh = intraRun.survivors

  const rejectionClassification = {
    exactTopicDuplicates, trueContentCoverage, exactExistingKeywordOwner, sourceOnlyEntityExpansion,
    cannibalizationReviews, keywordCollisionCandidates, keywordCollisionSalvaged, keywordCollisionStillRejected, salvagedExamples,
    intraRunSemanticCollisions: intraRun.collisions.length,
    intraRunCandidatesRemoved: intraRun.removed,
    intraRunCandidatesMerged: intraRun.merged,
    intraRunCollisions: intraRun.collisions.slice(0, 10),
  }

  return {
    finalSuggestions: fresh,
    filteredPrimaryKeywordExists, filteredTitleExists, filteredCoveredByContent,
    exactTopicDuplicates, trueContentCoverage, exactExistingKeywordOwner, sourceOnlyEntityExpansion, cannibalizationReviews,
    keywordCollisionCandidates, keywordCollisionSalvaged, keywordCollisionStillRejected, salvagedExamples,
    filteredExamples, primaryKeywordMatches, intraRun, rejectionClassification, finalizationOutcomes,
  }
}
