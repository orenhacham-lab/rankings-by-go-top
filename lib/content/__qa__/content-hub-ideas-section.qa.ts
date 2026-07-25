/**
 * M — the "New article topic" button leads to the automatic article-ideas section,
 * and the ideas destination gains a MANUAL topic sub-tab that reuses the existing
 * ArticleBriefModal (POST /api/content/topics, source='manual'). The automatic
 * workflow is unchanged; manual creation never bypasses checks and never auto-queues.
 */
import { readFileSync } from 'fs'
import { join } from 'path'
import { ideasSectionFromParam, ideasSectionToParam } from '../content-hub-ideas-section'
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

  console.log('SOURCE) Content Hub wiring')
  const hub = strip(read('components/content/ContentHub.tsx'))

  // 1 — every "New article topic" button is retargeted to the single handler.
  check('all create-topic buttons use handleCreateTopic', (hub.match(/onClick=\{handleCreateTopic\}/g) || []).length === 3)
  check('handleCreateTopic → ideas section when automation on, else the modal',
    /handleCreateTopic = useCallback\(\(\) => \{[\s\S]*?if \(automationEnabled\) goToIdeas\(\)[\s\S]*?else \{ setEditingTopic\(null\); setBriefOpen\(true\) \}/.test(hub))
  check('goToIdeas selects the automatic sub-tab + scrolls to it', /goToIdeas = useCallback[\s\S]*?changeIdeasSection\('auto'\)[\s\S]*?ideasSectionRef\.current\?\.scrollIntoView/.test(hub))

  // 2 — the ideas destination has auto + manual sub-tabs; manual reuses the SAME modal.
  check('ideas sub-tab bar (auto + manual)', /t\.ideasSubTabs\.auto/.test(hub) && /t\.ideasSubTabs\.manual/.test(hub) && /changeIdeasSection\(key\)/.test(hub))
  check("manual sub-tab reuses ArticleBriefModal (setBriefOpen) — not a new topic type",
    /ideasSection === 'manual' \?[\s\S]*?manualTopicTitle[\s\S]*?onClick=\{\(\) => \{ setEditingTopic\(null\); setBriefOpen\(true\) \}\}/.test(hub))
  check('manual create button is the ONLY direct setBriefOpen (the 3 list buttons were retargeted)',
    (hub.match(/onClick=\{\(\) => \{ setEditingTopic\(null\); setBriefOpen\(true\) \}\}/g) || []).length === 1)

  // 3 — automatic workflow unchanged (still the AutomationIdeas + schedule, under 'auto').
  check('automatic ideas workflow preserved (AutomationIdeas + AutomationSchedule)', /<AutomationIdeas/.test(hub) && /<AutomationSchedule/.test(hub))

  // URL sync — one mechanism (?section), deep-link/refresh/back-forward via searchParams.
  check('sub-tab change writes ?section via router.replace (no history spam)', /params\.set\('section', ideasSectionToParam\(section\)\)[\s\S]*?router\.replace/.test(hub) && !/router\.push\([^)]*section/.test(hub))
  check('sub-tab mirrors the URL section param (deep-link / back-forward)', /setIdeasSection\(ideasSectionFromParam\(searchParams\.get\('section'\)\)\)/.test(hub))

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
