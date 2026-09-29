/**
 * The server side of the article viewer's "Schema" tab and "AI visibility" card,
 * and of the webhook payload's structured_data.
 *
 * Every read here is scoped to a project the CALLER has already proven the user
 * owns (authContentProject) — the service-role client bypasses RLS, so each
 * query filters by that project id explicitly.
 *
 * Nothing here spends anything: no AI check, no provider call, no usage
 * reservation, no write. The suggested question is a template
 * (ai-query-suggestion.ts). Generating the article already tracks it
 * (lib/ai-visibility/article-question.ts), and the card then says so; when it
 * could not (no AI visibility, the automatic cap), tracking it is a click on the
 * existing prompt route.
 */
import type { createAdminClient } from '@/lib/supabase/admin'
import { matchArticleCitations, publishedUrlOf, citedArticles, type CitationMatch, type StoredCitation } from './citation-match'
import { suggestAiQuery } from './ai-query-suggestion'
import { sameQuestion } from '@/lib/ai-visibility/article-question'
import { siteUrlFromDomain } from './structured-data'
import { readProjectSameAs } from './article-style/store'

type Admin = ReturnType<typeof createAdminClient>

/** How many recent citation rows are read per project. A bounded read, newest first. */
export const CITATION_READ_LIMIT = 2000

export interface SchemaContext {
  publisherName: string | null
  publisherUrl: string | null
  language: 'he' | 'en'
  /** The business's official profiles (project settings), for the publisher's sameAs. */
  sameAs: string[]
}

export interface ProjectFacts {
  name: string | null
  business_name: string | null
  target_domain: string | null
  country: string | null
  language: string | null
}

export async function loadProjectFacts(admin: Admin, projectId: string): Promise<ProjectFacts | null> {
  try {
    const { data } = await admin.from('projects')
      .select('name, business_name, target_domain, country, language')
      .eq('id', projectId).maybeSingle()
    return (data as ProjectFacts | null) ?? null
  } catch {
    return null
  }
}

export async function loadTopicFacts(admin: Admin, topicId: string | null | undefined): Promise<{ primary_keyword: string | null; language: string | null } | null> {
  if (!topicId) return null
  try {
    const { data } = await admin.from('article_topics').select('primary_keyword, language').eq('id', topicId).maybeSingle()
    return (data as { primary_keyword: string | null; language: string | null } | null) ?? null
  } catch {
    return null
  }
}

export function schemaContextFrom(project: ProjectFacts | null, topicLanguage: string | null | undefined, sameAs: string[] = []): SchemaContext {
  const lang = String(topicLanguage || project?.language || '').toLowerCase().startsWith('en') ? 'en' : 'he'
  const name = String(project?.business_name || project?.name || '').trim() || null
  return { publisherName: name, publisherUrl: siteUrlFromDomain(project?.target_domain), language: lang, sameAs }
}

/** The schema context of one article of `projectId` (owner already verified by the caller). */
export async function loadSchemaContext(admin: Admin, projectId: string, topicId: string | null | undefined): Promise<SchemaContext> {
  const [project, topic, sameAs] = await Promise.all([loadProjectFacts(admin, projectId), loadTopicFacts(admin, topicId), readProjectSameAs(admin, projectId)])
  return schemaContextFrom(project, topic?.language, sameAs)
}

/** Recent stored citations of the project. A missing table or a failed read is "none", never an error text. */
export async function loadProjectCitations(admin: Admin, projectId: string): Promise<{ rows: StoredCitation[]; ok: boolean }> {
  try {
    const { data, error } = await admin.from('ai_citations')
      .select('engine, url, prompt_id, created_at')
      .eq('project_id', projectId)
      .order('created_at', { ascending: false })
      .limit(CITATION_READ_LIMIT)
    if (error) return { rows: [], ok: false }
    return { rows: (data as StoredCitation[] | null) ?? [], ok: true }
  } catch {
    return { rows: [], ok: false }
  }
}

async function loadQuestions(admin: Admin, projectId: string, ids: string[]): Promise<Record<string, string>> {
  if (ids.length === 0) return {}
  try {
    const { data } = await admin.from('ai_prompts').select('id, prompt').eq('project_id', projectId).in('id', ids)
    const out: Record<string, string> = {}
    for (const r of (data as { id: string; prompt: string | null }[] | null) ?? []) if (r.prompt) out[r.id] = r.prompt
    return out
  } catch {
    return {}
  }
}

