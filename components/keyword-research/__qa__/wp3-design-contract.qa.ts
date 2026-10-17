/**
 * WP3 of the premium design pass: keyword research, keywords, check details and
 * the dashboard's Search Console cards hold the design contract
 * (scratchpad design-audit report, §1–§12), and the research screen never shows
 * a provider's own error text.
 *
 *  W1) no raw Tailwind palette colour and no hex colour in any WP3 file;
 *  W2) no off-scale type, shadow or radius (text-xs…3xl, text-[Npx], shadow-sm…2xl,
 *      rounded-md…3xl, arbitrary radii), no transition-all, no hover:scale;
 *  W3) no glyph icons (✓ ✗ ✕ ↕ ▸ ◂ ▾ ▶ → ← • ▲ ▼) in markup; the one exception is
 *      the Search Console performance tile's delta, drawn like ui/StatTile's;
 *  W4) no native select, checkbox or radio (the ui primitives instead);
 *  W5) the research page maps every failure to the dictionary: no route error or
 *      message text reaches the screen, no alert(), no Hebrew literal in its code;
 *  W6) the trend modal names months through Intl in the screen's language, draws
 *      its line in the action token, and keeps no word list of its own;
 *  W7) the AI questions modal says its count in words from the dictionary
 *      ("3 of 4 selected"), never "selected 4 / 0", with the shared checkbox;
 *  W8) the back labels this package owns carry no arrow glyph (BackLink draws it);
 *  W9) the dashboard's ranking moves use ui PositionChange, not their own ▲▼.
 *
 * Every check has a mutation control: a deliberately broken copy must fail it.
 * Run: npx tsx components/keyword-research/__qa__/wp3-design-contract.qa.ts
 */
/* eslint-disable @typescript-eslint/no-require-imports */
const { readFileSync, readdirSync, statSync } = require('fs') as typeof import('fs')
const { join, relative } = require('path') as typeof import('path')
const { getDashboardDictionary } = require('../../../lib/i18n/dashboard/getDashboardDictionary') as typeof import('../../../lib/i18n/dashboard/getDashboardDictionary')

let pass = 0, fail = 0
function check(name: string, cond: boolean, detail?: string) {
  if (cond) { pass++; console.log(`  ✓ ${name}`) } else { fail++; console.log(`  ✗ ${name}${detail ? ` — ${detail}` : ''}`) }
}

const ROOT = join(__dirname, '..', '..', '..')
const read = (p: string) => readFileSync(join(ROOT, p), 'utf8')
/** Source without comments (block, JSX and line comments; a URL's "//" is kept). */
const strip = (src: string) => src.replace(/\{\/\*[\s\S]*?\*\/\}/g, '').replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:'"`\\])\/\/.*$/gm, '$1')

function walk(dir: string): string[] {
  const out: string[] = []
  for (const name of readdirSync(join(ROOT, dir))) {
    const rel = join(dir, name)
    if (name === '__qa__') continue
    if (statSync(join(ROOT, rel)).isDirectory()) out.push(...walk(rel))
    else if (rel.endsWith('.tsx')) out.push(relative(ROOT, join(ROOT, rel)))
  }
  return out
}

const OWNED = [
  ...walk('app/(dashboard)/keyword-research'), ...walk('components/keyword-research'), 'components/content/GscOpportunities.tsx',
  ...walk('components/keywords'), ...walk('app/(dashboard)/keywords'), ...walk('app/(dashboard)/scans'), ...walk('components/scans'),
  ...walk('components/gsc'), ...walk('components/dashboard').filter((f) => !f.endsWith('AiVisibilityBrief.tsx')),
]
const files: [string, string][] = OWNED.map((f) => [f, strip(read(f))])
const edit = (fs: [string, string][], suffix: string, fn: (s: string) => string): [string, string][] =>
  fs.map(([f, s]) => [f, f.endsWith(suffix) ? fn(s) : s])

console.log(`WP3 design contract (${OWNED.length} files)\n`)

