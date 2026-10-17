/**
 * The AI tab's premium design pass (design package WP2).
 *
 *   A  keyboard: a result row is a real <button> (Tab reaches it, Enter opens
 *      the answer); archive/restore sits in the row's menu, outside the button
 *   B  the result drawer is a dialog: role, aria-modal, a named close button,
 *      Escape closes it
 *   C  the competitors tab says it once: each business's rate "of answers"
 *      (the score's own unit). The "share of all mentions" card re-divided the
 *      same counts, so 43% sat next to 100% for one competitor; it is gone (R21).
 *      The key wording stays pinned for any other reader of those keys.
 *   D  no raw server or provider text reaches the merchant from the tab
 *   E  the contract: tokens only, ui primitives (Select, Checkbox), lucide
 *      icons (no glyph icons), no banned sizes, radii, shadows or motion
 *
 * Every guard has a mutation control.
 *
 * Run: npx tsx components/ai-visibility/__qa__/ai-visibility-design.qa.ts
 */
/* eslint-disable @typescript-eslint/no-require-imports */

let pass = 0, fail = 0
function check(name: string, cond: boolean, detail?: string) {
  if (cond) { pass++; console.log(`  ✓ ${name}`) } else { fail++; console.log(`  ✗ ${name}${detail ? ` — ${detail}` : ''}`) }
}

const { readFileSync, readdirSync, statSync } = require('fs') as typeof import('fs')
const { join } = require('path') as typeof import('path')
const { createElement } = require('react') as typeof import('react')
const { renderToStaticMarkup } = require('react-dom/server') as typeof import('react-dom/server')
const { DashboardLanguageProvider } = require('../../../lib/i18n/dashboard/useDashboardLanguage')
const I = require('../../../lib/ai-visibility/i18n') as typeof import('../../../lib/ai-visibility/i18n')
const { ResultRowCard } = require('../sections/ResultRowCard') as typeof import('../sections/ResultRowCard')

