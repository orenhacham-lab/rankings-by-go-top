/**
 * THE IMAGE BATCH LANE (lib/content/image-batch): the article's BODY images at
 * half price, and never at the cost of an article that is about to go out.
 *
 *   W) the window: when a body image may be ordered instead of called for. A
 *      due pool, an unknown publish time and a publish inside the slack never
 *      batch — the one rule the whole lane's safety rests on, because an image
 *      that arrives after its article published never appears in it
 *   U) submit: one job for the article's images, the entitlement gate first,
 *      the rows marked 'generating', a job whose bookkeeping failed cancelled
 *      rather than paid for, and an id it could not order left for the live call
 *   C) collect: a succeeded job stores the decoded bytes through the shared
 *      storer, a failed/expired/empty job is written off with the editor's
 *      regenerate button, a per-request error fails only that row, a job still
 *      running is left alone until Google's own expiry, and a request already
 *      collected is never stored twice
 *   S) the step: the queue's generation batches what it can and generates the
 *      rest live; with no batcher it behaves exactly as before
 *   G) the gates: the flag off and outside Production nothing is collected; the
 *      isolated pass never throws
 *   R) source guards (each with a MUTATION CONTROL): only the runner may set the
 *      batch flag, the manual routes never do, the hero is never batched, the
 *      request is built from the live call's own prompt builder, and the table
 *      is service-role only
 *
 * Run: npx tsx lib/content/image-batch/__qa__/inline-image-batch.qa.ts
 */
import { FakeAdmin } from '../../../__qa__/_fake-admin'
import { inlineImagesMayBatchForPool, IMAGE_BATCH_MIN_SLACK_MS } from '../may-batch'
import { isInlineImageBatchEnabled } from '../flag'
import {
  submitInlineImageBatch, collectInlineImageBatches, batchImageModel,
  IMAGE_BATCH_JOB_MAX_AGE_MS, MAX_IMAGE_JOBS_PER_PASS, type ImageBatchClient,
} from '../inline-image-batch'
import { runIsolatedInlineImageBatch } from '../isolated'
import { runArticleImageStep } from '../../article-style/generation'
import { sanitizeArticleHtml } from '@/lib/content/article-html'
import { code } from '../../cannibalization/__qa__/_strip'

let pass = 0, fail = 0
function check(name: string, cond: boolean, detail?: string) {
  if (cond) { pass++; console.log(`  ✓ ${name}`) } else { fail++; console.log(`  ✗ ${name}${detail ? ` — ${detail}` : ''}`) }
}

type Row = Record<string, unknown>
const NOW = Date.parse('2026-11-20T09:00:00Z')
const at = (ms: number) => new Date(ms).toISOString()
const PROJECT = 'a1111111-2222-3333-4444-555555555555'
const OWNER = 'u-owner'
const ART = 'art-1'
const IMG1 = 'img-1'
const IMG2 = 'img-2'
// A one-pixel JPEG is all the lane needs: the bytes are opaque to it.
const JPEG_B64 = Buffer.from([0xff, 0xd8, 0xff, 0xd9]).toString('base64')

const ARTICLE = `<h2 id="s1">פתיחה</h2><p>${'מילה '.repeat(40)}</p><h2 id="s2">אמצע</h2><p>${'מילה '.repeat(40)}</p><h2 id="s3">סיום</h2><p>${'מילה '.repeat(40)}</p>`

function imageWorld(images: Row[], errorHooks: Record<string, unknown> = {}) {
  return new FakeAdmin({
    projects: [{ id: PROJECT, user_id: OWNER }],
    generated_articles: [{ id: ART, project_id: PROJECT, title: 'מדריך', topic_id: null, content_html: sanitizeArticleHtml(ARTICLE) }],
    article_inline_images: images,
    inline_image_batch_requests: [],
    project_article_styles: [],
  }, errorHooks as never)
}

