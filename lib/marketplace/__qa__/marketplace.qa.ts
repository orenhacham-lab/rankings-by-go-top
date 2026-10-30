/**
 * The external-marketplace layer, end to end, with no Supabase and no
 * platform: configuration and its off switches, the signature check that is
 * the webhook's only authentication, what a verified event does to the data,
 * and how the claim's answers are read.
 *
 * It also guards the four properties that keep this layer from touching
 * anything live:
 *   * no registered provider has a signature scheme or a parser, so the
 *     webhook cannot accept a delivery today;
 *   * the webhook verifies BEFORE it parses;
 *   * both new pages are noindex;
 *   * the sales page never links to our own checkout.
 *
 * MUTATION CONTROLS throughout: each guard is also run against the broken
 * version of the thing it protects, and must fail there. A check that cannot
 * fail tests nothing.
 *
 * Run: npx tsx lib/marketplace/__qa__/marketplace.qa.ts
 */
import { readFileSync } from 'fs'
import { createHmac } from 'crypto'
import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { CONSENT_DENIED, type ConsentChoices } from '../../consent/categories'
import { MarketplacePixel, marketingBeaconAllowed } from '../../../components/consent/MarketplacePixel'
import { FakeAdmin } from '../../__qa__/_fake-admin'
import {
  MARKETPLACE_CLAIM_PATH,
  MARKETPLACE_PROVIDERS,
  marketplaceBuyUrl,
  marketplaceClaimUrl,
  marketplacePixelUrl,
  marketplacePolicyUrl,
  marketplaceProvider,
  isMarketplaceProviderEnabled,
  marketplaceWebhookSecret,
  planForMarketplaceProductId,
  providerReadiness,
  JVZOO_IPN_V2_SCHEME,
  type MarketplaceHmacHeaderScheme,
} from '../config'
import { fieldDigestFor, marketplaceSignatureFor, verifyMarketplaceSignature } from '../signature'
import {
  httpStatusForMarketplaceOutcome,
  marketplaceParser,
  recordMarketplaceOrder,
  type MarketplaceOrderEvent,
} from '../intake'
import { claimMarketplaceOrder } from '../claim'

let pass = 0, fail = 0
function check(name: string, cond: boolean, detail?: string) {
  if (cond) { pass++; console.log(`  ✓ ${name}`) } else { fail++; console.log(`  ✗ ${name}${detail ? ` — ${detail}` : ''}`) }
}
const read = (p: string) => readFileSync(p, 'utf8')
/** Comments stripped, the convention every source guard in this repo uses:
 *  a rule must be matched in the CODE, not in a sentence about the code. */
const code = (p: string) => read(p).replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '')

// ── A. The registry is the closed world ─────────────────────────────────────
console.log('\nA. registry')
check('A1: the three named platforms are registered',
  ['digistore24', 'clickbank', 'jvzoo'].every((s) => marketplaceProvider(s)?.slug === s))
check('A2: a slug nobody registered is not a provider', marketplaceProvider('paddle') === null)
check('A3: nor is an empty or absent one',
  marketplaceProvider('') === null && marketplaceProvider(null) === null && marketplaceProvider(undefined) === null)
check('A4: the lookup is case- and whitespace-tolerant, because an env var is typed by a person',
  marketplaceProvider(' Digistore24 ')?.slug === 'digistore24')
/**
 * A5 used to read "no provider carries a signature scheme", which was true
 * while no platform's documentation could be reached. JVZoo's was read inside
 * the seller account, so the invariant that is actually worth holding is the
 * one below: a scheme and a parser arrive TOGETHER. Either one alone is the
 * half-configured provider this whole module exists to prevent - a verified
 * body nothing can read, or a body read without being verified.
 */
check('A5: a provider has a signature scheme exactly when it has a parser',
  MARKETPLACE_PROVIDERS.every((p) => (p.signature === null) === (marketplaceParser(p.slug) === null)))
check('A5b: and JVZoo is the one that carries both, from its own IPN v2 spec',
  marketplaceProvider('jvzoo')?.signature !== null && marketplaceParser('jvzoo') !== null)
check('A6: a required disclaimer is carried only where the owner approved the platform\'s exact wording - JVZoo\'s is approved, the other two have none',
  marketplaceProvider('jvzoo')?.requiredDisclaimer?.startsWith('Disclaimer: Please note that this product does not provide any guarantee of income') === true
  && marketplaceProvider('digistore24')?.requiredDisclaimer === null
  && marketplaceProvider('clickbank')?.requiredDisclaimer === null)
check('A6b: JVZoo\'s approved disclaimer is the platform\'s text intact, naming JVZoo as retailer and BBC Systems Inc.',
  marketplaceProvider('jvzoo')?.requiredDisclaimer?.includes('JVZoo serves as the retailer') === true
  && marketplaceProvider('jvzoo')?.requiredDisclaimer?.includes('BBC Systems Inc.') === true)
check('A6c: seller of record follows each platform\'s vendor agreement - JVZoo is NOT one (s.11 leaves the tax with us), the two resellers are',
  marketplaceProvider('jvzoo')?.sellerOfRecord === false
  && marketplaceProvider('digistore24')?.sellerOfRecord === true
  && marketplaceProvider('clickbank')?.sellerOfRecord === true)
check('A7: a platform whose documentation has not been read carries neither a scheme nor a parser',
  ['digistore24', 'clickbank'].every((s) =>
    marketplaceProvider(s)?.signature === null && marketplaceParser(s) === null))
check('A-MUT1: a scheme without a parser would fail A5',
  !([{ signature: {} }, { signature: null }] as { signature: unknown }[])
    .every((p) => (p.signature === null) === true))

// ── B. Off switches, and what readiness reports ─────────────────────────────
console.log('\nB. off switches')
for (const key of Object.keys(process.env)) if (key.startsWith('MARKETPLACE_')) delete process.env[key]

check('B1: a provider with nothing configured is off', isMarketplaceProviderEnabled('digistore24') === false)
process.env.MARKETPLACE_DIGISTORE24_ENABLED = 'TRUE'
check('B2: and anything but the exact string "true" is still off',
  isMarketplaceProviderEnabled('digistore24') === false)
process.env.MARKETPLACE_DIGISTORE24_ENABLED = 'true'
check('B3: the exact string turns the switch on', isMarketplaceProviderEnabled('digistore24') === true)
check('B4: an unregistered slug is off even with its env var set',
  (() => { process.env.MARKETPLACE_PADDLE_ENABLED = 'true'; return isMarketplaceProviderEnabled('paddle') === false })())

let readiness = providerReadiness('digistore24')
check('B5: with the switch on but nothing else, readiness is false',
  readiness.ready === false)
check('B6: and it names the secret, the scheme and the product ids — by NAME, not value',
  readiness.missing.includes('webhook_secret')
  && readiness.missing.includes('signature_scheme')
  && readiness.missing.includes('product_ids'))
process.env.MARKETPLACE_DIGISTORE24_WEBHOOK_SECRET = 'top-secret'
process.env.MARKETPLACE_DIGISTORE24_PRODUCT_ADVANCED = 'PROD-ADV'
readiness = providerReadiness('digistore24')
check('B7: with a secret and a product the only thing left is the scheme',
  readiness.ready === false && readiness.missing.join(',') === 'signature_scheme')
check('B8: an unregistered provider is reported as unregistered, not merely disabled',
  providerReadiness('paddle').missing.join(',') === 'unregistered_provider')
check('B9: the secret is readable by the server and only for a registered provider',
  marketplaceWebhookSecret('digistore24') === 'top-secret' && marketplaceWebhookSecret('paddle') === null)

// ── C. Product → plan, never a fallback ─────────────────────────────────────
console.log('\nC. product mapping')
check('C1: a configured product id resolves to its plan',
  planForMarketplaceProductId('digistore24', 'PROD-ADV') === 'advanced')
