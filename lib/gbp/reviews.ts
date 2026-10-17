/**
 * Reviews on the merchant's Business Profile: reading them, replying, and
 * removing a reply. Server-only.
 *
 *   GET    v4/accounts/{a}/locations/{l}/reviews?pageSize=50&orderBy=updateTime desc
 *   GET    v4/accounts/{a}/locations/{l}/reviews/{r}
 *   PUT    v4/accounts/{a}/locations/{l}/reviews/{r}/reply   { comment }
 *   DELETE v4/accounts/{a}/locations/{l}/reviews/{r}/reply
 *
 * Reviews live only on the v4 API, like localPosts. Every non-2xx answer
 * becomes a GbpApiError code (lib/gbp/errors.ts).
 *
 * WHAT WE KEEP. A review is a third party's words about the business, so
 * nothing here is stored: the screen reads reviews live on every open, and the
 * database keeps only review ids and times (lib/gbp/store.ts) so a daily email
 * can say "a new review arrived" without holding the review itself.
 * The reviewer's profile photo is not read at all.
 */
import { GbpApiError } from './errors'
import { gbpCall } from './api'
import { v4LocationParent, GBP_V4_BASE } from './request'
import { starsFromRating } from './review-validate'
import type { FetchLike } from './oauth'

/** Google's own maximum for this endpoint. */
export const GBP_REVIEWS_PAGE_SIZE = 50
/** How many pages one request may walk, so a profile with thousands of reviews cannot hang a screen. */
const MAX_PAGES = 4

export const GBP_REVIEW_ORDERS = ['updateTime desc', 'rating', 'rating desc'] as const
export type GbpReviewOrder = typeof GBP_REVIEW_ORDERS[number]

export interface GbpReview {
  /** "accounts/a/locations/l/reviews/r" — what a reply is addressed to. */
  reviewName: string
  reviewId: string
  /** The display name, or null when the reviewer is anonymous or gave none. */
  reviewerName: string | null
  isAnonymous: boolean
  /** 1 to 5, or null when Google reports no rating. */
  stars: number | null
  comment: string | null
  createTime: string | null
  updateTime: string | null
  reply: { comment: string; updateTime: string | null } | null
}

export interface GbpReviewPage {
  reviews: GbpReview[]
  averageRating: number | null
  totalReviewCount: number | null
  nextPageToken: string | null
}

const REVIEW_NAME = /^accounts\/[0-9A-Za-z_-]{1,64}\/locations\/[0-9A-Za-z_-]{1,64}\/reviews\/[0-9A-Za-z_-]{1,128}$/

export function isReviewName(v: unknown): v is string {
  return typeof v === 'string' && REVIEW_NAME.test(v)
}

const str = (v: unknown): string | null => (typeof v === 'string' && v.trim() ? v : null)

export function readReview(raw: unknown): GbpReview | null {
  const r = (raw && typeof raw === 'object' ? raw : {}) as Record<string, unknown>
  const reviewName = typeof r.name === 'string' ? r.name : ''
  if (!REVIEW_NAME.test(reviewName)) return null
  const reviewer = (r.reviewer && typeof r.reviewer === 'object' ? r.reviewer : {}) as Record<string, unknown>
  const isAnonymous = reviewer.isAnonymous === true
  const replyRaw = (r.reviewReply && typeof r.reviewReply === 'object' ? r.reviewReply : null) as Record<string, unknown> | null
  const replyComment = replyRaw ? str(replyRaw.comment) : null
  return {
    reviewName,
    reviewId: reviewName.slice(reviewName.lastIndexOf('/') + 1),
    reviewerName: isAnonymous ? null : str(reviewer.displayName),
    isAnonymous,
    stars: starsFromRating(r.starRating),
    comment: str(r.comment),
    createTime: str(r.createTime),
    updateTime: str(r.updateTime),
    reply: replyComment ? { comment: replyComment, updateTime: replyRaw ? str(replyRaw.updateTime) : null } : null,
  }
}

/**
 * One page of reviews, newest change first by default. `pages` walks further
 * pages for the same answer (at most MAX_PAGES); the token of the page after
 * the last one walked comes back as nextPageToken.
 */
