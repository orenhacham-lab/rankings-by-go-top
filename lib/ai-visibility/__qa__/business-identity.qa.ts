/**
 * The AI questions tab takes the business type from what the business IS, not
 * from one tracked keyword (lib/ai-visibility/business-identity.ts).
 *
 * The case (Production, japan4u.co.il): a Japan travel portal whose scan niche
 * is "מדריך טיולים ליפן לישראלים" tracks "אוכל רחוב יפן" among 33 keywords.
 * detectCategory(name, domain, ALL keywords) matched /אוכל/ and the whole tab
 * became a restaurant: "זוהה אוטומטית: מסעדה" and questions about tables.
 *
 *   A  the resolver: manual > scan niche > name/domain > keyword majority > ask
 *   B  the questions built from it are travel questions, never restaurant ones
 *   C  the wiring: every category on the tab comes from the resolver; the
 *      profile route reads the scan owner-fenced; the panel asks instead of
 *      showing "Other"
 *
 * Every rule has a mutation control.
 *
 * Run: npx tsx lib/ai-visibility/__qa__/business-identity.qa.ts
 */
import { readFileSync, writeFileSync, unlinkSync } from 'fs'
import { join } from 'path'
import * as B from '../business-identity'
import { detectCategory, generatePromptSuggestions } from '../prompt-templates'

