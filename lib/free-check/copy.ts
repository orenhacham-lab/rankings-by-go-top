/**
 * All merchant-facing copy for the free site check, in every public locale.
 *
 * It lives in one file rather than in lib/i18n/public because the whole
 * feature is self-contained and because the findings engine needs the strings
 * server-side, where the public dictionary's React-oriented shape does not
 * help. `FreeCheckCopy` is structural, so the locales cannot drift apart
 * without a compile error.
 */
import type { PublicLocale } from '@/lib/i18n/locales'

export type FreeCheckCopy = {
  page: {
    badge: string; title: string; titleAccent: string; subtitle: string
    /** Short, true reassurances under the form, each with a check (w7 P1-9). */
    trust: string[]
    /** What the check shows, one card each under the form (w7 P1-9). */
    expect: { title: string; body: string }[]
  }
  form: {
    label: string
    placeholder: string
    submit: string
    hint: string
    errors: Record<'invalid_url' | 'blocked_url' | 'unreachable' | 'not_html' | 'rate_limited' | 'daily_cap' | 'internal', string>
  }
  loading: { title: string; sub: string; footer: string; steps: string[] }
  results: {
    heading: string
    scanned: string
    countersTitle: string
    counters: { keywords: string; fixes: string; geo: string; articles: string }
    businessTitle: string
    audienceTitle: string
    competitorsTitle: string
    competitorsLocked: string
    findingsTitle: string
    findingsEmpty: string
    findingsLocked: string
    geoTitle: string
    geoIntro: string
    geoScore: string
    articlesTitle: string
    articlesNote: string
    gateTitle: string
    gateBody: string
    gateBullets: string[]
    gateCta: string
    gateSecondary: string
    gateTerms: string
    again: string
    aiUnavailable: string
  }
  findings: Record<string, { title: string; detail: string }>
  geo: Record<string, { pass: { title: string; detail: string }; fail: { title: string; detail: string } }>
  evidence: { images: (missing: number, total: number) => string; words: (n: number) => string; h1: (n: number) => string }
}

