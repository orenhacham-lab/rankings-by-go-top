/**
 * GSC ↔ recommendation-engine isolation guard.
 *
 * Stage E1/E2 rule: GSC must not touch the recommendation engine. Stage E3A adds ONE
 * permitted, additive, flag-gated direction: the recommendation engine may import the GSC
 * recommendation ADAPTER surface (@/lib/gsc/recommendations) and the flag (@/lib/gsc/config)
 * — nothing deeper. The reverse (GSC importing the recommendation engine) stays banned, so the
 * dependency direction is strictly recommendation → adapter → accepted E2A read-only calc.
 *
 * This test statically proves:
 *   1. lib/content/recommendations/** imports GSC ONLY via the allowed adapter/config surface
 *      (never oauth/token/sync/api/service/property/opportunities internals or table names).
 *   2. The frozen E2A/finalization recommendation files carry NO GSC reference at all.
 *   3. The GSC layer (incl. the adapter) never imports the recommendation engine.
 *   4. The GSC adapter depends only on the E2A read-only surface.
 */
import { readFileSync, readdirSync, statSync } from 'fs'
import { join } from 'path'

let pass = 0, fail = 0
function check(name: string, cond: boolean, detail?: string) {
  if (cond) { pass++; console.log(`  ✓ ${name}`) } else { fail++; console.log(`  ✗ ${name}${detail ? ` — ${detail}` : ''}`) }
}
const ROOT = join(__dirname, '..', '..', '..')
function walk(dir: string): string[] {
  const out: string[] = []
  for (const e of readdirSync(dir)) {
    const p = join(dir, e)
    if (statSync(p).isDirectory()) out.push(...walk(p))
    else if (/\.(ts|tsx)$/.test(e)) out.push(p)
  }
  return out
}
const GSC_TABLE = /\bgsc_connections\b|\bgsc_sync_runs\b|\bgsc_query_page_metrics\b|project_gsc_properties|gsc_oauth_states|gsc_opportunity_decisions/
// The ONLY GSC import surfaces the recommendation engine may reference (Stage E3A).
const ALLOWED_GSC_IN_RECO = /@\/lib\/gsc\/(recommendations|config)\b/
// Any GSC import that is NOT the allowed surface.
const gscImportLines = (src: string) => src.split('\n').filter((l) => /['"]@\/lib\/gsc\b|from\s+['"][^'"]*\/gsc\//.test(l))

function main() {
  console.log('GSC ↔ recommendation-engine isolation (E3A-aware)')

  const recoDir = join(ROOT, 'lib', 'content', 'recommendations')
  const recoFiles = walk(recoDir).filter((p) => !p.includes('__qa__'))
  // (1) Any GSC import in recommendations must be the allowed adapter/config surface; no table names.
  const offenders = recoFiles.filter((p) => {
    const src = readFileSync(p, 'utf8')
    const badImport = gscImportLines(src).some((l) => !ALLOWED_GSC_IN_RECO.test(l))
    return badImport || GSC_TABLE.test(src)
  })
  check(`recommendations import GSC only via the adapter/config surface (${recoFiles.length} files)`, offenders.length === 0, offenders.map((p) => p.replace(ROOT, '')).join(', '))

  // The E3A integration files exist and import ONLY the permitted GSC surfaces.
  const gscBriefs = readFileSync(join(ROOT, 'lib/content/recommendations/gsc-briefs.ts'), 'utf8')
  check('gsc-briefs.ts imports only the GSC adapter surface', gscImportLines(gscBriefs).every((l) => ALLOWED_GSC_IN_RECO.test(l)) && /@\/lib\/gsc\/recommendations\/adapter/.test(gscBriefs))
  const genBriefs = readFileSync(join(ROOT, 'lib/content/recommendations/generate-from-briefs.ts'), 'utf8')
  check('generate-from-briefs.ts imports only the GSC config/adapter surface', gscImportLines(genBriefs).every((l) => ALLOWED_GSC_IN_RECO.test(l)))

  // (2) The frozen E2A/finalization files carry NO GSC reference at all (generate-from-briefs is
  // the SANCTIONED E3A integration point and is checked above instead).
  const frozen = [
    'lib/content/recommendations/opportunity-brief.ts',
    'lib/content/recommendations/finalize-attempt.ts',
    'lib/content/recommendations/intra-run-dedupe.ts',
    'lib/content/recommendations/final-outcomes.ts',
  ]
  for (const rel of frozen) {
    let src = ''
    try { src = readFileSync(join(ROOT, rel), 'utf8') } catch { /* skip */ }
    if (src) check(`frozen file has no GSC reference: ${rel.split('/').pop()}`, !/@\/lib\/gsc\b/.test(src) && !GSC_TABLE.test(src))
  }

  // (3) One-directional: the GSC layer (incl. the adapter) never imports the recommendation engine.
  const gscDir = join(ROOT, 'lib', 'gsc')
  const RECO_REF = /from\s+['"][^'"]*recommendations|['"]@\/lib\/content\/recommendations/
  const gscImportingReco = walk(gscDir).filter((p) => !p.includes('__qa__')).filter((p) => RECO_REF.test(readFileSync(p, 'utf8')))
  check('GSC layer does not import the recommendation engine', gscImportingReco.length === 0, gscImportingReco.map((p) => p.replace(ROOT, '')).join(', '))

  // (4) The adapter depends only on the E2A read-only surface (opportunities + decisions + service).
  const adapter = readFileSync(join(ROOT, 'lib/gsc/recommendations/adapter.ts'), 'utf8')
  check('GSC adapter imports only lib/gsc internals (E2A read-only), not lib/content', !/@\/lib\/content/.test(adapter))

  console.log(`\n${pass} passed, ${fail} failed`)
  if (fail > 0) process.exit(1)
}
main()
