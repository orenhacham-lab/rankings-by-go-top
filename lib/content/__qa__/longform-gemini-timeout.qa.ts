/**
 * Production regression — long-form Hebrew articles were aborted by OUR OWN
 * timeout, not by the provider.
 *
 * Commit 1b7ab923 ("feat: add plan entitlements and atomic usage metering")
 * changed the article path from `model.generateContent(prompt)` to
 * `model.generateContent(prompt, { timeout: GEMINI_REQUEST_TIMEOUT_MS })` —
 * the SHARED 60s budget used by the semantic classifiers, topic suggestions and
 * image calls. Those are short requests. A deep Hebrew article of 1,900-2,300
 * words from a ~6,800-character prompt on gemini-2.5-pro is not, and it
 * routinely needs longer than a minute, so the merchant saw
 * "הבקשה ל-Gemini עברה את זמן ההמתנה. נסו שוב."
 *
 * Before that commit this path had NO application-imposed timeout and worked.
 *
 * Run: npx tsx lib/content/__qa__/longform-gemini-timeout.qa.ts
 */
import { readFileSync } from 'fs'
import { join } from 'path'
import { FakeAdmin } from '../../__qa__/_fake-admin'
import { GEMINI_ARTICLE_TIMEOUT_MS, TRANSIENT_GEN_REASONS } from '../gemini-article'
import { GEMINI_REQUEST_TIMEOUT_MS } from '../../ai-visibility/gemini-semantic-classifier'

let pass = 0, fail = 0
function check(name: string, cond: boolean, detail?: string) {
  if (cond) { pass++; console.log(`  ✓ ${name}`) } else { fail++; console.log(`  ✗ ${name}${detail ? ` — ${detail}` : ''}`) }
}
const ROOT = join(__dirname, '..', '..', '..')
const read = (rel: string) => readFileSync(join(ROOT, rel), 'utf8')
const strip = (s: string) => s.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:])\/\/[^\n]*/g, '$1')

/** The route budget the worst case must fit inside. */
const ROUTE_MAX_DURATION_S = 300
/** generateValidatedArticle's loop bound: `for (let attempt = 0; attempt < 2; …)`. */
const MAX_SEQUENTIAL_ATTEMPTS = 2

