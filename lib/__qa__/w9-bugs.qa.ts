/**
 * WAVE 9, the owner's bug list (scratchpad/w9/asks.md), items of the w9-bugs job. Every rule has a
 * MUTATION CONTROL: the same check on a deliberately broken copy must fail.
 *
 *   A  settings: "לא הצלחנו לטעון את הגדרות העיצוב" — a read queued behind the page's other server
 *      actions is not a failure; one quiet retry for "unavailable"; real failures still say so
 *   B  article design: 2 inline images on the owner's real article structure (the step exists on
 *      every generation path, automation included)
 *   C  site health: the score counts applied fixes at once; a too-short title gets a valid fix;
 *      FAQ from the page (Hebrew forms, retry, builder pages) and recognised after it is added
 *   D  AI tab: which questions the monthly check takes, when and where; the admin sees it too
 *
 * Run: npx tsx lib/__qa__/w9-bugs.qa.ts
 */
/* eslint-disable @typescript-eslint/no-require-imports, @typescript-eslint/no-explicit-any */
const { readFileSync } = require('fs') as typeof import('fs')
const { join, resolve } = require('path') as typeof import('path')
const { createElement } = require('react') as { createElement: (...a: any[]) => any }
const { renderToStaticMarkup } = require('react-dom/server') as typeof import('react-dom/server')
const { DashboardLanguageProvider } = require('../i18n/dashboard/useDashboardLanguage')
const { getDashboardDictionary } = require('../i18n/dashboard/getDashboardDictionary')
const { withMutant } = require('../reminders/__qa__/_mutant') as typeof import('../reminders/__qa__/_mutant')
const { FakeAdmin } = require('./_fake-admin')

