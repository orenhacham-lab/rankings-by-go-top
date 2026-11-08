/**
 * The OpenAPI description of the public AI-crawler dataset endpoint.
 *
 * WHY THIS EXISTS AT ALL. The dataset at /api/public/ai-crawlers is already
 * free, keyless and CORS-open, but a catalogue cannot list it on those merits:
 * APIs.guru, and every tool built on its collection, index an API only from a
 * machine-readable description served at a stable URL. Without one the endpoint
 * is a page a human must read; with one it is an entry other people's tooling
 * can carry. That is the same move as the Dataset markup in lib/seo/dataset.ts,
 * one layer down.
 *
 * NOTHING HERE IS WRITTEN TWICE. The version, the licence and the response
 * shape come from the dataset module and from the route's own constants, so a
 * new crawler field cannot appear in the JSON while the description still
 * promises the old shape — the QA suite fails when they drift apart.
 *
 * WHAT IT DELIBERATELY DOES NOT CLAIM. No authentication scheme, because there
 * is none. No rate limit, because the route serves a constant and has none. No
 * endpoint that we do not serve: a catalogue's validator checks every path, and
 * a path that 404s is the cheapest possible way to look untrustworthy.
 *
 * THE MEASUREMENT IS DESCRIBED HERE TOO, and its `limitations` array is a
 * required field of the schema rather than a note in the prose. A description a
 * machine reads is exactly where a caveat gets dropped, so the shape makes
 * dropping it a schema violation.
 */
import { BLOCKING_MEASUREMENT } from './blocking-measurement'
import {
  AI_CRAWLER_DATASET_LICENSE,
  AI_CRAWLER_DATASET_VERSION,
} from './dataset'

/** Where the description, and the endpoints it describes, live. */
const SITE = 'https://www.gotopseo.com'
const DATASET_PATH = '/api/public/ai-crawlers'
const MEASUREMENT_PATH = '/api/public/ai-crawler-blocking'

/**
 * The purposes the dataset uses, in one place: the crawler rows, the candidate
 * rows and the measurement's per-crawler breakdown all speak this vocabulary,
 * and a second copy is how an enum drifts.
 */
const PURPOSES = ['train', 'search', 'answer', 'ads', 'preview'] as const

/**
 * `2026.11.01` is the dataset's own version. OpenAPI's `info.version` describes
 * the API document, and tying it to the data is the honest reading here: the
 * shape has one meaning and the rows are what change.
 */
