/**
 * THE GUIDE PILL AND ITS TOURS — the UX review's decision A6: our own help entry
 * in the top bar (not a floating "?"), one tour system, and tours that describe
 * only what the product does.
 *
 *  A) the full tour is the review's eight steps, in its order, and every step of
 *     every tour has a short title (≤ 5 words) and one line, in both languages;
 *  B) which screen has a tour, and when a tour starts on its own: only for a new
 *     account, only once the project list is known, the full tour first and on
 *     the dashboard, then each screen's own tour once;
 *  C) per-user state: the key carries the user id, the old tour's "done" counts
 *     as done, and the pill's dot stays until a tour is finished;
 *  D) where the bubble goes: beside a sidebar entry on its inline-end side (left
 *     in Hebrew, right in English), under a top-bar control, inside the viewport,
 *     and as a sheet on a phone that never covers its target;
 *  E) the wiring: one tour runner, mounted once from the pill in the top bar
 *     (next to the switcher), keyboard and focus handled, the WhatsApp entry from
 *     the one contact source, the AI-tips slot present and empty;
 *  F) the answers stay true: every FAQ answer and step names a feature this build
 *     has, and flag-gated ones are hidden with their flag.
 *
 * Source guards strip comments first. Every guard has a mutation control that
 * breaks the rule on purpose and shows the guard fails.
 *
 * Run: npx tsx lib/guide/__qa__/guide-tours.qa.ts
 */
import { readFileSync } from 'fs'
import { join } from 'path'
import {
  FULL_TOUR, SCREEN_TOURS, autoTour, fullTourKey, isNewAccount, readFullTourState, screenForPath,
  screenTourKey, showGuideDot, tourSteps, type FullTourState, type ScreenKey, type TourStep,
} from '../tours'
import { placeBubble, BUBBLE_WIDTH, type Box } from '../placement'
import { dashboardHe } from '../../i18n/dashboard/he'
import { dashboardEn } from '../../i18n/dashboard/en'
import { VALID_SCAN_FREQUENCIES } from '../../utils'

