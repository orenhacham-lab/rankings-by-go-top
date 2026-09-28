/**
 * EXISTING PROJECTS (part B of the UX review): the mapping state every project
 * has, the screens that offer it, and the two onboarding fixes that ship with it.
 *
 *  M) mappingFrom: none, running, done or failed from the seed route's answer
 *     alone (no migration: an older project simply has no run); anything but a
 *     200 is "not available", so nothing is offered that might be refused;
 *  I) the banner invites only when there is no mapping or the last one failed;
 *  Z) "later" hides the banner for a week, and an unreadable value hides nothing;
 *  G) the gate: the banner, its placeholders and the research tab's start read
 *     the seed route, whose GET answers exactly when the settings' scan band
 *     shows (ENABLE_SEED_SCAN=true, or an administrator), and start the same
 *     rescan the settings start (POST { action: 'start' }), so the owner-data
 *     guarantee of lib/seed-scan/__qa__/seed-rescan-owner-data.qa.ts holds;
 *     every one of them renders nothing when the mapping is not available;
 *  F) P0-6: a site that refuses automated reads is not a dead end: three ways on
 *     (connect its platform, continue without a scan, talk to us), no claim about
 *     Google in either language, and the frame is start-aligned at 640px (P2-4);
 *  B) P1-12: the "research runs in the background" bar is sticky only while
 *     stage B really runs; finished or failed, it says so and lets go.
 *
 * Source guards strip comments before matching. Every guard has an in-suite
 * mutation control (-MUT); code-level controls are run on the real files by the
 * job's mutation script and listed in the PR.
 *
 * Run: npx tsx lib/project-mapping/__qa__/mapping-state.qa.ts
 */
import { readFileSync } from 'fs'
import { join } from 'path'
import {
  MAPPING_GIVE_UP_MS, MAPPING_SNOOZE_MS, MAPPING_STEPS, mappingFrom, mappingInvites, mappingRunning, snoozeKey, snoozed,
  type Mapping,
} from '../state'
import { getDashboardDictionary } from '../../i18n/dashboard/getDashboardDictionary'
import { FAILURES_WITH_WAYS_AROUND, SUPPORT_WHATSAPP_HREF } from '../../onboarding/links'

let pass = 0, fail = 0
function check(name: string, cond: boolean, detail?: string) {
  if (cond) { pass++; console.log(`  ✓ ${name}`) } else { fail++; console.log(`  ✗ ${name}${detail ? ` — ${detail}` : ''}`) }
}
const show = (v: unknown) => JSON.stringify(v)
const ROOT = join(__dirname, '..', '..', '..')
const strip = (s: string) => s.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:])\/\/[^\n]*/g, '$1').replace(/\{\s*\}/g, '{}')
const src = (p: string) => strip(readFileSync(join(ROOT, p), 'utf8'))

const NOW = new Date('2026-09-28T12:00:00Z')
const step = (s: string, status: string) => ({ step: s, status })
const run = (over: Record<string, unknown> = {}) => ({
  id: 'r1', stage: 'a', status: 'running', stalled: false, startedAt: '2026-09-28T11:59:00Z',
  steps: [step('a1', 'done'), step('a2', 'running'), step('a3', 'pending')],
  summary: { scannedAt: '2026-09-28T11:59:30Z' },
  ...over,
})
const ok = (r: unknown) => ({ ok: true, run: r })
const stateOf = (m: Mapping) => (m.available === true ? m.state : `unavailable:${m.available}`)

