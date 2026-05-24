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
  ai_visibility: { he: 'נראות ב-AI', en: 'AI Search Visibility' },
  ai_visibility_platform: { he: 'נראות ב-AI', en: 'AI Search Visibility Platform' },
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
  engines_coverage_help: { he: 'מספר מנועי AI שמצאו לפחות הזכרה אחת של העסק', en: 'Number of AI engines that found at least one mention of the business' },
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
  tab_competitors: { he: 'מתחרים', en: 'Competitors' },
  showing_results: { he: 'מציג {count} תוצאות', en: 'Showing {count} results' },
  mentions_by_engine: { he: 'אזכורים לפי מנוע AI', en: 'Mentions by AI Engine' },
  total_mentions: { he: 'סה״כ אזכורים', en: 'Total mentions' },
  visibility_percent: { he: 'אחוז נראות', en: 'Visibility' },
  out_of_results: { he: 'מתוך {count} תוצאות', en: 'out of {count} results' },

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

  // Global AI Visibility page
  page_subtitle: {
    he: 'ההופעות של האתר שלך בתוצאות AI לפי פרויקט',
    en: 'How your site appears in AI results, per project',
  },
  no_projects_available: { he: 'אין פרויקטים זמינים', en: 'No projects available' },
  add_project: { he: '+ הוסף פרויקט', en: '+ Add project' },
  total_projects: { he: 'סה״כ פרויקטים', en: 'Total projects' },
  total_queries: { he: 'סה״כ שאילתות', en: 'Total queries' },
  total_scans: { he: 'סה״כ סריקות', en: 'Total scans' },
  total_citations: { he: 'סה״כ ציטוטים', en: 'Total citations' },
  avg_visibility: { he: 'ממוצע נראות', en: 'Avg. visibility' },
  projects_heading: { he: 'פרויקטים', en: 'Projects' },
  no_data: { he: 'אין נתונים', en: 'No data' },
  queries: { he: 'שאילתות', en: 'Queries' },
  last_scan: { he: 'סריקה אחרונה', en: 'Last scan' },
  open_ai_visibility: { he: 'פתח נראות ב-AI ←', en: 'Open AI Visibility →' },
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
  competitor_analysis_title: { he: 'השוואת מתחרים', en: 'Competitor comparison' },
  competitor_analysis_help: {
    he: 'כמה פעמים כל עסק מוזכר בתשובות AI מתוך התוצאות שנבדקו.',
    en: 'How often each business is mentioned in AI answers across the checked results.',
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
  competitor_visibility: { he: 'נראות', en: 'Visibility' },
  competitor_mentions: { he: 'אזכורים', en: 'Mentions' },
  competitor_by_engine: { he: 'פירוט לפי מנוע', en: 'Breakdown by engine' },
  competitor_your_business: { he: 'העסק שלכם', en: 'Your business' },
  competitor_zero_mentions: { he: 'אין אזכורים', en: 'No mentions' },

  // AI Share of Voice (Phase 3)
  share_of_voice_title: { he: 'AI Share of Voice', en: 'AI Share of Voice' },
  share_of_voice_help: {
    he: 'חלק יחסי מכלל האזכורים שנמצאו בתשובות AI.',
    en: 'Relative share of all mentions found in AI answers.',
  },
  share_of_voice_empty: {
    he: 'אין עדיין אזכורים בתשובות AI עבור העסק או המתחרים. הריצו סריקות נוספות כדי לראות נתח שיח.',
    en: 'No mentions yet for your business or competitors. Run more scans to see share of voice.',
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

  // Recommendations card
  recommendations_title: { he: 'המלצות לשיפור נראות AI', en: 'Recommendations to improve AI visibility' },
  recommendations_desc: {
    he: 'המלצות מבוססות על תוצאות הסריקה הנוכחית, ללא סריקות נוספות.',
    en: 'Recommendations are based on the current scan results, without running additional scans.',
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
  geo_insights_title: { he: 'תובנות GEO', en: 'GEO Insights' },
  geo_query_intent: { he: 'כוונת שאלה', en: 'Query intent' },
  geo_citation_types: { he: 'סוגי מקורות', en: 'Source types' },
  geo_content_signals: { he: 'דפוסי תוכן', en: 'Content patterns' },
  geo_none: { he: '—', en: '—' },

  // GEO Explanations (Phase 1B — why this result happened)
  geo_explanation_title: { he: 'למה זה קרה?', en: 'Why this result happened' },
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

  // GEO Opportunity Mapping (Phase 2A — project-level aggregated insights)
  geo_opp_title: { he: 'מיפוי הזדמנויות GEO', en: 'GEO Opportunity Mapping' },
  geo_opp_subtitle: {
    he: 'תובנות מצטברות מכל סריקות ה-AI של הפרויקט',
    en: 'Aggregated intelligence across all AI scan results for this project',
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
  geo_comp_card_engines: { he: 'אילו מקורות בולטים בכל מנוע', en: 'Which sources stand out in each engine' },
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
