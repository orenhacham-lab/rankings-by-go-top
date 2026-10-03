/* eslint-disable @typescript-eslint/no-require-imports -- plain Node CJS script, run with `node`, never bundled. */
/*
 * THE COUNTRY BLOCK, OVER A REAL `next start` BUILD.
 *
 * Why this exists on top of the source guards in lib/sanctions/__qa__: a guard
 * can only prove the call is written in the file. It cannot prove the running
 * server refuses, that the refusal happens BEFORE the sign-in redirect on a
 * protected page, or that an ordinary visitor is unaffected. Those are the
 * three things that decide whether the block is real, and they need a server.
 *
 * What is asserted:
 *   - a request carrying a restricted country gets 451 on every page where a
 *     dealing starts (signup in all three languages, the free check, billing);
 *   - /billing answers 451 and NOT the /login redirect, which proves the block
 *     runs before the auth gate — the point being that a restricted visitor
 *     must never reach the PayPal buttons and be charged by PayPal for a
 *     subscription we would then refuse to activate;
 *   - /login, /, /pricing and /terms are untouched: refusing them buys no
 *     legal protection and would lock out paying customers who travel;
 *   - the API paths refuse too, and the PayPal one refuses a request that has
 *     no session at all (451, not 401) — the country decides, not the caller;
 *   - no header at all, and a malformed header, behave exactly like a normal
 *     visitor. This is the fail-open promise, and it is the one that keeps a
 *     missing CDN header from taking the whole site down;
 *   - the refused page names no country, no statute, and no provider error.
 *
 *   node lib/__qa__/reviewer-journey/supabase-stub.js &
 *   NEXT_PUBLIC_SUPABASE_URL=http://127.0.0.1:5555 … npx next build
 *   node lib/__qa__/reviewer-journey/sanctions-country-block.js
 */
const { spawn, execSync } = require('child_process')
const APP_DIR = process.env.QA_APP_DIR || '/home/user/rankings-by-go-top'
const PORT = 3993, BASE = `http://127.0.0.1:${PORT}`, STUB = 'http://127.0.0.1:5555'
const HEADER = 'x-vercel-ip-country'
let pass = 0, fail = 0
const check = (n, c, d) => { if (c) { pass++; console.log(`  ✓ ${n}`) } else { fail++; console.log(`  ✗ ${n}${d ? ` — ${d}` : ''}`) } }

/** No redirect following: a 307 to /login is a DIFFERENT answer from a 451 and must not be hidden. */
const get = (path, country) => fetch(`${BASE}${path}`, {
  redirect: 'manual',
  headers: country === undefined ? {} : { [HEADER]: country },
})

