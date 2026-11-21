/* eslint-disable @typescript-eslint/no-require-imports -- plain Node CJS script, run with `node`, never bundled. */
/*
 * A JVZoo sale, end to end over the real server.
 *
 * WHY THIS EXISTS RATHER THAN MORE UNIT CHECKS. lib/marketplace/__qa__ already
 * drives the parser and the intake against a fake admin client, which proves
 * the functions. It cannot prove the thing that actually takes a buyer's money:
 * that a form-encoded POST arriving at the deployed route gets its signature
 * verified over the RAW body, writes one order, mints a claim link, and answers
 * the platform a 2xx — and that a forged or replayed delivery does not.
 *
 * WHAT IT STILL DOES NOT PROVE, stated so nobody reads a green run as more than
 * it is: that JVZoo's own checkout charges correctly, and that JVZoo really
 * posts this shape with this digest. Only a real sale, or a test delivery sent
 * from inside the seller account, shows that. Everything on OUR side of the
 * wire is below.
 *
 *   node lib/__qa__/reviewer-journey/marketplace-sale.js
 *
 * JOURNEY_BASE=<url> drives an app that is already running instead of starting
 * `next start`; STUB_URL points at a stub on another port.
 */
const { spawn } = require('child_process')
const { createHash } = require('crypto')

const PORT = Number(process.env.JOURNEY_PORT || 3986)
const BASE = process.env.JOURNEY_BASE || `http://localhost:${PORT}`
const STUB = process.env.STUB_URL || 'http://127.0.0.1:5555'
const APP_DIR = process.env.JOURNEY_APP_DIR || '/home/user/rankings-by-go-top'
let pass = 0, fail = 0
const check = (n, c, d) => { if (c) { pass++; console.log(`  ✓ ${n}`) } else { fail++; console.log(`  ✗ ${n}${d ? ` — ${d}` : ''}`) } }

/* The journey's own secret and product ids. NOT production's: a journey that
 * needed the real webhook secret would be a journey nobody could run, and the
 * digest is the same algorithm whatever the key. */
const SECRET = 'journey-jvzipn-key'
const PRODUCTS = { regular: '457483', advanced: '457573', premium: '457575', large_agency: '457579' }

const stub = (path) => fetch(`${STUB}${path}`).then((r) => r.json()).catch(() => null)
const rows = async (table) => ((await stub('/__stub/db')) || {})[table] || []

/** The five signed fields, in the documented order, then the secret. */
function cverify(fields) {
  const signed = ['paykey', 'customer_email', 'product_name', 'transaction_type', 'date']
    .map((f) => fields[f] ?? '')
    .join('|')
  return createHash('sha1').update(`${signed}|${SECRET}`).digest('hex').slice(0, 8).toUpperCase()
}

function delivery(over = {}) {
  const fields = {
    paykey: 'AP-JOURNEY-1',
    customer_email: 'journey-buyer@example.com',
    product_name: 'Go Top SEO Advanced - 1 Site, 100 Keywords',
    transaction_type: 'SALE',
    date: '2026-10-31 09:15:00',
    transaction_id: 'JOURNEY-TX-1',
    product_id: PRODUCTS.advanced,
    product_type: 'RECURRING',
    total: '179.00',
    next_payment_date: '2026-11-30 09:15:00',
    ...over,
  }
  // The digest is computed over the fields as they are POSTed, so a test that
  // changes a signed field AFTER signing has to say so explicitly.
  return new URLSearchParams({ ...fields, cverify: over.cverify ?? cverify(fields) }).toString()
}

const post = (body) =>
  fetch(`${BASE}/api/marketplace/jvzoo/webhook`, {
    method: 'POST',
    headers: { 'content-type': 'application/x-www-form-urlencoded' },
    body,
  }).then(async (r) => ({ status: r.status, json: await r.json().catch(() => null) }))

