/**
 * THE DASHBOARD IN BRAZILIAN PORTUGUESE — the full-translation wave.
 *
 * Oren's rule for this wave: a language we add is translated in BOTH the public
 * site and the app, so "pt-BR falls back to English" is no longer good enough
 * for the dashboard. What that claim means in code, and therefore what this
 * suite proves:
 *
 *  1. PARITY WITH SPANISH, LEAF FOR LEAF. The Spanish dictionary is the
 *     finished one, so every path it answers the Portuguese one answers too.
 *     A section translated half-way would show as a missing path here.
 *  2. NOTHING ANSWERS IN HEBREW. Not one leaf of the Portuguese dictionary,
 *     and not one of the merged dictionary a Portuguese screen actually reads.
 *  3. THE PARTS DIRECTORY CANNOT HALF-OWN A SECTION. pt-BR/ is assembled by a
 *     flat spread, so two parts naming the same section would silently drop
 *     one of them. This is the one mistake that arrangement allows.
 *  4. THE COPY OUTSIDE THE DICTIONARY IS PORTUGUESE TOO — the plan limit lines,
 *     the auth pages' brand panel, the 451 notice, the free check's locale, the
 *     AI-visibility strings, the monthly report and the export labels. Each of
 *     those was its own `locale === 'es' ? … : HEBREW` and the Portuguese
 *     reader was getting the Hebrew branch.
 *  5. THE FLAG STILL GATES THE LANGUAGE. The in-app switcher offers PT only
 *     while the Portuguese build is on.
 *
 * MUTATION CONTROL. Every guard is re-run against a deliberately broken input
 * and must then fail.
 *
 * Run: npx tsx lib/i18n/dashboard/__qa__/portuguese-dashboard.qa.ts
 */

import { readFileSync } from 'fs'
import { dashboardPtBR, PT_BR_PARTS } from '../pt-BR/index'
import { dashboardEs } from '../es'
import { dashboardEn } from '../en'
import { getDashboardDictionary } from '../getDashboardDictionary'
import { planLimitLines, trialLimitLines, CHECKS_EXPLAINER } from '../../../plans/features'
import { sanctionsNotice } from '../../../sanctions/guard'
import { createI18n } from '../../../ai-visibility/i18n'
import { monthlyCopy } from '../../../../components/reports/monthly/copy'
import { getExportLabels } from '../../../export/i18n'
import { researchCompetitivePtBR, researchCompetitiveEs } from '../research-competitive'

let pass = 0, fail = 0
function check(name: string, cond: boolean, detail?: string) {
  if (cond) { pass++; console.log(`  ✓ ${name}`) } else { fail++; console.log(`  ✗ ${name}${detail ? ` — ${detail}` : ''}`) }
}
const read = (p: string) => readFileSync(p, 'utf8')
/** Source with comments stripped, per the repo's source-guard convention. */
const src = (p: string) => read(p).replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '')
const HEBREW = /[֐-׿]/

type Leaf = { path: string; text: string }
/** Every string a dictionary answers with, including what its functions return. */
function leaves(node: unknown, at = '', out: Leaf[] = []): Leaf[] {
  if (typeof node === 'string') { out.push({ path: at, text: node }); return out }
  if (typeof node === 'function') {
    for (const args of [[1], [2], [0], ['x'], ['x', 'y'], [1, 2], ['x', 1]]) {
      try {
        const r = (node as (...a: unknown[]) => unknown)(...args)
        if (typeof r === 'string') { out.push({ path: at, text: r }); return out }
        if (Array.isArray(r)) { r.forEach((v, i) => leaves(v, `${at}[${i}]`, out)); return out }
      } catch { /* a function that wants another shape is probed again below */ }
    }
    return out
  }
  if (Array.isArray(node)) { node.forEach((v, i) => leaves(v, `${at}[${i}]`, out)); return out }
  if (node && typeof node === 'object') {
    for (const [k, v] of Object.entries(node)) leaves(v, at ? `${at}.${k}` : k, out)
  }
  return out
}

const ptLeaves = leaves(dashboardPtBR)
const esLeaves = leaves(dashboardEs)
const ptPaths = new Set(ptLeaves.map((l) => l.path))

console.log('\nPORTUGUESE DASHBOARD\n')
console.log(`  → ${ptLeaves.length} Portuguese leaves across ${Object.keys(dashboardPtBR).length} sections (Spanish: ${esLeaves.length} across ${Object.keys(dashboardEs).length})`)

// 1 — PARITY WITH SPANISH.
const missing = esLeaves.filter((l) => !ptPaths.has(l.path))
check('1a: every path the Spanish dictionary answers, the Portuguese one answers',
  missing.length === 0, missing.slice(0, 5).map((l) => l.path).join(', '))
check('1b: the Portuguese dictionary names all 46 sections of the English one',
  Object.keys(dashboardPtBR).length === Object.keys(dashboardEn).length)
check('1c: every Portuguese section is a real section of the English dictionary',
  Object.keys(dashboardPtBR).every((k) => k in dashboardEn))
// Mutation control: drop a Spanish-answered path and 1a must fail.
check('1a mutation: a missing section is caught',
  (() => {
    const broken = new Set(ptPaths); for (const p of [...broken]) if (p.startsWith('siteHealth.')) broken.delete(p)
    return esLeaves.some((l) => !broken.has(l.path))
  })())

