/**
 * Deciding, from a business's own public site, whether it may enter the list.
 *
 * This is the gate the whole channel rests on, because every promise on the
 * privacy page about WHO we write to is kept or broken here. A row that exists
 * is a row the sender will eventually write to, so a rule applied later than
 * this is a rule applied too late: the refusals below are the reason the table
 * can be described truthfully in public.
 *
 * THE ORDER IS CHEAPEST-REFUSAL-FIRST, and it is also politest-first. A domain
 * that is European is refused with no request at all. robots.txt is read before
 * anything else is, so a site that says no is never fetched beyond that one
 * file. Only then does the home page get read, and only a site that is on a
 * platform the message's promise is true for is read any further.
 *
 * WHAT THIS DELIBERATELY DOES NOT DO. It does not submit a form, log in,
 * accept terms, solve a challenge or follow a paywall, because the published
 * text says we do not enter any part of a site that is not open to every
 * visitor — and because that is also the line between the contract terms a
 * court would enforce against us and the ones it would not. It does not guess
 * an address from a name pattern: every address is one the business printed on
 * its own page. And it never takes an address from the directory that pointed
 * us at the business, which is the single rule most likely to be eroded by
 * someone trying to raise the yield later.
 *
 * At most four pages per site, fetched one after another rather than at once:
 * we are reading other people's servers, and a crawler is told apart from a
 * visitor by how much it asks for at a time.
 */
import type { FetchedPage, PageFetcher } from './finding'
import { readPlatform, type ProspectPlatform } from './finding'
import {
  contactEmailIn,
  eeaUkSignalIn,
  findUsPostalAddress,
  forbidsHarvesting,
  isEeaUkDomain,
  isOpenPage,
  robotsAllows,
} from './sourcing'

/** How the crawler names itself, in robots.txt terms and in its own requests. */
export const CRAWLER_AGENT = 'GoTopSEO-Prospecting'

/**
 * Where a business puts its address, its contact address, and the two things
 * that can refuse it: a European office and a notice about collecting
 * addresses. Ordered by how much each page usually carries, because the budget
 * below cuts the list off.
 *
 * THE WALK DOES NOT STOP EARLY, even once the address and the email are in
 * hand, and that is deliberate. Two of the rules are about what the site says
 * ANYWHERE, not about what it says where we happened to look first: a US
 * company with a Berlin office usually says so on its about page, and the home
 * page never mentions it. Stopping at the first success would mean the refusals
 * depend on which page answered quickest.
 *
 * What "anywhere on the site" can honestly mean is "anywhere on the pages we
 * read", which are the ones that carry addresses. A European address buried in
 * a product description is not something this can promise to find, and nothing
 * in here pretends otherwise.
 */
export const CONTACT_PATHS: readonly string[] = [
  '/', '/contact', '/about', '/contact-us', '/pages/contact', '/about-us', '/pages/contact-us',
]
/** The ceiling on requests to one stranger's server, home page included. */
export const MAX_PAGES_PER_SITE = 4

export interface ProspectDraft {
  company: string
  siteHost: string
  email: string
  platform: ProspectPlatform
  postalAddress: string
  /**
   * The business's own page the CONTACT ADDRESS came from, stored per row.
   *
   * Per row and not per source on purpose: the published text distinguishes the
   * business's own site from a public registry, and if that distinction is ever
   * questioned, a stored URL answers it in one query where a reconstruction
   * from the directory name does not. The postal address may come from another
   * page of the same site; this names the one the email was on, which is the
   * one the harvesting provision is about. The postal address's own page is
   * `postalPage`, below.
   */
  sourceSite: string
  /**
   * The business's own page the POSTAL ADDRESS was read from.
   *
   * A separate column because it defends a different promise than `sourceSite`:
   * that the business operates in the United States, resolved from the
   * company's own site and not from the directory that named it, which is what
   * keeps this list outside the GDPR. The directory cannot answer it and a
   * reconstruction is not an answer, so the page is written down at the moment
   * the address is read.
   */
  postalPage: string
  /** The independent public source that says this business exists. */
  sourceSecond: string
}

export type RefusalReason =
  | 'eea_uk_domain'
  | 'robots_disallowed'
  | 'home_unreachable'
  | 'not_open'
  | 'other_platform'
  | 'unrecognized_platform'
  | 'no_postal_address'
  | 'eea_uk_address'
  | 'no_contact_email'
  | 'harvesting_notice'

export type Qualification =
  | { ok: true; draft: ProspectDraft; pagesRead: number }
  | { ok: false; reason: RefusalReason; detail?: string; pagesRead: number }