// W1
const PALETTE = 'slate|gray|zinc|neutral|stone|red|orange|amber|yellow|lime|green|emerald|teal|cyan|sky|blue|indigo|violet|purple|fuchsia|pink|rose'
const RAW = new RegExp(`(?<![\\w-])(?:[\\w-]+:)*(?:bg|text|border(?:-[trblxyse])?|divide|ring|outline|accent|placeholder|from|via|to|fill|stroke|decoration|shadow|caret)-(?:${PALETTE})-\\d{2,3}\\b|\\[#[0-9a-fA-F]{3,8}\\]|(?:stopColor|stroke|fill)="#[0-9a-fA-F]{3,8}"|rgb\\(\\d`)
const rawIn = (fs: [string, string][]) => fs.filter(([, s]) => RAW.test(s)).map(([f, s]) => `${f}: ${RAW.exec(s)?.[0]}`)
check('W1: no raw palette or hex colour in any WP3 file', rawIn(files).length === 0, rawIn(files).join(', '))
check('W1-MUT: a slate heading in the trend modal fails W1', rawIn(edit(files, 'TrendModal.tsx', (s) => `${s}<h2 className="text-slate-900" />`)).length > 0)
check('W1-MUT2: a hex stroke on the history chart fails W1', rawIn(edit(files, 'PositionHistoryChart.tsx', (s) => `${s}<Line stroke="#3b82f6" />`)).length > 0)

