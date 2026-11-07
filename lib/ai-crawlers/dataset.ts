/**
 * THE OPEN DATASET behind /api/public/ai-crawlers — the AI crawler reference
 * table as a thing other people's sites and scripts can consume, under CC BY
 * 4.0, with no key and no sign-up.
 *
 * THIS FILE IS THE ONE SOURCE. Since 07.11.2026 `agents.ts` derives the list
 * the public checker iterates and the page renders from these two constants,
 * so the table a reader sees and the table other people consume cannot
 * disagree about which crawlers exist. Before that each was written by hand and
 * they had already drifted. Adding a row here therefore reaches the page: a new
 * `purpose` costs a label and a blurb in every public language, and a token
 * with no operator page belongs in `AI_CRAWLER_CANDIDATES`, which the page
 * renders last, marked, under a footnote.
 *
 * THE BAR FOR A ROW, and it does not bend: a page published by the crawler's
 * OWN OPERATOR that names the product token. Not another list, not a blog
 * post, not a log file. A token we cannot tie to an operator page goes in
 * `AI_CRAWLER_CANDIDATES` with the reason, and is served in its own field, so
 * a consumer can tell "documented" from "seen in the wild" without reading
 * prose.
 *
 * WHY `purpose` IS THE WHOLE VALUE. Every list of AI bots gives you tokens.
 * None of the free ones tell you that blocking a `train` agent and blocking an
 * `answer` agent are opposite decisions: the first keeps your pages out of a
 * future model, the second keeps them out of an answer a person is being shown
 * right now, with a citation and a link back to you. A consumer of this file
 * can act on that; a consumer of a flat token list cannot.
 *
 * WHY `respectsRobots: false` IS A FIELD AND NOT A FOOTNOTE. Where the
 * operator's own documentation says the agent may ignore robots.txt
 * (Perplexity-User, Meta-ExternalFetcher, FacebookExternalHit), a robots.txt
 * verdict states the site's request and not the agent's behaviour. A dataset
 * that hides that is worse than no dataset.
 *
 * WHY `crawls: false` EXISTS. Google-Extended and Applebot-Extended send no
 * user-agent of their own: they are robots.txt tokens that govern how content
 * already crawled may be USED. Both operators document that disallowing them
 * does not remove a site from their search results. People block them
 * expecting to disappear from search, or refuse to block them fearing they
 * will; both are the same misreading.
 */

export type DatasetPurpose =
  /** Collecting a corpus to train a model on. */
  | 'train'
  /** Fetching a page while a person waits for an answer, which can cite it. */
  | 'answer'
  /** Building a search index. */
  | 'search'
  /** Checking the landing page of an advert. */
  | 'ads'
  /** Building the title/description/thumbnail of a shared link. */
  | 'preview'

export type DatasetCrawler = {
  /** The product token in the operator's own spelling. */
  token: string
  operator: string
  purpose: DatasetPurpose
  /** False for a robots.txt control token that fetches nothing itself. */
  crawls: boolean
  /** False where the operator documents that robots.txt may be ignored. */
  respectsRobots: boolean
  /** True for a classic search crawler, which is not an AI crawler. */
  classicSearch?: boolean
  /** The operator's own page documenting the token. */
  docs: string
  /** ISO date on which that page was read. */
  verified: string
  /** The one thing a consumer would otherwise get wrong, near their wording. */
  note?: string
}

/** A token seen in the wild that no operator page documents. Served separately. */
export type DatasetCandidate = {
  token: string
  operator: string
  purpose: DatasetPurpose
  /** Why it is not in the dataset proper. */
  whyHere: string
}

const OPENAI_DOCS = 'https://developers.openai.com/api/docs/bots'
const ANTHROPIC_DOCS =
  'https://support.claude.com/en/articles/8896518-does-anthropic-crawl-data-from-the-web-and-how-can-site-owners-block-the-crawler'
const GOOGLE_DOCS = 'https://developers.google.com/crawling/docs/crawlers-fetchers/google-common-crawlers'
const PERPLEXITY_DOCS = 'https://docs.perplexity.ai/docs/resources/perplexity-crawlers'
const APPLE_DOCS = 'https://support.apple.com/en-us/119829'
const META_DOCS = 'https://developers.facebook.com/documentation/sharing/webmasters/web-crawlers'

/** Every row read on this date, from the `docs` page named on the row. */
// 04.11.2026: the Google, Perplexity and Meta pages had all been moved and
// answered 301/308 at the addresses recorded on 01.11. A `docs` link that
// redirects is the first thing a consumer of a CC BY dataset stops trusting,
// so the three constants above are the addresses that answer 200 today. The
// facts each row states were re-read at the new Google and Meta pages.
const READ_ON = '2026-11-01'

