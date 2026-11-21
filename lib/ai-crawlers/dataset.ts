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
  /**
   * A real browser, hosted by the operator and driven by an AI agent doing
   * what one user asked of it. It is not a crawler: it visits the pages that
   * one task needs, it carries the browser's own User-Agent with a token added
   * to it, and the operator governs it by publishing the IP addresses it comes
   * from rather than by robots.txt. Blocking it does not keep a site out of a
   * model or out of an answer — it stops that site's own visitors from asking
   * an assistant to do something on it.
   */
  | 'agent'

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
const ANTHROPIC_AGENT_DOCS =
  'https://support.claude.com/en/articles/18234133-how-do-anthropic-hosted-browsers-identify-themselves-when-they-browse-the-web-on-a-user-s-behalf'
const GOOGLE_DOCS = 'https://developers.google.com/crawling/docs/crawlers-fetchers/google-common-crawlers'
const GOOGLE_FETCHER_DOCS =
  'https://developers.google.com/crawling/docs/crawlers-fetchers/google-user-triggered-fetchers'
const PERPLEXITY_DOCS = 'https://docs.perplexity.ai/docs/resources/perplexity-crawlers'
const APPLE_DOCS = 'https://support.apple.com/en-us/119829'
const META_DOCS = 'https://developers.facebook.com/documentation/sharing/webmasters/web-crawlers'
const MISTRAL_DOCS = 'https://docs.mistral.ai/robots/'
const DUCKDUCKGO_DOCS = 'https://duckduckgo.com/duckduckgo-help-pages/results/duckassistbot/'
const KAGI_DOCS = 'https://kagi.com/bot'
const IMAGESIFT_DOCS = 'https://imagesift.com/about'
const AMAZON_DOCS = 'https://developer.amazon.com/amazonbot'
const KIMI_DOCS = 'https://kimi.com/policies/kimi-crawlers'
const ELEVENLABS_DOCS = 'https://elevenlabs.io/docs/bots'
const QUALIFIED_DOCS = 'https://qualified.com/legal/qualified-crawler-user-agent'
const EXA_DOCS = 'https://crawler.exa.ai/'
const LINER_DOCS = 'https://liner-user.liner.com/docs/liner-user'
const AMAZON_Q_DOCS =
  'https://docs.aws.amazon.com/amazonq/latest/qbusiness-ug/stop-web-crawler.html'