let pass = 0, fail = 0
function check(name: string, cond: boolean, detail?: unknown) {
  if (cond) { pass++; console.log(`  ✓ ${name}`) } else { fail++; console.log(`  ✗ ${name}${detail !== undefined ? ` — ${JSON.stringify(detail)}` : ''}`) }
}
const ROOT = resolve(__dirname, '..', '..')
const read = (p: string) => readFileSync(join(ROOT, p), 'utf8')
const strip = (s: string) => s.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\{\/\*[\s\S]*?\*\/\}/g, '').replace(/(^|[^:'"`\\])\/\/.*$/gm, '$1')
const text = (html: string) => html.replace(/<[^>]+>/g, ' ').replace(/&#x27;/g, '\'').replace(/&quot;/g, '"').replace(/&amp;/g, '&').replace(/\s+/g, ' ')
const sleep = (ms: number) => new Promise<void>((r) => setTimeout(r, ms))
;(globalThis as any).fetch = async () => { throw new Error('no network in this guard') }

/** Next.js runs a page's server actions one at a time: a tiny model of its queue. */
function actionQueue() {
  let tail: Promise<unknown> = Promise.resolve()
  return <T>(work: () => Promise<T>): Promise<T> => {
    const run = tail.then(work, work)
    tail = run.catch(() => undefined)
    return run
  }
}

async function main() {
  // ── A) the design settings load ───────────────────────────────────────────
  console.log('A) settings: the article-design read')
  {
    const L = await import('../../components/settings/article-settings-load')
    const ok = { ok: true as const, data: { v: 1 } }
    // The page queues the project-settings read (slow here), then the design read.
    const scenario = async (mod: typeof L, giveUpMs: number) => {
      const q = actionQueue()
      void q(() => sleep(120))
      return mod.readArticleSettings(() => q(async () => ok), { giveUpMs, retryMs: 1, sleep: async () => {} })
    }
    const res = await scenario(L, 1_000)
    check('A1: a read that waits behind another server action still loads (not "failed")', !!res && res.ok === true)
    const { withDeadline } = await import('../active-project/useProjectRow')
    const oldQ = actionQueue()
    void oldQ(() => sleep(120))
    const old = await withDeadline(oldQ(async () => ok), 80)
    check('A1-MUT: the old read (one try, a short clock counted from the queue, like 8 s) reads failed in the same queue', old === null)
    let calls = 0
    const flaky = await L.readArticleSettings(async () => (++calls === 1 ? { ok: false as const, code: 'unavailable' } : ok), { retryMs: 1 })
    check('A2: "unavailable" once is tried again quietly, and loads', !!flaky && flaky.ok && calls === 2)
    let gone = 0
    const notFound = await L.readArticleSettings(async () => { gone++; return { ok: false as const, code: 'not_found' } }, { retryMs: 1 })
    check('A3: a real answer ("not_found") is not retried: the retry button stays for real failures', !!notFound && !notFound.ok && gone === 1)
    let twice = 0
    const down = await L.readArticleSettings(async () => { twice++; return { ok: false as const, code: 'unavailable' } }, { retryMs: 1 })
    check('A4: failing twice is a failure (the friendly notice with "נסו שוב" shows)', !!down && !down.ok && twice === 2)
    await withMutant<typeof L, void>('components/settings/article-settings-load.ts', [["!res || (!res.ok && res.code === 'unavailable')", 'false']], async (M) => {
      let n = 0
      const r = await M.readArticleSettings(async () => (++n === 1 ? { ok: false as const, code: 'unavailable' } : ok), { retryMs: 1 })
      check('A2-MUT: without the retry the same flaky read reads failed', !!r && !r.ok)
    })
    const hook = strip(read('components/settings/useArticleSettings.ts'))
    check('A5: the hook reads through readArticleSettings, with no 8 s clock of its own', /readArticleSettings\(\(\) => loadArticleStyleAction\(projectId\)/.test(hook) && !/loadArticleStyleAction\(projectId\), 8_000/.test(hook))
    check('A5-MUT: the old call is caught', /loadArticleStyleAction\(projectId\), 8_000/.test('withDeadline(loadArticleStyleAction(projectId), 8_000)'))
    const page = strip(read('app/(dashboard)/settings/page.tsx'))
    check('A6: while it loads the card keeps its place (no blank, no failure)', /data-article-style="loading"/.test(page) && /motion-reduce:animate-none/.test(page))
  }

  // ── B) inline images on the owner's real article ─────────────────────────
  console.log('\nB) article design: inline images')
  {
    const { runArticleImageStep } = await import('../content/article-style/generation')
    // The structure of the owner's Japan article of 2026-09-30 (generated_articles 69b5dcfe…): nine
    // sections with a first paragraph, then the FAQ.
    const heads = ['למה כדאי לבחור מסלול הליכה ביפן?', 'איך לבחור את מסלול ההליכה המתאים לכם?', 'מסלולי הליכה מומלצים למתחילים ולמשפחות', 'מסלולי הליכה ביפן למטיבי לכת', 'השוואה בין מסלולי הליכה פופולריים', 'ציוד חיוני עבור מסלול הליכה ביפן', 'מתי הזמן הטוב ביותר לצאת לטרק ביפן?', 'טעויות נפוצות שכדאי להימנע מהן בתכנון מסלול הליכה', 'טיפים לניווט ותקשורת במסלולים']
    const html = `<p>פתיחה</p>${heads.map((h, i) => `<h2 id="section-${i + 1}">${h}</h2><p>פסקה ראשונה של החלק ${i + 1} עם מספיק מילים.</p>`).join('')}<h2 id="faq">שאלות נפוצות</h2><h3>שאלה?</h3><p>תשובה.</p>`
    const admin = new FakeAdmin({
      projects: [{ id: 'proj-jp', user_id: 'owner-1' }],
      generated_articles: [{ id: 'art-1', project_id: 'proj-jp', content_html: html }],
      article_inline_images: [],
      project_article_styles: [{ project_id: 'proj-jp', user_id: 'owner-1', inline_images: 2, design: 'formatted' }],
    })
    const made: string[] = []
    const r = await runArticleImageStep(admin as never, { articleId: 'art-1', projectId: 'proj-jp', ownerId: 'owner-1' }, {
      createFeaturedImage: async () => ({ featured_image_url: 'https://x/h.jpg' }) as never,
      generateInline: async (_a: unknown, id: string) => { made.push(id); return { ok: true, url: 'https://x/i.jpg' } as never },
      env: {},
    })
    const rows = admin.tables.article_inline_images as Array<Record<string, unknown>>
    check('B1: "2 images" on his article = two images in the body, first and last section, never the FAQ',
      r.inline.requested === 2 && rows.length === 2 && made.length === 2 && rows[0]?.section_id === 'section-1' && rows[1]?.section_id === 'section-9', rows.map((x) => x.section_id))
    const gen = strip(read('lib/content/article-generation.ts'))
    const item = strip(read('lib/content/automation/generate-item.ts'))
    const manual = strip(read('app/api/content/articles/generate/route.ts'))
    check('B2: automation and the manual button both generate through generateArticleForTopic, which runs the image step',
      /generateArticleForTopic\(/.test(item) && /generateArticleForTopic\(/.test(manual) && /runArticleImageStep\(/.test(gen))
    check('B2-MUT: an automation path that bypasses it is caught', !/generateArticleForTopic\(/.test(item.replace(/generateArticleForTopic\(/g, 'generateSomethingElse(')))
  }

  // ── C) site health ────────────────────────────────────────────────────────
  console.log('\nC) site health: score, short titles, FAQ')
  {
    const R = await import('../site-health/rules')
    const page = (n: number) => ({ url: `https://japan4u.co.il/p${n}/`, path: `/p${n}/`, kind: 'article', value: null, measure: null, fixable: true, adminUrl: null })
    const findings = [
      { id: 'title_long', severity: 'important', total: 12, pages: Array.from({ length: 12 }, (_, i) => page(i)) },
      { id: 'title_short', severity: 'minor', total: 21, pages: Array.from({ length: 21 }, (_, i) => page(100 + i)) },
      { id: 'images_alt', severity: 'important', total: 2, pages: [page(200), page(201)] },
      { id: 'faq_missing', severity: 'minor', total: 30, pages: Array.from({ length: 30 }, (_, i) => page(300 + i)) },
    ] as any[]
    const none = R.scoreWithFixes(findings, () => false)
    check('C1: nothing fixed = exactly the scan\'s score', none.score === R.scoreOf(findings) && none.fixedPages === 0, { none, scan: R.scoreOf(findings) })
    // His queue: 2 of the long titles and both pages with images missing alt text, applied.
    const applied = new Set([page(3).url, page(7).url, page(200).url, page(201).url])
    const after = R.scoreWithFixes(findings, (_f, p) => applied.has(p.url))
    check('C2: his 4 applied fixes raise the score at once (both alt-text pages clear the whole problem)', after.score > none.score && after.fixedPages === 4 && after.score - none.score === 7, { before: none.score, after: after.score })
    await withMutant<typeof R, void>('lib/site-health/rules.ts', [['lost += SEVERITY_POINTS[f.severity] * ((total - fixed) / total)', 'lost += SEVERITY_POINTS[f.severity]']], async (M) => {
      check('C2-MUT: counted per kind (the old rule), the same fixes do not move the score', M.scoreWithFixes(findings, (_f: any, p: any) => applied.has(p.url)).score === none.score)
    })
    const screen = strip(read('components/site-health/SiteHealthScreen.tsx'))
    check('C3: the screen scores with the queue\'s applied fixes and the owner\'s "fixed" marks, and hands it to the card',
      /scoreWithFixes\(findings, \(f, p\) => jobStateFor\(f, p\) === 'applied' \|\| fixed\.has\(fixKey\(f\.id, p\.url\)\)\)/.test(screen) && /live=\{live\}/.test(screen))
    const ScoreCard = (await import('../../components/site-health/ScoreCard')).default
    for (const locale of ['he', 'en'] as const) {
      const copy = getDashboardDictionary(locale).siteHealth
      const report = { score: none.score, findings, pagesChecked: 60, partial: false, scannedAt: '2026-09-30T10:00:00Z' } as any
      const html = renderToStaticMarkup(createElement(DashboardLanguageProvider, { initialLocale: locale, children: createElement(ScoreCard, { report, copy, domain: 'japan4u.co.il', checkedAt: 'x', fixableCount: 3, live: after }) }) as never)
      check(`C4 ${locale}: the ring shows the new score and says why ("${copy.score.afterFixes(7, 4)}")`, html.includes(`aria-valuenow="${after.score}"`) && text(html).includes(copy.score.afterFixes(7, 4)) && html.includes('data-site-health-gain="7"'))
      const plain = renderToStaticMarkup(createElement(DashboardLanguageProvider, { initialLocale: locale, children: createElement(ScoreCard, { report, copy, domain: 'japan4u.co.il', checkedAt: 'x', fixableCount: 3 }) }) as never)
      check(`C4-MUT ${locale}: without the live score the card shows the scan's number and no gain line`, plain.includes(`aria-valuenow="${none.score}"`) && !plain.includes('data-site-health-gain'))
      check(`C5 ${locale}: "how the score works" no longer says fixes wait for the next check`, !/however many pages|בלי קשר למספר העמודים/.test(copy.score.how))
    }

    // Too-short titles: his real pages read "טוקיו - Japan4U" (15 characters); the owner's rule is 50–60 with the keyword.
    const S = await import('../site-fix/suggest')
    const input = { kind: 'title_short', current: 'טוקיו - Japan4U', h1: 'טוקיו', siteName: 'Japan4U', keyword: 'טוקיו', path: '/tokyo/', text: 'טוקיו היא בירת יפן והעיר הגדולה בה. במדריך: שכונות, אטרקציות, אוכל ותחבורה בעיר.', description: null }
    // What the model typically answers: a few characters off the window, every one of them.
    const nearMisses = JSON.stringify({ titles: [
      'טוקיו: המדריך המלא לשכונות, אטרקציות, אוכל ותחבורה ציבורית | Japan4U',
      'מדריך טוקיו המלא: שכונות, אטרקציות, אוכל ותחבורה בעיר הבירה של יפן',
      'טוקיו – המדריך המלא לטיול בעיר הבירה',
    ] })
    const gen = async () => nearMisses
    const short = await S.suggestSeoTitle(input as any, gen)
    check('C6: near-miss model titles are fitted and one passes (50–60, the keyword, longer than now)', !!short && !R.titleProblem(short, input as any) && short.length >= 50 && short.length <= 60 && short.includes('טוקיו'), short)
    await withMutant<typeof S, void>('lib/site-fix/suggest.ts', [['for (const c of titleFits(raw, input)) if', 'for (const c of [raw]) if'], ['for (const c of titlesFromPage(input)) if (!titleProblem(c, input)) return c', '']], async (M) => {
      check('C6-MUT: judged as the model wrote them (the old code), none passes: no automatic fix', (await M.suggestSeoTitle(input as any, gen)) === null)
    })
    const noModel = await S.suggestSeoTitle({ ...input, description: 'טוקיו היא בירת יפן והעיר הגדולה בה, עם שכונות, אטרקציות ואוכל מעולה לכל טעם.' } as any, undefined)
    check('C7: with no model answer at all, the page\'s own description still gives a valid title', !!noModel && !R.titleProblem(noModel, input as any), noModel)

    // FAQ from the page, in Hebrew.
    const pageText = 'טיסות ליפן יוצאות מנתב"ג עם עצירה אחת בדרך כלל. מחיר כרטיס טיסה ליפן מתחיל בכ-1,500 דולר בעונה הזולה. הטיסה הישירה נמשכת כשתים עשרה שעות. כדאי להזמין כרטיסים שלושה חודשים מראש כדי למצוא מחיר טוב. חברות התעופה מציעות מזוודה אחת בכרטיס. ' .repeat(4)
    const answer = JSON.stringify({ items: [
      { q: 'כמה עולה טיסה ליפן?', a: 'מחיר הכרטיס מתחיל בכ-1500 דולר בעונה הזולה.' },
      { q: 'כמה זמן נמשכת הטיסה?', a: 'הטיסה הישירה נמשכת כשתים עשרה שעות.' },
      { q: 'מתי כדאי להזמין?', a: 'כדאי להזמין את הכרטיס שלושה חודשים מראש כדי למצוא מחיר טוב.' },
    ] })
    const faq = await S.suggestFaq({ text: pageText, title: 'טיסות זולות ליפן' }, async () => answer)
    check('C8: answers in the page\'s words in another form (הכרטיס/כרטיס, 1500/1,500) are the page\'s', faq.ok && faq.items.length === 3, faq)
    await withMutant<typeof S, void>('lib/site-fix/suggest.ts', [[".map((n) => n.replace(/,(?=\\d{3}\\b)/g, ''))", ''], ["for (const w of [t, bare]) {", 'for (const w of [] as string[]) {']], async (M) => {
      const r = await M.suggestFaq({ text: pageText, title: 'טיסות זולות ליפן' }, async () => answer)
      check('C8-MUT: with the old word and number matching the same answer is dropped (no FAQ)', !r.ok || r.items.length < 3)
    })
    let asked = 0
    const retry = await S.suggestFaq({ text: pageText, title: 'x' }, async () => (++asked === 1 ? '{"items": [' : answer))
    check('C9: a cut or empty answer is asked once more, not the last word', retry.ok && asked === 2)
    const P = await import('../site-fix/preview')
    const liveHtml = `<html><body><header>תפריט</header><main><h1>טיסות זולות ליפן</h1><p>${pageText}</p></main></body></html>`
    const fromLive = await P.faqSourceText('[elementor-template id="9"]', 'https://japan4u.co.il/flights/', { readLive: async () => ({ html: liveHtml }) as never })
    check('C10: a builder page whose content holds no words is read as visitors see it', !S.thinContent(fromLive) && fromLive.includes('טיסות ליפן'))
    check('C10-MUT: a page with enough words in its content keeps its own content', (await P.faqSourceText(pageText, 'u', { readLive: async () => { throw new Error('not read') } })) === pageText)
    const H = await import('../free-check/html-signals')
    const block = '<html><body><main><h1>ביטוח טיול ליפן</h1><p>טקסט</p><div class="gotop-faq"><h2 class="wp-block-heading">שאלות נפוצות</h2><h3 class="wp-block-heading">האם צריך ביטוח?</h3><p>כן.</p><h3 class="wp-block-heading">כמה זה עולה?</h3><p>תלוי.</p></div></main></body></html>'
    check('C11: the FAQ block the fix adds is recognised on the next check (the finding clears)', H.extractSiteSignals(block, 'https://japan4u.co.il/x/', { robotsTxt: null, llmsTxt: false }).hasFaqSection === true)
    check('C11-MUT: the same questions without an FAQ heading are not taken for an FAQ', H.extractSiteSignals(block.replace('שאלות נפוצות', 'עוד מידע'), 'https://japan4u.co.il/x/', { robotsTxt: null, llmsTxt: false }).hasFaqSection === false)
  }

  // ── D) the AI tab ─────────────────────────────────────────────────────────
  console.log('\nD) AI tab: the automatic monthly check, unmistakable')
  {
    const NOW = Date.parse('2026-09-30T10:00:00Z')
    const iso = (t: number) => new Date(t).toISOString()
    const world = (isAdmin: boolean) => new FakeAdmin({
      profiles: [{ id: 'u1', role: isAdmin ? 'admin' : 'user' }],
      billing_governance: [{ user_id: 'u1', signup_origin: 'website', billing_authority: 'website', authority_reason: 'website_signup' }],
      shopify_connections: [], shopify_billing_migrations: [],
      subscriptions: [{ id: 's1', user_id: 'u1', status: 'active', plan_code: 'advanced', trial_ends_at: null, current_period_start: iso(NOW - 5 * 86_400_000), current_period_end: iso(NOW + 25 * 86_400_000), paypal_subscription_id: 'I-QA', created_at: iso(NOW - 90 * 86_400_000) }],
      projects: [{ id: 'pj', user_id: 'u1', name: 'יפן', target_domain: 'japan4u.co.il', country: 'IL', language: 'he', is_active: true, ai_auto_check_enabled: true }],
      ai_prompts: [
        { id: 'q1', project_id: 'pj', prompt: 'מה הביטוח הכי טוב לטיול ליפן', is_active: true, created_at: iso(NOW - 20 * 86_400_000) },
        { id: 'q2', project_id: 'pj', prompt: 'איך מזמינים כרטיס רכבת ביפן', is_active: true, created_at: iso(NOW - 19 * 86_400_000) },
        { id: 'q3', project_id: 'pj', prompt: 'מתי כדאי לטוס ליפן', is_active: true, created_at: iso(NOW - 18 * 86_400_000) },
        { id: 'qx', project_id: 'other', prompt: 'שאלה של פרויקט אחר', is_active: true, created_at: iso(NOW - 30 * 86_400_000) },
      ],
      ai_scan_runs: [], ai_scan_results: [], usage_reservations: [], tracking_targets: [], project_profiles: [], article_topics: [],
    }, {}, () => NOW)
    const Run = await import('../ai-visibility/monthly-check/runner')
    const project = { id: 'pj', user_id: 'u1', name: 'יפן', target_domain: 'japan4u.co.il', country: 'IL', is_active: true }
    const deps = { now: () => new Date(NOW), lastSignInAt: async () => iso(NOW - 86_400_000) }
    const adminView = await Run.readMonthlyCheckStatus(world(true) as never, project, deps)
    check('D1: an admin (the owner) gets the check\'s picture, not nothing: engines and this project\'s questions only',
      adminView.state === 'admin' && adminView.engines.length === 3 && adminView.questions.length === 3 && !adminView.questions.some((q) => q.id === 'qx'), adminView)
    const cust = await Run.readMonthlyCheckStatus(world(false) as never, project, deps)
    check('D2: a customer\'s status names the questions the check takes (advanced: 2)', 'questions' in cust && cust.state === 'scheduled' && cust.questions.length === 2, cust)
    const { OverviewOpeningCard, OverviewStatusBar } = await import('../../components/ai-visibility/OverviewRows')
    const Mo = await import('../../components/ai-visibility/overview-model')
    for (const locale of ['he', 'en'] as const) {
      const c = getDashboardDictionary(locale).aiVisibilityOverview
      const card = (monthly: unknown) => renderToStaticMarkup(createElement(DashboardLanguageProvider, { initialLocale: locale },
        createElement(OverviewOpeningCard, { overview: Mo.buildOverview([]), questionsPending: false, questionsSuggested: null, questionsCount: 3, onChooseQuestions: () => {}, monthly, onRunMonthlyNow: () => {}, onToggleMonthly: () => {} })) as never)
      const a = card(adminView)
      check(`D3 ${locale}: the admin sees "${c.autoTitle}", when, on which engines, and the questions`,
        a.includes('data-ai-auto-check="admin"') && text(a).includes(c.autoTitle) && text(a).includes(c.autoAdminBody('ChatGPT, Gemini, Google AI', 3)) && text(a).includes('מה הביטוח הכי טוב לטיול ליפן') && text(a).includes(c.autoManualExtra))
      const s = card(cust)
      check(`D4 ${locale}: a customer sees the same list above the meter, and manual checks named as the extra`,
        s.includes('data-ai-auto-questions="2"') && text(s).includes(c.autoQuestionsLabel(2)) && text(s).includes(c.autoManualExtra) && s.indexOf('data-ai-auto-questions') < s.indexOf('data-ai-auto-meter'))
      check(`D4-MUT ${locale}: a status without questions shows no list`, !card({ ...(cust as object), questions: [] }).includes('data-ai-auto-questions'))
      const bar = text(renderToStaticMarkup(createElement(DashboardLanguageProvider, { initialLocale: locale }, createElement(OverviewStatusBar, { overview: Mo.buildOverview([]), questionsPending: false, monthly: adminView })) as never))
      check(`D5 ${locale}: the status bar no longer says "${c.nextCheckManual}" to the admin`, bar.includes(c.autoAdminNext) && !bar.includes(c.nextCheckManual))
    }
    await withMutant<typeof Run, void>('lib/ai-visibility/monthly-check/runner.ts', [["if (plan.reason === 'admin') return readAdminView(admin, project)", "if (plan.reason === 'admin') return { state: 'not_included' }"]], async (M) => {
      const r = await M.readMonthlyCheckStatus(world(true) as never, project, deps)
      check('D1-MUT: without the admin view the owner gets "not_included" (the panel vanishes, as he reported)', r.state === 'not_included')
    })
    const sec = strip(read('components/ai-visibility/AIVisibilitySection.tsx'))
    check('D6: each automatic question carries its badge in the questions list', /autoQuestionIds\?\.includes\(p\.id\)/.test(sec) && /t\('question_auto_monthly'\)/.test(sec))
    const pg = strip(read('app/(dashboard)/ai-visibility/page.tsx'))
    check('D6b: the page hands the status\'s question ids to the list', /autoQuestionIds: monthly && 'questions' in monthly/.test(pg))
  }

  console.log(`\n${pass} passed, ${fail} failed`)
  if (fail > 0) process.exit(1)
}
main().catch((e) => { console.error(e); process.exit(1) })
export {}
