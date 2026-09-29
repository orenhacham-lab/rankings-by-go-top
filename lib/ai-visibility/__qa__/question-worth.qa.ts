/**
 * Suggested AI questions are only the ones this business can win, each with a
 * plain reason, and each can become an article (question-worth.ts,
 * question-article.ts, the question-context route, the tab's card).
 *
 *   A  scoring on the japan4u fixture: travel questions kept, restaurant,
 *      mortgage (stale Production cache rows) and generic ones dropped
 *   B  the reason and the page that already answers
 *   C  the article: the topic body, the status ladder
 *   D  the wiring: every list is ranked, the card offers write/improve, the
 *      route is owner-fenced and read-only, no check runs on a suggestion
 *
 * Every rule has a mutation control.
 *
 * Run: npx tsx lib/ai-visibility/__qa__/question-worth.qa.ts
 */
import { readFileSync, writeFileSync, unlinkSync } from 'fs'
import { join } from 'path'
import * as W from '../question-worth'
import * as A from '../question-article'
import { createI18n } from '../i18n'

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
  const path = join(__dirname, `.qa-mut-worth-${++mutants}-${file.slice(file.lastIndexOf('/') + 1)}`)
  writeFileSync(path, pinned)
  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    return require(path) as T
  } finally {
    unlinkSync(path)
  }
}

const KEYWORDS = ['אוכל רחוב יפן', 'טיול יפן אביב', 'מסלול 7 ימים יפן', 'עלויות טיול יפן', 'מסעדות כשרות ביפן', 'סוגי סושי ביפן', 'הזמנת טיסה ליפן', 'טוקיו', 'קיוטו']
const CTX: W.WorthContext = {
  businessName: 'Japan4U', identityLabel: 'מדריך טיולים ליפן לישראלים', category: 'travel', keywords: KEYWORDS,
  scanTerms: ['מטיילים ישראלים המתכננים טיול ליפן', 'תכנון טיול ליפן'],
  pages: [{ title: 'כרטיס סים ליפן', url: 'https://japan4u.co.il/sim/' }, { title: 'טיסות זולות ליפן', url: 'https://japan4u.co.il/flights/' }],
}
const KEEP: Array<[string, string]> = [
  ['איזה אתר מומלץ לתכנון טיול לחו״ל?', 'recommendation'], ['כמה עולה טיול מאורגן לחו״ל?', 'commercial'],
  ['כמה עולה טיסה הלוך ושוב ליפן מישראל?', 'informational'], ['האם ניתן לרכוש כרטיס SIM מקומי ביפן מראש?', 'informational'],
  ['חוות דעת על Japan4U', 'brand'],
]
const DROP: Array<[string, string]> = [
  ['כמה עולה ארוחת ערב באיכות?', 'commercial'], ['איפה המסעדה הכשרה הטובה ביותר?', 'local'], ['איך לבחור מסעדה לתאריך רומנטי?', 'pre_purchase'],
  // Stale rows in Production's suggestion cache for japan4u (created with the project, another business's words).
  ['איזה יועץ משכנתאות מומלץ בישראל?', 'recommendation'], ['מה הריבית הממוצעת למשכנתא דינמית בישראל?', 'informational'],
  // Generic questions that fit any business fit none.
  ['איך בוחרים עסק אמין בתחום?', 'pre_purchase'], ['איך משווים בין כמה עסקים באותו תחום?', 'comparison'],
]
const list = [...KEEP, ...DROP].map(([prompt, intent], i) => ({ id: `q${i}`, prompt, intent }))

console.log('\nA) worth on the japan4u fixture')
{
  const ranked = W.rankByWorth(list, CTX)
  const kept = new Set(ranked.map((r) => r.prompt))
  const missing = KEEP.filter(([p]) => !kept.has(p)).map(([p]) => p)
  const leaked = DROP.filter(([p]) => kept.has(p)).map(([p]) => p)
  check('A1: the travel and brand questions are kept', missing.length === 0, show(missing))
  check('A2: restaurant, mortgage and generic questions are not shown', leaked.length === 0, show(leaked))
  check('A3: best first, every one at or above the threshold', ranked.every((r, i) => r.worth.score >= W.WORTH_THRESHOLD && (i === 0 || ranked[i - 1].worth.score >= r.worth.score)))
  const noId = W.rankByWorth(list, { ...CTX, identityLabel: null, category: 'generic' })
  check('A4: a business nothing identified gets only questions that name it (the tab asks for the rest)',
    noId.every((r) => r.worth.why.relevance.kind === 'brand'), show(noId.map((r) => r.prompt)))

  const noCore = mutant<typeof W>('lib/ai-visibility/question-worth.ts', '} else if (coreHits.length > 0) {', '} else if (coreHits.length > 0 || kwHitCount > 0) {')
  const m1 = new Set(noCore.rankByWorth(list, CTX).map((r) => r.prompt))
  check('A5: MUT relevance from a keyword alone fails A2 (the restaurant questions come back)', DROP.some(([p]) => m1.has(p)))
  const country = mutant<typeof W>('lib/ai-visibility/question-worth.ts', "'ישראל', 'ישראלים', 'ישראלי', 'ישראלית', ", '')
  const m2 = new Set(country.rankByWorth(list, CTX).map((r) => r.prompt))
  check('A6: MUT counting "ישראל" as the business\'s word fails A2 (the mortgage questions come back)', m2.has('איזה יועץ משכנתאות מומלץ בישראל?'))
}

