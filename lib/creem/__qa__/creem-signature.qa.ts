/**
 * The Creem webhook signature check is the ONLY authentication on the Creem
 * webhook route (proxy.ts does not cover /api/*), so this suite treats it as
 * a security boundary, not a helper.
 *
 * It asserts the three properties the module claims: the digest is taken
 * over the RAW body bytes, every ambiguity fails closed without throwing,
 * and the comparison is on equal-length buffers (so a forged header can
 * never reach timingSafeEqual with a length it would throw on).
 *
 * MUTATION CONTROLS at the end: a lenient verifier that accepts anything
 * non-empty, and one that compares a re-serialised body, must both be
 * REJECTED by these same assertions. If they pass, the assertions are
 * testing nothing.
 *
 * Run: npx tsx lib/creem/__qa__/creem-signature.qa.ts
 */
import { createHmac } from 'crypto'
import {
  CREEM_SIGNATURE_HEADER,
  creemSignatureFor,
  verifyCreemSignature,
  type CreemSignatureResult,
} from '../signature'

let pass = 0, fail = 0
function check(name: string, cond: boolean, detail?: string) {
  if (cond) { pass++; console.log(`  ✓ ${name}`) } else { fail++; console.log(`  ✗ ${name}${detail ? ` — ${detail}` : ''}`) }
}

const SECRET = 'whsec_test_f0e1d2c3b4a5'
// Deliberately pretty-printed with trailing spaces inside: the exact bytes
// matter, and a re-serialised copy of this object would NOT match.
const RAW = '{\n  "id": "evt_1", \n  "eventType": "subscription.paid",\n  "object": {"id": "sub_1"}\n}'
const GOOD = creemSignatureFor(RAW, SECRET)

console.log('A) the header name and digest shape')
check('the header is the lowercase name Headers.get expects',
  CREEM_SIGNATURE_HEADER === 'creem-signature')
check('the digest is 64 lowercase hex characters', /^[0-9a-f]{64}$/.test(GOOD))
check('it is HMAC-SHA256 over the raw body, keyed by the secret',
  GOOD === createHmac('sha256', SECRET).update(RAW, 'utf8').digest('hex'))

console.log('\nB) a genuine delivery is accepted')
check('the correct digest verifies', verifyCreemSignature(RAW, GOOD, SECRET).ok === true)
check('upper-case hex from the header still verifies',
  verifyCreemSignature(RAW, GOOD.toUpperCase(), SECRET).ok === true)
check('surrounding whitespace in the header is tolerated',
  verifyCreemSignature(RAW, `  ${GOOD}  `, SECRET).ok === true)

console.log('\nC) the digest is over the RAW bytes, not a re-serialised body')
{
  // This is what a route that did JSON.stringify(await request.json())
  // would hash: same data, different bytes.
  const reserialised = JSON.stringify(JSON.parse(RAW))
  check('the re-serialised body produces a DIFFERENT digest',
    creemSignatureFor(reserialised, SECRET) !== GOOD)
  check('a digest taken over the re-serialised body is rejected',
    verifyCreemSignature(RAW, creemSignatureFor(reserialised, SECRET), SECRET).ok === false)
  check('one changed byte in the body is rejected',
    verifyCreemSignature(RAW.replace('sub_1', 'sub_2'), GOOD, SECRET).ok === false)
}