const ROOT = join(__dirname, '..', '..', '..')
const read = (p: string) => readFileSync(join(ROOT, p), 'utf8')
const strip = (s: string) => s.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\{\/\*[\s\S]*?\*\/\}/g, '').replace(/(^|[^:'"`])\/\/[^\n]*/g, '$1')
const code = (p: string) => strip(read(p))
const render = (locale: 'he' | 'en', node: unknown) =>
  renderToStaticMarkup(createElement(DashboardLanguageProvider, { initialLocale: locale, children: node }) as never)

function sourceFiles(dir: string, out: string[] = []): string[] {
  for (const f of readdirSync(join(ROOT, dir))) {
    if (f === 'node_modules' || f.startsWith('.') || f === '__qa__') continue
    const p = `${dir}/${f}`
    if (statSync(join(ROOT, p)).isDirectory()) sourceFiles(p, out)
    else if (/\.tsx$/.test(f)) out.push(p)
  }
  return out
}

const SECTION = 'components/ai-visibility/AIVisibilitySection.tsx'
const ROW = 'components/ai-visibility/sections/ResultRowCard.tsx'
const DRAWER = 'components/ai-visibility/sections/ResultDetailDrawer.tsx'
const WP2 = [
  ...sourceFiles('components/ai-visibility'),
  ...sourceFiles('components/competitors'),
  'components/dashboard/AiVisibilityBrief.tsx',
  'app/(dashboard)/ai-visibility/page.tsx',
]

const row = (over: Record<string, unknown> = {}) => ({
  id: 'r1', runId: 'run1', promptId: 'p1', engine: 'chatgpt', promptText: 'Best plumber in Tel Aviv?',
  mentioned: true, targetCited: false, citationCount: 2, status: 'done', scannedAt: '2026-09-01T10:00:00Z',
  citations: [], responseText: null, excludedFromScore: false,
  displayMentioned: true, displayCited: false, displayBrandLabels: ['Pipe Co'], displayDomainLabel: null,
  mentionedInAnswer: true, citedAsSource: false, domainMentioned: false, brandMentioned: true,
  domainInAnswerLabel: null, domainInSourceLabel: null, geoInsights: null, ...over,
})

function main() {
  console.log('AI tab design pass (WP2)')

  console.log('\nA) a result row is reachable by keyboard')
  {
    const t = I.createI18n('he')
    const props = { highlighted: false, brandVariants: [], targetDomain: null, isHebrew: true, onRowClick: () => {}, onArchiveToggle: () => {}, onRetry: () => {}, t }
    const html = render('he', createElement(ResultRowCard, { ...props, result: row() as never }))
    check('A1: the row renders as <button type="button" data-ai-result-row>', /<button type="button" data-ai-result-row=""/.test(html), html.slice(0, 200))
    check('A2: archive lives in the row menu (a menu button), not a second button inside the row',
      /aria-haspopup="menu"/.test(html) && !/<button[^>]*data-ai-result-row[^>]*>(?:(?!<\/button>)[\s\S])*<button/.test(html))
    check('A3: the row menu is named for what it holds', html.includes(`aria-label="${t('result_more_actions')}"`))
    const src = code(ROW)
    const rule = /<button\s+type="button"\s+data-ai-result-row=""\s+onClick=\{\(\) => onRowClick\(result\)\}/
    check('A4: the source keeps the row a button that opens the answer', rule.test(src))
    check('A5: MUT a clickable <div> row fails A4', !rule.test(src.replace('<button\n        type="button"\n        data-ai-result-row=""', '<div\n        data-ai-result-row=""')))
    check('A6: the row has a visible keyboard focus ring', /data-ai-result-row=""[\s\S]{0,400}focus-visible:ring-4 focus-visible:ring-action\/20/.test(src))
    const failed = render('he', createElement(ResultRowCard, { ...props, result: row({ status: 'error' }) as never }))
    check('A7: a failed check says so in our words, with one way to try again',
      failed.includes(t('scan_failed')) && failed.includes(t('retry_check')) && !/Scan failed|Retry/.test(failed))
  }

  console.log('\nB) the result drawer is a dialog')
  {
    const src = code(DRAWER)
    const rule = (s: string) => /role="dialog"/.test(s) && /aria-modal="true"/.test(s) && /e\.key === 'Escape'/.test(s) && /aria-label=\{t\('close'\)\}/.test(s)
    check('B1: role="dialog", aria-modal, a named close button, and Escape closes it', rule(src))
    check('B2: MUT dropping the Escape handler fails B1', !rule(src.replace("e.key === 'Escape'", "e.key === 'Enter'")))
    check('B3: no glyph marks (✓ ×) in the drawer', !/[✓×]/.test(src))
    const portal = (x: string) => /return createPortal\(\s*<div className="fixed inset-0 z-\[70\]">[\s\S]*document\.body,\s*\)/.test(x)
    check('B5: the drawer is drawn into <body>, so no ancestor cuts it short of full height', portal(src))
    check('B6: MUT rendering it in place fails B5', !portal(src.replace('return createPortal(', 'return (')))
    const tips = code(SECTION).match(/role="tooltip"[\s\S]{0,40}className="[^"]*"/g) ?? []
    check('B7: a closed tooltip takes no room (hidden, not opacity-0), so the questions tab never scrolls sideways on a phone',
      // w7-ai-profile: the recommended-questions heading lost its "priority"
      // tooltip (each card now says in one line why it is there), so one remains.
      tips.length === 1 && tips.every((c) => /\bhidden\b/.test(c) && !/opacity-0/.test(c)), tips.join(' | '))
    check('B8: MUT an opacity-0 tooltip fails B7', !['className="absolute opacity-0 group-hover:opacity-100"'].every((c) => /\bhidden\b/.test(c) && !/opacity-0/.test(c)))
    check('B4: the summary is one Notice built from our keys', /<Notice tone=\{summaryTone\}>\{t\(summaryKey\)\}<\/Notice>/.test(src) && /'drawer_summary_none'/.test(src))
  }

  console.log('\nC) the two competitor percentages say what they measure')
  {
    for (const locale of ['he', 'en'] as const) {
      const t = I.createI18n(locale)
      const share = locale === 'he' ? /מכלל האזכורים/ : /all mentions/i
      const answers = locale === 'he' ? /מהתשובות/ : /of answers/i
      check(`C1 ${locale}: "share" is named as a share of all mentions and says it sums to 100%`,
        share.test(t('share_of_voice_title')) && /100%/.test(t('share_of_voice_help')) && share.test(t('share_of_voice_of_all')))
      check(`C2 ${locale}: the per-business rate is named "of answers" and says several can reach 100%`,
        answers.test(t('competitor_visibility')) && /100%/.test(t('competitor_analysis_help')))
      check(`C3 ${locale}: the counts are in answers, not "results"`,
        !/results|תוצאות/i.test(t('competitor_results_of')) && /\{mentions\}/.test(t('competitor_results_of')))
    }
    const panel = code('components/ai-visibility/CompetitorAnalysisPanel.tsx')
    // R21: the tab says it once. The per-business rate ("of answers", the score's own unit) is the
    // one comparison; the "share of all mentions" card re-divided the same counts and put 43% next
    // to 100% for one competitor, so it is gone.
    const rule = (s: string) => /t\('competitor_visibility'\)/.test(s) && /t\('competitor_results_of'\)/.test(s)
      && !/t\('share_of_voice_(?:title|of_all|help)'\)/.test(s) && !/shareOfVoice\b(?!\?: ShareOfVoice)/.test(s.replace(/type AnalysisResponse[\s\S]*?\n\}/, ''))
    check('C4: one comparison card, its unit next to the number, no second "share of mentions" percentage', rule(panel))
    check('C5: MUT putting the share card back fails C4', !rule(panel + "\n<h3>{t('share_of_voice_title')}</h3>"))
    check('C5b: MUT dropping the unit fails C4', !rule(panel.replace("t('competitor_visibility')", "''")))
    check('C6: MUT the old "share of voice" title fails C1', !/מכלל האזכורים/.test('נתח קול בתשובות AI'))
    check('C7: the bars follow the chart rule (the business in action, competitors in line-strong)',
      /isProject \? 'bg-action' : 'bg-line-strong'/.test(panel) && /row\.isProject \? 'bg-action' : 'bg-line-strong'/.test(panel))
  }

  console.log('\nD) no raw server or provider text reaches the merchant')
  {
    const files = [SECTION, 'components/ai-visibility/PromptSuggestions.tsx', 'components/ai-visibility/AIBusinessProfilePanel.tsx', 'components/ai-visibility/CompetitorAnalysisPanel.tsx']
    const raw = /setError\(\s*e instanceof Error \? e\.message|setError\(\s*body\.error/
    const leaks = files.filter((f) => raw.test(code(f)))
    check('D1: no error state is set from an exception message or a route\'s error field', leaks.length === 0, leaks.join(', '))
    check('D2: MUT putting e.message back is caught', raw.test(code(SECTION) + "\nsetError(e instanceof Error ? e.message : 'x')"))
    const s = code(SECTION)
    check('D3: the banner reads GENERIC_ERROR out as "something went wrong"', /error === GENERIC_ERROR \? t\('something_went_wrong'\) : error/.test(s))
    check('D4: a refusal is shown as it is only when the route wrote it for the merchant (errorEn)',
      /typeof body\.errorEn === 'string' && body\.errorEn\s*\?\s*new UserFacingError\(apiErrorText\(/.test(s))
    check('D5: the archive messages are keys, not hard-coded sentences',
      /t\('archived_toast'\)/.test(s) && /t\('restored_toast'\)/.test(s) && !/Failed to update archive status/.test(s))
  }

  console.log('\nE) the design contract in the AI tab\'s files')
  {
    // Two known exceptions, both reported: the ChatGPT and Grok logos are black
    // SVGs that must invert in dark mode, and the always-dark opening card's
    // guarded 3.5rem score has no token. Its up/down change is on the ok/bad
    // soft pair now (R12), so emerald/rose are no longer allowed there.
    const ALLOW: Array<[string, RegExp]> = [
      ['components/ai-visibility/EngineIcon.tsx', /^dark:$/],
      ['components/ai-visibility/OverviewRows.tsx', /^text-\[3$/],
    ]
    const BANNED = /\b(?:text|bg|border|ring|from|to|via|fill|stroke|divide|shadow)-(?:slate|gray|zinc|neutral|stone|blue|indigo|violet|purple|green|emerald|teal|red|rose|amber|yellow|orange|sky|cyan|pink|white|black)(?:-\d{2,3})?\b|\bdark:|\btext-(?:xs|sm|base|lg|xl|2xl|3xl)\b|text-\[\d|\bshadow-(?:sm|md|lg|xl|2xl)\b|\brounded-(?:md|lg|xl|2xl|3xl|full)\b|transition-all|hover:scale|animate-pulse|animate-bounce|gradient|font-mono/g
    const hits: string[] = []
    const scan = (f: string, src: string) => {
      for (const m of src.matchAll(BANNED)) {
        if (ALLOW.some(([file, re]) => file === f && re.test(m[0]))) continue
        hits.push(`${f}: ${m[0]}`)
      }
    }
    for (const f of WP2) scan(f, code(f))
    check('E1: tokens only; no banned size, radius, shadow, gradient or motion class', hits.length === 0, hits.slice(0, 8).join(' | '))
    const before = hits.length
    scan(SECTION, code(SECTION) + '\n<p className="text-slate-500 rounded-xl shadow-lg" />')
    check('E2: MUT a raw palette class, a banned radius and a banned shadow are each caught', hits.length - before === 3)
    const beforeRows = hits.length
    scan('components/ai-visibility/OverviewRows.tsx', code('components/ai-visibility/OverviewRows.tsx') + "\n<span className={dir === 'up' ? 'text-emerald-300' : 'text-rose-300'} />")
    check('E2b: MUT the old emerald/rose change colours in OverviewRows are caught (no allowance left)', hits.length - beforeRows === 2)
    hits.length = beforeRows

    const natives = WP2.filter((f) => /<select\b|type="checkbox"/.test(code(f)))
    check('E3: no native select or checkbox (ui/Select, ui/Checkbox)', natives.length === 0, natives.join(', '))
    check('E4: MUT a native select is caught', /<select\b/.test(code(SECTION) + '\n<select />'))

    // Icon glyphs in rendered text or class strings. The drawer's bullet is text
    // it writes into the answer's own lines (a markdown list), not an icon.
    const GLYPH = /[✓✗✕↕▸◂▾→←↻×]|•(?! ')/
    const glyphs = WP2.filter((f) => GLYPH.test(code(f)))
    check('E5: no glyph icons (lucide only)', glyphs.length === 0, glyphs.join(', '))
    check('E6: MUT a ↻ glyph is caught', GLYPH.test(code('components/ai-visibility/PromptSuggestions.tsx') + '\n<span>↻</span>'))

    const s = code(SECTION)
    const selects = ['filter_engine', 'filter_mention', 'filter_citation'].every((k) => new RegExp(`<Select\\s+aria-label=\\{t\\('${k}'\\)\\}`).test(s))
    check('E7: the three result filters are ui/Select with their names', selects)
    check('E8: the delete confirmation is the danger button, not a recoloured primary', /variant="danger"\s+onClick=\{\(\) => deletePrompt\(deletePromptId\)\}/.test(s) && !/!bg-bad/.test(s))
  }

  console.log(`\n${pass} passed, ${fail} failed`)
  if (fail > 0) process.exitCode = 1
}

main()

export {}
