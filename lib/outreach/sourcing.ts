/**
 * Reading a stranger's public site well enough to decide whether it may enter
 * the prospect list at all.
 *
 * EVERY RULE IN HERE IS A SENTENCE WE HAVE ALREADY PUBLISHED, in four
 * languages, in the "Business Outreach by Email" section of the privacy page.
 * That is the whole reason this module is strict in places where a looser rule
 * would yield more businesses: the page says
 *
 *   - the address comes from "a contact email address shown on the business's
 *     own site or in a public business registry". So a directory listing is
 *     where we learn that a business exists; it is NEVER where the address
 *     comes from. `contactEmailIn` is only ever run against the business's own
 *     pages.
 *   - "we do not enter any part of a site that is not open to every visitor".
 *     No account, no login, no form, no paywall, no CAPTCHA. `isOpenPage` is
 *     that sentence, and it is also what keeps us out of the one legal area
 *     that actually bites: terms you accept by registering are enforceable,
 *     while browsewrap terms on a page you merely read are not, which is the
 *     distinction the Ninth Circuit drew in hiQ v. LinkedIn on remand.
 *   - "a business that publishes no address never enters the list", and the
 *     list holds "no Israeli, EEA or UK address at all". So a US postal
 *     address on the company's own site is a requirement, not a preference,
 *     and any EEA or UK signal anywhere on that site is a refusal.
 *   - "we do not buy contact lists and we do not use data brokers". Licensed
 *     commercial contact data is therefore not readable for free either: the
 *     representation is about where our data comes from, not about what we paid.
 *
 * AND ONE RULE THAT EXISTS ONLY BECAUSE THE LIST IS MACHINE-MADE. CAN-SPAM's
 * aggravated violations include address harvesting: using an automated program
 * to collect addresses from a site whose own policy says it does not share its
 * users' addresses (15 U.S.C. 7704(b)(1)(A)(i)). It is an aggravating factor
 * rather than an offence of its own — it trebles statutory damages where the
 * message also breaks 7704(a) — so the real defence stays what it always was:
 * a true header, an honest subject, the advertisement identified, our postal
 * address, and an opt-out we honour. `forbidsHarvesting` is the cheap half of
 * the insurance, and the deliberately narrow scope of what it matches is
 * explained at the constant itself.
 *
 * Everything here is pure: a string in, a verdict out, so the QA suite can put
 * the real HTML of a real refusal in front of it without touching a network.
 */
import type { FetchedPage } from './finding'

/** The states and DC, as the second half of a US address line. */
export const US_STATES: readonly string[] = [
  'AL', 'AK', 'AZ', 'AR', 'CA', 'CO', 'CT', 'DE', 'DC', 'FL', 'GA', 'HI', 'ID', 'IL', 'IN', 'IA',
  'KS', 'KY', 'LA', 'ME', 'MD', 'MA', 'MI', 'MN', 'MS', 'MO', 'MT', 'NE', 'NV', 'NH', 'NJ', 'NM',
  'NY', 'NC', 'ND', 'OH', 'OK', 'OR', 'PA', 'RI', 'SC', 'SD', 'TN', 'TX', 'UT', 'VT', 'VA', 'WA',
  'WV', 'WI', 'WY',
]

/** Top-level domains that place a business in the EEA or the UK by themselves. */
export const EEA_UK_TLDS: readonly string[] = [
  'uk', 'co.uk', 'org.uk', 'ac.uk', 'ie', 'de', 'fr', 'es', 'it', 'nl', 'be', 'at', 'dk', 'se',
  'fi', 'no', 'is', 'li', 'lu', 'pt', 'gr', 'pl', 'cz', 'sk', 'hu', 'ro', 'bg', 'hr', 'si', 'ee',
  'lv', 'lt', 'cy', 'mt', 'eu',
]

