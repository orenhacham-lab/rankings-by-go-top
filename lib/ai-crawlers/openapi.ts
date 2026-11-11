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
  BLOCKING_SITES_MEASURED_ON,
  BLOCKING_SITES_READ,
  BLOCKING_SITES_REQUESTED,
} from './blocking-sites'
import {
  AI_CRAWLER_DATASET_LICENSE,
  AI_CRAWLER_DATASET_VERSION,
} from './dataset'

/** Where the description, and the endpoints it describes, live. */
const SITE = 'https://www.gotopseo.com'
const DATASET_PATH = '/api/public/ai-crawlers'
const MEASUREMENT_PATH = '/api/public/ai-crawler-blocking'
const SITES_PATH = '/api/public/ai-crawler-blocking/sites'

/**
 * The purposes the dataset uses, in one place: the crawler rows, the candidate
 * rows and the measurement's per-crawler breakdown all speak this vocabulary,
 * and a second copy is how an enum drifts.
 */
const PURPOSES = ['train', 'search', 'answer', 'ads', 'preview', 'agent'] as const

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
      {
        name: 'sites',
        description:
          'The same reading published domain by domain, so a percentage can be recomputed from the rows rather than taken on trust.',
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
      [SITES_PATH]: {
        get: {
          tags: ['sites'],
          operationId: 'getAiCrawlerBlockingSites',
          summary: 'The same reading, domain by domain',
          description: [
            'Every requested domain with its Tranco rank, whether its robots.txt could be read, and — when it could — the verdict for each crawler together with the robots.txt group that governed it and the exact deciding line.',
            '',
            '`group: "*"` is a rule that lands on every bot alike; a group that names the crawler is a rule somebody wrote about that crawler. The findings count the two separately, because a blocking rate is not an error rate until the deliberate blocks are told apart from the inherited ones.',
            '',
            'The second `limitations` entry is the one to read before quoting a percentage: a large minority of hosts refused this measurement\u2019s client, and hosts that refuse an unknown automated client are plausibly the same hosts that restrict AI crawlers, so the read subset probably under-states blocking. Every unreadable domain is in `sites` with the reason, so the gap is auditable. The CSV repeats that sentence on every row.',
          ].join('\n'),
          parameters: [
            {
              name: 'tld',
              in: 'query',
              required: false,
              description:
                "A country suffix as sampled, such as `.fr`. Returns that suffix's rows with that suffix's own findings, so a publication can cite its own market rather than a seven-market average. An unknown value answers 404 with the suffixes that exist.",
              schema: { type: 'string', examples: ['.fr'] },
            },
            {
              name: 'format',
              in: 'query',
              required: false,
              description: 'Omit for JSON. `csv` returns one row per domain as RFC 4180 CSV, as a file download.',
              schema: { type: 'string', enum: ['csv'] },
            },
          ],
          responses: {
            '200': {
              description: 'The per-site measurement.',
              headers: {
                'x-license': {
                  description: 'The licence the data is served under.',
                  schema: { type: 'string', examples: [AI_CRAWLER_DATASET_LICENSE.id] },
                },
              },
              content: {
                'application/json': {
                  schema: { $ref: '#/components/schemas/SitesMeasurement' },
                },
                'text/csv': {
                  schema: {
                    type: 'string',
                    description:
                      'Header row followed by one row per domain: market, tranco_rank, domain, robots_state, then allowed, group and deciding_line for each crawler, then sampling_limitation.',
                  },
                },
              },
            },
            '404': {
              description: 'The `tld` is not one of the suffixes sampled. The body names the ones that are.',
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
        Verdict: {
          type: 'object',
          required: ['allowed', 'group', 'decidingLine'],
          description: 'One crawler\u2019s verdict on one domain, with the evidence for it.',
          properties: {
            allowed: { type: 'boolean', description: 'Whether the crawler may fetch the path measured.' },
            group: {
              type: ['string', 'null'],
              description:
                'The robots.txt group that decided it. `*` is a rule aimed at every bot alike; a group naming the crawler is a rule written about it. Null when no group governed the path.',
              examples: ['GPTBot'],
            },
            decidingLine: {
              type: 'string',
              description: 'The line of the file that decided the verdict, verbatim, so the verdict can be checked.',
              examples: ['Disallow: /'],
            },
          },
        },
        Site: {
          type: 'object',
          required: ['market', 'trancoRank', 'domain', 'state', 'verdicts'],
          properties: {
            market: { type: 'string', description: 'The suffix the domain was sampled under.', examples: ['.fr'] },
            trancoRank: { type: 'integer', description: 'Its rank in the Tranco list the sample was drawn from.' },
            domain: { type: 'string', examples: ['lemonde.fr'] },
            state: {
              type: 'string',
              description:
                '`read` when the file was read. Otherwise why it was not: an `http_NNN` status, `html_not_robots` for a page served in place of a robots.txt, or `unreachable`.',
              examples: ['read'],
            },
            verdicts: {
              type: ['object', 'null'],
              description: 'One verdict per crawler token, or null when the file could not be read.',
              additionalProperties: { $ref: '#/components/schemas/Verdict' },
            },
          },
        },
        SitesMeasurement: {
          type: 'object',
          required: ['version', 'license', 'source', 'parser', 'measuredOn', 'method', 'limitations', 'findings', 'sites'],
          properties: {
            version: { type: 'string', description: 'The reading\u2019s own version. A dated reading never changes.' },
            license: { $ref: '#/components/schemas/License' },
            source: { type: 'string', format: 'uri', description: 'The page that states these figures to a reader.' },
            parser: {
              type: 'string',
              format: 'uri',
              description: 'The open-source parser that produced every verdict, so the matching can be audited too.',
            },
            measuredOn: {
              type: 'string',
              format: 'date',
              examples: [BLOCKING_SITES_MEASURED_ON],
            },
            method: {
              type: 'object',
              required: ['sample', 'domainsRequested', 'robotsRead', 'path', 'matching', 'outcomes'],
              properties: {
                sample: {
                  type: 'string',
                  description: 'How the domains were chosen, including the list identifier, so the sample can be rebuilt.',
                },
                domainsRequested: { type: 'integer', examples: [BLOCKING_SITES_REQUESTED] },
                robotsRead: {
                  type: 'integer',
                  description: 'The n every percentage is of: files read, not domains requested.',
                  examples: [BLOCKING_SITES_READ],
                },
                path: { type: 'string', description: 'The path the verdicts are about.', examples: ['/'] },
                matching: { type: 'string' },
                outcomes: {
                  type: 'object',
                  description: 'How many domains ended in each state. These sum to domainsRequested.',
                  additionalProperties: { type: 'integer' },
                },
              },
            },
            limitations: {
              type: 'array',
              description:
                'What the figures do not say. The second entry states the read rate and the direction of its bias, and is the one the CSV repeats on every row.',
              items: { type: 'string' },
            },
            findings: {
              type: 'object',
              description: 'Every published figure, each recomputable from the rows below.',
              required: ['blocksTrafficBringingCrawler', 'gptbotBlockers', 'byCrawler', 'byMarket'],
              properties: {
                blocksTrafficBringingCrawler: { $ref: '#/components/schemas/CountAndPct' },
                gptbotBlockers: {
                  type: 'object',
                  description: 'How many block GPTBot, and how many of those also block a crawler that brings visitors.',
                  properties: {
                    count: { type: 'integer' },
                    alsoBlockTrafficCrawler: { type: 'integer' },
                    alsoBlockTrafficCrawlerPct: { type: 'number' },
                  },
                },
                blockedTrainingKeptSearchOpen: { $ref: '#/components/schemas/CountAndPct' },
                blocksAiTrafficCrawlerButAllowsGooglebot: { $ref: '#/components/schemas/CountAndPct' },
                byCrawler: {
                  type: 'array',
                  description: 'Per crawler: how many block it, and how many of those wrote a rule naming it.',
                  items: { $ref: '#/components/schemas/CrawlerIntent' },
                },
                byMarket: {
                  type: 'array',
                  description: "Per suffix, with that suffix's own n.",
                  items: { type: 'object' },
                },
              },
            },
            sites: {
              type: 'array',
              description: 'Every requested domain, readable or not. This is what makes the percentages checkable.',
              items: { $ref: '#/components/schemas/Site' },
            },
          },
        },
        CountAndPct: {
          type: 'object',
          required: ['count', 'pct'],
          properties: {
            count: { type: 'integer' },
            pct: { type: 'number', description: 'As a share of the files read, not of the domains requested.' },
          },
        },
        CrawlerIntent: {
          type: 'object',
          required: ['token', 'blocked', 'deliberate', 'inherited'],
          description: 'Deliberate and inherited always sum to blocked: every block is one or the other.',
          properties: {
            token: { type: 'string', examples: ['OAI-SearchBot'] },
            blockedPct: { type: 'number', description: 'Share of the read sample blocking this token.' },
            blocked: { type: 'integer' },
            deliberate: { type: 'integer', description: 'Blocks whose governing group names this crawler.' },
            deliberatePct: { type: 'number' },
            inherited: { type: 'integer', description: 'Blocks that came from the blanket `*` group.' },
            inheritedPct: { type: 'number' },
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
