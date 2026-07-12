export type Json = string | number | boolean | null | { [key: string]: Json | undefined } | Json[]

export interface Database {
  public: {
    Tables: {
      clients: {
        Row: Client
        Insert: Omit<Client, 'id' | 'created_at' | 'updated_at'>
        Update: Partial<Omit<Client, 'id' | 'created_at'>>
      }
      projects: {
        Row: Project
        Insert: Omit<Project, 'id' | 'created_at' | 'updated_at'>
        Update: Partial<Omit<Project, 'id' | 'created_at'>>
      }
      tracking_targets: {
        Row: TrackingTarget
        Insert: Omit<TrackingTarget, 'id' | 'created_at' | 'updated_at'>
        Update: Partial<Omit<TrackingTarget, 'id' | 'created_at'>>
      }
      scans: {
        Row: Scan
        Insert: Omit<Scan, 'id' | 'created_at'>
        Update: Partial<Omit<Scan, 'id' | 'created_at'>>
      }
      scan_results: {
        Row: ScanResult
        Insert: Omit<ScanResult, 'id' | 'created_at'>
        Update: Partial<Omit<ScanResult, 'id' | 'created_at'>>
      }
      ai_prompts: {
        Row: AIPrompt
        Insert: Omit<AIPrompt, 'id' | 'created_at' | 'updated_at'>
        Update: Partial<Omit<AIPrompt, 'id' | 'created_at'>>
      }
      ai_scan_runs: {
        Row: AIScanRun
        Insert: Omit<AIScanRun, 'id' | 'created_at'>
        Update: Partial<Omit<AIScanRun, 'id' | 'created_at'>>
      }
      ai_scan_results: {
        Row: AIScanResult
        Insert: Omit<AIScanResult, 'id' | 'created_at'>
        Update: Partial<Omit<AIScanResult, 'id' | 'created_at'>>
      }
      ai_citations: {
        Row: AICitation
        Insert: Omit<AICitation, 'id' | 'created_at'>
        Update: Partial<Omit<AICitation, 'id' | 'created_at'>>
      }
      ai_visibility_competitors: {
        Row: AIVisibilityCompetitor
        Insert: Omit<AIVisibilityCompetitor, 'id' | 'created_at' | 'updated_at'>
        Update: Partial<Omit<AIVisibilityCompetitor, 'id' | 'created_at'>>
      }
      wordpress_connections: {
        Row: WordPressConnection
        Insert: Omit<WordPressConnection, 'id' | 'created_at' | 'updated_at'>
        Update: Partial<Omit<WordPressConnection, 'id' | 'created_at'>>
      }
      article_topics: {
        Row: ArticleTopic
        Insert: Omit<ArticleTopic, 'id' | 'created_at' | 'updated_at'>
        Update: Partial<Omit<ArticleTopic, 'id' | 'created_at'>>
      }
      generated_articles: {
        Row: GeneratedArticle
        Insert: Omit<GeneratedArticle, 'id' | 'created_at' | 'updated_at'>
        Update: Partial<Omit<GeneratedArticle, 'id' | 'created_at'>>
      }
      article_pools: {
        Row: ArticlePool
        Insert: Omit<ArticlePool, 'id' | 'created_at' | 'updated_at'>
        Update: Partial<Omit<ArticlePool, 'id' | 'created_at'>>
      }
      article_pool_items: {
        Row: ArticlePoolItem
        Insert: Omit<ArticlePoolItem, 'id' | 'created_at' | 'updated_at'>
        Update: Partial<Omit<ArticlePoolItem, 'id' | 'created_at'>>
      }
      ai_usage_logs: {
        Row: AIUsageLog
        Insert: Omit<AIUsageLog, 'id' | 'created_at' | 'updated_at'>
        Update: Partial<Omit<AIUsageLog, 'id' | 'created_at'>>
      }
      content_automation_alerts: {
        Row: ContentAutomationAlert
        Insert: Partial<Omit<ContentAutomationAlert, 'id' | 'created_at'>> & { dedupe_key: string; user_id: string; project_id: string }
        Update: Partial<Omit<ContentAutomationAlert, 'id' | 'created_at'>>
      }
      article_inline_images: {
        Row: ArticleInlineImage
        Insert: Partial<Omit<ArticleInlineImage, 'id' | 'created_at' | 'updated_at'>> & { user_id: string; project_id: string; article_id: string; section_id: string }
        Update: Partial<Omit<ArticleInlineImage, 'id' | 'created_at'>>
      }
    }
  }
}