const he: FreeCheckCopy = {
  page: {
    badge: 'בדיקה חינמית, בלי התחייבות',
    title: 'בדיקת SEO ו-AI לאתר שלכם,',
    titleAccent: 'בפחות מדקה',
    subtitle: 'הכניסו כתובת אתר. אנחנו קוראים את האתר באמת, מבינים במה העסק עוסק, ומראים מה מעכב אתכם בגוגל ובמנועי AI.',
    trust: ['חינם, בלי כרטיס אשראי', 'בלי להתקין כלום', 'בלי הרשמה'],
    expect: [
      { title: 'מה הבנו על העסק', body: 'במה העסק עוסק ומי הלקוחות שלו, כמו שהאתר עצמו מספר.' },
      { title: 'מה מעכב אתכם', body: 'מה בעמוד מפריע לגוגל ולמנועי AI להבין אתכם, מהחשוב ביותר.' },
      { title: 'כמה אתם מוכנים ל-AI', body: 'האם ChatGPT ו-Gemini יכולים לקרוא את האתר ולצטט אותו.' },
    ],
  },
  form: {
    label: 'כתובת האתר',
    placeholder: 'example.co.il',
    submit: 'בדקו את האתר',
    hint: 'שדה אחד. זה כל מה שתמלאו.',
    errors: {
      invalid_url: 'הכתובת לא נראית תקינה. נסו שוב, לדוגמה example.co.il',
      blocked_url: 'אפשר לבדוק רק אתרים ציבוריים. כתובת פנימית או כתובת IP לא נתמכת.',
      unreachable: 'לא הצלחנו להגיע לאתר. בדקו את הכתובת ונסו שוב.',
      not_html: 'הכתובת הזאת לא מחזירה עמוד אינטרנט שאפשר לקרוא.',
      rate_limited: 'ביצעתם כמה בדיקות ברצף. נסו שוב בעוד דקה.',
      daily_cap: 'הבדיקה החינמית עמוסה כרגע. נסו שוב מאוחר יותר או פתחו חשבון לבדיקה מלאה.',
      internal: 'משהו נתקע אצלנו. נסו שוב בעוד רגע.',
    },
  },
  loading: {
    title: 'קוראים את האתר ואת מבנה העמודים',
    sub: 'זה לוקח פחות מדקה. אנחנו באמת קוראים את האתר, לא מנחשים.',
    footer: 'מעבדים נתונים, התמצית תהיה מוכנה עוד רגע',
    steps: [
      'קוראים את האתר ואת מבנה העמודים',
      'מבינים במה העסק עוסק ומי הלקוחות',
      'בודקים מה מעכב אתכם בגוגל',
      'מחפשים מי המתחרים שלכם',
    ],
  },
  results: {
    heading: 'תמצית מחקר ראשונה',
    scanned: 'סרקנו את',
    countersTitle: 'מה מצאנו',
    counters: { keywords: 'מילות מפתח שנקדם', fixes: 'דברים לתקן באתר', geo: 'מוכנות לתשובות AI', articles: 'מאמרים מוכנים לכתיבה' },
    businessTitle: 'מה הבנו על העסק',
    audienceTitle: 'מי הלקוחות שלכם',
    competitorsTitle: 'מי המתחרים שלכם',
    competitorsLocked: 'לעוד מתחרים ולמיפוי מלא, פתחו חשבון חינם',
    findingsTitle: 'מה מעכב אתכם עכשיו',
    findingsEmpty: 'האתר נקי מהבעיות שאנחנו בודקים. כל הכבוד.',
    findingsLocked: 'ממצאים נוספים מחכים לכם בחשבון',
    geoTitle: 'כמה מוכנים אתם לתשובות של AI',
    geoIntro: 'מנועי AI כמו ChatGPT ו-Perplexity לא מדרגים אתרים, הם מצטטים אותם. בדקנו כמה קל להם לצטט אתכם.',
    geoScore: 'סימנים תקינים',
    articlesTitle: 'המאמרים שהיינו כותבים לכם',
    articlesNote: 'המאמרים נבנים מאסטרטגיית תוכן שמבוססת על ההזדמנויות החזקות במילות המפתח שלכם.',
    gateTitle: 'זה היה הטיזר. המחקר האמיתי מתחיל ברגע שנכנסים',
    gateBody: 'פותחים חשבון חינם, והמערכת יוצאת לעבודה על האתר שלכם.',
    gateBullets: [
      'המחקר המלא, עם נפחי חיפוש אמיתיים',
      'תוכנית תוכן לרבעון שלם, בנויה על הנישה שלכם',
      'המאמר הראשון נכתב בשבילכם',
      'מיפוי מתחרים מלא ומעקב אזכורים במנועי AI',
    ],
    gateCta: 'פתחו חשבון חינם',
    gateSecondary: 'יש לכם חשבון? התחברו',
    gateTerms: 'בהמשך אתם מאשרים את תנאי השימוש ומדיניות הפרטיות.',
    again: 'לבדוק אתר אחר',
    aiUnavailable: 'הבדיקה הטכנית הושלמה. תמצית העסק ומילות המפתח יחכו לכם בחשבון.',
  },
  findings: {
    title_missing: { title: 'לעמוד אין כותרת (title)', detail: 'הכותרת היא מה שגוגל מציג בתוצאות. בלעדיה גוגל ממציא כותרת במקומכם.' },
    title_short: { title: 'כותרת העמוד קצרה מדי', detail: 'כותרת של פחות מ-30 תווים לא מנצלת את המקום שגוגל נותן ולא מכילה את מילות החיפוש.' },
    title_long: { title: 'כותרת העמוד ארוכה מדי', detail: 'מעל 65 תווים גוגל חותך את הכותרת באמצע.' },
    description_missing: { title: 'אין תיאור מטא (meta description)', detail: 'התיאור הוא שורת השיווק שלכם בתוצאות החיפוש. בלעדיו גוגל שולף משפט רנדומלי מהעמוד.' },
    description_length: { title: 'תיאור המטא לא באורך הנכון', detail: 'מתחת ל-70 תווים או מעל 165, התיאור מוצג חלקי או לא מנוצל.' },
    h1_missing: { title: 'אין כותרת H1 בעמוד', detail: 'ה-H1 אומר לגוגל ולמנועי AI על מה העמוד. בלעדיו הם מנחשים מהטקסט.' },
    h1_multiple: { title: 'יש יותר מכותרת H1 אחת', detail: 'כמה H1 מפצלים את המשמעות של העמוד ומחלישים כל אחד מהם.' },
    images_alt: { title: 'לתמונות חסר טקסט חלופי (ALT)', detail: 'גוגל לא רואה תמונות, הוא קורא ALT. בלעדיו התמונות שלכם לא מביאות תנועה, וגם הנגישות נפגעת.' },
    thin_content: { title: 'מעט מדי טקסט בעמוד', detail: 'עמוד עם מעט טקסט לא מספק לגוגל ולמנועי AI מה לדרג ומה לצטט.' },
    no_schema: { title: 'אין נתונים מובנים (Schema)', detail: 'בלי Schema גוגל ומנועי AI לא יודעים בוודאות מי אתם ובמה אתם עוסקים.' },
    no_canonical: { title: 'אין תגית canonical', detail: 'בלי canonical אותו עמוד יכול להיספר כמה פעמים ולהתחרה בעצמו.' },
    no_viewport: { title: 'אין הגדרת viewport למובייל', detail: 'גוגל מדרג לפי הגרסה המובילית. בלי viewport העמוד נראה שבור בטלפון.' },
    no_open_graph: { title: 'אין תגיות שיתוף (Open Graph)', detail: 'בשיתוף בוואטסאפ ובפייסבוק לא תופיע תמונה או כותרת מסודרת.' },
    robots_blocks_all: { title: 'robots.txt חוסם את כל הסורקים', detail: 'הקובץ אומר לכל הבוטים לא לסרוק את האתר. זה מונע הופעה בגוגל.' },
    robots_blocks_ai: { title: 'robots.txt חוסם בוטים של מנועי AI', detail: 'הבוטים שחסומים לא יכולים לצטט אתכם בתשובות של ChatGPT ודומיו.' },
    no_faq: { title: 'אין מקטע שאלות ותשובות', detail: 'מנועי AI עונים לשאלות, ולכן מצטטים עמודים שעונים על שאלות.' },
  },
  geo: {
    schema: {
      pass: { title: 'הנתונים המובנים מזהים את העסק', detail: 'מנועי AI יודעים מי אתם ובמה אתם עוסקים.' },
      fail: { title: 'אין נתונים מובנים שמזהים את העסק', detail: 'בלי Schema של עסק, מנועי AI לא בטוחים מי אתם.' },
    },
    faq: {
      pass: { title: 'יש מקטע שאלות ותשובות', detail: 'עמוד שעונה על שאלות מצוטט הרבה יותר.' },
      fail: { title: 'אין מקטע שאלות ותשובות', detail: 'מנועי AI עונים לשאלות, ולכן מצטטים עמודים שעונים על שאלות. עמוד בלי שאלות כמעט לא מצוטט.' },
    },
    robots: {
      pass: { title: 'מנועי AI יכולים לקרוא את האתר', detail: 'robots.txt לא חוסם אף בוט של מנוע AI.' },
      fail: { title: 'robots.txt חוסם בוטים של מנועי AI', detail: 'הבוטים החסומים לא יוכלו לצטט אותכם.' },
    },
    llms: {
      pass: { title: 'קובץ llms.txt קיים', detail: 'האתר מגיש למנועי AI מפה מסודרת של עצמו, צעד לפני רוב השוק.' },
      fail: { title: 'אין קובץ llms.txt', detail: 'קובץ llms.txt מגיש למנועי AI מפה מסודרת של האתר. רוב השוק עוד לא עשה את זה.' },
    },
  },
  evidence: {
    images: (missing, total) => `${missing} מתוך ${total} תמונות`,
    words: (n) => `${n} מילים בעמוד`,
    h1: (n) => `${n} כותרות H1`,
  },
}

