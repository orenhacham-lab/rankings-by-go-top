/**
 * The one-time empty-subheading repair (lib/content/empty-h3-repair) — offline.
 *
 * A) the pure cut (strip.ts): h3+h3, h3+h2, a run of five, h3 at the end, the
 *    WordPress block form, an h3 WITH content stays, FAQ questions with answers
 *    stay, nothing else in the content changes; the markdown copy.
 * B) the pass (pass.ts) over FakeAdmin and a fake live site: the live body is the
 *    one edited (never our copy), a clean live body is not written, a failed live
 *    write leaves our copy alone, attempts are capped, the batch is bounded, only
 *    the approved six are read, the owner scopes the project, and nothing but
 *    content_html/content_markdown is written to the row.
 * C) the cron cannot be broken by it: the isolated wrapper never throws or
 *    rejects, is Production only, and the route calls the wrapper (source guard,
 *    comments stripped).
 *
 * MUTATION CONTROLS run inside the suite (withMutant): a cut that ignores what
 * follows the heading, a pass that writes our stored copy to the live site, a
 * pass that cleans our copy after a failed live write, and a wrapper without its
 * try/catch must each fail the guard written for it.
 *
 * Run: npx tsx lib/content/__qa__/empty-h3-repair.qa.ts
 */
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { FakeAdmin } from '@/lib/__qa__/_fake-admin'
import { withMutant } from '@/lib/reminders/__qa__/_mutant'
import { removeEmptyH3, removeEmptyMarkdownH3, hasEmptyH3 } from '../empty-h3-repair/strip'
import {
  runEmptyH3RepairPass, runIsolatedEmptyH3Repair, REPAIR_ARTICLE_IDS, ATTEMPT_REASON, MAX_ATTEMPTS, BATCH_SIZE,
  type LiveTransport, type ResolveTransport,
} from '../empty-h3-repair/pass'

let pass = 0, fail = 0
function check(name: string, cond: boolean, detail?: string) {
  if (cond) { pass++; console.log(`  ✓ ${name}`) } else { fail++; console.log(`  ✗ ${name}${detail ? ` — ${detail}` : ''}`) }
}
const ROOT = join(__dirname, '..', '..', '..')
const stripComments = (src: string) => src.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '')
type StripMod = typeof import('../empty-h3-repair/strip')
type PassMod = typeof import('../empty-h3-repair/pass')

