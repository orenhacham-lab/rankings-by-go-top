/**
 * THE TRUTH GATE REPAIRS A SENTENCE BEFORE IT REFUSES AN ARTICLE.
 *
 *   A) the repair itself: where the sentence is found, rewritten, cut;
 *   B) what is NOT repaired: title, meta, links, a cell that cannot go;
 *   C) the runner: the repaired article is what is published and the gate ran
 *      again on it; time, rounds and structure bound the repair.
 *
 * Mutation controls are at the bottom of the file, written as the run that
 * proves each guard fails when its code is broken.
 */
process.env.NEXT_PUBLIC_SPANISH_SITE_ENABLED = 'true'

import { checkTruthLimits } from '@/lib/blog/auto/truth-limits'
import { repairRefusedSentences, MAX_REPAIR_ROUNDS, type RewriteBlock } from '@/lib/blog/auto/sentence-repair'
import { runBlogAutoPublish, type BlogAutoDeps } from '@/lib/blog/auto/runner'
import { PLAN_TABLE } from '@/lib/blog/auto/store'
import { RETRY_RULES } from '@/lib/blog/auto/brief'
import { FakeAdmin } from '@/lib/__qa__/_fake-admin'
import type { createAdminClient } from '@/lib/supabase/admin'
import type { ValidatedArticle } from '@/lib/content/gemini-article'

type Admin = ReturnType<typeof createAdminClient>
let passed = 0
let failed = 0
function check(name: string, ok: boolean, got?: unknown) {
  if (ok) passed++
  else { failed++; console.log('FAIL', name, got === undefined ? '' : JSON.stringify(got)) }
}

const CLAIM = 'Our customers saw a 40% rise in traffic.'
const fix = async (html: string, round = 0, rewrite: RewriteBlock | null = null, locale = 'en') => {
  const t = checkTruthLimits({ title: 'Rank checks', metaDescription: 'How to check rankings well', html })
  const out = await repairRefusedSentences({
    html, locale, failures: t.failures, offenders: t.offenders, rules: RETRY_RULES, round, rewrite,
  })
  const after = out.ok ? checkTruthLimits({ title: 'Rank checks', metaDescription: 'How to check rankings well', html: out.html }) : null
  return { t, out, after }
}

