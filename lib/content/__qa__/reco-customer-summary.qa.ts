/**
 * Customer-UX + scan-transparency QA (Parts 1-4). Proves the customer request always sends
 * source:"hybrid" with no selector/keyword, the generic "combined" badge is gone (GSC chip stays
 * conditional), the truthful scanSources derivation, and the Search Console run-state mapping +
 * messages. Pure helpers are tested directly; the UI/request rules are source contracts.
 */
import { readFileSync } from 'fs'
import { join } from 'path'
import { buildScanSources, buildGscRunSummary, type GscRunState } from '../recommendations/customer-run-summary'
import { getDashboardDictionary } from '../../i18n/dashboard/getDashboardDictionary'
import type { GscInputState } from '../../gsc/recommendations/types'

let pass = 0, fail = 0
function check(name: string, cond: boolean, detail?: string) {
  if (cond) { pass++; console.log(`  ✓ ${name}`) } else { fail++; console.log(`  ✗ ${name}${detail ? ` — ${detail}` : ''}`) }
}
const ROOT = join(__dirname, '..', '..', '..')
const read = (rel: string) => readFileSync(join(ROOT, rel), 'utf8')

function main() {
  console.log('Reco — customer smart-scan UX + transparency')
  const ui = read('components/content/AutomationIdeas.tsx')
  const route = read('app/api/content/automation/recommendations/route.ts')

  // ── Part 1 — one smart combined scan ─────────────────────────────────────────────
  check('(1) UI has no source tabs / source selector', !/sourceTabs/.test(ui) && !/setSource/.test(ui))
  check('(2) UI has no keyword input', !/setKeyword/.test(ui) && !/value=\{keyword\}/.test(ui))
  check('(3) the generation request always sends source: "hybrid"', /source: 'hybrid'/.test(ui) && !/source,\s*keyword/.test(ui))
  check('(1b) a single smart-combined-scan section is shown', /t\.smartScanTitle/.test(ui) && /t\.smartScanExplain/.test(ui))

  // ── Backward compatibility ───────────────────────────────────────────────────────
  check('(4) server still accepts all legacy sources', /const SOURCES: RecommendationSource\[\] = \['keyword', 'project_data', 'keyword_research_url', 'site_scan', 'hybrid'\]/.test(route))
  check('(4b) RecommendationSource enum is unchanged (5 values incl. hybrid)', /keyword_research_url/.test(route) && /site_scan/.test(route) && /hybrid/.test(route))
  check('(5) default/Pro-first engine path unchanged (route still routes source through generation)', /source,\s*(generated|reason)/.test(route) || /source, generated/.test(route))

  // ── Part 2 — generic badge removed, GSC chip kept + conditional ──────────────────
  check('(6) generic "combined" source badge is NOT rendered on cards', !/sourceBadge\(s\.source\)/.test(ui) && !/s\.supportingSources\.map/.test(ui))
  check('(7)(8) GSC chip renders ONLY when the idea was GSC-backed', /\{s\.basedOnGsc &&/.test(ui) && /\{t\.basedOnGsc\}/.test(ui))

  // ── Part 3 — truthful scanSources ────────────────────────────────────────────────
  const s = (o: { projectLoaded?: boolean; siteScanEntities?: number; keywordResearchQueries?: number; gscState?: GscInputState }) =>
    buildScanSources({ projectLoaded: o.projectLoaded ?? true, siteScanEntities: o.siteScanEntities ?? 0, keywordResearchQueries: o.keywordResearchQueries ?? 0, gscState: o.gscState ?? 'disabled' })
  check('(9) project data always included when the project loaded', s({}).projectData === true)
  check('(10) website scan listed ONLY when usable site-scan entities exist', s({ siteScanEntities: 3 }).websiteScan === true && s({ siteScanEntities: 0 }).websiteScan === false)
  check('(11) keyword research listed ONLY when usable queries exist', s({ keywordResearchQueries: 2 }).keywordResearch === true && s({ keywordResearchQueries: 0 }).keywordResearch === false)
  check('(9b) Search Console analyzed only for loaded / no_eligible', s({ gscState: 'loaded' }).searchConsole === true && s({ gscState: 'no_eligible_opportunities' }).searchConsole === true && ['disabled', 'not_connected', 'no_property', 'never_synced', 'read_failed'].every((st) => s({ gscState: st as GscInputState }).searchConsole === false))
  check('(16) scanSources exposes ONLY the four boolean flags (no counts/internals)', JSON.stringify(Object.keys(s({}).valueOf()).sort()) === JSON.stringify(['keywordResearch', 'projectData', 'searchConsole', 'websiteScan']))

  // ── Part 4 — GSC run-state mapping ───────────────────────────────────────────────
  const g = (p: { state: GscInputState; consumed?: number; added?: number; supported?: number }) =>
    buildGscRunSummary({ state: p.state, consumedGscBriefCount: p.consumed ?? 0, addedAsNewBriefCount: p.added ?? 0, supportedResultCount: p.supported ?? 0 })
  check('(13) loaded + supported>0 → supported', g({ state: 'loaded', consumed: 2, supported: 1 }).state === 'supported')
  check('(14) loaded + consumed>0 + supported=0 → evaluated_none_accepted', g({ state: 'loaded', consumed: 2, supported: 0 }).state === 'evaluated_none_accepted')
  check('(15) loaded + added>0 + consumed=0 → eligible_not_consumed', g({ state: 'loaded', added: 5, consumed: 0 }).state === 'eligible_not_consumed')
  check('(12a) loaded + nothing → no_eligible', g({ state: 'loaded' }).state === 'no_eligible')
  check('(12b) unavailable states map 1:1', g({ state: 'no_eligible_opportunities' }).state === 'no_eligible' && g({ state: 'not_connected' }).state === 'not_connected' && g({ state: 'no_property' }).state === 'no_property' && g({ state: 'never_synced' }).state === 'never_synced' && g({ state: 'read_failed' }).state === 'read_failed' && g({ state: 'disabled' }).state === 'disabled')
  check('(evaluatedCount) uses consumedGscBriefCount', g({ state: 'loaded', consumed: 4, supported: 1 }).evaluatedCount === 4)
  check('(16b) gscRunSummary exposes only {state, evaluatedCount, supportedResultCount}', JSON.stringify(Object.keys(g({ state: 'disabled' })).sort()) === JSON.stringify(['evaluatedCount', 'state', 'supportedResultCount']))

  // ── Messages exist for every customer-visible state (both languages) ─────────────
  for (const lang of ['he', 'en'] as const) {
    const t = getDashboardDictionary(lang).contentHub.autoIdeas
    const states: GscRunState[] = ['supported', 'evaluated_none_accepted', 'eligible_not_consumed', 'no_eligible', 'not_connected', 'no_property', 'never_synced', 'read_failed']
    check(`(12) every non-disabled GSC state has a message (${lang})`, states.every((st) => typeof (t.gscStatus as Record<string, unknown>)[st] === 'function'))
    check(`(supported msg interpolates count, ${lang})`, t.gscStatus.supported(3).includes('3'))
    check(`(evaluated msg interpolates count, ${lang})`, t.gscStatus.evaluated_none_accepted(7).includes('7'))
    check(`(sources labels present, ${lang})`, typeof t.sourcesAnalyzedLabel === 'string' && typeof t.srcProjectData === 'string' && typeof t.srcSearchConsole === 'string' && typeof t.smartScanTitle === 'string')
  }

  // ── Contract: supportedResultCount source + not diagnostics-gated ────────────────
  check('(13b) supportedResultCount = current-run GSC-backed accepted set (gscBackedFingerprints)', /supportedResultCount: gscBackedFingerprints\.size/.test(route))
  check('(17) scanSources + gscRunSummary are on the NORMAL meta (not diagnostics-gated)', /scanSources,\n\s*gscRunSummary,/.test(route))
  check('(19) no migration file referenced by this feature', !/supabase\/migrations/.test(ui) && !/\.sql/.test(read('lib/content/recommendations/customer-run-summary.ts')))

  // ── Part 1 — only supported + actionable states render a customer GSC message ─────
  check('(P1.1-3) internal-processing states render NO customer message (visible set excludes them)', /GSC_CUSTOMER_VISIBLE = new Set<GscRunState>\(\['supported', 'not_connected', 'no_property', 'never_synced', 'read_failed'\]\)/.test(ui))
  check('(P1) the GSC line renders only for the customer-visible set (not "!== disabled")', /GSC_CUSTOMER_VISIBLE\.has\(meta\.gscRunSummary\.state\)/.test(ui) && !/meta\.gscRunSummary\.state !== 'disabled'/.test(ui))
  check('(P1.6) connection/sync/read-failure remain visible + amber', ['not_connected', 'no_property', 'never_synced', 'read_failed'].every((st) => new RegExp(`'${st}'`).test(ui)) && /GSC_AMBER_STATES = new Set<GscRunState>\(\['not_connected', 'no_property', 'never_synced', 'read_failed'\]\)/.test(ui))
  for (const lang of ['he', 'en'] as const) {
    const t = getDashboardDictionary(lang).contentHub.autoIdeas
    const one = t.gscStatus.supported(1), many = t.gscStatus.supported(2)
    check(`(P1.4) supported singular grammar for 1 (${lang})`, one !== many && !one.includes('1') && (lang === 'he' ? one.includes('אחד') : /\bOne\b/.test(one)))
    check(`(P1.5) supported plural grammar for 2+ (${lang})`, many.includes('2'))
  }
  check('(P1.7) sources-analyzed line remains', /t\.sourcesAnalyzedLabel/.test(ui) && /sourcesAnalyzedText\(meta\.scanSources\)/.test(ui))
  check('(P1.8) per-card GSC chip remains', /\{s\.basedOnGsc &&/.test(ui) && /\{t\.basedOnGsc\}/.test(ui))

  // ── Part 2 — Preview/operator-only low-yield diagnostic ──────────────────────────
  check('(P2.9) operator diagnostic is gated by the diagnostics flag AND non-Production', /\(diagnostics && rtInfo\.vercelEnv !== 'production'\) \? \{\s*operatorRunDiag/.test(route))
  check('(P2.10) operator diagnostic renders only when the field is present (never in Production)', /\{meta\?\.operatorRunDiag && !loading &&/.test(ui))
  {
    const block = /operatorRunDiag: \{[\s\S]*?\n\s*\},/.exec(route)?.[0] ?? ''
    check('(P2) operator line uses only existing counts (no prompts/model output/opportunity ids/secrets)', block.includes('gscSupported: gscBackedFingerprints.size') && !/primaryQuery|opportunityId|\bprompt\b|apiKey|modelResponse|secret/i.test(block))
  }

  console.log(`\n${pass} passed, ${fail} failed`)
  if (fail > 0) process.exit(1)
}
main()
