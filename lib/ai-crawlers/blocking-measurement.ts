/**
 * The 7 November 2026 robots.txt measurement, as data.
 *
 * WHY IT IS HERE AND NOT IN A BLOG POST. Every editorial approach we have made
 * about this finding ends with "I can send you the detail per market". That
 * sentence is friction: it asks a journalist to email a stranger and wait. A
 * citable URL removes it, and it is the same bet that already paid off for
 * `/api/public/ai-crawlers` — the one inbound do-follow link we earned in
 * German pointed at the dataset, not at the product page. Data gets cited;
 * marketing does not.
 *
 * WHY THE LIMITATION IS A FIELD AND NOT A FOOTNOTE. These are large,
 * high-ranked sites, not small businesses, and the number means something
 * different if a reader forgets that. Putting the caveat inside the payload
 * means it travels with the figure into whatever spreadsheet or article copies
 * it: you cannot take the 66.5% out of this file without also taking the
 * sentence that bounds it. `notSampled` exists for the same reason — Brazil and
 * Portugal were asked about repeatedly, and the honest answer is a field, not
 * a silence that invites someone to read the .com figure as theirs.
 *
 * Numbers come from `growth/offsite/ai-crawler-blocking-measurement-07-11.md`
 * and are not recomputed here. If that file and this constant ever disagree,
 * the file is the record of what was measured and this one is wrong.
 */

export const BLOCKING_MEASUREMENT_VERSION = '2026.11.07'

export type MarketShare = {
  /** The market's suffix as sampled, or `.com` for the English-language slice. */
  market: string
  /** Share of that market's read robots.txt files blocking a traffic-bringing AI crawler. */
  blocksTrafficCrawlerPct: number
}

export type CrawlerShare = {
  token: string
  /** What the crawler is for, in the dataset's own vocabulary. */
  purpose: string
  blockedPct: number
}

/** Per-market share blocking a crawler that would have brought visitors. */
export const BLOCKING_BY_MARKET: readonly MarketShare[] = [
  { market: '.nl', blocksTrafficCrawlerPct: 31.5 },
  { market: '.com', blocksTrafficCrawlerPct: 29.7 },
  { market: '.fr', blocksTrafficCrawlerPct: 25.8 },
  { market: '.it', blocksTrafficCrawlerPct: 16.2 },
  { market: '.es', blocksTrafficCrawlerPct: 15.0 },
  { market: '.jp', blocksTrafficCrawlerPct: 13.7 },
  { market: '.de', blocksTrafficCrawlerPct: 12.3 },
] as const

/** Share of the whole read sample blocking each token. */
export const BLOCKING_BY_CRAWLER: readonly CrawlerShare[] = [
  { token: 'GPTBot', purpose: 'train', blockedPct: 30.5 },
  { token: 'ChatGPT-User', purpose: 'answer', blockedPct: 20.3 },
  { token: 'OAI-SearchBot', purpose: 'search', blockedPct: 16.5 },
] as const

export const BLOCKING_MEASUREMENT = {
  measuredOn: '2026-11-07',
  method: {
    sample: '100 highest-ranked domains per market from the Tranco top-1M list',
    markets: ['.com', '.de', '.fr', '.es', '.it', '.jp', '.nl'],
    domainsRequested: 700,
    robotsFilesRead: 528,
    failures: { unreachable: 137, servedHtmlInsteadOfRobots: 35 },
    how: 'robots.txt fetched directly and parsed by the standard matching rules, against the token list in our public AI-crawler dataset',
    reproducible:
      'Tranco is the standard academic ranking list, so the sample can be rebuilt by anyone who wants to check us. Our own site was not used to run the checks, so the measurement does not depend on our API rate limit.',
  },
  findings: {
    /** Of the 161 sites blocking GPTBot, the share that also block a traffic-bringing crawler. */
    ofGptbotBlockersAlsoBlockingTrafficCrawlerPct: 66.5,
    gptbotBlockers: 161,
    /** Blocking an AI crawler that brings visitors while still allowing Googlebot. */
    blocksAiTrafficCrawlerButAllowsGooglebotPct: 17.2,
    /** Blocked training and left search open — the distinction that was intended. */
    blockedTrainingKeptSearchOpenPct: 10.2,
    anyTrafficBringingCrawlerBlockedPct: 20.5,
    byCrawler: BLOCKING_BY_CRAWLER,
    byMarket: BLOCKING_BY_MARKET,
  },
  limitations: [
    'These are large, high-ranked sites, not small businesses. Among small businesses the picture is probably different — likely fewer deliberate blocks and more neglect. Do not present these figures as a picture of small businesses.',
    'n = 528 robots.txt files actually read, out of 700 domains requested. Percentages are of the files read, not of the domains requested.',
    'A robots.txt verdict states the request a site is making, not an outcome: some operators document that their agent may ignore robots.txt.',
  ],
  notSampled: {
    markets: ['Brazil (.com.br)', 'Portugal (.pt)'],
    note: 'Neither was in the sample. The .com figure is the global English-language slice and must not be read as a figure for either country.',
    /** Brazil was sampled later, as .br, in the follow-up below. Portugal still has not been. */
    partlyAnsweredBy: '2026.11.17',
  },
} as const

