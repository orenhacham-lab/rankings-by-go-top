/**
 * ONE tracked AI-visibility question per generated article.
 *
 * When an article is generated (lib/content/article-generation.ts, the one
 * function every entry point funnels through: manual generate, the automation
 * queue and every retry), the project gets the question the article viewer's AI
 * card would suggest for it, already tracked:
 *
 *   - built from the article's primary keyword by the SAME template the card
 *     uses (lib/content/ai-query-suggestion.ts suggestAiQuery), in the project's
 *     language (the topic's language first, as the card reads it), so the card
 *     finds it and shows "tracked" instead of the one-click suggestion;
 *   - conversational and never naming the business (the template drops any
 *     question that names the brand, the project or its domain);
 *   - deduplicated against every question the project already has (paused ones
 *     too), by the same normalisation the question picker uses (case,
 *     punctuation and spacing aside), so two articles on one keyword add one
 *     question and a question the owner typed differently is not doubled;
 *   - linked to the article by its text only: ai_prompts has no column for the
 *     article, and this change adds no migration. The card finds its question by
 *     that text (sameQuestion), which is the whole link.
 *
 * WHAT IT NEVER DOES. It runs no check and calls no provider: adding a question
 * costs nothing by itself. A question is checked when the owner starts a check
 * (POST /api/ai-visibility/runs, one prompt x one engine per check,
 * quota-checked there), or by the ONE automatic call the owner approved on
 * 2026-09-29: the monthly AI check (lib/ai-visibility/monthly-check), which
 * checks a few top-worth tracked questions once per usage period from the 06:00
 * schedule cron, reserved through the same allowance as a manual check. No
 * other cron, queue or automation dispatches a check, and nothing here does
 * (runAIVisibilityScan has exactly those two callers). It writes one row,
 * owner-filtered, and never throws: a failure is an outcome, and generation
 * carries on.
 *
 * LIMITS. The plans have no maximum number of questions (lib/subscription.ts
 * PlanLimits counts checks, not questions). Automatic questions still stop at
 * AUTO_QUESTION_CAP active questions in the project, so a busy automation cannot
 * bury the owner's own list; past it nothing is added, silently, and the card
 * shows its one-click suggestion as before. The owner's own additions are not
 * limited here.
 */
import type { createAdminClient } from '@/lib/supabase/admin'
import { suggestAiQuery, suggestionLanguage, type SuggestionLanguage } from '@/lib/content/ai-query-suggestion'

type Admin = ReturnType<typeof createAdminClient>

/** Active questions past which no question is added automatically. */
export const AUTO_QUESTION_CAP = 30
/** How many of the project's questions are read to deduplicate against. */
export const EXISTING_READ_LIMIT = 1000

/** The question picker's normalisation (PromptSuggestions normalizePrompt), for comparing two questions. */
export function normalizeQuestion(text: string | null | undefined): string {
  return String(text ?? '')
    .toLowerCase()
    .replace(/[?!.,;:'"״׳`\-–—؟،]/g, '')
    .replace(/\s+/g, ' ')
    .trim()
}

/** Whether two questions are the same question. */
export function sameQuestion(a: string | null | undefined, b: string | null | undefined): boolean {
  const x = normalizeQuestion(a)
  return x.length > 0 && x === normalizeQuestion(b)
}

export type ArticleQuestionOutcome =
  | 'added'
  | 'already_tracked'
  | 'no_question'
  | 'at_limit'
  | 'disabled'
  | 'project_not_found'
  | 'failed'

type ProjectRow = {
  id: string
  user_id: string
  name: string | null
  business_name: string | null
  target_domain: string | null
  country: string | null
  language: string | null
}

/** The question an article of this project gets, exactly as the article viewer's card builds it. */
export function articleQuestion(
  project: Pick<ProjectRow, 'name' | 'business_name' | 'target_domain' | 'language'> | null,
  topic: { primary_keyword?: string | null; language?: string | null } | null,
  title: string | null,
): { prompt: string; language: SuggestionLanguage } | null {
  const language = suggestionLanguage(topic?.language || project?.language || '')
  const prompt = suggestAiQuery({
    keyword: topic?.primary_keyword,
    title,
    language,
    brandTerms: [project?.business_name, project?.name, project?.target_domain],
  })
  return prompt ? { prompt, language } : null
}

/**
 * Track the article's question for its project, once. `userId` is the project
 * owner the caller already verified; the project is read filtered by it too.
 */
export async function trackArticleQuestion(
  admin: Admin,
  input: {
    projectId: string
    userId: string
    title: string | null
    topic: { primary_keyword?: string | null; language?: string | null } | null
  },
  env: Record<string, string | undefined> = process.env,
): Promise<{ outcome: ArticleQuestionOutcome; prompt?: string }> {
  if (env.ENABLE_AI_VISIBILITY !== 'true') return { outcome: 'disabled' }
  try {
    const { data: projectData, error: projectError } = await admin
      .from('projects')
      .select('id, user_id, name, business_name, target_domain, country, language')
      .eq('id', input.projectId)
      .eq('user_id', input.userId)
      .maybeSingle()
    const project = projectData as ProjectRow | null
    if (projectError || !project || project.user_id !== input.userId) return { outcome: 'project_not_found' }

    const question = articleQuestion(project, input.topic, input.title)
    if (!question) return { outcome: 'no_question' }

    const { data: existingData, error: existingError } = await admin
      .from('ai_prompts')
      .select('id, prompt, is_active')
      .eq('project_id', project.id)
      .limit(EXISTING_READ_LIMIT)
    if (existingError) return { outcome: 'failed' }
    const existing = (existingData as { id: string; prompt: string | null; is_active: boolean | null }[] | null) ?? []
    // Paused questions count too: the owner already has that question.
    if (existing.some((row) => sameQuestion(row.prompt, question.prompt))) return { outcome: 'already_tracked', prompt: question.prompt }
    if (existing.filter((row) => row.is_active !== false).length >= AUTO_QUESTION_CAP) return { outcome: 'at_limit', prompt: question.prompt }

    // The same fields the card's "track" sends to the prompt route, from the project's own settings.
    const { error: insertError } = await admin.from('ai_prompts').insert({
      project_id: project.id,
      prompt: question.prompt,
      target_domain: project.target_domain || null,
      target_brand_name: project.business_name || project.name || null,
      country: project.country || null,
      language: question.language,
      is_active: true,
    })
    if (insertError) return { outcome: 'failed' }
    return { outcome: 'added', prompt: question.prompt }
  } catch {
    return { outcome: 'failed' }
  }
}
