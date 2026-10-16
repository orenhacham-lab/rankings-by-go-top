/**
 * The automatic send of the US outbound channel.
 *
 * This is the one mechanism in the product that writes to people who never
 * asked to hear from us, now running unattended. So the guards below are not
 * about whether a message goes out; they are about every reason one must not.
 * In order of what they would cost if they broke: a message to someone who
 * asked us to stop, a second message to a business that replied, a claim about
 * a stranger's site that is not true today, a message whose unsubscribe link is
 * missing, a promise about Shopify or WordPress made to neither, and a day that
 * sends far more than the ramp allows.
 *
 * One guard deserves naming here because it is invisible from either side
 * alone: our own footer contains the word "unsubscribe", which the reply
 * classifier reads as a refusal. M6 sends our composed footer through the real
 * classifier and shows it is stripped, so an interested reply quoting our
 * message is not silently turned into an opt-out.
 *
 * Every guard that could silently pass runs twice: against the real module, and
 * against a deliberately broken copy that must fail. A guard that cannot fail
 * tests nothing.
 *
 * Run: npx tsx lib/outreach/__qa__/outreach-send.qa.ts
 */
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { FakeAdmin } from '@/lib/__qa__/_fake-admin'
import { withMutant } from '@/lib/reminders/__qa__/_mutant'
import { SUPPRESSION_TABLE, hashEmail } from '@/lib/email-suppression'
import { isOptOut } from '../inbound'
import { PROSPECTS_TABLE } from '../prospects'
import {
  ARTICLE_SITEMAPS, SITEMAP_INDEXES, articleSitemapsIn, countH1, countImagesWithoutAlt,
  gatherEvidence, metaDescriptionLength, monthAndYear, pickFinding, readArticles, readPlatform,
  type FetchedPage, type SiteEvidence,
} from '../finding'
import {
  assertSendable, composeFirstMessage, composeSecondMessage, FOOTER_OPENING, footer,
  greeting, POSTAL_ADDRESS, PRIVACY_URL, unsubscribeUrl,
} from '../message'
import {
  DAILY_CAP, RAMP, dailyQuota, localTime, nextMessageFor, sendWindow, startOfLocalDayUtc,
  windowEndMinute, WINDOW_OPEN_HOUR,
} from '../schedule'
import { failureCode, isPermanentRejection, readSmtpConfig } from '../smtp'
import { NO_FINDING_NOTE, readDayTally, sendNextProspect, type SenderDeps } from '../send'
import { runIsolatedProspectSend, SENDING_FLAG } from '../sender-isolated'

let pass = 0
let fail = 0
function check(name: string, ok: boolean) {
  if (ok) { pass++; console.log(`  ok   ${name}`) } else { fail++; console.log(`  FAIL ${name}`) }
}

/* eslint-disable @typescript-eslint/no-explicit-any */
const asAdmin = (f: FakeAdmin) => f as any
const ROOT = join(__dirname, '..', '..', '..')
const read = (rel: string) => readFileSync(join(ROOT, rel), 'utf8')
const stripComments = (src: string) =>
  src.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '')

/** A Friday, 09:30 in New York (13:30 UTC, daylight saving in force). */
const NOW = new Date('2026-10-16T13:30:00Z')
const DAY_MS = 24 * 60 * 60 * 1000
const daysAgo = (n: number) => new Date(NOW.getTime() - n * DAY_MS).toISOString()

const TOKEN = 'a'.repeat(64)

const evidence = (over: Partial<SiteEvidence> = {}): SiteEvidence => ({
  host: 'store.example',
  platform: { platform: 'shopify' },
  images: 40,
  imagesWithoutAlt: 0,
  h1Count: 1,
  metaDescriptionLength: 140,
  articleCount: 30,
  newestArticleAt: daysAgo(3),
  ...over,
})

const prospect = (over: Record<string, unknown> = {}) => ({
  id: 'p-1',
  email: 'sales@store.example',
  email_hash: 'f'.repeat(64),
  unsub_token: TOKEN,
  company: 'Store Example LLC',
  contact_name: null,
  site_host: 'store.example',
  platform: 'shopify',
  country: 'US',
  postal_address: '1 Main St, Nashville, TN 37201',
  status: 'new',
  finding: null,
  finding_checked: null,
  first_sent_at: null,
  second_sent_at: null,
  replied_at: null,
  redacted_at: null,
  note: null,
  created_at: daysAgo(10),
  updated_at: daysAgo(10),
  ...over,
})

const HOME = `<!doctype html><html><head>
<meta name="description" content="${'x'.repeat(140)}">
<script src="https://cdn.shopify.com/s/files/theme.js"></script>
</head><body><h1>Store</h1>${'<img src="a.png" alt="a">'.repeat(40)}</body></html>`

const WP_HOME = `<!doctype html><html><head>
<meta name="description" content="${'x'.repeat(140)}">
<link rel="stylesheet" href="/wp-content/themes/crown/style.css">
</head><body><h1>Crown</h1>${'<img src="a.png" alt="a">'.repeat(30)}</body></html>`

/** A fetcher over a fixed map of URLs. Anything absent is a 404. */
const pages = (map: Record<string, string | number>) =>
  async (url: string): Promise<FetchedPage> => {
    const hit = map[url]
    if (typeof hit === 'number') return { url, status: hit, body: '' }
    if (typeof hit === 'string') return { url, status: 200, body: hit }
    return { url, status: 404, body: '' }
  }

const ARTICLES_XML = (n: number, lastmod: string) =>
  `<urlset>${Array.from({ length: n }, (_, i) =>
    `<url><loc>https://store.example/blogs/news/a${i}</loc><lastmod>${lastmod}</lastmod></url>`).join('')}</urlset>`

