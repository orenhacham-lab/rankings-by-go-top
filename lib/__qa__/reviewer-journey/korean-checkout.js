/*
 * THE KOREAN CHECKOUT, OVER A REAL `next start` BUILD.
 *
 * WHAT THIS DECIDES. The legal ruling of 12.11.2026 lets a Korean consumer be
 * sold to only while CREEM is the seller of record: VAT Act art. 53-2 puts 10%
 * Korean VAT on a B2C electronic service supplied to a Korean consumer by a
 * foreign supplier, from the first sale and with no de-minimis, and
 * 전자상거래법 art. 13 asks a storefront for a Korean business registration
 * number and a mail-order notification number that a seller with no Korean
 * registration cannot produce. Creem's Merchant Terms cl. 3.2 and 3.3.4 make it
 * the contractual reseller in its own name and put the indirect taxes on it, by
 * the buyer's billing address — so the ruling carried two conditions before
 * NEXT_PUBLIC_KOREAN_CHECKOUT_ENABLED may be turned on anywhere:
 *
 *   1. a Korean visitor's checkout must route to CREEM and never to the
 *      own-name PayPal path, because on that path the seller is us;
 *   2. cl. 3.7's disclosure — that the sale is concluded with Creem as the
 *      seller — must be in front of the buyer BEFORE they pay, in Korean.
 *
 * The source guards in lib/billing/__qa__/korea-sale.qa.ts prove the calls are
 * written in the files. They cannot prove that a running server, with the flag
 * actually on, puts the Creem button and that sentence on the screen and keeps
 * the PayPal buttons off it. That is what this journey is for, and it is the
 * evidence the flag may be turned on against — nothing here turns anything on
 * in an environment that serves real people.
 *
 * WHAT IS ASSERTED, with the flag on and a visitor placed in Korea:
 *   - the card button is there, and it is CREEM's;
 *   - the Korean cl. 3.7 sentence is on the screen, read FROM THE DICTIONARY at
 *     run time rather than copied here, so a re-worded sentence re-words the
 *     assertion with it and can never be a stale string;
 *   - that sentence names Creem, and names no Korean VAT, no registration
 *     number and no tax authority: the ruling keeps a conclusion about tax out
 *     of anything a buyer reads;
 *   - Creem's buyer terms are linked beside it (cl. 3.8);
 *   - the sentence and the link sit INSIDE the Creem button's own block, which
 *     is what "before they pay" means on a screen;
 *   - no PayPal container is rendered, so there is no second, own-name way to
 *     pay on the same screen;
 *   - the Korean refusal notice is gone, because the route it refuses is open.
 *
 * THE CONTROL, because a detector that measures nothing passes forever: the
 * same measurement runs again for a visitor placed in ISRAEL, where the market
 * is ILS and we are the seller by design. There the Creem button must be ABSENT
 * and the PayPal container PRESENT. If that comes out the same as Korea, the
 * Korean result measured the build and not the country.
 *
 * AND THE SECOND SWITCH, which is the thing most easily got wrong: turning the
 * Creem route on must NOT open a sale in our own name. So with the flag on, the
 * PayPal activation route is called with a Korean header and must still answer
 * 451 — that refusal is tied to NEXT_PUBLIC_KOREA_SELLER_REGISTERED, which is a
 * different flag and stays off.
 *
 * THE BUILD FLAG. NEXT_PUBLIC_KOREAN_CHECKOUT_ENABLED is inlined by Next at
 * BUILD time, so this journey cannot be run inside the shared journeys build,
 * which mirrors production and has it off. It SKIPS there rather than reporting
 * a defect that is really a missing flag. Run it on its own:
 *
 *   NEXT_PUBLIC_KOREAN_SITE_ENABLED=true NEXT_PUBLIC_KOREAN_CHECKOUT_ENABLED=true \
 *     bash scripts/qa/journeys.sh korean-checkout
 *
 * CREEM_ENABLED and CREEM_MODE are read at RUN time and are set on the server
 * this journey starts. Nothing is ever clicked: no checkout session is created
 * and no request leaves the machine for Creem.
 */
/* eslint-disable @typescript-eslint/no-require-imports -- plain Node CJS script, run with `node`, never bundled. */
const { spawn, spawnSync, execSync } = require('child_process')
const { join, resolve } = require('path')
const { mkdirSync } = require('fs')

const ROOT = resolve(__dirname, '../../..')
const OWN_SERVER = !process.env.KO_BASE_URL
const PORT = 3994
const BASE = process.env.KO_BASE_URL || `http://127.0.0.1:${PORT}`
const STUB = process.env.KO_STUB_URL || 'http://127.0.0.1:5555'
const SHOTS = process.env.QA_SCREENSHOT_DIR || '/tmp/ko-checkout'
const COUNTRY = 'x-vercel-ip-country'

mkdirSync(SHOTS, { recursive: true })
let pass = 0, fail = 0
const check = (n, c, d) => { if (c) { pass++; console.log(`  ✓ ${n}`) } else { fail++; console.log(`  ✗ ${n}${d ? ` — ${d}` : ''}`) } }
const done = () => console.log(`\n${pass} passed, ${fail} failed`)

