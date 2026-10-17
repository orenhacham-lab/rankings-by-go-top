/**
 * AN ITEM SCREEN AND THE WORKSPACE SWITCHER NEVER DISAGREE.
 *
 * The owner reported, for the second time (9 October 2026, after 4 October),
 * that switching projects leaves a page showing the previous project. The
 * screens that read the active project were fixed then (ProjectScoped /
 * WorkspaceGate, guarded by components/layout/__qa__/project-scoped.qa.ts).
 * What was left is the screens about ONE item — an article, a keyword's
 * history, a check's details: their data is keyed by the item in the url, so
 * switching the workspace only rewrote ?projectId and the screen kept showing
 * an item of the old project, with the panels around it working on the old
 * project too.
 *
 * Groups: A the pure decision, B opening versus switching as a sequence,
 * C the three screens actually use it. Each ends with a MUTATION CONTROL.
 */
import { decideItemProject, type ItemProjectDecision } from '../item-project'
import { code } from '../../content/cannibalization/__qa__/_strip'

let pass = 0, fail = 0
function check(name: string, cond: boolean, detail?: string) {
  if (cond) { pass++; console.log(`  ✓ ${name}`) } else { fail++; console.log(`  ✗ ${name}${detail ? ` — ${detail}` : ''}`) }
}

const A = 'aaaaaaaa-0000-0000-0000-000000000001'
const B = 'bbbbbbbb-0000-0000-0000-000000000002'
const decide = (o: Partial<Parameters<typeof decideItemProject>[0]>): ItemProjectDecision =>
  decideItemProject({ itemProjectId: A, activeProjectId: A, isResolved: true, itemProjectKnown: true, hasAdopted: true, ...o })

async function main() {
  console.log('A) the decision itself')
  {
    check('the item belongs to the active project: nothing happens', decide({}).action === 'stay')
    check('the active project is not resolved yet: wait, never guess', decide({ isResolved: false, activeProjectId: null }).action === 'wait')
    check("the item's project is not loaded yet: wait", decide({ itemProjectId: null }).action === 'wait')
    check('opening an item of another project adopts that project', JSON.stringify(decide({ activeProjectId: B, hasAdopted: false })) === JSON.stringify({ action: 'adopt', projectId: A }))
    check('switching the workspace afterwards leaves for the new project', JSON.stringify(decide({ activeProjectId: B })) === JSON.stringify({ action: 'leave', projectId: B }))
    check('an item outside the user own projects is neither adopted nor fled', decide({ activeProjectId: B, itemProjectKnown: false, hasAdopted: false }).action === 'stay')
    check('a switch with no project left to switch to goes nowhere', decide({ activeProjectId: null }).action === 'stay')
    // Opening is decided once: the adoption itself must not look like a switch.
    check('an unresolved list cannot cause a navigation', decide({ activeProjectId: B, isResolved: false }).action === 'wait')

    // MUTATION CONTROL — comparing the two ids and navigating, with no notion of
    // "this is the opening", is what sends a deep link away from the item it asked for.
    const naive = (item: string, active: string) => (item === active ? 'stay' : 'leave')
    check('MUTATION: a bare comparison flees the item on a deep link (guard is real)',
      naive(A, B) === 'leave' && decide({ activeProjectId: B, hasAdopted: false }).action === 'adopt')
  }

  console.log('B) opening, then switching, as the screen lives it')
  {
    // The hook keeps one piece of state: the item whose opening was decided.
    let adoptedFor: string | null = null
    const step = (itemProjectId: string | null, activeProjectId: string | null, isResolved = true) => {
      const d = decideItemProject({ itemProjectId, activeProjectId, isResolved, itemProjectKnown: true, hasAdopted: adoptedFor === itemProjectId })
      if (d.action === 'adopt') adoptedFor = d.projectId
      if (d.action === 'stay' && itemProjectId && itemProjectId === activeProjectId) adoptedFor = itemProjectId
      return d.action
    }
    // Deep link into an article of A while the workspace remembers B.
    check('1. the row has not loaded: wait', step(null, B) === 'wait')
    check('2. the article turns out to be A: adopt A', step(A, B) === 'adopt')
    check('3. the workspace is now A: stay', step(A, A) === 'stay')
    check('4. the owner switches to B: leave for B', step(A, B) === 'leave')
    // Arriving already on the right project still counts as the opening, so the
    // first deliberate switch after it leaves rather than adopting back.
    let adopted2: string | null = null
    const step2 = (item: string | null, active: string | null) => {
      const d = decideItemProject({ itemProjectId: item, activeProjectId: active, isResolved: true, itemProjectKnown: true, hasAdopted: adopted2 === item })
      if (d.action === 'adopt') adopted2 = d.projectId
      if (d.action === 'stay' && item && item === active) adopted2 = item
      return d.action
    }
    check('5. opened from its own project: stay', step2(A, A) === 'stay')
    check('6. then a switch leaves, it does not adopt back', step2(A, B) === 'leave')

    // MUTATION CONTROL — without remembering the opening, step 4 adopts B's
    // place again and the owner is stuck on the old item forever.
    let n = 0
    const forgetful = (item: string, active: string) => {
      const d = decideItemProject({ itemProjectId: item, activeProjectId: active, isResolved: true, itemProjectKnown: true, hasAdopted: false })
      if (d.action === 'adopt') n++
      return d.action
    }
    check('MUTATION: a screen that never remembers the opening never leaves (guard is real)',
      forgetful(A, B) === 'adopt' && forgetful(A, B) === 'adopt' && n === 2)
  }

  console.log('C) the three item screens use it')
  {
    const SCREENS: Array<[string, RegExp]> = [
      ['app/(dashboard)/content/articles/[id]/page.tsx', /useItemProject\(projectId, \(pid\) => `\/content\?projectId=\$\{pid\}`\)/],
      ['app/(dashboard)/keywords/[id]/history/page.tsx', /useItemProject\(target\?\.projects\?\.id \?\? null,/],
      ['app/(dashboard)/scans/[id]/details/page.tsx', /useItemProject\(projectId, \(pid\) => scanHistoryHref\(pid\)\)/],
    ]
    for (const [rel, re] of SCREENS) {
      const src = code(rel)
      check(`${rel}: calls useItemProject with the item's own project`, re.test(src))
      check(`${rel}: imports it`, /from '@\/lib\/active-project\/useItemProject'/.test(src))
    }
    const hook = code('lib/active-project/useItemProject.ts')
    check('the hook takes the decision from the pure core, not inline', /decideItemProject\(\{/.test(hook))
    check('it checks the item project against the user own list', /isValidActiveId\(itemProjectId, projects\)/.test(hook))
    check('leaving replaces the url, so the item is not left in history', /router\.replace\(/.test(hook) && !/router\.push\(/.test(hook))
    // Adoption writes the canonical param and lets the provider adopt it, so the
    // top-bar switcher stays the only caller of setActiveProject (resolve.qa.ts).
    check('adopting writes the canonical ?projectId instead of setting the state itself',
      /next\.set\('projectId', decision\.projectId\)/.test(hook) && !/setActiveProject\(/.test(hook))
    check('the legacy param is not written back', /next\.delete\('project_id'\)/.test(hook))

    // MUTATION CONTROL — the pre-fix screens had no such call at all.
    check('MUTATION: a screen with only a back link would fail C (guard is real)',
      !/useItemProject/.test("const backHref = projectId ? `/content?projectId=${projectId}` : '/content'"))
  }

  console.log(`\n${pass} passed, ${fail} failed`)
  if (fail > 0) process.exitCode = 1
}
main()

export {}
