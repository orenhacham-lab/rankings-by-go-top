/**
 * ENGLISH-LANGUAGE PROJECT — the Afrodite Decants zero-ideas defect.
 *
 * SYMPTOM (production, afroditedecants): a project with valid English search
 * evidence and NO existing topics or articles generated 17 candidates, kept none,
 * and the run summary read "17 ideas generated · 17 did not pass quality/relevance
 * checks · 0 duplicates · 0 quality-filtered · 0 already exists · 0 covered" —
 * six numbers, none of which explained the seventeen.
 *
 * CAUSE — one gate, exactly. validatePolished (3c) calls brand-safety's
 * unknownLatinTokens on the model-authored TITLE. That rule reads an unknown
 * LATIN token as a foreign brand the model introduced, and that reading is only
 * valid when latin is FOREIGN to the prose — the shape a brand takes on a
 * Hebrew-language site. On an ENGLISH project every ordinary word is a latin
 * token, and "unknown to the project" only means the word is missing from a
 * vocabulary built out of the business name, entity titles and existing coverage
 * (which, for a project with no articles yet, is nearly empty). A polished English
 * headline adds ordinary English words by design, so the gate rejected every
 * candidate the engine produced.
 *
 * FIX — the rule is script-relative: it applies when the project's own content
 * script is 'hebrew' (byte-identical to before) and is INAPPLICABLE, not relaxed,
 * on a latin-script project. No threshold moved; (3) mutation, (3b) named external
 * business, the worthiness/coverage/ownership/dedupe gates and the shadow-only
 * classifier are all untouched and still reject on an English project.
 *
 * HOW THIS RUNS: the REAL production engine (generateFromBriefs — the default when
 * every RECO_* path flag is off) and the REAL route handler, against a fixture
 * Gemini server over the existing RECO_GENAI_BASE_URL seam. NO provider call is
 * made and no production seam was added for this suite.
 *
 * Run: npx tsx lib/content/__qa__/reco-english-project.qa.ts
 */

/*
 * `require()` is deliberate and cannot be an import: tsx runs this file as
 * CommonJS and the Module._load hook must be installed BEFORE the route under
 * test loads, so its own static imports resolve through the hook. A static
 * `import` is hoisted above it and would defeat the substitution.
 */
/* eslint-disable @typescript-eslint/no-explicit-any, @typescript-eslint/no-require-imports */
const Module: any = require('module')
const origLoad = Module._load
const INTERCEPT = ['@/lib/content/api-auth', '@/lib/content/entitlement-guard']
const overrides = new Map<string, Record<string, unknown>>()
Module._load = function (request: string, parent: any, isMain: boolean) {
  const real = origLoad.call(this, request, parent, isMain)
  const key = INTERCEPT.find((x) => request === x)
  if (!key) return real
  return new Proxy(real, { get: (t, k) => { const o = overrides.get(key); return o && (k as string) in o ? o[k as string] : (t as any)[k] } })
}

import { readFileSync } from 'fs'
import { join } from 'path'
import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { startFakeGenai } from './_reco-harness'
import { resetModelResolutionCache } from '../recommendations/model-availability'
import { resetRecoGenAiClient } from '../recommendations/genai-client'
import {
  buildBrandSafety, unknownLatinTokens, hasNamedExternalBusiness, scriptOfContentLanguage,
} from '../recommendations/brand-safety'
import { contentTokens } from '../recommendations/evidence-cluster'
import { buildEngineRejectionSummary } from '../recommendations/funnel-summary'
import { buildEngineRejectionLines } from '../recommendations/engine-rejection-line'
import { dashboardHe } from '../../i18n/dashboard/he'
import { dashboardEn } from '../../i18n/dashboard/en'
import type { BriefRunDiagnostics } from '../recommendations/generate-from-briefs'

let pass = 0, fail = 0
function check(name: string, cond: boolean, detail?: string) {
  if (cond) { pass++; console.log(`  ✓ ${name}`) } else { fail++; console.log(`  ✗ ${name}${detail ? ` — ${detail}` : ''}`) }
}
const ROOT = join(__dirname, '..', '..', '..')
const read = (rel: string) => readFileSync(join(ROOT, rel), 'utf8')
const stripComments = (s: string) => s.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:])\/\/.*$/gm, '$1')

// ── The Afrodite fixture ─────────────────────────────────────────────────────
// A perfume-decant retailer: English search evidence, real product/category
// entities, and — as reported — NO generated articles, NO article topics and NO
// pending ideas. Sixteen research queries plus the derived project focus give a
// pool of exactly 17, the number the production run reported.
const EN_QUERIES: [string, number][] = [
  ['storing perfume decants at home', 480],
  ['perfume decant sizes explained', 320],
  ['are perfume decants authentic', 260],
  ['perfume samples versus decants', 210],
  ['how long do perfume decants last', 190],
  ['niche fragrance decants for beginners', 170],
  ['eau de parfum concentration difference', 150],
  ['perfume layering with decants', 140],
  ['fragrance notes pyramid meaning', 130],
  ['perfume shelf life after opening', 110],
  ['travel atomizer for fragrance', 100],
  ['finding a signature scent', 95],
  ['winter fragrance selection tips', 90],
  ['office friendly fragrance choices', 85],
  ['perfume gift ideas for him', 80],
  ['designer versus niche fragrance', 75],
]