console.log('\nB) the reason, and the page that answers')
{
  const t = createI18n('he')
  const sim = W.scoreQuestion('האם ניתן לרכוש כרטיס SIM מקומי ביפן מראש?', 'informational', CTX)
  check('B1: a question a page answers points at that page', sim.answeringPage?.url === 'https://japan4u.co.il/sim/' && sim.why.win === 'page', show(sim))
  const trip = W.scoreQuestion('כמה עולה טיול מאורגן לחו״ל?', 'commercial', CTX)
  check('B2: the reason names the tracked keyword closest to the question', trip.why.relevance.kind === 'keyword' && /טיול/.test((trip.why.relevance as { term: string }).term), show(trip.why))
  check('B3: and what the asker is about to do', trip.why.value === 'buy')
  const card = code('components/ai-visibility/sections/SmartQuestionCard.tsx')
  const oneLine = (s: string) => /const reasonLine = question\.worth\s*\?\s*worthReason\(question\.worth, t\)/.test(s)
  check('B4: the card states the worth reason (one line), in dictionary words', oneLine(card) && /t\('worth_rel_keyword'\)/.test(card))
  check('B5: MUT dropping it fails B4', !oneLine(card.replace('question.worth\n    ? worthReason(question.worth, t)', 'false\n    ? worthReason(question.worth, t)')))
  const he = ['worth_rel_brand', 'worth_rel_keyword', 'worth_rel_business', 'worth_value_buy', 'worth_value_choose', 'worth_value_compare', 'worth_value_learn', 'worth_value_brand', 'qa_write_article', 'qa_improve_page']
  check('B6: every reason and action has Hebrew words', he.every((k) => /[א-ת]/.test(t(k as never))))
  check('B7: the unclear "High/Good" tag help is gone from the tab', !/priority_tag_help/.test(code('components/ai-visibility/AIVisibilitySection.tsx')))
}

console.log('\nC) the article')
{
  const worth = W.scoreQuestion('כמה עולה טיול מאורגן לחו״ל?', 'commercial', CTX)
  const body = A.topicBriefForQuestion({ projectId: 'p1', question: 'כמה עולה טיול מאורגן לחו״ל?', intent: 'commercial', language: 'he', worth, note: 'n' })
  check('C1: the topic IS the question, with its keyword and intent', body.topic === 'כמה עולה טיול מאורגן לחו״ל?' && /טיול/.test(body.primary_keyword) && body.search_intent === 'commercial', show(body))
  const topics: A.ContextTopic[] = [
    { id: 't1', topic: 'כמה עולה טיול מאורגן לחו"ל', status: 'suggested', article: null },
    { id: 't2', topic: 'איזה אתר מומלץ לתכנון טיול לחו״ל?', status: 'used', article: { id: 'a2', status: 'draft' } },
    { id: 't3', topic: 'חוות דעת על Japan4U', status: 'used', article: { id: 'a3', status: 'published' } },
  ]
  const st = (q: string, cited: string[] = []) => A.questionArticleStatus(q, topics, new Set(cited.map(A.normalizeQuestion))).status
  check('C2: the ladder: topic → written → published → cited, none without a topic',
    st('כמה עולה טיול מאורגן לחו״ל?') === 'topic' && st('איזה אתר מומלץ לתכנון טיול לחו״ל?') === 'written' &&
    st('חוות דעת על Japan4U') === 'published' && st('חוות דעת על Japan4U', ['חוות דעת על Japan4U?']) === 'cited' && st('שאלה אחרת') === 'none')
  const loose = mutant<typeof A>('lib/ai-visibility/question-article.ts', "if (a === 'published') return { status: 'published', topic }", '')
  check('C3: MUT without the published step fails C2', loose.questionArticleStatus('חוות דעת על Japan4U', topics, new Set()).status !== 'published')
}

