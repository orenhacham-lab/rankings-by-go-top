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
  remove_tag: { he: 'הסרת התגית', en: 'Remove tag' },
  priority_tag_help_label: { he: 'מה המשמעות של גבוה/טוב?', en: 'What do High and Good mean?' },
  priority_tag_help: { he: 'התגית מציינת עדיפות למעקב, לא ציון הסריקה.', en: 'The tag marks tracking priority, not the scan score.' },
  delete_permanently: { he: 'מחק לצמיתות', en: 'Delete permanently' },

  // Header
  ai_visibility: { he: 'נראות ב-AI', en: 'AI Search Visibility' },
  ai_visibility_platform: { he: 'נראות ב-AI', en: 'AI Search Visibility Platform' },
  monitor_engines: { he: 'מעקב אחר 6 מנועי AI', en: 'Monitor across 6 AI engines' },
  beta: { he: 'בטא', en: 'Beta' },
  suggest: { he: 'הצע', en: 'Suggest' },
  new_query: { he: 'שאלת AI חדשה', en: 'New AI query' },
  recommend_questions: { he: 'שאלות מומלצות', en: 'Recommended questions' },

  // KPI labels
  visibility_score: { he: 'ציון נראות', en: 'Visibility Score' },
  ai_visibility_percent: { he: '% נראות AI', en: 'AI Visibility %' },
  mention_frequency: { he: 'תדירות הזכרה', en: 'Mention Frequency' },
  citation_share: { he: '% נתח ציטוט', en: 'Citation Share' },
  engine_coverage: { he: 'כיסוי מנועים', en: 'Engine Coverage' },
  engines_coverage_help: { he: 'מספר מנועי AI שמצאו לפחות הזכרה אחת של העסק', en: 'Number of AI engines that found at least one mention of the business' },
  share_of_voice: { he: 'נתח מהאזכורים', en: 'Share of mentions' },
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
  // The questions tab, for an owner who never used an AI tool for business:
  // what a question is, and the one next step on an empty list.
  queries_explainer: {
    he: 'שאלה היא מה שלקוח היה כותב ל-ChatGPT או ל-Gemini כשהוא מחפש את מה שאתם מציעים, למשל בקשה להמלצה על עסק בתחום שלכם. אנחנו שואלים את המנועים את השאלה ובודקים אם העסק שלכם מופיע בתשובה. שאלות טובות הן כאלה שלקוחות באמת שואלים, בלי שם העסק.',
    en: 'A question is what a customer would type into ChatGPT or Gemini when looking for what you offer, for example asking for a recommended business in your field. We ask the engines that question and check whether your business shows up in the answer. Good questions are ones real customers ask, without your business name.',
  },
  no_queries_title: { he: 'עוד אין שאלות במעקב', en: 'No questions tracked yet' },
  no_queries_body: {
    he: 'הצעד הראשון: בחרו שאלה אחת או שתיים שלקוחות שלכם שואלים. אפשר לבחור מהשאלות המוצעות למטה או לכתוב שאלה משלכם. הוספת שאלה לא עולה כלום, רק בדיקה נספרת במכסה.',
    en: 'First step: pick one or two questions your customers ask. Choose from the suggestions below or write your own. Adding a question costs nothing; only a check counts toward your allowance.',
  },
  no_queries_pick: { he: 'בחירה מהשאלות המוצעות', en: 'Pick a suggested question' },
  no_queries_write: { he: 'כתיבת שאלה משלכם', en: 'Write your own question' },
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
  smart_questions_subtitle: {
    he: 'שאלות שכדאי להוסיף למעקב כדי לבדוק עוד הזדמנויות נראות.',
    en: 'Suggested questions to track for additional visibility opportunities.',
  },
  smart_questions_help: {
    he: 'שאלות מוכנות מותאמות לעסק שלך. בחר מרובה, ערוך, או הוסף בודד.',
    en: 'Smart AI questions tailored to your business. Select multiple, edit, or add one-by-one.',
  },
  add_question_label: { he: 'הוסף שאלה למעקב', en: 'Add question to tracking' },
  already_tracked: { he: 'כבר במעקב', en: 'Already tracked' },
  all_added: { he: 'כל השאלות נוספו', en: 'All questions were added' },
  loading_suggestions: {
    he: 'טוען שאלות מומלצות...',
    en: 'Loading suggested questions...',
  },
  no_new_suggestions: {
    he: 'לא נמצאו שאלות מומלצות חדשות כרגע.',
    en: 'No new suggested questions found right now.',
  },
  no_diverse_suggestions: {
    he: 'לא נמצאו כרגע עוד שאלות מגוונות. כדי לקבל עוד המלצות, הוסיפו מילות מפתח נוספות, שירותים או קטגוריות.',
    en: 'No more diverse questions were found right now. Add more keywords, services, or categories to get more suggestions.',
  },
  pool_exhausted_rich: {
    he: 'כל השאלות האיכותיות הזמינות כבר מוצגות. ניתן להוסיף שאלות ידנית או להרחיב את קטגוריות השירות בפרופיל.',
    en: 'All available high-quality questions are already displayed. You can add questions manually or expand service categories in the profile.',
  },
  pool_exhausted_thin: {
    he: 'כדי לקבל עוד שאלות, הוסיפו מילות מפתח, שירותים או קטגוריות בפרופיל.',
    en: 'To get more questions, add keywords, services, or categories to the profile.',
  },
  refresh_suggestions: { he: 'רענן', en: 'Refresh' },
  generate_more_suggestions: { he: 'צור עוד שאלות', en: 'Generate more questions' },
  generating_more: { he: 'יוצר שאלות נוספות...', en: 'Generating more questions...' },
  rescan: { he: 'סריקה מחדש', en: 'Rescan' },
  scan_this_engine: { he: 'סרוק במנוע הזה', en: 'Scan this engine' },
  // The engine chips ARE the run control, but they read as status badges — a
  // reviewer looking for a "Run" action found only the delete icon. A visible
  // instruction above them, and an accessible name that says what the click
  // does, is what makes an existing control discoverable.
  run_a_check_hint: {
    he: 'כדי לבדוק שאלה, לחצו על שם של מנוע לידה (למשל ChatGPT). תוך כדקה תראו מה הוא ענה ואם הזכיר אתכם. כל בדיקה נספרת במכסה.',
    en: 'To check a question, click an engine name next to it (for example ChatGPT). Within about a minute you see what it answered and whether it mentioned you. Each check counts toward your allowance.',
  },
  run_check_on: { he: 'הרץ בדיקת AI ב-', en: 'Run an AI check on ' },
  rerun_check_on: { he: 'הרץ שוב בדיקת AI ב-', en: 'Run another AI check on ' },
  ai_allowance: { he: 'בדיקות AI במחזור הנוכחי', en: 'AI checks this billing period' },
  ai_allowance_unknown: { he: 'לא ניתן לאמת כרגע את המכסה', en: 'The allowance could not be read right now' },
  ai_allowance_unmetered: { he: 'ללא מגבלה', en: 'Unmetered' },
  ai_allowance_exhausted: {
    he: 'ניצלתם את כל בדיקות ה-AI במחזור החיוב הזה',
    en: 'You have used every AI check in this billing period',
  },
  ai_allowance_not_included: { he: 'לא כלולות בחבילה', en: 'not included in your plan' },
  ai_allowance_none_body: {
    he: 'החבילה הנוכחית לא כוללת בדיקות AI, לכן אי אפשר להריץ בדיקה כרגע. אפשר כבר עכשיו להוסיף שאלות, ולבדוק אותן אחרי שדרוג.',
    en: 'Your current plan does not include AI checks, so a check cannot run right now. You can add questions now and check them after upgrading.',
  },
  ai_allowance_upgrade: { he: 'לשדרוג החבילה', en: 'Upgrade your plan' },
  chip_legend: {
    he: 'סימן ✓ ליד מנוע: הוא הזכיר אתכם בבדיקה האחרונה. סימן –: נבדק ולא הזכיר אתכם. בלי סימן: עוד לא נבדק.',
    en: 'A ✓ by an engine: it mentioned you in the last check. A –: checked, and it did not mention you. No mark: not checked yet.',
  },
  chip_mentioned: { he: 'הזכיר אתכם', en: 'mentioned you' },
  chip_not_mentioned: { he: 'נבדק, לא הזכיר אתכם', en: 'checked, did not mention you' },
  chip_not_checked: { he: 'עוד לא נבדק', en: 'not checked yet' },
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
  intent_pre_purchase: { he: 'מידע לפני רכישה', en: 'Pre-purchase' },
  intent_gift: { he: 'מתנה', en: 'Gift' },

  // Workspace layout
  select_query_to_view: { he: 'בחר שאלה כדי להציג את פרטיה', en: 'Select a query to view details' },
  select_and_run_query: { he: 'בחר שאלה והרץ לתוך מנוע כדי לראות את התוצאות', en: 'Select a query and run it against an engine to see results' },

  // New dashboard structure
  engine: { he: 'מנוע', en: 'Engine' },
  engines: { he: 'מנועים', en: 'engines' },
  ai_engines: { he: 'מנועי AI', en: 'AI engines' },
  of_n_ai_engines: { he: 'מתוך {count} מנועי AI', en: 'of {count} AI engines' },
  all_engines: { he: 'כל המנועים', en: 'All engines' },
  all_mention: { he: 'כל האזכורים', en: 'All mentions' },
  all_citations: { he: 'כל הציטוטים', en: 'All citations' },
  // The results filter's selects, by name (axe: a select needs an accessible name).
  filter_engine: { he: 'סינון לפי מנוע', en: 'Filter by engine' },
  filter_mention: { he: 'סינון לפי אזכור', en: 'Filter by mention' },
  filter_citation: { he: 'סינון לפי ציטוט', en: 'Filter by citation' },
  overall: { he: 'כולל', en: 'Overall' },
  search: { he: 'חיפוש', en: 'Search' },

  // Engine summary card labels (lowercase metric units)
  mentions: { he: 'אזכורים', en: 'mentions' },
  scans: { he: 'סריקות', en: 'scans' },

  // AI Queries panel
  ai_queries: { he: 'שאלות AI', en: 'AI Queries' },
  not_scanned_yet: { he: 'לא נסרק', en: 'Not scanned yet' },
  scan_engine: { he: 'סרוק', en: 'Scan' },
  query_already_exists: { he: 'השאלה כבר קיימת', en: 'Query already exists' },
  of_engines: { he: 'מתוך 6 מנועים', en: 'of 6 engines' },

  // Tabs
  tab_overview: { he: 'סקירה', en: 'Overview' },
  tab_results: { he: 'תוצאות', en: 'Results' },
  tab_queries: { he: 'שאלות AI', en: 'AI Queries' },
  tab_insights: { he: 'תובנות והמלצות', en: 'Insights & Recommendations' },
  tab_competitors: { he: 'מתחרים', en: 'Competitors' },
  showing_results: { he: 'מציג {count} תוצאות', en: 'Showing {count} results' },
  mentions_by_engine: { he: 'אזכורים לפי מנוע AI', en: 'Mentions by AI Engine' },
  total_mentions: { he: 'סה״כ אזכורים', en: 'Total mentions' },
  visibility_percent: { he: 'אחוז נראות', en: 'Visibility' },
  out_of_results: { he: 'מתוך {count} תשובות', en: 'out of {count} answers' },

  // Delete AI question
  delete_question_title: { he: 'למחוק שאלה?', en: 'Delete question?' },
  delete_question_body: {
    he: 'פעולה זו תמחק את השאלה. תוצאות סריקה קיימות יישארו בארכיון אך לא יוצגו כאן.',
    en: 'This will delete the question. Existing scan results stay archived but will no longer appear here.',
  },

  // Multi-question input
  multi_query_placeholder: {
    he: 'שאלה אחת בכל שורה',
    en: 'One question per line',
  },
  multi_query_help: {
    he: 'הפרד כל שאלה בשורה חדשה',
    en: 'Separate each question with a new line',
  },
  will_create_n_queries: {
    he: 'ייווצרו {count} שאלות AI',
    en: '{count} AI queries will be created',
  },
  will_create_one_query: {
    he: 'תיווצר שאלת AI אחת',
    en: '1 AI query will be created',
  },

  // Result row enrichments
  what_was_mentioned: { he: 'מה הוזכר', en: 'What was mentioned' },
  what_was_cited: { he: 'מה צוטט', en: 'What was cited' },

  // Strict mention-vs-source signal labels
  mentioned_in_answer: { he: 'אוזכר בתשובה', en: 'Mentioned in answer' },
  not_mentioned_in_answer: { he: 'לא אוזכר בתשובה', en: 'Not mentioned in answer' },
  appeared_as_source: { he: 'הופיע כמקור', en: 'Appeared as source' },
  not_appeared_as_source: { he: 'לא הופיע כמקור', en: 'Not a source' },
  mentioned_and_source: { he: 'אוזכר והופיע כמקור', en: 'Mentioned & cited as source' },
  brand_mentioned: { he: 'מותג אוזכר', en: 'Brand mentioned' },
  domain_mentioned: { he: 'דומיין אוזכר', en: 'Domain mentioned' },
  what_appeared_as_source: { he: 'מה הופיע כמקור', en: 'What appeared as a source' },
  view_details: { he: 'פרטים', en: 'Details' },
  scanned_at: { he: 'נסרק', en: 'Scanned' },

  // AI Business Profile panel
  ai_business_profile: { he: 'פרופיל AI לעסק', en: 'AI Business Profile' },
  ai_business_profile_help: {
    he: 'הפרופיל משפיע רק על שאלות AI מומלצות, לא על הסריקות עצמן.',
    en: 'This profile affects only recommended AI questions, not scans themselves.',
  },
  primary_category: { he: 'קטגוריה ראשית', en: 'Primary category' },
  secondary_categories: { he: 'קטגוריות משניות', en: 'Secondary categories' },
  excluded_topics: { he: 'נושאים לא רצויים', en: 'Excluded topics' },
  auto_detect: { he: 'זיהוי אוטומטי', en: 'Auto-detect' },
  auto_detected: { he: 'זוהה אוטומטית', en: 'Auto-detected' },
  manually_set: { he: 'הוגדר ידנית', en: 'Manually set' },
  auto_badge: { he: 'אוטומטי', en: 'Auto' },
  manual_badge: { he: 'ידני', en: 'Manual' },
  save_profile: { he: 'שמור פרופיל AI', en: 'Save AI Profile' },
  reset_to_auto: { he: 'איפוס לזיהוי אוטומטי', en: 'Reset to auto-detect' },
  add_tag_placeholder: { he: 'הוסף ולחץ Enter', en: 'Add and press Enter' },
  add_secondary_placeholder: {
    he: 'הוסף קטגוריה משנית ולחץ Enter',
    en: 'Add secondary category and press Enter',
  },
  add_excluded_placeholder: {
    he: 'הוסף נושא לא רצוי ולחץ Enter',
    en: 'Add excluded topic and press Enter',
  },
  primary_category_placeholder: {
    he: 'כתוב קטגוריה (לדוגמה: משלוחי פרחים) או בחר מהרשימה',
    en: 'Type a category (e.g. flower delivery) or pick one',
  },
  profile_saved: { he: 'פרופיל AI נשמר בהצלחה', en: 'AI profile saved' },
  profile_reset: { he: 'הפרופיל אופס לזיהוי אוטומטי', en: 'Profile reset to auto-detect' },
  edit_ai_profile: { he: 'ערוך פרופיל AI', en: 'Edit AI profile' },
  open_ai_profile: { he: 'פתח הגדרות פרופיל', en: 'Open profile settings' },
  close_panel: { he: 'סגור', en: 'Close' },
  category_suggestions: { he: 'הצעות', en: 'Suggestions' },

  // Misc UI labels
  show_all: { he: 'הצג הכל', en: 'Show all' },
  show_more: { he: 'הצג עוד', en: 'Show more' },
  add_to_queries_aria: { he: 'הוסף לרשימת השאילתות', en: 'Add to query list' },

  // AI Insight Cards
  ai_insights_header: { he: 'תובנות AI', en: 'AI Insights' },
  insight_brand_mention: { he: 'הזכרת מותג', en: 'Brand Mention' },
  insight_domain_cite: { he: 'ציטוט דומיין', en: 'Domain Cited' },
  insight_competitors: { he: 'מתחרים שזוהו', en: 'Competitors Detected' },
  insight_sources: { he: 'מקורות מובילים', en: 'Top Sources' },
  insight_recommendation: { he: 'המלצה זוהתה', en: 'Recommendation' },
  insight_engine: { he: 'מנוע סורק', en: 'Engine' },
  insight_mentioned_in_answer: { he: 'הוזכר בתשובה', en: 'Mentioned in answer' },
  insight_cited_as_source: { he: 'מצוטט כמקור', en: 'Cited as source' },
  insight_brand_recommended: { he: 'המותג שלך מומלץ', en: 'Your brand is recommended' },
  insight_no_clear_recommendation: { he: 'ללא המלצה ברורה', en: 'No clear recommendation' },
  insight_no_competitors: { he: 'לא זוהו מתחרים', en: 'No competitors detected' },
  insight_no_sources_cited: { he: 'אין מקורות מצוטטים', en: 'No sources cited' },
  insight_mention_count_suffix: { he: 'פעמים', en: 'mentions' },
  insight_words_in_answer: { he: 'מילים בתשובה', en: 'words in answer' },

  // Scan status (live, on-screen)
  scan_in_progress: { he: 'סריקת מנוע AI בתהליך…', en: 'AI engine scan in progress…' },
  scan_done: { he: 'הסריקה הושלמה', en: 'Scan complete' },

  // Profile errors
  profile_save_failed: { he: 'שמירת הפרופיל נכשלה. נסה שוב.', en: 'Failed to save profile. Please try again.' },
  profile_reset_failed: { he: 'איפוס הפרופיל נכשל. נסה שוב.', en: 'Failed to reset profile. Please try again.' },

  // The AI visibility tab (one project: the one the top bar names)
  page_subtitle: {
    he: 'איך מנועי ה-AI עונים על שאלות בתחום של העסק, והאם הם מזכירים ומצטטים את האתר',
    en: 'How AI assistants answer questions in your field, and whether they mention and cite your site',
  },
  not_available: { he: 'נראות ב-AI לא זמינה בחשבון הזה.', en: 'AI visibility is not available on this account.' },
  no_data: { he: 'אין נתונים', en: 'No data' },
  queries: { he: 'שאילתות', en: 'Queries' },
  last_scan: { he: 'סריקה אחרונה', en: 'Last scan' },
  failed_to_load: { he: 'טעינה נכשלה', en: 'Failed to load' },

  // Category labels for the dropdown (BusinessCategory → display name)
  cat_florist: { he: 'חנות פרחים', en: 'Flower shop' },
  cat_perfume: { he: 'חנות בשמים', en: 'Perfume shop' },
  cat_gifts: { he: 'חנות מתנות', en: 'Gift shop' },
  cat_agency: { he: 'סוכנות שיווק / SEO', en: 'Marketing / SEO agency' },
  cat_sports_store: { he: 'חנות ספורט', en: 'Sports store' },
  cat_appliance_store: { he: 'חנות מוצרי חשמל', en: 'Appliance store' },
  cat_ecommerce: { he: 'חנות אונליין', en: 'Online store' },
  cat_local_service: { he: 'שירות מקומי', en: 'Local service' },
  cat_home_improvement_service: { he: 'בעלי מקצוע לבית (אינסטלציה, חשמל, שיפוצים)', en: 'Home services (plumbing, electrical, renovation)' },
  cat_product_brand: { he: 'מותג מוצרים', en: 'Product brand' },
  cat_cleaning: { he: 'חברת ניקיון', en: 'Cleaning company' },
  cat_saas: { he: 'מוצר SaaS', en: 'SaaS product' },
  cat_restaurant: { he: 'מסעדה', en: 'Restaurant' },
  cat_healthcare: { he: 'שירותי בריאות', en: 'Healthcare' },
  cat_legal: { he: 'משרד עורכי דין', en: 'Law firm' },
  cat_real_estate: { he: 'נדל״ן', en: 'Real estate' },
  cat_fitness: { he: 'כושר', en: 'Fitness' },
  cat_beauty: { he: 'יופי וטיפוח', en: 'Beauty & wellness' },
  cat_education: { he: 'הכשרה והוראה', en: 'Education' },
  cat_second_hand_fashion: { he: 'בגדי יד שנייה לנשים', en: 'Second-hand women\'s fashion' },
  cat_generic: { he: 'אחר', en: 'Other' },

  // Competitors panel (Phase 1)
  competitors_title: { he: 'מתחרים למעקב', en: 'Tracked competitors' },
  competitors_subtitle: {
    he: 'הגדירו עד 3 מתחרים שאתם רוצים לעקוב אחריהם בתשובות AI.',
    en: 'Define up to 3 competitors you want to track in AI answers.',
  },
  competitor_name: { he: 'שם המתחרה', en: 'Competitor name' },
  competitor_name_placeholder: { he: 'לדוגמה: Adidas', en: 'e.g. Adidas' },
  competitor_domain: { he: 'דומיין (אופציונלי)', en: 'Domain (optional)' },
  competitor_domain_placeholder: { he: 'example.com', en: 'example.com' },
  competitor_aliases: { he: 'שמות נוספים', en: 'Alternative names' },
  competitor_aliases_help: {
    he: 'שמות נוספים לזיהוי, מופרדים בפסיקים',
    en: 'Alternative names to detect, separated by commas',
  },
  competitor_aliases_placeholder: { he: 'אדידאס, adidas, ‎ADIDAS', en: 'adidas, ADIDAS' },
  competitor_add: { he: 'הוספת מתחרה', en: 'Add competitor' },
  competitor_save: { he: 'שמירה', en: 'Save' },
  competitor_cancel: { he: 'ביטול', en: 'Cancel' },
  competitor_edit: { he: 'עריכה', en: 'Edit' },
  competitor_delete: { he: 'מחיקה', en: 'Delete' },
  competitor_max_reached: {
    he: 'הגעת למקסימום של 3 מתחרים פעילים. השבת אחד כדי להוסיף חדש.',
    en: 'You\'ve reached the limit of 3 active competitors. Deactivate one to add another.',
  },
  competitor_empty: {
    he: 'עדיין לא הוגדרו מתחרים. הוסיפו מתחרה ראשון כדי להתחיל.',
    en: 'No competitors defined yet. Add your first competitor to get started.',
  },
  competitor_delete_confirm: {
    he: 'להסיר את המתחרה מהמעקב הפעיל? ההיסטוריה תישמר.',
    en: 'Remove this competitor from active tracking? History will be kept.',
  },
  competitor_loading: { he: 'טוען מתחרים…', en: 'Loading competitors…' },
  competitor_load_failed: { he: 'טעינת המתחרים נכשלה.', en: 'Failed to load competitors.' },
  competitor_active_count: { he: 'מתחרים פעילים', en: 'Active competitors' },
  competitor_inactive: { he: 'לא פעיל', en: 'Inactive' },
  competitor_reactivate: { he: 'הפעלה מחדש', en: 'Reactivate' },

  // Competitor analysis (Phase 2)
  competitor_analysis_title: { he: 'באיזה חלק מהתשובות כל עסק מוזכר', en: 'How many of the answers name each business' },
  competitor_analysis_help: {
    he: 'לכל עסק בנפרד: בכמה מהתשובות שנבדקו הוא הוזכר. כל עסק נמדד מול כל התשובות, ולכן כמה עסקים יכולים להגיע כל אחד ל-100%.',
    en: 'For each business on its own: how many of the checked answers named it. Each is measured against all the answers, so several businesses can each reach 100%.',
  },
  competitor_analysis_no_competitors: {
    he: 'הוסיפו מתחרים כדי להשוות את הנראות שלכם במנועי AI.',
    en: 'Add competitors to compare your AI visibility.',
  },
  competitor_analysis_no_scan: {
    he: 'אין עדיין סריקה זמינה להשוואת מתחרים. הריצו סריקת AI תחילה.',
    en: 'No scan is available yet for competitor comparison. Run an AI scan first.',
  },
  competitor_analysis_no_mentions: {
    he: 'לא נמצאו אזכורים למתחרים בסריקה האחרונה.',
    en: 'No competitor mentions were found in the latest scan.',
  },
  competitor_analysis_loading: { he: 'טוען נתונים…', en: 'Loading…' },
  competitor_analysis_failed: { he: 'טעינת הנתונים נכשלה.', en: 'Failed to load data.' },
  competitor_visibility: { he: 'מהתשובות', en: 'of answers' },
  competitor_mentions: { he: 'אזכורים', en: 'Mentions' },
  competitor_by_engine: { he: 'פירוט לפי מנוע', en: 'Breakdown by engine' },
  competitor_your_business: { he: 'העסק שלכם', en: 'Your business' },
  competitor_zero_mentions: { he: 'אין אזכורים', en: 'No mentions' },

  // AI Share of Voice (Phase 3)
  share_of_voice_title: { he: 'נתח מכלל האזכורים בתשובות AI', en: 'Share of all mentions in AI answers' },
  share_of_voice_help: {
    he: 'כל תשובה שמזכירה עסק נספרת לו פעם אחת. האחוז הוא החלק של כל עסק מכל האזכורים יחד, ולכן האחוזים כאן מסתכמים ל-100%.',
    en: 'Each answer that names a business counts once for it. The percentage is each business\'s part of all mentions together, so the percentages here add up to 100%.',
  },
  share_of_voice_empty: {
    he: 'עדיין אף תשובה לא הזכירה את העסק או מתחרה. בדקו עוד שאלות כדי לראות מי מוזכר יותר.',
    en: 'No answer has named your business or a competitor yet. Check more questions to see who is named more.',
  },
  share_of_voice_mentions: { he: 'אזכורים', en: 'mentions' },

  // AI Visibility Score (Phase 4)
  ai_visibility_score: { he: 'ציון נראות AI', en: 'AI Visibility Score' },
  score_help: {
    he: 'הציון מבוסס על אחוז התשובות שבהן העסק הופיע במנועי AI.',
    en: 'The score is based on the percentage of AI answers where the business appeared.',
  },
  score_subtext: {
    he: 'מבוסס על אחוז התשובות שבהן העסק הופיע במנועי AI.',
    en: 'Based on the percentage of AI answers where the business appeared.',
  },
  score_low: { he: 'נמוך', en: 'Low' },
  score_medium: { he: 'בינוני', en: 'Medium' },
  score_high: { he: 'גבוה', en: 'High' },

  // Competitive Gaps card (formerly Recommendations card; now only competitor_leading alerts)
  recommendations_title: { he: 'פערים מול מתחרים', en: 'Competitive Gaps' },
  recommendations_desc: {
    he: 'התראות על מתחרים שמופיעים יותר מהעסק בתשובות AI',
    en: 'Alerts for competitors that appear more often than the business in AI answers',
  },
  recommendations_none: {
    he: 'לא נמצאו המלצות דחופות כרגע. המשיכו לעקוב אחרי הסריקות הבאות.',
    en: 'No urgent recommendations were found right now. Keep monitoring future scans.',
  },
  recommendations_none_specific: {
    he: 'כל השאלות מכוסות ולעסק נראות טובה בכל המנועים.',
    en: 'All questions are covered and the business has good visibility across all engines.',
  },
  rec_severity_high: { he: 'דחוף', en: 'High' },
  rec_severity_medium: { he: 'בינוני', en: 'Medium' },
  rec_severity_low: { he: 'נמוך', en: 'Low' },

  // Recommendation 1: Weak engines — engines with no mentions
  rec_weak_engines_title: { he: 'העסק לא מופיע בחלק ממנועי AI', en: 'The business is missing from some AI engines' },
  rec_weak_engines_body: {
    he: 'העסק לא הופיע ב-{engines}.\nבדקו את השאלות שנבדקו במנועים האלה, וחזקו באתר תשובות סביב הנושאים שחזרו בסריקה.',
    en: 'The business did not appear in {engines}.\nReview the questions tested in those engines and strengthen answers around the recurring topics from the scan.',
  },

  // Recommendation 2: Weak questions — questions with low visibility
  rec_weak_questions_title: { he: 'יש שאלות שבהן העסק כמעט לא מופיע', en: 'Some questions have weak visibility' },

  // Zero mentions: business did not appear at all
  rec_weak_questions_zero_single: {
    he: 'העסק לא הופיע בשאלה:\n{question}\n\nמומלץ ליצור עמוד תוכן או פסקת FAQ שעונה ישירות על השאלה ומבליטה את יתרונות העסק.',
    en: 'The business did not appear for the question:\n{question}\n\nCreate a content section or FAQ that answers it directly and highlights the business advantages.',
  },
  rec_weak_questions_zero_multi: {
    he: 'העסק לא הופיע בשאלות:\n{questions}\n\nמומלץ ליצור עמוד תוכן או פסקת FAQ שעונה ישירות על השאלות ומבליטה את יתרונות העסק.',
    en: 'The business did not appear for the questions:\n{questions}\n\nCreate content or FAQ sections that answer them directly and highlight the business advantages.',
  },

  // Weak visibility: business appeared but rarely (< 0.25 rate)
  rec_weak_questions_weak_single: {
    he: 'העסק כמעט לא הופיע בשאלה:\n{question}\n\nמומלץ ליצור עמוד תוכן או פסקת FAQ שעונה ישירות על השאלה ומבליטה את יתרונות העסק.',
    en: 'The business had weak visibility for the question:\n{question}\n\nCreate a content section or FAQ that answers it directly and highlights the business advantages.',
  },
  rec_weak_questions_weak_multi: {
    he: 'העסק כמעט לא הופיע בשאלות:\n{questions}\n\nמומלץ ליצור עמוד תוכן או פסקת FAQ שעונה ישירות על השאלות ומבליטה את יתרונות העסק.',
    en: 'The business had weak visibility for the questions:\n{questions}\n\nCreate content or FAQ sections that answer them directly and highlight the business advantages.',
  },

  // Recommendation 3: Competitor leading — competitor has more mentions than project
  rec_competitor_leading_title: { he: 'מתחרה מוביל בנתח האזכורים', en: 'A competitor leads in share of voice' },
  rec_competitor_leading_body: {
    he: '{competitorName} הופיע ב-{gap} תשובות יותר מהעסק. בדקו באילו שאלות הוא מופיע והעסק לא, וצרו תוכן ייעודי סביב השאלות האלה.',
    en: '{competitorName} appeared in {gap} more answers than your business. Review the questions where they appear and your business does not, then create targeted content around those questions.',
  },

  // Phase 6 — Per-question insights (Queries tab)
  prompt_mentions: { he: 'אזכורים', en: 'Mentions' },
  prompt_site_cited: { he: 'האתר צוטט', en: 'Site cited' },
  prompt_status: { he: 'סטטוס', en: 'Status' },
  prompt_engines_of: { he: '{mentioned}/{total} מנועים', en: '{mentioned}/{total} engines' },
  prompt_yes: { he: 'כן', en: 'Yes' },
  prompt_no: { he: 'לא', en: 'No' },
  prompt_not_scanned_yet: { he: 'עוד לא נסרק', en: 'Not scanned yet' },
  prompt_status_missing: { he: 'לא מופיע', en: 'Missing' },
  prompt_status_weak: { he: 'חלש', en: 'Weak' },
  prompt_status_medium: { he: 'בינוני', en: 'Medium' },
  prompt_status_good: { he: 'טוב', en: 'Good' },

  // GEO Insights (Phase 1A — drawer-only compact section)
  geo_insights_title: { he: 'למה זו התשובה', en: 'Why this answer' },
  geo_query_intent: { he: 'כוונת שאלה', en: 'Query intent' },
  geo_citation_types: { he: 'סוגי מקורות', en: 'Source types' },
  geo_content_signals: { he: 'דפוסי תוכן', en: 'Content patterns' },
  geo_none: { he: '—', en: '—' },

  // GEO Explanations (Phase 1B — why this result happened)
  geo_explanation_title: { he: 'ניתוח התוצאה', en: 'Result Analysis' },
  geo_explanation_insufficient: {
    he: 'אין מספיק אותות להסבר אמין בתוצאה הזו.',
    en: 'Not enough signals to explain this result reliably.',
  },

  // GEO Recommendations (Phase 1C — what can be improved)
  geo_recommendations_title: { he: 'מה אפשר לשפר?', en: 'What can be improved?' },
  geo_recommendations_none: {
    he: 'לא זוהו פערים ברורים בתוצאה הזו. המשיכו בעבודה הטובה.',
    en: 'No clear gaps detected in this result. Keep up the good work.',
  },

  // GEO Insights collapsible label (Phase 1C — technical details)
  geo_technical_details: { he: 'פרטים טכניים', en: 'Technical details' },

  // AI Visibility Summary (Insights tab — high-level snapshot + next action)
  ai_summary_title: { he: 'תקציר נראות AI', en: 'AI Visibility Summary' },
  ai_summary_subtitle: {
    he: 'תמונת מצב קצרה והפעולה המומלצת הבאה',
    en: 'A short overview and the next recommended action',
  },
  ai_summary_status_high: { he: 'העסק מופיע ברוב תשובות ה־AI שנבדקו.', en: 'The business appears in most of the tested results.' },
  ai_summary_status_medium: { he: 'העסק מופיע בחלק מהתוצאות, אבל יש עדיין מקום לשיפור.', en: 'The business appears in some results, but there is still room for improvement.' },
  ai_summary_status_low: { he: 'העסק כמעט לא מופיע בתשובות AI שנבדקו.', en: 'The business barely appears in the tested AI answers.' },
  ai_summary_status_insufficient: { he: 'עדיין אין מספיק סריקות כדי להציג תקציר מדויק.', en: 'Not enough scans yet to display an accurate summary.' },
  ai_summary_action_label: { he: 'הפעולה המומלצת: ', en: 'Recommended action: ' },
  ai_summary_action_weak_questions: { he: 'ליצור תוכן שעונה ישירות על השאלות שבהן העסק לא הופיע.', en: 'Create content that directly answers the questions where the business did not appear.' },
  ai_summary_action_reviews: { he: 'לחזק ביקורות, דירוגים ועדויות לקוחות באתר.', en: 'Strengthen reviews, ratings, and customer testimonials on the site.' },
  ai_summary_action_comparison: { he: 'להוסיף עמודי השוואה בין מוצרים, מותגים או פתרונות כדי לחזק הופעה בתשובות AI.', en: 'Add comparison pages that help customers choose between options.' },
  ai_summary_action_pricing: { he: 'להציג מידע ברור יותר על מחירים, טווחי מחיר ומה כלול בשירות.', en: 'Display clearer information about pricing, price ranges, and what is included.' },
  ai_summary_action_list: { he: 'להוסיף שאלות נפוצות ותשובות קצרות לשאלות מרכזיות.', en: 'Add FAQs and concise answers to key questions.' },
  ai_summary_action_local: { he: 'להבליט אזורי שירות, כתובת וזמינות באתר.', en: 'Highlight service areas, address, and availability on the site.' },
  ai_summary_action_recommendation: { he: 'להוסיף תוכן שמכוון את הלקוח לבחירה הנכונה עבורו.', en: 'Add content that guides customers toward the right choice for them.' },
  ai_summary_action_fallback: { he: 'להריץ עוד שאלות ומנועים כדי לקבל המלצות מדויקות יותר.', en: 'Run more questions and engines to get more accurate recommendations.' },

  // GEO Opportunity Mapping (Phase 2A — project-level aggregated insights)
  geo_opp_title: { he: 'המלצות לשיפור הנראות ב-AI', en: 'AI Visibility Improvement Recommendations' },
  geo_opp_subtitle: {
    he: 'המלצות לשיפור הנראות של העסק בתשובות AI',
    en: 'Recommendations to improve business visibility in AI answers',
  },
  geo_opp_empty: {
    he: 'אין עדיין מספיק סריקות להפקת תובנות מצטברות. הריצו עוד סריקות כדי לקבל מיפוי מלא.',
    en: 'Not enough scans yet to produce aggregated insights. Run more scans to see the full mapping.',
  },
  geo_opp_card_content: { he: 'דפוסי תוכן שמחזקים חשיפה', en: 'Content patterns that strengthen visibility' },
  geo_opp_card_citations: { he: 'מקורות שמחזקים חשיפה', en: 'Sources that strengthen visibility' },
  geo_opp_card_engines: { he: 'דפוסים לפי מנוע AI', en: 'Patterns by AI engine' },
  geo_opp_card_missing: { he: 'פערים שחוזרים בתוצאות חלשות', en: 'Gaps in unsuccessful results' },
  geo_opp_no_data_content: { he: 'נדרשות עוד סריקות כדי לזהות דפוסי תוכן.', en: 'More scans needed to identify content patterns.' },
  geo_opp_no_data_citations: { he: 'ממתינים לנתונים עוד כדי לזהות מקורות משמעותיים.', en: 'Waiting for more data to identify significant sources.' },
  geo_opp_no_data_engines: { he: 'ככל שיצטברו סריקות, דפוסים ייחודיים למנועים יופיעו כאן.', en: 'As scans accumulate, unique engine patterns will emerge here.' },
  geo_opp_no_data_missing: { he: 'פערים יתגלו ככל שיצטברו יותר תוצאות כושלות.', en: 'Gaps will become clear as more unsuccessful results accumulate.' },

  // GEO Competitor Intelligence (Phase 2C/2D — sources + business mentions)
  geo_comp_title: { he: 'מקורות ומתחרים בתשובות AI', en: 'Sources & competitors in AI answers' },
  geo_comp_subtitle: {
    he: 'מבט על האתרים, סוגי התוכן והעסקים שמופיעים בתשובות מנועי AI',
    en: 'An overview of the sites, content types, and businesses appearing in AI answers',
  },
  geo_comp_card_sources: { he: 'אתרים שחוזרים בתשובות AI', en: 'Websites that keep appearing' },
  geo_comp_card_content: { he: 'איזה תוכן מופיע יותר בתשובות AI', en: 'What content appears most in AI answers' },
  geo_comp_card_engines: { he: 'מקורות בולטים לפי מנוע AI', en: 'Which sources stand out in each engine' },
  geo_comp_card_loss: { he: 'מתחרים שהופיעו כשהעסק לא הופיע', en: 'Competitors mentioned when your business wasn\'t' },
  geo_comp_pills_label: {
    he: 'דוגמאות לאתרים שחזרו בתוצאות:',
    en: 'Examples of recurring sites:',
  },
  geo_comp_pills_label_competitors: {
    he: 'מתחרים שזוהו בתשובות:',
    en: 'Competitors detected in answers:',
  },
  geo_comp_no_data_sources: {
    he: 'אין עדיין מספיק סריקות כדי לזהות אתרים שחוזרים על עצמם.',
    en: 'Not enough scans yet to identify recurring sites.',
  },
  geo_comp_no_data_content: {
    he: 'עדיין אין מספיק נתונים כדי לזהות אילו סוגי תוכן בולטים יותר בתשובות AI.',
    en: 'Not enough data yet to identify which content types stand out.',
  },
  geo_comp_no_data_engines: {
    he: 'יידרשו עוד סריקות במגוון מנועים כדי לזהות העדפות.',
    en: 'More scans across engines needed to identify preferences.',
  },
  geo_comp_no_data_loss: {
    he: 'לא זוהו מתחרים שהוגדרו מראש בתשובות שבהן העסק לא הופיע. הגדירו רשימת מתחרים או הריצו עוד סריקות.',
    en: 'No listed competitors were detected when the business was absent. Define competitors or run more scans.',
  },

  // Category language (varied, not "ecosystem"-heavy)
  geo_comp_cat_review: { he: 'אתרי ביקורות', en: 'review sites' },
  geo_comp_cat_marketplace: { he: 'שווקים', en: 'marketplaces' },
  geo_comp_cat_forum: { he: 'פורומים', en: 'forums' },
  geo_comp_cat_brand: { he: 'מתחרים', en: 'competitors' },
  geo_comp_cat_editorial: { he: 'בלוגים וכתבות', en: 'blogs & articles' },
  geo_comp_cat_directory: { he: 'ספריות עסקיות', en: 'directories' },
  geo_comp_cat_unknown: { he: 'מקורות אחרים', en: 'other sources' },

  // Business mention intelligence (Phase 2D)
  geo_biz_title: { he: 'עסקים שהופיעו בתשובות AI', en: 'Businesses mentioned in AI answers' },
  geo_biz_subtitle: {
    he: 'אילו עסקים/מתחרים הוזכרו בפועל בתשובות',
    en: 'Which businesses and competitors were actually mentioned',
  },
  geo_biz_when_absent: { he: 'עסקים שהופיעו כשאתה לא הופעת', en: 'Competitors when you\'re absent' },
  geo_biz_mentioned: { he: '{name} הוזכר ב-{count} תוצאות בתשובות AI.', en: '{name} was mentioned in {count} AI responses.' },
  geo_biz_no_data: {
    he: 'אין עדיין מספיק סריקות כדי לדעת אילו עסקים מופיעים בתשובות.',
    en: 'Not enough scans yet to identify mentioned businesses.',
  },
  geo_biz_none_found: {
    he: 'אף עסק מהרשימה לא הוזכר בתשובות.',
    en: 'None of the listed competitors were mentioned.',
  },

  geo_opp_visibility_rate: { he: 'נראות', en: 'visibility' },
  geo_opp_preliminary_trend: { he: 'מגמה ראשונית: ', en: 'Preliminary trend: ' },
  geo_opp_small_sample_warning: {
    he: 'התובנות מבוססות על מדגם קטן. ככל שתריצו יותר שאלות ומנועים, המיפוי יהיה מדויק יותר.',
    en: 'These insights are based on a small sample. Run more questions and engines for greater accuracy.',
  },

  // Content signal short labels (used inside aggregation sentences)
  geo_opp_signal_pricing: { he: 'מחירים', en: 'pricing' },
  geo_opp_signal_reviews: { he: 'ביקורות', en: 'reviews' },
  geo_opp_signal_comparison: { he: 'תוכן השוואתי', en: 'comparison content' },
  geo_opp_signal_list: { he: 'רשימות / FAQ', en: 'lists / FAQ' },
  geo_opp_signal_recommendation: { he: 'המלצות', en: 'recommendations' },
  geo_opp_signal_local: { he: 'מידע מקומי', en: 'local information' },

  // Citation type short labels — phrased in plain business language
  // (no internal taxonomy terms surfaced to users).
  geo_opp_cite_homepage: { he: 'עמודים כלליים של עסקים', en: 'business homepages' },
  geo_opp_cite_category: { he: 'עמודי קטגוריות מוצרים', en: 'product category pages' },
  geo_opp_cite_product: { he: 'עמודי מוצר', en: 'product pages' },
  geo_opp_cite_comparison: { he: 'עמודי השוואה', en: 'comparison pages' },
  geo_opp_cite_review: { he: 'אתרי ביקורות', en: 'review sites' },
  geo_opp_cite_blog: { he: 'בלוגים ומאמרים', en: 'blogs and articles' },
  geo_opp_cite_marketplace: { he: 'שווקים מקוונים', en: 'marketplaces' },
  geo_opp_cite_forum: { he: 'פורומים', en: 'forums' },
  geo_opp_cite_directory: { he: 'מדריכי עסקים', en: 'directories' },
  geo_opp_cite_brand_site: { he: 'אתרים רשמיים של עסקים', en: 'official business websites' },

  // Query intents
  geo_intent_transactional: { he: 'מסחרי', en: 'Transactional' },
  geo_intent_informational: { he: 'מידע', en: 'Informational' },
  geo_intent_comparison: { he: 'השוואה', en: 'Comparison' },
  geo_intent_review: { he: 'ביקורת', en: 'Review' },
  geo_intent_local: { he: 'מקומי', en: 'Local' },
  geo_intent_navigational: { he: 'ניווט', en: 'Navigational' },

  // Citation types — plain business language (no internal taxonomy)
  geo_citation_homepage: { he: 'עמוד כללי של עסק', en: 'Business homepage' },
  geo_citation_category: { he: 'עמוד קטגוריות מוצרים', en: 'Product category page' },
  geo_citation_product: { he: 'עמוד מוצר', en: 'Product page' },
  geo_citation_comparison: { he: 'עמוד השוואה', en: 'Comparison page' },
  geo_citation_review: { he: 'אתר ביקורות', en: 'Review site' },
  geo_citation_blog: { he: 'בלוג / מאמר', en: 'Blog / Article' },
  geo_citation_marketplace: { he: 'שוק מקוון', en: 'Marketplace' },
  geo_citation_forum: { he: 'פורום', en: 'Forum' },
  geo_citation_directory: { he: 'מדריך עסקים', en: 'Business directory' },
  geo_citation_brand_site: { he: 'אתר רשמי של עסק', en: 'Official business website' },
  geo_citation_unknown: { he: 'לא מסווג', en: 'Unknown' },

  // Content signals
  geo_signal_list: { he: 'רשימה', en: 'List' },
  geo_signal_comparison: { he: 'השוואה', en: 'Comparison' },
  geo_signal_pricing: { he: 'מחיר', en: 'Pricing' },
  geo_signal_review: { he: 'ביקורות', en: 'Reviews' },
  geo_signal_local: { he: 'מקומי', en: 'Local' },
  geo_signal_recommendation: { he: 'המלצה', en: 'Recommendation' },

  // Confidence tiers
  confidence_high: { he: 'גבוה', en: 'High' },
  confidence_good: { he: 'טוב', en: 'Good' },
  confidence_medium: { he: 'בינוני', en: 'Medium' },
  confidence_opportunity: { he: 'הזדמנות', en: 'Opportunity' },
  confidence_experimental: { he: 'ניסיוני', en: 'Experimental' },

  // Explanation chips
  chip_purchase_intent: { he: 'כוונת רכישה', en: 'Purchase Intent' },
  chip_high_search_volume: { he: 'נפח חיפוש גבוה', en: 'High Search Volume' },
  chip_not_in_ai: { he: 'העסק לא מופיע ב-AI', en: 'Business Not in AI' },
  chip_low_google_rank: { he: 'דירוג נמוך בגוגל', en: 'Low Google Rank' },
  chip_lead_potential: { he: 'פוטנציאל לידים', en: 'Lead Potential' },
  chip_competitor_pattern: { he: 'נושא שחוזר אצל מתחרים', en: 'Competitor Pattern' },
  chip_local_search: { he: 'חיפוש מקומי', en: 'Local Search' },
  chip_high_cpc: { he: 'CPC גבוה', en: 'High CPC' },
  chip_comparison_search: { he: 'חיפוש השוואתי', en: 'Comparison Search' },
  chip_brand_search: { he: 'חיפוש מותג', en: 'Brand Search' },
  chip_pre_purchase_search: { he: 'חיפוש לפני רכישה', en: 'Pre-Purchase Search' },
  // Signal-based chips (added in signal-driven explanation pass)
  chip_conversion_potential: { he: 'פוטנציאל המרה גבוה', en: 'High Conversion Potential' },
  chip_commercial_phrase: { he: 'ביטוי מסחרי', en: 'Commercial Phrase' },
  chip_competitor_gap: { he: 'פער מול מתחרים', en: 'Competitor Gap' },
  chip_lead_opportunity: { he: 'הזדמנות לידים', en: 'Lead Opportunity' },
  chip_regional_demand: { he: 'ביקוש גבוה באזור', en: 'High Regional Demand' },
  // Starter-tier chip — the ONLY chip a brand-new/generic project produces (via
  // buildFallbackSuggestions). It was missing here, so t('starter_questions') threw and
  // crashed the AI Questions tab for new projects.
  starter_questions: { he: 'שאלות התחלה', en: 'Starter questions' },

  // Premium design pass (WP2): words the restyled tab needed, so none are hard-coded.
  something_went_wrong: { he: 'משהו השתבש. נסו שוב בעוד רגע.', en: 'Something went wrong. Please try again in a moment.' },
  result_more_actions: { he: 'פעולות נוספות לתוצאה', en: 'More actions for this result' },
  question_more_actions: { he: 'פעולות נוספות לשאלה', en: 'More actions for this question' },
  archive_result: { he: 'העברה לארכיון', en: 'Archive' },
  restore_result: { he: 'החזרה לחישוב הציון', en: 'Restore to the score' },
  not_in_score: { he: 'לא נכלל בציון', en: 'Not in score' },
  show_archive: { he: 'הצגת הארכיון ({count})', en: 'Show archive ({count})' },
  archive_note: { he: 'תוצאות בארכיון אינן נכללות בחישוב הציון.', en: 'Archived results are not included in the score.' },
  archive_update_failed: { he: 'לא הצלחנו לעדכן את הארכיון. נסו שוב.', en: 'We could not update the archive. Please try again.' },
  archived_toast: { he: 'התוצאה הועברה לארכיון ולא תשפיע על ציון הנראות.', en: 'Result archived and left out of the score.' },
  restored_toast: { he: 'התוצאה שוחזרה וחזרה לחישוב ציון הנראות.', en: 'Result restored and counted in the score again.' },
  scan_failed: { he: 'הבדיקה נכשלה', en: 'Check failed' },
  scan_failed_body: { he: 'הבדיקה נכשלה זמנית. אפשר לנסות שוב.', en: 'The check failed for now. You can try again.' },
  retry_check: { he: 'ניסיון חוזר', en: 'Try again' },
  how_it_works: { he: 'איך זה עובד?', en: 'How does it work?' },
  more_items: { he: 'עוד {count}', en: '{count} more' },
  geo_opp_based_on: {
    he: '{success} מתוך {total} תשובות הזכירו את העסק או ציטטו את האתר',
    en: '{success} of {total} answers mentioned the business or cited the site',
  },
  geo_comp_loss_badge: { he: 'דורש תשומת לב', en: 'Needs attention' },
  geo_card_content: { he: 'תוכן שכדאי לחזק', en: 'Content to strengthen' },
  geo_card_questions: { he: 'שאלות שבהן העסק לא הופיע', en: 'Questions where the business is weak' },
  geo_card_engines: { he: 'מנועים שכדאי לחזק', en: 'Engines worth strengthening' },
  geo_card_missing: { he: 'מה חסר כשהעסק לא מופיע', en: 'What is missing when the business does not appear' },
  geo_opp_fallback: {
    he: 'כרגע לא זוהתה חולשה ברורה. כדי לקבל המלצות מדויקות יותר, מומלץ להריץ עוד שאלות ומנועים.',
    en: 'No clear weakness detected at the moment. To get more accurate recommendations, run more questions and engines.',
  },
  no_recommended_yet: { he: 'עדיין אין שאלות מומלצות לפרויקט הזה', en: 'No recommended questions yet for this project' },
  generate_recommended: { he: 'יצירת שאלות מומלצות', en: 'Generate recommended questions' },
  generating_recommended: { he: 'יוצר שאלות מומלצות…', en: 'Generating recommended questions…' },
  fallback_questions_notice: {
    he: 'לא הצלחנו ליצור שאלות דרך AI כרגע, ולכן הצגנו שאלות בסיסיות להתחלה.',
    en: 'We could not generate AI questions right now, so these are basic starter questions.',
  },
  more_questions_short: { he: 'עוד שאלות', en: 'More questions' },
  competitor_results_of: { he: '{mentions} מתוך {total} תשובות', en: '{mentions} of {total} answers' },
  share_of_voice_of_all: { he: 'מכלל האזכורים', en: 'of all mentions' },
  share_of_voice_answers: { he: '{count} תשובות', en: '{count} answers' },
  competitor_updated: { he: 'עודכן {date}', en: 'Updated {date}' },
  competitor_small_sample: {
    he: 'ההשוואה מבוססת על מעט תשובות. לתמונה מדויקת יותר, הוסיפו שאלות AI והריצו עוד בדיקות.',
    en: 'This comparison rests on only a few answers. Add AI questions and run more checks for a fuller picture.',
  },
  drawer_summary_both: { he: 'העסק אוזכר בתשובה, והאתר הופיע כמקור.', en: 'The business was mentioned in the answer, and the site was cited as a source.' },
  drawer_summary_mentioned: { he: 'העסק אוזכר בתשובה, אבל האתר לא הופיע כמקור.', en: 'The business was mentioned in the answer, but the site was not cited as a source.' },
  drawer_summary_cited: { he: 'האתר הופיע כמקור, אבל העסק לא אוזכר בגוף התשובה.', en: 'The site was cited as a source, but the business was not named in the answer.' },
  drawer_summary_none: { he: 'העסק לא אוזכר בתשובה, והאתר לא הופיע כמקור.', en: 'The business was not mentioned in the answer, and the site was not cited.' },
  drawer_keep_going: {
    he: 'שמרו על תוכן ברור עם מחירים, ביקורות והמלצות כדי לחזק את הופעתכם בתוצאות דומות.',
    en: 'Keep your content clear with pricing, reviews and recommendations to strengthen your visibility in similar queries.',
  },
  drawer_no_improvements: { he: 'לא זוהו פעולות שיפור ברורות בתוצאה הזו.', en: 'No clear improvements were detected in this result.' },
  ai_summary_strong_low: { he: 'העסק הופיע בעיקר ב־{names}.', en: 'The business did appear mainly on {names}.' },
  ai_summary_strong_high: { he: 'הנראות חזקה בעיקר ב־{names}.', en: 'Visibility is strong mainly on {names}.' },
  ai_summary_weak: { he: 'החולשה המרכזית היא ב־{names}.', en: 'The main weakness is on {names}.' },
  competitors_used_for: { he: 'המתחרים ישמשו להשוואת נראות בתשובות AI.', en: 'These competitors are used to compare AI visibility.' },
  open_source: { he: 'פתיחת המקור בכרטיסייה חדשה', en: 'Open the source in a new tab' },
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
