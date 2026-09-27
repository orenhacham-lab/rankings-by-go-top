/**
 * M — the "New article topic" button leads to the automatic article-ideas section,
 * and the ideas destination gains a MANUAL topic sub-tab that reuses the existing
 * ArticleBriefModal (POST /api/content/topics, source='manual'). The automatic
 * workflow is unchanged; manual creation never bypasses checks and never auto-queues.
 */
import { readFileSync } from 'fs'
import { join } from 'path'
import { ideasSectionFromParam, ideasSectionToParam } from '../content-hub-ideas-section'
import { strategyHref, STRATEGY_ANCHORS } from '../strategy/view'
import { getDashboardDictionary } from '../../i18n/dashboard/getDashboardDictionary'

let pass = 0, fail = 0
function check(name: string, cond: boolean, detail?: string) {
  if (cond) { pass++; console.log(`  ✓ ${name}`) } else { fail++; console.log(`  ✗ ${name}${detail ? ` — ${detail}` : ''}`) }
}
const ROOT = join(__dirname, '..', '..', '..')
const read = (p: string) => readFileSync(join(ROOT, p), 'utf8')
const strip = (s: string) => s.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:])\/\/[^\n]*/g, '$1')

function main() {
  console.log('M — ideas section mapping + create-topic retarget + manual sub-tab')

  // ── Pure URL ↔ sub-tab mapping. ──
  check("'ideas' → auto (the documented deep-link)", ideasSectionFromParam('ideas') === 'auto')
  check("'manual' → manual", ideasSectionFromParam('manual') === 'manual')
  check('absent → auto (default)', ideasSectionFromParam(null) === 'auto' && ideasSectionFromParam(undefined) === 'auto')
  check('junk → auto (never accidental manual)', ideasSectionFromParam('xyz') === 'auto' && ideasSectionFromParam('auto') === 'auto')
  check('auto → param "ideas"', ideasSectionToParam('auto') === 'ideas')
  check('manual → param "manual"', ideasSectionToParam('manual') === 'manual')
  check('round-trip auto', ideasSectionFromParam(ideasSectionToParam('auto')) === 'auto')
  check('round-trip manual', ideasSectionFromParam(ideasSectionToParam('manual')) === 'manual')

  console.log('SOURCE) content workspace wiring')
  // The workspace is one screen per concern now, so each contract names the file that
  // owns it: the shared create-topic action and the ?section mirror live in the provider
  // (they cross screens), the sub-tabs and the automatic workflow live on the automation
  // screen, and the create-topic BUTTONS live on the screens a merchant starts from.
  const workspace = strip(read('components/content/workspace/ContentWorkspaceProvider.tsx'))
  const automation = strip(read('components/content/workspace/AutomationScreen.tsx'))
  const articles = strip(read('components/content/workspace/ArticlesScreen.tsx'))
  const topics = strip(read('components/content/workspace/TopicsScreen.tsx'))
  const screens = [articles, topics, automation].join('\n')

  // 1 — every "New article topic" button is retargeted to the single shared handler.
  check('all create-topic buttons use handleCreateTopic (2 on articles, 1 on topics)',
    (articles.match(/onClick=\{handleCreateTopic\}/g) || []).length === 2
    && (topics.match(/onClick=\{handleCreateTopic\}/g) || []).length === 1)
  check('handleCreateTopic → ideas section when automation on, else the modal',
    /handleCreateTopic = useCallback\(\(\) => \{[\s\S]*?if \(automationEnabled\) goToIdeas\(\)[\s\S]*?else \{ setEditingTopic\(null\); setBriefOpen\(true\) \}/.test(workspace))
  // It used to scroll to a section of the one big page, then to navigate to the
  // automation screen. That screen is the ideas section of the content strategy tab's
  // list view now (W6c), so the same intent navigates there, on the automatic sub-tab —
  // which survives a refresh and a share.
  const toIdeas = (src: string) =>
    /goToIdeas = useCallback[\s\S]*?router\.push\(strategyHref\('list', STRATEGY_ANCHORS\.ideas, \{ section: ideasSectionToParam\('auto'\) \}\)\)/.test(src)
  check('goToIdeas navigates to the ideas section of the strategy list view, on the automatic sub-tab', toIdeas(workspace))
  check('MUT: goToIdeas that still pushes the retired automation screen fails that check',
    !toIdeas(workspace.replace("router.push(strategyHref('list', STRATEGY_ANCHORS.ideas, { section: ideasSectionToParam('auto') }))", "router.push('/content/automation?section=ideas')")))
  check('…and that href is the list view at the ideas, with the sub-tab',
    strategyHref('list', STRATEGY_ANCHORS.ideas, { section: ideasSectionToParam('auto') }) === '/content/strategy?view=list&section=ideas#ideas')

  // 2 — the ideas destination has auto + manual sub-tabs; manual reuses the SAME modal.
  check('ideas sub-tab bar (auto + manual)', /t\.ideasSubTabs\.auto/.test(automation) && /t\.ideasSubTabs\.manual/.test(automation) && /changeIdeasSection\(key\)/.test(automation))
  check("manual sub-tab reuses ArticleBriefModal (setBriefOpen) — not a new topic type",
    /ideasSection === 'manual' \?[\s\S]*?manualTopicTitle[\s\S]*?onClick=\{\(\) => \{ setEditingTopic\(null\); setBriefOpen\(true\) \}\}/.test(automation))
  check('manual create button is the ONLY direct setBriefOpen across the workspace',
    (screens.match(/onClick=\{\(\) => \{ setEditingTopic\(null\); setBriefOpen\(true\) \}\}/g) || []).length === 1)
  // ONE modal for the whole workspace, mounted by the shell — not one per screen.
  const shell = strip(read('components/content/workspace/ContentWorkspaceShell.tsx'))
  check('the brief modal is mounted ONCE, by the shell',
    (shell.match(/<ArticleBriefModal/g) || []).length === 1 && !/<ArticleBriefModal/.test(screens))

  // 3 — automatic workflow unchanged (still the AutomationIdeas + schedule, under 'auto').
  check('automatic ideas workflow preserved (AutomationIdeas + AutomationSchedule)', /<AutomationIdeas/.test(automation) && /<AutomationSchedule/.test(automation))

  // URL sync — one mechanism (?section), deep-link/refresh/back-forward via searchParams.
  // The sub-tab change must still REPLACE (no history spam); only the cross-screen
  // navigation above pushes, which is what a navigation should do.
  const changeFn = workspace.slice(workspace.indexOf('const changeIdeasSection'), workspace.indexOf('const goToIdeas'))
  check('sub-tab change writes ?section via router.replace (no history spam)',
    /params\.set\('section', ideasSectionToParam\(section\)\)[\s\S]*?router\.replace/.test(changeFn) && !/router\.push/.test(changeFn))
  check('sub-tab mirrors the URL section param (deep-link / back-forward)', /setIdeasSection\(ideasSectionFromParam\(searchParams\.get\('section'\)\)\)/.test(workspace))

  // The manual create still goes through the existing endpoint (reuse, no bypass).
  const modal = strip(read('components/content/ArticleBriefModal.tsx'))
  check('ArticleBriefModal posts to the existing /api/content/topics', /fetch\('\/api\/content\/topics'/.test(modal))

  // i18n both locales.
  for (const loc of ['he', 'en'] as const) {
    const c = getDashboardDictionary(loc).contentHub as Record<string, unknown>
    const sub = c.ideasSubTabs as Record<string, string> | undefined
    check(`(${loc}) ideasSubTabs + manualTopic strings exist`, !!sub && typeof sub.auto === 'string' && typeof sub.manual === 'string' && typeof c.manualTopicTitle === 'string' && typeof c.manualTopicHint === 'string')
  }

  console.log(`\n${pass} passed, ${fail} failed`)
  if (fail > 0) process.exit(1)
}
main()
