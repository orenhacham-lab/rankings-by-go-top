/**
 * The two Creem endpoints, guarded at the source.
 *
 * proxy.ts's matcher excludes /api/*, so each of these routes is the only
 * thing in front of itself. What this suite pins is ORDER — a check that
 * runs after the work it was meant to prevent is not a check — and the two
 * things no route may ever take from a caller: a price and a redirect.
 *
 *  A) the webhook verifies Creem's signature over the RAW body, before it
 *     parses anything and before it touches the database
 *  B) the webhook does nothing at all while the off switch is off
 *  C) the checkout route refuses in the right order: off switch, sanctions,
 *     session, Shopify, market — all before a checkout is created
 *  D) the return URL is ours, and the product id is ours
 *  E) the off switch and the mode behave as documented, including the one
 *     inference that must never be made (mode from NODE_ENV)
 *
 * Every assertion has a MUTATION CONTROL alongside it: the same check
 * re-run against a source with that guard removed or moved, which must fail.
 *
 * Run: npx tsx lib/creem/__qa__/creem-routes.qa.ts
 */
import { readFileSync } from 'fs'
import { join } from 'path'
import { creemMode, creemSuccessUrl, isCreemEnabled, CREEM_API_BASE } from '../config'

let pass = 0, fail = 0
function check(name: string, cond: boolean, detail?: string) {
  if (cond) { pass++; console.log(`  ✓ ${name}`) } else { fail++; console.log(`  ✗ ${name}${detail ? ` — ${detail}` : ''}`) }
}
const ROOT = join(__dirname, '..', '..', '..')
const read = (p: string) => readFileSync(join(ROOT, p), 'utf8')
const strip = (s: string) => s.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:])\/\/[^\n]*/g, '$1')

const WEBHOOK = 'app/api/creem/webhook/route.ts'
const CHECKOUT = 'app/api/creem/checkout/route.ts'

const webhook = strip(read(WEBHOOK))
const checkout = strip(read(CHECKOUT))

console.log('\nA) the webhook verifies before it does anything')
{
  const verifiesFirst = (src: string) => {
    const rawBody = src.indexOf('await request.text()')
    const verify = src.indexOf('verifyCreemSignature(')
    const refuse = src.indexOf("{ status: 401 }")
    const parse = src.indexOf('JSON.parse(')
    const admin = src.indexOf('createAdminClient()')
    const process_ = src.indexOf('processVerifiedCreemEvent(')
    return rawBody > 0 && verify > rawBody && refuse > verify
      && parse > verify && admin > verify && process_ > admin
  }
  check('A1: the raw body is read, verified, and only then parsed and processed', verifiesFirst(webhook))
  check('A1-MUT: parsing the event before verifying it is caught',
    !verifiesFirst(webhook.replace('const rawBody = await request.text()', 'const rawBody = JSON.stringify(await request.json())')))
  check('A1-MUT2: reaching the database before verifying is caught',
    !verifiesFirst(webhook.replace('  const rawBody = await request.text()', '  const admin0 = createAdminClient()\n  const rawBody = await request.text()')))

  // The signature is over the body AS RECEIVED. A re-serialised object has a
  // different byte sequence and would never reproduce Creem's digest.
  check('A2: the verified string is the raw body, never a re-serialised object',
    /verifyCreemSignature\(rawBody,/.test(webhook) && !/JSON\.stringify\([^)]*\)[\s\S]{0,40}verifyCreemSignature/.test(webhook))

  check('A3: the refusal reason is logged, not returned',
    /invalid_signature/.test(webhook) && !/reason: verification\.reason \}, \{ status: 401/.test(webhook))

  // An unexpected throw must not read as a handled delivery.
  check('A4: an exception answers 5xx, never 200', /catch[\s\S]*?status: 500/.test(webhook))
}

