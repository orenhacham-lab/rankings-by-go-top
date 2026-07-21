/**
 * Per-head admission cap — DOMAIN-NEUTRAL default (Best Gifts root-cause fix).
 *
 * Root cause (proven live + from code): buildBriefPool applied a FIXED
 * maxPerSubjectHead = 2 by default, keyed on the construct-state head (first token).
 * In Hebrew a broad ecommerce head carries the distinguishing facet as a MODIFIER
 * ("מתנות ל<recipient>"), so distinct recipient/occasion needs share the head "מתנ"
 * and competed for only two admission slots — even though the need-aware
 * isHighConfidenceDuplicate gate (which runs immediately BEFORE the head cap) already
 * kept them distinct (non-overlapping modifiers). Narrow near-duplicate variants
 * ("תיקון ניאגרה סמויה <brand>") share head AND modifiers, so that same need-aware gate
 * still collapses them without any head cap.
 *
 * The ONLY change: when a caller does not pass maxPerSubjectHead, NO fixed per-head cap
 * is applied. The cap remains available as an explicit optional safeguard. Nothing else
 * changed — need-aware dedup, ownership, coverage, pending blocking, scoring, ordering,
 * interleaving and intendedPageType are all untouched.
 */
import { readFileSync } from 'fs'
import { join } from 'path'
import { buildBriefPool } from '../recommendations/opportunity-brief'
import { normalizePhrase } from '../recommendations/keyword-guard'
import { topicSignature } from '../recommendations/semantic-dup'

let pass = 0, fail = 0
function check(name: string, cond: boolean, detail?: string) {
  if (cond) { pass++; console.log(`  ✓ ${name}`) } else { fail++; console.log(`  ✗ ${name}${detail ? ` — ${detail}` : ''}`) }
}

type Opts = Partial<Parameters<typeof buildBriefPool>[0]>
const kr = (qs: string[]) => qs.map((q, i) => ({ query: q, volume: 100 + i }))
const baseInput = (o: Opts = {}): Parameters<typeof buildBriefPool>[0] => ({
  language: 'he', keywordResearch: [], trackedKeywords: [], projectFocus: [], entities: [],
  publishedCoverage: [], pendingExactKeys: new Set<string>(), pendingSignatures: [],
  isOwnedByEntity: () => false, isCoveredByContent: () => false,
  domainTypeWords: new Set<string>(), attributeTokens: new Set<string>(), ...o,
})
const subjects = (r: ReturnType<typeof buildBriefPool>) => r.pool.map((b) => b.subject)
const rej = (r: ReturnType<typeof buildBriefPool>) => r.diagnostics.rejected_by_reason