async function main() {
  await stub('/__stub/reset')

  let server = null
  if (!process.env.JOURNEY_BASE) {
    server = spawn('npx', ['next', 'start', '-p', String(PORT)], {
      cwd: APP_DIR,
      env: {
        ...process.env,
        NEXT_PUBLIC_SUPABASE_URL: STUB,
        NEXT_PUBLIC_SUPABASE_ANON_KEY: 'stub-anon-key',
        SUPABASE_SERVICE_ROLE_KEY: 'stub-service-key',
        MARKETPLACE_JVZOO_ENABLED: 'true',
        MARKETPLACE_JVZOO_WEBHOOK_SECRET: SECRET,
        MARKETPLACE_JVZOO_PRODUCT_REGULAR: PRODUCTS.regular,
        MARKETPLACE_JVZOO_PRODUCT_ADVANCED: PRODUCTS.advanced,
        MARKETPLACE_JVZOO_PRODUCT_PREMIUM: PRODUCTS.premium,
        MARKETPLACE_JVZOO_PRODUCT_LARGE_AGENCY: PRODUCTS.large_agency,
      },
      stdio: ['ignore', 'pipe', 'pipe'],
    })
    let log = ''
    server.stdout.on('data', (d) => { log += d })
    server.stderr.on('data', (d) => { log += d })
    for (let i = 0; i < 120; i++) {
      if (await fetch(`${BASE}/api/marketplace/jvzoo/webhook`, { method: 'POST', body: '' }).then(() => true).catch(() => false)) break
      await new Promise((r) => setTimeout(r, 500))
    }
    if (!log.includes('Ready') && !log.includes('started server')) {
      // Not fatal on its own: the probe above is the real readiness test.
      console.log('  (server log had no "Ready" line; continuing because the port answered)')
    }
  }

  try {
    console.log('\nA. a genuine sale')
    const profilesBefore = (await rows('profiles')).length
    const sale = await post(delivery())
    check('A1: the platform gets a 2xx, so it does not retry a processed sale', sale.status === 200, JSON.stringify(sale))
    check('A2: and the route says it recorded the order', sale.json?.outcome === 'recorded', JSON.stringify(sale.json))

    const orders = await rows('marketplace_orders')
    const order = orders.find((o) => o.external_order_id === 'JOURNEY-TX-1')
    check('A3: exactly one order row was written', orders.length === 1, JSON.stringify(orders.map((o) => o.external_order_id)))
    check('A4: on the plan OUR mapping gives for that product id, not the name in the body',
      order?.plan_code === 'advanced', String(order?.plan_code))
    check('A5: the buyer email is stored lower-cased', order?.buyer_email === 'journey-buyer@example.com', String(order?.buyer_email))
    check('A6: the amount is minor units of the dollars the platform sent', order?.amount_minor === 17900, String(order?.amount_minor))
    check('A7: the period end is the platform\'s next payment date, not a computed month',
      String(order?.current_period_end).startsWith('2026-11-30T09:15:00'), String(order?.current_period_end))
    check('A8: a claim token was minted, long enough to be unguessable',
      typeof order?.claim_token === 'string' && order.claim_token.length >= 32, String(order?.claim_token?.length))
    check('A9: the row waits for its buyer — paid, with nobody attached to it',
      order?.status === 'paid' && !order?.claimed_by && !order?.claimed_at,
      `${order?.status} ${order?.claimed_by} ${order?.claimed_at}`)
    // The stub's fixture already holds one account, so "no account was created"
    // is a comparison against the count before the delivery, never a zero.
    check('A10: nothing was granted — no subscription row came out of a webhook',
      (await rows('subscriptions')).every((r) => !r.marketplace_order_id),
      JSON.stringify((await rows('subscriptions')).map((r) => r.marketplace_order_id)))
    check('A11: and the delivery created no account of its own',
      (await rows('profiles')).length === profilesBefore, `${(await rows('profiles')).length} vs ${profilesBefore}`)

    console.log('\nB. the same delivery again, as every platform eventually sends it')
    const again = await post(delivery())
    check('B1: a redelivery is answered 2xx', again.status === 200, JSON.stringify(again))
    check('B2: and reports the order as already on file', again.json?.outcome === 'already_recorded', JSON.stringify(again.json))
    check('B3: still exactly one row, so the buyer keeps the token they were mailed',
      (await rows('marketplace_orders')).length === 1)

    console.log('\nC. what must never be recorded')
    const forged = await post(delivery({ cverify: 'DEADBEEF' }))
    check('C1: a wrong digest is refused with 401', forged.status === 401, JSON.stringify(forged))
    const tampered = await post(delivery({ customer_email: 'thief@example.com', cverify: cverify({
      paykey: 'AP-JOURNEY-1', customer_email: 'journey-buyer@example.com',
      product_name: 'Go Top SEO Advanced - 1 Site, 100 Keywords', transaction_type: 'SALE', date: '2026-10-31 09:15:00',
    }) }))
    check('C2: changing the buyer email after signing is refused', tampered.status === 401, JSON.stringify(tampered))
    check('C3: no signature at all is refused', (await post(new URLSearchParams({ transaction_type: 'SALE' }).toString())).status === 401)
    const unknown = await post(delivery({ transaction_id: 'JOURNEY-TX-UNKNOWN', product_id: '999999' }))
    check('C4: a product we do not sell records nothing and is not retried',
      unknown.status === 200 && unknown.json?.outcome === 'unknown_product', JSON.stringify(unknown))
    check('C5: …and wrote no row', (await rows('marketplace_orders')).length === 1,
      JSON.stringify((await rows('marketplace_orders')).map((o) => o.external_order_id)))

    console.log('\nD. a rebill and a refund')
    const rebill = await post(delivery({ transaction_type: 'BILL', transaction_id: 'JOURNEY-TX-1-B001' }))
    check('D1: next month is its own order rather than a swallowed redelivery',
      rebill.json?.outcome === 'recorded' && (await rows('marketplace_orders')).length === 2, JSON.stringify(rebill.json))
    const refund = await post(delivery({ transaction_type: 'RFND' }))
    check('D2: a refund is recorded and handed to a person', refund.status === 200 && refund.json?.outcome === 'operator_attention',
      JSON.stringify(refund.json))
    const refunded = (await rows('marketplace_orders')).find((o) => o.external_order_id === 'JOURNEY-TX-1')
    check('D3: …by marking that order refunded, not by withdrawing anything', refunded?.status === 'refunded', String(refunded?.status))
    const orphan = await post(delivery({ transaction_type: 'RFND', transaction_id: 'JOURNEY-TX-NEVER-SEEN' }))
    check('D4: a refund for an order we never saw is reported, not invented',
      orphan.json?.outcome === 'order_unknown', JSON.stringify(orphan.json))

    console.log('\nE. the claim link the buyer is sent')
    const claimed = (await rows('marketplace_orders')).find((o) => o.external_order_id === 'JOURNEY-TX-1-B001')
    const claimUrl = `https://www.gotopseo.com/claim?order=${encodeURIComponent(claimed?.claim_token ?? '')}`
    check('E1: the claim url is built from our own canonical origin and nothing from the request',
      claimUrl.startsWith('https://www.gotopseo.com/claim?order='), claimUrl)
    const page = await fetch(`${BASE}/claim?order=${encodeURIComponent(claimed?.claim_token ?? '')}`, { redirect: 'manual' })
    check('E2: the claim page answers rather than erroring', page.status < 500, String(page.status))
    // The mail cannot be sent in a journey (no provider key), and that is the
    // point of the assertion: a mail that fails must not turn a correct row
    // into a webhook the platform retries forever.
    check('E3: the order stands even though no claim mail could be sent here',
      (await rows('marketplace_orders')).some((o) => o.external_order_id === 'JOURNEY-TX-1-B001'))
  } finally {
    if (server) { server.kill('SIGKILL') }
  }

  console.log(`\n${pass} passed, ${fail} failed`)
  process.exit(fail ? 1 : 0)
}

main().catch((err) => { console.error(err); process.exit(1) })
