/**
 * "כתוב מאמר שיענה על השאלה": a suggested AI question becomes a content topic,
 * and the question then shows how far that went.
 *
 * The topic is created through the content module's own route (POST
 * /api/content/topics, owner-checked, status 'suggested'); nothing here calls a
 * model or writes an article. The topic's text IS the question, which is how the
 * question finds its topic again (normalized match), with no new column.
 */
import type { SearchIntent } from '@/lib/content/topic-brief'
import type { QuestionWorth } from './question-worth'

export type ContextTopic = { id: string; topic: string; status: string; article: { id: string; status: string } | null }

/** Furthest first: cited by an AI engine, published, written, topic created, nothing yet. */
export type QuestionArticleStatus = 'cited' | 'published' | 'written' | 'topic' | 'none'

export function normalizeQuestion(text: string): string {
  return text.trim().toLowerCase().replace(/\s+/g, ' ').replace(/[?؟.!,;״"׳']+/gu, '').trim()
}

export function findQuestionTopic(question: string, topics: readonly ContextTopic[]): ContextTopic | null {
  const key = normalizeQuestion(question)
  return topics.find((t) => t.status !== 'rejected' && normalizeQuestion(t.topic) === key) ?? null
}

export function questionArticleStatus(
  question: string,
  topics: readonly ContextTopic[],
  citedQuestions: ReadonlySet<string>,
): { status: QuestionArticleStatus; topic: ContextTopic | null } {
  const topic = findQuestionTopic(question, topics)
  if (citedQuestions.has(normalizeQuestion(question))) return { status: 'cited', topic }
  if (!topic) return { status: 'none', topic: null }
  const a = topic.article?.status
  if (a === 'published') return { status: 'published', topic }
  if (a) return { status: 'written', topic }
  return { status: 'topic', topic }
}

const INTENT: Record<string, SearchIntent> = {
  commercial: 'commercial', transactional: 'transactional', gift: 'commercial', comparison: 'comparison',
  alternatives: 'comparison', local: 'local', informational: 'informational', recommendation: 'commercial',
  pre_purchase: 'commercial', brand: 'other',
}

/** The body for POST /api/content/topics. `note` is the writer's instruction, in the project's language. */
export function topicBriefForQuestion(input: {
  projectId: string
  question: string
  intent: string
  language: 'he' | 'en'
  worth: QuestionWorth | null | undefined
  note: string
}) {
  const keyword = input.worth?.why.relevance.kind === 'keyword' ? input.worth.why.relevance.term : null
  return {
    projectId: input.projectId,
    topic: input.question.trim().slice(0, 300),
    primary_keyword: keyword ?? input.question.trim().slice(0, 120),
    search_intent: INTENT[input.intent] ?? 'informational',
    language: input.language,
    brief_notes: input.note,
  }
}