const en: FreeCheckCopy = {
  page: {
    badge: 'Free check, no strings attached',
    title: 'An SEO and AI check for your site,',
    titleAccent: 'in under a minute',
    subtitle: 'Enter your site address. We actually read the site, work out what the business does, and show what is holding you back in Google and in AI answers.',
    trust: ['Free, no credit card', 'Nothing to install', 'No sign-up'],
    expect: [
      { title: 'What we understood', body: 'What the business does and who its customers are, as the site itself tells it.' },
      { title: 'What holds you back', body: 'What on the page keeps Google and AI engines from understanding you, most important first.' },
      { title: 'How ready you are for AI', body: 'Whether ChatGPT and Gemini can read your site and quote it.' },
    ],
  },
  form: {
    label: 'Site address',
    placeholder: 'example.com',
    submit: 'Check my site',
    hint: 'One field. That is all you fill in.',
    errors: {
      invalid_url: 'That address does not look right. Try again, for example example.com',
      blocked_url: 'Only public websites can be checked. Internal addresses and IPs are not supported.',
      unreachable: 'We could not reach the site. Check the address and try again.',
      not_html: 'That address does not return a web page we can read.',
      rate_limited: 'That was several checks in a row. Try again in a minute.',
      daily_cap: 'The free check is busy right now. Try again later, or open an account for the full check.',
      internal: 'Something broke on our side. Try again in a moment.',
    },
  },
  loading: {
    title: 'Reading the site and its page structure',
    sub: 'This takes under a minute. We really do read the site, we do not guess.',
    footer: 'Processing, your summary is nearly ready',
    steps: [
      'Reading the site and its page structure',
      'Working out what the business does and who its customers are',
      'Checking what is holding you back in Google',
      'Looking for your competitors',
    ],
  },
  results: {
    heading: 'Your first research summary',
    scanned: 'We scanned',
    countersTitle: 'What we found',
    counters: { keywords: 'Keywords to target', fixes: 'Things to fix on the site', geo: 'AI answer readiness', articles: 'Articles ready to write' },
    businessTitle: 'What we understood about the business',
    audienceTitle: 'Who your customers are',
    competitorsTitle: 'Who your competitors are',
    competitorsLocked: 'For more competitors and the full map, open a free account',
    findingsTitle: 'What is holding you back right now',
    findingsEmpty: 'The site is clean on everything we check. Nicely done.',
    findingsLocked: 'More findings are waiting in your account',
    geoTitle: 'How ready you are for AI answers',
    geoIntro: 'AI engines like ChatGPT and Perplexity do not rank sites, they cite them. We checked how easy you are to cite.',
    geoScore: 'signals in good shape',
    articlesTitle: 'The articles we would write for you',
    articlesNote: 'Articles are built from a content strategy based on the strongest opportunities in your keywords.',
    gateTitle: 'That was the teaser. The real research starts once you are in',
    gateBody: 'Open a free account and the system goes to work on your site.',
    gateBullets: [
      'The full research, with real search volumes',
      'A content plan for a whole quarter, built on your niche',
      'The first article, written for you',
      'A full competitor map and AI citation tracking',
    ],
    gateCta: 'Open a free account',
    gateSecondary: 'Already have an account? Log in',
    gateTerms: 'By continuing you accept the terms of use and the privacy policy.',
    again: 'Check another site',
    aiUnavailable: 'The technical check is complete. The business summary and keywords will be waiting in your account.',
  },
  findings: {
    title_missing: { title: 'The page has no title', detail: 'The title is what Google shows in results. Without one, Google invents a title for you.' },
    title_short: { title: 'The page title is too short', detail: 'Under 30 characters wastes the space Google gives you and usually misses the search terms.' },
    title_long: { title: 'The page title is too long', detail: 'Over 65 characters and Google cuts the title mid-sentence.' },
    description_missing: { title: 'No meta description', detail: 'The description is your marketing line in search results. Without it Google pulls a random sentence off the page.' },
    description_length: { title: 'The meta description is the wrong length', detail: 'Under 70 characters or over 165 and it shows up partial or underused.' },
    h1_missing: { title: 'The page has no H1', detail: 'The H1 tells Google and AI engines what the page is about. Without it they guess from the text.' },
    h1_multiple: { title: 'More than one H1 on the page', detail: 'Several H1s split the page meaning and weaken each of them.' },
    images_alt: { title: 'Images are missing alt text', detail: 'Google does not see images, it reads alt text. Without it your images bring no traffic, and accessibility suffers.' },
    thin_content: { title: 'Too little text on the page', detail: 'A thin page gives Google and AI engines little to rank or cite.' },
    no_schema: { title: 'No structured data (Schema)', detail: 'Without Schema, Google and AI engines cannot be sure who you are and what you do.' },
    no_canonical: { title: 'No canonical tag', detail: 'Without a canonical, the same page can be counted several times and compete with itself.' },
    no_viewport: { title: 'No mobile viewport set', detail: 'Google ranks the mobile version. Without a viewport the page looks broken on a phone.' },
    no_open_graph: { title: 'No sharing tags (Open Graph)', detail: 'Shares on WhatsApp and Facebook will show no image or proper title.' },
    robots_blocks_all: { title: 'robots.txt blocks every crawler', detail: 'The file tells all bots not to crawl the site, which keeps you out of Google.' },
    robots_blocks_ai: { title: 'robots.txt blocks AI engine bots', detail: 'Blocked bots cannot cite you in ChatGPT-style answers.' },
    no_faq: { title: 'No questions and answers section', detail: 'AI engines answer questions, so they cite pages that answer questions.' },
  },
  geo: {
    schema: {
      pass: { title: 'Structured data identifies the business', detail: 'AI engines know who you are and what you do.' },
      fail: { title: 'No structured data identifying the business', detail: 'Without business Schema, AI engines are unsure who you are.' },
    },
    faq: {
      pass: { title: 'There is a questions and answers section', detail: 'A page that answers questions gets cited far more.' },
      fail: { title: 'No questions and answers section', detail: 'AI engines answer questions, so they cite pages that answer questions. A page without questions is rarely cited.' },
    },
    robots: {
      pass: { title: 'AI engines can read the site', detail: 'robots.txt blocks no AI engine bot.' },
      fail: { title: 'robots.txt blocks AI engine bots', detail: 'The blocked bots will not be able to cite you.' },
    },
    llms: {
      pass: { title: 'An llms.txt file exists', detail: 'The site hands AI engines a tidy map of itself, a step ahead of most of the market.' },
      fail: { title: 'No llms.txt file', detail: 'An llms.txt file hands AI engines a tidy map of the site. Most of the market has not done it yet.' },
    },
  },
  evidence: {
    images: (missing, total) => `${missing} of ${total} images`,
    words: (n) => `${n} words on the page`,
    h1: (n) => `${n} H1 headings`,
  },
}

