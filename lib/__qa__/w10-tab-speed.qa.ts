/**
 * TABS DO NOT WAIT ON READS ONE AFTER ANOTHER — the guard.
 *
 * Production functions run in iad1 (Washington) and the database in
 * ap-south-1 (Mumbai): every sequential read is a full cross-region round trip.
 * Measured on the stub at 200 ms per read (scratchpad w10-content/api-depth-*):
 *   /api/content/overview   1455 → 436 ms   (7 round trips → 2)
 *   /api/content/topics      638 → 434 ms
 *   /api/gsc/status          843 → 442 ms
 *   /api/projects/quota      842 → 659 ms
 *   /api/site-health/fixes  1062 → 653 ms
 * Each read below depends only on the owner-checked project/user, so it is
 * sent with the others. Ownership is still checked FIRST in every route.
 */
import { readFileSync } from 'node:fs'
import { join } from 'node:path'

let passed = 0
let failed = 0
function check(name: string, ok: boolean) {
  if (ok) passed++
  else { failed++; console.log('FAIL', name) }
}
const root = join(__dirname, '..', '..')
const read = (p: string) => readFileSync(join(root, p), 'utf8').replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:'"`])\/\/.*$/gm, '$1')

const overview = read('app/api/content/overview/route.ts')
check('overview: the six reads go out together', /await Promise\.all\(\[articlesRead, queueRead, wpRead, shopifyRead, siteRead, alertsRead\]\)/.test(overview))
check('overview: no read is awaited on its own after the ownership check', !/await supabase\s*\.from\('(article_pool_items|wordpress_connections|shopify_connections)'\)/.test(overview) && !/await loadActiveAlerts\(/.test(overview))
check('overview: the WordPress-only fallback on a missing column is kept', /code === '42703'\) return await loadArticles\(WP_COLS\)/.test(overview))

const topics = read('app/api/content/topics/route.ts')
check('topics: the plan status is requested before the topics are awaited', topics.indexOf('const planStatusRead = loadPlanSummariesForProject(') > 0 && topics.indexOf('const planStatusRead') < topics.indexOf(".from('article_topics')") && /const planStatus = await planStatusRead/.test(topics))
check('topics: ownership first', topics.indexOf('authContentProject(projectId)') < topics.indexOf('planStatusRead'))

const gsc = read('app/api/gsc/status/route.ts')
check('gsc status: connection, property, windows and role read together', /await Promise\.allSettled\(\[\s*loadUserConnection\([\s\S]*?loadProjectProperty\([\s\S]*?runsRead,[\s\S]*?isAdminUser\(/.test(gsc))
check('gsc status: failures surface in the old order and windows count only with a property', gsc.indexOf("connectionRead.status === 'rejected'") < gsc.indexOf("propertyRead.status === 'rejected'") && /if \(property\) \{\s*const read = runsResult/.test(gsc))

const quota = read('app/api/projects/quota/route.ts')
check('quota: plan and project count read together', /await Promise\.all\(\[\s*getUserEntitlement\(/.test(quota))

const fixApi = read('lib/site-fix/api.ts')
check('site-fix: queue and context read together after the owner-filtered project read', /await Promise\.all\(\[\s*queueAvailable\(deps\.admin, scope\),\s*loadFixContext\(/.test(fixApi) && fixApi.indexOf(".eq('user_id', deps.userId)") < fixApi.indexOf('queueAvailable(deps.admin, scope)'))
const channel = read('lib/site-fix/channel.ts')
check('site-fix: the plugin link is read with the four connections', /const \[shop, wp, site, profile, plugin\] = await Promise\.all\(/.test(channel) && !/const plugin = await readPluginLink/.test(channel))

console.log(`${passed} passed, ${failed} failed`)
if (failed) process.exit(1)
export {}