check('C2: an unknown product id resolves to NOTHING — never the nearest plan',
  planForMarketplaceProductId('digistore24', 'PROD-WHATEVER') === null)
check('C3: an empty or absent product id resolves to nothing',
  planForMarketplaceProductId('digistore24', '') === null
  && planForMarketplaceProductId('digistore24', null) === null)
check('C4: one provider\'s product ids do not leak into another\'s',
  planForMarketplaceProductId('clickbank', 'PROD-ADV') === null)

// ── D. URLs are ours, and https only ────────────────────────────────────────
console.log('\nD. urls')
check('D1: the claim url is built from our own canonical origin and the fixed path',
  marketplaceClaimUrl('tok en/1').startsWith(`https://www.gotopseo.com${MARKETPLACE_CLAIM_PATH}?order=`))
check('D2: and the token is encoded, so it cannot add a parameter of its own',
  marketplaceClaimUrl('a&b=c').endsWith('a%26b%3Dc'))
/*
 * The buy url is gated on readiness, so these checks run against JVZoo, the
 * one provider that CAN become ready (it is the only one whose signature
 * scheme has been read). Digistore24 is used below for the gate itself,
 * because a provider with no scheme can never be ready - which is the point.
 */
process.env.MARKETPLACE_JVZOO_ENABLED = 'true'
process.env.MARKETPLACE_JVZOO_WEBHOOK_SECRET = 'jv-secret'
process.env.MARKETPLACE_JVZOO_PRODUCT_ADVANCED = '457573'
check('D3a: JVZoo is ready once its switch, secret and a product id are set',
  providerReadiness('jvzoo').ready === true)
process.env.MARKETPLACE_JVZOO_BUY_URL_ADVANCED = 'http://example.com/buy'
check('D3: a plain-http buy url is treated as unset',
  marketplaceBuyUrl('jvzoo', 'advanced') === null)
process.env.MARKETPLACE_JVZOO_BUY_URL_ADVANCED = 'javascript:alert(1)'
check('D4: so is anything that is not a url at all',
  marketplaceBuyUrl('jvzoo', 'advanced') === null)
process.env.MARKETPLACE_JVZOO_BUY_URL_ADVANCED = 'https://www.jvzoo.com/b/0/457573/99'
check('D5: an https url is used', marketplaceBuyUrl('jvzoo', 'advanced') === 'https://www.jvzoo.com/b/0/457573/99')
check('D6: a plan with no configured url has none', marketplaceBuyUrl('jvzoo', 'premium') === null)

/*
 * THE GATE. Configuring a buy url is one env var away from configuring the
 * webhook, and before this gate existed the two were independent: the url
 * alone put a live, payable button on a public page while the callback was
 * still refusing every delivery, so a buyer could pay in full and leave no
 * record at all - not an account, not a plan, not a receipt to reconcile by
 * hand. Each check below turns exactly one readiness piece off.
 */
process.env.MARKETPLACE_DIGISTORE24_BUY_URL_ADVANCED = 'https://www.digistore24.com/product/123'
check('D6a: a provider with no signature scheme shows NO buy button, however its url is set',
  providerReadiness('digistore24').ready === false
  && marketplaceBuyUrl('digistore24', 'advanced') === null)
process.env.MARKETPLACE_JVZOO_ENABLED = 'false'
check('D6b: switching the channel off removes the button',
  marketplaceBuyUrl('jvzoo', 'advanced') === null)
process.env.MARKETPLACE_JVZOO_ENABLED = 'true'
delete process.env.MARKETPLACE_JVZOO_WEBHOOK_SECRET
check('D6c: so does losing the webhook secret, because a delivery could not be verified',
  marketplaceBuyUrl('jvzoo', 'advanced') === null)
process.env.MARKETPLACE_JVZOO_WEBHOOK_SECRET = 'jv-secret'
delete process.env.MARKETPLACE_JVZOO_PRODUCT_ADVANCED
check('D6d: and so does losing every product id, because a paid order could not be mapped to a plan',
  marketplaceBuyUrl('jvzoo', 'advanced') === null)
process.env.MARKETPLACE_JVZOO_PRODUCT_ADVANCED = '457573'
check('D6e: with all of it back, the button returns',
  marketplaceBuyUrl('jvzoo', 'advanced') === 'https://www.jvzoo.com/b/0/457573/99')
check('D6-MUT: a gate that only checked the url would pass D6a, which is the bug this group pins',
  marketplaceBuyUrl.toString().includes('providerReadiness'))
process.env.MARKETPLACE_DIGISTORE24_POLICY_URL = 'https://www.digistore24.com/returns'
check('D7: the platform\'s own policy page is read the same way',
  marketplacePolicyUrl('digistore24') === 'https://www.digistore24.com/returns')
process.env.MARKETPLACE_DIGISTORE24_POLICY_URL = '" onclick="evil()'
check('D8: and a value that would break out of the attribute is refused',
  marketplacePolicyUrl('digistore24') === null)

/*
 * THE BEACON IS PER PRODUCT, AND THAT IS NOT COSMETIC. JVZoo's pixel URL
 * carries the product id, and the compliance note that demands it says why:
 * a wrong one "corrupts the product's stats and is unfair to affiliates".
 * One provider-wide URL counted every visitor, whichever plan they came for,
 * against a single product - so three of four listings showed an affiliate no
 * traffic while the fourth showed traffic it never received.
 */
process.env.MARKETPLACE_JVZOO_PIXEL_URL = 'https://i.jvzoo.com/0/457483/99'
check('D9: a plan with no beacon of its own falls back to the provider-wide one',
  marketplacePixelUrl('jvzoo', 'advanced') === 'https://i.jvzoo.com/0/457483/99')
process.env.MARKETPLACE_JVZOO_PIXEL_URL_ADVANCED = 'https://i.jvzoo.com/0/457573/99'
check('D10: a plan with its own beacon uses it, not the provider-wide one',
  marketplacePixelUrl('jvzoo', 'advanced') === 'https://i.jvzoo.com/0/457573/99')
check('D11: …and the other plans are unaffected by it',
  marketplacePixelUrl('jvzoo', 'premium') === 'https://i.jvzoo.com/0/457483/99')
process.env.MARKETPLACE_JVZOO_PIXEL_URL_ADVANCED = 'http://i.jvzoo.com/0/457573/99'
check('D12: a plain-http beacon is treated as unset and falls back',
  marketplacePixelUrl('jvzoo', 'advanced') === 'https://i.jvzoo.com/0/457483/99')
process.env.MARKETPLACE_JVZOO_PIXEL_URL_ADVANCED = 'https://i.jvzoo.com/0/457573/99'
check('D-MUT10: a resolver that ignored the plan would fail D10, which is the bug this group pins',
  marketplacePixelUrl.toString().includes('PIXEL_URL_'))
delete process.env.MARKETPLACE_JVZOO_PIXEL_URL
check('D13: with no provider-wide beacon, an unconfigured plan has none at all',
  marketplacePixelUrl('jvzoo', 'premium') === null
  && marketplacePixelUrl('jvzoo', 'advanced') === 'https://i.jvzoo.com/0/457573/99')
delete process.env.MARKETPLACE_JVZOO_PIXEL_URL_ADVANCED

// ── E. The signature, which is the only authentication ──────────────────────
console.log('\nE. signature')
const BODY = '{"order":"A-1","product":"PROD-ADV"}'
const SECRET = 'shhh'
const hex256: MarketplaceHmacHeaderScheme = { kind: 'hmac_header', header: 'x-sig', algorithm: 'sha256', encoding: 'hex' }
const b64512: MarketplaceHmacHeaderScheme = { kind: 'hmac_header', header: 'x-sig', algorithm: 'sha512', encoding: 'base64' }

