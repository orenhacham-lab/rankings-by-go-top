/**
 * Feature flag: Smart Question keyword enrichment
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
 * Do NOT set to true without full QA sign-off.
 */
export const USE_KEYWORD_ENRICHMENT_SMART_QUESTIONS = false