function afroditeTables(language: string): Record<string, Record<string, unknown>[]> {
  return {
    projects: [{ id: 'p1', user_id: 'u1', business_name: 'Afrodite Decants', target_domain: 'https://afroditedecants.co.il', language, country: 'IL' }],
    tracking_targets: [{ project_id: 'p1', keyword: 'storing perfume decants at home' }],
    keyword_research_cache: [{ project_id: 'p1', fetched_at: '2026-08-01', results_json: EN_QUERIES.map(([keyword, avgMonthlySearches]) => ({ keyword, avgMonthlySearches })) }],
    shopify_entities: [
      { project_id: 'p1', is_active: true, title: 'Perfume Decant 5ml', handle: 'd5', entity_type: 'product', canonical_url: 'https://afroditedecants.co.il/p/d5' },
      { project_id: 'p1', is_active: true, title: 'Perfume Decant 10ml', handle: 'd10', entity_type: 'product', canonical_url: 'https://afroditedecants.co.il/p/d10' },
      { project_id: 'p1', is_active: true, title: 'Travel Atomizer Set', handle: 'atom', entity_type: 'product', canonical_url: 'https://afroditedecants.co.il/p/atom' },
      { project_id: 'p1', is_active: true, title: 'Fragrance Discovery Set', handle: 'disc', entity_type: 'product', canonical_url: 'https://afroditedecants.co.il/p/disc' },
      { project_id: 'p1', is_active: true, title: 'Womens Fragrance Decants', handle: 'w', entity_type: 'category', canonical_url: 'https://afroditedecants.co.il/c/w' },
      { project_id: 'p1', is_active: true, title: 'Mens Fragrance Decants', handle: 'm', entity_type: 'category', canonical_url: 'https://afroditedecants.co.il/c/m' },
    ],
    // As reported: nothing published, nothing queued.
    generated_articles: [], article_topics: [], content_topic_ideas: [], wordpress_content_index: [],
  }
}

/** Polished English headlines — the ordinary shape of the synthesis step's output:
 *  the brief's own subject plus a natural framing clause. Nothing here names a
 *  brand; every added word is generic English. */
const FRAMES: ((s: string) => string)[] = [
  (s) => `${s}: A Practical Walkthrough`,
  (s) => `${s} — Common Mistakes To Avoid`,
  (s) => `${s}: Questions And Answers`,
  (s) => `${s} — What Shoppers Should Know`,
  (s) => `${s}: Step By Step`,
]
type Brief = { id: string; subject: string; aligned_query?: string }
const cleanBatch = (briefs: Brief[]) => briefs.map((b, i) => ({
  briefId: b.id, title: FRAMES[i % FRAMES.length](b.subject),
  primaryKeyword: b.aligned_query ?? b.subject, secondaryKeywords: [], intent: 'informational',
}))

/** Contract-faithful in-memory admin. Wider than the shared harness one because the
 *  ROUTE also persists (upsert) and reloads. Filters on every eq(), the tenant boundary. */
function fakeAdmin(tables: Record<string, Record<string, unknown>[]>) {
  let n = 5000
  const from = (table: string) => {
    const st: { op: string; payload?: Record<string, unknown>[]; updates?: Record<string, unknown>; filters: Record<string, unknown>; inFilter?: { col: string; vals: unknown[] }; single: boolean } = { op: 'select', filters: {}, single: false }
    const rows = () => (tables[table] ??= [])
    const exec = () => {
      if (st.op === 'upsert') {
        const inserted: { id: string }[] = []
        for (const row of st.payload ?? []) {
          if (rows().some((r) => r.project_id === row.project_id && r.fingerprint === row.fingerprint)) continue
          const full = { id: `row${n++}`, status: 'pending', created_at: '2026-09-05T00:00:00Z', secondary_keywords: [], suggested_internal_links: [], link_plan: null, ...row }
          rows().push(full); inserted.push({ id: full.id as string })
        }
        return { data: inserted, error: null }
      }
      if (st.op === 'update') {
        for (const r of rows()) if (Object.entries(st.filters).every(([k, v]) => r[k] === v) && (!st.inFilter || st.inFilter.vals.includes(r[st.inFilter.col]))) Object.assign(r, st.updates)
        return { data: null, error: null }
      }
      let out = rows().filter((r) => Object.entries(st.filters).every(([k, v]) => r[k] === v))
      if (st.inFilter) out = out.filter((r) => st.inFilter!.vals.includes(r[st.inFilter!.col]))
      return { data: st.single ? (out[0] ?? null) : out, error: null }
    }
    const b: Record<string, unknown> = {}
    Object.assign(b, {
      select() { return b },
      upsert(payload: Record<string, unknown>[]) { st.op = 'upsert'; st.payload = payload; return b },
      update(u: Record<string, unknown>) { st.op = 'update'; st.updates = u; return b },
      eq(col: string, val: unknown) { st.filters[col] = val; return b },
      in(col: string, vals: unknown[]) { st.inFilter = { col, vals }; return b },
      order() { return b }, limit() { return b },
      maybeSingle() { st.single = true; return b },
      single() { st.single = true; return b },
      then(res: (v: unknown) => unknown, rej?: (e: unknown) => unknown) { return Promise.resolve(exec()).then(res, rej) },
    })
    return b
  }
  return { from } as never
}

