/**
 * The Search Console table in project settings, driven in real Chromium.
 *
 * Reported on 14 October 2026: opening "multi-page queries" and then the tab next
 * to it showed "this screen did not load", and the rows-per-page number was cut.
 * Cause: the rows of the multi-page tab (no page, no position) were drawn in the
 * per-page table for one render before the new read began, and `position.toFixed`
 * threw. The number was cut because the select is 32px high and kept its 8px
 * vertical padding around a 24px line.
 *
 * The real component is bundled with esbuild and mounted with a stubbed fetch, so
 * the clicks, renders and layout are the browser's own.
 *
 * MUTATION CONTROLS, run by hand: drawing `loaded.rows` regardless of the tab
 * (the old behaviour) fails B; putting `py-2` back on the select fails C.
 *
 * Run: npx tsx components/content/__qa__/gsc-tab-switch-browser.qa.ts
 */
/* eslint-disable @typescript-eslint/no-explicit-any, @typescript-eslint/no-require-imports */
import { mkdtempSync, writeFileSync, existsSync } from 'fs'
import { join } from 'path'
import { tmpdir } from 'os'
import { getDashboardDictionary } from '../../../lib/i18n/dashboard/getDashboardDictionary'

let pass = 0, fail = 0
function check(name: string, cond: boolean, detail?: unknown) {
  if (cond) { pass++; console.log(`  ✓ ${name}`) } else { fail++; console.log(`  ✗ ${name}${detail !== undefined ? ` — ${JSON.stringify(detail)}` : ''}`) }
}

const ROOT = join(__dirname, '..', '..', '..')
const he = getDashboardDictionary('he').projectDetail.contentSection.gsc

const ENTRY = `
import { createRoot } from 'react-dom/client'
import GscMetricsTable from '@/components/content/GscMetricsTable'
import { DashboardLanguageProvider } from '@/lib/i18n/dashboard/useDashboardLanguage'
const summary = { runId: 'r1', windowDays: 28, startDate: '2026-09-15', endDate: '2026-10-12', latestAvailableDate: '2026-10-12', rowsFetched: 3, truncated: false, finishedAt: '2026-10-13T05:00:00Z', clicks: 5, impressions: 90, ctr: 0.05, avgPosition: 8.2 }
const status = { ok: true, oauthConfigured: true, connection: { status: 'connected' }, property: { siteUrl: 'https://a.co.il/' }, windows: { '28': summary, '90': summary } }
const metric = [{ query: 'ניקיון משרדים', page: 'https://a.co.il/x', clicks: 3, impressions: 50, ctr: 0.06, position: 7.1 }]
const multi = [{ query: 'ניקיון', distinctPageCount: 2, totalClicks: 4, totalImpressions: 70, pages: ['https://a.co.il/x', 'https://a.co.il/y'] }]
;(window as any).__delay = { multipage: 0, queries: 0, opportunities: 0 }
window.fetch = async (input: any) => {
  const url = new URL(String(input), location.href)
  if (url.pathname === '/api/gsc/status') return new Response(JSON.stringify(status), { status: 200 })
  const view = url.searchParams.get('view') || 'queries'
  await new Promise((r) => setTimeout(r, (window as any).__delay[view] || 0))
  const rows = view === 'multipage' ? multi : metric
  return new Response(JSON.stringify({ ok: true, rows, total: rows.length }), { status: 200 })
}
window.addEventListener('error', (e) => { (window as any).__errors = [...((window as any).__errors || []), String(e.message)] })
createRoot(document.getElementById('root')!).render(<DashboardLanguageProvider initialLocale="he"><GscMetricsTable projectId="p1" /></DashboardLanguageProvider>)
`

