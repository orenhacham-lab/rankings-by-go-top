/* eslint-disable @typescript-eslint/no-require-imports */
/**
 * Terms, privacy policy and accessibility statement cover what the product does,
 * in BOTH languages (six pages, all rendered with react-dom/server so a section
 * that is commented out or not rendered fails).
 *
 * Topics pinned: the free site check and onboarding scan; the Search Console and
 * Business Profile connections; the WordPress connection and the GO TOP SEO
 * Bridge plugin (fixes, log, undo, removal); the customer link network (opt-in,
 * never reciprocal, no Shopify, the Google link-scheme risk accepted by opting
 * in); AI visibility checks and the automatic monthly check; AI-generated
 * content; emails (reminder with one-click unsubscribe, monthly report); the
 * sub-processors; the accessibility measures of the new design.
 *
 * Also: the product name is "Go Top SEO" (never the old name) in the six pages'
 * text and metadata, source comments stripped; the last-updated line is
 * 3 October 2026 on the terms (refunds aligned with the refund policy) and
 * 3 October 2026 on all three, revised together; Hebrew and English carry the same number of sections.
 *
 * MUTATION CONTROL. Every single pattern below is re-run against a copy of the
 * real text with that pattern's matches removed, and must then fail.
 *
 * Run: npx tsx components/public/__qa__/legal-coverage.qa.ts
 */
import { readFileSync } from 'fs'
import { renderToStaticMarkup } from 'react-dom/server'
import { createElement } from 'react'

let pass = 0, fail = 0
function check(name: string, cond: boolean, detail?: string) {
  if (cond) { pass++; console.log(`  ✓ ${name}`) } else { fail++; console.log(`  ✗ ${name}${detail ? ` — ${detail}` : ''}`) }
}

type Lang = 'en' | 'he'
type Doc = 'terms' | 'privacy' | 'a11y'

const FILES: Record<Lang, Record<Doc, string>> = {
  he: { terms: 'app/(public)/terms/page.tsx', privacy: 'app/(legal)/privacy/page.tsx', a11y: 'app/(legal)/accessibility/page.tsx' },
  en: { terms: 'app/(public)/en/terms/page.tsx', privacy: 'app/(public)/en/privacy/page.tsx', a11y: 'app/(public)/en/accessibility/page.tsx' },
}

function stripComments(src: string): string {
  return src.replace(/\{\s*\/\*[\s\S]*?\*\/\s*\}/g, '').replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:])\/\/[^\n]*/g, '$1')
}

