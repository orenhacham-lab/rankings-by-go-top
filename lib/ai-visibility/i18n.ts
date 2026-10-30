/**
 * Lightweight i18n helper for the AI Visibility module.
 *
 * Hebrew when language='he' or country='IL', then Spanish when language='es',
 * Brazilian Portuguese on a 'pt' prefix, French on a 'fr' prefix — so
 * 'fr', 'fr-FR' and 'fr-CA' all read the one French string — Italian on an
 * 'it' prefix the same way, and English otherwise, including for a Spanish,
 * Portuguese, French or Italian key that has no `es`, `pt-BR`, `fr` or `it`
 * yet: the same partial-then-English fallback the
 * dashboard dictionary uses (lib/i18n/dashboard/merge.ts). So a string
 * translated here lands on the screen and an untranslated one reads English,
 * never Hebrew — an Italian merchant sees Italian or English, never French.
 *
 * Usage: const t = createI18n(language, country); t('regenerate')
 */

const STRINGS = {
  // Modal & button labels
  regenerate: { he: 'צור מחדש', en: 'Regenerate', es: 'Volver a generar', 'pt-BR': 'Gerar novamente', fr: 'Régénérer', it: 'Rigenerare' },
  generate_again: { he: 'צור שוב', en: 'Generate again', es: 'Generar otra vez', 'pt-BR': 'Gerar de novo', fr: 'Générer à nouveau', it: 'Generare di nuovo' },
  close: { he: 'סגור', en: 'Close', es: 'Cerrar', 'pt-BR': 'Fechar', fr: 'Fermer', it: 'Chiudere' },
  cancel: { he: 'ביטול', en: 'Cancel', es: 'Cancelar', 'pt-BR': 'Cancelar', fr: 'Annuler', it: 'Annullare' },
  add: { he: 'הוסף', en: 'Add', es: 'Añadir', 'pt-BR': 'Adicionar', fr: 'Ajouter', it: 'Aggiungere' },
  add_selected: { he: 'הוסף נבחרים', en: 'Add selected', es: 'Añadir los seleccionados', 'pt-BR': 'Adicionar os selecionados', fr: 'Ajouter la sélection', it: 'Aggiungere la selezione' },
  edit: { he: 'עריכה', en: 'Edit', es: 'Editar', 'pt-BR': 'Editar', fr: 'Modifier', it: 'Modificare' },
  selected: { he: 'נבחרו', en: 'selected', es: 'seleccionadas', 'pt-BR': 'selecionadas', fr: 'sélectionnées', it: 'selezionate' },
  of: { he: 'מתוך', en: 'of', es: 'de', 'pt-BR': 'de', fr: 'sur', it: 'su' },
  delete: { he: 'מחק', en: 'Delete', es: 'Eliminar', 'pt-BR': 'Excluir', fr: 'Supprimer', it: 'Eliminare' },
  remove_tag: { he: 'הסרת התגית', en: 'Remove tag', es: 'Quitar la etiqueta', 'pt-BR': 'Remover a etiqueta', fr: 'Retirer l\'étiquette', it: 'Rimuovere l\'etichetta' },
  priority_tag_help_label: { he: 'מה המשמעות של גבוה/טוב?', en: 'What do High and Good mean?', es: '¿Qué significan Alta y Buena?', 'pt-BR': 'O que significam Alta e Boa?', fr: 'Que signifient Haute et Bonne ?', it: 'Che cosa significano Alta e Buona?' },
  priority_tag_help: { he: 'התגית מציינת עדיפות למעקב, לא ציון הסריקה.', en: 'The tag marks tracking priority, not the scan score.', es: 'La etiqueta marca la prioridad de seguimiento, no la nota de la comprobación.', 'pt-BR': 'A etiqueta indica a prioridade de acompanhamento, não a nota da verificação.', fr: 'L\'étiquette indique la priorité de suivi, pas la note de la vérification.', it: 'L\'etichetta indica la priorità di monitoraggio, non il punteggio della verifica.' },
  delete_permanently: { he: 'מחק לצמיתות', en: 'Delete permanently', es: 'Eliminar definitivamente', 'pt-BR': 'Excluir definitivamente', fr: 'Supprimer définitivement', it: 'Eliminare definitivamente' },

  // Header
  ai_visibility: { he: 'נראות ב-AI', en: 'AI Search Visibility', es: 'Visibilidad en IA', 'pt-BR': 'Visibilidade em IA', fr: 'Visibilité dans les IA', it: 'Visibilità nelle IA' },
  ai_visibility_platform: { he: 'נראות ב-AI', en: 'AI Search Visibility Platform', es: 'Plataforma de visibilidad en IA', 'pt-BR': 'Plataforma de visibilidade em IA', fr: 'Plateforme de visibilité dans les IA', it: 'Piattaforma di visibilità nelle IA' },
  monitor_engines: { he: 'מעקב אחר 6 מנועי AI', en: 'Monitor across 6 AI engines', es: 'Seguimiento en 6 motores de IA', 'pt-BR': 'Acompanhamento em 6 motores de IA', fr: 'Suivi sur 6 moteurs d\'IA', it: 'Monitoraggio su 6 motori di IA' },
  beta: { he: 'בטא', en: 'Beta', es: 'Beta', 'pt-BR': 'Beta', fr: 'Bêta', it: 'Beta' },
  suggest: { he: 'הצע', en: 'Suggest', es: 'Proponer', 'pt-BR': 'Sugerir', fr: 'Proposer', it: 'Proporre' },
  new_query: { he: 'שאלת AI חדשה', en: 'New AI query', es: 'Nueva pregunta de IA', 'pt-BR': 'Nova pergunta de IA', fr: 'Nouvelle question d\'IA', it: 'Nuova domanda di IA' },
  recommend_questions: { he: 'שאלות מומלצות', en: 'Recommended questions', es: 'Preguntas recomendadas', 'pt-BR': 'Perguntas recomendadas', fr: 'Questions recommandées', it: 'Domande consigliate' },

  // KPI labels
  visibility_score: { he: 'ציון נראות', en: 'Visibility Score', es: 'Puntuación de visibilidad', 'pt-BR': 'Pontuação de visibilidade', fr: 'Score de visibilité', it: 'Punteggio di visibilità' },
  ai_visibility_percent: { he: '% נראות AI', en: 'AI Visibility %', es: '% de visibilidad en IA', 'pt-BR': '% de visibilidade em IA', fr: '% de visibilité dans les IA', it: '% di visibilità nelle IA' },
  mention_frequency: { he: 'תדירות הזכרה', en: 'Mention Frequency', es: 'Frecuencia de menciones', 'pt-BR': 'Frequência de menções', fr: 'Fréquence des mentions', it: 'Frequenza delle menzioni' },
  citation_share: { he: '% נתח ציטוט', en: 'Citation Share', es: '% de citas', 'pt-BR': '% de citações', fr: '% de citations', it: '% di citazioni' },
  engine_coverage: { he: 'כיסוי מנועים', en: 'Engine Coverage', es: 'Cobertura de motores', 'pt-BR': 'Cobertura de motores', fr: 'Couverture des moteurs', it: 'Copertura dei motori' },
  engines_coverage_help: { he: 'מספר מנועי AI שמצאו לפחות הזכרה אחת של העסק', en: 'Number of AI engines that found at least one mention of the business', es: 'Cuántos motores de IA han encontrado al menos una mención del negocio', 'pt-BR': 'Quantos motores de IA encontraram pelo menos uma menção ao negócio', fr: 'Combien de moteurs d\'IA ont trouvé au moins une mention de l\'entreprise', it: 'Quanti motori di IA hanno trovato almeno una menzione dell\'attività' },
  share_of_voice: { he: 'נתח מהאזכורים', en: 'Share of mentions', es: 'Cuota de menciones', 'pt-BR': 'Participação nas menções', fr: 'Part des mentions', it: 'Quota delle menzioni' },
  recommendation_present: { he: 'המלצה נוכחת', en: 'Recommendation Present', es: 'Aparece una recomendación', 'pt-BR': 'Há uma recomendação', fr: 'Une recommandation apparaît', it: 'Compare una raccomandazione' },
  mentioned: { he: 'הוזכר', en: 'Mentioned', es: 'Mencionado', 'pt-BR': 'Mencionado', fr: 'Mentionné', it: 'Menzionata' },
  not_mentioned: { he: 'לא הוזכר', en: 'Not mentioned', es: 'No mencionado', 'pt-BR': 'Não mencionado', fr: 'Non mentionné', it: 'Non menzionata' },
  target_cited: { he: 'דומיין צוטט', en: 'Target Cited', es: 'Dominio citado', 'pt-BR': 'Domínio citado', fr: 'Domaine cité', it: 'Dominio citato' },
  not_cited: { he: 'לא צוטט', en: 'Not cited', es: 'No citado', 'pt-BR': 'Não citado', fr: 'Non cité', it: 'Non citato' },
  citations: { he: 'ציטוטים', en: 'Citations', es: 'Citas', 'pt-BR': 'Citações', fr: 'Citations', it: 'Citazioni' },
  sources_cited: { he: 'מקורות צוטטו', en: 'Sources cited', es: 'Fuentes citadas', 'pt-BR': 'Fontes citadas', fr: 'Sources citées', it: 'Fonti citate' },
  in_ai_response: { he: 'בתשובת AI', en: 'In AI response', es: 'En la respuesta de IA', 'pt-BR': 'Na resposta da IA', fr: 'Dans la réponse de l\'IA', it: 'Nella risposta dell\'IA' },
  not_found: { he: 'לא נמצא', en: 'Not found', es: 'No encontrado', 'pt-BR': 'Não encontrado', fr: 'Introuvable', it: 'Non trovato' },
  as_source: { he: 'כמקור', en: 'As source', es: 'Como fuente', 'pt-BR': 'Como fonte', fr: 'Comme source', it: 'Come fonte' },
  high_visibility: { he: '🔥 נראות גבוהה', en: '🔥 High visibility', es: '🔥 Visibilidad alta', 'pt-BR': '🔥 Visibilidade alta', fr: '🔥 Visibilité élevée', it: '🔥 Visibilità alta' },
  moderate_visibility: { he: '⚠️ נראות בינונית', en: '⚠️ Moderate visibility', es: '⚠️ Visibilidad media', 'pt-BR': '⚠️ Visibilidade média', fr: '⚠️ Visibilité moyenne', it: '⚠️ Visibilità media' },
  low_visibility: { he: '📌 נראות נמוכה', en: '📌 Low visibility', es: '📌 Visibilidad baja', 'pt-BR': '📌 Visibilidade baixa', fr: '📌 Visibilité faible', it: '📌 Visibilità bassa' },

  // Insights strip
  brand_mentioned_yes: { he: 'המותג שלך הוזכר', en: 'Your brand was mentioned', es: 'Han mencionado tu marca', 'pt-BR': 'Mencionaram a sua marca', fr: 'Votre marque a été mentionnée', it: 'Il vostro marchio è stato menzionato' },
  brand_mentioned_no: { he: 'המותג שלך לא הוזכר', en: 'Your brand was not mentioned', es: 'No han mencionado tu marca', 'pt-BR': 'Não mencionaram a sua marca', fr: 'Votre marque n\'a pas été mentionnée', it: 'Il vostro marchio non è stato menzionato' },
  domain_cited_yes: { he: 'הדומיין שלך מצוטט כמקור', en: 'Your domain is cited as a source', es: 'Tu dominio aparece citado como fuente', 'pt-BR': 'Seu domínio aparece citado como fonte', fr: 'Votre domaine est cité comme source', it: 'Il vostro dominio è citato come fonte' },
  domain_cited_no: { he: 'הדומיין שלך לא צוטט', en: 'Your domain was not cited', es: 'No han citado tu dominio', 'pt-BR': 'Não citaram o seu domínio', fr: 'Votre domaine n\'a pas été cité', it: 'Il vostro dominio non è stato citato' },
  best_engine: { he: 'מנוע מצטיין', en: 'Best engine', es: 'Mejor motor', 'pt-BR': 'Melhor motor', fr: 'Meilleur moteur', it: 'Motore migliore' },
  top_source: { he: 'מקור מוביל', en: 'Top source', es: 'Fuente principal', 'pt-BR': 'Fonte principal', fr: 'Source principale', it: 'Fonte principale' },
  sources_influencing: { he: 'מקורות שמשפיעים על התשובה', en: 'Sources influencing AI answer', es: 'Fuentes que influyen en la respuesta de la IA', 'pt-BR': 'Fontes que influenciam a resposta da IA', fr: 'Sources qui influencent la réponse de l\'IA', it: 'Fonti che influenzano la risposta dell\'IA' },

  // Workspace
  query: { he: 'שאלת AI', en: 'AI Query', es: 'Pregunta de IA', 'pt-BR': 'Pergunta de IA', fr: 'Question d\'IA', it: 'Domanda di IA' },
  ai_query: { he: 'שאלת AI', en: 'AI Query', es: 'Pregunta de IA', 'pt-BR': 'Pergunta de IA', fr: 'Question d\'IA', it: 'Domanda di IA' },
  ai_answer: { he: 'תשובת AI', en: 'AI Answer', es: 'Respuesta de la IA', 'pt-BR': 'Resposta da IA', fr: 'Réponse de l\'IA', it: 'Risposta dell\'IA' },
  sources: { he: 'מקורות', en: 'Sources', es: 'Fuentes', 'pt-BR': 'Fontes', fr: 'Sources', it: 'Fonti' },
  show_full_answer: { he: 'הצג תשובה מלאה', en: 'Show full answer', es: 'Ver la respuesta completa', 'pt-BR': 'Ver a resposta completa', fr: 'Voir la réponse complète', it: 'Visualizzare la risposta completa' },
  show_less: { he: 'הצג פחות', en: 'Show less', es: 'Ver menos', 'pt-BR': 'Ver menos', fr: 'Voir moins', it: 'Visualizzare meno' },
  more_paragraphs: { he: 'פסקאות נוספות', en: 'more paragraphs', es: 'párrafos más', 'pt-BR': 'parágrafos a mais', fr: 'paragraphes de plus', it: 'paragrafi in più' },
  no_response: { he: 'לא התקבלה תשובה', en: 'No response text returned', es: 'No se ha recibido ninguna respuesta', 'pt-BR': 'Nenhuma resposta foi recebida', fr: 'Aucune réponse n\'a été reçue', it: 'Nessuna risposta ricevuta' },
  no_sources_cited: { he: 'לא צוטטו מקורות בתשובה זו', en: 'No sources cited', es: 'No se ha citado ninguna fuente', 'pt-BR': 'Nenhuma fonte foi citada', fr: 'Aucune source citée', it: 'Nessuna fonte citata' },
  your_domain: { he: 'הדומיין שלך', en: 'Your domain', es: 'Tu dominio', 'pt-BR': 'Seu domínio', fr: 'Votre domaine', it: 'Il vostro dominio' },
  scanning_engine: { he: 'סורק מנוע AI...', en: 'Scanning AI engine…', es: 'Comprobando el motor de IA…', 'pt-BR': 'Verificando o motor de IA…', fr: 'Vérification du moteur d\'IA…', it: 'Verifica del motore di IA in corso…' },
  scan: { he: 'סרוק', en: 'Scan', es: 'Comprobar', 'pt-BR': 'Verificar', fr: 'Vérifier', it: 'Verificare' },
  scan_query: { he: 'סרוק שאלה', en: 'Scan query', es: 'Comprobar la pregunta', 'pt-BR': 'Verificar a pergunta', fr: 'Vérifier la question', it: 'Verificare la domanda' },

  // Engine card states
  scan_btn: { he: 'סרוק', en: 'Scan', es: 'Comprobar', 'pt-BR': 'Verificar', fr: 'Vérifier', it: 'Verificare' },
  scanning: { he: 'סורק...', en: 'Scanning…', es: 'Comprobando…', 'pt-BR': 'Verificando…', fr: 'Vérification…', it: 'Verifica in corso…' },
  failed: { he: 'נכשל', en: 'Failed', es: 'Ha fallado', 'pt-BR': 'Falhou', fr: 'Échec', it: 'Non riuscita' },
  success: { he: 'הצליח', en: 'Success', es: 'Correcto', 'pt-BR': 'Correto', fr: 'Réussi', it: 'Riuscita' },
  error: { he: 'שגיאה', en: 'Error', es: 'Error', 'pt-BR': 'Erro', fr: 'Erreur', it: 'Errore' },
  cited: { he: 'צוטט', en: 'cited', es: 'citado', 'pt-BR': 'citado', fr: 'cité', it: 'citato' },
  mention: { he: 'הזכרה', en: 'mention', es: 'mención', 'pt-BR': 'menção', fr: 'mention', it: 'menzione' },
  no_mention: { he: 'ללא הזכרה', en: 'no mention', es: 'sin menciones', 'pt-BR': 'sem menções', fr: 'aucune mention', it: 'nessuna menzione' },

  // Empty states
  no_queries: { he: 'אין שאלות עדיין', en: 'No AI queries yet', es: 'Todavía no hay preguntas', 'pt-BR': 'Ainda não há perguntas', fr: 'Aucune question d\'IA pour l\'instant', it: 'Nessuna domanda di IA per il momento' },
  // The questions tab, for an owner who never used an AI tool for business:
  // what a question is, and the one next step on an empty list.
  queries_explainer: {
    he: 'שאלה היא מה שלקוח היה כותב ל-ChatGPT או ל-Gemini כשהוא מחפש את מה שאתם מציעים, למשל בקשה להמלצה על עסק בתחום שלכם. אנחנו שואלים את המנועים את השאלה ובודקים אם העסק שלכם מופיע בתשובה. שאלות טובות הן כאלה שלקוחות באמת שואלים, בלי שם העסק.',
    en: 'A question is what a customer would type into ChatGPT or Gemini when looking for what you offer, for example asking for a recommended business in your field. We ask the engines that question and check whether your business shows up in the answer. Good questions are ones real customers ask, without your business name.',
    es: 'Una pregunta es lo que escribiría un cliente en ChatGPT o Gemini buscando lo que tú ofreces, por ejemplo pedir que le recomienden un negocio de tu sector. Le hacemos esa pregunta a los motores y comprobamos si tu negocio aparece en la respuesta. Las buenas preguntas son las que hacen los clientes de verdad, sin el nombre de tu negocio.',
    'pt-BR': 'Uma pergunta é o que um cliente escreveria no ChatGPT ou no Gemini ao buscar o que você oferece, por exemplo pedir a recomendação de um negócio da sua área. Fazemos essa pergunta aos motores e verificamos se o seu negócio aparece na resposta. As boas perguntas são as que os clientes realmente fazem, sem o nome do seu negócio.',
    fr: 'Une question, c\'est ce qu\'un client taperait dans ChatGPT ou Gemini en cherchant ce que vous proposez, par exemple en demandant une entreprise recommandée dans votre domaine. Nous posons cette question aux moteurs et vérifions si votre entreprise apparaît dans la réponse. Les bonnes questions sont celles que de vrais clients posent, sans le nom de votre entreprise.',
    it: 'Una domanda è ciò che un cliente digiterebbe su ChatGPT o Gemini cercando quello che offrite, per esempio chiedendo un\'attività consigliata nel vostro settore. La domanda viene posta ai motori e viene verificato se la vostra attività compare nella risposta. Le domande valide sono quelle che i clienti reali pongono, senza il nome della vostra attività.',
  },
  no_queries_title: { he: 'עוד אין שאלות במעקב', en: 'No questions tracked yet', es: 'Todavía no hay preguntas en seguimiento', 'pt-BR': 'Ainda não há perguntas em acompanhamento', fr: 'Aucune question suivie pour l\'instant', it: 'Nessuna domanda monitorata per il momento' },
  no_queries_body: {
    he: 'הצעד הראשון: בחרו שאלה אחת או שתיים שלקוחות שלכם שואלים. אפשר לבחור מהשאלות המוצעות למטה או לכתוב שאלה משלכם. הוספת שאלה לא עולה כלום, רק בדיקה נספרת במכסה.',
    en: 'First step: pick one or two questions your customers ask. Choose from the suggestions below or write your own. Adding a question costs nothing; only a check counts toward your allowance.',
    es: 'Primer paso: elige una o dos preguntas que hagan tus clientes. Escoge entre las propuestas de abajo o escribe la tuya. Añadir una pregunta no cuesta nada; solo las comprobaciones cuentan dentro de tu límite.',
    'pt-BR': 'Primeiro passo: escolha uma ou duas perguntas que os seus clientes fazem. Escolha entre as sugestões abaixo ou escreva a sua. Adicionar uma pergunta não custa nada; só as verificações contam no seu limite.',
    fr: 'Première étape : choisissez une ou deux questions que vos clients posent. Prenez-les dans les suggestions ci-dessous ou écrivez les vôtres. Ajouter une question ne coûte rien ; seule une vérification est décomptée de votre quota.',
    it: 'Primo passo: scegliere una o due domande che i vostri clienti pongono. Si possono prendere dai suggerimenti qui sotto oppure scrivere le proprie. Aggiungere una domanda non costa nulla; solo una verifica viene scalata dalla vostra quota.',
  },
  no_queries_pick: { he: 'בחירה מהשאלות המוצעות', en: 'Pick a suggested question', es: 'Elegir una pregunta propuesta', 'pt-BR': 'Escolher uma pergunta sugerida', fr: 'Choisir une question suggérée', it: 'Scegliere una domanda suggerita' },
  no_queries_write: { he: 'כתיבת שאלה משלכם', en: 'Write your own question', es: 'Escribir tu propia pregunta', 'pt-BR': 'Escrever a sua própria pergunta', fr: 'Écrire votre propre question', it: 'Scrivere una domanda propria' },
  no_queries_help: {
    he: 'צור שאלות חכמות מותאמות לעסק שלך, או צור שאלה באופן ידני.',
    en: 'Generate smart AI questions tailored to your business, or create one manually.',
    es: 'Genera preguntas inteligentes hechas a medida de tu negocio, o crea una a mano.',
    'pt-BR': 'Gere perguntas inteligentes sob medida para o seu negócio, ou crie uma manualmente.',
    fr: 'Générez des questions d\'IA adaptées à votre entreprise, ou créez-en une manuellement.',
    it: 'Si possono generare domande di IA adatte alla vostra attività oppure crearne una manualmente.',
  },
  no_scans: { he: 'אין סריקות עדיין', en: 'No scans yet', es: 'Todavía no hay comprobaciones', 'pt-BR': 'Ainda não há verificações', fr: 'Aucune vérification pour l\'instant', it: 'Nessuna verifica per il momento' },
  no_scans_help: {
    he: 'סרוק שאלה מול מנוע AI כדי להתחיל לעקוב.',
    en: 'Scan an AI query against an engine to start tracking activity.',
    es: 'Comprueba una pregunta en un motor de IA para empezar a seguirla.',
    'pt-BR': 'Verifique uma pergunta em um motor de IA para começar a acompanhá-la.',
    fr: 'Vérifiez une question d\'IA sur un moteur pour commencer à suivre l\'activité.',
    it: 'Verificare una domanda di IA su un motore per iniziare a seguire l\'attività.',
  },

  // Scan history
  scan_activity: { he: 'פעילות סריקה', en: 'Scan activity', es: 'Actividad de comprobación', 'pt-BR': 'Atividade de verificação', fr: 'Activité des vérifications', it: 'Attività delle verifiche' },
  scan_history: { he: 'היסטוריית סריקה', en: 'Scan history', es: 'Historial de comprobaciones', 'pt-BR': 'Histórico de verificações', fr: 'Historique des vérifications', it: 'Cronologia delle verifiche' },
  events: { he: 'אירועים', en: 'events', es: 'eventos', 'pt-BR': 'eventos', fr: 'événements', it: 'eventi' },
  event: { he: 'אירוע', en: 'event', es: 'evento', 'pt-BR': 'evento', fr: 'événement', it: 'evento' },
  viewing: { he: 'מוצג', en: 'Viewing', es: 'Viendo', 'pt-BR': 'Vendo', fr: 'Affichage', it: 'Visualizzazione' },
  open: { he: 'פתח', en: 'Open', es: 'Abrir', 'pt-BR': 'Abrir', fr: 'Ouvrir', it: 'Aprire' },
  just_now: { he: 'עכשיו', en: 'just now', es: 'ahora mismo', 'pt-BR': 'agora mesmo', fr: 'à l\'instant', it: 'adesso' },
  loading: { he: 'טוען...', en: 'Loading…', es: 'Cargando…', 'pt-BR': 'Carregando…', fr: 'Chargement…', it: 'Caricamento…' },

  // Delete modal
  delete_scan_title: { he: 'למחוק תוצאת סריקה?', en: 'Delete scan result?', es: '¿Eliminar el resultado?', 'pt-BR': 'Excluir o resultado?', fr: 'Supprimer ce résultat ?', it: 'Eliminare questo risultato?' },
  delete_scan_body: {
    he: 'פעולה זו תמחק לצמיתות את תוצאת הסריקה, התשובה וכל הציטוטים. לא ניתן לבטל פעולה זו.',
    en: 'This will permanently delete the AI scan result, response, and all associated citations. This action cannot be undone.',
    es: 'Se eliminarán definitivamente el resultado de la comprobación, la respuesta y todas sus citas. Esto no se puede deshacer.',
    'pt-BR': 'O resultado da verificação, a resposta e todas as citações serão excluídos definitivamente. Isso não pode ser desfeito.',
    fr: 'Cela supprimera définitivement le résultat de la vérification d\'IA, la réponse et toutes les citations associées. Cette action est irréversible.',
    it: 'Il risultato della verifica di IA, la risposta e tutte le citazioni associate verranno eliminati definitivamente. L\'operazione è irreversibile.',
  },

  // Smart AI questions modal
  smart_questions_title: { he: 'שאלות AI מומלצות', en: 'Recommended AI Questions', es: 'Preguntas de IA recomendadas', 'pt-BR': 'Perguntas de IA recomendadas', fr: 'Questions d\'IA recommandées', it: 'Domande di IA consigliate' },
  smart_questions_subtitle: {
    he: 'רק שאלות שהעסק יכול לזכות בהן: בתחום שלו, עם לקוח שעומד להחליט, ועם עמוד שעונה או מאמר שאפשר לכתוב. בדיקה רצה רק על שאלה שהוספתם.',
    en: 'Only questions the business can win: in its field, asked by someone about to decide, with a page that answers or an article to write. A check runs only on a question you add.',
    es: 'Solo preguntas que el negocio puede ganar: de su sector, hechas por alguien a punto de decidir, y con una página que responde o un artículo que se puede escribir. Solo se comprueba una pregunta que hayas añadido.',
    'pt-BR': 'Apenas perguntas que o negócio pode vencer: da sua área, feitas por alguém prestes a decidir, e com uma página que responde ou um artigo que pode ser escrito. Só é verificada uma pergunta que você tenha adicionado.',
    fr: 'Uniquement des questions que l\'entreprise peut gagner : dans son domaine, posées par quelqu\'un sur le point de décider, avec une page qui y répond ou un article à écrire. Une vérification ne part que sur une question que vous ajoutez.',
    it: 'Solo domande che l\'attività può vincere: nel suo settore, poste da chi è sul punto di decidere, con una pagina che risponde o un articolo da scrivere. Una verifica parte solo su una domanda che viene aggiunta.',
  },
  smart_questions_help: {
    he: 'שאלות מוכנות מותאמות לעסק שלך. בחר מרובה, ערוך, או הוסף בודד.',
    en: 'Smart AI questions tailored to your business. Select multiple, edit, or add one-by-one.',
    es: 'Preguntas de IA hechas a medida de tu negocio. Selecciona varias, edítalas o añádelas de una en una.',
    'pt-BR': 'Perguntas de IA sob medida para o seu negócio. Selecione várias, edite-as ou adicione-as uma a uma.',
    fr: 'Des questions d\'IA adaptées à votre entreprise. Sélectionnez-en plusieurs, modifiez-les ou ajoutez-les une à une.',
    it: 'Domande di IA adatte alla vostra attività. Si possono selezionare più domande, modificarle oppure aggiungerle una alla volta.',
  },
  add_question_label: { he: 'הוסף שאלה למעקב', en: 'Add question to tracking', es: 'Añadir la pregunta al seguimiento', 'pt-BR': 'Adicionar a pergunta ao acompanhamento', fr: 'Ajouter la question au suivi', it: 'Aggiungere la domanda al monitoraggio' },
  already_tracked: { he: 'כבר במעקב', en: 'Already tracked', es: 'Ya está en seguimiento', 'pt-BR': 'Já está em acompanhamento', fr: 'Déjà suivie', it: 'Già monitorata' },
  all_added: { he: 'כל השאלות נוספו', en: 'All questions were added', es: 'Se han añadido todas las preguntas', 'pt-BR': 'Todas as perguntas foram adicionadas', fr: 'Toutes les questions ont été ajoutées', it: 'Tutte le domande sono state aggiunte' },
  loading_suggestions: {
    he: 'טוען שאלות מומלצות...',
    en: 'Loading suggested questions...',
    es: 'Cargando las preguntas recomendadas…',
    'pt-BR': 'Carregando as perguntas recomendadas…',
    fr: 'Chargement des questions suggérées...',
    it: 'Caricamento delle domande suggerite...',
  },
  no_new_suggestions: {
    he: 'לא נמצאו שאלות מומלצות חדשות כרגע.',
    en: 'No new suggested questions found right now.',
    es: 'Ahora mismo no hemos encontrado preguntas recomendadas nuevas.',
    'pt-BR': 'No momento, não encontramos novas perguntas recomendadas.',
    fr: 'Aucune nouvelle question suggérée pour le moment.',
    it: 'Nessuna nuova domanda suggerita per il momento.',
  },
  no_diverse_suggestions: {
    he: 'לא נמצאו כרגע עוד שאלות מגוונות. כדי לקבל עוד המלצות, הוסיפו מילות מפתח נוספות, שירותים או קטגוריות.',
    en: 'No more diverse questions were found right now. Add more keywords, services, or categories to get more suggestions.',
    es: 'Ahora mismo no hay más preguntas variadas. Para recibir más propuestas, añade palabras clave, servicios o categorías.',
    'pt-BR': 'No momento, não há mais perguntas variadas. Para receber mais sugestões, adicione palavras-chave, serviços ou categorias.',
    fr: 'Aucune question plus variée n\'a été trouvée pour le moment. Ajoutez des mots-clés, des services ou des catégories pour obtenir plus de suggestions.',
    it: 'Per il momento non sono state trovate domande più varie. Aggiungere parole chiave, servizi o categorie per ottenere più suggerimenti.',
  },
  pool_exhausted_rich: {
    he: 'כל השאלות האיכותיות הזמינות כבר מוצגות. ניתן להוסיף שאלות ידנית או להרחיב את קטגוריות השירות בפרופיל.',
    en: 'All available high-quality questions are already displayed. You can add questions manually or expand service categories in the profile.',
    es: 'Ya se muestran todas las preguntas de calidad disponibles. Puedes añadir preguntas a mano o ampliar las categorías de servicio en el perfil.',
    'pt-BR': 'Todas as perguntas de qualidade disponíveis já estão sendo exibidas. Você pode adicionar perguntas manualmente ou ampliar as categorias de serviço no perfil.',
    fr: 'Toutes les questions de qualité disponibles sont déjà affichées. Vous pouvez ajouter des questions manuellement ou élargir les catégories de services dans le profil.',
    it: 'Tutte le domande di qualità disponibili sono già visualizzate. Si possono aggiungere domande manualmente oppure ampliare le categorie di servizi nel profilo.',
  },
  pool_exhausted_thin: {
    he: 'כדי לקבל עוד שאלות, הוסיפו מילות מפתח, שירותים או קטגוריות בפרופיל.',
    en: 'To get more questions, add keywords, services, or categories to the profile.',
    es: 'Para recibir más preguntas, añade palabras clave, servicios o categorías en el perfil.',
    'pt-BR': 'Para receber mais perguntas, adicione palavras-chave, serviços ou categorias no perfil.',
    fr: 'Pour obtenir plus de questions, ajoutez des mots-clés, des services ou des catégories au profil.',
    it: 'Per ottenere più domande, aggiungere parole chiave, servizi o categorie al profilo.',
  },
  refresh_suggestions: { he: 'רענן', en: 'Refresh', es: 'Actualizar', 'pt-BR': 'Atualizar', fr: 'Actualiser', it: 'Aggiornare' },
  generate_more_suggestions: { he: 'צור עוד שאלות', en: 'Generate more questions', es: 'Generar más preguntas', 'pt-BR': 'Gerar mais perguntas', fr: 'Générer plus de questions', it: 'Generare più domande' },
  generating_more: { he: 'יוצר שאלות נוספות...', en: 'Generating more questions...', es: 'Generando más preguntas…', 'pt-BR': 'Gerando mais perguntas…', fr: 'Génération de nouvelles questions...', it: 'Generazione di nuove domande...' },
  rescan: { he: 'סריקה מחדש', en: 'Rescan', es: 'Volver a comprobar', 'pt-BR': 'Verificar novamente', fr: 'Vérifier à nouveau', it: 'Verificare di nuovo' },
  scan_this_engine: { he: 'סרוק במנוע הזה', en: 'Scan this engine', es: 'Comprobar en este motor', 'pt-BR': 'Verificar neste motor', fr: 'Vérifier ce moteur', it: 'Verificare questo motore' },
  // The engine chips ARE the run control, but they read as status badges — a
  // reviewer looking for a "Run" action found only the delete icon. A visible
  // instruction above them, and an accessible name that says what the click
  // does, is what makes an existing control discoverable.
  // The automatic monthly check (UX review B): the customer no longer picks an
  // engine. One button checks a question on the three main engines; single
  // engines (all six) sit in the question's ⋯ menu.
  run_a_check_hint: {
    he: 'כל שאלה נבדקת ב-ChatGPT, ב-Gemini וב-Google AI בלחיצה אחת. בדיקה במנוע אחד, או במנועים נוספים (Perplexity, Copilot, Grok), נמצאת בתפריט ⋯ של השאלה. כל מנוע הוא בדיקה אחת מהמכסה.',
    en: 'Each question is checked on ChatGPT, Gemini and Google AI in one click. A check on a single engine, or on more engines (Perplexity, Copilot, Grok), is in the ⋯ menu of the question. Each engine is one check from your allowance.',
    es: 'Cada pregunta se comprueba en ChatGPT, Gemini y Google AI con un solo clic. La comprobación en un único motor, o en más motores (Perplexity, Copilot, Grok), está en el menú ⋯ de la pregunta. Cada motor es una comprobación de tu límite.',
    'pt-BR': 'Cada pergunta é verificada no ChatGPT, no Gemini e no Google AI com um único clique. A verificação em um único motor, ou em mais motores (Perplexity, Copilot, Grok), fica no menu ⋯ da pergunta. Cada motor conta como uma verificação do seu limite.',
    fr: 'Chaque question est vérifiée sur ChatGPT, Gemini et Google AI en un clic. Une vérification sur un seul moteur, ou sur d\'autres moteurs (Perplexity, Copilot, Grok), se trouve dans le menu ⋯ de la question. Chaque moteur compte pour une vérification de votre quota.',
    it: 'Ogni domanda viene verificata su ChatGPT, Gemini e Google AI con un clic. La verifica su un solo motore, o su altri motori (Perplexity, Copilot, Grok), si trova nel menu ⋯ della domanda. Ogni motore conta come una verifica della vostra quota.',
  },
  check_question_all: { he: 'בדיקה עכשיו ({n} בדיקות)', en: 'Check now ({n} checks)', es: 'Comprobar ahora ({n} comprobaciones)', 'pt-BR': 'Verificar agora ({n} verificações)', fr: 'Vérifier maintenant ({n} vérifications)', it: 'Verificare ora ({n} verifiche)' },
  recheck_question_all: { he: 'בדיקה חוזרת ({n} בדיקות)', en: 'Recheck ({n} checks)', es: 'Volver a comprobar ({n} comprobaciones)', 'pt-BR': 'Verificar novamente ({n} verificações)', fr: 'Vérifier à nouveau ({n} vérifications)', it: 'Verificare di nuovo ({n} verifiche)' },
  recheck_not_enough: { he: 'אין מספיק בדיקות החודש', en: 'Not enough checks left this month', es: 'No quedan suficientes comprobaciones este mes', 'pt-BR': 'Não restam verificações suficientes neste mês', fr: 'Il ne reste pas assez de vérifications ce mois-ci', it: 'Non restano abbastanza verifiche questo mese' },
  recheck_running: { he: 'בודקים… {done}/{n}', en: 'Checking… {done}/{n}', es: 'Comprobando… {done}/{n}', 'pt-BR': 'Verificando… {done}/{n}', fr: 'Vérification… {done}/{n}', it: 'Verifica… {done}/{n}' },
  recheck_partial_failed: { he: 'חלק מהבדיקות לא הושלמו. אפשר לנסות שוב בעוד רגע.', en: 'Some of the checks did not finish. You can try again in a moment.', es: 'Algunas comprobaciones no han terminado. Puedes volver a intentarlo dentro de un momento.', 'pt-BR': 'Algumas verificações não terminaram. Você pode tentar novamente daqui a pouco.', fr: 'Certaines vérifications ne sont pas allées au bout. Vous pouvez réessayer dans un instant.', it: 'Alcune verifiche non sono andate a termine. Si può riprovare tra un momento.' },
  check_on_engine_menu: { he: 'בדיקה ב-{engine} (בדיקה אחת)', en: 'Check on {engine} (1 check)', es: 'Comprobar en {engine} (1 comprobación)', 'pt-BR': 'Verificar no {engine} (1 verificação)', fr: 'Vérifier sur {engine} (1 vérification)', it: 'Verificare su {engine} (1 verifica)' },
  engine_status_label: { he: '{engine}: {status}', en: '{engine}: {status}', es: '{engine}: {status}', 'pt-BR': '{engine}: {status}', fr: '{engine} : {status}', it: '{engine}: {status}' },
  run_tag_automatic: { he: 'אוטומטית', en: 'Automatic', es: 'Automática', 'pt-BR': 'Automática', fr: 'Automatique', it: 'Automatica' },
  run_check_on: { he: 'הרץ בדיקת AI ב-', en: 'Run an AI check on ', es: 'Hacer una comprobación de IA en ', 'pt-BR': 'Fazer uma verificação de IA no ', fr: 'Lancer une vérification d\'IA sur ', it: 'Lanciare una verifica di IA su ' },
  rerun_check_on: { he: 'הרץ שוב בדיקת AI ב-', en: 'Run another AI check on ', es: 'Hacer otra comprobación de IA en ', 'pt-BR': 'Fazer outra verificação de IA no ', fr: 'Lancer une autre vérification d\'IA sur ', it: 'Lanciare un\'altra verifica di IA su ' },
  engines_show_rest: { he: 'הצגת כל המנועים (עוד {n})', en: 'Show all engines ({n} more)', es: 'Ver todos los motores ({n} más)', 'pt-BR': 'Ver todos os motores (mais {n})', fr: 'Afficher tous les moteurs ({n} de plus)', it: 'Mostrare tutti i motori ({n} in più)' },
  ai_allowance: { he: 'בדיקות AI שנוצלו', en: 'AI checks used', es: 'Comprobaciones de IA usadas', 'pt-BR': 'Verificações de IA usadas', fr: 'Vérifications d\'IA utilisées', it: 'Verifiche di IA utilizzate' },
  ai_allowance_unknown: { he: 'לא ניתן לאמת כרגע את המכסה', en: 'The allowance could not be read right now', es: 'Ahora mismo no se puede leer el límite', 'pt-BR': 'No momento, não é possível ler o limite', fr: 'Le quota n\'a pas pu être lu pour le moment', it: 'Per il momento non è stato possibile leggere la quota' },
  ai_allowance_unmetered: { he: 'ללא מגבלה', en: 'Unmetered', es: 'Sin límite', 'pt-BR': 'Sem limite', fr: 'Sans limite', it: 'Senza limite' },
  ai_allowance_exhausted: {
    he: 'ניצלתם את כל בדיקות ה-AI שכלולות בחבילה',
    en: 'You have used every AI check your plan includes',
    es: 'Has usado todas las comprobaciones de IA que incluye tu plan',
    'pt-BR': 'Você usou todas as verificações de IA incluídas no seu plano',
    fr: 'Vous avez utilisé toutes les vérifications d\'IA incluses dans votre forfait',
    it: 'Sono state utilizzate tutte le verifiche di IA incluse nel vostro piano',
  },
  ai_allowance_not_included: { he: 'לא כלולות בחבילה', en: 'not included in your plan', es: 'no están incluidas en tu plan', 'pt-BR': 'não estão incluídas no seu plano', fr: 'non inclus dans votre forfait', it: 'non incluse nel vostro piano' },
  ai_allowance_none_body: {
    he: 'החבילה הנוכחית לא כוללת בדיקות AI, לכן אי אפשר להריץ בדיקה כרגע. אפשר כבר עכשיו להוסיף שאלות, ולבדוק אותן אחרי שדרוג.',
    en: 'Your current plan does not include AI checks, so a check cannot run right now. You can add questions now and check them after upgrading.',
    es: 'Tu plan actual no incluye comprobaciones de IA, así que ahora mismo no se puede hacer ninguna. Puedes añadir preguntas ya y comprobarlas después de cambiar de plan.',
    'pt-BR': 'Seu plano atual não inclui verificações de IA, então no momento não é possível fazer nenhuma. Você já pode adicionar perguntas e verificá-las depois de trocar de plano.',
    fr: 'Votre forfait actuel n\'inclut pas de vérifications d\'IA, une vérification ne peut donc pas être lancée pour le moment. Vous pouvez ajouter des questions dès maintenant et les vérifier après un changement de forfait.',
    it: 'Il vostro piano attuale non include verifiche di IA, quindi per il momento non è possibile lanciare una verifica. Si possono aggiungere domande subito e verificarle dopo il passaggio a un altro piano.',
  },
  ai_allowance_upgrade: { he: 'לשדרוג החבילה', en: 'Upgrade your plan', es: 'Cambiar de plan', 'pt-BR': 'Trocar de plano', fr: 'Changer de forfait', it: 'Cambiare piano' },
  chip_legend: {
    he: 'סימן ✓ ליד מנוע: הוא הזכיר אתכם בבדיקה האחרונה. סימן –: נבדק ולא הזכיר אתכם. בלי סימן: עוד לא נבדק.',
    en: 'A ✓ by an engine: it mentioned you in the last check. A –: checked, and it did not mention you. No mark: not checked yet.',
    es: 'Un ✓ junto a un motor: te mencionó en la última comprobación. Un –: lo comprobamos y no te mencionó. Sin marca: todavía sin comprobar.',
    'pt-BR': 'Um ✓ ao lado de um motor: mencionou você na última verificação. Um –: verificamos e não mencionou você. Sem marca: ainda não verificado.',
    fr: 'Un ✓ à côté d\'un moteur : il vous a mentionné lors de la dernière vérification. Un – : vérifié, et il ne vous a pas mentionné. Aucune marque : pas encore vérifié.',
    it: 'Un ✓ accanto a un motore: vi ha menzionati nell\'ultima verifica. Un –: verificato, e non vi ha menzionati. Nessun segno: non ancora verificato.',
  },
  chip_mentioned: { he: 'הזכיר אתכם', en: 'mentioned you', es: 'te mencionó', 'pt-BR': 'mencionou você', fr: 'vous a mentionné', it: 'vi ha menzionati' },
  chip_not_mentioned: { he: 'נבדק, לא הזכיר אתכם', en: 'checked, did not mention you', es: 'comprobado, no te mencionó', 'pt-BR': 'verificado, não mencionou você', fr: 'vérifié, ne vous a pas mentionné', it: 'verificato, non vi ha menzionati' },
  chip_not_checked: { he: 'עוד לא נבדק', en: 'not checked yet', es: 'todavía sin comprobar', 'pt-BR': 'ainda não verificado', fr: 'pas encore vérifié', it: 'non ancora verificato' },
  query_label: { he: 'שאלת AI', en: 'AI Query', es: 'Pregunta de IA', 'pt-BR': 'Pergunta de IA', fr: 'Question d\'IA', it: 'Domanda di IA' },
  country_label: { he: 'מדינה (ISO)', en: 'Country (ISO)', es: 'País (ISO)', 'pt-BR': 'País (ISO)', fr: 'Pays (ISO)', it: 'Paese (ISO)' },
  language_label: { he: 'שפה', en: 'Language', es: 'Idioma', 'pt-BR': 'Idioma', fr: 'Langue', it: 'Lingua' },
  target_domain_label: { he: 'דומיין יעד (לא חובה)', en: 'Target domain (optional)', es: 'Dominio objetivo (opcional)', 'pt-BR': 'Domínio-alvo (opcional)', fr: 'Domaine cible (facultatif)', it: 'Dominio di riferimento (facoltativo)' },
  target_brand_label: { he: 'מותג יעד (לא חובה)', en: 'Target brand (optional)', es: 'Marca objetivo (opcional)', 'pt-BR': 'Marca-alvo (opcional)', fr: 'Marque cible (facultatif)', it: 'Marchio di riferimento (facoltativo)' },
  new_ai_query_title: { he: 'שאלת AI חדשה', en: 'New AI Query', es: 'Nueva pregunta de IA', 'pt-BR': 'Nova pergunta de IA', fr: 'Nouvelle question d\'IA', it: 'Nuova domanda di IA' },
  create_query: { he: 'צור שאלה', en: 'Create query', es: 'Crear la pregunta', 'pt-BR': 'Criar a pergunta', fr: 'Créer la question', it: 'Creare la domanda' },

  // Intent labels
  intent_brand: { he: 'מותג', en: 'Brand', es: 'Marca', 'pt-BR': 'Marca', fr: 'Marque', it: 'Marchio' },
  intent_comparison: { he: 'השוואה', en: 'Comparison', es: 'Comparación', 'pt-BR': 'Comparação', fr: 'Comparaison', it: 'Confronto' },
  intent_commercial: { he: 'מסחרי', en: 'Commercial', es: 'Comercial', 'pt-BR': 'Comercial', fr: 'Commercial', it: 'Commerciale' },
  intent_local: { he: 'מקומי', en: 'Local', es: 'Local', 'pt-BR': 'Local', fr: 'Local', it: 'Locale' },
  intent_transactional: { he: 'מסחרי', en: 'Transactional', es: 'Transaccional', 'pt-BR': 'Transacional', fr: 'Transactionnel', it: 'Transazionale' },
  intent_recommendation: { he: 'המלצה', en: 'Recommendation', es: 'Recomendación', 'pt-BR': 'Recomendação', fr: 'Recommandation', it: 'Raccomandazione' },
  intent_informational: { he: 'מידע', en: 'Informational', es: 'Informativa', 'pt-BR': 'Informativa', fr: 'Informationnel', it: 'Informativo' },
  intent_alternatives: { he: 'חלופות', en: 'Alternatives', es: 'Alternativas', 'pt-BR': 'Alternativas', fr: 'Alternatives', it: 'Alternative' },
  intent_best_of: { he: 'הטובים ביותר', en: 'Best of', es: 'Los mejores', 'pt-BR': 'Os melhores', fr: 'Meilleurs', it: 'Migliori' },
  intent_pre_purchase: { he: 'מידע לפני רכישה', en: 'Pre-purchase', es: 'Antes de comprar', 'pt-BR': 'Antes de comprar', fr: 'Avant-achat', it: 'Prima dell\'acquisto' },
  intent_gift: { he: 'מתנה', en: 'Gift', es: 'Regalo', 'pt-BR': 'Presente', fr: 'Cadeau', it: 'Regalo' },

  // Workspace layout
  select_query_to_view: { he: 'בחר שאלה כדי להציג את פרטיה', en: 'Select a query to view details', es: 'Elige una pregunta para ver sus detalles', 'pt-BR': 'Escolha uma pergunta para ver os detalhes', fr: 'Sélectionnez une question pour voir les détails', it: 'Selezionare una domanda per vedere i dettagli' },
  select_and_run_query: { he: 'בחר שאלה והרץ לתוך מנוע כדי לראות את התוצאות', en: 'Select a query and run it against an engine to see results', es: 'Elige una pregunta y compruébala en un motor para ver los resultados', 'pt-BR': 'Escolha uma pergunta e verifique-a em um motor para ver os resultados', fr: 'Sélectionnez une question et lancez-la sur un moteur pour voir les résultats', it: 'Selezionare una domanda e lanciarla su un motore per vedere i risultati' },

  // New dashboard structure
  engine: { he: 'מנוע', en: 'Engine', es: 'Motor', 'pt-BR': 'Motor', fr: 'Moteur', it: 'Motore' },
  engines: { he: 'מנועים', en: 'engines', es: 'motores', 'pt-BR': 'motores', fr: 'moteurs', it: 'motori' },
  ai_engines: { he: 'מנועי AI', en: 'AI engines', es: 'motores de IA', 'pt-BR': 'motores de IA', fr: 'Moteurs d\'IA', it: 'Motori di IA' },
  of_n_ai_engines: { he: 'מתוך {count} מנועי AI', en: 'of {count} AI engines', es: 'de {count} motores de IA', 'pt-BR': 'de {count} motores de IA', fr: 'sur {count} moteurs d\'IA', it: 'su {count} motori di IA' },
  all_engines: { he: 'כל המנועים', en: 'All engines', es: 'Todos los motores', 'pt-BR': 'Todos os motores', fr: 'Tous les moteurs', it: 'Tutti i motori' },
  all_mention: { he: 'כל האזכורים', en: 'All mentions', es: 'Todas las menciones', 'pt-BR': 'Todas as menções', fr: 'Toutes les mentions', it: 'Tutte le menzioni' },
  all_citations: { he: 'כל הציטוטים', en: 'All citations', es: 'Todas las citas', 'pt-BR': 'Todas as citações', fr: 'Toutes les citations', it: 'Tutte le citazioni' },
  // The results filter's selects, by name (axe: a select needs an accessible name).
  filter_engine: { he: 'סינון לפי מנוע', en: 'Filter by engine', es: 'Filtrar por motor', 'pt-BR': 'Filtrar por motor', fr: 'Filtrer par moteur', it: 'Filtrare per motore' },
  filter_mention: { he: 'סינון לפי אזכור', en: 'Filter by mention', es: 'Filtrar por mención', 'pt-BR': 'Filtrar por menção', fr: 'Filtrer par mention', it: 'Filtrare per menzione' },
  filter_citation: { he: 'סינון לפי ציטוט', en: 'Filter by citation', es: 'Filtrar por cita', 'pt-BR': 'Filtrar por citação', fr: 'Filtrer par citation', it: 'Filtrare per citazione' },
  overall: { he: 'כולל', en: 'Overall', es: 'Total', 'pt-BR': 'Total', fr: 'Global', it: 'Complessivo' },
  search: { he: 'חיפוש', en: 'Search', es: 'Buscar', 'pt-BR': 'Buscar', fr: 'Recherche', it: 'Ricerca' },

  // Engine summary card labels (lowercase metric units)
  mentions: { he: 'אזכורים', en: 'mentions', es: 'menciones', 'pt-BR': 'menções', fr: 'mentions', it: 'menzioni' },
  scans: { he: 'סריקות', en: 'scans', es: 'comprobaciones', 'pt-BR': 'verificações', fr: 'vérifications', it: 'verifiche' },

  // AI Queries panel
  ai_queries: { he: 'שאלות AI', en: 'AI Queries', es: 'Preguntas de IA', 'pt-BR': 'Perguntas de IA', fr: 'Questions d\'IA', it: 'Domande di IA' },
  not_scanned_yet: { he: 'לא נסרק', en: 'Not scanned yet', es: 'Sin comprobar', 'pt-BR': 'Sem verificar', fr: 'Pas encore vérifiée', it: 'Non ancora verificata' },
  scan_engine: { he: 'סרוק', en: 'Scan', es: 'Comprobar', 'pt-BR': 'Verificar', fr: 'Vérifier', it: 'Verificare' },
  query_already_exists: { he: 'השאלה כבר קיימת', en: 'Query already exists', es: 'La pregunta ya existe', 'pt-BR': 'A pergunta já existe', fr: 'La question existe déjà', it: 'La domanda esiste già' },
  of_engines: { he: 'מתוך 6 מנועים', en: 'of 6 engines', es: 'de 6 motores', 'pt-BR': 'de 6 motores', fr: 'sur 6 moteurs', it: 'su 6 motori' },

  // Tabs
  tab_overview: { he: 'סקירה', en: 'Overview', es: 'Resumen', 'pt-BR': 'Resumo', fr: 'Vue d\'ensemble', it: 'Panoramica' },
  tab_results: { he: 'תוצאות', en: 'Results', es: 'Resultados', 'pt-BR': 'Resultados', fr: 'Résultats', it: 'Risultati' },
  tab_queries: { he: 'שאלות AI', en: 'AI Queries', es: 'Preguntas de IA', 'pt-BR': 'Perguntas de IA', fr: 'Questions d\'IA', it: 'Domande di IA' },
  tab_insights: { he: 'תובנות והמלצות', en: 'Insights & Recommendations', es: 'Ideas y recomendaciones', 'pt-BR': 'Ideias e recomendações', fr: 'Analyses et recommandations', it: 'Analisi e raccomandazioni' },
  tab_competitors: { he: 'מתחרים', en: 'Competitors', es: 'Competencia', 'pt-BR': 'Concorrência', fr: 'Concurrents', it: 'Concorrenti' },
  showing_results: { he: 'מציג {count} תוצאות', en: 'Showing {count} results', es: 'Mostrando {count} resultados', 'pt-BR': 'Mostrando {count} resultados', fr: '{count} résultats affichés', it: '{count} risultati visualizzati' },
  mentions_by_engine: { he: 'אזכורים לפי מנוע AI', en: 'Mentions by AI Engine', es: 'Menciones por motor de IA', 'pt-BR': 'Menções por motor de IA', fr: 'Mentions par moteur d\'IA', it: 'Menzioni per motore di IA' },
  total_mentions: { he: 'סה״כ אזכורים', en: 'Total mentions', es: 'Total de menciones', 'pt-BR': 'Total de menções', fr: 'Total des mentions', it: 'Totale delle menzioni' },
  visibility_percent: { he: 'אחוז נראות', en: 'Visibility', es: 'Visibilidad', 'pt-BR': 'Visibilidade', fr: 'Visibilité', it: 'Visibilità' },
  out_of_one_result: { he: 'מתוך תשובה אחת', en: 'out of 1 answer', es: 'de 1 respuesta', 'pt-BR': 'de 1 resposta', fr: 'sur 1 réponse', it: 'su 1 risposta' },
  out_of_results: { he: 'מתוך {count} תשובות', en: 'out of {count} answers', es: 'de {count} respuestas', 'pt-BR': 'de {count} respostas', fr: 'sur {count} réponses', it: 'su {count} risposte' },

  // Delete AI question
  delete_question_title: { he: 'למחוק שאלה?', en: 'Delete question?', es: '¿Eliminar la pregunta?', 'pt-BR': 'Excluir a pergunta?', fr: 'Supprimer la question ?', it: 'Eliminare la domanda?' },
  delete_question_body: {
    he: 'פעולה זו תמחק את השאלה. תוצאות סריקה קיימות יישארו בארכיון אך לא יוצגו כאן.',
    en: 'This will delete the question. Existing scan results stay archived but will no longer appear here.',
    es: 'Se eliminará la pregunta. Los resultados que ya existen quedan archivados, pero dejan de aparecer aquí.',
    'pt-BR': 'A pergunta será excluída. Os resultados que já existem ficam arquivados, mas deixam de aparecer aqui.',
    fr: 'Cela supprimera la question. Les résultats déjà obtenus restent archivés mais n\'apparaîtront plus ici.',
    it: 'La domanda verrà eliminata. I risultati già ottenuti restano archiviati ma non compariranno più qui.',
  },

  // Multi-question input
  multi_query_placeholder: {
    he: 'שאלה אחת בכל שורה',
    en: 'One question per line',
    es: 'Una pregunta por línea',
    'pt-BR': 'Uma pergunta por linha',
    fr: 'Une question par ligne',
    it: 'Una domanda per riga',
  },
  multi_query_help: {
    he: 'הפרד כל שאלה בשורה חדשה',
    en: 'Separate each question with a new line',
    es: 'Separa cada pregunta con un salto de línea',
    'pt-BR': 'Separe cada pergunta com uma quebra de linha',
    fr: 'Séparez chaque question par un retour à la ligne',
    it: 'Separare ogni domanda con un ritorno a capo',
  },
  will_create_n_queries: {
    he: 'ייווצרו {count} שאלות AI',
    en: '{count} AI queries will be created',
    es: 'Se crearán {count} preguntas de IA',
    'pt-BR': 'Serão criadas {count} perguntas de IA',
    fr: '{count} questions d\'IA seront créées',
    it: 'Verranno create {count} domande di IA',
  },
  will_create_one_query: {
    he: 'תיווצר שאלת AI אחת',
    en: '1 AI query will be created',
    es: 'Se creará 1 pregunta de IA',
    'pt-BR': 'Será criada 1 pergunta de IA',
    fr: '1 question d\'IA sera créée',
    it: 'Verrà creata 1 domanda di IA',
  },

  // Result row enrichments
  what_was_mentioned: { he: 'מה הוזכר', en: 'What was mentioned', es: 'Qué se ha mencionado', 'pt-BR': 'O que foi mencionado', fr: 'Ce qui a été mentionné', it: 'Che cosa è stato menzionato' },
  what_was_cited: { he: 'מה צוטט', en: 'What was cited', es: 'Qué se ha citado', 'pt-BR': 'O que foi citado', fr: 'Ce qui a été cité', it: 'Che cosa è stato citato' },

  // Strict mention-vs-source signal labels
  mentioned_in_answer: { he: 'אוזכר בתשובה', en: 'Mentioned in answer', es: 'Mencionado en la respuesta', 'pt-BR': 'Mencionado na resposta', fr: 'Mentionné dans la réponse', it: 'Menzionato nella risposta' },
  not_mentioned_in_answer: { he: 'לא אוזכר בתשובה', en: 'Not mentioned in answer', es: 'No mencionado en la respuesta', 'pt-BR': 'Não mencionado na resposta', fr: 'Non mentionné dans la réponse', it: 'Non menzionato nella risposta' },
  appeared_as_source: { he: 'הופיע כמקור', en: 'Appeared as source', es: 'Ha aparecido como fuente', 'pt-BR': 'Apareceu como fonte', fr: 'Apparaît comme source', it: 'Compare come fonte' },
  not_appeared_as_source: { he: 'לא הופיע כמקור', en: 'Not a source', es: 'No es una fuente', 'pt-BR': 'Não é uma fonte', fr: 'Pas une source', it: 'Non è una fonte' },
  mentioned_and_source: { he: 'אוזכר והופיע כמקור', en: 'Mentioned & cited as source', es: 'Mencionado y citado como fuente', 'pt-BR': 'Mencionado e citado como fonte', fr: 'Mentionné et cité comme source', it: 'Menzionato e citato come fonte' },
  brand_mentioned: { he: 'מותג אוזכר', en: 'Brand mentioned', es: 'Marca mencionada', 'pt-BR': 'Marca mencionada', fr: 'Marque mentionnée', it: 'Marchio menzionato' },
  domain_mentioned: { he: 'דומיין אוזכר', en: 'Domain mentioned', es: 'Dominio mencionado', 'pt-BR': 'Domínio mencionado', fr: 'Domaine mentionné', it: 'Dominio menzionato' },
  what_appeared_as_source: { he: 'מה הופיע כמקור', en: 'What appeared as a source', es: 'Qué ha aparecido como fuente', 'pt-BR': 'O que apareceu como fonte', fr: 'Ce qui est apparu comme source', it: 'Che cosa è comparso come fonte' },
  view_details: { he: 'פרטים', en: 'Details', es: 'Detalles', 'pt-BR': 'Detalhes', fr: 'Détails', it: 'Dettagli' },
  scanned_at: { he: 'נסרק', en: 'Scanned', es: 'Comprobado', 'pt-BR': 'Verificado', fr: 'Vérifié le', it: 'Verificato il' },

  // AI Business Profile panel
  ai_business_profile: { he: 'פרופיל AI לעסק', en: 'AI Business Profile', es: 'Perfil de IA del negocio', 'pt-BR': 'Perfil de IA do negócio', fr: 'Profil d\'entreprise pour l\'IA', it: 'Profilo dell\'attività per l\'IA' },
  ai_business_profile_help: {
    he: 'הפרופיל משפיע רק על שאלות AI מומלצות, לא על הסריקות עצמן.',
    en: 'This profile affects only recommended AI questions, not scans themselves.',
    es: 'Este perfil solo afecta a las preguntas de IA recomendadas, no a las comprobaciones.',
    'pt-BR': 'Este perfil afeta apenas as perguntas de IA recomendadas, não as verificações.',
    fr: 'Ce profil n\'influence que les questions d\'IA recommandées, pas les vérifications elles-mêmes.',
    it: 'Questo profilo influisce solo sulle domande di IA consigliate, non sulle verifiche stesse.',
  },
  primary_category: { he: 'קטגוריה ראשית', en: 'Primary category', es: 'Categoría principal', 'pt-BR': 'Categoria principal', fr: 'Catégorie principale', it: 'Categoria principale' },
  secondary_categories: { he: 'קטגוריות משניות', en: 'Secondary categories', es: 'Categorías secundarias', 'pt-BR': 'Categorias secundárias', fr: 'Catégories secondaires', it: 'Categorie secondarie' },
  excluded_topics: { he: 'נושאים לא רצויים', en: 'Excluded topics', es: 'Temas excluidos', 'pt-BR': 'Temas excluídos', fr: 'Sujets exclus', it: 'Argomenti esclusi' },
  auto_detect: { he: 'זיהוי מסריקת האתר', en: 'From the site scan', es: 'Según el análisis de la web', 'pt-BR': 'Segundo a análise do site', fr: 'D\'après l\'analyse du site', it: 'In base all\'analisi del sito' },
  auto_detected: { he: 'זוהה מסריקת האתר', en: 'Detected from the site scan', es: 'Detectado en el análisis de la web', 'pt-BR': 'Detectado na análise do site', fr: 'Détecté par l\'analyse du site', it: 'Rilevato dall\'analisi del sito' },
  manually_set: { he: 'הגדרתם בעצמכם', en: 'Set by you', es: 'Lo has definido tú', 'pt-BR': 'Definido por você', fr: 'Défini par vous', it: 'Definito da voi' },
  auto_badge: { he: 'אוטומטי', en: 'Auto', es: 'Automático', 'pt-BR': 'Automático', fr: 'Auto', it: 'Auto' },
  manual_badge: { he: 'ידני', en: 'Manual', es: 'Manual', 'pt-BR': 'Manual', fr: 'Manuel', it: 'Manuale' },
  save_profile: { he: 'שמור פרופיל AI', en: 'Save AI Profile', es: 'Guardar el perfil de IA', 'pt-BR': 'Salvar o perfil de IA', fr: 'Enregistrer le profil IA', it: 'Salvare il profilo IA' },
  reset_to_auto: { he: 'חזרה לזיהוי מסריקת האתר', en: 'Go back to the site scan', es: 'Volver a la detección del análisis', 'pt-BR': 'Voltar à detecção da análise', fr: 'Revenir à l\'analyse du site', it: 'Tornare all\'analisi del sito' },
  add_tag_placeholder: { he: 'הוסף ולחץ Enter', en: 'Add and press Enter', es: 'Escribe y pulsa Intro', 'pt-BR': 'Digite e pressione Enter', fr: 'Ajoutez puis appuyez sur Entrée', it: 'Aggiungere e premere Invio' },
  add_secondary_placeholder: {
    he: 'הוסף קטגוריה משנית ולחץ Enter',
    en: 'Add secondary category and press Enter',
    es: 'Añade una categoría secundaria y pulsa Intro',
    'pt-BR': 'Adicione uma categoria secundária e pressione Enter',
    fr: 'Ajoutez une catégorie secondaire puis Entrée',
    it: 'Aggiungere una categoria secondaria e premere Invio',
  },
  add_excluded_placeholder: {
    he: 'הוסף נושא לא רצוי ולחץ Enter',
    en: 'Add excluded topic and press Enter',
    es: 'Añade un tema excluido y pulsa Intro',
    'pt-BR': 'Adicione um tema excluído e pressione Enter',
    fr: 'Ajoutez un sujet exclu puis Entrée',
    it: 'Aggiungere un argomento escluso e premere Invio',
  },
  primary_category_placeholder: {
    he: 'כתוב קטגוריה (לדוגמה: משלוחי פרחים) או בחר מהרשימה',
    en: 'Type a category (e.g. flower delivery) or pick one',
    es: 'Escribe una categoría (por ejemplo: envío de flores) o elige una',
    'pt-BR': 'Digite uma categoria (por exemplo: entrega de flores) ou escolha uma',
    fr: 'Saisissez une catégorie (ex. livraison de fleurs) ou choisissez-en une',
    it: 'Inserire una categoria (es. consegna di fiori) oppure scegliere una di quelle proposte',
  },
  profile_saved: { he: 'פרופיל AI נשמר בהצלחה', en: 'AI profile saved', es: 'Perfil de IA guardado', 'pt-BR': 'Perfil de IA salvo', fr: 'Profil IA enregistré', it: 'Profilo IA salvato' },
  profile_reset: { he: 'הפרופיל חזר לזיהוי מסריקת האתר', en: 'Profile is back to the site scan', es: 'El perfil ha vuelto al análisis de la web', 'pt-BR': 'O perfil voltou à análise do site', fr: 'Le profil est revenu à l\'analyse du site', it: 'Il profilo è tornato all\'analisi del sito' },
  edit_ai_profile: { he: 'ערוך פרופיל AI', en: 'Edit AI profile', es: 'Editar el perfil de IA', 'pt-BR': 'Editar o perfil de IA', fr: 'Modifier le profil IA', it: 'Modificare il profilo IA' },
  open_ai_profile: { he: 'פתח הגדרות פרופיל', en: 'Open profile settings', es: 'Abrir los ajustes del perfil', 'pt-BR': 'Abrir as configurações do perfil', fr: 'Ouvrir les réglages du profil', it: 'Aprire le impostazioni del profilo' },
  close_panel: { he: 'סגור', en: 'Close', es: 'Cerrar', 'pt-BR': 'Fechar', fr: 'Fermer', it: 'Chiudere' },
  category_suggestions: { he: 'הצעות', en: 'Suggestions', es: 'Sugerencias', 'pt-BR': 'Sugestões', fr: 'Suggestions', it: 'Suggerimenti' },
  // What the business is (business-identity.ts): one line on the questions tab, editable.
  profile_identified_as: { he: 'העסק זוהה כ־', en: 'Identified as', es: 'Identificado como', 'pt-BR': 'Identificado como', fr: 'Identifié comme', it: 'Identificata come' },
  profile_source_manual: { he: 'הגדרתם בעצמכם', en: 'Set by you', es: 'Lo has definido tú', 'pt-BR': 'Definido por você', fr: 'Défini par vous', it: 'Definito da voi' },
  profile_source_scan: { he: 'לפי סריקת האתר', en: 'From the site scan', es: 'Según el análisis de la web', 'pt-BR': 'Segundo a análise do site', fr: 'D\'après l\'analyse du site', it: 'In base all\'analisi del sito' },
  profile_source_site: { he: 'לפי שם העסק והדומיין', en: 'From the business name and domain', es: 'Según el nombre del negocio y el dominio', 'pt-BR': 'Segundo o nome do negócio e o domínio', fr: 'D\'après le nom de l\'entreprise et le domaine', it: 'In base al nome dell\'attività e al dominio' },
  profile_source_keywords: { he: 'לפי רוב מילות המפתח במעקב', en: 'From most of your tracked keywords', es: 'Según la mayoría de tus palabras clave en seguimiento', 'pt-BR': 'Segundo a maioria das suas palavras-chave em acompanhamento', fr: 'D\'après la plupart de vos mots-clés suivis', it: 'In base alla maggior parte delle parole chiave monitorate' },
  profile_change: { he: 'שינוי', en: 'Change', es: 'Cambiar', 'pt-BR': 'Alterar', fr: 'Modifier', it: 'Modificare' },
  profile_unknown_title: { he: 'עוד לא ברור לנו במה העסק עוסק', en: 'We are not sure yet what the business does', es: 'Todavía no tenemos claro a qué se dedica el negocio', 'pt-BR': 'Ainda não temos clareza sobre a atividade do negócio', fr: 'Nous ne savons pas encore ce que fait l\'entreprise', it: 'Non è ancora chiaro di che cosa si occupi l\'attività' },
  profile_unknown_help: {
    he: 'כתבו במילים שלכם במה העסק עוסק, והשאלות המוצעות יתאימו לעסק במקום לניחוש.',
    en: 'Say in your own words what the business does, so the suggested questions fit it instead of a guess.',
    es: 'Cuéntanos con tus palabras a qué se dedica el negocio, y las preguntas propuestas se ajustarán a él en vez de a una suposición.',
    'pt-BR': 'Conte com as suas palavras o que o negócio faz, e as perguntas sugeridas se ajustarão a ele em vez de a uma suposição.',
    fr: 'Dites avec vos mots ce que fait l\'entreprise, pour que les questions suggérées lui correspondent au lieu d\'une supposition.',
    it: 'Indicare con parole proprie di che cosa si occupa l\'attività, così le domande suggerite le corrispondono invece di basarsi su un\'ipotesi.',
  },
  profile_set: { he: 'הגדרת העסק', en: 'Describe the business', es: 'Describir el negocio', 'pt-BR': 'Descrever o negócio', fr: 'Décrire l\'entreprise', it: 'Descrivere l\'attività' },
  profile_scan_found: { he: 'מה הסריקה מצאה באתר', en: 'What the site scan found', es: 'Lo que el análisis ha encontrado en la web', 'pt-BR': 'O que a análise encontrou no site', fr: 'Ce que l\'analyse du site a trouvé', it: 'Che cosa ha trovato l\'analisi del sito' },
  profile_what_business: { he: 'במה העסק עוסק?', en: 'What does the business do?', es: '¿A qué se dedica el negocio?', 'pt-BR': 'O que o negócio faz?', fr: 'Que fait l\'entreprise ?', it: 'Di che cosa si occupa l\'attività?' },
  profile_what_business_placeholder: {
    he: 'לדוגמה: מדריך טיולים ליפן, משלוחי פרחים, ניקיון משרדים',
    en: 'e.g. Japan travel guide, flower delivery, office cleaning',
    es: 'por ejemplo: guía de viajes a Japón, envío de flores, limpieza de oficinas',
    'pt-BR': 'por exemplo: guia de viagens para o Japão, entrega de flores, limpeza de escritórios',
    fr: 'ex. guide de voyage au Japon, livraison de fleurs, nettoyage de bureaux',
    it: 'es. guida di viaggio in Giappone, consegna di fiori, pulizia di uffici',
  },
  profile_more_topics: { he: 'תחומים נוספים ונושאים לא רצויים', en: 'More topics and excluded topics', es: 'Más temas y temas excluidos', 'pt-BR': 'Mais temas e temas excluídos', fr: 'Autres sujets et sujets exclus', it: 'Altri argomenti e argomenti esclusi' },
  profile_saved_questions: {
    he: 'הפרופיל נשמר והשאלות המוצעות עודכנו לפי העסק.',
    en: 'Profile saved. The suggested questions now follow it.',
    es: 'Perfil guardado. Las preguntas propuestas ya lo siguen.',
    'pt-BR': 'Perfil salvo. As perguntas sugeridas já o seguem.',
    fr: 'Profil enregistré. Les questions suggérées le suivent désormais.',
    it: 'Profilo salvato. Le domande suggerite lo seguono da ora.',
  },
  profile_regenerate: { he: 'יצירת שאלות חדשות', en: 'Generate new questions', es: 'Generar preguntas nuevas', 'pt-BR': 'Gerar novas perguntas', fr: 'Générer de nouvelles questions', it: 'Generare nuove domande' },
  profile_loading: { he: 'בודקים במה העסק עוסק', en: 'Checking what the business does', es: 'Comprobando a qué se dedica el negocio', 'pt-BR': 'Verificando o que o negócio faz', fr: 'Analyse de ce que fait l\'entreprise', it: 'Analisi di che cosa si occupa l\'attività' },
  // Why a suggested question is worth it (question-worth.ts), one line.
  worth_rel_brand: { he: 'שאלה על העסק עצמו', en: 'About the business itself', es: 'Sobre el negocio en sí', 'pt-BR': 'Sobre o próprio negócio', fr: 'À propos de l\'entreprise elle-même', it: 'Riguarda l\'attività stessa' },
  worth_rel_keyword: { he: 'קשורה ל„{term}״ שאתם עוקבים אחריה', en: 'Tied to "{term}", which you track', es: 'Ligada a «{term}», que tienes en seguimiento', 'pt-BR': 'Ligada a «{term}», que você acompanha', fr: 'Liée à « {term} », que vous suivez', it: 'Legata a «{term}», che viene monitorata' },
  worth_rel_business: { he: 'בדיוק בתחום של העסק', en: 'Right in the business\'s field', es: 'Justo en el sector del negocio', 'pt-BR': 'Bem na área do negócio', fr: 'En plein dans le domaine de l\'entreprise', it: 'In pieno nel settore dell\'attività' },
  worth_rel_gap: { he: 'האתר כבר כותב על „{term}״, ואין עדיין עמוד שעונה על זה', en: 'Your site covers "{term}", and no page answers this yet', es: 'Tu web ya habla de «{term}» y todavía no hay ninguna página que responda a esto', 'pt-BR': 'Seu site já fala de «{term}» e ainda não há nenhuma página que responda a isso', fr: 'Votre site traite « {term} », et aucune page n\'y répond encore', it: 'Il vostro sito tratta «{term}» e nessuna pagina risponde ancora a questa domanda' },
  worth_value_buy: { he: 'מי ששואל עומד לקנות או להזמין', en: 'The asker is about to buy or book', es: 'Quien pregunta está a punto de comprar o reservar', 'pt-BR': 'Quem pergunta está prestes a comprar ou reservar', fr: 'La personne est sur le point d\'acheter ou de réserver', it: 'Chi la pone è sul punto di acquistare o prenotare' },
  worth_value_choose: { he: 'מבקשים המלצה, ו-AI עונה בשמות של עסקים', en: 'They ask for a recommendation, and AI answers with names', es: 'Piden una recomendación, y la IA responde con nombres', 'pt-BR': 'Pedem uma recomendação, e a IA responde com nomes', fr: 'Elle demande une recommandation, et l\'IA répond avec des noms', it: 'Chiede una raccomandazione e l\'IA risponde con dei nomi' },
  worth_value_compare: { he: 'משווים אפשרויות לפני החלטה', en: 'They compare options before deciding', es: 'Comparan opciones antes de decidir', 'pt-BR': 'Comparam opções antes de decidir', fr: 'Elle compare les options avant de décider', it: 'Confronta le opzioni prima di decidere' },
  worth_value_learn: { he: 'שאלת מידע ש-AI עונה עליה עם מקורות', en: 'An information question AI answers with sources', es: 'Una pregunta informativa que la IA responde con fuentes', 'pt-BR': 'Uma pergunta informativa que a IA responde com fontes', fr: 'Une question d\'information à laquelle l\'IA répond avec des sources', it: 'Una domanda informativa a cui l\'IA risponde con delle fonti' },
  worth_value_brand: { he: 'כך לקוחות בודקים אתכם לפני שהם פונים', en: 'How customers check you before they get in touch', es: 'Así es como los clientes te miran antes de escribirte', 'pt-BR': 'É assim que os clientes olham para você antes de entrar em contato', fr: 'Comment les clients se renseignent sur vous avant de vous contacter', it: 'Come i clienti si informano sull\'attività prima di contattarla' },
  // A suggested question → an article that answers it (question-article.ts).
  qa_track_brand: { he: 'הוסיפו לשאלות AI', en: 'Add to AI questions', es: 'Añadir a las preguntas de IA', 'pt-BR': 'Adicionar às perguntas de IA', fr: 'Ajouter aux questions d\'IA', it: 'Aggiungere alle domande di IA' },
  qa_write_article: { he: 'כתוב מאמר שיענה על השאלה', en: 'Write an article that answers it', es: 'Escribir un artículo que la responda', 'pt-BR': 'Escrever um artigo que a responda', fr: 'Écrire un article qui y répond', it: 'Scrivere un articolo che risponda alla domanda' },
  qa_write_failed: { he: 'לא הצלחנו ליצור את הנושא. נסו שוב.', en: 'We could not create the topic. Try again.', es: 'No hemos podido crear el tema. Inténtalo otra vez.', 'pt-BR': 'Não foi possível criar o tema. Tente novamente.', fr: 'Nous n\'avons pas pu créer le sujet. Réessayez.', it: 'Non è stato possibile creare l\'argomento. Riprovare.' },
  qa_page_answers: { he: 'עונה עליה באתר: {title}', en: 'Answered on your site: {title}', es: 'Respondida en tu web: {title}', 'pt-BR': 'Respondida no seu site: {title}', fr: 'Traitée sur votre site : {title}', it: 'Trattata sul vostro sito: {title}' },
  // The mirror image of qa_page_answers. Without it the only sign that nothing on the
  // site answers the question was the absence of that line (owner, 5 October 2026).
  qa_no_page_answers: {
    he: 'לא מצאנו באתר עמוד שעונה על זה',
    en: 'We found no page on your site that answers it',
    es: 'No encontramos ninguna página de tu web que la responda',
    'pt-BR': 'Não encontramos nenhuma página do seu site que a responda',
    fr: 'Nous n\'avons trouvé aucune page de votre site qui y réponde',
    it: 'Non è stata trovata nessuna pagina del vostro sito che risponda alla domanda',
  },
  qa_improve_page: { he: 'שיפור העמוד הקיים', en: 'Improve that page', es: 'Mejorar esa página', 'pt-BR': 'Melhorar essa página', fr: 'Améliorer cette page', it: 'Migliorare questa pagina' },
  qa_status_topic: { he: 'נושא נוצר באסטרטגיית התוכן', en: 'Topic created in the content strategy', es: 'Tema creado en la estrategia de contenidos', 'pt-BR': 'Tema criado na estratégia de conteúdo', fr: 'Sujet créé dans la stratégie de contenu', it: 'Argomento creato nella strategia di contenuti' },
  qa_status_written: { he: 'מאמר נכתב', en: 'Article written', es: 'Artículo escrito', 'pt-BR': 'Artigo escrito', fr: 'Article rédigé', it: 'Articolo redatto' },
  qa_status_published: { he: 'המאמר פורסם', en: 'Article published', es: 'Artículo publicado', 'pt-BR': 'Artigo publicado', fr: 'Article publié', it: 'Articolo pubblicato' },
  qa_status_cited: { he: 'צוטט בתשובת AI', en: 'Cited in an AI answer', es: 'Citado en una respuesta de IA', 'pt-BR': 'Citado em uma resposta de IA', fr: 'Cité dans une réponse d\'IA', it: 'Citato in una risposta di IA' },
  qa_open_topic: { he: 'לנושא', en: 'Open topic', es: 'Abrir el tema', 'pt-BR': 'Abrir o tema', fr: 'Ouvrir le sujet', it: 'Aprire l\'argomento' },
  qa_open_article: { he: 'למאמר', en: 'Open article', es: 'Abrir el artículo', 'pt-BR': 'Abrir o artigo', fr: 'Ouvrir l\'article', it: 'Aprire l\'articolo' },
  article_brief_note: {
    he: 'המאמר צריך לענות ישירות ובבהירות על השאלה „{q}״, כבר בפסקה הראשונה, כדי שמנועי AI יצטטו אותו כמקור.',
    en: 'The article must answer the question "{q}" directly and clearly, in its first paragraph, so AI engines cite it as a source.',
    es: 'El artículo tiene que responder a la pregunta «{q}» de forma directa y clara, ya en el primer párrafo, para que los motores de IA lo citen como fuente.',
    'pt-BR': 'O artigo precisa responder à pergunta «{q}» de forma direta e clara, já no primeiro parágrafo, para que os motores de IA o citem como fonte.',
    fr: 'L\'article doit répondre à la question « {q} » de façon directe et claire, dès son premier paragraphe, pour que les moteurs d\'IA le citent comme source.',
    it: 'L\'articolo deve rispondere alla domanda «{q}» in modo diretto e chiaro, già nel primo paragrafo, affinché i motori di IA lo citino come fonte.',
  },
  worth_ask_business: {
    he: 'כדי להציע רק שאלות שהעסק יכול לזכות בהן, ספרו לנו למעלה במה העסק עוסק.',
    en: 'To suggest only questions the business can win, say above what the business does.',
    es: 'Para proponerte solo preguntas que el negocio puede ganar, cuéntanos arriba a qué se dedica.',
    'pt-BR': 'Para sugerir apenas perguntas que o negócio pode vencer, conte acima o que ele faz.',
    fr: 'Pour ne proposer que des questions que l\'entreprise peut gagner, indiquez ci-dessus ce qu\'elle fait.',
    it: 'Per proporre solo domande che l\'attività può vincere, indicare qui sopra di che cosa si occupa.',
  },

  // Misc UI labels
  show_all: { he: 'הצג הכל', en: 'Show all', es: 'Ver todo', 'pt-BR': 'Ver tudo', fr: 'Tout afficher', it: 'Mostrare tutto' },
  show_more: { he: 'הצג עוד', en: 'Show more', es: 'Ver más', 'pt-BR': 'Ver mais', fr: 'Afficher plus', it: 'Mostrare di più' },
  add_to_queries_aria: { he: 'הוסף לרשימת השאילתות', en: 'Add to query list', es: 'Añadir a la lista de preguntas', 'pt-BR': 'Adicionar à lista de perguntas', fr: 'Ajouter à la liste des questions', it: 'Aggiungere all\'elenco delle domande' },

  // AI Insight Cards
  ai_insights_header: { he: 'תובנות AI', en: 'AI Insights', es: 'Ideas de la IA', 'pt-BR': 'Ideias da IA', fr: 'Analyses de l\'IA', it: 'Analisi dell\'IA' },
  insight_brand_mention: { he: 'הזכרת מותג', en: 'Brand Mention', es: 'Mención de la marca', 'pt-BR': 'Menção à marca', fr: 'Mention de la marque', it: 'Menzione del marchio' },
  insight_domain_cite: { he: 'ציטוט דומיין', en: 'Domain Cited', es: 'Dominio citado', 'pt-BR': 'Domínio citado', fr: 'Domaine cité', it: 'Dominio citato' },
  insight_competitors: { he: 'מתחרים שזוהו', en: 'Competitors Detected', es: 'Competidores detectados', 'pt-BR': 'Concorrentes detectados', fr: 'Concurrents détectés', it: 'Concorrenti rilevati' },
  insight_sources: { he: 'מקורות מובילים', en: 'Top Sources', es: 'Fuentes principales', 'pt-BR': 'Fontes principais', fr: 'Sources principales', it: 'Fonti principali' },
  insight_recommendation: { he: 'המלצה זוהתה', en: 'Recommendation', es: 'Recomendación', 'pt-BR': 'Recomendação', fr: 'Recommandation', it: 'Raccomandazione' },
  insight_engine: { he: 'מנוע סורק', en: 'Engine', es: 'Motor', 'pt-BR': 'Motor', fr: 'Moteur', it: 'Motore' },
  insight_mentioned_in_answer: { he: 'הוזכר בתשובה', en: 'Mentioned in answer', es: 'Mencionado en la respuesta', 'pt-BR': 'Mencionado na resposta', fr: 'Mentionné dans la réponse', it: 'Menzionato nella risposta' },
  insight_cited_as_source: { he: 'מצוטט כמקור', en: 'Cited as source', es: 'Citado como fuente', 'pt-BR': 'Citado como fonte', fr: 'Cité comme source', it: 'Citato come fonte' },
  insight_brand_recommended: { he: 'המותג שלך מומלץ', en: 'Your brand is recommended', es: 'Recomiendan tu marca', 'pt-BR': 'Recomendam a sua marca', fr: 'Votre marque est recommandée', it: 'Il vostro marchio è raccomandato' },
  insight_no_clear_recommendation: { he: 'ללא המלצה ברורה', en: 'No clear recommendation', es: 'Sin una recomendación clara', 'pt-BR': 'Sem uma recomendação clara', fr: 'Aucune recommandation claire', it: 'Nessuna raccomandazione chiara' },
  insight_no_competitors: { he: 'לא זוהו מתחרים', en: 'No competitors detected', es: 'No se han detectado competidores', 'pt-BR': 'Nenhum concorrente foi detectado', fr: 'Aucun concurrent détecté', it: 'Nessun concorrente rilevato' },
  insight_no_sources_cited: { he: 'אין מקורות מצוטטים', en: 'No sources cited', es: 'No hay fuentes citadas', 'pt-BR': 'Não há fontes citadas', fr: 'Aucune source citée', it: 'Nessuna fonte citata' },
  insight_mention_count_suffix: { he: 'פעמים', en: 'mentions', es: 'menciones', 'pt-BR': 'menções', fr: 'mentions', it: 'menzioni' },
  insight_words_in_answer: { he: 'מילים בתשובה', en: 'words in answer', es: 'palabras en la respuesta', 'pt-BR': 'palavras na resposta', fr: 'mots dans la réponse', it: 'parole nella risposta' },

  // Scan status (live, on-screen)
  scan_in_progress: { he: 'סריקת מנוע AI בתהליך…', en: 'AI engine scan in progress…', es: 'Comprobación del motor de IA en curso…', 'pt-BR': 'Verificação do motor de IA em andamento…', fr: 'Vérification du moteur d\'IA en cours…', it: 'Verifica del motore di IA in corso…' },
  scan_done: { he: 'הסריקה הושלמה', en: 'Scan complete', es: 'Comprobación terminada', 'pt-BR': 'Verificação concluída', fr: 'Vérification terminée', it: 'Verifica completata' },

  // Profile errors
  profile_save_failed: { he: 'שמירת הפרופיל נכשלה. נסה שוב.', en: 'Failed to save profile. Please try again.', es: 'No se ha podido guardar el perfil. Inténtalo otra vez.', 'pt-BR': 'Não foi possível salvar o perfil. Tente novamente.', fr: 'L\'enregistrement du profil a échoué. Veuillez réessayer.', it: 'Il salvataggio del profilo non è riuscito. Riprovare.' },
  profile_reset_failed: { he: 'איפוס הפרופיל נכשל. נסה שוב.', en: 'Failed to reset profile. Please try again.', es: 'No se ha podido restablecer el perfil. Inténtalo otra vez.', 'pt-BR': 'Não foi possível restaurar o perfil. Tente novamente.', fr: 'La réinitialisation du profil a échoué. Veuillez réessayer.', it: 'Il ripristino del profilo non è riuscito. Riprovare.' },

  // The AI visibility tab (one project: the one the top bar names)
  page_subtitle: {
    he: 'איך מנועי ה-AI עונים על שאלות בתחום של העסק, והאם הם מזכירים ומצטטים את האתר',
    en: 'How AI assistants answer questions in your field, and whether they mention and cite your site',
    es: 'Cómo responden los asistentes de IA a las preguntas de tu sector, y si mencionan y citan tu web',
    'pt-BR': 'Como os assistentes de IA respondem às perguntas da sua área, e se mencionam e citam o seu site',
    fr: 'Comment les assistants d\'IA répondent aux questions de votre domaine, et s\'ils mentionnent et citent votre site',
    it: 'Come gli assistenti di IA rispondono alle domande del vostro settore e se menzionano e citano il vostro sito',
  },
  not_available: { he: 'נראות ב-AI לא זמינה בחשבון הזה.', en: 'AI visibility is not available on this account.', es: 'La visibilidad en IA no está disponible en esta cuenta.', 'pt-BR': 'A visibilidade em IA não está disponível nesta conta.', fr: 'La visibilité dans les IA n\'est pas disponible sur ce compte.', it: 'La visibilità nelle IA non è disponibile su questo account.' },
  no_data: { he: 'אין נתונים', en: 'No data', es: 'Sin datos', 'pt-BR': 'Sem dados', fr: 'Aucune donnée', it: 'Nessun dato' },
  queries: { he: 'שאילתות', en: 'Queries', fr: 'Questions', it: 'Domande' },
  last_scan: { he: 'סריקה אחרונה', en: 'Last scan', es: 'Última comprobación', 'pt-BR': 'Última verificação', fr: 'Dernière vérification', it: 'Ultima verifica' },
  failed_to_load: { he: 'טעינה נכשלה', en: 'Failed to load', es: 'No se ha podido cargar', 'pt-BR': 'Não foi possível carregar', fr: 'Le chargement a échoué', it: 'Il caricamento non è riuscito' },

  // Category labels for the dropdown (BusinessCategory → display name)
  cat_florist: { he: 'חנות פרחים', en: 'Flower shop', es: 'Floristería', 'pt-BR': 'Floricultura', fr: 'Fleuriste', it: 'Fioraio' },
  cat_perfume: { he: 'חנות בשמים', en: 'Perfume shop', es: 'Perfumería', 'pt-BR': 'Perfumaria', fr: 'Parfumerie', it: 'Profumeria' },
  cat_gifts: { he: 'חנות מתנות', en: 'Gift shop', es: 'Tienda de regalos', 'pt-BR': 'Loja de presentes', fr: 'Boutique de cadeaux', it: 'Negozio di articoli da regalo' },
  cat_agency: { he: 'סוכנות שיווק / SEO', en: 'Marketing / SEO agency', es: 'Agencia de marketing o SEO', 'pt-BR': 'Agência de marketing ou SEO', fr: 'Agence de marketing / SEO', it: 'Agenzia di marketing / SEO' },
  cat_sports_store: { he: 'חנות ספורט', en: 'Sports store', es: 'Tienda de deportes', 'pt-BR': 'Loja de esportes', fr: 'Magasin de sport', it: 'Negozio di articoli sportivi' },
  cat_appliance_store: { he: 'חנות מוצרי חשמל', en: 'Appliance store', es: 'Tienda de electrodomésticos', 'pt-BR': 'Loja de eletrodomésticos', fr: 'Magasin d\'électroménager', it: 'Negozio di elettrodomestici' },
  cat_ecommerce: { he: 'חנות אונליין', en: 'Online store', es: 'Tienda online', 'pt-BR': 'Loja virtual', fr: 'Boutique en ligne', it: 'Negozio online' },
  cat_local_service: { he: 'שירות מקומי', en: 'Local service', es: 'Servicio local', 'pt-BR': 'Serviço local', fr: 'Service de proximité', it: 'Servizio di prossimità' },
  cat_home_improvement_service: { he: 'בעלי מקצוע לבית (אינסטלציה, חשמל, שיפוצים)', en: 'Home services (plumbing, electrical, renovation)', es: 'Servicios para el hogar (fontanería, electricidad, reformas)', 'pt-BR': 'Serviços para a casa (encanamento, elétrica, reformas)', fr: 'Services à domicile (plomberie, électricité, rénovation)', it: 'Servizi per la casa (idraulica, elettricità, ristrutturazioni)' },
  cat_product_brand: { he: 'מותג מוצרים', en: 'Product brand', es: 'Marca de producto', 'pt-BR': 'Marca de produto', fr: 'Marque de produits', it: 'Marchio di prodotti' },
  cat_cleaning: { he: 'חברת ניקיון', en: 'Cleaning company', es: 'Empresa de limpieza', 'pt-BR': 'Empresa de limpeza', fr: 'Entreprise de nettoyage', it: 'Impresa di pulizie' },
  cat_saas: { he: 'מוצר SaaS', en: 'SaaS product', es: 'Producto SaaS', 'pt-BR': 'Produto SaaS', fr: 'Produit SaaS', it: 'Prodotto SaaS' },
  cat_restaurant: { he: 'מסעדה', en: 'Restaurant', es: 'Restaurante', 'pt-BR': 'Restaurante', fr: 'Restaurant', it: 'Ristorante' },
  cat_healthcare: { he: 'שירותי בריאות', en: 'Healthcare', es: 'Salud', 'pt-BR': 'Saúde', fr: 'Santé', it: 'Sanità' },
  cat_legal: { he: 'משרד עורכי דין', en: 'Law firm', es: 'Despacho de abogados', 'pt-BR': 'Escritório de advocacia', fr: 'Cabinet d\'avocats', it: 'Studio legale' },
  cat_real_estate: { he: 'נדל״ן', en: 'Real estate', es: 'Inmobiliaria', 'pt-BR': 'Imobiliária', fr: 'Immobilier', it: 'Immobiliare' },
  cat_fitness: { he: 'כושר', en: 'Fitness', es: 'Fitness', 'pt-BR': 'Fitness', fr: 'Fitness', it: 'Fitness' },
  cat_beauty: { he: 'יופי וטיפוח', en: 'Beauty & wellness', es: 'Belleza y bienestar', 'pt-BR': 'Beleza e bem-estar', fr: 'Beauté et bien-être', it: 'Bellezza e benessere' },
  cat_education: { he: 'הכשרה והוראה', en: 'Education', es: 'Educación', 'pt-BR': 'Educação', fr: 'Éducation', it: 'Istruzione' },
  cat_second_hand_fashion: { he: 'בגדי יד שנייה לנשים', en: 'Second-hand women\'s fashion', es: 'Moda de segunda mano para mujer', 'pt-BR': 'Moda feminina de segunda mão', fr: 'Mode féminine de seconde main', it: 'Moda femminile di seconda mano' },
  cat_travel: { he: 'תיירות וטיולים', en: 'Travel & tourism', es: 'Viajes y turismo', 'pt-BR': 'Viagens e turismo', fr: 'Voyage et tourisme', it: 'Viaggi e turismo' },
  cat_generic: { he: 'אחר', en: 'Other', es: 'Otro', 'pt-BR': 'Outro', fr: 'Autre', it: 'Altro' },

  // Competitors panel (Phase 1)
  competitors_title: { he: 'מתחרים למעקב', en: 'Tracked competitors', es: 'Competidores en seguimiento', 'pt-BR': 'Concorrentes em acompanhamento', fr: 'Concurrents suivis', it: 'Concorrenti monitorati' },
  competitors_subtitle: {
    he: 'הגדירו עד 5 מתחרים שאתם רוצים לעקוב אחריהם בתשובות AI.',
    en: 'Define up to 5 competitors you want to track in AI answers.',
    es: 'Define hasta 5 competidores a los que quieras seguir en las respuestas de IA.',
    'pt-BR': 'Defina até 5 concorrentes que você queira acompanhar nas respostas de IA.',
    fr: 'Définissez jusqu\'à 5 concurrents à suivre dans les réponses des IA.',
    it: 'Si possono definire fino a 5 concorrenti da monitorare nelle risposte delle IA.',
  },
  competitor_name: { he: 'שם המתחרה', en: 'Competitor name', es: 'Nombre del competidor', 'pt-BR': 'Nome do concorrente', fr: 'Nom du concurrent', it: 'Nome del concorrente' },
  competitor_name_placeholder: { he: 'לדוגמה: Adidas', en: 'e.g. Adidas', es: 'por ejemplo: Adidas', 'pt-BR': 'por exemplo: Adidas', fr: 'ex. Adidas', it: 'es. Adidas' },
  competitor_domain: { he: 'דומיין (אופציונלי)', en: 'Domain (optional)', es: 'Dominio (opcional)', 'pt-BR': 'Domínio (opcional)', fr: 'Domaine (facultatif)', it: 'Dominio (facoltativo)' },
  competitor_domain_placeholder: { he: 'example.com', en: 'example.com', es: 'ejemplo.com', 'pt-BR': 'exemplo.com', fr: 'example.com', it: 'example.com' },
  competitor_aliases: { he: 'שמות נוספים', en: 'Alternative names', fr: 'Autres noms', it: 'Altri nomi' },
  competitor_aliases_help: {
    he: 'שמות נוספים לזיהוי, מופרדים בפסיקים',
    en: 'Alternative names to detect, separated by commas',
    es: 'Otros nombres que hay que detectar, separados por comas',
    'pt-BR': 'Outros nomes a detectar, separados por vírgulas',
    fr: 'Autres noms à détecter, séparés par des virgules',
    it: 'Altri nomi da rilevare, separati da virgole',
  },
  competitor_aliases_placeholder: { he: 'אדידאס, adidas, ‎ADIDAS', en: 'adidas, ADIDAS', es: 'adidas, ADIDAS', 'pt-BR': 'adidas, ADIDAS', fr: 'adidas, ADIDAS', it: 'adidas, ADIDAS' },
  competitor_add: { he: 'הוספת מתחרה', en: 'Add competitor', es: 'Añadir competidor', 'pt-BR': 'Adicionar concorrente', fr: 'Ajouter un concurrent', it: 'Aggiungere un concorrente' },
  competitor_save: { he: 'שמירה', en: 'Save', es: 'Guardar', 'pt-BR': 'Salvar', fr: 'Enregistrer', it: 'Salvare' },
  competitor_cancel: { he: 'ביטול', en: 'Cancel', es: 'Cancelar', 'pt-BR': 'Cancelar', fr: 'Annuler', it: 'Annullare' },
  competitor_edit: { he: 'עריכה', en: 'Edit', es: 'Editar', 'pt-BR': 'Editar', fr: 'Modifier', it: 'Modificare' },
  competitor_delete: { he: 'מחיקה', en: 'Delete', es: 'Eliminar', 'pt-BR': 'Excluir', fr: 'Supprimer', it: 'Eliminare' },
  competitor_max_reached: {
    he: 'הגעת למקסימום של 5 מתחרים פעילים. השבת אחד כדי להוסיף חדש.',
    en: 'You\'ve reached the limit of 5 active competitors. Deactivate one to add another.',
    es: 'Has llegado al límite de 5 competidores activos. Desactiva uno para añadir otro.',
    'pt-BR': 'Você atingiu o limite de 5 concorrentes ativos. Desative um para adicionar outro.',
    fr: 'Vous avez atteint la limite de 5 concurrents actifs. Désactivez-en un pour en ajouter un autre.',
    it: 'È stato raggiunto il limite di 5 concorrenti attivi. Disattivarne uno per aggiungerne un altro.',
  },
  competitor_empty: {
    he: 'עדיין לא הוגדרו מתחרים. הוסיפו מתחרה ראשון כדי להתחיל.',
    en: 'No competitors defined yet. Add your first competitor to get started.',
    es: 'Todavía no has definido ningún competidor. Añade el primero para empezar.',
    'pt-BR': 'Você ainda não definiu nenhum concorrente. Adicione o primeiro para começar.',
    fr: 'Aucun concurrent défini pour l\'instant. Ajoutez votre premier concurrent pour commencer.',
    it: 'Nessun concorrente definito per il momento. Aggiungere il primo concorrente per iniziare.',
  },
  competitor_delete_confirm: {
    he: 'הוא יפסיק להופיע בהשוואות של הבדיקות הבאות. התוצאות שכבר נאספו נשמרות.',
    en: 'It stops appearing in the comparisons of future checks. Results already collected are kept.',
    es: 'Dejará de aparecer en las comparaciones de las próximas comprobaciones. Los resultados ya recogidos se mantienen.',
    'pt-BR': 'Deixará de aparecer nas comparações das próximas verificações. Os resultados já coletados são mantidos.',
    fr: 'Il n\'apparaîtra plus dans les comparaisons des prochaines vérifications. Les résultats déjà obtenus sont conservés.',
    it: 'Non comparirà più nei confronti delle verifiche successive. I risultati già ottenuti vengono conservati.',
  },
  competitor_loading: { he: 'טוען מתחרים…', en: 'Loading competitors…', es: 'Cargando los competidores…', 'pt-BR': 'Carregando os concorrentes…', fr: 'Chargement des concurrents…', it: 'Caricamento dei concorrenti…' },
  competitor_load_failed: { he: 'טעינת המתחרים נכשלה.', en: 'Failed to load competitors.', es: 'No se han podido cargar los competidores.', 'pt-BR': 'Não foi possível carregar os concorrentes.', fr: 'Le chargement des concurrents a échoué.', it: 'Il caricamento dei concorrenti non è riuscito.' },
  competitor_save_failed: { he: 'לא הצלחנו לשמור את המתחרה. נסו שוב בעוד רגע.', en: 'We could not save the competitor. Try again in a moment.', es: 'No hemos podido guardar el competidor. Inténtalo dentro de un momento.', 'pt-BR': 'Não foi possível salvar o concorrente. Tente novamente daqui a pouco.', fr: 'Nous n\'avons pas pu enregistrer le concurrent. Réessayez dans un instant.', it: 'Non è stato possibile salvare il concorrente. Riprovare tra un momento.' },
  competitor_remove_failed: { he: 'לא הצלחנו להסיר את המתחרה מהמעקב. נסו שוב בעוד רגע.', en: 'We could not remove the competitor from tracking. Try again in a moment.', es: 'No hemos podido quitar el competidor del seguimiento. Inténtalo dentro de un momento.', 'pt-BR': 'Não foi possível remover o concorrente do acompanhamento. Tente novamente daqui a pouco.', fr: 'Nous n\'avons pas pu retirer le concurrent du suivi. Réessayez dans un instant.', it: 'Non è stato possibile togliere il concorrente dal monitoraggio. Riprovare tra un momento.' },
  competitor_reactivate_failed: { he: 'לא הצלחנו להחזיר את המתחרה למעקב. נסו שוב בעוד רגע.', en: 'We could not bring the competitor back into tracking. Try again in a moment.', es: 'No hemos podido devolver el competidor al seguimiento. Inténtalo dentro de un momento.', 'pt-BR': 'Não foi possível devolver o concorrente ao acompanhamento. Tente novamente daqui a pouco.', fr: 'Nous n\'avons pas pu remettre le concurrent dans le suivi. Réessayez dans un instant.', it: 'Non è stato possibile rimettere il concorrente nel monitoraggio. Riprovare tra un momento.' },
  competitor_remove_title: { he: 'להסיר את המתחרה מהמעקב?', en: 'Remove this competitor from tracking?', es: '¿Quitar este competidor del seguimiento?', 'pt-BR': 'Remover este concorrente do acompanhamento?', fr: 'Retirer ce concurrent du suivi ?', it: 'Togliere questo concorrente dal monitoraggio?' },
  competitor_remove_action: { he: 'הסרה מהמעקב', en: 'Remove from tracking', es: 'Quitar del seguimiento', 'pt-BR': 'Remover do acompanhamento', fr: 'Retirer du suivi', it: 'Togliere dal monitoraggio' },
  competitor_active_count: { he: 'מתחרים פעילים', en: 'Active competitors', es: 'Competidores activos', 'pt-BR': 'Concorrentes ativos', fr: 'Concurrents actifs', it: 'Concorrenti attivi' },
  competitor_inactive: { he: 'לא פעיל', en: 'Inactive', es: 'Inactivo', 'pt-BR': 'Inativo', fr: 'Inactif', it: 'Inattivo' },
  competitor_reactivate: { he: 'הפעלה מחדש', en: 'Reactivate', es: 'Reactivar', 'pt-BR': 'Reativar', fr: 'Réactiver', it: 'Riattivare' },

  // Competitor analysis (Phase 2)
  competitor_analysis_title: { he: 'באיזה חלק מהתשובות כל עסק מוזכר', en: 'How many of the answers name each business', es: 'Cuántas respuestas nombran a cada negocio', 'pt-BR': 'Quantas respostas citam cada negócio', fr: 'Combien de réponses nomment chaque entreprise', it: 'Quante risposte nominano ciascuna attività' },
  competitor_analysis_help: {
    he: 'לכל עסק בנפרד: בכמה מהתשובות שנבדקו הוא הוזכר. כל עסק נמדד מול כל התשובות, ולכן כמה עסקים יכולים להגיע כל אחד ל-100%.',
    en: 'For each business on its own: how many of the checked answers named it. Each is measured against all the answers, so several businesses can each reach 100%.',
    es: 'Para cada negocio por separado: cuántas de las respuestas comprobadas lo nombraron. Cada uno se mide sobre todas las respuestas, así que varios negocios pueden llegar al 100%.',
    'pt-BR': 'Para cada negócio separadamente: quantas das respostas verificadas o citaram. Cada um é medido sobre todas as respostas, então vários negócios podem chegar a 100%.',
    fr: 'Pour chaque entreprise séparément : combien de réponses vérifiées l\'ont nommée. Chacune est mesurée sur l\'ensemble des réponses, plusieurs entreprises peuvent donc atteindre 100 % chacune.',
    it: 'Per ogni attività separatamente: quante risposte verificate l\'hanno nominata. Ciascuna è misurata sull\'insieme delle risposte, quindi più attività possono raggiungere il 100% ognuna.',
  },
  competitor_analysis_no_competitors: {
    he: 'הוסיפו מתחרים כדי להשוות את הנראות שלכם במנועי AI.',
    en: 'Add competitors to compare your AI visibility.',
    es: 'Añade competidores para comparar tu visibilidad en IA.',
    'pt-BR': 'Adicione concorrentes para comparar a sua visibilidade em IA.',
    fr: 'Ajoutez des concurrents pour comparer votre visibilité dans les IA.',
    it: 'Aggiungere dei concorrenti per confrontare la vostra visibilità nelle IA.',
  },
  competitor_analysis_no_scan: {
    he: 'אין עדיין סריקה זמינה להשוואת מתחרים. הריצו סריקת AI תחילה.',
    en: 'No scan is available yet for competitor comparison. Run an AI scan first.',
    es: 'Todavía no hay ninguna comprobación con la que comparar competidores. Haz antes una comprobación de IA.',
    'pt-BR': 'Ainda não há nenhuma verificação com a qual comparar concorrentes. Faça antes uma verificação de IA.',
    fr: 'Aucune vérification n\'est encore disponible pour la comparaison des concurrents. Lancez d\'abord une vérification d\'IA.',
    it: 'Non è ancora disponibile nessuna verifica per il confronto con i concorrenti. Lanciare prima una verifica di IA.',
  },
  competitor_analysis_no_mentions: {
    he: 'לא נמצאו אזכורים למתחרים בסריקה האחרונה.',
    en: 'No competitor mentions were found in the latest scan.',
    es: 'En la última comprobación no se ha encontrado ninguna mención de la competencia.',
    'pt-BR': 'Na última verificação, nenhuma menção aos concorrentes foi encontrada.',
    fr: 'Aucune mention de concurrent n\'a été trouvée dans la dernière vérification.',
    it: 'Nell\'ultima verifica non è stata trovata nessuna menzione dei concorrenti.',
  },
  competitor_analysis_loading: { he: 'טוען נתונים…', en: 'Loading…', es: 'Cargando…', 'pt-BR': 'Carregando…', fr: 'Chargement…', it: 'Caricamento…' },
  competitor_analysis_failed: { he: 'טעינת הנתונים נכשלה.', en: 'Failed to load data.', es: 'No se han podido cargar los datos.', 'pt-BR': 'Não foi possível carregar os dados.', fr: 'Le chargement des données a échoué.', it: 'Il caricamento dei dati non è riuscito.' },
  competitor_visibility: { he: 'מהתשובות', en: 'of answers', es: 'de las respuestas', 'pt-BR': 'das respostas', fr: 'des réponses', it: 'delle risposte' },
  competitor_mentions: { he: 'אזכורים', en: 'Mentions', es: 'Menciones', 'pt-BR': 'Menções', fr: 'Mentions', it: 'Menzioni' },
  competitor_by_engine: { he: 'פירוט לפי מנוע', en: 'Breakdown by engine', es: 'Desglose por motor', 'pt-BR': 'Detalhamento por motor', fr: 'Répartition par moteur', it: 'Ripartizione per motore' },
  competitor_your_business: { he: 'העסק שלכם', en: 'Your business', es: 'Tu negocio', 'pt-BR': 'Seu negócio', fr: 'Votre entreprise', it: 'La vostra attività' },
  competitor_zero_mentions: { he: 'אין אזכורים', en: 'No mentions', es: 'Sin menciones', 'pt-BR': 'Sem menções', fr: 'Aucune mention', it: 'Nessuna menzione' },

  // AI Share of Voice (Phase 3)
  share_of_voice_title: { he: 'נתח מכלל האזכורים בתשובות AI', en: 'Share of all mentions in AI answers', es: 'Cuota de todas las menciones en las respuestas de IA', 'pt-BR': 'Participação em todas as menções nas respostas de IA', fr: 'Part de l\'ensemble des mentions dans les réponses des IA', it: 'Quota dell\'insieme delle menzioni nelle risposte delle IA' },
  share_of_voice_help: {
    he: 'כל תשובה שמזכירה עסק נספרת לו פעם אחת. האחוז הוא החלק של כל עסק מכל האזכורים יחד, ולכן האחוזים כאן מסתכמים ל-100%.',
    en: 'Each answer that names a business counts once for it. The percentage is each business\'s part of all mentions together, so the percentages here add up to 100%.',
    es: 'Cada respuesta que nombra a un negocio cuenta una vez para él. El porcentaje es la parte de cada negocio sobre el total de menciones, así que los porcentajes de aquí suman 100%.',
    'pt-BR': 'Cada resposta que cita um negócio conta uma vez para ele. A porcentagem é a parte de cada negócio sobre o total de menções, então as porcentagens aqui somam 100%.',
    fr: 'Chaque réponse qui nomme une entreprise compte une fois pour elle. Le pourcentage est la part de chaque entreprise dans l\'ensemble des mentions, les pourcentages ici totalisent donc 100 %.',
    it: 'Ogni risposta che nomina un\'attività conta una volta per quell\'attività. La percentuale è la quota di ciascuna attività sull\'insieme delle menzioni, quindi le percentuali qui sommano al 100%.',
  },
  share_of_voice_empty: {
    he: 'עדיין אף תשובה לא הזכירה את העסק או מתחרה. בדקו עוד שאלות כדי לראות מי מוזכר יותר.',
    en: 'No answer has named your business or a competitor yet. Check more questions to see who is named more.',
    es: 'Todavía ninguna respuesta ha nombrado a tu negocio ni a un competidor. Comprueba más preguntas para ver a quién nombran más.',
    'pt-BR': 'Ainda nenhuma resposta citou o seu negócio nem um concorrente. Verifique mais perguntas para ver quem é mais citado.',
    fr: 'Aucune réponse n\'a encore nommé votre entreprise ni un concurrent. Vérifiez plus de questions pour voir qui est le plus nommé.',
    it: 'Nessuna risposta ha ancora nominato la vostra attività né un concorrente. Verificare più domande per vedere chi viene nominato di più.',
  },
  share_of_voice_mentions: { he: 'אזכורים', en: 'mentions', es: 'menciones', 'pt-BR': 'menções', fr: 'mentions', it: 'menzioni' },

  // AI Visibility Score (Phase 4)
  ai_visibility_score: { he: 'ציון נראות AI', en: 'AI Visibility Score', es: 'Puntuación de visibilidad en IA', 'pt-BR': 'Pontuação de visibilidade em IA', fr: 'Score de visibilité dans les IA', it: 'Punteggio di visibilità nelle IA' },
  score_help: {
    he: 'הציון מבוסס על אחוז התשובות שבהן העסק הופיע במנועי AI.',
    en: 'The score is based on the percentage of AI answers where the business appeared.',
    es: 'La puntuación sale del porcentaje de respuestas de IA en las que aparece el negocio.',
    'pt-BR': 'A pontuação vem da porcentagem de respostas de IA em que o negócio aparece.',
    fr: 'Le score repose sur le pourcentage de réponses d\'IA où l\'entreprise est apparue.',
    it: 'Il punteggio si basa sulla percentuale di risposte di IA in cui l\'attività è comparsa.',
  },
  score_subtext: {
    he: 'מבוסס על אחוז התשובות שבהן העסק הופיע במנועי AI.',
    en: 'Based on the percentage of AI answers where the business appeared.',
    es: 'A partir del porcentaje de respuestas de IA en las que aparece el negocio.',
    'pt-BR': 'A partir da porcentagem de respostas de IA em que o negócio aparece.',
    fr: 'Basé sur le pourcentage de réponses d\'IA où l\'entreprise est apparue.',
    it: 'Basato sulla percentuale di risposte di IA in cui l\'attività è comparsa.',
  },
  score_low: { he: 'נמוך', en: 'Low', es: 'Baja', 'pt-BR': 'Baixa', fr: 'Faible', it: 'Basso' },
  score_medium: { he: 'בינוני', en: 'Medium', es: 'Media', 'pt-BR': 'Média', fr: 'Moyen', it: 'Medio' },
  score_high: { he: 'גבוה', en: 'High', es: 'Alta', 'pt-BR': 'Alta', fr: 'Élevé', it: 'Alto' },

  // Competitive Gaps card (formerly Recommendations card; now only competitor_leading alerts)
  recommendations_title: { he: 'פערים מול מתחרים', en: 'Competitive Gaps', es: 'Huecos frente a la competencia', 'pt-BR': 'Lacunas em relação à concorrência', fr: 'Écarts concurrentiels', it: 'Scarti rispetto ai concorrenti' },
  recommendations_desc: {
    he: 'התראות על מתחרים שמופיעים יותר מהעסק בתשובות AI',
    en: 'Alerts for competitors that appear more often than the business in AI answers',
    es: 'Avisos sobre competidores que aparecen en las respuestas de IA más veces que el negocio',
    'pt-BR': 'Avisos sobre concorrentes que aparecem nas respostas de IA mais vezes que o negócio',
    fr: 'Alertes sur les concurrents qui apparaissent plus souvent que l\'entreprise dans les réponses des IA',
    it: 'Avvisi sui concorrenti che compaiono più spesso dell\'attività nelle risposte delle IA',
  },
  recommendations_none: {
    he: 'לא נמצאו המלצות דחופות כרגע. המשיכו לעקוב אחרי הסריקות הבאות.',
    en: 'No urgent recommendations were found right now. Keep monitoring future scans.',
    es: 'Ahora mismo no hay recomendaciones urgentes. Sigue mirando las próximas comprobaciones.',
    'pt-BR': 'No momento, não há recomendações urgentes. Continue acompanhando as próximas verificações.',
    fr: 'Aucune recommandation urgente pour le moment. Continuez à suivre les prochaines vérifications.',
    it: 'Nessuna raccomandazione urgente per il momento. Continuare a seguire le verifiche successive.',
  },
  recommendations_none_specific: {
    he: 'כל השאלות מכוסות ולעסק נראות טובה בכל המנועים.',
    en: 'All questions are covered and the business has good visibility across all engines.',
    es: 'Todas las preguntas están cubiertas y el negocio tiene buena visibilidad en todos los motores.',
    'pt-BR': 'Todas as perguntas estão cobertas e o negócio tem boa visibilidade em todos os motores.',
    fr: 'Toutes les questions sont couvertes et l\'entreprise a une bonne visibilité sur tous les moteurs.',
    it: 'Tutte le domande sono coperte e l\'attività ha una buona visibilità su tutti i motori.',
  },
  rec_severity_high: { he: 'דחוף', en: 'High', es: 'Alta', 'pt-BR': 'Alta', fr: 'Élevée', it: 'Alta' },
  rec_severity_medium: { he: 'בינוני', en: 'Medium', es: 'Media', 'pt-BR': 'Média', fr: 'Moyenne', it: 'Media' },
  rec_severity_low: { he: 'נמוך', en: 'Low', es: 'Baja', 'pt-BR': 'Baixa', fr: 'Faible', it: 'Bassa' },

  // Recommendation 1: Weak engines — engines with no mentions
  rec_weak_engines_title: { he: 'העסק לא מופיע בחלק ממנועי AI', en: 'The business is missing from some AI engines', es: 'El negocio no aparece en algunos motores de IA', 'pt-BR': 'O negócio não aparece em alguns motores de IA', fr: 'L\'entreprise est absente de certains moteurs d\'IA', it: 'L\'attività è assente da alcuni motori di IA' },
  rec_weak_engines_body: {
    he: 'העסק לא הופיע ב-{engines}.\nבדקו את השאלות שנבדקו במנועים האלה, וחזקו באתר תשובות סביב הנושאים שחזרו בסריקה.',
    en: 'The business did not appear in {engines}.\nReview the questions tested in those engines and strengthen answers around the recurring topics from the scan.',
    es: 'El negocio no apareció en {engines}.\nRevisa las preguntas probadas en esos motores y refuerza las respuestas sobre los temas que se repiten en la comprobación.',
    'pt-BR': 'O negócio não apareceu em {engines}.\nRevise as perguntas testadas nesses motores e reforce as respostas sobre os temas que se repetem na verificação.',
    fr: 'L\'entreprise n\'est pas apparue dans {engines}.\nPassez en revue les questions testées sur ces moteurs et renforcez les réponses autour des sujets récurrents de la vérification.',
    it: 'L\'attività non è comparsa in {engines}.\nSi consiglia di rivedere le domande testate su questi motori e di rafforzare le risposte sugli argomenti ricorrenti della verifica.',
  },

  // Recommendation 2: Weak questions — questions with low visibility
  rec_weak_questions_title: { he: 'יש שאלות שבהן העסק כמעט לא מופיע', en: 'Some questions have weak visibility', es: 'Algunas preguntas tienen poca visibilidad', 'pt-BR': 'Algumas perguntas têm pouca visibilidade', fr: 'Certaines questions ont une visibilité faible', it: 'Alcune domande hanno una visibilità bassa' },

  // Zero mentions: business did not appear at all
  rec_weak_questions_zero_single: {
    he: 'העסק לא הופיע בשאלה:\n{question}\n\nמומלץ ליצור עמוד תוכן או פסקת FAQ שעונה ישירות על השאלה ומבליטה את יתרונות העסק.',
    en: 'The business did not appear for the question:\n{question}\n\nCreate a content section or FAQ that answers it directly and highlights the business advantages.',
    es: 'El negocio no apareció en la pregunta:\n{question}\n\nCrea una sección de contenido o una FAQ que la responda directamente y destaque las ventajas del negocio.',
    'pt-BR': 'O negócio não apareceu na pergunta:\n{question}\n\nCrie uma seção de conteúdo ou um FAQ que a responda diretamente e destaque as vantagens do negócio.',
    fr: 'L\'entreprise n\'est pas apparue pour la question :\n{question}\n\nCréez une section de contenu ou une FAQ qui y répond directement et met en avant les atouts de l\'entreprise.',
    it: 'L\'attività non è comparsa per la domanda:\n{question}\n\nSi consiglia di creare una sezione di contenuto o una FAQ che risponda direttamente alla domanda e metta in evidenza i punti di forza dell\'attività.',
  },
  rec_weak_questions_zero_multi: {
    he: 'העסק לא הופיע בשאלות:\n{questions}\n\nמומלץ ליצור עמוד תוכן או פסקת FAQ שעונה ישירות על השאלות ומבליטה את יתרונות העסק.',
    en: 'The business did not appear for the questions:\n{questions}\n\nCreate content or FAQ sections that answer them directly and highlight the business advantages.',
    es: 'El negocio no apareció en las preguntas:\n{questions}\n\nCrea contenido o secciones de FAQ que las respondan directamente y destaquen las ventajas del negocio.',
    'pt-BR': 'O negócio não apareceu nas perguntas:\n{questions}\n\nCrie conteúdos ou seções de FAQ que as respondam diretamente e destaquem as vantagens do negócio.',
    fr: 'L\'entreprise n\'est pas apparue pour les questions :\n{questions}\n\nCréez des contenus ou des sections FAQ qui y répondent directement et mettent en avant les atouts de l\'entreprise.',
    it: 'L\'attività non è comparsa per le domande:\n{questions}\n\nSi consiglia di creare contenuti o sezioni FAQ che rispondano direttamente alle domande e mettano in evidenza i punti di forza dell\'attività.',
  },

  // Weak visibility: business appeared but rarely (< 0.25 rate)
  rec_weak_questions_weak_single: {
    he: 'העסק כמעט לא הופיע בשאלה:\n{question}\n\nמומלץ ליצור עמוד תוכן או פסקת FAQ שעונה ישירות על השאלה ומבליטה את יתרונות העסק.',
    en: 'The business had weak visibility for the question:\n{question}\n\nCreate a content section or FAQ that answers it directly and highlights the business advantages.',
    es: 'El negocio tuvo poca visibilidad en la pregunta:\n{question}\n\nCrea una sección de contenido o una FAQ que la responda directamente y destaque las ventajas del negocio.',
    'pt-BR': 'O negócio teve pouca visibilidade na pergunta:\n{question}\n\nCrie uma seção de conteúdo ou um FAQ que a responda diretamente e destaque as vantagens do negócio.',
    fr: 'L\'entreprise avait une visibilité faible pour la question :\n{question}\n\nCréez une section de contenu ou une FAQ qui y répond directement et met en avant les atouts de l\'entreprise.',
    it: 'L\'attività aveva una visibilità bassa per la domanda:\n{question}\n\nSi consiglia di creare una sezione di contenuto o una FAQ che risponda direttamente alla domanda e metta in evidenza i punti di forza dell\'attività.',
  },
  rec_weak_questions_weak_multi: {
    he: 'העסק כמעט לא הופיע בשאלות:\n{questions}\n\nמומלץ ליצור עמוד תוכן או פסקת FAQ שעונה ישירות על השאלות ומבליטה את יתרונות העסק.',
    en: 'The business had weak visibility for the questions:\n{questions}\n\nCreate content or FAQ sections that answer them directly and highlight the business advantages.',
    es: 'El negocio tuvo poca visibilidad en las preguntas:\n{questions}\n\nCrea contenido o secciones de FAQ que las respondan directamente y destaquen las ventajas del negocio.',
    'pt-BR': 'O negócio teve pouca visibilidade nas perguntas:\n{questions}\n\nCrie conteúdos ou seções de FAQ que as respondam diretamente e destaquem as vantagens do negócio.',
    fr: 'L\'entreprise avait une visibilité faible pour les questions :\n{questions}\n\nCréez des contenus ou des sections FAQ qui y répondent directement et mettent en avant les atouts de l\'entreprise.',
    it: 'L\'attività aveva una visibilità bassa per le domande:\n{questions}\n\nSi consiglia di creare contenuti o sezioni FAQ che rispondano direttamente alle domande e mettano in evidenza i punti di forza dell\'attività.',
  },

  // Recommendation 3: Competitor leading — competitor has more mentions than project
  rec_competitor_leading_title: { he: 'מתחרה מוביל בנתח האזכורים', en: 'A competitor leads in share of voice', es: 'Un competidor va por delante en cuota de menciones', 'pt-BR': 'Um concorrente está à frente na participação em menções', fr: 'Un concurrent domine la part de voix', it: 'Un concorrente è in testa nella quota delle menzioni' },
  rec_competitor_leading_body: {
    he: '{competitorName} הופיע ב-{gap} תשובות יותר מהעסק. בדקו באילו שאלות הוא מופיע והעסק לא, וצרו תוכן ייעודי סביב השאלות האלה.',
    en: '{competitorName} appeared in {gap} more answers than your business. Review the questions where they appear and your business does not, then create targeted content around those questions.',
    es: '{competitorName} apareció en {gap} respuestas más que tu negocio. Revisa las preguntas en las que aparece y tú no, y crea contenido centrado en esas preguntas.',
    'pt-BR': '{competitorName} apareceu em {gap} respostas a mais que o seu negócio. Revise as perguntas em que ele aparece e você não, e crie conteúdo focado nessas perguntas.',
    fr: '{competitorName} est apparu dans {gap} réponses de plus que votre entreprise. Examinez les questions où il apparaît et où votre entreprise est absente, puis créez du contenu ciblé autour de ces questions.',
    it: '{competitorName} è comparso in {gap} risposte in più rispetto alla vostra attività. Si consiglia di esaminare le domande in cui compare e in cui la vostra attività è assente, e di creare contenuti dedicati a quelle domande.',
  },

  // Phase 6 — Per-question insights (Queries tab)
  prompt_mentions: { he: 'אזכורים', en: 'Mentions', es: 'Menciones', 'pt-BR': 'Menções', fr: 'Mentions', it: 'Menzioni' },
  prompt_site_cited: { he: 'האתר צוטט', en: 'Site cited', es: 'Web citada', 'pt-BR': 'Site citado', fr: 'Site cité', it: 'Sito citato' },
  prompt_status: { he: 'סטטוס', en: 'Status', es: 'Estado', 'pt-BR': 'Status', fr: 'Statut', it: 'Stato' },
  prompt_engines_of: { he: '{mentioned}/{total} מנועים', en: '{mentioned}/{total} engines', es: '{mentioned}/{total} motores', 'pt-BR': '{mentioned}/{total} motores', fr: '{mentioned}/{total} moteurs', it: '{mentioned}/{total} motori' },
  prompt_yes: { he: 'כן', en: 'Yes', fr: 'Oui', it: 'Sì' },
  prompt_no: { he: 'לא', en: 'No', es: 'No', 'pt-BR': 'Não', fr: 'Non', it: 'No' },
  prompt_not_scanned_yet: { he: 'עוד לא נסרק', en: 'Not scanned yet', es: 'Sin comprobar', 'pt-BR': 'Sem verificar', fr: 'Pas encore vérifiée', it: 'Non ancora verificata' },
  prompt_status_missing: { he: 'לא מופיע', en: 'Missing', es: 'Ausente', 'pt-BR': 'Ausente', fr: 'Absente', it: 'Assente' },
  prompt_status_weak: { he: 'חלש', en: 'Weak', es: 'Débil', 'pt-BR': 'Fraca', fr: 'Faible', it: 'Bassa' },
  prompt_status_medium: { he: 'בינוני', en: 'Medium', es: 'Media', 'pt-BR': 'Média', fr: 'Moyenne', it: 'Media' },
  prompt_status_good: { he: 'טוב', en: 'Good', es: 'Buena', 'pt-BR': 'Boa', fr: 'Bonne', it: 'Buona' },

  // GEO Insights (Phase 1A — drawer-only compact section)
  geo_insights_title: { he: 'למה זו התשובה', en: 'Why this answer', es: 'Por qué esta respuesta', 'pt-BR': 'Por que esta resposta', fr: 'Pourquoi cette réponse', it: 'Perché questa risposta' },
  geo_query_intent: { he: 'כוונת שאלה', en: 'Query intent', es: 'Intención de la pregunta', 'pt-BR': 'Intenção da pergunta', fr: 'Intention de la question', it: 'Intento della domanda' },
  geo_citation_types: { he: 'סוגי מקורות', en: 'Source types', fr: 'Types de sources', it: 'Tipi di fonti' },
  geo_content_signals: { he: 'דפוסי תוכן', en: 'Content patterns', es: 'Patrones de contenido', 'pt-BR': 'Padrões de conteúdo', fr: 'Motifs de contenu', it: 'Caratteristiche del contenuto' },
  geo_none: { he: '—', en: '—', es: '—', 'pt-BR': '—', fr: '—', it: '—' },

  // GEO Explanations (Phase 1B — why this result happened)
  geo_explanation_title: { he: 'ניתוח התוצאה', en: 'Result Analysis', es: 'Análisis del resultado', 'pt-BR': 'Análise do resultado', fr: 'Analyse du résultat', it: 'Analisi del risultato' },
  geo_explanation_insufficient: {
    he: 'אין מספיק אותות להסבר אמין בתוצאה הזו.',
    en: 'Not enough signals to explain this result reliably.',
    es: 'No hay señales suficientes para explicar este resultado con fiabilidad.',
    'pt-BR': 'Não há sinais suficientes para explicar este resultado com confiabilidade.',
    fr: 'Pas assez de signaux pour expliquer ce résultat de façon fiable.',
    it: 'Non ci sono abbastanza segnali per spiegare questo risultato in modo affidabile.',
  },

  // GEO Recommendations (Phase 1C — what can be improved)
  geo_recommendations_title: { he: 'מה אפשר לשפר?', en: 'What can be improved?', es: '¿Qué se puede mejorar?', 'pt-BR': 'O que pode ser melhorado?', fr: 'Que peut-on améliorer ?', it: 'Che cosa si può migliorare?' },
  geo_recommendations_none: {
    he: 'לא זוהו פערים ברורים בתוצאה הזו. המשיכו בעבודה הטובה.',
    en: 'No clear gaps detected in this result. Keep up the good work.',
    es: 'No se han detectado huecos claros en este resultado. Sigue así.',
    'pt-BR': 'Nenhuma lacuna clara foi detectada neste resultado. Continue assim.',
    fr: 'Aucun écart clair détecté dans ce résultat. Continuez ainsi.',
    it: 'Nessuno scarto evidente rilevato in questo risultato. Si consiglia di continuare così.',
  },

  // GEO Insights collapsible label (Phase 1C — technical details)
  geo_technical_details: { he: 'פרטים טכניים', en: 'Technical details', es: 'Detalles técnicos', 'pt-BR': 'Detalhes técnicos', fr: 'Détails techniques', it: 'Dettagli tecnici' },

  // AI Visibility Summary (Insights tab — high-level snapshot + next action)
  ai_summary_title: { he: 'תקציר נראות AI', en: 'AI Visibility Summary', es: 'Resumen de visibilidad en IA', 'pt-BR': 'Resumo da visibilidade em IA', fr: 'Résumé de la visibilité dans les IA', it: 'Sintesi della visibilità nelle IA' },
  ai_summary_subtitle: {
    he: 'תמונת מצב קצרה והפעולה המומלצת הבאה',
    en: 'A short overview and the next recommended action',
    es: 'Un vistazo rápido y la siguiente acción recomendada',
    'pt-BR': 'Uma visão rápida e a próxima ação recomendada',
    fr: 'Un bref aperçu et la prochaine action recommandée',
    it: 'Una breve panoramica e la prossima azione consigliata',
  },
  ai_summary_status_high: { he: 'העסק מופיע ברוב תשובות ה־AI שנבדקו.', en: 'The business appears in most of the tested results.', es: 'El negocio aparece en la mayoría de los resultados comprobados.', 'pt-BR': 'O negócio aparece na maioria dos resultados verificados.', fr: 'L\'entreprise apparaît dans la plupart des résultats testés.', it: 'L\'attività compare nella maggior parte dei risultati testati.' },
  ai_summary_status_medium: { he: 'העסק מופיע בחלק מהתוצאות, אבל יש עדיין מקום לשיפור.', en: 'The business appears in some results, but there is still room for improvement.', es: 'El negocio aparece en algunos resultados, pero todavía hay margen de mejora.', 'pt-BR': 'O negócio aparece em alguns resultados, mas ainda há espaço para melhorar.', fr: 'L\'entreprise apparaît dans certains résultats, mais il reste de la marge.', it: 'L\'attività compare in alcuni risultati, ma c\'è ancora margine di miglioramento.' },
  ai_summary_status_low: { he: 'העסק כמעט לא מופיע בתשובות AI שנבדקו.', en: 'The business barely appears in the tested AI answers.', es: 'El negocio apenas aparece en las respuestas de IA comprobadas.', 'pt-BR': 'O negócio quase não aparece nas respostas de IA verificadas.', fr: 'L\'entreprise apparaît à peine dans les réponses d\'IA testées.', it: 'L\'attività compare a stento nelle risposte di IA testate.' },
  ai_summary_status_insufficient: { he: 'עדיין אין מספיק סריקות כדי להציג תקציר מדויק.', en: 'Not enough scans yet to display an accurate summary.', es: 'Todavía no hay comprobaciones suficientes para mostrar un resumen fiable.', 'pt-BR': 'Ainda não há verificações suficientes para mostrar um resumo confiável.', fr: 'Pas encore assez de vérifications pour afficher un résumé fiable.', it: 'Non ci sono ancora abbastanza verifiche per mostrare una sintesi affidabile.' },
  ai_summary_action_label: { he: 'הפעולה המומלצת: ', en: 'Recommended action: ', es: 'Acción recomendada: ', 'pt-BR': 'Ação recomendada: ', fr: 'Action recommandée : ', it: 'Azione consigliata: ' },
  ai_summary_action_weak_questions: { he: 'ליצור תוכן שעונה ישירות על השאלות שבהן העסק לא הופיע.', en: 'Create content that directly answers the questions where the business did not appear.', es: 'Crea contenido que responda directamente a las preguntas en las que el negocio no apareció.', 'pt-BR': 'Crie conteúdo que responda diretamente às perguntas em que o negócio não apareceu.', fr: 'Créez du contenu qui répond directement aux questions où l\'entreprise n\'est pas apparue.', it: 'Creare contenuti che rispondano direttamente alle domande in cui l\'attività non è comparsa.' },
  ai_summary_action_reviews: { he: 'לחזק ביקורות, דירוגים ועדויות לקוחות באתר.', en: 'Strengthen reviews, ratings, and customer testimonials on the site.', es: 'Refuerza las reseñas, las valoraciones y los testimonios de clientes en la web.', 'pt-BR': 'Reforce as avaliações, as notas e os depoimentos de clientes no site.', fr: 'Renforcez les avis, les notes et les témoignages de clients sur le site.', it: 'Rafforzare le recensioni, le valutazioni e le testimonianze dei clienti sul sito.' },
  ai_summary_action_comparison: { he: 'להוסיף עמודי השוואה בין מוצרים, מותגים או פתרונות כדי לחזק הופעה בתשובות AI.', en: 'Add comparison pages that help customers choose between options.', es: 'Añade páginas comparativas que ayuden al cliente a elegir entre opciones.', 'pt-BR': 'Adicione páginas comparativas que ajudem o cliente a escolher entre as opções.', fr: 'Ajoutez des pages de comparaison qui aident les clients à choisir entre les options.', it: 'Aggiungere pagine di confronto che aiutino i clienti a scegliere tra le opzioni.' },
  ai_summary_action_pricing: { he: 'להציג מידע ברור יותר על מחירים, טווחי מחיר ומה כלול בשירות.', en: 'Display clearer information about pricing, price ranges, and what is included.', es: 'Muestra información más clara sobre precios, horquillas de precio y qué incluye cada cosa.', 'pt-BR': 'Mostre informações mais claras sobre preços, faixas de preço e o que cada item inclui.', fr: 'Affichez des informations plus claires sur les prix, les fourchettes de prix et ce qui est inclus.', it: 'Mostrare informazioni più chiare sui prezzi, sulle fasce di prezzo e su ciò che è incluso.' },
  ai_summary_action_list: { he: 'להוסיף שאלות נפוצות ותשובות קצרות לשאלות מרכזיות.', en: 'Add FAQs and concise answers to key questions.', es: 'Añade preguntas frecuentes y respuestas breves a las dudas clave.', 'pt-BR': 'Adicione perguntas frequentes e respostas curtas para as principais dúvidas.', fr: 'Ajoutez des FAQ et des réponses concises aux questions clés.', it: 'Aggiungere FAQ e risposte concise alle domande principali.' },
  ai_summary_action_local: { he: 'להבליט אזורי שירות, כתובת וזמינות באתר.', en: 'Highlight service areas, address, and availability on the site.', es: 'Destaca en la web las zonas donde das servicio, la dirección y la disponibilidad.', 'pt-BR': 'Destaque no site as regiões que você atende, o endereço e a disponibilidade.', fr: 'Mettez en avant les zones desservies, l\'adresse et les disponibilités sur le site.', it: 'Mettere in evidenza le zone servite, l\'indirizzo e la disponibilità sul sito.' },
  ai_summary_action_recommendation: { he: 'להוסיף תוכן שמכוון את הלקוח לבחירה הנכונה עבורו.', en: 'Add content that guides customers toward the right choice for them.', es: 'Añade contenido que guíe al cliente hacia la opción que le conviene.', 'pt-BR': 'Adicione conteúdo que guie o cliente para a opção que mais combina com ele.', fr: 'Ajoutez du contenu qui guide les clients vers le choix qui leur convient.', it: 'Aggiungere contenuti che guidino i clienti verso la scelta più adatta a loro.' },
  ai_summary_action_fallback: { he: 'להריץ עוד שאלות ומנועים כדי לקבל המלצות מדויקות יותר.', en: 'Run more questions and engines to get more accurate recommendations.', es: 'Comprueba más preguntas y más motores para tener recomendaciones más precisas.', 'pt-BR': 'Verifique mais perguntas e mais motores para ter recomendações mais precisas.', fr: 'Lancez plus de questions et de moteurs pour obtenir des recommandations plus précises.', it: 'Lanciare più domande e più motori per ottenere raccomandazioni più precise.' },

  // GEO Opportunity Mapping (Phase 2A — project-level aggregated insights)
  geo_opp_title: { he: 'המלצות לשיפור הנראות ב-AI', en: 'AI Visibility Improvement Recommendations', es: 'Recomendaciones para mejorar la visibilidad en IA', 'pt-BR': 'Recomendações para melhorar a visibilidade em IA', fr: 'Recommandations pour améliorer la visibilité dans les IA', it: 'Raccomandazioni per migliorare la visibilità nelle IA' },
  geo_opp_subtitle: {
    he: 'המלצות לשיפור הנראות של העסק בתשובות AI',
    en: 'Recommendations to improve business visibility in AI answers',
    es: 'Recomendaciones para que el negocio aparezca más en las respuestas de IA',
    'pt-BR': 'Recomendações para o negócio aparecer mais nas respostas de IA',
    fr: 'Recommandations pour améliorer la visibilité de l\'entreprise dans les réponses des IA',
    it: 'Raccomandazioni per migliorare la visibilità dell\'attività nelle risposte delle IA',
  },
  geo_opp_empty: {
    he: 'אין עדיין מספיק סריקות להפקת תובנות מצטברות. הריצו עוד סריקות כדי לקבל מיפוי מלא.',
    en: 'Not enough scans yet to produce aggregated insights. Run more scans to see the full mapping.',
    es: 'Todavía no hay comprobaciones suficientes para sacar conclusiones generales. Haz más comprobaciones para ver el mapa completo.',
    'pt-BR': 'Ainda não há verificações suficientes para tirar conclusões gerais. Faça mais verificações para ver o quadro completo.',
    fr: 'Pas encore assez de vérifications pour produire des analyses agrégées. Lancez plus de vérifications pour voir la cartographie complète.',
    it: 'Non ci sono ancora abbastanza verifiche per produrre analisi aggregate. Lanciare più verifiche per vedere la mappatura completa.',
  },
  geo_opp_card_content: { he: 'דפוסי תוכן שמחזקים חשיפה', en: 'Content patterns that strengthen visibility', es: 'Patrones de contenido que refuerzan la visibilidad', 'pt-BR': 'Padrões de conteúdo que reforçam a visibilidade', fr: 'Motifs de contenu qui renforcent la visibilité', it: 'Caratteristiche di contenuto che rafforzano la visibilità' },
  geo_opp_card_citations: { he: 'מקורות שמחזקים חשיפה', en: 'Sources that strengthen visibility', es: 'Fuentes que refuerzan la visibilidad', 'pt-BR': 'Fontes que reforçam a visibilidade', fr: 'Sources qui renforcent la visibilité', it: 'Fonti che rafforzano la visibilità' },
  geo_opp_card_engines: { he: 'דפוסים לפי מנוע AI', en: 'Patterns by AI engine', fr: 'Motifs par moteur d\'IA', it: 'Caratteristiche per motore di IA' },
  geo_opp_card_missing: { he: 'פערים שחוזרים בתוצאות חלשות', en: 'Gaps in unsuccessful results', es: 'Huecos en los resultados fallidos', 'pt-BR': 'Lacunas nos resultados com falha', fr: 'Écarts dans les résultats sans succès', it: 'Scarti nei risultati senza successo' },
  geo_opp_no_data_content: { he: 'נדרשות עוד סריקות כדי לזהות דפוסי תוכן.', en: 'More scans needed to identify content patterns.', es: 'Hacen falta más comprobaciones para identificar patrones de contenido.', 'pt-BR': 'São necessárias mais verificações para identificar padrões de conteúdo.', fr: 'Il faut plus de vérifications pour identifier des motifs de contenu.', it: 'Servono più verifiche per individuare caratteristiche di contenuto.' },
  geo_opp_no_data_citations: { he: 'ממתינים לנתונים עוד כדי לזהות מקורות משמעותיים.', en: 'Waiting for more data to identify significant sources.', es: 'Esperando más datos para identificar las fuentes que pesan.', 'pt-BR': 'Aguardando mais dados para identificar as fontes que pesam.', fr: 'En attente de données pour identifier les sources significatives.', it: 'In attesa di più dati per individuare le fonti significative.' },
  geo_opp_no_data_engines: { he: 'ככל שיצטברו סריקות, דפוסים ייחודיים למנועים יופיעו כאן.', en: 'As scans accumulate, unique engine patterns will emerge here.', fr: 'À mesure que les vérifications s\'accumulent, les motifs propres à chaque moteur apparaîtront ici.', it: 'Con l\'accumularsi delle verifiche, qui compariranno le caratteristiche proprie di ogni motore.' },
  geo_opp_no_data_missing: { he: 'פערים יתגלו ככל שיצטברו יותר תוצאות כושלות.', en: 'Gaps will become clear as more unsuccessful results accumulate.', es: 'Los huecos se verán claros cuando se acumulen más resultados fallidos.', 'pt-BR': 'As lacunas ficarão claras quando mais resultados com falha se acumularem.', fr: 'Les écarts se préciseront à mesure que les résultats sans succès s\'accumuleront.', it: 'Gli scarti diventeranno più chiari con l\'accumularsi dei risultati senza successo.' },

  // GEO Competitor Intelligence (Phase 2C/2D — sources + business mentions)
  geo_comp_title: { he: 'מקורות ומתחרים בתשובות AI', en: 'Sources & competitors in AI answers', es: 'Fuentes y competencia en las respuestas de IA', 'pt-BR': 'Fontes e concorrência nas respostas de IA', fr: 'Sources et concurrents dans les réponses des IA', it: 'Fonti e concorrenti nelle risposte delle IA' },
  geo_comp_subtitle: {
    he: 'מבט על האתרים, סוגי התוכן והעסקים שמופיעים בתשובות מנועי AI',
    en: 'An overview of the sites, content types, and businesses appearing in AI answers',
    es: 'Un vistazo a las webs, los tipos de contenido y los negocios que aparecen en las respuestas de IA',
    'pt-BR': 'Uma visão geral dos sites, dos tipos de conteúdo e dos negócios que aparecem nas respostas de IA',
    fr: 'Un aperçu des sites, des types de contenu et des entreprises qui apparaissent dans les réponses des IA',
    it: 'Una panoramica dei siti, dei tipi di contenuto e delle attività che compaiono nelle risposte delle IA',
  },
  geo_comp_card_sources: { he: 'אתרים שחוזרים בתשובות AI', en: 'Websites that keep appearing', fr: 'Sites qui reviennent souvent', it: 'Siti che compaiono spesso' },
  geo_comp_card_content: { he: 'איזה תוכן מופיע יותר בתשובות AI', en: 'What content appears most in AI answers', es: 'Qué contenido aparece más en las respuestas de IA', 'pt-BR': 'Qual conteúdo mais aparece nas respostas de IA', fr: 'Quel contenu apparaît le plus dans les réponses des IA', it: 'Quale contenuto compare di più nelle risposte delle IA' },
  geo_comp_card_engines: { he: 'מקורות בולטים לפי מנוע AI', en: 'Which sources stand out in each engine', fr: 'Quelles sources se distinguent sur chaque moteur', it: 'Quali fonti si distinguono su ciascun motore' },
  geo_comp_card_loss: { he: 'מתחרים שהופיעו כשהעסק לא הופיע', en: 'Competitors mentioned when your business wasn\'t', es: 'Competidores mencionados cuando tu negocio no lo fue', 'pt-BR': 'Concorrentes mencionados quando o seu negócio não foi', fr: 'Concurrents mentionnés quand votre entreprise ne l\'était pas', it: 'Concorrenti menzionati quando la vostra attività non lo era' },
  geo_comp_pills_label: {
    he: 'דוגמאות לאתרים שחזרו בתוצאות:',
    en: 'Examples of recurring sites:',
    fr: 'Exemples de sites récurrents :',
    it: 'Esempi di siti ricorrenti:',
  },
  geo_comp_pills_label_competitors: {
    he: 'מתחרים שזוהו בתשובות:',
    en: 'Competitors detected in answers:',
    es: 'Competidores detectados en las respuestas:',
    'pt-BR': 'Concorrentes detectados nas respostas:',
    fr: 'Concurrents détectés dans les réponses :',
    it: 'Concorrenti rilevati nelle risposte:',
  },
  geo_comp_no_data_sources: {
    he: 'אין עדיין מספיק סריקות כדי לזהות אתרים שחוזרים על עצמם.',
    en: 'Not enough scans yet to identify recurring sites.',
    fr: 'Pas encore assez de vérifications pour identifier les sites récurrents.',
    it: 'Non ci sono ancora abbastanza verifiche per individuare i siti ricorrenti.',
  },
  geo_comp_no_data_content: {
    he: 'עדיין אין מספיק נתונים כדי לזהות אילו סוגי תוכן בולטים יותר בתשובות AI.',
    en: 'Not enough data yet to identify which content types stand out.',
    es: 'Todavía no hay datos suficientes para saber qué tipos de contenido destacan.',
    'pt-BR': 'Ainda não há dados suficientes para saber quais tipos de conteúdo se destacam.',
    fr: 'Pas encore assez de données pour identifier les types de contenu qui se distinguent.',
    it: 'Non ci sono ancora abbastanza dati per individuare i tipi di contenuto che si distinguono.',
  },
  geo_comp_no_data_engines: {
    he: 'יידרשו עוד סריקות במגוון מנועים כדי לזהות העדפות.',
    en: 'More scans across engines needed to identify preferences.',
    fr: 'Il faut plus de vérifications sur les différents moteurs pour identifier leurs préférences.',
    it: 'Servono più verifiche sui diversi motori per individuare le loro preferenze.',
  },
  geo_comp_no_data_loss: {
    he: 'לא זוהו מתחרים שהוגדרו מראש בתשובות שבהן העסק לא הופיע. הגדירו רשימת מתחרים או הריצו עוד סריקות.',
    en: 'No listed competitors were detected when the business was absent. Define competitors or run more scans.',
    es: 'No se ha detectado ninguno de tus competidores cuando el negocio no apareció. Define competidores o haz más comprobaciones.',
    'pt-BR': 'Nenhum dos seus concorrentes foi detectado quando o negócio não apareceu. Defina concorrentes ou faça mais verificações.',
    fr: 'Aucun concurrent de la liste n\'a été détecté en l\'absence de l\'entreprise. Définissez des concurrents ou lancez plus de vérifications.',
    it: 'In assenza dell\'attività non è stato rilevato nessun concorrente dell\'elenco. Definire dei concorrenti oppure lanciare più verifiche.',
  },

  // Category language (varied, not "ecosystem"-heavy)
  geo_comp_cat_review: { he: 'אתרי ביקורות', en: 'review sites', es: 'webs de reseñas', 'pt-BR': 'sites de avaliações', fr: 'sites d\'avis', it: 'siti di recensioni' },
  geo_comp_cat_marketplace: { he: 'שווקים', en: 'marketplaces', es: 'marketplaces', 'pt-BR': 'marketplaces', fr: 'marketplaces', it: 'marketplace' },
  geo_comp_cat_forum: { he: 'פורומים', en: 'forums', es: 'foros', 'pt-BR': 'fóruns', fr: 'forums', it: 'forum' },
  geo_comp_cat_brand: { he: 'מתחרים', en: 'competitors', es: 'competidores', 'pt-BR': 'concorrentes', fr: 'concurrents', it: 'concorrenti' },
  geo_comp_cat_editorial: { he: 'בלוגים וכתבות', en: 'blogs & articles', es: 'blogs y artículos', 'pt-BR': 'blogs e artigos', fr: 'blogs et articles', it: 'blog e articoli' },
  geo_comp_cat_directory: { he: 'ספריות עסקיות', en: 'directories', es: 'directorios', 'pt-BR': 'diretórios', fr: 'annuaires', it: 'elenchi di attività' },
  geo_comp_cat_unknown: { he: 'מקורות אחרים', en: 'other sources', es: 'otras fuentes', 'pt-BR': 'outras fontes', fr: 'autres sources', it: 'altre fonti' },

  // Business mention intelligence (Phase 2D)
  geo_biz_title: { he: 'עסקים שהופיעו בתשובות AI', en: 'Businesses mentioned in AI answers', es: 'Negocios mencionados en las respuestas de IA', 'pt-BR': 'Negócios mencionados nas respostas de IA', fr: 'Entreprises mentionnées dans les réponses des IA', it: 'Attività menzionate nelle risposte delle IA' },
  geo_biz_subtitle: {
    he: 'אילו עסקים/מתחרים הוזכרו בפועל בתשובות',
    en: 'Which businesses and competitors were actually mentioned',
    es: 'Qué negocios y competidores se mencionaron de verdad',
    'pt-BR': 'Quais negócios e concorrentes foram realmente mencionados',
    fr: 'Quelles entreprises et quels concurrents ont été réellement mentionnés',
    it: 'Quali attività e quali concorrenti sono stati effettivamente menzionati',
  },
  geo_biz_when_absent: { he: 'עסקים שהופיעו כשאתה לא הופעת', en: 'Competitors when you\'re absent', es: 'Competidores cuando tú no apareces', 'pt-BR': 'Concorrentes quando você não aparece', fr: 'Concurrents quand vous êtes absent', it: 'Concorrenti quando la vostra attività è assente' },
  geo_biz_mentioned: { he: '{name} הוזכר ב-{count} תוצאות בתשובות AI.', en: '{name} was mentioned in {count} AI responses.', es: '{name} se mencionó en {count} respuestas de IA.', 'pt-BR': '{name} foi mencionado em {count} respostas de IA.', fr: '{name} a été mentionné dans {count} réponses d\'IA.', it: '{name} è stato menzionato in {count} risposte di IA.' },
  geo_biz_no_data: {
    he: 'אין עדיין מספיק סריקות כדי לדעת אילו עסקים מופיעים בתשובות.',
    en: 'Not enough scans yet to identify mentioned businesses.',
    es: 'Todavía no hay comprobaciones suficientes para identificar negocios mencionados.',
    'pt-BR': 'Ainda não há verificações suficientes para identificar negócios mencionados.',
    fr: 'Pas encore assez de vérifications pour identifier les entreprises mentionnées.',
    it: 'Non ci sono ancora abbastanza verifiche per individuare le attività menzionate.',
  },
  geo_biz_none_found: {
    he: 'אף עסק מהרשימה לא הוזכר בתשובות.',
    en: 'None of the listed competitors were mentioned.',
    es: 'No se ha mencionado a ninguno de tus competidores.',
    'pt-BR': 'Nenhum dos seus concorrentes foi mencionado.',
    fr: 'Aucun des concurrents de la liste n\'a été mentionné.',
    it: 'Nessuno dei concorrenti dell\'elenco è stato menzionato.',
  },

  geo_opp_visibility_rate: { he: 'נראות', en: 'visibility', es: 'de visibilidad', 'pt-BR': 'de visibilidade', fr: 'visibilité', it: 'visibilità' },
  geo_opp_preliminary_trend: { he: 'מגמה ראשונית: ', en: 'Preliminary trend: ', es: 'Tendencia preliminar: ', 'pt-BR': 'Tendência preliminar: ', fr: 'Tendance préliminaire : ', it: 'Tendenza preliminare: ' },
  geo_opp_small_sample_warning: {
    he: 'התובנות מבוססות על מדגם קטן. ככל שתריצו יותר שאלות ומנועים, המיפוי יהיה מדויק יותר.',
    en: 'These insights are based on a small sample. Run more questions and engines for greater accuracy.',
    es: 'Estas conclusiones salen de una muestra pequeña. Comprueba más preguntas y más motores para ganar precisión.',
    'pt-BR': 'Estas conclusões vêm de uma amostra pequena. Verifique mais perguntas e mais motores para ganhar precisão.',
    fr: 'Ces analyses reposent sur un petit échantillon. Lancez plus de questions et de moteurs pour plus de précision.',
    it: 'Queste analisi si basano su un campione ridotto. Lanciare più domande e più motori per una maggiore precisione.',
  },

  // Content signal short labels (used inside aggregation sentences)
  geo_opp_signal_pricing: { he: 'מחירים', en: 'pricing', es: 'precios', 'pt-BR': 'preços', fr: 'prix', it: 'prezzi' },
  geo_opp_signal_reviews: { he: 'ביקורות', en: 'reviews', es: 'reseñas', 'pt-BR': 'avaliações', fr: 'avis', it: 'recensioni' },
  geo_opp_signal_comparison: { he: 'תוכן השוואתי', en: 'comparison content', es: 'contenido comparativo', 'pt-BR': 'conteúdo comparativo', fr: 'contenu comparatif', it: 'contenuti di confronto' },
  geo_opp_signal_list: { he: 'רשימות / FAQ', en: 'lists / FAQ', es: 'listas y preguntas frecuentes', 'pt-BR': 'listas e perguntas frequentes', fr: 'listes / FAQ', it: 'elenchi / FAQ' },
  geo_opp_signal_recommendation: { he: 'המלצות', en: 'recommendations', es: 'recomendaciones', 'pt-BR': 'recomendações', fr: 'recommandations', it: 'raccomandazioni' },
  geo_opp_signal_local: { he: 'מידע מקומי', en: 'local information', es: 'información local', 'pt-BR': 'informações locais', fr: 'informations locales', it: 'informazioni locali' },

  // Citation type short labels — phrased in plain business language
  // (no internal taxonomy terms surfaced to users).
  geo_opp_cite_homepage: { he: 'עמודים כלליים של עסקים', en: 'business homepages', es: 'páginas de inicio de negocios', 'pt-BR': 'páginas iniciais de negócios', fr: 'pages d\'accueil d\'entreprises', it: 'home page di attività' },
  geo_opp_cite_category: { he: 'עמודי קטגוריות מוצרים', en: 'product category pages', es: 'páginas de categoría de producto', 'pt-BR': 'páginas de categoria de produto', fr: 'pages de catégories de produits', it: 'pagine di categorie di prodotti' },
  geo_opp_cite_product: { he: 'עמודי מוצר', en: 'product pages', es: 'páginas de producto', 'pt-BR': 'páginas de produto', fr: 'pages produit', it: 'pagine di prodotto' },
  geo_opp_cite_comparison: { he: 'עמודי השוואה', en: 'comparison pages', es: 'páginas comparativas', 'pt-BR': 'páginas comparativas', fr: 'pages de comparaison', it: 'pagine di confronto' },
  geo_opp_cite_review: { he: 'אתרי ביקורות', en: 'review sites', es: 'webs de reseñas', 'pt-BR': 'sites de avaliações', fr: 'sites d\'avis', it: 'siti di recensioni' },
  geo_opp_cite_blog: { he: 'בלוגים ומאמרים', en: 'blogs and articles', es: 'blogs y artículos', 'pt-BR': 'blogs e artigos', fr: 'blogs et articles', it: 'blog e articoli' },
  geo_opp_cite_marketplace: { he: 'שווקים מקוונים', en: 'marketplaces', es: 'marketplaces', 'pt-BR': 'marketplaces', fr: 'marketplaces', it: 'marketplace' },
  geo_opp_cite_forum: { he: 'פורומים', en: 'forums', es: 'foros', 'pt-BR': 'fóruns', fr: 'forums', it: 'forum' },
  geo_opp_cite_directory: { he: 'מדריכי עסקים', en: 'directories', es: 'directorios', 'pt-BR': 'diretórios', fr: 'annuaires', it: 'elenchi di attività' },
  geo_opp_cite_brand_site: { he: 'אתרים רשמיים של עסקים', en: 'official business websites', es: 'webs oficiales de negocios', 'pt-BR': 'sites oficiais de negócios', fr: 'sites officiels d\'entreprises', it: 'siti ufficiali di attività' },

  // Query intents
  geo_intent_transactional: { he: 'מסחרי', en: 'Transactional', es: 'Transaccional', 'pt-BR': 'Transacional', fr: 'Transactionnelle', it: 'Transazionale' },
  geo_intent_informational: { he: 'מידע', en: 'Informational', es: 'Informativa', 'pt-BR': 'Informativa', fr: 'Informationnelle', it: 'Informativo' },
  geo_intent_comparison: { he: 'השוואה', en: 'Comparison', es: 'Comparativa', 'pt-BR': 'Comparativa', fr: 'Comparaison', it: 'Confronto' },
  geo_intent_review: { he: 'ביקורת', en: 'Review', es: 'De reseñas', 'pt-BR': 'De avaliações', fr: 'Avis', it: 'Recensioni' },
  geo_intent_local: { he: 'מקומי', en: 'Local', es: 'Local', 'pt-BR': 'Local', fr: 'Locale', it: 'Locale' },
  geo_intent_navigational: { he: 'ניווט', en: 'Navigational', es: 'De navegación', 'pt-BR': 'De navegação', fr: 'Navigationnelle', it: 'Di navigazione' },

  // Citation types — plain business language (no internal taxonomy)
  geo_citation_homepage: { he: 'עמוד כללי של עסק', en: 'Business homepage', es: 'Página de inicio del negocio', 'pt-BR': 'Página inicial do negócio', fr: 'Page d\'accueil de l\'entreprise', it: 'Home page dell\'attività' },
  geo_citation_category: { he: 'עמוד קטגוריות מוצרים', en: 'Product category page', es: 'Página de categoría de producto', 'pt-BR': 'Página de categoria de produto', fr: 'Page de catégorie de produits', it: 'Pagina di categoria di prodotti' },
  geo_citation_product: { he: 'עמוד מוצר', en: 'Product page', es: 'Página de producto', 'pt-BR': 'Página de produto', fr: 'Page produit', it: 'Pagina di prodotto' },
  geo_citation_comparison: { he: 'עמוד השוואה', en: 'Comparison page', es: 'Página comparativa', 'pt-BR': 'Página comparativa', fr: 'Page de comparaison', it: 'Pagina di confronto' },
  geo_citation_review: { he: 'אתר ביקורות', en: 'Review site', es: 'Web de reseñas', 'pt-BR': 'Site de avaliações', fr: 'Site d\'avis', it: 'Sito di recensioni' },
  geo_citation_blog: { he: 'בלוג / מאמר', en: 'Blog / Article', es: 'Blog o artículo', 'pt-BR': 'Blog ou artigo', fr: 'Blog / Article', it: 'Blog / Articolo' },
  geo_citation_marketplace: { he: 'שוק מקוון', en: 'Marketplace', es: 'Marketplace', 'pt-BR': 'Marketplace', fr: 'Marketplace', it: 'Marketplace' },
  geo_citation_forum: { he: 'פורום', en: 'Forum', es: 'Foro', 'pt-BR': 'Fórum', fr: 'Forum', it: 'Forum' },
  geo_citation_directory: { he: 'מדריך עסקים', en: 'Business directory', es: 'Directorio de empresas', 'pt-BR': 'Diretório de empresas', fr: 'Annuaire d\'entreprises', it: 'Elenco di attività' },
  geo_citation_brand_site: { he: 'אתר רשמי של עסק', en: 'Official business website', es: 'Web oficial del negocio', 'pt-BR': 'Site oficial do negócio', fr: 'Site officiel de l\'entreprise', it: 'Sito ufficiale dell\'attività' },
  geo_citation_unknown: { he: 'לא מסווג', en: 'Unknown', es: 'Sin identificar', 'pt-BR': 'Não identificado', fr: 'Inconnu', it: 'Sconosciuto' },

  // Content signals
  geo_signal_list: { he: 'רשימה', en: 'List', es: 'Lista', 'pt-BR': 'Lista', fr: 'Liste', it: 'Elenco' },
  geo_signal_comparison: { he: 'השוואה', en: 'Comparison', es: 'Comparativa', 'pt-BR': 'Comparativa', fr: 'Comparaison', it: 'Confronto' },
  geo_signal_pricing: { he: 'מחיר', en: 'Pricing', es: 'Precios', 'pt-BR': 'Preços', fr: 'Prix', it: 'Prezzi' },
  geo_signal_review: { he: 'ביקורות', en: 'Reviews', es: 'Reseñas', 'pt-BR': 'Avaliações', fr: 'Avis', it: 'Recensioni' },
  geo_signal_local: { he: 'מקומי', en: 'Local', es: 'Local', 'pt-BR': 'Local', fr: 'Local', it: 'Locale' },
  geo_signal_recommendation: { he: 'המלצה', en: 'Recommendation', es: 'Recomendación', 'pt-BR': 'Recomendação', fr: 'Recommandation', it: 'Raccomandazione' },

  // Confidence tiers
  confidence_high: { he: 'גבוה', en: 'High', es: 'Alta', 'pt-BR': 'Alta', fr: 'Élevée', it: 'Alta' },
  confidence_good: { he: 'טוב', en: 'Good', es: 'Buena', 'pt-BR': 'Boa', fr: 'Bonne', it: 'Buona' },
  confidence_medium: { he: 'בינוני', en: 'Medium', es: 'Media', 'pt-BR': 'Média', fr: 'Moyenne', it: 'Media' },
  confidence_opportunity: { he: 'הזדמנות', en: 'Opportunity', es: 'Oportunidad', 'pt-BR': 'Oportunidade', fr: 'Opportunité', it: 'Opportunità' },
  confidence_experimental: { he: 'ניסיוני', en: 'Experimental', es: 'Experimental', 'pt-BR': 'Experimental', fr: 'Expérimentale', it: 'Sperimentale' },

  // Explanation chips
  chip_purchase_intent: { he: 'כוונת רכישה', en: 'Purchase Intent', es: 'Intención de compra', 'pt-BR': 'Intenção de compra', fr: 'Intention d\'achat', it: 'Intenzione di acquisto' },
  chip_high_search_volume: { he: 'נפח חיפוש גבוה', en: 'High Search Volume', es: 'Mucho volumen de búsqueda', 'pt-BR': 'Alto volume de buscas', fr: 'Volume de recherche élevé', it: 'Volume di ricerca elevato' },
  chip_not_in_ai: { he: 'העסק לא מופיע ב-AI', en: 'Business Not in AI', es: 'El negocio no sale en la IA', 'pt-BR': 'O negócio não aparece na IA', fr: 'Entreprise absente des IA', it: 'Attività assente dalle IA' },
  chip_low_google_rank: { he: 'דירוג נמוך בגוגל', en: 'Low Google Rank', es: 'Posición baja en Google', 'pt-BR': 'Posição baixa no Google', fr: 'Position faible sur Google', it: 'Posizione bassa su Google' },
  chip_lead_potential: { he: 'פוטנציאל לידים', en: 'Lead Potential', es: 'Posible cliente', 'pt-BR': 'Possível cliente', fr: 'Potentiel de prospects', it: 'Potenziale di contatti' },
  chip_competitor_pattern: { he: 'נושא שחוזר אצל מתחרים', en: 'Competitor Pattern', es: 'Patrón de la competencia', 'pt-BR': 'Padrão da concorrência', fr: 'Motif concurrentiel', it: 'Tema ricorrente tra i concorrenti' },
  chip_local_search: { he: 'חיפוש מקומי', en: 'Local Search', es: 'Búsqueda local', 'pt-BR': 'Busca local', fr: 'Recherche locale', it: 'Ricerca locale' },
  chip_high_cpc: { he: 'CPC גבוה', en: 'High CPC', es: 'CPC alto', 'pt-BR': 'CPC alto', fr: 'CPC élevé', it: 'CPC elevato' },
  chip_comparison_search: { he: 'חיפוש השוואתי', en: 'Comparison Search', es: 'Búsqueda comparativa', 'pt-BR': 'Busca comparativa', fr: 'Recherche comparative', it: 'Ricerca comparativa' },
  chip_brand_search: { he: 'חיפוש מותג', en: 'Brand Search', es: 'Búsqueda de marca', 'pt-BR': 'Busca de marca', fr: 'Recherche de marque', it: 'Ricerca di marca' },
  chip_pre_purchase_search: { he: 'חיפוש לפני רכישה', en: 'Pre-Purchase Search', es: 'Búsqueda antes de comprar', 'pt-BR': 'Busca antes de comprar', fr: 'Recherche avant-achat', it: 'Ricerca prima dell\'acquisto' },
  // Signal-based chips (added in signal-driven explanation pass)
  chip_conversion_potential: { he: 'פוטנציאל המרה גבוה', en: 'High Conversion Potential', es: 'Mucho potencial de conversión', 'pt-BR': 'Grande potencial de conversão', fr: 'Fort potentiel de conversion', it: 'Forte potenziale di conversione' },
  chip_commercial_phrase: { he: 'ביטוי מסחרי', en: 'Commercial Phrase', es: 'Expresión comercial', 'pt-BR': 'Expressão comercial', fr: 'Expression commerciale', it: 'Espressione commerciale' },
  chip_competitor_gap: { he: 'פער מול מתחרים', en: 'Competitor Gap', es: 'Hueco frente a la competencia', 'pt-BR': 'Lacuna em relação à concorrência', fr: 'Écart concurrentiel', it: 'Scarto rispetto ai concorrenti' },
  chip_lead_opportunity: { he: 'הזדמנות לידים', en: 'Lead Opportunity', es: 'Oportunidad de cliente', 'pt-BR': 'Oportunidade de cliente', fr: 'Opportunité de prospect', it: 'Opportunità di contatto' },
  chip_regional_demand: { he: 'ביקוש גבוה באזור', en: 'High Regional Demand', es: 'Mucha demanda en la zona', 'pt-BR': 'Muita demanda na região', fr: 'Forte demande régionale', it: 'Forte domanda nella zona' },
  // Starter-tier chip — the ONLY chip a brand-new/generic project produces (via
  // buildFallbackSuggestions). It was missing here, so t('starter_questions') threw and
  // crashed the AI Questions tab for new projects.
  starter_questions: { he: 'שאלות התחלה', en: 'Starter questions', es: 'Preguntas para empezar', 'pt-BR': 'Perguntas para começar', fr: 'Questions de départ', it: 'Domande di partenza' },

  // Premium design pass (WP2): words the restyled tab needed, so none are hard-coded.
  something_went_wrong: { he: 'משהו השתבש. נסו שוב בעוד רגע.', en: 'Something went wrong. Please try again in a moment.', es: 'Algo ha ido mal. Inténtalo dentro de un momento.', 'pt-BR': 'Algo deu errado. Tente novamente daqui a pouco.', fr: 'Une erreur est survenue. Veuillez réessayer dans un instant.', it: 'Si è verificato un errore. Riprovare tra un momento.' },
  result_more_actions: { he: 'פעולות נוספות לתוצאה', en: 'More actions for this result', es: 'Más acciones para este resultado', 'pt-BR': 'Mais ações para este resultado', fr: 'Autres actions pour ce résultat', it: 'Altre azioni per questo risultato' },
  question_more_actions: { he: 'פעולות נוספות לשאלה', en: 'More actions for this question', es: 'Más acciones para esta pregunta', 'pt-BR': 'Mais ações para esta pergunta', fr: 'Autres actions pour cette question', it: 'Altre azioni per questa domanda' },
  question_auto_monthly: { he: 'נבדקת אוטומטית כל חודש', en: 'Checked automatically every month', es: 'Se comprueba automáticamente cada mes', 'pt-BR': 'É verificada automaticamente todo mês', fr: 'Vérifiée automatiquement chaque mois', it: 'Verificata automaticamente ogni mese' },
  archive_result: { he: 'העברה לארכיון', en: 'Archive', es: 'Archivar', 'pt-BR': 'Arquivar', fr: 'Archiver', it: 'Archiviare' },
  restore_result: { he: 'החזרה לחישוב הציון', en: 'Restore to the score', es: 'Devolver a la puntuación', 'pt-BR': 'Devolver à pontuação', fr: 'Réintégrer au score', it: 'Reintegrare nel punteggio' },
  not_in_score: { he: 'לא נכלל בציון', en: 'Not in score', es: 'Fuera de la puntuación', 'pt-BR': 'Fora da pontuação', fr: 'Hors score', it: 'Fuori dal punteggio' },
  show_archive: { he: 'הצגת הארכיון ({count})', en: 'Show archive ({count})', es: 'Ver el archivo ({count})', 'pt-BR': 'Ver o arquivo ({count})', fr: 'Afficher les archives ({count})', it: 'Mostrare l\'archivio ({count})' },
  archive_note: { he: 'תוצאות בארכיון אינן נכללות בחישוב הציון.', en: 'Archived results are not included in the score.', es: 'Los resultados archivados no cuentan en la puntuación.', 'pt-BR': 'Os resultados arquivados não contam na pontuação.', fr: 'Les résultats archivés ne sont pas comptés dans le score.', it: 'I risultati archiviati non vengono conteggiati nel punteggio.' },
  archive_update_failed: { he: 'לא הצלחנו לעדכן את הארכיון. נסו שוב.', en: 'We could not update the archive. Please try again.', es: 'No hemos podido actualizar el archivo. Inténtalo otra vez.', 'pt-BR': 'Não foi possível atualizar o arquivo. Tente novamente.', fr: 'Nous n\'avons pas pu mettre à jour l\'archive. Veuillez réessayer.', it: 'Non è stato possibile aggiornare l\'archivio. Riprovare.' },
  archived_toast: { he: 'התוצאה הועברה לארכיון ולא תשפיע על ציון הנראות.', en: 'Result archived and left out of the score.', es: 'Resultado archivado y fuera de la puntuación.', 'pt-BR': 'Resultado arquivado e fora da pontuação.', fr: 'Résultat archivé et exclu du score.', it: 'Risultato archiviato ed escluso dal punteggio.' },
  restored_toast: { he: 'התוצאה שוחזרה וחזרה לחישוב ציון הנראות.', en: 'Result restored and counted in the score again.', es: 'Resultado restaurado y de nuevo dentro de la puntuación.', 'pt-BR': 'Resultado restaurado e novamente dentro da pontuação.', fr: 'Résultat réintégré et de nouveau compté dans le score.', it: 'Risultato reintegrato e di nuovo conteggiato nel punteggio.' },
  scan_failed: { he: 'הבדיקה נכשלה', en: 'Check failed', es: 'La comprobación ha fallado', 'pt-BR': 'A verificação falhou', fr: 'La vérification a échoué', it: 'La verifica non è riuscita' },
  scan_failed_body: { he: 'הבדיקה נכשלה זמנית. אפשר לנסות שוב.', en: 'The check failed for now. You can try again.', es: 'La comprobación ha fallado por ahora. Puedes volver a intentarlo.', 'pt-BR': 'A verificação falhou por enquanto. Você pode tentar novamente.', fr: 'La vérification a échoué pour le moment. Vous pouvez réessayer.', it: 'Per il momento la verifica non è riuscita. Si può riprovare.' },
  retry_check: { he: 'ניסיון חוזר', en: 'Try again', es: 'Volver a intentarlo', 'pt-BR': 'Tentar novamente', fr: 'Réessayer', it: 'Riprovare' },
  how_it_works: { he: 'איך זה עובד?', en: 'How does it work?', es: '¿Cómo funciona?', 'pt-BR': 'Como funciona?', fr: 'Comment cela fonctionne ?', it: 'Come funziona?' },
  more_items: { he: 'עוד {count}', en: '{count} more', es: '{count} más', 'pt-BR': 'mais {count}', fr: '{count} de plus', it: '{count} in più' },
  geo_opp_based_on: {
    he: '{success} מתוך {total} תשובות הזכירו את העסק או ציטטו את האתר',
    en: '{success} of {total} answers mentioned the business or cited the site',
    es: '{success} de {total} respuestas mencionaron el negocio o citaron la web',
    'pt-BR': '{success} de {total} respostas mencionaram o negócio ou citaram o site',
    fr: '{success} réponses sur {total} ont mentionné l\'entreprise ou cité le site',
    it: '{success} risposte su {total} hanno menzionato l\'attività o citato il sito',
  },
  geo_comp_loss_badge: { he: 'דורש תשומת לב', en: 'Needs attention', es: 'Requiere atención', 'pt-BR': 'Requer atenção', fr: 'À surveiller', it: 'Da tenere d\'occhio' },
  geo_card_content: { he: 'תוכן שכדאי לחזק', en: 'Content to strengthen', es: 'Contenido que hay que reforzar', 'pt-BR': 'Conteúdo a reforçar', fr: 'Contenu à renforcer', it: 'Contenuti da rafforzare' },
  geo_card_questions: { he: 'שאלות שבהן העסק לא הופיע', en: 'Questions where the business is weak', es: 'Preguntas en las que el negocio va flojo', 'pt-BR': 'Perguntas em que o negócio vai mal', fr: 'Questions où l\'entreprise est faible', it: 'Domande in cui l\'attività è debole' },
  geo_card_engines: { he: 'מנועים שכדאי לחזק', en: 'Engines worth strengthening', fr: 'Moteurs à renforcer', it: 'Motori da rafforzare' },
  geo_card_missing: { he: 'מה חסר כשהעסק לא מופיע', en: 'What is missing when the business does not appear', es: 'Qué falta cuando el negocio no aparece', 'pt-BR': 'O que falta quando o negócio não aparece', fr: 'Ce qui manque quand l\'entreprise n\'apparaît pas', it: 'Che cosa manca quando l\'attività non compare' },
  geo_opp_fallback: {
    he: 'כרגע לא זוהתה חולשה ברורה. כדי לקבל המלצות מדויקות יותר, מומלץ להריץ עוד שאלות ומנועים.',
    en: 'No clear weakness detected at the moment. To get more accurate recommendations, run more questions and engines.',
    es: 'Ahora mismo no se detecta ninguna debilidad clara. Para tener recomendaciones más precisas, comprueba más preguntas y más motores.',
    'pt-BR': 'No momento, nenhuma fraqueza clara foi detectada. Para ter recomendações mais precisas, verifique mais perguntas e mais motores.',
    fr: 'Aucune faiblesse claire détectée pour le moment. Pour des recommandations plus précises, lancez plus de questions et de moteurs.',
    it: 'Per il momento non è stata rilevata nessuna debolezza evidente. Per raccomandazioni più precise, lanciare più domande e più motori.',
  },
  no_recommended_yet: { he: 'עדיין אין שאלות מומלצות לפרויקט הזה', en: 'No recommended questions yet for this project', es: 'Todavía no hay preguntas recomendadas para este proyecto', 'pt-BR': 'Ainda não há perguntas recomendadas para este projeto', fr: 'Aucune question recommandée pour ce projet pour l\'instant', it: 'Nessuna domanda consigliata per questo progetto per il momento' },
  generate_recommended: { he: 'יצירת שאלות מומלצות', en: 'Generate recommended questions', es: 'Generar preguntas recomendadas', 'pt-BR': 'Gerar perguntas recomendadas', fr: 'Générer des questions recommandées', it: 'Generare domande consigliate' },
  generating_recommended: { he: 'יוצר שאלות מומלצות…', en: 'Generating recommended questions…', es: 'Generando preguntas recomendadas…', 'pt-BR': 'Gerando perguntas recomendadas…', fr: 'Génération des questions recommandées…', it: 'Generazione delle domande consigliate…' },
  fallback_questions_notice: {
    he: 'לא הצלחנו ליצור שאלות דרך AI כרגע, ולכן הצגנו שאלות בסיסיות להתחלה.',
    en: 'We could not generate AI questions right now, so these are basic starter questions.',
    es: 'Ahora mismo no hemos podido generar preguntas de IA, así que estas son preguntas básicas para empezar.',
    'pt-BR': 'No momento, não foi possível gerar perguntas de IA, então estas são perguntas básicas para começar.',
    fr: 'Nous n\'avons pas pu générer de questions d\'IA pour le moment, voici donc des questions de départ de base.',
    it: 'Per il momento non è stato possibile generare domande di IA, quindi queste sono domande di partenza di base.',
  },
  more_questions_short: { he: 'עוד שאלות', en: 'More questions', es: 'Más preguntas', 'pt-BR': 'Mais perguntas', fr: 'Plus de questions', it: 'Altre domande' },
  competitor_results_of: { he: '{mentions} מתוך {total} תשובות', en: '{mentions} of {total} answers', es: '{mentions} de {total} respuestas', 'pt-BR': '{mentions} de {total} respostas', fr: '{mentions} réponses sur {total}', it: '{mentions} risposte su {total}' },
  share_of_voice_of_all: { he: 'מכלל האזכורים', en: 'of all mentions', es: 'del total de menciones', 'pt-BR': 'do total de menções', fr: 'de l\'ensemble des mentions', it: 'dell\'insieme delle menzioni' },
  share_of_voice_answers: { he: '{count} תשובות', en: '{count} answers', es: '{count} respuestas', 'pt-BR': '{count} respostas', fr: '{count} réponses', it: '{count} risposte' },
  competitor_updated: { he: 'עודכן {date}', en: 'Updated {date}', es: 'Actualizado el {date}', 'pt-BR': 'Atualizado em {date}', fr: 'Mis à jour le {date}', it: 'Aggiornato il {date}' },
  competitor_small_sample: {
    he: 'ההשוואה מבוססת על מעט תשובות. לתמונה מדויקת יותר, הוסיפו שאלות AI והריצו עוד בדיקות.',
    en: 'This comparison rests on only a few answers. Add AI questions and run more checks for a fuller picture.',
    es: 'Esta comparación se apoya en pocas respuestas. Añade preguntas de IA y haz más comprobaciones para tener una imagen completa.',
    'pt-BR': 'Esta comparação se apoia em poucas respostas. Adicione perguntas de IA e faça mais verificações para ter um quadro completo.',
    fr: 'Cette comparaison repose sur peu de réponses. Ajoutez des questions d\'IA et lancez plus de vérifications pour avoir une image complète.',
    it: 'Questo confronto si basa su poche risposte. Si consiglia di aggiungere domande di IA e di lanciare più verifiche per avere un quadro completo.',
  },
  drawer_summary_both: { he: 'העסק אוזכר בתשובה, והאתר הופיע כמקור.', en: 'The business was mentioned in the answer, and the site was cited as a source.', es: 'El negocio se mencionó en la respuesta y la web se citó como fuente.', 'pt-BR': 'O negócio foi mencionado na resposta e o site foi citado como fonte.', fr: 'L\'entreprise a été mentionnée dans la réponse, et le site a été cité comme source.', it: 'L\'attività è stata menzionata nella risposta e il sito è stato citato come fonte.' },
  drawer_summary_mentioned: { he: 'העסק אוזכר בתשובה, אבל האתר לא הופיע כמקור.', en: 'The business was mentioned in the answer, but the site was not cited as a source.', es: 'El negocio se mencionó en la respuesta, pero la web no se citó como fuente.', 'pt-BR': 'O negócio foi mencionado na resposta, mas o site não foi citado como fonte.', fr: 'L\'entreprise a été mentionnée dans la réponse, mais le site n\'a pas été cité comme source.', it: 'L\'attività è stata menzionata nella risposta, ma il sito non è stato citato come fonte.' },
  drawer_summary_cited: { he: 'האתר הופיע כמקור, אבל העסק לא אוזכר בגוף התשובה.', en: 'The site was cited as a source, but the business was not named in the answer.', es: 'La web se citó como fuente, pero el negocio no se nombró en la respuesta.', 'pt-BR': 'O site foi citado como fonte, mas o negócio não foi nomeado na resposta.', fr: 'Le site a été cité comme source, mais l\'entreprise n\'a pas été nommée dans la réponse.', it: 'Il sito è stato citato come fonte, ma l\'attività non è stata nominata nella risposta.' },
  drawer_summary_none: { he: 'העסק לא אוזכר בתשובה, והאתר לא הופיע כמקור.', en: 'The business was not mentioned in the answer, and the site was not cited.', es: 'El negocio no se mencionó en la respuesta y la web no se citó.', 'pt-BR': 'O negócio não foi mencionado na resposta e o site não foi citado.', fr: 'L\'entreprise n\'a pas été mentionnée dans la réponse, et le site n\'a pas été cité.', it: 'L\'attività non è stata menzionata nella risposta e il sito non è stato citato.' },
  drawer_keep_going: {
    he: 'שמרו על תוכן ברור עם מחירים, ביקורות והמלצות כדי לחזק את הופעתכם בתוצאות דומות.',
    en: 'Keep your content clear with pricing, reviews and recommendations to strengthen your visibility in similar queries.',
    es: 'Mantén tu contenido claro, con precios, reseñas y recomendaciones, para reforzar tu presencia en preguntas parecidas.',
    'pt-BR': 'Mantenha o seu conteúdo claro, com preços, avaliações e recomendações, para reforçar a sua presença em perguntas parecidas.',
    fr: 'Gardez un contenu clair, avec les prix, les avis et les recommandations, pour renforcer votre présence sur des questions similaires.',
    it: 'Si consiglia di mantenere un contenuto chiaro, con i prezzi, le recensioni e le raccomandazioni, per rafforzare la presenza su domande simili.',
  },
  drawer_no_improvements: { he: 'לא זוהו פעולות שיפור ברורות בתוצאה הזו.', en: 'No clear improvements were detected in this result.', es: 'No se han detectado mejoras claras en este resultado.', 'pt-BR': 'Nenhuma melhoria clara foi detectada neste resultado.', fr: 'Aucune amélioration claire n\'a été détectée dans ce résultat.', it: 'In questo risultato non è stato rilevato nessun miglioramento evidente da apportare.' },
  ai_summary_strong_low: { he: 'העסק הופיע בעיקר ב־{names}.', en: 'The business did appear mainly on {names}.', es: 'El negocio sí apareció, sobre todo en {names}.', 'pt-BR': 'O negócio de fato apareceu, principalmente em {names}.', fr: 'L\'entreprise est bien apparue, surtout sur {names}.', it: 'L\'attività è comparsa soprattutto su {names}.' },
  ai_summary_strong_high: { he: 'הנראות חזקה בעיקר ב־{names}.', en: 'Visibility is strong mainly on {names}.', es: 'La visibilidad es fuerte sobre todo en {names}.', 'pt-BR': 'A visibilidade é forte principalmente em {names}.', fr: 'La visibilité est forte surtout sur {names}.', it: 'La visibilità è forte soprattutto su {names}.' },
  ai_summary_weak: { he: 'החולשה המרכזית היא ב־{names}.', en: 'The main weakness is on {names}.', es: 'La mayor debilidad está en {names}.', 'pt-BR': 'A maior fraqueza está em {names}.', fr: 'La principale faiblesse se situe sur {names}.', it: 'La debolezza principale riguarda {names}.' },
  competitors_used_for: { he: 'המתחרים ישמשו להשוואת נראות בתשובות AI.', en: 'These competitors are used to compare AI visibility.', es: 'Estos competidores se usan para comparar la visibilidad en IA.', 'pt-BR': 'Estes concorrentes são usados para comparar a visibilidade em IA.', fr: 'Ces concurrents servent à comparer la visibilité dans les IA.', it: 'Questi concorrenti servono a confrontare la visibilità nelle IA.' },
  open_source: { he: 'פתיחת המקור בכרטיסייה חדשה', en: 'Open the source in a new tab', es: 'Abrir la fuente en una pestaña nueva', 'pt-BR': 'Abrir a fonte em uma nova aba', fr: 'Ouvrir la source dans un nouvel onglet', it: 'Aprire la fonte in una nuova scheda' },
} as const

