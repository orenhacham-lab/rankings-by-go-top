/**
 * The data screens after the final premium review (scratchpad final-shots/review.md,
 * section 4): the dashboard, keywords, keyword history, keyword research, reports and
 * the seed summary. One guard per item, each with a MUTATION CONTROL (the same check
 * on a deliberately broken copy fails).
 *
 *   G3  no curved start rail on the report cards, the seed summary, the rivals, the
 *       research opportunities panel; never a rail on a pill.
 *   R1  /reports: its own buttons are secondary (the page's one primary is the monthly
 *       report's), and "connect Search Console" is a secondary button everywhere.
 *   R5  /reports says an export problem in an inline Notice, never alert().
 *   R6  the Search Console panel asks through useConfirm (danger), never window.confirm.
 *   R15 the reports rankings, keyword research and keyword history tables drop their
 *       secondary columns below sm instead of scrolling sideways at 390.
 *   R18 research rows: competition is a Badge, the rivals' copy agrees with itself, the
 *       intent panel waits for data.
 *   R19 keywords table: seven columns (no found/status), URLs without protocol and www.
 *   R20 history: four tiles, plain figures; chart ticks thin out at 390, dot on the last.
 *   R25 an empty report disables both downloads and says why.
 *   R26 seed summary: one action hue; tones on icons and badges only.
 *   R34 skeletons are the ui Skeleton, never a raw animate-pulse.
 *   R36 the dashboard's clicks tile has a one-line source.
 *
 * Run: npx tsx lib/__qa__/w6-data-surfaces.qa.ts
 */
import { readFileSync } from 'fs'
import { join } from 'path'
import { displayUrl } from '../format/display-url'
import { getDashboardDictionary } from '../i18n/dashboard/getDashboardDictionary'

let pass = 0, fail = 0
function check(name: string, cond: boolean, detail?: string) {
  if (cond) { pass++; console.log(`  ✓ ${name}`) } else { fail++; console.log(`  ✗ ${name}${detail ? ` — ${detail}` : ''}`) }
}
const ROOT = join(__dirname, '..', '..')
/** The source without comments, so a guard never matches (or misses) prose. */
const code = (f: string) => readFileSync(join(ROOT, f), 'utf8').replace(/\/\*[\s\S]*?\*\//g, '').replace(/\{\s*\/\*[\s\S]*?\*\/\s*\}/g, '').replace(/(^|[^:'"`])\/\/.*$/gm, '$1')

const F = {
  reports: 'app/(dashboard)/reports/page.tsx',
  monthly: 'components/reports/monthly/MonthlyReports.tsx',
  summary: 'components/onboarding/ResearchSummary.tsx',
  parts: 'components/onboarding/parts.tsx',
  rivals: 'components/keyword-research/LandscapeRivals.tsx',
  audiences: 'components/keyword-research/LandscapeAudiences.tsx',
  research: 'app/(dashboard)/keyword-research/page.tsx',
  easyWins: 'components/keyword-research/EasyWins.tsx',
  source: 'components/keyword-research/KeywordSourceLine.tsx',
  scanCards: 'components/keyword-research/ScanCards.tsx',
  keywords: 'components/keywords/TrackingTargetsTable.tsx',
  history: 'app/(dashboard)/keywords/[id]/history/page.tsx',
  chart: 'components/keywords/PositionHistoryChart.tsx',
  dashboard: 'app/(dashboard)/dashboard/page.tsx',
  clicks: 'components/gsc/GscClicksTile.tsx',
  gscPrompt: 'components/gsc/GscSetupPrompt.tsx',
  gscPanel: 'components/content/GscPanel.tsx',
} as const
const src = Object.fromEntries(Object.entries(F).map(([k, f]) => [k, code(f)])) as Record<keyof typeof F, string>

console.log('\nG3) no curved start rails')
{
  const RAIL = /\bborder-s-(?:\[\d+px\]|[2-8](?![\w-]))/
  const railed = (files: [string, string][]) => files.filter(([, s]) => RAIL.test(s)).map(([f]) => f)
  const files: [string, string][] = (['reports', 'monthly', 'summary', 'parts', 'rivals', 'research'] as const).map((k) => [F[k], src[k]])
  check('G3: the report cards, seed summary, rivals and research panels carry no start rail', railed(files).length === 0, railed(files).join(', '))
  check('G3-MUT: the old standing pill rail back in the rivals fails G3',
    railed([[F.rivals, src.rivals.replace('data-rival-standing=', "className=\"rounded-inset border-s-[3px] border-s-bad\" data-rival-standing=")]]).length === 1)
  const standingPlain = (s: string) => /data-rival-standing=\{[^}]+\} className="mt-3 flex items-start gap-1\.5 text-caption font-semibold text-ink"/.test(s)
    && /<TriangleAlert[^>]*text-bad/.test(s) && /<CheckCircle2[^>]*text-ok/.test(s)
  check('G3b: a rival\'s standing is a plain line whose tone is its icon', standingPlain(src.rivals))
  check('G3b-MUT: the tinted pill back fails G3b', !standingPlain(src.rivals.replace('className="mt-3 flex items-start gap-1.5 text-caption font-semibold text-ink"', 'className="mt-3 rounded-inset bg-sunk/60 px-2.5 py-1.5"')))
}

