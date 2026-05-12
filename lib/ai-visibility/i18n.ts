/**
 * Lightweight i18n helper for the AI Visibility module.
 * Returns Hebrew strings when language='he' or country='IL', English otherwise.
 *
 * Usage: const t = createI18n(language, country); t('regenerate')
 */

const STRINGS = {
  // Modal & button labels
  regenerate: { he: 'צור מחדש', en: 'Regenerate' },
  generate_again: { he: 'צור שוב', en: 'Generate again' },
  close: { he: 'סגור', en: 'Close' },
  cancel: { he: 'ביטול', en: 'Cancel' },
  add: { he: 'הוסף', en: 'Add' },
  add_selected: { he: 'הוסף נבחרים', en: 'Add selected' },
  edit: { he: 'עריכה', en: 'Edit' },
  selected: { he: 'נבחרו', en: 'selected' },
  of: { he: 'מתוך', en: 'of' },
  delete: { he: 'מחק', en: 'Delete' },
  delete_permanently: { he: 'מחק לצמיתות', en: 'Delete permanently' },

  // Header
  ai_visibility: { he: 'AI Search Visibility', en: 'AI Search Visibility' },
  ai_visibility_platform: { he: 'AI Search Visibility Platform', en: 'AI Search Visibility Platform' },
  monitor_engines: { he: 'מעקב אחר 6 מנועי AI', en: 'Monitor across 6 AI engines' },
  beta: { he: 'בטא', en: 'Beta' },
  suggest: { he: '✨ הצע', en: '✨ Suggest' },
  new_query: { he: '+ שאלת AI חדשה', en: '+ New AI Query' },
  recommend_questions: { he: '💡 שאלות מומלצות', en: '💡 Recommended Questions' },

  // KPI labels
  visibility_score: { he: 'ציון נראות', en: 'Visibility Score' },
  ai_visibility_percent: { he: '% נראות AI', en: 'AI Visibility %' },
  mention_frequency: { he: 'תדירות הזכרה', en: 'Mention Frequency' },
  citation_share: { he: '% נתח ציטוט', en: 'Citation Share' },
  engine_coverage: { he: 'כיסוי מנועים', en: 'Engine Coverage' },
  share_of_voice: { he: 'Share of Voice', en: 'Share of Voice' },
  recommendation_present: { he: 'המלצה נוכחת', en: 'Recommendation Present' },
  mentioned: { he: 'הוזכר', en: 'Mentioned' },
  not_mentioned: { he: 'לא הוזכר', en: 'Not mentioned' },
  target_cited: { he: 'דומיין צוטט', en: 'Target Cited' },
  not_cited: { he: 'לא צוטט', en: 'Not cited' },
  citations: { he: 'ציטוטים', en: 'Citations' },
  sources_cited: { he: 'מקורות צוטטו', en: 'Sources cited' },
  in_ai_response: { he: 'בתשובת AI', en: 'In AI response' },
  not_found: { he: 'לא נמצא', en: 'Not found' },
  as_source: { he: 'כמקור', en: 'As source' },
  high_visibility: { he: '🔥 נראות גבוהה', en: '🔥 High visibility' },
  moderate_visibility: { he: '⚠️ נראות בינונית', en: '⚠️ Moderate visibility' },
  low_visibility: { he: '📌 נראות נמוכה', en: '📌 Low visibility' },

  // Insights strip
  brand_mentioned_yes: { he: 'המותג שלך הוזכר', en: 'Your brand was mentioned' },
  brand_mentioned_no: { he: 'המותג שלך לא הוזכר', en: 'Your brand was not mentioned' },
  domain_cited_yes: { he: 'הדומיין שלך מצוטט כמקור', en: 'Your domain is cited as a source' },
  domain_cited_no: { he: 'הדומיין שלך לא צוטט', en: 'Your domain was not cited' },
  best_engine: { he: 'מנוע מצטיין', en: 'Best engine' },
  top_source: { he: 'מקור מוביל', en: 'Top source' },
  sources_influencing: { he: 'מקורות שמשפיעים על התשובה', en: 'Sources influencing AI answer' },

  // Workspace
  query: { he: 'שאלת AI', en: 'AI Query' },
  ai_query: { he: 'שאלת AI', en: 'AI Query' },
  ai_answer: { he: 'תשובת AI', en: 'AI Answer' },
  sources: { he: 'מקורות', en: 'Sources' },
  show_full_answer: { he: 'הצג תשובה מלאה', en: 'Show full answer' },
  show_less: { he: 'הצג פחות', en: 'Show less' },
  more_paragraphs: { he: 'פסקאות נוספות', en: 'more paragraphs' },
  no_response: { he: 'לא התקבלה תשובה', en: 'No response text returned' },
  no_sources_cited: { he: 'לא צוטטו מקורות בתשובה זו', en: 'No sources cited' },
  your_domain: { he: 'הדומיין שלך', en: 'Your domain' },
  scanning_engine: { he: 'סורק מנוע AI...', en: 'Scanning AI engine…' },
  scan: { he: 'סרוק', en: 'Scan' },
  scan_query: { he: 'סרוק שאלה', en: 'Scan query' },

  // Engine card states
  scan_btn: { he: 'סרוק', en: 'Scan' },
  scanning: { he: 'סורק...', en: 'Scanning…' },
  failed: { he: 'נכשל', en: 'Failed' },
  success: { he: 'הצליח', en: 'Success' },
  error: { he: 'שגיאה', en: 'Error' },
  cited: { he: 'צוטט', en: 'cited' },
  mention: { he: 'הזכרה', en: 'mention' },
  no_mention: { he: 'ללא הזכרה', en: 'no mention' },

  // Empty states
  no_queries: { he: 'אין שאלות עדיין', en: 'No AI queries yet' },
  no_queries_help: {
    he: 'צור שאלות חכמות מותאמות לעסק שלך, או צור שאלה באופן ידני.',
    en: 'Generate smart AI questions tailored to your business, or create one manually.',
  },
  no_scans: { he: 'אין סריקות עדיין', en: 'No scans yet' },
  no_scans_help: {
    he: 'סרוק שאלה מול מנוע AI כדי להתחיל לעקוב.',
    en: 'Scan an AI query against an engine to start tracking activity.',
  },

  // Scan history
  scan_activity: { he: 'פעילות סריקה', en: 'Scan activity' },
  scan_history: { he: 'היסטוריית סריקה', en: 'Scan history' },
  events: { he: 'אירועים', en: 'events' },
  event: { he: 'אירוע', en: 'event' },
  viewing: { he: 'מוצג', en: 'Viewing' },
  open: { he: 'פתח', en: 'Open' },
  just_now: { he: 'עכשיו', en: 'just now' },
  loading: { he: 'טוען...', en: 'Loading…' },

  // Delete modal
  delete_scan_title: { he: 'למחוק תוצאת סריקה?', en: 'Delete scan result?' },
  delete_scan_body: {
    he: 'פעולה זו תמחק לצמיתות את תוצאת הסריקה, התשובה וכל הציטוטים. לא ניתן לבטל פעולה זו.',
    en: 'This will permanently delete the AI scan result, response, and all associated citations. This action cannot be undone.',
  },

  // Smart AI questions modal
  smart_questions_title: { he: 'שאלות AI מומלצות', en: 'Recommended AI Questions' },
  smart_questions_help: {
    he: 'שאלות מוכנות מותאמות לעסק שלך. בחר מרובה, ערוך, או הוסף בודד.',
    en: 'Smart AI questions tailored to your business. Select multiple, edit, or add one-by-one.',
  },
  all_added: { he: 'כל השאלות נוספו.', en: 'All questions added.' },
  query_label: { he: 'שאלת AI', en: 'AI Query' },
  country_label: { he: 'מדינה (ISO)', en: 'Country (ISO)' },
  language_label: { he: 'שפה', en: 'Language' },
  target_domain_label: { he: 'דומיין יעד (לא חובה)', en: 'Target domain (optional)' },
  target_brand_label: { he: 'מותג יעד (לא חובה)', en: 'Target brand (optional)' },
  new_ai_query_title: { he: 'שאלת AI חדשה', en: 'New AI Query' },
  create_query: { he: 'צור שאלה', en: 'Create query' },

  // Intent labels
  intent_brand: { he: 'מותג', en: 'Brand' },
  intent_comparison: { he: 'השוואה', en: 'Comparison' },
  intent_commercial: { he: 'מסחרי', en: 'Commercial' },
  intent_local: { he: 'מקומי', en: 'Local' },
  intent_transactional: { he: 'מסחרי', en: 'Transactional' },
  intent_recommendation: { he: 'המלצה', en: 'Recommendation' },
  intent_informational: { he: 'מידע', en: 'Informational' },
  intent_alternatives: { he: 'חלופות', en: 'Alternatives' },
  intent_best_of: { he: 'הטובים ביותר', en: 'Best of' },

  // Workspace layout
  select_query_to_view: { he: 'בחר שאלה כדי להציג את פרטיה', en: 'Select a query to view details' },
  select_and_run_query: { he: 'בחר שאלה והרץ לתוך מנוע כדי לראות את התוצאות', en: 'Select a query and run it against an engine to see results' },
} as const

type StringKey = keyof typeof STRINGS

export function isHebrew(language: string | null | undefined, country?: string | null): boolean {
  if (language?.toLowerCase() === 'he') return true
  if (country?.toUpperCase() === 'IL') return true
  return false
}

export function createI18n(language: string | null | undefined, country?: string | null) {
  const heb = isHebrew(language, country)
  return function t(key: StringKey): string {
    const entry = STRINGS[key]
    return heb ? entry.he : entry.en
  }
}
