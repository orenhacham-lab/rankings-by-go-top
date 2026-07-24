/**
 * Offline unit tests for the raw-body Shopify webhook HMAC verifier.
 * Deterministic, no network. Run: npx tsx lib/shopify/__qa__/webhook-hmac.qa.ts
 */
import crypto from 'crypto'
import { verifyShopifyWebhookHmac, getShopifyWebhookSecret } from '../webhook-hmac'

let pass = 0, fail = 0
function check(name: string, cond: boolean, detail?: string) {
  if (cond) { pass++; console.log(`  ✓ ${name}`) } else { fail++; console.log(`  ✗ ${name}${detail ? ` — ${detail}` : ''}`) }
}

const SECRET = 'unit-test-webhook-secret'
const sign = (body: Buffer, secret = SECRET) => crypto.createHmac('sha256', secret).update(body).digest('base64')

function main() {
  console.log('Shopify webhook HMAC — offline unit')

  const raw = Buffer.from(JSON.stringify({ shop_domain: 'acme.myshopify.com', topic: 'shop/redact' }), 'utf8')
  const valid = sign(raw)

  // (1) valid signature
  check('(1) valid signature over exact raw bytes → true', verifyShopifyWebhookHmac(raw, valid, SECRET) === true)

  // (2) changed byte in the body → different digest → false
  const tampered = Buffer.from(raw); tampered[0] = tampered[0] ^ 0x01
  check('(2) changed body byte → false', verifyShopifyWebhookHmac(tampered, valid, SECRET) === false)

  // (3) missing header → false
  check('(3) missing header → false', verifyShopifyWebhookHmac(raw, null, SECRET) === false)
  check('(3b) empty header → false', verifyShopifyWebhookHmac(raw, '', SECRET) === false)

  // (4) malformed base64 header → wrong-length decode → false
  check('(4) malformed base64 header → false', verifyShopifyWebhookHmac(raw, '!!!not_base64!!!', SECRET) === false)

  // (5) wrong signature (valid 32-byte base64 but computed with a different secret) → false
  const wrong = sign(raw, 'a_different_secret')
  check('(5) wrong signature (different secret) → false', verifyShopifyWebhookHmac(raw, wrong, SECRET) === false)

  // (6) length mismatch (base64 of a 16-byte value, not 32) → false
  const short = crypto.randomBytes(16).toString('base64')
  check('(6) length-mismatch signature (16 bytes) → false', verifyShopifyWebhookHmac(raw, short, SECRET) === false)
  const long = crypto.randomBytes(48).toString('base64')
  check('(6b) length-mismatch signature (48 bytes) → false', verifyShopifyWebhookHmac(raw, long, SECRET) === false)

  // (10) canonical-base64 hardening: a VALID signature with trailing junk / whitespace /
  // URL-safe alphabet must be rejected (Node's lenient decoder would otherwise accept it).
  check('(10) valid signature + "!!!!" appended → false', verifyShopifyWebhookHmac(raw, valid + '!!!!', SECRET) === false)
  check('(10b) valid signature + trailing whitespace → false', verifyShopifyWebhookHmac(raw, valid + ' ', SECRET) === false)
  check('(10c) valid signature + leading whitespace → false', verifyShopifyWebhookHmac(raw, ' ' + valid, SECRET) === false)
  check('(10d) valid signature with an internal newline → false', verifyShopifyWebhookHmac(raw, valid.slice(0, 20) + '\n' + valid.slice(20), SECRET) === false)
  check('(10e) URL-safe alphabet chars (-, _) → false', verifyShopifyWebhookHmac(raw, '-'.repeat(43) + '=', SECRET) === false && verifyShopifyWebhookHmac(raw, '_'.repeat(43) + '=', SECRET) === false)
  check('(10f) the accepted valid signature is canonical (44 chars, single = pad)', valid.length === 44 && /^[A-Za-z0-9+/]{43}=$/.test(valid))

  // (7) missing/blank secret → false (fail closed)
  check('(7) missing secret → false', verifyShopifyWebhookHmac(raw, valid, null) === false)
  check('(7b) blank secret → false', verifyShopifyWebhookHmac(raw, valid, '') === false)

  // (8) non-Buffer body → false
  check('(8) non-Buffer body → false', verifyShopifyWebhookHmac('not a buffer' as unknown as Buffer, valid, SECRET) === false)

  // (9) secret resolver reads SHOPIFY_CLIENT_SECRET only
  const prev = process.env.SHOPIFY_CLIENT_SECRET
  delete process.env.SHOPIFY_CLIENT_SECRET
  check('(9) getShopifyWebhookSecret() null when unset', getShopifyWebhookSecret() === null)
  process.env.SHOPIFY_CLIENT_SECRET = '   '
  check('(9b) getShopifyWebhookSecret() null when blank', getShopifyWebhookSecret() === null)
  process.env.SHOPIFY_CLIENT_SECRET = SECRET
  check('(9c) getShopifyWebhookSecret() returns the configured secret', getShopifyWebhookSecret() === SECRET)
  if (prev === undefined) delete process.env.SHOPIFY_CLIENT_SECRET; else process.env.SHOPIFY_CLIENT_SECRET = prev

  console.log(`\n${pass} passed, ${fail} failed`)
  if (fail > 0) process.exit(1)
}
main()