// ── A) the pure cut ─────────────────────────────────────────────────────────
function cutGuards(cut: StripMod['removeEmptyH3']): boolean[] {
  const r: boolean[] = []
  const a = cut('<h2>A</h2>\n<p>x</p>\n<h3>Empty</h3>\n<h3>Full</h3>\n<p>y</p>')
  r.push(a.html === '<h2>A</h2>\n<p>x</p>\n<h3>Full</h3>\n<p>y</p>' && a.removed === 1 && a.texts[0] === 'Empty')
  const b = cut('<p>x</p>\n<h3 id="s">Empty</h3>\n<h2>Next</h2>\n<p>y</p>')
  r.push(b.html === '<p>x</p>\n<h2>Next</h2>\n<p>y</p>')
  const c = cut('<h2>S</h2>\n<h3>1</h3>\n<h3>2</h3>\n<h3>3</h3>\n<h3>4</h3>\n<h3>5</h3>\n<h2>T</h2>\n<p>z</p>')
  r.push(c.removed === 5 && c.html === '<h2>S</h2>\n<h2>T</h2>\n<p>z</p>')
  const d = cut('<p>x</p>\n<h3>Last</h3>\n')
  r.push(d.removed === 1 && d.html === '<p>x</p>\n')
  const keep = '<h2>S</h2>\n<h3>Has text</h3>\n<p>body</p>\n<h3>Has list</h3>\n<ul><li>a</li></ul>\n<h3>Has table</h3><table></table>'
  r.push(cut(keep).removed === 0 && cut(keep).html === keep)
  return r
}
console.log('A) the cut removes only empty <h3>s, and nothing else')
{
  const [a, b, c, d, keep] = cutGuards(removeEmptyH3)
  check('A1: h3 followed by h3 — the empty one goes, the next stays', a)
  check('A2: h3 followed by h2 — removed', b)
  check('A3: a run of five h3s with nothing under any — all five go', c)
  check('A4: an h3 at the very end — removed', d)
  check('A5: an h3 with a paragraph, a list or a table under it stays, content byte-identical', keep)

  const wp = [
    '<!-- wp:paragraph -->\n<p>x</p>\n<!-- /wp:paragraph -->',
    '<!-- wp:heading {"level":3} -->\n<h3 class="wp-block-heading">צ\'קליסט לתחזוקה מונעת</h3>\n<!-- /wp:heading -->',
    '<!-- wp:heading -->\n<h2 class="wp-block-heading">Next</h2>\n<!-- /wp:heading -->',
    '<!-- wp:paragraph -->\n<p>y</p>\n<!-- /wp:paragraph -->',
  ]
  const w = removeEmptyH3(wp.join('\n\n'))
  check('A6: the WordPress block form — the whole block (comments included) goes, the blocks around are untouched',
    w.removed === 1 && w.html === [wp[0], wp[2], wp[3]].join('\n\n') && w.texts[0] === "צ'קליסט לתחזוקה מונעת", JSON.stringify(w.html))
  const wpKeep = '<!-- wp:heading {"level":3} -->\n<h3>Q</h3>\n<!-- /wp:heading -->\n\n<!-- wp:paragraph -->\n<p>a</p>\n<!-- /wp:paragraph -->'
  check('A7: a WordPress h3 block followed by a paragraph block stays', removeEmptyH3(wpKeep).removed === 0)
  const wpH4 = '<h3>Parent</h3>\n<!-- wp:heading {"level":4} -->\n<h4>Child</h4>\n<!-- /wp:heading -->'
  check('A8: an h3 with an h4 under it is not empty', removeEmptyH3(wpH4).removed === 0)
  const broken = '<!-- wp:heading {"level":3} -->\n<h3>Open block</h3>\n<h2>X</h2>'
  check('A9: a block opener without its closer is left alone', removeEmptyH3(broken).removed === 0)

  const faq = '<h2 id="faq">שאלות נפוצות</h2>\n<h3 id="faq-q-1">מה?</h3>\n<p>תשובה.</p>\n<h3 id="faq-q-2">למה?</h3>\n<p>כי.</p>'
  check('A10: FAQ questions with their answers all stay', removeEmptyH3(faq).removed === 0 && removeEmptyH3(faq).html === faq)
  const wrapped = '<div class="gotop-article"><h2>S</h2><p>x</p><h3>Empty</h3></div><div class="cta">Call</div>'
  check('A11: an h3 followed by a call to action is not touched (conservative)', removeEmptyH3(wrapped).removed === 0)
  const wrappedEnd = '<div class="gotop-article"><p>x</p><h3>Empty</h3></div>'
  check('A12: an h3 that is the last thing in its container, then the end, is empty — the </div> stays',
    removeEmptyH3(wrappedEnd).html === '<div class="gotop-article"><p>x</p></div>')
  check('A13: inline markup in a heading is read as its text', removeEmptyH3('<h3><strong>A &amp; B</strong></h3><h2>x</h2>').texts[0] === 'A & B')
  check('A14: no input, no output, no throw', removeEmptyH3(null).html === '' && !hasEmptyH3(undefined))
  check('A15: the cut is idempotent', removeEmptyH3(removeEmptyH3('<h3>a</h3><h3>b</h3><h2>c</h2>').html).removed === 0)

  console.log('A·md) the markdown copy loses exactly the same headings')
  const md = ['**answer**', 'intro', '## Section', 'text', '### Empty one', '### Empty two', '## Next', 'p', '### Full', 'body', '## שאלות נפוצות', '### Q?', 'A.', '### Trailing'].join('\n\n')
  const m = removeEmptyMarkdownH3(md, ['Empty one', 'Empty two', 'Trailing'])
  check('A16: ### lines with nothing before the next heading (or the end) go; one with text stays; FAQ stays',
    m.removed === 3 && !m.markdown.includes('Empty one') && !m.markdown.includes('Empty two') && !m.markdown.includes('Trailing')
    && m.markdown.includes('### Full\n\nbody') && m.markdown.includes('### Q?\n\nA.') && m.markdown.includes('## Section\n\ntext\n\n## Next'), JSON.stringify(m.markdown))
  check('A17: a heading the HTML kept is not removed from the markdown', removeEmptyMarkdownH3('### Kept\n\n## Next', ['Other']).removed === 0)
  check('A18: an #### line is never treated as an h3', removeEmptyMarkdownH3('#### Four\n\n## Next').removed === 0)
}

