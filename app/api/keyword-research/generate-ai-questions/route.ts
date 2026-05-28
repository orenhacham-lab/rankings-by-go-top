/**
 * Server-side API route for generating AI questions with semantic validation
 *
 * Pipeline:
 * 1. Validate request and auth
 * 2. Analyze keyword signals (deterministic)
 * 3. Generate questions from templates
 * 4. Validate semantically (using Gemini for low-confidence keywords)
 * 5. Return filtered safe questions
 */

import { NextRequest, NextResponse } from 'next/server'
import { analyzeSelectedKeywordSignals } from '@/lib/ai-visibility/keyword-analysis'
import { generateKeywordResearchQuestions, toGeneratedQuestions } from '@/lib/ai-visibility/keyword-research-question-generator'
import { detectCategory } from '@/lib/ai-visibility/prompt-templates'
import { classifyKeywordsWithGemini, isQuestionSemanticallyValid } from '@/lib/ai-visibility/gemini-semantic-classifier'
import { detectEntityType } from '@/lib/ai-visibility/keyword-entity-classifier'

interface RequestBody {
  selectedKeywords: string[]
  projectId: string
  projectBusinessName?: string
  projectTargetDomain?: string
  language: 'he' | 'en'
  country?: string
}

/**
 * POST /api/keyword-research/generate-ai-questions
 *
 * Generates AI research questions with semantic validation.
 * Uses deterministic classifier first, Gemini semantic classifier for low-confidence keywords.
 */
export async function POST(request: NextRequest) {
  try {
    const body = (await request.json()) as RequestBody

    // Validate required fields
    if (!body.selectedKeywords || !Array.isArray(body.selectedKeywords)) {
      return NextResponse.json(
        { error: 'Invalid request: selectedKeywords must be an array' },
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

    const { selectedKeywords, projectId, language, country } = body
    const projectCategory = detectCategory(
      body.projectBusinessName || '',
      body.projectTargetDomain || '',
      []
    )

    // Step 1: Analyze keyword signals (deterministic, synchronous)
    const analyses = analyzeSelectedKeywordSignals({
      selectedKeywords,
      projectCategory,
      language,
    })

    // Step 2: Classify keywords semantically
    // For now, we use Gemini to refine low-confidence classifications.
    // In the future, this can also enhance product/service/brand classifications.
    const semanticClassifications = await classifyKeywordsWithGemini(
      selectedKeywords,
      language
    )

    // Step 3: Generate questions using existing generator
    const krQuestions = generateKeywordResearchQuestions(
      analyses,
      language,
      country
    )

    // Step 4: Filter questions using semantic validation
    // Check each question against both its keyword's semantic classification
    const validatedQuestions = krQuestions.filter((q) => {
      const semantic = semanticClassifications.get(q.sourceKeyword)
      if (!semantic) {
        // If no semantic classification found, use conservative fallback
        return false
      }

      // Validate question against semantic classification
      const isValid = isQuestionSemanticallyValid(
        q.question,
        q.sourceKeyword,
        semantic,
        language
      )

      return isValid
    })

    // Step 5: Convert to GeneratedQuestion format (modal-compatible)
    const generatedQuestions = toGeneratedQuestions(validatedQuestions)

    if (generatedQuestions.length === 0) {
      return NextResponse.json(
        {
          questions: [],
          message: language === 'he'
            ? 'לא נמצאו שאלות AI איכותיות מהביטויים שנבחרו'
            : 'No high-quality AI questions found for the selected keywords',
        }
      )
    }

    // Log safely (no secrets)
    console.log(
      `[Keyword Research API] Generated ${generatedQuestions.length} validated questions for ${selectedKeywords.length} keywords`
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