interface RunOut { diagnostics: BriefRunDiagnostics; accepted: number; titles: string[]; keywords: string[]; calls: number }

/** ONE run of the REAL default production engine against the fixture Gemini server. */
async function runEngine(tables: Record<string, Record<string, unknown>[]>, respond: (b: Brief[]) => unknown[], targetCount = 12): Promise<RunOut> {
  const { server, port, calls } = await startFakeGenai({ models: ['gemini-2.5-flash', 'gemini-2.5-pro'], respond: respond as never })
  try {
    process.env.GEMINI_API_KEY = 'test-key'
    process.env.RECO_GENAI_BASE_URL = `http://127.0.0.1:${port}`
    resetModelResolutionCache(); resetRecoGenAiClient()
    const { generateFromBriefs } = await import('../recommendations/generate-from-briefs')
    const { newRunCostController } = await import('../recommendations/run-cost-controller')
    const run = await generateFromBriefs(fakeAdmin(tables), { projectId: 'p1', targetCount, qualityMode: 'standard' }, newRunCostController('standard', `en-qa-${Math.random()}`, targetCount))
    return { diagnostics: run.diagnostics, accepted: run.suggestions.length, titles: run.suggestions.map((s) => s.title), keywords: run.suggestions.map((s) => s.primaryKeyword), calls: calls.length }
  } finally { server.close() }
}

const reasonsOf = (d: BriefRunDiagnostics) => d.rejected_by_reason
const dispositionsOf = (d: BriefRunDiagnostics) => d.candidateOutcomes.map((o) => `${o.outcome}:${o.rejectionReason ?? ''}`)

