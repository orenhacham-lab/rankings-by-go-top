/**
 * WAVE 8, app UI (UX decisions A and C): every rule below has a mutation control.
 *
 *   A  Links tab ("קישורים לאתר"): one page that opens on the link network's state in
 *      words. A blue hero (the shared HeroPanel) per state: on / on but not placing yet /
 *      off / cannot join yet (switch disabled, "connect the site") / left; the switch
 *      has a visible state word; links received, given and waiting ("—" with "counts
 *      start when you turn it on" before joining). Shopify or no network: no switch,
 *      the outreach hero (says why for Shopify only). The outreach list says it is
 *      manual and not the network; its progress is one header line; competitors are
 *      out of the list with one caption; the "כל קישור מאתר אמיתי…" card is gone; the
 *      Google-policy note no longer contradicts the network. Server rules untouched.
 *   A7 Existing content: the same HeroPanel, same data, no new fetch; the risk figure
 *      filters the list; without Search Console, a footer with the connect button.
 *   C  Top bar: "צרו קשר" between the switcher and the Guide, WhatsApp / phone / email
 *      from the one contact source, icon-only on a phone, hidden for admins.
 *
 * Run: npx tsx lib/__qa__/w8-app-ui.qa.ts
 */
/* eslint-disable @typescript-eslint/no-require-imports, @typescript-eslint/no-explicit-any */
const { readFileSync, existsSync } = require('fs') as typeof import('fs')
const { join, resolve } = require('path') as typeof import('path')
const { createElement } = require('react') as { createElement: (...a: any[]) => any }
const { renderToStaticMarkup } = require('react-dom/server') as typeof import('react-dom/server')
const { DashboardLanguageProvider } = require('../i18n/dashboard/useDashboardLanguage')
const { getDashboardDictionary } = require('../i18n/dashboard/getDashboardDictionary')

