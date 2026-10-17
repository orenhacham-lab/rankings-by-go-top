/**
 * GET /api/content/articles/:id/visibility
 *
 * What the article viewer needs for its Schema tab and its AI-visibility card:
 *   - the publisher facts and language the JSON-LD builder takes (the builder
 *     itself runs in the browser, over the fields being edited);
 *   - the article's live URL and publication dates;
 *   - the stored AI citations whose URL is this article's live URL (never an
 *     inferred one), with engine and question;
 *   - one suggested AI question from a template, and whether it is tracked.
 *
 * Read-only and free: no AI check, no provider call, no usage reservation and
 * no write happens here. Tracking the suggestion is a separate click that goes
 * through the existing /api/ai-visibility/prompts route.
 *
 * Auth: the user must own the article's project (authContentProject); every
 * service-role read below is filtered by that project id.
 */
import { authContentProject, isContentModuleEnabled } from '@/lib/content/api-auth'
import { createAdminClient } from '@/lib/supabase/admin'
import { loadArticleVisibility, type VisibilityArticle } from '@/lib/content/article-visibility'

const COLUMNS = 'id, project_id, topic_id, title, status, published_at, updated_at, wp_post_url, shopify_article_url'

export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  if (!isContentModuleEnabled()) return Response.json({ error: 'Not found' }, { status: 404 })
  const { id } = await params
  if (!id) return Response.json({ error: 'Not found' }, { status: 404 })

  const admin = createAdminClient()
  const { data: found } = await admin.from('generated_articles').select('id, project_id').eq('id', id).maybeSingle()
  const projectId = (found as { project_id?: string } | null)?.project_id
  if (!projectId) return Response.json({ error: 'Article not found' }, { status: 404 })

  const auth = await authContentProject(projectId)
  if ('error' in auth) return Response.json({ error: auth.error }, { status: auth.status })

  // The owner's article, read again scoped to the verified project.
  const scoped = (cols: string) => auth.admin.from('generated_articles').select(cols).eq('id', id).eq('project_id', auth.project.id).maybeSingle()
  let { data, error } = await scoped(`${COLUMNS}, site_post_url`)
  // A database without the site-platform columns yet.
  if (error) ({ data, error } = await scoped(COLUMNS))
  if (error || !data) return Response.json({ error: 'Article not found' }, { status: 404 })
  const article = data as unknown as VisibilityArticle & { published_at: string | null; updated_at: string | null }

  const visibility = await loadArticleVisibility(auth.admin, article, { aiVisibilityEnabled: process.env.ENABLE_AI_VISIBILITY === 'true' })
  return Response.json({
    ...visibility,
    dates: { published: article.published_at ?? null, modified: article.updated_at ?? null },
  })
}
