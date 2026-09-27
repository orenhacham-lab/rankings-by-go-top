#!/usr/bin/env node
/**
 * Mutation controls for the keyword research suites, on the REAL files.
 *
 * Each control breaks one thing in a real source file, runs the suite that guards
 * it, and passes only when the named checks fail (a clean failure with the suite's
 * summary line, not a crash). The file is then restored byte for byte, and its
 * sha256 is compared with the original. Every check of the five suites must be
 * named by at least one control (the in-suite "-MUT" controls excepted).
 *
 *   node lib/keyword-research/__qa__/mutation-controls.mjs            run every control
 *   node lib/keyword-research/__qa__/mutation-controls.mjs --anchors  only check that every anchor is found once
 *   node lib/keyword-research/__qa__/mutation-controls.mjs --only W1  run the controls whose id starts with W1
 *
 * Not a *.qa.ts suite on purpose: it edits files, so it never runs inside verify.mjs.
 */
import { spawnSync } from 'node:child_process'
import { createHash } from 'node:crypto'
import { readFileSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', '..', '..')
const SUITES = {
  helpers: 'lib/keyword-research/__qa__/keyword-research-helpers.qa.ts',
  route: 'lib/keyword-research/__qa__/scan-route.qa.ts',
  hook: 'components/keyword-research/__qa__/scan-research-hook.qa.ts',
  screen: 'components/keyword-research/__qa__/keyword-research-screen.qa.ts',
  legacy: 'components/keyword-research/__qa__/legacy-screen.qa.ts',
}
const F = {
  research: 'lib/keyword-research/scan-research.ts',
  wins: 'lib/keyword-research/easy-wins.ts',
  chips: 'lib/keyword-research/chips.ts',
  rows: 'lib/keyword-research/rows.ts',
  model: 'lib/keyword-research/model.ts',
  state: 'lib/keyword-research/scan-state.ts',
  format: 'lib/keyword-research/format.ts',
  route: 'lib/keyword-research/scan-route.ts',
  routeFile: 'app/api/keyword-research/scan/route.ts',
  hook: 'components/keyword-research/useScanResearch.ts',
  page: 'app/(dashboard)/keyword-research/page.tsx',
  overview: 'components/keyword-research/ScanOverview.tsx',
  cards: 'components/keyword-research/ScanCards.tsx',
  easy: 'components/keyword-research/EasyWins.tsx',
  chipsUi: 'components/keyword-research/ResearchChips.tsx',
  gsc: 'components/keyword-research/ScanGscNotice.tsx',
  he: 'lib/i18n/dashboard/he.ts',
  en: 'lib/i18n/dashboard/en.ts',
}
const e = (find, replace, all = false) => ({ find, replace, all })

/** id, suite, file, edits, the checks that must fail. */
const CONTROLS = [
  // ── helpers ──────────────────────────────────────────────────────────────
  ['K1', 'helpers', F.research, [e(".trim().toLowerCase().replace(/\\s+/g, ' ')", ".trim().replace(/\\s+/g, ' ')")], ['K1']],
  ['M1', 'helpers', F.research, [e('origins: SCAN_ORIGINS.filter((o) => origins.has(o)),', 'origins: [...origins],')], ['M1']],
  ['M2', 'helpers', F.research, [e("if (row.origin === 'competitor' && row.value) entry.competitors.add(row.value)", 'if (row.value) entry.competitors.add(row.value)')], ['M2']],
  ['M3', 'helpers', F.research, [e('.sort((a, b) => time(b.fetchedAt) - time(a.fetchedAt))', '.sort((a, b) => time(a.fetchedAt) - time(b.fetchedAt))')], ['M3', 'M4']],
  ['M4', 'helpers', F.research, [e('const inMarket = sorted.filter((r) => r.country === market.country && r.language === market.language)', 'const inMarket = sorted')], ['M4']],
  ['M5', 'helpers', F.research, [e('truncated: merged.length > max,', 'truncated: false,')], ['M5']],
  ['M6', 'helpers', F.research, [e("(typeof v === 'number' && Number.isFinite(v) && v >= 0 ? v : null)", "(typeof v === 'number' && Number.isFinite(v) ? v : null)")], ['M6']],
  ['P1', 'helpers', F.research, [e('if (low !== null && high !== null) return (low + high) / 2', 'if (low !== null && high !== null) return high')], ['P1']],
  ['P2', 'helpers', F.research, [e('if (!best || entry[1].length > best[1].length) best = entry', 'if (!best || entry[1].length >= best[1].length) best = entry')], ['P2']],
  ['P3', 'helpers', F.research, [e('monthlySearches += r.avgMonthlySearches ?? 0', 'monthlySearches = Math.max(monthlySearches, r.avgMonthlySearches ?? 0)')], ['P3']],
  ['E1', 'helpers', F.wins, [e('export const EASY_WIN_MIN_VOLUME = 30', 'export const EASY_WIN_MIN_VOLUME = 20')], ['E1']],
  ['E2', 'helpers', F.wins, [e('export const WEIGHTS = { competition: 0.45, volume: 0.35, cpc: 0.2 } as const', 'export const WEIGHTS = { competition: 0.5, volume: 0.3, cpc: 0.2 } as const')], ['E2']],
  ['E2b', 'helpers', F.wins, [e("const competition = level === 'low' ? 1 : level === 'unknown' ? 0.6 : 0.5", "const competition = level === 'low' ? 1 : level === 'unknown' ? 0.5 : 0.5")], ['E2']],
  ['E3', 'helpers', F.wins, [e('return b.win.score - a.win.score || b.win.volume - a.win.volume || byText(', 'return b.win.score - a.win.score || byText(')], ['E3']],
  ['E4', 'helpers', F.wins, [e('export const HIGH_CPC_RATIO = 1.25', 'export const HIGH_CPC_RATIO = 1.3')], ['E4']],
  ['E5', 'helpers', F.he, [e("v.competition === 'low' ? ' ותחרות נמוכה'", "v.competition === 'low' ? ''")], ['E5']],
  ['E5b', 'helpers', F.en, [e('signals buying intent', 'means people buy')], ['E5']],
  ['Q1', 'helpers', F.chips, [e("return first.length > 2 && first.startsWith('ו') && QUESTION_WORDS.has(first.slice(1))", 'return false')], ['Q1']],
  ['Q1b', 'helpers', F.chips, [e("'כמה', 'האם', 'איזה'", "'כמה', 'האם', 'מי', 'איזה'")], ['Q1']],
  ['C1', 'helpers', F.research, [e("export const RESEARCH_ORIGINS: readonly ScanOrigin[] = ['seed_keywords', 'home_page', 'site']", "export const RESEARCH_ORIGINS: readonly ScanOrigin[] = ['seed_keywords', 'home_page', 'site', 'competitor']")], ['C1']],
  ['C1b', 'helpers', F.chips, [e("case 'suggested': return row.origins.length > 0 && !row.tracked && row.relevant === true", "case 'suggested': return row.origins.length > 0 && !row.tracked")], ['C1']],
  ['C1c', 'helpers', F.chips, [e('export const HIGH_VOLUME_MIN = 1_000', 'export const HIGH_VOLUME_MIN = 2_000')], ['C1']],
  ['C2', 'helpers', F.chips, [e('for (const chip of RESEARCH_CHIPS) if (chipMatches(chip, row)) counts[chip]++', "for (const chip of RESEARCH_CHIPS) if (chip !== 'google' && chipMatches(chip, row)) counts[chip]++")], ['C2']],
  ['C3', 'helpers', F.chips, [e('  wins.sort(compareWins)\n', '\n')], ['C3']],
  ['R1', 'helpers', F.rows, [e('const found = k.origins ? null : scanByKey.get(key)', 'const found = k.origins ? null : undefined')], ['R1']],
  ['R2', 'helpers', F.rows, [e('const key = keywordKey(t.keyword)\n    if (key && !trackedByKey.has(key))', 'const key = t.keyword\n    if (key && !trackedByKey.has(key))')], ['R2']],
  ['R3', 'helpers', F.rows, [e('if (args.withGoogleOnly && args.google) {', 'if (args.google) {')], ['R3']],
  ['D1', 'helpers', F.model, [e("const mode = args.manual && args.manual.length > 0 ? 'manual' : args.scanKeywords.length > 0 ? 'scan' : null", "const mode = args.scanKeywords.length > 0 ? 'scan' : args.manual && args.manual.length > 0 ? 'manual' : null")], ['D1']],
  ['D2', 'helpers', F.model, [e("const own = mode === 'scan' ? rows.filter((r) => r.origins.length > 0) : rows", 'const own = rows')], ['D2']],
  ['D2b', 'helpers', F.model, [e('rankEasyWins(own.filter((r) => r.relevant !== false), totals.averageCpc)', 'rankEasyWins(own, totals.averageCpc)')], ['D2']],
  ['S1', 'helpers', F.state, [e('.map((k) => k.trim().slice(0, 160)).slice(0, 5)', '.map((k) => k.trim().slice(0, 160)).slice(0, 6)')], ['S1']],
  ['S2', 'helpers', F.state, [e('truncated: b.truncated === true,', 'truncated: !!b.truncated,')], ['S2']],
  ['S3', 'helpers', F.state, [e("if (!research) return { kind: 'pending', ...base }", "if (!research) return { kind: 'running', steps: progressSteps(run), ...base }")], ['S3']],
  ['S4', 'helpers', F.state, [e('export const STALL_GIVE_UP_MS = 24 * 60 * 60 * 1000', 'export const STALL_GIVE_UP_MS = 48 * 60 * 60 * 1000')], ['S4']],
  ['S5', 'helpers', F.state, [e('export const POLL_MAX_MS = 30_000', 'export const POLL_MAX_MS = 60_000')], ['S5']],
  ['S6', 'helpers', F.state, [e('if (terminalCount(next) > terminalCount(prev)) return true', 'if (terminalCount(next) > terminalCount(prev) + 1) return true')], ['S6']],
  ['S7', 'helpers', F.state, [e("if (run.storefrontLocked || b2?.errorCode === 'storefront_locked') return 'storefront_locked'", "if (b2?.errorCode === 'storefront_locked') return 'storefront_locked'")], ['S7']],
  ['F1', 'helpers', F.format, [e("{ day: 'numeric', month: 'short', year: 'numeric', timeZone: 'UTC' }", "{ day: 'numeric', month: 'long', year: 'numeric', timeZone: 'UTC' }")], ['F1']],

  // ── route ────────────────────────────────────────────────────────────────
  ['A1', 'route', F.route, [e("if (!session.userId) return refuse(401, 'unauthorized')", "if (!session.userId && Date.now() < 0) return refuse(401, 'unauthorized')")], ['A1']],
  ['A2', 'route', F.route, [e("return refuse(503, 'unavailable')", "return refuse(500, 'internal')")], ['A2']],
  ['A3', 'route', F.route, [e("if (!UUID.test(projectId)) return refuse(404, 'not_found')", '')], ['A3']],
  ['A4', 'route', F.route, [
    e(".select('id, user_id, business_name')\n    .eq('id', projectId)\n    .eq('user_id', userId)", ".select('id, user_id, business_name')\n    .eq('id', projectId)"),
    e('return project && project.user_id === userId ? project : null', 'return project'),
  ], ['A4', 'A6']],
  ['A5', 'route', F.route, [e("if (deps.env.ENABLE_SEED_SCAN !== 'true') {", 'if (Date.now() < 0) {')], ['A5']],
  ['A6', 'route', F.route, [e(".eq('project_id', scope.projectId)\n    .eq('user_id', scope.userId)\n    .limit(MAX_TRACKED)", ".eq('project_id', scope.projectId)\n    .limit(MAX_TRACKED)")], ['A6', 'A7']],
  ['A7', 'route', F.route, [e(".eq('project_id', scope.projectId)\n    .eq('user_id', scope.userId)\n    .limit(MAX_TRACKED)", ".eq('user_id', scope.userId)\n    .limit(MAX_TRACKED)")], ['A7']],
  ['A8', 'route', F.route, [e('vocab = found.size >= MIN_SITE_VOCAB_TOKENS ? found : null', 'vocab = found')], ['A8']],
  ['A8b', 'route', F.route, [e('const brandTokens = tokens(name)', 'const brandTokens = new Set<string>()')], ['A8']],
  ['A9', 'route', F.route, [e('fetchedAt: merged.fetchedAt,', 'fetchedAt: null,')], ['A9']],
  ['A9b', 'route', F.route, [e("const NO_STORE = { 'Cache-Control': 'no-store' }", 'const NO_STORE = {}')], ['A9', 'A12']],
  ['A10', 'route', F.route, [e("console.error('[keyword-research/scan] read failed', { error: err instanceof Error ? err.name : typeof err })", "console.error('[keyword-research/scan] read failed', err)")], ['A10']],
  ['A10b', 'route', F.route, [e("if (tracked === 'error') return refuse(500, 'internal')", '')], ['A10']],
  ['A11', 'route', F.route, [e('    const merged = mergeSeedResearch(rows)', "    await fetch('https://google.serper.dev/search').catch(() => null)\n    const merged = mergeSeedResearch(rows)")], ['A11']],
  ['A11b', 'route', F.route, [e('    const merged = mergeSeedResearch(rows)', "    await require('../google-ads/keyword-ideas').generateKeywordIdeas({ researchType: 'keyword', keywords: ['x'], country: 'IL', language: 'he' }).catch(() => null)\n    const merged = mergeSeedResearch(rows)")], ['A11']],
  ['A12', 'route', F.route, [e("if (!UUID.test(projectId)) return refuse(404, 'not_found')", "if (!UUID.test(projectId)) return refuse(404, 'missing' as ScanResearchErrorCode)")], ['A12']],
  ['A13', 'route', F.routeFile, [e('    env: process.env,', '    env: {},')], ['A13']],
  ['A13b', 'route', F.routeFile, [e('export async function GET(request: Request) {', 'export async function POST(request: Request) { return GET(request) }\n\nexport async function GET(request: Request) {')], ['A13']],

  // ── hook ─────────────────────────────────────────────────────────────────
  ['H1', 'hook', F.hook, [e("const res = await fetch(url, { cache: 'no-store' })", "const res = await fetch(url, { cache: 'no-store', method: 'POST' })")], ['H1']],
  ['H2', 'hook', F.hook, [e("const polling = !!current && current.value.kind === 'run' && researchRunning(current.value.run, new Date(current.at))", "const polling = !!current && current.value.kind === 'run'")], ['H2']],
  ['H3', 'hook', F.hook, [e('if (changed) readResearch(projectId)', 'readResearch(projectId)')], ['H3']],
  ['H3b', 'hook', F.hook, [e('timer = setTimeout(look, pollDelayMs(n++))', 'timer = setTimeout(look, pollDelayMs(0))')], ['H3']],
  ['H4', 'hook', F.hook, [e("if (typeof document !== 'undefined' && document.visibilityState === 'hidden') { schedule(); return }", '')], ['H4']],
  ['H4b', 'hook', F.hook, [e("if (value.kind !== 'run') { schedule(); return }", "if (value.kind !== 'run') return")], ['H4']],
  ['H5', 'hook', F.hook, [e('const reloadTracked = useCallback(() => { if (projectId) readResearch(projectId) }, [projectId, readResearch])', 'const reloadTracked = useCallback(() => { if (projectId) setAttempt((n) => n + 1) }, [projectId])')], ['H5']],
  ['H6', 'hook', F.hook, [e("setResearch((prev) => (value.kind === 'error' && prev?.projectId === id && prev.value.kind === 'ok' ? prev : { projectId: id, value, at: Date.now() }))", 'setResearch({ projectId: id, value, at: Date.now() })')], ['H6']],
  ['H6b', 'hook', F.hook, [e('const current = seed && seed.projectId === projectId ? seed : null', 'const current = seed')], ['H6b']],
  ['H7', 'hook', F.state, [e('export const STALL_GIVE_UP_MS = 24 * 60 * 60 * 1000', 'export const STALL_GIVE_UP_MS = 48 * 60 * 60 * 1000')], ['H7']],

  // ── screen ───────────────────────────────────────────────────────────────
  ['O1', 'screen', F.overview, [e('{t.overview.headline(formatCount(totals.keywords, language), formatCount(totals.monthlySearches, language))}', '{t.overview.headline(formatCount(totals.monthlySearches, language), formatCount(totals.keywords, language))}')], ['O1']],
  ['O1b', 'screen', F.overview, [e('value={cpc ? formatMoney(cpc.value, cpc.currency, language) : \'\'}', 'value={cpc ? String(cpc.value) : \'\'}')], ['O1']],
  ['O2', 'screen', F.page, [e('{scanMode && !formOpen && <ResearchFormBar onOpen={() => setFormChoice(true)} />}', '')], ['O2']],
  ['O2b', 'screen', F.page, [e("const formOpen = !scanMode || (formChoice ?? (!(model.mode || scanView.kind === 'pending') || loading || !!error))", 'const formOpen = true')], ['O2', 'E3']],
  ['W1', 'screen', F.page, [e('wins={model.wins.slice(0, EASY_WINS_SHOWN)}', 'wins={model.wins.slice(0, 5)}')], ['W1']],
  ['W1b', 'screen', F.easy, [e('cpcHigh: win.cpcAboveAverage,', 'cpcHigh: false,')], ['W1']],
  ['W1c', 'screen', F.easy, [e('{row.tracked ? (', '{false ? (')], ['W1']],
  ['T1', 'screen', F.chipsUi, [e("{loading ? '…' : formatCount(counts[chip], language)}", "{loading ? '…' : formatCount(counts.all, language)}")], ['T1']],
  ['T1b', 'screen', F.chipsUi, [e("const chips = RESEARCH_CHIPS.filter((c) => c !== 'google' || google !== 'hidden')", "const chips = RESEARCH_CHIPS.filter((c) => c !== 'google')")], ['T1']],
  ['T2', 'screen', F.page, [e('{scanMode && sourceLineFor(result.keyword)}', '{scanMode && null}')], ['T2']],
  ['T2b', 'screen', F.page, [e('const tableSource: KeywordIdeaResult[] = scanMode && model.mode ? model.chipRows : results', 'const tableSource: KeywordIdeaResult[] = scanMode && model.mode ? model.chipRows.slice(0, 5) : results')], ['T2']],
  ['T3', 'screen', F.page, [e('        default:\n          return 0\n      }', '        default:\n          aVal = a.avgMonthlySearches ?? -1\n          bVal = b.avgMonthlySearches ?? -1\n      }')], ['T3']],
  ['T4', 'screen', F.page, [e('          projectId: selectedProject,\n          engineType,\n          language,\n          keywords: [{', '          projectId: row.keyword,\n          engineType,\n          language,\n          keywords: [{')], ['T4']],
  ['T4b', 'screen', F.page, [e('gscToast.error(response.status === 402 ? t.addToProject.errorQuota', 'gscToast.error(result?.message || response.status === 402 ? t.addToProject.errorQuota')], ['T4']],
  ['R1', 'screen', F.cards, [e('<ul className="mt-3 flex flex-wrap gap-2" data-seed-keywords="">\n              {seedKeywords.map((k) => (', '<ul className="mt-3 flex flex-wrap gap-2" data-seed-keywords="">\n              {seedKeywords.slice(0, 3).map((k) => (')], ['R1']],
  ['R1b', 'screen', F.page, [e("{scanOn?.kind === 'running' && <ScanRunningCard seedKeywords={scanOn.seedKeywords} steps={scanOn.steps} />}", '')], ['R1']],
  ['R2', 'screen', F.overview, [e('{running && <p data-scan-still-running="">{t.overview.stillRunning}</p>}', '')], ['R2']],
  ['E1', 'screen', F.page, [e("{scanOn?.kind === 'empty' && model.mode !== 'manual' && (", '{false && (')], ['E1', 'E2']],
  ['E1b', 'screen', F.cards, [e('<p className="mt-1 text-sm text-muted">{t.reasons[reason]}</p>', '<p className="mt-1 text-sm text-muted">{reason}</p>')], ['E1']],
  ['E2', 'screen', F.cards, [e("{reason === 'unreadable' && (", '{false && (')], ['E2']],
  ['E3', 'screen', F.page, [e("{scanOn?.kind === 'pending' && <ScanPendingCard />}", '')], ['E3']],
  ['M1', 'screen', F.overview, [e("{mode === 'manual' && onBackToScan && (", '{false && (')], ['M1']],
  ['G1', 'screen', F.gsc, [e("if (state === 'disabled') return null", '')], ['G1']],
  ['G2', 'screen', F.gsc, [e('<GscSetupPrompt state={state} about={t.about} projectId={projectId} layout="inline" className="min-w-0 flex-1 basis-80 [&>p]:basis-52" />', '<p className="min-w-0 flex-1 basis-80 text-sm text-muted">{t.about}</p>')], ['G2']],
  ['G3', 'screen', F.gsc, [e('<GscLoadError onRetry={retry} className="min-w-0 flex-1 basis-80" />', '<p className="min-w-0 flex-1 basis-80 text-sm text-muted">{t.loading}</p>')], ['G3']],
  ['G4', 'screen', F.model, [e("withGoogleOnly: mode === 'scan',", 'withGoogleOnly: false,')], ['G4']],
  ['G5', 'screen', F.page, [e("const googleChip = gscState === 'disabled' ? 'hidden' : gscState === 'loading' ? 'loading' : 'counted'", "const googleChip = gscState === 'disabled' ? 'hidden' : 'counted'")], ['G5']],
  ['G6', 'screen', F.page, [e("{process.env.NEXT_PUBLIC_GSC_RAW_BROWSER_ENABLED === 'true' && (", "{(process.env.NEXT_PUBLIC_GSC_RAW_BROWSER_ENABLED === 'true' || scanMode) && (")], ['G6']],
  ['X1', 'screen', F.overview, [e('t.overview.easyWins(formatCount(easyWins, language)),', 't.overview.easyWins(String(undefined)),')], ['X1']],
  ['X2', 'screen', F.en, [e("badgeDone: 'Research complete',", "badgeDone: 'המחקר הושלם',")], ['X2']],
  ['X3', 'screen', F.cards, [e('<div className="mt-4 flex flex-wrap items-center gap-2">', '<div className="mt-4 ml-2 flex flex-wrap items-center gap-2">')], ['X3']],
  ['X4', 'screen', F.he, [e("      badgeManual: 'המחקר שהרצתם',\n", '')], ['X4']],
  ['X5', 'screen', F.he, [e("title: 'המחקר המלא רץ, זה לוקח כמה דקות',", "title: 'המחקר רץ',")], ['X5']],
  ['N1', 'screen', F.page, [
    e("import { useState, useMemo } from 'react'", "import { useState, useMemo, useEffect } from 'react'"),
    e('  const ts = dict.keywordResearchScan\n', "  const ts = dict.keywordResearchScan\n  useEffect(() => { void fetch('/api/google-ads/keyword-ideas', { method: 'POST' }) }, [])\n"),
  ], ['N1']],
  ['N1b', 'screen', F.page, [e('{/* Easy battles to win: the best keywords of the research on screen. */}', "{scanMode && void fetch('/api/google-ads/keyword-ideas', { method: 'POST' }).catch(() => null)}")], ['N1']],
  ['N2', 'screen', F.hook, [e('return `/api/keyword-research/scan?projectId=${encodeURIComponent(projectId)}`', 'return `/api/keyword-research?projectId=${encodeURIComponent(projectId)}`')], ['N2']],
  ['Y1', 'screen', F.easy, [e("const GRID = '@3xl:grid-cols-[", "const GRID = 'md:grid-cols-[")], ['Y1']],
  ['Y1b', 'screen', F.easy, [e('<section data-easy-wins="" className="@container mb-6">', '<section data-easy-wins="" className="mb-6">')], ['Y1']],
  ['Y1c', 'screen', F.easy, [e('text-sm text-body tabular-nums @3xl:block', 'text-sm text-body tabular-nums md:block')], ['Y1']],
  ['Y2', 'screen', F.gsc, [e(' [&>p]:basis-52"', '"')], ['Y2']],
  ['Y2b', 'screen', F.gsc, [e('<p className="min-w-0 flex-1 basis-80 text-sm text-muted">{count', '<p className="min-w-0 flex-1 text-sm text-muted">{count')], ['Y2']],

  // ── legacy (today's screen with no scan) ─────────────────────────────────
  ['L1', 'legacy', F.page, [e("<div className={`mb-8 ${isRTL ? 'text-right' : 'text-left'}`}>", "<div className={`mb-6 ${isRTL ? 'text-right' : 'text-left'}`}>")], ['L1', 'L2']],
  ['L2', 'legacy', F.page, [e("{scanOn?.kind === 'pending' && <ScanPendingCard />}", "{(scanOn?.kind === 'pending' || scanView.kind === 'loading') && <ScanPendingCard />}")], ['L2']],
  ['L3', 'legacy', F.page, [e('opportunitiesOpen', 'panelOpen', true)], ['L3']],
]

const args = process.argv.slice(2)
const onlyAnchors = args.includes('--anchors')
const only = args.includes('--only') ? args[args.indexOf('--only') + 1] : null
const sha = (buf) => createHash('sha256').update(buf).digest('hex')
const occurrences = (hay, needle) => hay.split(needle).length - 1

// Restore whatever is mutated if the run is interrupted.
const live = new Map()
function restoreAll() {
  for (const [path, buf] of live) writeFileSync(path, buf)
  live.clear()
}
for (const sig of ['SIGINT', 'SIGTERM', 'SIGHUP']) process.on(sig, () => { restoreAll(); process.exit(130) })
process.on('exit', restoreAll)

function runSuite(suite) {
  const r = spawnSync('npx', ['tsx', SUITES[suite]], { cwd: ROOT, encoding: 'utf8', timeout: 300_000 })
  const out = `${r.stdout ?? ''}${r.stderr ?? ''}`
  const summary = /(\d+) passed, (\d+) failed/.exec(out)
  const failed = [...out.matchAll(/^\s*✗ ([A-Z][A-Za-z0-9]*(?:-MUT\d*)?)\b/gm)].map((m) => m[1])
  const passed = [...out.matchAll(/^\s*✓ ([A-Z][A-Za-z0-9]*(?:-MUT\d*)?)\b/gm)].map((m) => m[1])
  return { summary: summary ? `${summary[1]} passed, ${summary[2]} failed` : null, failed: [...new Set(failed)], passed: [...new Set(passed)], status: r.status, out }
}

// 1) Every anchor exists (exactly once, unless it replaces all).
const anchorProblems = []
for (const [id, , file, edits] of CONTROLS) {
  const text = readFileSync(join(ROOT, file), 'utf8')
  for (const { find, all } of edits) {
    const n = occurrences(text, find)
    if (all ? n < 1 : n !== 1) anchorProblems.push(`${id}: ${file} has ${n} × ${JSON.stringify(find.slice(0, 70))}`)
  }
}
if (anchorProblems.length) {
  console.log(`anchors: ${anchorProblems.length} problem(s)\n  ${anchorProblems.join('\n  ')}`)
  process.exit(1)
}
console.log(`anchors: all ${CONTROLS.reduce((n, c) => n + c[3].length, 0)} found`)
if (onlyAnchors) process.exit(0)

// 2) Baseline: every suite green, and every check named by a control.
const baseline = {}
for (const suite of Object.keys(SUITES)) {
  const r = runSuite(suite)
  baseline[suite] = r
  if (r.status !== 0 || !r.summary || r.failed.length) { console.log(`baseline ${suite} is not green: ${r.summary}`); process.exit(1) }
}
const uncovered = []
for (const suite of Object.keys(SUITES)) {
  const named = new Set(CONTROLS.filter((c) => c[1] === suite).flatMap((c) => c[4]))
  for (const id of baseline[suite].passed) if (!id.includes('-MUT') && !named.has(id)) uncovered.push(`${suite}:${id}`)
}
console.log(`baseline: ${Object.entries(baseline).map(([s, r]) => `${s} ${r.summary}`).join('; ')}`)
if (uncovered.length) { console.log(`checks with no control: ${uncovered.join(', ')}`); process.exit(1) }

// 3) Each control: mutate, run, expect the named checks to fail cleanly, restore byte for byte.
let caught = 0
const missed = []
const selected = CONTROLS.filter((c) => !only || c[0].startsWith(only))
for (const [id, suite, file, edits, expect] of selected) {
  const path = join(ROOT, file)
  const original = readFileSync(path)
  const before = sha(original)
  let text = original.toString('utf8')
  for (const { find, replace, all } of edits) text = all ? text.split(find).join(replace) : text.replace(find, () => replace)
  live.set(path, original)
  writeFileSync(path, text)
  let r
  try {
    r = runSuite(suite)
  } finally {
    writeFileSync(path, original)
    live.delete(path)
  }
  const restored = sha(readFileSync(path)) === before
  const ok = !!r.summary && expect.every((x) => r.failed.includes(x)) && restored
  if (ok) caught++
  else missed.push(id)
  console.log(`${ok ? 'caught' : 'MISSED'}  ${id.padEnd(5)} ${file} → ${suite}: ${r.summary ?? `crashed (exit ${r.status})`}; failed ${r.failed.join(',') || '-'}${restored ? '' : ' — NOT RESTORED'}`)
}
console.log(`\n${caught}/${selected.length} controls caught${missed.length ? `; missed: ${missed.join(', ')}` : ''}; every file restored byte for byte`)
process.exit(missed.length ? 1 : 0)
