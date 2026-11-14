/**
 * THE BATCH LANE (lib/content/batch): article first drafts at half price, and
 * never at the cost of an article.
 *
 *   F) the fingerprint: the prompt decides, the topic never does; a changed
 *      brief, another model or a repair prompt all miss
 *   T) take: a ready draft is served once and consumed, a second taker gets
 *      nothing, a draft past its shelf life is discarded not served, a read
 *      error returns null instead of throwing
 *   S) select: only a pool with a buffer, the next queued item, never a topic
 *      that already has a draft in flight, bounded
 *   U) submit: one job with the FIRST-attempt prompt and the live call's own
 *      generation config, a row per request, and a job whose bookkeeping failed
 *      is cancelled rather than paid for
 *   C) collect: a succeeded job stores text and usage, a failed/expired job is
 *      written off, a per-request error fails only that row, a job still running
 *      is left alone until Google's own 48-hour expiry
 *   G) the gates: the flag off and outside Production nothing is ordered; the
 *      isolated pass never throws
 *   X) the generator: a batched draft replaces the first call only, unusable
 *      text falls back to the live call, and the repair attempt is always live
 *   R) source guards (each with a MUTATION CONTROL): the cron calls it isolated,
 *      the generation path reads the lane behind the flag, the batch request is
 *      built from the shared brief builder, and the table is service-role only
 *
 * Run: npx tsx lib/content/batch/__qa__/article-batch.qa.ts
 */
import { FakeAdmin } from '../../../__qa__/_fake-admin'
import { articlePromptFingerprint, buildPrompt, parseArticleResponseText, type ArticleBrief } from '../../gemini-article'
import { takeBatchedDraft, READY_DRAFT_MAX_AGE_MS } from '../take-draft'
import { isArticleBatchEnabled } from '../flag'
import { selectBatchCandidates, submitArticleBatch, collectArticleBatches, BATCH_JOB_MAX_AGE_MS, MAX_BATCH_REQUESTS_PER_RUN, type BatchClient } from '../article-batch'
import { runIsolatedArticleBatch } from '../isolated'
import { code } from '../../cannibalization/__qa__/_strip'

let pass = 0, fail = 0
function check(name: string, cond: boolean, detail?: string) {
  if (cond) { pass++; console.log(`  ✓ ${name}`) } else { fail++; console.log(`  ✗ ${name}${detail ? ` — ${detail}` : ''}`) }
}

type Row = Record<string, unknown>
const NOW = Date.parse('2026-11-20T09:00:00Z')
const at = (ms: number) => new Date(ms).toISOString()

const brief = (over: Partial<ArticleBrief> = {}): ArticleBrief => ({
  language: 'he',
  topic: 'מדריך לבחירת מסלול ריצה',
  primaryKeyword: 'מסלול ריצה',
  secondaryKeywords: ['ריצה בפארק'],
  searchIntent: 'informational',
  targetAudience: null,
  toneOfVoice: null,
  desiredWordCount: 1200,
  targetWordMin: 1100,
  targetWordMax: 1400,
  ctaPreference: null,
  anchors: [],
  businessName: 'רצים',
  domain: 'example.com',
  ...over,
} as ArticleBrief)