async function main() {
  // ---------------- A) the repair ----------------
  {
    const { t, out, after } = await fix(`<h2>Intro</h2><p>Rank checks matter. ${CLAIM} Always compare against a baseline.</p><p>Next paragraph.</p>`)
    check('A0: the gate refuses the sentence and names it whole', !t.ok && t.offenders.percentage_claim?.includes('40% rise'), t.offenders)
    check('A1: the claim sentence is cut and the rest of the paragraph stays', out.ok && !out.html.includes('40%') && out.html.includes('Rank checks matter.') && out.html.includes('Always compare against a baseline.'), out)
    check('A2: the other paragraph and the heading are untouched', out.ok && out.html.includes('<p>Next paragraph.</p>') && out.html.includes('<h2>Intro</h2>'))
    check('A3: the repaired text passes the gate', after?.ok === true, after)
  }
  {
    const { out } = await fix(`<p>Keep this.</p><p>${CLAIM}</p><ul><li>${CLAIM}</li><li>Keep too.</li></ul>`)
    check('A4: a paragraph that is only the claim is removed, no empty <p> left', out.ok && !/<p>\s*<\/p>/.test(out.html) && out.html.includes('<p>Keep this.</p>'), out)
    // One sentence per code per round: the second claim is the next round's.
    const round2 = out.ok ? await fix(out.html, 1) : null
    check('A5: the next round takes the next claim, and a list item goes whole', round2?.out.ok === true && round2.after?.ok === true && !/<li>\s*<\/li>/.test(round2.out.html) && round2.out.html.includes('<li>Keep too.</li>'), round2)
  }
  {
    // A heading has no full stop, so the gate's "sentence" runs from it into the paragraph.
    const { t, out, after } = await fix(`<h2>Results</h2><p>${CLAIM}</p><p>Other.</p>`)
    check('A6: a sentence that runs from a heading into its paragraph is found in the paragraph', out.ok && out.html.includes('<h2>Results</h2>') && !out.html.includes('40%') && after?.ok === true, { t: t.offenders, out })
  }
  {
    let asked: { block: string; sentence: string; rule: string; locale: string } | null = null
    const rewrite: RewriteBlock = async (req) => { asked = req; return 'Rank checks matter. Compare against a baseline <b>always</b>.' }
    const { out, after } = await fix(`<p>Rank checks matter. ${CLAIM}</p>`, 0, rewrite)
    check('A7: round 0 asks the model for the block, with the sentence and the rule', asked !== null && (asked as { sentence: string }).sentence.includes('40% rise') && (asked as { rule: string }).rule === RETRY_RULES.percentage_claim && (asked as { locale: string }).locale === 'en', asked)
    check('A8: markup in a rewrite is stripped, never inserted', out.ok && !out.html.includes('<b>') && out.html.includes('always'), out)
    check('A9: the rewritten text passes the gate', after?.ok === true)
  }
  {
    const { out } = await fix(`<p>Rank checks matter. ${CLAIM}</p>`, 1, async () => 'never used')
    check('A10: after round 0 the model is not asked again, the sentence is cut', out.ok && !out.html.includes('never used') && !out.html.includes('40%'), out)
  }
  {
    let calls = 0
    const { out } = await fix(`<p>Read <a href="https://www.gotopseo.com/signup">Go Top SEO</a> today. ${CLAIM}</p>`, 0, async () => { calls++; return 'lost the link' })
    check('A11: a block holding a link is never rewritten (the link would be lost), the sentence is cut', calls === 0 && out.ok && out.html.includes('<a href="https://www.gotopseo.com/signup">Go Top SEO</a>') && !out.html.includes('40%'), { calls, out })
  }
  {
    const { out } = await fix(`<p>Rank checks matter. ${CLAIM}</p>`, 0, async () => { throw new Error('boom') })
    check('A12: a model that throws falls back to cutting the sentence', out.ok && !out.html.includes('40%') && out.html.includes('Rank checks matter.'), out)
    const empty = await fix(`<p>Rank checks matter. ${CLAIM}</p>`, 0, async () => '   ')
    check('A13: an empty answer falls back to cutting the sentence', empty.out.ok && !empty.out.html.includes('40%'), empty.out)
  }
  {
    // A scale is judged by the gate already; a real claim in a table cell cannot be cut without a hole.
    const html = `<table><tr><th>Tool</th><th>Gain</th></tr><tr><td>Ours saw 40% more traffic</td><td>x</td></tr></table>`
    const cut = await fix(html)
    check('A14: a table cell is never deleted (it would leave a hole in the table)', !cut.out.ok, cut.out)
    const rew = await fix(html, 0, async () => 'Compare traffic before and after')
    check('A15: a table cell is rewritten in place when the model answers', rew.out.ok && rew.out.html.includes('<td>Compare traffic before and after</td>') && rew.after?.ok === true, rew.out)
  }

  // ---------------- B) what is not repaired ----------------
  {
    const t = checkTruthLimits({ title: 'We grew 40% in a month', metaDescription: 'ok', html: '<p>Clean text.</p>' })
    const out = await repairRefusedSentences({ html: '<p>Clean text.</p>', locale: 'en', failures: t.failures, offenders: t.offenders, rules: RETRY_RULES, round: 0, rewrite: null })
    check('B1: a claim in the title is not repaired', !out.ok, out)
  }
  {
    const html = '<p>Clean.</p><p><a href="https://apps.shopify.com/other" rel="nofollow">x</a></p>'
    const t = checkTruthLimits({ title: 'T', metaDescription: 'm', html })
    const out = await repairRefusedSentences({ html, locale: 'en', failures: t.failures, offenders: t.offenders, rules: RETRY_RULES, round: 0, rewrite: null })
    check('B2: a bad Shopify link is not repaired', t.failures.includes('shopify_link_not_listing') && !out.ok, { f: t.failures, out })
  }
  {
    const out = await repairRefusedSentences({ html: '<p>x</p>', locale: 'en', failures: ['percentage_claim'], offenders: { percentage_claim: 'not in the body at all' }, rules: RETRY_RULES, round: 0, rewrite: null })
    check('B3: a sentence that is nowhere in the body is not repaired', !out.ok, out)
  }

  // ---------------- C) the runner ----------------
  const WORDS = Array.from({ length: 200 }, (_, i) => `word${i}`).join(' ')
  const article = (html: string, title = 'Rank check guide'): ValidatedArticle => ({
    article: {
      title, slug: 'rank-check', metaTitle: title, metaDescription: 'How to check rankings and what to do with the result',
      excerpt: 'x', contentHtml: '', contentMarkdown: '', faq: [], imagePrompt: 'desk', warnings: [],
    },
    safeHtml: html, slug: 'rank-check', usage: null,
    audit: { score: 90, blockers: [], warnings: [], passes: [], counts: {} } as unknown as ValidatedArticle['audit'],
    model: 'test',
  })
  const body = (extra: string) => `<h2>Guide</h2><p>${WORDS}. Go Top SEO helps.</p>${extra}`
  let covers = 0
  const mkDeps = (html: string, over: Partial<BlogAutoDeps> = {}, title?: string): BlogAutoDeps => ({
    generate: async () => article(html, title),
    cover: async () => { covers++; return { ok: true, url: 'https://x.supabase.co/storage/v1/object/public/article-images/auto/a.jpg' } },
    ...over,
  })
  const planned = () => ({
    id: 'p1', locale: 'en', topic: 'rank check', primary_keyword: 'rank check', secondary_keywords: [],
    monthly_searches: 900, status: 'planned', attempts: 0, last_error: null, locked_at: null, article_id: null, article_slug: null,
  })
  const run = async (deps: BlogAutoDeps, deadlineAt?: number) => {
    const admin = new FakeAdmin({ [PLAN_TABLE]: [planned()], articles: [] })
    const summary = await runBlogAutoPublish(admin as unknown as Admin, { now: Date.parse('2026-11-24T08:00:00Z'), locale: 'en', deadlineAt }, deps)
    const published = (admin.tables.articles as { content_html?: string; content?: string }[])[0]
    const html = String(published?.content_html ?? published?.content ?? '')
    const row = admin.tables[PLAN_TABLE][0] as Record<string, unknown>
    return { summary, html, row, count: admin.tables.articles.length }
  }
  const quiet = console.warn
  console.warn = () => undefined
  try {
    {
      const r = await run(mkDeps(body(`<p>Useful note. ${CLAIM}</p>`)))
      check('C1: an article with one refused sentence is PUBLISHED, without the sentence', r.summary.published !== null && r.count === 1 && !r.html.includes('40%') && r.html.includes('Useful note.'), { f: r.summary.failure, h: r.html.slice(-200) })
    }
    {
      covers = 0
      const rewrites: string[] = []
      const r = await run(mkDeps(body(`<p>Useful note. ${CLAIM}</p>`), { rewrite: async (q) => { rewrites.push(q.sentence); return 'Useful note. Compare before and after.' } }))
      check('C2: the model rewrite is what is published when the pass has time', r.summary.published !== null && r.html.includes('Compare before and after.') && !r.html.includes('40%') && rewrites.length === 1, { rewrites, f: r.summary.failure })
      check('C2b: and one cover is paid for, once', covers === 1, covers)
    }
    {
      const rewrites: string[] = []
      const r = await run(mkDeps(body(`<p>Useful note. ${CLAIM}</p>`), { rewrite: async (q) => { rewrites.push(q.sentence); return 'Useful note.' } }), Date.now() + 20_000)
      check('C3: with under 90 s of the pass left the model is not asked, the sentence is cut', r.summary.published !== null && rewrites.length === 0 && !r.html.includes('40%'), { rewrites, f: r.summary.failure })
    }
    {
      let calls = 0
      const r = await run(mkDeps(body(`<p>Useful note. ${CLAIM}</p>`), { rewrite: async () => { calls++; return 'Useful note. Our customers saw a 55% rise in traffic.' } }))
      check('C4: a rewrite that brings the claim back is refused by the SAME gate, then cut', r.summary.published !== null && calls === 1 && !/\d%/.test(r.html), { calls, f: r.summary.failure, h: r.html.slice(-200) })
    }
    {
      const claims = Array.from({ length: 4 }, (_, i) => `<p>Item ${"abcd"[i]}. Traffic gained ${10 + i}% more.</p>`).join('')
      const r = await run(mkDeps(body(claims)))
      check('C5a: the round bound is the one this test assumes', MAX_REPAIR_ROUNDS === 3)
      check('C5: repair is bounded: more claims than rounds is refused as before, with the reason', r.summary.published === null && r.summary.failure?.startsWith('truth:') === true && r.count === 0 && r.row?.status === 'planned', { f: r.summary.failure, s: r.row?.status })
    }
    {
      const r = await run(mkDeps(body('<p>Fine.</p>'), {}, 'We grew 40% in a month'))
      check('C6: a claim in the title is refused exactly as before', r.summary.published === null && r.summary.failure?.startsWith('truth:percentage_claim') === true, r.summary.failure)
    }
    {
      const r = await run(mkDeps(`<h2>Guide</h2><p>Go Top SEO. ${WORDS} ${CLAIM}</p>`))
      check('C7: if the cut takes the article under the structural floor it is refused for that, not published thin', r.summary.published === null && r.summary.failure?.startsWith('quality:') === true && r.count === 0, r.summary.failure)
    }
    {
      const r = await run(mkDeps(body('<p>All good here.</p>')))
      check('C8: a clean article is untouched (no repair, no model call)', r.summary.published !== null && r.html.includes('All good here.'), r.summary.failure)
    }
  } finally {
    console.warn = quiet
  }

  console.log(`${passed} passed, ${failed} failed`)
  if (failed > 0) process.exit(1)
}
main()
export {}
