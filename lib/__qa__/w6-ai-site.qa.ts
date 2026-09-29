/**
 * Final premium wave, AI visibility / site health / site links / settings
 * (review section 4: G3, R1, R5–R10, R12, R16, R21, R22, R33, R35).
 *
 *   A  G3: no curved start rail on a rounded card or row (settings danger card,
 *      AI readiness rows, the "your business" competitor row, a failed result
 *      row, the site-health finding card); the tone lives on the Badge or icon
 *   B  R1: "fix it for me" is a secondary sm button on each page row
 *   C  R5/R6: no alert() or window.confirm in the owned panels; useConfirm
 *      (danger for destructive acts); a route's `error` text never reaches the
 *      merchant in CompetitorsPanel
 *   D  R7: the Search Console card tells a merchant only that it is unavailable
 *      (no connect button); the configuration reason is only for an administrator,
 *      decided on the server by isAdminUser
 *   E  R8/R9/R10/R16/R33/R35: the black chip, the hand-built segmented control,
 *      the raw type size, the squeezed settings header, the choice-card radio and
 *      the monospace secret are gone
 *   F  R21/R22: engines collapse to those that mentioned the business plus "+N";
 *      an odd insight count is one list; competitor chips carry a SiteAvatar; a
 *      suggested question states its reason once; the mapping placeholder is an
 *      EmptyState; an unknown detected profile ("Other") is not shown
 *
 * Every guard has a mutation control. Source guards strip comments first.
 *
 * Run: npx tsx lib/__qa__/w6-ai-site.qa.ts
 */
/* eslint-disable @typescript-eslint/no-require-imports */

let pass = 0, fail = 0
function check(name: string, cond: boolean, detail?: string) {
  if (cond) { pass++; console.log(`  ✓ ${name}`) } else { fail++; console.log(`  ✗ ${name}${detail ? ` — ${detail}` : ''}`) }
}

const { readFileSync } = require('fs') as typeof import('fs')
const { join } = require('path') as typeof import('path')
const { createElement } = require('react') as typeof import('react')
const { renderToStaticMarkup } = require('react-dom/server') as typeof import('react-dom/server')
const { DashboardLanguageProvider } = require('../i18n/dashboard/useDashboardLanguage')
const I = require('../ai-visibility/i18n') as typeof import('../ai-visibility/i18n')
const { SmartQuestionCard } = require('../../components/ai-visibility/sections/SmartQuestionCard') as typeof import('../../components/ai-visibility/sections/SmartQuestionCard')
const { getDashboardDictionary } = require('../i18n/dashboard/getDashboardDictionary') as typeof import('../i18n/dashboard/getDashboardDictionary')