async function main() {
// -- F) the fingerprint -----------------------------------------------------

console.log('\nF) the fingerprint')
{
  const a = buildPrompt(brief(), {})
  const b = buildPrompt(brief(), {})
  check('the same brief gives the same prompt', a === b)
  check('the same prompt and model give the same fingerprint',
    articlePromptFingerprint(a, 'gemini-3.8-flash') === articlePromptFingerprint(b, 'gemini-3.8-flash'))
  check('another model is another fingerprint',
    articlePromptFingerprint(a, 'gemini-3.8-flash') !== articlePromptFingerprint(a, 'gemini-2.5-pro'))

  const edited = buildPrompt(brief({ topic: 'מדריך לבחירת נעלי ריצה' }), {})
  check('an edited topic is another fingerprint',
    articlePromptFingerprint(a, 'm') !== articlePromptFingerprint(edited, 'm'))

  const deeper = buildPrompt(brief({ targetWordMin: 1800, targetWordMax: 2200 }), {})
  check('a re-classified depth is another fingerprint',
    articlePromptFingerprint(a, 'm') !== articlePromptFingerprint(deeper, 'm'))

  const linked = buildPrompt(brief({ plannedInternalAnchors: ['נעלי ריצה לגברים'] }), {})
  check('an approved internal link is another fingerprint',
    articlePromptFingerprint(a, 'm') !== articlePromptFingerprint(linked, 'm'))

  const repair = buildPrompt(brief(), { repairFailures: ['has_list'] })
  check('the repair prompt is another fingerprint, so a repair can never be served a batched draft',
    articlePromptFingerprint(a, 'm') !== articlePromptFingerprint(repair, 'm'))

  check('a fingerprint is a hex sha256', /^[0-9a-f]{64}$/.test(articlePromptFingerprint(a, 'm')))
}

// -- T) take ----------------------------------------------------------------

console.log('\nT) take')
const ARTICLE_JSON = JSON.stringify({
  title: 'איך לבחור מסלול ריצה',
  slug: 'running-route',
  metaTitle: 'מסלול ריצה',
  metaDescription: 'x'.repeat(130),
  excerpt: 'תקציר',
  directAnswer: 'תשובה',
  intro: ['פתיחה'],
  sections: [{ heading: 'כותרת', answerFirst: 'משפט', paragraphs: ['פסקה'], bullets: [] }],
  faq: [], readerChecks: [], imagePrompt: 'prompt', warnings: [],
})

function draftRow(over: Row = {}): Row {
  return {
    id: 'd1', job_name: 'batches/j1', request_key: '0', model: 'gemini-3.8-flash',
    prompt_fingerprint: 'fp-1', project_id: 'p1', topic_id: 't1', status: 'ready',
    response_text: ARTICLE_JSON, input_tokens: 1800, output_tokens: 5200,
    last_error: null, submitted_at: at(NOW - 3600_000), ready_at: at(NOW - 600_000),
    consumed_at: null, ...over,
  }
}

{
  const fa = new FakeAdmin({ article_batch_drafts: [draftRow()] })
  const admin = fa as never
  const hit = await takeBatchedDraft(admin, 'fp-1', () => new Date(NOW))
  check('a ready draft for this fingerprint is served', hit?.text === ARTICLE_JSON)
  check('its usage comes back for the usage log', hit?.usage?.outputTokens === 5200 && hit?.usage?.model === 'gemini-3.8-flash')
  const row = (fa.tables.article_batch_drafts as Row[])[0]
  check('the row is consumed', row.status === 'consumed' && typeof row.consumed_at === 'string')
  check('the text is cleared from the row once used', row.response_text === null)

  const second = await takeBatchedDraft(admin, 'fp-1', () => new Date(NOW))
  check('a second taker gets nothing (no two articles from one draft)', second === null)
}
{
  const fa = new FakeAdmin({ article_batch_drafts: [draftRow()] })
  const miss = await takeBatchedDraft(fa as never, 'fp-other', () => new Date(NOW))
  check('another fingerprint is a miss', miss === null)
  check('and the draft is left untouched for its own generation', (fa.tables.article_batch_drafts as Row[])[0].status === 'ready')
}
{
  const fa = new FakeAdmin({ article_batch_drafts: [draftRow({ status: 'submitted' })] })
  check('a draft still in flight is never served', await takeBatchedDraft(fa as never, 'fp-1', () => new Date(NOW)) === null)
}
{
  const old = at(NOW - READY_DRAFT_MAX_AGE_MS - 1000)
  const fa = new FakeAdmin({ article_batch_drafts: [draftRow({ ready_at: old })] })
  check('a draft past its shelf life is not served', await takeBatchedDraft(fa as never, 'fp-1', () => new Date(NOW)) === null)
  const row = (fa.tables.article_batch_drafts as Row[])[0]
  check('and it is marked expired rather than left to be read again', row.status === 'expired' && row.last_error === 'ready_draft_too_old')
}
{
  const fa = new FakeAdmin({ article_batch_drafts: [draftRow()] }, { article_batch_drafts: { select: () => ({ code: '42501', message: 'denied' }) } })
  check('a read error returns null instead of throwing', await takeBatchedDraft(fa as never, 'fp-1', () => new Date(NOW)) === null)
}
{
  const fa = new FakeAdmin({ article_batch_drafts: [draftRow({ response_text: null })] })
  check('a ready row with no text is a miss', await takeBatchedDraft(fa as never, 'fp-1', () => new Date(NOW)) === null)
}

// -- S) select --------------------------------------------------------------

console.log('\nS) select')
function poolWorld(over: { items?: Row[]; drafts?: Row[]; pools?: Row[] } = {}) {
  return new FakeAdmin({
    article_pools: over.pools ?? [
      { id: 'pool1', project_id: 'p1', is_active: true },
      { id: 'pool2', project_id: 'p2', is_active: true },
      { id: 'pool3', project_id: 'p3', is_active: false },
    ],
    article_pool_items: over.items ?? [
      // pool1: A generated and waiting, B and C queued → B is the one to order.
      { id: 'A', pool_id: 'pool1', project_id: 'p1', topic_id: 'tA', status: 'generated', position: 1 },
      { id: 'B', pool_id: 'pool1', project_id: 'p1', topic_id: 'tB', status: 'queued', position: 2 },
      { id: 'C', pool_id: 'pool1', project_id: 'p1', topic_id: 'tC', status: 'queued', position: 3 },
      // pool2: nothing generated → the live call keeps it on time, no draft ordered.
      { id: 'D', pool_id: 'pool2', project_id: 'p2', topic_id: 'tD', status: 'queued', position: 1 },
      // pool3 is inactive.
      { id: 'E', pool_id: 'pool3', project_id: 'p3', topic_id: 'tE', status: 'generated', position: 1 },
      { id: 'F', pool_id: 'pool3', project_id: 'p3', topic_id: 'tF', status: 'queued', position: 2 },
    ],
    article_batch_drafts: over.drafts ?? [],
  })
}
{
  const got = await selectBatchCandidates(poolWorld() as never, 10)
  check('one candidate: the next queued item of the pool that has a buffer',
    got.length === 1 && got[0].topicId === 'tB' && got[0].projectId === 'p1', JSON.stringify(got))
  check('a pool with nothing generated is left to the live call', !got.some((c) => c.topicId === 'tD'))
  check('an inactive pool is never ordered for', !got.some((c) => c.topicId === 'tF'))
  check('only the NEXT queued item, not the whole queue', !got.some((c) => c.topicId === 'tC'))
}
{
  const got = await selectBatchCandidates(poolWorld({ drafts: [draftRow({ topic_id: 'tB', status: 'submitted' })] }) as never, 10)
  check('a topic whose draft is already in flight is not ordered twice', got.length === 0)
}
{
  const got = await selectBatchCandidates(poolWorld({ drafts: [draftRow({ topic_id: 'tB', status: 'ready' })] }) as never, 10)
  check('nor one whose draft is ready and waiting', got.length === 0)
}
{
  const got = await selectBatchCandidates(poolWorld({ drafts: [draftRow({ topic_id: 'tB', status: 'consumed' })] }) as never, 10)
  check('a consumed draft does not block the next order', got.length === 1 && got[0].topicId === 'tB')
}
{
  const items: Row[] = []
  for (let i = 1; i <= 6; i++) {
    items.push({ id: `g${i}`, pool_id: `pool${i}`, project_id: `p${i}`, topic_id: `tg${i}`, status: 'generated', position: 1 })
    items.push({ id: `q${i}`, pool_id: `pool${i}`, project_id: `p${i}`, topic_id: `tq${i}`, status: 'queued', position: 2 })
  }
  const pools: Row[] = []
  for (let i = 1; i <= 6; i++) pools.push({ id: `pool${i}`, project_id: `p${i}`, is_active: true })
  const got = await selectBatchCandidates(poolWorld({ items, pools }) as never, 2)
  check('the limit is respected', got.length === 2)
  check('and the shipped limit is a small number', MAX_BATCH_REQUESTS_PER_RUN >= 1 && MAX_BATCH_REQUESTS_PER_RUN <= 20)
}
{
  const got = await selectBatchCandidates(new FakeAdmin({ article_pools: [], article_pool_items: [], article_batch_drafts: [] }) as never, 5)
  check('no pools is no candidates and no error', got.length === 0)
}

// -- U) submit --------------------------------------------------------------

console.log('\nU) submit')
console.log('  (submitArticleBatch builds briefs from the live database; its request shape is proved by the source guards in R)')
{
  const out = await submitArticleBatch(new FakeAdmin({}) as never, [])
  check('no candidates orders nothing and calls nobody', out.ordered === 0 && out.reason === 'no_candidates')
}

// -- C) collect -------------------------------------------------------------

console.log('\nC) collect')
/**
 * collectArticleBatches takes its Gemini client as an injected dependency, so
 * every decision below — the states, the per-request errors, the expiry — is
 * the real code running against a job whose shape the test chooses.
 */
function fakeBatches(job: Record<string, unknown>, onCancel?: () => void): BatchClient {
  return {
    batches: {
      create: async () => ({ name: 'batches/created' }),
      get: async () => job,
      cancel: async () => { onCancel?.() },
    },
  }
}
async function collectWith(fa: FakeAdmin, job: Record<string, unknown>, nowMs = NOW) {
  return collectArticleBatches(fa as never, () => new Date(nowMs), { client: fakeBatches(job) })
}
{
  const fa = new FakeAdmin({ article_batch_drafts: [draftRow({ status: 'submitted', response_text: null, ready_at: null })] })
  const res = await collectWith(fa, {
    state: 'JOB_STATE_SUCCEEDED',
    dest: { inlinedResponses: [{ metadata: { key: '0' }, response: { text: ARTICLE_JSON, usageMetadata: { promptTokenCount: 1700, candidatesTokenCount: 4900 } } }] },
  })
  const row = (fa.tables.article_batch_drafts as Row[])[0]
  check('a succeeded job makes the draft ready', res.ready === 1 && row.status === 'ready')
  check('the text is stored', row.response_text === ARTICLE_JSON)
  check('the usage is stored for the usage log', row.input_tokens === 1700 && row.output_tokens === 4900)
  check('and the stored text parses into an article through the generator\'s own parser',
    !('error' in parseArticleResponseText(String(row.response_text), null)))
}
{
  const fa = new FakeAdmin({ article_batch_drafts: [draftRow({ status: 'submitted', response_text: null, ready_at: null })] })
  const res = await collectWith(fa, { state: 'JOB_STATE_FAILED', error: { message: 'bad' } })
  check('a failed job is written off', res.failed === 1 && (fa.tables.article_batch_drafts as Row[])[0].status === 'failed')
}
{
  const fa = new FakeAdmin({ article_batch_drafts: [draftRow({ status: 'submitted', response_text: null, ready_at: null })] })
  const res = await collectWith(fa, { state: 'JOB_STATE_EXPIRED' })
  check('an expired job is marked expired, never retried', res.failed === 1 && (fa.tables.article_batch_drafts as Row[])[0].status === 'expired')
}
{
  const fa = new FakeAdmin({ article_batch_drafts: [draftRow({ status: 'submitted', response_text: null, ready_at: null })] })
  const res = await collectWith(fa, { state: 'JOB_STATE_RUNNING' })
  check('a job still running is left alone', res.stillRunning === 1 && (fa.tables.article_batch_drafts as Row[])[0].status === 'submitted')
}
{
  const fa = new FakeAdmin({ article_batch_drafts: [draftRow({ status: 'submitted', response_text: null, ready_at: null, submitted_at: at(NOW - BATCH_JOB_MAX_AGE_MS - 1000) })] })
  const res = await collectWith(fa, { state: 'JOB_STATE_RUNNING' })
  check('a job stuck past Google\'s own expiry stops being polled', res.failed === 1 && (fa.tables.article_batch_drafts as Row[])[0].status === 'expired')
}
{
  const fa = new FakeAdmin({
    article_batch_drafts: [
      draftRow({ id: 'd1', request_key: '0', status: 'submitted', response_text: null, ready_at: null }),
      draftRow({ id: 'd2', request_key: '1', topic_id: 't2', prompt_fingerprint: 'fp-2', status: 'submitted', response_text: null, ready_at: null }),
    ],
  })
  const res = await collectWith(fa, {
    state: 'JOB_STATE_SUCCEEDED',
    dest: { inlinedResponses: [
      { metadata: { key: '0' }, response: { text: ARTICLE_JSON, usageMetadata: { promptTokenCount: 1, candidatesTokenCount: 2 } } },
      { metadata: { key: '1' }, error: { code: 429, message: 'resource exhausted' } },
    ] },
  })
  const rows = fa.tables.article_batch_drafts as Row[]
  check('one request failing inside a job fails only that row', res.ready === 1 && res.failed === 1)
  check('the good one is ready', rows.find((r) => r.id === 'd1')?.status === 'ready')
  check('the bad one is failed with its reason', rows.find((r) => r.id === 'd2')?.status === 'failed' && String(rows.find((r) => r.id === 'd2')?.last_error).includes('resource exhausted'))
}
{
  const fa = new FakeAdmin({ article_batch_drafts: [draftRow({ status: 'submitted', response_text: null, ready_at: null })] })
  const res = await collectWith(fa, {
    state: 'JOB_STATE_SUCCEEDED',
    dest: { inlinedResponses: [{ metadata: { key: '0' }, response: { candidates: [{ content: { parts: [{ text: ARTICLE_JSON }] } }] } }] },
  })
  check('the text is read from candidates/parts when there is no text accessor', res.ready === 1)
}
{
  const fa = new FakeAdmin({ article_batch_drafts: [draftRow({ status: 'submitted', response_text: null, ready_at: null })] })
  const res = await collectWith(fa, { state: 'JOB_STATE_SUCCEEDED', dest: { inlinedResponses: [] } })
  check('a job that succeeded with no inlined responses is written off, not polled forever', res.failed === 1)
}
{
  const fa = new FakeAdmin({ article_batch_drafts: [] })
  const res = await collectWith(fa, { state: 'JOB_STATE_SUCCEEDED' })
  check('nothing in flight does nothing', res.ready === 0 && res.failed === 0 && res.stillRunning === 0)
}

// -- G) the gates -----------------------------------------------------------

console.log('\nG) the gates')
{
  check('off by default', !isArticleBatchEnabled({} as NodeJS.ProcessEnv))
  check('off on anything but the exact string', !isArticleBatchEnabled({ ARTICLE_BATCH_ENABLED: 'TRUE' } as unknown as NodeJS.ProcessEnv))
  check('on only for "true"', isArticleBatchEnabled({ ARTICLE_BATCH_ENABLED: 'true' } as unknown as NodeJS.ProcessEnv))

  let ran = 0
  const run = async () => { ran++; return { enabled: true } }
  check('outside Production nothing runs',
    (await runIsolatedArticleBatch(run, { env: { VERCEL_ENV: 'preview', ARTICLE_BATCH_ENABLED: 'true' } })).status === 'not_production' && ran === 0)
  check('in Production with the flag off nothing runs',
    (await runIsolatedArticleBatch(run, { env: { VERCEL_ENV: 'production' } })).status === 'feature_off' && ran === 0)
  const ok = await runIsolatedArticleBatch(
    async () => ({ enabled: true, collected: { jobsChecked: 1, ready: 2, failed: 0, stillRunning: 1 }, submitted: { ordered: 3, jobName: 'batches/x', skipped: 0 } }),
    { env: { VERCEL_ENV: 'production', ARTICLE_BATCH_ENABLED: 'true' } },
  )
  check('in Production with the flag on it runs and reports counts',
    ok.status === 'ran' && ok.status === 'ran' && ok.ordered === 3 && ok.ready === 2)
  const threw = await runIsolatedArticleBatch(async () => { throw new Error('boom') }, { env: { VERCEL_ENV: 'production', ARTICLE_BATCH_ENABLED: 'true' } })
  check('a pass that throws is swallowed, so the cron is untouched', threw.status === 'error')
}

// -- X) the generator -------------------------------------------------------

console.log('\nX) the generator')
{
  const { generateValidatedArticle } = await import('../../gemini-article')
  // No API key, so a live call cannot succeed: whatever comes back must have
  // come from the batched draft, which is the point of the check.
  const originalKey = process.env.GEMINI_API_KEY
  delete process.env.GEMINI_API_KEY
  const originalModel = process.env.GEMINI_ARTICLE_MODEL
  process.env.GEMINI_ARTICLE_MODEL = 'gemini-3.8-flash'
  try {
    const asked: string[] = []
    const res = await generateValidatedArticle(brief(), {
      takeBatchedDraft: async (fp) => { asked.push(fp); return { text: ARTICLE_JSON, usage: { model: 'gemini-3.8-flash', inputTokens: 1, outputTokens: 2 } } },
    })
    check('the batched draft is asked for by the first-attempt fingerprint',
      asked.length === 1 && asked[0] === articlePromptFingerprint(buildPrompt(brief(), {}), 'gemini-3.8-flash'))
    // The draft here is a deliberately tiny article, so the real audit rejects it
    // on length. That rejection is the proof: with NO API key set, nothing could
    // have been audited unless the batched text reached the pipeline. A provider
    // error would read 'missing_gemini_api_key' instead.
    check('the batched text reaches the real audit with no provider call at all (no API key is set)',
      'error' in res && res.reason === 'article_quality_gate_failed' && (res.audit?.counts.words ?? 0) > 0, JSON.stringify(res).slice(0, 160))

    const noKeyNoBatch = await generateValidatedArticle(brief())
    check('without the lane and without a key, generation fails as it always did',
      'error' in noKeyNoBatch && noKeyNoBatch.reason === 'missing_gemini_api_key')

    const unusable = await generateValidatedArticle(brief(), { takeBatchedDraft: async () => ({ text: 'not json at all', usage: null }) })
    check('an unusable batched draft falls through to the live call (which here has no key)',
      'error' in unusable && unusable.reason === 'missing_gemini_api_key')

    const threwInReader = await generateValidatedArticle(brief(), { takeBatchedDraft: async () => { throw new Error('db down') } })
    check('a reader that throws cannot fail a generation',
      'error' in threwInReader && threwInReader.reason === 'missing_gemini_api_key')
  } finally {
    if (originalKey === undefined) delete process.env.GEMINI_API_KEY
    else process.env.GEMINI_API_KEY = originalKey
    if (originalModel === undefined) delete process.env.GEMINI_ARTICLE_MODEL
    else process.env.GEMINI_ARTICLE_MODEL = originalModel
  }
}

// -- R) source guards -------------------------------------------------------

console.log('\nR) source guards')
const cron = code('app/api/content/automation/cron/route.ts')
const gen = code('lib/content/article-generation.ts')
const batch = code('lib/content/batch/article-batch.ts')
const takeSrc = code('lib/content/batch/take-draft.ts')
const migration = code('supabase/migrations/20261113180000_article_batch_drafts.sql')

function guard(name: string, cond: boolean, mutationName: string, mutated: boolean) {
  check(name, cond)
  check(`  MUTATION CONTROL — ${mutationName}`, !mutated)
}

guard(
  'the cron calls the lane through the isolated wrapper',
  /await runIsolatedArticleBatch\(\)/.test(cron) && /from '@\/lib\/content\/batch\/isolated'/.test(cron),
  'a cron that called runArticleBatchPass directly would fail this',
  /await runArticleBatchPass\(/.test(cron),
)
guard(
  'the generation path reads the lane behind the flag',
  /isArticleBatchEnabled\(\)\s*\?\s*\{\s*takeBatchedDraft/.test(gen),
  'a generation path that read the lane unconditionally would fail this',
  /deps\.generate\(\s*brief,\s*\{\s*takeBatchedDraft/.test(gen),
)
guard(
  'the batch request is built from the shared brief builder, so the prompt matches',
  /buildBriefForTopic\(admin, c\.topicId\)/.test(batch) && /buildPrompt\(built\.brief, \{\}\)/.test(batch),
  'a batch request built from a brief assembled inside the lane would fail this',
  /const brief: ArticleBrief = \{/.test(batch),
)
guard(
  'the batch request carries the live call\'s own generation config',
  /responseMimeType: 'application\/json', temperature: 0\.75/.test(batch),
  'a batch request with a different temperature or response type would fail this',
  /temperature: (?!0\.75)[0-9.]+/.test(batch),
)
guard(
  'a job whose bookkeeping failed is cancelled instead of paid for',
  /batches\.cancel\(\{ name: jobName \}\)/.test(batch),
  'a lane that left an unclaimable job running would fail this',
  !/insert_failed/.test(batch),
)
guard(
  'the reader consumes the row it was served and nothing else',
  /\.eq\('id', row\.id\)[\s\S]{0,80}\.eq\('status', 'ready'\)/.test(takeSrc),
  'a reader that updated by fingerprint instead of by the claimed row id would fail this',
  /\.update\(\{[\s\S]{0,400}\}\)\s*\.eq\('prompt_fingerprint'/.test(takeSrc),
)
guard(
  'the table is service-role only: RLS on and no policy',
  /alter table public\.article_batch_drafts\s+enable row level security/.test(migration) && !/create policy/i.test(migration),
  'a migration that granted a merchant-facing policy would fail this',
  /create policy/i.test(migration),
)
guard(
  'the drafts table has no foreign key that a deleted topic could break',
  !/references public\.article_topics/.test(migration),
  'a foreign key to article_topics would fail this',
  /references public\.article_topics/.test(migration),
)

}

main().then(() => {
  console.log(`\n${pass} passed, ${fail} failed`)
  if (fail > 0) process.exitCode = 1
})

export {}
