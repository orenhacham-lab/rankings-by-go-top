/**
 * The AI user-agents the public checker asks about, and what each one is FOR.
 *
 * This table is the half of the asset that does not need a network call: it is
 * rendered on the page as a reference, it is what a writer actually cites, and
 * it is the list the checker iterates. So the bar for an entry is a token a
 * crawler's own operator has published as the name it sends in `User-agent`.
 * Nothing here is inferred from a log file, and nothing is a guess.
 *
 * `purpose` is the distinction that makes the answer useful rather than a row
 * of dots. Blocking a `train` agent and blocking an `answer` agent are opposite
 * decisions: the first keeps your pages out of a future model, the second keeps
 * them out of an answer a person is being shown RIGHT NOW with a citation and a
 * link back. A site that blocks everything because "AI bad" usually meant only
 * the first, and the table is where that becomes visible.
 *
 * `respectsRobots: false` marks an agent whose operator has NOT committed to
 * robots.txt, or that has been widely reported ignoring it. The result screen
 * says so beside the verdict, because "allowed" and "blocked" are both nearly
 * meaningless for those: robots.txt is a request, not a wall.
 */

/** What the operator fetches pages for. */
export type CrawlerPurpose =
  /** Collecting a corpus to train a model on. */
  | 'train'
  /** Fetching a page at the moment a user asks something, to answer with it. */
  | 'answer'
  /** Building a search index. */
  | 'search'

export type AiCrawler = {
  /** The exact product token sent in `User-agent`, in its published spelling. */
  token: string
  /** Who runs it. Shown in the reference table. */
  operator: string
  purpose: CrawlerPurpose
  /**
   * False when the operator has not committed to robots.txt, so a verdict for
   * it describes our request rather than its behaviour.
   */
  respectsRobots: boolean
  /**
   * True for the handful that are not AI crawlers at all but the classic search
   * crawlers people check in the same breath — and that increasingly feed AI
   * answers too (an AI Overview is built from the Google index). Rendered in
   * their own group so the table does not pretend Googlebot is an AI crawler.
   */
  classicSearch?: boolean
}

/**
 * Ordered for reading, not alphabetically: the agents a visitor came to ask
 * about first, the long tail after, the classic search crawlers last.
 */
export const AI_CRAWLERS: readonly AiCrawler[] = [
  // ── OpenAI ────────────────────────────────────────────────────────────────
  { token: 'GPTBot', operator: 'OpenAI', purpose: 'train', respectsRobots: true },
  { token: 'OAI-SearchBot', operator: 'OpenAI', purpose: 'search', respectsRobots: true },
  { token: 'ChatGPT-User', operator: 'OpenAI', purpose: 'answer', respectsRobots: true },

  // ── Anthropic ─────────────────────────────────────────────────────────────
  { token: 'ClaudeBot', operator: 'Anthropic', purpose: 'train', respectsRobots: true },
  { token: 'Claude-SearchBot', operator: 'Anthropic', purpose: 'search', respectsRobots: true },
  { token: 'Claude-User', operator: 'Anthropic', purpose: 'answer', respectsRobots: true },

  // ── Google ────────────────────────────────────────────────────────────────
  // Google-Extended is not a crawler: it is a control token Googlebot's own
  // fetch honours, deciding whether what was already crawled may be used for
  // Gemini and for grounding. Blocking it does NOT remove you from Search.
  { token: 'Google-Extended', operator: 'Google', purpose: 'train', respectsRobots: true },

  // ── Perplexity ────────────────────────────────────────────────────────────
  { token: 'PerplexityBot', operator: 'Perplexity', purpose: 'search', respectsRobots: true },
  // Reported fetching from undeclared addresses after a robots.txt refusal, so
  // a verdict here states our request and not an outcome.
  { token: 'Perplexity-User', operator: 'Perplexity', purpose: 'answer', respectsRobots: false },

  // ── Microsoft / Apple / Meta / Amazon ─────────────────────────────────────
  { token: 'Applebot-Extended', operator: 'Apple', purpose: 'train', respectsRobots: true },
  { token: 'Meta-ExternalAgent', operator: 'Meta', purpose: 'train', respectsRobots: true },
  { token: 'meta-externalfetcher', operator: 'Meta', purpose: 'answer', respectsRobots: true },
  { token: 'Amazonbot', operator: 'Amazon', purpose: 'answer', respectsRobots: true },

  // ── The corpus and long-tail crawlers ─────────────────────────────────────
  { token: 'CCBot', operator: 'Common Crawl', purpose: 'train', respectsRobots: true },
  { token: 'Bytespider', operator: 'ByteDance', purpose: 'train', respectsRobots: false },
  { token: 'cohere-ai', operator: 'Cohere', purpose: 'train', respectsRobots: true },
  { token: 'Diffbot', operator: 'Diffbot', purpose: 'train', respectsRobots: true },
  { token: 'AI2Bot', operator: 'Allen Institute for AI', purpose: 'train', respectsRobots: true },
  { token: 'Timpibot', operator: 'Timpi', purpose: 'train', respectsRobots: true },
  { token: 'omgili', operator: 'Webz.io', purpose: 'train', respectsRobots: true },
  { token: 'MistralAI-User', operator: 'Mistral AI', purpose: 'answer', respectsRobots: true },

  // ── Classic search, which also feeds AI answers ───────────────────────────
  { token: 'Googlebot', operator: 'Google', purpose: 'search', respectsRobots: true, classicSearch: true },
  { token: 'Bingbot', operator: 'Microsoft', purpose: 'search', respectsRobots: true, classicSearch: true },
  { token: 'Applebot', operator: 'Apple', purpose: 'search', respectsRobots: true, classicSearch: true },
] as const

/** The tokens, lower-cased, for matching against a robots.txt group name. */
export const AI_CRAWLER_TOKENS: readonly string[] = AI_CRAWLERS.map((c) => c.token)