/**
 * The Korean dictionary, read at run time.
 *
 * Copying the sentence into this file would make the journey pass forever on a
 * sentence the product stopped using. The dictionary is the source, here as in
 * the locale journeys.
 */
function koreanBillingCopy() {
  const code = `
    const { getDashboardDictionary } = require('./lib/i18n/dashboard/getDashboardDictionary')
    const d = getDashboardDictionary('ko')
    process.stdout.write(JSON.stringify({
      disclosure: d.billing.creem.disclosure,
      buyerTermsLabel: d.billing.creem.buyerTermsLabel,
      payButton: d.billing.creem.payButton,
      koreaSaleTitle: d.billing.koreaSale.title,
    }))`
  const r = spawnSync(join(ROOT, 'node_modules/.bin/tsx'), ['-e', code], { cwd: ROOT, encoding: 'utf8', maxBuffer: 32 * 1024 * 1024 })
  if (r.status !== 0) throw new Error(`reading the dictionary failed: ${(r.stderr || '').split('\n').slice(-6).join(' ')}`)
  return JSON.parse(r.stdout)
}

/* The words a buyer must never be shown, because they are the legal thread's
 * CONCLUSION about who remits Korean VAT and not a fact from anyone's contract.
 * 부가가치세 is VAT, 사업자등록번호 a business registration number, 통신판매업
 * the mail-order notification, 국세청 the National Tax Service. */
const TAX_WORDS = ['부가가치세', '사업자등록번호', '통신판매업', '국세청']