const goodHex = marketplaceSignatureFor(BODY, SECRET, hex256)
const goodB64 = marketplaceSignatureFor(BODY, SECRET, b64512)
check('E1: the right hex digest verifies',
  verifyMarketplaceSignature(BODY, goodHex, SECRET, hex256).ok === true)
check('E2: upper-case hex verifies too, because a platform may send either',
  verifyMarketplaceSignature(BODY, goodHex.toUpperCase(), SECRET, hex256).ok === true)
check('E3: the right base64 digest verifies',
  verifyMarketplaceSignature(BODY, goodB64, SECRET, b64512).ok === true)
check('E4: the digest is over the RAW bytes — a re-serialised body does not match',
  verifyMarketplaceSignature(JSON.stringify(JSON.parse(BODY)) + ' ', goodHex, SECRET, hex256).ok === false)
check('E5: the wrong secret is a mismatch',
  verifyMarketplaceSignature(BODY, goodHex, 'other', hex256).ok === false)
check('E6: a changed body is a mismatch',
  verifyMarketplaceSignature(BODY + '!', goodHex, SECRET, hex256).ok === false)

const failures = [
  ['no scheme', verifyMarketplaceSignature(BODY, goodHex, SECRET, null), 'unknown_scheme'],
  ['no secret', verifyMarketplaceSignature(BODY, goodHex, null, hex256), 'missing_secret'],
  ['no header', verifyMarketplaceSignature(BODY, '', SECRET, hex256), 'missing_signature'],
  ['short hex', verifyMarketplaceSignature(BODY, 'abc', SECRET, hex256), 'malformed_signature'],
  ['non-hex', verifyMarketplaceSignature(BODY, 'z'.repeat(64), SECRET, hex256), 'malformed_signature'],
  ['sha512 digest offered to a sha256 scheme', verifyMarketplaceSignature(BODY, marketplaceSignatureFor(BODY, SECRET, { ...hex256, algorithm: 'sha512' as const }), SECRET, hex256), 'malformed_signature'],
  ['base64 of the wrong length', verifyMarketplaceSignature(BODY, Buffer.from('short').toString('base64'), SECRET, b64512), 'malformed_signature'],
] as const
for (const [label, result, reason] of failures) {
  check(`E7: ${label} fails closed as ${reason}`,
    result.ok === false && result.reason === reason)
}
check('E8: nothing above threw — a 500 would make the platform retry for ever', true)

// MUTATION CONTROLS for E.
const lenient = (header: string | null) => (header ? { ok: true } : { ok: false })
check('E-MUT1: a verifier that accepts any non-empty header would pass a forgery these checks reject',
  lenient('deadbeef').ok === true && verifyMarketplaceSignature(BODY, 'deadbeef', SECRET, hex256).ok === false)
const unkeyed = (body: string, header: string) =>
  createHmac('sha256', '').update(body).digest('hex') === header
check('E-MUT2: a verifier that ignores the secret is caught',
  unkeyed(BODY, goodHex) === false)

// ── K. JVZoo JVZIPN v2: a digest of five form fields, carried in the body ──
// docs/affiliate/jvzoo-webhook-docs.md, copied from the seller account.
console.log('\nK. jvzoo ipn v2')
const JV_SECRET = 's3cr3t-key'
/** The five signed fields, in the documented order, plus the rest of a sale. */
const jvForm = (over: Record<string, string> = {}) =>
  new URLSearchParams({
    paykey: 'AP-ABC123XYZ',
    customer_email: 'buyer@example.com',
    product_name: 'Go Top SEO Advanced - 1 Site, 100 Keywords',
    transaction_type: 'SALE',
    date: '2026-10-29 09:15:00',
    transaction_id: 'ABC123XYZ',
    product_id: 'JV-ADV',
    product_type: 'RECURRING',
    total: '47.00',
    next_payment_date: '2026-11-29 09:15:00',
    ...over,
  }).toString()

/**
 * The expected digest was computed OUTSIDE this code, with
 *   printf '%s' 'AP-ABC123XYZ|buyer@example.com|Go Top SEO Advanced - 1 Site, 100 Keywords|SALE|2026-10-29 09:15:00|s3cr3t-key' | sha1sum
 * so this is a real check of the algorithm rather than the implementation
 * agreeing with itself.
 */
const JV_EXPECTED = '6D36EAAF'
/** The refusal reason, or null when the delivery verified. */
const reasonOf = (r: ReturnType<typeof verifyMarketplaceSignature>) => (r.ok ? null : r.reason)
check('K1: cverify matches a digest computed outside this code',
  fieldDigestFor(jvForm(), JV_SECRET, JVZOO_IPN_V2_SCHEME) === JV_EXPECTED)
check('K2: a genuine delivery verifies, with the digest read from the BODY',
  verifyMarketplaceSignature(jvForm({ cverify: JV_EXPECTED }), null, JV_SECRET, JVZOO_IPN_V2_SCHEME).ok === true)
check('K3: lower case verifies, since the comparison upper-cases first',
  verifyMarketplaceSignature(jvForm({ cverify: JV_EXPECTED.toLowerCase() }), null, JV_SECRET, JVZOO_IPN_V2_SCHEME).ok === true)
check('K4: changing a SIGNED field (the email) is a mismatch',
  reasonOf(verifyMarketplaceSignature(jvForm({ cverify: JV_EXPECTED, customer_email: 'thief@example.com' }), null, JV_SECRET, JVZOO_IPN_V2_SCHEME)) === 'mismatch')
check('K5: the wrong secret is a mismatch',
  reasonOf(verifyMarketplaceSignature(jvForm({ cverify: JV_EXPECTED }), null, 'other', JVZOO_IPN_V2_SCHEME)) === 'mismatch')
check('K6: no cverify at all fails closed',
  reasonOf(verifyMarketplaceSignature(jvForm(), null, JV_SECRET, JVZOO_IPN_V2_SCHEME)) === 'missing_signature')
check('K7: a digest of the wrong length is refused before the comparison',
  reasonOf(verifyMarketplaceSignature(jvForm({ cverify: 'ABC' }), null, JV_SECRET, JVZOO_IPN_V2_SCHEME)) === 'malformed_signature')
check('K8: a non-hex digest is refused',
  reasonOf(verifyMarketplaceSignature(jvForm({ cverify: 'ZZZZZZZZ' }), null, JV_SECRET, JVZOO_IPN_V2_SCHEME)) === 'malformed_signature')
check('K9: a missing signed field counts as empty rather than shifting the rest',
  fieldDigestFor(new URLSearchParams({ paykey: 'P', transaction_type: 'SALE' }).toString(), JV_SECRET, JVZOO_IPN_V2_SCHEME)
    === fieldDigestFor(new URLSearchParams({ paykey: 'P', customer_email: '', product_name: '', transaction_type: 'SALE', date: '' }).toString(), JV_SECRET, JVZOO_IPN_V2_SCHEME))
check('K10: the header argument is ignored — the digest is never taken from a header',
  verifyMarketplaceSignature(jvForm(), JV_EXPECTED, JV_SECRET, JVZOO_IPN_V2_SCHEME).ok === false)
check('K11: the registry now carries the scheme, so the provider is no longer unknown',
  marketplaceProvider('jvzoo')?.signature?.kind === 'field_digest')

// The parser.
const jvParse = marketplaceParser('jvzoo')
check('K12: jvzoo has a parser', typeof jvParse === 'function')
const sale = jvParse?.(jvForm(), 'application/x-www-form-urlencoded') ?? null
check('K13: a SALE is a paid order keyed on the transaction id',
  sale?.kind === 'paid' && sale.externalOrderId === 'ABC123XYZ' && sale.externalProductId === 'JV-ADV')
check('K14: total is DOLLARS in v2 and becomes minor units',
  sale?.amountMinor === 4700)
check('K15: no currency is claimed, because the payload carries none',
  sale?.currency === null)
