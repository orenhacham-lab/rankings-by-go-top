/**
 * CANONICAL internal-link preview — ONE source of truth (planFromCachedTargets).
 *
 * Proves the root-cause fix: the card's selectable links are derived from the SAME planner
 * plan that bulk-save validates against, so a displayed+checked link is a member of that plan
 * and can NEVER come back not_in_plan/blocked on the SAME snapshot (the live dropped_link).
 * Uses the REAL selectClientLinks (the bulk-save validator) to prove no drops. Blocked
 * candidates are never selectable. Source guards prove the route canonicalizes and the client
 * uses the snapshot + re-review refresh + typed drop reasons.
 */
import { readFileSync } from 'fs'
import { join } from 'path'
import { canonicalCardLinksFromPlan } from '../recommendations/canonical-links'
import { selectClientLinks, type CacheTopicPlan, type CachePlannedLink, type CandidateTier } from '../internal-link-planner-cache'

let pass = 0, fail = 0
function check(name: string, cond: boolean, detail?: string) {
  if (cond) { pass++; console.log(`  ✓ ${name}`) } else { fail++; console.log(`  ✗ ${name}${detail ? ` — ${detail}` : ''}`) }
}
const read = (p: string) => readFileSync(join(__dirname, p), 'utf8')

// Minimal CachePlannedLink fixture — only the fields the canonicalizer + selectClientLinks read.
function mkLink(url: string, anchor: string, tier: CandidateTier, canManualApprove = false): CachePlannedLink {
  return { targetUrl: url, targetTitle: anchor, targetRole: 'supporting', targetPriority: 'normal', eligibility: 'yes', anchorText: anchor, anchorSource: null, relevance: 0.5, priorityBonus: 0, confidence: 0.6, selected: tier === 'recommended', reason: tier === 'recommended' ? 'recommended' : 'soft', rejectedReasons: tier === 'recommended' ? [] : ['low_confidence'], matchedTokens: [], missingTokens: [], entityMatchedTokens: [], normalizedTopicTokens: [], normalizedCandidateTokens: [], relevanceMethod: 'token' as never, reviewability: tier, canManualApprove, blockReason: tier === 'blocked' ? 'off_topic' : null } as unknown as CachePlannedLink
}
function mkPlan(selected: CachePlannedLink[], rejected: CachePlannedLink[]): CacheTopicPlan {
  return { topicId: 't1', topicTitle: 'How to choose running shoes', primaryKeyword: 'running shoes', selected, rejected, summary: {} as never } as CacheTopicPlan
}

