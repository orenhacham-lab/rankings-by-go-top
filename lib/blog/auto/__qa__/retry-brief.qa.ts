/**
 * A RETRY IS TOLD WHY THE LAST ATTEMPT WAS REFUSED — offline, pure.
 *
 * Until 7 Nov 2026 a row's three attempts were three identical briefs: the gate
 * wrote its verdict to blog_plan.last_error and the next brief never read it.
 * On the English queue that morning, "keyword tracker" was refused twice in
 * fourteen minutes for a daily-tracking claim, the second time for a ranking
 * guarantee as well, because nothing in the second brief mentioned the first
 * refusal.
 *
 * A: a content failure becomes [MUST AVOID] lines naming the rule and the fact
 *    that replaces it.
 * B: an infrastructure failure adds nothing, and an unknown code is ignored.
 * C: the brief carries it, and a first attempt is unchanged.
 * Each group ends with a MUTATION CONTROL: the pre-fix behaviour.
 */
import { buildBlogBrief, retryAvoidances, retryBriefNotes } from '../brief'

let pass = 0, fail = 0
function check(name: string, cond: boolean, detail?: string) {
  if (cond) { pass++; console.log(`  ✓ ${name}`) } else { fail++; console.log(`  ✗ ${name}${detail ? ` — ${detail}` : ''}`) }
}

const BASE = {
  locale: 'en' as const,
  topic: 'keyword tracker',
  primaryKeyword: 'keyword tracker',
  secondaryKeywords: [],
  internalTargets: [],
}

async function main() {
  console.log('A) the real failures of 7 Nov 2026 come back as constraints')
  {
    const first = retryAvoidances('truth:tracking_cadence_claim')
    check('A1: one code, one line', first.length === 1, `got ${first.length}`)
    check('A2: it says the cadence is monthly, not just "do not say daily"',
      /ONCE A MONTH/.test(first[0]), first[0])

    const second = retryAvoidances('truth:tracking_cadence_claim,ranking_guarantee')
    check('A3: both codes of the 05:16 UTC refusal', second.length === 2, `got ${second.length}`)
    check('A4: the guarantee line forbids the promise', /guarantee/i.test(second[1]), second[1])

    // Every code the three content gates can produce has a line, or a refusal
    // teaches the next attempt nothing.
    const ALL = [
      'percentage_claim', 'customer_count_claim', 'tracking_cadence_claim', 'rating_claim',
      'ranking_guarantee', 'ai_engine_coverage_claim', 'shopify_schema_claim',
      'shopify_link_not_listing', 'shopify_link_not_nofollow',
      'placeholder_found', 'content_too_short', 'brand_not_mentioned', 'no_link_to_product',
    ]
    for (const code of ALL) {
      check(`A5 ${code} has a line`, retryAvoidances(`truth:${code}`).length === 1)
    }
    // A duplicate code (the same rule tripped in title and body) is said once.
    check('A6: a repeated code is not repeated',
      retryAvoidances('truth:rating_claim,rating_claim').length === 1)

    // MUTATION CONTROL — the pre-fix brief, which carried null.
    check('MUTATION: a null briefNotes carries none of this (so A1 would fail)',
      retryBriefNotes(null) === null)
  }

  console.log('B) what is deliberately not repeated back')
  {
    check('B1: a Gemini quota error says nothing about the text',
      retryAvoidances('generate:gemini_quota_exceeded').length === 0)
    check('B2: nor does a cover failure', retryAvoidances('cover:image_failed').length === 0)
    check('B3: nor a stale lock', retryAvoidances('stale_lock_recovered').length === 0)
    check('B4: an unknown code is ignored, not echoed',
      retryAvoidances('truth:some_rule_added_later').length === 0)
    check('B5: so an infrastructure failure leaves briefNotes null',
      retryBriefNotes('generate:gemini_quota_exceeded') === null)
    check('B6: empty and missing are both safe',
      retryAvoidances('').length === 0 && retryAvoidances(undefined).length === 0)
  }

  console.log('C) the brief the generator receives')
  {
    const retry = buildBlogBrief({ ...BASE, previousFailure: 'truth:tracking_cadence_claim' })
    const notes = retry.briefNotes || ''
    check('C1: the note says the previous attempt was refused', /REFUSED/.test(notes), notes)
    check('C2: and marks the rule MUST AVOID, which the generator treats as a hard constraint',
      notes.includes('[MUST AVOID]'), notes)
    // A year in briefNotes is read as a year the brief asked for
    // (collectAllowedYears in lib/content/gemini-article.ts), which would let
    // the article date itself.
    check('C3: no year leaks into briefNotes', !/\b20\d{2}\b/.test(notes), notes)

    const firstTry = buildBlogBrief(BASE)
    check('C4: a first attempt is the brief it always was', firstTry.briefNotes === null)
    const explicitNull = buildBlogBrief({ ...BASE, previousFailure: null })
    check('C5: and so is a row with no recorded failure', explicitNull.briefNotes === null)
    check('C6: nothing else about the brief changed',
      retry.topic === firstTry.topic && retry.primaryKeyword === firstTry.primaryKeyword
      && retry.desiredWordCount === firstTry.desiredWordCount)

    // MUTATION CONTROL — the pre-fix runner passed nothing, so the second brief
    // equalled the first.
    check('MUTATION: without previousFailure the two briefs are identical (so C1 would fail)',
      JSON.stringify(firstTry) === JSON.stringify(buildBlogBrief({ ...BASE })))
  }

  console.log(`\n${pass} passed, ${fail} failed`)
  if (fail > 0) process.exitCode = 1
}
main()

export {}