console.log('\nD) the wiring')
{
  const section = code('components/ai-visibility/AIVisibilitySection.tsx')
  const ranked = (s: string) => /setSuggestedQuestions\(worthRef\.current \? rankByWorth\(onTopic, worthRef\.current\) : onTopic\)/.test(s)
  check('D1: every list the tab shows passes the worth gate', ranked(section))
  check('D2: MUT showing the unranked list fails D1', !ranked(section.replace('rankByWorth(onTopic, worthRef.current)', 'onTopic')))
  const modal = code('components/ai-visibility/PromptSuggestions.tsx')
  check('D3: the suggestions modal is ranked the same way', /setSuggestions\(worthContext \? rankByWorth\(onTopic, worthContext\) : onTopic\)/.test(modal))
  check('D4: "write an article" creates a topic through the content route, nothing else',
    /fetch\('\/api\/content\/topics', \{\s*method: 'POST'/.test(section) && /topicBriefForQuestion\(/.test(section))
  const card = code('components/ai-visibility/sections/SmartQuestionCard.tsx')
  const improve = (s: string) => /\) : page \? \(/.test(s) && /t\('qa_improve_page'\)/.test(s)
  check('D5: a question a page already answers offers "improve that page" instead of a new article', improve(card))
  check('D6: MUT removing the page branch fails D5', !improve(card.replace(') : page ? (', ') : false ? (')))
  const route = code('app/api/ai-visibility/question-context/route.ts')
  const fenced = (s: string) => /from\('article_topics'\)[\s\S]{0,160}\.eq\('project_id', projectId\)\s*\.eq\('user_id', userId\)/.test(s) &&
    /from\('generated_articles'\)[\s\S]{0,160}\.eq\('project_id', projectId\)\s*\.eq\('user_id', userId\)/.test(s) && /authContentProject\(/.test(s)
  check('D7: the context route checks the owner and fences every service-role read', fenced(route))
  check('D8: MUT dropping an owner filter fails D7', !fenced(route.replace(".eq('user_id', userId)", '')))
  check('D9: the context route only reads (no insert/update/delete, no provider)', !/\.(insert|update|upsert|delete)\(/.test(route) && !/fetch\(/.test(route))
  const addsOnly = (s: string) => !/ai-visibility\/(dispatch|runs)/.test(s.slice(s.indexOf('<SmartQuestionCard'), s.indexOf('<SmartQuestionCard') + 3000))
  check('D10: adding or writing about a suggestion never starts a check (checks cost quota)', addsOnly(section))
  check('D11: MUT a run call in the card\'s handlers fails D10', !addsOnly(section.replace('<SmartQuestionCard', "<SmartQuestionCard x={fetch('/api/ai-visibility/runs')}")))
}

console.log('\nE) the tab walk: one way to each thing')
{
  const section = code('components/ai-visibility/AIVisibilitySection.tsx')
  const oneWay = (s: string) => /allPrompts\.length > 0 && \(\s*<Button variant="secondary" onClick=\{\(\) => \{[\s\S]{0,200}?setShowSuggestions\(true\)/.test(s) &&
    /action=\{<Button onClick=\{pickRecommended\}>\{t\('no_queries_pick'\)\}/.test(s) && /id="ai-recommended-questions"/.test(s)
  check('E1: with no tracked question there is one way to pick (the list on the page), no extra window button', oneWay(section))
  check('E2: MUT the empty state opening the window again fails E1', !oneWay(section.replace('onClick={pickRecommended}', 'onClick={() => setShowSuggestions(true)}')))
  const howGated = (s: string) => /\{allPrompts\.length > 0 && \(\s*<details/.test(s)
  check('E3: "how it works" (the chip legend) shows only once there are questions with chips', howGated(section))
  check('E4: MUT an always-on disclosure fails E3', !howGated(section.replace('{allPrompts.length > 0 && (\n          <details', '{(\n          <details')))
  const panel = code('components/ai-visibility/AIBusinessProfilePanel.tsx')
  check('E5: the profile card has no "auto/manual" badge beside the source line', !/t\('(auto|manual)_badge'\)/.test(panel) && /t\(sourceKey\)/.test(panel))
  const noBadge = (s: string) => !/t\('(auto|manual)_badge'\)/.test(s) && /t\(sourceKey\)/.test(s)
  check('E5b: MUT the badge back fails E5', !noBadge(panel.replace('{t(sourceKey)}', "{t(sourceKey)}{t('auto_badge')}")))
  const rows = code('components/ai-visibility/OverviewRows.tsx')
  const noEmptyActivity = (s: string) => /if \(data && data\.recent\.length === 0\) return null/.test(s) && !/c\.activityEmpty/.test(s)
  check('E6: no empty "recent activity" card before the first check', noEmptyActivity(rows))
  check('E7: MUT bringing the empty card back fails E6', !noEmptyActivity(rows.replace('if (data && data.recent.length === 0) return null', '')))
}

console.log(`\n${pass} passed, ${fail} failed`)
if (fail) process.exit(1)
export {}