export interface QualifyInput {
  company: string
  host: string
  /** The public listing that named this business. Recorded, never read for an address. */
  sourceSecond: string
}

const get = async (fetchPage: PageFetcher, url: string): Promise<FetchedPage | null> => {
  try {
    return await fetchPage(url)
  } catch {
    return null
  }
}

/**
 * Read the business's own site and decide.
 *
 * Returns the draft a writer may insert, or the reason it may not, and in both
 * cases how many requests it cost — which is the number the pass logs, because
 * politeness that is not measured is politeness nobody can check.
 */
export async function qualifyBusiness(input: QualifyInput, fetchPage: PageFetcher): Promise<Qualification> {
  const host = input.host.toLowerCase().replace(/^https?:\/\//, '').replace(/[/:].*$/, '').replace(/^www\./, '')
  let pagesRead = 0

  // Nothing is requested from a European domain at all.
  if (isEeaUkDomain(host)) return { ok: false, reason: 'eea_uk_domain', pagesRead }

  // robots.txt before the site. A refusal here costs the site one small file.
  const robots = await get(fetchPage, `https://${host}/robots.txt`)
  pagesRead += 1
  if (robots !== null && robots.status === 200) {
    const allowed = CONTACT_PATHS.every((path) => robotsAllows(robots.body, path, CRAWLER_AGENT))
      || robotsAllows(robots.body, '/', CRAWLER_AGENT)
    if (!allowed) return { ok: false, reason: 'robots_disallowed', pagesRead }
  }

  const home = await get(fetchPage, `https://${host}/`)
  pagesRead += 1
  if (home === null) return { ok: false, reason: 'home_unreachable', pagesRead }
  if (!isOpenPage(home)) return { ok: false, reason: 'not_open', detail: `status ${home.status}`, pagesRead }

  const platform = readPlatform(home.body)
  if (platform.platform === null) {
    return {
      ok: false,
      reason: platform.reason === 'other_platform' ? 'other_platform' : 'unrecognized_platform',
      pagesRead,
    }
  }

  // The walk. Every page is one the business published for anybody to read, and
  // each one is judged for all three things at once: the address, the contact
  // address, and whether it is a page that tells us not to.
  const homeUrl = home.url || `https://${host}/`
  let postal: { line: string; state: string } | null = findUsPostalAddress(home.body)
  // Set together with the address, never afterwards: a page recorded later is a
  // guess about where the address came from.
  let postalPage: string | null = postal === null ? null : homeUrl
  let email: string | null = contactEmailIn(home.body, host)
  let sourceSite = homeUrl
  let europeanSignal = eeaUkSignalIn(home.body)
  let forbidden = email !== null && forbidsHarvesting(home.body)

  for (const path of CONTACT_PATHS) {
    if (path === '/') continue
    if (pagesRead >= MAX_PAGES_PER_SITE + 1) break
    const page = await get(fetchPage, `https://${host}${path}`)
    pagesRead += 1
    if (page === null || !isOpenPage(page)) continue
    europeanSignal = europeanSignal ?? eeaUkSignalIn(page.body)
    if (postal === null) {
      postal = findUsPostalAddress(page.body)
      if (postal !== null) postalPage = page.url || `https://${host}${path}`
    }
    if (email === null) {
      const found = contactEmailIn(page.body, host)
      if (found !== null) {
        email = found
        sourceSite = page.url || `https://${host}${path}`
        // Whether harvesting is forbidden is a property of the page the address
        // was taken FROM, which is the page the statute is about.
        forbidden = forbidsHarvesting(page.body)
      }
    }
  }

  // Our own published text: the list holds no EEA or UK address at all, so one
  // anywhere on the site is a refusal even when everything else fits.
  if (europeanSignal !== null) {
    return { ok: false, reason: 'eea_uk_address', detail: europeanSignal, pagesRead }
  }
  // And: a business that publishes no address never enters the list.
  if (postal === null) return { ok: false, reason: 'no_postal_address', pagesRead }
  if (email === null) return { ok: false, reason: 'no_contact_email', pagesRead }
  if (forbidden) return { ok: false, reason: 'harvesting_notice', pagesRead }

  return {
    ok: true,
    pagesRead,
    draft: {
      company: input.company.slice(0, 120),
      siteHost: host,
      email: email.toLowerCase(),
      platform: platform.platform,
      postalAddress: postal.line,
      postalPage: postalPage ?? homeUrl,
      sourceSite,
      sourceSecond: input.sourceSecond,
    },
  }
}