function main() {
  console.log('Existing projects: the mapping, its gate, and the onboarding fixes')

  // ── M) the state ────────────────────────────────────────────────────────────
  console.log('\nM) the state, from what is stored')
  {
    const none = mappingFrom(200, { ok: true, run: null }, NOW)
    check('M1: a 200 with no run is "none" (an older project), every step pending, nothing scanned',
      none.available === true && none.state === 'none' && none.stageB === 'none' && none.scannedAt === null
      && show(none.steps.map((s) => s.state)) === show(['pending', 'pending', 'pending', 'pending']) && show(none.steps.map((s) => s.step)) === show([...MAPPING_STEPS]))
    const off = [mappingFrom(404, { ok: false, code: 'not_found' }, NOW), mappingFrom(500, ok(run()), NOW), mappingFrom(0, null, NOW), mappingFrom(200, { ok: false }, NOW), mappingFrom(200, 'junk', NOW)]
    check('M2: a 404 (the flag off for this user), a failed read, no answer or a malformed body is "not available", never "none"',
      off.every((m) => m.available === false && m.state === null), show(off.map(stateOf)))
    const running = mappingFrom(200, ok(run()), NOW)
    check('M3: stage A running is "running", its steps as the bar shows them (skipped and failed count as over)',
      running.available === true && running.state === 'running' && show(running.steps.map((s) => s.state)) === show(['done', 'running', 'pending', 'pending'])
      && show(mappingFrom(200, ok(run({ steps: [step('a1', 'done'), step('a2', 'skipped'), step('a3', 'failed'), step('a4', 'running')] })), NOW).available === true
        ? (mappingFrom(200, ok(run({ steps: [step('a1', 'done'), step('a2', 'skipped'), step('a3', 'failed'), step('a4', 'running')] })), NOW) as Extract<Mapping, { available: true }>).steps.map((s) => s.state) : null) === show(['done', 'done', 'done', 'running']))
    const day = 24 * 60 * 60 * 1000 // the cron's day, written out: the constant itself is what is under test
    const stalledOld = mappingFrom(200, ok(run({ stalled: true, startedAt: new Date(NOW.getTime() - day - 60_000).toISOString() })), NOW)
    const stalledNew = mappingFrom(200, ok(run({ stalled: true, startedAt: new Date(NOW.getTime() - day + 60_000).toISOString() })), NOW)
    const stalledNoDate = mappingFrom(200, ok(run({ stalled: true, startedAt: null })), NOW)
    check('M4: a stalled stage A is still "running" while the cron resumes it (a day), then "failed"; with no start time it is over',
      stateOf(stalledNew) === 'running' && stateOf(stalledOld) === 'failed' && stateOf(stalledNoDate) === 'failed' && MAPPING_GIVE_UP_MS === day, show([stalledNew, stalledOld, stalledNoDate].map(stateOf)))
    check('M5: stage A failed is "failed"; stage A done (or partial) is "done", with when the site was read',
      stateOf(mappingFrom(200, ok(run({ status: 'failed' })), NOW)) === 'failed'
      && stateOf(mappingFrom(200, ok(run({ status: 'done' })), NOW)) === 'done'
      && stateOf(mappingFrom(200, ok(run({ status: 'partial' })), NOW)) === 'done'
      && (mappingFrom(200, ok(run({ status: 'done' })), NOW) as Extract<Mapping, { available: true }>).scannedAt === '2026-09-28T11:59:30Z')
    const b = (status: string, over: Record<string, unknown> = {}) => mappingFrom(200, ok(run({ stage: 'b', status, ...over })), NOW) as Extract<Mapping, { available: true }>
    check('M6: in stage B the mapping itself is done; stage B\'s own state is running, done, or failed (also when it stalled past the day)',
      [b('running'), b('done'), b('partial'), b('failed'), b('running', { stalled: true, startedAt: '2026-09-20T00:00:00Z' })].map((m) => `${m.state}/${m.stageB}`).join()
        === 'done/running,done/done,done/done,done/failed,done/failed')
  }

  // ── I) the invitation ───────────────────────────────────────────────────────
  console.log('\nI) who is invited')
  {
    const m = (status: number, body: unknown) => mappingFrom(status, body, NOW)
    check('I1: invited with no mapping or a failed one; not while it runs, once it is done, or when it cannot be offered',
      mappingInvites(m(200, { ok: true, run: null })) && mappingInvites(m(200, ok(run({ status: 'failed' }))))
      && !mappingInvites(m(200, ok(run()))) && !mappingInvites(m(200, ok(run({ status: 'done' })))) && !mappingInvites(m(404, null)))
    check('I2: only a running mapping is read again', mappingRunning(m(200, ok(run()))) && !mappingRunning(m(200, { ok: true, run: null })) && !mappingRunning(m(404, null)))
  }

  // ── Z) "later" ──────────────────────────────────────────────────────────────
  console.log('\nZ) "later"')
  {
    const at = (ms: number) => String(NOW.getTime() - ms)
    check('Z1: "later" hides the banner for a week, per project',
      snoozed(at(60_000), NOW) && snoozed(at(MAPPING_SNOOZE_MS - 60_000), NOW) && !snoozed(at(MAPPING_SNOOZE_MS + 60_000), NOW)
      && snoozeKey('p1') !== snoozeKey('p2') && MAPPING_SNOOZE_MS === 7 * 24 * 60 * 60 * 1000)
    check('Z2: nothing stored, an unreadable value or a time in the future hides nothing',
      [null, '', 'soon', '-5', '0', String(NOW.getTime() + 3_600_000)].every((v) => !snoozed(v, NOW)))
  }

  // ── G) the gate ─────────────────────────────────────────────────────────────
  console.log('\nG) offered exactly where the settings\' scan band is, and never more')
  {
    const seedHttp = src('lib/seed-scan/http.ts')
    const settingsData = src('lib/project-settings/data.ts')
    const flagOrAdmin = (s: string) => /if \(deps\.env\.ENABLE_SEED_SCAN !== 'true'\) \{[\s\S]{0,300}?deps\.isAdmin\(/.test(s) && /if \(!isAdmin\) return \{ ok: false, response: refuse\(404, 'not_found'\) \}/.test(s)
    const settingsGate = (s: string) => /if \(deps\.env\.ENABLE_SEED_SCAN === 'true'\) return true[\s\S]{0,120}?deps\.isAdmin\(userId\)/.test(s)
    check('G1: the seed route answers only with the scan on or for an administrator (404 otherwise), the same rule as the settings\' scan band',
      flagOrAdmin(seedHttp) && settingsGate(settingsData))
    check('G1-MUT: a route that answers everyone fails G1', !flagOrAdmin(seedHttp.replace("if (!isAdmin) return { ok: false, response: refuse(404, 'not_found') }", '')))

    const hook = src('components/mapping/useMapping.ts')
    const settingsHook = src('components/settings/useSiteScan.ts')
    const sameRescan = (h: string) => /return `\/api\/projects\/\$\{encodeURIComponent\(projectId\)\}\/seed`/.test(h)
      && /fetch\(mappingUrl\(projectId\), \{ cache: 'no-store'/.test(h)
      && /fetch\(mappingUrl\(projectId\), \{\s*method: 'POST',[\s\S]{0,120}body: JSON\.stringify\(\{ action: 'start', locale \}\)/.test(h)
      && (h.match(/fetch\(/g) ?? []).length === 2
    check('G2: the mapping reads the seed route and starts the settings\' own rescan (POST { action: \'start\' }), nothing else',
      sameRescan(hook) && /body: JSON\.stringify\(\{ action: 'start', locale \}\)/.test(settingsHook))
    check('G2-MUT: a mapping that starts stage B too fails G2', !sameRescan(hook.replace("{ action: 'start', locale }", "{ action: 'continue', keywords: [], locale }")))
    const offMeansNothing = (s: string) => /if \(mapping\.available !== true\) return null/.test(s)
    const banner = src('components/mapping/MappingBanner.tsx')
    const placeholder = src('components/mapping/MappingPlaceholder.tsx')
    const start = src('components/keyword-research/ResearchStart.tsx')
    check('G3: the banner and the placeholder render nothing when the mapping is not available; the research start offers it only then',
      offMeansNothing(banner) && offMeansNothing(placeholder) && /const offered = mapping\?\.mapping\.available === true && mapping\.mapping\.state !== 'done' \? mapping : null/.test(start))
    check('G3-MUT: a placeholder shown to everyone fails G3', !offMeansNothing(placeholder.replace('if (mapping.available !== true) return null', '')))
    const dash = src('app/(dashboard)/dashboard/page.tsx')
    const dashGated = (s: string) => /const mapping = useMapping\(project\.id, language, onMappingFinished\)/.test(s)
      && /const mappingOffered = mapping\.mapping\.available === true/.test(s)
      && /<MappingBanner projectId=\{project\.id\} control=\{mapping\} locale=\{language\} \/>/.test(s)
      && /\{!hold && mappingOffered && seed\.kind !== 'loading' && \(/.test(s)
      && /mapping=\{mappingOffered && mapping\.mapping\.state !== 'done' \? mapping : null\}/.test(s)
    check('G4: the dashboard\'s banner, its "holding back" placeholder and the competitors\' run button all hang on that one answer', dashGated(dash))
    check('G4-MUT: a placeholder offered without the gate fails G4', !dashGated(dash.replace("{!hold && mappingOffered && seed.kind !== 'loading' && (", "{!hold && seed.kind !== 'loading' && (")))
    // Every screen is the new one for every project: the scan's absence decides no design.
    const ai = src('app/(dashboard)/ai-visibility/page.tsx')
    const noOldTool = (s: string) => !/if \(seed\.kind === 'none'\) return tool/.test(s) && /overviewMode\b/.test(s)
    check('G5: the AI tab no longer returns the older tool for a project with no scan', noOldTool(ai))
    check('G5-MUT: the old fallback fails G5', !noOldTool(ai.replace('return (', "if (seed.kind === 'none') return tool\n  return (")))
  }

  // ── F) P0-6 ─────────────────────────────────────────────────────────────────
  console.log('\nF) a site that refuses automated reads: three ways on, no claim about Google')
  {
    const screen = src('components/onboarding/SeedRunScreen.tsx')
    const threeWays = (s: string) => {
      const block = s.slice(s.indexOf('data-seed-ways-around'), s.indexOf("} else if (failure?.action === 'settings')"))
      return /\(FAILURES_WITH_WAYS_AROUND as readonly string\[\]\)\.includes\(failure\.key\)/.test(s)
        && /href=\{platformSetupHref\(projectId\)\}/.test(block) && /href=\{settingsHref\(projectId, 'business'\)\}/.test(block)
        && /href=\{SUPPORT_WHATSAPP_HREF\}\s*target="_blank"\s*rel="noopener noreferrer"/.test(block)
        && /t\.actions\.connectPlatform/.test(block) && /t\.actions\.continueWithoutScan/.test(block) && /t\.actions\.talkToUs/.test(block)
    }
    check('F1: site_forbidden offers connect a platform (settings › connections), continue without a scan (the business details), and talk to us (WhatsApp, a new tab, no opener)',
      threeWays(screen) && show([...FAILURES_WITH_WAYS_AROUND]) === show(['siteForbidden']))
    check('F1-MUT: a screen with the retry only fails F1', !threeWays(screen.replace('data-seed-ways-around', 'data-x')))
    const fixed = (h: string) => /^https:\/\/wa\.me\/972\d+\?text=[%A-F0-9]+$/.test(h) && !/next=|redirect|\$\{/.test(h)
    check('F2: "talk to us" is one fixed WhatsApp address, never built from input', fixed(SUPPORT_WHATSAPP_HREF))
    check('F2-MUT: an address that carries a next= fails F2', !fixed(`${SUPPORT_WHATSAPP_HREF}&next=https://evil.example`))
    const googleFree = (text: string) => !/גוגל|google/i.test(text)
    const bodies = (['he', 'en'] as const).map((l) => {
      const d = getDashboardDictionary(l).seedOnboarding
      return { l, body: `${d.notices.siteForbidden.title} ${d.notices.siteForbidden.body}`, actions: [d.actions.connectPlatform, d.actions.continueWithoutScan, d.actions.talkToUs] }
    })
    check('F3: the error says what happened and what can be done, in each language, with no claim about Google',
      bodies.every((b) => googleFree(b.body) && b.actions.every((a) => typeof a === 'string' && a.length > 1)), show(bodies))
    check('F3-MUT: the old sentence ("Google shows none of its pages") fails F3', !googleFree('האתר חוסם קוראים אוטומטיים כמו שלנו, וגוגל עוד לא מציג ממנו דפים.'))
    const frame = (s: string) => /<section className="w-full max-w-\[640px\] pt-2 md:pt-10" data-seed-screen=\{screen\}>/.test(s) && !/data-seed-screen=\{screen\}[^>]*mx-auto/.test(s)
    check('F4: the error frame is start-aligned with the header, at most 640px (P2-4)', frame(screen))
    check('F4-MUT: a centred frame fails F4', !frame(screen.replace('"w-full max-w-[640px] pt-2 md:pt-10"', '"mx-auto w-full max-w-[640px] pt-2 md:pt-10"')))
  }

  // ── B) P1-12 ────────────────────────────────────────────────────────────────
  console.log('\nB) the background-research bar tells the truth')
  {
    const summary = src('components/onboarding/ResearchSummary.tsx')
    const honest = (s: string) => /const stageB = started \? stageBState\(run, new Date\(\)\) : null/.test(s)
      && /\(!started \|\| stageB === 'running'\) && 'sticky bottom-3/.test(s)
      && /\{stageB === 'done' \|\| stageB === 'failed' \? \(/.test(s)
      && /stageB === 'done' \? t\.start\.readyTitle : t\.start\.failedTitle/.test(s)
    check('B1: sticky only while stage B runs; done or failed it becomes one honest line (ready, or did not finish) and stops following the page', honest(summary))
    check('B1-MUT: a bar that stays sticky after stage B ends fails B1', !honest(summary.replace("(!started || stageB === 'running') && 'sticky", "'sticky")))
    for (const l of ['he', 'en'] as const) {
      const st = getDashboardDictionary(l).seedOnboarding.summary.start
      check(`B2 (${l}): the finished and the failed line exist`, !!st.readyTitle && !!st.readyBody && !!st.failedTitle && !!st.failedBody)
    }
  }

  console.log(`\n${pass} passed, ${fail} failed`)
  if (fail > 0) process.exit(1)
}
main()

export {}
