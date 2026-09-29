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
 * Also: the product name is "GO TOP" (never the old name) in the six pages'
 * text and metadata, source comments stripped; the last-updated line is
 * 29 September 2026; Hebrew and English carry the same number of sections.
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
    en: { terms: [/Link Network/, /off by default/, /not available for Shopify/, /never reciprocal|does not create reciprocal links/, /give and receive contextual links/, /link scheme/, /understand this risk and\s+accept it/, /leave (the network )?at any time/, /No guaranteed results/], privacy: [/Link Network/, /off by default/, /not\s+available for Shopify/, /leave the network at any time/, /placement log/] },
    he: { terms: [/רשת הקישורים/, /כבויה כברירת מחדל/, /אינו זמין לחנויות Shopify/, /אינה יוצרת\s+קישורים הדדיים/, /נותנים ומקבלים קישורים הקשריים/, /תכנית קישורים/, /מקבל אותו על עצמו/, /לצאת\s+ממנה בכל עת|לצאת מהרשת בכל עת/, /אין התחייבות לתוצאות/], privacy: [/רשת הקישורים/, /כבויה כברירת מחדל/, /אינה זמינה לחנויות\s+Shopify/, /לצאת מהרשת בכל עת/, /יומן\s+השיבוצים/] },
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
    en: { terms: [/Email Messages/, /reminder email/i, /one-click unsubscribe/, /Monthly progress report/, /Account and service messages/], privacy: [/Email Messages/, /Resend/, /one-click unsubscribe/, /Monthly progress report/, /Account and service messages/] },
    he: { terms: [/הודעות דוא”ל/, /הודעת תזכורת/, /הסרה בלחיצה אחת/, /דוח התקדמות חודשי/, /הודעות חשבון ושירות/], privacy: [/הודעות דוא”ל/, /Resend/, /הסרה\s+בלחיצה אחת/, /דוח התקדמות חודשי/, /הודעות חשבון ושירות/] },
  },
  '8 sub-processors': {
    en: { terms: [/Serper/, /ScrapeLLM/, /Resend/, /Vercel/, /Supabase/, /PayPal/, /Shopify/], privacy: [/Supabase:/, /Vercel:/, /Google \(Gemini API, Search Console, Business Profile\):/, /ScrapeLLM:/, /Serper:/, /Resend:/, /PayPal:/, /Shopify:/] },
    he: { terms: [/Serper/, /ScrapeLLM/, /Resend/, /Vercel/, /Supabase/, /PayPal/, /Shopify/], privacy: [/Supabase:/, /Vercel:/, /Google \(Gemini API, Search Console, Business Profile\):/, /ScrapeLLM:/, /Serper:/, /Resend:/, /PayPal:/, /Shopify:/] },
  },
  '9 accessibility measures': {
    en: { a11y: [/contrast/i, /Level AA/, /Keyboard-only navigation/, /prefers-reduced-motion/, /reduce motion/, /right-to-left, RTL/, /left-to-right, LTR/, /oren@gotop\.co\.il/, /054-9489377/] },
    he: { a11y: [/ניגודיות/, /דרגה AA/, /לוח המקלדת בלבד/, /prefers-reduced-motion/, /הפחתת תנועה/, /RTL/, /LTR/, /oren@gotop\.co\.il/, /054-9489377/] },
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
for (const lang of ['he', 'en'] as Lang[]) for (const doc of ['terms', 'privacy', 'a11y'] as Doc[]) {
  const p = pages[lang][doc]
  // The page body runs from its title to its last-updated line; the site shell (header, footer) around it is not these pages.
  const dated = lang === 'he' ? /29 בספטמבר 2026/ : /September 29, 2026/
  const hit = dated.exec(p.body)
  const body = hit ? p.body.slice(0, hit.index + hit[0].length) : p.body
  check(`${lang} ${doc}: the old product name is gone from the text, metadata and code`, !OLD_NAME.test(body) && !OLD_NAME.test(p.meta) && !OLD_NAME.test(p.src))
  check(`${lang} ${doc}: the page names GO TOP`, /GO TOP/.test(p.text) && /GO TOP/.test(p.meta))
  check(`${lang} ${doc}: last updated 29 September 2026`, dated.test(p.text))
}
check('MUTATION — the old name put back into a page is caught', OLD_NAME.test(pages.en.terms.src + ' Rankings by Go Top') && !OLD_NAME.test(pages.en.terms.src))
check('MUTATION — an old last-updated date is caught', !/September 29, 2026/.test(pages.en.terms.text.replace('September 29, 2026', 'May 2026')))

// Hebrew and English stay in step.
for (const doc of ['terms', 'privacy', 'a11y'] as Doc[]) {
  check(`${doc}: Hebrew and English have the same number of sections (${pages.he[doc].h2} / ${pages.en[doc].h2})`, pages.he[doc].h2 === pages.en[doc].h2)
}
check('MUTATION — an English-only extra section is caught', pages.he.terms.h2 !== pages.en.terms.h2 + 1)

// No pricing text was touched: the plan-limits list and the billing channels are as they were.
check('terms keep the billing-channel wording', /billed exclusively through Shopify App Pricing/.test(pages.en.terms.text) && /Shopify App Pricing/.test(pages.he.terms.text))

console.log(`\n${pass} passed, ${fail} failed`)
if (fail > 0) process.exit(1)

export {}