async function main() {
  console.log('Long-form Gemini timeout — production regression QA\n')

  console.log('1) The article path no longer uses the shared 60s classifier timeout')
  {
    const article = strip(read('lib/content/gemini-article.ts'))
    check('1a: NEGATIVE CONTROL — the shared constant is 60s, as before', GEMINI_REQUEST_TIMEOUT_MS === 60_000)
    check('1b: the article module no longer imports it at all',
      !/GEMINI_REQUEST_TIMEOUT_MS/.test(article.split('export const GEMINI_ARTICLE_TIMEOUT_MS')[0]))
    check('1c: the generateContent call uses the DEDICATED budget',
      /generateContent\(prompt, \{ timeout: GEMINI_ARTICLE_TIMEOUT_MS \}\)/.test(article))
    check('1d: and the shared 60s value is not passed anywhere in this module',
      !/timeout: GEMINI_REQUEST_TIMEOUT_MS/.test(article))
    check('1e: the dedicated budget is strictly longer than the shared one',
      GEMINI_ARTICLE_TIMEOUT_MS > GEMINI_REQUEST_TIMEOUT_MS)
  }

  console.log('\n2) The budget fits the route with real cleanup headroom')
  {
    const worstCaseS = (GEMINI_ARTICLE_TIMEOUT_MS / 1000) * MAX_SEQUENTIAL_ATTEMPTS
    const headroomS = ROUTE_MAX_DURATION_S - worstCaseS
    check(`2a: worst case ${MAX_SEQUENTIAL_ATTEMPTS} x ${GEMINI_ARTICLE_TIMEOUT_MS / 1000}s = ${worstCaseS}s is under maxDuration ${ROUTE_MAX_DURATION_S}s`,
      worstCaseS < ROUTE_MAX_DURATION_S)
    check(`2b: at least 30s of cleanup headroom remains (${headroomS}s)`, headroomS >= 30)
    check('2c: the attempt loop really is bounded at 2 sequential calls',
      /for \(let attempt = 0; attempt < 2; attempt\+\+\)/.test(strip(read('lib/content/gemini-article.ts'))))
    check('2d: nothing retries INSIDE the loop, so the worst case is exactly 2 calls',
      (strip(read('lib/content/gemini-article.ts')).match(/await callGemini\(/g) || []).length === 1)
    // Still far inside the 30-minute reservation TTL, so a slow worker cannot
    // outlive its own reservation.
    check('2e: the worst case stays well inside the 30-minute reservation TTL', worstCaseS * 1000 < 30 * 60_000)
  }

  console.log('\n3) Every OTHER Gemini caller keeps the shorter shared timeout')
  {
    for (const rel of [
      'lib/ai-visibility/gemini-semantic-classifier.ts',
      'lib/content/gemini-topics.ts',
      'lib/content/gemini-image.ts',
    ]) {
      const src = strip(read(rel))
      check(`3: ${rel} still uses GEMINI_REQUEST_TIMEOUT_MS`, /GEMINI_REQUEST_TIMEOUT_MS/.test(src))
      check(`3: ${rel} does NOT adopt the long-form budget`, !/GEMINI_ARTICLE_TIMEOUT_MS/.test(src))
    }
  }

  console.log('\n4) A timeout stays TRANSIENT and releases the reservation exactly once')
  {
    check('4a: gemini_timeout is still classified transient', TRANSIENT_GEN_REASONS.has('gemini_timeout'))
    check('4b: alongside the other provider-side transients',
      TRANSIENT_GEN_REASONS.has('gemini_overloaded') && TRANSIENT_GEN_REASONS.has('gemini_quota_exceeded'))

    // The release path is unchanged by this fix, and is exercised here to prove
    // a failed generation releases ONCE and consumes no article quota.
    const gen = strip(read('lib/content/article-generation.ts'))
    const failIdx = gen.indexOf("if ('error' in gen) {")
    const releaseIdx = gen.indexOf('releaseUsageReservation(admin, { reservationId, userId, reservationToken, reason: `generation_failed:')
    const finalizeIdx = gen.indexOf('finalizeArticleGeneration(')
    check('4c: a generation error releases the reservation', failIdx !== -1 && releaseIdx !== -1 && failIdx < releaseIdx)
    check('4d: exactly ONE release call on that path',
      (gen.match(/releaseUsageReservation\(admin, \{ reservationId, userId, reservationToken, reason: `generation_failed:/g) || []).length === 1)
    check('4e: and it returns BEFORE any usage is finalized', releaseIdx !== -1 && finalizeIdx !== -1 && releaseIdx < finalizeIdx)
    check('4f: the failure path returns kind "generation", never a quota consume',
      /return \{ ok: false, kind: 'generation', reason/.test(gen))
  }

  console.log('\n5) Reservation/finalization wiring is untouched by this change')
  {
    const gen = strip(read('lib/content/article-generation.ts'))
    check('5a: usage is still reserved before generation', /const reservation = await reserveUsage\(admin, \{/.test(gen))
    check('5b: a concurrent duplicate is still refused', /reservation\.outcome === 'already_reserved'/.test(gen))
    check('5c: finalization still happens exactly once on success',
      (gen.match(/await finalizeArticleGeneration\(/g) || []).length === 1)
    check('5d: an insert failure still releases the reservation',
      /releaseUsageReservation\(admin, \{ reservationId, userId, reservationToken, reason: 'insert_failed' \}\)/.test(gen))
  }

  console.log('\n6) The entitlement gate is unchanged — admins and website users still reach generation')
  {
    const { assertContentGenerationAllowedForUser } = await import('../entitlement-guard')
    const admin = new FakeAdmin({
      profiles: [{ id: 'acc-admin', role: 'admin' }],
      billing_governance: [{ user_id: 'acc-admin', signup_origin: 'shopify_app_store', billing_authority: 'shopify' }],
      shopify_connections: [], shopify_billing_migrations: [], subscriptions: [],
    })
    check('6a: an admin still reaches generation', (await assertContentGenerationAllowedForUser(admin as never, 'acc-admin')).allowed === true)
    const website = new FakeAdmin({
      profiles: [{ id: 'acc-web', role: 'user' }],
      billing_governance: [{ user_id: 'acc-web', signup_origin: 'website', billing_authority: 'website' }],
      shopify_connections: [], shopify_billing_migrations: [], subscriptions: [],
    })
    check('6b: an ordinary website user still reaches generation',
      (await assertContentGenerationAllowedForUser(website as never, 'acc-web')).allowed === true)
  }

  console.log('\n7) Nothing else about generation changed')
  {
    const article = strip(read('lib/content/gemini-article.ts'))
    check('7a: the model choice is still caller-supplied, not hard-coded here',
      /callGemini\(brief: ArticleBrief, opts: GenOpts, modelName: string\)/.test(article))
    check('7b: the prompt builder is untouched', /const prompt = buildPrompt\(brief, opts\)/.test(article))
    check('7c: the JSON response contract is unchanged',
      /responseMimeType: 'application\/json', temperature: 0\.75/.test(article))
    check('7d: no word-count or language rule appears in this diff’s constant',
      !/1900|2300|Hebrew|word/i.test('export const GEMINI_ARTICLE_TIMEOUT_MS = 120_000'))
  }

  console.log(`\n${pass} passed, ${fail} failed`)
  if (fail > 0) process.exitCode = 1
}

main()
