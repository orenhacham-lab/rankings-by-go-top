/**
 * Cancellation and refund policy (owner decision, 3 October 2026): no refund
 * for a paid period, except where the law requires one (a consumer's statutory
 * cancellation right). Cancel any time; access stays to the end of the paid period.
 *
 * Guards: both pages exist and say exactly that, they never promise a refund
 * window or a discretionary refund, the terms' refunds section matches and links
 * to the policy, the footer and both sitemaps link it, and /refund-policy is a
 * known Hebrew public segment.
 *
 * MUTATION CONTROL. Each content pattern is re-run against the text with its
 * matches removed and must then fail; the forbidden patterns are re-run against
 * the text with a forbidden phrase added and must then fire.
 *
 * Run: npx tsx components/public/__qa__/refund-policy.qa.ts
 */
import { existsSync, readFileSync } from 'fs'

let pass = 0, fail = 0
function check(name: string, cond: boolean) {
  if (cond) { pass++; console.log(`  ✓ ${name}`) } else { fail++; console.log(`  ✗ ${name}`) }
}

const read = (p: string) => readFileSync(p, 'utf8').replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '')
const flat = (s: string) => s.replace(/\s+/g, ' ')

const he = flat(read('app/(legal)/refund-policy/page.tsx'))
const en = flat(read('app/(public)/en/refund-policy/page.tsx'))
const termsHe = flat(read('app/(public)/terms/page.tsx'))
const termsEn = flat(read('app/(public)/en/terms/page.tsx'))
// The terms' refunds section only (other sections may legitimately say "discretion").
const section = (t: string, h: RegExp) => { const m = h.exec(t); return m ? t.slice(m.index, t.indexOf('</section>', m.index)) : '' }
const refundsHe = section(termsHe, /<h2>7\. החזרים<\/h2>/)
const refundsEn = section(termsEn, /<h2>7\. Refunds<\/h2>/)

const REQUIRED: Array<[string, string, RegExp]> = [
  ['he', 'no refund for a paid period', /תשלום על תקופת מנוי אינו מוחזר/],
  ['he', 'the only exception is the law', /החריג היחיד הוא מקרה שבו הדין מחייב החזר/],
  ['he', 'cancel any time', /אפשר לבטל את חידוש המנוי בכל עת/],
  ['he', 'access to the end of the paid period', /הגישה לתוכנית נשמרת עד סוף תקופת החיוב ששולמה/],
  ['he', 'names the company', /Go Top Digital Marketing &amp; Advertising Ltd\./],
  ['en', 'no refund for a paid period', /Subscription payments are not refunded/],
  ['en', 'the only exception is the law', /The only exception is where the law requires a refund/],
  ['en', 'cancel any time', /You can cancel renewal at any time/],
  ['en', 'access to the end of the paid period', /You keep access to your plan until the end of the period you have already paid for/],
  ['en', 'names the company', /Go Top Digital Marketing &amp; Advertising Ltd\./],
]
for (const [lang, name, re] of REQUIRED) {
  const text = lang === 'he' ? he : en
  check(`${lang} refund policy: ${name}`, re.test(text))
  check(`MUTATION — ${lang} "${name}" removed is caught`, !re.test(text.replace(new RegExp(re.source, 'g'), '')))
}

// Never a refund window, a money-back promise, or a discretionary refund.
const FORBIDDEN_EN = /money[- ]back|full refund within|refund within \d+|at (our|its) (sole )?discretion|exceptional (cases|circumstances)/i
const FORBIDDEN_HE = /החזר מלא תוך|תוך \d+ ימים מהתשלום|לפי שיקול דעת|במקרים חריגים|במקרים מיוחדים/
check('en terms §7 found', refundsEn.length > 0)
check('en policy and terms §7 promise no refund window or discretionary refund', !FORBIDDEN_EN.test(en) && !FORBIDDEN_EN.test(refundsEn))
check('he terms §7 found', refundsHe.length > 0)
check('he policy and terms §7 promise no refund window or discretionary refund', !FORBIDDEN_HE.test(he) && !FORBIDDEN_HE.test(refundsHe))
check('MUTATION — an English refund window is caught', FORBIDDEN_EN.test(en + ' full refund within 14 days'))
check('MUTATION — a Hebrew discretionary refund is caught', FORBIDDEN_HE.test(refundsHe + ' לפי שיקול דעתה'))

// The terms' refunds section agrees and links the policy.
check('he terms §7: refund only where the law requires, linked', /למעט מקרים שבהם הדין מחייב החזר/.test(refundsHe) && /href="\/refund-policy"/.test(refundsHe))
check('en terms §7: refund only where the law requires, linked', /except where the law requires a refund/.test(refundsEn) && /href="\/en\/refund-policy"/.test(refundsEn))

// Reachable: footer, both sitemaps, the XML sitemap, the Hebrew segment list.
const footer = read('components/Footer.tsx')
// The footer names the legal pages under legalPrefix, which is now the page's
// own prefix: each language has its own documents, Spanish included.
check('footer links the policy in every language', /href=\{`\$\{legalPrefix\}\/refund-policy`\}/.test(footer)
  && /const legalPrefix = prefix/.test(footer)
  && /refundPolicy: 'מדיניות ביטול והחזרים'/.test(read('lib/i18n/public/he.ts'))
  && /refundPolicy: 'Cancellation and Refund Policy'/.test(read('lib/i18n/public/en.ts'))
  && /refundPolicy: 'Política de cancelación y reembolso'/.test(read('lib/i18n/public/es.ts')))
check('and the Spanish policy is a page with a text behind it',
  existsSync('app/(public)/es/refund-policy/page.tsx')
  && /Pol[íi]tica de cancelaci[óo]n y reembolso/.test(read('content/legal/es/refund-policy.md')))
check('he sitemap page lists it', /href: '\/refund-policy'/.test(read('app/(public)/sitemap/page.tsx')))
check('en sitemap page lists it', /href: '\/en\/refund-policy'/.test(read('app/(public)/en/sitemap/page.tsx')))
const xml = read('app/sitemap.xml/route.ts')
check('sitemap.xml lists both', /\$\{baseUrl\}\/refund-policy`/.test(xml) && /\$\{baseUrl\}\/en\/refund-policy`/.test(xml))
check('refund-policy is a Hebrew public segment', /'refund-policy'/.test(read('lib/i18n/request-locale.ts')))
check('MUTATION — a footer without the link is caught', !/href=\{`\$\{prefix\}\/refund-policy`\}/.test(footer.replace(/\/refund-policy/g, '/terms')))

console.log(`\n${pass} passed, ${fail} failed`)
if (fail) process.exit(1)
export {}
