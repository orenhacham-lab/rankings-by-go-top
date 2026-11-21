/**
 * EVERY LINK IN AN ARTICLE BODY POINTS SOMEWHERE REAL, AND GIVES NOTHING AWAY.
 *
 * Run: npx tsx lib/articles/__qa__/body-link-hygiene.qa.ts
 *
 * Four published pages paid for this suite, each in a different language, and
 * every one of them is a case below, quoted from the stored row:
 *
 *   nl  what-is-google-search-console-dutch-guide (7 Nov 2026)
 *       explains that a site has four versions — "(http://, https://,
 *       http://www. en https://www.)" — and all four became live links.
 *   ja  seo-settings-guide-japan (31 Oct 2026)
 *       Japanese has no word spaces, so the old pattern, which stopped only at
 *       a space, swallowed 54 characters of explanation into one href.
 *   ja  google-search-engine-registration-guide (9 Nov 2026)
 *       a live link to https://example.com/sitemap.xml.
 *   pt-BR webmaster-tools-google-guide (9 Nov 2026)
 *       a live link to https://www.seusite.com.br.
 *   en  google-webmaster-tools-guide (24 Oct 2026)
 *       yourwebsite.com, twice.
 *   it/de search-engine-optimization-guide, searchconsole-anleitung-unternehmen
 *       apps.shopify.com/Go-Top-SEO — the wrong case, and with no nofollow,
 *       although the truth gate has a rule that demands one. The gate reads
 *       the model's text; these anchors were written after it.
 *
 * THE RULE THIS SUITE EXISTS TO PROTECT: the repair pass may REMOVE a link or
 * CORRECT an attribute. It may never drop a word, never rewrite prose, and
 * never change whether an article can be published. Group E proves the last
 * one by running the publish gate on a repaired body.
 */
import {
  hostOfUrl, isLinkableUrl, isNofollowExempt, isPlaceholderHost, linkifyBareUrls, repairBodyLinks,
  withNofollow, NOFOLLOW_EXEMPT_HOSTS, SHOPIFY_LISTING_URL,
} from '../bare-urls'
import { checkBodyLinks, withBodyLinks } from '../../blog/auto/body-links'
import { BLOG_AUTO_LOCALES } from '../../blog/auto/rotation'

let passed = 0
let failed = 0
function check(name: string, ok: boolean) {
  if (ok) passed++
  else { failed++; console.log('FAIL', name) }
}

const anchors = (html: string): string[] => html.match(/<a\b[^>]*>/gi) ?? []
const hrefs = (html: string): string[] =>
  anchors(html).map((a) => a.match(/href\s*=\s*"([^"]*)"/i)?.[1] ?? '')
/** The reader's text, with every tag removed: it must survive any repair. */
const words = (html: string): string => html.replace(/<[^>]+>/g, '').replace(/\s+/g, ' ').trim()

// ── GROUP A: a scheme with no host is not an address ────────────────────────

const DUTCH = '<p>Een website heeft vaak vier versies (http://, https://, http://www. en https://www.). De beste aanpak is een domeinproperty.</p>'
const dutchLinked = linkifyBareUrls(DUTCH)
check('A1 the Dutch four-versions sentence produces no link', anchors(dutchLinked).length === 0)
check('A2 and keeps every word the article wrote', words(dutchLinked) === words(DUTCH))
for (const bad of ['http://', 'https://', 'http://www', 'https://www', 'https://localhost', 'https://a.b', 'https://site']) {
  check(`A3 not linkable: ${bad}`, !isLinkableUrl(bad))
}
check('A4 a stored anchor to a scheme-only href is unwrapped, words intact',
  repairBodyLinks('<p>vier versies (<a href="http://www" target="_blank" rel="noopener noreferrer">http://www</a>.)</p>')
  === '<p>vier versies (http://www.)</p>')

// ── GROUP B: a language without spaces ──────────────────────────────────────

const JA_SENTENCE = 'httpで始まるといったサイトは、ユーザーがすぐに離脱してしまう可能性が高く、検索順位においても不利になります。'
const JA = `<p>http://${JA_SENTENCE}</p>`
const jaLinked = linkifyBareUrls(JA)
check('B1 a Japanese sentence after the scheme is not swallowed into an href',
  anchors(jaLinked).length === 0 && words(jaLinked) === words(JA))
check('B2 the same holds for Hebrew written straight after the scheme',
  anchors(linkifyBareUrls('<p>כתובת שמתחילה ב-http://ואין בה אירוח אמיתי</p>')).length === 0)
check('B3 a percent-encoded Hebrew path IS still linked (percent-encoding is ASCII)',
  hrefs(linkifyBareUrls('<p>ראו https://www.example-site.co.il/%D7%A7%D7%99%D7%93%D7%95%D7%9D כאן</p>'))
    .includes('https://www.example-site.co.il/%D7%A7%D7%99%D7%93%D7%95%D7%9D'))
