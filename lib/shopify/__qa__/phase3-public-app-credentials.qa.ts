/**
 * Urgent hotfix — public Shopify app credentials.
 *
 * Reproduction (conclusive production evidence): a captured public-app launch
 * (`hmac, host, session, shop, timestamp` — all scalar, all plain) verifies
 * successfully against the active "Go Top SEO" PUBLIC app secret copied from
 * the Shopify Dev Dashboard, yet Production rejected that same launch with
 * `invalid_hmac`.
 *
 * Root cause: this app exists TWICE in Shopify with entirely different
 * credentials — the PUBLIC "Go Top SEO" app (which merchants install, and
 * which signs every app-launch request, OAuth callback and App Bridge session
 * token) and an older LEGACY custom app. The repository already documented
 * this split in lib/shopify/webhook-public.ts, but ONLY the compliance
 * webhooks were ever wired to SHOPIFY_PUBLIC_CLIENT_SECRET. Every other
 * public-app flow — the root signed launch, install, OAuth start, OAuth
 * callback, session-token verification and the App Bridge api key — resolves
 * its credentials through getShopifyOAuthConfig(), which read ONLY the legacy
 * SHOPIFY_CLIENT_ID / SHOPIFY_CLIENT_SECRET. So a correctly-signed public-app
 * launch was checked against the wrong app's secret and could never verify.
 *
 * Fix: getShopifyOAuthConfig() now resolves the credential pair ATOMICALLY,
 * preferring the public app when BOTH SHOPIFY_PUBLIC_CLIENT_ID and
 * SHOPIFY_PUBLIC_CLIENT_SECRET are set and falling back to the legacy pair
 * otherwise. An id from one app is never paired with the other's secret.
 * getShopifyAppClientId() applies the identical rule for the App Bridge meta
 * tag, so the rendered api key always names the app whose secret verifies the
 * resulting session tokens.
 *
 * NOT changed by this pass: the HMAC canonicalization itself (the captured
 * vector was ambiguous between the raw and re-encoded canonicalizations, so
 * that question stays open and unmerged), and the legacy custom app's base
 * webhook route, which deliberately keeps reading SHOPIFY_CLIENT_SECRET.
 *
 * Run: npx tsx lib/shopify/__qa__/phase3-public-app-credentials.qa.ts
 */
import { readFileSync } from 'fs'
import { join } from 'path'
import crypto from 'crypto'

let pass = 0, fail = 0
function check(name: string, cond: boolean, detail?: string) {
  if (cond) { pass++; console.log(`  ✓ ${name}`) } else { fail++; console.log(`  ✗ ${name}${detail ? ` — ${detail}` : ''}`) }
}
const ROOT = join(__dirname, '..', '..', '..')
const read = (rel: string) => readFileSync(join(ROOT, rel), 'utf8')
const strip = (s: string) => s.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:])\/\/[^\n]*/g, '$1')

const PUBLIC_ID = 'public-app-client-id-1111'
const PUBLIC_SECRET = 'public-app-secret-AAAA'
const LEGACY_ID = 'legacy-custom-app-client-id-2222'
const LEGACY_SECRET = 'legacy-custom-app-secret-BBBB'
const APP_URL = 'https://www.gotopseo.com'

/** Set exactly the Shopify env this suite controls, clearing the rest. */
function setEnv(v: Partial<Record<'SHOPIFY_PUBLIC_CLIENT_ID' | 'SHOPIFY_PUBLIC_CLIENT_SECRET' | 'SHOPIFY_CLIENT_ID' | 'SHOPIFY_CLIENT_SECRET' | 'SHOPIFY_APP_URL', string>>) {
  for (const k of ['SHOPIFY_PUBLIC_CLIENT_ID', 'SHOPIFY_PUBLIC_CLIENT_SECRET', 'SHOPIFY_CLIENT_ID', 'SHOPIFY_CLIENT_SECRET', 'SHOPIFY_APP_URL'] as const) {
    if (v[k] === undefined) delete process.env[k]
    else process.env[k] = v[k]
  }
}
const BOTH_APPS = {
  SHOPIFY_PUBLIC_CLIENT_ID: PUBLIC_ID, SHOPIFY_PUBLIC_CLIENT_SECRET: PUBLIC_SECRET,
  SHOPIFY_CLIENT_ID: LEGACY_ID, SHOPIFY_CLIENT_SECRET: LEGACY_SECRET, SHOPIFY_APP_URL: APP_URL,
}