export interface ArticleVisibility {
  publishedUrl: string | null
  schema: SchemaContext
  citations: CitationMatch[]
  citationsAvailable: boolean
  aiVisibilityEnabled: boolean
  suggestion: null | {
    prompt: string
    tracked: boolean
    /** What the existing prompt route takes, from the project's own settings. */
    track: { country: string | null; language: string; targetDomain: string | null; targetBrandName: string | null }
  }
}

export interface VisibilityArticle {
  id: string
  project_id: string
  topic_id: string | null
  title: string | null
  status: string | null
  wp_post_url?: string | null
  shopify_article_url?: string | null
  site_post_url?: string | null
}

export async function loadArticleVisibility(admin: Admin, article: VisibilityArticle, opts: { aiVisibilityEnabled: boolean }): Promise<ArticleVisibility> {
  const projectId = article.project_id
  const [project, topic, sameAs] = await Promise.all([loadProjectFacts(admin, projectId), loadTopicFacts(admin, article.topic_id), readProjectSameAs(admin, projectId)])
  const schema = schemaContextFrom(project, topic?.language, sameAs)
  const publishedUrl = publishedUrlOf(article)

  let citations: CitationMatch[] = []
  let citationsAvailable = true
  if (publishedUrl) {
    const stored = await loadProjectCitations(admin, projectId)
    citationsAvailable = stored.ok
    const firstPass = matchArticleCitations(publishedUrl, stored.rows, {})
    if (firstPass.length > 0) {
      const promptIds = [...new Set(stored.rows.map((r) => r.prompt_id).filter((x): x is string => !!x))]
      const questions = await loadQuestions(admin, projectId, promptIds.slice(0, 200))
      citations = matchArticleCitations(publishedUrl, stored.rows, questions).slice(0, 10)
    }
  }

  // The article's question (lib/ai-visibility/article-question.ts adds it, tracked,
  // when the article is generated): shown as "tracked" once the project has it,
  // draft or not; otherwise offered with one click once the article is live.
  let suggestion: ArticleVisibility['suggestion'] = null
  const brandTerms = [project?.business_name, project?.name, project?.target_domain]
  const prompt = suggestAiQuery({ keyword: topic?.primary_keyword, title: article.title, language: schema.language, brandTerms })
  if (prompt) {
    let tracked = false
    if (opts.aiVisibilityEnabled) {
      try {
        const { data } = await admin.from('ai_prompts').select('prompt').eq('project_id', projectId).limit(1000)
        tracked = Array.isArray(data) && (data as { prompt: string | null }[]).some((r) => sameQuestion(r.prompt, prompt))
      } catch { tracked = false }
    }
    if (tracked || publishedUrl || article.status === 'published') {
      suggestion = {
        prompt,
        tracked,
        track: {
          country: project?.country ?? null,
          language: schema.language,
          targetDomain: project?.target_domain ?? null,
          targetBrandName: project?.business_name ?? project?.name ?? null,
        },
      }
    }
  }

  return { publishedUrl, schema, citations, citationsAvailable, aiVisibilityEnabled: opts.aiVisibilityEnabled, suggestion }
}

/** For the Articles screen: which published articles of the project are cited, and by which engines. */
export async function loadProjectCitedArticles(admin: Admin, projectId: string): Promise<Record<string, string[]>> {
  try {
    const read = (cols: string) => admin.from('generated_articles').select(cols).eq('project_id', projectId).eq('status', 'published')
    let { data, error } = await read('id, status, wp_post_url, shopify_article_url, site_post_url')
    // A database without the site-platform columns yet: the WordPress and Shopify URLs still count.
    if (error) ({ data, error } = await read('id, status, wp_post_url, shopify_article_url'))
    if (error) return {}
    const articles = ((data as (VisibilityArticle & { id: string })[] | null) ?? [])
      .map((a) => ({ id: a.id, url: publishedUrlOf(a) }))
      .filter((a) => !!a.url)
    if (articles.length === 0) return {}
    const stored = await loadProjectCitations(admin, projectId)
    return citedArticles(articles, stored.rows)
  } catch {
    return {}
  }
}