/** A Shopify home page with alt text, one H1 and a healthy blog: nothing to say. */
const cleanSite = (over: Record<string, string | number> = {}) => pages({
  'https://store.example/': HOME,
  'https://store.example/sitemap_articles_1.xml': ARTICLES_XML(30, daysAgo(3)),
  ...over,
})
/** The same site with a thin blog, which is a finding. The default for a send. */
const liveSite = (over: Record<string, string | number> = {}) =>
  cleanSite({ 'https://store.example/sitemap_articles_1.xml': ARTICLES_XML(1, daysAgo(3)), ...over })

interface Sent { to: string; subject: string; text: string }

const recorder = (outcome: 'sent' | 'rejected' | 'failed' = 'sent') => {
  const sent: Sent[] = []
  const send: SenderDeps['send'] = async (m) => {
    sent.push({ to: m.to, subject: m.subject, text: m.text })
    if (outcome === 'sent') return { status: 'sent', messageId: '<id@x>' }
    return { status: outcome, code: 'smtp_550' }
  }
  return { sent, send }
}

const deps = (over: Partial<SenderDeps> = {}): SenderDeps => ({
  now: NOW,
  fetchPage: liveSite(),
  send: async () => ({ status: 'sent', messageId: null }),
  ...over,
})

const table = (rows: Record<string, unknown>[], suppressions: Record<string, unknown>[] = []) =>
  new FakeAdmin({ [PROSPECTS_TABLE]: rows, [SUPPRESSION_TABLE]: suppressions })
const rowsOf = (f: FakeAdmin) => f.tables[PROSPECTS_TABLE] as Record<string, unknown>[]

/* ------------------------------------------------------------ source guards */

/** The sender is a passenger on the quarter-hour cron, not a schedule of its own. */
const ridesQuarterHour = (src: string) => /await\s+runIsolatedProspectSend\(\)/.test(stripComments(src))
/** Both switches are read before anything is constructed. */
const gatedOffByDefault = (src: string) => {
  const body = stripComments(src)
  const flag = body.indexOf(`env[SENDING_FLAG] !== 'true'`)
  const prod = body.indexOf(`env.VERCEL_ENV !== 'production'`)
  const work = body.indexOf('await run(')
  return flag > 0 && prod > flag && work > prod
}