;(async () => {
  if (await fetch(BASE).then(() => true, () => false)) { console.log(`port ${PORT} is already serving`); process.exit(1) }
  const server = spawn('npx', ['next', 'start', '-p', String(PORT)], {
    cwd: APP_DIR, detached: true, stdio: 'ignore',
    env: {
      ...process.env,
      NEXT_PUBLIC_SUPABASE_URL: STUB, NEXT_PUBLIC_SUPABASE_ANON_KEY: 'stub-anon-key',
      SUPABASE_SERVICE_ROLE_KEY: 'stub-service-key',
      ENABLE_CONTENT: 'true', ENABLE_SEED_SCAN: 'true',
    },
  })
  const kill = () => {
    try { process.kill(-server.pid, 'SIGKILL') } catch { /* gone */ }
    try { execSync(`pkill -9 -f "[n]ext start -p ${PORT}"`, { stdio: 'ignore' }) } catch { /* none */ }
  }
  for (let i = 0; i < 180 && !(await fetch(BASE).then(() => true, () => false)); i++) await new Promise((r) => setTimeout(r, 500))

  try {
    // ── A) every page where a dealing starts, for each restricted country ──
    const RESTRICTED = ['IR', 'IQ', 'SY', 'LB', 'CU', 'KP']
    const DEALING_PAGES = ['/signup', '/en/signup', '/free-check', '/billing']
    for (const cc of RESTRICTED) {
      for (const path of DEALING_PAGES) {
        const r = await get(path, cc)
        check(`A ${path} from ${cc} → 451`, r.status === 451, `got ${r.status}`)
      }
    }

    // ── B) /billing refuses BEFORE the sign-in redirect ────────────────────
    // The whole point: if this were only checked at /api/paypal/activate, a
    // restricted visitor could be charged by PayPal and then refused service.
    const billingAnon = await get('/billing', undefined)
    const billingIR = await get('/billing', 'IR')
    check('B1 /billing normally redirects an anonymous visitor to sign in',
      billingAnon.status === 307 || billingAnon.status === 302,
      `got ${billingAnon.status}`)
    check('B2 …but from a restricted country it is 451, not that redirect',
      billingIR.status === 451, `got ${billingIR.status}`)
    check('B3 …and the 451 carries no Location header, so nothing is offered',
      billingIR.headers.get('location') === null)

    // ── C) what must NOT be blocked ────────────────────────────────────────
    for (const path of ['/', '/pricing', '/terms', '/login', '/privacy']) {
      const r = await get(path, 'IR')
      check(`C ${path} is NOT blocked even from IR`, r.status !== 451, `got ${r.status}`)
    }

    // ── D) fail open: this is what keeps a missing header from being an outage ──
    for (const [label, value] of [['no header', undefined], ['empty', ''], ['malformed', 'not-a-country'], ['three letters', 'IRN']]) {
      const r = await get('/signup', value)
      check(`D /signup with ${label} → not blocked`, r.status !== 451, `got ${r.status}`)
    }
    const permitted = await get('/signup', 'IL')
    check('D5 /signup from IL is served normally', permitted.status === 200, `got ${permitted.status}`)
    const lower = await get('/signup', 'ir')
    check('D6 a lower-case country code is still refused', lower.status === 451, `got ${lower.status}`)

    // ── E) the API paths, which proxy.ts cannot see at all ─────────────────
    const paypal = await fetch(`${BASE}/api/paypal/activate`, {
      method: 'POST', redirect: 'manual',
      headers: { 'content-type': 'application/json', [HEADER]: 'LB' },
      body: JSON.stringify({ subscriptionId: 'I-TEST', plan: 'REGULAR' }),
    })
    check('E1 /api/paypal/activate from LB → 451 with no session at all (not 401)',
      paypal.status === 451, `got ${paypal.status}`)
    const paypalAnon = await fetch(`${BASE}/api/paypal/activate`, {
      method: 'POST', redirect: 'manual',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ subscriptionId: 'I-TEST', plan: 'REGULAR' }),
    })
    check('E2 …while the same call with no country still gets the normal 401',
      paypalAnon.status === 401, `got ${paypalAnon.status}`)
    const freeCheck = await fetch(`${BASE}/api/free-check`, {
      method: 'POST', redirect: 'manual',
      headers: { 'content-type': 'application/json', [HEADER]: 'SY' },
      body: JSON.stringify({ url: 'https://example.com', locale: 'he' }),
    })
    check('E3 /api/free-check from SY → 451', freeCheck.status === 451, `got ${freeCheck.status}`)

    // ── E4) the Shopify billing paths, which must not change for anyone else ──
    // Oren's standing rule is that the live Shopify app is never harmed. The
    // hook on these two routes is an early return and nothing else, so for a
    // merchant who is not in a restricted country the answer has to be
    // IDENTICAL to the one the route gave before — which is what "no country"
    // and "IL" agreeing with each other demonstrates here.
    const shopify = async (path, method, country) => fetch(`${BASE}${path}`, {
      method, redirect: 'manual',
      headers: {
        'content-type': 'application/json',
        ...(country ? { [HEADER]: country } : {}),
      },
      ...(method === 'POST' ? { body: JSON.stringify({}) } : {}),
    })
    for (const [path, method] of [['/api/shopify/billing/start-intent', 'GET'], ['/api/shopify/billing/resume', 'POST']]) {
      const none = await shopify(path, method, null)
      const il = await shopify(path, method, 'IL')
      const restrictedShopify = await shopify(path, method, 'IR')
      check(`E4 ${path} answers the same with no country as with IL`,
        none.status === il.status, `none=${none.status} il=${il.status}`)
      check(`E5 ${path} is not refused for a permitted merchant`,
        none.status !== 451 && il.status !== 451, `none=${none.status} il=${il.status}`)
      check(`E6 ${path} IS refused from a restricted country`,
        restrictedShopify.status === 451, `got ${restrictedShopify.status}`)
      // "Reaches its own logic" means the route answered for itself, not that
      // it answered with success: start-intent redirects (307) for a permitted
      // merchant, and resume answers 500 `shopify_oauth_not_configured`
      // because this harness has no Shopify credentials — both ARE the route's
      // own logic, reached past the hook. What must not happen is a 451 (we
      // refused a merchant we should not have) or an unhandled throw from the
      // hook itself, which is why a 500 is only accepted when it carries the
      // route's own documented reason code rather than a generic error page.
      let ownAnswer = none.status !== 451
      if (ownAnswer && none.status === 500) {
        const body = await none.text().catch(() => '')
        ownAnswer = /shopify_oauth_not_configured/.test(body)
      }
      check(`E7 ${path} still reaches its own logic for a permitted merchant`,
        ownAnswer, `got ${none.status}`)
    }

    // ── F) what the refused person is told ─────────────────────────────────
    const he = await (await get('/signup', 'IR')).text()
    const en = await (await get('/en/signup', 'IR')).text()
    check('F1 the Hebrew page is answered in Hebrew', /[֐-׿]/.test(he))
    check('F2 the English page is answered in English', !/[֐-׿]/.test(en) && en.length > 20)
    for (const [label, body] of [['he', he], ['en', en]]) {
      check(`F3 the ${label} refusal names no country`,
        !/Iran|Iraq|Syria|Lebanon|Cuba|Korea|איראן|עיראק|סוריה|לבנון/i.test(body))
      check(`F4 the ${label} refusal names no statute`, !/Ordinance|OFAC|פקודת/i.test(body))
    }
    const refused = await get('/signup', 'IR')
    check('F5 the refusal is not cached', (refused.headers.get('cache-control') || '').includes('no-store'))
    check('F6 the refusal is not indexable', (refused.headers.get('x-robots-tag') || '').includes('noindex'))
  } catch (e) {
    check('journey completed without throwing', false, e && e.stack)
  } finally {
    kill()
  }
  console.log(`\n${pass} passed, ${fail} failed`)
  process.exit(fail > 0 ? 1 : 0)
})()