check('K16: the period end is the next payment, as an instant',
  sale?.currentPeriodEnd === '2026-11-29T09:15:00Z')
const rebill = jvParse?.(jvForm({ transaction_type: 'BILL', transaction_id: 'ABC123XYZ-B001' }), null) ?? null
check('K17: a rebill is a paid order with its OWN id, so idempotency does not swallow it',
  rebill?.kind === 'paid' && rebill.externalOrderId === 'ABC123XYZ-B001')
check('K18: RFND is a refund, which a person then decides about',
  jvParse?.(jvForm({ transaction_type: 'RFND' }), null)?.kind === 'refunded')
check('K19: an unknown transaction type is ignored rather than guessed at',
  jvParse?.(jvForm({ transaction_type: 'CGBK' }), null) === null)
check('K20: a one-off sale with no dates has no period end invented for it',
  jvParse?.(jvForm({ product_type: 'STANDARD', next_payment_date: '' }), null)?.currentPeriodEnd === null)

// MUTATION CONTROLS for J.
check('K-MUT1: dropping the trailing separator before the secret changes the digest',
  fieldDigestFor(jvForm(), JV_SECRET, { ...JVZOO_IPN_V2_SCHEME, trailingSeparator: false }) !== JV_EXPECTED)
check('K-MUT2: signing the fields in a different order changes the digest',
  fieldDigestFor(jvForm(), JV_SECRET, { ...JVZOO_IPN_V2_SCHEME, fields: ['customer_email', 'paykey', 'product_name', 'transaction_type', 'date'] }) !== JV_EXPECTED)
check('K-MUT3: reading total as minor units would record 47 agorot instead of 47 dollars',
  Number.parseFloat('47.00') !== 4700)