;(async () => {
  if (process.env.NEXT_PUBLIC_KOREAN_CHECKOUT_ENABLED !== 'true') {
    console.log('NEXT_PUBLIC_KOREAN_CHECKOUT_ENABLED is not "true". Next inlines it at BUILD time, so')
    console.log('without it the Korean checkout is refused and every assertion here would report a')
    console.log('product defect that is really a missing flag. Run:')
    console.log('  NEXT_PUBLIC_KOREAN_SITE_ENABLED=true NEXT_PUBLIC_KOREAN_CHECKOUT_ENABLED=true \\')
    console.log('    bash scripts/qa/journeys.sh korean-checkout')
    console.log('skipped (needs its own build) — 0 passed, 0 failed')
    return
  }

  const copy = koreanBillingCopy()
  const { chromium } = require('playwright')

  let server = null
  const kill = () => {
    if (!server) return
    try { process.kill(-server.pid, 'SIGKILL') } catch { /* gone */ }
    try { execSync(`pkill -9 -f "[n]ext start -p ${PORT}"`, { stdio: 'ignore' }) } catch { /* none */ }
  }
  if (OWN_SERVER) {
    server = spawn('npx', ['next', 'start', '-p', String(PORT)], {
      cwd: ROOT, detached: true, stdio: 'ignore',
      env: {
        ...process.env,
        NEXT_PUBLIC_SUPABASE_URL: STUB, NEXT_PUBLIC_SUPABASE_ANON_KEY: 'stub-anon-key',
        SUPABASE_SERVICE_ROLE_KEY: 'stub-service-key',
        // Read at RUN time. 'live' is what makes creemMayWriteToAccount true for
        // any account; nothing is clicked, so no session is ever created.
        CREEM_ENABLED: 'true', CREEM_MODE: 'live',
      },
    })
    for (let i = 0; i < 180 && !(await fetch(BASE).then(() => true, () => false)); i++) await new Promise((r) => setTimeout(r, 500))
  }
  await fetch(`${STUB}/__stub/reset`).catch(() => {})
  /*
   * THE ACCOUNT HAS TO BE AN ORDINARY WEB MERCHANT, and the stub's default one
   * is not: it is billed through Shopify App Pricing and already on Advanced.
   * Either of those alone keeps the Creem branch shut no matter what the Korean
   * flag says (app/(dashboard)/billing/page.tsx), so measuring the flag against
   * that account would measure Shopify. `account=web` is the stub's own fixture
   * for a merchant with no store, no billing governance and a running trial —
   * which is exactly the visitor a first purchase comes from.
   */
  await fetch(`${STUB}/__stub/fixture?account=web`).catch(() => {})

  const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium', args: ['--no-sandbox'] })
  try {
    /** A signed-in visitor placed in `country`, on the billing screen. */
    const billingAs = async (country, language) => {
      const ctx = await browser.newContext({ viewport: { width: 1440, height: 1200 }, extraHTTPHeaders: { [COUNTRY]: country } })
      /*
       * THE SENTENCE'S LANGUAGE FOLLOWS THE DASHBOARD, NOT THE COUNTRY, and
       * that is deliberate: the dashboard is read in the language its owner
       * chose, as it is in the other ten locales. The visitor this journey is
       * about is the one who came in through /ko and therefore reads Korean, so
       * the cookie is set here — a Korean consumer who chooses English gets the
       * same disclosure in English, which is still a disclosure they can read.
       */
      if (language) await ctx.addCookies([{ name: 'dashboard-language', value: language, url: BASE }])
      const page = await ctx.newPage()
      await page.goto(`${BASE}/login`, { waitUntil: 'domcontentloaded', timeout: 60000 })
      await page.fill('input[type="email"]', 'reviewer@example.com')
      await page.fill('input[type="password"]', 'whatever')
      await Promise.all([
        page.waitForURL((u) => !u.pathname.startsWith('/login'), { timeout: 60000 }).catch(() => {}),
        page.click('button[type="submit"]'),
      ])
      const resp = await page.goto(`${BASE}/billing`, { waitUntil: 'domcontentloaded', timeout: 60000 }).catch(() => null)
      await page.waitForLoadState('networkidle', { timeout: 30000 }).catch(() => {})
      await page.waitForTimeout(1200)
      await page.screenshot({ path: join(SHOTS, `billing-${country}.png`), fullPage: true })
      return { ctx, page, status: resp ? resp.status() : null }
    }

    console.log('\nA. a visitor in Korea, with the Creem route open')
    const kr = await billingAs('KR', 'ko')
    check('A0: the billing screen answers 200 for a Korean visitor', kr.status === 200, String(kr.status))
    const creemButton = kr.page.locator('[data-creem-checkout]')
    const creemCount = await creemButton.count()
    check('A1: the card button on the screen is CREEM\'s', creemCount > 0, `${creemCount} found`)

    const body = await kr.page.locator('body').innerText().catch(() => '')
    check('A2: the cl. 3.7 sentence is on the screen, in the dictionary\'s own words',
      body.includes(copy.disclosure), copy.disclosure.slice(0, 40))
    check('A3: and it names Creem as the seller of this purchase', copy.disclosure.includes('Creem') && body.includes('Creem'))
    const taxLeak = TAX_WORDS.filter((w) => body.includes(w))
    check('A4: nothing a buyer reads says who remits Korean VAT, or carries a registration number',
      taxLeak.length === 0, taxLeak.join(', '))
    check('A5: Creem\'s buyer terms are linked beside it (cl. 3.8)',
      await kr.page.locator('[data-creem-buyer-terms]').count() > 0)

    /* "Before they pay" is a fact about the SCREEN, not about the file: the
     * sentence has to be inside the same block as the button a buyer presses,
     * not somewhere further down the page. */
    const blockHasBoth = creemCount > 0 && await kr.page.evaluate((sentence) => {
      const btn = document.querySelector('[data-creem-checkout]')
      if (!btn) return false
      let el = btn.parentElement
      for (let i = 0; i < 3 && el; i++, el = el.parentElement) {
        if (el.innerText && el.innerText.includes(sentence)) return true
      }
      return false
    }, copy.disclosure)
    check('A6: the sentence sits in the button\'s own block, so it is read BEFORE paying', blockHasBoth)

    /* The four containers the PayPal client renders into, by the ids it looks
     * them up by (app/(dashboard)/billing/client.tsx). Absence of the container
     * is the real test: an empty container that the SDK later fills is still an
     * own-name checkout on the screen. */
    const PAYPAL = '#paypal-button-regular, #paypal-button-advanced, #paypal-button-premium, #paypal-button-large_agency'
    check('A7: no PayPal container is drawn, so there is no own-name way to pay here',
      await kr.page.locator(PAYPAL).count() === 0)
    check('A8: the Korean refusal notice is gone, because the Creem route is open',
      !body.includes(copy.koreaSaleTitle), copy.koreaSaleTitle)
    await kr.ctx.close()

    console.log('\nB. the control — a visitor in Israel, where WE are the seller by design')
    const il = await billingAs('IL')
    const ilBody = await il.page.locator('body').innerText().catch(() => '')
    check('B1: no Creem button there, so A1 measured the country and not the build',
      await il.page.locator('[data-creem-checkout]').count() === 0)
    check('B2: and the cl. 3.7 sentence is not on that screen either', !ilBody.includes(copy.disclosure))
    /* The other half of the control: the screen CAN draw an own-name checkout,
     * and does for the one country where we are lawfully the seller. Without
     * this, A7 would pass on a screen that simply renders nothing at all. */
    check('B3: and the own-name PayPal containers ARE drawn there, so A7 measured something',
      await il.page.locator(PAYPAL).count() > 0)
    await il.ctx.close()

    console.log('\nC. the second switch does not move with the first')
    const activate = await fetch(`${BASE}/api/paypal/activate`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', [COUNTRY]: 'KR' },
      body: JSON.stringify({ subscriptionId: 'I-NOTREAL', plan: 'regular' }),
    })
    const activateBody = await activate.json().catch(() => ({}))
    check('C1: an own-name PayPal activation from Korea is still refused 451', activate.status === 451, String(activate.status))
    check('C2: and the refusal is the Korean one, not the sanctions one',
      activateBody.reason === 'korea_checkout_unavailable', String(activateBody.reason))
  } finally {
    await browser.close().catch(() => {})
    kill()
  }
  done()
  if (fail > 0) process.exitCode = 1
})().catch((e) => { console.error(e); console.log('\n0 passed, 1 failed'); process.exit(1) })