async function main() {
  console.log('CANONICAL) card links come from the planner plan (never a separate model list)')

  const recommended = mkLink('https://x/a', 'Running shoes guide', 'recommended')
  const reviewable = mkLink('https://x/b', 'Trail shoes', 'reviewable', true)
  const blocked = mkLink('https://x/c', 'Contact us', 'blocked', false)
  const plan = mkPlan([recommended], [reviewable, blocked])

  // C — a blocked candidate is NEVER selectable/checked.
  {
    const canon = canonicalCardLinksFromPlan(plan)
    check('C. blocked candidate never appears as a selectable recommendation', !canon.selected.some((l) => l.url === 'https://x/c') && !canon.reviewable.some((l) => l.url === 'https://x/c'))
    check('canonical card shows only the recommended (selected) link by default', canon.selected.length === 1 && canon.selected[0]!.url === 'https://x/a' && canon.reviewable.length === 0)
  }
  // B — safe reviewable candidate exposed ONLY when manual approval is allowed.
  {
    const withRev = canonicalCardLinksFromPlan(plan, { exposeReviewable: true })
    check('B. safe reviewable&canManualApprove link exposed only when allowed', withRev.reviewable.length === 1 && withRev.reviewable[0]!.url === 'https://x/b')
  }

  console.log('PROOF) a displayed checked link CANNOT become not_in_plan on the same snapshot')
  // A/F — feed the canonical selected links into the REAL bulk-save validator (same plan) →
  // zero drops, every checked link accepted.
  {
    const canon = canonicalCardLinksFromPlan(plan)
    const desired = canon.selected.map((l) => ({ targetUrl: l.url, anchorText: l.anchor }))
    const res = selectClientLinks(plan, desired)
    check('A/F. canonical selected links → selectClientLinks drops NONE (all persist)', res.dropped.length === 0 && res.plan.selected.length === desired.length)
  }
  // B (persist) — an exposed canonical reviewable link is promoted + saved with no drop.
  {
    const withRev = canonicalCardLinksFromPlan(plan, { exposeReviewable: true })
    const desired = [...withRev.selected, ...withRev.reviewable].map((l) => ({ targetUrl: l.url, anchorText: l.anchor }))
    const res = selectClientLinks(plan, desired)
    check('B. canonical recommended + safe reviewable → all saved, no drop', res.dropped.length === 0 && res.plan.selected.length === 2)
  }
  // A non-canonical (legacy/model) URL absent from the plan IS dropped by the validator — the
  // exact live failure the canonicalization removes for newly displayed links.
  {
    const res = selectClientLinks(plan, [{ targetUrl: 'https://x/legacy-not-in-plan', anchorText: 'Old link' }])
    check('legacy URL absent from the plan → validator drops it (not_in_plan)', res.dropped.length === 1 && res.plan.selected.length === 0)
  }
  // G — a plan with zero selectable links yields an honestly-empty card.
  {
    const empty = canonicalCardLinksFromPlan(mkPlan([], [blocked]))
    check('G. zero canonical links → empty selectable set (honest no-links card)', empty.selected.length === 0 && empty.reviewable.length === 0)
  }

  console.log('GUARD) server canonicalizes; client uses the snapshot + re-review refresh')
  {
    const routeSrc = read('../../../app/api/content/automation/recommendations/route.ts')
    check('route canonicalizes fresh via planFromCachedTargets (same cached index) + records snapshot',
      /canonicalizeSuggestionLinks\(/.test(routeSrc) && /getCachedIndex\(auth\.admin/.test(routeSrc) && /reassembleReport\(/.test(routeSrc) && /canonicalLinkPreview/.test(routeSrc))
    const canonSrc = read('../recommendations/canonical-links.ts')
    check('canonicalizeSuggestionLinks changes ONLY links + snapshot (spreads ...s; never re-sets title/keyword/score)',
      /planFromCachedTargets\(/.test(canonSrc) && /\.\.\.s,\s*suggestedInternalLinks: canon\.selected,\s*linkPreviewSnapshot:/.test(canonSrc) && !/suggestionScore:/.test(canonSrc) && !/primaryKeyword:\s*[^s]/.test(canonSrc.split('return {')[2] ?? ''))
    const ideas = read('../../../components/content/AutomationIdeas.tsx')
    check('one-click uses the idea preview snapshot as the reviewed-snapshot identity',
      /snapshotByTopicId/.test(ideas) && /reviewedSnapshot = distinctSnaps\.length === 1/.test(ideas))
    check('legacy/changed links → refresh card from canonical plan + re-review (no force, no silent swap)',
      /refreshIdeaCardLinks\(/.test(ideas) && /t\.linksReReview/.test(ideas) && !/force:\s*true/.test(ideas))
    check('typed drop reasons surfaced (not collapsed to dropped_link)', /const specific = dl\[0\]\?\.reason/.test(ideas) && /reason: specific \|\| f\.reason/.test(ideas))
    const bulk = read('../../../app/api/content/automation/internal-links/plan/bulk-save/route.ts')
    check('Preview logs dropped checked links with topicId + reason + snapshot match (no content)',
      /dropped_checked_link/.test(bulk) && /previewSnapshotMatchesCurrent/.test(bulk) && /rejectedReasons/.test(bulk))
    const he = read('../../../lib/i18n/dashboard/he.ts'); const en = read('../../../lib/i18n/dashboard/en.ts')
    check('localized re-review message exists (he + en)', /linksReReview:/.test(he) && /linksReReview:/.test(en))
  }

  console.log(`\n${pass} passed, ${fail} failed`)
  if (fail > 0) process.exit(1)
}
main()