const es: FreeCheckCopy = {
  page: {
    badge: 'Análisis gratuito, sin compromiso',
    title: 'Un análisis SEO y de IA de tu sitio,',
    titleAccent: 'en menos de un minuto',
    subtitle: 'Escribe la dirección de tu sitio. Lo leemos de verdad, deducimos a qué se dedica el negocio y te mostramos qué te está frenando en Google y en las respuestas de la IA.',
    trust: ['Gratis, sin tarjeta de crédito', 'Nada que instalar', 'Sin registro'],
    expect: [
      { title: 'Qué entendimos', body: 'A qué se dedica el negocio y quiénes son sus clientes, tal como lo cuenta el propio sitio.' },
      { title: 'Qué te frena', body: 'Qué hay en la página que impide a Google y a los motores de IA entenderte, lo más importante primero.' },
      { title: 'Cuánto estás listo para la IA', body: 'Si ChatGPT y Gemini pueden leer tu sitio y citarlo.' },
    ],
  },
  form: {
    label: 'Dirección del sitio',
    placeholder: 'ejemplo.com',
    submit: 'Analizar mi sitio',
    hint: 'Un solo campo. Es todo lo que tienes que rellenar.',
    errors: {
      invalid_url: 'Esa dirección no parece correcta. Inténtalo de nuevo, por ejemplo ejemplo.com',
      blocked_url: 'Solo se pueden analizar sitios web públicos. Las direcciones internas y las IP no están admitidas.',
      unreachable: 'No pudimos acceder al sitio. Revisa la dirección e inténtalo de nuevo.',
      not_html: 'Esa dirección no devuelve una página web que podamos leer.',
      rate_limited: 'Fueron varios análisis seguidos. Inténtalo de nuevo en un minuto.',
      daily_cap: 'El análisis gratuito está saturado ahora mismo. Inténtalo más tarde o abre una cuenta para el análisis completo.',
      internal: 'Algo falló por nuestra parte. Inténtalo de nuevo en un momento.',
    },
  },
  loading: {
    title: 'Leyendo el sitio y la estructura de sus páginas',
    sub: 'Tarda menos de un minuto. Leemos el sitio de verdad, no lo adivinamos.',
    footer: 'Procesando, tu resumen está casi listo',
    steps: [
      'Leyendo el sitio y la estructura de sus páginas',
      'Deduciendo a qué se dedica el negocio y quiénes son sus clientes',
      'Comprobando qué te está frenando en Google',
      'Buscando a tus competidores',
    ],
  },
  results: {
    heading: 'Tu primer resumen de investigación',
    scanned: 'Analizamos',
    countersTitle: 'Qué encontramos',
    counters: { keywords: 'Palabras clave que trabajar', fixes: 'Cosas que arreglar en el sitio', geo: 'Preparación para respuestas de IA', articles: 'Artículos listos para escribir' },
    businessTitle: 'Qué entendimos del negocio',
    audienceTitle: 'Quiénes son tus clientes',
    competitorsTitle: 'Quiénes son tus competidores',
    competitorsLocked: 'Para ver más competidores y el mapa completo, abre una cuenta gratuita',
    findingsTitle: 'Qué te está frenando ahora mismo',
    findingsEmpty: 'El sitio está limpio en todo lo que comprobamos. Bien hecho.',
    findingsLocked: 'Hay más hallazgos esperándote en tu cuenta',
    geoTitle: 'Cuánto estás listo para las respuestas de la IA',
    geoIntro: 'Los motores de IA como ChatGPT y Perplexity no posicionan sitios, los citan. Comprobamos lo fácil que es citarte.',
    geoScore: 'señales en buen estado',
    articlesTitle: 'Los artículos que escribiríamos para ti',
    articlesNote: 'Los artículos se construyen a partir de una estrategia de contenido basada en las mejores oportunidades de tus palabras clave.',
    gateTitle: 'Eso era el adelanto. La investigación de verdad empieza cuando entras',
    gateBody: 'Abre una cuenta gratuita y el sistema se pone a trabajar en tu sitio.',
    gateBullets: [
      'La investigación completa, con volúmenes de búsqueda reales',
      'Un plan de contenido para todo un trimestre, hecho para tu sector',
      'El primer artículo, escrito para ti',
      'Un mapa completo de competidores y seguimiento de citas en IA',
    ],
    gateCta: 'Abre una cuenta gratuita',
    gateSecondary: '¿Ya tienes cuenta? Inicia sesión',
    gateTerms: 'Al continuar aceptas los términos de uso y la política de privacidad.',
    again: 'Analizar otro sitio',
    aiUnavailable: 'El análisis técnico está completo. El resumen del negocio y las palabras clave te esperarán en tu cuenta.',
  },
  findings: {
    title_missing: { title: 'La página no tiene título', detail: 'El título es lo que Google muestra en los resultados. Sin él, Google se inventa uno por ti.' },
    title_short: { title: 'El título de la página es demasiado corto', detail: 'Por debajo de 30 caracteres desperdicias el espacio que te da Google y suele faltar el término de búsqueda.' },
    title_long: { title: 'El título de la página es demasiado largo', detail: 'Por encima de 65 caracteres, Google corta el título a mitad de frase.' },
    description_missing: { title: 'Sin meta descripción', detail: 'La descripción es tu frase comercial en los resultados de búsqueda. Sin ella, Google toma una frase cualquiera de la página.' },
    description_length: { title: 'La meta descripción tiene una longitud incorrecta', detail: 'Por debajo de 70 caracteres o por encima de 165 aparece cortada o aprovechada a medias.' },
    h1_missing: { title: 'La página no tiene H1', detail: 'El H1 le dice a Google y a los motores de IA de qué trata la página. Sin él, lo deducen del texto.' },
    h1_multiple: { title: 'Hay más de un H1 en la página', detail: 'Varios H1 dividen el significado de la página y debilitan a cada uno de ellos.' },
    images_alt: { title: 'A las imágenes les falta el texto alternativo', detail: 'Google no ve las imágenes, lee su texto alternativo. Sin él tus imágenes no traen visitas, y la accesibilidad se resiente.' },
    thin_content: { title: 'Hay muy poco texto en la página', detail: 'Una página escasa da poco a Google y a los motores de IA para posicionar o citar.' },
    no_schema: { title: 'Sin datos estructurados (Schema)', detail: 'Sin Schema, Google y los motores de IA no pueden tener claro quién eres y a qué te dedicas.' },
    no_canonical: { title: 'Sin etiqueta canónica', detail: 'Sin canónica, la misma página puede contarse varias veces y competir consigo misma.' },
    no_viewport: { title: 'Sin viewport para móvil', detail: 'Google posiciona la versión móvil. Sin viewport, la página se ve rota en el teléfono.' },
    no_open_graph: { title: 'Sin etiquetas para compartir (Open Graph)', detail: 'Al compartir en WhatsApp y Facebook no se verá ninguna imagen ni un título correcto.' },
    robots_blocks_all: { title: 'robots.txt bloquea a todos los rastreadores', detail: 'El archivo les dice a todos los bots que no rastreen el sitio, lo que te deja fuera de Google.' },
    robots_blocks_ai: { title: 'robots.txt bloquea a los bots de los motores de IA', detail: 'Un bot bloqueado no puede citarte en respuestas del estilo de ChatGPT.' },
    no_faq: { title: 'Sin sección de preguntas y respuestas', detail: 'Los motores de IA responden preguntas, así que citan páginas que responden preguntas.' },
  },
  geo: {
    schema: {
      pass: { title: 'Los datos estructurados identifican el negocio', detail: 'Los motores de IA saben quién eres y a qué te dedicas.' },
      fail: { title: 'Sin datos estructurados que identifiquen el negocio', detail: 'Sin Schema de negocio, los motores de IA no tienen claro quién eres.' },
    },
    faq: {
      pass: { title: 'Hay una sección de preguntas y respuestas', detail: 'Una página que responde preguntas se cita mucho más.' },
      fail: { title: 'Sin sección de preguntas y respuestas', detail: 'Los motores de IA responden preguntas, así que citan páginas que responden preguntas. Una página sin preguntas se cita pocas veces.' },
    },
    robots: {
      pass: { title: 'Los motores de IA pueden leer el sitio', detail: 'robots.txt no bloquea a ningún bot de motores de IA.' },
      fail: { title: 'robots.txt bloquea a los bots de los motores de IA', detail: 'Los bots bloqueados no podrán citarte.' },
    },
    llms: {
      pass: { title: 'Existe un archivo llms.txt', detail: 'El sitio les entrega a los motores de IA un mapa ordenado de sí mismo, un paso por delante de casi todo el mercado.' },
      fail: { title: 'Sin archivo llms.txt', detail: 'Un archivo llms.txt les entrega a los motores de IA un mapa ordenado del sitio. Casi todo el mercado todavía no lo ha hecho.' },
    },
  },
  evidence: {
    images: (missing, total) => `${missing} de ${total} imágenes`,
    words: (n) => `${n} palabras en la página`,
    h1: (n) => `${n} títulos H1`,
  },
}

