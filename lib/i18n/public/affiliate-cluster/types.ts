/**
 * The affiliate CLUSTER: two pages per language that sit under /affiliates and
 * are written for the words people actually type when they look for a program
 * to join.
 *
 * WHY A CLUSTER AND NOT A LONGER /affiliates PAGE. The program page answers
 * "what do you pay me", which is a question somebody already interested asks.
 * The measured demand (growth/affiliate-keywords-2026-11-14.md, Google Ads,
 * 14 Nov 2026) is one step earlier and an order of magnitude larger: the
 * category term — affiliate marketing 201,000/mo in the US, 22,200 in Germany,
 * 40,500 in Japan, 9,900 in Italy, 6,600 in France and the Netherlands, 3,600
 * for "programa de afiliados" in Brazil, 880 for "marketing afiliacyjny" in
 * Poland, 720 for 제휴 마케팅 in Korea, 590 for שיווק שותפים in Israel — plus a
 * smaller, hotter band of program-shopping terms ("best affiliate programs",
 * "programmi di affiliazione", "partnerprogramme", "programy partnerskie").
 *
 * So each language gets:
 *   marketing — the CATEGORY page, for the head term. What affiliate marketing
 *               is, what separates a one-off bounty from a recurring share, and
 *               who actually earns from it.
 *   choosing  — the DECISION page, for the program-shopping terms. The
 *               questions to ask before joining any program, and our own
 *               answers to them.
 *   agencies  — the AUDIENCE page, added 14 Nov 2026 for the one band of
 *               English and Japanese demand the first two do not reach:
 *               whitelabel seo services 720/mo in the US, high ticket
 *               affiliate programs 480, whitelabel seo agency 390, saas
 *               affiliate program 260, seo reseller 260, white label seo
 *               reseller 210, seo affiliate program 140, and 高単価アフィリ
 *               エイト 880 in Japan. Most of that volume is somebody looking
 *               for white-label SEO to RESELL, and we do not offer that — the
 *               reports carry the client site's own name and logo and the
 *               agreement licenses no resale under another brand. So the page
 *               says so plainly instead of implying otherwise, and separates
 *               the agency plan (a purchase) from the affiliate program (a
 *               recommendation), because confusing the two is how a partner
 *               ends up thinking a commission is a discount. In the other
 *               nine languages it targets no invented term: the audience is
 *               the same everywhere even where the search is not. The figures
 *               are the addendum of growth/affiliate-keywords-2026-11-14.md,
 *               measured in the same run as the table above it but seeded on
 *               agency and reseller modifiers rather than on the category
 *               term; the method is in
 *               affiliate/recruitment-pages/keyword-research-2026-11-14.md.
 *
 * All of them end at the same place: the application form on /affiliates. None
 * repeats the program page's rules and FAQ, because two pages that answer the
 * same question in the same words compete with each other and neither wins.
 *
 * THE NUMBERS ARE NOT WRITTEN HERE. Every rate, hold and threshold is
 * interpolated from lib/affiliate/terms.ts, the same single source the program
 * page, the partner dashboard and the commission engine read, so no language
 * can promise a rate we do not pay.
 *
 * TRUTH, in every language: no income is promised, no ranking is guaranteed and
 * no customer count is claimed. __qa__/affiliate-cluster.qa.ts fails the build
 * if any language puts one back.
 */
export type AffiliateClusterPage = {
  metaTitle: string
  metaDescription: string
  /** The short label: the hero's eyebrow and the breadcrumb's name. */
  eyebrow: string
  title: string
  /** The headline's second line, in action blue. */
  accent: string
  subtitle: string
  /** Three short, true reassurances under the subtitle. */
  trust: [string, string, string]
  whyTitle: string
  whyIntro: string
  /** Three cards on the navy band. */
  why: [Item, Item, Item]
  stepsTitle: string
  stepsIntro: string
  /** Three numbered steps. */
  steps: [Item, Item, Item]
  listTitle: string
  listIntro: string
  /** Four cards, two columns: who earns (marketing) / our answers (choosing). */
  list: [Item, Item, Item, Item]
  honestTitle: string
  honestBody: string
  faqTitle: string
  faq: [Qa, Qa, Qa, Qa]
  ctaTitle: string
  ctaBody: string
  /** The button that goes to the application form on /affiliates. */
  apply: string
  /** The link to the other page of the cluster, under the closing band. */
  siblingLabel: string
  /**
   * How the HUB names this page in its list of spokes.
   *
   * The first two pages need none: each is named by the other's
   * `siblingLabel`, and the hub borrows those, which is what keeps the three
   * from calling each other different things. A third page is named by
   * nobody — its own sibling link points AT the decision page — so it carries
   * the label the hub shows for it.
   */
  hubLabel?: string
}

export type Item = { title: string; body: string }
export type Qa = { q: string; a: string }

export type AffiliateClusterCopy = {
  /** /affiliates/affiliate-marketing — the category page. */
  marketing: AffiliateClusterPage
  /** /affiliates/choosing-a-program — the decision page. */
  choosing: AffiliateClusterPage
  /** /affiliates/for-seo-and-agencies — the audience page. */
  agencies: AffiliateClusterPage
}
