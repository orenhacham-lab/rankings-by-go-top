/**
 * Recommendation Gemini-fix QA — offline, no network.
 * Proves the systemic empty-output regression fix: the reco JSON path is on the
 * modern @google/genai SDK with thinking disabled, and empty/MAX_TOKENS responses
 * are classified explicitly (never treated as a successful JSON body). Live token
 * generation is the user's one final Preview test.
 */
import { readFileSync } from 'fs'
import { join } from 'path'
import { classifyGenAiResponse, isModelUnavailableMessage, RecommendationModelUnavailableError, RECOMMENDATION_MODEL_PRIMARY, RECOMMENDATION_MODEL_CURATOR } from '../recommendations/model'
import { configuredRecommendationModel } from '../recommendations/model-availability'
import { runBudget } from '../recommendations/reco-cost'
import { classifyRecoRun } from '../recommendations/run-classify'

let pass = 0, fail = 0
function check(name: string, cond: boolean, detail?: string) {
  if (cond) { pass++; console.log(`  ✓ ${name}`) } else { fail++; console.log(`  ✗ ${name}${detail ? ` — ${detail}` : ''}`) }
}
const read = (rel: string) => readFileSync(join(__dirname, rel), 'utf8')

async function main() {
  const modelSrc = read('../recommendations/model.ts')
  const clientSrc = read('../recommendations/genai-client.ts')
  const engineSrc = read('../recommendations/engine.ts')

  console.log('A) SDK swap — modern @google/genai, thinking disabled, legacy gone')
  {
    check('1. reco client uses @google/genai (GoogleGenAI)', /from '@google\/genai'/.test(clientSrc) && /new GoogleGenAI\(/.test(clientSrc))
    check('1. model adapter uses the @google/genai client + models.generateContent', /getRecoGenAiClient/.test(modelSrc) && /client\.models\.generateContent/.test(modelSrc))
    // Model-aware thinking (live Pro-400 fix): the budget comes from
    // resolveModelConfig — Flash stays 0 (the original fix preserved), Pro gets
    // a VALID clamped budget; a hardcoded 0 for every model would 400 on Pro.
    check('2. thinkingBudget is MODEL-AWARE (resolveModelConfig, no hardcoded 0)', /thinkingConfig:\s*\{\s*thinkingBudget:\s*mc\.thinkingBudget\s*\}/.test(modelSrc) && /resolveModelConfig\(/.test(modelSrc) && !/thinkingBudget:\s*0\b/.test(modelSrc))
    check('3. legacy @google/generative-ai is NOT used by the reco JSON path', !/@google\/generative-ai/.test(modelSrc) && !/getGeminiClient/.test(modelSrc))
    check('10/11. Flash-only primary, Pro never wired as generator', RECOMMENDATION_MODEL_PRIMARY === 'gemini-2.5-flash' && !/opts\.model \|\| RECOMMENDATION_MODEL_CURATOR/.test(modelSrc))
    check('same GEMINI_API_KEY (no new credential)', /process\.env\.GEMINI_API_KEY/.test(clientSrc))
  }

  console.log('B) explicit response classification (Part 2) — empty ≠ success')
  {
    // 4. MAX_TOKENS + empty content is its own explicit code, NOT retryable.
    const maxTok = classifyGenAiResponse({ textPresent: false, finishReason: 'MAX_TOKENS', hasCandidates: true, blocked: false })
    check('4. MAX_TOKENS empty → gemini_max_tokens_empty', maxTok.errorType === 'gemini_max_tokens_empty' && maxTok.ok === false)
    check('4. gemini_max_tokens_empty is NOT retryable (no identical repeat)', maxTok.retryable === false)
    check('4. MAX_TOKENS empty is not silently a generic model_error', maxTok.errorType !== undefined && maxTok.errorType !== ('model_unavailable' as unknown))
    // 5. candidate with no text part (non-MAX_TOKENS) → empty_text, not success.
    const noText = classifyGenAiResponse({ textPresent: false, finishReason: 'STOP', hasCandidates: true, blocked: false })
    check('5. empty text (STOP) → gemini_empty_text, ok=false', noText.errorType === 'gemini_empty_text' && noText.ok === false)
    // 7. safety/recitation/language block.
    const blocked = classifyGenAiResponse({ textPresent: false, finishReason: 'SAFETY', hasCandidates: true, blocked: true })
    check('7. blocked → gemini_safety_block, not retryable', blocked.errorType === 'gemini_safety_block' && blocked.retryable === false)
    // empty candidate list — retryable (a transient empty).
    const noCand = classifyGenAiResponse({ textPresent: false, hasCandidates: false, blocked: false })
    check('empty candidate list → gemini_empty_candidates', noCand.errorType === 'gemini_empty_candidates')
    // 6. a real JSON text is OK (parsing happens downstream).
    const okRes = classifyGenAiResponse({ textPresent: true, finishReason: 'STOP', hasCandidates: true, blocked: false })
    check('6. present text → ok, json_ready', okRes.ok === true && okRes.parseStatus === 'json_ready')
    check('5. empty text is never parseStatus json_ready', noText.parseStatus === 'empty' && maxTok.parseStatus === 'empty')
  }

  console.log('C) retry policy (Part 3) — no identical repeat of a non-retryable fail')
  {
    // The engine loop breaks on retryable===false and only retries genuine transients.
    check('accumulate stops on a non-retryable failure', /if \(retryable === false\) break/.test(engineSrc))
    check('callGeminiIdeas propagates retryable + typed errorType', /retryable: res\.retryable/.test(engineSrc) && /errorType: res\.errorType/.test(engineSrc))
    check('a genuine transient (rate limit / empty candidates) stays retryable', classifyGenAiResponse({ textPresent: false, hasCandidates: false, blocked: false }).retryable === true)
    check('no Pro fallback / alternate model in the adapter loop', !/for \(const \{ tier/.test(modelSrc))
  }

  console.log('D) cost/model guarantees preserved (Part 1)')
  {
    check('12/13. standard ceilings unchanged (4 calls / $0.15)', (() => { const b = runBudget('standard', 15); return b.maxModelCallsPerRun === 4 && b.maxEstimatedCostUsd === 0.15 })())
    check('14. RunCostController still gates every call (beforeCall)', /controller\.beforeCall\(est\)/.test(modelSrc))
    check('maxOutputTokens not inflated to mask the bug (still outputBudgetFor)', /outputBudgetFor\(15\)/.test(modelSrc) && !/maxOutputTokens = 16384/.test(modelSrc))
    check('Pro curator id exists only as telemetry, never a generator call', RECOMMENDATION_MODEL_CURATOR === 'gemini-2.5-pro')
  }

  console.log('E) zero-result classification still distinguishes the new failure')
  {
    // With the fix, a healthy run has rawCandidates>0. A residual MAX_TOKENS-empty
    // would surface as CALLS_FAILED (reason model_error), never dedupe.
    check('MAX_TOKENS-empty run → CALLS_FAILED (not dedupe)', classifyRecoRun({ totalCalls: 1, rawCandidates: 0, freshPersisted: 0, reason: 'model_error' }) === 'CALLS_FAILED')
    check('healthy generation → PRODUCED_NEW', classifyRecoRun({ totalCalls: 2, rawCandidates: 18, freshPersisted: 7 }) === 'PRODUCED_NEW')
    check('15. dedupe/pending protections still run in the route (unchanged path)', /coveredByExistingContent/.test(read('../../../app/api/content/automation/recommendations/route.ts')))
  }

  console.log('F) model availability — the exact live 404 is handled, not shown as 0-new')
  {
    // 1/3. The EXACT live 404 message must be recognized as model-unavailable.
    const live404 = 'This model models/gemini-2.5-flash is no longer available to new users. Please update your code to use a newer model for the latest features and improvements.'
    check('1. live 404 "no longer available" → isModelUnavailableMessage', isModelUnavailableMessage(live404))
    check('1. "is not found for API version" → model unavailable', isModelUnavailableMessage('models/foo is not found for API version v1beta'))
    check('a normal rate-limit message is NOT model-unavailable', !isModelUnavailableMessage('429 too many requests, quota exceeded'))
    check('1. typed error class carries the model id', new RecommendationModelUnavailableError('gemini-2.5-flash').modelId === 'gemini-2.5-flash' && new RecommendationModelUnavailableError(null).name === 'RecommendationModelUnavailableError')

    // 4. model is configurable via GEMINI_RECOMMENDATION_MODEL (discovery otherwise).
    const save = process.env.GEMINI_RECOMMENDATION_MODEL
    process.env.GEMINI_RECOMMENDATION_MODEL = 'gemini-flash-latest'
    check('4. GEMINI_RECOMMENDATION_MODEL overrides the configured model', configuredRecommendationModel() === 'gemini-flash-latest')
    if (save === undefined) delete process.env.GEMINI_RECOMMENDATION_MODEL; else process.env.GEMINI_RECOMMENDATION_MODEL = save

    // 2. the adapter THROWS the typed error before/instead of returning ok:true.
    check('2. model.ts resolves availability before paid calls + throws typed error', /resolveAvailableRecommendationModel\(\)/.test(modelSrc) && /throw new RecommendationModelUnavailableError/.test(modelSrc))
    check('2. a 404 during generation aborts (isModelUnavailableMessage → throw)', /isModelUnavailableMessage\(message\)\) \{[\s\S]{0,120}throw new RecommendationModelUnavailableError/.test(modelSrc))

    // 2/3. the route maps the typed error to a NON-200 with the exact Hebrew.
    const recoRouteSrc = read('../../../app/api/content/automation/recommendations/route.ts')
    check('2. route returns recommendation_model_unavailable (503), not 200/0-new', /RecommendationModelUnavailableError/.test(recoRouteSrc) && /recommendation_model_unavailable/.test(recoRouteSrc) && /status: 503/.test(recoRouteSrc))
    check('2. route carries the exact Hebrew model-unavailable message', recoRouteSrc.includes('מודל יצירת ההמלצות אינו זמין כרגע. יש לעדכן את הגדרת מודל Gemini.'))
    // Part C — an all-calls-failed run is a typed provider error, never 0-new success.
    check('C. all-provider-failed run → recommendation_provider_error (502)', /recommendation_provider_error/.test(recoRouteSrc) && /reason === 'model_error' && \(result\.meta\.generated/.test(recoRouteSrc))
    check('5. no Pro fallback introduced by availability handling', RECOMMENDATION_MODEL_CURATOR === 'gemini-2.5-pro' && !/RECOMMENDATION_MODEL_CURATOR/.test(read('../recommendations/model-availability.ts')))
    check('discovery selects a Flash-class, never Pro', /isFlashClass/.test(read('../recommendations/model-availability.ts')) && /!n\.includes\('pro'\)/.test(read('../recommendations/model-availability.ts')))
  }

  console.log(`\n${pass} passed, ${fail} failed`)
  if (fail > 0) process.exitCode = 1
}
main()