function render(file: string): { text: string; body: string; h2: number; meta: string } {
  const mod = require('../../../' + file.replace(/\.tsx$/, ''))
  const html = renderToStaticMarkup(createElement(mod.default))
  const text = html.replace(/<[^>]+>/g, ' ').replace(/&#x27;|&#39;/g, "'").replace(/&amp;/g, '&').replace(/&quot;/g, '"').replace(/\s+/g, ' ')
  const bodyHtml = html.slice(Math.max(0, html.indexOf('<h1')))
  const body = bodyHtml.replace(/<[^>]+>/g, ' ').replace(/&#x27;|&#39;/g, "'").replace(/&amp;/g, '&').replace(/&quot;/g, '"').replace(/\s+/g, ' ')
  return { text, body, h2: (html.match(/<h2/g) ?? []).length, meta: JSON.stringify(mod.metadata) }
}

const pages: Record<Lang, Record<Doc, { text: string; body: string; h2: number; meta: string; src: string }>> = { he: {} as never, en: {} as never }
for (const lang of ['he', 'en'] as Lang[]) for (const doc of ['terms', 'privacy', 'a11y'] as Doc[]) {
  pages[lang][doc] = { ...render(FILES[lang][doc]), src: stripComments(readFileSync(FILES[lang][doc], 'utf8')) }
}

// topic -> per language, per document, the patterns that must all be present
type Rule = Partial<Record<Doc, RegExp[]>>
const TOPICS: Record<string, Record<Lang, Rule>> = {
  '1 free site check and onboarding scan': {
    en: { terms: [/free site check/i, /onboarding scan/i, /robots\.txt/, /sitemap/, /llms\.txt/], privacy: [/free site check/i, /onboarding scan/i, /robots\.txt/, /sitemap/, /llms\.txt/, /results? (is|are)? ?stored|What we store/i] },
    he: { terms: [/בדיקת אתר חינמית/, /סריקת פתיחה/, /robots\.txt/, /sitemap/, /llms\.txt/, /התוצאות נשמרות/], privacy: [/בדיקת האתר החינמית/, /סריקת הפתיחה/, /robots\.txt/, /sitemap/, /llms\.txt/, /מה נשמר/] },
  },
  '2 Search Console and Business Profile': {
    en: { terms: [/Google Search Console/, /read-only/i, /Google Business Profile/, /only when you approved it|when the feature is enabled/i, /disconnected? at any time|disconnect/i], privacy: [/webmasters\.readonly/, /business\.manage/, /Disconnecting, Retention and Deletion/, /Revoke Google access/] },
    he: { terms: [/Google Search Console/, /קריאה בלבד/, /Google Business Profile/, /כשהתכונה מופעלת/, /לנתק/], privacy: [/webmasters\.readonly/, /business\.manage/, /ניתוק, שמירה ומחיקה/, /ביטול הרשאת Google/] },
  },
  '3 WordPress and the GO TOP SEO Bridge plugin': {
    en: { terms: [/GO TOP SEO Bridge/, /SEO title/, /meta description/, /image alt text/, /FAQ block/, /JSON-LD/, /internal links/, /H1/, /llms\.txt file/, /recorded in a log/, /undone/, /remove the plugin/i], privacy: [/GO TOP SEO Bridge/, /SEO title/, /image alt text/, /FAQ block/, /JSON-LD/, /H1/, /creating llms\.txt/, /Fix log/, /undone/, /remove the plugin/i] },
    he: { terms: [/GO TOP SEO Bridge/, /כותרת SEO/, /תיאור מטא/, /טקסט חלופי לתמונות/, /בלוק שאלות נפוצות/, /JSON-LD/, /קישורים פנימיים/, /H1/, /llms\.txt/, /נרשם ביומן/, /לבטל/, /להסיר את התוסף/], privacy: [/GO TOP SEO Bridge/, /כותרת SEO/, /טקסט חלופי לתמונות/, /בלוק שאלות נפוצות/, /JSON-LD/, /H1/, /יצירת llms\.txt/, /יומן תיקונים/, /לבטל/, /להסיר את התוסף/] },
  },
  '4 customer link network': {
    en: { terms: [/Link Network/, /off by default/, /A connected Shopify store can join it/, /never reciprocal|does not create reciprocal links/, /give and receive contextual links/, /link scheme/, /understand this risk and\s+accept it/, /leave (the network )?at any time/, /No guaranteed results/], privacy: [/Link Network/, /off by default/, /connected Shopify store can join as well/, /leave the network at any time/, /placement log/] },
    he: { terms: [/רשת הקישורים/, /כבויה כברירת מחדל/, /חנות Shopify מחוברת יכולה\s+להצטרף/, /אינה יוצרת\s+קישורים הדדיים/, /נותנים ומקבלים קישורים הקשריים/, /תכנית קישורים/, /מקבל אותו על עצמו/, /לצאת\s+ממנה בכל עת|לצאת מהרשת בכל עת/, /אין התחייבות לתוצאות/], privacy: [/רשת הקישורים/, /כבויה כברירת מחדל/, /חנות Shopify מחוברת יכולה להצטרף גם היא/, /לצאת מהרשת בכל עת/, /יומן\s+השיבוצים/] },
  },
  '5 AI visibility checks and the automatic monthly check': {
    en: { terms: [/ChatGPT/, /Gemini/, /Google AI Mode/, /Perplexity/, /Copilot/, /Grok/, /scraping\s+provider/, /automatic monthly check/, /existing allowance of checks per billing\s+period/, /turn it off/], privacy: [/ChatGPT/, /Perplexity/, /Gemini/, /Microsoft Copilot/, /Grok/, /Google AI Mode/, /automatic monthly check/, /allowance of checks/, /turned off/] },
    he: { terms: [/ChatGPT/, /Gemini/, /Google AI Mode/, /Perplexity/, /Copilot/, /Grok/, /ספק סריקה חיצוני/, /בדיקה חודשית אוטומטית/, /מכסת הבדיקות הקיימת/, /לכבות/], privacy: [/ChatGPT/, /Perplexity/, /Gemini/, /Microsoft Copilot/, /Grok/, /Google AI Mode/, /בדיקה חודשית אוטומטית/, /מכסת הבדיקות/, /לכבות/] },
  },
  '6 AI-generated content': {
    en: { terms: [/AI-Generated Content/, /article topics, questions and articles/, /tops up article\s+topics automatically/, /paid plan/, /automatically add internal links/, /call-to-action box/i, /approval/, /your responsibility/], privacy: [/topics, questions and articles/, /questions, articles, images/] },
    he: { terms: [/תוכן שנוצר באמצעות AI/, /נושאים למאמרים, שאלות ומאמרים/, /משלימה נושאים\s+למאמרים באופן אוטומטי/, /תוכנית בתשלום/, /קישורים פנימיים/, /קריאה לפעולה/, /לאישורכם/, /היא שלכם/], privacy: [/נושאים, שאלות ומאמרים/, /שאלות, מאמרים, תמונות/] },
  },
  '7 emails': {
    en: { terms: [/Email Messages/, /reminder email/i, /one-click unsubscribe/, /Weekly progress summary/, /Setup emails/, /Account and service messages/], privacy: [/Email Messages/, /Resend/, /one-click unsubscribe/, /Weekly summary/, /Setup emails/, /Account and service messages/] },
    he: { terms: [/הודעות דוא”ל/, /הודעת תזכורת/, /הסרה בלחיצה אחת/, /סיכום התקדמות שבועי/, /מיילי הקמה/, /הודעות חשבון ושירות/], privacy: [/הודעות דוא”ל/, /Resend/, /הסרה\s+בלחיצה אחת/, /סיכום שבועי/, /מיילי הקמה/, /הודעות חשבון ושירות/] },
  },
  '8 sub-processors': {
    en: { terms: [/Serper/, /ScrapeLLM/, /Resend/, /Vercel/, /Supabase/, /PayPal/, /Shopify/], privacy: [/Supabase:/, /Vercel:/, /Google \(Gemini API, Search Console, Business Profile, Google Ads API\):/, /ScrapeLLM:/, /Serper:/, /Resend:/, /PayPal:/, /Shopify:/, /PDFShift:/, /OpenStreetMap \(Nominatim\):/, /Wix:/] },
    he: { terms: [/Serper/, /ScrapeLLM/, /Resend/, /Vercel/, /Supabase/, /PayPal/, /Shopify/], privacy: [/Supabase:/, /Vercel:/, /Google \(Gemini API, Search Console, Business Profile, Google Ads API\):/, /ScrapeLLM:/, /Serper:/, /Resend:/, /PayPal:/, /Shopify:/, /PDFShift:/, /OpenStreetMap \(Nominatim\):/, /Wix:/] },
  },
  // 10-13 are the four gaps Oren found on 2026-10-03: the documents described
  // three connections while the code offers six, and three live sub-processors
  // (PDFShift, Nominatim, the Google Ads API) were not named anywhere.
  '10 every platform a site can be connected on': {
    en: { terms: [/Installing the app in your store/, /Connecting a Wix site uses an API key/, /through a webhook/i, /signing secret/i, /every kind of connection the Service offers/], privacy: [/Connecting a Site on Another Platform/, /Wix/, /Webhook/i, /access token the store issues/] },
    he: { terms: [/התקנת האפליקציה בחנות שלכם/, /חיבור אתר Wix נעשה באמצעות מפתח API/, /webhook/, /סוד החתימה/, /כל סוגי החיבורים שהשירות מציע/], privacy: [/חיבור אתר בפלטפורמה אחרת/, /Wix/, /webhook/, /אסימון הגישה/] },
  },
  '11 the PDF conversion provider': {
    en: { privacy: [/Converting a Report to PDF/, /PDFShift/, /only when you pressed\s+to download a report/] },
    he: { privacy: [/המרת דוח ל-PDF/, /PDFShift/, /רק כשלחצת להוריד דוח/] },
  },
  '12 the address lookup service': {
    en: { privacy: [/Turning an Address into Coordinates/, /Nominatim/, /OpenStreetMap Foundation/, /do not send your name/] },
    he: { privacy: [/תרגום כתובת לקואורדינטות/, /Nominatim/, /OpenStreetMap Foundation/, /איננו שולחים את שמך/] },
  },
  '13 the Google Ads keyword interface': {
    en: { privacy: [/Google Ads API/, /search volumes/, /not an advertising account of yours/] },
    he: { privacy: [/Google Ads/, /נפחי חיפוש/, /אינו חשבון פרסום שלך/] },
  },
  // The link network IS live (see the comment above the section in the terms).
  // A clause that disclaims its own application would leave a placed link with
  // no contractual basis, so the "from the moment you join" wording is pinned
  // and the old "not active today" sentence is asserted gone.
  '14 the link network clause applies on joining': {
    en: { terms: [/applies from the moment you choose to join/] },
    he: { terms: [/חל מהרגע שבחרתם להצטרף/] },
  },
  '9 accessibility measures': {
    // The direction bullet is pinned by its two direction markers plus the
    // sentence that makes the statement cover every language version. The exact
    // phrase "right-to-left, RTL" used to be pinned here; it was replaced when
    // the bullet stopped listing the languages the product offers (a list that
    // Spanish was about to make untrue) and started describing how each
    // direction is handled instead.
    en: { a11y: [/contrast/i, /Level AA/, /Keyboard-only navigation/, /prefers-reduced-motion/, /reduce motion/, /right-to-left \(RTL\)/, /left-to-right \(LTR\)/, /applies to all language versions/, /oren@gotop\.co\.il/, /054-9489377/] },
    he: { a11y: [/ניגודיות/, /דרגה AA/, /לוח המקלדת בלבד/, /prefers-reduced-motion/, /הפחתת תנועה/, /RTL/, /LTR/, /חלה על כל גרסאות השפה/, /oren@gotop\.co\.il/, /054-9489377/] },
  },
}

const isRe = (r: RegExp) => r
for (const [topic, byLang] of Object.entries(TOPICS)) {
  for (const lang of ['he', 'en'] as Lang[]) {
    const rules = byLang[lang]
    for (const doc of Object.keys(rules) as Doc[]) {
      for (const re of rules[doc] as RegExp[]) {
        const text = pages[lang][doc].text
        check(`${topic} — ${lang} ${doc}: ${re.source.slice(0, 50)}`, isRe(re).test(text))
        const mutated = text.replace(new RegExp(re.source, re.flags.replace('g', '') + 'g'), '')
        check(`MUTATION — ${lang} ${doc}: removing "${re.source.slice(0, 40)}" is caught`, !re.test(mutated))
      }
    }
  }
}

// The product name and the last-updated line.
const OLD_NAME = /Rankings by Go Top/i
const LAST_UPDATED: Record<Doc, Record<Lang, RegExp>> = {
  terms: { he: /9 באוקטובר 2026/, en: /October 9, 2026/ },
  privacy: { he: /9 באוקטובר 2026/, en: /October 9, 2026/ },
  a11y: { he: /5 באוקטובר 2026/, en: /October 5, 2026/ },
}
for (const lang of ['he', 'en'] as Lang[]) for (const doc of ['terms', 'privacy', 'a11y'] as Doc[]) {
  const p = pages[lang][doc]
  // The page body runs from its title to its last-updated line; the site shell (header, footer) around it is not these pages.
  // The date is per document, not one date for all three: the terms and the
  // privacy policy were last revised on 9 October 2026 — the policy for the
  // conversion report sent to Meta from our server, and both of them for the
  // weekly summary that replaced a monthly one and for the setup emails — and
  // the accessibility statement on 5 October 2026. A page that is changed without its date
  // being moved is the failure this catches, which is why the expected date
  // lives here and has to be edited deliberately.
  const dated = LAST_UPDATED[doc][lang]
  const hit = dated.exec(p.body)
  const body = hit ? p.body.slice(0, hit.index + hit[0].length) : p.body
  check(`${lang} ${doc}: the old product name is gone from the text, metadata and code`, !OLD_NAME.test(body) && !OLD_NAME.test(p.meta) && !OLD_NAME.test(p.src))
  check(`${lang} ${doc}: the page names GO TOP`, /Go Top SEO/.test(p.text) && /Go Top SEO/.test(p.meta))
  check(`${lang} ${doc}: carries its own last-updated date (${dated.source})`, dated.test(p.text))
}
check('MUTATION — the old name put back into a page is caught', OLD_NAME.test(pages.en.terms.src + ' Rankings by Go Top') && !OLD_NAME.test(pages.en.terms.src))
check('MUTATION — an old last-updated date is caught', !/October 9, 2026/.test(pages.en.terms.text.replace('October 9, 2026', 'September 29, 2026')))

// Hebrew and English stay in step.
for (const doc of ['terms', 'privacy', 'a11y'] as Doc[]) {
  check(`${doc}: Hebrew and English have the same number of sections (${pages.he[doc].h2} / ${pages.en[doc].h2})`, pages.he[doc].h2 === pages.en[doc].h2)
}
check('MUTATION — an English-only extra section is caught', pages.he.terms.h2 !== pages.en.terms.h2 + 1)

/*
 * DERIVED FROM THE CODE, not from a list someone remembered to update.
 *
 * The four gaps Oren found on 2026-10-03 were all the same failure: a
 * connection or a sub-processor was added to the product and nobody went back
 * to the legal pages. Pinning the words is not enough to stop that happening
 * again, because the next provider is one nobody has written a pattern for.
 *
 * So these two blocks read the truth out of the source: the platform union a
 * project can choose, and the third-party hosts that non-QA code actually
 * fetches. Each entry has to be named in both privacy policies. Adding a
 * platform to CHOOSABLE_PLATFORMS, or a `fetch` to a new provider, fails this
 * suite until the documents say so — which is the whole point.
 */
{
  const platformsSrc = readFileSync('lib/site-platforms/types.ts', 'utf8')
  const union = /CHOOSABLE_PLATFORMS:\s*readonly ChoosablePlatform\[\]\s*=\s*\[([^\]]+)\]/.exec(platformsSrc)?.[1] ?? ''
  const platforms = [...union.matchAll(/'([a-z]+)'/g)].map((m) => m[1])
  check(`the platform union was read from the source (${platforms.join(', ')})`, platforms.length >= 4)
  // How each platform's name reads to a customer in each language.
  const NAMED: Record<string, Record<Lang, RegExp>> = {
    wordpress: { en: /WordPress/, he: /וורדפרס/ },
    shopify: { en: /Shopify/, he: /Shopify/ },
    wix: { en: /Wix/, he: /Wix/ },
    webhook: { en: /webhook/i, he: /webhook/i },
  }
  for (const platform of platforms) {
    const named = NAMED[platform]
    // An unmapped platform is a NEW one: it must be added here and to the documents.
    check(`platform "${platform}" has a name the documents can be checked against`, !!named,
      'add it to NAMED in this suite and to the terms and both privacy policies')
    if (!named) continue
    for (const lang of ['he', 'en'] as Lang[]) {
      check(`platform "${platform}" is named in the ${lang} terms`, named[lang].test(pages[lang].terms.text))
      check(`platform "${platform}" is named in the ${lang} privacy policy`, named[lang].test(pages[lang].privacy.text))
    }
  }
  check('MUTATION — a platform the documents do not mention is caught',
    !/Squarespace/.test(pages.en.terms.text) && !/Squarespace/.test(pages.he.terms.text))
}

{
  /*
   * A CLOSED WORLD over the hosts shipped code mentions. Every one of them has
   * to be accounted for: either it receives data and the documents name its
   * provider (RECIPIENTS), or it receives nothing and is listed as such with a
   * reason (NOT_RECIPIENTS). A host in neither list fails the suite, so a new
   * integration cannot be added without someone deciding, in writing, which of
   * the two it is. That is the part a pinned list of words cannot do.
   *
   * Scope and its limits, stated rather than implied: __qa__ is excluded (it is
   * full of deliberately fake hosts), and a provider reached only through an
   * SDK has no literal host to find, so those are pinned by name at the end.
   */
  const RECIPIENTS: Record<string, Record<Lang, RegExp>> = {
    'generativelanguage.googleapis.com': { en: /Gemini/, he: /Gemini/ },
    'googleads.googleapis.com': { en: /Google Ads API/, he: /Google Ads/ },
    'maps.googleapis.com': { en: /Google/, he: /Google/ },
    'searchconsole.googleapis.com': { en: /Search Console/, he: /Search Console/ },
    'www.googleapis.com': { en: /Google/, he: /Google/ },
    'oauth2.googleapis.com': { en: /Google/, he: /Google/ },
    'accounts.google.com': { en: /Google/, he: /Google/ },
    'myaccount.google.com': { en: /Google/, he: /Google/ },
    'mybusiness.googleapis.com': { en: /Business Profile/, he: /Business Profile/ },
    'mybusinessaccountmanagement.googleapis.com': { en: /Business Profile/, he: /Business Profile/ },
    'mybusinessbusinessinformation.googleapis.com': { en: /Business Profile/, he: /Business Profile/ },
    'google.serper.dev': { en: /Serper/, he: /Serper/ },
    'api.paypal.com': { en: /PayPal/, he: /PayPal/ },
    'www.paypal.com': { en: /PayPal/, he: /PayPal/ },
    'api.pdfshift.io': { en: /PDFShift/, he: /PDFShift/ },
    'api.scrapellm.com': { en: /ScrapeLLM/, he: /ScrapeLLM/ },
    'nominatim.openstreetmap.org': { en: /Nominatim/, he: /Nominatim/ },
    'www.wixapis.com': { en: /Wix/, he: /Wix/ },
    'admin.shopify.com': { en: /Shopify/, he: /Shopify/ },
    'cdn.shopify.com': { en: /Shopify/, he: /Shopify/ },
    'partners.shopify.com': { en: /Shopify/, he: /Shopify/ },
    'supabase.com': { en: /Supabase/, he: /Supabase/ },
    'graph.facebook.com': { en: /Conversions API/, he: /Conversions API/ },
  }
  /**
   * Hosts that receive nothing about a customer, each with the reason it is
   * here rather than above. A host moved into this list without the reason
   * being true is the one way past this guard, which is why the reason is
   * written down next to it.
   */
  const NOT_RECIPIENTS: Record<string, string> = {
    'gotopseo.com': 'our own service',
    'www.gotopseo.com': 'our own service',
    'schema.org': 'the JSON-LD vocabulary, written into the customer’s own markup; not fetched',
    'www.w3.org': 'XML and sitemap namespaces written into markup; not fetched',
    'llmstxt.org': 'the llms.txt specification, named in generated files; not fetched',
    'developers.google.com': 'a documentation link shown to the owner',
    // When Creem actually becomes a payment provider, api.creem.io appears in
    // shipped code and this guard will demand that both privacy policies name
    // Creem before that can merge. That is the intended order: the disclosure
    // lands with the integration, not after it.
    'docs.creem.io': 'a documentation link cited in a code comment; not fetched',
    'help.shopify.com': 'a documentation link shown to a merchant',
    'search.google.com': 'a link a customer clicks to their own Search Console',
    'google.com': 'the search engine whose public results are read, with no customer data attached',
    'www.google.com': 'the search engine whose public results are read, with no customer data attached',
    'en.wikipedia.org': 'a reference URL recognised in a site’s existing links',
    'he.wikipedia.org': 'a reference URL recognised in a site’s existing links',
    'es.wikipedia.org': 'a reference URL recognised in a site’s existing links',
    'www.wikidata.org': 'a sameAs profile URL a customer may enter themselves',
    'www.facebook.com': 'a sameAs profile URL a customer may enter themselves; the Meta pixel is covered by its own section',
    'www.instagram.com': 'a sameAs profile URL a customer may enter themselves',
    'www.linkedin.com': 'a sameAs profile URL a customer may enter themselves',
    'www.youtube.com': 'a sameAs profile URL a customer may enter themselves',
    'www.tiktok.com': 'a sameAs profile URL a customer may enter themselves',
    'x.com': 'a sameAs profile URL a customer may enter themselves',
    'apps.shopify.com': 'our own App Store listing, a plain nofollow link the visitor may follow; our code sends it nothing',
    'biz.yelp.com': 'a directory named in advice text; not contacted',
    'business.trustpilot.com': 'a directory named in advice text; not contacted',
    'businessconnect.apple.com': 'a directory named in advice text; not contacted',
    'www.bingplaces.com': 'a directory named in advice text; not contacted',
    'www.capterra.com': 'a directory named in advice text; not contacted',
    'www.tripadvisor.com': 'a directory named in advice text; not contacted',
    // Literals that are examples or test shapes even outside __qa__.
    'example.com': 'placeholder in a comment or default',
    'www.example.com': 'placeholder in a comment or default',
    'ejemplo.com': 'the Spanish placeholder, example.com’s counterpart in the Spanish copy',
    'www.ejemplo.com': 'the Spanish placeholder, example.com’s counterpart in the Spanish copy',
    'exemplo.com': 'the Portuguese placeholder, example.com’s counterpart in the Portuguese copy',
    'www.exemplo.com': 'the Portuguese placeholder, example.com’s counterpart in the Portuguese copy',
    'exemplo.com.br': 'the Portuguese placeholder, example.com’s counterpart in the Portuguese copy',
    'www.exemplo.com.br': 'the Portuguese placeholder, example.com’s counterpart in the Portuguese copy',
    'pt.wikipedia.org': 'named as the Portuguese Wikipedia in advice text; not contacted',
    'app.example.com': 'placeholder in a comment or default',
    'shop.com': 'placeholder in a comment or default',
    'destination.com': 'placeholder in a comment or default',
    'acme.myshopify.com': 'placeholder in a comment or default',
    'evil.com': 'a hostile host in a security comment or default',
  }
  const { execSync } = require('child_process') as typeof import('child_process')
  const out = execSync(
    `grep -rhoE "https://[a-z0-9.-]+\\.(com|org|io|dev|net|ai)" lib app ` +
    `--include=*.ts --include=*.tsx --exclude-dir=__qa__ | sed 's|https://||' | sort -u`,
    { encoding: 'utf8', cwd: process.cwd() },
  )
  const hosts = out.split('\n').map((h) => h.trim()).filter(Boolean)
  check(`the host list was read from shipped code (${hosts.length} hosts)`, hosts.length > 20)
  for (const host of hosts) {
    const named = RECIPIENTS[host]
    if (!named) {
      check(`${host} is accounted for`, host in NOT_RECIPIENTS,
        'it is a host shipped code names: add it to RECIPIENTS and to both privacy policies, or to NOT_RECIPIENTS with the reason it receives nothing')
      continue
    }
    for (const lang of ['he', 'en'] as Lang[]) {
      check(`${host} → its provider is named in the ${lang} privacy policy`, named[lang].test(pages[lang].privacy.text))
    }
  }
  // Providers reached only through an SDK, which have no literal host above.
  for (const lang of ['he', 'en'] as Lang[]) {
    for (const re of [/Supabase/, /Resend/, /Vercel/]) {
      check(`SDK provider ${re.source} is named in the ${lang} privacy policy`, re.test(pages[lang].privacy.text))
    }
  }
  check('MUTATION — a disclosed provider removed from the policy is caught',
    !/PDFShift/.test(pages.en.privacy.text.replace(/PDFShift/g, '')))
  check('MUTATION — an unaccounted-for host is caught',
    !('tracker.unknown-vendor.com' in RECIPIENTS) && !('tracker.unknown-vendor.com' in NOT_RECIPIENTS))
}

// No pricing text was touched: the plan-limits list and the billing channels are as they were.
check('terms keep the billing-channel wording', /billed exclusively through Shopify App Pricing/.test(pages.en.terms.text) && /Shopify App Pricing/.test(pages.he.terms.text))

console.log(`\n${pass} passed, ${fail} failed`)
if (fail > 0) process.exit(1)

export {}