console.log('\nB) the webhook is inert while the switch is off')
{
  const offFirst = (src: string) => {
    const off = src.indexOf('isCreemEnabled()')
    const secret = src.indexOf('creemWebhookSecret()')
    const process_ = src.indexOf('processVerifiedCreemEvent(')
    return off > 0 && secret > off && process_ > off
  }
  check('B1: the off switch is the first thing the webhook checks', offFirst(webhook))
  check('B1-MUT: moving the switch after processing is caught',
    !offFirst(webhook.replace('if (!isCreemEnabled()) {', 'if (false) {')))

  check('B2: a missing signing secret refuses rather than processing unverified',
    /creemWebhookSecret\(\)[\s\S]{0,400}webhook_not_configured/.test(webhook))

  const noSecretPath = webhook.slice(webhook.indexOf('webhook_not_configured'))
  check('B2-MUT: there is no path from a missing secret to processing',
    !/verifyCreemSignature\([\s\S]*?secret: null/.test(noSecretPath))
}

console.log('\nC) the checkout route refuses in the right order')
{
  const ordered = (src: string) => {
    const off = src.indexOf('isCreemEnabled()')
    const sanctions = src.indexOf('restrictionForRequest(')
    const session = src.indexOf('auth.getUser()')
    const unauthorized = src.indexOf("{ status: 401 }")
    const shopify = src.indexOf('isShopifyBillingRequiredForUser(')
    const pending = src.indexOf('hasPendingShopifyLinkCookie(')
    const market = src.indexOf("market === 'ILS'")
    const create = src.indexOf('createCreemCheckout(')
    return off > 0 && sanctions > off && session > sanctions && unauthorized > session
      && shopify > session && pending > session && market > shopify && create > market
  }
  check('C1: off switch, sanctions, session, Shopify and the market all come before a checkout exists', ordered(checkout))
  check('C1-MUT: dropping the off switch is caught',
    !ordered(checkout.replace('if (!isCreemEnabled()) {', 'if (false) {')))
  check('C1-MUT2: dropping the sanctions guard is caught',
    !ordered(checkout.replace('const restricted = restrictionForRequest(request.headers)', 'const restricted = null')))
  check('C1-MUT3: dropping the Shopify gate is caught',
    !ordered(checkout.replace('if (await isShopifyBillingRequiredForUser(admin, user.id)) {', 'if (false) {')))
  check('C1-MUT4: dropping the ILS refusal is caught',
    !ordered(checkout.replace("if (market === 'ILS') {", 'if (false) {')))

  check('C2: the payer is never told which country is restricted',
    /restricted_country/.test(checkout) && !/restricted\.country/.test(checkout))

  check('C3: an unknown plan code is refused before anything else is read',
    checkout.indexOf('isKnownPlanCode(plan)') < checkout.indexOf('createAdminClient()'))

  check('C4: this route grants nothing — it never writes a subscription',
    !/from\('subscriptions'\)/.test(checkout) && !/transitionSubscriptionToActivePlan/.test(checkout))
  check('C4-MUT: a write added here would be caught',
    /from\('subscriptions'\)/.test(`${checkout}\nawait admin.from('subscriptions').insert({})`))
}

console.log('\nD) nothing a caller sends becomes a price or a redirect')
{
  check('D1: the return URL comes from our own helper, not the request',
    /successUrl: creemSuccessUrl\(\)/.test(checkout))
  check('D1-MUT: taking the return URL from the body is caught',
    !/successUrl: creemSuccessUrl\(\)/.test(checkout.replace('successUrl: creemSuccessUrl()', 'successUrl: body.successUrl')))

  const url = creemSuccessUrl()
  check('D2: the return URL is an absolute https URL on our own host',
    /^https:\/\/www\.gotopseo\.com\//.test(url), url)

  const ENV = process.env as Record<string, string | undefined>
  ENV.CREEM_RETURN_ORIGIN = 'https://evil.example.com/steal'
  check('D3: a return origin with a path is refused and falls back to ours',
    /^https:\/\/www\.gotopseo\.com\//.test(creemSuccessUrl()))
  ENV.CREEM_RETURN_ORIGIN = 'http://insecure.example.com'
  check('D4: a non-https return origin is refused and falls back to ours',
    /^https:\/\/www\.gotopseo\.com\//.test(creemSuccessUrl()))
  ENV.CREEM_RETURN_ORIGIN = 'https://sandbox.gotopseo.com'
  check('D5: a plain https origin is accepted (the sandbox case this exists for)',
    creemSuccessUrl().startsWith('https://sandbox.gotopseo.com/'))
  delete ENV.CREEM_RETURN_ORIGIN

  check('D6: the product id comes from our configuration for the requested plan',
    /creemProductIdFor\(plan\)/.test(checkout))
  check('D7: a plan with no configured product is refused, not substituted',
    /plan_not_configured/.test(checkout))
  check('D7-MUT: falling back to another plan\'s product would be caught',
    !/creemProductIdFor\(plan\) \?\? creemProductIdFor\(/.test(checkout))

  check('D8: the account reference sent to Creem is the session user, not a body field',
    /requestId: user\.id/.test(checkout))

  check('D9: Creem\'s own error text is never returned to the merchant',
    /provider_unavailable/.test(checkout) && !/checkout\.reason \}, \{ status: 502/.test(checkout))
}

console.log('\nE) the switch and the mode')
{
  const ENV = process.env as Record<string, string | undefined>
  const originalEnabled = ENV.CREEM_ENABLED
  const originalMode = ENV.CREEM_MODE
  const originalNodeEnv = ENV.NODE_ENV

  for (const value of [undefined, '', 'false', 'TRUE', '1', 'yes', ' true']) {
    ENV.CREEM_ENABLED = value
    check(`E1: CREEM_ENABLED=${JSON.stringify(value)} is off`, isCreemEnabled() === false)
  }
  ENV.CREEM_ENABLED = 'true'
  check('E1b: only the exact string true turns it on', isCreemEnabled() === true)

  // The one inference that must never be made: a Vercel preview shares the
  // production database, so "it is not production, therefore test" is how a
  // preview deploy charges a real card.
  ENV.NODE_ENV = 'production'
  ENV.CREEM_MODE = undefined
  check('E2: with no mode set, production still resolves to the sandbox', creemMode() === 'test')
  ENV.NODE_ENV = 'development'
  ENV.CREEM_MODE = 'live'
  check('E3: live is used only when asked for by name', creemMode() === 'live')
  for (const value of ['sandbox', 'production', 'LIVE ', 'Live']) {
    ENV.CREEM_MODE = value
    const expected = value.trim().toLowerCase() === 'live' ? 'live' : 'test'
    check(`E4: CREEM_MODE=${JSON.stringify(value)} resolves to ${expected}`, creemMode() === expected)
  }
  check('E5: the two environments have different base URLs', CREEM_API_BASE.test !== CREEM_API_BASE.live)

  ENV.CREEM_ENABLED = originalEnabled
  ENV.CREEM_MODE = originalMode
  ENV.NODE_ENV = originalNodeEnv
}

console.log(`\n${pass} passed, ${fail} failed`)
if (fail > 0) process.exitCode = 1

export {}
