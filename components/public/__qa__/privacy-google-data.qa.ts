/* eslint-disable @typescript-eslint/no-require-imports */
/**
 * Privacy policy — Google OAuth verification content, in BOTH languages.
 *
 * Google's reviewers read the privacy page linked from the consent screen and
 * look for: the Google data the app reads and stores, the Limited Use statement
 * (verbatim reference to the Google API Services User Data Policy), who else
 * receives the data (AI providers), how tokens are protected, and how a user
 * disconnects, deletes and revokes (including myaccount.google.com/permissions).
 *
 * The two pages are RENDERED with react-dom/server and their visible text is
 * asserted, so a section that is commented out or not rendered fails.
 * Mutation controls: each predicate is run against a copy of the real text
 * with the required part removed, and must then fail.
 *
 * Run: npx tsx components/public/__qa__/privacy-google-data.qa.ts
 */
import { renderToStaticMarkup } from 'react-dom/server'
import { createElement } from 'react'

let pass = 0, fail = 0
function check(name: string, cond: boolean, detail?: string) {
  if (cond) { pass++; console.log(`  ✓ ${name}`) } else { fail++; console.log(`  ✗ ${name}${detail ? ` — ${detail}` : ''}`) }
}

const POLICY_URL = 'https://developers.google.com/terms/api-services-user-data-policy'
const PERMISSIONS_URL = 'https://myaccount.google.com/permissions'

