/**
 * The few words the formatted design adds to an article, in the ARTICLE's
 * language (not the dashboard's): an article written in English is published
 * in English whatever language its owner reads the app in.
 */
export type ArticleLanguage = 'he' | 'en'

export const ARTICLE_STYLE_LABELS: Record<ArticleLanguage, { inBrief: string; takeaways: string; faq: string }> = {
  he: { inBrief: 'בקצרה', takeaways: 'עיקרי הדברים', faq: 'שאלות נפוצות' },
  en: { inBrief: 'In short', takeaways: 'Key takeaways', faq: 'Frequently asked questions' },
}

/** The article's language, read off its text: Hebrew letters outnumbering Latin ones make it Hebrew. */
export function articleLanguage(html: string): ArticleLanguage {
  const text = String(html ?? '').replace(/<[^>]+>/g, ' ').slice(0, 20_000)
  const he = (text.match(/[א-ת]/g) ?? []).length
  const en = (text.match(/[A-Za-z]/g) ?? []).length
  return he >= en ? 'he' : 'en'
}
