/**
 * BACKFILL the SEO title and meta description of articles already published to WordPress that
 * are missing them on the live page. Never replaces a value that is there. The rules, the write
 * paths and the safety checks are in lib/content/seo-backfill.ts.
 *
 * DRY RUN BY DEFAULT: reads the database and each post's public page, prints what --apply would
 * write, and changes nothing anywhere. --apply writes the missing fields and persists seo_status.
 *
 * Usage:
 *   npx tsx scripts/backfill-article-seo-meta.ts [--project <uuid>] [--article <uuid>] [--limit N] [--json <file>]
 *   npx tsx scripts/backfill-article-seo-meta.ts --apply --project <uuid>     (owner-approved runs only)
 *
 * Requires NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY; --apply also needs the
 * credentials encryption key the app uses (to read the plugin key / application password).
 * Needs outbound HTTPS to the merchants' sites (a cloud session's proxy may block them).
 */
import { writeFileSync } from 'node:fs'
import { createAdminClient } from '@/lib/supabase/admin'
import { runBackfill, type ArticleReport } from '@/lib/content/seo-backfill'

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

export function parseArgs(argv: string[]): { apply: boolean; projectId?: string; articleId?: string; limit?: number; json?: string } {
  const out: { apply: boolean; projectId?: string; articleId?: string; limit?: number; json?: string } = { apply: false }
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i]
    const next = () => { const v = argv[++i]; if (!v) throw new Error(`${a} needs a value`); return v }
    if (a === '--apply') out.apply = true
    else if (a === '--dry-run') out.apply = false
    else if (a === '--project') out.projectId = next()
    else if (a === '--article') out.articleId = next()
    else if (a === '--limit') out.limit = Number(next())
    else if (a === '--json') out.json = next()
    else throw new Error(`unknown argument ${a}`)
  }
  if (argv.includes('--apply') && argv.includes('--dry-run')) throw new Error('--apply and --dry-run together')
  for (const id of [out.projectId, out.articleId]) if (id !== undefined && !UUID.test(id)) throw new Error('ids must be UUIDs')
  if (out.limit !== undefined && !(Number.isInteger(out.limit) && out.limit > 0)) throw new Error('--limit must be a positive integer')
  return out
}

const line = (r: ArticleReport) =>
  `${r.project} | ${r.url} | ${r.channel}${r.seoPluginHint ? `/${r.seoPluginHint}` : ''} | head title=${r.head.title} desc=${r.head.description} | ` +
  `title:${r.title} desc:${r.description}${r.skip ? ` | skip:${r.skip}` : ''}${r.detail ? ` (${r.detail})` : ''}${r.persisted ? ` | seo_status=${r.persisted.status}` : ''}`

async function main() {
  const args = parseArgs(process.argv.slice(2))
  console.log(args.apply ? 'MODE: APPLY — missing fields will be written' : 'MODE: DRY RUN — nothing is written')
  const reports = await runBackfill(createAdminClient(), args, undefined, (r) => console.log(line(r)))
  const by = new Map<string, { n: number; title: number; desc: number; unreadable: number; skipped: number }>()
  for (const r of reports) {
    const s = by.get(r.project) ?? { n: 0, title: 0, desc: 0, unreadable: 0, skipped: 0 }
    s.n++
    if (r.title === 'would_write' || r.title === 'written') s.title++
    if (r.description === 'would_write' || r.description === 'written') s.desc++
    if (r.skip === 'page_unreadable') s.unreadable++
    else if (r.skip && r.skip !== 'nothing_to_write') s.skipped++
    by.set(r.project, s)
  }
  console.log('\nproject | articles | title to write | description to write | page unreadable | skipped')
  for (const [p, s] of by) console.log(`${p} | ${s.n} | ${s.title} | ${s.desc} | ${s.unreadable} | ${s.skipped}`)
  if (args.json) writeFileSync(args.json, JSON.stringify(reports, null, 2))
}

if (process.argv[1] && /backfill-article-seo-meta\.ts$/.test(process.argv[1])) {
  main().catch((e) => { console.error(e instanceof Error ? e.message : 'failed'); process.exit(1) })
}
