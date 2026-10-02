/**
 * THE CONTENT STRATEGY TAB (W6c) — the screen's contracts.
 *
 *  C) opening the tab costs nothing: it reads three GET routes, none of which calls a
 *     model or a third party, and the only spending call ("write the first article")
 *     is behind a click, through the existing generate route and its allowance;
 *  L) the list view is the two old screens, mounted only when chosen, so every existing
 *     control keeps working from this tab;
 *  S) the frame: the plan opens the screen, the connection cards follow it;
 *  I) the copy: both languages, the same keys, in a section placed right after the
 *     content section, never at the end of the file.
 *
 * Source guards strip comments first. Every guard has a mutation control.
 *
 * Run: npx tsx lib/content/strategy/__qa__/content-strategy-screen.qa.ts
 */
import { readFileSync, readdirSync } from 'fs'
import { join } from 'path'
import { getDashboardDictionary } from '../../../i18n/dashboard/getDashboardDictionary'

let pass = 0, fail = 0
function check(name: string, cond: boolean, detail?: string) {
  if (cond) { pass++; console.log(`  ✓ ${name}`) } else { fail++; console.log(`  ✗ ${name}${detail ? ` — ${detail}` : ''}`) }
}
const ROOT = join(__dirname, '..', '..', '..', '..')
const read = (p: string) => readFileSync(join(ROOT, p), 'utf8')
const strip = (s: string) => s.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:])\/\/[^\n]*/g, '$1')

const DIR = 'components/content-strategy'
const files = readdirSync(join(ROOT, DIR)).filter((f) => /\.tsx?$/.test(f))
const src = Object.fromEntries(files.map((f) => [f, strip(read(`${DIR}/${f}`))])) as Record<string, string>