// ── B) the pass ─────────────────────────────────────────────────────────────
const OWNER = 'user-1'
const DIRTY = '<h2>S</h2>\n<p>x</p>\n<h3>Empty</h3>\n<h2>T</h2>\n<p>y</p>'
const DIRTY_MD = '## S\n\nx\n\n### Empty\n\n## T\n\ny'
function articleRow(id: string, over: Record<string, unknown> = {}) {
  return {
    id, user_id: OWNER, project_id: 'proj-1', status: 'published', title: 'Title', meta_description: 'meta', featured_image_url: 'https://img',
    published_at: '2026-10-01T00:00:00Z', updated_at: '2026-10-01T00:00:00Z',
    content_html: DIRTY, content_markdown: DIRTY_MD, internal_links_json: null,
    wp_post_id: 61, wp_post_url: 'https://site.example/p', wp_connection_id: 'conn-1', shopify_article_id: null, ...over,
  }
}
function world(rows: Record<string, unknown>[]) {
  return new FakeAdmin({
    generated_articles: rows,
    projects: [{ id: 'proj-1', user_id: OWNER }, { id: 'proj-x', user_id: 'someone-else' }],
    generated_article_content_snapshots: [],
  })
}
/** A fake live site: per article, its current body; records every write. */
function fakeSite(bodies: Record<string, string | null>, opts: { failWrite?: boolean; failRead?: boolean } = {}) {
  const writes: { id: string; content: string }[] = []
  const resolve: ResolveTransport = async (_admin, a) => {
    const t: LiveTransport = {
      platform: a.shopify_article_id ? 'shopify' : 'wordpress', via: a.shopify_article_id ? 'shopify_admin' : 'app_password',
      read: async () => { if (opts.failRead) throw new Error('down'); return bodies[a.id] ?? null },
      write: async (content) => { if (opts.failWrite) throw new Error('500'); writes.push({ id: a.id, content }); bodies[a.id] = content },
    }
    return t
  }
  return { resolve, writes, bodies }
}
const quiet = async <T>(fn: () => Promise<T>): Promise<T> => {
  const log = console.log, err = console.error
  console.log = () => {}; console.error = () => {}
  try { return await fn() } finally { console.log = log; console.error = err }
}
const ID1 = REPAIR_ARTICLE_IDS[0]
const ID2 = REPAIR_ARTICLE_IDS[1]
const OWNER_EDITED_LIVE = '<h2>S</h2>\n<p>x — the owner rewrote this paragraph on the site</p>\n<h3>Empty</h3>\n<h2>T</h2>\n<p>y</p>\n<div class="gotop-cta">Call us</div>'

async function liveGuard(mod: PassMod): Promise<boolean> {
  const admin = world([articleRow(ID1)])
  const site = fakeSite({ [ID1]: OWNER_EDITED_LIVE })
  await quiet(() => mod.runEmptyH3RepairPass(admin as never, { resolve: site.resolve }))
  return site.writes.length === 1 && site.writes[0].content === OWNER_EDITED_LIVE.replace('<h3>Empty</h3>\n', '')
}
async function failedWriteGuard(mod: PassMod): Promise<boolean> {
  const admin = world([articleRow(ID1)])
  const site = fakeSite({ [ID1]: DIRTY }, { failWrite: true })
  const s = await quiet(() => mod.runEmptyH3RepairPass(admin as never, { resolve: site.resolve }))
  const row = admin.tables.generated_articles[0]
  return row.content_html === DIRTY && row.content_markdown === DIRTY_MD && s.outcomes.live_write_failed === 1
}

