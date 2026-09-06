/**
 * The document's own metadata, per locale. PURE — no Next, no React.
 *
 * The root layout exported ONE static Hebrew `metadata` object, so an English
 * document shipped a Hebrew <title>, description, keywords and og:locale. The
 * page said `lang="en"` and the tab said Hebrew; a share card and a search
 * result did too. Localizing the document without localizing what describes it
 * is only half a language contract.
 *
 * The Hebrew strings are the previous constants, unchanged byte for byte, so
 * Hebrew visitors and every already-indexed Hebrew URL see exactly what they
 * saw before.
 */

import type { Locale } from './locales'

export interface SiteMetadataStrings {
  title: string
  description: string
  keywords: string
  ogTitle: string
  ogDescription: string
  ogLocale: string
}

const SITE_METADATA: Record<Locale, SiteMetadataStrings> = {
  he: {
    title: 'יצירה, תזמון ופרסום תוכן SEO ו-GEO | Go Top',
    description: 'Rankings by Go Top - יצירה, תזמון ופרסום תוכן SEO ו-GEO ממקום אחד, לצד מעקב מיקומים בגוגל ונראות ב-AI (ChatGPT, Gemini, Perplexity). להרשמה בחינם כנסו עכשיו',
    keywords: 'יצירת תוכן SEO, תזמון תוכן, פרסום תוכן, GEO, מעקב מיקומים, קידום אתרים, SEO, גוגל, דירוג, מפות גוגל, AI visibility, ChatGPT, Gemini',
    ogTitle: 'יצירה, תזמון ופרסום תוכן SEO ו-GEO - Rankings by Go Top',
    ogDescription: 'יצירה, תזמון ופרסום תוכן SEO ו-GEO ממקום אחד, לצד מעקב מיקומים בגוגל ונראות ב-AI (ChatGPT, Gemini, Perplexity)',
    ogLocale: 'he_IL',
  },
  en: {
    title: 'Create, schedule and publish SEO & GEO content | Go Top',
    description: 'Rankings by Go Top — create, schedule and publish SEO and GEO content from one place, alongside Google rank tracking and visibility in AI answers (ChatGPT, Gemini, Perplexity). Start free.',
    keywords: 'SEO content creation, content scheduling, content publishing, GEO, rank tracking, SEO, Google, rankings, Google Maps, AI visibility, ChatGPT, Gemini',
    ogTitle: 'Create, schedule and publish SEO & GEO content — Rankings by Go Top',
    ogDescription: 'Create, schedule and publish SEO and GEO content from one place, alongside Google rank tracking and visibility in AI answers (ChatGPT, Gemini, Perplexity)',
    ogLocale: 'en_US',
  },
}

export function getSiteMetadata(locale: Locale): SiteMetadataStrings {
  return SITE_METADATA[locale] ?? SITE_METADATA.he
}
