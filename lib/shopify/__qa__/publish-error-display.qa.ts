/**
 * Stored Shopify publish errors are translated, never shown raw.
 * Run: npx tsx lib/shopify/__qa__/publish-error-display.qa.ts
 */
import { readFileSync } from 'fs'
import { join } from 'path'
import { publishErrorKey, embeddedPublishErrorMessage } from '../publish-error-display'
import { dashboardEn as en } from '../../i18n/dashboard/en'
import { dashboardHe as he } from '../../i18n/dashboard/he'

let pass = 0
let fail = 0
function check(name: string, cond: boolean, detail?: string) {
  if (cond) { pass++; console.log(`  ✓ ${name}`) } else { fail++; console.log(`  ✗ ${name}${detail ? ` — ${detail}` : ''}`) }
}
const ROOT = join(__dirname, '..', '..', '..')
const strip = (s: string) => s.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:])\/\/.*$/gm, '$1')

const INCIDENT = 'shopify_billing_no_active_shopify_plan: no_subscription'
check('the incident string maps to billing_not_entitled', publishErrorKey(INCIDENT) === 'billing_not_entitled')
check('verification outages map to billing_unavailable', publishErrorKey('shopify_billing_billing_verification_unavailable: timeout') === 'billing_unavailable')
check('unknown billing reasons still map to a billing message', publishErrorKey('shopify_billing_something_new') === 'billing_not_entitled')
check('plain API reasons pass through', publishErrorKey('rate_limited') === 'rate_limited')
check('empty → null', publishErrorKey(null) === null && publishErrorKey('') === null)

const msg = embeddedPublishErrorMessage(INCIDENT) ?? ''
check('embedded app never shows the raw code', !/shopify_billing_|no_subscription|no_active/.test(msg), msg)
check('embedded app tells the merchant what to do', /Choose a plan/.test(msg), msg)
check('unknown stored text → generic message, not the text', embeddedPublishErrorMessage('weird_internal_code: secret detail') === embeddedPublishErrorMessage('exact_failure'))
check('MUTATION CONTROL: the raw guard would catch the incident string', /shopify_billing_|no_subscription/.test(INCIDENT))

for (const [name, dict] of [['en', en], ['he', he]] as const) {
  const errors = (dict as unknown as { contentHub: { editor: { shopifyPublish: { errors: Record<string, string> } } } }).contentHub.editor.shopifyPublish.errors
  check(`${name}: dashboard has billing_not_entitled and billing_unavailable`, !!errors.billing_not_entitled && !!errors.billing_unavailable)
}

const comp = strip(readFileSync(join(ROOT, 'components/content/ShopifyPublishSettings.tsx'), 'utf8'))
check('dashboard component translates the stored error on load', /publishErrorKey\(initialLastError\)/.test(comp) && !/useState<string \| null>\(initialLastError\)/.test(comp))
check('dashboard component no longer appends the raw detail', !/data\.detail/.test(comp))
const home = strip(readFileSync(join(ROOT, 'app/api/shopify/app-home/route.ts'), 'utf8'))
check('app-home ships a translated message, not the column', /lastError: embeddedPublishErrorMessage\(lastArticle\.shopify_last_error\)/.test(home))
const signup = strip(readFileSync(join(ROOT, 'app/(auth)/signup/page.tsx'), 'utf8'))
check('signup explains weak_password instead of "signup failed"', /code === 'weak_password'/.test(signup) && /weakPasswordLength/.test(signup) && /reasons\.includes\('pwned'\)/.test(signup))

console.log(`\n${pass} passed, ${fail} failed`)
if (fail > 0) process.exit(1)
export {}