check('B4 a real address followed by Japanese text stops at the address',
  hrefs(linkifyBareUrls('<p>https://search.google.com/search-console にアクセスしてください。</p>'))
    .join() === 'https://search.google.com/search-console')

// ── GROUP C: "your own site here", in each language we publish in ───────────

const PLACEHOLDERS = [
  ['ja', 'https://example.com/sitemap.xml'],
  ['pt-BR', 'https://www.seusite.com.br'],
  ['en', 'http://yourwebsite.com'],
  ['en', 'https://www.yourwebsite.com'],
  ['es', 'https://tusitio.com/sitemap.xml'],
  ['fr', 'https://votresite.fr'],
  ['it', 'https://ilmiosito.it'],
  ['de', 'https://ihre-website.de'],
  ['nl', 'https://mijnwebsite.nl'],
  ['pl', 'https://twojastrona.pl'],
  ['en', 'https://anything.test'],
  ['en', 'https://foo.invalid'],
] as const
for (const [locale, url] of PLACEHOLDERS) {
  check(`C1 ${locale}: ${url} is a placeholder, not a destination`, isPlaceholderHost(hostOfUrl(url)))
  check(`C2 ${locale}: ${url} is never turned into a link`, !isLinkableUrl(url))
}
check('C3 the sentence that names a placeholder keeps its words',
  words(linkifyBareUrls('<p>サイトマップのURL（https://example.com/sitemap.xml のような形式）</p>'))
  === words('<p>サイトマップのURL（https://example.com/sitemap.xml のような形式）</p>'))
check('C4 a stored placeholder anchor is unwrapped and the address stays as text',
  repairBodyLinks('<p>（<a href="https://example.com/sitemap.xml" target="_blank" rel="noopener noreferrer">https://example.com/sitemap.xml</a> のような形式）</p>')
  === '<p>（https://example.com/sitemap.xml のような形式）</p>')
check('C5 a real company domain is NOT mistaken for a placeholder',
  ['https://search.google.com/search-console', 'https://wordpress.org/plugins/go-top-seo-bridge/',
    'https://developers.google.com/search/docs', 'https://www.gotopseo.com/articles',
    'https://my-real-shop.co.il', 'https://websitecarbon.com'].every((u) => isLinkableUrl(u)))

// ── GROUP D: nothing of ours leaks to somebody else ─────────────────────────

const FOREIGN = '<p>See <a href="https://developers.google.com/search/docs" target="_blank" rel="noopener noreferrer">the docs</a>.</p>'
check('D1 an outbound link is given nofollow', repairBodyLinks(FOREIGN).includes('rel="noopener noreferrer nofollow"'))
check('D2 an outbound link with no rel at all gets one',
  /rel="nofollow noopener"/.test(repairBodyLinks('<p><a href="https://example-real.com/x">x</a></p>')))
check('D3 our own links are left exactly as they are',
  repairBodyLinks('<p><a href="https://www.gotopseo.com/signup">x</a> <a href="/articles/y">y</a></p>')
  === '<p><a href="https://www.gotopseo.com/signup">x</a> <a href="/articles/y">y</a></p>')
check('D4 the wrong-case Shopify address is normalised to the one listing',
  repairBodyLinks('<p><a href="https://apps.shopify.com/Go-Top-SEO" target="_blank" rel="noopener noreferrer">Shopify</a></p>')
    .includes(`href="${SHOPIFY_LISTING_URL}"`))
check('D5 and it carries nofollow afterwards, which is the rule the gate states',
  /rel="[^"]*nofollow/.test(repairBodyLinks('<p><a href="https://apps.shopify.com/Go-Top-SEO" target="_blank" rel="noopener noreferrer">Shopify</a></p>')))
check('D6 withNofollow keeps what was there and adds only what is missing',
  withNofollow('noopener noreferrer') === 'noopener noreferrer nofollow'
  && withNofollow('nofollow') === 'nofollow noopener'
  && withNofollow(null) === 'nofollow noopener'
  && withNofollow('sponsored nofollow noopener') === 'sponsored nofollow noopener')
// Two hosts Oren decided on 21 Nov 2026 keep their link exactly as written:
// the kroyzer.co.il link in `google-seo-benefits`, and GO TOP, the agency.
check('D8 the kroyzer link keeps its rel exactly as the article wrote it',
  repairBodyLinks('<p><a href="https://www.kroyzer.co.il/" target="_blank" rel="noopener noreferrer">קידום אורגני</a></p>')
  === '<p><a href="https://www.kroyzer.co.il/" target="_blank" rel="noopener noreferrer">קידום אורגני</a></p>')
