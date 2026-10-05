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
import { generateReportHTML, generateAIReportHTML } from '@/lib/export/pdf'

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
  const rankRoute = strip(readFileSync(join(process.cwd(), 'app/api/reports/export-pdf/route.ts'), 'utf8'))
  check('C4: the rankings and AI reports get the icon of the project being exported',
    /const siteIcon = await reportSiteIcon\(supabase, projectId,/.test(rankRoute) && (rankRoute.match(/\n\s+siteIcon,\n/g) ?? []).length === 2)
  const base = { client: { name: 'BUY BUY' }, project: { name: 'BUY BUY', target_domain: 'buy-buy.co.il' } } as any // eslint-disable-line @typescript-eslint/no-explicit-any
  const rank = generateReportHTML({ ...base, targets: [], latestResults: {}, language: 'he', siteIcon: 'https://buy-buy.co.il/icon.png' })
  const ai = generateAIReportHTML({ ...base, summary: { totalScans: 0, totalResults: 0, mentionedCount: 0, citedCount: 0, totalCitations: 0, mentionRate: 0, citationRate: 0, engineBreakdown: {} }, results: [], siteIcon: 'https://buy-buy.co.il/icon.png' } as any) // eslint-disable-line @typescript-eslint/no-explicit-any
  const inName = (html: string) => /<div class="project-name"><img class="site-icon" src="https:\/\/buy-buy\.co\.il\/icon\.png" alt="" width="28" height="28" referrerpolicy="no-referrer">BUY BUY<\/div>/.test(html)
  check('C5: in the rankings report the icon sits on the brand-name line', inName(rank))
  check('C6: and in the AI visibility report', inName(ai))
  check('C7: no icon, no image: the rankings report header is as before',
    !generateReportHTML({ ...base, targets: [], latestResults: {}, language: 'he' }).includes('<img'))
  check('MUT C5: a report without the icon is caught', !inName(rank.replace(/<img class="site-icon"[^>]*>/, '')))
  const noFetch = (src: string) => !/\bfetch\(/.test(src)
  check('C3: nothing in the helper fetches the icon', noFetch(helper))
  check('MUT C3: a fetch in the helper is caught', !noFetch(helper + '\nawait fetch(icon)'))

  console.log(`\n${pass} passed, ${fail} failed`)
  process.exit(fail ? 1 : 0)
}
main()
export {}