// Phase 4D — persisted editable inline article image (owner/project scoped).
// Rows are the source of truth; they are NOT baked into content_html. The
// <figure> is composed on demand for editor preview and WordPress publish.
export interface ArticleInlineImage {
  id: string
  user_id: string
  project_id: string
  article_id: string
  section_id: string
  prompt: string | null
  alt_text: string | null
  caption: string | null
  storage_url: string | null
  storage_path: string | null
  wp_media_id: number | null
  wp_media_url: string | null
  position: number
  status: 'pending' | 'generating' | 'ready' | 'failed' | 'uploading' | 'uploaded'
  last_error: string | null
  created_at: string
  updated_at: string
}

// Phase 4B.1 — persisted content-automation failure alert (in-app, owner-scoped).
export interface ContentAutomationAlert {
  id: string
  user_id: string
  project_id: string
  pool_item_id: string | null
  article_id: string | null
  topic_id: string | null
  kind: string
  dedupe_key: string
  title: string | null
  error: string | null
  attempts: number
  status: 'open' | 'resolved' | 'dismissed'
  created_at: string
  updated_at: string
  resolved_at: string | null
}

export interface Client {
  id: string
  name: string
  contact_name: string | null
  email: string | null
  phone: string | null
  notes: string | null
  is_active: boolean
  created_at: string
  updated_at: string
}

export interface Project {
  id: string
  client_id: string
  name: string
  target_domain: string
  business_name: string | null
  // AI Visibility — extra aliases used to recognise the business / site in AI
  // answers and their source lists. Default to empty arrays.
  brand_aliases?: string[]
  domain_aliases?: string[]
  country: string
  language: string
  city: string | null
  device_type: 'desktop' | 'mobile' | null
  is_active: boolean
  scan_frequency: 'manual' | 'weekly' | 'monthly' | 'monthly_first_day'
  auto_scan_enabled: boolean
  next_scan_at: string | null
  last_scan_at: string | null
  created_at: string
  updated_at: string
  // joins
  clients?: Client
}

export type EngineType = 'google_search' | 'google_maps'
export type LocationMode = 'project' | 'custom' | 'zip' | 'exact_point' | 'radius'
export type GridSize = 'small' | 'medium' | 'large'
export type ExactPointResolutionSource =
  | 'user_provided_coordinates'
  | 'geocoded_google'
  | 'geocoded_nominatim'

export interface TrackingTarget {
  id: string
  project_id: string
  keyword: string
  engine_type: EngineType
  target_domain: string | null
  target_business_name: string | null
  preferred_landing_page: string | null
  notes: string | null
  is_active: boolean
  location_mode: LocationMode
  custom_city: string | null
  grid_size: GridSize | null
  postal_code: string | null
  radius_miles: number | null
  radius_center_zip: string | null
  exact_address_input: string | null
  exact_resolved_lat: number | null
  exact_resolved_lng: number | null
  exact_resolution_source: ExactPointResolutionSource | null
  exact_geocoding_provider: string | null
  avg_monthly_searches: number | null
  competition: 'LOW' | 'MEDIUM' | 'HIGH' | null
  competition_index: number | null
  low_top_of_page_bid: number | null
  high_top_of_page_bid: number | null
  metrics_currency: string | null
  metrics_updated_at: string | null
  created_at: string
  updated_at: string
  // joins
  projects?: Project
}

export type ScanStatus = 'pending' | 'running' | 'completed' | 'failed'

export interface Scan {
  id: string
  project_id: string
  status: ScanStatus
  triggered_by: 'manual' | 'scheduled'
  total_targets: number
  completed_targets: number
  failed_targets: number
  started_at: string | null
  completed_at: string | null
  error_message: string | null
  created_at: string
  // joins
  projects?: Project
}