// Sections F to I need await, and tsx compiles these suites as CommonJS,
// where top-level await is not available. One async main, called at the end.
async function main() {
  // ── F. What a verified event does ───────────────────────────────────────────

  console.log('\nF. intake')
  const paid = (over: Partial<MarketplaceOrderEvent> = {}): MarketplaceOrderEvent => ({
    kind: 'paid',
    externalOrderId: 'A-1',
    externalProductId: 'PROD-ADV',
    buyerEmail: 'Buyer@Example.COM',
    amountMinor: 17900,
    currency: 'USD',
    currentPeriodEnd: '2026-11-15T00:00:00.000Z',
    ...over,
  })

  let admin = new FakeAdmin({ marketplace_orders: [] })
  let outcome = await recordMarketplaceOrder(admin, 'digistore24', paid())
  check('F1: a paid order is recorded', outcome.kind === 'recorded')
  check('F2: on the plan OUR configuration maps the product to',
    outcome.kind === 'recorded' && outcome.plan === 'advanced')
  check('F3: and the buyer gets a claim url, not an entitlement',
    outcome.kind === 'recorded' && outcome.claimUrl.includes('/claim?order='))
  const rows = admin.tables.marketplace_orders as Record<string, unknown>[]
  check('F4: exactly one row was written', rows.length === 1)
  check('F5: the email is stored lower-cased, as the column demands',
    rows[0].buyer_email === 'buyer@example.com')
  check('F6: the period end is the platform\'s own value, not a computed one',
    rows[0].current_period_end === '2026-11-15T00:00:00.000Z')
  check('F7: the claim token is long enough for the column and unguessable',
    typeof rows[0].claim_token === 'string' && (rows[0].claim_token as string).length >= 32)
  check('F8: nothing touched subscriptions or billing_governance',
    !admin.tables.subscriptions?.length && !admin.tables.billing_governance?.length)

  admin = new FakeAdmin({ marketplace_orders: [] })
  outcome = await recordMarketplaceOrder(admin, 'digistore24', paid({ externalProductId: 'PROD-UNMAPPED' }))
  check('F9: an unmapped product records NOTHING',
    outcome.kind === 'unknown_product' && (admin.tables.marketplace_orders as unknown[]).length === 0)
  outcome = await recordMarketplaceOrder(admin, 'digistore24', paid({ externalOrderId: '  ' }))
  check('F10: an event with no order id is invalid', outcome.kind === 'invalid_event')
  outcome = await recordMarketplaceOrder(admin, 'digistore24', paid({ buyerEmail: 'not-an-email' }))
  check('F11: so is one with no usable buyer email', outcome.kind === 'invalid_event')
  outcome = await recordMarketplaceOrder(admin, 'digistore24', paid({ amountMinor: 1.5, currency: 'dollars' }))
  check('F12: a non-integer amount and a non-ISO currency are dropped rather than stored',
    outcome.kind === 'recorded'
    && (admin.tables.marketplace_orders as Record<string, unknown>[]).at(-1)?.amount_minor === null
    && (admin.tables.marketplace_orders as Record<string, unknown>[]).at(-1)?.currency === null)

  // The redelivery: the database refuses the duplicate, and that IS the answer.
  admin = new FakeAdmin({ marketplace_orders: [] }, { marketplace_orders: { insert: () => ({ message: 'duplicate key value violates unique constraint', code: '23505' }) } })
  outcome = await recordMarketplaceOrder(admin, 'digistore24', paid())
  check('F13: a redelivered order is "already recorded", not an error', outcome.kind === 'already_recorded')
  admin = new FakeAdmin({ marketplace_orders: [] }, { marketplace_orders: { insert: () => ({ message: 'connection refused', code: '08006' }) } })
  outcome = await recordMarketplaceOrder(admin, 'digistore24', paid())
  check('F14: a genuine write failure is reported as one', outcome.kind === 'write_failed')
  check('F15: and answers 500 so the platform retries it',
    httpStatusForMarketplaceOutcome(outcome) === 500)

  admin = new FakeAdmin({ marketplace_orders: [{ id: 'o1', provider: 'digistore24', external_order_id: 'A-1', status: 'claimed' }] })
  outcome = await recordMarketplaceOrder(admin, 'digistore24', paid({ kind: 'refunded' }))
  check('F16: a refund is recorded and handed to a person, never auto-revoked',
    outcome.kind === 'operator_attention'
    && (admin.tables.marketplace_orders as Record<string, unknown>[])[0].status === 'refunded')
  check('F17: and it answers 200, because retrying teaches us nothing',
    httpStatusForMarketplaceOutcome(outcome) === 200)
  admin = new FakeAdmin({ marketplace_orders: [] })
  outcome = await recordMarketplaceOrder(admin, 'digistore24', paid({ kind: 'refunded' }))
  check('F18: a refund for an order we never saw is reported, not invented',
    outcome.kind === 'order_unknown')

  // ── G. The claim's answers ──────────────────────────────────────────────────
  console.log('\nG. claim')
  function rpcAdmin(answer: unknown) {
    const a = new FakeAdmin({})
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    ;(a as any).rpc = async () => ({ data: answer, error: null })
    return a
  }
  check('G1: "claimed" is a claim', (await claimMarketplaceOrder(rpcAdmin('claimed'), 'u1', 't')).kind === 'claimed')
  check('G2: a reload is not an error',
    (await claimMarketplaceOrder(rpcAdmin('already_claimed_by_this_account'), 'u1', 't')).kind === 'already_claimed')
  check('G3: a spent or unknown receipt is simply unavailable',
    (await claimMarketplaceOrder(rpcAdmin('order_unavailable'), 'u1', 't')).kind === 'unavailable')
  const needsOp = await claimMarketplaceOrder(rpcAdmin('period_end_unknown'), 'u1', 't')
  check('G4: a missing period end goes to a person rather than being guessed',
    needsOp.kind === 'needs_operator' && needsOp.why === 'period_end_unknown')
  check('G5: so does an account that already breaks the one-entitlement invariant',
    (await claimMarketplaceOrder(rpcAdmin('multiple_current_entitlement_rows'), 'u1', 't')).kind === 'needs_operator')
  check('G6: an answer this code does not recognise is NEVER read as success',
    (await claimMarketplaceOrder(rpcAdmin('surprise'), 'u1', 't')).kind === 'failed')
  check('G7: a null answer is not success either',
    (await claimMarketplaceOrder(rpcAdmin(null), 'u1', 't')).kind === 'failed')
  check('G8: no account and no token claim nothing, without a call',
    (await claimMarketplaceOrder(rpcAdmin('claimed'), '', 't')).kind === 'unavailable'
    && (await claimMarketplaceOrder(rpcAdmin('claimed'), 'u1', '  ')).kind === 'unavailable')
  const threw = new FakeAdmin({})
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  ;(threw as any).rpc = async () => { throw new Error('socket hang up') }
  check('G9: a thrown rpc is a retryable failure, not a refusal',
    (await claimMarketplaceOrder(threw, 'u1', 't')).kind === 'failed')

  // MUTATION CONTROL for G: a mapper that treats an unknown answer as success
  // would pass G1-G5 and fail G6, which is the point of G6.
  const lenientMap = (answer: string) => (answer === 'order_unavailable' ? 'unavailable' : 'claimed')
  check('G-MUT: a lenient outcome mapper would call "surprise" a claim',
    lenientMap('surprise') === 'claimed')

  // ── H. Source guards on the route and the pages ─────────────────────────────
  console.log('\nH. source guards')
  const ROUTE = 'app/api/marketplace/[provider]/webhook/route.ts'
  // Top-level, not under app/(public): that group is Hebrew by the route
  // contract, and this page is English (lib/i18n/request-locale.ts).
  const SALES = 'app/go/[platform]/page.tsx'
  const CLAIM_PAGE = 'app/(dashboard)/claim/page.tsx'
  const routeSrc = code(ROUTE)
  const salesSrc = code(SALES)
  const claimSrc = code(CLAIM_PAGE)

  const verifyAt = routeSrc.indexOf('verifyMarketplaceSignature')
  const parseAt = routeSrc.indexOf('parser(rawBody')
  check('H1: the route verifies the signature', verifyAt > 0)
  check('H2: and it does so BEFORE the body is parsed as an event', parseAt > verifyAt)
  check('H3: the readiness gate comes before either',
    routeSrc.indexOf('providerReadiness') < verifyAt)
  check('H4: the raw body is read as text, never re-serialised',
    /await request\.text\(\)/.test(routeSrc) && !/request\.json\(\)/.test(routeSrc))
  check('H5: a refused delivery never answers 2xx',
    /const status = verified\.reason === 'missing_secret' \|\| verified\.reason === 'unknown_scheme' \? 503 : 401/.test(routeSrc)
    && /status \}\)|\{ status \}/.test(routeSrc))
  check('H6: the route never writes an entitlement itself',
    !/subscriptions|billing_governance|transitionSubscriptionToActivePlan/.test(routeSrc))

  check('H7: the sales page is noindex',
    /robots:\s*\{\s*index:\s*false/.test(salesSrc))
  // The claim page states NO robots of its own: the dashboard group's layout
  // already sets noindex for every page in it, and a page that repeats the
  // setting is a page that can quietly disagree with it later.
  check('H8: the claim page leaves robots to its group layout, which says noindex',
    !/robots:/.test(claimSrc)
    && /robots:\s*\{\s*index:\s*false/.test(code('app/(dashboard)/layout.tsx')))
  check('H9: the sales page offers the platform\'s button and never our own checkout',
    /marketplaceBuyUrl/.test(salesSrc) && !/\/billing|creem|paypal/i.test(salesSrc))
  check('H10: an unregistered platform is a 404 rather than a blank page',
    /notFound\(\)/.test(salesSrc))
  check('H11: the sales page links out only to our account terms, our privacy page and the platform\'s own policy',
    // No raw anchor to a path of ours anywhere: every <a> on the page takes a
    // configured https url (the platform's buy button and its policy page),
    // and the only two internal links are the two documents that govern the
    // ACCOUNT. Our refund policy is not among them, by H18.
    !/<a href="\//.test(salesSrc)
    && (salesSrc.match(/<Link href="\/[^"]+"/g) ?? []).length === 2
    && (salesSrc.match(/<Link href="\/[^"]+"/g) ?? []).every((l) => /terms|privacy/.test(l)))
  check('H12: the claim page requires an account before it claims anything',
    claimSrc.indexOf('auth.getUser') < claimSrc.indexOf('claimMarketplaceOrder(createAdminClient')
    && /if \(!user\) redirect/.test(claimSrc))
  check('H13: and it tells the visitor nothing about WHICH failure occurred',
    !/no such|already spent|refunded/i.test(claimSrc.split('const message')[1] ?? ''))

  // MUTATION CONTROLS for H: the same patterns against a broken copy.
  const brokenRoute = routeSrc.replace('await request.text()', 'JSON.stringify(await request.json())')
  check('H-MUT1: the raw-body guard catches a route that re-serialises the body',
    !(/await request\.text\(\)/.test(brokenRoute) && !/request\.json\(\)/.test(brokenRoute)))
  const brokenOrder = 'const event = parser(rawBody, null)\nconst verified = verifyMarketplaceSignature(a,b,c,d)'
  check('H-MUT2: the ordering guard catches parsing before verifying',
    !(brokenOrder.indexOf('parser(rawBody') > brokenOrder.indexOf('verifyMarketplaceSignature')))
  const brokenSales = salesSrc.replace('robots: { index: false, follow: false }', 'robots: { index: true }')
  check('H-MUT3: the noindex guard catches an indexable sales page',
    !/robots:\s*\{\s*index:\s*false/.test(brokenSales))
  check('H-MUT3b: the claim-page guard catches a page that sets robots itself',
    /robots:/.test(`${claimSrc}\nexport const metadata = { robots: { index: true } }`))
  // Ported from components/public/__qa__/public-design.qa.ts: that guard scans
  // app/(public), and this page had to leave the group to be English. The rule
  // follows the file rather than the directory, so it lives here now.
  const OFF_TOKEN: { label: string; re: RegExp }[] = [
    { label: 'bare white/black utility', re: /\b(?:bg|text|border)-(?:white|black)\b(?!\/)/ },
    { label: 'off-scale type size', re: /\btext-(?:xs|sm|base|lg|xl|[2-9]xl)\b|\btext-\[\d/ },
    { label: 'off-scale radius', re: /\brounded-(?:sm|md|lg|xl|2xl|3xl|full)\b/ },
    { label: 'off-scale shadow', re: /\bshadow-(?:sm|md|lg|xl|2xl)\b/ },
    { label: 'raw palette colour', re: /\b(?:bg|text|border)-(?:gray|slate|zinc|neutral|stone|red|blue|green|emerald|indigo|violet|purple|pink|amber|yellow|orange|teal|cyan|sky|rose|lime|fuchsia)-\d{2,3}\b/ },
  ]
  const offTokens = (src: string) => OFF_TOKEN.filter(({ re }) => re.test(src)).map(({ label }) => label)
  // A page that prints $79 and says nothing about tax breaks the standing
  // pricing rule, and on a reseller page the seller's identity is the other
  // half of the same sentence.
  check('H15: the page says who charges the buyer and that the price is before tax',
    /is the seller for this purchase: it\s*\n?\s*charges you, issues your invoice/.test(salesSrc)
    && /prices above are before tax/.test(salesSrc))
  check('H-MUT6: the tax guard catches a price shown with no tax line',
    !/prices above are before tax/.test('<p>${plan.priceUSD} / month</p>'))
  check('H16: it says the plan renews monthly and where to cancel it',
    /renews every month until you cancel/.test(salesSrc)
    && /cancel it at \{provider\.label\}/.test(salesSrc))
  /*
   * WHERE WE ARE THE SELLER, THE TAX SENTENCE IS OURS TO STAND BEHIND.
   * The first version of this branch said any tax due "is shown at checkout
   * before you pay" - a claim about JVZoo's checkout, which we have not read
   * and do not control. If their checkout adds no EU VAT, we have told the
   * buyer something untrue about a liability that s.11 of their own vendor
   * agreement puts on us. Legal's approved wording states the price and
   * nothing about anybody's checkout.
   */
  check('H15b: on a page where WE are the seller, the price is stated as excluding tax in the buyer\'s country',
    /prices above are in US dollars and do not include VAT or any other tax due/.test(salesSrc))
  // Matched against a whitespace-normalised copy, because JSX wraps a
  // sentence across lines wherever the formatter chooses to.
  const salesFlat = salesSrc.replace(/\s+/g, ' ')
  check('H15c: \u2026and no sentence describes the platform\'s checkout behaviour, which we cannot vouch for',
    !/shown at checkout before you pay/.test(salesFlat)
    && !/takes the payment on our behalf[^.]*calculates tax/.test(salesFlat))
  check('H-MUT6b: the guard catches the checkout claim coming back',
    /shown at checkout before you pay/.test(
      'any tax due where you are is shown at checkout before you pay'))
  /*
   * THE ATTRIBUTION LINE. A platform's mandated block may contradict the
   * seller paragraph above it - JVZoo's says it "serves as the retailer" while
   * its own agreement makes us the seller. Full size above it was not enough:
   * a page that answers "who am I buying from" twice misleads under CRD
   * Art. 6(1)(b)-(c) whatever the font. Naming the speaker resolves it, so the
   * heading is part of the disclosure and not a label.
   */
  check('H18b: a mandated disclaimer is published under a line naming the platform as its author',
    /Notice required by \{provider\.label\}:/.test(salesSrc)
    && salesSrc.indexOf('Notice required by') < salesSrc.indexOf('{provider.requiredDisclaimer}'))
  check('H18c: …and it is still rendered only when one exists, so a platform without one gets no empty heading',
    /\{provider\.requiredDisclaimer \? \(/.test(salesSrc))
  check('H-MUT10: the attribution guard catches the block printed as our own words',
    !/Notice required by/.test('<p className="mt-8">{provider.requiredDisclaimer}</p>'))
  /*
   * WHAT THE ROOT LAYOUT PUTS ON THIS PAGE, which the guards above cannot see
   * because they read the page's own source. H14 pins that the page links out
   * only to our terms, our privacy and the platform's policy; that was false
   * in production, because app/layout.tsx renders the public contact widgets
   * around every unauthenticated page - a WhatsApp button, a "free demo"
   * float and a mobile contact bar. Beside a platform's buy button those are
   * the alternative route a compliance review refuses, and a visitor who came
   * through an affiliate's link taking one of them is a sale the affiliate
   * never gets credited for. Read from the widget module, not asserted about
   * it.
   */
  {
    // Comments stripped before matching, per the project's QA convention:
    // the explanatory notes in that module name isMarketplaceSalesArea too.
    const widgets = code('components/public/PublicSiteWidgets.tsx')
    const gate = widgets.slice(widgets.indexOf('export function shouldRenderPublicWidgets'))
    check('H19: the public contact widgets do not render on /go/<platform>',
      /if \(isMarketplaceSalesArea\(pathname\)\) return false/.test(gate)
      && /pathname\.startsWith\(`\$\{MARKETPLACE_SALES_PREFIX\}\/`\)/.test(widgets)
      && /MARKETPLACE_SALES_PREFIX = '\/go'/.test(widgets))
    check('H-MUT11: the guard catches the widgets being left on the page',
      !/if \(isMarketplaceSalesArea\(pathname\)\) return false/.test(
        gate.replace('if (isMarketplaceSalesArea(pathname)) return false', '')))
    /*
     * …and the cookie notice is the ONE thing that stays. The beacon fires
     * only on a marketing grant, so a sales page with no way to answer the
     * banner is a sales page whose beacon can never fire - which would satisfy
     * the consent rule by making the platform's requirement impossible.
     */
    const notice = widgets.slice(widgets.indexOf('export function PublicConsentNotice'))
    const noticeBody = notice.slice(0, notice.indexOf('export function PublicSiteWidgets'))
    check('H19b: the cookie notice is NOT dropped with them, so the beacon can still be consented to',
      !/isMarketplaceSalesArea/.test(noticeBody))
    check('H-MUT12: the guard catches the notice being gated away too',
      /isMarketplaceSalesArea/.test(
        noticeBody.replace('isNonPublicArea(pathname)', 'isMarketplaceSalesArea(pathname)')))
  }
  // A conversion pixel is a marketing tag, and marketing tags on this site
  // load only after consent (lib/consent/categories.ts). The page carried no
  // pixel at all until JVZoo's review made one a condition of listing; it now
  // carries exactly one, and only through the consent-gated component.
  check('H17: the page loads no third-party script, so nothing fires before consent',
    !/<script/.test(salesSrc))
  check('H-MUT7: the script guard catches a script added to the page',
    /<script/.test(`${salesSrc}\n<script async src={pixel} />`))
  check('H17b: the pixel is rendered only through the consent-gated component, never as a bare tag',
    /<MarketplacePixel/.test(salesSrc)
    && /from '@\/components\/consent\/MarketplacePixel'/.test(salesSrc)
    && !/<img/.test(salesSrc))
  check('H-MUT9: the bare-tag guard catches the platform snippet pasted straight in',
    /<img/.test(`${salesSrc}\n<img src={pixelUrl} width={1} height={1} />`))
  check('H17c: …and only for a configured beacon, so an unconfigured platform still renders nothing',
    /pixelUrls\.map\(/.test(salesSrc)
    && /\.filter\(\(url\): url is string => url !== null\)/.test(salesSrc))
  check('H17c2: one beacon per plan the page actually offers, so each product gets its own stats',
    /marketplacePixelUrl\(provider\.slug, code\)/.test(salesSrc)
    && /marketplaceBuyUrl\(provider\.slug, code\)\)/.test(salesSrc)
    && /new Set\(/.test(salesSrc))
  check('H-MUT9b: the per-plan guard catches a page that resolves one provider-wide beacon again',
    !/marketplacePixelUrl\(provider\.slug, code\)/.test(
      salesSrc.replace(/marketplacePixelUrl\(provider\.slug, code\)/g, 'marketplacePixelUrl(provider.slug)')))
  {
    // The gate itself, read from the component rather than asserted about it.
    const pixelSrc = readFileSync('components/consent/MarketplacePixel.tsx', 'utf8')
    check('H17d: the component shows nothing until marketing has been granted',
      /marketingBeaconAllowed\(currentChoices\(\)\)/.test(pixelSrc)
      && /choices\.marketing === true/.test(pixelSrc)
      && /if \(!allowed\) return null/.test(pixelSrc))
    check('H17e: …and re-reads the decision when it changes, so a withdrawal removes it',
      /addEventListener\(CONSENT_CHANGED_EVENT/.test(pixelSrc)
      && /removeEventListener\(CONSENT_CHANGED_EVENT/.test(pixelSrc))
    check('H-MUT13: the gate guard catches the marketing check swapped for analytics',
      !/choices\.marketing === true/.test(
        pixelSrc.replace('choices.marketing === true', 'choices.analytics === true')))

    // H17f. THE DENIED CASE, PROVEN. Everything above reads the file; a gate
    // can be deleted and a file still mention the word. These call the real
    // gate with every state the consent store is able to hand a mount, and
    // render the real component for the frame the visitor actually gets before
    // any effect has run - which is the frame the beacon must not be in.
    const state = (marketing: boolean, analytics = false): ConsentChoices =>
      ({ necessary: true, analytics, marketing })
    check('H17f: no decision yet - the store returns CONSENT_DENIED and the beacon is refused',
      marketingBeaconAllowed(CONSENT_DENIED) === false)
    check('H17g: a reject-all - refused',
      marketingBeaconAllowed(state(false)) === false)
    check('H17h: analytics allowed, marketing refused - still refused, because the categories are honoured apart',
      marketingBeaconAllowed(state(false, true)) === false)
    check('H17i: marketing granted - and only then is it allowed',
      marketingBeaconAllowed(state(true)) === true)
    check('H17j: a record with no marketing key at all is refused, not treated as a grant',
      marketingBeaconAllowed({ necessary: true, analytics: true } as unknown as ConsentChoices) === false)
    const firstPaint = renderToStaticMarkup(
      createElement(MarketplacePixel, { src: 'https://i.jvzoo.com/0/457483/99', alt: '' }))
    check('H17k: the component renders NOTHING on the pre-consent paint, so i.jvzoo.com is never in the document',
      firstPaint === '' && !firstPaint.includes('jvzoo'))
    check('H-MUT14: the denied-case guard catches a gate that was taken out',
      renderToStaticMarkup(createElement(
        function UngatedPixel({ src }: { src: string }) {
          return createElement('img', { src, alt: '', width: 1, height: 1 })
        }, { src: 'https://i.jvzoo.com/0/457483/99' })).includes('jvzoo'))
    check('H-MUT15: …and the state guard catches a gate loosened to anything truthy',
      ((choices: ConsentChoices) => Boolean(choices.marketing))(
        { necessary: true, analytics: true, marketing: 1 as unknown as boolean }) === true
      && marketingBeaconAllowed(
        { necessary: true, analytics: true, marketing: 1 as unknown as boolean }) === false)
  }
  // Our refund policy says WE do not refund, which is not this buyer's
  // policy: their seller is the platform.
  check('H18: it does not point the buyer at our refund policy, which is not theirs',
    !/refund-policy/.test(salesSrc) && /marketplacePolicyUrl/.test(salesSrc))
  check('H-MUT8: the refund-link guard catches our own policy linked back in',
    /refund-policy/.test('<Link href="/en/refund-policy">Refunds</Link>'))

  check('H14: the sales page is on the design tokens, like every other page we publish',
    offTokens(salesSrc).length === 0, offTokens(salesSrc).join(' | '))
  check('H-MUT5: the token guard catches the bg-black button this page started with',
    offTokens('<a className="rounded-lg bg-black text-3xl" />').length === 3)

  const brokenLinks = '<Link href="/en/pricing">Pricing</Link>'
  check('H-MUT4: the outbound-link guard catches a link the platforms forbid',
    !(brokenLinks.match(/<Link href="\/[^"]+"/g) ?? []).every((l) => /terms|privacy/.test(l)))

  // ── L. The beacon's lawful basis, which is three files or none ──────────────
  // The gate above proves the beacon waits for a marketing grant. It does not
  // prove the grant COVERS it. Until 2026-10-29 the category named a closed
  // list of two recipients, the Google and Meta networks, so a stored grant
  // did not reach an affiliate marketplace; widening what an existing grant
  // covers is not consent. Three things make the wording lawful and they are
  // worthless apart: the category naming JVZoo in every language a visitor can
  // decide in, the privacy document naming JVZoo as a recipient in that same
  // language, and a policy version later than the old wording, which is what
  // turns the old stored decisions back into questions. A deploy carrying any
  // two of the three leaves the beacon firing on a grant nobody gave, so this
  // section fails on the missing one rather than on the beacon.
  console.log('\nL. the beacon\'s lawful basis across the six languages')
  const CONSENT_LOCALES = ['he', 'en', 'es', 'pt-BR', 'fr', 'it'] as const
  const PRIVACY_DOC: Record<string, string> = {
    he: 'app/(legal)/privacy/page.tsx',
    en: 'app/(public)/en/privacy/page.tsx',
    es: 'content/legal/es/privacy.md',
    'pt-BR': 'content/legal/pt-BR/privacy.md',
    fr: 'content/legal/fr/privacy.md',
    it: 'content/legal/it/privacy.md',
  }
  /** The marketing category's own description, cut out of the public dictionary. */
  const marketingDesc = (locale: string): string => {
    const dict = read(`lib/i18n/public/${locale}.ts`)
    const at = dict.indexOf('marketing:')
    if (at < 0) return ''
    const desc = dict.slice(at).match(/desc:\s*'((?:[^'\\]|\\.)*)'/)
    return desc?.[1] ?? ''
  }
  /** The consent condition as each document actually words it, inside the JVZoo entry. */
  const BEACON_CONSENT_CLAUSE: Record<string, string> = {
    he: 'התמונה נטענת רק לאחר שאישרת עוגיות שיווק',
    en: 'image loads only after you have accepted marketing cookies',
    es: 'después de que usted haya aceptado las cookies de marketing',
    'pt-BR': 'depois de você aceitar os cookies de marketing',
    fr: 'après votre acceptation des cookies de marketing',
    it: 'dopo che Lei ha accettato i cookie di marketing',
  }
  for (const locale of CONSENT_LOCALES) {
    const desc = marketingDesc(locale)
    check(`L1 (${locale}): the marketing category names JVZoo, so the grant reaches the beacon`,
      desc.includes('JVZoo'), desc.slice(0, 60))
    check(`L2 (${locale}): …and it still names the two networks it always covered`,
      /Google/.test(desc) && /Meta/.test(desc))
    const doc = read(PRIVACY_DOC[locale])
    check(`L3 (${locale}): the privacy document names JVZoo as a recipient`,
      doc.includes('JVZoo'))
    // The clause has to be found INSIDE the recipients entry, not merely
    // somewhere near the word "marketing". The first version of this check
    // looked for JVZoo within 1200 characters of "marketing" anywhere in the
    // document, and the marketing CATEGORY — which names JVZoo twice and is
    // called Marketing — satisfied that window on its own, so the check passed
    // with the consent condition deleted from the entry. The legal thread
    // reproduced it on the Spanish document. Bind it to the sentence instead,
    // the way this repo's other legal guards do, and prove the deletion fails.
    const clause = BEACON_CONSENT_CLAUSE[locale]
    const inEntry = (text: string) =>
      new RegExp(`JVZoo\\s*:[\\s\\S]{0,700}${clause.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}`).test(text)
    check(`L4 (${locale}): the entry ITSELF says the image waits for the marketing consent`,
      inEntry(doc), clause)
    check(`L-MUT4 (${locale}): …and deleting that clause from the real document fails it`,
      !inEntry(doc.replace(clause, '')))
  }
  const consentPolicy = code('lib/consent/categories.ts')
  const policyVersion = consentPolicy.match(/CONSENT_POLICY_VERSION = '([^']+)'/)?.[1] ?? ''
  check('L5: the policy version is later than the two-recipient wording, so stored grants are re-asked',
    policyVersion >= '2026-10-29', policyVersion)
  // L1 and L3 are substring tests on the real files, so they cannot pass for
  // the wrong reason and their "controls" would only restate them; the two
  // one rule with indirection is controlled instead: L-MUT4 above deletes the
  // clause from the real document. This one is for the comparison itself, because
  // the threshold is a date and the operator is lexicographic.
  check('L-MUT2: the version guard catches a deploy that widens the category without re-asking',
    !('2026-10-03' >= '2026-10-29') && '2026-11-01' >= '2026-10-29')

  // ── J. The cancellation route the buyer is actually given ───────────────────
  console.log('\nJ. cancelling a marketplace plan')
  const BILLING_PAGE = 'app/(dashboard)/billing/page.tsx'
  const BILLING_VIEW = 'app/(dashboard)/billing/BillingView.tsx'
  const billingPage = code(BILLING_PAGE)
  const billingView = code(BILLING_VIEW)

  // Before this, a marketplace buyer fell through to "contact us and we will
  // stop the billing for you" — an offer we cannot honour, because we hold no
  // payment instrument for that subscription.
  check('J1: the screen names the marketplace that holds the subscription',
    /marketplaceSeller/.test(billingView) && /cancelAtMarketplace/.test(billingView))
  check('J2: and it does so BEFORE falling through to the contact-us answer',
    billingView.indexOf('marketplaceSeller ?') < billingView.indexOf('contactToCancel'))
  // The BRANCH itself, not the file: handleCancel lives further down the file
  // for the PayPal case, and that is correct.
  const sellerBranch = billingView.slice(billingView.indexOf('marketplaceSeller ? ('),
    billingView.indexOf('hasPaypalSubscriptionId ? ('))
  check('J3: it never offers our own cancel request for such a subscription',
    sellerBranch.length > 0 && !/handleCancel|paypal\/cancel/.test(sellerBranch))
  check('J4: the seller is read with the service role, since the orders table is server-only',
    /from\('marketplace_orders'\)/.test(billingPage) && /createAdminClient\(\)/.test(billingPage))
  check('J5: …and filtered by the owner as well as the id, because that client bypasses RLS',
    new RegExp("from\\('marketplace_orders'\\)[\\s\\S]{0,300}eq\\('claimed_by', user\\.id\\)").test(billingPage))
  check('J6: an unregistered slug in the row names no seller at all',
    /marketplaceProvider\(order\?\.provider\)/.test(billingPage) && /if \(provider\)/.test(billingPage))
  check('J-MUT3: the branch guard catches a cancel button put in that branch',
    /handleCancel/.test(`${sellerBranch}<Button onClick={handleCancel} />`))
  check('J-MUT1: the ordering guard catches the contact-us answer coming first',
    !('contactToCancel marketplaceSeller ?'.indexOf('marketplaceSeller ?') < 'contactToCancel marketplaceSeller ?'.indexOf('contactToCancel')))
  check('J-MUT2: the ownership guard catches a lookup by id alone',
    !new RegExp("from\\('marketplace_orders'\\)[\\s\\S]{0,300}eq\\('claimed_by', user\\.id\\)")
      .test("from('marketplace_orders').select('provider').eq('id', activeSub.marketplace_order_id).maybeSingle()"))

  // The words exist in every language the dashboard speaks: a cancellation
  // route a reader cannot read is not a route.
  const CANCEL_COPY = ['lib/i18n/dashboard/he.ts', 'lib/i18n/dashboard/en.ts',
    'lib/i18n/dashboard/es.ts', 'lib/i18n/dashboard/pt-BR/billing.ts']
  const missingCopy = CANCEL_COPY.filter((f) => !/cancelAtMarketplace/.test(read(f))
    || !/marketplacePolicyLink/.test(read(f)))
  check('J7: all four dashboard languages carry the cancellation wording',
    missingCopy.length === 0, missingCopy.join(' | '))
  // The sentence identifies the seller, so the name in it is the platform's
  // own trading name from the registry — never a slug and never our shorthand.
  check('J8: the seller is named by the registry label, not by the stored slug',
    /label: provider\.label/.test(billingPage) && !/label: order\?\.provider/.test(billingPage))
  check('J9: …and every registered platform has a label a buyer would recognise',
    MARKETPLACE_PROVIDERS.every((p) => p.label.length > 2 && p.label !== p.slug))
  check('J-MUT4: the label guard catches the raw slug put in its place',
    /label: order\?\.provider/.test('label: order?.provider,'))
  // The second resort names what WE can do and no more: a plan ended on our
  // side is in our power, stopping their charge is not.
  const enCancel = read('lib/i18n/dashboard/en.ts')
  check('J10: the line offers a route that does not depend on the platform answering',
    /cannot reach \$\{seller\}, write to us and we will end your plan on our side/.test(enCancel)
    && /Only \$\{seller\} can stop the charge/.test(enCancel))
  // The Hebrew follows this dictionary's own patterns, which the legal review
  // read out of the file: no gender assigned to a foreign trade name (Hebrew
  // has none settled for one), התוכנית rather than מסלול, and a maqaf before
  // a Latin name, as the file writes ב-Shopify and never בShopify.
  const heCancel = /cancelAtMarketplace: \(seller: string\) => `([^`]*)`/
    .exec(read('lib/i18n/dashboard/he.ts'))?.[1] ?? ''
  const hebrewFollowsTheFile = heCancel !== ''
    && !/\$\{seller\} (?:יכולה|יכול|עוצרת|עוצר)/.test(heCancel)
    && /אפשר לעצור רק אצל/.test(heCancel)
    && /התוכנית/.test(heCancel) && !/מסלול/.test(heCancel)
    && !/[בל]\$\{seller\}/.test(heCancel)
  check('J11: the Hebrew assigns no gender to the platform and uses the file\'s own words',
    hebrewFollowsTheFile, heCancel)
  check('J-MUT6: a gendered verb on the platform name is caught',
    /\$\{seller\} יכולה/.test('את החיוב רק ${seller} יכולה לעצור'))
  check('J-MUT7: a missing maqaf before a Latin name is caught',
    /[בל]\$\{seller\}/.test('קניתם ב${seller}'))

  check('J-MUT5: a second resort that promises to stop the charge is caught',
    !/Only \$\{seller\} can stop the charge/.test('write to us and we will stop the billing for you'))

  // ── I. The migration's own promises, as written ──────────────────────────────
  console.log('\nI. migration')
  const MIG = 'supabase/migrations/20261016160000_marketplace_orders.sql'
  const migSrc = read(MIG)
  check('I1: the orders table has RLS enabled',
    /ALTER TABLE public\.marketplace_orders ENABLE ROW LEVEL SECURITY/.test(migSrc))
  check('I2: every browser role is revoked',
    /REVOKE ALL ON TABLE public\.marketplace_orders FROM PUBLIC, anon, authenticated, service_role/.test(migSrc))
  check('I3: the server may read, insert and update — and not delete',
    /GRANT SELECT, INSERT, UPDATE ON TABLE public\.marketplace_orders TO service_role/.test(migSrc)
    && !/GRANT[^;]*DELETE[^;]*marketplace_orders/.test(migSrc))
  check('I4: one purchase on one platform is one row',
    /UNIQUE \(provider, external_order_id\)/.test(migSrc))
  check('I5: the claim function is SECURITY DEFINER with an empty search_path',
    /CREATE OR REPLACE FUNCTION public\.claim_marketplace_order[\s\S]*?SECURITY DEFINER[\s\S]*?SET search_path = ''/.test(migSrc))
  check('I6: and only the server may execute it',
    /GRANT EXECUTE ON FUNCTION public\.claim_marketplace_order\(uuid, text\) TO service_role/.test(migSrc)
    && /REVOKE ALL ON FUNCTION public\.claim_marketplace_order\(uuid, text\) FROM PUBLIC, anon, authenticated/.test(migSrc))
  check('I7: the function refuses an order with no period end rather than computing one',
    /current_period_end IS NULL THEN RETURN 'period_end_unknown'/.test(migSrc))
  check('I8: it never rewrites signup_origin on an existing account',
    /ON CONFLICT \(user_id\) DO UPDATE[\s\S]*?billing_authority = 'marketplace'/.test(migSrc)
    && !/DO UPDATE[\s\S]{0,400}signup_origin =/.test(migSrc))
  check('I9: one order pays for one entitlement',
    /subscriptions_marketplace_order_id_unique/.test(migSrc))
  check('I10: and a row can still carry only one provider',
    /subscriptions_one_provider_per_row[\s\S]*?marketplace_order_id\s+IS NOT NULL THEN 1 ELSE 0 END\) <= 1/.test(migSrc))
}

main().then(() => {
  console.log(`\n${pass} passed, ${fail} failed`)
  if (fail > 0) process.exitCode = 1
})

export {}