async function main() {
  console.log('\noutreach: the automatic send\n')

  /* ------------------------------------------------- the finding is the claim */

  check('F1: a site with a current blog, alt text and one H1 produces no finding, so no message',
    pickFinding(evidence(), NOW) === null)
  check('F2: no articles at all outranks every other finding',
    pickFinding(evidence({ articleCount: 0, imagesWithoutAlt: 30 }), NOW)?.kind === 'no_articles')
  check('F3: a stale blog is named by month and year, not by a number of days',
    pickFinding(evidence({ newestArticleAt: '2021-04-29T16:12:59Z' }), NOW)?.clause
      === 'the newest article in your sitemap is from April 2021')
  check('F4: one article reads as "a single article", not "1 articles"',
    pickFinding(evidence({ articleCount: 1, newestArticleAt: daysAgo(3) }), NOW)?.clause
      === 'your sitemap lists a single article')
  check('F4b: four articles are named by their count',
    pickFinding(evidence({ articleCount: 4, newestArticleAt: daysAgo(3) }), NOW)?.clause
      === 'your sitemap lists only 4 articles')
  check('F5: missing alt text needs both a floor and a share — four of forty is not a finding',
    pickFinding(evidence({ images: 40, imagesWithoutAlt: 4 }), NOW) === null)
  check('F5b: six of forty is below the share, and still not a finding',
    pickFinding(evidence({ images: 40, imagesWithoutAlt: 6 }), NOW) === null)
  check('F5c: eighty of a hundred and thirty-eight is',
    pickFinding(evidence({ images: 138, imagesWithoutAlt: 80 }), NOW)?.clause
      === '80 of the 138 images on your home page have no alt text')
  check('F6: no H1 and two H1s are different sentences, and one H1 is neither',
    pickFinding(evidence({ h1Count: 0 }), NOW)?.clause === 'your home page carries no H1 heading'
    && pickFinding(evidence({ h1Count: 2 }), NOW)?.clause === 'your home page carries 2 H1 headings instead of one'
    && pickFinding(evidence({ h1Count: 1 }), NOW) === null)

  // The whole point of the null/zero distinction.
  check('F7: a measurement we could not take never becomes a claim',
    pickFinding(evidence({ articleCount: null, newestArticleAt: null }), NOW) === null
    && pickFinding(evidence({ images: null, imagesWithoutAlt: null }), NOW) === null
    && pickFinding(evidence({ h1Count: null, metaDescriptionLength: null }), NOW) === null)
  check('F7b: a missing meta description is a claim; an unmeasurable one is not',
    pickFinding(evidence({ metaDescriptionLength: 0 }), NOW)?.kind === 'meta_description'
    && pickFinding(evidence({ metaDescriptionLength: null }), NOW) === null)

  check('F8: an empty alt is a decorative image and is not counted against the page',
    countImagesWithoutAlt('<img src="a" alt=""><img src="b" alt=" "><img src="c">').withoutAlt === 3
    && countImagesWithoutAlt('<img src="a" alt="real">').withoutAlt === 0)
  check('F8b: markup inside a script tag is not page content',
    countImagesWithoutAlt('<script>var t = "<img src=x>"</script><img src="a">').images === 1
    && countH1('<script>"<h1>"</script><h1>Real</h1>') === 1)
  check('F8c: a description tag with no content reads as length zero, not as absent',
    metaDescriptionLength('<meta name="description" content="">') === 0
    && metaDescriptionLength('<html>') === 0
    && metaDescriptionLength('<meta name="description" content="abc">') === 3)

  check('F9: a hosted builder is refused even when it carries a Shopify marker',
    readPlatform('<div>static.parastorage.com cdn.shopify.com</div>').platform === null)
  check('F9b: markers for both platforms at once is a site we have not understood',
    readPlatform('<a href="/wp-content/x">cdn.shopify.com</a>').platform === null)
  check('F9c: each platform on its own is recognised',
    readPlatform('<script src="//cdn.shopify.com/a.js">').platform === 'shopify'
    && readPlatform('<link href="/wp-content/themes/x.css">').platform === 'wordpress')

  const allMissing = await readArticles('https://store.example', 'shopify', pages({}))
  check('F10: nothing answering at all means we learned nothing, which is NOT zero articles',
    allMissing.count === null)
  const allBroken = await readArticles('https://store.example', 'shopify',
    async () => { throw new Error('network') })
  check('F10b: every path failing is the same',
    allBroken.count === null)
  check('F10c: both platforms have fallback article paths, and there are indexes to try first',
    ARTICLE_SITEMAPS.shopify.length > 0 && ARTICLE_SITEMAPS.wordpress.length > 0
    && SITEMAP_INDEXES.length > 0)

  /*
   * THE REGRESSION. This is the Crown Laboratories case of 16 Oct 2026, which
   * went out as a false claim: a WordPress site with 141 articles under a
   * custom post type, whose `post` sitemaps answer 200 with nothing in them.
   */
  const CROWN = {
    'https://crown.example/': WP_HOME,
    'https://crown.example/wp-sitemap.xml':
      '<sitemapindex><sitemap><loc>https://crown.example/page-sitemap.xml</loc></sitemap>'
      + '<sitemap><loc>https://crown.example/news-sitemap.xml</loc></sitemap></sitemapindex>',
    'https://crown.example/news-sitemap.xml': ARTICLES_XML(141, '2025-10-07T12:56:37+00:00'),
    // Both platform defaults answer, and both are empty, exactly as they did.
    'https://crown.example/wp-sitemap-posts-post-1.xml': '<urlset></urlset>',
    'https://crown.example/post-sitemap.xml': '<urlset></urlset>',
  }
  const crown = await readArticles('https://crown.example', 'wordpress', pages(CROWN))
  check('F12: a site whose articles live under a custom post type is counted from its OWN index',
    crown.count === 141)
  const crownEvidence = await gatherEvidence('crown.example', pages(CROWN))
  check('F12b: and the finding for it is NOT "no articles" — the claim that actually went out',
    pickFinding(crownEvidence, NOW)?.kind !== 'no_articles')
  check('F12c: nor any blog claim at all, since its newest article is recent and it has 141',
    !['no_articles', 'thin_blog'].includes(pickFinding(crownEvidence, NOW)?.kind ?? ''))

  const indexNoArticles = await readArticles('https://plain.example', 'wordpress', pages({
    'https://plain.example/sitemap.xml':
      '<sitemapindex><sitemap><loc>https://plain.example/page-sitemap.xml</loc></sitemap>'
      + '<sitemap><loc>https://plain.example/product-sitemap.xml</loc></sitemap></sitemapindex>',
  }))
  check('F13: an index that names no article sitemap at all IS evidence of none',
    indexNoArticles.count === 0)

  const namedButSilent = await readArticles('https://shy.example', 'wordpress', pages({
    'https://shy.example/sitemap.xml':
      '<sitemapindex><sitemap><loc>https://shy.example/news-sitemap.xml</loc></sitemap></sitemapindex>',
    'https://shy.example/news-sitemap.xml': 500,
  }))
  check('F13b: an article sitemap the index names but that will not answer leaves no measurement',
    namedButSilent.count === null)

  const defaultsOnly = await readArticles('https://old.example', 'shopify', pages({
    'https://old.example/sitemap_articles_1.xml': ARTICLES_XML(12, daysAgo(2)),
  }))
  check('F14: with no readable index, a default path that HOLDS articles still proves they exist',
    defaultsOnly.count === 12)

  const defaultsEmpty = await readArticles('https://old2.example', 'wordpress', pages({
    'https://old2.example/wp-sitemap-posts-post-1.xml': '<urlset></urlset>',
    'https://old2.example/post-sitemap.xml': '<urlset></urlset>',
  }))
  check('F14b: but an EMPTY default path proves nothing — this is the whole bug',
    defaultsEmpty.count === null)

  check('F15: an index child is judged by its path, and pages, products and taxonomies are not articles',
    articleSitemapsIn(
      '<sitemapindex>'
      + '<sitemap><loc>https://x.example/wp-sitemap-posts-post-1.xml</loc></sitemap>'
      + '<sitemap><loc>https://x.example/wp-sitemap-posts-page-1.xml</loc></sitemap>'
      + '<sitemap><loc>https://x.example/page-sitemap.xml</loc></sitemap>'
      + '<sitemap><loc>https://x.example/product-sitemap.xml</loc></sitemap>'
      + '<sitemap><loc>https://x.example/wp-sitemap-taxonomies-category-1.xml</loc></sitemap>'
      + '<sitemap><loc>https://x.example/author-sitemap.xml</loc></sitemap>'
      + '<sitemap><loc>https://x.example/news-sitemap.xml</loc></sitemap>'
      + '<sitemap><loc>https://x.example/sitemap_blogs_1.xml</loc></sitemap>'
      + '</sitemapindex>',
    ).join(' ') === 'https://x.example/wp-sitemap-posts-post-1.xml https://x.example/news-sitemap.xml https://x.example/sitemap_blogs_1.xml')
  check('F15b: the HOST never decides — a site at news.example is not all articles',
    articleSitemapsIn('<sitemapindex><sitemap><loc>https://news.example/product-sitemap.xml</loc></sitemap></sitemapindex>').length === 0)

  // The wording is the durable half of the fix: a claim may not be broader than
  // what it was read from.
  check('F16: every blog claim names the sitemap, not the site',
    pickFinding(evidence({ articleCount: 0 }), NOW)?.clause.startsWith('your sitemap lists no articles') === true
    && pickFinding(evidence({ newestArticleAt: '2021-04-29T00:00:00Z' }), NOW)?.clause
      === 'the newest article in your sitemap is from April 2021'
    && pickFinding(evidence({ articleCount: 1, newestArticleAt: daysAgo(3) }), NOW)?.clause
      === 'your sitemap lists a single article')

  const unreachable = await gatherEvidence('store.example', async () => { throw new Error('nope') })
  check('F11: a home page we cannot fetch yields no platform and no counts',
    unreachable.platform.platform === null && unreachable.images === null)
  const notFound = await gatherEvidence('store.example', pages({ 'https://store.example/': 500 }))
  check('F11b: a home page that answers 500 is the same',
    notFound.platform.platform === null)
  check('F11c: monthAndYear refuses a date it cannot parse',
    monthAndYear('not a date') === null && monthAndYear('2021-04-29T00:00:00Z') === 'April 2021')

  /* --------------------------------------------------- what the message carries */

  const first = composeFirstMessage({
    company: 'Store Example LLC', siteHost: 'store.example', contactName: null,
    unsubToken: TOKEN, findingClause: 'your sitemap lists a single article',
  }, NOW)

  check('M1: the message carries the postal address, the per-recipient link and the privacy link',
    first.text.includes(POSTAL_ADDRESS)
    && first.text.includes(unsubscribeUrl(TOKEN))
    && first.text.includes(PRIVACY_URL))
  check('M1b: and it says it is an advertisement, at the start of a line',
    new RegExp(`^${FOOTER_OPENING}`, 'm').test(first.text))
  check('M1c: the check date is the day the finding was measured',
    first.text.includes('October 16, 2026'))
  check('M2: with no contact name the greeting is "Hello," and never a guess',
    greeting(null) === 'Hello,' && greeting('  ') === 'Hello,'
    && greeting('Dana Levi') === 'Hi Dana,'
    && greeting('sales@store.example') === 'Hello,'
    && greeting('x'.repeat(60)) === 'Hello,')
  check('M3: a body without its unsubscribe link is refused',
    assertSendable({ subject: 's', text: first.text.replace(unsubscribeUrl(TOKEN), '') }, TOKEN).sendable === false)
  check('M3b: so is one whose footer no longer opens with the words the classifier knows',
    assertSendable({ subject: 's', text: first.text.replace(FOOTER_OPENING, 'A message from') }, TOKEN).sendable === false)
  check('M3c: and one missing the postal address',
    assertSendable({ subject: 's', text: first.text.replace(POSTAL_ADDRESS, '') }, TOKEN).sendable === false)
  check('M4: a placeholder that survived composition is refused',
    assertSendable({ subject: 's', text: `${first.text}\nreport for [domain]` }, TOKEN).sendable === false)
  check('M4b: the real message passes the gate',
    assertSendable(first, TOKEN).sendable === true)

  const second = composeSecondMessage({
    company: 'Store Example LLC', siteHost: 'store.example', contactName: null, unsubToken: TOKEN,
  }, NOW)
  check('M5: the second message makes no new claim about the site',
    !second.text.includes('I noticed') && second.text.includes('following up once')
    && assertSendable(second, TOKEN).sendable === true)
  check('M5b: both subjects name the company',
    first.subject === "a question about Store Example LLC's organic traffic"
    && second.subject === "re: Store Example LLC's organic traffic")

  // The cross-module guard. Our footer says "unsubscribe"; the classifier reads
  // that word as a refusal. If it stops recognising our footer, every quoted
  // reply becomes an opt-out.
  const quoted = `Yes please, send the report.\n\nOn Oct 16, Oren wrote:\n${footer(TOKEN)}`
  check('M6: an interested reply that quotes our own footer is NOT read as an opt-out',
    isOptOut(quoted, 're: organic traffic') === false)
  check('M6b: and the unquoted form, which Outlook sends, is also stripped',
    isOptOut(`Interested.\n\n${footer(TOKEN)}`, 're: organic traffic') === false)
  check('M6c: while a real refusal still is one',
    isOptOut(`no thanks\n\n${footer(TOKEN)}`, 're: organic traffic') === true)

  /* -------------------------------------------------------- when, and how much */

  check('S1: the ramp is five, ten, twenty, then the cap, by week of the channel’s life',
    dailyQuota(NOW, new Date(NOW.getTime() - 1 * DAY_MS)) === 5
    && dailyQuota(NOW, new Date(NOW.getTime() - 8 * DAY_MS)) === 10
    && dailyQuota(NOW, new Date(NOW.getTime() - 16 * DAY_MS)) === 20
    && dailyQuota(NOW, new Date(NOW.getTime() - 60 * DAY_MS)) === DAILY_CAP
    && RAMP[RAMP.length - 1] === DAILY_CAP)
  check('S1b: before the first message there is no ramp, and the quota is the first week’s',
    dailyQuota(NOW, null) === RAMP[0])

  // The approved plan is 09:00-11:00 for five a day. At five, the derived
  // window must BE that, or the plan and the code have diverged.
  check('S2: at a quota of five the window is exactly 09:00 to 11:00, the approved plan',
    WINDOW_OPEN_HOUR === 9 && windowEndMinute(5) === 11 * 60)
  check('S2b: a larger quota widens the window rather than breaking the spacing',
    windowEndMinute(10) > windowEndMinute(5) && windowEndMinute(DAILY_CAP) <= 17 * 60)

  check('S3: the weekend is refused outright',
    sendWindow(new Date('2026-10-17T14:00:00Z'), 5).open === false
    && sendWindow(new Date('2026-10-18T14:00:00Z'), 5).open === false)
  check('S3b: a weekday inside the window is open, and 08:45 and 11:15 local are not',
    sendWindow(NOW, 5).open === true
    && sendWindow(new Date('2026-10-16T12:45:00Z'), 5).open === false
    && sendWindow(new Date('2026-10-16T15:15:00Z'), 5).open === false)

  // Daylight saving moves the window by itself, in both countries.
  check('S4: the window follows the recipient’s clock across daylight saving',
    localTime(new Date('2026-07-15T13:30:00Z')).hour === 9
    && localTime(new Date('2026-01-15T14:30:00Z')).hour === 9)
  check('S4b: and the local calendar day is the one a daily quota counts over',
    localTime(new Date('2026-10-16T03:00:00Z')).day === '2026-10-15')
  check('S4c: the local day starts before now and within a day of it',
    startOfLocalDayUtc(NOW) < NOW
    && NOW.getTime() - startOfLocalDayUtc(NOW).getTime() < DAY_MS)

  check('S5: a prospect that replied, opted out or already had two messages is due nothing',
    nextMessageFor({ status: 'sent_first', email: 'a@b.c', first_sent_at: daysAgo(30), second_sent_at: null, replied_at: daysAgo(1) }, NOW) === null
    && nextMessageFor({ status: 'opted_out', email: 'a@b.c', first_sent_at: daysAgo(30), second_sent_at: null, replied_at: null }, NOW) === null
    && nextMessageFor({ status: 'sent_second', email: 'a@b.c', first_sent_at: daysAgo(30), second_sent_at: daysAgo(20), replied_at: null }, NOW) === null)
  check('S5b: a redacted row has no address left and is due nothing',
    nextMessageFor({ status: 'sent_first', email: null, first_sent_at: daysAgo(30), second_sent_at: null, replied_at: null }, NOW) === null)
  check('S5c: the second message waits the full seven days',
    nextMessageFor({ status: 'sent_first', email: 'a@b.c', first_sent_at: daysAgo(6), second_sent_at: null, replied_at: null }, NOW) === null
    && nextMessageFor({ status: 'sent_first', email: 'a@b.c', first_sent_at: daysAgo(8), second_sent_at: null, replied_at: null }, NOW) === 'second')
  check('S5d: a fresh row is due its first message',
    nextMessageFor({ status: 'new', email: 'a@b.c', first_sent_at: null, second_sent_at: null, replied_at: null }, NOW) === 'first')

  /* --------------------------------------------------------------- the transport */

  check('T1: without the mailbox password there is no transport, and that is not an error',
    readSmtpConfig({}).ok === false
    && readSmtpConfig({ OUTREACH_SMTP_PASSWORD: '   ' }).ok === false
    && readSmtpConfig({ OUTREACH_SMTP_PASSWORD: 'x' }).ok === true)
  check('T1b: the host, port and user have defaults because they are not secrets',
    (() => { const c = readSmtpConfig({ OUTREACH_SMTP_PASSWORD: 'x' }); return c.ok && c.settings.host === 'smtp.hostinger.com' && c.settings.port === 465 })())
  check('T2: a 5xx is permanent and anything else is not',
    isPermanentRejection({ responseCode: 550 }) === true
    && isPermanentRejection({ responseCode: 450 }) === false
    && isPermanentRejection({ code: 'ETIMEDOUT' }) === false
    && isPermanentRejection({ response: '550 5.7.1 blocked' }) === true)
  check('T2b: a failure code is short and ours, never the server’s own words',
    failureCode({ responseCode: 550 }) === 'smtp_550'
    && failureCode({ code: 'ETIMEDOUT' }) === 'smtp_etimedout'
    && failureCode({ message: 'Rejected: you are a spammer <script>' }) === 'smtp_unknown')

  /* ---------------------------------------------------------- the pass in whole */

  {
    const { sent, send } = recorder()
    const f = table([prospect()])
    const result = await sendNextProspect(asAdmin(f), deps({ send }))
    const row = rowsOf(f)[0]
    check('I1: a clean pass sends one message and marks the row with the finding and its date',
      result.status === 'sent' && sent.length === 1
      && row.status === 'sent_first' && typeof row.first_sent_at === 'string'
      && typeof row.finding === 'string' && typeof row.finding_checked === 'string')
    check('I1b: the message went to the address on the row, with its own unsubscribe link',
      sent[0]?.to === 'sales@store.example' && sent[0].text.includes(unsubscribeUrl(TOKEN)))
  }

  {
    const { sent, send } = recorder()
    const f = table([prospect()], [{ email_hash: hashEmail('sales@store.example'), email: 'sales@store.example' }])
    const result = await sendNextProspect(asAdmin(f), deps({ send }))
    check('I2: an address on the suppression list is never written to, and the row is parked',
      sent.length === 0 && result.status === 'idle'
      && rowsOf(f)[0].status === 'disqualified')
  }

  {
    const { sent, send } = recorder()
    // The list itself cannot be read. Fails closed: nothing is sent.
    const f = new FakeAdmin(
      { [PROSPECTS_TABLE]: [prospect()], [SUPPRESSION_TABLE]: [] },
      { [SUPPRESSION_TABLE]: { select: () => ({ code: '42P01' }) } } as any,
    )
    const result = await sendNextProspect(asAdmin(f), deps({ send }))
    check('I3: a suppression list we cannot read stops the send — it is not permission',
      sent.length === 0 && result.status === 'idle'
      && rowsOf(f)[0].status === 'new')
  }

  {
    const { sent, send } = recorder()
    const f = table([prospect()])
    const result = await sendNextProspect(asAdmin(f), deps({
      send, fetchPage: pages({ 'https://store.example/': '<div>static.parastorage.com</div>' }),
    }))
    check('I4: a site that is neither Shopify nor WordPress is refused, because the promise would be false',
      sent.length === 0 && result.status === 'idle'
      && rowsOf(f)[0].status === 'disqualified')
  }

  {
    const { sent, send } = recorder()
    const f = table([prospect()])
    // A well-kept site: current blog, alt text everywhere, one H1.
    const result = await sendNextProspect(asAdmin(f), deps({ send, fetchPage: cleanSite() }))
    const row = rowsOf(f)[0]
    check('I5: a site with nothing true to say gets no message and keeps its place in the list',
      sent.length === 0 && result.status === 'idle'
      && row.status === 'new' && String(row.note).startsWith(NO_FINDING_NOTE))
  }

  {
    const { sent, send } = recorder()
    // Five already sent today, on a quota of five.
    const already = Array.from({ length: 5 }, (_, i) => prospect({
      id: `done-${i}`, email: `a${i}@x.example`, email_hash: `${i}`.repeat(64),
      status: 'sent_first', first_sent_at: NOW.toISOString(), updated_at: NOW.toISOString(),
      finding: 'x', finding_checked: NOW.toISOString(),
    }))
    const f = table([...already, prospect({ id: 'next', email: 'next@x.example' })])
    const result = await sendNextProspect(asAdmin(f), deps({ send }))
    check('I6: the day’s quota is a stop, not a target',
      sent.length === 0 && result.status === 'idle' && (result as any).reason === 'quota_reached')
  }

  {
    const { sent, send } = recorder()
    const rejected = Array.from({ length: 2 }, (_, i) => prospect({
      id: `rej-${i}`, email: `r${i}@x.example`, email_hash: `${i + 5}`.repeat(64),
      status: 'disqualified', note: 'rejected: smtp_550', updated_at: NOW.toISOString(),
    }))
    const f = table([...rejected, prospect({ id: 'next', email: 'next@x.example' })])
    const result = await sendNextProspect(asAdmin(f), deps({ send }))
    check('I7: two permanent rejections in a day stop the channel on their own',
      sent.length === 0 && (result as any).reason === 'stopped_on_failures')
  }

  {
    const { sent, send } = recorder()
    const f = table([prospect()])
    const result = await sendNextProspect(asAdmin(f), deps({
      send, now: new Date('2026-10-17T13:30:00Z'),
    }))
    check('I8: nothing is sent on a Saturday',
      sent.length === 0 && (result as any).reason === 'outside_window')
  }

  {
    // Two overlapping passes over one row. The claim is conditional, so exactly
    // one of them may send.
    const { sent, send } = recorder()
    const f = table([prospect()])
    const d = deps({ send, fetchPage: liveSite({ 'https://store.example/sitemap_articles_1.xml': ARTICLES_XML(1, daysAgo(3)) }) })
    const [a, b] = await Promise.all([
      sendNextProspect(asAdmin(f), d),
      sendNextProspect(asAdmin(f), d),
    ])
    const sentCount = [a, b].filter((r) => r.status === 'sent').length
    check('I9: two overlapping passes write to a business once, never twice',
      sentCount === 1 && sent.length === 1)
  }

  {
    const { sent, send } = recorder('rejected')
    const f = table([prospect()])
    const result = await sendNextProspect(asAdmin(f), deps({
      send, fetchPage: liveSite({ 'https://store.example/sitemap_articles_1.xml': ARTICLES_XML(1, daysAgo(3)) }),
    }))
    const row = rowsOf(f)[0]
    check('I10: a send rejected after the claim spends the prospect rather than retrying it',
      result.status === 'send_failed' && sent.length === 1
      && row.status === 'disqualified' && String(row.note).startsWith('rejected'))
  }

  {
    const { sent, send } = recorder()
    const f = table([prospect({
      status: 'sent_first', first_sent_at: daysAgo(8), finding: 'x', finding_checked: daysAgo(8),
    })])
    const result = await sendNextProspect(asAdmin(f), deps({ send }))
    const row = rowsOf(f)[0]
    check('I11: the second message goes out after seven days and makes no new claim',
      result.status === 'sent' && (result as any).kind === 'second'
      && sent[0]?.text.includes('following up once') === true
      && row.status === 'sent_second' && typeof row.second_sent_at === 'string')
  }

  {
    const { sent, send } = recorder()
    const f = table([
      prospect({ id: 'new-1', email: 'new@x.example', email_hash: '1'.repeat(64) }),
      prospect({
        id: 'due-2', email: 'due@x.example', email_hash: '2'.repeat(64),
        status: 'sent_first', first_sent_at: daysAgo(9), finding: 'x', finding_checked: daysAgo(9),
      }),
    ])
    await sendNextProspect(asAdmin(f), deps({ send }))
    check('I12: a follow-up that is already promised goes before a new first message',
      sent[0]?.to === 'due@x.example')
  }

  {
    // No second message to someone who replied, however the row got there.
    const { sent, send } = recorder()
    const f = table([prospect({
      status: 'sent_first', first_sent_at: daysAgo(20), replied_at: daysAgo(19),
      finding: 'x', finding_checked: daysAgo(20),
    })])
    const result = await sendNextProspect(asAdmin(f), deps({ send }))
    check('I13: a business that replied is never written to again',
      sent.length === 0 && result.status === 'idle')
  }

  /* ------------------------------------------------------------- the two switches */

  {
    let ran = false
    const off = await runIsolatedProspectSend(async () => { ran = true; return { status: 'idle', reason: 'no_candidate' } }, { env: {} })
    check('G1: with the switch unset nothing runs at all — merging this changes nothing',
      off.status === 'off' && ran === false)
    const preview = await runIsolatedProspectSend(async () => { ran = true; return { status: 'idle', reason: 'no_candidate' } },
      { env: { [SENDING_FLAG]: 'true', VERCEL_ENV: 'preview' } })
    check('G1b: and a preview deployment never sends, because it shares the Production database',
      preview.status === 'not_production' && ran === false)
    const almost = await runIsolatedProspectSend(async () => { ran = true; return { status: 'idle', reason: 'no_candidate' } },
      { env: { [SENDING_FLAG]: 'TRUE', VERCEL_ENV: 'production' } })
    check('G1c: the switch is exactly "true" and nothing else',
      almost.status === 'off' && ran === false)
    const on = await runIsolatedProspectSend(async () => ({ status: 'idle', reason: 'no_candidate' }),
      { env: { [SENDING_FLAG]: 'true', VERCEL_ENV: 'production' } })
    check('G1d: with both switches on, the pass runs',
      on.status === 'ran')
  }

  {
    const thrown = await runIsolatedProspectSend(async () => { throw new Error('boom') },
      { env: { [SENDING_FLAG]: 'true', VERCEL_ENV: 'production' } })
    check('G2: a pass that throws cannot fail the cron it rides on',
      thrown.status === 'error')
  }

  const senderSrc = read('lib/outreach/sender-isolated.ts')
  const automationSrc = read('app/api/content/automation/cron/route.ts')
  const channelSrc = ['send', 'message', 'smtp', 'finding', 'schedule', 'sender-isolated']
    .map((n) => read(`lib/outreach/${n}.ts`)).join('\n')

  check('G3: the send rides the 15-minute cron, which is the only schedule this plan reliably gets',
    ridesQuarterHour(automationSrc))
  check('G4: both switches are read before anything is constructed',
    gatedOffByDefault(senderSrc))
  // The commercial rule, as a guard: one cold message through the provider that
  // carries the customer mail is how the customer mail stops arriving.
  check('G5: no part of this channel imports Resend',
    !/resend/i.test(stripComments(channelSrc)))
  check('G6: the mailbox password is only ever read from the environment',
    /env\.OUTREACH_SMTP_PASSWORD/.test(read('lib/outreach/smtp.ts'))
    && !/OUTREACH_SMTP_PASSWORD\s*=\s*['"]/.test(read('lib/outreach/smtp.ts')))

  /* ------------------------------------------------------- mutation controls */

  const mutSuppression = await withMutant<{ sendNextProspect: typeof sendNextProspect }, boolean>(
    'lib/outreach/send.ts',
    [[/const suppression = await isSuppressed\(admin, email\)/,
      'const suppression = { suppressed: false } as Awaited<ReturnType<typeof isSuppressed>>']],
    async (m) => {
      const { sent, send } = recorder()
      const f = table([prospect()], [{ email_hash: hashEmail('sales@store.example'), email: 'sales@store.example' }])
      await m.sendNextProspect(asAdmin(f), deps({
        send, fetchPage: liveSite({ 'https://store.example/sitemap_articles_1.xml': ARTICLES_XML(1, daysAgo(3)) }),
      }))
      return sent.length === 1
    },
  )
  check('I2-MUT: dropping the suppression check would write to someone who asked us to stop, and is caught',
    mutSuppression)

  const mutClaim = await withMutant<{ sendNextProspect: typeof sendNextProspect }, boolean>(
    'lib/outreach/send.ts',
    [[/      \.eq\('id', id\)\n      \.is\('first_sent_at', null\)\n      \.select\('id'\)/,
      "      .eq('id', id)\n      .select('id')"]],
    async (m) => {
      const { sent, send } = recorder()
      const f = table([prospect()])
      const d = deps({ send, fetchPage: liveSite({ 'https://store.example/sitemap_articles_1.xml': ARTICLES_XML(1, daysAgo(3)) }) })
      await Promise.all([m.sendNextProspect(asAdmin(f), d), m.sendNextProspect(asAdmin(f), d)])
      return sent.length === 2
    },
  )
  check('I9-MUT: a claim that is not conditional would write to the same business twice, and is caught',
    mutClaim)

  const mutPlatform = await withMutant<{ sendNextProspect: typeof sendNextProspect }, boolean>(
    'lib/outreach/send.ts',
    [[/      if \(evidence\.platform\.platform === null\) \{/, '      if (false) {']],
    async (m) => {
      const { sent, send } = recorder()
      const f = table([prospect()])
      await m.sendNextProspect(asAdmin(f), deps({
        send,
        fetchPage: pages({ 'https://store.example/': '<div>static.parastorage.com</div><h1>a</h1><h1>b</h1>' }),
      }))
      return sent.length === 1
    },
  )
  check('I4-MUT: without the platform gate a Wix site would be promised a Shopify fix, and is caught',
    mutPlatform)

  const mutFinding = await withMutant<{ pickFinding: typeof pickFinding }, boolean>(
    'lib/outreach/finding.ts',
    [[/  if \(articleCount === 0\) \{/, '  if (articleCount === 0 || articleCount === null) {']],
    async (m) => m.pickFinding(evidence({ articleCount: null, newestArticleAt: null }), NOW) !== null,
  )
  check('F7-MUT: treating "we could not measure" as "zero" would invent a claim, and is caught',
    mutFinding)

  // The control for the bug that actually shipped: put back BOTH halves of the
  // old behaviour — defaults only, and a 0 concluded from an empty default —
  // and the Crown Laboratories case must produce the false claim again.
  const mutArticles = await withMutant<{ readArticles: typeof readArticles }, boolean>(
    'lib/outreach/finding.ts',
    [
      [/  for \(const indexPath of SITEMAP_INDEXES\) \{/, '  for (const indexPath of [] as string[]) {'],
      [/  if \(fallback !== null && fallback\.count > 0\) return fallback/,
        '  if (fallback !== null) return fallback'],
    ],
    async (m) => (await m.readArticles('https://crown.example', 'wordpress', pages(CROWN))).count === 0,
  )
  check('F12-MUT: reading only the platform defaults calls a site with 141 articles empty — caught',
    mutArticles)

  const mutQuota = await withMutant<{ sendNextProspect: typeof sendNextProspect }, boolean>(
    'lib/outreach/send.ts',
    [[/  if \(tally\.sent >= quota\) return \{ status: 'idle', reason: 'quota_reached' \}/, '']],
    async (m) => {
      const { sent, send } = recorder()
      const already = Array.from({ length: 5 }, (_, i) => prospect({
        id: `done-${i}`, email: `a${i}@x.example`, email_hash: `${i}`.repeat(64),
        status: 'sent_first', first_sent_at: NOW.toISOString(), updated_at: NOW.toISOString(),
        finding: 'x', finding_checked: NOW.toISOString(),
      }))
      const f = table([...already, prospect({
        id: 'next', email: 'next@x.example', email_hash: '9'.repeat(64),
      })])
      await m.sendNextProspect(asAdmin(f), deps({
        send, fetchPage: liveSite({ 'https://store.example/sitemap_articles_1.xml': ARTICLES_XML(1, daysAgo(3)) }),
      }))
      return sent.length === 1
    },
  )
  check('I6-MUT: without the quota the ramp would be decoration, and is caught', mutQuota)

  // NOT written as a mutation control on purpose. FakeAdmin's error hooks are
  // per table, so a prospects table that refuses one read refuses them all, and
  // the mutant would be stopped by the candidate read rather than by the check
  // under test — a guard that passes for the wrong reason. The two halves are
  // pinned separately instead: that the tally reports itself unreadable, and
  // that the sender refuses to send on one.
  {
    const f = new FakeAdmin(
      { [PROSPECTS_TABLE]: [prospect()], [SUPPRESSION_TABLE]: [] },
      { [PROSPECTS_TABLE]: { select: () => ({ code: 'PGRST000' }) } } as any,
    )
    const tally = await readDayTally(asAdmin(f), NOW)
    check('I6b: a day’s count that could not be read says so, rather than reporting zero',
      tally.readable === false && tally.sent === 0)
  }
  {
    const f = table([prospect()])
    const good = await readDayTally(asAdmin(f), NOW)
    check('I6c: and a readable count is readable, so the check above is not vacuous',
      good.readable === true && good.sent === 0)
  }
  check('I6d: the sender refuses to send on a count it could not read',
    /if \(!tally\.readable\) return \{ status: 'idle', reason: 'read_failed' \}/
      .test(stripComments(read('lib/outreach/send.ts'))))

  const mutWindow = await withMutant<{ windowEndMinute: typeof windowEndMinute }, boolean>(
    'lib/outreach/schedule.ts',
    [[/export const SLACK_PASSES = 3/, 'export const SLACK_PASSES = 9']],
    async (m) => m.windowEndMinute(5) !== 11 * 60,
  )
  check('S2-MUT: a window that no longer matches the approved 09:00–11:00 at five a day is caught',
    mutWindow)

  const mutSecond = await withMutant<{ nextMessageFor: typeof nextMessageFor }, boolean>(
    'lib/outreach/schedule.ts',
    [[/  if \(row\.replied_at !== null\) return null/, '']],
    async (m) => m.nextMessageFor({
      status: 'sent_first', email: 'a@b.c', first_sent_at: daysAgo(20),
      second_sent_at: null, replied_at: daysAgo(19),
    }, NOW) === 'second',
  )
  check('I13-MUT: without the reply check a business that answered would be followed up anyway — caught',
    mutSecond)

  const mutGate = await withMutant<{ assertSendable: typeof assertSendable }, boolean>(
    'lib/outreach/message.ts',
    [[/  if \(!text\.includes\(unsubscribeUrl\(token\)\)\) return \{ sendable: false, reason: 'unsubscribe_link_missing' \}/, '']],
    async (m) => m.assertSendable({ subject: 's', text: first.text.replace(unsubscribeUrl(TOKEN), '') }, TOKEN).sendable === true,
  )
  check('M3-MUT: a gate that stopped checking for the opt-out link is caught', mutGate)

  check('G3-MUT: dropping the send from the 15-minute cron is caught',
    !ridesQuarterHour(automationSrc.replace(/await runIsolatedProspectSend\(\)/, '')))
  check('G4-MUT: moving the work before the switches is caught',
    !gatedOffByDefault(senderSrc.replace(
      /if \(env\[SENDING_FLAG\] !== 'true'\) return \{ status: 'off' \}/, '')))

  console.log(`\n${pass} passed, ${fail} failed`)
  if (fail > 0) process.exit(1)
}
main().catch((e) => { console.error(e); process.exit(1) })
export {}
