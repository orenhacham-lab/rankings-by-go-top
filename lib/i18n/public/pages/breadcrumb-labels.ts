/**
 * The name a page goes by in a breadcrumb, per language.
 *
 * ONE source for the trail the reader sees and the BreadcrumbList a crawler
 * reads. Both used to carry their own literal — the about page's trail was
 * written in app/(public)/**-about/page.tsx and its markup again in the
 * route's layout — which is two places to change and two chances to disagree.
 *
 * The values are the ones the pages already printed, so nothing on screen
 * changes.
 */
import type { PublicLocale } from '@/lib/i18n/locales'

export const ABOUT_BREADCRUMB: Record<PublicLocale, string> = {
  he: 'אודות',
  en: 'About',
  es: 'Quiénes somos',
  'pt-BR': 'Quem somos',
}
