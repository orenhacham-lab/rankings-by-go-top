/**
 * Feature flag: Smart Question keyword enrichment
 *
 * Controlled via environment variable: NEXT_PUBLIC_USE_KEYWORD_ENRICHMENT_SMART_QUESTIONS
 *
 * When false (default):
 *   Refresh / "צור עוד שאלות" behaves exactly as today — only vNext.
 *   No enrichment code affects UI output.
 *
 * When true:
 *   Keyword enrichment is enabled as a fallback layer during refresh only.
 *   It is NEVER used on initial load.
 *   It ONLY runs when vNext returns fewer candidates than DIVERSITY_THRESHOLD.
 *   All candidates are deduped against vNext, saved questions, and shown history.
 *
 * To enable in production:
 *   Set NEXT_PUBLIC_USE_KEYWORD_ENRICHMENT_SMART_QUESTIONS=true in Vercel env vars
 *
 * MUST be NEXT_PUBLIC_ prefix because this is client-side React code.
 */
export const USE_KEYWORD_ENRICHMENT_SMART_QUESTIONS =
  process.env.NEXT_PUBLIC_USE_KEYWORD_ENRICHMENT_SMART_QUESTIONS === 'true'