let pass = 0, fail = 0
function check(name: string, cond: boolean, detail?: string) {
  if (cond) { pass++; console.log(`  ✓ ${name}`) } else { fail++; console.log(`  ✗ ${name}${detail ? ` — ${detail}` : ''}`) }
}
const ROOT = join(__dirname, '..', '..', '..')
const strip = (s: string) => s.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\{\/\*[\s\S]*?\*\/\}/g, '').replace(/(^|[^:'"`\\])\/\/.*$/gm, '$1')
const code = (rel: string) => strip(readFileSync(join(ROOT, rel), 'utf8'))

// ── A) the steps ──────────────────────────────────────────────────────────────
console.log('A) the full tour is the review\'s eight steps; every step is short, in both languages')
{
  const REVIEW_ORDER = ['switcher', 'hero', 'research', 'keywords', 'strategy', 'aiVisibility', 'connections', 'guide']
  const inOrder = (steps: readonly TourStep[]) => steps.map((s) => s.key).join(',') === REVIEW_ORDER.join(',')
  check('A1: eight steps, in the review\'s order', inOrder(FULL_TOUR), FULL_TOUR.map((s) => s.key).join(','))
  check('A1-MUT: a reordered tour fails A1', !inOrder([FULL_TOUR[1], FULL_TOUR[0], ...FULL_TOUR.slice(2)]))
  check('A2: the full tour ends at the Guide pill itself', FULL_TOUR[7].target === '[data-tour="guide"]')

  const allSteps = [...FULL_TOUR, ...Object.values(SCREEN_TOURS).flatMap((t) => t.steps)]
  const words = (s: string) => s.trim().split(/\s+/).length
  const badText = (dict: typeof dashboardHe.guide.steps) => allSteps.filter((s) => {
    const t = dict[s.key]
    return !t || !t.title || !t.body || words(t.title) > 5 || /\n/.test(t.body) || t.body.length > 140
  }).map((s) => s.key)
  check('A3: every step has a Hebrew title of ≤ 5 words and one line', badText(dashboardHe.guide.steps).length === 0, badText(dashboardHe.guide.steps).join(','))
  check('A3: every step has an English title of ≤ 5 words and one line',
    badText(dashboardEn.guide.steps as unknown as typeof dashboardHe.guide.steps).length === 0)
  check('A3-MUT: a six-word title fails A3', badText({ ...dashboardHe.guide.steps, switcher: { title: 'אחת שתיים שלוש ארבע חמש שש', body: 'x' } } as unknown as typeof dashboardHe.guide.steps).includes('switcher'))
  check('A4: the Hebrew steps are Hebrew and the English steps English',
    Object.values(dashboardHe.guide.steps).every((s) => /[א-ת]/.test(s.title))
    && Object.values(dashboardEn.guide.steps).every((s) => !/[א-ת]/.test(s.title + s.body)))
  check('A5: each screen tour has at least one step, and only real selectors',
    Object.values(SCREEN_TOURS).every((t) => t.steps.length > 0 && t.steps.every((s) => s.target.trim().length > 0)))
}

// ── B) screens and auto-start ─────────────────────────────────────────────────
console.log('\nB) which screen has a tour, and when one starts on its own')
{
  check('B1: /dashboard, /keywords, /keyword-research, /content/strategy, /ai-visibility, /settings, /reports have tours',
    screenForPath('/dashboard') === 'dashboard' && screenForPath('/keywords') === 'keywords'
    && screenForPath('/keyword-research') === 'keywordResearch' && screenForPath('/content/strategy') === 'strategy'
    && screenForPath('/ai-visibility') === 'aiVisibility' && screenForPath('/settings') === 'settings' && screenForPath('/reports') === 'reports')
  check('B2: a trailing slash is the same screen; billing and a keyword\'s history have none',
    screenForPath('/keywords/') === 'keywords' && screenForPath('/billing') === null && screenForPath('/keywords/abc/history') === null && screenForPath(null) === null)

  const base = { pathname: '/dashboard', newAccount: true, projectsResolved: true, fullTour: 'new' as FullTourState, screenSeen: () => false }
  check('B3: a new account on the dashboard gets the full tour', autoTour(base)?.kind === 'full')
  check('B4: an established account never gets a tour on its own, on any screen',
    ['/dashboard', '/keywords', '/settings'].every((pathname) =>
      (['new', 'dismissed'] as FullTourState[]).every((fullTour) => autoTour({ ...base, pathname, fullTour, newAccount: false }) === null)))
  check('B5: nothing starts before the project list is known', autoTour({ ...base, projectsResolved: false }) === null)
  check('B6: the full tour is not started away from the dashboard', autoTour({ ...base, pathname: '/keywords' }) === null)
  const after = { ...base, fullTour: 'dismissed' as FullTourState }
  const screen = autoTour({ ...after, pathname: '/keywords' })
  check('B7: once the full tour is over, a screen\'s own tour starts the first time', screen?.kind === 'screen' && screen.screen === 'keywords')
  check('B8: …and never again once seen', autoTour({ ...after, pathname: '/keywords', screenSeen: (s: ScreenKey) => s === 'keywords' }) === null)
  check('B9: a screen without a tour starts nothing', autoTour({ ...after, pathname: '/billing' }) === null)

  const now = new Date('2026-09-28T12:00:00Z')
  check('B10: an account created 13 days ago is new, 15 days ago is not, an unknown date is not',
    isNewAccount('2026-09-15T13:00:00Z', now) && !isNewAccount('2026-09-13T11:00:00Z', now) && !isNewAccount(null, now) && !isNewAccount('nope', now))

  const noProject = tourSteps({ kind: 'full' }, false).map((s) => s.key)
  check('B11: with no project yet, the tour leaves out the dashboard card and keeps the switcher',
    !noProject.includes('hero') && noProject[0] === 'switcher' && noProject.includes('guide'))
  check('B11-MUT: with a project, the card is in', tourSteps({ kind: 'full' }, true).some((s) => s.key === 'hero'))
}

// ── C) per-user state ─────────────────────────────────────────────────────────
console.log('\nC) per-user state')
{
  check('C1: keys carry the user id', fullTourKey('u1').endsWith('_u1') && screenTourKey('u1', 'keywords').endsWith('_keywords_u1') && fullTourKey('u1') !== fullTourKey('u2'))
  check('C2: the full tour\'s key is the three-step tour\'s key, so its "done" carries over',
    fullTourKey('u1') === 'rankings_dashboard_onboarding_completed_u1' && readFullTourState('true') === 'completed')
  check('C3: states read back', readFullTourState(null) === 'new' && readFullTourState('dismissed') === 'dismissed' && readFullTourState('completed') === 'completed' && readFullTourState('junk') === 'new')
  check('C4: the dot shows until a tour is finished (skipping keeps it)', showGuideDot('new') && showGuideDot('dismissed') && !showGuideDot('completed'))
  const guide = code('components/guide/GuideMenu.tsx')
  const keepsFinished = (src: string) => /how === 'completed' \|\| fullState === 'completed' \? 'completed' : 'dismissed'/.test(src)
  check('C5: a later skip never undoes a finished tour', keepsFinished(guide))
  check('C5-MUT: writing the last answer blindly fails C5', !keepsFinished(guide.replace("|| fullState === 'completed' ", '')))
  const guarded = (src: string) => /try \{ return localStorage\.getItem\(key\) \} catch \{ return null \}/.test(src)
    && /try \{\s*if \(value === null\) localStorage\.removeItem\(key\)\s*else localStorage\.setItem\(key, value\)\s*\} catch/.test(src)
    && (src.match(/localStorage\./g) ?? []).length === 3
  check('C6: storage is read and written only through the guarded helpers (private mode)', guarded(guide))
  check('C6-MUT: a bare localStorage write elsewhere fails C6', !guarded(guide + "\nlocalStorage.setItem('x', 'y')"))
}

// ── D) placement ──────────────────────────────────────────────────────────────
console.log('\nD) where the bubble goes')
{
  const vp = { width: 1440, height: 900 }
  const railRtl: Box = { left: 1196, top: 182, width: 232, height: 36 }   // a sidebar entry, Hebrew (rail on the right)
  const railLtr: Box = { left: 12, top: 182, width: 232, height: 36 }     // the same, English
  const inside = (p: ReturnType<typeof placeBubble>, h: number) =>
    p.mode === 'anchored' && p.left >= 16 && p.left + p.width <= vp.width - 16 && p.top >= 16 && p.top + h <= vp.height - 16
  const rtl = placeBubble(railRtl, 220, vp, 'rtl', true)
  check('D1: Hebrew — beside a sidebar entry, to its LEFT', rtl.mode === 'anchored' && rtl.side === 'beside' && rtl.left + rtl.width <= railRtl.left, JSON.stringify(rtl))
  const ltr = placeBubble(railLtr, 220, vp, 'ltr', true)
  check('D2: English — beside it, to its RIGHT', ltr.mode === 'anchored' && ltr.side === 'beside' && ltr.left >= railLtr.left + railLtr.width, JSON.stringify(ltr))
  check('D3: both inside the viewport', inside(rtl, 220) && inside(ltr, 220))
  const topBar: Box = { left: 946, top: 10, width: 205, height: 36 }
  const under = placeBubble(topBar, 220, vp, 'rtl', false)
  check('D4: a top-bar control gets the bubble under it, aligned to its start (right) edge',
    under.mode === 'anchored' && under.side === 'below' && under.top > topBar.top + topBar.height && Math.abs(under.left + under.width - (topBar.left + topBar.width)) < 1, JSON.stringify(under))
  const low: Box = { left: 300, top: 820, width: 400, height: 50 }
  const above = placeBubble(low, 220, vp, 'ltr', false)
  check('D5: a target near the bottom gets the bubble above it', above.mode === 'anchored' && above.side === 'above' && above.top + 220 <= low.top)
  check('D6: a hidden target on desktop: centred', placeBubble(null, 220, vp, 'rtl').mode === 'center')
  const phone = { width: 390, height: 844 }
  const sheet = placeBubble({ left: 200, top: 70, width: 170, height: 36 }, 230, phone, 'rtl')
  check('D7: a phone gets a sheet at the bottom', sheet.mode === 'sheet' && sheet.edge === 'bottom')
  const sheetTop = placeBubble({ left: 20, top: 700, width: 350, height: 60 }, 230, phone, 'rtl')
  check('D8: …at the top when the target is down where the sheet would be', sheetTop.mode === 'sheet' && sheetTop.edge === 'top')
  check('D8-MUT: the same target higher up keeps the sheet at the bottom',
    (() => { const p = placeBubble({ left: 20, top: 300, width: 350, height: 60 }, 230, phone, 'rtl'); return p.mode === 'sheet' && p.edge === 'bottom' })())
  check('D9: the bubble is 320px wide, as the review specifies', BUBBLE_WIDTH === 320)
}

// ── E) wiring ─────────────────────────────────────────────────────────────────
console.log('\nE) one tour system, mounted once from the pill in the top bar')
{
  const layout = code('app/(dashboard)/layout.tsx')
  const mounted = (src: string) => /<WorkspaceSwitcher \/>\s*<GuideMenu userId=\{user\.id\} accountCreatedAt=\{user\.created_at \?\? null\} \/>/.test(src)
  check('E1: the pill sits right after the switcher in the top bar (left of it in Hebrew)', mounted(layout))
  check('E1-MUT: a pill mounted elsewhere fails E1', !mounted(layout.replace(/<GuideMenu [^>]*\/>/, '')))
  const dash = code('app/(dashboard)/dashboard/page.tsx')
  check('E2: the dashboard no longer mounts a tour of its own (one runner, from the pill)', !/DashboardOnboardingTour/.test(dash))
  const guide = code('components/guide/GuideMenu.tsx')
  check('E3: the pill is labelled, uses the Compass icon, and is the tour\'s last stop',
    /data-tour="guide"/.test(guide) && /<Compass /.test(guide) && /aria-label=\{t\.label\}/.test(guide) && /aria-haspopup="menu"/.test(guide))
  check('E4: the menu offers the four entries in the review\'s order',
    (() => { const i = [guide.indexOf('{t.fullTour}'), guide.indexOf('{t.screenTour}'), guide.indexOf('{t.faq}</span>'), guide.indexOf('{t.whatsapp}')]; return i.every((n) => n > 0) && i.every((n, k) => k === 0 || n > i[k - 1]) })())
  const oneNumber = (src: string) => /import \{ WHATSAPP_NUMBER \} from '@\/components\/public\/contact'/.test(src) && !/wa\.me\/\d/.test(src) && !/972\d{6,}/.test(src)
  check('E5: WhatsApp uses the one contact source, never a typed-in number', oneNumber(guide))
  check('E5-MUT: a hard-coded number fails E5', !oneNumber(guide.replace('`https://wa.me/${WHATSAPP_NUMBER}', '`https://wa.me/972549489377')))
  check('E6: the AI-tips slot exists, renders nothing, and sits under WhatsApp',
    /const AI_TIPS_SLOT: React\.ReactNode = null/.test(guide) && guide.indexOf('{AI_TIPS_SLOT}') > guide.indexOf('{t.whatsapp}'))
  check('E7: the menu is a keyboard menu (arrows, Home/End, Escape back to the pill)',
    /e\.key === 'ArrowDown'/.test(guide) && /e\.key === 'ArrowUp'/.test(guide) && /e\.key === 'Home'/.test(guide) && /e\.key === 'Escape'\) \{ e\.preventDefault\(\); e\.stopPropagation\(\); closeToPill\(\)/.test(guide))
  const runner = code('components/onboarding/DashboardOnboardingTour.tsx')
  const keyboard = (src: string) => /e\.key === 'Escape'\) \{ e\.preventDefault\(\); end\('dismissed'\)/.test(src)
    && /const forward = dir === 'rtl' \? 'ArrowLeft' : 'ArrowRight'/.test(src) && /e\.key === 'Tab'/.test(src)
  check('E8: the tour: Escape dismisses, the forward arrow follows the reading direction, Tab is kept inside', keyboard(runner))
  check('E8-MUT: a tour whose "next" arrow ignores the direction fails E8', !keyboard(runner.replace("dir === 'rtl' ? 'ArrowLeft' : 'ArrowRight'", "'ArrowRight'")))
  check('E9: the tour is a labelled modal dialog, rendered above the page',
    /role="dialog"/.test(runner) && /aria-modal="true"/.test(runner) && /aria-labelledby=\{titleId\}/.test(runner) && /createPortal\(/.test(runner))
  check('E10: focus goes to the main button per step, and back where it was at the end',
    /primaryRef\.current\?\.focus/.test(runner) && /returnFocus\.focus\(/.test(runner))
  check('E11: a step whose target is missing is skipped, never pointed at thin air',
    /setSkipped\(\(s\) => new Set\(s\)\.add\(index\)\)/.test(runner))
  const header = code('components/layout/Header.tsx')
  check('E12: every screen header carries the tour anchors', /data-tour="screen-header"/.test(header) && /data-tour="screen-actions"/.test(header))
  const tokens = (src: string) => !/\b(?:bg|text|border|ring)-(?:slate|blue|indigo|gray|emerald)-\d/.test(src)
  check('E13: the pill, the menu and the tour use the design tokens, not raw palette colours', tokens(guide) && tokens(runner))
  check('E13-MUT: a raw slate colour fails E13', !tokens(runner + ' text-slate-600'))
}

// ── F) the answers stay true ──────────────────────────────────────────────────
console.log('\nF) every answer names something this build has')
{
  const guide = code('components/guide/GuideMenu.tsx')
  const gated = (src: string) => /if \(process\.env\.NEXT_PUBLIC_ENABLE_AI_VISIBILITY === 'true'\) keys\.push\('ai'\)/.test(src)
    && /if \(process\.env\.NEXT_PUBLIC_ENABLE_CONTENT === 'true'\) keys\.push\('publishing'\)/.test(src)
  check('F1: the AI-visibility and publishing answers show only with their feature flags', gated(guide))
  check('F1-MUT: an always-on AI answer fails F1', !gated(guide.replace("if (process.env.NEXT_PUBLIC_ENABLE_AI_VISIBILITY === 'true') keys.push('ai')", "keys.push('ai')")))
  check('F2: the check-schedule answer says "monthly" because monthly is the one automatic schedule',
    (VALID_SCAN_FREQUENCIES as readonly string[]).includes('monthly') && !(VALID_SCAN_FREQUENCIES as readonly string[]).includes('weekly')
    && /חודשית/.test(dashboardHe.guide.faqItems.rankings.a) && /monthly/.test(dashboardEn.guide.faqItems.rankings.a))
  const types = strip(readFileSync(join(ROOT, 'lib/supabase/types.ts'), 'utf8'))
  check('F3: "ChatGPT" is named only because it is one of the engines checked', /\|\s*'chatgpt'/.test(types))
  check('F4: the AI step says "mentions", not "recommends" (the product measures mentions and citations)',
    !/ממליץ/.test(JSON.stringify(dashboardHe.guide)) && !/recommend/i.test(JSON.stringify(dashboardEn.guide)))
  const tours = code('lib/guide/tours.ts')
  check('F5: the strategy and AI steps point at sidebar entries that exist only with their flags (skipped otherwise)',
    /navTarget\(CONTENT_STRATEGY_PATH\)/.test(tours) && /navTarget\('\/ai-visibility'\)/.test(tours))
  check('F6: both languages answer the same questions',
    Object.keys(dashboardHe.guide.faqItems).join(',') === Object.keys(dashboardEn.guide.faqItems).join(',')
    && Object.keys(dashboardHe.guide.steps).join(',') === Object.keys(dashboardEn.guide.steps).join(','))
}

console.log(`\n${pass} passed, ${fail} failed`)
if (fail > 0) process.exit(1)

export {}