function main() {
  console.log('A) broad shared-head ecommerce — distinct recipient/occasion needs stay eligible')
  const gifts = ['מתנות לגבר', 'מתנות לאישה', 'מתנות לילדים', 'מתנות לעסקים', 'מתנות לסבא', 'מתנות לאמא בת 60']
  {
    const r = buildBriefPool(baseInput({ keywordResearch: kr(gifts) })) // DEFAULT (no opts)
    const s = subjects(r)
    check('A. all 6 distinct-recipient gift needs are admitted by DEFAULT', gifts.every((g) => s.includes(g)) && r.pool.length === 6, JSON.stringify(s))
    check('A. none rejected as subject_head_cap (no domain-blind default cap)', (rej(r).subject_head_cap ?? 0) === 0, JSON.stringify(rej(r)))
  }

  console.log('B) narrow equivalent service variants — need-aware dedup STILL collapses them')
  {
    const r = buildBriefPool(baseInput({ keywordResearch: kr(['תיקון ניאגרה סמויה jomo', 'תיקון ניאגרה סמויה oli', 'תיקון ניאגרה סמויה פלסאון']) }))
    check('B. only ONE brand variant admitted; the other two are brief_semantic_duplicate',
      r.pool.length === 1 && (rej(r).brief_semantic_duplicate ?? 0) === 2 && (rej(r).subject_head_cap ?? 0) === 0, JSON.stringify({ pool: subjects(r), rejected: rej(r) }))
  }

  console.log('C) distinct plumbing needs — different heads, all remain separate')
  {
    const needs = ['נזילה באסלה', 'מצוף ניאגרה', 'כפתור ניאגרה', 'החלפת ניאגרה']
    const r = buildBriefPool(baseInput({ keywordResearch: kr(needs) }))
    check('C. all 4 distinct needs admitted, none collapsed', needs.every((n) => subjects(r).includes(n)) && r.pool.length === 4 && Object.keys(rej(r)).length === 0, JSON.stringify({ pool: subjects(r), rejected: rej(r) }))
  }

  console.log('D) frozen blockers still block exactly as before (uncapped default)')
  {
    const owner = buildBriefPool(baseInput({ keywordResearch: kr(['מוצר אלפא']), isOwnedByEntity: (s) => normalizePhrase(s) === normalizePhrase('מוצר אלפא') }))
    check('D. exact commercial owner → exact_existing_keyword_owner', owner.pool.length === 0 && rej(owner).exact_existing_keyword_owner === 1)
    const pex = buildBriefPool(baseInput({ keywordResearch: kr(['מוצר בטא']), pendingExactKeys: new Set([normalizePhrase('מוצר בטא')]) }))
    check('D. pending exact duplicate → pending_exact_duplicate', pex.pool.length === 0 && rej(pex).pending_exact_duplicate === 1)
    const psem = buildBriefPool(baseInput({ keywordResearch: kr(['תיקון ברז דולף מטבח']), pendingSignatures: [topicSignature('תיקון ברז דולף', 'informational')] }))
    check('D. pending semantic duplicate → pending_semantic_duplicate', psem.pool.length === 0 && rej(psem).pending_semantic_duplicate === 1)
    const cov = buildBriefPool(baseInput({ keywordResearch: kr(['שולחן עץ מלא']), isCoveredByContent: (s) => s.includes('שולחן') }))
    check('D. published informational coverage → covered_by_existing_content', cov.pool.length === 0 && rej(cov).covered_by_existing_content === 1)
    const dup = buildBriefPool(baseInput({ keywordResearch: kr(['תיקון דוד שמש jomo', 'תיקון דוד שמש oli']) }))
    check('D. true in-pool semantic duplicate → brief_semantic_duplicate', dup.pool.length === 1 && rej(dup).brief_semantic_duplicate === 1)
  }

  console.log('E) explicit cap compatibility — an explicit maxPerSubjectHead STILL applies')
  {
    const r = buildBriefPool(baseInput({ keywordResearch: kr(gifts) }), { maxPerSubjectHead: 2 })
    check('E. explicit maxPerSubjectHead:2 admits exactly 2, rejects 4 as subject_head_cap', r.pool.length === 2 && rej(r).subject_head_cap === 4, JSON.stringify({ n: r.pool.length, rejected: rej(r) }))
    const r1 = buildBriefPool(baseInput({ keywordResearch: kr(gifts) }), { maxPerSubjectHead: 1 })
    check('E. explicit maxPerSubjectHead:1 admits exactly 1', r1.pool.length === 1 && rej(r1).subject_head_cap === 5)
  }

  console.log('GUARD) source: default is uncapped, cap is opt-only, production passes no opts')
  {
    const ob = readFileSync(join(__dirname, '../recommendations/opportunity-brief.ts'), 'utf8')
    check('default maxPerHead is the raw option (no `?? 2` domain-blind default)',
      /const maxPerHead = opts\?\.maxPerSubjectHead\b/.test(ob) && !/opts\?\.maxPerSubjectHead \?\? 2/.test(ob))
    check('head cap applied ONLY when a cap was explicitly supplied',
      /if \(head && maxPerHead !== undefined\)/.test(ob) && /reject\('subject_head_cap'/.test(ob))
    const gfb = readFileSync(join(__dirname, '../recommendations/generate-from-briefs.ts'), 'utf8')
    check('the PRODUCTION caller invokes buildBriefPool without a head-cap option',
      /buildBriefPool\(\{/.test(gfb) && !/buildBriefPool\([^)]*maxPerSubjectHead/.test(gfb))
    // Frozen mechanisms untouched (names still present, unchanged signatures).
    const sd = readFileSync(join(__dirname, '../recommendations/semantic-dup.ts'), 'utf8')
    check('FROZEN: topicSignature / distinctiveTokensOf / isHighConfidenceDuplicate unchanged (present)',
      /export function topicSignature\(/.test(sd) && /export function distinctiveTokensOf\(/.test(sd) && /export function isHighConfidenceDuplicate\(/.test(sd))
    check('FROZEN: brief scoring formula + family interleave + intendedPageType present in opportunity-brief',
      /briefScore: Number\(\(demandScore \* 0\.45/.test(ob) && /intendedPageType: 'article'/.test(ob) && /round-robin across families/.test(ob))
  }

  console.log(`\n${pass} passed, ${fail} failed`)
  if (fail > 0) process.exitCode = 1
}
main()