export const AI_CRAWLER_DATASET: readonly DatasetCrawler[] = [
  // ── OpenAI ────────────────────────────────────────────────────────────────
  { token: 'GPTBot', operator: 'OpenAI', purpose: 'train', crawls: true, respectsRobots: true, docs: OPENAI_DOCS, verified: READ_ON },
  { token: 'OAI-SearchBot', operator: 'OpenAI', purpose: 'search', crawls: true, respectsRobots: true, docs: OPENAI_DOCS, verified: READ_ON },
  { token: 'ChatGPT-User', operator: 'OpenAI', purpose: 'answer', crawls: true, respectsRobots: true, docs: OPENAI_DOCS, verified: READ_ON },
  {
    token: 'OAI-AdsBot',
    operator: 'OpenAI',
    purpose: 'ads',
    crawls: true,
    respectsRobots: true,
    docs: OPENAI_DOCS,
    verified: READ_ON,
    note: 'Checks the safety of landing pages submitted as adverts in ChatGPT. OpenAI documents that it visits only those submitted pages and that its data does not train their foundation models.',
  },

  // ── Anthropic ─────────────────────────────────────────────────────────────
  { token: 'ClaudeBot', operator: 'Anthropic', purpose: 'train', crawls: true, respectsRobots: true, docs: ANTHROPIC_DOCS, verified: READ_ON },
  { token: 'Claude-SearchBot', operator: 'Anthropic', purpose: 'search', crawls: true, respectsRobots: true, docs: ANTHROPIC_DOCS, verified: READ_ON },
  { token: 'Claude-User', operator: 'Anthropic', purpose: 'answer', crawls: true, respectsRobots: true, docs: ANTHROPIC_DOCS, verified: READ_ON },

  // ── Google ────────────────────────────────────────────────────────────────
  {
    token: 'Google-Extended',
    operator: 'Google',
    purpose: 'train',
    crawls: false,
    respectsRobots: true,
    docs: GOOGLE_DOCS,
    verified: READ_ON,
    note: 'A robots.txt token with no user-agent string of its own. It controls whether crawled content may train future Gemini models and ground answers in Gemini Apps and Vertex AI. Google documents that it does not affect inclusion in Google Search and is not a ranking signal.',
  },
  {
    token: 'GoogleOther',
    operator: 'Google',
    purpose: 'train',
    crawls: true,
    respectsRobots: true,
    docs: GOOGLE_DOCS,
    verified: READ_ON,
    note: 'A generic crawler any Google product team may use, including one-off research crawls. Google documents that rules for it affect no specific product.',
  },
  {
    token: 'Googlebot',
    operator: 'Google',
    purpose: 'search',
    crawls: true,
    respectsRobots: true,
    classicSearch: true,
    docs: GOOGLE_DOCS,
    verified: READ_ON,
    note: 'Not an AI crawler. It is in the dataset because AI Overviews are built from the Google index, so blocking it removes a site from both.',
  },

  // ── Perplexity ────────────────────────────────────────────────────────────
  { token: 'PerplexityBot', operator: 'Perplexity', purpose: 'search', crawls: true, respectsRobots: true, docs: PERPLEXITY_DOCS, verified: READ_ON },
  {
    token: 'Perplexity-User',
    operator: 'Perplexity',
    purpose: 'answer',
    crawls: true,
    respectsRobots: false,
    docs: PERPLEXITY_DOCS,
    verified: READ_ON,
    note: "Perplexity's own documentation states that because the fetch is user-initiated it generally ignores robots.txt rules.",
  },

  // ── Apple ─────────────────────────────────────────────────────────────────
  {
    token: 'Applebot',
    operator: 'Apple',
    purpose: 'search',
    crawls: true,
    respectsRobots: true,
    classicSearch: true,
    docs: APPLE_DOCS,
    verified: READ_ON,
    note: 'Powers Spotlight, Siri and Safari search, and Apple documents that what it crawls may also train their foundation models. Where robots.txt names Googlebot but not Applebot, Apple documents that Applebot follows the Googlebot rules.',
  },
  {
    token: 'Applebot-Extended',
    operator: 'Apple',
    purpose: 'train',
    crawls: false,
    respectsRobots: true,
    docs: APPLE_DOCS,
    verified: READ_ON,
    note: 'Controls whether what Applebot already crawled may train Apple’s foundation models. Apple documents that it crawls no pages and that disallowing it does not remove pages from search results.',
  },

  // ── Meta ──────────────────────────────────────────────────────────────────
  { token: 'Meta-ExternalAgent', operator: 'Meta', purpose: 'train', crawls: true, respectsRobots: true, docs: META_DOCS, verified: READ_ON },
  {
    token: 'Meta-WebIndexer',
    operator: 'Meta',
    purpose: 'search',
    crawls: true,
    respectsRobots: true,
    docs: META_DOCS,
    verified: READ_ON,
    note: 'Crawls for Meta AI search results, which Meta documents as citing and linking the content.',
  },
  {
    token: 'Meta-ExternalFetcher',
    operator: 'Meta',
    purpose: 'answer',
    crawls: true,
    respectsRobots: false,
    docs: META_DOCS,
    verified: READ_ON,
    note: 'Meta documents that it may bypass robots.txt because it fetches single links at a user’s request.',
  },
  { token: 'Meta-ExternalAds', operator: 'Meta', purpose: 'ads', crawls: true, respectsRobots: true, docs: META_DOCS, verified: READ_ON },
  {
    token: 'FacebookExternalHit',
    operator: 'Meta',
    purpose: 'preview',
    crawls: true,
    respectsRobots: false,
    docs: META_DOCS,
    verified: READ_ON,
    note: 'Builds the title, description and thumbnail of a link shared in Meta apps. Meta documents that it may bypass robots.txt for security and integrity checks.',
  },

  // ── Amazon, Microsoft ─────────────────────────────────────────────────────
  {
    token: 'Amazonbot',
    operator: 'Amazon',
    purpose: 'answer',
    crawls: true,
    respectsRobots: true,
    docs: 'https://developer.amazon.com/amazonbot',
    verified: READ_ON,
    note: 'Amazon documents that it may also be used to train Amazon AI models, that it honours user-agent and allow/disallow directives, and that it may act on a robots.txt copy cached for up to 30 days.',
  },
  {
    token: 'Bingbot',
    operator: 'Microsoft',
    purpose: 'search',
    crawls: true,
    respectsRobots: true,
    classicSearch: true,
    docs: 'https://www.bing.com/webmasters/help/which-crawlers-does-bing-use-8c184ec0',
    verified: READ_ON,
    note: 'Not an AI crawler. It is in the dataset because Copilot answers are built on the Bing index.',
  },

  // ── Corpus and long tail ──────────────────────────────────────────────────
  {
    token: 'CCBot',
    operator: 'Common Crawl',
    purpose: 'train',
    crawls: true,
    respectsRobots: true,
    docs: 'https://commoncrawl.org/ccbot',
    verified: READ_ON,
    note: 'Builds the public Common Crawl corpus that many model builders then use. Disallowing it is not retroactive: it does not remove a site from archives already published.',
  },
  { token: 'AI2Bot', operator: 'Allen Institute for AI', purpose: 'train', crawls: true, respectsRobots: true, docs: 'https://allenai.org/crawler', verified: READ_ON },
  { token: 'Diffbot', operator: 'Diffbot', purpose: 'train', crawls: true, respectsRobots: true, docs: 'https://www.diffbot.com/support/diffbot-crawler/', verified: READ_ON },
] as const