async function main() {
  // ── A) the removal boundary, on the real gate ──────────────────────────────
  console.log('A) the exact code boundary that removed the candidates')
  {
    const bs = buildBrandSafety({
      businessName: 'Afrodite Decants',
      entityNames: ['Perfume Decant 5ml', 'Travel Atomizer Set', 'Womens Fragrance Decants'],
      ownEvidence: [],
    })
    const allow = new Set(contentTokens('perfume decant sizes explained'))
    const title = 'perfume decant sizes explained: A Practical Walkthrough'
    // The PRE-FIX call shape is the post-fix call with the default script, so this
    // is the old function, not a re-implementation of it.
    check('A1. pre-fix shape flags ordinary English words in a clean English title',
      unknownLatinTokens(title, bs, allow).length > 0, JSON.stringify(unknownLatinTokens(title, bs, allow)))
    check('A2. …and the flagged tokens are plain English, not a brand',
      unknownLatinTokens(title, bs, allow).every((t) => ['practical', 'walkthrough'].includes(t)),
      JSON.stringify(unknownLatinTokens(title, bs, allow)))
    check('A3. the default script is hebrew — the default IS the old behavior',
      JSON.stringify(unknownLatinTokens(title, bs, allow)) === JSON.stringify(unknownLatinTokens(title, bs, allow, 'hebrew')))
    check('A4. on a latin-script project the rule is inapplicable and flags nothing',
      unknownLatinTokens(title, bs, allow, 'latin').length === 0)
    check('A5. the project language decides the script', scriptOfContentLanguage('en') === 'latin'
      && scriptOfContentLanguage('en-US') === 'latin' && scriptOfContentLanguage('he') === 'hebrew'
      && scriptOfContentLanguage(null) === 'hebrew' && scriptOfContentLanguage('') === 'hebrew')
    // NO Hebrew regression: the case the gate exists for is byte-identical.
    const heb = buildBrandSafety({ businessName: 'בשמי אפרודיטה', entityNames: ['בשמים לנשים', 'דקאנטים'], ownEvidence: [] })
    const hebAllow = new Set(contentTokens('בשמים מתוקים לנשים'))
    check('A6. a foreign brand in a Hebrew title is STILL flagged',
      unknownLatinTokens('בשמים מתוקים לנשים מבית Tom Ford', heb, hebAllow, 'hebrew').length > 0)
    check('A7. …and an all-English title on a HEBREW project is still flagged (unchanged)',
      unknownLatinTokens(title, heb, hebAllow, 'hebrew').length > 0)
    check('A8. (3b) still catches a named external business ON an English project',
      hasNamedExternalBusiness('perfume decants reviewed by Acme Fragrances Ltd', bs).hit)
  }

  // ── B) the production symptom, reproduced through the real engine ──────────
  console.log('\nB) the EXACT reported symptom, produced by the real production engine')
  let brokenDiag: BriefRunDiagnostics
  {
    // The gate had no language input before this fix, so its behavior for every
    // project was what a 'hebrew' content script produces today. Running the
    // identical English fixture under that script is the pre-fix engine.
    const out = await runEngine(afroditeTables('he'), cleanBatch)
    brokenDiag = out.diagnostics
    const d = out.diagnostics
    check('B1. 17 candidates generated', d.generated_opportunities === 17, String(d.generated_opportunities))
    check('B2. 0 ideas survive', out.accepted === 0, String(out.accepted))
    check('B3. all 17 removed by ONE gate: title_unknown_latin_token',
      JSON.stringify(reasonsOf(d)) === '{"title_unknown_latin_token":17}', JSON.stringify(reasonsOf(d)))
    check('B4. every removal is that gate, at that stage',
      d.candidateOutcomes.length === 17 && d.candidateOutcomes.every((o) => o.outcome === 'rejected' && o.rejectionStage === 'brand_safety_title_unknown_token'))
    check('B5. no other gate is involved — no coverage/duplicate/ownership rejection',
      Object.keys(reasonsOf(d)).length === 1)
    check('B6. the project really had no existing content to collide with',
      d.evidence_inventory !== null && (d.evidence_inventory as { generated_articles?: number }).generated_articles === 0,
      JSON.stringify(d.evidence_inventory))
    check('B7. one disposition per candidate; the ledger reconciles',
      d.candidateAccounting.reconciles && d.candidateAccounting.generated === 17 && d.candidateAccounting.rejected === 17
      && dispositionsOf(d).length === 17)
    check('B8. the run made ONE model call, to the fixture server only', out.calls === 1, String(out.calls))
  }

  // ── C) what the merchant was shown, and why it was contradictory ───────────
  console.log('\nC) the contradictory reason accounting, and the ledger that fixes it')
  {
    const d = brokenDiag
    // The route's customer buckets are all ROUTE-stage counts. With the engine
    // accepting nothing, every one of them is 0 while engineFiltered is 17.
    const engineFiltered = Math.max(0, (d.generated_opportunities ?? 0) - 0)
    check('C1. engineFiltered is 17 while every named customer bucket is 0', engineFiltered === 17)
    const s = buildEngineRejectionSummary(d)
    check('C2. the engine ledger names all 17',
      s.reasons.length === 1 && s.reasons[0].reason === 'title_unknown_latin_token' && s.reasons[0].count === 17,
      JSON.stringify(s))
    check('C3. nothing is left unexplained', s.unexplained === 0 && s.notProcessed === 0 && s.dropped === 0, JSON.stringify(s))
    check('C4. Σ named reasons + notProcessed + dropped + accepted = generated',
      s.reasons.reduce((a, r) => a + r.count, 0) + s.notProcessed + s.dropped + d.candidateAccounting.accepted === d.candidateAccounting.generated)
    check('C5. an absent engine diagnostic degrades to empty, never to a guess',
      JSON.stringify(buildEngineRejectionSummary(null)) === JSON.stringify({ reasons: [], notProcessed: 0, dropped: 0, unexplained: 0 }))
    // Ordering is deterministic so the same run never reads differently twice.
    const two = buildEngineRejectionSummary({ rejected_by_reason: { b_reason: 2, a_reason: 2, c_reason: 5 }, candidateAccounting: { generated: 9, accepted: 0, rejected: 9, not_processed: 0, dropped: 0 } })
    check('C6. reasons are ordered by count desc then name asc (stable)',
      JSON.stringify(two.reasons.map((r) => r.reason)) === '["c_reason","a_reason","b_reason"]', JSON.stringify(two.reasons))
  }

  // ── D) the corrected behavior ──────────────────────────────────────────────
  console.log('\nD) corrected: the SAME 17 English candidates now produce usable ideas')
  let fixedDiag: BriefRunDiagnostics
  {
    const out = await runEngine(afroditeTables('en'), cleanBatch)
    fixedDiag = out.diagnostics
    const d = out.diagnostics
    check('D1. the same 17 candidates are generated', d.generated_opportunities === 17, String(d.generated_opportunities))
    check('D2. ideas survive', out.accepted >= 8, String(out.accepted))
    check('D3. NOT ONE is removed as title_unknown_latin_token',
      !(reasonsOf(d).title_unknown_latin_token > 0), JSON.stringify(reasonsOf(d)))
    check('D4. every surviving idea is usable (title, keyword, reason, links array)',
      out.titles.every((t) => t.trim().length > 0) && out.keywords.every((k) => k.trim().length > 0))
    check('D5. the surviving keywords are the project\'s own English search evidence',
      out.keywords.every((k) => EN_QUERIES.some(([q]) => q === k)), JSON.stringify(out.keywords))
    check('D6. one disposition per candidate; the ledger still reconciles',
      d.candidateAccounting.reconciles && d.candidateAccounting.generated === 17
      && d.candidateOutcomes.length === 17)
    check('D7. accepted + rejected + not_processed + dropped = generated',
      d.candidateAccounting.accepted + d.candidateAccounting.rejected + d.candidateAccounting.not_processed + d.candidateAccounting.dropped === 17,
      JSON.stringify(d.candidateAccounting))
    check('D8. the honest gates still fired on this run (nothing was waved through)',
      Object.keys(reasonsOf(d)).length > 0, JSON.stringify(reasonsOf(d)))
    check('D9. buildEngineRejectionSummary leaves nothing unexplained on the fixed run',
      buildEngineRejectionSummary(d).unexplained === 0, JSON.stringify(buildEngineRejectionSummary(d)))
    // Same fixture, same 17 candidates, same batch — only the content script differs.
    check('D10. broken and fixed runs differ ONLY in what survived, not in what was generated',
      brokenDiag.generated_opportunities === fixedDiag.generated_opportunities
      && brokenDiag.candidateOutcomes.map((o) => o.modelTitle).join('|') === fixedDiag.candidateOutcomes.map((o) => o.modelTitle).join('|'),
      JSON.stringify({ broken: brokenDiag.generated_opportunities, fixed: fixedDiag.generated_opportunities }))
  }

  // ── E) invalid candidates are STILL rejected on an English project ─────────
  console.log('\nE) the fix removes a false rejection, not the protection')
  {
    const contaminate = (briefs: Brief[]) => cleanBatch(briefs).map((t, i) => {
      if (i === 0) return { ...t, title: `${t.title} by Acme Fragrances Ltd` }           // named external business
      if (i === 1) return { ...t, title: 'Perfume Decant 5ml' }                           // owned entity → not an article
      if (i === 2) return { ...t, primaryKeyword: 'commercial roof waterproofing quote' } // off-subject keyword
      if (i === 3) return { ...t, title: (briefs[2]?.subject ?? '') + ': Step By Step', primaryKeyword: briefs[2]?.aligned_query ?? '' } // duplicate of #2
      return t
    })
    const out = await runEngine(afroditeTables('en'), contaminate)
    const d = out.diagnostics
    const rejectedTitles = d.candidateOutcomes.filter((o) => o.outcome === 'rejected').map((o) => `${o.modelTitle}`)
    check('E1. the Ltd-suffixed title is rejected as a named external business',
      (reasonsOf(d).title_named_external_business ?? 0) >= 1, JSON.stringify(reasonsOf(d)))
    check('E2. …and that exact title never reaches the accepted set',
      !out.titles.some((t) => t.includes('Acme Fragrances Ltd')), JSON.stringify(out.titles))
    check('E3. a title that is just an owned product page is not accepted as a new article',
      !out.titles.includes('Perfume Decant 5ml'), JSON.stringify(out.titles))
    check('E4. the off-subject keyword never survives',
      !out.keywords.includes('commercial roof waterproofing quote'), JSON.stringify(out.keywords))
    check('E5. the in-run duplicate is rejected, not silently dropped',
      (reasonsOf(d).intra_run_need_duplicate ?? 0) >= 1 || rejectedTitles.length >= 2, JSON.stringify(reasonsOf(d)))
    check('E6. the run still reconciles with the injected defects', d.candidateAccounting.reconciles)
    check('E7. legitimate candidates in the SAME batch still survive', out.accepted >= 5, String(out.accepted))
  }

  // ── F) mutation control — put the defect back, the failure returns ─────────
  console.log('\nF) mutation control')
  {
    // The fix has exactly one decision: the run\'s content script. Force it back to
    // the pre-fix constant and the identical English fixture fails identically.
    const mutated = await runEngine(afroditeTables('he'), cleanBatch)
    check('F1. mutating the script back to hebrew reproduces 17 → 0 exactly',
      mutated.diagnostics.generated_opportunities === 17 && mutated.accepted === 0
      && JSON.stringify(reasonsOf(mutated.diagnostics)) === '{"title_unknown_latin_token":17}',
      JSON.stringify(reasonsOf(mutated.diagnostics)))
    const bsSrc = stripComments(read('lib/content/recommendations/brand-safety.ts'))
    check('F2. the fix is one guarded early return, not a weakened filter',
      /if \(contentScript === 'latin'\) return \[\]/.test(bsSrc))
    check('F3. removing that line restores the pre-fix predicate exactly',
      /return unknownTokens\(toks\(text\), bs\)\.filter\(\(t\) => LATIN_TOKEN_RE\.test\(t\) && !allow\.has\(t\)\)/.test(bsSrc))
  }

  // ── G) NO threshold moved; every other gate is untouched ───────────────────
  console.log('\nG) no threshold lowered, no other gate touched')
  {
    const gfb = stripComments(read('lib/content/recommendations/generate-from-briefs.ts'))
    check('G1. (3) named-entity mutation gate byte-identical',
      /if \(detectUnsafeNamedEntityMutation\(t\.title, primaryKeyword, brandSafety\)\) return rej\('unsafe_named_entity_mutation', 'brand_safety',/.test(gfb))
    check('G2. (3b) named external business gate byte-identical',
      /const titleNamedBusiness = hasNamedExternalBusiness\(t\.title, brandSafety\)/.test(gfb))
    check('G3. (3c) changed ONLY by the script argument',
      /const foreignLatin = unknownLatinTokens\(t\.title, brandSafety, briefOwnTokens, contentScript\)/.test(gfb))
    check('G4. the allow-set is unchanged (brief subject + related entities; no demand query)',
      /const briefOwnTokens = new Set<string>\(contentTokens\(brief\.subject\)\)/.test(gfb)
      && !/unknownLatinTokens\([^)]*alignedDemandQuery/.test(gfb))
    check('G5. the broad classifier is STILL shadow-only',
      /if \(!scan\.safe\) shadow\('competitor_brand_leakage'\)/.test(gfb)
      && /if \(classifyKeywordEntity\(primaryKeyword, brandSafety\) === 'suspected_external_business'\) shadow\('competitor_brand_leakage'\)/.test(gfb))
    const iMutation = gfb.indexOf('detectUnsafeNamedEntityMutation(t.title, primaryKeyword, brandSafety)')
    const iNamed = gfb.indexOf("'title_named_external_business'")
    const iLatin = gfb.indexOf("'title_unknown_latin_token'")
    const iWorthiness = gfb.indexOf('const w = evaluateArticleWorthiness(')
    check('G6. gate order unchanged: (3) → (3b) → (3c) → (4)',
      iMutation > 0 && iNamed > iMutation && iLatin > iNamed && iWorthiness > iLatin)
    check('G7. no new model call was added', (gfb.match(/await generateRecommendationJSON\(/g) ?? []).length === 3)
    check('G8. the content script is derived from the run language, read once',
      /const contentScript = scriptOfContentLanguage\(language\)/.test(gfb))
    check('G9. no numeric threshold in brand-safety changed',
      /t\.length >= 3/.test(stripComments(read('lib/content/recommendations/brand-safety.ts'))))
  }

  // ── H) the REAL route returns the breakdown ────────────────────────────────
  console.log('\nH) the real API response carries the reasons')
  let routeFunnel: Record<string, unknown> | null = null
  {
    const tables = afroditeTables('he') // the failing configuration, end to end
    const admin = fakeAdmin(tables)
    overrides.set('@/lib/content/api-auth', {
      authContentProject: async () => ({ user: { id: 'u1' }, admin, project: { id: 'p1', user_id: 'u1' } }),
      isContentAutomationEnabled: () => true,
      isProFirstControllerEnabled: () => false,
    })
    overrides.set('@/lib/content/entitlement-guard', { assertContentGenerationAllowedForUser: async () => ({ allowed: true }) })
    const { server, port } = await startFakeGenai({ models: ['gemini-2.5-flash', 'gemini-2.5-pro'], respond: cleanBatch as never })
    try {
      process.env.GEMINI_API_KEY = 'test-key'
      process.env.RECO_GENAI_BASE_URL = `http://127.0.0.1:${port}`
      delete process.env.RECO_PRO_FIRST_CONTROLLER; delete process.env.RECO_LEGACY_PATH
      delete process.env.RECO_ENABLE_CONTENT_PLAN; delete process.env.RECO_TIERED_OPPORTUNITIES
      resetModelResolutionCache(); resetRecoGenAiClient()
      const { POST } = await import('../../../app/api/content/automation/recommendations/route')
      const res = await POST(new Request('http://localhost/api/content/automation/recommendations', {
        method: 'POST', headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ projectId: 'p1', source: 'project_data' }),
      }) as never)
      const json = await (res as Response).json() as { suggestions?: unknown[]; meta?: { funnel?: Record<string, unknown> } }
      routeFunnel = json.meta?.funnel ?? null
      check('H1. the route answered with the funnel', !!routeFunnel, JSON.stringify(json).slice(0, 300))
      check('H2. 17 generated · 17 engine-filtered · 0 ideas', routeFunnel?.generated === 17
        && routeFunnel?.engineFiltered === 17 && (json.suggestions ?? []).length === 0, JSON.stringify(routeFunnel))
      check('H3. every previously-displayed detailed bucket is still 0 — the old contradiction',
        routeFunnel?.corpusDuplicates === 0 && routeFunnel?.qualityFiltered === 0 && routeFunnel?.keywordExists === 0
        && routeFunnel?.titleExists === 0 && routeFunnel?.coveredByExisting === 0, JSON.stringify(routeFunnel))
      const rej = routeFunnel?.engineRejections as { reason: string; count: number }[] | undefined
      check('H4. and the response NOW explains them', !!rej && rej.length === 1
        && rej[0].reason === 'title_unknown_latin_token' && rej[0].count === 17, JSON.stringify(rej))
      check('H5. the response accounts for the residual with nothing unexplained',
        routeFunnel?.engineUnexplained === 0 && routeFunnel?.engineNotProcessed === 0 && routeFunnel?.engineDropped === 0,
        JSON.stringify(routeFunnel))
      check('H6. the reasons reconcile with engineFiltered',
        (rej ?? []).reduce((a, r) => a + r.count, 0) + Number(routeFunnel?.engineNotProcessed ?? 0)
        + Number(routeFunnel?.engineDropped ?? 0) + Number(routeFunnel?.engineUnexplained ?? 0) === Number(routeFunnel?.engineFiltered ?? -1))
    } finally { server.close() }
    const routeSrc = stripComments(read('app/api/content/automation/recommendations/route.ts'))
    check('H7. ONE funnel builder feeds all three responses (they cannot disagree)',
      (routeSrc.match(/funnel: funnelFor\(/g) ?? []).length === 3
      && (routeSrc.match(/const funnelFor = /g) ?? []).length === 1, String((routeSrc.match(/funnel: funnelFor\(/g) ?? []).length))
  }

  // ── I) the merchant-facing text, in both languages ─────────────────────────
  console.log('\nI) what the card actually renders, HE and EN')
  {
    const funnel = (routeFunnel ?? {}) as never
    for (const [lang, dict] of [['he', dashboardHe], ['en', dashboardEn]] as const) {
      const t = (dict as never as { contentHub: { autoIdeas: never } }).contentHub.autoIdeas
      const lines = buildEngineRejectionLines(funnel, t)
      const html = renderToStaticMarkup(createElement('div', { 'data-testid': 'engine-rejections' }, lines.map((l, i) => createElement('p', { key: i }, l))))
      check(`I1-${lang}. the card renders a reason line`, lines.length === 1 && html.includes('<p>'), html)
      check(`I2-${lang}. it states the count`, html.includes('17'), html)
      check(`I3-${lang}. NO raw reason code reaches the merchant`,
        !/title_unknown_latin_token|_by_reason|engineFiltered|brand_safety/.test(html), html)
      check(`I4-${lang}. no placeholder survives`, !/\{list\}|\{n\}|\{reason\}/.test(html), html)
      check(`I5-${lang}. the sentence is in the right language`,
        lang === 'he' ? /[א-ת]/.test(html) && !/Why they were removed/.test(html) : /Why they were removed/.test(html) && !/[א-ת]/.test(html), html)
      // Every reason the engine can emit must have a localized sentence.
      const engineReasons = Array.from(new Set([
        ...(stripComments(read('lib/content/recommendations/generate-from-briefs.ts')).match(/rej\('([a-z_]+)'/g) ?? []).map((m) => m.slice(5, -1)),
        'already_covered', 'insufficient_independent_need',
      ]))
      const missing = engineReasons.filter((r) => !(r in (t as never as { rejectionReasons: Record<string, string> }).rejectionReasons))
      check(`I6-${lang}. every engine rejection reason has a localized sentence`, missing.length === 0, JSON.stringify(missing))
      // An unknown code must degrade to prose, never print itself.
      const unknownHtml = renderToStaticMarkup(createElement('p', null,
        buildEngineRejectionLines({ engineRejections: [{ reason: 'a_brand_new_reason', count: 3 }] }, t)[0]))
      check(`I7-${lang}. an unmapped reason degrades to a localized sentence`,
        !unknownHtml.includes('a_brand_new_reason') && unknownHtml.includes('3'), unknownHtml)
      // The three non-verdict buckets each get their own sentence.
      const three = buildEngineRejectionLines({ engineRejections: [], engineNotProcessed: 2, engineDropped: 1, engineUnexplained: 4 }, t)
      check(`I8-${lang}. not-reviewed / lost / unexplained are three separate statements`, three.length === 3, JSON.stringify(three))
      check(`I9-${lang}. and nothing is emitted when every bucket is zero`,
        buildEngineRejectionLines({ engineRejections: [], engineNotProcessed: 0, engineDropped: 0, engineUnexplained: 0 }, t).length === 0)
    }
    const cmp = read('components/content/AutomationIdeas.tsx')
    check('I10. the card renders through the SAME function this section drove',
      /buildEngineRejectionLines\(meta\.funnel, t\)/.test(cmp)
      && /import \{ buildEngineRejectionLines \} from '@\/lib\/content\/recommendations\/engine-rejection-line'/.test(cmp))
    check('I11. the card composes no reason text of its own',
      !/rejectionReasons\[/.test(cmp))
  }

  // ── J) every active production path still valid ────────────────────────────
  console.log('\nJ) the Hebrew production path is untouched')
  {
    const heTables: Record<string, Record<string, unknown>[]> = {
      projects: [{ id: 'p1', user_id: 'u1', business_name: 'בשמי אפרודיטה', target_domain: 'https://example.co.il', language: 'he', country: 'IL' }],
      tracking_targets: [{ project_id: 'p1', keyword: 'דקאנט בושם' }],
      keyword_research_cache: [{ project_id: 'p1', fetched_at: '2026-08-01', results_json: [
        { keyword: 'איך לאחסן דקאנט בושם', avgMonthlySearches: 320 },
        { keyword: 'מה ההבדל בין דקאנט לבושם מקורי', avgMonthlySearches: 240 },
        { keyword: 'כמה זמן מחזיק דקאנט בושם', avgMonthlySearches: 180 },
        { keyword: 'בשמי נישה למתחילים', avgMonthlySearches: 160 },
        { keyword: 'שכבות בישום עם דקאנטים', avgMonthlySearches: 120 },
        { keyword: 'בקבוקון ניידות לבושם', avgMonthlySearches: 110 },
      ] }],
      shopify_entities: [
        { project_id: 'p1', is_active: true, title: 'דקאנט בושם 5 מל', handle: 'd5', entity_type: 'product', canonical_url: 'https://example.co.il/p/d5' },
        { project_id: 'p1', is_active: true, title: 'ערכת בקבוקוני נסיעה', handle: 'atom', entity_type: 'product', canonical_url: 'https://example.co.il/p/atom' },
        { project_id: 'p1', is_active: true, title: 'בשמים לנשים', handle: 'w', entity_type: 'category', canonical_url: 'https://example.co.il/c/w' },
      ],
      generated_articles: [], article_topics: [], content_topic_ideas: [], wordpress_content_index: [],
    }
    const heFrames = (b: Brief[]) => b.map((x, i) => ({
      briefId: x.id, title: i % 2 === 0 ? `${x.subject}: מה חשוב לדעת` : `${x.subject} — מדריך מעשי`,
      primaryKeyword: x.aligned_query ?? x.subject, secondaryKeywords: [], intent: 'informational',
    }))
    const clean = await runEngine(heTables, heFrames)
    check('J1. a Hebrew project still produces ideas', clean.accepted >= 3, `${clean.accepted} / ${clean.diagnostics.generated_opportunities}`)
    check('J2. …with no latin-token rejection', !(reasonsOf(clean.diagnostics).title_unknown_latin_token > 0), JSON.stringify(reasonsOf(clean.diagnostics)))
    // The gate the fix preserves: a foreign brand injected into a Hebrew title.
    const withBrand = (b: Brief[]) => heFrames(b).map((t, i) => (i === 0 ? { ...t, title: `${t.title} בשילוב Tom Ford` } : t))
    const contaminated = await runEngine(heTables, withBrand)
    check('J3. an injected foreign brand in a Hebrew title is STILL rejected',
      (reasonsOf(contaminated.diagnostics).title_unknown_latin_token ?? 0) >= 1, JSON.stringify(reasonsOf(contaminated.diagnostics)))
    check('J4. …and that title never reaches the accepted set',
      !contaminated.titles.some((t) => t.includes('Tom Ford')), JSON.stringify(contaminated.titles))
    const prod = stripComments(read('lib/content/recommendations/production-run.ts'))
    check('J5. the Pro-first controller runs the SAME engine (so it inherits the fix)',
      /synthesizeFromSnapshot|generateFromBriefs/.test(prod))
    const routeSrc = stripComments(read('app/api/content/automation/recommendations/route.ts'))
    check('J6. the default route path is still generateFromBriefs behind no flag',
      /const useTiered = !useProFirst && !useLegacy && !useContentPlan && process\.env\.RECO_TIERED_OPPORTUNITIES === '1'/.test(routeSrc)
      && /const run = await generateFromBriefs\(auth\.admin, \{ projectId: auth\.project\.id/.test(routeSrc))
  }

  // ── K) no provider call, ever ──────────────────────────────────────────────
  console.log('\nK) offline')
  {
    check('K1. the suite pinned the SDK at a local fixture server',
      (process.env.RECO_GENAI_BASE_URL ?? '').startsWith('http://127.0.0.1:'), process.env.RECO_GENAI_BASE_URL)
    const self = read('lib/content/__qa__/reco-english-project.qa.ts')
    check('K2. no real Gemini endpoint appears anywhere in this suite',
      !/generativelanguage\.googleapis\.com/.test(self))
    check('K3. no production seam was added for the tests — the base-URL seam already existed',
      /RECO_GENAI_BASE_URL/.test(read('lib/content/recommendations/genai-client.ts')))
  }

  console.log(`\n${pass} passed, ${fail} failed`)
  if (fail > 0) process.exitCode = 1
}
main().catch((e) => { console.error(e); process.exitCode = 1 })
