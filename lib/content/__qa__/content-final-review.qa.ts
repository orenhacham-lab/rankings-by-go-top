/**
 * Final premium review, content / articles / strategy (review.md section 4:
 * R1, R3, R6, R14, R15, R17, R23, R24, R28, R29, R30, R35).
 *
 * Source guards over the content screens. Every guard is a predicate over the
 * comment-stripped source, and every predicate has a MUTATION CONTROL: the same
 * predicate run over a deliberately broken copy of the source must fail.
 *
 *   npx tsx lib/content/__qa__/content-final-review.qa.ts
 */
import { readFileSync } from 'fs'
import { join } from 'path'

let passed = 0
let failed = 0
function check(name: string, cond: boolean) {
  if (cond) { passed++; console.log(`  ✓ ${name}`) } else { failed++; console.log(`  ✗ ${name}`) }
}
const ROOT = join(__dirname, '..', '..', '..')
const read = (rel: string) => readFileSync(join(ROOT, rel), 'utf8')
const strip = (s: string) => s.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:])\/\/[^\n]*/g, '$1')
const src = (rel: string) => strip(read(rel))
/** Guard + mutation control in one call: `ok(real)` must hold and `ok(mutated)` must not. */
function guard(name: string, text: string, ok: (s: string) => boolean, mutate: (s: string) => string) {
  check(name, ok(text))
  const broken = mutate(text)
  check(`${name} — MUT`, broken !== text && !ok(broken))
}

const ARTICLE_PAGE = 'app/(dashboard)/content/articles/[id]/page.tsx'

console.log('\nR30) the plan route answers 200 for "site index not built"')
{
  const route = src('app/api/content/automation/internal-links/plan/route.ts')
  const missingBlock = (s: string) => {
    const i = s.indexOf('if (!row) {')
    return i < 0 ? '' : s.slice(i, s.indexOf('}', s.indexOf('Response.json', i) ) + 40)
  }
  guard('the missing-index answer is ok:false + cacheState missing, without a 409', route,
    (s) => { const b = missingBlock(s); return /ok: false, cacheState: 'missing'/.test(b) && !/status: 409/.test(b) },
    (s) => s.replace("hint: 'POST …/index/refresh first' })", "hint: 'POST …/index/refresh first' }, { status: 409 })"))
  guard('the strict refusal is still an error status', route,
    (s) => /strict[\s\S]{0,600}status: 409/.test(s),
    (s) => s.replace(/(strict[\s\S]{0,600}?)status: 409/, '$1status: 200'))
  for (const [file, re] of [
    ['components/content/TopicPlanDrawer.tsx', /if \(!res\.ok \|\| data\.ok === false\)/],
    ['components/content/NewTopicsLinkPlanPanel.tsx', /if \(!res\.ok \|\| data\.ok === false\)/],
    ['components/content/AutomationIdeas.tsx', /if \(!gr\.ok \|\| gd\.ok === false\)/],
  ] as const) {
    guard(`${file.split('/').pop()} treats a 200 ok:false like the old 409`, src(file),
      (s) => re.test(s), (s) => s.replace(re, (m) => m.replace(/ \|\| \w+\.ok === false/, '')))
  }
}

