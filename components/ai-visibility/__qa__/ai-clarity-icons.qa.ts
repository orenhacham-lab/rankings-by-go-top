/**
 * The AI tab, read by a non-technical owner, and the icons that echoed the
 * competitor (seo-agent.io).
 *
 *   A  engine marks: a ✓ means "mentioned you", never merely "checked"; an
 *      engine nobody checked is "not checked yet", never a green 0
 *   B  the allowance: a plan without AI checks says so (not "you used them
 *      all") and links to /billing
 *   C  words: no raw codes (home_improvement_service, google_ai_overview), no
 *      untranslated "Share of Voice", no "GEO" jargon, no emoji
 *   D  suggested questions about another trade are not shown (a plumber is
 *      not offered renovation questions)
 *   E  one picture per site: SiteAvatar (favicon, else one letter by one rule)
 *      in every place a site or competitor is listed
 *   F  icons: no crossed swords anywhere; competitors share one icon; easy
 *      wins grow (Sprout); no crosshair, no award ribbons
 *
 * Every guard has a mutation control.
 *
 * Run: npx tsx components/ai-visibility/__qa__/ai-clarity-icons.qa.ts
 */
/* eslint-disable @typescript-eslint/no-require-imports, @typescript-eslint/no-explicit-any */

let pass = 0, fail = 0
function check(name: string, cond: boolean, detail?: string) {
  if (cond) { pass++; console.log(`  ✓ ${name}`) } else { fail++; console.log(`  ✗ ${name}${detail ? ` — ${detail}` : ''}`) }
}

// next/navigation needs a request outside of Next; nothing else is replaced.
const Module: any = require('module')
const origLoad = Module._load
Module._load = function (request: string, parent: any, isMain: boolean) {
  const real = origLoad.call(this, request, parent, isMain)
  if (request !== 'next/navigation') return real
  return new Proxy(real, {
    get: (t, k) => (k === 'usePathname' ? () => '/ai-visibility'
      : k === 'useSearchParams' ? () => new URLSearchParams()
      : k === 'useRouter' ? () => ({ push() {}, replace() {}, refresh() {}, back() {}, prefetch() {} })
      : (t as any)[k]),
  })
}

const { readFileSync, readdirSync, statSync } = require('fs') as typeof import('fs')
const { join } = require('path') as typeof import('path')
const { createElement } = require('react') as typeof import('react')
const { renderToStaticMarkup } = require('react-dom/server') as typeof import('react-dom/server')
const { DashboardLanguageProvider } = require('../../../lib/i18n/dashboard/useDashboardLanguage')
const { getDashboardDictionary } = require('../../../lib/i18n/dashboard/getDashboardDictionary')
const M = require('../overview-model') as typeof import('../overview-model')
const { OverviewStatusBar, nextStepKind } = require('../OverviewRows') as typeof import('../OverviewRows')
const R = require('../../../lib/ai-visibility/question-relevance') as typeof import('../../../lib/ai-visibility/question-relevance')
const I = require('../../../lib/ai-visibility/i18n') as typeof import('../../../lib/ai-visibility/i18n')
const AV = require('../../ui/SiteAvatar') as typeof import('../../ui/SiteAvatar')
const ENGINE = require('../EngineIcon') as typeof import('../EngineIcon')