/**
 * The 17 November 2026 follow-up: five markets the first sample never touched.
 *
 * WHY A SECOND CONSTANT AND NOT AN EDIT. The first measurement is a dated
 * reading of one sample. Appending rows to it would quietly change what a
 * published figure means, and anyone who cited the 07.11 numbers would find
 * them moved under their feet. Two samples, each with its own date, its own n
 * and its own method block, is the only shape that lets both be cited.
 *
 * WHY THESE FIVE MARKETS. `notSampled` above records that Brazil and Portugal
 * were asked about repeatedly; .br answers half of that. The other four are
 * markets where we already run a locale (.pl, .kr) or are weighing one
 * (.se, .gr), and the question "is the problem this page describes actually
 * common here" is one the locale decision should be able to look up.
 *
 * THE RESULT IS NOT A CONFIRMATION, and that is why it is published. Four of
 * the five sit below the lowest market of the first seven (Germany, 12.3%);
 * Korea, at 14.8%, is the one exception and still below five of them. The
 * headline finding survives in direction and shrinks in size: 42.3% of GPTBot
 * blockers also shut out a traffic-bringing crawler here, against 66.5% there.
 *
 * ONE METHOD DIFFERENCE, STATED RATHER THAN SMOOTHED: a site answering 404 on
 * /robots.txt is counted as not read, not as "no robots.txt, therefore open".
 * That shrinks the denominator and so pushes every percentage here UP. The
 * figures are low anyway.
 *
 * Numbers come from `growth/offsite/ai-crawler-blocking-measurement-17-11.md`
 * and are not recomputed here.
 */
export const BLOCKING_FOLLOW_UP_VERSION = '2026.11.17'

/** Per-market share blocking a crawler that would have brought visitors. */
export const BLOCKING_FOLLOW_UP_BY_MARKET: readonly MarketShare[] = [
  { market: '.kr', blocksTrafficCrawlerPct: 14.8 },
  { market: '.se', blocksTrafficCrawlerPct: 11.3 },
  { market: '.pl', blocksTrafficCrawlerPct: 9.1 },
  { market: '.br', blocksTrafficCrawlerPct: 6.1 },
  { market: '.gr', blocksTrafficCrawlerPct: 4.1 },
] as const

/** Share of the whole read sample blocking each token. */
export const BLOCKING_FOLLOW_UP_BY_CRAWLER: readonly CrawlerShare[] = [
  { token: 'CCBot', purpose: 'train', blockedPct: 20.9 },
  { token: 'GPTBot', purpose: 'train', blockedPct: 20.3 },
  { token: 'Bytespider', purpose: 'train', blockedPct: 20.3 },
  { token: 'ClaudeBot', purpose: 'train', blockedPct: 17.1 },
  { token: 'ChatGPT-User', purpose: 'answer', blockedPct: 8.6 },
  { token: 'OAI-SearchBot', purpose: 'search', blockedPct: 6.6 },
] as const

export const BLOCKING_FOLLOW_UP = {
  measuredOn: '2026-11-17',
  /** The sample this one was built to sit beside, not to replace. */
  extends: BLOCKING_MEASUREMENT_VERSION,
  method: {
    sample: '100 highest-ranked domains per market from the Tranco top-1M list, list V354N',
    markets: ['.br', '.pl', '.kr', '.se', '.gr'],
    domainsRequested: 500,
    robotsFilesRead: 350,
    failures: { unreachable: 61, httpError: 78, servedHtmlInsteadOfRobots: 11 },
    how: 'robots.txt fetched directly and parsed by the standard matching rules, against the token list in our public AI-crawler dataset',
    reproducible:
      'The same Tranco list and the same parser as the first sample, so the two can be compared row for row and either can be rebuilt by anyone who wants to check us.',
  },
  findings: {
    /** Of the 71 sites blocking GPTBot, the share that also block a traffic-bringing crawler. */
    ofGptbotBlockersAlsoBlockingTrafficCrawlerPct: 42.3,
    gptbotBlockers: 71,
    blocksAiTrafficCrawlerButAllowsGooglebotPct: 8.3,
    blockedTrainingKeptSearchOpenPct: 11.7,
    anyTrafficBringingCrawlerBlockedPct: 8.9,
    /** Of the sites blocking OAI-SearchBot, the share whose block came from a `*` group they never aimed at it. */
    ofOaiSearchbotBlockersWhoNeverChoseItPct: 30.4,
    oaiSearchbotBlockers: 23,
    byCrawler: BLOCKING_FOLLOW_UP_BY_CRAWLER,
    byMarket: BLOCKING_FOLLOW_UP_BY_MARKET,
  },
  limitations: [
    'These are large, high-ranked sites, not small businesses. Among small businesses the picture is probably different — likely fewer deliberate blocks and more neglect. Do not present these figures as a picture of small businesses.',
    'n = 350 robots.txt files actually read, out of 500 domains requested. Percentages are of the files read, not of the domains requested.',
    'A site answering 404 on /robots.txt is counted as not read rather than as having no robots.txt. That is the conservative count: it shrinks the denominator and so raises every percentage here.',
    'Korea contributed only 54 read files, the smallest of the five, so the .kr figure moves more than the others.',
    'A robots.txt verdict states the request a site is making, not an outcome: some operators document that their agent may ignore robots.txt.',
  ],
  notSampled: {
    markets: ['Portugal (.pt)'],
    note: 'Still not sampled. The .br figure is Brazil and must not be read as a figure for Portugal.',
  },
} as const