type StringKey = keyof typeof STRINGS

export function isHebrew(language: string | null | undefined, country?: string | null): boolean {
  if (language?.toLowerCase() === 'he') return true
  if (country?.toUpperCase() === 'IL') return true
  return false
}

export function createI18n(language: string | null | undefined, country?: string | null) {
  const heb = isHebrew(language, country)
  const lower = language?.toLowerCase() ?? ''
  const spa = !heb && lower === 'es'
  // Brazilian Portuguese arrives as 'pt-BR' from the dashboard and as 'pt' or
  // 'pt-br' from stored project rows, so the test is on the prefix.
  const por = !heb && !spa && (lower === 'pt' || lower.startsWith('pt-'))
  // French arrives as 'fr' from the dashboard and as 'fr', 'fr-FR' or 'fr-CA'
  // from stored project rows, so the test is on the prefix the same way, and
  // Quebec reads the same French as France.
  const fre = !heb && !spa && !por && (lower === 'fr' || lower.startsWith('fr-'))
  // Italian arrives as 'it' from the dashboard and as 'it' or 'it-IT' from
  // stored project rows, so the test is on the prefix the same way.
  const ita = !heb && !spa && !por && !fre && (lower === 'it' || lower.startsWith('it-'))
  return function t(key: StringKey): string {
    const entry = STRINGS[key] as { he: string; en: string; es?: string; 'pt-BR'?: string; fr?: string; it?: string }
    if (heb) return entry.he
    if (por) return entry['pt-BR'] || entry.en
    if (fre) return entry.fr || entry.en
    if (ita) return entry.it || entry.en
    return (spa && entry.es) || entry.en
  }
}
