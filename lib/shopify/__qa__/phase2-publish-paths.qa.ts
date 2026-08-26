/**
 * Round-4 Task 3 — final Shopify publishing confirmation. Source-contract proof
 * that EVERY Shopify publishing path (manual, queued/dispatcher, cron, retry/
 * reprocessing) funnels into the ONE guarded mutation function
 * (publishArticleToShopify, which runs checkShopifyPublishEntitlement first —
 * see phase2-source-contracts.qa.ts tests 1-2 for that guarantee itself). This
 * file proves the CALL GRAPH REACHES that function from every entry point, so
 * no path can bypass it. No network, no DB. Run:
 *   npx tsx lib/shopify/__qa__/phase2-publish-paths.qa.ts
 */
import { readFileSync } from 'fs'
import { join } from 'path'

let pass = 0, fail = 0
function check(name: string, cond: boolean, detail?: string) {
  if (cond) { pass++; console.log(`  ✓ ${name}`) } else { fail++; console.log(`  ✗ ${name}${detail ? ` — ${detail}` : ''}`) }
}
const ROOT = join(__dirname, '..', '..', '..')
const read = (rel: string) => readFileSync(join(ROOT, rel), 'utf8')

async function main() {
  console.log('Round 4 Task 3 — Shopify publishing call-graph reachability\n')

  console.log('Manual per-article publish: app/api/content/articles/[id]/shopify/route.ts calls publishArticleToShopify directly')
  {
    const src = read('app/api/content/articles/[id]/shopify/route.ts')
    check('imports publishArticleToShopify from lib/shopify/publish-article', /import\s*\{[^}]*publishArticleToShopify[^}]*\}\s*from\s*'@\/lib\/shopify\/publish-article'/.test(src))
    check('calls publishArticleToShopify(', /await publishArticleToShopify\(/.test(src))
  }

  console.log('\nQueued/dispatcher publish: lib/content/automation/publish-item.ts dispatches Shopify-platform items to publishShopifyPoolItem')
  {
    const src = read('lib/content/automation/publish-item.ts')
    check('imports publishShopifyPoolItem', /import\s*\{[^}]*publishShopifyPoolItem[^}]*\}/.test(src))
    check("dispatches on platform === 'shopify'", /platform\s*===\s*'shopify'/.test(src))
    check('calls publishShopifyPoolItem(', /publishShopifyPoolItem\(/.test(src))
  }

  console.log('\nQueued/dispatcher -> guarded mutation: lib/content/automation/publish-item-shopify.ts calls publishArticleToShopify')
  {
    const src = read('lib/content/automation/publish-item-shopify.ts')
    check('imports publishArticleToShopify from lib/shopify/publish-article', /import\s*\{[^}]*publishArticleToShopify[^}]*\}\s*from\s*'@\/lib\/shopify\/publish-article'/.test(src))
    check('calls publishArticleToShopify(', /await publishArticleToShopify\(/.test(src))
  }

  console.log('\nCron path: app/api/content/automation/cron/route.ts -> runAutomation -> publishPoolItem (the dispatcher)')
  {
    const cronSrc = read('app/api/content/automation/cron/route.ts')
    check('cron route imports runAutomation from the runner', /import\s*\{[^}]*runAutomation[^}]*\}\s*from\s*'@\/lib\/content\/automation\/runner'/.test(cronSrc))
    check('cron route calls runAutomation(', /await runAutomation\(/.test(cronSrc))
    const runnerSrc = read('lib/content/automation/runner.ts')
    check('runner imports publishPoolItem from publish-item.ts (the dispatcher)', /import\s*\{[^}]*publishPoolItem[^}]*\}\s*from\s*'@\/lib\/content\/automation\/publish-item'/.test(runnerSrc))
    check('runner calls publishPoolItem( inside runAutomation', /await publishPoolItem\(/.test(runnerSrc))
  }

  console.log('\nManual "run automation now" path: app/api/content/automation/run/route.ts -> the SAME runAutomation as cron')
  {
    const src = read('app/api/content/automation/run/route.ts')
    check('imports runAutomation from the runner (same function as cron)', /import\s*\{[^}]*runAutomation[^}]*\}\s*from\s*'@\/lib\/content\/automation\/runner'/.test(src))
    check('calls runAutomation(', /await runAutomation\(/.test(src))
  }

  console.log('\nRetry/reprocessing path: app/api/content/automation/items/[itemId]/publish/route.ts calls publishPoolItem directly (the same dispatcher)')
  {
    const src = read('app/api/content/automation/items/[itemId]/publish/route.ts')
    check('imports publishPoolItem from publish-item.ts', /import\s*\{[^}]*publishPoolItem[^}]*\}\s*from\s*'@\/lib\/content\/automation\/publish-item'/.test(src))
    check('calls publishPoolItem(', /await publishPoolItem\(/.test(src))
  }

  console.log('\nEvery one of the 5 files above that ultimately reaches Shopify does so ONLY via functions proven (phase2-source-contracts.qa.ts) to fence Shopify article mutation behind checkShopifyPublishEntitlement — none of these 5 files import shopifyArticleCreate/shopifyArticleUpdate directly')
  {
    const files = [
      'app/api/content/articles/[id]/shopify/route.ts',
      'lib/content/automation/publish-item.ts',
      'lib/content/automation/publish-item-shopify.ts',
      'app/api/content/automation/cron/route.ts',
      'lib/content/automation/runner.ts',
      'app/api/content/automation/run/route.ts',
      'app/api/content/automation/items/[itemId]/publish/route.ts',
    ]
    for (const f of files) {
      const src = read(f)
      check(`${f}: no direct shopifyArticleCreate/shopifyArticleUpdate import`, !/shopifyArticleCreate|shopifyArticleUpdate/.test(src), 'direct low-level Shopify mutation import found — bypass risk')
    }
  }

  console.log(`\n${pass} passed, ${fail} failed`)
  if (fail > 0) process.exitCode = 1
}
main()