export function aiCrawlerOpenApiDocument() {
  return {
    openapi: '3.1.0',
    info: {
      title: 'AI Crawler Reference Dataset',
      version: AI_CRAWLER_DATASET_VERSION,
      summary: 'Which AI crawlers exist, what each one is for, and what its operator documents about robots.txt.',
      description: [
        'A reference table of the AI crawler user-agent tokens, served as JSON or CSV.',
        '',
        'Every row carries the operator’s own documentation URL and the date that page was read, because these change without announcement. `purpose` is the field that changes a site owner’s decision: `train` collects a corpus for a future model, `search` builds the index behind an assistant’s answers, `answer` is a fetch made while a person waits for an answer that can cite and link the page, `ads` checks an advert landing page, and `preview` builds a link preview.',
        '',
        '`crawls: false` marks a robots.txt control token that fetches nothing by itself. `respectsRobots: false` marks an agent whose own operator documents that robots.txt may be ignored; for those a robots.txt rule states the request a site is making, not an outcome.',
        '',
        'Tokens seen in the wild that no operator documents are served in a separate `candidates` array and never mixed into `crawlers`, so "the operator documents this" and "we have seen this" cannot be confused by a consumer reading the file.',
        '',
        'No key, no sign-up and no quota. Responses are cacheable and identical for every caller.',
      ].join('\n'),
      license: {
        name: AI_CRAWLER_DATASET_LICENSE.id,
        url: AI_CRAWLER_DATASET_LICENSE.url,
      },
      contact: {
        name: 'Go Top SEO',
        url: `${SITE}/en/ai-crawlers`,
      },
    },
    servers: [{ url: SITE }],
    externalDocs: {
      description: 'The same table rendered as a page, with a checker that reads a live robots.txt.',
      url: `${SITE}/en/ai-crawlers`,
    },
    tags: [
      { name: 'dataset', description: 'The crawler reference table.' },
      {
        name: 'measurement',
        description: 'A dated reading of how many sites block these crawlers, with the limitation that bounds it.',
      },
    ],
    paths: {
      [DATASET_PATH]: {
        get: {
          tags: ['dataset'],
          operationId: 'getAiCrawlers',
          summary: 'The AI crawler reference table',
          description: 'Returns every documented AI crawler token, and separately the tokens no operator documents. JSON by default; `format=csv` returns the documented rows as CSV.',
          parameters: [
            {
              name: 'format',
              in: 'query',
              required: false,
              description: 'Omit for JSON. `csv` returns the documented rows as RFC 4180 CSV, as a file download.',
              schema: { type: 'string', enum: ['csv'] },
            },
          ],
          responses: {
            '200': {
              description: 'The dataset.',
              headers: {
                'x-license': {
                  description: 'The licence the data is served under.',
                  schema: { type: 'string', examples: [AI_CRAWLER_DATASET_LICENSE.id] },
                },
              },
              content: {
                'application/json': {
                  schema: { $ref: '#/components/schemas/Dataset' },
                },
                'text/csv': {
                  schema: {
                    type: 'string',
                    description: 'Header row followed by one row per documented crawler: token, operator, purpose, crawls, respects_robots, classic_search, docs, verified, note.',
                  },
                },
              },
            },
            '451': {
              description: 'The request came from a jurisdiction this service may not serve. No body.',
            },
          },
        },
      },
      [MEASUREMENT_PATH]: {
        get: {
          tags: ['measurement'],
          operationId: 'getAiCrawlerBlocking',
          summary: 'How many sites block these crawlers, measured once',
          description: [
            'One dated reading of robots.txt across a sample of highly ranked sites, with the method, the failures and the limitations in the same payload as the figures.',
            '',
            '`limitations` is not decoration. The sample is large, highly ranked sites, so the figures are not a picture of small businesses, and `notSampled` names the markets a reader might otherwise assume were included. The CSV repeats the first limitation on every row for the same reason.',
          ].join('\n'),
          parameters: [
            {
              name: 'format',
              in: 'query',
              required: false,
              description: 'Omit for JSON. `csv` returns the per-market rows as RFC 4180 CSV, as a file download.',
              schema: { type: 'string', enum: ['csv'] },
            },
          ],
          responses: {
            '200': {
              description: 'The measurement.',
              headers: {
                'x-license': {
                  description: 'The licence the data is served under.',
                  schema: { type: 'string', examples: [AI_CRAWLER_DATASET_LICENSE.id] },
                },
              },
              content: {
                'application/json': {
                  schema: { $ref: '#/components/schemas/Measurement' },
                },
                'text/csv': {
                  schema: {
                    type: 'string',
                    description: 'Header row followed by one row per market: market, blocks_traffic_crawler_pct, n_robots_read, measured_on, limitation.',
                  },
                },
              },
            },
            '451': {
              description: 'The request came from a jurisdiction this service may not serve. No body.',
            },
          },
        },
      },
    },
    components: {
      schemas: {
        Dataset: {
          type: 'object',
          required: ['version', 'license', 'source', 'notes', 'crawlers', 'candidates'],
          properties: {
            version: {
              type: 'string',
              description: 'The dataset version, as `YYYY.MM.DD`. A consumer can cache on it.',
              examples: [AI_CRAWLER_DATASET_VERSION],
            },
            license: {
              type: 'object',
              required: ['id', 'url', 'attribution'],
              description: 'The licence, and the attribution it asks for.',
              properties: {
                id: { type: 'string', examples: [AI_CRAWLER_DATASET_LICENSE.id] },
                url: { type: 'string', format: 'uri', examples: [AI_CRAWLER_DATASET_LICENSE.url] },
                attribution: { type: 'string' },
              },
            },
            source: {
              type: 'string',
              format: 'uri',
              description: 'The page that publishes this table for people to read.',
            },
            notes: {
              type: 'array',
              description: 'What a consumer would otherwise get wrong, in prose.',
              items: { type: 'string' },
            },
            crawlers: {
              type: 'array',
              description: 'Tokens documented by the operator that sends them.',
              items: { $ref: '#/components/schemas/Crawler' },
            },
            candidates: {
              type: 'array',
              description: 'Tokens seen in the wild that no operator page documents. Kept separate on purpose.',
              items: { $ref: '#/components/schemas/Candidate' },
            },
          },
        },
        Crawler: {
          type: 'object',
          required: ['token', 'operator', 'purpose', 'crawls', 'respectsRobots', 'docs', 'verified'],
          properties: {
            token: {
              type: 'string',
              description: 'The product token exactly as the operator publishes it, to be matched case-insensitively against a robots.txt group name.',
              examples: ['GPTBot'],
            },
            operator: { type: 'string', description: 'Who runs it.', examples: ['OpenAI'] },
            purpose: {
              type: 'string',
              enum: [...PURPOSES],
              description: 'What the operator fetches pages for. The field that changes the decision.',
            },
            crawls: {
              type: 'boolean',
              description: 'False for a robots.txt control token with no user-agent string of its own, which fetches nothing by itself.',
            },
            respectsRobots: {
              type: 'boolean',
              description: 'False when the operator documents that robots.txt may be ignored.',
            },
            classicSearch: {
              type: 'boolean',
              description: 'True for a classic search crawler, which is not an AI crawler but whose index AI answers are built from.',
            },
            docs: {
              type: 'string',
              format: 'uri',
              description: "The operator's own page that names this token.",
            },
            verified: {
              type: 'string',
              format: 'date',
              description: 'The date that page was read.',
              examples: ['2026-11-01'],
            },
            note: {
              type: 'string',
              description: 'What the operator states that a reader would otherwise get wrong.',
            },
          },
        },
        Candidate: {
          type: 'object',
          required: ['token', 'operator', 'purpose', 'whyHere'],
          properties: {
            token: { type: 'string', examples: ['Bytespider'] },
            operator: { type: 'string' },
            purpose: {
              type: 'string',
              enum: [...PURPOSES],
              description: 'Our best reading of what it is for. Not an operator statement.',
            },
            whyHere: {
              type: 'string',
              description: 'Why the row is a candidate and not a dataset entry. A link to an operator page is the correction this list wants.',
            },
          },
        },
        License: {
          type: 'object',
          required: ['id', 'url', 'attribution'],
          description: 'The licence, and the attribution it asks for.',
          properties: {
            id: { type: 'string', examples: [AI_CRAWLER_DATASET_LICENSE.id] },
            url: { type: 'string', format: 'uri', examples: [AI_CRAWLER_DATASET_LICENSE.url] },
            attribution: { type: 'string' },
          },
        },
        MarketShare: {
          type: 'object',
          required: ['market', 'blocksTrafficCrawlerPct'],
          properties: {
            market: {
              type: 'string',
              description: "The market's suffix as sampled, or `.com` for the English-language slice.",
              examples: ['.nl'],
            },
            blocksTrafficCrawlerPct: {
              type: 'number',
              description: "Share of that market's read robots.txt files blocking a crawler that would have brought visitors.",
            },
          },
        },
        CrawlerShare: {
          type: 'object',
          required: ['token', 'purpose', 'blockedPct'],
          properties: {
            token: { type: 'string', examples: ['GPTBot'] },
            purpose: { type: 'string', enum: [...PURPOSES] },
            blockedPct: {
              type: 'number',
              description: 'Share of the whole read sample blocking this token.',
            },
          },
        },
        Measurement: {
          type: 'object',
          required: [
            'version',
            'license',
            'source',
            'dataset',
            'measuredOn',
            'method',
            'findings',
            'limitations',
            'notSampled',
          ],
          properties: {
            version: {
              type: 'string',
              description: 'The measurement date as `YYYY.MM.DD`. A dated measurement never changes, so a consumer can cache on it.',
            },
            license: { $ref: '#/components/schemas/License' },
            source: {
              type: 'string',
              format: 'uri',
              description:
                'The page about these crawlers, for a human reader. It does not render the measurement itself: this endpoint is where the figures are published.',
            },
            dataset: {
              type: 'string',
              format: 'uri',
              description: 'The crawler reference table the tokens in this measurement come from.',
            },
            measuredOn: {
              type: 'string',
              format: 'date',
              description: 'The day the robots.txt files were read.',
              examples: [BLOCKING_MEASUREMENT.measuredOn],
            },
            method: {
              type: 'object',
              required: ['sample', 'markets', 'domainsRequested', 'robotsFilesRead', 'failures', 'how', 'reproducible'],
              description: 'How the sample was drawn and how much of it answered.',
              properties: {
                sample: { type: 'string' },
                markets: {
                  type: 'array',
                  description: 'The markets actually sampled. A market absent here is absent from the findings.',
                  items: { type: 'string' },
                },
                domainsRequested: { type: 'integer' },
                robotsFilesRead: {
                  type: 'integer',
                  description: 'The n every percentage is of: files read, not domains requested.',
                },
                failures: {
                  type: 'object',
                  required: ['unreachable', 'servedHtmlInsteadOfRobots'],
                  description: 'Why the rest did not answer. Published so the gap between the two numbers above is not a mystery.',
                  properties: {
                    unreachable: { type: 'integer' },
                    servedHtmlInsteadOfRobots: { type: 'integer' },
                  },
                },
                how: { type: 'string' },
                reproducible: {
                  type: 'string',
                  description: 'Why someone else can rebuild the sample and check us.',
                },
              },
            },
            findings: {
              type: 'object',
              required: [
                'ofGptbotBlockersAlsoBlockingTrafficCrawlerPct',
                'gptbotBlockers',
                'blocksAiTrafficCrawlerButAllowsGooglebotPct',
                'blockedTrainingKeptSearchOpenPct',
                'anyTrafficBringingCrawlerBlockedPct',
                'byCrawler',
                'byMarket',
              ],
              properties: {
                ofGptbotBlockersAlsoBlockingTrafficCrawlerPct: {
                  type: 'number',
                  description: 'Of the sites blocking GPTBot, the share that also block a crawler that would have brought visitors.',
                },
                gptbotBlockers: {
                  type: 'integer',
                  description: 'How many sites the figure above is a share of.',
                },
                blocksAiTrafficCrawlerButAllowsGooglebotPct: {
                  type: 'number',
                  description: 'Blocking an AI crawler that brings visitors while still allowing the classic search crawler.',
                },
                blockedTrainingKeptSearchOpenPct: {
                  type: 'number',
                  description: 'Blocked training and left search open: the distinction that was presumably intended.',
                },
                anyTrafficBringingCrawlerBlockedPct: { type: 'number' },
                byCrawler: {
                  type: 'array',
                  items: { $ref: '#/components/schemas/CrawlerShare' },
                },
                byMarket: {
                  type: 'array',
                  description: 'Highest-blocking market first.',
                  items: { $ref: '#/components/schemas/MarketShare' },
                },
              },
            },
            limitations: {
              type: 'array',
              description: 'What the figures do not say. The first is the one a reader most often gets wrong, and it is the one the CSV repeats on every row.',
              items: { type: 'string' },
            },
            notSampled: {
              type: 'object',
              required: ['markets', 'note'],
              description: 'Markets a reader might assume were included, named so the assumption cannot be made quietly.',
              properties: {
                markets: { type: 'array', items: { type: 'string' } },
                note: { type: 'string' },
              },
            },
          },
        },
      },
    },
  }
}
