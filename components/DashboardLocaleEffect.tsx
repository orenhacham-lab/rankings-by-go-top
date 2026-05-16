'use client'

import { useDashboardLanguage } from '@/lib/i18n/dashboard/useDashboardLanguage'

// Option A (interim): no-op for document direction.
// The dashboard intentionally stays RTL globally while text labels are
// translated page-by-page. Scoped LTR can be added later via per-page
// wrappers, once enough pages are fully translated.
export function DashboardLocaleEffect() {
  // Subscribe to keep language state warm; does not mutate the document.
  useDashboardLanguage()
  return null
}