async function main() {
  console.log('GSC table: switching tabs and the rows-per-page field, in Chromium')
  const esbuild = require('esbuild')
  const dir = mkdtempSync(join(tmpdir(), 'gsc-tabs-'))
  const entry = join(ROOT, 'components', 'content', '__qa__', '.gsc-tab-entry.tsx')
  writeFileSync(entry, ENTRY)
  let js = ''
  try {
    const out = await esbuild.build({
      entryPoints: [entry], bundle: true, write: false, format: 'iife', jsx: 'automatic', platform: 'browser',
      tsconfig: join(ROOT, 'tsconfig.json'), define: { 'process.env.NODE_ENV': '"development"' }, logLevel: 'silent',
      loader: { '.css': 'empty' },
    })
    js = out.outputFiles[0].text
  } finally { require('fs').rmSync(entry, { force: true }) }

  // The real Tailwind stylesheet is not built here; the classes the checks measure are
  // given their values from the theme (globals.css: text-copy 0.875rem / 1.5rem).
  const css = `
    *{box-sizing:border-box} select{font:inherit}
    .h-8{height:2rem} .w-24{width:6rem} .w-20{width:5rem} .px-3{padding-left:.75rem;padding-right:.75rem}
    .py-2{padding-top:.5rem;padding-bottom:.5rem} .py-0{padding-top:0;padding-bottom:0} .pe-9{padding-inline-end:2.25rem}
    .text-copy{font-size:.875rem;line-height:1.5rem} .border{border:1px solid #ccc} .appearance-none{appearance:none}`
  const html = join(dir, 'index.html')
  writeFileSync(join(dir, 'app.js'), js)
  writeFileSync(html, `<!doctype html><html lang="he" dir="rtl"><head><meta charset="utf-8"><style>${css}</style></head><body><div id="root"></div><script>window.process={env:{NODE_ENV:"development"}}</script><script src="app.js"></script></body></html>`)

  const { chromium } = require('playwright-core')
  const exe = ['/opt/pw-browsers/chromium', process.env.CHROMIUM_PATH].find((p) => p && existsSync(p))
  const browser = await chromium.launch(exe ? { executablePath: exe } : {})
  try {
    const page = await browser.newPage()
    page.on("pageerror", (e: any) => console.log("[pageerror]", String(e).slice(0, 300)))
    await page.goto(`file://${html}`)
    const tab = (label: string) => page.getByRole('radio', { name: label }).or(page.getByRole('button', { name: label })).or(page.getByRole('tab', { name: label })).first()
    const crashed = async () => ((await page.evaluate(() => (window as any).__errors || [])) as string[])
    await page.getByText('ניקיון משרדים').waitFor({ timeout: 10_000 })

    console.log('A) the multi-page tab opens')
    await tab(he.tabMultipage).click()
    await page.getByRole('cell', { name: 'ניקיון', exact: true }).waitFor({ timeout: 5000 })
    check('its rows are shown', await page.getByRole('cell', { name: 'ניקיון', exact: true }).isVisible())

    console.log('B) leaving it for the tab next to it does not break the screen')
    await tab(he.tabOpportunities).click()
    await page.getByText('ניקיון משרדים').waitFor({ timeout: 5000 }).catch(() => {})
    check('no error was thrown', (await crashed()).length === 0, await crashed())
    check('the per-page rows are shown', await page.getByText('ניקיון משרדים').isVisible())
    await tab(he.tabMultipage).click()
    await page.getByRole('cell', { name: 'ניקיון', exact: true }).waitFor({ timeout: 5000 }).catch(() => {})
    await tab(he.tabQueries).click()
    await page.getByText('ניקיון משרדים').waitFor({ timeout: 5000 }).catch(() => {})
    check('and to the queries tab too', (await crashed()).length === 0 && await page.getByText('ניקיון משרדים').isVisible(), await crashed())

    // A slow multi-page answer that lands after the user already moved on is dropped.
    await page.evaluate(() => { (window as any).__delay.multipage = 600 })
    await tab(he.tabMultipage).click()
    await tab(he.tabQueries).click()
    await page.waitForTimeout(900)
    check('a late answer for the tab just left is not drawn', (await crashed()).length === 0 && await page.getByText('ניקיון משרדים').isVisible(), await crashed())

    console.log('C) the rows-per-page number is not cut')
    const box = await page.locator('select').first().evaluate((el: HTMLSelectElement) => {
      const s = getComputedStyle(el)
      const inner = el.clientHeight - parseFloat(s.paddingTop) - parseFloat(s.paddingBottom)
      return { inner, line: parseFloat(s.lineHeight), height: el.offsetHeight }
    })
    check('the line fits inside the field', box.inner >= box.line, box)
  } finally { await browser.close() }

  console.log(`\n${pass} passed, ${fail} failed`)
  if (fail > 0) process.exitCode = 1
}
main().catch((e) => { console.error(e); process.exitCode = 1 })

export {}