/** Every row read on this date, from the `docs` page named on the row. */
// 04.11.2026: the Google, Perplexity and Meta pages had all been moved and
// answered 301/308 at the addresses recorded on 01.11. A `docs` link that
// redirects is the first thing a consumer of a CC BY dataset stops trusting,
// so the three constants above are the addresses that answer 200 today. The
// facts each row states were re-read at the new Google and Meta pages.
const READ_ON = '2026-11-01'
// 11.11.2026: all six operator pages were fetched again. Every address still
// answers 200 with no redirect, and the token list on each page was compared
// with the rows below. Two tokens were documented that this dataset did not
// carry — `Claude-Agent` on a second Anthropic page that the first one links
// to, and `Google-CloudVertexBot` on the Google page — and they are the two
// rows that carry this date. The facts on the older rows were not re-read, so
// those rows keep the date they were read on, which is what `verified` is for.
const READ_ON_AGENTIC = '2026-11-11'
// 16.11.2026: three operators that this dataset had never read were read for
// the first time, after comparing our token list with the public
// ai-robots-txt/ai.robots.txt list and chasing only the names whose OWN
// operator publishes a page. Mistral now documents all three of its tokens at
// docs.mistral.ai/robots, which is why MistralAI-User moves out of the
// candidates and arrives here with its two siblings. Brave was chased and
// produced nothing to add: its help page states that the Brave Search crawler
// deliberately sends no differentiated user agent, so there is no token to
// document, and `Bravebot` elsewhere rests on no operator page.
const READ_ON_NOV16 = '2026-11-16'
// 20.11.2026: Google's user-triggered fetchers page was read for the first
// time. Until today this dataset carried only Google's *crawlers* page, and so
// it was missing the two Google tokens a site is most likely to meet in 2026:
// one agent and one fetch made while a person waits. Both rows say
// `respectsRobots: false`, and not as a guess — that page states that because
// the fetch was requested by a user, these fetchers generally ignore robots.txt
// rules. The third row read today is Hive's image crawler, which is the
// opposite case: an operator page that commits to robots.txt in writing.
const READ_ON_NOV20 = '2026-11-20'
// 21.11.2026: Amazon's page, last modified on 26.10.2026 by its own footer, now
// documents three tokens where this dataset carried one. The split matters more
// than the two new rows: Amazonbot had been recorded here as an `answer`
// crawler, and that role has moved to Amzn-User, so the old row was telling a
// reader to weigh the wrong decision. xAI was chased on the same pass and
// produced nothing: x.ai answers 403 to this container and its developer docs
// have no crawlers page, so Grok stays out rather than resting on a
// third-party list.
// 21.11.2026, second pass: three operators that publish a crawler page and were
// never read here. They were found by taking the token names from a public
// agent directory and then reading ONLY the operator link each entry gave, so
// every fact below still comes from the operator. Moonshot's Kimi draws the
// same three-way split this dataset is built around, in its own words.
// ElevenLabs draws a two-way one. Qualified is the awkward case kept honest:
// its page documents the token and the crawl, and says to control the schedule
// by contacting your account manager — robots.txt is never mentioned, so the
// row says it has committed to nothing rather than inventing a commitment.
// 21.11.2026, third pass: Exa, Liner and Amazon Q Business, found the same way
// and read the same way — only at the operator's own page. Two things here are
// worth more than the six rows. First, Liner documents that its user-triggered
// fetcher follows the robots.txt group naming its token. Several answer-time
// fetchers here honour robots.txt (Claude-User, ChatGPT-User, MistralAI-User,
// DuckAssistBot), but of the operators that raise being user-initiated at all,
// Liner is the one that commits rather than reserving the right to ignore it. Second, Exa and
// Liner both sign their requests under Web Bot Auth (RFC 9421) and publish key
// directories, which is how a site will increasingly tell a real crawler from
// a spoofed user agent. Grok was chased again: x.ai/bot now answers 200, but
// it is a product page for AI teammates and names no robots.txt token, so
// there is still nothing to document.
const READ_ON_NOV21 = '2026-11-21'

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
  {
    token: 'Claude-Agent',
    operator: 'Anthropic',
    purpose: 'agent',
    crawls: true,
    respectsRobots: false,
    docs: ANTHROPIC_AGENT_DOCS,
    verified: READ_ON_AGENTIC,
    note: 'A browser hosted by Anthropic and driven by an agent at one user\u2019s direction, which Anthropic documents separately from its crawlers and fetchers. It carries the browser\u2019s own User-Agent with the token added inside it, so a rule has to match the token rather than the whole string, and Anthropic publishes the addresses it comes from at claude.com/.well-known/sail under the same name. Anthropic states that a site\u2019s preferences for its crawlers and for this traffic are independent of each other, and does not describe this traffic as governed by robots.txt.',
  },

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

  {
    token: 'Google-CloudVertexBot',
    operator: 'Google',
    purpose: 'search',
    crawls: true,
    respectsRobots: true,
    docs: GOOGLE_DOCS,
    verified: READ_ON_AGENTIC,
    note: 'Google documents that rules addressed to this token affect only crawls that a site owner has asked for when building a Vertex AI agent, and have no effect on Google Search or any other product. So it is the one row here that a site usually meets because somebody on that site asked for it.',
  },

  {
    token: 'Google-Agent',
    operator: 'Google',
    purpose: 'agent',
    crawls: true,
    respectsRobots: false,
    docs: GOOGLE_FETCHER_DOCS,
    verified: READ_ON_NOV20,
    note: 'Google documents this as the identity used by agents hosted on Google infrastructure to navigate the web and perform actions upon user request. It is listed among the user-triggered fetchers, and that page states that because the fetch was requested by a user, these fetchers generally ignore robots.txt rules \u2014 so a Disallow written for it describes the site\u2019s request rather than the traffic. Google governs it by publishing the addresses it comes from, in user-triggered-agents.json, and is also experimenting with the Web Bot Auth protocol under the identity agent.bot.goog.',
  },
  {
    token: 'Google-GeminiNotebook',
    operator: 'Google',
    purpose: 'answer',
    crawls: true,
    respectsRobots: false,
    docs: GOOGLE_FETCHER_DOCS,
    verified: READ_ON_NOV20,
    note: 'Fetches the individual URLs a Gemini Notebook user has given as sources for their own project, so it arrives because a reader chose that page, one URL at a time, and not as a crawl. It is a user-triggered fetcher, which Google documents as generally ignoring robots.txt. The token read Google-NotebookLM until that spelling stopped being supported in August 2026; a rule still naming the old one matches nothing today.',
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
    purpose: 'train',
    crawls: true,
    respectsRobots: true,
    docs: AMAZON_DOCS,
    verified: READ_ON_NOV21,
    note: 'Amazon documents it as improving its products and services, and states that what it collects may be used to train Amazon AI models \u2014 which is why it sits in the training group now that Amazon documents a separate token for each of the other two jobs. It honours the user-agent and allow/disallow directives, may act on a robots.txt copy cached for up to 30 days, respects rel=nofollow and the noarchive, noindex and none meta tags, and does not support crawl-delay.',
  },
  {
    token: 'Amzn-SearchBot',
    operator: 'Amazon',
    purpose: 'search',
    crawls: true,
    respectsRobots: true,
    docs: AMAZON_DOCS,
    verified: READ_ON_NOV21,
    note: 'Allowing it makes a site eligible to appear in Amazon search experiences such as Alexa, and Amazon states that it does not crawl content for generative AI model training \u2014 so a site that blocked everything Amazon in order to stay out of a model gave up the visitors too. Where robots.txt names no group for it but allows other search bots, Amazon documents that it follows the directives given to those.',
  },
  {
    token: 'Amzn-User',
    operator: 'Amazon',
    purpose: 'answer',
    crawls: true,
    respectsRobots: false,
    docs: AMAZON_DOCS,
    verified: READ_ON_NOV21,
    note: 'The fetch Amazon makes while a person waits \u2014 it brings live information from the web to answer an Alexa question on that user\u2019s behalf. Amazon states that because the action can be initiated by a user it may not follow all robots.txt directives, and that it does not crawl content for generative AI model training.',
  },
  {
    token: 'amazon-QBusiness',
    operator: 'Amazon',
    purpose: 'search',
    crawls: true,
    respectsRobots: true,
    docs: AMAZON_Q_DOCS,
    verified: READ_ON_NOV21,
    note: 'The crawler an Amazon Q Business customer points at websites to index them for their own assistant, so a site usually meets it because somebody using that site configured it. AWS documents that it adheres to robots.txt and respects Allow and Disallow, and writes the token in lower case in its own examples. The same page states that Q Business is no longer open to new customers.',
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
  {
    token: 'ImagesiftBot',
    operator: 'Hive',
    purpose: 'train',
    crawls: true,
    respectsRobots: true,
    docs: IMAGESIFT_DOCS,
    verified: READ_ON_NOV20,
    note: 'Collects publicly available images for Hive\u2019s web-intelligence products, which is why it sits in the training group rather than beside the crawlers that answer a question. The operator page commits in writing to robots.txt directives that name ImagesiftBot and to the crawl-delay directive, read as the minimum seconds between requests. The page also spells the name ImageSiftBot in prose; the token it actually sends, and the one its own robots.txt examples use, is ImagesiftBot, and a rule has to match that spelling.',
  },

  // ── Mistral ───────────────────────────────────────────────────────────────
  // All three are named on one operator page, and the page draws the same
  // distinction this dataset exists to carry: Index builds the search index,
  // Training builds a corpus, and User is the fetch made while a person waits
  // for an answer that links back to the source.
  { token: 'MistralAI-Index', operator: 'Mistral AI', purpose: 'search', crawls: true, respectsRobots: true, docs: MISTRAL_DOCS, verified: READ_ON_NOV16 },
  { token: 'MistralAI-Training', operator: 'Mistral AI', purpose: 'train', crawls: true, respectsRobots: true, docs: MISTRAL_DOCS, verified: READ_ON_NOV16 },
  { token: 'MistralAI-User', operator: 'Mistral AI', purpose: 'answer', crawls: true, respectsRobots: true, docs: MISTRAL_DOCS, verified: READ_ON_NOV16 },

  // ── DuckDuckGo ────────────────────────────────────────────────────────────
  // The operator page is unusually explicit on both counts a reader needs: the
  // fetch is made in real time for an answer that cites its sources, the data
  // is not used to train a model, and an opt-out written into robots.txt takes
  // effect within 72 hours. It also states that disallowing it does not affect
  // ordinary search rankings, which is the fear that makes people leave an
  // answer crawler blocked by accident.
  { token: 'DuckAssistBot', operator: 'DuckDuckGo', purpose: 'answer', crawls: true, respectsRobots: true, docs: DUCKDUCKGO_DOCS, verified: READ_ON_NOV16 },

  // ── Kagi ──────────────────────────────────────────────────────────────────
  // Kagi documents one behaviour no other operator here does: with no group
  // naming Kagibot, it follows the Googlebot group instead of the `*` group.
  // So a site that disallows `*` and allows Googlebot is allowing Kagibot too,
  // which is the opposite of what RFC 9309 alone would predict.
  { token: 'Kagibot', operator: 'Kagi', purpose: 'search', crawls: true, respectsRobots: true, docs: KAGI_DOCS, verified: READ_ON_NOV16 },

  // ── Moonshot AI (Kimi) ────────────────────────────────────────────────────
  // One operator page, three tokens, and the operator itself separates the
  // corpus from the index from the fetch a person waits for.
  { token: 'KimiBot', operator: 'Moonshot AI', purpose: 'train', crawls: true, respectsRobots: true, docs: KIMI_DOCS, verified: READ_ON_NOV21 },
  { token: 'Kimi-SearchBot', operator: 'Moonshot AI', purpose: 'search', crawls: true, respectsRobots: true, docs: KIMI_DOCS, verified: READ_ON_NOV21 },
  {
    token: 'Kimi-User',
    operator: 'Moonshot AI',
    purpose: 'answer',
    crawls: true,
    respectsRobots: false,
    docs: KIMI_DOCS,
    verified: READ_ON_NOV21,
    note: 'The fetch made when somebody asks Kimi to read a page or answer something that needs live retrieval. Moonshot states that it is not used for bulk crawling and that, because the actions are user-triggered, robots.txt rules may not directly apply \u2014 and separately that disallowing it may reduce a site\u2019s visibility in user-directed searches through its products. Moonshot also asks sites not to block its IP ranges, because a blocked crawler cannot read the robots.txt that states the site\u2019s preferences.',
  },

  // ── Exa ───────────────────────────────────────────────────────────────────
  {
    token: 'ExaSearchBot',
    operator: 'Exa',
    purpose: 'search',
    crawls: true,
    respectsRobots: true,
    docs: EXA_DOCS,
    verified: READ_ON_NOV21,
    note: 'Builds the index that Exa search and the applications on top of it answer from, and Exa states that it sends people back to the source. Its robots.txt precedence is unusual and worth knowing: with no group naming ExaSearchBot it follows the rules set for major search engines, and only then the * group. Exa also documents that robots.txt governs crawling and not indexing \u2014 a page already in the index leaves it on a noindex meta tag or X-Robots-Tag header, at the next re-fetch \u2014 and that every request is signed under Web Bot Auth (RFC 9421), with Ed25519 keys published at crawler.exa.ai, so the user agent alone should not be trusted.',
  },
  {
    token: 'ExaSearchBot-Images',
    operator: 'Exa',
    purpose: 'search',
    crawls: true,
    respectsRobots: true,
    docs: EXA_DOCS,
    verified: READ_ON_NOV21,
    note: 'The same crawler fetching images, under its own token, so a site can keep its pages in the index and keep its images out of it.',
  },
  {
    token: 'ExaUser',
    operator: 'Exa',
    purpose: 'answer',
    crawls: true,
    respectsRobots: false,
    docs: EXA_DOCS,
    verified: READ_ON_NOV21,
    note: 'The pages Exa fetches on one user\u2019s request rather than by crawling. Exa\u2019s page names the token and separates it from the crawler, but its robots.txt section is written about ExaSearchBot alone and promises nothing for this one, which is why this row states no commitment rather than borrowing the crawler\u2019s.',
  },

  // ── Liner ─────────────────────────────────────────────────────────────────
  {
    token: 'LinerBot',
    operator: 'Liner',
    purpose: 'search',
    crawls: true,
    respectsRobots: true,
    docs: LINER_DOCS,
    verified: READ_ON_NOV21,
    note: 'Builds and refreshes Liner\u2019s search and reference index, including paper metadata, citations and DOI resolution. Liner documents that each of its two bots follows the group naming its own token and the * group otherwise, and that rules for this one do not apply to the other.',
  },
  {
    token: 'Liner-User',
    operator: 'Liner',
    purpose: 'answer',
    crawls: true,
    respectsRobots: true,
    docs: LINER_DOCS,
    verified: READ_ON_NOV21,
    note: 'Fetches a page in real time when a Liner user asks a question, and the answer cites that page as its source. Unlike the fetchers whose operators lean on the fetch being user-initiated to say robots.txt may not apply \u2014 Perplexity-User, Meta-ExternalFetcher, Kimi-User, ExaUser, Amzn-User and Google\u2019s user-triggered fetchers \u2014 Liner commits to the file anyway: it documents that this bot follows the group naming Liner-User, and the * group when none does. Both Liner bots sign their requests under Web Bot Auth with separate keys, and Liner states it publishes no IP ranges, so the signature is the only verification offered.',
  },

  // ── ElevenLabs ────────────────────────────────────────────────────────────
  {
    token: 'ElevenlabsCrawler',
    operator: 'ElevenLabs',
    purpose: 'train',
    crawls: true,
    respectsRobots: true,
    docs: ELEVENLABS_DOCS,
    verified: READ_ON_NOV21,
    note: 'Collects publicly available content that may train ElevenLabs\u2019 generative models. ElevenLabs documents that the two tokens are independent of each other, so a site can allow the one its customers use while disallowing this one, and that a robots.txt change is reflected within about 24 hours.',
  },
  {
    token: 'ElevenlabsBot',
    operator: 'ElevenLabs',
    purpose: 'search',
    crawls: true,
    respectsRobots: true,
    docs: ELEVENLABS_DOCS,
    verified: READ_ON_NOV21,
    note: 'Fetches the pages an ElevenLabs customer adds to an agent\u2019s knowledge base, when they add them and when they refresh them, and ElevenLabs states that it honours robots.txt. Like Google\u2019s Vertex crawler, a site usually meets it because somebody using that site asked for it.',
  },

  // ── Qualified ─────────────────────────────────────────────────────────────
  {
    token: 'QualifiedBot',
    operator: 'Qualified',
    purpose: 'train',
    crawls: true,
    respectsRobots: false,
    docs: QUALIFIED_DOCS,
    verified: READ_ON_NOV21,
    note: 'Qualified documents that it crawls its own customers\u2019 websites to power its AI products, at setup, at major releases and on a schedule the customer sets with their account manager. Its page never mentions robots.txt: the only crawl control it offers is to contact that manager, which is why this row states no robots.txt commitment rather than inferring one. It also documents that it may present a modified Chromium user agent with the token inside it, so a rule has to match the token and not the whole string.',
  },
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
export const AI_CRAWLER_DATASET_VERSION = '2026.11.21'

export const AI_CRAWLER_DATASET_LICENSE = {
  id: 'CC-BY-4.0',
  url: 'https://creativecommons.org/licenses/by/4.0/',
  attribution: 'Go Top SEO — https://www.gotopseo.com/en/ai-crawlers',
} as const
