/**
 * The UX review of 2026-09-27, part C (tables, dashboard density, settings,
 * dates and accessibility): what each fix promises, held by behaviour where it
 * can be, and by source guards where it is markup. Every source guard carries a
 * mutation control: the guard is run once more on the source broken on purpose,
 * and must fail there.
 *
 *   npx tsx lib/format/__qa__/ux-review-part-c.qa.ts
 *
 * The browser side (axe, WCAG 2.x A and AA, over a real build) is
 * lib/__qa__/reviewer-journey/axe-a11y.js.
 */
import { readFileSync } from 'fs'
import { join } from 'path'
import * as ts from 'typescript'
import { formatDate, EMPTY_DATE } from '../date'
import { activeSection, READING_LINE } from '@/components/settings/SettingsIndex'
import { showSaveBar } from '@/components/settings/SaveBar'
import { dashboardHe as he } from '@/lib/i18n/dashboard/he'
import { dashboardEn as en } from '@/lib/i18n/dashboard/en'

let passed = 0
let failed = 0
function check(name: string, ok: boolean, detail?: string) {
  if (ok) { passed++; console.log(`  ✓ ${name}`) } else { failed++; console.log(`  ✗ ${name}${detail ? ` — ${detail}` : ''}`) }
}

const ROOT = join(__dirname, '..', '..', '..')
/** A source without its comments (JSX ones too): printed back by the TypeScript printer. */
function strip(src: string, tsx = true): string {
  const sf = ts.createSourceFile('x.tsx', src, ts.ScriptTarget.Latest, true, tsx ? ts.ScriptKind.TSX : ts.ScriptKind.TS)
  return ts.createPrinter({ removeComments: true }).printFile(sf)
}

/** Every JSX element named `tag` in a source, as { attribute name: its text } (a spread counts as '...'). */
function jsx(src: string, tag: string): Record<string, string>[] {
  const sf = ts.createSourceFile('x.tsx', src, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX)
  const out: Record<string, string>[] = []
  const visit = (n: ts.Node) => {
    if ((ts.isJsxSelfClosingElement(n) || ts.isJsxOpeningElement(n)) && n.tagName.getText(sf) === tag) {
      const attrs: Record<string, string> = {}
      for (const a of n.attributes.properties) {
        if (ts.isJsxAttribute(a)) attrs[a.name.getText(sf)] = a.initializer ? a.initializer.getText(sf) : 'true'
        else attrs['...'] = a.getText(sf)
      }
      out.push(attrs)
    }
    ts.forEachChild(n, visit)
  }
  visit(sf)
  return out
}
const named = (e: Record<string, string>) => 'aria-label' in e || 'aria-labelledby' in e || 'id' in e

/** A source guard and its mutation control: `guard` holds on the real source and fails once `mutate` breaks it. */
function guard(name: string, rel: string, holds: (src: string) => boolean, mutate: (raw: string) => string) {
  const raw = readFileSync(join(ROOT, rel), 'utf8')
  const src = strip(raw, rel.endsWith('.tsx'))
  check(name, holds(src))
  const broken = mutate(raw)
  check(`  MUT: ${name.split(':')[0]} fails on a broken source`, broken !== raw && !holds(strip(broken, rel.endsWith('.tsx'))),
    broken === raw ? 'the mutation did not apply' : 'the guard still holds')
}

const LRI = '⁦'
const PDI = '⁩'
const plain = (s: string) => s.replace(/[⁦⁩‎‏]/g, '')