/** Country names that, next to a postal code, are an address rather than a shipping note. */
const EEA_UK_COUNTRIES = [
  'united kingdom', 'england', 'scotland', 'wales', 'northern ireland', 'ireland', 'germany',
  'france', 'spain', 'italy', 'netherlands', 'belgium', 'austria', 'denmark', 'sweden', 'finland',
  'norway', 'iceland', 'portugal', 'greece', 'poland', 'czech republic', 'czechia', 'slovakia',
  'hungary', 'romania', 'bulgaria', 'croatia', 'slovenia', 'estonia', 'latvia', 'lithuania',
  'cyprus', 'malta', 'luxembourg', 'liechtenstein',
]

/** A UK postcode. Specific enough to be an address on its own. */
const UK_POSTCODE = /\b[A-Z]{1,2}\d[A-Z\d]?\s?\d[A-Z]{2}\b/
/** An EU VAT identifier, which only a business established there holds. */
const EU_VAT = /\b(AT|BE|BG|HR|CY|CZ|DK|EE|FI|FR|DE|EL|HU|IE|IT|LV|LT|LU|MT|NL|PL|PT|RO|SK|SI|ES|SE|GB|XI)[\s-]?\d{8,12}\b/

/** HTML to readable text, because every rule below is about what a visitor reads. */
export function visibleText(html: string): string {
  return html
    .replace(/<script[\s\S]*?<\/script>/gi, ' ')
    .replace(/<style[\s\S]*?<\/style>/gi, ' ')
    .replace(/<!--[\s\S]*?-->/g, ' ')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/gi, ' ')
    .replace(/&amp;/gi, '&')
    .replace(/\s+/g, ' ')
    .trim()
}

export interface UsPostalAddress {
  /** The line as the business itself publishes it. */
  line: string
  state: string
}

/**
 * A US postal address published on the page, or null.
 *
 * The anchor is a two-letter state immediately followed by a five-digit ZIP,
 * which is the one pattern that does not occur by accident: a bare five-digit
 * number is a price or a year, and a bare state abbreviation is any two
 * letters, but the pair in that order is an address. Whatever precedes it on
 * the same line is taken as the street and city, which is also how the row is
 * then kept: the business's own wording rather than our reconstruction of it.
 */
export function findUsPostalAddress(html: string): UsPostalAddress | null {
  const text = visibleText(html)
  const states = US_STATES.join('|')
  const pattern = new RegExp(`([A-Za-z0-9][^|•\\n]{6,90}?),?\\s+(${states})[\\s,.]+(\\d{5})(?:-\\d{4})?(?![\\d-])`, 'g')
  for (const match of text.matchAll(pattern)) {
    const [, before, state, zip] = match
    // A street number somewhere in front, or a PO box: an address has one, and
    // a sentence that happens to end in "... CA 90210" usually does not.
    if (!/\d/.test(before) && !/\b(p\.?\s?o\.?\s?box|suite|ste|unit)\b/i.test(before)) continue
    const line = `${before.trim()}, ${state} ${zip}`.replace(/\s+/g, ' ').slice(0, 200)
    return { line, state }
  }
  return null
}

