'use client'

/**
 * Keeps <html lang> and <html dir> in step with the ACTIVE locale.
 *
 * The root layout renders `<html lang="he" dir="rtl">` because it is a server
 * component and cannot know a client-side language choice. The dashboard's
 * switcher therefore changed every visible string to English while the document
 * still declared Hebrew and RTL — wrong for screen readers, for the browser's
 * own text handling, and for any CSS or component keyed on document direction.
 * A scoped wrapper div could not fix that: `dir` on a descendant does not change
 * what the document declares.
 *
 * Mounted once inside DashboardLanguageProvider (reactive to the switcher) and
 * once in the public /en layout (a fixed locale, restored on unmount so leaving
 * an English page returns the document to Hebrew).
 */

import { useEffect } from 'react'
import { documentLocaleAttributes } from '@/lib/i18n/document-locale'

export function DocumentLocaleEffect({
  locale,
  restoreOnUnmount = false,
}: {
  locale: string | null | undefined
  /** Public /en pages restore the previous values; the dashboard keeps its choice. */
  restoreOnUnmount?: boolean
}) {
  useEffect(() => {
    const html = document.documentElement
    const previous = { lang: html.lang, dir: html.dir }
    const { lang, dir } = documentLocaleAttributes(locale)
    html.lang = lang
    html.dir = dir
    if (!restoreOnUnmount) return
    return () => {
      html.lang = previous.lang
      html.dir = previous.dir
    }
  }, [locale, restoreOnUnmount])

  return null
}