console.log('\nR1) one primary on /reports')
{
  // A ui Button with no variant is the primary; the report head's two are secondary.
  const primaries = (s: string) => (s.match(/<Button\b(?![^>]*variant=)[^>]*>/g) ?? []).length
  check('R1: the on-demand report has no primary of its own (the monthly report holds the page\'s one)', primaries(src.reports) === 0, String(primaries(src.reports)))
  check('R1-MUT: the download back as a primary fails R1', primaries(src.reports.replace('<Button variant="secondary" onClick={onExportPDF}', '<Button onClick={onExportPDF}')) === 1)
  const secondaryConnect = (s: string) => /GSC_ACTION_LINK_CLASS = buttonClasses\(\{ variant: 'secondary', size: 'sm'/.test(s) && !/bg-action text-action-ink/.test(s)
  check('R1b: "connect Search Console" is a secondary small button on every screen', secondaryConnect(src.gscPrompt))
  check('R1b-MUT: the old filled link fails R1b', !secondaryConnect(src.gscPrompt.replace("variant: 'secondary'", "variant: 'primary'")))
}

console.log('\nR5 / R25) reports: inline notices, honest downloads')
{
  const inline = (s: string) => !/\balert\(/.test(s) && /<Notice tone="info" onDismiss=\{\(\) => setExportNotice\(null\)\}/.test(s)
    && /setExportNotice\(t\.loadGoogleReportFirst\)/.test(s) && /setExportNotice\(t\.ai\.noResultsInReport\)/.test(s)
  check('R5: an export problem is an inline Notice in the dictionary\'s words, never alert()', inline(src.reports))
  check('R5-MUT: alert() back fails R5', !inline(src.reports.replace('setExportNotice(t.loadGoogleReportFirst)', 'alert(t.loadGoogleReportFirst)')))
  const honest = (s: string) => (s.match(/disabled=\{empty\}/g) ?? []).length === 2 && /\{empty && <p id="report-download-reason"[^>]*>\{t\.nothingToDownload\}<\/p>\}/.test(s)
    && /empty=\{total === 0\}/.test(s) && /empty=\{reportData\.summary\.totalResults === 0\}/.test(s)
  check('R25: with nothing in the report both downloads are disabled, with the reason under them', honest(src.reports))
  check('R25-MUT: an Excel button that stays active fails R25', !honest(src.reports.replace('loading={exporting === \'excel\'} disabled={empty}', 'loading={exporting === \'excel\'}')))
  const plainFirst = (s: string) => /data-monthly-first="" className="[^"]*\bbg-surface\b[^"]*shadow-card/.test(s) && !/data-monthly-first="" className="[^"]*bg-sunk/.test(s)
  check('R25b: "what goes into each report" is a plain surface card, not a sunk one', plainFirst(src.monthly))
  check('R25b-MUT: the sunk card back fails R25b', !plainFirst(src.monthly.replace('data-monthly-first="" className="grid gap-4 rounded-card border border-line bg-surface', 'data-monthly-first="" className="grid gap-4 rounded-card border border-line bg-sunk')))
  for (const loc of ['he', 'en'] as const) {
    const r = getDashboardDictionary(loc).reports
    check(`R25 (${loc}): the reason is copy of its own`, typeof r.nothingToDownload === 'string' && r.nothingToDownload.length > 10 && (r.nothingToDownload as string) !== r.downloadReport)
  }
}

console.log('\nR6) the Search Console panel asks in-app')
{
  const asks = (s: string) => !/window\.confirm/.test(s) && /const \{ confirm, dialog: confirmDialog \} = useConfirm\(\)/.test(s)
    && (s.match(/await confirm\(\{[^}]*tone: 'danger' \}\)/g) ?? []).length === 2 && /\{confirmDialog\}/.test(s)
  check('R6: both disconnects ask through useConfirm with the danger tone', asks(src.gscPanel))
  check('R6-MUT: window.confirm back fails R6', !asks(src.gscPanel.replace(/if \(!\(await confirm\(\{ title: t\.unassignConfirmTitle[^\n]*/, 'if (!window.confirm(t.unassignConfirmTitle)) return')))
}

console.log('\nR15) phone tables keep what matters in view')
{
  const researchPhone = (s: string) => /\['competition', t\.results\.competition, 'hidden sm:table-cell'\]/.test(s)
    && /\['lowCpc', t\.results\.lowCpc, 'hidden lg:table-cell'\]/.test(s) && /\['highCpc', t\.results\.highCpc, 'hidden sm:table-cell'\]/.test(s)
    && /\['opportunity', t\.results\.opportunity, 'hidden md:table-cell'\]/.test(s)
    && /<td className="hidden whitespace-nowrap px-4 py-3 text-start sm:table-cell">\s*<CompetitionBadge/.test(s)
    && /<span data-phone-meta="" className="mt-1 flex sm:hidden"><CompetitionBadge c=\{competition\} \/><\/span>/.test(s)
  check('R15a: the research table drops potential, competition and click prices below sm (competition rides under the keyword)', researchPhone(src.research))
  check('R15a-MUT: the competition column kept on a phone fails R15a', !researchPhone(src.research.replace("['competition', t.results.competition, 'hidden sm:table-cell']", "['competition', t.results.competition, '']")))
  // Measured at 390: a nowrap header or keyword line pushed the row's actions off screen.
  const wraps = (s: string, line: string) => /block break-words font-medium text-ink sm:truncate" title=\{result\.keyword\}/.test(s)
    && /inline-flex items-center gap-1 rounded-control text-start transition-colors sm:whitespace-nowrap/.test(s)
    && !/gap-1 whitespace-nowrap rounded-control transition-colors/.test(s) && /className="break-words sm:truncate">\{p\.text\}/.test(line)
  check('R15a2: on a phone the keyword, its source line and the headers wrap, so the actions stay in view', wraps(src.research, src.source))
  check('R15a2-MUT: a nowrap sort header on a phone fails R15a2', !wraps(src.research.replace('text-start transition-colors sm:whitespace-nowrap', 'whitespace-nowrap transition-colors'), src.source))
  const hidden = (s: string, tag: 'Th' | 'Td') => [...s.matchAll(new RegExp(`<${tag} className="hidden (sm|md|lg):table-cell"`, 'g'))].map((m) => m[1]).sort().join(',')
  const historyPhone = (s: string) => hidden(s, 'Th') === 'lg,md,sm,sm' && hidden(s, 'Td') === hidden(s, 'Th') && /<span className="sm:hidden"><PositionChange/.test(s)
  check('R15b: the history table keeps date and position on a phone, each hidden header matched by its cell', historyPhone(src.history), `${hidden(src.history, 'Th')} / ${hidden(src.history, 'Td')}`)
  check('R15b-MUT: the page column back on a phone fails R15b', !historyPhone(src.history.replace('<Th className="hidden md:table-cell">{t.resultUrl}</Th>', '<Th>{t.resultUrl}</Th>')))
  const reportsPhone = (s: string) => hidden(s, 'Th') === 'sm,sm' && hidden(s, 'Td') === 'sm,sm' && /<span className="sm:hidden"><PositionChange/.test(s)
  check('R15c: the reports rankings table drops engine and change below sm, the change under the position', reportsPhone(src.reports), `${hidden(src.reports, 'Th')} / ${hidden(src.reports, 'Td')}`)
  check('R15c-MUT: the engine column back on a phone fails R15c', !reportsPhone(src.reports.replace('<Th className="hidden sm:table-cell">{t.google.engine}</Th>', '<Th>{t.google.engine}</Th>')))
}

console.log('\nR18) keyword research rows')
{
  const badges = (s: string) => /function CompetitionBadge/.test(s) && /<Badge variant=\{c\.variant\}>\{c\.label\}<\/Badge>/.test(s)
    && !/COMPETITION_TONE|competition\.tone|c\.tone/.test(s) && /<Badge variant=\{badge\.variant\}>\{badge\.label\}<\/Badge>/.test(s)
  check('R18a: competition and potential are ui Badges, not coloured words or hand-made pills', badges(src.research))
  check('R18a-MUT: the coloured word back fails R18a', !badges(src.research.replace('<Badge variant={c.variant}>{c.label}</Badge>', '<span className={c.tone}>{c.label}</span>')))
  const noResearchMark = (s: string) => !/ScanSearch|RESEARCH_ORIGINS|t\.research\b/.test(s)
  check('R18b: the source line shows no mark for the research itself', noResearchMark(src.source))
  check('R18b-MUT: the ScanSearch mark back fails R18b', !noResearchMark(src.source + '<ScanSearch size={11} />'))
  const honestRivals = (s: string) => /\{c\.validated \? t\.noOverlapSeen : t\.noOverlap\}/.test(s)
  check('R18c: a competitor seen on Google but in no research keyword says so in one line (no "not seen" under "seen")', honestRivals(src.rivals))
  check('R18c-MUT: the old single sentence fails R18c', !honestRivals(src.rivals.replace('{c.validated ? t.noOverlapSeen : t.noOverlap}', '{t.noOverlap}')))
  for (const loc of ['he', 'en'] as const) {
    const r = getDashboardDictionary(loc).researchInsights.rivals
    const contradicts = (txt: string) => loc === 'he' ? /לא הופיע/.test(txt) : /not seen/i.test(txt)
    check(`R18c (${loc}): neither empty sentence denies what the "seen" badge says`, !contradicts(r.noOverlap) && !contradicts(r.noOverlapSeen) && (r.noOverlapSeen as string) !== r.noOverlap)
  }
  const waits = (s: string) => /const showMix = mix\.some\(\(m\) => m\.intent !== 'info' && m\.searches > 0\)/.test(s) && /\{showMix && \(\s*<aside/.test(s) && !/\{mix\.length > 0 && \(\s*<aside/.test(s)
  check('R18d: "what people look for" waits until the research splits by need', waits(src.audiences))
  check('R18d-MUT: the panel shown for any mix fails R18d', !waits(src.audiences.replace('{showMix && (', '{mix.length > 0 && (')))
  const tooltip = (s: string) => /<span className="hidden @3xl:block" title=\{why\} data-easy-win-badge="">/.test(s) && !/@3xl:text-warn/.test(s)
  check('R18e: an easy win\'s sentence is its competition badge\'s tooltip, never an orange line', tooltip(src.easyWins))
  check('R18e-MUT: the orange sentence back fails R18e', !tooltip(src.easyWins + "\nconst x = '@3xl:text-warn'"))
}

console.log('\nR19) the keywords table')
{
  const ths = (s: string) => (s.match(/<Th\b/g) ?? []).length
  const lean = (s: string) => ths(s) === 7 && !/<ActiveBadge\b/.test(s) && !/k\.yesFound|handleSort\('found'\)/.test(s)
    && /\{!target\.is_active && <Badge variant="neutral"/.test(s) && /\{displayUrl\(result\.result_url\)\}/.test(s) && /const COLUMNS = 7/.test(s)
  check('R19: seven columns, a badge only on a paused keyword, the address without protocol or www', lean(src.keywords), String(ths(src.keywords)))
  check('R19-MUT: the status column back fails R19', !lean(src.keywords.replace('<Th>{k.actions}</Th>', '<Th className="hidden md:table-cell">{k.status}</Th>\n<Th>{k.actions}</Th>')))
  const cases: [string, string][] = [
    ['https://www.plumber-tlv.co.il/services/', 'plumber-tlv.co.il/services'],
    ['http://shop.example.com/a?b=1', 'shop.example.com/a?b=1'],
    ['https://www.example.co.il/%D7%A9%D7%9C%D7%95%D7%9D', 'example.co.il/שלום'],
    ['https://example.com/%E0%A4%A', 'example.com/%E0%A4%A'],
    ['', ''],
  ]
  const bad = cases.filter(([i, o]) => displayUrl(i) !== o)
  check('R19b: displayUrl drops the protocol, www and the last slash, and decodes Hebrew', bad.length === 0, JSON.stringify(bad.map(([i]) => [i, displayUrl(i)])))
  check('R19b-MUT: an address with its protocol is not what displayUrl gives', displayUrl('https://www.a.co.il/') !== 'https://www.a.co.il/')
  const journey = readFileSync(join(ROOT, 'lib/__qa__/reviewer-journey/journey.js'), 'utf8')
  check('R19c: the reviewer journey expects the deliberate seven columns', /headerCount === 7\b/.test(journey) && !/headerCount === 9\b/.test(journey))
}

console.log('\nR20) keyword history')
{
  const tiles = (s: string) => /data-history-tiles="" className="[^"]*md:grid-cols-4"/.test(s) && !/md:grid-cols-5/.test(s)
    && (s.match(/<StatTile\b/g) ?? []).length === 4 && !/<span className="text-(ok|bad)">/.test(s) && /data-history-engine=""/.test(s)
  check('R20a: four plain tiles (no orphan, no ok/bad on best/worst), the engine under the title', tiles(src.history))
  check('R20a-MUT: a fifth tile back fails R20a', !tiles(src.history.replace('md:grid-cols-4">', 'md:grid-cols-5">').replace('<StatTile label={t.average}', '<StatTile label="x" value="1" />\n<StatTile label={t.average}')))
  const ticks = (s: string) => /interval="preserveStartEnd" minTickGap=\{narrow \? 56 : 24\}/.test(s) && /const count = narrow \? 3 : 5/.test(s) && /ticks=\{yTicks\} interval=\{0\}/.test(s)
    && !/padding=\{\{ top:/.test(s) && /interval=\{0\} tickFormatter=\{\(v: number\) => `#\$\{v\}`\} tick=\{\{ \.\.\.tick, direction: 'ltr' \}\}/.test(s)
    && /p\.index === last && p\.cx !== undefined/.test(s)
  check('R20b: the chart thins its ticks at 390 (preserveStartEnd), keeps #last off the date row, and dots only the last check', ticks(src.chart))
  check('R20b-MUT: a dot on every point fails R20b', !ticks(src.chart.replace('p.index === last && p.cx !== undefined', 'p.cx !== undefined')))
  check('R20b-MUT2: position ticks inheriting rtl (they ran into the plot) fail R20b', !ticks(src.chart.replace("tick={{ ...tick, direction: 'ltr' }}", 'tick={tick}')))
  // Once ticks are skipped the formatter's index counts the ticks shown, so a date read
  // by index labels the newest point with another check's date (seen at 390).
  const byValue = (s: string) => /tickFormatter=\{\(at: string\) => labelOf\.get\(at\)/.test(s) && !/points\[i\]\?\.label/.test(s)
    && /<XAxis\b(?:(?!\/>)[\s\S])*padding=\{\{ left: 16, right: 16 \}\}/.test(s)
  check('R20c: each date tick is labelled by its own point, and the line keeps clear of the position ticks', byValue(src.chart))
  check('R20c-MUT: labelling ticks by their index fails R20c', !byValue(src.chart.replace('tickFormatter={(at: string) => labelOf.get(at) ?? \'\'}', "tickFormatter={(_, i) => points[i]?.label ?? ''}")))
}

console.log('\nR26) the seed summary')
{
  const oneHue = (s: string) => !/SEVERITY_BAR|SEVERITY_EDGE|TILE_FILL|function Segments|<StatusDot\b/.test(s) && /const HERO_ARC = 'stroke-rail-focus'/.test(s)
    && !/\bbg-(?:ok|warn|bad)\b(?!-)/.test(s) && !/'bg-bad-soft\/70'/.test(s) && /<Badge variant=\{SEVERITY_BADGE\[f\.severity\] \?\? 'neutral'\}>/.test(s)
  check('R26: one action hue (ring, meter); severities and states on badges and icons only', oneHue(src.summary))
  check('R26-MUT: a multicolour segment bar back fails R26', !oneHue(src.summary + "\nconst SEVERITY_BAR = { blocker: 'bg-bad' }"))
  check('R26-MUT2: the tinted failed AI row back fails R26', !oneHue(src.summary.replace("className=\"flex items-start gap-3 rounded-inset p-2.5\"", "className={cn('flex items-start gap-3 rounded-inset p-2.5', !s.ok && 'bg-bad-soft/70')}")))
  const iconTone = (s: string) => /export function StatusIcon/.test(s) && !/export function StatusDot/.test(s) && !/tone === 'attention' && 'border-s/.test(s)
  check('R26b: tiles show an icon in their tone; the attention block keeps its tone on the icon only', iconTone(src.parts))
  check('R26b-MUT: the attention rail back fails R26b', !iconTone(src.parts.replace("'border-line bg-surface shadow-card',", "'border-line bg-surface shadow-card', tone === 'attention' && 'border-s-[3px] border-s-warn',")))
}

console.log('\nR34) skeletons')
{
  const PULSE = /(?<![\w-])animate-pulse\b/
  const raw = (files: [string, string][]) => files.filter(([, s]) => PULSE.test(s)).map(([f]) => f)
  const files: [string, string][] = (['dashboard', 'keywords', 'scanCards'] as const).map((k) => [F[k], src[k]])
  check('R34: the dashboard, the keywords table and the research skeleton use no raw animate-pulse', raw(files).length === 0, raw(files).join(', '))
  check('R34b: …they draw the shared ui Skeleton', files.every(([, s]) => /import \{ Skeleton \} from '@\/components\/ui\/Skeleton'/.test(s) && /<Skeleton\b/.test(s)))
  check('R34-MUT: a raw pulse back in the dashboard fails R34', raw([[F.dashboard, src.dashboard + '<div className="h-24 animate-pulse" />']]).length === 1)
}

console.log('\nR36) the dashboard clicks tile')
{
  const short = (s: string) => /source=\{onlyWithData \? t\.source28Short : t\.source28\}/.test(s)
  check('R36: in the dashboard row the clicks tile uses the short source', short(src.clicks))
  check('R36-MUT: the long source everywhere fails R36', !short(src.clicks.replace('source={onlyWithData ? t.source28Short : t.source28}', 'source={t.source28}')))
  for (const loc of ['he', 'en'] as const) {
    const w = getDashboardDictionary(loc).gscWidgets
    check(`R36 (${loc}): "${w.source28Short}" is short enough for one line beside four tiles`, w.source28Short.length <= 16 && w.source28Short.length < w.source28.length)
  }
}

console.log(`\n${pass} passed, ${fail} failed`)
if (fail > 0) process.exit(1)

export {}