let pass = 0, fail = 0
function check(name: string, cond: boolean, detail?: string) {
  if (cond) { pass++; console.log(`  ✓ ${name}`) } else { fail++; console.log(`  ✗ ${name}${detail ? ` — ${detail}` : ''}`) }
}
const show = (v: unknown) => JSON.stringify(v)
const ROOT = join(__dirname, '..', '..', '..')
const read = (p: string) => readFileSync(join(ROOT, p), 'utf8')
const strip = (s: string) => s.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\{\/\*[\s\S]*?\*\/\}/g, '').replace(/(^|[^:'"`])\/\/[^\n]*/g, '$1')
const code = (p: string) => strip(read(p))

let mutants = 0
function mutant<T>(file: string, from: string | RegExp, to: string): T {
  const src = read(file)
  const out = src.replace(from, to)
  if (out === src) throw new Error(`mutation did not apply to ${file}: ${String(from)}`)
  const dir = file.slice(0, file.lastIndexOf('/'))
  const pinned = out.replace(/(from\s+|require\(|import\()(['"])(\.\.?\/[^'"]*)\2/g, (_m, pre: string, q: string, spec: string) => `${pre}${q}${join(ROOT, dir, spec)}${q}`)
  const path = join(__dirname, `.qa-mut-bizid-${++mutants}-${file.slice(file.lastIndexOf('/') + 1)}`)
  writeFileSync(path, pinned)
  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    return require(path) as T
  } finally {
    unlinkSync(path)
  }
}

// The japan4u fixture: its stored scan niche and its 33 tracked keywords (read-only from Production).
const NICHE = 'מדריך טיולים ליפן לישראלים'
const DESCRIPTION = 'Japan4U הוא פורטל המטיילים ליפן המיועד לישראלים. האתר מציע מדריכים מקיפים על ערים, היסטוריה, תרבות, קולינריה ונופים ביפן.'
const KEYWORDS = ['אוכל רחוב יפן', 'טיול יפן אביב', 'מזג אוויר יפן', 'טירת אוסקה', 'מסלול 7 ימים יפן', 'אונסן יפן', 'עלויות טיול יפן',
  'קיוטו למטייל הראשון', 'ראמן יפני', 'טיול ראשוני ביפן', 'טוקיו מול קיוטו', 'איים ביפן', 'שוק הדגים טוקיו', 'טיול רומנטי יפן',
  'טיול ביפן עם ילדים', 'מנהגי אירוח ביפן', 'טיול בסתיו ביפן', 'סוגי לינה ביפן', 'טוקיו', 'קיוטו', 'הוקאידו', 'מסעדות כשרות ביפן',
  'נגויה', 'יפן', 'טקיאמה', 'יוקוהמה', 'קנזאווה', 'אוקינאווה', 'לימוד יפנית למטייל', 'סוגי סושי ביפן', 'פארקי שעשועים ביפן',
  'קניות ביפן למטייל', 'הזמנת טיסה ליפן']
const SITE = { businessName: 'Japan4U', domain: 'japan4u.co.il' }
const SCAN: B.ScanBusiness = { niche: NICHE, description: DESCRIPTION }
const RESTAURANT_WORDS = /מסעד|שולחן|ארוחת|restaurant|dinner/i
type Resolver = typeof B.resolveBusinessIdentity

console.log('\nA) the resolver')
{
  check('A0: the old detection reproduces the bug (keywords joined → restaurant)',
    detectCategory(SITE.businessName, SITE.domain, ['אוכל רחוב יפן', 'טוקיו', 'קיוטו']) === 'restaurant')

  const japan = B.resolveBusinessIdentity({ manualProfile: null, scan: SCAN, ...SITE, keywords: KEYWORDS })
  check('A1: japan4u with its scan is a travel business, named by the scan niche',
    japan.category === 'travel' && japan.source === 'scan' && japan.label === NICHE, show(japan))

  // A travel site whose text and keywords mention Japanese food, with no scan: one food keyword among
  // city names is not a majority, so the tab asks rather than guessing a restaurant.
  const foodOnly = B.resolveBusinessIdentity({ manualProfile: null, scan: null, ...SITE, keywords: ['אוכל רחוב יפן', 'טוקיו', 'קיוטו', 'אוסקה', 'נארה'] })
  check('A2: no scan, one food keyword among cities → unknown (asks), never restaurant',
    foodOnly.source === 'unknown' && foodOnly.category === 'generic', show(foodOnly))
  const noScan = B.resolveBusinessIdentity({ manualProfile: null, scan: null, ...SITE, keywords: KEYWORDS })
  check('A3: no scan, the 33 japan4u keywords → not restaurant', noScan.category !== 'restaurant', show(noScan))

  const florist = B.resolveBusinessIdentity({ manualProfile: null, scan: null, businessName: 'ארז', domain: 'erez.co.il', keywords: ['משלוח פרחים', 'זר פרחים ליום הולדת', 'פרחים לאירועים'] })
  check('A4: a real keyword majority still speaks (florist)', florist.category === 'florist' && florist.source === 'keywords', show(florist))

  const manualFree = B.resolveBusinessIdentity({ manualProfile: { mode: 'manual', primaryCategory: 'מדריך יפן', secondaryCategories: [], excludedTopics: [] }, scan: SCAN, ...SITE, keywords: KEYWORDS })
  check('A5: owner text that maps to no category keeps the words, and takes the scan\'s category (not a keyword guess)',
    manualFree.source === 'manual' && manualFree.label === 'מדריך יפן' && manualFree.category === 'travel', show(manualFree))
  const manualRest = B.resolveBusinessIdentity({ manualProfile: { mode: 'manual', primaryCategory: 'מסעדה יפנית', secondaryCategories: [], excludedTopics: [] }, scan: SCAN, ...SITE, keywords: KEYWORDS })
  check('A6: the owner always wins (they say restaurant → restaurant)', manualRest.category === 'restaurant' && manualRest.source === 'manual')
  check('A7: a travel agency is travel, not a marketing agency', B.classifyNiche('סוכנות נסיעות לחופשות באירופה') === 'travel')

  // Mutation controls: the resolver without its scan step, and a keyword "majority" of one.
  const noScanStep = mutant<typeof B>('lib/ai-visibility/business-identity.ts', "if (scanLabel) return { category: fallback ?? 'generic', label: scanLabel, source: 'scan' }", '')
  const m1 = (noScanStep.resolveBusinessIdentity as Resolver)({ manualProfile: null, scan: SCAN, ...SITE, keywords: KEYWORDS })
  check('A8: MUT dropping the scan step fails A1', !(m1.source === 'scan' && m1.label === NICHE), show(m1))
  const loose = mutant<typeof B>('lib/ai-visibility/business-identity.ts', 'Math.ceil(list.length * KEYWORD_MAJORITY_SHARE)', '1')
  const m2 = (loose.resolveBusinessIdentity as Resolver)({ manualProfile: null, scan: null, ...SITE, keywords: ['אוכל רחוב יפן', 'טוקיו', 'קיוטו', 'אוסקה', 'נארה'] })
  check('A9: MUT one keyword as a majority fails A2 (becomes a restaurant)', m2.category === 'restaurant', show(m2))
}

console.log('\nB) the questions follow the resolved business')
{
  const japan = B.resolveBusinessIdentity({ manualProfile: null, scan: SCAN, ...SITE, keywords: KEYWORDS })
  const qs = generatePromptSuggestions({ ...SITE, language: 'he', country: 'IL', keywords: KEYWORDS, category: japan.category, limit: 8 })
  check('B1: japan4u gets questions, none about restaurants', qs.length >= 4 && qs.every((q) => !RESTAURANT_WORDS.test(q.prompt)), show(qs.map((q) => q.prompt)))
  check('B2: they are travel questions', qs.filter((q) => /טיול|טיסה|נופש/.test(q.prompt)).length >= 3, show(qs.map((q) => q.prompt)))
  const old = generatePromptSuggestions({ ...SITE, language: 'he', country: 'IL', keywords: KEYWORDS, limit: 8 })
  check('B3: control — without the resolved category the old detection still yields no restaurant (travel is checked first now)',
    old.every((q) => !RESTAURANT_WORDS.test(q.prompt)), show(old.map((q) => q.prompt)))
  const mut = generatePromptSuggestions({ ...SITE, language: 'he', country: 'IL', keywords: KEYWORDS, category: 'restaurant', limit: 8 })
  check('B4: MUT forcing the old category (restaurant) fails B1', mut.some((q) => RESTAURANT_WORDS.test(q.prompt)))
}

console.log('\nC) the wiring')
{
  const files = ['components/ai-visibility/AIVisibilitySection.tsx', 'components/ai-visibility/PromptSuggestions.tsx', 'components/ai-visibility/AIBusinessProfilePanel.tsx']
  const detects = (s: string) => /\bdetectCategory\(/.test(s)
  const offenders = files.filter((f) => detects(code(f)))
  check('C1: no category on the questions tab is detected from keywords directly', offenders.length === 0, offenders.join(', '))
  check('C2: MUT a detectCategory call back is caught', detects(code(files[0]) + "\nconst c = detectCategory(a, b, c)"))

  const section = code(files[0])
  const gen = section.match(/generatePromptSuggestions\(\{[\s\S]*?\}\)/g) ?? []
  const passes = (calls: string[]) => calls.length >= 3 && calls.every((c) => /\bcategory: /.test(c))
  check('C3: every question build on the tab passes the resolved category', passes(gen), `${gen.length} calls`)
  check('C4: MUT one build without it fails C3', !passes([...gen, 'generatePromptSuggestions({ businessName, keywords })']))
  check('C5: the modal builds with the same category', /category,\s*\n\s*diversify: true/.test(code(files[1])))
  check('C6: the suggestions wait for the profile and the scan to be read (no flash of a wrong business)',
    /if \(!identityReady\) return/.test(section))

  const route = code('app/api/projects/[id]/ai-profile/route.ts')
  const fenced = (s: string) => /from\('project_profiles'\)[\s\S]{0,120}\.eq\('project_id', projectId\)\s*\.eq\('user_id', userId\)/.test(s)
  check('C7: the profile route reads the scan filtered by project AND owner (service role)', fenced(route))
  check('C8: MUT dropping the owner filter fails C7', !fenced(route.replace(".eq('user_id', userId)", '')))

  const panel = code(files[2])
  const asks = (s: string) => /const isUnknown = identity\.source === 'unknown' \|\| !identifiedLabel \|\| identifiedLabel === t\('cat_generic'\)/.test(s) && /\{t\('profile_unknown_title'\)\}/.test(s)
  check('C9: a business nothing identified is asked about, never shown as "Other"', asks(panel))
  check('C10: MUT showing the label for unknown fails C9', !asks(panel.replace("identity.source === 'unknown' || ", '')))
}

console.log(`\n${pass} passed, ${fail} failed`)
if (fail) process.exit(1)
export {}
