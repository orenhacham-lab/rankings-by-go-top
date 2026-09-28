/**
 * Every generated article adds ONE tracked AI-visibility question
 * (lib/ai-visibility/article-question.ts), and the article viewer's AI card
 * then shows it as tracked (lib/content/article-visibility.ts).
 *
 *   A  the question: from the primary keyword, conversational, in the
 *      project's language, never naming the business
 *   B  the write: one row, owner-fenced, deduplicated (paused questions too),
 *      capped for automatic adds, off with the feature, never throws
 *   C  the card reads the same question and says "tracked"
 *   D  nothing is spent: no check runs, no provider is called, no cron runs
 *      AI checks, and generation calls it once
 *
 * Every rule and guard has a mutation control.
 *
 * Run: npx tsx lib/ai-visibility/__qa__/article-question.qa.ts
 */
import { readFileSync, writeFileSync, unlinkSync, readdirSync, statSync } from 'fs'
import { join } from 'path'
import { FakeAdmin } from '@/lib/__qa__/_fake-admin'
import * as Q from '../article-question'
import { loadArticleVisibility } from '@/lib/content/article-visibility'

let pass = 0, fail = 0
function check(name: string, cond: boolean, detail?: string) {
  if (cond) { pass++; console.log(`  ✓ ${name}`) } else { fail++; console.log(`  ✗ ${name}${detail ? ` — ${detail}` : ''}`) }
}
const show = (v: unknown) => JSON.stringify(v)
const ROOT = join(__dirname, '..', '..', '..')
const read = (p: string) => readFileSync(join(ROOT, p), 'utf8')
const strip = (s: string) => s.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\{\/\*[\s\S]*?\*\/\}/g, '').replace(/(^|[^:'"`])\/\/[^\n]*/g, '$1')

let mutants = 0
function mutant<T>(file: string, from: string | RegExp, to: string): T {
  const src = read(file)
  const out = src.replace(from, to)
  if (out === src) throw new Error(`mutation did not apply to ${file}: ${String(from)}`)
  const dir = file.slice(0, file.lastIndexOf('/'))
  const path = join(ROOT, dir, `.qa-mut-artq-${++mutants}-${file.slice(file.lastIndexOf('/') + 1)}`)
  writeFileSync(path, out)
  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    return require(path) as T
  } finally {
    unlinkSync(path)
  }
}

const USER = 'u-owner'
const OTHER = 'u-other'
const P = 'p-1'
const ON = { ENABLE_AI_VISIBILITY: 'true' }
type Row = Record<string, unknown>
const project = (over: Row = {}): Row => ({
  id: P, user_id: USER, name: 'Fast Plumbing', business_name: 'אינסטלציה מהירה', target_domain: 'fast-plumb.co.il',
  country: 'IL', language: 'he', ...over,
})
const world = (over: { projects?: Row[]; prompts?: Row[] } = {}) => new FakeAdmin({
  projects: over.projects ?? [project()],
  ai_prompts: over.prompts ?? [],
  article_topics: [{ id: 't1', primary_keyword: 'פתיחת סתימה', language: 'he' }],
  ai_citations: [],
})
const heTopic = { primary_keyword: 'פתיחת סתימה', language: 'he' }
const input = (over: Partial<Parameters<typeof Q.trackArticleQuestion>[1]> = {}) =>
  ({ projectId: P, userId: USER, title: 'איך פותחים סתימה בכיור', topic: heTopic, ...over })
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const asAdmin = (a: FakeAdmin) => a as any
const prompts = (a: FakeAdmin) => a.tables.ai_prompts

async function scenarios(M: typeof Q) {
  const added = world()
  const r1 = await M.trackArticleQuestion(asAdmin(added), input(), ON)
  const again = await M.trackArticleQuestion(asAdmin(added), input(), ON)
  const typed = world({ prompts: [{ id: 'x', project_id: P, prompt: (r1.prompt ?? '').replace(/\?$/, '').toUpperCase() + ' !', is_active: false }] })
  const typedR = await M.trackArticleQuestion(asAdmin(typed), input(), ON)
  const full = world({ prompts: Array.from({ length: M.AUTO_QUESTION_CAP }, (_, i) => ({ id: `f${i}`, project_id: P, prompt: `question ${i}`, is_active: true })) })
  const fullR = await M.trackArticleQuestion(asAdmin(full), input(), ON)
  const theirs = world({ projects: [project({ user_id: OTHER })] })
  const theirsR = await M.trackArticleQuestion(asAdmin(theirs), input(), ON)
  return { added, r1, again, typed, typedR, full, fullR, theirs, theirsR }
}

async function main() {
  console.log('One tracked AI question per generated article')

  console.log('\nA) the question')
  {
    const he = Q.articleQuestion(project() as never, heTopic, null)
    check('A1: from the primary keyword, as a question, in Hebrew', !!he && he.language === 'he' && /סתימה/.test(he.prompt) && /\?$/.test(he.prompt), show(he))
    const en = Q.articleQuestion(project({ language: 'en' }) as never, { primary_keyword: 'drain unclogging', language: null }, null)
    check('A2: the project\'s language when the topic has none (English)', !!en && en.language === 'en' && /drain unclogging/i.test(en.prompt), show(en))
    const topicWins = Q.articleQuestion(project({ language: 'en' }) as never, heTopic, null)
    check('A3: the topic\'s language first, as the article viewer reads it', topicWins?.language === 'he', show(topicWins))
    const brand = Q.articleQuestion(project() as never, { primary_keyword: 'אינסטלציה מהירה מחירים', language: 'he' }, null)
    const domain = Q.articleQuestion(project() as never, { primary_keyword: 'fast-plumb reviews', language: 'en' }, null)
    check('A4: a keyword that names the business (its name or its domain) gives no question', brand === null && domain === null, show({ brand, domain }))
    check('A5: the same text compares equal regardless of case, punctuation and spacing',
      Q.sameQuestion('How to unclog a drain?', ' how  to unclog a DRAIN ') && !Q.sameQuestion('', '') && !Q.sameQuestion('a drain', 'a sink'))
  }

  console.log('\nB) the write')
  {
    const s = await scenarios(Q)
    const row = prompts(s.added)[0] ?? {}
    check('B1: added: one active row in this project, with the project\'s domain, brand, country and language',
      s.r1.outcome === 'added' && prompts(s.added).length === 1 && row.project_id === P && row.is_active === true && row.language === 'he'
      && row.target_domain === 'fast-plumb.co.il' && row.target_brand_name === 'אינסטלציה מהירה' && row.country === 'IL' && row.prompt === s.r1.prompt, show(prompts(s.added)))
    check('B2: a second article on the same keyword adds nothing (already tracked)', s.again.outcome === 'already_tracked' && prompts(s.added).length === 1)
    check('B3: the owner\'s own copy, typed differently and paused, counts as the same question', s.typedR.outcome === 'already_tracked' && prompts(s.typed).length === 1, show(s.typedR))
    check(`B4: at ${Q.AUTO_QUESTION_CAP} active questions nothing is added, silently`, s.fullR.outcome === 'at_limit' && prompts(s.full).length === Q.AUTO_QUESTION_CAP, show(s.fullR))
    const paused = world({ prompts: Array.from({ length: Q.AUTO_QUESTION_CAP }, (_, i) => ({ id: `f${i}`, project_id: P, prompt: `question ${i}`, is_active: i > 0 })) })
    const pausedR = await Q.trackArticleQuestion(asAdmin(paused), input(), ON)
    check('B5: paused questions do not count toward that limit', pausedR.outcome === 'added', show(pausedR))
    check('B6: another owner\'s project gets nothing (project_not_found, no write)', s.theirsR.outcome === 'project_not_found' && prompts(s.theirs).length === 0)
    const off = world()
    const offR = await Q.trackArticleQuestion(asAdmin(off), input(), {})
    check('B7: with AI visibility off nothing is read or written', offR.outcome === 'disabled' && prompts(off).length === 0)
    const brandR = await Q.trackArticleQuestion(asAdmin(world()), input({ topic: { primary_keyword: 'אינסטלציה מהירה', language: 'he' }, title: 'אינסטלציה מהירה' }), ON)
    check('B8: an article about the business itself adds no question', brandR.outcome === 'no_question', show(brandR))
    const broken = new FakeAdmin({ projects: [project()], ai_prompts: [] }, { ai_prompts: { insert: () => ({ code: '500' }) } })
    const brokenR = await Q.trackArticleQuestion(asAdmin(broken), input(), ON)
    const throwing = { from: () => { throw new Error('db down') } }
    const throwR = await Q.trackArticleQuestion(throwing as never, input(), ON)
    check('B9: a failed write or a thrown error is an outcome ("failed"), never an exception', brokenR.outcome === 'failed' && throwR.outcome === 'failed')

    // Mutation controls.
    const noDedup = await scenarios(mutant<typeof Q>('lib/ai-visibility/article-question.ts', 'if (existing.some((row) => sameQuestion(row.prompt, question.prompt))) return', 'if (false) return'))
    check('B10: MUT without the dedup a second article adds a duplicate (B2 fails)', noDedup.again.outcome === 'added' && prompts(noDedup.added).length === 2)
    const noOwner = await scenarios(mutant<typeof Q>('lib/ai-visibility/article-question.ts', ".eq('user_id', input.userId)\n", '\n'))
    check('B11: MUT the owner fence removed alone still refuses (the row\'s owner is re-checked)', noOwner.theirsR.outcome === 'project_not_found')
    const noFence = await scenarios(mutant<typeof Q>('lib/ai-visibility/article-question.ts', /\.eq\('user_id', input\.userId\)\n([\s\S]*?)project\.user_id !== input\.userId/, "\n$1false"))
    check('B12: MUT without both owner checks another owner\'s project gets a question (B6 fails)', noFence.theirsR.outcome === 'added' && prompts(noFence.theirs).length === 1)
    const noCap = await scenarios(mutant<typeof Q>('lib/ai-visibility/article-question.ts', ">= AUTO_QUESTION_CAP) return", ">= Infinity) return"))
    check('B13: MUT without the cap a full project still gets one (B4 fails)', noCap.fullR.outcome === 'added')
    const normNoPunct = mutant<typeof Q>('lib/ai-visibility/article-question.ts', ".replace(/[?!.,;:'\"״׳`\\-–—؟،]/g, '')", '')
    check('B14: MUT without the punctuation rule a copy typed with "?!" is a different question (A5/B3 fail)',
      !normNoPunct.sameQuestion('איך פותחים סתימה?!', 'איך פותחים סתימה') && Q.sameQuestion('איך פותחים סתימה?!', 'איך פותחים סתימה'))
  }

  console.log('\nC) the article viewer\'s card says "tracked"')
  {
    const a = world()
    await Q.trackArticleQuestion(asAdmin(a), input(), ON)
    const article = { id: 'a1', project_id: P, topic_id: 't1', title: 'איך פותחים סתימה בכיור', status: 'draft' }
    const v = await loadArticleVisibility(asAdmin(a), article, { aiVisibilityEnabled: true })
    check('C1: a generated draft already shows its question, tracked', v.suggestion?.tracked === true && v.suggestion.prompt === prompts(a)[0].prompt, show(v.suggestion))
    const before = await loadArticleVisibility(asAdmin(world()), article, { aiVisibilityEnabled: true })
    check('C2: without the question, a draft shows no suggestion (as before)', before.suggestion === null, show(before.suggestion))
    const live = await loadArticleVisibility(asAdmin(world()), { ...article, status: 'published' }, { aiVisibilityEnabled: true })
    check('C3: a published article without it still offers the one-click suggestion, not tracked', live.suggestion?.tracked === false, show(live.suggestion))
    const card = strip(read('components/content/ArticleAiVisibilityCard.tsx'))
    check('C4: the card switches its title and hint when tracked', /s\.tracked \? t\.trackedTitle/.test(card) && /t\.trackedHint/.test(card))
    const vis = strip(read('lib/content/article-visibility.ts'))
    const mutVis = vis.replace('sameQuestion(r.prompt, prompt)', 'r.prompt === prompt')
    check('C5: the card compares by the same normalisation (sameQuestion); MUT exact compare fails this guard',
      /sameQuestion\(r\.prompt, prompt\)/.test(vis) && !/sameQuestion\(r\.prompt, prompt\)/.test(mutVis))
  }

  console.log('\nD) nothing is spent')
  {
    const src = strip(read('lib/ai-visibility/article-question.ts'))
    const spends = /runAIVisibilityScan|providers\/|scrapellm|fetch\(|reserve_usage|usage_reservations|ai_scan_runs/
    check('D1: the question module runs no check, calls no provider and touches no usage', !spends.test(src))
    check('D2: MUT a module that starts a check fails D1', spends.test(src + "\nawait admin.from('ai_scan_runs').insert({})"))
    // Only the owner's click route runs a check.
    const callers: string[] = []
    const walk = (dir: string) => {
      for (const f of readdirSync(join(ROOT, dir))) {
        if (f === 'node_modules' || f.startsWith('.') || f === '__qa__') continue
        const p = `${dir}/${f}`
        if (statSync(join(ROOT, p)).isDirectory()) walk(p)
        else if (/\.tsx?$/.test(f) && /runAIVisibilityScan\(/.test(strip(read(p)))) callers.push(p)
      }
    }
    walk('app'); walk('lib')
    check('D3: the only caller of runAIVisibilityScan is POST /api/ai-visibility/runs (the owner\'s click)',
      show(callers.filter((c) => c !== 'lib/ai-visibility/index.ts')) === show(['app/api/ai-visibility/runs/route.ts']), show(callers))
    const crons = (JSON.parse(read('vercel.json')).crons as { path: string }[]).map((c) => c.path)
    check('D4: no cron path is an AI-visibility route', crons.length > 0 && !crons.some((p) => /ai-visibility/.test(p)), show(crons))
    const gen = strip(read('lib/content/article-generation.ts'))
    const hook = /Mark the topic as used|update\(\{ status: 'used'[\s\S]*?trackArticleQuestion\(admin, \{\s*projectId,\s*userId,/
    check('D5: generation adds the question once, for its own project and owner, after the article is stored',
      (gen.match(/trackArticleQuestion\(/g) ?? []).length === 1 && hook.test(gen))
    check('D6: MUT generation without the hook fails D5', !hook.test(gen.replace('trackArticleQuestion(admin, {', 'noop(admin, {')))
  }

  console.log(`\n${pass} passed, ${fail} failed`)
  if (fail > 0) process.exit(1)
}

main().catch((e) => { console.error(e); process.exit(1) })

export {}
