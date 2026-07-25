/**
 * K2 — when a platform is connected, the project's Content section shows a
 * connected-state explainer + a "go to the Content Hub" button. It must be a
 * pointer to the hub, NOT a second Content Hub embedded in the project page.
 */
import { readFileSync } from 'fs'
import { join } from 'path'
import { getDashboardDictionary } from '../../../lib/i18n/dashboard/getDashboardDictionary'

let pass = 0, fail = 0
function check(name: string, cond: boolean, detail?: string) {
  if (cond) { pass++; console.log(`  ✓ ${name}`) } else { fail++; console.log(`  ✗ ${name}${detail ? ` — ${detail}` : ''}`) }
}
const ROOT = join(__dirname, '..', '..', '..')
const read = (p: string) => readFileSync(join(ROOT, p), 'utf8')
const strip = (s: string) => s.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:])\/\/[^\n]*/g, '$1')

function main() {
  console.log('K2 — connected-state explainer + Content Hub link')

  // i18n present in both locales.
  for (const loc of ['he', 'en'] as const) {
    const cs = getDashboardDictionary(loc).projectDetail.contentSection as Record<string, unknown>
    check(`(${loc}) connectedTitle/connectedBody/goToContentHub exist`,
      typeof cs.connectedTitle === 'string' && typeof cs.connectedBody === 'string' && typeof cs.goToContentHub === 'string')
  }
  const en = getDashboardDictionary('en').projectDetail.contentSection as unknown as Record<string, string>
  check('en explainer mentions the core capabilities (topics/schedule/publish)',
    /topic/i.test(en.connectedBody) && /schedul/i.test(en.connectedBody) && /publish/i.test(en.connectedBody))

  const src = strip(read('components/content/ContentSection.tsx'))
  check('a connected banner is defined + shows the hub button', /connectedBanner =/.test(src) && /t\.goToContentHub/.test(src))
  check('the hub button routes to the Content Hub (reuses K1 goToContentHub)', /onClick=\{goToContentHub\}/.test(src))
  check('banner is rendered in BOTH connected branches (wp + shopify)',
    (src.match(/\{connectedBanner\}/g) || []).length >= 2)
  check('NO duplicate Content Hub embedded in the project section', !/import ContentHub|<ContentHub/.test(src))

  console.log(`\n${pass} passed, ${fail} failed`)
  if (fail > 0) process.exit(1)
}
main()