const imageRow = (over: Row = {}): Row => ({
  id: IMG1, user_id: OWNER, project_id: PROJECT, article_id: ART,
  section_id: 's1', prompt: 'a running track at dawn', alt_text: 'track',
  position: 0, status: 'pending', storage_path: null, ...over,
})

/** The batch client, injected, so every decision below is the real code. */
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
let lastCreate: Record<string, unknown> | null = null

async function main() {

// -- W) the window ----------------------------------------------------------

console.log('\nW) the window: when a body image may be ordered')
{
  const far = at(NOW + 36 * 60 * 60 * 1000)
  check('a pool publishing a day and a half from now may batch',
    inlineImagesMayBatchForPool({ due: false, nextPublishAt: far, nowMs: NOW }))
  check('a DUE pool never batches, because the runner generates and publishes it in the same run',
    !inlineImagesMayBatchForPool({ due: true, nextPublishAt: far, nowMs: NOW }))
  check('an unknown next publish time never batches',
    !inlineImagesMayBatchForPool({ due: false, nextPublishAt: null, nowMs: NOW }))
  check('an unparseable next publish time never batches',
    !inlineImagesMayBatchForPool({ due: false, nextPublishAt: 'soon', nowMs: NOW }))
  check('a publish inside the slack never batches',
    !inlineImagesMayBatchForPool({ due: false, nextPublishAt: at(NOW + 60 * 60 * 1000), nowMs: NOW }))
  check('a publish already in the past never batches',
    !inlineImagesMayBatchForPool({ due: false, nextPublishAt: at(NOW - 1), nowMs: NOW }))
  check('exactly the slack away is allowed, a millisecond less is not',
    inlineImagesMayBatchForPool({ due: false, nextPublishAt: at(NOW + IMAGE_BATCH_MIN_SLACK_MS), nowMs: NOW }) &&
    !inlineImagesMayBatchForPool({ due: false, nextPublishAt: at(NOW + IMAGE_BATCH_MIN_SLACK_MS - 1), nowMs: NOW }))
  check('the shipped slack is hours, not minutes, and less than the write-off age',
    IMAGE_BATCH_MIN_SLACK_MS >= 4 * 60 * 60 * 1000 && IMAGE_BATCH_MIN_SLACK_MS < IMAGE_BATCH_JOB_MAX_AGE_MS)
}
{
  check('the flag is off unless it is exactly "true"',
    !isInlineImageBatchEnabled({} as NodeJS.ProcessEnv) &&
    !isInlineImageBatchEnabled({ IMAGE_BATCH_ENABLED: 'TRUE' } as unknown as NodeJS.ProcessEnv) &&
    !isInlineImageBatchEnabled({ IMAGE_BATCH_ENABLED: '1' } as unknown as NodeJS.ProcessEnv) &&
    isInlineImageBatchEnabled({ IMAGE_BATCH_ENABLED: 'true' } as unknown as NodeJS.ProcessEnv))
  check('the model ordered from is the live call\'s own first candidate, an image model',
    /image/.test(batchImageModel()))
}

// -- U) submit --------------------------------------------------------------

console.log('\nU) submit')
{
  const out = await submitInlineImageBatch(new FakeAdmin({}) as never, [], { client: fakeBatches({}) })
  check('no ids orders nothing and calls nobody', out.orderedIds.length === 0 && out.reason === 'nothing_to_order')
}
{
  const out = await submitInlineImageBatch(imageWorld([imageRow()]) as never, [IMG1], { client: null })
  check('no API key orders nothing and leaves the row for the live call',
    out.orderedIds.length === 0 && out.reason === 'missing_gemini_api_key' && out.skipped === 1)
}
{
  const fa = imageWorld([imageRow(), imageRow({ id: IMG2, section_id: 's2' })])
  const out = await submitInlineImageBatch(fa as never, [IMG1, IMG2], { client: fakeBatches({}), now: () => new Date(NOW) })
  check('both images are ordered as ONE job', out.orderedIds.length === 2 && out.jobName === 'batches/created')
  const reqs = fa.tables.inline_image_batch_requests as Row[]
  check('a bookkeeping row per request, keyed by position inside the job',
    reqs.length === 2 && reqs[0].request_key === '0' && reqs[1].request_key === '1' &&
    reqs.every((r) => r.job_name === 'batches/created' && r.status === 'submitted' && r.project_id === PROJECT && r.article_id === ART))
  check('it never holds the image itself',
    reqs.every((r) => !Object.keys(r).some((k) => /^(image|bytes|data|image_data)$/.test(k))))
  const rows = fa.tables.article_inline_images as Row[]
  check('the image rows are marked generating, which is what the editor already shows',
    rows.every((r) => r.status === 'generating'))
  check('the request carries one inlined request per image, with the 16:9 2K image config',
    Array.isArray((lastCreate?.src as { inlinedRequests?: unknown[] })?.inlinedRequests) &&
    ((lastCreate?.src as { inlinedRequests: Row[] }).inlinedRequests).length === 2 &&
    JSON.stringify(lastCreate).includes('"aspectRatio":"16:9"') && JSON.stringify(lastCreate).includes('"imageSize":"2K"'))
  check('and the prompt sent is the section prompt the row carries',
    JSON.stringify(lastCreate).includes('running track at dawn'))
}
{
  const fa = imageWorld([imageRow()])
  const out = await submitInlineImageBatch(fa as never, [IMG1, 'does-not-exist'], { client: fakeBatches({}) })
  check('an id with no row is skipped, not an error', out.orderedIds.length === 1 && out.skipped === 1)
}
{
  // A project whose owner lookup fails is a DENIED gate (entitlement_unavailable),
  // so nothing may be ordered for it — a batch request costs money as surely as
  // a live call.
  const fa = imageWorld([imageRow()], { projects: { select: () => ({ code: '42501', message: 'denied' }) } })
  const out = await submitInlineImageBatch(fa as never, [IMG1], { client: fakeBatches({}) })
  check('a denied entitlement gate orders nothing and marks the row failed',
    out.orderedIds.length === 0 && (fa.tables.article_inline_images as Row[])[0].status === 'failed')
}
{
  let cancelled = 0
  const fa = imageWorld([imageRow()], { inline_image_batch_requests: { insert: () => ({ code: '42501', message: 'denied' }) } })
  const out = await submitInlineImageBatch(fa as never, [IMG1], { client: fakeBatches({}, { onCancel: () => { cancelled++ } }) })
  check('a job whose bookkeeping failed is CANCELLED rather than paid for, and the row is left for the live call',
    out.orderedIds.length === 0 && out.reason === 'insert_failed' && cancelled === 1 &&
    (fa.tables.article_inline_images as Row[])[0].status !== 'generating')
}
{
  const fa = imageWorld([imageRow()])
  const out = await submitInlineImageBatch(fa as never, [IMG1], { client: fakeBatches({}, { createThrows: true }) })
  check('a refused job orders nothing, throws nothing, and leaves the row alone',
    out.orderedIds.length === 0 && out.reason === 'batch_create_failed' &&
    (fa.tables.article_inline_images as Row[])[0].status === 'pending')
}
{
  const fa = imageWorld([imageRow()])
  const out = await submitInlineImageBatch(fa as never, [IMG1], { client: fakeBatches({}, { name: null }) })
  check('a job created without a name is not recorded', out.orderedIds.length === 0 && out.reason === 'batch_no_job_name' &&
    (fa.tables.inline_image_batch_requests as Row[]).length === 0)
}

// -- C) collect -------------------------------------------------------------

console.log('\nC) collect')
const reqRow = (over: Row = {}): Row => ({
  id: 'req-1', job_name: 'batches/j1', request_key: '0', model: 'gemini-3.1-flash-image',
  inline_image_id: IMG1, project_id: PROJECT, article_id: ART, status: 'submitted',
  last_error: null, submitted_at: at(NOW - 60 * 60 * 1000), collected_at: null, ...over,
})
function collectWorld(reqs: Row[], images: Row[] = [imageRow()]) {
  const fa = imageWorld(images)
  fa.tables.inline_image_batch_requests = reqs
  return fa
}
const succeeded = (entries: unknown[]) => ({ state: 'JOB_STATE_SUCCEEDED', dest: { inlinedResponses: entries } })
const okEntry = (key = '0') => ({
  metadata: { key },
  response: { candidates: [{ content: { parts: [{ text: 'here' }, { inlineData: { data: JPEG_B64, mimeType: 'image/jpeg' } }] } }] },
})
async function collectWith(fa: FakeAdmin, job: Record<string, unknown>, nowMs = NOW) {
  const stored: { id: string; bytes: number; mimeType: string }[] = []
  const res = await collectInlineImageBatches(fa as never, {
    client: fakeBatches(job),
    now: () => new Date(nowMs),
    store: async (_a, row, input) => { stored.push({ id: row.id, bytes: input.data.length, mimeType: input.mimeType }); return { ok: true, url: 'https://x/i.jpg' } },
  })
  return { res, stored }
}
{
  const fa = collectWorld([reqRow()])
  const { res, stored } = await collectWith(fa, succeeded([okEntry()]))
  check('a succeeded job stores the image through the shared storer', res.stored === 1 && stored.length === 1 && stored[0].id === IMG1)
  check('the base64 reply is decoded to the real bytes, with its own mime type',
    stored[0].bytes === 4 && stored[0].mimeType === 'image/jpeg')
  check('and the request is marked collected', (fa.tables.inline_image_batch_requests as Row[])[0].status === 'collected')
}
{
  const fa = collectWorld([reqRow({ status: 'collected' })])
  const { res, stored } = await collectWith(fa, succeeded([okEntry()]))
  check('a request already collected is never stored a second time', res.jobsChecked === 0 && stored.length === 0)
}
{
  // Two requests of one job, replies in the WRONG order: the key decides.
  const fa = collectWorld(
    [reqRow(), reqRow({ id: 'req-2', request_key: '1', inline_image_id: IMG2 })],
    [imageRow(), imageRow({ id: IMG2, section_id: 's2' })],
  )
  const { stored } = await collectWith(fa, succeeded([okEntry('1'), okEntry('0')]))
  check('a reply is matched by its key, not by its place in the list',
    stored.length === 2 && stored[0].id === IMG1 && stored[1].id === IMG2, JSON.stringify(stored))
}
for (const state of ['JOB_STATE_FAILED', 'JOB_STATE_CANCELLED', 'JOB_STATE_EXPIRED']) {
  const fa = collectWorld([reqRow()])
  const { res } = await collectWith(fa, { state })
  const req = (fa.tables.inline_image_batch_requests as Row[])[0]
  check(`a ${state} job is written off and its image marked failed for the editor`,
    res.failed === 1 && res.stored === 0 &&
    req.status === (state === 'JOB_STATE_EXPIRED' ? 'expired' : 'failed') &&
    (fa.tables.article_inline_images as Row[])[0].status === 'failed' &&
    String((fa.tables.article_inline_images as Row[])[0].last_error).startsWith('image_batch_'))
}
{
  const fa = collectWorld([reqRow()])
  const { res } = await collectWith(fa, { state: 'JOB_STATE_RUNNING' })
  check('a job still running is left alone, nothing failed and nothing stored',
    res.stillRunning === 1 && res.failed === 0 && res.stored === 0 &&
    (fa.tables.inline_image_batch_requests as Row[])[0].status === 'submitted')
}
{
  const fa = collectWorld([reqRow({ submitted_at: at(NOW - IMAGE_BATCH_JOB_MAX_AGE_MS - 1000) })])
  const { res } = await collectWith(fa, { state: 'JOB_STATE_RUNNING' })
  check('a job stuck past Google\'s own expiry is written off so the row stops being "generating" forever',
    res.failed === 1 && (fa.tables.article_inline_images as Row[])[0].status === 'failed')
}
{
  const fa = collectWorld([reqRow()])
  const { res } = await collectWith(fa, succeeded([]))
  check('a succeeded job with no replies at all is written off, not left in flight', res.failed === 1)
}
{
  const fa = collectWorld([reqRow(), reqRow({ id: 'req-2', request_key: '1', inline_image_id: IMG2 })], [imageRow(), imageRow({ id: IMG2 })])
  const { res, stored } = await collectWith(fa, succeeded([okEntry('0'), { metadata: { key: '1' }, error: { message: 'quota' } }]))
  check('a per-request error fails only that row; the other image is still stored',
    res.stored === 1 && res.failed === 1 && stored.length === 1 &&
    (fa.tables.article_inline_images as Row[]).find((r) => r.id === IMG2)?.status === 'failed')
}
{
  const fa = collectWorld([reqRow()])
  const { res } = await collectWith(fa, succeeded([{ metadata: { key: '0' }, response: { candidates: [{ content: { parts: [{ text: 'sorry, no image' }] } }] } }]))
  check('a reply that carried text but no image fails that row with a reason', res.failed === 1 &&
    (fa.tables.article_inline_images as Row[])[0].last_error === 'image_batch_no_image_returned')
}
{
  // The article was deleted while the job ran: there is nothing to finish and
  // nothing wrong. The reply is dropped.
  const fa = collectWorld([reqRow()], [])
  const { res, stored } = await collectWith(fa, succeeded([okEntry()]))
  check('a reply whose image row is gone is dropped, not an error',
    stored.length === 0 && res.failed === 0 && (fa.tables.inline_image_batch_requests as Row[])[0].last_error === 'image_row_gone')
}
{
  const fa = collectWorld([reqRow()])
  const res = await collectInlineImageBatches(fa as never, {
    client: { batches: { create: async () => ({}), get: async () => { throw new Error('5xx') }, cancel: async () => {} } },
    now: () => new Date(NOW),
  })
  check('a job that cannot be read is retried next pass, not failed', res.stillRunning === 1 && res.failed === 0)
}
{
  const res = await collectInlineImageBatches(collectWorld([]) as never, { client: fakeBatches({}) })
  check('nothing in flight is no calls and no error', res.jobsChecked === 0)
}
{
  check('the jobs polled per pass is a small bounded number', MAX_IMAGE_JOBS_PER_PASS >= 1 && MAX_IMAGE_JOBS_PER_PASS <= 50)
}

// -- S) the step ------------------------------------------------------------

console.log('\nS) the generation step')
{
  const fa = imageWorld([])
  fa.tables.project_article_styles = [{ project_id: PROJECT, user_id: OWNER, inline_images: 2 }]
  const live: string[] = []
  const r = await runArticleImageStep(fa as never, { articleId: ART, projectId: PROJECT, ownerId: OWNER }, {
    createFeaturedImage: async () => ({ featured_image_url: 'https://x/h.jpg' }),
    generateInline: async (_a, id) => { live.push(id); return { ok: true, url: 'https://x/i.jpg' } },
    batchInline: async (_a, ids) => ids,
  })
  check('every body image the batcher took is NOT called for live', r.inline.created === 2 && r.inline.batched === 2 && live.length === 0)
  check('and the hero is still made live, because a fresh draft without one looks broken', r.imageGenerated)
}
{
  const fa = imageWorld([])
  fa.tables.project_article_styles = [{ project_id: PROJECT, user_id: OWNER, inline_images: 2 }]
  const live: string[] = []
  const r = await runArticleImageStep(fa as never, { articleId: ART, projectId: PROJECT, ownerId: OWNER }, {
    createFeaturedImage: async () => ({ featured_image_url: 'https://x/h.jpg' }),
    generateInline: async (_a, id) => { live.push(id); return { ok: true, url: 'https://x/i.jpg' } },
    batchInline: async (_a, ids) => ids.slice(0, 1),
  })
  check('an image the batcher could not take falls through to the live call',
    r.inline.batched === 1 && live.length === 1 && r.inline.ready === 1)
}
{
  const fa = imageWorld([])
  fa.tables.project_article_styles = [{ project_id: PROJECT, user_id: OWNER, inline_images: 2 }]
  const live: string[] = []
  const r = await runArticleImageStep(fa as never, { articleId: ART, projectId: PROJECT, ownerId: OWNER }, {
    createFeaturedImage: async () => ({ featured_image_url: 'https://x/h.jpg' }),
    generateInline: async (_a, id) => { live.push(id); return { ok: true, url: 'https://x/i.jpg' } },
    batchInline: async () => { throw new Error('lane down') },
  })
  check('a batcher that throws cannot cost the article its images', live.length === 2 && r.inline.batched === 0)
}
{
  const fa = imageWorld([])
  fa.tables.project_article_styles = [{ project_id: PROJECT, user_id: OWNER, inline_images: 2 }]
  const live: string[] = []
  const r = await runArticleImageStep(fa as never, { articleId: ART, projectId: PROJECT, ownerId: OWNER }, {
    createFeaturedImage: async () => ({ featured_image_url: 'https://x/h.jpg' }),
    generateInline: async (_a, id) => { live.push(id); return { ok: true, url: 'https://x/i.jpg' } },
  })
  check('with no batcher at all the step is exactly what it was: every image live',
    live.length === 2 && r.inline.batched === 0 && r.inline.ready === 2)
}

// -- G) the gates -----------------------------------------------------------

console.log('\nG) the gates')
{
  let ran = 0
  const run = async () => { ran++; return { jobsChecked: 0, stored: 0, failed: 0, stillRunning: 0 } }
  check('outside Production nothing is collected',
    (await runIsolatedInlineImageBatch(run, { env: { VERCEL_ENV: 'preview', IMAGE_BATCH_ENABLED: 'true' } })).status === 'not_production' && ran === 0)
  check('with the flag off nothing is collected',
    (await runIsolatedInlineImageBatch(run, { env: { VERCEL_ENV: 'production' } })).status === 'feature_off' && ran === 0)
  const out = await runIsolatedInlineImageBatch(run, { env: { VERCEL_ENV: 'production', IMAGE_BATCH_ENABLED: 'true' } })
  check('on in Production it runs', out.status === 'ran' && ran === 1)
  const threw = await runIsolatedInlineImageBatch(async () => { throw new Error('boom') }, { env: { VERCEL_ENV: 'production', IMAGE_BATCH_ENABLED: 'true' } })
  check('and a pass that throws is swallowed, so it can never fail the cron', threw.status === 'error')
}

// -- R) source guards -------------------------------------------------------

console.log('\nR) source guards')
const cron = code('app/api/content/automation/cron/route.ts')
const runner = code('lib/content/automation/runner.ts')
const genItem = code('lib/content/automation/generate-item.ts')
const gen = code('lib/content/article-generation.ts')
const step = code('lib/content/article-style/generation.ts')
const lane = code('lib/content/image-batch/inline-image-batch.ts')
const manual1 = code('app/api/content/articles/generate/route.ts')
const manual2 = code('app/api/content/automation/items/[itemId]/generate/route.ts')
const migration = code('supabase/migrations/20261114010000_inline_image_batch_requests.sql')

function guard(name: string, cond: boolean, mutationName: string, mutated: boolean) {
  check(name, cond)
  check(`  MUTATION CONTROL — ${mutationName}`, !mutated)
}

guard(
  'the cron collects through the isolated wrapper',
  /await runIsolatedInlineImageBatch\(\)/.test(cron) && /from '@\/lib\/content\/image-batch\/isolated'/.test(cron),
  'a cron that called the pass directly would fail this',
  /await runInlineImageBatchPass\(/.test(cron),
)
guard(
  'the runner is the ONLY place that decides a pool may batch, and it asks the window rule',
  /inlineImagesMayBatchForPool\(\{ due, nextPublishAt: pool\.next_publish_at, nowMs \}\)/.test(runner) &&
  /inlineImagesMayBatch: mayBatch/.test(runner),
  'a runner that batched unconditionally would fail this',
  /inlineImagesMayBatch: true/.test(runner),
)
guard(
  'a merchant pressing generate never gets a batched image: neither manual route sets the flag',
  !/inlineImagesMayBatch/.test(manual1) && !/inlineImagesMayBatch/.test(manual2),
  'a manual route that opted in would fail this',
  !/inlineImagesMayBatch/.test(`${manual1}\ninlineImagesMayBatch: true`),
)
guard(
  'the generation path orders images only when the caller allowed it AND the flag is on',
  /opts\.inlineImagesMayBatch && isInlineImageBatchEnabled\(\)/.test(gen),
  'a generation path that read the lane unconditionally would fail this',
  /batchInline: async \(a, imageIds\)/.test(gen),
)
guard(
  'only the BODY images are batched: the hero has no batch path at all',
  /createFeaturedImage: \(\) => deps\.createFeaturedImage\(admin, inserted\.id\)/.test(gen) &&
  !/batchFeatured|batchHero/.test(`${gen}\n${step}\n${lane}`),
  'a hero ordered from the batch lane would fail this',
  !/batchHero/.test(`${step}\nbatchHero: () => order(hero)`),
)
guard(
  'an id the lane could not order is generated live instead',
  /const live = imageIds\.filter\(\(id\) => !batched\.includes\(id\)\)/.test(step),
  'a step that silently dropped the images it failed to order would fail this',
  /const live: string\[\] = \[\]/.test(step),
)
guard(
  'the image request is built from the live call\'s own input and prompt builder',
  /buildImagePrompt\(input\)/.test(lane) && /inlineImageModelInput\(admin, row\)/.test(lane),
  'a lane that wrote its own image prompt would fail this',
  /const prompt = `Create a/.test(lane),
)
guard(
  'the same entitlement gate runs before anything is ordered',
  /inlineImageGateDenial\(admin, row\.project_id, nowFn\)/.test(lane),
  'a lane that ordered without the gate would fail this',
  !/inlineImageGateDenial/.test(lane),
)
guard(
  'a job whose bookkeeping failed is cancelled instead of paid for',
  /batches\.cancel\(\{ name: jobName \}\)/.test(lane),
  'a lane that left an unclaimable job running would fail this',
  !/insert_failed/.test(lane),
)
guard(
  'the request row is CLAIMED before the image is stored, so two passes cannot upload it twice',
  /\.eq\('id', r\.id\)\.eq\('status', 'submitted'\)\.select\('id'\)/.test(lane),
  'a lane that stored first and marked collected afterwards would fail this',
  /storeInlineImageBytes[\s\S]{0,200}status: 'collected'/.test(lane),
)
guard(
  'the bytes are stored through the shared storer, so a batched image is named and published like a live one',
  /storeInlineImageBytes\)\(admin, row, \{ data: Buffer\.from\(img\.data, 'base64'\)/.test(lane),
  'a lane that uploaded to the bucket itself would fail this',
  /admin\.storage\.from\(/.test(lane),
)
guard(
  'the table is service-role only: RLS on and no policy',
  /alter table public\.inline_image_batch_requests\s+enable row level security/.test(migration) && !/create policy/i.test(migration),
  'a migration that granted a merchant-facing policy would fail this',
  /create policy/i.test(migration),
)
guard(
  'and it has no foreign key a deleted article could break',
  !/references public\./.test(migration),
  'a foreign key to article_inline_images would fail this',
  /references public\.article_inline_images/.test(migration),
)
guard(
  'the queue passes the flag through untouched',
  /inlineImagesMayBatch: opts\.inlineImagesMayBatch === true/.test(genItem),
  'a queue that hard-coded it on would fail this',
  /inlineImagesMayBatch: true/.test(genItem),
)

}

main().then(() => {
  console.log(`\n${pass} passed, ${fail} failed`)
  if (fail > 0) process.exitCode = 1
})

export {}