const ptBR: FreeCheckCopy = {
  page: {
    badge: 'Análise gratuita, sem compromisso',
    title: 'Uma análise de SEO e de IA do seu site,',
    titleAccent: 'em menos de um minuto',
    subtitle: 'Digite o endereço do seu site. Nós o lemos de verdade, entendemos o que o negócio faz e mostramos o que está travando você no Google e nas respostas da IA.',
    trust: ['Grátis, sem cartão de crédito', 'Nada para instalar', 'Sem cadastro'],
    expect: [
      { title: 'O que entendemos', body: 'O que o negócio faz e quem são os clientes dele, como o próprio site conta.' },
      { title: 'O que está travando você', body: 'O que há na página que impede o Google e os motores de IA de entenderem você, o mais importante primeiro.' },
      { title: 'Quanto você está pronto para a IA', body: 'Se o ChatGPT e o Gemini conseguem ler o seu site e citá-lo.' },
    ],
  },
  form: {
    label: 'Endereço do site',
    placeholder: 'exemplo.com',
    submit: 'Analisar meu site',
    hint: 'Um único campo. É tudo o que você precisa preencher.',
    errors: {
      invalid_url: 'Esse endereço não parece correto. Tente de novo, por exemplo exemplo.com',
      blocked_url: 'Só é possível analisar sites públicos. Endereços internos e IPs não são aceitos.',
      unreachable: 'Não conseguimos acessar o site. Verifique o endereço e tente de novo.',
      not_html: 'Esse endereço não devolve uma página que possamos ler.',
      rate_limited: 'Foram várias análises seguidas. Tente de novo em um minuto.',
      daily_cap: 'A análise gratuita está lotada agora. Tente mais tarde ou abra uma conta para a análise completa.',
      internal: 'Algo falhou do nosso lado. Tente de novo em um instante.',
    },
  },
  loading: {
    title: 'Lendo o site e a estrutura das páginas',
    sub: 'Leva menos de um minuto. Lemos o site de verdade, não adivinhamos.',
    footer: 'Processando, seu resumo está quase pronto',
    steps: [
      'Lendo o site e a estrutura das páginas',
      'Entendendo o que o negócio faz e quem são os clientes',
      'Verificando o que está travando você no Google',
      'Procurando seus concorrentes',
    ],
  },
  results: {
    heading: 'Seu primeiro resumo de pesquisa',
    scanned: 'Analisamos',
    countersTitle: 'O que encontramos',
    counters: { keywords: 'Palavras-chave para trabalhar', fixes: 'Coisas para arrumar no site', geo: 'Preparo para respostas de IA', articles: 'Artigos prontos para escrever' },
    businessTitle: 'O que entendemos do negócio',
    audienceTitle: 'Quem são seus clientes',
    competitorsTitle: 'Quem são seus concorrentes',
    competitorsLocked: 'Para ver mais concorrentes e o mapa completo, abra uma conta gratuita',
    findingsTitle: 'O que está travando você agora',
    findingsEmpty: 'O site está limpo em tudo o que verificamos. Muito bem.',
    findingsLocked: 'Há mais achados esperando por você na sua conta',
    geoTitle: 'Quanto você está pronto para as respostas da IA',
    geoIntro: 'Motores de IA como o ChatGPT e o Perplexity não posicionam sites, eles os citam. Verificamos o quanto é fácil citar você.',
    geoScore: 'sinais em bom estado',
    articlesTitle: 'Os artigos que escreveríamos para você',
    articlesNote: 'Os artigos são construídos a partir de uma estratégia de conteúdo baseada nas melhores oportunidades das suas palavras-chave.',
    gateTitle: 'Isso era a amostra. A pesquisa de verdade começa quando você entra',
    gateBody: 'Abra uma conta gratuita e o sistema começa a trabalhar no seu site.',
    gateBullets: [
      'A pesquisa completa, com volumes de busca reais',
      'Um plano de conteúdo para um trimestre inteiro, feito para o seu setor',
      'O primeiro artigo, escrito para você',
      'Um mapa completo de concorrentes e acompanhamento de citações em IA',
    ],
    gateCta: 'Abra uma conta gratuita',
    gateSecondary: 'Já tem conta? Entre',
    gateTerms: 'Ao continuar você aceita os termos de uso e a política de privacidade.',
    again: 'Analisar outro site',
    aiUnavailable: 'A análise técnica está completa. O resumo do negócio e as palavras-chave vão esperar por você na sua conta.',
  },
  findings: {
    title_missing: { title: 'A página não tem título', detail: 'O título é o que o Google mostra nos resultados. Sem ele, o Google inventa um por você.' },
    title_short: { title: 'O título da página é curto demais', detail: 'Abaixo de 30 caracteres você desperdiça o espaço que o Google dá, e normalmente falta o termo de busca.' },
    title_long: { title: 'O título da página é longo demais', detail: 'Acima de 65 caracteres, o Google corta o título no meio da frase.' },
    description_missing: { title: 'Sem meta descrição', detail: 'A descrição é a sua frase de venda nos resultados de busca. Sem ela, o Google pega qualquer frase da página.' },
    description_length: { title: 'A meta descrição tem o tamanho errado', detail: 'Abaixo de 70 caracteres ou acima de 165 ela aparece cortada ou aproveitada pela metade.' },
    h1_missing: { title: 'A página não tem H1', detail: 'O H1 diz ao Google e aos motores de IA do que a página trata. Sem ele, eles deduzem do texto.' },
    h1_multiple: { title: 'Há mais de um H1 na página', detail: 'Vários H1 dividem o significado da página e enfraquecem cada um deles.' },
    images_alt: { title: 'Faltam textos alternativos nas imagens', detail: 'O Google não vê as imagens, ele lê o texto alternativo delas. Sem ele suas imagens não trazem visitas, e a acessibilidade piora.' },
    thin_content: { title: 'Há pouco texto na página', detail: 'Uma página rasa dá pouco ao Google e aos motores de IA para posicionar ou citar.' },
    no_schema: { title: 'Sem dados estruturados (Schema)', detail: 'Sem Schema, o Google e os motores de IA não têm clareza sobre quem você é e o que você faz.' },
    no_canonical: { title: 'Sem tag canônica', detail: 'Sem canônica, a mesma página pode ser contada várias vezes e competir consigo mesma.' },
    no_viewport: { title: 'Sem viewport para celular', detail: 'O Google posiciona a versão para celular. Sem viewport, a página aparece quebrada no telefone.' },
    no_open_graph: { title: 'Sem tags de compartilhamento (Open Graph)', detail: 'Ao compartilhar no WhatsApp e no Facebook não aparece nenhuma imagem nem um título correto.' },
    robots_blocks_all: { title: 'O robots.txt bloqueia todos os rastreadores', detail: 'O arquivo diz a todos os bots para não rastrearem o site, o que deixa você fora do Google.' },
    robots_blocks_ai: { title: 'O robots.txt bloqueia os bots dos motores de IA', detail: 'Um bot bloqueado não pode citar você em respostas do tipo do ChatGPT.' },
    no_faq: { title: 'Sem seção de perguntas e respostas', detail: 'Os motores de IA respondem perguntas, por isso citam páginas que respondem perguntas.' },
  },
  geo: {
    schema: {
      pass: { title: 'Os dados estruturados identificam o negócio', detail: 'Os motores de IA sabem quem você é e o que você faz.' },
      fail: { title: 'Sem dados estruturados que identifiquem o negócio', detail: 'Sem Schema de negócio, os motores de IA não têm clareza sobre quem você é.' },
    },
    faq: {
      pass: { title: 'Há uma seção de perguntas e respostas', detail: 'Uma página que responde perguntas é citada muito mais.' },
      fail: { title: 'Sem seção de perguntas e respostas', detail: 'Os motores de IA respondem perguntas, por isso citam páginas que respondem perguntas. Uma página sem perguntas é citada poucas vezes.' },
    },
    robots: {
      pass: { title: 'Os motores de IA conseguem ler o site', detail: 'O robots.txt não bloqueia nenhum bot de motores de IA.' },
      fail: { title: 'O robots.txt bloqueia os bots dos motores de IA', detail: 'Bots bloqueados não vão poder citar você.' },
    },
    llms: {
      pass: { title: 'Existe um arquivo llms.txt', detail: 'O site entrega aos motores de IA um mapa organizado de si mesmo, um passo à frente de quase todo o mercado.' },
      fail: { title: 'Sem arquivo llms.txt', detail: 'Um arquivo llms.txt entrega aos motores de IA um mapa organizado do site. Quase todo o mercado ainda não fez isso.' },
    },
  },
  evidence: {
    images: (missing, total) => `${missing} de ${total} imagens`,
    words: (n) => `${n} palavras na página`,
    h1: (n) => `${n} títulos H1`,
  },
}