export async function listReviews(
  accessToken: string,
  args: { accountName: string; locationName: string; order?: GbpReviewOrder; pageToken?: string | null; pages?: number },
  fetchImpl: FetchLike = fetch,
): Promise<GbpReviewPage> {
  const parent = v4LocationParent(args.accountName, args.locationName)
  const order: GbpReviewOrder = args.order && (GBP_REVIEW_ORDERS as readonly string[]).includes(args.order) ? args.order : 'updateTime desc'
  const pages = Math.min(Math.max(args.pages ?? 1, 1), MAX_PAGES)

  const reviews: GbpReview[] = []
  const seen = new Set<string>()
  let averageRating: number | null = null
  let totalReviewCount: number | null = null
  let pageToken = typeof args.pageToken === 'string' && args.pageToken ? args.pageToken : ''

  for (let i = 0; i < pages; i++) {
    const url = `${GBP_V4_BASE}/${parent}/reviews?pageSize=${GBP_REVIEWS_PAGE_SIZE}&orderBy=${encodeURIComponent(order)}${pageToken ? `&pageToken=${encodeURIComponent(pageToken)}` : ''}`
    const json = await gbpCall(fetchImpl, accessToken, url) as {
      reviews?: unknown[]; averageRating?: unknown; totalReviewCount?: unknown; nextPageToken?: unknown
    }
    if (typeof json?.averageRating === 'number' && Number.isFinite(json.averageRating)) averageRating = json.averageRating
    if (typeof json?.totalReviewCount === 'number' && Number.isFinite(json.totalReviewCount)) totalReviewCount = json.totalReviewCount
    for (const raw of Array.isArray(json?.reviews) ? json.reviews : []) {
      const review = readReview(raw)
      if (!review || seen.has(review.reviewName)) continue
      seen.add(review.reviewName)
      reviews.push(review)
    }
    pageToken = typeof json?.nextPageToken === 'string' ? json.nextPageToken : ''
    if (!pageToken) break
  }

  return { reviews, averageRating, totalReviewCount, nextPageToken: pageToken || null }
}

/**
 * One review by name. Used to draft a reply to exactly the review the owner
 * pressed, without walking the list to find it again (the list is ordered, so a
 * review the owner can see is not necessarily on the first page we would read).
 */
export async function getReview(accessToken: string, reviewName: string, fetchImpl: FetchLike = fetch): Promise<GbpReview> {
  if (!isReviewName(reviewName)) throw new GbpApiError('review_not_found')
  const json = await asReplyError(gbpCall(fetchImpl, accessToken, `${GBP_V4_BASE}/${reviewName}`))
  const review = readReview(json)
  if (!review) throw new GbpApiError('review_not_found')
  return review
}

/**
 * Write the business's reply. PUT replaces whatever reply was there, which is
 * also how an edited reply is sent.
 */
export async function replyToReview(accessToken: string, reviewName: string, comment: string, fetchImpl: FetchLike = fetch): Promise<{ comment: string; updateTime: string | null }> {
  if (!isReviewName(reviewName)) throw new GbpApiError('review_not_found')
  const json = await asReplyError(gbpCall(fetchImpl, accessToken, `${GBP_V4_BASE}/${reviewName}/reply`, {
    method: 'PUT',
    body: JSON.stringify({ comment }),
  })) as Record<string, unknown>
  const saved = str(json?.comment)
  if (!saved) throw new GbpApiError('unexpected')
  return { comment: saved, updateTime: str(json?.updateTime) }
}

export async function deleteReviewReply(accessToken: string, reviewName: string, fetchImpl: FetchLike = fetch): Promise<void> {
  if (!isReviewName(reviewName)) throw new GbpApiError('review_not_found')
  await asReplyError(gbpCall(fetchImpl, accessToken, `${GBP_V4_BASE}/${reviewName}/reply`, { method: 'DELETE' }))
}

/**
 * The post classifier speaks about posts and images. On a reply the same HTTP
 * answers mean something else: the review is gone, or Google refused the text.
 */
async function asReplyError<T>(p: Promise<T>): Promise<T> {
  try {
    return await p
  } catch (e) {
    if (e instanceof GbpApiError) {
      if (e.code === 'location_not_found') throw new GbpApiError('review_not_found')
      if (e.code === 'invalid_post' || e.code === 'image_rejected') throw new GbpApiError('reply_rejected')
    }
    throw e
  }
}

/** What the screen shows above the list, computed from the page we already have. */
export interface GbpReviewSummary {
  total: number | null
  average: number | null
  /** Reviews in the page that carry no reply from the business. */
  unanswered: number
  /** Unanswered reviews of three stars or fewer: the ones to answer first. */
  unansweredNegative: number
}

export function summarizeReviews(page: GbpReviewPage): GbpReviewSummary {
  let unanswered = 0
  let unansweredNegative = 0
  for (const r of page.reviews) {
    if (r.reply) continue
    unanswered++
    if (r.stars !== null && r.stars <= 3) unansweredNegative++
  }
  return { total: page.totalReviewCount, average: page.averageRating, unanswered, unansweredNegative }
}