function main() {
  console.log('Content strategy — the tab')

  // ── C) opening the tab costs nothing ──────────────────────────────────────
  console.log('\nC) opening the tab reads three GET routes and nothing else')
  {
    const hook = src['useStrategyData.ts']
    const endpoints = (s: string) => [...s.matchAll(/`(\/api\/[^`?$]*)/g)].map((m) => m[1]).sort()
    const EXPECTED = ['/api/content/automation/pools', '/api/content/strategy', '/api/projects/']
    const readsThree = (s: string) => JSON.stringify(endpoints(s)) === JSON.stringify(EXPECTED)
      && !/method:/.test(s) && (s.match(/fetch\(/g) ?? []).length === 1
    check('C1: the data hook reads the board, the queue and the scan, with GET only', readsThree(hook), endpoints(hook).join(', '))
    check('C1-MUT: a hook that also asks the recommendation engine fails C1',
      !readsThree(hook.replace("seed: (projectId: string) =>", "reco: (projectId: string) => `/api/content/automation/recommendations?p=${projectId}`,\n  seed: (projectId: string) =>")))
    check('C1-MUT2: a hook that POSTs fails C1', !readsThree(hook.replace("{ cache: 'no-store' }", "{ cache: 'no-store', method: 'POST' }")))
    // The rankings' ideas: two reads through the owner's own session (row-level security), nothing else.
    const ranking = src['useRankingIdeas.ts']
    const readsRankings = (s: string) => JSON.stringify([...s.matchAll(/\.from\('([^']+)'\)/g)].map((m) => m[1])) === JSON.stringify(['tracking_targets', 'scan_results'])
      && /import \{ createClient \} from '@\/lib\/supabase\/client'/.test(s) && !/createAdminClient|fetch\(|\.(insert|update|upsert|delete|rpc)\(/.test(s)
      && /\.eq\('project_id', projectId\)/.test(s)
    check('C1b: the rankings are read from the tracked keywords and their checks, through the owner\'s session, read-only', readsRankings(ranking))
    check('C1b-MUT: a hook that writes, or reads with the service role, fails C1b',
      !readsRankings(ranking + "\ndb.from('tracking_targets').update({ seen: true })") && !readsRankings(ranking.replace("from '@/lib/supabase/client'", "from '@/lib/supabase/admin'").replace('createClient()', 'createAdminClient()')))
    const screen = src['ContentStrategyScreen.tsx']
    const noteGated = (s: string) => /const ideasNote = strategy\.seed\.state === 'none' && strategy\.mappingAvailable \? dict\.mapping\.strategyMore : null/.test(s)
    check('C1c: "more ideas after the mapping" only for a project with no scan, and only where the mapping can be offered', noteGated(screen))
    check('C1c-MUT: a note for everyone fails C1c', !noteGated(screen.replace("strategy.seed.state === 'none' && strategy.mappingAvailable ?", 'true ?')))

    // Every other fetch in the tab's own components is the one spending call, behind a click.
    const allSrc = Object.entries(src).filter(([f]) => f !== 'useStrategyData.ts')
    const fetches = allSrc.flatMap(([f, s]) => [...s.matchAll(/fetch\(\s*['`]([^'`]+)['`]/g)].map((m) => `${f}:${m[1]}`))
    const onlyGenerate = (list: string[]) => list.length === 1 && list[0] === 'NextArticleCard.tsx:/api/content/articles/generate'
    // The idea actions (approve, not a fit, add a keyword) send the requests of
    // lib/content/strategy/ideas.ts, from a click only: content-strategy-idea-actions.qa.ts U5.
    check('C2: the only other fixed call is the existing generate route, from the next-article card', onlyGenerate(fetches), fetches.join(', '))
    check('C2-MUT: a card that runs the queue\'s generator instead fails C2',
      !onlyGenerate([...fetches.filter((x) => !/articles\/generate/.test(x)), 'NextArticleCard.tsx:/api/content/automation/run']))
    const card = src['NextArticleCard.tsx']
    const behindClick = (s: string) => {
      const fn = s.slice(s.indexOf('async function writeFirst()'), s.indexOf('const secondary ='))
      return /fetch\('\/api\/content\/articles\/generate'/.test(fn) && !/useEffect/.test(s) && /onClick=\{writeFirst\}/.test(s)
    }
    check('C3: it runs only from the button\'s click handler, never on its own', behindClick(card))
    check('C3-MUT: a card that writes on mount fails C3', !behindClick(card.replace("import { useState } from 'react'", "import { useEffect, useState } from 'react'") + '\nuseEffect(() => { void writeFirst() }, [])'))
    const firstOnly = (s: string) => /\{!hasArticles && \(/.test(s) && /onClick=\{writeFirst\}/.test(s.slice(s.indexOf('{!hasArticles && (')))
    check('C4: "write the first article" is offered only before the project has an article (decision 6)', firstOnly(card))
    check('C4-MUT: offering it always fails C4', !firstOnly(card.replace('{!hasArticles && (', '{(')))
    const ideaThroughBrief = (s: string) => /if \(!next\.topicId\) \{\s*onOpenBrief\(/.test(s)
    check('C5: an idea that is not a topic yet goes through the existing brief, so nothing is spent unconfirmed', ideaThroughBrief(card))
    check('C5-MUT: generating straight from an idea fails C5', !ideaThroughBrief(card.replace('onOpenBrief({ topic: next.title', 'void ({ topic: next.title')))
    const errorsAreOurs = (s: string) => /onError\(generationErrorCopy\(body, /.test(s) && !/onError\([^)]*(body\.error|body\.message|e\.message|String\(e\))/.test(s)
    check('C6: a failure is shown as our copy, never the response or exception text', errorsAreOurs(card))
    check('C6-MUT: a card that shows the response text fails C6', !errorsAreOurs(card.replace('onError(generationErrorCopy(body, ', 'onError((body as { error: string }).error ?? generationErrorCopy(body, ')))
  }

  // ── L) the list view ──────────────────────────────────────────────────────
  console.log('\nL) the list view is the old screens, mounted only when chosen')
  {
    const screen = src['ContentStrategyScreen.tsx']
    const lazyList = (s: string) => /view === 'list' \? \(\s*<StrategyListView /.test(s) && (s.match(/<StrategyListView /g) ?? []).length === 1
    check('L1: the list view mounts only when chosen', lazyList(screen))
    check('L1-MUT: a list mounted under the board too fails L1', !lazyList(screen.replace("view === 'list' ? (", "true ? (")))
    const list = screen.slice(screen.indexOf('function StrategyListView'), screen.indexOf('export default function'))
    const holdsEverything = (s: string) => /\{automationEnabled && \(\s*<section id=\{STRATEGY_ANCHORS\.ideas\}/.test(s)
      && /<AutomationScreen proFirst=\{proFirst\} \/>/.test(s) && /<section id=\{STRATEGY_ANCHORS\.topics\}[^>]*>\s*<TopicsScreen \/>/.test(s)
    check('L2: ideas, queue and cadence (automation, behind its flag), then topics and links', holdsEverything(list))
    check('L2-MUT: a list that drops the automation screen fails L2', !holdsEverything(list.replace('<AutomationScreen proFirst={proFirst} />', '')))
    const viewInUrl = (s: string) => /strategyViewFromParam\(searchParams\.get\(STRATEGY_VIEW_PARAM\)\)/.test(s) && /router\.replace\(/.test(s) && !/useState<StrategyView>/.test(s)
    check('L3: the view lives in the url, so a refresh or a shared link keeps it', viewInUrl(screen))
    check('L3-MUT: a view kept in component state fails L3', !viewInUrl(screen.replace('strategyViewFromParam(searchParams.get(STRATEGY_VIEW_PARAM))', "useState<StrategyView>('board')[0]")))
    const provider = strip(read('components/content/workspace/ContentWorkspaceProvider.tsx'))
    const navInTab = (s: string) => /router\.push\(strategyHref\('list', STRATEGY_ANCHORS\.queue\)\)/.test(s)
      && /router\.push\(strategyHref\('list', STRATEGY_ANCHORS\.topics\)\)/.test(s)
    check('L4: "go to the queue" and "review the links" lead into the tab\'s list view', navInTab(provider))
    check('L4-MUT: a provider still pushing the old topics screen fails L4',
      !navInTab(provider.replace("router.push(strategyHref('list', STRATEGY_ANCHORS.topics))", "router.push('/content/topics')")))
  }

  // ── S) the frame ──────────────────────────────────────────────────────────
  console.log('\nS) the plan opens the screen')
  {
    const shell = strip(read('components/content/workspace/ContentWorkspaceShell.tsx'))
    const setupAfter = (s: string) => {
      const kids = s.search(/\)\s*:\s*\(\s*children\s*\)/)
      return /const setupAfterScreen = screen === 'strategy'/.test(s) && kids > 0
        && s.indexOf('{!setupAfterScreen && setup}') > 0 && s.indexOf('{!setupAfterScreen && setup}') < kids && s.lastIndexOf('{setupAfterScreen && ') > kids
        && (s.match(/<ContentHubSetup/g) ?? []).length === 1
    }
    check('S1: on the strategy tab the connection cards follow the plan; elsewhere they lead, mounted once', setupAfter(shell))
    check('S1-MUT: cards before the plan on every screen fails S1', !setupAfter(shell.replace("screen === 'strategy'", "screen === ('none' as string)").replace('const setupAfterScreen = screen', 'const setupAfterScreenX = screen')))
    const prefill = (s: string) => /prefill=\{briefPrefill\}/.test(s) && /onClose=\{closeBrief\}/.test(s)
    check('S2: the brief can open filled in with an idea, and forgets it when it closes', prefill(shell)
      && /const closeBrief = useCallback\(\(\) => \{ setBriefOpen\(false\); setBriefPrefill\(null\) \}/.test(strip(read('components/content/workspace/ContentWorkspaceProvider.tsx'))))
    check('S2-MUT: a modal that keeps the prefill after closing fails S2', !prefill(shell.replace('onClose={closeBrief}', 'onClose={() => setBriefOpen(false)}')))
    const screen = src['ContentStrategyScreen.tsx']
    const order = (s: string) => {
      const i = [s.indexOf('<SeedPlanNotice'), s.indexOf('<NextArticleCard'), s.indexOf('<StrategyBoard'), s.indexOf('<StrategyListView ')]
      return i.every((x) => x > 0) && i[0] < i[1] && i[1] < i[2]
    }
    check('S3: row 0 (the scan), row 1 (the next article), row 2 (the board) in that order', order(screen))
    check('S3-MUT: the board above the next article fails S3', !order(screen.replace('<NextArticleCard', '<XNext').replace('<StrategyBoard', '<NextArticleCard').replace('<XNext', '<StrategyBoard')))
  }

  // ── I) copy ───────────────────────────────────────────────────────────────
  console.log('\nI) both languages, one shape, in the right place')
  {
    const leaves = (o: unknown, prefix = ''): string[] => (o && typeof o === 'object'
      ? Object.entries(o as Record<string, unknown>).flatMap(([k, v]) => leaves(v, prefix ? `${prefix}.${k}` : k))
      : [prefix])
    const he = getDashboardDictionary('he').contentStrategy as unknown
    const en = getDashboardDictionary('en').contentStrategy as unknown
    const sameShape = (a: unknown, b: unknown) => JSON.stringify(leaves(a).sort()) === JSON.stringify(leaves(b).sort())
    check('I1: Hebrew and English have the same keys', sameShape(he, en), `${leaves(he).length} vs ${leaves(en).length}`)
    const dropped = JSON.parse(JSON.stringify(en)); delete dropped.seed.failedTitle
    check('I1-MUT: an English block missing one line fails I1', !sameShape(he, dropped))
    const values = (o: unknown): string[] => (o && typeof o === 'object' ? Object.values(o as Record<string, unknown>).flatMap(values) : [String(o)])
    const filled = (o: unknown) => values(o).every((v) => v.trim().length > 0 && !/—/.test(v))
    check('I2: every line is written, and none leans on an em dash', filled(he) && filled(en))
    check('I2-MUT: a line with an em dash fails I2', !filled({ x: 'plan — later' }))
    check('I3: the Hebrew copy is Hebrew and the English copy is not',
      values(he).filter((v) => !/\{/.test(v)).every((v) => /[֐-׿]/.test(v)) && values(en).every((v) => !/[֐-׿]/.test(v)))
    for (const f of ['lib/i18n/dashboard/he.ts', 'lib/i18n/dashboard/en.ts']) {
      const s = read(f)
      const tops = [...s.matchAll(/^ {2}([A-Za-z]+): \{/gm)].map((m) => m[1])
      const placed = (list: string[]) => list.indexOf('contentStrategy') === list.indexOf('contentHub') + 1 && list.indexOf('contentStrategy') < list.length - 1
      check(`I4: ${f} places the section right after the content section, not at the end`, placed(tops), tops.join(','))
      check(`I4-MUT: ${f} with the section moved to the end fails I4`, !placed([...tops.filter((t) => t !== 'contentStrategy'), 'contentStrategy']))
    }
  }

  console.log(`\n${pass} passed, ${fail} failed`)
  if (fail > 0) process.exit(1)
}
main()

export {}
