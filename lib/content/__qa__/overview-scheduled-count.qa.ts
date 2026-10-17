/**
 * The articles screen's "scheduled" tile counted one article twice: once as a
 * generated article with status `scheduled`, and again as the automation-queue
 * item that carries the same article_id. The walk seed (one scheduled article
 * + its pool item) showed "מתוזמנים 2".
 *
 * WHAT IS PROVEN HERE
 *   A. the pure helper skips a queue item whose article is already counted as
 *      scheduled, and still counts every other queue item;
 *   B. the REAL /api/content/overview handler, over an in-memory Supabase,
 *      reports 1 for the walk shape and keeps counting article-less queue items;
 *   C. SOURCE — the route goes through the helper, not a raw `+= queueCount`;
 *   MUT. mutation controls: the naive sum and the old route line both fail.
 *
 * Run: npx tsx lib/content/__qa__/overview-scheduled-count.qa.ts
 */

/* eslint-disable @typescript-eslint/no-explicit-any, @typescript-eslint/no-require-imports */
const Module: any = require('module')
const origLoad = Module._load
const overrides = new Map<string, Record<string, unknown>>()
Module._load = function (request: string, parent: any, isMain: boolean) {
  const real = origLoad.call(this, request, parent, isMain)
  const o = overrides.get(request)
  if (!o) return real
  return new Proxy(real, { get: (t, k) => ((k as string) in o ? o[k as string] : (t as any)[k]) })
}

import { readFileSync } from 'fs'
import { join } from 'path'
import { FakeAdmin } from '../../__qa__/_fake-admin'
import { queueItemsNotYetCounted } from '../overview-counts'

let pass = 0, fail = 0
function check(name: string, cond: boolean, detail?: string) {
  if (cond) { pass++; console.log(`  ✓ ${name}`) } else { fail++; console.log(`  ✗ ${name}${detail ? ` — ${detail}` : ''}`) }
}
const ROOT = join(__dirname, '..', '..', '..')
const strip = (s: string) => s.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:])\/\/.*$/gm, '$1')

const scheduledArt = { id: 'art-3', status: 'scheduled' }
const readyArt = { id: 'art-4', status: 'ready' }

/** The route's source-level contract, as a predicate so a mutant can be fed to it. */
const routeDedupes = (src: string) => {
  const s = strip(src)
  return /counts\.scheduled \+= queueItemsNotYetCounted\(/.test(s)
    && !/counts\.scheduled \+= queueCount/.test(s)
    && /\.from\('article_pool_items'\)\s*\.select\('article_id', \{ count: 'exact' \}\)/.test(s)
}

// The route binds createClient once at import, so the override delegates to
// whichever in-memory database the current case installed.
let admin = new FakeAdmin({})
const client = { from: (t: string) => admin.from(t), auth: { getUser: async () => ({ data: { user: { id: 'u1' } } }) } }
overrides.set('@/lib/supabase/server', { createClient: async () => client })

async function routeScheduled(tables: Record<string, Record<string, unknown>[]>) {
  admin = new FakeAdmin(tables)
  const { GET } = await import('../../../app/api/content/overview/route')
  const res = await GET(new Request('http://localhost/api/content/overview?projectId=p1') as never) as Response
  const json = await res.json() as { counts?: { scheduled: number; total: number } }
  return json.counts
}

async function main() {
  console.log('A) the helper counts each piece of work once')
  check('A1: a queue item carrying an already-scheduled article is skipped',
    queueItemsNotYetCounted(1, ['art-3'], [scheduledArt]) === 0)
  check('A2: a queue item with no article yet is still counted',
    queueItemsNotYetCounted(2, ['art-3', null], [scheduledArt]) === 1)
  check('A3: a queue item whose article is not itself scheduled is still counted',
    queueItemsNotYetCounted(1, ['art-4'], [readyArt]) === 1)
  check('A4: an item pointing at an article outside the loaded list is still counted',
    queueItemsNotYetCounted(1, ['art-9'], [scheduledArt]) === 1)
  check('A5: never negative', queueItemsNotYetCounted(0, ['art-3', 'art-3'], [scheduledArt]) === 0)

  console.log('\nB) the REAL overview handler')
  process.env.ENABLE_CONTENT = 'true'
  const base = () => ({
    projects: [{ id: 'p1', user_id: 'u1', is_active: true, name: 'P', business_name: 'P', target_domain: 'x', language: 'he' }],
    generated_articles: [
      { id: 'art-3', project_id: 'p1', title: 'a', slug: 'a', status: 'scheduled', updated_at: '2026-09-26T12:00:00Z' },
      { id: 'art-5', project_id: 'p1', title: 'b', slug: 'b', status: 'draft', updated_at: '2026-09-25T12:00:00Z' },
    ],
    article_pool_items: [
      { id: 'pi-1', project_id: 'p1', article_id: 'art-3', status: 'scheduled' },
    ] as Record<string, unknown>[],
    wordpress_connections: [], shopify_connections: [], site_connections: [], content_automation_alerts: [],
  })
  const walk = await routeScheduled(base())
  check('B1: one scheduled article with its queue item reads as 1, not 2', walk?.scheduled === 1, JSON.stringify(walk))
  const more = base()
  more.article_pool_items.push(
    { id: 'pi-2', project_id: 'p1', article_id: null, status: 'queued' },
    { id: 'pi-3', project_id: 'p1', article_id: null, status: 'published' },
    { id: 'pi-4', project_id: 'p2', article_id: null, status: 'queued' },
  )
  const withQueue = await routeScheduled(more)
  check('B2: an article-less queued item still counts; published and other projects do not',
    withQueue?.scheduled === 2, JSON.stringify(withQueue))

  console.log('\nC) SOURCE')
  const routeSrc = readFileSync(join(ROOT, 'app/api/content/overview/route.ts'), 'utf8')
  check('C1: the route counts the queue through the dedupe helper', routeDedupes(routeSrc))

  console.log('\nMUT) mutation controls')
  const naive = (total: number) => total
  check('MUT1: the naive sum (old behaviour) gives 2 for the walk shape, so B1 would fail',
    1 + naive(1) === 2 && 1 + queueItemsNotYetCounted(1, ['art-3'], [scheduledArt]) === 1)
  const oldRoute = routeSrc.replace(/counts\.scheduled \+= queueItemsNotYetCounted\([^\n]*\n/, 'counts.scheduled += queueCount ?? 0\n')
  check('MUT2: restoring the old `+= queueCount` line fails C1', oldRoute !== routeSrc && !routeDedupes(oldRoute))
  const headOnly = routeSrc.replace(".select('article_id', { count: 'exact' })", ".select('id', { count: 'exact', head: true })")
  check('MUT3: a head-only count (no article ids to dedupe with) fails C1', headOnly !== routeSrc && !routeDedupes(headOnly))

  console.log(`\n${pass} passed, ${fail} failed`)
  process.exit(fail ? 1 : 0)
}

main().catch((e) => { console.error(e); process.exit(1) })

export {}
