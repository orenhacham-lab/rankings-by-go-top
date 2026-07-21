/**
 * Stage E1 — GSC refresh-token encryption. Proves AES-256-GCM round-trip, a versioned
 * envelope, tamper/wrong-key rejection, dedicated-key isolation, and fail-closed when the
 * key is missing/invalid (callers never fall back to storing plaintext).
 */
import crypto from 'crypto'

let pass = 0, fail = 0
function check(name: string, cond: boolean, detail?: string) {
  if (cond) { pass++; console.log(`  ✓ ${name}`) } else { fail++; console.log(`  ✗ ${name}${detail ? ` — ${detail}` : ''}`) }
}

async function main() {
  console.log('GSC token-crypto')
  // Fresh, valid key BEFORE importing the module (module reads env at call time).
  process.env.GSC_TOKEN_ENCRYPTION_KEY = crypto.randomBytes(32).toString('hex')
  const mod = await import('../token-crypto')
  const { encryptGscToken, decryptGscToken, isGscTokenCryptoConfigured, GSC_ENCRYPTION_VERSION, GscTokenCryptoError } = mod

  check('configured with a valid 64-hex key', isGscTokenCryptoConfigured() === true)
  check('version constant is 1', GSC_ENCRYPTION_VERSION === 1)

  const token = '1//0abcDEF_refresh-token.value~with-symbols'
  const enc = encryptGscToken(token)
  check('envelope is v1:iv:tag:ciphertext (4 hex parts)', /^v1:[0-9a-f]+:[0-9a-f]+:[0-9a-f]+$/.test(enc), enc.slice(0, 12))
  check('ciphertext does NOT contain the plaintext', !enc.includes(token))
  check('round-trips to the original token', decryptGscToken(enc) === token)

  const enc2 = encryptGscToken(token)
  check('random IV → two encryptions differ', enc !== enc2)
  check('both still decrypt to the same token', decryptGscToken(enc2) === token)

  // Tamper: flip the last ciphertext hex char → auth tag must reject.
  const flipped = enc.slice(0, -1) + (enc.endsWith('a') ? 'b' : 'a')
  let tamperRejected = false
  try { decryptGscToken(flipped) } catch (e) { tamperRejected = e instanceof GscTokenCryptoError }
  check('tampered ciphertext is rejected (GCM auth tag)', tamperRejected)

  // Wrong key → decryption fails (isolation from a different key).
  process.env.GSC_TOKEN_ENCRYPTION_KEY = crypto.randomBytes(32).toString('hex')
  let wrongKeyRejected = false
  try { decryptGscToken(enc) } catch (e) { wrongKeyRejected = e instanceof GscTokenCryptoError }
  check('a different key cannot decrypt (dedicated-key isolation)', wrongKeyRejected)

  // Missing key → fail closed (throw), never silently return plaintext.
  delete process.env.GSC_TOKEN_ENCRYPTION_KEY
  check('missing key → not configured', isGscTokenCryptoConfigured() === false)
  let encThrew = false
  try { encryptGscToken(token) } catch { encThrew = true }
  check('encrypt fails closed with no key', encThrew)

  // Malformed envelopes are rejected.
  process.env.GSC_TOKEN_ENCRYPTION_KEY = crypto.randomBytes(32).toString('hex')
  for (const bad of ['', 'plaintext', 'v1:aa:bb', 'v2:aa:bb:cc', 'v1:zz:bb:cc']) {
    let rej = false
    try { decryptGscToken(bad) } catch { rej = true }
    check(`rejects malformed envelope ${JSON.stringify(bad)}`, rej)
  }

  console.log(`\n${pass} passed, ${fail} failed`)
  if (fail > 0) process.exit(1)
}
main()