console.log('\nD) every ambiguity fails closed, and nothing throws')
const reasonOf = (r: CreemSignatureResult) => (r.ok ? 'ok' : r.reason)
const cases: Array<[string, CreemSignatureResult, string]> = [
  ['a missing secret is our misconfiguration', verifyCreemSignature(RAW, GOOD, undefined), 'missing_secret'],
  ['an empty secret is a missing secret', verifyCreemSignature(RAW, GOOD, ''), 'missing_secret'],
  ['a missing header', verifyCreemSignature(RAW, null, SECRET), 'missing_signature'],
  ['an empty header', verifyCreemSignature(RAW, '   ', SECRET), 'missing_signature'],
  ['a short hex string', verifyCreemSignature(RAW, 'abc123', SECRET), 'malformed_signature'],
  ['a long hex string', verifyCreemSignature(RAW, GOOD + 'ff', SECRET), 'malformed_signature'],
  ['non-hex characters', verifyCreemSignature(RAW, 'z'.repeat(64), SECRET), 'malformed_signature'],
  ['a base64 digest (the wrong encoding)',
    verifyCreemSignature(RAW, createHmac('sha256', SECRET).update(RAW).digest('base64'), SECRET), 'malformed_signature'],
  ['a correctly shaped but wrong digest', verifyCreemSignature(RAW, 'a'.repeat(64), SECRET), 'mismatch'],
  ['a digest made with another secret',
    verifyCreemSignature(RAW, creemSignatureFor(RAW, 'whsec_someone_else'), SECRET), 'mismatch'],
]
for (const [name, result, expected] of cases) {
  check(`${name} -> ${expected}`, result.ok === false && reasonOf(result) === expected, `got ${reasonOf(result)}`)
}
{
  // A malformed header must not reach timingSafeEqual, which throws on a
  // length mismatch. A throw here would be a 500, and a 500 makes Creem
  // retry a delivery that can never be accepted.
  let threw = false
  try {
    for (const h of ['', 'x', GOOD.slice(0, 63), GOOD + '0', '\u0000'.repeat(64), '0x' + GOOD]) {
      verifyCreemSignature(RAW, h, SECRET)
    }
  } catch { threw = true }
  check('no malformed header ever throws', threw === false)
}

console.log('\nE) mutation controls: break the verifier and these assertions must fail')
{
  type Verifier = (body: string, header: string | null | undefined, secret: string | null | undefined) => CreemSignatureResult

  /** Does a verifier survive the security assertions above? */
  function survives(verify: Verifier): boolean {
    const rejectsForgery = verify(RAW, 'a'.repeat(64), SECRET).ok === false
    const rejectsOtherSecret = verify(RAW, creemSignatureFor(RAW, 'whsec_someone_else'), SECRET).ok === false
    const rejectsEmpty = verify(RAW, '', SECRET).ok === false
    const rejectsReserialised =
      verify(RAW, creemSignatureFor(JSON.stringify(JSON.parse(RAW)), SECRET), SECRET).ok === false
    const acceptsGenuine = verify(RAW, GOOD, SECRET).ok === true
    return rejectsForgery && rejectsOtherSecret && rejectsEmpty && rejectsReserialised && acceptsGenuine
  }

  check('the real verifier survives', survives(verifyCreemSignature) === true)

  const lenient: Verifier = (_b, header) =>
    header ? { ok: true } : { ok: false, reason: 'missing_signature' }
  check('MUTATION: "any non-empty header is fine" is caught', survives(lenient) === false)

  const hashesParsedBody: Verifier = (body, header, secret) => {
    if (!secret || !header) return { ok: false, reason: 'missing_signature' }
    let normalised = body
    try { normalised = JSON.stringify(JSON.parse(body)) } catch { /* not JSON */ }
    return creemSignatureFor(normalised, secret) === header.toLowerCase()
      ? { ok: true }
      : { ok: false, reason: 'mismatch' }
  }
  check('MUTATION: hashing the re-serialised body is caught', survives(hashesParsedBody) === false)

  const noSecretNeeded: Verifier = (body, header) =>
    header && header.toLowerCase() === creemSignatureFor(body, '') ? { ok: true } : { ok: false, reason: 'mismatch' }
  check('MUTATION: verifying without the real secret is caught', survives(noSecretNeeded) === false)
}

console.log(`\n${pass} passed, ${fail} failed`)
if (fail > 0) process.exitCode = 1

export {}