/**
 * Tokens that appear in server logs and in other people's lists, and that no
 * operator page documents. They are published too, in their own field, because
 * hiding them would make the dataset look wrong to anyone reading their own
 * access log — and because a link to an operator page is the one contribution
 * this dataset wants.
 */
export const AI_CRAWLER_CANDIDATES: readonly DatasetCandidate[] = [
  {
    token: 'Bytespider',
    operator: 'ByteDance',
    purpose: 'train',
    whyHere: 'Widely seen in access logs and widely reported to ignore robots.txt, but no operator-published page naming the token was found on 2026-11-01.',
  },
  {
    token: 'cohere-ai',
    operator: 'Cohere',
    purpose: 'train',
    whyHere: 'Seen in logs and in other lists; no current operator page naming the token was found on 2026-11-01.',
  },
  {
    token: 'MistralAI-User',
    operator: 'Mistral AI',
    purpose: 'answer',
    whyHere: "Used by Le Chat's web connector; no operator page naming the token was found on 2026-11-01.",
  },
  {
    token: 'Timpibot',
    operator: 'Timpi',
    purpose: 'train',
    whyHere: 'No operator documentation found on 2026-11-01.',
  },
  {
    token: 'omgili',
    operator: 'Webz.io',
    purpose: 'train',
    whyHere: 'No current operator documentation found on 2026-11-01.',
  },
] as const

/** Bumped whenever a row changes, so a consumer can cache on it. */
export const AI_CRAWLER_DATASET_VERSION = '2026.11.01'

export const AI_CRAWLER_DATASET_LICENSE = {
  id: 'CC-BY-4.0',
  url: 'https://creativecommons.org/licenses/by/4.0/',
  attribution: 'Go Top SEO — https://www.gotopseo.com/en/ai-crawlers',
} as const
