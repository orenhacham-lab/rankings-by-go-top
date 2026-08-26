/**
 * Server-side API route for generating AI questions with Gemini semantic review
 *
 * Pipeline (single keyword):
 * 1. Validate request and single keyword
 * 2. Run normal generator for candidate questions
 * 3. Send keyword + candidates to Gemini for semantic review + repair
 * 4. Gemini returns max 3 final questions (can be valid candidates, repaired, or generated)
 * 5. Validate final questions semantically
 * 6. Return safe questions or 0
 *
 * Key: Gemini is NOT fallback-only. It reviews ALL candidates.
 * This catches semantically bad questions like "כמה עולה מיקרוגל מחסני חשמל?"
 */

import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { analyzeSelectedKeywordSignals } from '@/lib/ai-visibility/keyword-analysis'
import { generateKeywordResearchQuestions, toGeneratedQuestions, type GeneratedKRQuestion } from '@/lib/ai-visibility/keyword-research-question-generator'
import { detectCategory } from '@/lib/ai-visibility/prompt-templates'
import { classifyKeywordsWithGemini, isQuestionSemanticallyValid, reviewAndRepairQuestions } from '@/lib/ai-visibility/gemini-semantic-classifier'
import { authorizeAiQuestionGeneration } from '@/lib/ai-visibility/keyword-research-auth'

interface RequestBody {
  keyword: string
  projectId: string
  projectBusinessName?: string
  projectTargetDomain?: string
  language: 'he' | 'en'
  country?: string
}

/**
 * POST /api/keyword-research/generate-ai-questions
 *
 * Generates AI research questions for a single keyword.
 * Uses normal generator to create candidates, then Gemini reviews + repairs.
 */
export async function POST(request: NextRequest) {
  try {
    const body = (await request.json()) as RequestBody

    // Validate required fields
    if (!body.keyword || typeof body.keyword !== 'string') {
      return NextResponse.json(
        { error: 'Invalid request: keyword required' },
        { status: 400 }
      )
    }

    if (!body.projectId) {
      return NextResponse.json(
        { error: 'Invalid request: projectId required' },
        { status: 400 }
      )
    }

    // Security fix — this route previously ran with NO authentication or
    // ownership check at all: any caller could spend Gemini cost against
    // any projectId. Runs BEFORE any billable provider call
    // (classifyKeywordsWithGemini / reviewAndRepairQuestions) and before any
    // generation-state mutation. See lib/ai-visibility/keyword-research-auth.ts.
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()
    const admin = createAdminClient()
    const auth = await authorizeAiQuestionGeneration(admin, user?.id ?? null, body.projectId)
    if (!auth.ok) {
      return NextResponse.json(
        'reason' in auth ? { error: auth.error, reason: auth.reason } : { error: auth.error },
        { status: auth.status },
      )
    }

    if (!body.language || !['he', 'en'].includes(body.language)) {
      return NextResponse.json(
        { error: 'Invalid request: language must be "he" or "en"' },
        { status: 400 }
      )
    }

    const { keyword, language, country } = body
    const projectCategory = detectCategory(
      body.projectBusinessName || '',
      body.projectTargetDomain || '',
      []
    )

    // Step 1: Analyze keyword signals
    const analyses = analyzeSelectedKeywordSignals({
      selectedKeywords: [keyword],
      projectCategory,
      language,
    })

    // Step 2: Generate candidate questions using normal generator
    const krQuestions = generateKeywordResearchQuestions(
      analyses,
      language,
      country
    )

    // Step 3: Get semantic classification for this keyword
    const semanticMap = await classifyKeywordsWithGemini([keyword], language)
    const semantic = semanticMap.get(keyword)

    if (!semantic) {
      return NextResponse.json({
        questions: [],
        message: language === 'he'
          ? 'לא נמצאו שאלות AI איכותיות לביטוי זה.'
          : 'No high-quality AI questions found for this keyword.',
      })
    }

    // Step 4: Send candidates to Gemini for semantic review + repair
    const normalCandidates = krQuestions.map((q) => ({
      question: q.question,
      intent: intentFromType(q.type),
      source: 'normal_generator' as const,
    }))

    console.log(
      `[Keyword Research API] Sending ${normalCandidates.length} candidates to Gemini for review: "${keyword}"`
    )

    const finalQuestionResponses = await reviewAndRepairQuestions(
      keyword,
      semantic,
      normalCandidates,
      language,
      country
    )

    if (!finalQuestionResponses || finalQuestionResponses.length === 0) {
      return NextResponse.json({
        questions: [],
        message: language === 'he'
          ? 'לא נמצאו שאלות AI איכותיות לביטוי זה.'
          : 'No high-quality AI questions found for this keyword.',
      })
    }

    // Step 5: Validate final questions semantically and convert to GeneratedKRQuestion
    const analysis = analyses[0]
    const intentToType = (intent: string): 'price' | 'recommendation' | 'comparison' | 'info' => {
      switch (intent) {
        case 'commercial': return 'price'
        case 'pre_purchase': return 'recommendation'
        case 'comparison': return 'comparison'
        case 'brand': return 'recommendation'
        case 'informational':
        case 'local':
        default: return 'info'
      }
    }

    const krQuestionList: GeneratedKRQuestion[] = []
    for (const finalResponse of finalQuestionResponses) {
      // Validate before including
      const isValid = isQuestionSemanticallyValid(
        finalResponse.question,
        keyword,
        semantic,
        language
      )

      if (isValid) {
        krQuestionList.push({
          question: finalResponse.question,
          type: intentToType(finalResponse.intent),
          sourceKeyword: keyword,
          sourceType: analysis?.keywordType || 'informational',
          topic: null,
          confidence: semantic.confidence,
        })
      }
    }

    if (krQuestionList.length === 0) {
      return NextResponse.json({
        questions: [],
        message: language === 'he'
          ? 'לא נמצאו שאלות AI איכותיות לביטוי זה.'
          : 'No high-quality AI questions found for this keyword.',
      })
    }

    // Convert to GeneratedQuestion format for modal
    const generatedQuestions = toGeneratedQuestions(krQuestionList)

    console.log(
      `[Keyword Research API] Generated ${generatedQuestions.length} reviewed questions for "${keyword}"`
    )

    return NextResponse.json({
      questions: generatedQuestions,
      count: generatedQuestions.length,
    })
  } catch (err) {
    const errorMsg = err instanceof Error ? err.message : String(err)
    console.error(`[Keyword Research API] Error:`, errorMsg)

    return NextResponse.json(
      {
        error: 'Failed to generate AI questions',
        message: 'An error occurred while processing your request',
      },
      { status: 500 }
    )
  }
}

/**
 * Convert GeneratedKRQuestion type to intent string
 */
function intentFromType(type: 'price' | 'recommendation' | 'comparison' | 'info'): string {
  switch (type) {
    case 'price': return 'commercial'
    case 'recommendation': return 'pre_purchase'
    case 'comparison': return 'comparison'
    case 'info':
    default: return 'informational'
  }
}