/** The registrable suffix test: is this host's TLD an EEA or UK one. */
export function isEeaUkDomain(host: string): boolean {
  const clean = host.toLowerCase().replace(/^https?:\/\//, '').replace(/[/:].*$/, '').replace(/\.$/, '')
  return EEA_UK_TLDS.some((tld) => clean === tld || clean.endsWith(`.${tld}`))
}

/**
 * An EEA or UK address published anywhere on the page, as a short reason, or
 * null.
 *
 * A country NAME alone is not enough: "we ship to Germany" is a shipping note,
 * not an establishment, and rejecting on it would throw away American
 * businesses for nothing. So a name counts only next to a postal code. A UK
 * postcode and an EU VAT number each count on their own, because neither
 * appears in copy by accident.
 */
export function eeaUkSignalIn(html: string): string | null {
  const text = visibleText(html)
  if (UK_POSTCODE.test(text.toUpperCase())) return 'uk postcode'
  const vat = EU_VAT.exec(text.toUpperCase())
  if (vat) return `eu vat ${vat[1]}`
  const low = text.toLowerCase()
  for (const country of EEA_UK_COUNTRIES) {
    let from = 0
    for (;;) {
      const at = low.indexOf(country, from)
      if (at === -1) break
      const around = low.slice(Math.max(0, at - 40), at + country.length + 40)
      // A postal code next to the country name, in any of the shapes Europe uses.
      if (/\b\d{4,6}\b/.test(around) || /\b[a-z]{1,2}\d[a-z\d]?\s?\d[a-z]{2}\b/.test(around)) {
        return `address in ${country}`
      }
      from = at + country.length
    }
  }
  return null
}

/** Localparts that are a business's front door. Preferred where a page has several. */
export const ROLE_LOCALPARTS: readonly string[] = [
  'info', 'sales', 'contact', 'hello', 'support', 'orders', 'office', 'service', 'customerservice',
  'inquiries', 'enquiries', 'help', 'mail', 'team', 'shop', 'store',
]

/** Addresses that are nobody's inbox, or nobody we may write to. */
const NEVER_WRITE_TO = [
  'no-reply', 'noreply', 'donotreply', 'do-not-reply', 'postmaster', 'mailer-daemon', 'abuse',
  'webmaster', 'dmca', 'privacy', 'legal', 'dpo', 'security', 'unsubscribe', 'bounce',
]

const EMAIL = /[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}/g

/** Hosts that are never anybody's mailbox: the reserved documentation names. */
const PLACEHOLDER_HOSTS = new Set([
  'example.com', 'example.org', 'example.net', 'domain.com', 'yourdomain.com', 'yoursite.com',
  'localhost', 'email.com', 'mysite.com', 'company.com',
])

/**
 * The contact address the business publishes on this page, or null.
 *
 * Only ever called with the business's OWN page, because that is what the
 * privacy text says the address may come from. Where a page shows several, a
 * role address wins: info@ is the business's front door, and a named person's
 * address is a person, even when they published it themselves.
 */
export function contactEmailIn(html: string, siteHost: string): string | null {
  const domain = siteHost.toLowerCase().replace(/^www\./, '')
  const found: string[] = []
  const seen = new Set<string>()
  // mailto: first — an address a visitor can click is an address meant to be used.
  for (const match of html.matchAll(/mailto:([^"'?>\s]+)/gi)) {
    const address = decodeURIComponent(match[1]).toLowerCase().trim()
    if (!seen.has(address)) { seen.add(address); found.push(address) }
  }
  for (const match of visibleText(html).matchAll(EMAIL)) {
    const address = match[0].toLowerCase()
    if (!seen.has(address)) { seen.add(address); found.push(address) }
  }

  const usable = found.filter((address) => {
    if (!/^[^@\s]+@[^@\s]+\.[a-z]{2,}$/i.test(address)) return false
    // A file name that looks like an address: "logo@2x.png".
    if (/\.(png|jpe?g|gif|webp|svg|css|js)$/i.test(address)) return false
    const [local, host] = address.split('@')
    if (NEVER_WRITE_TO.some((bad) => local === bad || local.startsWith(`${bad}+`) || local.startsWith(`${bad}.`))) return false
    if (isEeaUkDomain(host)) return false
    // Template placeholders and third-party plumbing hide here. Matched
    // exactly rather than as substrings: "example" inside a real host is a
    // real host, and a loose match here silently refuses businesses.
    if (PLACEHOLDER_HOSTS.has(host)) return false
    if (/(^|\.)(sentry\.io|wixpress\.com|sentry-next\.wixpress\.com)$/.test(host)) return false
    return true
  })
  if (usable.length === 0) return null

  const onOwnDomain = usable.filter((address) => {
    const host = address.split('@')[1]
    return host === domain || host.endsWith(`.${domain}`)
  })
  const pool = onOwnDomain.length > 0 ? onOwnDomain : usable
  const role = pool.find((address) => ROLE_LOCALPARTS.includes(address.split('@')[0]))
  return role ?? pool[0]
}

/**
 * Notices that forbid collecting addresses from the page.
 *
 * DELIBERATELY NARROW, and the narrowness is the decision. The statute reaches
 * a site whose policy says it does not share its users' addresses. Almost every
 * US business site carries "we do not sell your personal information" — a
 * sentence about what the business does with ITS customers' data, not a notice
 * about the address it prints on its own contact page. Matching that sentence
 * would refuse nearly every business and make this rule decorative, which is
 * worse than not having it: a rule that refuses everything teaches whoever
 * comes next to delete it. So what is matched is language about collecting,
 * harvesting or soliciting FROM the site.
 */
export const HARVESTING_NOTICES: readonly RegExp[] = [
  /\b(harvest|harvesting)\b[^.]{0,60}\b(e-?mail|address)/i,
  /\b(e-?mail addresses?|contact information)\b[^.]{0,80}\b(may not|must not|shall not|cannot) be (collected|harvested|used|gathered)/i,
  /\bno automated\b[^.]{0,40}\b(collection|gathering|extraction|scraping)/i,
  /\b(do not|don't|never) (share|sell|disclose)\b[^.]{0,40}\byour e-?mail address\b/i,
  /\bnot (to be|for) use[d]?\b[^.]{0,60}\b(commercial solicitation|unsolicited)/i,
  /\b(scraping|crawling|data mining|robots?)\b[^.]{0,60}\b(prohibited|not permitted|forbidden)/i,
]

/** True when this page's own words refuse what we are about to do. */
export function forbidsHarvesting(html: string): boolean {
  const text = visibleText(html)
  return HARVESTING_NOTICES.some((re) => re.test(text))
}

/** Pages that are not open to every visitor, which we have published that we do not enter. */
const WALL_MARKERS = [
  /captcha/i,
  /please enable js/i,
  /just a moment\.\.\./i,
  /cf-browser-verification/i,
  /checking your browser/i,
  /\baccess denied\b/i,
  /enter your (email|password) to (continue|view)/i,
  /sign in to (continue|view|see)/i,
]

/** True when the page was served openly and is not a wall. */
export function isOpenPage(page: FetchedPage): boolean {
  if (page.status === 401 || page.status === 402 || page.status === 403 || page.status === 429) return false
  if (page.status < 200 || page.status >= 400) return false
  const head = page.body.slice(0, 4000)
  return !WALL_MARKERS.some((re) => re.test(head))
}

/**
 * robots.txt, honoured as policy rather than as law.
 *
 * It does not bind us the way a contract would, and reading a public page is
 * not a computer-crime question after hiQ. It is honoured because it is the
 * clearest statement of non-consent a site can make, and the cost of respecting
 * it is a few businesses while the cost of ignoring it is the only piece of
 * evidence anyone would need to call us a bad actor.
 *
 * The parser is the small true subset: groups by user-agent, our own agent's
 * group winning over `*`, and the longest matching rule deciding, which is what
 * the specification says and what every major crawler does.
 */
export function robotsAllows(robotsTxt: string, path: string, agent: string): boolean {
  const lines = robotsTxt.split(/\r?\n/).map((line) => line.replace(/#.*$/, '').trim())
  const groups: { agents: string[]; rules: { allow: boolean; path: string }[] }[] = []
  let current: { agents: string[]; rules: { allow: boolean; path: string }[] } | null = null
  let lastWasAgent = false
  for (const line of lines) {
    const [rawKey, ...rest] = line.split(':')
    if (rest.length === 0) continue
    const key = rawKey.trim().toLowerCase()
    const value = rest.join(':').trim()
    if (key === 'user-agent') {
      if (!lastWasAgent || current === null) { current = { agents: [], rules: [] }; groups.push(current) }
      current.agents.push(value.toLowerCase())
      lastWasAgent = true
      continue
    }
    if (key !== 'allow' && key !== 'disallow') continue
    lastWasAgent = false
    if (current === null) { current = { agents: ['*'], rules: [] }; groups.push(current) }
    current.rules.push({ allow: key === 'allow', path: value })
  }

  const lowerAgent = agent.toLowerCase()
  const mine = groups.find((g) => g.agents.some((a) => a !== '*' && lowerAgent.includes(a)))
  const group = mine ?? groups.find((g) => g.agents.includes('*'))
  if (!group) return true

  let verdict = true
  let best = -1
  for (const rule of group.rules) {
    // "Disallow:" with nothing after it allows everything, by the specification.
    if (rule.path === '') { if (!rule.allow && best < 0) { verdict = true; best = 0 } continue }
    if (!path.startsWith(rule.path)) continue
    // Longest match wins; on a tie Allow wins, which is what crawlers do.
    if (rule.path.length > best || (rule.path.length === best && rule.allow)) {
      best = rule.path.length
      verdict = rule.allow
    }
  }
  return verdict
}

/** Hosts a directory links to that are never the business's own site. */
const NOT_A_BUSINESS_SITE = [
  'facebook.com', 'instagram.com', 'twitter.com', 'x.com', 'linkedin.com', 'youtube.com',
  'pinterest.com', 'tiktok.com', 'yelp.com', 'google.com', 'goo.gl', 'maps.app.goo.gl',
  'apple.com', 'amazon.com', 'etsy.com', 'ebay.com', 'wikipedia.org', 'mailchi.mp',
  'eventbrite.com', 'bbb.org', 'zoominfo.com', 'apollo.io', 'hunter.io', 'dnb.com',
  // Plumbing a page links to as a page rather than as an asset.
  'cdn.jsdelivr.net', 'bootstrapcdn.com', 'googleapis.com', 'gstatic.com', 'jquery.com',
  'w3.org', 'wordpress.org', 'shopify.com', 'adobe.com',
]

/**
 * Suffixes that are an institution rather than a business.
 *
 * THIS IS THE BUG THAT COST THE CRAWLER ITS FIRST DAY. A state programme's
 * directory is itself a government site, and the only off-site links on
 * `findjerseyfresh.com/directory/` are the state's other programmes
 * (`jerseyseafood.nj.gov`, `jerseygrown.nj.gov`, `jerseyequine.nj.gov`,
 * `nj.gov`). Those read as four perfectly good candidates, each cost three
 * fetches to refuse, and the pass then ended having examined nobody. A `.gov`
 * host is never a prospect: it sells nothing, and the product has nothing to
 * offer it.
 */
const NOT_A_BUSINESS_TLD = ['gov', 'mil', 'edu', 'int']

/** True when this host belongs to a government, a school or an institution. */
export function isInstitutionalDomain(host: string): boolean {
  const clean = host.toLowerCase().replace(/\.$/, '')
  return NOT_A_BUSINESS_TLD.some((tld) => clean === tld || clean.endsWith(`.${tld}`))
}

/**
 * True when two hosts are the same site: equal, or one inside the other.
 *
 * The listing's own navigation is not its membership, and a directory that
 * lives on `directory.example.org` links back to `example.org` on every page.
 * Checked in both directions for exactly that reason.
 */
export function sameSite(host: string, other: string): boolean {
  if (host === other) return true
  return host.endsWith(`.${other}`) || other.endsWith(`.${host}`)
}

/** The host of a URL, lowercased and without `www.`, or null when it is not one. */
export function hostOf(url: string): string | null {
  try {
    const parsed = new URL(url)
    if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') return null
    return parsed.hostname.toLowerCase().replace(/^www\./, '')
  } catch {
    return null
  }
}

export interface ListingCandidate {
  company: string
  host: string
}

/**
 * The businesses a public listing page names: the off-site links, with the
 * link's own text as the company name.
 *
 * Crude on purpose. A member list, a chamber directory and a state programme's
 * page have nothing in common structurally, and the one thing they do share is
 * that each member is a link to that member's own website. Nothing here decides
 * whether a business qualifies — that is the business's own site's job — so a
 * wrong guess here costs one fetch and a refusal.
 */
export function listingCandidates(html: string, listingUrl: string): ListingCandidate[] {
  const listingHost = hostOf(listingUrl)
  const out: ListingCandidate[] = []
  const seen = new Set<string>()
  for (const match of html.matchAll(/<a\b[^>]*href=["']([^"']+)["'][^>]*>([\s\S]{0,200}?)<\/a>/gi)) {
    const [, href, inner] = match
    let absolute = href
    try { absolute = new URL(href, listingUrl).toString() } catch { continue }
    const host = hostOf(absolute)
    if (host === null) continue
    if (listingHost !== null && sameSite(host, listingHost)) continue
    if (NOT_A_BUSINESS_SITE.some((bad) => host === bad || host.endsWith(`.${bad}`))) continue
    if (isInstitutionalDomain(host)) continue
    if (isEeaUkDomain(host)) continue
    if (seen.has(host)) continue
    const company = visibleText(inner).slice(0, 120).trim()
    // A link whose text is a URL, an arrow or nothing names no company, and the
    // row's company name is what the message's subject line says.
    if (company.length < 3 || /^https?:/i.test(company) || /^[\W\d]+$/.test(company)) continue
    seen.add(host)
    out.push({ company, host })
  }
  return out
}

/**
 * The listing's own pages that look like one business each.
 *
 * Needed because the useful public directories are not flat lists. A state
 * programme's directory names its members on its own pages and puts each
 * member's website on that member's page, so the off-site link this module
 * really wants is one hop further in. `hint` is the path fragment those pages
 * share, which is the only thing every such directory has in common.
 */
export function detailLinks(html: string, listingUrl: string, hint: string): string[] {
  const listingHost = hostOf(listingUrl)
  const out: string[] = []
  const seen = new Set<string>()
  for (const match of html.matchAll(/<a\b[^>]*href=["']([^"']+)["']/gi)) {
    let absolute: string
    try { absolute = new URL(match[1], listingUrl).toString() } catch { continue }
    if (hostOf(absolute) !== listingHost) continue
    const path = (() => { try { return new URL(absolute).pathname } catch { return '' } })()
    if (!path.includes(hint)) continue
    // The listing page itself, and its paginated variants, are not businesses.
    if (path.replace(/\/+$/, '') === hint.replace(/\/+$/, '')) continue
    // A search URL and an RSS feed sit under the same path as the members and
    // are a wasted fetch each: the one budget this pass really spends.
    if (absolute.includes('?')) continue
    if (/\/(feed|rss|page)\/?$/.test(path)) continue
    const clean = absolute.split('#')[0]
    if (seen.has(clean)) continue
    seen.add(clean)
    out.push(clean)
  }
  return out
}

/** The page's own name for itself: the h1 where it has one, else the title. */
export function pageTitle(html: string): string | null {
  const h1 = /<h1\b[^>]*>([\s\S]{0,300}?)<\/h1>/i.exec(html)
  const title = /<title\b[^>]*>([\s\S]{0,300}?)<\/title>/i.exec(html)
  for (const candidate of [h1?.[1], title?.[1]]) {
    if (candidate === undefined) continue
    // A directory's page title is usually "Business Name - Directory Name";
    // the business is the first part, which is how people write these.
    const text = visibleText(candidate).split(/\s[|\u2013\u2014-]\s/)[0].trim()
    if (text.length >= 3 && !/^https?:/i.test(text)) return text.slice(0, 120)
  }
  return null
}