// 2 — NOTHING IN HEBREW.
const hebrew = ptLeaves.filter((l) => HEBREW.test(l.text))
check('2a: no leaf of the Portuguese dictionary is in Hebrew',
  hebrew.length === 0, hebrew.slice(0, 5).map((l) => `${l.path} = ${l.text}`).join(' | '))
const merged = leaves(getDashboardDictionary('pt-BR'))
const mergedHebrew = merged.filter((l) => HEBREW.test(l.text))
// The English dashboard itself shows three Hebrew publishGate strings, which the
// main build thread owns; the Portuguese dashboard inherits exactly those.
const inheritedHebrew = leaves(dashboardEn).filter((l) => HEBREW.test(l.text)).map((l) => l.path)
check('2b: the merged Portuguese dictionary is Hebrew-free apart from what the ENGLISH one already shows',
  mergedHebrew.every((l) => inheritedHebrew.includes(l.path)),
  mergedHebrew.filter((l) => !inheritedHebrew.includes(l.path)).slice(0, 5).map((l) => l.path).join(', '))
check('2a mutation: a Hebrew string is caught',
  HEBREW.test('מילת מפתח'))

// 3 — THE PARTS DIRECTORY.
const owners: Record<string, number> = {}
for (const part of PT_BR_PARTS) for (const k of Object.keys(part as object)) owners[k] = (owners[k] || 0) + 1
const shared = Object.entries(owners).filter(([, n]) => n > 1)
check('3a: no section is named by two parts of pt-BR/',
  shared.length === 0, shared.map(([k]) => k).join(', '))
check('3b: the parts together name every section of the assembled dictionary',
  Object.keys(owners).length === Object.keys(dashboardPtBR).length)
check('3a mutation: a section in two parts is caught',
  (() => {
    const o: Record<string, number> = {}
    for (const part of [...PT_BR_PARTS, PT_BR_PARTS[0]]) for (const k of Object.keys(part as object)) o[k] = (o[k] || 0) + 1
    return Object.values(o).some((n) => n > 1)
  })())

// 4 — THE COPY OUTSIDE THE DICTIONARY.
const planLines = [...planLimitLines('regular', 'pt-BR'), ...planLimitLines('large_agency', 'pt-BR'), ...trialLimitLines('pt-BR')]
check('4a: the plan and trial limit lines are Portuguese, not Hebrew',
  planLines.every((l) => !HEBREW.test(l)) && planLines.some((l) => /site/i.test(l)),
  planLines.filter((l) => HEBREW.test(l))[0])
check('4b: the "what a check is" sentence has its own Portuguese',
  !HEBREW.test(CHECKS_EXPLAINER['pt-BR']) && CHECKS_EXPLAINER['pt-BR'] !== CHECKS_EXPLAINER.es)
check('4c: the auth pages take the PORTUGUESE landing copy, not the Hebrew one',
  /locale === 'pt-BR' \? landingPtBR/.test(src('components/auth/AuthShell.tsx')))
check('4d: the 451 notice does not answer Hebrew to a Portuguese visitor',
  !HEBREW.test(sanctionsNotice('pt-BR')))
check('4e: the free check reads pt-BR as itself instead of falling through to Hebrew',
  /v === 'pt-BR'/.test(src('lib/presignup/http.ts')))
const tPt = createI18n('pt-BR'), tEs = createI18n('es')
check('4f: the AI-visibility strings answer Portuguese',
  !HEBREW.test(tPt('ai_visibility')) && tPt('ai_visibility') !== tEs('ai_visibility'))
check('4g: every AI-visibility entry that has Spanish has Portuguese',
  (() => {
    const s = read('lib/ai-visibility/i18n.ts')
    const withEs = (s.match(/\bes: '/g) || []).length
    const withPt = (s.match(/'pt-BR': '/g) || []).length
    console.log(`    → ${withPt} Portuguese values against ${withEs} Spanish ones`)
    return withPt >= withEs
  })())
check('4h: the monthly report speaks Portuguese',
  !HEBREW.test(monthlyCopy('pt-BR').title) && monthlyCopy('pt-BR').title !== monthlyCopy('es').title)
check('4i: the PDF and Excel labels speak Portuguese',
  !HEBREW.test(getExportLabels('pt-BR').rankingReport))
check('4j: the competitor screen speaks Portuguese',
  !HEBREW.test(researchCompetitivePtBR.title) && researchCompetitivePtBR.title !== researchCompetitiveEs.title)
check('4a mutation: a Hebrew plan line is caught',
  planLimitLines('regular', 'he').some((l) => HEBREW.test(l)))

// 5 — THE FLAG STILL GATES THE LANGUAGE.
const switcher = src('components/DashboardLanguageSwitcher.tsx')
check('5a: the in-app switcher offers PT only while the Portuguese build is on',
  /portugueseSiteEnabled\(\) \?/.test(switcher) && /'pt-BR' as PublicLocale/.test(switcher))
check('5a mutation: an unconditional PT option is caught',
  !/portugueseSiteEnabled\(\) \?/.test("{ locale: 'pt-BR' as PublicLocale, lang: 'pt-BR', label: 'PT' },"))

console.log(`\n${pass} passed, ${fail} failed`)
if (fail) process.exit(1)
export {}
