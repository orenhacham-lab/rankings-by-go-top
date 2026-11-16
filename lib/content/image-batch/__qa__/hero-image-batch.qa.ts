/**
 * THE HERO IMAGE BATCH LANE (lib/content/image-batch/hero-image-batch.ts): the
 * article's featured image at half price, and never at the cost of a publish.
 *
 * The lane shipped on 14 November 2026 with the hero deliberately excluded
 * ("a draft without one looks broken"). It joined on 17 November 2026 because
 * the bill said the hero had become the largest block still paying full price
 * and the measured turnaround was minutes. What that reversal buys has to be
 * paid for by the checks below:
 *
 *   U) submit: the entitlement gate first, the request built from the live
 *      call's own prompt builder and the project's own hero shape, a job whose
 *      bookkeeping failed cancelled rather than paid for, and every refusal
 *      reported as ordered:false so the caller makes the live call
 *   P) PUBLISH NEVER WAITS: an article with a hero is untouched, one that never
 *      ordered is untouched, one whose order has not arrived is filled live —
 *      and the open request is claimed first, so a collect pass racing the
 *      publish cannot store a second picture over the published one
 *   C) collect: a hero reply finishes the article's own columns through the
 *      live call's storer, and a failed job leaves the article without a hero
 *      rather than marking an image row that does not exist
 *   F) the switch: off by default, and independent of the body images'
 *
 * Run: npx tsx lib/content/image-batch/__qa__/hero-image-batch.qa.ts
 */
import { FakeAdmin } from '../../../__qa__/_fake-admin'
import { submitHeroImageBatch, ensureHeroBeforePublish } from '../hero-image-batch'
import { collectInlineImageBatches, type ImageBatchClient } from '../inline-image-batch'
import { isHeroImageBatchEnabled, isInlineImageBatchEnabled } from '../flag'

let pass = 0, fail = 0
function check(name: string, cond: boolean, detail?: string) {
  if (cond) { pass++; console.log(`  ✓ ${name}`) } else { fail++; console.log(`  ✗ ${name}${detail ? ` — ${detail}` : ''}`) }
}

type Row = Record<string, unknown>
const PROJECT = 'a1111111-2222-3333-4444-555555555555'
const OWNER = 'u-owner'
const ART = 'art-1'
const JPEG_B64 = Buffer.from([0xff, 0xd8, 0xff, 0xd9]).toString('base64')

function world(over: { articles?: Row[]; requests?: Row[] } = {}) {
  return new FakeAdmin({
    projects: [{ id: PROJECT, user_id: OWNER }],
    generated_articles: over.articles ?? [{
      id: ART, project_id: PROJECT, title: 'מדריך לבחירת בושם', topic_id: null,
      featured_image_url: null, featured_image_storage_path: null,
    }],
    inline_image_batch_requests: over.requests ?? [],
    project_article_styles: [],
  })
}

let lastCreate: Record<string, unknown> | null = null
function fakeBatches(job: Record<string, unknown>, hooks: { onCancel?: () => void; createThrows?: boolean; name?: string | null } = {}): ImageBatchClient {
  return {
    batches: {
      create: async (params) => {
        if (hooks.createThrows) throw new Error('refused')
        lastCreate = params
        return { name: hooks.name === undefined ? 'batches/created' : (hooks.name ?? undefined) }
      },
      get: async () => job,
      cancel: async () => { hooks.onCancel?.() },
    },
  }
}

const heroRequest = (over: Row = {}): Row => ({
  id: 'req-1', job_name: 'batches/created', request_key: 'hero', target: 'hero',
  model: 'gemini-3.1-flash-image', inline_image_id: null, project_id: PROJECT, article_id: ART,
  concept: 'בקבוק בושם גנרי על משטח אבן', aspect_ratio: '16:9',
  status: 'submitted', submitted_at: new Date().toISOString(), ...over,
})