/**
 * Signs a public-app launch the way Shopify does, with the CURRENT
 * canonicalization in lib/shopify/oauth.ts (unchanged by this pass). Only the
 * SECRET is the variable under test here — this suite is about which app's
 * secret is used, never about the message format.
 */
function signLaunch(secret: string, nowMs = Date.now()): Record<string, string> {
  const base: Record<string, string> = {
    host: Buffer.from('go-top-seo-test.myshopify.com/admin').toString('base64'),
    session: '8f14e45fceea167a5a36dedd4bea2543',
    shop: 'go-top-seo-test.myshopify.com',
    timestamp: String(Math.floor(nowMs / 1000)),
  }
  const message = Object.keys(base).sort().map((k) => `${k}=${base[k]}`).join('&')
  return { ...base, hmac: crypto.createHmac('sha256', secret).update(message).digest('hex') }
}

async function main() {
  console.log('Hotfix — Shopify public-app credentials QA\n')
  // Imported AFTER the env helpers exist; these read process.env per call.
  const { getShopifyOAuthConfig, getShopifyAppClientId, detectSignedShopifyLaunch, verifyShopifyHmac } = await import('../oauth')

  console.log('1) getShopifyOAuthConfig — resolves the PUBLIC pair when both public values are set')
  {
    setEnv(BOTH_APPS)
    const c = getShopifyOAuthConfig()
    check('1: config resolved', c !== null)
    check('1: edition is public', c?.edition === 'public')
    check('1: clientId is the PUBLIC id', c?.clientId === PUBLIC_ID)
    check('1: clientSecret is the PUBLIC secret', c?.clientSecret === PUBLIC_SECRET)
    check('1: never the legacy id', c?.clientId !== LEGACY_ID)
    check('1: never the legacy secret', c?.clientSecret !== LEGACY_SECRET)
  }

  console.log('\n2) (a)/(b) THE PRODUCTION BUG: a launch signed by the PUBLIC app')
  {
    setEnv(BOTH_APPS)
    const config = getShopifyOAuthConfig()!
    const publicLaunch = signLaunch(PUBLIC_SECRET)

    // (a) accepted under the resolved (public) config.
    const r = detectSignedShopifyLaunch(publicLaunch, config.clientSecret)
    check('2a: a PUBLIC-app-signed launch is ACCEPTED', r.ok === true)
    check('2a: shop resolved', r.shop === 'go-top-seo-test.myshopify.com')

    // This is exactly what Production did before the fix: same genuine
    // launch, verified with the legacy secret.
    const asProductionDid = detectSignedShopifyLaunch(publicLaunch, LEGACY_SECRET)
    check('2a: verifying that SAME launch with the LEGACY secret reproduces the production failure',
      asProductionDid.ok === false && asProductionDid.reason === 'invalid_hmac')

    // (b) a launch signed ONLY by the legacy app must be rejected once the
    // public app is the configured one.
    const legacyLaunch = signLaunch(LEGACY_SECRET)
    const rejected = detectSignedShopifyLaunch(legacyLaunch, config.clientSecret)
    check('2b: a launch signed ONLY with the LEGACY secret is REJECTED', rejected.ok === false)
    check('2b: rejected as invalid_hmac, shop never leaked', rejected.reason === 'invalid_hmac' && rejected.shop === null)
  }

  console.log('\n3) Atomic pair — an id from one app is NEVER combined with the other app\'s secret')
  {
    // Only the public SECRET set (the exact state of Production right now):
    // must NOT half-switch. Falls back to the legacy pair entirely.
    setEnv({ SHOPIFY_PUBLIC_CLIENT_SECRET: PUBLIC_SECRET, SHOPIFY_CLIENT_ID: LEGACY_ID, SHOPIFY_CLIENT_SECRET: LEGACY_SECRET, SHOPIFY_APP_URL: APP_URL })
    const c1 = getShopifyOAuthConfig()
    check('3a: public secret alone does NOT activate the public app', c1?.edition === 'legacy')
    check('3a: the pair stays legacy id + legacy secret (never mixed)', c1?.clientId === LEGACY_ID && c1?.clientSecret === LEGACY_SECRET)
    check('3a: the public secret is NOT paired with the legacy id', c1?.clientSecret !== PUBLIC_SECRET)

    // Only the public ID set: same rule, mirrored.
    setEnv({ SHOPIFY_PUBLIC_CLIENT_ID: PUBLIC_ID, SHOPIFY_CLIENT_ID: LEGACY_ID, SHOPIFY_CLIENT_SECRET: LEGACY_SECRET, SHOPIFY_APP_URL: APP_URL })
    const c2 = getShopifyOAuthConfig()
    check('3b: public id alone does NOT activate the public app', c2?.edition === 'legacy')
    check('3b: the public id is NOT paired with the legacy secret', c2?.clientId !== PUBLIC_ID)
  }

  console.log('\n4) Legacy-only deployment is preserved exactly (no regression for the custom app)')
  {
    setEnv({ SHOPIFY_CLIENT_ID: LEGACY_ID, SHOPIFY_CLIENT_SECRET: LEGACY_SECRET, SHOPIFY_APP_URL: APP_URL })
    const c = getShopifyOAuthConfig()
    check('4: edition is legacy', c?.edition === 'legacy')
    check('4: legacy id + secret', c?.clientId === LEGACY_ID && c?.clientSecret === LEGACY_SECRET)
    const legacyLaunch = signLaunch(LEGACY_SECRET)
    check('4: a legacy-signed launch still verifies on a legacy-only deployment',
      detectSignedShopifyLaunch(legacyLaunch, c!.clientSecret).ok === true)
  }

  console.log('\n5) Fails closed when nothing (or not enough) is configured')
  {
    setEnv({ SHOPIFY_APP_URL: APP_URL })
    check('5a: no credentials at all -> null', getShopifyOAuthConfig() === null)
    setEnv({ SHOPIFY_PUBLIC_CLIENT_ID: PUBLIC_ID, SHOPIFY_PUBLIC_CLIENT_SECRET: PUBLIC_SECRET })
    check('5b: no app URL -> null', getShopifyOAuthConfig() === null)
    setEnv({ ...BOTH_APPS, SHOPIFY_APP_URL: 'http://insecure.example.com' })
    check('5c: non-https app URL -> null', getShopifyOAuthConfig() === null)
  }

  console.log('\n6) getShopifyAppClientId — App Bridge api key names the SAME app whose secret verifies session tokens')
  {
    setEnv(BOTH_APPS)
    check('6a: public configured -> public id', getShopifyAppClientId() === PUBLIC_ID)
    check('6a: it matches the resolved config clientId exactly', getShopifyAppClientId() === getShopifyOAuthConfig()?.clientId)

    setEnv({ SHOPIFY_CLIENT_ID: LEGACY_ID, SHOPIFY_CLIENT_SECRET: LEGACY_SECRET, SHOPIFY_APP_URL: APP_URL })
    check('6b: legacy-only -> legacy id, still matching the config', getShopifyAppClientId() === LEGACY_ID && getShopifyAppClientId() === getShopifyOAuthConfig()?.clientId)

    // No app URL: the meta tag must STILL render (that was the original
    // reason it read env directly) even though getShopifyOAuthConfig is null.
    setEnv({ SHOPIFY_PUBLIC_CLIENT_ID: PUBLIC_ID, SHOPIFY_PUBLIC_CLIENT_SECRET: PUBLIC_SECRET })
    check('6c: renders the public id even with no app URL configured', getShopifyAppClientId() === PUBLIC_ID)
    check('6c: ...while getShopifyOAuthConfig still fails closed', getShopifyOAuthConfig() === null)

    // Half-configured public: must not name the public app while the legacy
    // secret would be doing the verifying.
    setEnv({ SHOPIFY_PUBLIC_CLIENT_ID: PUBLIC_ID, SHOPIFY_CLIENT_ID: LEGACY_ID, SHOPIFY_CLIENT_SECRET: LEGACY_SECRET, SHOPIFY_APP_URL: APP_URL })
    check('6d: public id alone does NOT get rendered as the api key', getShopifyAppClientId() === LEGACY_ID)

    setEnv({})
    check('6e: nothing configured -> empty string (meta tag omitted)', getShopifyAppClientId() === '')
  }

  console.log('\n7) (c) OAuth callback + install/start use the SAME resolved config for HMAC and token exchange')
  {
    const cb = read('app/api/shopify/oauth/callback/route.ts')
    check('7a: callback resolves credentials via getShopifyOAuthConfig', /const config = getShopifyOAuthConfig\(\)/.test(cb))
    check('7a: callback verifies the HMAC with config.clientSecret (never a raw env read)', /verifyShopifyHmac\(params, config\.clientSecret\)/.test(cb))
    check('7a: callback exchanges the code with the SAME config pair', /clientId: config\.clientId/.test(cb) && /clientSecret: config\.clientSecret/.test(cb))
    check('7a: callback never reads a Shopify secret straight from process.env', !/process\.env\.SHOPIFY[A-Z_]*SECRET/.test(cb))

    for (const rel of ['app/api/shopify/install/route.ts', 'app/api/shopify/oauth/start/route.ts']) {
      const src = read(rel)
      check(`7b: ${rel} builds the authorize URL with config.clientId`, /clientId: config\.clientId/.test(src))
      check(`7b: ${rel} never reads a Shopify secret straight from process.env`, !/process\.env\.SHOPIFY[A-Z_]*SECRET/.test(src))
    }

    // Behavioral: the pair handed to the callback is internally consistent.
    setEnv(BOTH_APPS)
    const config = getShopifyOAuthConfig()!
    const cbParams = { code: 'abc123', shop: 'go-top-seo-test.myshopify.com', state: 'deadbeef', timestamp: String(Math.floor(Date.now() / 1000)) }
    const msg = Object.keys(cbParams).sort().map((k) => `${k}=${cbParams[k as keyof typeof cbParams]}`).join('&')
    const publicSigned = { ...cbParams, hmac: crypto.createHmac('sha256', PUBLIC_SECRET).update(msg).digest('hex') }
    const legacySigned = { ...cbParams, hmac: crypto.createHmac('sha256', LEGACY_SECRET).update(msg).digest('hex') }
    check('7c: a PUBLIC-app OAuth callback verifies under the resolved config', verifyShopifyHmac(publicSigned, config.clientSecret) === true)
    check('7c: a LEGACY-signed callback is rejected once the public app is configured', verifyShopifyHmac(legacySigned, config.clientSecret) === false)
  }

  console.log('\n8) (d) public webhook verification is UNCHANGED (still SHOPIFY_PUBLIC_CLIENT_SECRET, raw-body HMAC)')
  {
    const wp = read('lib/shopify/webhook-public.ts')
    check('8a: still reads SHOPIFY_PUBLIC_CLIENT_SECRET only', /process\.env\.SHOPIFY_PUBLIC_CLIENT_SECRET/.test(wp))
    check('8a: does NOT route through getShopifyOAuthConfig', !/getShopifyOAuthConfig/.test(wp))
    check('8a: still verifies BEFORE parsing (fails closed on a missing secret)', /verifyShopifyWebhookHmac\(raw, hmacHeader, secret\)/.test(wp))

    const wh = read('lib/shopify/webhook-hmac.ts')
    check('8b: the LEGACY base webhook route still reads SHOPIFY_CLIENT_SECRET (genuinely separate flow, preserved)',
      /const secret = process\.env\.SHOPIFY_CLIENT_SECRET/.test(wh))
    check('8b: raw-body verifier untouched — still base64 + constant-time compare', /CANONICAL_HMAC_RE/.test(wh) && /timingSafeEqual/.test(wh))

    // Behavioral: the two webhook secrets stay independent of the OAuth config.
    const { getShopifyPublicWebhookSecret } = await import('../webhook-public')
    const { getShopifyWebhookSecret } = await import('../webhook-hmac')
    setEnv(BOTH_APPS)
    check('8c: public webhook secret is the PUBLIC secret', getShopifyPublicWebhookSecret() === PUBLIC_SECRET)
    check('8c: legacy webhook secret is the LEGACY secret', getShopifyWebhookSecret() === LEGACY_SECRET)
  }

  console.log('\n9) HMAC canonicalization is UNCHANGED by this pass (cbd889f stays unmerged)')
  {
    const src = strip(read('lib/shopify/oauth.ts'))
    check('9: verifyShopifyHmac still joins raw decoded values (no encodeURIComponent introduced)',
      /\.map\(\(k\) => `\$\{k\}=\$\{params\[k\]\}`\)/.test(src) && !/encodeURIComponent\(params\[k\]\)/.test(src))
    check('9: still excludes hmac and signature, sorted, "&" joined',
      /filter\(\(k\) => k !== 'hmac' && k !== 'signature'\)/.test(src) && /\.sort\(\)/.test(src) && /\.join\('&'\)/.test(src))
    check('9: still a constant-time compare', /timingSafeEqual/.test(src))
  }

  console.log('\n10) (e) nothing logs a secret, hmac, shop, host, session or raw URL')
  {
    const files = [
      'lib/shopify/oauth.ts', 'app/page.tsx', 'app/shopify/app/layout.tsx',
      'app/api/shopify/oauth/callback/route.ts', 'app/api/shopify/install/route.ts',
      'app/api/shopify/oauth/start/route.ts', 'lib/shopify/session-token.ts',
      'lib/shopify/webhook-public.ts', 'lib/shopify/webhook-hmac.ts',
    ]
    for (const rel of files) {
      const src = strip(read(rel))
      const logs = src.match(/console\.(log|warn|error|info|debug)\([^\n]*/g) || []
      // Anything that could carry a VALUE for a secret / hmac / shop / host /
      // session / raw URL. Deliberately strict: a bare `shop`, `shopGid`,
      // `shop_domain`, `receivedShop`, `stateShop`, `expected`/`actual` shop,
      // or a spread of the whole params object all count as leaks. Keys whose
      // value is a boolean or a fixed reason code (shopParamPresent, reason,
      // mismatch, route) are fine — they carry no merchant identity.
      const bad = logs.filter((l) => {
        const scrubbed = l
          // The log LABEL is a fixed literal written by us (e.g. "invalid
          // shop") and carries no value — only the data argument matters.
          .replace(/console\.\w+\(\s*'[^']*'/, '')
          .replace(/shopParamPresent: Boolean\([^)]*\)/g, '')
          .replace(/\breason: '[^']*'/g, '')
          .replace(/\bmismatch: '[^']*'/g, '')
          .replace(/\broute: '[^']*'/g, '')
        return /clientSecret|CLIENT_SECRET|\bsecret\b|\bhmac\b|hmacParam|params\.hmac|params\b|\bhost\b|shopParam|\bshop\b|shopGid|shop_domain|shopDomain|receivedShop|normalizedShop|stateShop|myshopifyDomain|\bsession\b|\btoken\b|accessToken|request\.url|url\.href|searchParams|rawBody|\braw\b/i.test(scrubbed)
      })
      check(`10: ${rel} — no log statement references a secret/hmac/shop/host/session/raw URL`, bad.length === 0,
        bad.length ? `offending: ${bad[0].slice(0, 90)}` : undefined)
    }
    // The one launch-rejection log must carry ONLY a stable reason code.
    const pageSrc = strip(read('app/page.tsx'))
    const warn = pageSrc.match(/console\.warn\('\[Shopify launch\] rejected at app URL', \{[^}]*\}\)/)
    check('10: the launch-rejection log exists and carries only route + reason', !!warn && /reason: launch\.reason/.test(warn[0]) && !/hmac|shop|host|session/i.test(warn[0].replace('[Shopify launch] rejected at app URL', '')))
  }

  console.log('\n11) Every public-app flow resolves credentials centrally (no flow left reading the legacy env directly)')
  {
    const flows = [
      'app/page.tsx', 'app/api/shopify/install/route.ts', 'app/api/shopify/oauth/start/route.ts',
      'app/api/shopify/oauth/callback/route.ts', 'app/api/shopify/app-home/route.ts',
      'app/api/shopify/billing/return/route.ts', 'app/api/shopify/link/complete/route.ts',
      'lib/shopify/session-token.ts', 'lib/shopify/pending-link.ts',
    ]
    for (const rel of flows) {
      const src = read(rel)
      check(`11: ${rel} resolves via getShopifyOAuthConfig, never process.env.SHOPIFY_CLIENT_*`,
        /getShopifyOAuthConfig/.test(src) && !/process\.env\.SHOPIFY_CLIENT_(ID|SECRET)/.test(src))
    }
    const layout = read('app/shopify/app/layout.tsx')
    check('11: the App Bridge layout uses getShopifyAppClientId (no direct legacy env read)',
      /getShopifyAppClientId\(\)/.test(layout) && !/process\.env\.SHOPIFY_CLIENT_ID/.test(layout))
  }

  console.log(`\n${pass} passed, ${fail} failed`)
  if (fail > 0) process.exitCode = 1
}

main()
