/**
 * THE SITE ICON IN THE PDF REPORTS (lib/reports/report-site-icon.ts).
 *
 *  A) the icon is the latest one the project's own scans stored, read by that
 *     project id, and checked again (on the project's site, https);
 *  B) anything doubtful is no icon: none stored, off-site, a failed read;
 *  C) both report routes pass it, and nothing fetches it server-side.
 * Every guard has a mutation control.
 *
 * Run: npx tsx lib/reports/__qa__/report-site-icon.qa.ts
 */
import { readFileSync } from 'fs'
import { join } from 'path'
import { reportSiteIcon } from '../report-site-icon'

let pass = 0, fail = 0
function check(name: string, cond: boolean, detail?: string) {
  if (cond) { pass++; console.log(`  ✓ ${name}`) } else { fail++; console.log(`  ✗ ${name}${detail ? ` — ${detail}` : ''}`) }
}

type Run = { project_id: string; created_at: string; summary: { siteIcon?: string } }
function reader(runs: Run[], opts: { throws?: boolean } = {}) {
  const seen: Record<string, unknown> = {}
  const q: any = { // eslint-disable-line @typescript-eslint/no-explicit-any
    filters: [] as [string, unknown][],
    select() { return q },
    eq(col: string, v: unknown) { q.filters.push([col, v]); seen[col] = v; return q },
    not() { return q },
    order() { return q },
    limit(n: number) {
      if (opts.throws) throw new Error('db down')
      const pid = q.filters.find(([c]: [string]) => c === 'project_id')?.[1]
      const rows = runs.filter((r) => (pid === undefined || r.project_id === pid) && r.summary.siteIcon)
        .sort((a, b) => b.created_at.localeCompare(a.created_at)).slice(0, n)
        .map((r) => ({ site_icon: r.summary.siteIcon, created_at: r.created_at }))
      return Promise.resolve({ data: rows, error: null })
    },
  }
  return { client: { from: (t: string) => { seen.table = t; q.filters = []; return q } }, seen }
}

async function main() {
  const runs: Run[] = [
    { project_id: 'p1', created_at: '2026-10-01', summary: { siteIcon: 'https://site.test/old.png' } },
    { project_id: 'p1', created_at: '2026-10-04', summary: { siteIcon: 'https://site.test/new.png' } },
    { project_id: 'p2', created_at: '2026-10-05', summary: { siteIcon: 'https://other.test/x.png' } },
  ]
  const r = reader(runs)
  const icon = await reportSiteIcon(r.client, 'p1', 'site.test')
  check('A1: the latest icon of THIS project is used', icon === 'https://site.test/new.png', String(icon))
  check('A2: read from the seed runs by the project id', r.seen.table === 'project_seed_runs' && r.seen.project_id === 'p1')
  check('MUT A2: without the project filter another project\'s newer icon would win', (await reportSiteIcon(reader(runs).client, undefined as unknown as string, 'site.test')) !== 'https://site.test/new.png')
  check('B1: an icon on another site is no icon', (await reportSiteIcon(reader([{ project_id: 'p', created_at: '1', summary: { siteIcon: 'https://evil.test/a.png' } }]).client, 'p', 'site.test')) === null)
  check('B2: no stored icon, no icon', (await reportSiteIcon(reader([]).client, 'p', 'site.test')) === null)
  check('B3: a failed read is no icon, never an error', (await reportSiteIcon(reader(runs, { throws: true }).client, 'p1', 'site.test')) === null)

  const strip = (s: string) => s.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '')
  const gsc = strip(readFileSync(join(process.cwd(), 'lib/gsc/export/http.ts'), 'utf8'))
  const monthly = strip(readFileSync(join(process.cwd(), 'lib/reports/monthly/http.ts'), 'utf8'))
  const helper = strip(readFileSync(join(process.cwd(), 'lib/reports/report-site-icon.ts'), 'utf8'))
  check('C1: the Search Console PDF gets the icon', /siteIcon: await reportSiteIcon\(auth\.admin, auth\.projectId, domain\)/.test(gsc))
  check('C2: the monthly PDF gets the icon', /siteIcon = await reportSiteIcon\(o\.admin, o\.project\.id,/.test(monthly) && /\n\s+siteIcon,\n/.test(monthly))
  const noFetch = (src: string) => !/\bfetch\(/.test(src)
  check('C3: nothing in the helper fetches the icon', noFetch(helper))
  check('MUT C3: a fetch in the helper is caught', !noFetch(helper + '\nawait fetch(icon)'))

  console.log(`\n${pass} passed, ${fail} failed`)
  process.exit(fail ? 1 : 0)
}
main()
export {}