console.log('\nR6) confirmations use the dialog, never window.confirm')
for (const file of [
  ARTICLE_PAGE,
  'components/content/workspace/ArticlesScreen.tsx',
  'components/content/TopicsList.tsx',
  'components/content/ArticleInternalLinkApplyPanel.tsx',
  'components/content/ArticleInlineImagesPanel.tsx',
  'components/content/AutomationIdeas.tsx',
]) {
  guard(`${file.split('/').pop()}: useConfirm + rendered dialog, no window.confirm`, src(file),
    (s) => /useConfirm\(\)/.test(s) && /\{confirmDialog\}/.test(s) && !/window\.confirm\(/.test(s),
    (s) => s.replace(/await confirm\(/, 'window.confirm(') )
}
guard('destructive confirms are danger-toned (article delete, image remove, idea reject)',
  src(ARTICLE_PAGE) + src('components/content/ArticleInlineImagesPanel.tsx') + src('components/content/AutomationIdeas.tsx'),
  (s) => (s.match(/tone: 'danger'/g) ?? []).length >= 5,
  (s) => s.replace(/tone: 'danger'/g, "tone: 'default'"))

console.log('\nR1) one primary per region')
{
  guard('StrategyBoard / list: "approve" on each card is the small dark-blue primary (wave 10)', src('components/content-strategy/StrategyBoard.tsx'),
    (s) => /<Button size="sm" variant="primary" onClick=\{\(\) => void act\.actions\.approve\(target\)\}/.test(s),
    (s) => s.replace('<Button size="sm" variant="primary" onClick={() => void act.actions.approve(target)}', '<Button size="sm" onClick={() => void act.actions.approve(target)}'))
  guard('ArticleTopBar steps back to secondary while the article is being edited', src('components/content/ArticleTopBar.tsx'),
    (s) => /quiet\?: boolean/.test(s) && /const ctaVariant = quiet \? 'secondary'/.test(s) && (s.match(/variant=\{ctaVariant\}|linkButton\(ctaVariant\)/g) ?? []).length >= 5,
    (s) => s.replace(/variant=\{ctaVariant\}/g, ''))
  guard('the article page passes quiet={editing}', src(ARTICLE_PAGE),
    (s) => /quiet=\{editing\}/.test(s), (s) => s.replace('quiet={editing}', ''))
  guard('the read view\'s "edit" is secondary (the publish CTA stays the single primary)', src('components/content/ArticleReadView.tsx'),
    (s) => /variant="secondary"[^>]*>[\s\S]{0,120}\bedit/i.test(s) || /onEdit[\s\S]{0,200}variant="secondary"/.test(s),
    (s) => s.replace(/variant="secondary"/g, ''))
}

console.log('\nR3 + R23) the quality check is neutral and compact')
{
  const page = src(ARTICLE_PAGE)
  guard('warnings/blockers render in a neutral card; tone only on the icon', page,
    (s) => /data-audit-list=\{tone\} className="[^"]*border-line bg-surface/.test(s) && !/data-audit-list=\{tone\} className="[^"]*(bg-warn|bg-bad)/.test(s)
      && /<AuditList\s+tone=\{isPublished \? 'warn' : 'bad'\}/.test(s) && /<AuditList tone="warn"/.test(s),
    (s) => s.replace('data-audit-list={tone} className="mb-3 rounded-inset border border-line bg-surface', 'data-audit-list={tone} className="mb-3 rounded-inset border border-warn bg-warn-soft'))
  guard('the 7 counts are one definition list, not 7 StatTiles', page,
    (s) => /<dl data-audit-counts=""/.test(s) && !/<StatTile\b/.test(s),
    (s) => s.replace('<dl data-audit-counts=""', '<StatTile label="x" value={1} /><dl data-audit-counts=""'))
}

console.log('\nR14) strategy advanced: flat, one notice, gentle reject')
{
  const ideas = src('components/content/AutomationIdeas.tsx')
  guard('the "no automatic links" sentence is one Notice, never per row', ideas,
    (s) => /<Notice tone="info"[^>]*><span data-links-none-once="">\{t\.linksNoneHint\}<\/span><\/Notice>/.test(s)
      && /why && why !== t\.linksNoneHint \?/.test(s),
    (s) => s.replace('why && why !== t.linksNoneHint ?', 'why ?'))
  guard('reject is a ghost button (no red text) behind a danger confirm', ideas,
    (s) => /<Button size="sm" variant="ghost" onClick=\{\(\) => void rejectSelected\(\)\}[^>]*data-idea-reject-selected=""/.test(s)
      && !/data-idea-reject-selected=""[^>]*text-bad/.test(s) && !/className="[^"]*text-bad[^"]*"[^>]*data-idea-reject-selected/.test(s),
    (s) => s.replace('onClick={() => void rejectSelected()}', 'className="text-bad" onClick={() => void rejectSelected()}'))
  for (const file of ['components/content/AutomationIdeas.tsx', 'components/content/AutomationSchedule.tsx', 'components/content/workspace/AutomationScreen.tsx', 'components/content/GscRecommendations.tsx']) {
    guard(`${file.split('/').pop()}: no card-in-card (no Card inside the page card)`, src(file),
      (s) => !/<Card\b/.test(s), (s) => s.replace(/<div data-/, '<Card /><div data-').replace(/<div className=/, '<Card /><div className='))
  }
  guard('TopicsList: one inline action, the rest behind the row menu', src('components/content/TopicsList.tsx'),
    (s) => /<RowMenu\b/.test(s), (s) => s.replace(/<RowMenu\b/g, '<Menu'))
}

console.log('\nR15) content tables read at 390')
{
  guard('TopicsList hides its secondary columns below md/lg and repeats keyword+status in the title cell', src('components/content/TopicsList.tsx'),
    (s) => /hidden md:table-cell/.test(s) && /hidden lg:table-cell/.test(s) && /data-topic-meta=""[^>]*md:hidden/.test(s),
    (s) => s.replace(/hidden (md|lg):table-cell/g, ''))
  // The existing-content list moved into its own part (existing/ContentTable): the
  // table stacks on a phone, the secondary figures drop below md, and the title
  // cell keeps the page's short address under its name.
  guard('existing content: the table stacks on phones, hides secondary columns and keeps the address under the title', src('components/content/workspace/existing/ContentTable.tsx'),
    (s) => /<Table stackBelowSm>/.test(s) && /<Th hideBelow="md"/.test(s) && /<Td hideBelow="md"/.test(s)
      && /<Td stack="title"[\s\S]{0,900}displayPath\(it\.url\)/.test(s),
    (s) => s.replace('<Table stackBelowSm>', '<Table>'))
}

