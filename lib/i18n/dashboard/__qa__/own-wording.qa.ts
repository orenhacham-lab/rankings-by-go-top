/**
 * OUR OWN WORDING — no label in the app repeats the competitor's (seo-agent.io).
 *
 * The owner saw "קרבות קלים לניצחון" and "מאזן הכוחות" in the preview and
 * recognised them from the competitor's screens, word for word. A comparison of
 * both dashboard dictionaries (and the public site's) against the competitor's
 * structure spec (docs/competitor-seo-agent-structure-spec.md on the research
 * branch) found more: the onboarding summary's badge, title, tiles and section
 * titles, the scan's step names, the dashboard's setup, findings and ranking
 * widgets, and the research tab's badge and tile. Each was reworded in our own
 * words, not translated from theirs.
 *
 * This suite renders every string of the four dictionaries (functions called
 * with sample arguments) and fails if any of the competitor's labels comes back.
 * The mutation controls put one back and show the check catches it.
 *
 * lib/free-check/copy.ts is owned by another thread and is not checked here.
 *
 * Run: npx tsx lib/i18n/dashboard/__qa__/own-wording.qa.ts
 */
import { dashboardEn } from '../en'
import { dashboardHe } from '../he'
import { en as publicEn } from '../../public/en'
import { he as publicHe } from '../../public/he'

let pass = 0, fail = 0
function check(name: string, cond: boolean, detail?: string) {
  if (cond) { pass++; console.log(`  ✓ ${name}`) } else { fail++; console.log(`  ✗ ${name}${detail ? ` — ${detail}` : ''}`) }
}

/** The competitor's labels, as their screens show them (the spec's quotes). */
const THEIRS: RegExp[] = [
  /קרבות קלים/, /מאזן (ה)?כוחות/, /שדות הקרב/, /היריבים/, /מי מולך בזירה/, /מי שולט עכשיו/,
  /תמצית מחקר ראשונה/, /הנה מה שמצאנו על/, /סרקנו את \S+ הרגע/, /מה הבנו על העסק/,
  /מי הלקוחות שלכם/, /מי המתחרים שלכם/, /מה מעכב אתכם/, /שהיינו (מקדמים|כותבים)/,
  /מילות מפתח שנקדם/, /דברים לתקן באתר/, /מוכנות לתשובות (של )?AI/, /מאמרים מוכנים לכתיבה/,
  /סימנים תקינים/, /נקי מהבעיות שאנחנו בודקים/, /השלמת ההגדרה/, /פיזור דירוגים/,
  /הזדמנויות קלות/, /מחקר הושלם/, /הבדיקה הראשונה תתבצע הלילה/, /לאן ממשיכים היום/,
  /ברוכים הבאים למסע/, /בזמן שלא היית כאן/, /מצטטים עמודים שעונים על שאלות/,
  /easy battles/i, /balance of power/i, /battlefield/i, /holding you back/i, /first research summary/i, /\beasy wins?\b/i,
]

type Leaf = { path: string; text: string }

/** Every string a dictionary can render; a function is called with a sample for each parameter. */
function strings(node: unknown, path: string): Leaf[] {
  if (typeof node === 'string') return [{ path, text: node }]
  if (typeof node === 'function') {
    const arity = (node as (...a: unknown[]) => unknown).length
    const samples: unknown[][] = [Array(arity).fill('X'), Array(arity).fill(1), Array(arity).fill(2), Array(arity).fill(3)]
    return samples.flatMap((args) => {
      try {
        return strings((node as (...a: unknown[]) => unknown)(...args), path)
      } catch {
        return []
      }
    })
  }
  if (Array.isArray(node)) return node.flatMap((v, i) => strings(v, `${path}[${i}]`))
  if (node && typeof node === 'object') {
    return Object.entries(node as Record<string, unknown>).flatMap(([k, v]) => strings(v, path ? `${path}.${k}` : k))
  }
  return []
}

function echoes(dicts: Record<string, unknown>): string[] {
  const hits: string[] = []
  for (const [name, dict] of Object.entries(dicts)) {
    for (const leaf of strings(dict, name)) {
      const hit = THEIRS.find((re) => re.test(leaf.text))
      if (hit) hits.push(`${leaf.path}: ${leaf.text.slice(0, 60)} (${hit})`)
    }
  }
  return [...new Set(hits)]
}

const DICTS = { dashboardHe, dashboardEn, publicHe, publicEn }

console.log('\nno label repeats the competitor\'s')
{
  const all = strings(DICTS, '')
  check('the dictionaries render (sanity: thousands of strings, the functions included)', all.length > 3000, String(all.length))
  const hits = echoes(DICTS)
  check('none of the four dictionaries uses one of the competitor\'s labels', hits.length === 0, hits.join(' | '))
  check('the two the owner named are reworded in both languages',
    !/קרבות|ניצחון/.test(dashboardHe.keywordResearchScan.easyWins.title) && !/מאזן|כוחות/.test(dashboardHe.competitors.title)
    && !/battle/i.test(dashboardEn.keywordResearchScan.easyWins.title) && !/\bvs\.?\b/i.test(dashboardEn.competitors.title))
}

console.log('\nmutation controls')
{
  // A plain, writable copy of the Hebrew strings (functions drop out, which is fine here).
  type Writable = { keywordResearchScan: { easyWins: { title: string } }; competitors: { title: string }; seedOnboarding: { summary: { badge: string } } }
  const withOld = (mutate: (d: Writable) => void) => {
    const copy = JSON.parse(JSON.stringify(dashboardHe)) as Writable
    mutate(copy)
    return echoes({ dashboardHe: copy }).length > 0
  }
  check('MUT: "קרבות קלים לניצחון" put back is caught', withOld((d) => { d.keywordResearchScan.easyWins.title = 'קרבות קלים לניצחון' }))
  check('MUT: "מאזן הכוחות" put back is caught', withOld((d) => { d.competitors.title = 'מאזן הכוחות' }))
  check('MUT: the summary badge put back is caught', withOld((d) => { d.seedOnboarding.summary.badge = 'תמצית מחקר ראשונה' }))
  const fnHit = echoes({ x: { title: (name: string) => `הנה מה שמצאנו על ${name}` } }).length > 0
  check('MUT: a label inside a function is caught too', fnHit)
  const enHit = echoes({ x: { a: 'Easy battles to win' } }).length > 0
  check('MUT: an English echo is caught', enHit)
}

console.log(`\n${pass} passed, ${fail} failed`)
if (fail > 0) process.exit(1)

export {}
