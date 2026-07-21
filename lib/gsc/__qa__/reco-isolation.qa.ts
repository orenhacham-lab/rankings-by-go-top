/**
 * Stage E1 — HARD isolation guard. GSC is ingestion + observability ONLY and must never
 * touch the recommendation engine. This test statically proves:
 *   1. No file under lib/content/recommendations/** imports or references lib/gsc.
 *   2. The frozen recommendation files carry no GSC reference at all.
 *   3. No GSC table name leaks into the recommendation engine.
 *   4. The GSC layer never imports recommendation internals (one-directional).
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
const GSC_REF = /(from\s+['"][^'"]*\/gsc\b|['"]@\/lib\/gsc|\bgsc_connections\b|\bgsc_sync_runs\b|\bgsc_query_page_metrics\b|project_gsc_properties|gsc_oauth_states)/

function main() {
  console.log('GSC ↔ recommendation-engine isolation')

  const recoDir = join(ROOT, 'lib', 'content', 'recommendations')
  const recoFiles = walk(recoDir).filter((p) => !p.includes('__qa__'))
  const offenders = recoFiles.filter((p) => GSC_REF.test(readFileSync(p, 'utf8')))
  check(`no GSC import/reference anywhere in lib/content/recommendations/** (${recoFiles.length} files)`, offenders.length === 0, offenders.map((p) => p.replace(ROOT, '')).join(', '))

  // Explicitly re-check the named FROZEN files.
  const frozen = [
    'lib/content/recommendations/opportunity-brief.ts',
    'lib/content/recommendations/generate-from-briefs.ts',
    'lib/content/recommendations/finalize-attempt.ts',
    'lib/content/recommendations/intra-run-dedupe.ts',
    'lib/content/recommendations/final-outcomes.ts',
  ]
  for (const rel of frozen) {
    let src = ''
    try { src = readFileSync(join(ROOT, rel), 'utf8') } catch { /* file may be named differently; skip */ }
    if (src) check(`frozen file has no GSC reference: ${rel.split('/').pop()}`, !GSC_REF.test(src))
  }

  // Wider net: the whole recommendation-adjacent content lib (excluding the gsc dir itself).
  const contentDir = join(ROOT, 'lib', 'content')
  const contentOffenders = walk(contentDir)
    .filter((p) => !p.includes('__qa__'))
    .filter((p) => GSC_REF.test(readFileSync(p, 'utf8')))
  check('no GSC reference anywhere under lib/content/** (recommendation-adjacent code)', contentOffenders.length === 0, contentOffenders.map((p) => p.replace(ROOT, '')).join(', '))

  // One-directional: the GSC layer must not import recommendation internals.
  const gscDir = join(ROOT, 'lib', 'gsc')
  const RECO_REF = /from\s+['"][^'"]*recommendations|['"]@\/lib\/content\/recommendations/
  const gscImportingReco = walk(gscDir).filter((p) => !p.includes('__qa__')).filter((p) => RECO_REF.test(readFileSync(p, 'utf8')))
  check('GSC layer does not import the recommendation engine', gscImportingReco.length === 0, gscImportingReco.map((p) => p.replace(ROOT, '')).join(', '))

  console.log(`\n${pass} passed, ${fail} failed`)
  if (fail > 0) process.exit(1)
}
main()