check('D9 a link with no rel at all to an exempt host is given none',
  repairBodyLinks('<p><a href="https://kroyzer.co.il/x">x</a></p>') === '<p><a href="https://kroyzer.co.il/x">x</a></p>')
check('D10 the agency keeps its link too, on the bare host and on a subdomain',
  repairBodyLinks('<p><a href="https://www.gotop.co.il/">GO TOP</a> <a href="https://blog.gotop.co.il/a">b</a></p>')
  === '<p><a href="https://www.gotop.co.il/">GO TOP</a> <a href="https://blog.gotop.co.il/a">b</a></p>')
check('D11 and the exemption is the rel ALONE: an exempt host that cannot exist is still not a link',
  isNofollowExempt('https://kroyzer.co.il/a') && NOFOLLOW_EXEMPT_HOSTS.length === 2
  && !isNofollowExempt('https://developers.google.com/x')
  && !isNofollowExempt('https://notkroyzer.co.il.example/x'))
check('D12 a host that merely CONTAINS an exempt name is not exempt',
  !isNofollowExempt('https://kroyzer.co.il.attacker.test/x') && !isNofollowExempt('https://xkroyzer.co.il/x'))

check('D7 repair is idempotent', (() => {
  const once = repairBodyLinks(FOREIGN)
  return repairBodyLinks(once) === once
})())

// ── GROUP E: NO ARTICLE CAN BE LOST BY ANY OF THIS ─────────────────────────
//
// The gate that decides whether the daily article is published (checkBodyLinks)
// asks two things: does the body name the product, and does it carry a link
// into it. The repair pass never touches either, so a body that passed before
// passes after — in every language the blog publishes in.

const bodyFor = (locale: typeof BLOG_AUTO_LOCALES[number]): string =>
  `<h2>t</h2><p>Go Top SEO, http://www and https://example.com/sitemap.xml, ${locale}.</p>`
      + '<p>Also <a href="https://apps.shopify.com/Go-Top-SEO" target="_blank" rel="noopener noreferrer">Shopify</a>.</p>'

check('E1 every blog language is covered by this suite', BLOG_AUTO_LOCALES.length === 11)
for (const locale of BLOG_AUTO_LOCALES) {
  const linked = withBodyLinks(bodyFor(locale), { locale, internalTargets: [{ title: 'T', slug: 's' }] })
  check(`E2 ${locale}: the publish gate still passes after the repair`, checkBodyLinks(linked).ok)
  check(`E3 ${locale}: the body still links into the product`, linked.includes('<a href="/'))
  check(`E4 ${locale}: no link to an address that cannot exist survives`,
    hrefs(linked).every((h) => !/^https?:\/\//.test(h) || isLinkableUrl(h)))
  check(`E5 ${locale}: every outbound link carries nofollow`,
    anchors(linked).filter((a) => /href="https?:\/\//.test(a) && !a.includes('gotopseo.com'))
      .every((a) => /rel="[^"]*nofollow/.test(a)))
}

// ── MUTATION CONTROLS: break each guard on purpose and show it fails ────────

const OLD_BARE_URL = /https?:\/\/[^\s<>"'()[\]]+/g
check('MUTATION CONTROL: the old space-only pattern swallows the Japanese sentence',
  (JA.match(OLD_BARE_URL) ?? [''])[0].length > 20)
check('MUTATION CONTROL: the old pattern finds four "addresses" in the Dutch sentence',
  (DUTCH.match(OLD_BARE_URL) ?? []).length === 4)
check('MUTATION CONTROL: a linkifier with no host check would link example.com',
  OLD_BARE_URL.test('https://example.com/sitemap.xml'))
check('MUTATION CONTROL: a repair that only added rel would leave the broken href',
  '<a href="http://www" rel="nofollow noopener">'.includes('href="http://www"'))
check('MUTATION CONTROL: a rel rewrite that replaced instead of appending loses noopener',
  'nofollow' !== withNofollow('noopener'))
check('MUTATION CONTROL: without the exemption the kroyzer link would get nofollow',
  /rel="[^"]*nofollow/.test('<a href="https://www.kroyzer.co.il/" rel="' + withNofollow('noopener noreferrer') + '">x</a>'))
check('MUTATION CONTROL: an exemption matched by substring would exempt an attacker host',
  'kroyzer.co.il.attacker.test'.includes('kroyzer.co.il'))
check('MUTATION CONTROL: unwrapping that dropped the inner text is caught',
  words('<p>vier versies (http://www.)</p>') !== words('<p>vier versies ()</p>'))

console.log(`${passed} passed, ${failed} failed`)
if (failed) process.exit(1)
export {}
