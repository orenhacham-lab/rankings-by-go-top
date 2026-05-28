/**
 * Server-side API route for generating AI questions with Gemini fallback
 *
 * Pipeline (single keyword):
 * 1. Validate request
 * 2. Analyze keyword signals (deterministic)
 * 3. Generate questions from templates
 * 4. If questions found, return them (do NOT call Gemini)
 * 5. If 0 questions, call Gemini as fallback (max 3 questions)
 * 6. Validate Gemini questions semantically
 * 7. Return safe questions or 0
 */

import { NextRequest, NextResponse } from 'next/server'
import { analyzeSelectedKeywordSignals } from '@/lib/ai-visibility/keyword-analysis'
import { generateKeywordResearchQuestions, toGeneratedQuestions, type GeneratedKRQuestion } from '@/lib/ai-visibility/keyword-research-question-generator'
import { detectCategory } from '@/lib/ai-visibility/prompt-templates'
import { classifyKeywordsWithGemini, isQuestionSemanticallyValid, generateFallbackQuestions, type FallbackQuestionResponse } from '@/lib/ai-visibility/gemini-semantic-classifier'

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
 * Uses normal generator first, Gemini fallback only if normal generator returns 0.
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

    // Step 1: Analyze keyword signals (deterministic)
    const analyses = analyzeSelectedKeywordSignals({
      selectedKeywords: [keyword],
      projectCategory,
      language,
    })

    // Step 2: Generate questions using existing generator
    const krQuestions = generateKeywordResearchQuestions(
      analyses,
      language,
      country
    )

    // Step 3: Convert to GeneratedQuestion format
    let generatedQuestions = toGeneratedQuestions(krQuestions)

    // Step 4: If normal generator found questions, return them (do NOT call Gemini)
    if (generatedQuestions.length > 0) {
      console.log(
        `[Keyword Research API] Generated ${generatedQuestions.length} questions from templates for "${keyword}"`
      )

      return NextResponse.json({
        questions: generatedQuestions,
        count: generatedQuestions.length,
        source: 'templates',
      })
    }

    // Step 5: No templates found, try Gemini fallback
    console.log(
      `[Keyword Research API] No template questions for "${keyword}", trying Gemini fallback...`
    )

    // Get semantic classification for this keyword
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

    // Call Gemini to generate fallback questions
    const fallbackResponses = await generateFallbackQuestions(
      keyword,
      semantic,
      language,
      country
    )

    if (!fallbackResponses || fallbackResponses.length === 0) {
      return NextResponse.json({
        questions: [],
        message: language === 'he'
          ? 'לא נמצאו שאלות AI איכותיות לביטוי זה.'
          : 'No high-quality AI questions found for this keyword.',
      })
    }

    // Step 6: Validate Gemini questions semantically and convert to GeneratedKRQuestion
    const analysis = analyses[0]
    const intentToType = (intent: string): 'price' | 'recommendation' | 'comparison' | 'info' => {
      switch (intent) {
        case 'commercial': return 'price'
        case 'pre_purchase': return 'recommendation'
        case 'comparison': return 'comparison'
        case 'brand': return 'recommendation'
        case 'informational':
        default: return 'info'
      }
    }

    const krQuestionList: GeneratedKRQuestion[] = []
    for (const fallbackResponse of fallbackResponses) {
      // Validate before including
      const isValid = isQuestionSemanticallyValid(
        fallbackResponse.question,
        keyword,
        semantic,
        language
      )

      if (isValid) {
        krQuestionList.push({
          question: fallbackResponse.question,
          type: intentToType(fallbackResponse.intent),
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

    // Convert to GeneratedQuestion format
    generatedQuestions = toGeneratedQuestions(krQuestionList)

    console.log(
      `[Keyword Research API] Generated ${generatedQuestions.length} fallback questions for "${keyword}" via Gemini`
    )

    return NextResponse.json({
      questions: generatedQuestions,
      count: generatedQuestions.length,
      source: 'gemini-fallback',
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
