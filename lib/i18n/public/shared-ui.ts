/**
 * The handful of SHARED-UI words a public page needs from components that were
 * built for the dashboard — today the notice box's "+{n} more" and "Close".
 *
 * The dashboard dictionaries are two 6,200-line files with no Spanish, and a
 * Spanish page must not fall back to English for a word a visitor can see. The
 * honest fix is not to translate those files for the sake of two strings, nor to
 * accept an English word on a Spanish page: it is to name the few shared strings
 * the public site actually reaches, here, per public locale.
 *
 * The Hebrew and English values are copied from the dashboard dictionaries, and
 * the public-site QA asserts they still match, so the two cannot drift.
 */
import type { PublicLocale } from '../locales'

export interface SharedUiCopy {
  /** `{n}` is replaced with the number of hidden items. */
  noticeMore: string
  close: string
}

export const SHARED_UI: Record<PublicLocale, SharedUiCopy> = {
  he: { noticeMore: 'עוד {n}', close: 'סגור' },
  en: { noticeMore: '{n} more', close: 'Close' },
  es: { noticeMore: '{n} más', close: 'Cerrar' },
}

export function sharedUiCopy(locale: PublicLocale): SharedUiCopy {
  return SHARED_UI[locale] ?? SHARED_UI.he
}
