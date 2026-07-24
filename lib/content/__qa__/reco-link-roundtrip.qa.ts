/**
 * End-to-end LINK-ROLE contract round-trip QA (P0 Parts B/C/E/F/L) — offline.
 * Proves the ACTUAL data path that was losing roles: mapper → canonical LinkPlan →
 * suggestion → persistence payload (content_topic_ideas.link_plan JSONB) → reload
 * (ideaToSuggestion) → render model. Commercial/supporting roles must survive the
 * round trip identically; the primary must never appear under supporting; a duplicate-
 * of-primary secondary must be gone after reload; recommendedPageType/demandEvidence
 * survive; and a pre-migration row (no link_plan) must load safely.
 */
import { mapLinkRoles, buildLinkPlan, type LinkCandidateEntity } from '../recommendations/link-role-mapper'
import { ideaToSuggestion } from '../recommendations/topic-idea-store'
import { manualAnchorShapeValid } from '../internal-links'
import type { ContentTopicIdeaRow } from '@/lib/supabase/types'
import type { TopicSuggestion, LinkPlan } from '../recommendations/types'

let pass = 0, fail = 0
function check(name: string, cond: boolean, detail?: string) {
  if (cond) { pass++; console.log(`  ✓ ${name}`) } else { fail++; console.log(`  ✗ ${name}${detail ? ` — ${detail}` : ''}`) }
}

/** Simulate persistence: the exact JSONB written to content_topic_ideas.link_plan. */
function persistedRow(s: TopicSuggestion): ContentTopicIdeaRow {
  const link_plan = s.linkPlan ? { linkPlan: s.linkPlan, recommendedPageType: s.recommendedPageType, demandEvidence: s.demandEvidence, confidenceLevel: s.confidenceLevel, discoveryGenerated: s.discoveryGenerated, businessRelevance: s.businessRelevance } : null
  return {
    id: 'idea-1', user_id: 'u', project_id: 'p', source: 'hybrid', batch_id: 'b',
    title: s.title, primary_keyword: s.primaryKeyword, secondary_keywords: s.secondaryKeywords,
    search_intent: s.searchIntent, angle: s.angle, recommended_word_count: s.recommendedWordCount,
    suggested_internal_links: s.suggestedInternalLinks, link_plan,
    suggestion_reason: s.suggestionReason, source_context: null,
    source_url: s.suggestedInternalLinks[0]?.url ?? null, score: s.suggestionScore,
    fingerprint: 'fp', status: 'pending', approved_topic_id: null, rejected_at: null,
    approved_at: null, created_at: '', updated_at: '',
  }
}

