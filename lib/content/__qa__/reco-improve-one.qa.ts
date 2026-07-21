/**
 * Per-item "שפר עם Gemini Pro" — deterministic QA for improveRecommendationWithPro
 * (fail-safe polish) and the model-selection persistence round trip.
 *
 * Runs the REAL improve module against the fixture Gemini server (RECO_GENAI_BASE_URL
 * seam). Asserts: a good polish updates the wording with the Pro model; an off-subject
 * title is REJECTED (original kept); a malformed reason is REJECTED; Pro unavailability
 * is a truthful non-improvement (never a silent Flash polish). Plus: requestedTier /
 * modelUsed / improvedWithPro survive the persisted link_plan bundle.
 */
import { startFakeGenai } from './_reco-harness'
import { resetModelResolutionCache } from '../recommendations/model-availability'
import { resetRecoGenAiClient } from '../recommendations/genai-client'
import { improveRecommendationWithPro } from '../recommendations/improve-one'
import { newRunCostController } from '../recommendations/run-cost-controller'
import { ideaToSuggestion } from '../recommendations/topic-idea-store'
import type { ContentTopicIdeaRow } from '@/lib/supabase/types'

let pass = 0, fail = 0
function check(name: string, cond: boolean, detail?: string) {
  if (cond) { pass++; console.log(`  ✓ ${name}`) } else { fail++; console.log(`  ✗ ${name}${detail ? ` — ${detail}` : ''}`) }
}

async function withGenai(models: string[], raw: () => string, fn: () => Promise<void>) {
  const { server, port } = await startFakeGenai({ models, respond: () => [], respondRaw: () => raw() })
  process.env.GEMINI_API_KEY = 'test-key'
  process.env.RECO_GENAI_BASE_URL = `http://127.0.0.1:${port}`
  resetModelResolutionCache(); resetRecoGenAiClient()
  try { await fn() } finally { server.close() }
}

const PRO = ['gemini-2.5-flash', 'gemini-2.5-pro']
const ctl = () => newRunCostController('premium', 'improve-test', 1, { maxModelCallsPerRun: 1 })
const KW = 'שמלות כלה יד שנייה'
const ORIG_TITLE = 'שמלות כלה יד שנייה'
const ORIG_REASON = 'הנושא משלים פער תוכן בתחום שהעסק עוסק בו.'

async function main() {
  console.log('IMPROVE) a valid Pro polish updates the wording (keyword preserved)')
  await withGenai(PRO, () => JSON.stringify({ title: 'שמלות כלה יד שנייה: המדריך המלא לבחירה חכמה ומשתלמת', reason: 'מדריך שיעזור לכלות למצוא שמלת יד שנייה איכותית במחיר נוח, עם דגש על התאמה ובדיקת מצב.' }), async () => {
    const r = await improveRecommendationWithPro({ primaryKeyword: KW, title: ORIG_TITLE, suggestionReason: ORIG_REASON, language: 'he' }, ctl())
    check('I1. ok + changed', r.ok && r.changed, JSON.stringify(r))
    check('I2. title was polished (still about שמלות כלה)', r.title.includes('שמלות כלה') && r.title !== ORIG_TITLE)
    check('I3. reason was polished', r.suggestionReason !== ORIG_REASON && r.suggestionReason.length > 20)
    check('I4. the Pro model was used', !!r.model && /pro/i.test(r.model), String(r.model))
    check('I5. modelPath is a real Pro path (not downgraded)', r.modelPath.tierUsed === 'pro' && r.modelPath.downgraded === false)
  })

  console.log('IMPROVE) an OFF-SUBJECT polished title is rejected (original kept — never degraded)')
  await withGenai(PRO, () => JSON.stringify({ title: 'המדריך המלא לניקיון משרדים ותחזוקה', reason: ORIG_REASON }), async () => {
    const r = await improveRecommendationWithPro({ primaryKeyword: KW, title: ORIG_TITLE, suggestionReason: ORIG_REASON, language: 'he' }, ctl())
    check('I6. ok, but the off-subject title was NOT applied', r.ok && r.title === ORIG_TITLE, JSON.stringify(r))
  })

  console.log('IMPROVE) a MALFORMED reason is rejected (original reason kept)')
  await withGenai(PRO, () => JSON.stringify({ title: 'שמלות כלה יד שנייה: איך לבחור נכון', reason: 'כי' }), async () => {
    const r = await improveRecommendationWithPro({ primaryKeyword: KW, title: ORIG_TITLE, suggestionReason: ORIG_REASON, language: 'he' }, ctl())
    check('I7. the malformed reason was NOT applied (original kept)', r.suggestionReason === ORIG_REASON, JSON.stringify(r))
    check('I8. the valid title still applied', r.title !== ORIG_TITLE)
  })

  console.log('IMPROVE) Pro genuinely unavailable → truthful non-improvement (never a silent Flash polish)')
  await withGenai(['gemini-2.5-flash'], () => JSON.stringify({ title: 'x', reason: 'y' }), async () => {
    const r = await improveRecommendationWithPro({ primaryKeyword: KW, title: ORIG_TITLE, suggestionReason: ORIG_REASON, language: 'he' }, ctl())
    check('I9. ok=false + model_unavailable (no downgrade to Flash)', !r.ok && r.reason === 'model_unavailable', JSON.stringify(r))
    check('I10. wording untouched', r.title === ORIG_TITLE && r.suggestionReason === ORIG_REASON)
  })

  console.log('PERSIST) model-selection provenance survives the link_plan bundle')
  {
    const row = {
      id: 'idea-1', title: ORIG_TITLE, primary_keyword: KW, secondary_keywords: [], search_intent: 'informational',
      recommended_word_count: 1000, angle: '', suggested_internal_links: [], suggestion_reason: ORIG_REASON, score: 0.8,
      source: 'keyword_research',
      link_plan: { requestedTier: 'premium', modelUsed: 'gemini-2.5-pro', improvedWithPro: true, improvedModel: 'gemini-2.5-pro' },
    } as unknown as ContentTopicIdeaRow
    const s = ideaToSuggestion(row)
    check('P1. requestedTier survives reload', s.requestedTier === 'premium', JSON.stringify({ t: s.requestedTier }))
    check('P2. modelUsed survives reload', s.modelUsed === 'gemini-2.5-pro', String(s.modelUsed))
    check('P3. improvedWithPro survives reload', s.improvedWithPro === true)
    // A batch row with NO improvement flag reads improvedWithPro as falsy.
    const plain = ideaToSuggestion({ ...row, link_plan: { requestedTier: 'standard', modelUsed: 'gemini-2.5-flash' } } as unknown as ContentTopicIdeaRow)
    check('P4. a non-improved item is not marked', !plain.improvedWithPro && plain.requestedTier === 'standard')
  }

  console.log(`\n${pass} passed, ${fail} failed`)
  if (fail > 0) process.exit(1)
}
main().catch((e) => { console.error(e); process.exit(1) })