let pass = 0, fail = 0
function check(name: string, cond: boolean, detail?: string) {
  if (cond) { pass++; console.log(`  ✓ ${name}`) } else { fail++; console.log(`  ✗ ${name}${detail ? ` — ${detail}` : ''}`) }
}
const ROOT = resolve(__dirname, '..', '..')
const read = (p: string) => readFileSync(join(ROOT, p), 'utf8')
const strip = (s: string) => s.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\{\/\*[\s\S]*?\*\/\}/g, '').replace(/(^|[^:'"`\\])\/\/.*$/gm, '$1')
type Locale = 'he' | 'en'
const render = (locale: Locale, node: unknown) => renderToStaticMarkup(createElement(DashboardLanguageProvider, { initialLocale: locale, children: node }) as never)
const text = (html: string) => html.replace(/<[^>]+>/g, ' ').replace(/&#x27;/g, '\'').replace(/&quot;/g, '"').replace(/&amp;/g, '&').replace(/\s+/g, ' ')
const he = getDashboardDictionary('he')
const en = getDashboardDictionary('en')
;(globalThis as any).fetch = async () => { throw new Error('no fetch during a render') }

// ── A. the Links tab ───────────────────────────────────────────────────────
console.log('\nA) Links tab: the network\'s state first, in words')
{
  const NetworkPanel: any = require('../../components/site-links/network/NetworkPanel').default
  const { networkState } = require('../../components/site-links/network/NetworkPanel')
  const { readNetwork } = require('../../components/site-links/network/SiteLinksScreen')
  const PID = 'a1111111-2222-3333-4444-555555555555'
  const item = (state: string) => ({ id: `p-${state}`, state, anchor: 'x', targetUrl: 'https://a.co.il/', placedAt: '2026-09-20T00:00:00Z', liveUrl: null, context: null, sourceDomain: null })
  const base = {
    ok: true, available: true, memberCount: 46, linkRel: 'follow', consentVersion: 'v1',
    membership: { active: false, since: null, leftAt: null }, readiness: 'ready',
    caps: { receivedThisMonth: 1, receivedCap: 2, givenThisMonth: 1, givenCap: 4, perArticle: 1 },
    totals: { received: 0, given: 0 }, received: [], given: [],
  }
  const on = { ...base, membership: { active: true, since: '2026-09-15T00:00:00Z', leftAt: null }, totals: { received: 1, given: 2 },
    received: [item('published')], given: [{ ...item('published'), articleId: 'a', articleTitle: 't', targetDomain: 'a.co.il', canReject: false }, { ...item('waiting'), id: 'g2', articleId: 'b', articleTitle: 't2', targetDomain: 'a.co.il', canReject: true }] }
  const draw = (data: any, locale: Locale = 'he') => render(locale, createElement(NetworkPanel, { projectId: PID, data, onChanged() {} }))
  const stateOf = (html: string) => (html.match(/data-network-state="(\w+)"/) ?? [])[1]
  const h = he.siteLinks.network

  check('A1: the five states map from membership and readiness',
    networkState(on) === 'on' && networkState({ ...on, readiness: 'thin_or_new' }) === 'not_placing' && networkState(base) === 'off'
    && networkState({ ...base, readiness: 'domain_unverified' }) === 'cannot_join' && networkState({ ...base, membership: { active: false, since: null, leftAt: '2026-09-01T00:00:00Z' } }) === 'left')
  const src = strip(read('components/site-links/network/NetworkPanel.tsx'))
  check('A1-MUT: a member always "on" (readiness ignored) is caught', !/data\.readiness === 'ready' \? 'on' : 'not_placing'/.test(src.replace("data.readiness === 'ready' ? 'on' : 'not_placing'", "'on'")) && /data\.readiness === 'ready' \? 'on' : 'not_placing'/.test(src))

  const onHtml = draw(on), onText = text(onHtml)
  check('A2a on: the hero is the shared HeroPanel, badge "פעיל", headline and body in words', stateOf(onHtml) === 'on' && /bg-contrast/.test(onHtml)
    && onText.includes(h.hero.badge.on) && onText.includes('רשת הקישורים פעילה לאתר שלכם') && onText.includes('אף פעם לא הדדי, אף פעם לא מתחרה'))
  const word = (html: string) => (html.match(/data-link-network-state-word=""[^>]*>([^<]*)</) ?? [])[1]
  check('A2a on: the switch is on with its state word beside it ("פעיל")', /role="switch" aria-checked="true"/.test(onHtml) && word(onHtml) === 'פעיל')
  check('A2-MUT: a switch without its state word is caught', word(onHtml.replace(/(data-link-network-state-word=""[^>]*>)[^<]*</, '$1<')) !== 'פעיל')
  const figures = (html: string) => [...html.matchAll(/data-hero-stat=""[\s\S]*?<p class="mt-2[^"]*">([\s\S]*?)<\/p>/g)].map((m) => text(m[1]).trim())
  check('A2a on: received 1, given 2, waiting 1 (the waiting count is both sides)', figures(onHtml).join() === '1,2,1', figures(onHtml).join())
  check('A2a on: the labels are "קישורים שקיבלתם", "קישורים שנתתם", "ממתינים לפרסום"', ['קישורים שקיבלתם', 'קישורים שנתתם', 'ממתינים לפרסום'].every((l) => onText.includes(l)))
  check('A2a on: the caps line is the hero\'s footer', /data-link-network="caps"/.test(onHtml))

  const np = draw({ ...on, readiness: 'category_unknown' })
  check('A2b on, not placing: its own badge and headline, the readiness sentence, and the settings step',
    stateOf(np) === 'not_placing' && text(np).includes('פעיל, שיבוצים מושהים') && text(np).includes('האתר ברשת, אבל כרגע לא משובצים בו קישורים חדשים')
    && text(np).includes(h.readiness.category_unknown) && /href="\/settings\?projectId=[^"]*#business"/.test(np) && text(np).includes('להשלמת תחום העסק'))

  const off = draw(base), offText = text(off)
  check('A2c off: badge "כבוי", headline, the member count in the body, the turn-on button', stateOf(off) === 'off' && offText.includes('רשת הקישורים כבויה לאתר הזה')
    && offText.includes('46 אתרים כבר ברשת') && /data-link-network-turn-on=""/.test(off) && offText.includes('הפעלת רשת הקישורים'))
  check('A2c off: the switch mirrors the state ("כבוי") and is enabled', /role="switch" aria-checked="false"/.test(off) && !/role="switch"[^>]*disabled=""/.test(off) && word(off) === 'כבוי')
  check('A2c off: figures read "—" with "יתחיל להיספר כשתפעילו", not zeros', figures(off).every((f) => f === '—') && offText.includes('יתחיל להיספר כשתפעילו'))
  check('A2-MUT: zeros before joining are caught', !figures(off.replace(/>—</g, '>0<')).every((f) => f === '—'))

  const cannot = draw({ ...base, readiness: 'domain_unverified' }), cannotText = text(cannot)
  check('A2d cannot join: "לא זמין עדיין", the proof headline, the switch disabled, "חיבור האתר" to the connection settings',
    stateOf(cannot) === 'cannot_join' && cannotText.includes('לא זמין עדיין') && cannotText.includes('כדי להצטרף לרשת, צריך לאשר שהאתר שייך לכם')
    && /role="switch"[^>]*disabled=""/.test(cannot) && /href="\/settings\?projectId=[^"]*#platform"/.test(cannot) && !/data-link-network-turn-on/.test(cannot))
  const left = draw({ ...base, membership: { active: false, since: null, leftAt: '2026-09-01T00:00:00Z' } })
  check('A2e left: the off headline, "יצאתם מהרשת ב-…", and the turn-on button', stateOf(left) === 'left' && text(left).includes('רשת הקישורים כבויה לאתר הזה') && text(left).includes('יצאתם מהרשת ב-') && /data-link-network-turn-on/.test(left))
  const enOn = text(draw(on, 'en'))
  check('A2 English: the same states in English', enOn.includes('The link network is on for your site') && enOn.includes('Waiting to go live') && !/[א-ת]/.test(enOn))

  check('A2f: a hidden answer is read with its reason (shopify says so, anything else is "off")',
    (readNetwork({ ok: true, available: false, reason: 'shopify' }) as any).reason === 'shopify' && (readNetwork({ ok: true, available: false }) as any).reason === 'off'
    && (readNetwork(null) as any).reason === 'off' && (readNetwork({ ...on }) as any).data?.available === true)
  const view = strip(read('components/site-links/SiteLinksView.tsx'))
  const outreachOk = (s: string) => /reason === 'shopify' && <p[^>]*data-site-links="shopify-note">\{h\.shopify\}<\/p>/.test(s) && /h\.title\(total\)/.test(s)
  check('A2f: the outreach hero says why only for Shopify', outreachOk(view))
  check('A2f-MUT: the Shopify note shown for every hidden network is caught', !outreachOk(view.replace("reason === 'shopify' && <p", 'true && <p')))
  check('A2f copy: both languages', he.siteLinks.outreachHero.shopify.startsWith('רשת הקישורים בין לקוחות לא זמינה לחנויות Shopify')
    && en.siteLinks.outreachHero.shopify.startsWith('The customer link network is not available for Shopify stores') && he.siteLinks.outreachHero.title(11) === '11 אתרים שכדאי שיקשרו אליכם')

  // A3: competitors out of the list, one caption.
  const filtered = (s: string) => /const items = useMemo\(\(\) => all\.filter\(\(o\) => !o\.isCompetitor\), \[all\]\)/.test(s) && /const competitorsLeftOut = all\.length - items\.length/.test(s)
    && /o\.competitorsHidden\(competitorsLeftOut\)/.test(s)
  check('A3: competitors are filtered out of the list and counted for one caption', filtered(view))
  check('A3-MUT: the list with competitors again is caught', !filtered(view.replace('all.filter((o) => !o.isCompetitor)', 'all')))
  const list = strip(read('components/site-links/OpportunityList.tsx'))
  check('A3: no competitor badge or note left in the row', !/isCompetitor|competitorNote|CompetitorIcon/.test(list) && !('competitorNote' in he.siteLinks.opportunities) && !('competitor' in he.siteLinks.opportunities))
  check('A3 copy: the caption in both languages', he.siteLinks.opportunities.competitorsHidden(3).startsWith('3 אתרים של מתחרים הופיעו באותם חיפושים, ולכן הם לא ברשימה.')
    && en.siteLinks.opportunities.competitorsHidden(3).startsWith('3 competitor sites showed up in the same searches, so they are left out.'))

  // A4: the header replaces the progress card; the old sentence is gone everywhere.
  check('A4: ProgressCard is gone and nothing imports it', !existsSync(join(ROOT, 'components/site-links/ProgressCard.tsx')) && !/ProgressCard/.test(view))
  const oldSentence = /כל קישור מאתר אמיתי שבחר בכם/
  check('A4: "כל קישור מאתר אמיתי…" is nowhere in the dictionaries', !oldSentence.test(read('lib/i18n/dashboard/he.ts')) && !/Every link from a real site that chose you/.test(read('lib/i18n/dashboard/en.ts')))
  check('A4-MUT: the sentence back in he is caught', oldSentence.test(read('lib/i18n/dashboard/he.ts') + "'כל קישור מאתר אמיתי שבחר בכם'"))
  check('A4 copy: the outreach is manual, not the network (both languages)', he.siteLinks.opportunities.description.endsWith('אליהם פונים בעצמכם, הם לא חלק מרשת הקישורים.')
    && en.siteLinks.opportunities.description.endsWith('You contact these yourself; they are not part of the link network.'))
  check('A4 copy: the progress line and the browser-only caption', he.siteLinks.opportunities.progress(3, 11, 2) === 'פניתם ל-3 מתוך 11 · קיבלתם 2 קישורים'
    && en.siteLinks.opportunities.progress(3, 11, 2) === 'Contacted 3 of 11 · 2 links received' && he.siteLinks.opportunities.savedHere === 'הסימונים נשמרים רק בדפדפן הזה.')
  const meter = (s: string) => /\{items\.length > 0 && <OutreachMeter /.test(s) && s.indexOf('<SectionHeading title={o.title}') < s.indexOf('<OutreachMeter')
  check('A4: the progress line sits in the list\'s header, right under its description', meter(view))
  check('A4-MUT: no progress line is caught', !meter(view.replace('{items.length > 0 && <OutreachMeter ', '{false && <Nothing ')))

  // A5, A6: copy that does not contradict the network.
  check('A5: the policy note, both languages', he.siteLinks.policy.body.startsWith('אל תשלמו על קישור ואל תסכימו ל"קישור תמורת קישור".') && en.siteLinks.policy.body.startsWith('Don\'t pay for links and don\'t agree to "a link for a link".'))
  check('A6: the page subtitle names the network, both languages', he.siteLinks.subtitle.includes('רשת הקישורים של Go Top') && en.siteLinks.subtitle.includes('the Go Top link network'))

  // A1: how it works folds away for a member; the tabs are gone.
  const NetworkHow: any = require('../../components/site-links/network/NetworkHow').default
  const howOn = render('he', createElement(NetworkHow, { member: true })), howOff = render('he', createElement(NetworkHow, { member: false }))
  check('A1: how-it-works is open when off and one folded line when on', /<details[^>]*data-folded="yes"/.test(howOn) && text(howOn).includes('איך זה עובד והכללים ששומרים עליכם') && !/<details/.test(howOff))
  check('A1: the tab switch copy is gone', !('tabs' in he.siteLinks.network) && !('tabs' in en.siteLinks.network))

  // Server logic untouched: the only change to the routes' module is the hidden answer's reason.
  const http = strip(read('lib/link-network/http.ts'))
  check('A-server: consent, domain proof and Shopify refusals still in the routes', /if \(body\.consent !== true \|\| body\.consentVersion !== LINK_NETWORK_CONSENT_VERSION\) return refuse\(400, 'consent_required'\)/.test(http)
    && /=== 'domain_unverified'\) return refuse\(409, 'domain_unverified'\)/.test(http) && /if \(!me \|\| me\.site\.shopify\) return refuse\(409, 'unavailable'\)/.test(http))
}

// ── A7. existing content ───────────────────────────────────────────────────
console.log('\nA7) Existing content: the hero every tab has')
{
  const SiteSummary: any = require('../../components/content/workspace/existing/SiteSummary').default
  const payload = (over: Record<string, any> = {}) => ({
    counts: { all: 14, product: 0, article: 4, page: 10, category: 0 },
    map: { capped: false, state: 'done', phase: null, found: 14, docsRead: 0, docsSeen: 0 },
    sources: { map: 14, shopify: 0, wordpress: 0, crawl: 0, gsc: 0 }, indexedAt: '2026-09-27T08:00:00Z',
    gsc: { state: 'ok' }, insights: { withClicks: 9, seenNoClicks: 2, actionable: 6 }, riskCount: 3, ...over,
  })
  const draw = (data: any, risk = false) => render('he', createElement(SiteSummary, {
    x: he.existingContent, data, tab: 'all', risk, onRisk() {}, num: new Intl.NumberFormat('he-IL'), day: () => '27.09.2026',
    refresh: { show: true, busy: false, onClick() {} }, projectId: 'a1111111-2222-3333-4444-555555555555',
  }))
  const gsc = draw(payload()), gt = text(gsc)
  check('A7a: a HeroPanel (dark context card), not the light card', /data-existing-hero=""/.test(gsc) && /bg-contrast/.test(gsc) && !/rounded-card border border-line bg-surface/.test(gsc))
  check('A7a: badge "עודכן 27.09.2026", headline with Search Console', gt.includes('עודכן 27.09.2026') && gt.includes('14 עמודים באתר, 9 מהם מביאים קליקים מגוגל'))
  check('A7a: the four figures, the risk figure a button that filters', ['מביאים קליקים', 'מופיעים בלי קליקים', 'עם הזדמנות ברורה', 'מתחרים זה בזה'].every((l) => gt.includes(l))
    && /<button type="button" aria-pressed="false"[^>]*data-existing-risk=""/.test(gsc) && /aria-pressed="true"[^>]*data-existing-risk/.test(draw(payload(), true)))
  const noRisk = draw(payload({ riskCount: 0 }))
  check('A7a: no risk figure when there is none', !/data-existing-risk/.test(noRisk) && !text(noRisk).includes('מתחרים זה בזה'))
  check('A7a: the refresh is an inverse button at the top end; no kind filter buttons in the hero', /data-existing-refresh=""/.test(gsc) && /border-contrast-ink\/25/.test(gsc) && !/data-kind-count/.test(gsc))
  check('A7a: the kinds as a contrast bar with a legend', /data-distribution=""/.test(gsc) && /bg-contrast-ink\/10/.test(gsc) && gt.includes('מאמרים 4') && gt.includes('עמודים 10'))
  const none = draw(payload({ gsc: { state: 'not_connected' } })), nt = text(none)
  check('A7b: without Search Console: "14 עמודים באתר", one figure per kind, the footer and its button', nt.includes('14 עמודים באתר') && !nt.includes('מביאים קליקים מגוגל')
    && [...none.matchAll(/data-kind-count="(\w+)"/g)].map((m) => m[1]).join() === 'article,page'
    && /data-existing-hero-footer=""/.test(none) && nt.includes(he.existingContent.insightsNoGsc) && /href="\/settings\?projectId=[^"]*#search-console"/.test(none) && nt.includes('חיבור Search Console'))
  const capped = text(draw(payload({ gsc: { state: 'not_connected' }, map: { capped: true, state: 'done', phase: null, found: 14, docsRead: 0, docsSeen: 0 } })))
  check('A7b: capped reads "לפחות 14 עמודים באתר"', capped.includes('לפחות 14 עמודים באתר'))
  const mapping = draw(payload({ map: { capped: false, state: 'running', phase: 'sitemaps', found: 40, docsRead: 1, docsSeen: 3 } }))
  check('A7c: while mapping: a live badge "ממפים את האתר…" and the progress in the hero footer', text(mapping).includes('ממפים את האתר…') && /dot-ping/.test(mapping) && /data-existing-mapping=""[^>]*border-contrast-ink\/10/.test(mapping))
  check('A7-MUT: the old light card is caught', /rounded-card border border-line bg-surface/.test('<div class="rounded-card border border-line bg-surface">'))
  const summarySrc = strip(read('components/content/workspace/existing/SiteSummary.tsx'))
  const shared = (s: string) => /import HeroPanel, \{ HERO_INVERSE_BUTTON, HeroBadge, HeroStat \} from '@\/components\/ui\/HeroPanel'/.test(s) && /<HeroPanel data-existing-hero="">/.test(s) && !/fetch\(/.test(s)
  check('A7: the shared hero primitive (same as the other tabs), and no new fetch', shared(summarySrc))
  check('A7-MUT: a hand-made hero or a fetch is caught', !shared(summarySrc.replace('<HeroPanel data-existing-hero="">', '<section>')) && !shared(summarySrc + "\nfetch('/api/x')"))
  check('A7 copy: both languages', en.existingContent.hero.headlineGsc === '{total} pages on the site, {withClicks} bring clicks from Google' && he.existingContent.hero.connectGsc === 'חיבור Search Console')
}

// ── C. the contact button ──────────────────────────────────────────────────
console.log('\nC) "צרו קשר" in the top bar')
{
  const layout = strip(read('app/(dashboard)/layout.tsx'))
  const mounted = (s: string) => /<WorkspaceSwitcher \/>\s*\{!isAdmin && <ContactMenu \/>\}\s*<GuideMenu /.test(s)
  check('C1: between the switcher and the Guide, for customers only', mounted(layout))
  check('C1-MUT: shown to admins too is caught', !mounted(layout.replace('{!isAdmin && <ContactMenu />}', '<ContactMenu />')))
  const menu = strip(read('components/guide/ContactMenu.tsx'))
  const oneSource = (s: string) => /from '@\/components\/public\/contact'/.test(s) && /href: PHONE_TEL/.test(s) && /href: EMAIL_HREF/.test(s) && /whatsappHelpUrl\(t\.whatsappMessage\(domain\)\)/.test(s)
    && !/972\d{6,}|0549489377|054-9489377|oren@gotop/.test(s)
  check('C2: WhatsApp, phone and email from the one contact source (no number typed here)', oneSource(menu))
  check('C2-MUT: a hard-coded number is caught', !oneSource(menu.replace('href: PHONE_TEL', "href: 'tel:+972549489377'")))
  const contact = require('../../components/public/contact')
  check('C2: the constants are the existing number and address', contact.PHONE_TEL === 'tel:+972549489377' && contact.EMAIL_HREF === 'mailto:oren@gotop.co.il'
    && contact.whatsappHelpUrl('היי') === `https://wa.me/972549489377?text=${encodeURIComponent('היי')}`)
  const ContactMenu: any = require('../../components/guide/ContactMenu').default
  const pill = render('he', createElement(ContactMenu))
  check('C3: a labelled pill that opens a menu; icon-only below sm (390)', /aria-haspopup="menu"/.test(pill) && /aria-label="צרו קשר"/.test(pill) && /<span class="hidden sm:inline">צרו קשר<\/span>/.test(pill) && /<svg/.test(pill))
  check('C3-MUT: a label that always shows (no room at 390) is caught', !/<span class="hidden sm:inline">/.test(pill.replace('hidden sm:inline', 'inline')))
  const menuOk = (s: string) => /role="menu"/.test(s) && /<a\s+key=\{r\.key\}\s+role="menuitem"/.test(s) && /rows\.map/.test(s) && !/\{t\.hours\}|data-contact-hours/.test(s)
  check('C4: one menu of rows (WhatsApp, phone, email) and no hours line (the owner shows none for now)', menuOk(menu) && /key: 'whatsapp'[\s\S]*key: 'phone'[\s\S]*key: 'email'/.test(menu))
  check('C4-MUT: an hours line put back is caught', !menuOk(menu.replace('</div>\n      )}', '<p>{t.hours}</p></div>\n      )}')))
  check('C5 copy: both languages, the site named in the WhatsApp message', he.contact.label === 'צרו קשר' && en.contact.label === 'Contact us'
    && he.contact.whatsappMessage('plumber-tlv.co.il') === 'היי, אני צריך עזרה עם plumber-tlv.co.il' && en.contact.whatsappMessage('a.co.il') === 'Hi, I need help with a.co.il'
    && he.contact.phone('054-9489377') === 'טלפון 054-9489377' && en.contact.email('oren@gotop.co.il') === 'Email oren@gotop.co.il' && !('hours' in he.contact) && !('hours' in en.contact))
  check('C5: the rail\'s WhatsApp row is kept', /data-support="whatsapp"/.test(read('components/layout/Sidebar.tsx')))
}

console.log(`\n${pass} passed, ${fail} failed`)
process.exit(fail ? 1 : 0)
export {}