export interface ScanResult {
  id: string
  scan_id: string
  tracking_target_id: string
  engine_type: EngineType
  keyword: string
  found: boolean
  position: number | null
  previous_position: number | null
  change_value: number | null
  result_url: string | null
  result_title: string | null
  result_address: string | null
  checked_at: string
  error_message: string | null
  audit_request: Json | null
  audit_response: Json | null
  audit_decision: Json | null
  audit_scanner_version: string | null
  created_at: string
  // joins
  tracking_targets?: TrackingTarget
  scans?: Scan
}

export interface Profile {
  id: string
  role: string
  created_at: string
  updated_at: string
}

export type SubscriptionPlan = 'regular' | 'advanced' | 'premium' | 'large_agency'
export type SubscriptionStatus = 'trial' | 'active' | 'inactive' | 'cancelled' | 'expired'

export interface Subscription {
  id: string
  user_id: string
  plan: SubscriptionPlan
  status: SubscriptionStatus
  paypal_subscription_id: string | null
  trial_ends_at: string | null
  current_period_start: string | null
  current_period_end: string | null
  scans_this_period: number
  scans_period_key: string | null
  created_at: string
  updated_at: string
}

export interface RankingSummary {
  tracking_target_id: string
  keyword: string
  engine_type: EngineType
  latest_position: number | null
  previous_position: number | null
  change_value: number | null
  best_position: number | null
  worst_position: number | null
  last_checked_at: string | null
  found: boolean
}

// =============================================================================
// AI Visibility Module
// =============================================================================

export type AIEngine =
  | 'google_ai_overview'
  | 'chatgpt'
  | 'perplexity'
  | 'gemini'
  | 'copilot'
  | 'claude'
  | 'grok'

export type AIProvider = 'scrapellm'

export type AIScanRunStatus = 'pending' | 'running' | 'completed' | 'failed' | 'partial'

export type AIScanResultStatus = 'pending' | 'success' | 'error'

export interface AIPrompt {
  id: string
  project_id: string
  prompt: string
  target_domain: string | null
  target_brand_name: string | null
  country: string | null
  language: string | null
  is_active: boolean
  created_at: string
  updated_at: string
  // joins
  projects?: Project
}

export interface AIScanRun {
  id: string
  project_id: string
  user_id: string | null
  provider: AIProvider
  status: AIScanRunStatus
  triggered_by: string | null
  total_prompts: number | null
  total_engines: number | null
  total_tasks: number | null
  completed_tasks: number
  failed_tasks: number
  total_credits_used: number
  started_at: string | null
  completed_at: string | null
  error_message: string | null
  created_at: string
  // joins
  projects?: Project
}

export interface AIScanResult {
  id: string
  run_id: string
  project_id: string
  prompt_id: string | null
  engine: AIEngine
  provider: AIProvider
  mentioned: boolean
  target_cited: boolean
  mention_positions: Json | null
  citation_count: number
  source_count: number
  competitors_mentioned: Json | null
  response_text: string | null
  response_summary: string | null
  raw_response: Json | null
  visibility_score: number | null
  credits_used: number
  status: AIScanResultStatus | null
  error_message: string | null
  scanned_at: string | null
  created_at: string
  // joins
  ai_scan_runs?: AIScanRun
  ai_prompts?: AIPrompt
}

export interface AICitation {
  id: string
  result_id: string
  project_id: string
  prompt_id: string | null
  engine: AIEngine
  provider: AIProvider
  url: string
  domain: string
  title: string | null
  snippet: string | null
  citation_position: number | null
  is_target_domain: boolean
  created_at: string
  // joins
  ai_scan_results?: AIScanResult
}

export interface AIVisibilityCompetitor {
  id: string
  user_id: string
  project_id: string
  name: string
  domain: string | null
  aliases: string[]
  is_active: boolean
  created_at: string
  updated_at: string
}

// ============================================================================
// Content module (Phase 1) — per-project articles + WordPress publishing.
// NOTE: generated_articles is distinct from the global marketing-blog table
// `articles`, which must not be touched.
// ============================================================================

export type WordPressDefaultStatus = 'draft' | 'publish' | 'future'
export type WordPressConnectionStatus = 'untested' | 'connected' | 'failed'

