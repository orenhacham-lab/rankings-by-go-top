/**
 * Article view (review P1-7, P2-15).
 *
 *   A) A LIVE POST IS NEVER QUIETLY UNPUBLISHED. A WordPress post that is live offers one action,
 *      "עדכון הפוסט באתר" (an update that keeps it published). The "send as draft" action is not
 *      offered for it; if the draft path is ever reached for a live post it asks first, in the
 *      danger tone, saying the page goes offline (useConfirm), and only then sends `unpublish: true`.
 *   B) THE SERVER AGREES. The export route refuses to turn a published article's post back into a
 *      draft without that explicit `unpublish: true` (409 would_unpublish).
 *   C) THE ARTICLE FIRST. While reading, the article comes first and the quality score sits beside
 *      it (under it on a phone) with a line saying what the score measures; the score is on top only
 *      while editing, as the list of what to fix.
 *
 * Every guard has a MUTATION CONTROL (a broken copy must fail it).
 * Run: npx tsx lib/content/__qa__/article-wp-live.qa.ts
 */
import { readFileSync } from 'fs'
import { join } from 'path'
import { getDashboardDictionary } from '../../i18n/dashboard/getDashboardDictionary'

let pass = 0, fail = 0
function check(name: string, cond: boolean, detail?: string) {
  if (cond) { pass++; console.log(`  ✓ ${name}`) } else { fail++; console.log(`  ✗ ${name}${detail ? ` — ${detail}` : ''}`) }
}
const ROOT = join(__dirname, '..', '..', '..')
const read = (rel: string) => readFileSync(join(ROOT, rel), 'utf8')
const strip = (s: string) => s.replace(/\{\/\*[\s\S]*?\*\/\}/g, '').replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:'"`\\])\/\/.*$/gm, '$1')

const PAGE = 'app/(dashboard)/content/articles/[id]/page.tsx'
const ROUTE = 'app/api/content/articles/[id]/wordpress/route.ts'

/** The two branches of the WordPress card's `{wpLive ? ( … ) : ( … )}`. */
function wpBranches(src: string): { live: string; notLive: string } | null {
  const at = src.indexOf('{wpLive ? (')
  if (at < 0) return null
  const rest = src.slice(at)
  const split = rest.indexOf(') : (')
  const end = rest.indexOf('</>', split)
  if (split < 0 || end < 0) return null
  return { live: rest.slice(0, split), notLive: rest.slice(split, end) }
}

