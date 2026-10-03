#!/usr/bin/env node
/**
 * Mutation controls for lib/keyword-research/__qa__/competitive.qa.ts, on the REAL files.
 *
 * Each control breaks one thing in a real source file, runs the suite, and passes
 * only when the named checks fail with the suite's summary line (not a crash). The
 * file is then restored byte for byte and its sha256 compared with the original.
 *
 *   node lib/keyword-research/__qa__/competitive-mutations.mjs            run every control
 *   node lib/keyword-research/__qa__/competitive-mutations.mjs --anchors  only check every anchor is found once
 *   node lib/keyword-research/__qa__/competitive-mutations.mjs --only C4,C18
 *
 * Not a *.qa.ts suite on purpose: it edits files, so it never runs inside verify.mjs.
 */
import { spawnSync } from 'node:child_process'
import { createHash } from 'node:crypto'
import { readFileSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', '..', '..')
const SUITE = 'lib/keyword-research/__qa__/competitive.qa.ts'
const F = {
  lib: 'lib/keyword-research/competitive.ts',
  route: 'lib/keyword-research/competitive-route.ts',
  view: 'components/keyword-research/competitive/competitive-view.ts',
  rankings: 'components/keyword-research/competitive/ExistingRankings.tsx',
  standing: 'components/keyword-research/competitive/CompetitorStanding.tsx',
  dict: 'lib/i18n/dashboard/research-competitive.ts',
}
const e = (find, replace) => ({ find, replace })

/** id, file, edits, the checks that must fail. */
const CONTROLS = [
  // share math
  ['C1 share ignores the CTR curve', F.lib, [e('s.clicks += volume * ctrAt(position)', 's.clicks += volume')], ['S2', 'S3']],
  ['C2 share divides by the wrong total', F.lib, [e("share: total > 0 ? s.clicks / total : 0,", "share: total > 0 ? s.clicks / (total * 2) : 0,")], ['S3']],
  ['C3 unweighted keywords counted as weighted', F.lib, [e('if (volume > 0) weighted++', 'weighted++')], ['S6']],
  ['C4 a curve that rises', F.lib, [e('  0.28, 0.15, 0.11,', '  0.15, 0.28, 0.11,')], ['S1', 'S2']],
  ['C5 average over all compared keywords', F.lib, [e('avgPosition: s.ranked > 0 ? round1(posSum / s.ranked) : null,', 'avgPosition: s.ranked > 0 ? round1(posSum / battles.length) : null,')], ['S4']],
  ['C6 competitor ahead counted as a win', F.lib, [e(": best.position < own ? 'loss' : 'tie'", ": best.position < own ? 'win' : 'tie'")], ['B1']],
  // dedupe
  ['C7 dedupe key is the raw text', F.lib, [e('export const rankingKey = (keyword: string): string => normalizeQuery(keyword)', 'export const rankingKey = (keyword: string): string => keyword')], ['D1', 'D3']],
  ['C8 Search Console rows not deduped against tracked', F.lib, [e('if (seen.has(q.key) || gscOnly >= GSC_QUERIES_MAX) continue', 'if (gscOnly >= GSC_QUERIES_MAX) continue')], ['D1', 'D4']],
  ['C9 duplicate targets kept', F.lib, [e('if (!prev || (t.check', 'if (true || (t.check')], ['D2']],
  // mapping
  ['C10 any second page competes', F.lib, [e('return q.pages.filter((p) => p.share >= COMPETING_MIN_SHARE).length >= 2', 'return q.pages.length >= 2')], ['M1']],
  ['C11 "no page" claimed without a check', F.lib, [e("flag: checkedMissing ? 'no_page' : 'unknown'", "flag: 'no_page'")], ['M3']],
  // labels
  ['C12 Search Console column labelled as our check', F.rankings, [e('{t.colGsc}<SourceTag source="gsc" short />', '{t.colGsc}<SourceTag source="scan" short />')], ['L4']],
  ['C13 Search Console label says "our check"', F.dict, [e("gsc: 'ממוצע Search Console · 28 ימים',", "gsc: 'הבדיקה שלנו · Search Console · 28 ימים',")], ['L1']],
  ['C14 the average value loses its label', F.rankings, [e('<span title={dict.source.gsc} className', '<span className')], ['L5']],
  ['C15 share tile unlabelled', F.standing, [e('<SourceTag source="scan" date={date} />', '')], ['L8']],
  // states
  ['C16 connect prompt before the status is in', F.view, [e("  if (gsc.state === 'loading') return { state: 'loading' }\n", '')], ['V1']],
  ['C17 a failed read shown as empty', F.view, [e("if (fetchState.state === 'error') return { state: 'error' }", "if (fetchState.state === 'error') return { state: 'loading' }")], ['V3']],
  // route
  ['C18 competitor positions not scoped to the owner', F.route, [e(".from('keyword_competitor_positions')\n          .select('tracking_target_id, competitor_domain, position, url, checked_at')\n          .eq('project_id', projectId)\n          .eq('user_id', userId)", ".from('keyword_competitor_positions')\n          .select('tracking_target_id, competitor_domain, position, url, checked_at')\n          .eq('project_id', projectId)")], ['R3', 'R7']],
  ['C19 Search Console rows not scoped to the project', F.route, [e(".eq('sync_run_id', run.id)\n            .eq('project_id', projectId)", ".eq('sync_run_id', run.id)")], ['R4', 'R7']],
  ['C20 project read without the owner', F.route, [e(".eq('id', projectId).eq('user_id', userId).maybeSingle()", ".eq('id', projectId).maybeSingle()")], ['R7']],
]

const sha = (s) => createHash('sha256').update(s).digest('hex')
const anchorsOnly = process.argv.includes('--anchors')
const onlyAt = process.argv.indexOf('--only')
const only = onlyAt > 0 ? process.argv[onlyAt + 1].split(',') : null
let ok = 0, bad = 0
for (const [id, file, edits, mustFail] of CONTROLS) {
  if (only && !only.some((o) => id.split(' ')[0] === o)) continue
  const path = join(ROOT, file)
  const original = readFileSync(path, 'utf8')
  let mutated = original
  let anchored = true
  for (const { find, replace } of edits) {
    const count = mutated.split(find).length - 1
    if (count !== 1) { anchored = false; console.log(`  ✗ ${id}: anchor found ${count}× in ${file}: ${find.slice(0, 60)}`); break }
    mutated = mutated.replace(find, replace)
  }
  if (!anchored) { bad++; continue }
  if (anchorsOnly) { ok++; continue }
  writeFileSync(path, mutated)
  let out = ''
  try {
    const r = spawnSync('npx', ['tsx', SUITE], { cwd: ROOT, encoding: 'utf8', timeout: 240_000 })
    out = `${r.stdout ?? ''}${r.stderr ?? ''}`
  } finally {
    writeFileSync(path, original)
  }
  if (sha(readFileSync(path, 'utf8')) !== sha(original)) { console.log(`  ✗ ${id}: ${file} NOT restored`); process.exit(2) }
  const summary = /(\d+) passed, (\d+) failed/.exec(out)
  const failed = mustFail.filter((c) => new RegExp(`✗ ${c}:`).test(out))
  if (summary && Number(summary[2]) > 0 && failed.length === mustFail.length) { ok++; console.log(`  ✓ ${id} → ${mustFail.join(', ')} failed`) }
  else { bad++; console.log(`  ✗ ${id}: expected ${mustFail.join(', ')} to fail; got ${summary ? summary[0] : 'no summary'}`); console.log(out.split('\n').filter((l) => l.includes('✗')).slice(0, 5).join('\n')) }
}
console.log(`\n${ok} passed, ${bad} failed`)
process.exit(bad > 0 ? 1 : 0)
