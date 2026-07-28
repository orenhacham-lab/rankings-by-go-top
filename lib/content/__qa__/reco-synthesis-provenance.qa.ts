/**
 * Step 2 — synthesis prompt: BRIEF PROVENANCE replaces the false domain claim,
 * and the skip reason becomes a typed enum.
 *
 * DEFECT: projectContextBlock asserted `primaryProjectFocus`, which deriveProjectFocus
 * computes as `cats[0]` — array index zero of the site-scan entities, in crawl order,
 * no scoring, despite a doc comment claiming "the dominant owned category". For a
 * multi-topic site that declares one arbitrary area as "the central editorial and
 * commercial focus" and then instructs "Do NOT generate … subject areas that are absent
 * from it". The model obeyed and refused briefs the pipeline had ALREADY verified as
 * on-domain. Measured: nagler, 0 topics from a 29-brief pool; ~60% skip elsewhere.
 *
 * WHY REMOVING IT IS SAFE: synthesis cannot invent a subject. briefId is a
 * responseSchema enum; reconcileSynthesis drops unknown ids; validatePolished
 * re-anchors any keyword sharing no distinctive token with its brief; and
 * assessBusinessRelevance is already shadow-only post-synthesis with the comment
 * "briefs are evidence-backed BY CONSTRUCTION". The domain claim was the ONLY place
 * re-judging domain fit, and it did so from `cats[0]`.
 *
 * The per-brief anti-contamination rule — never name a business/brand outside that
 * brief's own "entities" — is RETAINED and is what actually prevents the cross-project
 * leakage the original block was written for (commit 51b47f7).
 */
import { readFileSync } from 'fs'
import { join } from 'path'
import {
  buildBriefSynthesisPrompt, briefSynthesisResponseSchema,
  reconcileSynthesis, summarizeSkipReasons, SKIP_REASONS,
} from '../recommendations/brief-synthesis'
import type { OpportunityBrief } from '../recommendations/opportunity-brief'

let pass = 0, fail = 0
function check(name: string, cond: boolean, detail?: string) {
  if (cond) { pass++; console.log(`  ✓ ${name}`) } else { fail++; console.log(`  ✗ ${name}${detail ? ` — ${detail}` : ''}`) }
}
const ROOT = join(__dirname, '..', '..', '..')
const read = (rel: string) => readFileSync(join(ROOT, rel), 'utf8')
const stripComments = (s: string) => s.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:])\/\/.*$/gm, '$1')

const brief = (id: string, subject: string, entities: string[] = []): OpportunityBrief => ({
  opportunityId: id, subject, searchNeed: 'question', family: 'informational',
  sourceEvidence: [{ kind: 'site_scan', text: subject }], alignedDemandQuery: null,
  demandVolumeSource: null, intendedIntent: 'informational', intendedPageType: 'article',
  existingContentGap: true, relatedEntities: entities.map((n) => ({ name: n, url: null, type: 'category' })),
  publishedCoverage: [], confidence: 0.5, briefScore: 0.3,
} as unknown as OpportunityBrief)

// nagler: unrelated subjects — the shape that produced 0 topics.
const NAGLER = [brief('b1', 'נורות לד לסלון', ['נורות לד']), brief('b2', 'אילוף גור חתולים', ['חתולים']), brief('b3', 'אימון לחצי מרתון', ['ריצת מרתון'])]
// florist: concentrated — must be unaffected.
const FLORIST = [brief('f1', 'זר כלה קלאסי', ['זרי כלה']), brief('f2', 'שמירה על רעננות זר פרחים', ['משלוח פרחים'])]