// W2
const OFF = /(?<![\w-])(?:[\w-]+:)*(?:text-(?:xs|sm|base|lg|xl|[2-9]xl)\b|text-\[\d[\d.]*(?:px|rem)\]|shadow-(?:sm|md|lg|xl|2xl)\b|rounded-(?:md|lg|xl|[23]xl)\b|rounded-\[\d|transition-all\b|hover:scale-)/
const offIn = (fs: [string, string][]) => fs.filter(([, s]) => OFF.test(s)).map(([f, s]) => `${f}: ${OFF.exec(s)?.[0]}`)
check('W2: type, shadow and radius on the scale only; no transition-all or hover:scale', offIn(files).length === 0, offIn(files).join(', '))
check('W2-MUT: text-sm back in the research page fails W2', offIn(edit(files, 'keyword-research/page.tsx', (s) => `${s}<p className="text-sm" />`)).length > 0)
check('W2-MUT2: a rounded-xl card in the dashboard fails W2', offIn(edit(files, 'HoldingBack.tsx', (s) => `${s}<div className="rounded-xl" />`)).length > 0)

// W3
const GLYPH = /[✓✗✕↕▸◂▾▶→←•▲▼]/
const GLYPH_OK = ['components/gsc/GscPerformance.tsx']
const glyphsIn = (fs: [string, string][]) => fs.filter(([f, s]) => !GLYPH_OK.includes(f) && GLYPH.test(s)).map(([f, s]) => `${f}: ${GLYPH.exec(s)?.[0]}`)
check('W3: no glyph icons in markup (lucide instead)', glyphsIn(files).length === 0, glyphsIn(files).join(', '))
check('W3-MUT: the old "↕" sort indicator fails W3', glyphsIn(edit(files, 'keyword-research/page.tsx', (s) => `${s}\nreturn ' ↕'`)).length > 0)
check('W3-MUT2: "▲" back in the ranking moves fails W3', glyphsIn(edit(files, 'RankingChanges.tsx', (s) => `${s}\n{'▲'}`)).length > 0)

// W4
const NATIVE = /<select\b|type="checkbox"|type="radio"/
const nativeIn = (fs: [string, string][]) => fs.filter(([, s]) => NATIVE.test(s)).map(([f, s]) => `${f}: ${NATIVE.exec(s)?.[0]}`)
check('W4: no native select, checkbox or radio in any WP3 file', nativeIn(files).length === 0, nativeIn(files).join(', '))
check('W4-MUT: a native checkbox in the AI questions modal fails W4', nativeIn(edit(files, 'AIQuestionsModal.tsx', (s) => `${s}<input type="checkbox" />`)).length > 0)

// W5
const page = strip(read('app/(dashboard)/keyword-research/page.tsx'))
const providerText = (s: string) => {
  const out: string[] = []
  if (/data\.error(?![A-Za-z])(?!\s*(?:===|!==|,))/.test(s)) out.push('the ideas/trend route error')
  if (/result\??\.message\s*\|\||errorData\.message|result\??\.message\)/.test(s)) out.push('a route message')
  if (/\balert\(/.test(s)) out.push('alert()')
  if (/[֐-׿]/.test(s)) out.push('a Hebrew literal')
  return out
}
check('W5: the research page says every failure in the dictionary\'s words (no route text, no alert, no Hebrew literal)', providerText(page).length === 0, providerText(page).join(', '))
check('W5-MUT: showing the route\'s validation error again fails W5', providerText(page.replace(': t.messages.invalidRequest)', ': data.error)')).length > 0 && page.includes(': t.messages.invalidRequest)'))
check('W5-MUT2: the AI route\'s message back on screen fails W5', providerText(`${page}\nsetAIQuestionsError(errorData.message || t.messages.aiFailed)`).length > 0)
check('W5-MUT3: a Hebrew fallback in the code fails W5', providerText(`${page}\nconst x = 'שגיאה'`).length > 0)

// W6
const trend = strip(read('components/keyword-research/TrendModal.tsx'))
const trendOk = (s: string) => /new Intl\.DateTimeFormat\(locale, withYear \? \{ month: 'long'/.test(s) && /stroke="var\(--color-action\)"/.test(s)
  && !/const translations\b|JANUARY: '/.test(s) && /getDashboardDictionary\(language\)\.keywordResearch\.trend|dict\.keywordResearch\.trend/.test(s)
check('W6: the trend modal: Intl month names, the action-token line, the dictionary\'s words only', trendOk(trend))
check('W6-MUT: a hard-coded month table fails W6', !trendOk(`${trend}\nconst m = { JANUARY: 'ינואר' }`))
check('W6-MUT2: a blue hex line fails W6', !trendOk(trend.replace('stroke="var(--color-action)"', 'stroke="#3b82f6"')))

// W7
const aiq = strip(read('components/keyword-research/AIQuestionsModal.tsx'))
const aiqOk = (s: string) => /t\.selectedCount\(/.test(s) && !/\bselected<\/|\} selected\b|\/ \{questions\.length\}/.test(s) && /<Checkbox\b/.test(s)
check('W7: the AI questions modal counts in words from the dictionary, with the shared checkbox', aiqOk(aiq))
check('W7-MUT: the old "{n} / {total} selected" fails W7', !aiqOk(aiq.replace(/\{t\.selectedCount\([^\n]*\)\}/, '{selectedQuestions.size} / {questions.length} selected')))
for (const loc of ['he', 'en'] as const) {
  const count = getDashboardDictionary(loc).keywordResearch.aiQuestions.selectedCount('3', '4')
  check(`W7 (${loc}): "${count}" reads as a sentence with both numbers in order`, count.indexOf('3') < count.indexOf('4') && !/\//.test(count))
}

// W8
const arrowFree = (loc: 'he' | 'en') => {
  const d = getDashboardDictionary(loc)
  return [d.keywordsPage.history.backToKeywords, d.scans.details.backToHistory, d.scans.details.backToKeywords].every((l) => !/[←→]/.test(l))
}
check('W8: the back labels this package owns carry no arrow (he, en)', arrowFree('he') && arrowFree('en'))
check('W8-MUT: a label with "←" fails W8', /[←→]/.test(`← ${getDashboardDictionary('he').scans.details.backToHistory}`))
const backLinked = (s: string) => /<BackLink href=\{backHref\}>\{t\.backToKeywords\}<\/BackLink>/.test(s)
const history = strip(read('app/(dashboard)/keywords/[id]/history/page.tsx'))
check('W8b: the keyword history page goes back through ui/BackLink', backLinked(history))
check('W8b-MUT: an outline button instead fails W8b', !backLinked(history.replace('<BackLink href={backHref}>{t.backToKeywords}</BackLink>', '<Button variant="outline">{t.backToKeywords}</Button>')))

// W9
const moves = strip(read('components/dashboard/RankingChanges.tsx'))
const usesPositionChange = (s: string) => /<PositionChange change=\{m\.change\} \/>/.test(s) && !/[▲▼]/.test(s)
check('W9: the dashboard ranking moves use ui PositionChange', usesPositionChange(moves))
check('W9-MUT: its own ▲ fails W9', !usesPositionChange(moves.replace('<PositionChange change={m.change} />', "{'▲'} {m.change}")))

console.log(`\n${pass} passed, ${fail} failed`)
if (fail > 0) process.exit(1)

export {}
