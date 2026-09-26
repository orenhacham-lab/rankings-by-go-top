/**
 * Shared data model for the /content workspace screens.
 *
 * These types used to live inside ContentHub.tsx, the single 1,325-line component
 * that held articles, topics, automation, Search Console and the platform
 * connections in one screen. They are declared here so every screen that reads
 * /api/content/overview sees exactly the same shape.
 */

export type ProjectOption = { id: string; name: string; business_name: string | null; target_domain: string | null; language: string | null }

export type Counts = {
  total: number; draft: number; ready: number; scheduled: number
  publishing: number; published: number; failed: number
}

export type ArticleRow = {
  id: string; topic_id: string | null; title: string; slug: string; status: string
  wp_post_id: number | null; wp_post_url: string | null; wp_featured_media_id: number | null
  featured_image_url: string | null
  scheduled_at: string | null; published_at: string | null
  created_at: string; updated_at: string
  shopify_article_id?: string | null; shopify_article_url?: string | null; shopify_status?: string | null; shopify_blog_id?: string | null
}

export type ActivePlatform = 'wordpress' | 'shopify' | 'conflict' | 'none'

export type Overview = {
  projects: ProjectOption[]
  selected: string | null
  counts: Counts | null
  articles: ArticleRow[]
  wordpress: { connected: boolean; siteUrl: string | null; status: string | null } | null
  shopify?: { connected: boolean; shopDomain: string | null; status: string | null; canPublish: boolean; defaultBlogId: string | null } | null
  platform?: { platform: ActivePlatform; shopifyNeedsScope?: boolean } | null
}

export const STATUS_TONE: Record<string, 'neutral' | 'info' | 'warning' | 'success' | 'danger'> = {
  draft: 'neutral',
  ready: 'info',
  scheduled: 'warning',
  publishing: 'warning',
  published: 'success',
  failed: 'danger',
}

/**
 * How many topics / articles one client-side batch may process. One constant, so the
 * topics screen and the articles screen cannot drift into two different limits.
 */
export const BATCH_LIMIT = 10