export interface WordPressConnection {
  id: string
  user_id: string
  project_id: string
  site_url: string
  wp_username: string
  /** AES-256-GCM encrypted (iv:tag:ciphertext). Never sent to the client. */
  wp_application_password_encrypted: string
  default_author_id: number | null
  default_category_id: number | null
  default_status: WordPressDefaultStatus
  default_timezone: string
  connection_status: WordPressConnectionStatus
  last_tested_at: string | null
  created_at: string
  updated_at: string
}

export type ArticleTopicSource =
  | 'manual'
  | 'ai'
  | 'keyword'
  | 'ai_question'
  | 'competitor'
  // Content-automation recommendation sources (Phase 1).
  | 'project_data'
  | 'keyword_research_url'
  | 'keyword_research_keyword'
  | 'future_gsc'
export type ArticleTopicStatus = 'suggested' | 'approved' | 'rejected' | 'used'

export interface ArticleTopicAnchor {
  anchor_text: string
  target_url: string
  required: boolean
  type: 'internal' | 'external'
  note: string
}

export interface ArticleTopic {
  id: string
  user_id: string
  project_id: string
  source: ArticleTopicSource
  topic: string
  primary_keyword: string | null
  secondary_keywords: string[]
  search_intent: string | null
  target_audience: string | null
  status: ArticleTopicStatus
  // Phase 2A brief fields (additive)
  anchors_json: ArticleTopicAnchor[]
  brief_notes: string | null
  language: string | null
  tone_of_voice: string | null
  desired_word_count: number | null
  cta_preference: string | null
  // Content-automation recommendation metadata (Phase 1, additive).
  suggestion_reason: string | null
  suggestion_score: number | null
  created_at: string
  updated_at: string
}

export type GeneratedArticleStatus =
  | 'draft'
  | 'ready'
  | 'scheduled'
  | 'publishing'
  | 'published'
  | 'failed'

export interface GeneratedArticle {
  id: string
  user_id: string
  project_id: string
  topic_id: string | null
  title: string
  slug: string
  meta_title: string | null
  meta_description: string | null
  excerpt: string | null
  content_html: string | null
  content_markdown: string | null
  faq_json: Record<string, unknown>[] | null
  internal_links_json: Record<string, unknown>[] | null
  image_prompt: string | null
  featured_image_url: string | null
  featured_image_storage_path: string | null
  featured_image_prompt: string | null
  status: GeneratedArticleStatus
  wp_connection_id: string | null
  wp_post_id: number | null
  wp_post_url: string | null
  wp_featured_media_id: number | null
  scheduled_at: string | null
  published_at: string | null
  last_error: string | null
  created_at: string
  updated_at: string
}

export type ArticlePoolCadence = 'daily' | 'weekly' | 'monthly' | 'custom'

export interface ArticlePool {
  id: string
  user_id: string
  project_id: string
  name: string
  cadence: ArticlePoolCadence
  interval_days: number | null
  publish_time: string | null
  timezone: string
  is_active: boolean
  next_publish_at: string | null
  // Optional weekday schedule (0=Sun … 6=Sat). NULL = interval-days behavior.
  publish_days: number[] | null
  created_at: string
  updated_at: string
}

export type ArticlePoolItemStatus =
  | 'queued'
  | 'scheduled'
  | 'generating'
  | 'generated'
  | 'quality_check_failed'
  | 'publishing'
  | 'published'
  | 'failed'
  | 'skipped'
  | 'paused'

export interface ArticlePoolItem {
  id: string
  user_id: string
  project_id: string
  pool_id: string
  // Queue is keyed by topic; the article is created (generate-ahead) later.
  topic_id: string | null
  article_id: string | null
  position: number
  status: ArticlePoolItemStatus
  scheduled_at: string | null
  published_at: string | null
  attempts: number
  last_error: string | null
  locked_at: string | null
  created_at: string
  updated_at: string
}

export type WordPressContentIndexStatus = 'running' | 'completed' | 'partial' | 'failed'

/** Cached WordPress content/link index (Phase 2A) — one row per project. */
export interface WordPressContentIndexRow {
  id: string
  user_id: string
  project_id: string
  site_url: string | null
  site_host: string | null
  scan_status: WordPressContentIndexStatus
  scanner_version: string | null
  scan_params: Record<string, unknown>
  summary: Record<string, unknown>
  targets: unknown[]
  sample_links: unknown[]
  warnings: { notes?: string[]; errors?: string[] }
  error_message: string | null
  scan_started_at: string | null
  scan_completed_at: string | null
  scan_duration_ms: number | null
  expires_at: string | null
  created_at: string
  updated_at: string
}

