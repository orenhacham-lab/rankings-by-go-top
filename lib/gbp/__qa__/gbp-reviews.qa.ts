/**
 * REVIEWS ON THE BUSINESS PROFILE (lib/gbp/reviews.ts and the review handlers)
 * — what a reply may contain, the exact requests Google receives, what we do
 * NOT store, and the handlers end to end against FakeAdmin and a fake Google.
 *
 *   A) reading a review: Google's shape → ours; a name that is not Google's, an
 *      anonymous reviewer, an empty reply and an unknown rating;
 *   B) the list request (pageSize 50, the three orders and nothing else, the
 *      page walk, de-duplication) and the summary the screen shows;
 *   C) reply and delete-reply: the exact path, PUT with { comment }, and
 *      Google's errors becoming OUR codes (a gone review, a refused text);
 *   D) validation: a reply is required, the cap, control characters, code points;
 *   E) the handlers: owner-only, Shopify hidden, schema missing = unavailable,
 *      a connection that is not this user's, and — the security check — a review
 *      name belonging to ANOTHER location is refused;
 *   F) the draft: it answers the customer's own words, forbids inventing a fact,
 *      de-escalates a one-star review, and is cleaned before it is shown;
 *   G) nothing is stored: no review text, reviewer or rating reaches the
 *      database, and the only marks written are times;
 *   H) every route is behind GBP_POSTS_ENABLED; the client component imports no
 *      server module; four-language parity; no raw Tailwind colours.
 * Every guard has a MUTATION CONTROL: the same check on a broken copy must fail.
 *
 * Run: npx tsx lib/gbp/__qa__/gbp-reviews.qa.ts
 */
import { readFileSync, writeFileSync, unlinkSync, mkdirSync } from 'fs'
import { join, dirname } from 'path'
import crypto from 'crypto'
import { FakeAdmin } from '../../__qa__/_fake-admin'

process.env.GSC_TOKEN_ENCRYPTION_KEY = crypto.randomBytes(32).toString('hex')
process.env.GOOGLE_GSC_CLIENT_ID = 'client-id.apps.googleusercontent.com'
process.env.GOOGLE_GSC_CLIENT_SECRET = 'client-secret'
process.env.GOOGLE_GBP_REDIRECT_URI = 'https://www.gotopseo.com/api/gbp/callback'

/* eslint-disable @typescript-eslint/no-require-imports, @typescript-eslint/no-explicit-any */
const RV = require('../reviews') as typeof import('../reviews')
const VR = require('../review-validate') as typeof import('../review-validate')
const DR = require('../review-draft') as typeof import('../review-draft')
const E = require('../errors') as typeof import('../errors')
const H = require('../http') as typeof import('../http')
const S = require('../store') as typeof import('../store')
const { dashboardHe } = require('../../i18n/dashboard/he')
const { dashboardEn } = require('../../i18n/dashboard/en')
const { dashboardEs } = require('../../i18n/dashboard/es')