function render(path: string): { html: string; text: string } {
  const mod = require(path)
  const html = renderToStaticMarkup(createElement(mod.default))
  const text = html.replace(/<[^>]+>/g, ' ').replace(/&#x27;|&#39;/g, "'").replace(/&amp;/g, '&').replace(/&quot;/g, '"').replace(/\s+/g, ' ')
  return { html, text }
}

type Lang = 'en' | 'he'

/** The Limited Use statement, as Google words it. */
function limitedUseOk(text: string, lang: Lang): boolean {
  if (lang === 'en') {
    return /Rankings by Go Top’s use and transfer of information received from Google APIs to any other app will adhere to the\s*Google API Services User Data Policy\s*, including the Limited Use requirements/.test(text)
  }
  return /השימוש של Rankings by Go Top במידע שמתקבל מממשקי ה-API של Google, והעברתו לכל אפליקציה אחרת, יעמדו במדיניות\s*Google API Services User Data Policy\s*, כולל דרישות ה-Limited Use/.test(text)
}

/** The Google data section: its heading, both scopes, what is read, and the commitments. */
const SECTION: Record<Lang, { name: string; re: RegExp }[]> = {
  en: [
    { name: 'section heading', re: /Data We Receive from Google/ },
    { name: 'Search Console read-only scope', re: /webmasters\.readonly/ },
    { name: 'Search Console data read (queries, pages, clicks, impressions)', re: /search queries and pages with their clicks, impressions/ },
    { name: 'Business Profile scope', re: /business\.manage/ },
    { name: 'Business Profile data read (locations)', re: /Business Profile accounts you manage and their business locations/ },
    { name: 'no sale, no advertising', re: /We do not sell Google user data, and we do not use or transfer it for advertising/ },
    { name: 'no AI model training', re: /do not use Google user data to develop, improve or train generalised AI/ },
    { name: 'human access limits', re: /We do not allow people to read this data, unless you give us permission/ },
    { name: 'token encryption', re: /encrypted\s+with AES-256-GCM/ },
    { name: 'disconnect in the app', re: /Disconnect property from project[\s\S]*Revoke Google access for the whole account[\s\S]*“Disconnect” asks Google to revoke our access/ },
    { name: 'deletion request contact', re: /to delete your account or the Google data stored with it, email us/ },
    { name: 'revoke at Google', re: /myaccount\.google\.com\/permissions/ },
    { name: 'AI providers: Gemini', re: /AI Providers[\s\S]*Google Gemini \(Gemini API\)/ },
    { name: 'AI providers: ScrapeLLM gets no Google account data', re: /ScrapeLLM:[^.]*[\s\S]{0,400}It does not receive data from your Google account/ },
  ],
  he: [
    { name: 'section heading', re: /נתונים שאנו מקבלים מ-Google/ },
    { name: 'Search Console read-only scope', re: /webmasters\.readonly/ },
    { name: 'Search Console data read (queries, pages, clicks, impressions)', re: /שאילתות חיפוש ועמודים, עם הקליקים, החשיפות/ },
    { name: 'Business Profile scope', re: /business\.manage/ },
    { name: 'Business Profile data read (locations)', re: /חשבונות Business Profile שאתה מנהל ואת מיקומי העסק/ },
    { name: 'no sale, no advertising', re: /איננו מוכרים נתוני משתמש מ-Google, ואיננו משתמשים בהם או מעבירים אותם לצורכי פרסום/ },
    { name: 'no AI model training', re: /איננו משתמשים בנתוני משתמש מ-Google כדי לפתח, לשפר או לאמן מודלים כלליים/ },
    { name: 'human access limits', re: /איננו מאפשרים לאנשים לקרוא את הנתונים האלה, אלא אם נתת לנו רשות/ },
    { name: 'token encryption', re: /מוצפנים ב-AES-256-GCM/ },
    { name: 'disconnect in the app', re: /ניתוק הנכס מהפרויקט[\s\S]*ביטול הרשאת Google לכל החשבון[\s\S]*“ניתוק” מבקש מ-Google לבטל את הגישה שלנו/ },
    { name: 'deletion request contact', re: /כדי למחוק את החשבון שלך או את נתוני Google שנשמרו בו, כתוב לנו/ },
    { name: 'revoke at Google', re: /myaccount\.google\.com\/permissions/ },
    { name: 'AI providers: Gemini', re: /ספקי AI[\s\S]*Google Gemini \(Gemini API\)/ },
    { name: 'AI providers: ScrapeLLM gets no Google account data', re: /ScrapeLLM:[\s\S]{0,400}הוא אינו מקבל נתונים מחשבון Google שלך/ },
  ],
}
const sectionMissing = (text: string, lang: Lang) => SECTION[lang].filter((r) => !r.re.test(text)).map((r) => r.name)

/** Links a reviewer clicks: the policy and Google's permissions page. */
const linksOk = (html: string) => html.includes(`href="${POLICY_URL}"`) && html.includes(`href="${PERMISSIONS_URL}"`)

/**
 * Claims the code does NOT back must not appear. Search Console disconnect keeps
 * synced data, and no retention period or certification exists in the code.
 */
const OVERCLAIMS: Record<Lang, RegExp[]> = {
  en: [/synced data (is|are) deleted/i, /deleted within \d+/i, /retain(ed)? for \d+/i, /\b(SOC ?2|ISO ?27001|certified)\b/i, /never (store|keep) (any|your) Google data/i],
  he: [/נמחקים תוך \d+/, /נשמרים למשך \d+/, /SOC ?2|ISO ?27001/],
}
const overclaims = (text: string, lang: Lang) => OVERCLAIMS[lang].filter((re) => re.test(text)).map(String)

function main() {
  console.log('Privacy policy — Google user data, both languages\n')
  const pages: [Lang, string][] = [['en', '../../../app/(public)/en/privacy/page'], ['he', '../../../app/(legal)/privacy/page']]
  const rendered = {} as Record<Lang, { html: string; text: string }>
  for (const [lang, path] of pages) {
    try { rendered[lang] = render(path) } catch (e) { rendered[lang] = { html: '', text: '' }; check(`${lang}: page renders`, false, String(e)) }
  }

  for (const [lang] of pages) {
    const { html, text } = rendered[lang]
    console.log(`\n${lang.toUpperCase()}`)
    check(`${lang}: rendered to real markup`, text.length > 2000, String(text.length))
    check(`${lang}: Limited Use statement present`, limitedUseOk(text, lang))
    const missing = sectionMissing(text, lang)
    check(`${lang}: Google data section complete`, missing.length === 0, missing.join(', '))
    check(`${lang}: policy and permissions links present`, linksOk(html))
    const over = overclaims(text, lang)
    check(`${lang}: no claim the code does not back`, over.length === 0, over.join(', '))
    check(`${lang}: Shopify billing statement untouched`, lang === 'en'
      ? /billing authority is Shopify/.test(text) && /never\s*direct them to PayPal/.test(text)
      : /סמכות\s*החיוב שלהם היא Shopify/.test(text) && /איננו מפנים אותם ל-PayPal/.test(text))
  }

  console.log('\nMUTATION CONTROLS')
  for (const [lang] of pages) {
    const { html, text } = rendered[lang]
    const noLimitedUse = text.replace(/Limited Use/g, 'Limited')
    check(`${lang}: MUTATION — Limited Use wording removed is caught`, !limitedUseOk(noLimitedUse, lang))
    const noPolicyName = text.replace(/Google API Services User Data Policy/g, 'Google policies')
    check(`${lang}: MUTATION — policy name removed is caught`, !limitedUseOk(noPolicyName, lang))
    const heading = lang === 'en' ? 'Data We Receive from Google' : 'נתונים שאנו מקבלים מ-Google'
    check(`${lang}: MUTATION — Google data section removed is caught`, sectionMissing(text.split(heading).join(''), lang).length > 0)
    check(`${lang}: MUTATION — revoke link removed is caught`, sectionMissing(text.replace(/myaccount\.google\.com\/permissions/g, ''), lang).includes('revoke at Google'))
    check(`${lang}: MUTATION — Gemini provider removed is caught`, sectionMissing(text.replace(/Google Gemini \(Gemini API\)/g, 'Google'), lang).includes('AI providers: Gemini'))
    check(`${lang}: MUTATION — policy link removed is caught`, !linksOk(html.replace(POLICY_URL, 'https://example.com/')))
    const invented = lang === 'en' ? `${text} Synced data is deleted within 30 days.` : `${text} הנתונים נמחקים תוך 30 ימים.`
    check(`${lang}: MUTATION — invented retention period is caught`, overclaims(invented, lang).length > 0)
  }

  console.log(`\n${pass} passed, ${fail} failed`)
  if (fail > 0) process.exit(1)
}

main()

export {}