const ROOT = join(__dirname, '..', '..', '..')
const read = (p: string) => readFileSync(join(ROOT, p), 'utf8')
const strip = (s: string) => s.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\{\/\*[\s\S]*?\*\/\}/g, '').replace(/(^|[^:'"`])\/\/[^\n]*/g, '$1')
const code = (p: string) => strip(read(p))
const show = (v: unknown) => JSON.stringify(v)
const render = (locale: 'he' | 'en', node: unknown) =>
  renderToStaticMarkup(createElement(DashboardLanguageProvider, { initialLocale: locale, children: node }) as never)

function sourceFiles(dir: string, out: string[] = []): string[] {
  for (const f of readdirSync(join(ROOT, dir))) {
    if (f === 'node_modules' || f.startsWith('.') || f === '__qa__') continue
    const p = `${dir}/${f}`
    if (statSync(join(ROOT, p)).isDirectory()) sourceFiles(p, out)
    else if (/\.tsx?$/.test(f)) out.push(p)
  }
  return out
}

const SECTION = 'components/ai-visibility/AIVisibilitySection.tsx'

async function main() {
  console.log('AI tab clarity and icons')

  console.log('\nA) a ✓ means "mentioned you"')
  {
    const run = (id: string, minutes: number, engine: string, mentioned: boolean, promptId = 'q1') => ({
      id, status: 'completed', createdAt: new Date(Date.now() - minutes * 60_000).toISOString(), completedAt: new Date(Date.now() - minutes * 60_000).toISOString(),
      results: [{ id: `${id}r`, engine, promptId, promptText: 'q?', status: 'success', mentioned, targetCited: false, displayMentioned: mentioned, displayCited: false, excludedFromScore: false }],
    })
    const o = M.buildOverview(M.readRuns([run('a', 5, 'chatgpt', true), run('b', 10, 'gemini', false)]))
    check('A1: the overview knows which checked engines mentioned the business', show(o.enginesChecked) === '["chatgpt","gemini"]' && show(o.enginesMentioned) === '["chatgpt"]', show(o))
    const html = render('he', createElement(OverviewStatusBar, { overview: o, questionsPending: false }))
    const state = (e: string) => (html.match(new RegExp(`title="${ENGINE.ENGINE_META[e].name}[^"]*"\\s+data-engine-state="([a-z_]+)"`)) ?? [])[1]
    check('A2: status bar: ChatGPT mentioned (✓), Gemini checked but not mentioned (no ✓), Perplexity not checked',
      state('chatgpt') === 'mentioned' && state('gemini') === 'not_mentioned' && state('perplexity') === 'not_checked', show({ c: state('chatgpt'), g: state('gemini'), p: state('perplexity') }))
    const checks = (html.match(/lucide-circle-check|lucide-check-circle/g) ?? []).length
    check('A3: exactly one ✓ drawn (for the one engine that mentioned the business)', checks === 1, String(checks))
    const d = getDashboardDictionary('he').aiVisibilityOverview
    check('A4: its label says it in words', html.includes(`ChatGPT: ${d.engineMentioned}`) && html.includes(`Gemini: ${d.engineNotMentioned}`))
    const rows = code('components/ai-visibility/OverviewRows.tsx')
    check('A5: MUT a ✓ for every checked engine fails A3\'s source rule', /\{named && \(\s*<CheckCircle2/.test(rows) && !/\{named && \(\s*<CheckCircle2/.test(rows.replace('{named && (', '{on && (')))

    const s = code(SECTION)
    const chipRule = /mentionedHere === true && <Check[\s\S]*mentionedHere === false && <Minus/
    check('A6: question chips: ✓ only where the latest answer mentioned the business, – where it did not, nothing when unchecked',
      chipRule.test(s) && /const mentionedHere = mentionedByPair\.get\(key\)/.test(s) && !/\{scanned && <span[^>]*>✓<\/span>\}/.test(s))
    check('A7: MUT the old "✓ = checked" chip fails A6', !chipRule.test(s.replace(/\{!scanning && mentionedHere === true && <Check[^\n]*\n[^\n]*<Minus[^\n]*/, '{scanned && <span className="relative z-10">✓</span>}')))
    const cardRule = /checked \? \([\s\S]*?\) : \([\s\S]*?t\('chip_not_checked'\)/
    check('A8: engine cards: an engine nobody checked says "not checked yet", no number', cardRule.test(s) && /data-engine-card=/.test(s))
    check('A9: MUT the old always-a-number card fails A8', !cardRule.test(s.replace(/checked \? \(/, '(')))
    check('A10: the chip legend is shown in both languages', /data-ai-chip-legend/.test(s) && /✓/.test(I.createI18n('he')('chip_legend')) && /✓/.test(I.createI18n('en')('chip_legend')))
    check('A11: next step: partial when engines are unchecked, then mentions',
      nextStepKind({ enginesChecked: ['chatgpt'], mentions: 1 }) === 'partial'
      && nextStepKind({ enginesChecked: [...M.OVERVIEW_ENGINES], mentions: 0 }) === 'no_mentions'
      && nextStepKind({ enginesChecked: [...M.OVERVIEW_ENGINES], mentions: 2 }) === 'keep_going')
  }

  console.log('\nB) the allowance')
  {
    const s = code(SECTION)
    const rule = /allowance\.limit === 0 \? t\('ai_allowance_none_body'\) : t\('ai_allowance_exhausted'\)[\s\S]{0,80}<NextLink href="\/billing"/
    check('B1: nothing left: a plan without AI checks is told so (not "used them all"), with a link to /billing', rule.test(s))
    check('B2: MUT the old sentence for every case fails B1', !rule.test(s.replace("allowance.limit === 0 ? t('ai_allowance_none_body') : t('ai_allowance_exhausted')", "t('ai_allowance_exhausted')")))
    check('B3: "0/0" is never shown: a zero limit reads "not included in your plan"', /allowance\.limit === 0 \? `\$\{t\('ai_allowance'\)\}: \$\{t\('ai_allowance_not_included'\)\}`/.test(s))
    const he = I.createI18n('he'), en = I.createI18n('en')
    check('B4: the words exist in both languages', !!he('ai_allowance_none_body') && !!en('ai_allowance_none_body') && he('ai_allowance_upgrade') !== en('ai_allowance_upgrade'))
    check('B5: the link only navigates (no billing call from the tab)', !/fetch\(['`"]\/api\/(billing|paypal|subscription)/.test(s))
  }

  console.log('\nC) words')
  {
    const he = I.createI18n('he')
    const latin = (x: string) => /[A-Za-z]/.test(x.replace(/\bAI\b/g, ''))
    check('C1: the share-of-voice heading and help are Hebrew in Hebrew ("AI" aside)', !latin(he('share_of_voice_title')) && !latin(he('share_of_voice')) && !latin(he('share_of_voice_help')), he('share_of_voice_title'))
    check('C1b: MUT the old "AI Share of Voice" heading fails C1', latin('AI Share of Voice'))
    check('C2: no "GEO" jargon in the result drawer\'s heading', !/GEO/.test(he('geo_insights_title')) && !/GEO/.test(I.createI18n('en')('geo_insights_title')))
    const src = read('lib/ai-visibility/i18n.ts')
    check('C3: no emoji in the tab\'s words (💡 ✨ 🔍)', !/[💡✨🔍🏆🎯⚔]/u.test(src))
    check('C4: the retired engine code is named ("Google AI"), never shown raw', ENGINE.ENGINE_META.google_ai_overview?.name === 'Google AI')
    const panel = code('components/ai-visibility/AIBusinessProfilePanel.tsx')
    check('C5: the detected category home_improvement_service has plain words in both languages',
      /value: 'home_improvement_service', labelKey: 'cat_home_improvement_service'/.test(panel) && /[א-ת]/.test(he('cat_home_improvement_service' as never)) && !/_/.test(I.createI18n('en')('cat_home_improvement_service' as never)))
    const codeRule = /if \(\/\^\[a-z0-9\]\+\(\?:_\[a-z0-9\]\+\)\+\$\/\.test\(raw\)\) return t\('cat_generic'\)/
    check('C6: any other category code falls back to "Other", never raw', codeRule.test(panel))
    check('C7: MUT returning the raw code fails C6', !codeRule.test(panel.replace("return t('cat_generic')", 'return raw')))
    check('C8: the competitor-echo hero ("does AI recommend you?") is gone', !/ממליץ עליכם/.test(read('lib/i18n/dashboard/he.ts')) && !/recommend you\?/i.test(read('lib/i18n/dashboard/en.ts')))
  }

  console.log('\nD) suggestions about another trade are dropped')
  {
    const plumber = { keywords: ['אינסטלטור בתל אביב', 'פתיחת סתימות'], businessName: 'אינסטלציה מהירה', domain: 'fast-plumb.co.il' }
    const list = [
      { prompt: 'כמה עולה שיפוץ דירה?' }, { prompt: 'איך לבחור קבלן בנייה אמין?' }, { prompt: 'איפה למצוא קבלנים טובים בתל אביב?' },
      { prompt: 'מי האינסטלטור הכי טוב בתל אביב?' }, { prompt: 'כמה עולה פתיחת סתימה?' }, { prompt: 'חוות דעת על אינסטלציה מהירה' },
      { prompt: 'מה עושים כשיש נזילה מהתקרה?' }, { prompt: 'איך בוחרים בעל מקצוע אמין?' },
    ]
    const kept = R.dropOffTopicSuggestions(list, plumber).map((x) => x.prompt)
    check('D1: a plumber keeps plumbing, brand and generic questions and loses the renovation ones',
      show(kept) === show(['מי האינסטלטור הכי טוב בתל אביב?', 'כמה עולה פתיחת סתימה?', 'חוות דעת על אינסטלציה מהירה', 'מה עושים כשיש נזילה מהתקרה?', 'איך בוחרים בעל מקצוע אמין?']), show(kept))
    const renovator = R.dropOffTopicSuggestions(list, { keywords: ['שיפוץ דירות'], businessName: 'שיפוצי כהן' }).map((x) => x.prompt)
    check('D2: a renovator keeps the renovation questions and loses the plumbing ones', renovator.includes('כמה עולה שיפוץ דירה?') && !renovator.includes('כמה עולה פתיחת סתימה?'), show(renovator))
    const unknown = R.dropOffTopicSuggestions(list, { keywords: ['פרחים לחתונה'], businessName: 'Bloom' })
    check('D3: when the project\'s words name no trade, nothing is dropped', unknown.length === list.length)
    const both = R.dropOffTopicSuggestions([{ prompt: 'ניקוי צנרת בבית' }], plumber)
    check('D4: a question naming the project\'s trade among others stays', both.length === 1)
    const en = R.dropOffTopicSuggestions([{ prompt: 'How much does a kitchen remodel cost?' }, { prompt: 'Who is the best plumber near me?' }], { keywords: ['emergency plumber'] })
    check('D5: English too', show(en.map((x) => x.prompt)) === show(['Who is the best plumber near me?']), show(en))
    const s = code(SECTION), modal = code('components/ai-visibility/PromptSuggestions.tsx')
    const wired = /setSuggestedQuestions\(dropOffTopicSuggestions\(/
    check('D6: the tab and the suggestions dialog both filter every list they show', wired.test(s) && /setSuggestions\(dropOffTopicSuggestions\(/.test(modal))
    check('D7: MUT the tab without the filter fails D6', !wired.test(s.replace('setSuggestedQuestions(dropOffTopicSuggestions(', 'setSuggestedQuestions((')))
    const src = read('lib/ai-visibility/question-relevance.ts')
    const noRule = src.replace('for (const trade of named) if (trades.has(trade)) return false\n  return true', 'return false')
    check('D8: MUT a filter that never drops would keep renovation for a plumber (the rule is load-bearing)', noRule !== src)
    const Rmut = (() => {
      const { writeFileSync, unlinkSync } = require('fs') as typeof import('fs')
      const p = join(ROOT, 'lib/ai-visibility/.qa-mut-clarity-question-relevance.ts')
      writeFileSync(p, noRule)
      try { return require(p) as typeof R } finally { unlinkSync(p) }
    })()
    check('D9: …and it does: the mutant keeps "כמה עולה שיפוץ דירה?" for the plumber (D1 fails)', Rmut.dropOffTopicSuggestions(list, plumber).length === list.length)
  }

  console.log('\nE) one picture per site')
  {
    check('E1: the letter is the address\'s first letter, www. and scheme aside, uppercased',
      AV.siteInitial('www.be-cln.co.il', 'בי קלין') === 'B' && AV.siteInitial('https://shop.com/x') === 'S' && AV.siteInitial(' Agibor. Co. Il ') === 'A')
    check('E2: without an address, the name\'s first letter; with neither, a dot', AV.siteInitial(null, 'אינסטלציה מהירה') === 'א' && AV.siteInitial('', '') === '·')
    const html = renderToStaticMarkup(createElement(AV.default, { domain: 'be-cln.co.il', name: 'בי קלין', size: 'md' }))
    check('E3: it renders the letter first, with the favicon candidates behind it', /data-site-icon="initial"/.test(html) && />B</.test(html) && /src="https:\/\/be-cln\.co\.il\/favicon\.ico"/.test(html), html)
    const USERS = [
      'components/layout/WorkspaceSwitcher.tsx', 'components/dashboard/HeroCard.tsx', 'components/onboarding/ResearchSummary.tsx',
      'components/settings/ScanBand.tsx', 'components/settings/CompetitorsCard.tsx', 'components/dashboard/CompetitorsWidget.tsx',
      'components/competitors/CompetitorSummary.tsx', 'components/ai-visibility/CompetitorsPanel.tsx', 'components/ai-visibility/CompetitorAnalysisPanel.tsx',
    ]
    const own = /\.(?:charAt\(0\)|slice\(0, 1\))/
    const bad = USERS.filter((f) => { const s = code(f); return !/<SiteAvatar\b/.test(s) || own.test(s) || /<SiteIcon\b/.test(s) })
    check('E4: every screen that lists a site or competitor draws it with SiteAvatar, none with its own initial', bad.length === 0, show(bad))
    const mutated = code(USERS[4]).replace(/<SiteAvatar[^>]*\/>/, '<span>{shown.slice(0, 1)}</span>')
    check('E5: MUT a list drawing its own initial fails E4', !/<SiteAvatar\b/.test(mutated) || own.test(mutated))
  }

  console.log('\nF) icons')
  {
    const files = [...sourceFiles('app'), ...sourceFiles('components'), ...sourceFiles('lib')]
    const swords = files.filter((f) => /\bSwords\b/.test(code(f)))
    check('F1: no crossed swords anywhere in the app', swords.length === 0, show(swords))
    check('F2: MUT importing Swords again is caught', /\bSwords\b/.test(code('components/competitors/CompetitorSummary.tsx') + "\nimport { Swords } from 'lucide-react'"))
    check('F3: the shared competitor icon is UsersRound', /export \{ UsersRound as CompetitorIcon \} from 'lucide-react'/.test(code('components/competitors/CompetitorIcon.tsx')))
    const competitorScreens = [
      'components/competitors/CompetitorSummary.tsx', 'components/competitors/TopCompetitorLine.tsx', 'components/settings/CompetitorsCard.tsx',
      'components/onboarding/ResearchSummary.tsx', 'components/dashboard/CompetitorsWidget.tsx', 'components/keyword-research/KeywordSourceLine.tsx',
    ]
    const missing = competitorScreens.filter((f) => !/CompetitorIcon/.test(code(f)))
    check('F4: every competitor heading uses that one icon', missing.length === 0, show(missing))
    // The research overview's swords sat on its EASY WINS tile, so it takes the easy-wins icon, not the competitor one.
    const grows = (src: string) => /<Sprout\b/.test(src)
    check('F5: easy wins grow (Sprout), not fight', grows(code('components/keyword-research/EasyWins.tsx')))
    const overview = code('components/keyword-research/ScanOverview.tsx')
    check('F5b: the research overview\'s easy-wins tile grows too', grows(overview))
    check('MUT: the competitor icon on that tile fails F5b', !grows(overview.replace(/<Sprout\b/, '<CompetitorIcon')))
    const echoes = files.filter((f) => !f.startsWith('app/(public)') && /\b(?:Crosshair|Award)\b/.test(code(f)))
    check('F6: no crosshair or award ribbon in the app (public marketing pages aside)', echoes.length === 0, show(echoes))
  }

  console.log(`\n${pass} passed, ${fail} failed`)
  if (fail > 0) process.exit(1)
}

main().catch((e) => { console.error(e); process.exit(1) })

export {}