let pass = 0, fail = 0
function check(name: string, cond: boolean, detail?: string) {
  if (cond) { pass++; console.log(`  ✓ ${name}`) } else { fail++; console.log(`  ✗ ${name}${detail ? ` — ${detail}` : ''}`) }
}
const ROOT = join(__dirname, '..', '..', '..')
const read = (rel: string) => readFileSync(join(ROOT, rel), 'utf8')
const strip = (s: string) => s.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\{\/\*[\s\S]*?\*\/\}/g, '').replace(/(^|[^:'"`\\])\/\/.*$/gm, '$1')
const MUTANTS: string[] = []
process.on('exit', () => { for (const f of MUTANTS) { try { unlinkSync(f) } catch { /* gone */ } } })
function mutant<T>(rel: string, from: string | RegExp, to: string): T {
  const src = read(rel)
  const out = src.replace(from, to)
  if (out === src) throw new Error(`mutation did not apply to ${rel}`)
  /*
   * The copy goes in __qa__, not beside the file it copies: around sixty suites
   * run at once and several of them walk the source tree, so a temporary .ts in
   * lib/gbp/ gets listed by one of them and deleted by us before it is read.
   * Its own relative imports move up one directory to compensate.
   */
  const moved = out.replace(/(\sfrom\s*|\brequire\()'\.\//g, "$1'../")
  const dir = join(ROOT, dirname(rel), '__qa__')
  mkdirSync(dir, { recursive: true })
  const file = join(dir, `.mut-${crypto.randomUUID()}.ts`)
  writeFileSync(file, moved)
  MUTANTS.push(file)
  return require(file) as T
}

const OWNER = '11111111-1111-4111-8111-111111111111'
const OTHER = '22222222-2222-4222-8222-222222222222'
const PROJECT = '33333333-3333-4333-8333-333333333333'
const ACCOUNT = 'accounts/111'
const LOCATION = 'locations/222'
const PARENT = `${ACCOUNT}/${LOCATION}`
const RNAME = (id: string) => `${PARENT}/reviews/${id}`

const googleReview = (over: Record<string, unknown> = {}) => ({
  name: RNAME('rev-1'),
  reviewId: 'rev-1',
  reviewer: { displayName: 'דנה כהן', profilePhotoUrl: 'https://lh3.googleusercontent.com/photo.jpg', isAnonymous: false },
  starRating: 'FIVE',
  comment: 'שירות מעולה, חזרתי שוב',
  createTime: '2026-10-01T08:00:00Z',
  updateTime: '2026-10-01T08:00:00Z',
  ...over,
})

/** A fake Google that records every request it was given. */
function fakeFetch(answers: unknown[] | ((url: string, init?: RequestInit) => { status?: number; body: unknown })) {
  const calls: { url: string; method: string; body: unknown }[] = []
  let i = 0
  const impl = async (url: string, init?: RequestInit) => {
    calls.push({ url, method: init?.method ?? 'GET', body: init?.body ? JSON.parse(String(init.body)) : null })
    const answer = typeof answers === 'function' ? answers(url, init) : { body: answers[Math.min(i++, answers.length - 1)] }
    return new Response(JSON.stringify(answer.body ?? {}), { status: answer.status ?? 200, headers: { 'Content-Type': 'application/json' } })
  }
  return { impl: impl as any, calls }
}

// ── A) reading a review ────────────────────────────────────────────────────
function readChecks() {
  console.log('A) a review as Google sends it')
  const r = RV.readReview(googleReview())!
  check('a review is read into our own shape', r.reviewName === RNAME('rev-1') && r.reviewId === 'rev-1' && r.stars === 5 && r.comment === 'שירות מעולה, חזרתי שוב' && r.reviewerName === 'דנה כהן')
  check('the reviewer photo is never read', !Object.values(r as any).some((v) => typeof v === 'string' && v.includes('googleusercontent')))
  check('a review with no reply reads as no reply', r.reply === null)

  const anon = RV.readReview(googleReview({ reviewer: { isAnonymous: true, displayName: 'Someone' } }))!
  check('an anonymous reviewer carries no name', anon.isAnonymous && anon.reviewerName === null)

  const replied = RV.readReview(googleReview({ reviewReply: { comment: 'תודה רבה!', updateTime: '2026-10-02T09:00:00Z' } }))!
  check('a published reply is read with its time', replied.reply?.comment === 'תודה רבה!' && replied.reply?.updateTime === '2026-10-02T09:00:00Z')
  const emptyReply = RV.readReview(googleReview({ reviewReply: { comment: '   ' } }))!
  check('an empty reply reads as no reply', emptyReply.reply === null)

  check('an unknown rating is null, never 0', RV.readReview(googleReview({ starRating: 'STAR_RATING_UNSPECIFIED' }))!.stars === null)
  check('each rating maps to its number', [['ONE', 1], ['TWO', 2], ['THREE', 3], ['FOUR', 4], ['FIVE', 5]].every(([g, n]) => VR.starsFromRating(g) === n))

  check('a name that is not Google’s is refused', RV.readReview(googleReview({ name: 'reviews/rev-1' })) === null
    && RV.readReview(googleReview({ name: `${PARENT}/reviews/../../x` })) === null
    && RV.readReview({}) === null && RV.readReview(null) === null)
  check('isReviewName accepts only a full review path', RV.isReviewName(RNAME('abc')) && !RV.isReviewName(PARENT) && !RV.isReviewName('') && !RV.isReviewName(`${PARENT}/localPosts/x`))

  const broken = mutant<typeof import('../reviews')>('lib/gbp/reviews.ts',
    'const REVIEW_NAME = /^accounts\\/[0-9A-Za-z_-]{1,64}\\/locations\\/[0-9A-Za-z_-]{1,64}\\/reviews\\/[0-9A-Za-z_-]{1,128}$/',
    'const REVIEW_NAME = /reviews/')
  check('MUTATION: a loose name pattern accepts a path it must refuse', broken.readReview(googleReview({ name: `${PARENT}/reviews/../../x` })) !== null)
}

// ── B) the list request and the summary ────────────────────────────────────
async function listChecks() {
  console.log('B) listing reviews')
  {
    const f = fakeFetch([{ reviews: [googleReview()], averageRating: 4.5, totalReviewCount: 12 }])
    const page = await RV.listReviews('at', { accountName: ACCOUNT, locationName: LOCATION }, f.impl)
    const url = new URL(f.calls[0].url)
    check('the list goes to the v4 reviews path of this location', url.origin + url.pathname === `https://mybusiness.googleapis.com/v4/${PARENT}/reviews`)
    check('it asks for Google’s maximum page size', url.searchParams.get('pageSize') === '50' && RV.GBP_REVIEWS_PAGE_SIZE === 50)
    check('the default order is the most recently updated', url.searchParams.get('orderBy') === 'updateTime desc')
    check('the average and the total come from Google, not from the page', page.averageRating === 4.5 && page.totalReviewCount === 12)
  }
  {
    const f = fakeFetch([{ reviews: [] }])
    await RV.listReviews('at', { accountName: ACCOUNT, locationName: LOCATION, order: 'rating' as any }, f.impl)
    check('an allowed order is passed through', new URL(f.calls[0].url).searchParams.get('orderBy') === 'rating')
    const g = fakeFetch([{ reviews: [] }])
    await RV.listReviews('at', { accountName: ACCOUNT, locationName: LOCATION, order: 'comment desc' as any }, g.impl)
    check('an order Google does not offer falls back to the default', new URL(g.calls[0].url).searchParams.get('orderBy') === 'updateTime desc')
    check('only the three documented orders are offered', JSON.stringify(RV.GBP_REVIEW_ORDERS) === JSON.stringify(['updateTime desc', 'rating', 'rating desc']))
  }
  {
    // Two pages, with the same review in both: it must appear once.
    const f = fakeFetch([
      { reviews: [googleReview(), googleReview({ name: RNAME('rev-2'), reviewId: 'rev-2' })], nextPageToken: 'p2' },
      { reviews: [googleReview({ name: RNAME('rev-2'), reviewId: 'rev-2' }), googleReview({ name: RNAME('rev-3'), reviewId: 'rev-3' })] },
    ])
    const page = await RV.listReviews('at', { accountName: ACCOUNT, locationName: LOCATION, pages: 4 }, f.impl)
    check('a further page is fetched with its token', new URL(f.calls[1].url).searchParams.get('pageToken') === 'p2')
    check('a review returned twice appears once', page.reviews.length === 3 && new Set(page.reviews.map((r) => r.reviewName)).size === 3)
    check('no token left means no next page', page.nextPageToken === null)
  }
  {
    const f = fakeFetch([{ reviews: [googleReview()], nextPageToken: 'more' }])
    const page = await RV.listReviews('at', { accountName: ACCOUNT, locationName: LOCATION, pages: 99 }, f.impl)
    check('the page walk is capped, and the next token is handed back', f.calls.length <= 4 && page.nextPageToken === 'more')
  }
  {
    const page = {
      reviews: [
        RV.readReview(googleReview({ name: RNAME('a'), starRating: 'FIVE', reviewReply: { comment: 'תודה' } }))!,
        RV.readReview(googleReview({ name: RNAME('b'), starRating: 'FIVE' }))!,
        RV.readReview(googleReview({ name: RNAME('c'), starRating: 'TWO' }))!,
        RV.readReview(googleReview({ name: RNAME('d'), starRating: 'THREE' }))!,
      ],
      averageRating: 3.8, totalReviewCount: 40, nextPageToken: null,
    }
    const s = RV.summarizeReviews(page)
    check('the summary counts the reviews with no reply', s.unanswered === 3 && s.total === 40 && s.average === 3.8)
    check('three stars or fewer with no reply counts as one to answer first', s.unansweredNegative === 2)
  }
}

// ── C) replying ────────────────────────────────────────────────────────────
async function replyChecks() {
  console.log('C) replying and deleting a reply')
  {
    const f = fakeFetch([{ comment: 'תודה דנה!', updateTime: '2026-10-12T10:00:00Z' }])
    const saved = await RV.replyToReview('at', RNAME('rev-1'), 'תודה דנה!', f.impl)
    check('a reply is a PUT to the review’s reply path', f.calls[0].method === 'PUT' && f.calls[0].url === `https://mybusiness.googleapis.com/v4/${RNAME('rev-1')}/reply`)
    check('the body carries only the comment', JSON.stringify(f.calls[0].body) === JSON.stringify({ comment: 'תודה דנה!' }))
    check('what Google saved comes back', saved.comment === 'תודה דנה!' && saved.updateTime === '2026-10-12T10:00:00Z')
  }
  {
    const f = fakeFetch([{}])
    await RV.deleteReviewReply('at', RNAME('rev-1'), f.impl)
    check('deleting a reply is a DELETE to the same path', f.calls[0].method === 'DELETE' && f.calls[0].url.endsWith(`${RNAME('rev-1')}/reply`))
  }
  {
    const f = fakeFetch([googleReview({ comment: 'שירות איטי' })])
    const one = await RV.getReview('at', RNAME('rev-1'), f.impl)
    check('one review is fetched by its own name', f.calls[0].method === 'GET' && f.calls[0].url === `https://mybusiness.googleapis.com/v4/${RNAME('rev-1')}` && one.comment === 'שירות איטי')
    let bad = ''
    try { await RV.getReview('at', 'reviews/x', fakeFetch([{}]).impl) } catch (e: any) { bad = e.code }
    check('a review name that is not Google\u2019s is not fetched', bad === 'review_not_found')
    let empty = ''
    try { await RV.getReview('at', RNAME('rev-1'), fakeFetch([{ name: 'nonsense' }]).impl) } catch (e: any) { empty = e.code }
    check('an answer that is not a review becomes review_not_found', empty === 'review_not_found')
  }
  {
    let threw = ''
    try { await RV.replyToReview('at', 'reviews/x', 'hi', fakeFetch([{}]).impl) } catch (e: any) { threw = e.code }
    check('a review name that is not Google’s never reaches the network', threw === 'review_not_found')
  }
  {
    const gone = fakeFetch(() => ({ status: 404, body: { error: { status: 'NOT_FOUND', message: 'Review not found for the location' } } }))
    let code = ''
    try { await RV.replyToReview('at', RNAME('rev-1'), 'hi', gone.impl) } catch (e: any) { code = e.code }
    check('a review Google no longer has becomes review_not_found, not location_not_found', code === 'review_not_found')

    const refused = fakeFetch(() => ({ status: 400, body: { error: { status: 'INVALID_ARGUMENT', message: 'Reply contains a prohibited phrase' } } }))
    let code2 = ''
    let text = ''
    try { await RV.replyToReview('at', RNAME('rev-1'), 'hi', refused.impl) } catch (e: any) { code2 = e.code; text = String(e.message) }
    check('a refused reply becomes reply_rejected, never Google’s own words', code2 === 'reply_rejected' && !text.includes('prohibited'))
    check('both codes are known codes with a sentence in every language', E.isGbpErrorCode('review_not_found') && E.isGbpErrorCode('reply_rejected')
      && [dashboardHe, dashboardEn, dashboardEs].every((d: any) => typeof d.mapsPosts.errors.review_not_found === 'string' && typeof d.mapsPosts.errors.reply_rejected === 'string'))

    const broken = mutant<typeof import('../reviews')>('lib/gbp/reviews.ts',
      "if (e.code === 'location_not_found') throw new GbpApiError('review_not_found')",
      "if (false) throw new GbpApiError('review_not_found')")
    let m = ''
    try { await broken.replyToReview('at', RNAME('rev-1'), 'hi', fakeFetch(() => ({ status: 404, body: { error: { status: 'NOT_FOUND' } } })).impl) } catch (e: any) { m = e.code }
    check('MUTATION: without the remap a gone review reads as a gone location', m === 'location_not_found')
  }
}

// ── D) what a reply may contain ────────────────────────────────────────────
function validationChecks() {
  console.log('D) what a reply may contain')
  check('an empty reply is refused', !VR.validateReplyInput({ comment: '' }).ok && !VR.validateReplyInput({ comment: '   \n  ' }).ok && !VR.validateReplyInput({ comment: null }).ok)
  const empty = VR.validateReplyInput({ comment: '' })
  check('the refusal says which field', !empty.ok && empty.errors.includes('reply_empty'))
  const long = VR.validateReplyInput({ comment: 'א'.repeat(VR.GBP_REPLY_MAX + 1) })
  check('a reply over the cap is refused', !long.ok && long.errors.includes('reply_too_long'))
  check('a reply exactly at the cap is accepted', VR.validateReplyInput({ comment: 'א'.repeat(VR.GBP_REPLY_MAX) }).ok)
  const ok = VR.validateReplyInput({ comment: '  תודה רבה דנה  ' })
  check('the reply is trimmed before it is sent', ok.ok && ok.value.comment === 'תודה רבה דנה')
  const ctl = VR.validateReplyInput({ comment: 'תודה\u0000\u0007 רבה' })
  check('control characters are stripped, never sent to Google', ctl.ok && ctl.value.comment === 'תודה רבה')
  const nl = VR.validateReplyInput({ comment: 'שורה\nשורה\tשנייה' })
  check('a newline and a tab survive', nl.ok && nl.value.comment.includes('\n') && nl.value.comment.includes('\t'))
  check('characters are counted as a person counts them', VR.countReplyChars('👍🏽 תודה') === Array.from('👍🏽 תודה').length && VR.countReplyChars('  a  ') === 1)
  check('clamping never cuts half an emoji', Array.from(VR.clampReply('👍👍👍', 2)).length === 2)
  check('a reply may hold a phone number and a link, unlike a post', VR.validateReplyInput({ comment: 'נשמח שתחזרו, 03-1234567, פרטים ב-https://dana.co.il' }).ok)

  const broken = mutant<typeof import('../review-validate')>('lib/gbp/review-validate.ts',
    "if (chars === 0) errors.push('reply_empty')", "if (false) errors.push('reply_empty')")
  check('MUTATION: without the empty check a blank reply would be sent', broken.validateReplyInput({ comment: '   ' }).ok)
}

// ── E) the handlers ────────────────────────────────────────────────────────
function world(opts: { missing?: boolean } = {}) {
  const hooks = opts.missing ? Object.fromEntries(S.GBP_TABLES.map((t) => [t, { select: () => ({ code: '42P01', message: 'relation does not exist' }) }])) : {}
  const admin: any = new FakeAdmin({
    projects: [{ id: PROJECT, user_id: OWNER, target_domain: 'dana-bakery.co.il', business_name: 'המאפייה של דנה', name: 'דנה' }],
    generated_articles: [],
    gbp_connections: [], gbp_oauth_states: [], project_gbp_locations: [], gbp_posts: [],
  }, hooks as any)
  return admin
}
function deps(admin: any, over: Partial<import('../http').GbpRouteDeps> = {}, as = OWNER): import('../http').GbpRouteDeps {
  return {
    auth: async (pid) => (!pid ? { error: 'x', status: 400 } : pid !== PROJECT ? { error: 'x', status: 404 } : as !== OWNER ? { error: 'x', status: 403 } : { user: { id: as }, admin, project: { id: PROJECT, user_id: OWNER } }) as any,
    isShopifyProject: async () => false,
    publish: { refresh: async () => ({ accessToken: 'at' }), create: async () => { throw new Error('not used') } } as any,
    ...over,
  }
}
const body = (b: unknown, method = 'POST') => new Request('https://app.test/api/gbp/reviews', { method, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(b) })
const get = (q: string) => new Request(`https://app.test/api/gbp/reviews?${q}`)
async function connectOwner(admin: any) {
  await S.storeGbpConnection(admin, OWNER, { refreshToken: '1//refresh-plain', scope: 'https://www.googleapis.com/auth/business.manage' })
  for (const c of admin.tables.gbp_connections) c.id ??= crypto.randomUUID()
  const conn = admin.tables.gbp_connections[0]
  await S.saveProjectLocation(admin, { project_id: PROJECT, user_id: OWNER, connection_id: conn.id, account_name: ACCOUNT, location_name: LOCATION, location_title: 'המאפייה של דנה' })
  return conn
}
const onePage = async () => ({ reviews: [RV.readReview(googleReview())!], averageRating: 5, totalReviewCount: 1, nextPageToken: null })

async function handlerChecks() {
  console.log('E) the handlers')
  {
    const admin = world()
    await connectOwner(admin)
    const other = await H.handleListReviews(get(`projectId=${PROJECT}`), deps(admin, { listReviews: onePage }, OTHER))
    check('another user gets 403 and no review text', other.status === 403 && !(await other.text()).includes('חזרתי'))
    const shop = await H.handleListReviews(get(`projectId=${PROJECT}`), deps(admin, { listReviews: onePage, isShopifyProject: async () => true }))
    check('a Shopify project cannot read reviews', shop.status === 409)
    const missing = world({ missing: true })
    const m = await H.handleListReviews(get(`projectId=${PROJECT}`), deps(missing, { listReviews: onePage }))
    check('tables not applied → not_available, not an error', m.status === 409 && (await m.json()).error === 'not_available')
  }
  {
    const admin = world()
    const none = await H.handleListReviews(get(`projectId=${PROJECT}`), deps(admin, { listReviews: onePage }))
    check('with no Google connection the answer is not_connected', none.status === 409 && (await none.json()).error === 'not_connected')
    await S.storeGbpConnection(admin, OWNER, { refreshToken: '1//r', scope: 'https://www.googleapis.com/auth/business.manage' })
    for (const c of admin.tables.gbp_connections) c.id ??= crypto.randomUUID()
    const noLoc = await H.handleListReviews(get(`projectId=${PROJECT}`), deps(admin, { listReviews: onePage }))
    check('with no business chosen the answer is no_location', noLoc.status === 409 && (await noLoc.json()).error === 'no_location')
  }
  {
    // A location row left behind under SOMEONE ELSE'S connection is never used.
    const admin = world()
    await connectOwner(admin)
    admin.tables.project_gbp_locations[0].connection_id = crypto.randomUUID()
    const r = await H.handleListReviews(get(`projectId=${PROJECT}`), deps(admin, { listReviews: onePage }))
    check('a location saved under another connection is ignored', r.status === 409 && (await r.json()).error === 'no_location')
  }
  {
    const admin = world()
    await connectOwner(admin)
    const r = await H.handleListReviews(get(`projectId=${PROJECT}&order=rating`), deps(admin, {
      listReviews: async (_t, args) => { check('the handler passes the chosen order to Google', args.order === 'rating'); return onePage() },
    }))
    const b = await r.json()
    check('the screen gets the reviews, the summary and the reply cap', b.ok && b.reviews.length === 1 && b.summary.unanswered === 1 && b.replyMax === VR.GBP_REPLY_MAX)
    check('no internal field reaches the browser', !JSON.stringify(b).includes('user_id') && !JSON.stringify(b).includes('connection_id') && !JSON.stringify(b).includes('googleusercontent'))
  }
  {
    // THE SECURITY CHECK: a review name of another location must be refused.
    const admin = world()
    await connectOwner(admin)
    let sent = ''
    const d = deps(admin, {
      listReviews: onePage,
      replyToReview: async (_t, name, comment) => { sent = `${name}|${comment}`; return { comment, updateTime: null } },
    })
    const foreign = await H.handleReplyToReview(body({ projectId: PROJECT, reviewName: 'accounts/999/locations/888/reviews/x', comment: 'hi' }, 'PUT'), d)
    check('a reply addressed to another business is refused and never sent', foreign.status === 404 && (await foreign.json()).error === 'review_not_found' && sent === '')
    const foreignDelete = await H.handleDeleteReviewReply(get(`projectId=${PROJECT}&reviewName=${encodeURIComponent('accounts/999/locations/888/reviews/x')}`), d)
    check('deleting a reply on another business is refused too', foreignDelete.status === 404)
    check('belongsToLocation is what refuses it', H.belongsToLocation(RNAME('x'), { account_name: ACCOUNT, location_name: LOCATION })
      && !H.belongsToLocation('accounts/999/locations/888/reviews/x', { account_name: ACCOUNT, location_name: LOCATION })
      && !H.belongsToLocation(`${PARENT}X/reviews/y`, { account_name: ACCOUNT, location_name: LOCATION }))

    const good = await H.handleReplyToReview(body({ projectId: PROJECT, reviewName: RNAME('rev-1'), comment: '  תודה דנה  ' }, 'PUT'), d)
    check('a reply on this business is sent, trimmed', good.status === 200 && sent === `${RNAME('rev-1')}|תודה דנה`)

    const blank = await H.handleReplyToReview(body({ projectId: PROJECT, reviewName: RNAME('rev-1'), comment: '   ' }, 'PUT'), d)
    const blankBody = await blank.json()
    check('the server refuses what the screen would, with the field code', blank.status === 400 && blankBody.errors.includes('reply_empty'))
    const noName = await H.handleReplyToReview(body({ projectId: PROJECT, comment: 'hi' }, 'PUT'), d)
    check('a request without a review name is refused', noName.status === 400)

    const broken = mutant<typeof import('../http')>('lib/gbp/http.ts',
      'return reviewName.startsWith(`${parent}/reviews/`)', 'return true')
    check('MUTATION: without the location check a reply to another business passes',
      broken.belongsToLocation('accounts/999/locations/888/reviews/x', { account_name: ACCOUNT, location_name: LOCATION } as any))
  }
  {
    // The "new" mark: a time, and only a time.
    const admin = world()
    await connectOwner(admin)
    admin.tables.project_gbp_locations[0].reviews_seen_update_time = '2026-10-01T00:00:00Z'
    const r = await H.handleListReviews(get(`projectId=${PROJECT}`), deps(admin, {
      listReviews: async () => ({
        reviews: [
          RV.readReview(googleReview({ name: RNAME('old'), updateTime: '2026-09-01T00:00:00Z' }))!,
          RV.readReview(googleReview({ name: RNAME('new'), updateTime: '2026-10-05T00:00:00Z' }))!,
        ],
        averageRating: null, totalReviewCount: null, nextPageToken: null,
      }),
    }))
    const b = await r.json()
    check('only a review newer than the mark is flagged new', b.reviews.find((x: any) => x.reviewName === RNAME('new')).isNew === true
      && b.reviews.find((x: any) => x.reviewName === RNAME('old')).isNew === false)
    check('with no mark at all nothing is flagged new (a first open is not an alert)',
      !H.isNewSince(RV.readReview(googleReview())!, null))
    check('the newest time of a page is found', H.newestReviewTime([
      RV.readReview(googleReview({ updateTime: '2026-09-01T00:00:00Z' }))!,
      RV.readReview(googleReview({ name: RNAME('b'), updateTime: '2026-10-05T00:00:00Z' }))!,
    ]) === new Date('2026-10-05T00:00:00Z').toISOString())

    const seen = await H.handleMarkReviewsSeen(body({ projectId: PROJECT, newestUpdateTime: '2026-10-05T00:00:00Z' }), deps(admin))
    check('marking the list as read stores the time', seen.status === 200
      && admin.tables.project_gbp_locations[0].reviews_seen_update_time === new Date('2026-10-05T00:00:00Z').toISOString())
    const junk = await H.handleMarkReviewsSeen(body({ projectId: PROJECT, newestUpdateTime: 'not a date' }), deps(admin))
    check('a mark that is not a time is refused', junk.status === 400)
  }
  {
    // Switching business clears the marks of the old one.
    const admin = world()
    const conn = await connectOwner(admin)
    await S.markReviewsSeen(admin, PROJECT, { seenUpdateTime: '2026-10-05T00:00:00Z', alertedAt: '2026-10-05T00:00:00Z' })
    await S.saveProjectLocation(admin, { project_id: PROJECT, user_id: OWNER, connection_id: conn.id, account_name: ACCOUNT, location_name: LOCATION, location_title: 'המאפייה של דנה' })
    check('staying on the same business keeps the marks', admin.tables.project_gbp_locations[0].reviews_seen_update_time === '2026-10-05T00:00:00Z')
    await S.saveProjectLocation(admin, { project_id: PROJECT, user_id: OWNER, connection_id: conn.id, account_name: ACCOUNT, location_name: 'locations/999', location_title: 'סניף אחר' })
    check('switching business clears the marks of the old one', admin.tables.project_gbp_locations[0].reviews_seen_update_time === null)
  }
}

// ── F) the draft ───────────────────────────────────────────────────────────
async function draftChecks() {
  console.log('F) the AI first draft of a reply')
  const one = DR.buildReplyPrompt({ businessName: 'המאפייה של דנה', language: 'he', review: { stars: 1, comment: 'חיכיתי שלושים דקות' } })
  check('the reviewer\u2019s name is never in the prompt, and the model is told not to guess one',
    !one.includes('דנה כהן') && /never invent, guess or take a name out of the review text/i.test(one))
  check('the prompt carries the customer’s own words', one.includes('חיכיתי שלושים דקות'))
  check('the reply is asked for in the language the review is written in', /SAME LANGUAGE/i.test(one))
  check('inventing a fact is forbidden', /Never invent a fact/i.test(one) && /no discount/i.test(one) && /no refund/i.test(one))
  check('a one-star review is de-escalated, not argued with', /without arguing/i.test(one) && /in private/i.test(one))
  check('asking the customer to change the review is forbidden', /not ask the customer to change or remove/i.test(one))
  check('the business name is given', one.includes('המאפייה של דנה'))

  const five = DR.buildReplyPrompt({ businessName: null, language: 'en', review: { stars: 5, comment: 'Great service' } })
  check('a happy review is thanked', /happy customer/i.test(five))
  check('the draft source has no field for the reviewer at all',
    !/reviewerName/.test(read('lib/gbp/review-draft.ts')))
  const noText = DR.buildReplyPrompt({ businessName: null, language: 'he', review: { stars: 4, comment: null } })
  check('a review with no text falls back to the project language', /Reply in Hebrew/.test(noText) && /no text/.test(noText))

  check('the draft is cleaned of markdown and parsed from JSON',
    DR.cleanReplyDraft('{"comment":"## תודה **רבה** `דנה`"}') === 'תודה רבה דנה')
  check('a plain-text answer is still read', DR.cleanReplyDraft('תודה רבה') === 'תודה רבה')
  check('a draft over the cap is cut', VR.countReplyChars(DR.cleanReplyDraft(JSON.stringify({ comment: 'א'.repeat(VR.GBP_REPLY_MAX + 500) }))) <= VR.GBP_REPLY_MAX)
  check('an empty answer is a failure, never an empty reply',
    (await DR.draftReviewReply({ businessName: null, language: 'he', review: { stars: 5, comment: 'x' } }, async () => '')).ok === false)
  check('a generator that throws is a failure, not a crash',
    (await DR.draftReviewReply({ businessName: null, language: 'he', review: { stars: 5, comment: 'x' } }, async () => { throw new Error('no model') })).ok === false)

  // The handler must read the review from Google, not from the request.
  const admin = world()
  await connectOwner(admin)
  let prompt = ''
  let asked = ''
  const d = deps(admin, {
    getReview: async (_t, name) => {
      asked = name
      if (name !== RNAME('rev-1')) throw new (require('../errors').GbpApiError)('review_not_found')
      return RV.readReview(googleReview({ comment: 'שירות איטי' }))!
    },
    generate: async (p: string) => { prompt = p; return JSON.stringify({ comment: 'תודה על המשוב' }) },
  })
  const r = await H.handleDraftReviewReply(body({ projectId: PROJECT, reviewName: RNAME('rev-1'), comment: 'טקסט שהמשתמש שתל' }), d)
  check('the draft answers the review Google reports, never text from the request',
    r.status === 200 && prompt.includes('שירות איטי') && !prompt.includes('שתל'))
  check('the handler sends the review text and rating but NOT the reviewer\u2019s name',
    !prompt.includes('דנה כהן'))
  check('the review is fetched by name, not searched for in the list', asked === RNAME('rev-1'))
  const gone = await H.handleDraftReviewReply(body({ projectId: PROJECT, reviewName: RNAME('does-not-exist') }), d)
  check('a draft for a review the profile does not have is refused', gone.status === 404 && (await gone.json()).error === 'review_not_found')
  const foreign = await H.handleDraftReviewReply(body({ projectId: PROJECT, reviewName: 'accounts/999/locations/888/reviews/x' }), d)
  check('a draft for a review of another business is refused before any call', foreign.status === 404 && asked === RNAME('does-not-exist'))
  const unavailable = await H.handleDraftReviewReply(body({ projectId: PROJECT, reviewName: RNAME('rev-1') }), deps(admin, {
    getReview: d.getReview, generate: async () => '',
  }))
  check('a model that answers nothing reports draft_unavailable', unavailable.status === 502 && (await unavailable.json()).error === 'draft_unavailable')
}

// ── G) nothing is stored ───────────────────────────────────────────────────
async function storageChecks() {
  console.log('G) no review is stored')
  const admin = world()
  await connectOwner(admin)
  const d = deps(admin, {
    listReviews: onePage,
    replyToReview: async (_t, _n, comment) => ({ comment, updateTime: null }),
  })
  await H.handleListReviews(get(`projectId=${PROJECT}`), d)
  await H.handleReplyToReview(body({ projectId: PROJECT, reviewName: RNAME('rev-1'), comment: 'תודה דנה' }, 'PUT'), d)
  await H.handleMarkReviewsSeen(body({ projectId: PROJECT, newestUpdateTime: '2026-10-05T00:00:00Z' }), d)
  const dump = JSON.stringify(admin.tables)
  check('the review text was never written to the database', !dump.includes('חזרתי שוב'))
  check('the reviewer’s name was never written', !dump.includes('דנה כהן'))
  check('our own reply was never written', !dump.includes('תודה דנה'))
  check('no rating was written', !/"stars"|"star_rating"/.test(dump))
  const reviewColumns = Object.keys(admin.tables.project_gbp_locations[0]).filter((k) => k.includes('review'))
  check('the only review columns written are the two timestamps',
    reviewColumns.length > 0 && reviewColumns.every((k) => k === 'reviews_seen_update_time' || k === 'reviews_alerted_at'),
    reviewColumns.join(','))
  const migration = read('supabase/migrations/20261012120000_gbp_review_alerts.sql')
  check('the migration adds only those two columns, additively',
    /ADD COLUMN IF NOT EXISTS reviews_seen_update_time timestamptz/.test(migration)
    && /ADD COLUMN IF NOT EXISTS reviews_alerted_at\s+timestamptz/.test(migration)
    && !/DROP|DELETE|TRUNCATE|ALTER COLUMN/.test(migration.replace(/--.*$/gm, '')))
  check('no table is created for reviews', !/CREATE TABLE/i.test(migration))
  check('reviews.ts says in writing that nothing is stored', /nothing here is stored/i.test(read('lib/gbp/reviews.ts')))
}

// ── H) the screen and the routes ───────────────────────────────────────────
function surfaceChecks() {
  console.log('H) the screen and the routes')
  const routes = ['app/api/gbp/reviews/route.ts', 'app/api/gbp/reviews/draft/route.ts', 'app/api/gbp/reviews/reply/route.ts', 'app/api/gbp/reviews/seen/route.ts']
  check('every review route is behind the server flag', routes.every((r) => {
    const src = strip(read(r))
    return /isGbpPostsEnabled\(\)/.test(src) && /status: 404/.test(src)
  }))
  check('the flag is the server one, never the public mirror', routes.every((r) => !read(r).includes('NEXT_PUBLIC_GBP')))

  const panel = read('components/maps-posts/ReviewsPanel.tsx')
  check('the screen imports only the pure validation from lib/gbp', !/@\/lib\/gbp\/(reviews|review-draft|store|publish|api|oauth|http|config)/.test(panel))
  check('the screen uses no confirm() or alert()', !/\b(window\.)?(confirm|alert)\s*\(/.test(strip(panel).replace(/await confirm\(/g, '')))
  check('no raw Tailwind colour in the screen', !/\b(bg|text|border|ring|from|to|via|fill|stroke|divide|placeholder)-(slate|gray|zinc|neutral|stone|red|orange|amber|yellow|lime|green|emerald|teal|cyan|sky|blue|indigo|violet|purple|fuchsia|pink|rose)-\d{2,3}\b/.test(panel))
  check('MUTATION: a raw colour is caught', /\b(bg|text)-(slate|blue)-\d{2,3}\b/.test(`${panel} text-blue-600`))
  check('the panel is on the screen', /ReviewsPanel/.test(read('components/maps-posts/MapsPostsView.tsx')))

  const keys = (o: any, p = ''): string[] => Object.entries(o).flatMap(([k, v]) =>
    v && typeof v === 'object' && !Array.isArray(v) ? keys(v, `${p}${k}.`) : [`${p}${k}`])
  const he = keys(dashboardHe.mapsPosts.reviews).sort()
  for (const [name, d] of [['English', dashboardEn], ['Spanish', dashboardEs]] as const) {
    check(`the reviews screen has the same keys in Hebrew and ${name}`, JSON.stringify(he) === JSON.stringify(keys((d as any).mapsPosts.reviews).sort()),
      he.filter((k) => !keys((d as any).mapsPosts.reviews).includes(k)).join(', '))
  }
  const ptSrc = read('lib/i18n/dashboard/pt-BR/ai-visibility.ts')
  check('Portuguese carries the reviews screen too', /reviews: \{/.test(ptSrc) && /avaliações/i.test(ptSrc))
  check('every order has a label in every language', (['updateTime desc', 'rating', 'rating desc'] as const).every((o) =>
    [dashboardHe, dashboardEn, dashboardEs].every((d: any) => typeof d.mapsPosts.reviews.orders[o] === 'string')))
  check('both reply field codes have a sentence in every language', ['reply_empty', 'reply_too_long'].every((c) =>
    [dashboardHe, dashboardEn, dashboardEs].every((d: any) => typeof d.mapsPosts.fields[c] === 'string')))
  check('the Hebrew copy is Hebrew', !he.some((k) => {
    const v = k.split('.').reduce((o: any, x) => o?.[x], dashboardHe.mapsPosts.reviews)
    return typeof v === 'string' && /^[A-Za-z][A-Za-z ,.'-]{12,}$/.test(v)
  }))
  check('no copy claims a partnership with Google', ![dashboardHe, dashboardEn, dashboardEs].some((d: any) =>
    /שותפ|partner|sponsor|endorse|patrocin|avalad/i.test(JSON.stringify(d.mapsPosts.reviews))))
}

async function main() {
  readChecks()
  await listChecks()
  await replyChecks()
  validationChecks()
  await handlerChecks()
  await draftChecks()
  await storageChecks()
  surfaceChecks()
  console.log(`\n${pass} passed, ${fail} failed`)
  if (fail > 0) process.exit(1)
}
void main()

export {}