const fr: FreeCheckCopy = {
  page: {
    badge: 'Vérification gratuite, sans engagement',
    title: 'Une analyse SEO et IA de votre site,',
    titleAccent: 'en moins d’une minute',
    subtitle: 'Indiquez l’adresse de votre site. Nous le lisons réellement, nous déterminons l’activité de l’entreprise et nous montrons ce qui vous freine dans Google et dans les réponses des IA.',
    trust: ['Gratuit, sans carte bancaire', 'Rien à installer', 'Sans inscription'],
    expect: [
      { title: 'Ce que nous avons compris', body: 'L’activité de l’entreprise et ses clients, tels que le site lui-même les présente.' },
      { title: 'Ce qui vous freine', body: 'Ce qui, sur la page, empêche Google et les moteurs d’IA de vous comprendre, du plus important au moins important.' },
      { title: 'Votre niveau de préparation aux IA', body: 'Si ChatGPT et Gemini peuvent lire votre site et le citer.' },
    ],
  },
  form: {
    label: 'Adresse du site',
    placeholder: 'exemple.com',
    submit: 'Analyser mon site',
    hint: 'Un seul champ. C’est tout ce que vous remplissez.',
    errors: {
      invalid_url: 'Cette adresse ne semble pas correcte. Réessayez, par exemple exemple.com',
      blocked_url: 'Seuls les sites publics peuvent être analysés. Les adresses internes et les adresses IP ne sont pas prises en charge.',
      unreachable: 'Nous n’avons pas réussi à joindre le site. Vérifiez l’adresse et réessayez.',
      not_html: 'Cette adresse ne renvoie pas de page web que nous puissions lire.',
      rate_limited: 'Cela fait plusieurs analyses à la suite. Réessayez dans une minute.',
      daily_cap: 'La vérification gratuite est très demandée en ce moment. Réessayez plus tard, ou ouvrez un compte pour l’analyse complète.',
      internal: 'Quelque chose a échoué de notre côté. Réessayez dans un instant.',
    },
  },
  loading: {
    title: 'Lecture du site et de la structure de ses pages',
    sub: 'Cela prend moins d’une minute. Nous lisons vraiment le site, nous ne devinons pas.',
    footer: 'Traitement en cours, votre synthèse est presque prête',
    steps: [
      'Lecture du site et de la structure de ses pages',
      'Identification de l’activité de l’entreprise et de ses clients',
      'Vérification de ce qui vous freine dans Google',
      'Recherche de vos concurrents',
    ],
  },
  results: {
    heading: 'Votre première synthèse d’analyse',
    scanned: 'Nous avons analysé',
    countersTitle: 'Ce que nous avons trouvé',
    counters: { keywords: 'Mots-clés à viser', fixes: 'Points à corriger sur le site', geo: 'Préparation aux réponses des IA', articles: 'Articles prêts à être rédigés' },
    businessTitle: 'Ce que nous avons compris de l’entreprise',
    audienceTitle: 'Qui sont vos clients',
    competitorsTitle: 'Qui sont vos concurrents',
    competitorsLocked: 'Pour voir plus de concurrents et la carte complète, ouvrez un compte gratuit',
    findingsTitle: 'Ce qui vous freine en ce moment',
    findingsEmpty: 'Le site est irréprochable sur tout ce que nous vérifions. Bravo.',
    findingsLocked: 'D’autres constats vous attendent dans votre compte',
    geoTitle: 'Votre niveau de préparation aux réponses des IA',
    geoIntro: 'Les moteurs d’IA comme ChatGPT et Perplexity ne classent pas les sites, ils les citent. Nous avons vérifié à quel point vous êtes facile à citer.',
    geoScore: 'signaux en bon état',
    articlesTitle: 'Les articles que nous rédigerions pour vous',
    articlesNote: 'Les articles sont issus d’une stratégie de contenu fondée sur les meilleures opportunités de vos mots-clés.',
    gateTitle: 'Ce n’était qu’un aperçu. La vraie analyse commence une fois que vous êtes entré',
    gateBody: 'Ouvrez un compte gratuit et le système se met au travail sur votre site.',
    gateBullets: [
      'L’analyse complète, avec les volumes de recherche réels',
      'Un plan de contenu pour tout un trimestre, construit sur votre secteur',
      'Le premier article, rédigé pour vous',
      'Une carte complète des concurrents et le suivi des citations par les IA',
    ],
    gateCta: 'Ouvrir un compte gratuit',
    gateSecondary: 'Vous avez déjà un compte ? Connectez-vous',
    gateTerms: 'En continuant, vous acceptez les conditions d’utilisation et la politique de confidentialité.',
    again: 'Analyser un autre site',
    aiUnavailable: 'La vérification technique est terminée. La synthèse de l’entreprise et les mots-clés vous attendront dans votre compte.',
  },
  findings: {
    title_missing: { title: 'La page n’a pas de balise title', detail: 'Le title est ce que Google affiche dans ses résultats. Sans lui, Google en invente un à votre place.' },
    title_short: { title: 'Le title de la page est trop court', detail: 'En dessous de 30 caractères, vous perdez l’espace que Google vous accorde et vous manquez généralement les termes recherchés.' },
    title_long: { title: 'Le title de la page est trop long', detail: 'Au-delà de 65 caractères, Google coupe le title au milieu de la phrase.' },
    description_missing: { title: 'Pas de meta description', detail: 'La description est votre phrase commerciale dans les résultats de recherche. Sans elle, Google prend une phrase au hasard sur la page.' },
    description_length: { title: 'La meta description n’a pas la bonne longueur', detail: 'En dessous de 70 caractères ou au-delà de 165, elle s’affiche tronquée ou sous-exploitée.' },
    h1_missing: { title: 'La page n’a pas de H1', detail: 'Le H1 indique à Google et aux moteurs d’IA le sujet de la page. Sans lui, ils le devinent à partir du texte.' },
    h1_multiple: { title: 'Plus d’un H1 sur la page', detail: 'Plusieurs H1 divisent le sens de la page et affaiblissent chacun d’eux.' },
    images_alt: { title: 'Des images n’ont pas de texte alternatif', detail: 'Google ne voit pas les images, il lit le texte alternatif. Sans lui, vos images n’apportent aucun trafic, et l’accessibilité en souffre.' },
    thin_content: { title: 'Trop peu de texte sur la page', detail: 'Une page pauvre donne peu de matière à Google et aux moteurs d’IA pour la classer ou la citer.' },
    no_schema: { title: 'Pas de données structurées (Schema)', detail: 'Sans Schema, Google et les moteurs d’IA ne peuvent pas être sûrs de qui vous êtes ni de ce que vous faites.' },
    no_canonical: { title: 'Pas de balise canonique', detail: 'Sans canonique, une même page peut être comptée plusieurs fois et se concurrencer elle-même.' },
    no_viewport: { title: 'Pas de viewport mobile défini', detail: 'Google classe la version mobile. Sans viewport, la page paraît cassée sur un téléphone.' },
    no_open_graph: { title: 'Pas de balises de partage (Open Graph)', detail: 'Les partages sur WhatsApp et Facebook n’afficheront ni image ni titre correct.' },
    robots_blocks_all: { title: 'robots.txt bloque tous les robots', detail: 'Le fichier demande à tous les robots de ne pas explorer le site, ce qui vous maintient hors de Google.' },
    robots_blocks_ai: { title: 'robots.txt bloque les robots des moteurs d’IA', detail: 'Des robots bloqués ne peuvent pas vous citer dans des réponses du type ChatGPT.' },
    no_faq: { title: 'Pas de section questions-réponses', detail: 'Les moteurs d’IA répondent à des questions : ils citent donc les pages qui répondent à des questions.' },
  },
  geo: {
    schema: {
      pass: { title: 'Les données structurées identifient l’entreprise', detail: 'Les moteurs d’IA savent qui vous êtes et ce que vous faites.' },
      fail: { title: 'Aucune donnée structurée n’identifie l’entreprise', detail: 'Sans Schema d’entreprise, les moteurs d’IA ne savent pas bien qui vous êtes.' },
    },
    faq: {
      pass: { title: 'Il y a une section questions-réponses', detail: 'Une page qui répond à des questions est bien plus souvent citée.' },
      fail: { title: 'Pas de section questions-réponses', detail: 'Les moteurs d’IA répondent à des questions : ils citent donc les pages qui répondent à des questions. Une page sans questions est rarement citée.' },
    },
    robots: {
      pass: { title: 'Les moteurs d’IA peuvent lire le site', detail: 'robots.txt ne bloque aucun robot de moteur d’IA.' },
      fail: { title: 'robots.txt bloque les robots des moteurs d’IA', detail: 'Les robots bloqués ne pourront pas vous citer.' },
    },
    llms: {
      pass: { title: 'Un fichier llms.txt existe', detail: 'Le site donne aux moteurs d’IA une carte claire de lui-même, une longueur d’avance sur la plupart du marché.' },
      fail: { title: 'Pas de fichier llms.txt', detail: 'Un fichier llms.txt donne aux moteurs d’IA une carte claire du site. La plupart du marché ne l’a pas encore fait.' },
    },
  },
  evidence: {
    images: (missing, total) => `${missing} images sur ${total}`,
    words: (n) => `${n} mots sur la page`,
    h1: (n) => `${n} titres H1`,
  },
}