console.log('\nR17) the topic plan is a side sheet with one primary')
{
  const drawer = src('components/content/TopicPlanDrawer.tsx')
  guard('a side sheet (end edge, max-w-xl), not the centred Modal', drawer,
    (s) => !/from '@\/components\/ui\/Modal'/.test(s) && /data-topic-plan-sheet=""/.test(s) && /fixed inset-y-0 end-0[^"]*max-w-xl/.test(s),
    (s) => s.replace("import Button from '@/components/ui/Button'", "import Modal from '@/components/ui/Modal'\nimport Button from '@/components/ui/Button'"))
  guard('primary = queue with the recommended links; "without links" is secondary', drawer,
    (s) => /<Button\s+onClick=\{saveAndQueue\}[\s\S]{0,300}data-plan-action="queue-with-links"/.test(s)
      && /<Button variant="secondary" onClick=\{saveAndQueue\}[^>]*data-plan-action="queue-without-links"/.test(s),
    (s) => s.replace('<Button variant="secondary" onClick={saveAndQueue}', '<Button onClick={saveAndQueue}'))
  guard('no raw server error reaches the merchant on save', drawer,
    (s) => !/setError\((d|data)\.(error|message)/.test(s),
    (s) => s.replace('setError(', 'setError(d.error || '))
}

console.log('\nR24) no per-row noise')
{
  const articles = src('components/content/workspace/ArticlesScreen.tsx')
  guard('articles: no per-row "connect to publish"; not-sent is a quiet dash', articles,
    (s) => !/connectToPublish/.test(s) && /function NotSent\(/.test(s) && !/<Badge[^>]*>\{[^}]*notSent\}<\/Badge>/.test(s),
    (s) => s.replace("const inline = a.status !== 'published' && rowCta.kind === 'grant_scope'", "const inline = a.status !== 'published' && rowCta.kind === 'connect' ? <span>{t.editor.topBar.connectToPublish}</span> : a.status !== 'published' && rowCta.kind === 'grant_scope'"))
  guard('existing content: only the exception badges (ours / cannibal), not "was on the site"', src('components/content/workspace/existing/ContentTable.tsx'),
    (s) => !/badgeSite|origin\.site\b|origin === 'site'/.test(s) && /it\.origin === 'ours' && <Badge/.test(s) && /it\.cannibalization && \(/.test(s),
    (s) => s.replace("{it.origin === 'ours' && ", "{it.origin === 'site' && <Badge>{x.origin.site}</Badge>}{it.origin === 'ours' && "))
}

console.log('\nR28) an empty strategy is one EmptyState with "create topic"')
{
  guard('planEmpty renders StrategyEmpty (EmptyState + create action) instead of empty columns', src('components/content-strategy/ContentStrategyScreen.tsx'),
    (s) => /const planEmpty = !!board && board\.cards\.length === 0 && !board\.next/.test(s) && /<EmptyState\b/.test(s)
      && /\{s\.emptyPlanAction\}/.test(s) && /\{planEmpty \? null : board \?/.test(s),
    (s) => s.replace('{planEmpty ? null : board ?', '{board ?'))
}

console.log('\nR29) brief modal at 390 and project-aware examples')
{
  const brief = src('components/content/ArticleBriefModal.tsx')
  guard('article depth: a Select below sm, the Segmented from sm', brief,
    (s) => /<span id="brief-depth-label" className=\{FIELD_LABEL_CLASSES\}>\{t\.articleDepthLabel\}<\/span>/.test(s) && /aria-labelledby="brief-depth-label"/.test(s)
      && /<div className="sm:hidden" data-depth-select="">\s*<Select/.test(s) && /<div className="hidden sm:block" data-depth-segmented="">\s*<Segmented<ArticleDepth>/.test(s),
    (s) => s.replace('<div className="sm:hidden" data-depth-select="">', '<div data-depth-select="">'))
  guard('the example term is used only for the workspace\'s own project', brief,
    (s) => /const term = projectId === defaultProjectId \? \(exampleTerm \?\? ''\)/.test(s) && /placeholder=\{topicPlaceholder\}/.test(s),
    (s) => s.replace("const term = projectId === defaultProjectId ? (exampleTerm ?? '')", "const term = (exampleTerm ?? '')"))
  const dicts = read('lib/i18n/dashboard/he.ts') + read('lib/i18n/dashboard/en.ts')
  guard('no other business\'s niche ("treadmill") in the brief examples', dicts,
    (s) => !/הליכון ביתי|home treadmill|example\.co\.il\/treadmills/.test(s) && /topicPlaceholderWithTerm: /.test(s),
    (s) => s + "\nprimaryKeywordPlaceholder: 'לדוגמה: הליכון ביתי',")
}

console.log('\nR35) font-mono only on code blocks')
{
  guard('the webhook secret is shown in the body font with tabular numbers', src('components/content/site-platforms/PlatformSwitchModal.tsx'),
    (s) => /\{secret\}<\/code>/.test(s) && !/font-mono[^>]*>\{secret\}/.test(s),
    (s) => s.replace(/text-caption tabular-nums text-ink">\{secret\}/, 'font-mono text-caption text-ink">{secret}'))
}

console.log(`\n${passed} passed, ${failed} failed`)
if (failed) process.exitCode = 1
export {}
