/**
 * The AI user-agents the public checker asks about, and what each one is FOR.
 *
 * THIS LIST IS DERIVED, NOT WRITTEN. Every row comes from
 * lib/ai-crawlers/dataset.ts, which is also what /api/public/ai-crawlers
 * serves under CC BY 4.0. Until 07.11.2026 the two were separate hand-written
 * tables, and they had already drifted: the page showed five tokens that no
 * operator documents as ordinary rows — four of them asserting that the
 * operator honours robots.txt, which is a claim the dataset itself declines to
 * make — and omitted a row the dataset carries. A reader who compared the page
 * with the dataset we ask people to cite would have found us contradicting
 * ourselves about GPTBot's neighbours. One table, derived twice, cannot do that.
 *
 * `purpose` is the distinction that makes the answer useful rather than a row
 * of dots. Blocking a `train` agent and blocking an `answer` agent are opposite
 * decisions: the first keeps your pages out of a future model, the second keeps
 * them out of an answer a person is being shown RIGHT NOW with a citation and a
 * link back. A site that blocks everything because "AI bad" usually meant only
 * the first, and the table is where that becomes visible.
 *
 * `documented: false` marks a token no operator has published a page for. The
 * dataset keeps those in its own `candidates` list; the checker still reports
 * them, because people do find them in their logs and want a verdict, and the
 * page marks them so the two kinds of row are never read as one.
 *
 * `respectsRobots: false` marks an agent that has not committed to robots.txt:
 * either its operator documents that it may ignore the file, or no operator
 * page exists to commit to anything. The result screen says so beside the
 * verdict — "has not committed to honouring robots.txt" — because for those,
 * "allowed" and "blocked" both describe the request a site is making rather
 * than what the crawler will do.
 */
import { AI_CRAWLER_CANDIDATES, AI_CRAWLER_DATASET } from './dataset'

/** What the operator fetches pages for. */
export type CrawlerPurpose =
  /** Collecting a corpus to train a model on. */
  | 'train'
  /** Fetching a page at the moment a user asks something, to answer with it. */
  | 'answer'
  /** Building a search index. */
  | 'search'
  /** Checking the landing page of an advert. */
  | 'ads'
  /** Building the title, description and thumbnail of a shared link. */
  | 'preview'

export type AiCrawler = {
  /** The exact product token sent in `User-agent`, in its published spelling. */
  token: string
  /** Who runs it. Shown in the reference table. */
  operator: string
  purpose: CrawlerPurpose
  /**
   * False when the agent has not committed to robots.txt — either its operator
   * documents that it may ignore the file, or no operator page documents the
   * token at all. A verdict for it describes our request, not its behaviour.
   */
  respectsRobots: boolean
  /**
   * True when an operator's own page names this token. False for a token we
   * list because it turns up in logs; the page marks those, and the dataset
   * serves them in a separate array.
   */
  documented: boolean
  /**
   * True for the handful that are not AI crawlers at all but the classic search
   * crawlers people check in the same breath — and that increasingly feed AI
   * answers too (an AI Overview is built from the Google index). Rendered in
   * their own group so the table does not pretend Googlebot is an AI crawler.
   */
  classicSearch?: boolean
}

const documented = AI_CRAWLER_DATASET.map(
  (c): AiCrawler => ({
    token: c.token,
    operator: c.operator,
    purpose: c.purpose,
    respectsRobots: c.respectsRobots,
    documented: true,
    ...(c.classicSearch ? { classicSearch: true } : {}),
  }),
)

/**
 * A candidate has no operator page, so it has committed to nothing: that is
 * what `respectsRobots: false` states here, and the screen's wording — "has
 * not committed to honouring robots.txt" — is exactly true of it. Writing
 * `true` instead, as the hand-written table used to, would have been us
 * vouching for an operator that has published nothing.
 */
const candidates = AI_CRAWLER_CANDIDATES.map(
  (c): AiCrawler => ({
    token: c.token,
    operator: c.operator,
    purpose: c.purpose,
    respectsRobots: false,
    documented: false,
  }),
)

/**
 * Ordered for reading, not alphabetically: the documented AI crawlers a visitor
 * came to ask about first, the classic search crawlers after them, and the
 * undocumented tokens last, where the weakest evidence belongs.
 */
export const AI_CRAWLERS: readonly AiCrawler[] = [
  ...documented.filter((c) => !c.classicSearch),
  ...documented.filter((c) => c.classicSearch),
  ...candidates,
]

/** The tokens, in the order the page renders them. */
export const AI_CRAWLER_TOKENS: readonly string[] = AI_CRAWLERS.map((c) => c.token)