const it: FreeCheckCopy = {
  page: {
    badge: 'Controllo gratuito, senza impegno',
    title: 'Un\u2019analisi SEO e IA del proprio sito,',
    titleAccent: 'in meno di un minuto',
    subtitle: 'È sufficiente indicare l\u2019indirizzo del sito. Il sito viene letto davvero, viene individuata l\u2019attività dell\u2019azienda e viene mostrato ciò che la frena su Google e nelle risposte delle IA.',
    trust: ['Gratuito, senza carta di credito', 'Nulla da installare', 'Senza registrazione'],
    expect: [
      { title: 'Che cosa abbiamo capito', body: 'L\u2019attività dell\u2019azienda e i suoi clienti, così come il sito stesso li presenta.' },
      { title: 'Che cosa frena il sito', body: 'Ciò che, nella pagina, impedisce a Google e ai motori di IA di comprendere l\u2019attività, dal più importante al meno importante.' },
      { title: 'Il livello di preparazione alle IA', body: 'Se ChatGPT e Gemini possono leggere il sito e citarlo.' },
    ],
  },
  form: {
    label: 'Indirizzo del sito',
    placeholder: 'esempio.com',
    submit: 'Analizza il sito',
    hint: 'Un solo campo. È tutto ciò che va compilato.',
    errors: {
      invalid_url: 'Questo indirizzo non sembra corretto. Si consiglia di riprovare, per esempio esempio.com',
      blocked_url: 'Possono essere analizzati soltanto i siti pubblici. Gli indirizzi interni e gli indirizzi IP non sono supportati.',
      unreachable: 'Non è stato possibile raggiungere il sito. Si consiglia di verificare l\u2019indirizzo e riprovare.',
      not_html: 'Questo indirizzo non restituisce una pagina web leggibile.',
      rate_limited: 'Sono state avviate diverse analisi di seguito. Si consiglia di riprovare tra un minuto.',
      daily_cap: 'Il controllo gratuito è molto richiesto in questo momento. Si consiglia di riprovare più tardi, oppure di aprire un account per l\u2019analisi completa.',
      internal: 'Qualcosa non è andato a buon fine da parte nostra. Si consiglia di riprovare tra un istante.',
    },
  },
  loading: {
    title: 'Lettura del sito e della struttura delle sue pagine',
    sub: 'Richiede meno di un minuto. Il sito viene letto davvero, non si tratta di supposizioni.',
    footer: 'Elaborazione in corso, la sintesi è quasi pronta',
    steps: [
      'Lettura del sito e della struttura delle sue pagine',
      'Individuazione dell\u2019attività dell\u2019azienda e dei suoi clienti',
      'Verifica di ciò che frena il sito su Google',
      'Ricerca dei concorrenti',
    ],
  },
  results: {
    heading: 'La prima sintesi di analisi',
    scanned: 'Abbiamo analizzato',
    countersTitle: 'Che cosa abbiamo trovato',
    counters: { keywords: 'Parole chiave da puntare', fixes: 'Punti da correggere sul sito', geo: 'Preparazione alle risposte delle IA', articles: 'Articoli pronti da redigere' },
    businessTitle: 'Che cosa abbiamo capito dell\u2019azienda',
    audienceTitle: 'Chi sono i clienti',
    competitorsTitle: 'Chi sono i concorrenti',
    competitorsLocked: 'Per vedere altri concorrenti e la mappa completa, è sufficiente aprire un account gratuito',
    findingsTitle: 'Che cosa frena il sito in questo momento',
    findingsEmpty: 'Il sito è impeccabile su tutto ciò che verifichiamo. Complimenti.',
    findingsLocked: 'Altri rilievi attendono nel proprio account',
    geoTitle: 'Il livello di preparazione alle risposte delle IA',
    geoIntro: 'I motori di IA come ChatGPT e Perplexity non classificano i siti, li citano. Abbiamo verificato quanto il sito sia facile da citare.',
    geoScore: 'segnali in buono stato',
    articlesTitle: 'Gli articoli che redigeremmo',
    articlesNote: 'Gli articoli nascono da una strategia di contenuto basata sulle migliori opportunità fra le parole chiave.',
    gateTitle: 'Questa era solo un\u2019anteprima. La vera analisi inizia dopo l\u2019accesso',
    gateBody: 'Basta aprire un account gratuito e il sistema si mette al lavoro sul sito.',
    gateBullets: [
      'L\u2019analisi completa, con i volumi di ricerca reali',
      'Un piano di contenuti per un intero trimestre, costruito sul proprio settore',
      'Il primo articolo, redatto da noi',
      'Una mappa completa dei concorrenti e il monitoraggio delle citazioni da parte delle IA',
    ],
    gateCta: 'Apri un account gratuito',
    gateSecondary: 'Si dispone già di un account? Si acceda',
    gateTerms: 'Proseguendo si accettano le condizioni d\u2019uso e l\u2019informativa sulla privacy.',
    again: 'Analizza un altro sito',
    aiUnavailable: 'Il controllo tecnico è terminato. La sintesi dell\u2019azienda e le parole chiave saranno disponibili nel proprio account.',
  },
  findings: {
    title_missing: { title: 'La pagina non ha un tag title', detail: 'Il title è ciò che Google mostra nei suoi risultati. Senza di esso, Google ne crea uno al posto dell\u2019azienda.' },
    title_short: { title: 'Il title della pagina è troppo corto', detail: 'Sotto i 30 caratteri si perde lo spazio che Google concede e di norma si mancano i termini cercati.' },
    title_long: { title: 'Il title della pagina è troppo lungo', detail: 'Oltre i 65 caratteri, Google taglia il title a metà della frase.' },
    description_missing: { title: 'Nessuna meta description', detail: 'La description è la frase commerciale nei risultati di ricerca. Senza di essa, Google prende una frase qualsiasi dalla pagina.' },
    description_length: { title: 'La meta description non ha la lunghezza giusta', detail: 'Sotto i 70 caratteri oppure oltre i 165, viene mostrata troncata o sfruttata male.' },
    h1_missing: { title: 'La pagina non ha un H1', detail: 'L\u2019H1 indica a Google e ai motori di IA l\u2019argomento della pagina. Senza di esso, lo deducono dal testo.' },
    h1_multiple: { title: 'Più di un H1 nella pagina', detail: 'Più H1 dividono il senso della pagina e indeboliscono ciascuno di essi.' },
    images_alt: { title: 'Alcune immagini non hanno testo alternativo', detail: 'Google non vede le immagini, legge il testo alternativo. Senza di esso le immagini non portano traffico e l\u2019accessibilità ne risente.' },
    thin_content: { title: 'Troppo poco testo nella pagina', detail: 'Una pagina povera offre poco materiale a Google e ai motori di IA per classificarla o citarla.' },
    no_schema: { title: 'Nessun dato strutturato (Schema)', detail: 'Senza Schema, Google e i motori di IA non possono essere certi di chi sia l\u2019azienda né di che cosa faccia.' },
    no_canonical: { title: 'Nessun tag canonical', detail: 'Senza canonical, una stessa pagina può essere conteggiata più volte e farsi concorrenza da sola.' },
    no_viewport: { title: 'Nessun viewport mobile definito', detail: 'Google classifica la versione mobile. Senza viewport, la pagina appare rotta su un telefono.' },
    no_open_graph: { title: 'Nessun tag di condivisione (Open Graph)', detail: 'Le condivisioni su WhatsApp e Facebook non mostreranno né immagine né titolo corretto.' },
    robots_blocks_all: { title: 'robots.txt blocca tutti i crawler', detail: 'Il file chiede a tutti i crawler di non esplorare il sito, il che lo tiene fuori da Google.' },
    robots_blocks_ai: { title: 'robots.txt blocca i crawler dei motori di IA', detail: 'Crawler bloccati non possono citare l\u2019azienda in risposte del tipo ChatGPT.' },
    no_faq: { title: 'Nessuna sezione di domande e risposte', detail: 'I motori di IA rispondono a domande: citano quindi le pagine che rispondono a domande.' },
  },
  geo: {
    schema: {
      pass: { title: 'I dati strutturati identificano l\u2019azienda', detail: 'I motori di IA sanno chi è l\u2019azienda e che cosa fa.' },
      fail: { title: 'Nessun dato strutturato identifica l\u2019azienda', detail: 'Senza uno Schema dell\u2019azienda, i motori di IA non sanno con precisione di chi si tratti.' },
    },
    faq: {
      pass: { title: 'È presente una sezione di domande e risposte', detail: 'Una pagina che risponde a domande viene citata molto più spesso.' },
      fail: { title: 'Nessuna sezione di domande e risposte', detail: 'I motori di IA rispondono a domande: citano quindi le pagine che rispondono a domande. Una pagina senza domande viene citata raramente.' },
    },
    robots: {
      pass: { title: 'I motori di IA possono leggere il sito', detail: 'robots.txt non blocca alcun crawler dei motori di IA.' },
      fail: { title: 'robots.txt blocca i crawler dei motori di IA', detail: 'I crawler bloccati non potranno citare l\u2019azienda.' },
    },
    llms: {
      pass: { title: 'Esiste un file llms.txt', detail: 'Il sito offre ai motori di IA una mappa chiara di sé, un vantaggio rispetto alla maggior parte del mercato.' },
      fail: { title: 'Nessun file llms.txt', detail: 'Un file llms.txt offre ai motori di IA una mappa chiara del sito. La maggior parte del mercato non lo ha ancora fatto.' },
    },
  },
  evidence: {
    images: (missing, total) => `${missing} immagini su ${total}`,
    words: (n) => `${n} parole nella pagina`,
    h1: (n) => `${n} titoli H1`,
  },
}

const COPY: Record<PublicLocale, FreeCheckCopy> = { he, en, es, 'pt-BR': ptBR, fr, it }

export function freeCheckCopy(locale: PublicLocale): FreeCheckCopy {
  return COPY[locale] ?? COPY.he
}