function guardA(src: string) {
  const b = wpBranches(src)
  const liveOk = !!b && b.live.includes("exportWordPress('publish')") && !b.live.includes("exportWordPress('draft')") && b.live.includes('e.wpUpdateLive')
  const draftOnlyWhenNotLive = !!b && b.notLive.includes("exportWordPress('draft')")
    && (src.match(/exportWordPress\('draft'\)/g) ?? []).length === 1
  const fn = src.slice(src.indexOf('async function exportWordPress('), src.indexOf('async function exportWordPress(') + 2500)
  const confirmed = /if \(wasLive && status === 'draft'\) \{\s*if \(!\(await confirm\(\{ title: e\.wpUnpublishTitle, body: e\.wpUnpublishConfirm, confirmLabel: e\.wpUnpublishAction, tone: 'danger' \}\)\)\) return/.test(fn)
  const flag = /\.\.\.\(wasLive && status === 'draft' \? \{ unpublish: true \} : \{\}\)/.test(fn)
  const live = /const wpLive = !!wpPostId && wpStatus === 'publish'/.test(src)
  return { liveOk, draftOnlyWhenNotLive, confirmed, flag, live }
}

function guardB(src: string) {
  const i = src.indexOf("return Response.json({ error: 'would_unpublish'")
  const j = src.indexOf('const existing = a.wp_post_id && !force')
  const cond = /if \(a\.wp_post_id && !force && wantUpdate && status === 'draft' && a\.status === 'published' && body\.unpublish !== true\) \{\s*return Response\.json\(\{ error: 'would_unpublish'/.test(src)
  return cond && i > 0 && j > i
}

function guardC(src: string) {
  const readAt = src.indexOf('data-article-layout="read"')
  const viewAt = src.indexOf('<ArticleReadView', readAt)
  const sideAt = src.indexOf('renderAudit(true)', readAt)
  const readFirst = readAt > 0 && viewAt > readAt && sideAt > viewAt
  const topOnlyEditing = /\{editing && audit && renderAudit\(false\)\}/.test(src) && (src.match(/renderAudit\(false\)/g) ?? []).length === 1
  const aiOnlyEditingTop = /\{editing && aiCard\}/.test(src)
  const explains = /\{side && <p [^>]*>\{e\.auditExplain\}<\/p>\}/.test(src)
  return { readFirst, topOnlyEditing, aiOnlyEditingTop, explains }
}

console.log('Article view — a live post, the server guard, the article first\n')

const page = strip(read(PAGE))
const route = strip(read(ROUTE))

console.log('A) a live post is never quietly unpublished')
const a = guardA(page)
check('A1: "live" means a WordPress post whose status is publish', a.live)
check('A2: a live post offers one action, "update the live post", and no draft button', a.liveOk)
check('A3: "send as draft" exists only for a post that is not live', a.draftOnlyWhenNotLive)
check('A4: reaching the draft path for a live post asks first (danger tone, "take the page offline")', a.confirmed)
check('A5: only that confirmed path sends unpublish: true', a.flag)
{
  const m = guardA(page.replace("onClick={() => exportWordPress('publish')} loading={wpBusy === 'publish'} disabled={!!wpBusy} data-wp-update-live",
    "onClick={() => exportWordPress('draft')} loading={wpBusy === 'publish'} disabled={!!wpBusy} data-wp-update-live"))
  check('MUTATION (the live post\'s button sends a draft again): A2 sees it', !m.liveOk)
  const m2 = guardA(page.replace("confirmLabel: e.wpUnpublishAction, tone: 'danger' })", "confirmLabel: e.wpUnpublishAction })"))
  check('MUTATION (unpublish asked in the normal tone): A4 sees it', !m2.confirmed)
}

console.log('\nB) the server refuses a silent unpublish')
check('B1: update + draft of a published article without unpublish: true → 409 would_unpublish (before the write)', guardB(route))
check('MUTATION (the refusal removed): B1 sees it', !guardB(route.replace("&& body.unpublish !== true) {", '&& false) {')))
{
  const he = getDashboardDictionary('he').contentHub.editor
  const en = getDashboardDictionary('en').contentHub.editor
  check('B2: the refusal and the dialogs are in plain words in both languages',
    !!he.wpErrors.would_unpublish && !!en.wpErrors.would_unpublish && /[א-ת]/.test(he.wpUnpublishConfirm) && /[א-ת]/.test(he.wpUpdateLive)
    && he.wpUpdateLive === 'עדכון הפוסט באתר' && !!en.wpUpdateLive && !!en.wpUnpublishConfirm)
}

console.log('\nC) the article first, the score beside it')
const c = guardC(page)
check('C1: while reading, the article is rendered before the quality score', c.readFirst)
check('C2: the score is on top only while editing', c.topOnlyEditing)
check('C3: the AI card is on top only while editing (beside the article while reading)', c.aiOnlyEditingTop)
check('C4: beside the article the score says what it measures', c.explains)
check('C5: the explanation is in both dictionaries',
  /[א-ת]/.test(getDashboardDictionary('he').contentHub.editor.auditExplain) && !!getDashboardDictionary('en').contentHub.editor.auditExplain)
{
  const m = guardC(page.replace('{editing && audit && renderAudit(false)}', '{audit && renderAudit(false)}'))
  check('MUTATION (score back on top while reading): C2 sees it', !m.topOnlyEditing)
}

console.log(`\n${pass} passed, ${fail} failed`)
process.exit(fail ? 1 : 0)
export {}