console.log('P2-1 one date formatter')
{
  const d = new Date(2026, 8, 27, 17, 9)
  const now = new Date(2026, 8, 30, 12, 0)
  check('he full: 27.09.2026, isolated left-to-right', formatDate(d, 'he') === `${LRI}27.09.2026${PDI}`, JSON.stringify(formatDate(d, 'he')))
  check('en full: Sep 27, 2026', formatDate(d, 'en') === 'Sep 27, 2026', formatDate(d, 'en'))
  check('he date and time: the date, then the time, each isolated', formatDate(d, 'he', 'dateTime') === `${LRI}27.09.2026${PDI} · ${LRI}17:09${PDI}`, JSON.stringify(formatDate(d, 'he', 'dateTime')))
  check('en date and time: 24-hour time after the date', formatDate(d, 'en', 'dateTime') === 'Sep 27, 2026 · 17:09', formatDate(d, 'en', 'dateTime'))
  check('he relative: לפני 3 ימים', plain(formatDate(new Date(2026, 8, 27, 12, 0), 'he', 'relative', now)) === 'לפני 3 ימים', formatDate(new Date(2026, 8, 27, 12, 0), 'he', 'relative', now))
  check('en relative: 3 days ago', formatDate(new Date(2026, 8, 27, 12, 0), 'en', 'relative', now) === '3 days ago')
  check('a missing or unreadable value is a dash, never "Invalid Date"',
    formatDate(null, 'he') === EMPTY_DATE && formatDate('not a date', 'en') === EMPTY_DATE && formatDate(undefined, 'en', 'relative') === EMPTY_DATE)
  check('no comma between date and time in Hebrew (the old "17:09 ,27.09.2026")', !formatDate(d, 'he', 'dateTime').includes(','))

  const TOUCHED = [
    'components/keywords/TrackingTargetsTable.tsx', 'components/keywords/ProjectKeywordsPanel.tsx',
    'components/content/workspace/ArticlesScreen.tsx', 'components/content/ContentHubPlatformCard.tsx',
    'components/projects/ProjectsTable.tsx', 'components/dashboard/ContentWidgets.tsx', 'lib/dashboard/activity.ts',
  ]
  const own = /\.toLocale(Date|Time)String\(|new Intl\.DateTimeFormat\(|new Intl\.RelativeTimeFormat\(/
  for (const f of TOUCHED) {
    guard(`P2-1: ${f} formats dates only through the one formatter`, f, (s) => !own.test(s),
      (raw) => raw.replace(/\n(export default function|export function)/, "\nconst __d = new Date().toLocaleDateString('he-IL')\n$1"))
  }
  guard('P2-1: lib/utils formatDate/formatDateTime delegate to lib/format/date', 'lib/utils.ts',
    (s) => /from ["']@\/lib\/format\/date["']/.test(s) && !/toLocaleDateString|toLocaleString\(/.test(s),
    (raw) => raw.replace(/export function formatDate\(/, "export const __x = () => new Date().toLocaleDateString('he-IL')\nexport function formatDate("))
}

console.log('P1-17 / P2-3 row menus with the same actions and confirmations')
{
  guard('P1-17: keyword rows put their actions in a row menu', 'components/keywords/TrackingTargetsTable.tsx',
    (s) => /<RowMenu\b/.test(s) && !/<Button\b/.test(s) && /DeleteConfirmDialog/.test(s) && /deleteTrackingTargetAction/.test(s),
    (raw) => raw.replace(/<RowMenu\b[^>]*\/>/, '<Button>x</Button>'))
  guard('P1-17: the keyword menu offers edit, (de)activate, history, details and delete', 'components/keywords/TrackingTargetsTable.tsx',
    (s) => ['edit', 'toggle', 'history', 'details', 'delete'].every((k) => new RegExp(`key: ["']${k}["']`).test(s)),
    (raw) => raw.replace(/key: ["']history["']/, "key: 'hist'"))
  guard('P1-17: delete in the keyword menu only opens the confirmation', 'components/keywords/TrackingTargetsTable.tsx',
    (s) => /key: ["']delete["'][\s\S]{0,300}?onSelect: \(\) => setConfirmDeleteId\(/.test(s),
    (raw) => raw.replace(/onSelect: \(\) => setConfirmDeleteId\(/, 'onSelect: () => deleteTrackingTargetAction('))
  guard('P2-3: articles delete through the row menu and a confirmation, never window.confirm', 'components/content/workspace/ArticlesScreen.tsx',
    (s) => /<RowMenu\b/.test(s) && /<DeleteConfirmDialog\b/.test(s) && !/window\.confirm\(t\.confirmDeleteArticle\)/.test(s) && /key: ["']delete["'][^}]*danger: true[^}]*onSelect: \(\) => setDeleting\(/.test(s),
    (raw) => raw.replace(/onSelect: \(\) => setDeleting\(a\)/, 'onSelect: () => { if (window.confirm(t.confirmDeleteArticle)) void deleteArticle(a.id) }'))
  guard('RowMenu: a menu button with a name, a menu, menu items and Escape', 'components/ui/RowMenu.tsx',
    (s) => /aria-haspopup="menu"/.test(s) && /aria-expanded=\{open\}/.test(s) && /aria-label=\{label\}/.test(s) && /role="menu"/.test(s) && /role="menuitem"/.test(s) && /["']Escape["']/.test(s),
    (raw) => raw.split('aria-label={label}').join(''))
}

console.log('P1-4 keyword research table')
{
  const f = 'app/(dashboard)/keyword-research/page.tsx'
  guard('P1-4: every checkbox in the research table has a name', f,
    (s) => { const boxes = [...jsx(s, 'input').filter((e) => e.type === '"checkbox"'), ...jsx(s, 'Checkbox').filter((e) => !('label' in e))]; return boxes.length >= 2 && boxes.every(named) },
    (raw) => raw.replace('aria-label={t.results.selectAllRows}', ''))
  guard('P1-4: competition is a word in the screen\'s language, the index only in its title', f,
    (s) => /competitionCell\(/.test(s) && !/\{\s*r(esult)?\.competition\s*\}/.test(s) && !/\(\{r(esult)?\.competitionIndex\}\)/.test(s),
    (raw) => raw.replace(/\{competition\.label\}/, '{result.competition}'))
  guard('P1-4: CPC in the currency format the hero uses (formatMoney, the screen\'s locale)', f,
    (s) => (s.match(/formatMoney\(/g) ?? []).length >= 3 && !/toFixed\(2\)/.test(s),
    (raw) => raw.replace(/formatMoney\(result\.lowTopOfPageBid, result\.currency, language\)/, 'result.lowTopOfPageBid.toFixed(2)'))
  for (const [lang, d] of [['he', he], ['en', en]] as const) {
    const lv = d.keywordResearch.results.competitionLevel
    check(`P1-4 (${lang}): the three levels are words, not LOW/MEDIUM/HIGH`,
      [lv.LOW, lv.MEDIUM, lv.HIGH].every((w) => !/^(LOW|MEDIUM|HIGH)$/.test(w)) && (lang !== 'he' || [lv.LOW, lv.MEDIUM, lv.HIGH].every((w) => /[֐-׿]/.test(w))))
  }
}

console.log('P1-6 / P1-16 dashboard')
{
  guard('P1-6: a competitor\'s domain sits on its own line under the name', 'components/dashboard/CompetitorsWidget.tsx',
    (s) => /flex min-w-0 flex-col/.test(s) && /data-competitor-domain/.test(s) && !/ms-2 text-caption font-normal text-muted/.test(s),
    (raw) => raw.replace('flex min-w-0 flex-col', 'min-w-0 truncate'))
  guard('P1-16: the hero says "4 of 7" once, with no ring beside it', 'components/dashboard/HeroCard.tsx',
    (s) => !/FirstPageRing|<circle\b|strokeDasharray/.test(s),
    (raw) => raw.replace(/<\/section>/, '<svg><circle r="1" /></svg></section>'))
  const page = 'app/(dashboard)/dashboard/page.tsx'
  guard('P1-16: on a phone, five cards and the rest behind one button', page,
    (s) => /data-dashboard-fold/.test(s) && /aria-expanded=\{allCards\}/.test(s) && (s.match(/\$\{fold\}/g) ?? []).length >= 7,
    (raw) => raw.replace(/order-12 min-w-0 \$\{fold\}/, 'order-12 min-w-0'))
  guard('P1-16: the hero\'s next step is never "connect the site" (the checklist asks that)', page,
    (s) => !/connectSite/.test(s),
    (raw) => raw.replace(/const next\b/, 'const __c = t.hero.connectSite\n  const next'))
  for (const [lang, d] of [['he', he], ['en', en]] as const) {
    check(`P1-16 (${lang}): the fold's two labels exist`, !!d.dashboardHome.moreCards && !!d.dashboardHome.fewerCards)
  }
}

console.log('P1-18 content: one line for the setup, no project column')
{
  guard('P1-18: the content setup is one compact line, not two cards', 'components/content/ContentHubSetup.tsx',
    (s) => /data-content-setup-row/.test(s) && /min-h-10/.test(s) && !/<Card\b/.test(s),
    (raw) => raw.replace(/<div\s+role="note"/, '<Card role="note"'))
  guard('P1-18: the articles table has no "project" column (it is always the current project)', 'components/content/workspace/ArticlesScreen.tsx',
    (s) => !/t\.table\.project\b/.test(s) && !/selectedProject/.test(s),
    // The status header carries a priority-column class since the phone layout.
    (raw) => raw.replace(/<Th( className="[^"]*")?>\{t\.table\.status\}<\/Th>/, '<Th>{t.table.project}</Th><Th$1>{t.table.status}</Th>'))
}

console.log('P1-19 settings: the right section marked, one save')
{
  const tops = (xs: number[]) => xs.map((top, i) => ({ id: `s${i}`, top }))
  check('the index marks the section whose top passed the line, not the taller one above it',
    activeSection(tops([-1400, -300, READING_LINE - 10, 900]), false) === 's2', String(activeSection(tops([-1400, -300, READING_LINE - 10, 900]), false)))
  check('before the first section passes the line, the first is marked', activeSection(tops([200, 900, 1600]), false) === 's0')
  check('at the end of the page the last section is marked, even when short', activeSection(tops([-2000, -900, 300, 700]), true) === 's3')
  check('no sections: nothing marked', activeSection([], false) === null)
  guard('P1-19: the index follows the reading line, not "the first section in the upper half"', 'components/settings/SettingsIndex.tsx',
    (s) => /activeSection\(tops, atEnd\)/.test(s) && !/IntersectionObserver/.test(s),
    (raw) => raw.replace('setActive(activeSection(tops, atEnd))', "setActive(tops[0]?.id ?? null); new IntersectionObserver(() => {})"))
  check('the save bar shows only while there is something to save or to say',
    !showSaveBar(false, { kind: 'idle' }) && showSaveBar(true, { kind: 'idle' }) && showSaveBar(false, { kind: 'saved' }) && showSaveBar(false, { kind: 'saving' }))
  for (const f of ['components/settings/ProfileCard.tsx', 'components/settings/AudienceCard.tsx']) {
    guard(`P1-19: ${f} gives the card a footer only through showSaveBar`, f,
      (s) => /footer=\{showSaveBar\(dirty, state\)/.test(s),
      (raw) => raw.replace(/footer=\{showSaveBar\(dirty, state\) \? \(/, 'footer={true ? ('))
  }
  guard('P1-19: the save button is not drawn while there is nothing to save', 'components/settings/SaveBar.tsx',
    (s) => /\{\(dirty \|\| saving\) && \(\s*<Button/.test(s),
    (raw) => raw.replace('{(dirty || saving) && (', '{true && ('))
}

console.log('P2-2 / P2-6 wording')
{
  guard('P2-2: the projects table names the cadence in the screen\'s language, never through the Hebrew-only helper', 'components/projects/ProjectsTable.tsx',
    (s) => /freq === ["']monthly["'] \? f\.monthly : f\.manual/.test(s) && !/getFrequencyLabel/.test(s),
    (raw) => raw.replace("return freq === 'monthly' ? f.monthly : f.manual", "return freq === 'monthly' ? f.monthly : getFrequencyLabel(freq)"))
  guard('P2-6: the scan facts say the market in words, not hl=/gl=', 'components/keywords/ProjectKeywordsPanel.tsx',
    (s) => !/\b[hg]l=/.test(s) && /Intl\.DisplayNames/.test(s),
    (raw) => raw.replace("displayName(lang, 'language', project.language)", '`hl=${project.language}`'))
}

console.log('axe: names for selects and checkboxes; tokens, not raw palette colours')
{
  guard('articles: the status filter and the search have names', 'components/content/workspace/ArticlesScreen.tsx',
    (s) => { const sel = jsx(s, 'select'); return sel.length > 0 && sel.every(named) && /aria-label=\{t\.table\.selectArticle\(/.test(s) },
    (raw) => raw.replace('aria-label={t.filters.status}', ''))
  guard('AI visibility: the three result filters have names', 'components/ai-visibility/AIVisibilitySection.tsx',
    (s) => ['filter_engine', 'filter_mention', 'filter_citation'].every((k) => new RegExp(`aria-label=\\{t\\(["']${k}["']\\)\\}`).test(s)),
    (raw) => raw.replace("aria-label={t('filter_cited')}", '').replace("aria-label={t('filter_citation')}", ''))
  guard('AI visibility: no slate-400 text (2.6:1 on white)', 'components/ai-visibility/AIVisibilitySection.tsx',
    (s) => !/text-slate-400/.test(s),
    (raw) => raw.replace('className="cursor-help text-action', 'className="cursor-help text-slate-400'))
  const RAW = /\b(?:text|bg|border|ring|divide|from|to|via|accent|fill|stroke)-(?:slate|gray|zinc|neutral|blue|indigo|purple|green|red|amber|yellow)-\d{2,3}\b/
  for (const f of [
    'components/keywords/TrackingTargetsTable.tsx', 'components/content/workspace/ArticlesScreen.tsx',
    'components/content/workspace/ContentWorkspaceShell.tsx', 'components/content/ContentHubSetup.tsx',
    'components/content/ContentHubPlatformCard.tsx', 'components/ui/RowMenu.tsx', 'components/dashboard/CompetitorsWidget.tsx',
  ]) {
    guard(`tokens: ${f} uses no raw palette colour`, f, (s) => !RAW.test(s),
      (raw) => raw.replace(/className="/, 'className="text-slate-400 '))
  }
  guard('tokens: the keyword research results table uses no raw palette colour', 'app/(dashboard)/keyword-research/page.tsx',
    (s) => { const i = s.search(/id=\{[^}]*["']research-table["']/); const j = s.indexOf('</table>', i); return i > 0 && j > i && !RAW.test(s.slice(i, j)) },
    (raw) => raw.replace('aria-label={t.results.selectAllRows}', 'aria-label={t.results.selectAllRows} className="text-yellow-600"'))
}

console.log(`\n${passed} passed, ${failed} failed`)
if (failed > 0) process.exitCode = 1
export {}