async function main() {
  console.log('A) roles survive mapper → LinkPlan → persistence → reload')
  {
    const candidates: LinkCandidateEntity[] = [
      { url: '/p/alstro', title: 'זר אלסטרומריה בצבעים משתנים', type: 'product' },
      { url: '/c/alstro', title: 'קטגוריית אלסטרומריה', type: 'category' },
      { url: '/blog/alstro-care', title: 'טיפוח אלסטרומריה מדריך', type: 'post' },
      { url: '/p/champagne', title: 'זר שמפנייה', type: 'product' },
    ]
    const mapped = mapLinkRoles('זר אלסטרומריה בצבעים משתנים', 'איך לבחור זר אלסטרומריה בצבעים משתנים לאירוע', candidates)
    const linkPlan = buildLinkPlan(mapped)
    check('mapper assigns the exact product as PRIMARY commercial target', linkPlan.primaryCommercialTarget?.url === '/p/alstro', linkPlan.primaryCommercialTarget?.url ?? 'null')

    const suggestion: TopicSuggestion = {
      id: 'x', title: 'איך לבחור זר אלסטרומריה בצבעים משתנים לאירוע', primaryKeyword: 'זר אלסטרומריה בצבעים משתנים',
      secondaryKeywords: ['אלסטרומריה לחתונה', 'זר אלסטרומריה בצבעים משתנים' /* dup of primary */],
      searchIntent: 'informational', recommendedWordCount: 1000, angle: '',
      suggestedInternalLinks: [], moneyTargetUrl: linkPlan.primaryCommercialTarget?.url ?? null,
      source: 'hybrid', suggestionReason: 'r', suggestionScore: 0.8,
      confidenceLevel: 'high_confidence', recommendedPageType: 'article',
      demandEvidence: { demandEvidenceAvailable: true, demandQuery: 'זר אלסטרומריה', avgMonthlySearches: 210, demandConfidence: 'high' },
      linkPlan,
    }

    // Persist → reload.
    const reloaded = ideaToSuggestion(persistedRow(suggestion))
    check('B/E. primary commercial target survives reload (not null)', reloaded.linkPlan?.primaryCommercialTarget?.url === '/p/alstro')
    check('B/E. moneyTargetUrl reconstructed from the persisted plan', reloaded.moneyTargetUrl === '/p/alstro')
    check('B/E. secondary commercial target (category) survives with its role', !!reloaded.linkPlan?.secondaryCommercialTargets.some((tt) => tt.url === '/c/alstro'))
    check('B/E. supporting informational link survives with its role', !!reloaded.linkPlan?.supportingInformationalLinks.some((tt) => tt.url === '/blog/alstro-care'))
    check('C. NO role flattening — the plan is role-typed after reload', !!reloaded.linkPlan && Array.isArray(reloaded.linkPlan.supportingInformationalLinks))
    check('D-render. the primary is NEVER under supporting after reload', !reloaded.linkPlan?.supportingInformationalLinks.some((tt) => tt.url === '/p/alstro') && !reloaded.linkPlan?.secondaryCommercialTargets.some((tt) => tt.url === '/p/alstro'))
    check('F. duplicate-of-primary secondary keyword removed after round trip', !reloaded.secondaryKeywords.some((k) => k === 'זר אלסטרומריה בצבעים משתנים') && reloaded.secondaryKeywords.includes('אלסטרומריה לחתונה'))
    check('J. recommendedPageType survives reload', reloaded.recommendedPageType === 'article')
    check('E. demandEvidence survives reload', reloaded.demandEvidence?.avgMonthlySearches === 210)
    check('ordered links (legacy consumers) rebuilt from the plan, primary first', reloaded.suggestedInternalLinks[0]?.url === '/p/alstro')
  }

  console.log('B) primary-null message only when truly null; pre-migration row loads safely')
  {
    // No commercial candidate → primaryCommercialTarget genuinely null.
    const mapped = mapLinkRoles('טיפים לשמירת פרחים', 'טיפים לשמירת פרחים בבית', [{ url: '/blog/care', title: 'שמירת פרחים מדריך', type: 'post' }])
    const plan = buildLinkPlan(mapped)
    check('primary is null ONLY when no commercial target exists', plan.primaryCommercialTarget === null)

    // A legacy row with NO link_plan must still load (flat links, null primary), no crash.
    const legacy = { id: 'l', user_id: 'u', project_id: 'p', source: 'project_data', batch_id: 'b', title: 'נושא ישן', primary_keyword: 'מילת מפתח', secondary_keywords: ['מילת מפתח', 'משני'], search_intent: 'informational', angle: null, recommended_word_count: null, suggested_internal_links: [{ url: '/x', anchor: 'x' }], link_plan: null, suggestion_reason: null, source_context: null, source_url: '/x', score: null, fingerprint: 'fp', status: 'pending', approved_topic_id: null, rejected_at: null, approved_at: null, created_at: '', updated_at: '' } as ContentTopicIdeaRow
    const r = ideaToSuggestion(legacy)
    check('pre-migration row loads safely (no linkPlan, flat links preserved)', r.linkPlan === undefined && r.suggestedInternalLinks.length === 1)
    check('F. duplicate-of-primary secondary removed even for legacy rows', !r.secondaryKeywords.includes('מילת מפתח') && r.secondaryKeywords.includes('משני'))
  }

  console.log('F) first-click invalid_anchor — canonicalized row sources checkable links from the canonical column')
  {
    // A row that was CANONICALIZED: the link_plan targets carry NON-canonical anchors
    // (single-word titles that FAIL manualAnchorShapeValid), a linkPreviewSnapshot is
    // present, and the suggested_internal_links column holds the planner-derived
    // CANONICAL anchors (2–6 content words) that bulk-save validates.
    const nonCanonicalPlan: LinkPlan = {
      primaryCommercialTarget: { url: '/p/alstro', title: 'shop', pageType: 'product', role: 'primary_commercial_target', score: 1, reason: 'r' },
      secondaryCommercialTargets: [{ url: '/c/alstro', title: 'category', pageType: 'category', role: 'secondary_commercial_target', score: 1, reason: 'r' }],
      supportingInformationalLinks: [{ url: '/blog/alstro-care', title: 'guide', pageType: 'post', role: 'supporting_informational_link', score: 1, reason: 'r' }],
      sourceReferences: [],
    }
    // Prove the plan titles are genuinely non-canonical (the pre-fix source of the bug).
    check('setup: plan target titles FAIL manualAnchorShapeValid (single generic words)',
      !manualAnchorShapeValid('shop') && !manualAnchorShapeValid('category') && !manualAnchorShapeValid('guide'))

    const canonicalColumn = [
      { url: '/p/alstro', anchor: 'blue alstroemeria bouquet' },
      { url: '/c/alstro', anchor: 'alstroemeria flower category' },
    ]
    const canonicalRow = {
      id: 'canon-1', user_id: 'u', project_id: 'p', source: 'hybrid', batch_id: 'b',
      title: 'choosing a colorful alstroemeria bouquet', primary_keyword: 'blue alstroemeria bouquet',
      secondary_keywords: ['alstroemeria for weddings'], search_intent: 'informational', angle: null,
      recommended_word_count: 1000, suggested_internal_links: canonicalColumn,
      link_plan: { linkPlan: nonCanonicalPlan, recommendedPageType: 'article', linkPreviewSnapshot: { scannerVersion: 'v9', scanCompletedAt: '2026-01-01T00:00:00Z' } },
      suggestion_reason: 'r', source_context: null, source_url: '/p/alstro', score: 0.8,
      fingerprint: 'fp', status: 'pending', approved_topic_id: null, rejected_at: null, approved_at: null, created_at: '', updated_at: '',
    } as ContentTopicIdeaRow

    const reloaded = ideaToSuggestion(canonicalRow)
    check('F. reloaded checkable links equal the persisted CANONICAL column (not plan titles)',
      JSON.stringify(reloaded.suggestedInternalLinks) === JSON.stringify(canonicalColumn))
    check('F. every reloaded anchor passes manualAnchorShapeValid (no first-click invalid_anchor)',
      reloaded.suggestedInternalLinks.length === 2 && reloaded.suggestedInternalLinks.every((l) => manualAnchorShapeValid(l.anchor)))
    check('F. the non-canonical plan-title anchors are NOT used after reload',
      !reloaded.suggestedInternalLinks.some((l) => ['shop', 'category', 'guide'].includes(l.anchor)))
    // linkPlan is retained ONLY for role / moneyTargetUrl.
    check('F. linkPlan still reconstructed for roles', !!reloaded.linkPlan?.primaryCommercialTarget && reloaded.linkPlan.primaryCommercialTarget.url === '/p/alstro')
    check('F. moneyTargetUrl still reconstructed from the plan', reloaded.moneyTargetUrl === '/p/alstro')
    check('F. linkPreviewSnapshot survives reload (reviewed-snapshot identity intact)', reloaded.linkPreviewSnapshot?.scannerVersion === 'v9')
  }

  console.log('G) no-snapshot fallback — a NEVER-canonicalized row keeps plan-derived links')
  {
    // Same divergence, but NO linkPreviewSnapshot → the row was never canonicalized, so
    // the historic plan-derived fallback is preserved (the column may be empty/stale).
    const plan: LinkPlan = {
      primaryCommercialTarget: { url: '/p/x', title: 'blue peony bouquet', pageType: 'product', role: 'primary_commercial_target', score: 1, reason: 'r' },
      secondaryCommercialTargets: [], supportingInformationalLinks: [], sourceReferences: [],
    }
    const noSnapshotRow = {
      id: 'nosnap-1', user_id: 'u', project_id: 'p', source: 'hybrid', batch_id: 'b',
      title: 'peony guide', primary_keyword: 'blue peony bouquet', secondary_keywords: [],
      search_intent: 'informational', angle: null, recommended_word_count: 1000,
      // Column is empty here — the fallback MUST come from the plan, not the column.
      suggested_internal_links: [], link_plan: { linkPlan: plan, recommendedPageType: 'article' },
      suggestion_reason: 'r', source_context: null, source_url: null, score: 0.5,
      fingerprint: 'fp', status: 'pending', approved_topic_id: null, rejected_at: null, approved_at: null, created_at: '', updated_at: '',
    } as ContentTopicIdeaRow

    const reloaded = ideaToSuggestion(noSnapshotRow)
    check('G. no snapshot → checkable links derived from the plan (fallback unchanged)',
      reloaded.suggestedInternalLinks.length === 1 && reloaded.suggestedInternalLinks[0]?.url === '/p/x' && reloaded.suggestedInternalLinks[0]?.anchor === 'blue peony bouquet')
    check('G. plan roles + moneyTargetUrl still present', reloaded.moneyTargetUrl === '/p/x' && !!reloaded.linkPlan?.primaryCommercialTarget)
  }

  console.log(`\n${pass} passed, ${fail} failed`)
  if (fail > 0) process.exitCode = 1
}
main()