function main() {
  console.log('Step 2 — brief provenance + typed skip reason\n')

  // ── A) the false domain claim is GONE ───────────────────────────────────────
  console.log('A) the domain claim is removed from the synthesis prompt')
  {
    const p = buildBriefSynthesisPrompt(NAGLER, 'Hebrew', 2026)
    check('A1. no "AUTHORITATIVE PROJECT-OWNED CONTEXT" block', !/AUTHORITATIVE PROJECT-OWNED CONTEXT/.test(p))
    check('A2. no primaryProjectFocus assertion', !/primaryProjectFocus/.test(p))
    check('A3. no "Do NOT generate … absent from it" prohibition',
      !/Do NOT generate brands, products, services, entities or subject areas that are absent from it/.test(p))
    check('A4. no "ONLY authoritative source for the business domain"', !/ONLY authoritative source for the business domain/.test(p))
    check('A5. project NAME and DOMAIN are absent (nothing to infer a domain from)',
      !/projectName/.test(p) && !/"domain"/.test(p))
    check('A6. the PROVENANCE block is present instead', /BRIEF PROVENANCE — read this before the rules:/.test(p))
    check('A7. it forbids re-judging domain fit', /Do NOT re-judge whether a subject belongs to this business/.test(p))
    check('A8. it licenses multi-topic projects explicitly',
      /A project may legitimately span several unrelated subject areas/.test(p))
  }

  // ── B) THE decisive property: identical instructions for every project ──────
  console.log('\nB) every project now receives the SAME instructions')
  {
    const a = buildBriefSynthesisPrompt(NAGLER, 'Hebrew', 2026).split('\nBRIEFS:\n')[0]
    const b = buildBriefSynthesisPrompt(FLORIST, 'Hebrew', 2026).split('\nBRIEFS:\n')[0]
    const norm = (s: string) => s.replace(/Below are \d+ EVIDENCE-BACKED/, 'Below are N EVIDENCE-BACKED')
    check('B1. the preamble is byte-identical across a multi-topic and a concentrated project',
      norm(a) === norm(b))
    check('B2. the prompts differ ONLY in their BRIEFS payload',
      buildBriefSynthesisPrompt(NAGLER, 'Hebrew', 2026) !== buildBriefSynthesisPrompt(FLORIST, 'Hebrew', 2026))
    check('B3. buildBriefSynthesisPrompt no longer takes a ProjectContext at all',
      /export function buildBriefSynthesisPrompt\(briefs: OpportunityBrief\[\], langLabel: string, year: number\)/
        .test(stripComments(read('lib/content/recommendations/brief-synthesis.ts'))))
    check('B4. brief-synthesis.ts no longer imports projectContextBlock',
      !/projectContextBlock/.test(read('lib/content/recommendations/brief-synthesis.ts')))
  }

  // ── C) the anti-contamination guard SURVIVES ────────────────────────────────
  console.log('\nC) the per-brief anti-contamination rule is retained')
  {
    const p = buildBriefSynthesisPrompt(FLORIST, 'Hebrew', 2026)
    check('C1. the per-brief entity rule is still present',
      /NEVER mention a business, brand or product name that is not in that brief's "entities"/.test(p))
    check('C2. the provenance block restates it for ANY script (Hebrew-brand case)',
      /Do not introduce any other business, brand or product name, in any script/.test(p))
    check('C3. the "do not invent / merge / add" instruction is unchanged',
      /do NOT invent a different subject, do NOT merge briefs, do NOT add extra topics/.test(p))
  }

  // ── D) the skip reason is a typed ENUM ──────────────────────────────────────
  console.log('\nD) skipping is typed — a domain skip is unrepresentable')
  {
    const p = buildBriefSynthesisPrompt(NAGLER, 'Hebrew', 2026)
    check('D1. the three craft reasons are enumerated in the prompt',
      SKIP_REASONS.every((r) => p.includes(r)))
    check('D2. off-domain skipping is explicitly named INVALID',
      /"Off-topic", "not the project's field", "outside the business's specialisation" and anything similar are NOT valid/.test(p))
    check('D3. …and the reason given is that domain fit is not the model\'s call',
      /domain fit is not yours to judge/.test(p))
    const schema = briefSynthesisResponseSchema(['b1', 'b2']) as { properties: { topics: { items: { properties: Record<string, { enum?: string[] }> } } } }
    const sr = schema.properties.topics.items.properties.skipReason
    check('D4. skipReason is a responseSchema ENUM over exactly the craft reasons',
      !!sr?.enum && JSON.stringify(sr.enum) === JSON.stringify([...SKIP_REASONS]), JSON.stringify(sr))
    check('D5. SKIP_REASONS contains NO domain-shaped value',
      !SKIP_REASONS.some((r) => /domain|topic|focus|field|relevan/i.test(r)))
  }

  // ── E) reconciliation — 'unspecified' is COUNTED, never dropped ─────────────
  console.log('\nE) reconciliation records the typed reason; a missing one is counted')
  {
    const briefs = [brief('b1', 'נורות לד לסלון'), brief('b2', 'אילוף גור חתולים'), brief('b3', 'אימון לחצי מרתון')]
    const res = JSON.stringify({ topics: [
      { briefId: 'b1', skip: false, title: 'איך לבחור נורת לד לסלון', primaryKeyword: 'נורות לד לסלון', secondaryKeywords: [], intent: 'informational' },
      { briefId: 'b2', skip: true, skipReason: 'cannot_form_title', why: 'לא ניתן לנסח' },
      { briefId: 'b3', skip: true, why: 'off domain' },   // NO skipReason — the schema cannot force it
    ] })
    const rec = reconcileSynthesis(res, briefs)
    check('E1. a valid enum value is recorded', rec.skipped.find((s) => s.briefId === 'b2')?.skipReason === 'cannot_form_title')
    check('E2. a MISSING skipReason becomes "unspecified" — counted, not dropped',
      rec.skipped.find((s) => s.briefId === 'b3')?.skipReason === 'unspecified')
    check('E3. the exact accounting still holds: sent = polished + skipped + missing',
      briefs.length === rec.polished.length + rec.skipped.length + rec.missing.length)
    check('E4. an off-enum value is NOT silently accepted as a craft reason',
      reconcileSynthesis(JSON.stringify({ topics: [{ briefId: 'b1', skip: true, skipReason: 'off_domain' }] }), briefs)
        .skipped[0]?.skipReason === 'unspecified')
    const details = summarizeSkipReasons(rec.skipped, briefs)
    check('E5. Step 1 diagnostics carry the typed reason through', details.length === 2 && details[0].skipReason === 'cannot_form_title' && details[1].skipReason === 'unspecified')
    check('E6. …with the brief subject still resolved', details[0].subject === 'אילוף גור חתולים')
  }

  // ── F) FROZEN — only the synthesis prompt changed ───────────────────────────
  console.log('\nF) FROZEN — nothing outside the synthesis prompt moved')
  {
    const pg = read('lib/content/recommendations/prompt-guidance.ts')
    check('F1. projectContextBlock itself is UNCHANGED (discovery + fallback still use it)',
      /Do NOT generate brands, products, services, entities or subject areas that are absent from it\./.test(pg))
    check('F2. deriveProjectFocus is UNCHANGED — cats[0] still feeds evidence/seeds',
      /return \{ primaryProjectFocus: cats\[0\]/.test(pg))
    const cd = read('lib/content/recommendations/constrained-discovery.ts')
    const lf = read('lib/content/recommendations/low-yield-fallback.ts')
    check('F3. constrained discovery still uses projectContextBlock (it IS generative)',
      /projectContextBlock\(input\.ctx\)/.test(cd))
    check('F4. the low-yield fallback still uses it too', /projectContextBlock\(input\.ctx\)/.test(lf))
    const gfb = stripComments(read('lib/content/recommendations/generate-from-briefs.ts'))
    check('F5. no new model call', (gfb.match(/await generateRecommendationJSON\(/g) ?? []).length === 3)
    check('F6. validatePolished is untouched — the evidence-first re-anchor still runs',
      /primaryKeyword = brief\.alignedDemandQuery\?\.query \?\? brief\.subject/.test(gfb))
    check('F7. the Step 1.5 title guards are still in place',
      /'title_named_external_business'/.test(gfb) && /'title_unknown_latin_token'/.test(gfb))
    check('F8. no persistence or migration touched', !/skipReason/.test(read('lib/content/recommendations/topic-idea-store.ts')))
  }

  console.log(`\n${pass} passed, ${fail} failed`)
  if (fail > 0) process.exitCode = 1
}
main()