async function main() {

// -- U) submit --------------------------------------------------------------

console.log('\nU) submit: one request, the live call\'s own prompt, the gate first')
{
  lastCreate = null
  const admin = world()
  const res = await submitHeroImageBatch(admin as never, ART, { client: fakeBatches({}) })
  check('the hero is ordered and the job remembered', res.ordered && res.jobName === 'batches/created', JSON.stringify(res))

  // Cast, not an annotation: the assignment happens inside the fake client's
  // callback, which the compiler does not follow, so it still thinks null.
  const sent = lastCreate as unknown as Record<string, unknown> | null
  const req = (sent?.src as { inlinedRequests?: Row[] } | undefined)?.inlinedRequests ?? []
  check('exactly one request is sent, and it is the hero', req.length === 1 && (req[0]?.metadata as Row | undefined)?.key === 'hero')
  const cfg = (req[0]?.config ?? {}) as { responseModalities?: string[]; imageConfig?: { aspectRatio?: string; imageSize?: string } }
  check('TEXT rides with IMAGE, because the image models refuse IMAGE alone',
    Array.isArray(cfg.responseModalities) && cfg.responseModalities.includes('TEXT') && cfg.responseModalities.includes('IMAGE'))
  check('the shape and size are the live call\'s own (16:9, 2K)',
    cfg.imageConfig?.aspectRatio === '16:9' && cfg.imageConfig?.imageSize === '2K', JSON.stringify(cfg.imageConfig))

  const rows = admin.tables.inline_image_batch_requests!
  check('one bookkeeping row is written, targeted at the hero and carrying its concept',
    rows.length === 1 && rows[0]!.target === 'hero' && rows[0]!.article_id === ART &&
    rows[0]!.inline_image_id === null && typeof rows[0]!.concept === 'string' && (rows[0]!.concept as string).length > 0,
    JSON.stringify(rows))
}
{
  const admin = world()
  const res = await submitHeroImageBatch(admin as never, ART, { client: null })
  check('no API key orders nothing and says so, so the caller makes the live call',
    !res.ordered && res.reason === 'missing_gemini_api_key')
}
{
  const admin = world()
  const res = await submitHeroImageBatch(admin as never, ART, { client: fakeBatches({}, { createThrows: true }) })
  check('a job Google refused is reported, never thrown', !res.ordered && res.reason === 'batch_create_failed')
  check('and nothing is left in the bookkeeping to be collected', admin.tables.inline_image_batch_requests!.length === 0)
}
{
  const admin = world({ articles: [] })
  const res = await submitHeroImageBatch(admin as never, 'missing-article', { client: fakeBatches({}) })
  check('an article that is gone orders nothing', !res.ordered && res.reason === 'article_not_found')
}
{
  let cancelled = false
  const admin = new FakeAdmin({
    projects: [{ id: PROJECT, user_id: OWNER }],
    generated_articles: [{ id: ART, project_id: PROJECT, title: 'מדריך', topic_id: null, featured_image_url: null, featured_image_storage_path: null }],
    inline_image_batch_requests: [],
    project_article_styles: [],
  }, { inline_image_batch_requests: { insert: () => ({ code: '42501', message: 'denied' }) } } as never)
  const res = await submitHeroImageBatch(admin as never, ART, { client: fakeBatches({}, { onCancel: () => { cancelled = true } }) })
  check('a job whose bookkeeping failed is CANCELLED rather than paid for', cancelled && !res.ordered && res.reason === 'insert_failed')
}

// -- P) publishing never waits ----------------------------------------------

console.log('\nP) publishing never waits for a batch')
{
  const admin = world({ articles: [{ id: ART, project_id: PROJECT, title: 'מדריך', featured_image_url: 'https://cdn/x.jpg', featured_image_storage_path: 'p/x.jpg' }] })
  let made = 0
  const out = await ensureHeroBeforePublish(admin as never, ART, { createHero: async () => { made++; return { featured_image_url: 'https://cdn/new.jpg' } } })
  check('an article that already has its hero is left alone, and nothing is spent', out.status === 'present' && made === 0)
}
{
  const admin = world()
  let made = 0
  const out = await ensureHeroBeforePublish(admin as never, ART, { createHero: async () => { made++; return { featured_image_url: 'https://cdn/new.jpg' } } })
  check('an article with no hero that never ordered one is left alone: not this lane\'s business',
    out.status === 'not_ordered' && made === 0)
}
{
  const admin = world({ requests: [heroRequest()] })
  let made = 0
  const out = await ensureHeroBeforePublish(admin as never, ART, { createHero: async () => { made++; return { featured_image_url: 'https://cdn/new.jpg' } } })
  check('an ordered hero that has not arrived is made live before the article goes out',
    out.status === 'filled_live' && made === 1, JSON.stringify(out))
  const req = admin.tables.inline_image_batch_requests![0]!
  check('and its open request is closed, so a reply that lands later is dropped instead of overwriting it',
    req.status === 'failed' && String(req.last_error).includes('superseded_by_live_call_at_publish'))
}
{
  // The race: a collect pass claimed the request between the read and the claim.
  const admin = world({ requests: [heroRequest({ status: 'collected' })] })
  let made = 0
  const out = await ensureHeroBeforePublish(admin as never, ART, { createHero: async () => { made++; return { featured_image_url: 'https://cdn/new.jpg' } } })
  check('a request a collect pass already claimed is never paid for twice', made === 0, JSON.stringify(out))
}
{
  const admin = world({ requests: [heroRequest()] })
  const out = await ensureHeroBeforePublish(admin as never, ART, { createHero: async () => ({ error: 'missing_gemini_api_key' }) })
  check('a live call that fails at publish time reports it and never throws, so the article still publishes',
    out.status === 'failed')
}

// -- C) collect -------------------------------------------------------------

console.log('\nC) collect: a hero reply finishes the article, not an image row')
{
  const admin = world({ requests: [heroRequest()] })
  const job = {
    state: 'JOB_STATE_SUCCEEDED',
    dest: { inlinedResponses: [{ metadata: { key: 'hero' }, response: { candidates: [{ content: { parts: [{ inlineData: { data: JPEG_B64, mimeType: 'image/jpeg' } }] } }] } }] },
  }
  let storedFor: string | null = null
  const out = await collectInlineImageBatches(admin as never, {
    client: fakeBatches(job),
    storeHero: async (_a, prepared) => { storedFor = prepared.articleId; return { featured_image_url: 'https://cdn/hero.jpg' } },
  })
  check('the hero is stored through the live call\'s own storer', out.stored === 1 && storedFor === ART, JSON.stringify(out))
  check('and its request is marked collected exactly once', admin.tables.inline_image_batch_requests![0]!.status === 'collected')
}
{
  const admin = world({ requests: [heroRequest()] })
  const out = await collectInlineImageBatches(admin as never, { client: fakeBatches({ state: 'JOB_STATE_FAILED' }) })
  check('a failed job leaves the article simply without a hero, and nothing throws', out.failed === 1, JSON.stringify(out))
  check('the request is written off for the record',
    ['failed', 'expired'].includes(String(admin.tables.inline_image_batch_requests![0]!.status)))
}
{
  const admin = world({ requests: [heroRequest()] })
  const job = { state: 'JOB_STATE_SUCCEEDED', dest: { inlinedResponses: [{ metadata: { key: 'hero' }, error: { message: 'safety' } }] } }
  const out = await collectInlineImageBatches(admin as never, { client: fakeBatches(job) })
  check('a per-request error fails only that request', out.failed === 1 && out.stored === 0)
}

// -- F) the switch ----------------------------------------------------------

console.log('\nF) the switch')
{
  check('the hero lane is OFF unless the value is exactly "true"',
    !isHeroImageBatchEnabled({} as NodeJS.ProcessEnv) &&
    !isHeroImageBatchEnabled({ HERO_IMAGE_BATCH_ENABLED: 'TRUE' } as unknown as NodeJS.ProcessEnv) &&
    isHeroImageBatchEnabled({ HERO_IMAGE_BATCH_ENABLED: 'true' } as unknown as NodeJS.ProcessEnv))
  check('and it is independent of the body images\', so either half can be turned off alone',
    isHeroImageBatchEnabled({ HERO_IMAGE_BATCH_ENABLED: 'true' } as unknown as NodeJS.ProcessEnv) &&
    !isInlineImageBatchEnabled({ HERO_IMAGE_BATCH_ENABLED: 'true' } as unknown as NodeJS.ProcessEnv))
}

  console.log(`\n${pass} passed, ${fail} failed`)
  if (fail > 0) process.exitCode = 1
}

main()

export {}