const ROOT = join(__dirname, '..', '..')
const read = (p: string) => readFileSync(join(ROOT, p), 'utf8')
const strip = (s: string) => s.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\{\/\*[\s\S]*?\*\/\}/g, '').replace(/(^|[^:'"`])\/\/[^\n]*/g, '$1')
const code = (p: string) => strip(read(p))
const render = (locale: 'he' | 'en', node: unknown) =>
  renderToStaticMarkup(createElement(DashboardLanguageProvider, { initialLocale: locale, children: node }) as never)
const text = (html: string) => html.replace(/<[^>]+>/g, ' ').replace(/&#x27;/g, '\'').replace(/&quot;/g, '"').replace(/&amp;/g, '&').replace(/\s+/g, ' ')

function main() {
  console.log('A) G3: no curved start rails')
  {
    const FILES = [
      'components/settings/SettingsCard.tsx',
      'components/ai-visibility/ReadinessCard.tsx',
      'components/ai-visibility/CompetitorAnalysisPanel.tsx',
      'components/ai-visibility/sections/ResultRowCard.tsx',
      'components/site-health/FindingCard.tsx',
    ]
    const RAIL = /border-s-\[\d+px\]|border-s-(?:2|4|8)\b|absolute start-0[^"'`]*w-\[3px\]/
    const hits = FILES.filter((f) => RAIL.test(code(f)))
    check('A1: none of the five cards draws a start rail', hits.length === 0, hits.join(', '))
    check('A2: MUT the danger rail back on SettingsCard is caught', RAIL.test(code(FILES[0]).replace("className=\"overflow-clip\"", "className={cn('overflow-clip', danger && 'border-s-[3px] border-s-bad')}")))
    check('A3: MUT the finding card\'s absolute 3px rail is caught', RAIL.test(code(FILES[4]) + '<span className="absolute start-0 top-6 h-10 w-[3px] rounded-e-pill" />'))
    const card = code('components/settings/SettingsCard.tsx')
    check('A4: the danger card keeps its tone on the icon squircle (bg-bad-soft text-bad)', /danger \? 'bg-bad-soft text-bad' : 'bg-action-soft text-action'/.test(card))
    const finding = code('components/site-health/FindingCard.tsx')
    check('A5: the finding card keeps its severity on the Badge', /<Badge variant=\{SEVERITY_BADGE\[finding\.severity\]\} dot>/.test(finding))
  }

  console.log('\nB) R1: one primary per screen on site health')
  {
    const finding = code('components/site-health/FindingCard.tsx')
    const rule = (s: string) => /<Button variant="secondary" size="sm" onClick=\{\(\) => onFix\(finding, page\)\}/.test(s) && !/<Button size="sm" onClick=\{\(\) => onFix/.test(s)
    check('B1: "fix it for me" is secondary sm on each page row', rule(finding))
    check('B2: MUT a primary row button fails B1', !rule(finding.replace('<Button variant="secondary" size="sm" onClick={() => onFix', '<Button size="sm" onClick={() => onFix')))
    const screen = code('components/site-health/SiteHealthScreen.tsx')
    const primaries = (screen.match(/<Button(?![^>]*variant="(?:secondary|ghost)")[^>]*>/g) ?? []).length
    check('B3: the site-health screen has at most one primary Button (the first scan)', primaries <= 1, String(primaries))
  }

  console.log('\nC) R5/R6: no browser alert or confirm; no raw route error')
  {
    const FILES = [
      'components/ai-visibility/CompetitorsPanel.tsx',
      'components/content/WordPressConnectionPanel.tsx',
      'components/content/site-platforms/SiteHubCard.tsx',
      'components/content/site-platforms/SitePlatformPanel.tsx',
    ]
    const BROWSER = /\b(?:window\.)?(?:alert|confirm)\(/
    const usesHook = (s: string) => /const \{ confirm, dialog \} = useConfirm\(\)/.test(s) && /\{dialog\}/.test(s) && /await confirm\(/.test(s)
    const leftovers = FILES.filter((f) => BROWSER.test(code(f).replace(/await confirm\(/g, '')))
    check('C1: no alert() or window.confirm() in the four panels', leftovers.length === 0, leftovers.join(', '))
    check('C2: each asks through useConfirm and renders its dialog', FILES.every((f) => usesHook(code(f))), FILES.filter((f) => !usesHook(code(f))).join(', '))
    check('C3: MUT a window.confirm back is caught', BROWSER.test(code(FILES[3]).replace(/await confirm\(/g, '') + '\nif (!window.confirm(x)) return'))
    check('C4: MUT an alert() back is caught', BROWSER.test(code(FILES[0]).replace(/await confirm\(/g, '') + "\nalert(t('competitor_load_failed'))"))
    const danger = (f: string) => /tone: 'danger'/.test(code(f))
    check('C5: remove / disconnect confirms are danger-toned (competitor, WordPress, site platform)', danger(FILES[0]) && danger(FILES[1]) && danger(FILES[3]))
    check('C6: publishing keeps the default tone (it is not destructive)', !danger(FILES[2]))
    const panel = code(FILES[0])
    const noRaw = (s: string) => !/body\.error|\.error \|\||data\.error\b/.test(s) && /failureOf\(/.test(s) && /code === 'max_competitors_reached'/.test(s)
    check('C7: CompetitorsPanel never shows a route\'s error text; it maps the max-reached code', noRaw(panel))
    check('C8: MUT setSaveError(body.error || …) fails C7', !noRaw(panel.replace("setSaveError(t(FAILURE_KEY[failureOf(body, 'save')]))", "setSaveError(body.error || t('competitor_save_failed'))")))
    for (const locale of ['he', 'en'] as const) {
      const t = I.createI18n(locale)
      check(`C9 ${locale}: the failure sentences and the confirm copy exist and say "try again"`,
        ['competitor_save_failed', 'competitor_remove_failed', 'competitor_reactivate_failed'].every((k) => (locale === 'he' ? /נסו שוב/ : /Try again/).test(t(k as never)))
        && !!t('competitor_remove_title') && !!t('competitor_remove_action'))
      const sp = getDashboardDictionary(locale).sitePlatforms.panel
      const wp = getDashboardDictionary(locale).projectDetail.contentSection
      check(`C10 ${locale}: dialog copy has a title and a body without list glyphs`,
        !!sp.disconnectTitle && !!sp.disconnectBody && !!wp.confirmDisconnectTitle && !/[•\n]/.test(wp.confirmDisconnectBody + sp.disconnectBody))
    }
  }

  console.log('\nD) R7: Search Console unavailable, ops reason for administrators only')
  {
    const panel = code('components/content/GscPanel.tsx')
    const merchantOnly = (s: string) => /\{t\.unavailable\}/.test(s) && /\{status\.opsDetail && <span[^>]*>\{t\.notConfigured\}<\/span>\}/.test(s)
      && /\{!loading && status\?\.oauthConfigured !== false && !connected && \(/.test(s)
    check('D1: the card says "unavailable"; the reason renders only with opsDetail; no connect button when unconfigured', merchantOnly(panel))
    check('D2: MUT showing the ops reason to everyone fails D1', !merchantOnly(panel.replace('{status.opsDetail && <span', '{true && <span')))
    const route = code('app/api/gsc/status/route.ts')
    const serverDecides = (s: string) => /import \{ isAdminUser \} from '@\/lib\/auth\/admin-role'/.test(s) && /const opsDetail = !oauthConfigured && await isAdminUser\(auth\.admin, auth\.user\.id\)/.test(s) && /\bopsDetail,/.test(s)
    check('D3: the status route decides opsDetail with isAdminUser (profiles.role, service role), never a request field', serverDecides(route) && !/searchParams\.get\('admin'\)|opsDetail = .*searchParams/.test(route))
    check('D4: MUT opsDetail from a query parameter fails D3', !serverDecides(route.replace('await isAdminUser(auth.admin, auth.user.id)', "new URL(request.url).searchParams.get('admin') === '1'")))
    for (const locale of ['he', 'en'] as const) {
      const g = getDashboardDictionary(locale).projectDetail.contentSection.gsc
      const ops = locale === 'he' ? /פנו למנהל המערכת|אינו מוגדר בשרת/ : /Contact your administrator|not configured on the server/
      check(`D5 ${locale}: the merchant copy (unavailable, and the connect error code) carries no ops wording`,
        !!g.unavailable && !ops.test(g.unavailable) && !ops.test((g.errors as Record<string, string>).gsc_oauth_not_configured))
    }
  }

  console.log('\nE) the smaller review rows')
  {
    const opp = code('components/site-links/OpportunityList.tsx')
    const chip = (s: string) => !/bg-ink\b|border-ink\b/.test(s) && /on \? 'border-action\/30 bg-action-soft text-action'/.test(s)
    check('E1 (R8): the chosen category chip is action-soft, never black', chip(opp))
    check('E2: MUT the black chip back fails E1', !chip(opp.replace("on ? 'border-action/30 bg-action-soft text-action'", "on ? 'border-ink bg-ink text-surface'")))
    const screen = code('components/site-health/SiteHealthScreen.tsx')
    const seg = (s: string) => /<Segmented\s+ariaLabel=\{copy\.filters\.label\}[\s\S]{0,160}\bfill\b/.test(s) && !/rounded-\[0\.5rem\]/.test(s) && !/aria-pressed=\{filter === f\}/.test(s)
    check('E3 (R9): the findings filter is ui/Segmented, full width below sm', seg(screen) && /className="sm:inline-flex sm:w-auto"/.test(screen))
    check('E4: MUT the hand-built buttons back fail E3', !seg(screen + '<button aria-pressed={filter === f} className="rounded-[0.5rem]" />'))
    const fix = code('components/site-health/FixPreviewModal.tsx')
    check('E5 (R10): the SERP mock title uses the type scale (text-section), no raw size', !/text-\[\d/.test(fix) && /text-section font-medium text-action/.test(fix))
    check('E6: MUT text-[1.0625rem] back is caught', /text-\[\d/.test(fix + 'text-[1.0625rem]'))
    const card = code('components/settings/SettingsCard.tsx')
    const stack = (s: string) => /<header className="flex flex-col gap-3 [^"]*sm:flex-row/.test(s)
    check('E7 (R16): the settings card header stacks below sm', stack(card))
    check('E8: MUT the one-row header fails E7', !stack(card.replace('flex flex-col gap-3', 'flex flex-wrap items-start justify-between gap-x-4 gap-y-3')))
    const profile = code('components/settings/ProfileCard.tsx')
    const radio = (s: string) => /<Segmented\s+ariaLabel=\{t\.profile\.commerceLabel\}/.test(s) && !/type="radio"/.test(s)
    check('E9 (R33): the commerce type is ui/Segmented, no native radio', radio(profile))
    check('E10: MUT a native radio back fails E9', !radio(profile + '<input type="radio" />'))
    const sw = code('components/content/site-platforms/PlatformSwitchModal.tsx')
    check('E11 (R35): the shown secret uses the body font with tabular-nums, no font-mono', !/font-mono/.test(sw) && /tabular-nums text-ink">\{secret\}/.test(sw))
    check('E12: MUT font-mono on the secret is caught', /font-mono/.test(sw.replace('text-caption tabular-nums text-ink">{secret}', 'font-mono text-caption text-ink">{secret}')))
  }

  console.log('\nF) R21/R22: the AI tab')
  {
    const sec = code('components/ai-visibility/AIVisibilitySection.tsx')
    const collapse = (s: string) => /const allOpen = !checkedAny \|\| enginesOpenFor\.has\(p\.id\)/.test(s)
      && /SUPPORTED_ENGINES\.filter\(\(e\) => mentionedByPair\.get\(`\$\{p\.id\}:\$\{e\}`\) === true \|\| scanningKey === `\$\{p\.id\}:\$\{e\}`\)/.test(s)
      && /\{shownEngines\.map\(\(engine\) =>/.test(s) && /data-ai-engines-more=\{hiddenEngines\}/.test(s)
    check('F1: a checked question shows only the engines that mentioned the business (and one running), the rest behind "+N"', collapse(sec))
    check('F2: MUT every engine on every row fails F1', !collapse(sec.replace('{shownEngines.map((engine) =>', '{SUPPORTED_ENGINES.map((engine) =>')))
    for (const locale of ['he', 'en'] as const) {
      check(`F3 ${locale}: "+N" has a name that says it shows the rest`, /\{n\}/.test(I.createI18n(locale)('engines_show_rest')))
    }
    const opp = code('components/ai-visibility/sections/GeoOpportunityMapping.tsx')
    const even = (s: string) => /cards\.length % 2 === 0 && 'md:grid-cols-2'/.test(s)
    check('F4: an odd number of insight cards is one list (no hole in the grid)', even(opp))
    check('F5: MUT two columns for any count fails F4', !even(opp.replace("cards.length % 2 === 0 && 'md:grid-cols-2'", "cards.length > 1 && 'md:grid-cols-2'")))
    const ro = code('components/ai-visibility/CompetitorsReadOnly.tsx')
    const avatar = (s: string) => /data-ai-competitor-chip=""[^>]*bg-surface[^>]*shadow-control[^>]*>\s*<SiteAvatar domain=\{r\.domain\} name=\{r\.name\} size="sm" \/>/.test(s) && !/bg-canvas px-3 py-2/.test(s)
    check('F6: competitor chips are surface chips with a SiteAvatar', avatar(ro))
    check('F7: MUT the grey canvas chip back fails F6', !avatar(ro.replace('<SiteAvatar domain={r.domain} name={r.name} size="sm" />', '')))

    const q = { prompt: 'How do I choose a trusted business?', intent: 'recommendation', reason: 'starter', valueReason: 'Complete the profile for sharper ones', chips: ['starter_questions'], confidenceTier: 'starter' }
    for (const locale of ['he', 'en'] as const) {
      const t = I.createI18n(locale)
      const html = render(locale, createElement(SmartQuestionCard, { question: q as never, onAdd: () => {}, t }))
      const lines = (html.match(/data-question-reason=""/g) ?? []).length
      check(`F8 ${locale}: a suggested question states its reason once (the scorer's sentence), not three lines`,
        lines === 1 && text(html).includes(q.valueReason) && !text(html).includes(t('starter_questions' as never)) && !/>starter</.test(html))
    }
    const card = read('components/ai-visibility/sections/SmartQuestionCard.tsx')
    check('F9: MUT the chips line back is caught by F8\'s count', (strip(card) + '<p data-question-reason="">x</p>').match(/data-question-reason=""/g)!.length === 2)

    const ph = code('components/mapping/MappingPlaceholder.tsx')
    const empty = (s: string) => /<EmptyState\b/.test(s) && !/border-dashed/.test(s) && !/\['w-full', 'w-11\/12', 'w-2\/3'\]/.test(s) && /if \(mapping\.available !== true\) return null/.test(s)
    check('F10: the mapping placeholder is an EmptyState (no still skeleton bars, no dashed box)', empty(ph))
    check('F11: MUT a dashed box back fails F10', !empty(ph + '<div className="border border-dashed" />'))
    const prof = code('components/ai-visibility/AIBusinessProfilePanel.tsx')
    // W7: "Other" is never shown as what the business is; the panel asks instead (business-identity.qa.ts C9).
    const hideOther = (s: string) => /const isUnknown = identity\.source === 'unknown' \|\| !identifiedLabel \|\| identifiedLabel === t\('cat_generic'\)/.test(s) && /\) : isUnknown \? \(/.test(s)
    check('F12: an auto-detected "Other" profile line is not shown (the panel asks instead)', hideOther(prof))
    check('F13: MUT always showing the line fails F12', !hideOther(prof.replace(') : isUnknown ? (', ') : false ? (')))
  }

  console.log(`\n${pass} passed, ${fail} failed`)
  if (fail) process.exit(1)
}

main()
export {}