async function main() {
  console.log('B) the pass')
  {
    check('B1: the LIVE body is edited surgically — the owner\'s own edits on the site survive, our copy is never sent', await liveGuard(await import('../empty-h3-repair/pass')))
    const admin = world([articleRow(ID1)])
    const site = fakeSite({ [ID1]: DIRTY })
    const s = await quiet(() => runEmptyH3RepairPass(admin as never, { resolve: site.resolve }))
    const row = admin.tables.generated_articles[0]
    check('B2: then our copy gets the same cut, html and markdown', s.outcomes.repaired === 1 && row.content_html === '<h2>S</h2>\n<p>x</p>\n<h2>T</h2>\n<p>y</p>' && row.content_markdown === '## S\n\nx\n\n## T\n\ny', JSON.stringify(row))
    check('B3: nothing else on the row is written (title, meta, image, status, dates)',
      row.title === 'Title' && row.meta_description === 'meta' && row.featured_image_url === 'https://img' && row.status === 'published'
      && row.published_at === '2026-10-01T00:00:00Z' && row.updated_at === '2026-10-01T00:00:00Z')
    const snaps = admin.tables.generated_article_content_snapshots
    check('B4: the attempt is a real snapshot of our copy, never a rollback candidate',
      snaps.length === 1 && snaps[0].reason === ATTEMPT_REASON && snaps[0].content_html_before === DIRTY && snaps[0].restored_at != null)
    const again = await quiet(() => runEmptyH3RepairPass(admin as never, { resolve: site.resolve }))
    check('B5: idempotent — once our copy is clean the article is done: no read, no write, no attempt',
      again.done === 1 && again.attempted === 0 && site.writes.length === 1 && snaps.length === 1)
  }
  {
    const admin = world([articleRow(ID1)])
    const site = fakeSite({ [ID1]: '<h2>S</h2>\n<p>owner fixed it</p>' })
    const s = await quiet(() => runEmptyH3RepairPass(admin as never, { resolve: site.resolve }))
    check('B6: a live body with no empty h3 is not written; our copy is still cleaned (so the job stops)',
      site.writes.length === 0 && s.outcomes.live_already_clean === 1 && !hasEmptyH3(String(admin.tables.generated_articles[0].content_html)))
  }
  check('B7: a failed live write leaves our copy as it was, so the next pass retries', await failedWriteGuard(await import('../empty-h3-repair/pass')))
  {
    const admin = world([articleRow(ID1)])
    const site = fakeSite({ [ID1]: DIRTY }, { failWrite: true })
    for (let i = 0; i < MAX_ATTEMPTS + 3; i++) await quiet(() => runEmptyH3RepairPass(admin as never, { resolve: site.resolve }))
    const last = await quiet(() => runEmptyH3RepairPass(admin as never, { resolve: site.resolve }))
    check(`B8: attempts are capped at ${MAX_ATTEMPTS} per article, then it is left alone`,
      admin.tables.generated_article_content_snapshots.length === MAX_ATTEMPTS && last.gaveUp === 1 && last.attempted === 0)
  }
  {
    const admin = world([articleRow(ID1)])
    const site = fakeSite({ [ID1]: null })
    const s = await quiet(() => runEmptyH3RepairPass(admin as never, { resolve: site.resolve }))
    check('B9: a post that is gone is never recreated, and our copy is kept', s.outcomes.live_missing === 1 && site.writes.length === 0 && admin.tables.generated_articles[0].content_html === DIRTY)
  }
  {
    const rows = REPAIR_ARTICLE_IDS.map((id) => articleRow(id))
    const admin = world([...rows, articleRow('00000000-0000-4000-8000-000000000000')])
    const bodies: Record<string, string> = {}
    for (const r of [...rows, { id: '00000000-0000-4000-8000-000000000000' }]) bodies[r.id] = DIRTY
    const site = fakeSite(bodies)
    const s = await quiet(() => runEmptyH3RepairPass(admin as never, { resolve: site.resolve }))
    check(`B10: at most ${BATCH_SIZE} articles a pass`, s.attempted === BATCH_SIZE && site.writes.length === BATCH_SIZE)
    for (let i = 0; i < 5; i++) await quiet(() => runEmptyH3RepairPass(admin as never, { resolve: site.resolve }))
    check('B11: only the six approved articles are ever touched; an other dirty article is not',
      site.writes.length === 6 && !site.writes.some((w) => w.id.startsWith('00000000')) && hasEmptyH3(String(admin.tables.generated_articles[6].content_html)))
  }
  {
    const admin = world([articleRow(ID1, { project_id: 'proj-x' }), articleRow(ID2, { status: 'draft' })])
    const site = fakeSite({ [ID1]: DIRTY, [ID2]: DIRTY })
    const s = await quiet(() => runEmptyH3RepairPass(admin as never, { resolve: site.resolve }))
    check('B12: a project that is not the article owner\'s is refused before the site is read', s.outcomes.owner_mismatch === 1 && site.writes.length === 0)
    check('B13: an article that is not published is not touched', s.notPublished === 1)
  }
  {
    const admin = world([articleRow(ID1)])
    const s = await quiet(() => runEmptyH3RepairPass(admin as never, { resolve: async () => ({ refused: 'plugin_only_unsupported' }) }))
    check('B14: a refusal by the transport is classified and leaves our copy', s.outcomes.plugin_only_unsupported === 1 && admin.tables.generated_articles[0].content_html === DIRTY)
  }
  {
    const admin = new FakeAdmin({ generated_articles: [articleRow(ID1)], projects: [{ id: 'proj-1', user_id: OWNER }] }, { generated_article_content_snapshots: { insert: () => ({ code: '42501' }) } })
    const site = fakeSite({ [ID1]: DIRTY })
    const s = await quiet(() => runEmptyH3RepairPass(admin as never, { resolve: site.resolve }))
    check('B15: when the attempt cannot be recorded, nothing remote is touched', s.outcomes.attempt_record_failed === 1 && site.writes.length === 0)
  }
  {
    const lines: string[] = []
    const log = console.log
    console.log = (...a: unknown[]) => { lines.push(JSON.stringify(a)) }
    try {
      await runIsolatedEmptyH3Repair(() => runEmptyH3RepairPass(world([articleRow(ID1)]) as never, { resolve: fakeSite({ [ID1]: DIRTY }).resolve }), { env: { VERCEL_ENV: 'production' } })
    } finally { console.log = log }
    check('B16: every article and every pass is logged with a classified outcome',
      lines.some((l) => l.includes('[empty-h3-repair] article') && l.includes('"outcome":"repaired"')) && lines.some((l) => l.includes('[empty-h3-repair] pass complete')))
    check('B17: no article body or heading text reaches a log line', !lines.some((l) => l.includes('Empty') || l.includes('<h')))
  }

  console.log('M) mutation controls — each guard must FAIL against a broken module')
  {
    const broken = await withMutant<StripMod, boolean[]>('lib/content/empty-h3-repair/strip.ts',
      [["if (tail !== '' && !NEXT_IS_HEADING.test(tail)) continue", '']], (m) => cutGuards(m.removeEmptyH3))
    check('M1: a cut that ignores what follows the heading fails A5 (an h3 with content would be removed)', broken[4] === false)
    const sendsOurCopy = await withMutant<PassMod, boolean>('lib/content/empty-h3-repair/pass.ts',
      [['await t.write(liveCut.html)', 'await t.write(removeEmptyH3(a.content_html).html)']], liveGuard)
    check('M2: a pass that writes our stored copy to the site fails B1', sendsOurCopy === false)
    const cleansAnyway = await withMutant<PassMod, boolean>('lib/content/empty-h3-repair/pass.ts',
      [["try { await t.write(liveCut.html) } catch { return { outcome: 'live_write_failed', ...where, liveRemoved: 0 } }", "try { await t.write(liveCut.html) } catch { /* swallowed */ }"]], failedWriteGuard)
    check('M3: a pass that cleans our copy after a failed live write fails B7', cleansAnyway === false)
    const unguarded = await withMutant<PassMod, boolean>('lib/content/empty-h3-repair/pass.ts',
      [[/\} catch \{\n\s*console\.error\('\[empty-h3-repair\] pass failed', \{ reason: 'threw' \}\)\n\s*return \{ status: 'error' \}\n\s*\}/, '} finally { /* no catch */ }']],
      async (m) => isolationGuard(m))
    check('M4: a wrapper without its catch fails C1', unguarded === false)
  }

  console.log('C) a failure here can never break the automation run')
  check('C1: the wrapper resolves (never throws, never rejects) when the pass throws or rejects', await isolationGuard(await import('../empty-h3-repair/pass')))
  {
    let ran = false
    const r = await quiet(() => runIsolatedEmptyH3Repair(async () => { ran = true; return { candidates: 0, attempted: 0, done: 0, gaveUp: 0, notPublished: 0, outcomes: {} } }, { env: { VERCEL_ENV: 'preview' } }))
    check('C2: Production only — Preview shares the database and must not edit merchants\' sites', r.status === 'not_production' && !ran)
  }
  const route = stripComments(readFileSync(join(ROOT, 'app/api/content/automation/cron/route.ts'), 'utf8'))
  const ridesIsolated = (src: string) =>
    /import \{ runIsolatedEmptyH3Repair \} from '@\/lib\/content\/empty-h3-repair\/pass'/.test(src)
    && /after\(async \(\) => \{[\s\S]*await runIsolatedEmptyH3Repair\(\)[\s\S]*\}\)\s*\n\s*return Response\.json\(\{ ok: true, accepted: true/.test(src)
    && !/runEmptyH3RepairPass/.test(src)
  check('C3: the cron route calls the isolated wrapper inside after(), never the raw pass', ridesIsolated(route))
  check('M5: mutation control — a route that calls the raw pass fails C3',
    !ridesIsolated(route.replace('await runIsolatedEmptyH3Repair()', 'await runEmptyH3RepairPass(createAdminClient())')))
  check('C4: and after CRON_SECRET is checked', route.indexOf('authorizeCronRequest(') > 0 && route.indexOf('authorizeCronRequest(') < route.indexOf('runIsolatedEmptyH3Repair()'))
  const passSrc = stripComments(readFileSync(join(ROOT, 'lib/content/empty-h3-repair/pass.ts'), 'utf8'))
  check('C5: no log line carries content (html, markdown, body or heading text)',
    !/console\.(log|error|warn)\([^)]*\b(content_html|content_markdown|live|after|texts|body|html)\b/.test(passSrc))
  check('C6: the stored write is scoped by id, project AND owner, and writes only the content columns',
    /\.update\(patch\)\s*\n?\s*\.eq\('id', a\.id\)\.eq\('project_id', a\.project_id\)\.eq\('user_id', a\.user_id\)/.test(passSrc)
    && /const patch: Record<string, unknown> = \{ content_html: storedCut\.html \}/.test(passSrc))

  const pubSrc = stripComments(readFileSync(join(ROOT, 'lib/shopify/publish-article.ts'), 'utf8'))
  const bodyOnly = (src: string) => {
    const fn = src.slice(src.indexOf('export async function updateShopifyArticleBodyOnly'))
    const guard = fn.indexOf('checkShopifyPublishEntitlement(')
    const scope = fn.indexOf('hasWriteContent(')
    const write = fn.indexOf('shopifyArticleUpdate(creds, articleGid, { body })')
    return guard > 0 && scope > guard && write > scope && !/\.from\(/.test(fn.slice(0, fn.indexOf('\n}\n')))
  }
  check('C7: Shopify — the billing guard, then write_content, then an update that sends ONLY the body; our row untouched', bodyOnly(pubSrc))
  check('M6: mutation control — an update that also sends a title fails C7',
    !bodyOnly(pubSrc.replace('shopifyArticleUpdate(creds, articleGid, { body })', 'shopifyArticleUpdate(creds, articleGid, { body, title: "x" })')))
  const wpOnlyContent = (src: string) => /updateItemFields\(creds, '\/posts', postId, \{ content \}\)/.test(src) && /getItemForEdit\(creds, '\/posts', postId\)/.test(src)
  check('C8: WordPress — the raw live content is read, and only `content` is written back to the same post', wpOnlyContent(passSrc))
  check('M7: mutation control — a WordPress write that also sends a title fails C8',
    !wpOnlyContent(passSrc.replace("updateItemFields(creds, '/posts', postId, { content })", "updateItemFields(creds, '/posts', postId, { content, title: 'x' })")))

  console.log(`\n${pass} passed, ${fail} failed`)
  if (fail > 0) process.exit(1)
}

async function isolationGuard(mod: PassMod): Promise<boolean> {
  try {
    const a = await quiet(() => mod.runIsolatedEmptyH3Repair(async () => { throw new Error('boom') }, { env: { VERCEL_ENV: 'production' } }))
    const b = await quiet(() => mod.runIsolatedEmptyH3Repair(() => Promise.reject(new Error('boom')), { env: { VERCEL_ENV: 'production' } }))
    return a.status === 'error' && b.status === 'error'
  } catch {
    return false
  }
}

main().catch((e) => { console.error(e); process.exit(1) })

export {}