export type InternalLinkPlanStatus = 'planned' | 'approved' | 'rejected' | 'superseded'
export type InternalLinkPlanSubjectType = 'topic' | 'pool_item' | 'generated_article'

/** Parent plan batch (Phase 2C) — one planning run per subject, even zero-link. INERT. */
export interface InternalLinkPlanBatchRow {
  id: string
  user_id: string
  project_id: string
  topic_id: string | null
  article_pool_item_id: string | null
  generated_article_id: string | null
  subject_type: InternalLinkPlanSubjectType
  subject_title_snapshot: string | null
  primary_keyword_snapshot: string | null
  planner_version: string | null
  cache_scanner_version: string | null
  cache_scan_completed_at: string | null
  cache_state: string | null
  allow_caution: boolean
  strict: boolean
  stale_at_creation: boolean
  status: InternalLinkPlanStatus
  link_count: number
  selected_count: number
  rejected_count: number
  diagnostics_summary: Record<string, unknown>
  warnings: string[]
  created_at: string
  updated_at: string
}

/** Persisted topic-idea suggestion (Phase 3F.3). */
export type ContentTopicIdeaStatus = 'pending' | 'approved' | 'rejected' | 'duplicate'

export interface ContentTopicIdeaRow {
  id: string
  user_id: string
  project_id: string
  source: string
  batch_id: string
  title: string
  primary_keyword: string | null
  secondary_keywords: string[]
  search_intent: string | null
  angle: string | null
  recommended_word_count: number | null
  suggested_internal_links: { url: string; anchor: string }[]
  suggestion_reason: string | null
  source_context: string | null
  source_url: string | null
  score: number | null
  fingerprint: string
  status: ContentTopicIdeaStatus
  approved_topic_id: string | null
  rejected_at: string | null
  approved_at: string | null
  created_at: string
  updated_at: string
}

/** Child plan link (Phase 2C) — one proposed link. INERT (review-only). */
export interface InternalLinkPlanLinkRow {
  id: string
  batch_id: string
  user_id: string
  project_id: string
  topic_id: string | null
  article_pool_item_id: string | null
  generated_article_id: string | null
  target_url: string
  target_title: string | null
  target_role: string | null
  target_priority: string | null
  anchor_text: string | null
  anchor_source: string | null
  confidence: number | null
  relevance: number | null
  reason: string | null
  status: InternalLinkPlanStatus
  created_at: string
  updated_at: string
}

/** Pre-apply content snapshot (Phase 2D.2) — for verbatim rollback. */
export interface GeneratedArticleContentSnapshotRow {
  id: string
  user_id: string
  project_id: string
  generated_article_id: string
  batch_id: string | null
  reason: string
  content_html_before: string | null
  content_markdown_before: string | null
  internal_links_json_before: Record<string, unknown>[] | null
  article_status_before: string | null
  checksum_before: string | null
  restored_at: string | null
  created_at: string
}

export type InternalLinkInsertionOutcome = 'inserted' | 'skipped' | 'failed' | 'rolled_back'

/** One apply-attempt-per-link audit row (Phase 2D.2). */
export interface InternalLinkInsertionRow {
  id: string
  user_id: string
  project_id: string
  batch_id: string | null
  link_id: string | null
  generated_article_id: string | null
  outcome: InternalLinkInsertionOutcome
  reason: string | null
  anchor_text: string | null
  target_url: string | null
  checksum_before: string | null
  checksum_after: string | null
  created_at: string
}

export type AIUsageOperation =
  | 'topic_generation'
  | 'outline'
  | 'article_generation'
  | 'polish'
  | 'metadata'

export interface AIUsageLog {
  id: string
  user_id: string
  project_id: string
  article_id: string | null
  provider: string
  model: string
  input_tokens: number
  output_tokens: number
  estimated_cost: number
  operation: AIUsageOperation
  created_at: string
  updated_at: string
}
