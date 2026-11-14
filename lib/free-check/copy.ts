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

// JAPANESE. Marketing voice in です/ます, never a raw provider error, and no
// claim the scan does not make. `evidence.words` says 語 rather than 単語 and
// counts what lib/text/segment.ts segmented, which is the only number this
// locale actually has: a Japanese page has no spaces to count.
const ja: FreeCheckCopy = {
  page: {
    badge: '無料チェック、お申し込み不要',
    title: 'サイトのSEOとAI対応を',
    titleAccent: '1分以内に診断',
    subtitle: 'サイトのアドレスをご記入ください。実際にサイトを読み取り、事業の内容を把握したうえで、Googleの検索結果とAIの回答で不利になっている点をお見せします。',
    trust: ['無料、クレジットカード不要', 'インストール不要', '登録不要'],
    expect: [
      { title: '読み取れた内容', body: 'サイト自身が示している、事業の内容と顧客像です。' },
      { title: 'サイトの弱点', body: 'ページ上で、GoogleとAIエンジンが事業を理解するのを妨げている点を、重要な順に並べます。' },
      { title: 'AIへの対応状況', body: 'ChatGPTやGeminiがサイトを読み取り、引用できる状態かどうかです。' },
    ],
  },
  form: {
    label: 'サイトのアドレス',
    placeholder: 'example.com',
    submit: 'サイトを診断する',
    hint: '入力はこの1項目だけです。',
    errors: {
      invalid_url: 'このアドレスは正しくないようです。example.com のような形でもう一度お試しください。',
      blocked_url: '診断できるのは公開されているサイトのみです。社内アドレスとIPアドレスには対応していません。',
      unreachable: 'サイトに接続できませんでした。アドレスをご確認のうえ、もう一度お試しください。',
      not_html: 'このアドレスからは、読み取れるウェブページが返ってきません。',
      rate_limited: '短い間に何度も診断が実行されました。1分ほどおいてもう一度お試しください。',
      daily_cap: 'ただ今、無料チェックのご利用が集中しています。時間をおいてお試しいただくか、アカウントを作成して詳細な分析をご利用ください。',
      internal: '当社側で処理が完了しませんでした。少し時間をおいてもう一度お試しください。',
    },
  },
  loading: {
    title: 'サイトとページ構成を読み取っています',
    sub: '1分もかかりません。推測ではなく、実際にサイトを読み取っています。',
    footer: '処理中です。まとめがもうすぐ完成します',
    steps: [
      'サイトとページ構成の読み取り',
      '事業の内容と顧客像の把握',
      'Googleで不利になっている点の確認',
      '競合サイトの調査',
    ],
  },
  results: {
    heading: '最初の診断まとめ',
    scanned: '診断の対象',
    countersTitle: '見つかった内容',
    counters: { keywords: '狙えるキーワード', fixes: 'サイトで直すべき点', geo: 'AIの回答への対応', articles: 'すぐ書ける記事' },
    businessTitle: '事業について読み取れた内容',
    audienceTitle: '顧客像',
    competitorsTitle: '競合サイト',
    competitorsLocked: 'ほかの競合サイトと全体像をご覧になるには、無料アカウントを作成してください',
    findingsTitle: '現在サイトの足を引っぱっている点',
    findingsEmpty: '当社が確認するすべての項目で問題はありませんでした。見事な状態です。',
    findingsLocked: 'ほかの指摘はアカウント内でご覧いただけます',
    geoTitle: 'AIの回答への対応状況',
    geoIntro: 'ChatGPTやPerplexityのようなAIは、サイトに順位を付けるのではなく引用します。引用されやすい状態かどうかを確認しました。',
    geoScore: '良好なシグナル',
    articlesTitle: '当社が作成する記事の案',
    articlesNote: '記事は、キーワードの中でも見込みの大きいものから組み立てたコンテンツ戦略にもとづいて作られます。',
    gateTitle: 'ここまでは下見です。本格的な分析はログイン後に始まります',
    gateBody: '無料アカウントを作成すると、システムがサイトに対して作業を始めます。',
    gateBullets: [
      '実際の検索ボリュームを含む詳細な分析',
      '業種に合わせて組み立てた、四半期分のコンテンツ計画',
      '最初の記事の作成',
      '競合の全体像と、AIによる引用状況の計測',
    ],
    gateCta: '無料アカウントを作成',
    gateSecondary: 'すでにアカウントをお持ちの方はログイン',
    gateTerms: '続行することで、利用規約とプライバシーポリシーに同意したものとみなされます。',
    again: '別のサイトを診断する',
    aiUnavailable: '技術的なチェックは完了しました。事業のまとめとキーワードは、アカウント内でご覧いただけます。',
  },
  findings: {
    title_missing: { title: 'ページにtitleタグがありません', detail: 'titleはGoogleが検索結果に表示する見出しです。無い場合、Googleが事業者の代わりに見出しを作ります。' },
    title_short: { title: 'ページのtitleが短すぎます', detail: '30文字未満では、Googleが与えてくれる表示枠を使い切れず、検索されている語を含め損なうのが通例です。' },
    title_long: { title: 'ページのtitleが長すぎます', detail: '65文字を超えると、Googleは文の途中でtitleを切り詰めます。' },
    description_missing: { title: 'meta descriptionがありません', detail: 'descriptionは検索結果に出る紹介文です。無い場合、Googleがページから任意の一文を抜き出します。' },
    description_length: { title: 'meta descriptionの長さが適切ではありません', detail: '70文字未満または165文字超では、切り詰められるか、枠を活かせません。' },
    h1_missing: { title: 'ページにH1がありません', detail: 'H1はページの主題をGoogleとAIに伝えます。無い場合、本文から推測されます。' },
    h1_multiple: { title: 'ページにH1が複数あります', detail: 'H1が複数あるとページの主題が分散し、それぞれの働きが弱くなります。' },
    images_alt: { title: '代替テキストのない画像があります', detail: 'Googleは画像を見るのではなく代替テキストを読みます。無い場合、画像は流入につながらず、アクセシビリティも損なわれます。' },
    thin_content: { title: 'ページの本文が少なすぎます', detail: '本文が薄いページは、GoogleやAIエンジンが順位付けや引用の判断をする材料に乏しくなります。' },
    no_schema: { title: '構造化データ（Schema）がありません', detail: 'Schemaが無いと、GoogleとAIエンジンは、その事業者が誰で何をしているのかを確信できません。' },
    no_canonical: { title: 'canonicalタグがありません', detail: 'canonicalが無いと、同じページが重複して数えられ、自サイト内で競合することがあります。' },
    no_viewport: { title: 'モバイル用のviewportが設定されていません', detail: 'Googleはモバイル版を評価します。viewportが無いと、スマートフォンで表示が崩れます。' },
    no_open_graph: { title: '共有用のタグ（Open Graph）がありません', detail: 'LINEやFacebookで共有したときに、画像も正しいタイトルも表示されません。' },
    robots_blocks_all: { title: 'robots.txtがすべてのクローラーを拒否しています', detail: 'このファイルがすべてのクローラーに巡回しないよう求めているため、サイトはGoogleに載りません。' },
    robots_blocks_ai: { title: 'robots.txtがAIのクローラーを拒否しています', detail: '拒否されたクローラーは、ChatGPTのような回答の中で事業者を引用できません。' },
    no_faq: { title: 'よくある質問のセクションがありません', detail: 'AIは質問に答えるものなので、質問に答えているページを引用します。' },
  },
  geo: {
    schema: {
      pass: { title: '構造化データが事業者を特定しています', detail: 'AIエンジンが、その事業者が誰で何をしているのかを把握できます。' },
      fail: { title: '事業者を特定する構造化データがありません', detail: '事業者のSchemaが無いと、AIエンジンは誰のことなのかを正確に判断できません。' },
    },
    faq: {
      pass: { title: 'よくある質問のセクションがあります', detail: '質問に答えているページは、引用される頻度が大きく上がります。' },
      fail: { title: 'よくある質問のセクションがありません', detail: 'AIは質問に答えるものなので、質問に答えているページを引用します。質問の無いページはほとんど引用されません。' },
    },
    robots: {
      pass: { title: 'AIがサイトを読み取れます', detail: 'robots.txtはAIのクローラーを拒否していません。' },
      fail: { title: 'robots.txtがAIのクローラーを拒否しています', detail: '拒否されたクローラーは、事業者を引用できません。' },
    },
    llms: {
      pass: { title: 'llms.txtファイルがあります', detail: 'サイトがAIに向けて自身の見取り図を示しています。市場の大半に対する優位点です。' },
      fail: { title: 'llms.txtファイルがありません', detail: 'llms.txtファイルは、サイトの見取り図をAIに示します。市場の大半はまだ用意していません。' },
    },
  },
  evidence: {
    images: (missing, total) => `${total}枚のうち${missing}枚の画像`,
    words: (n) => `ページ内${n}語`,
    h1: (n) => `H1見出し${n}件`,
  },
}

// GERMAN. Sie-form throughout, nouns capitalized, and never a raw provider
// error: a failed fetch says the site could not be reached, not what the
// fetcher saw. The example address is a .de one, because an address a German
// visitor would actually type is the point of the hint.
const de: FreeCheckCopy = {
  page: {
    badge: 'Kostenlose Analyse, ohne Verpflichtung',
    title: 'Eine SEO- und KI-Analyse Ihrer Website,',
    titleAccent: 'in weniger als einer Minute',
    subtitle: 'Sie geben nur die Adresse Ihrer Website ein. Wir lesen die Website wirklich, erkennen, was das Unternehmen tut, und zeigen, was es in Google und in KI-Antworten zurückhält.',
    trust: ['Kostenlos, ohne Kreditkarte', 'Nichts zu installieren', 'Ohne Anmeldung'],
    expect: [
      { title: 'Was wir verstanden haben', body: 'Was das Unternehmen tut und wer seine Kunden sind, so wie die Website es selbst darstellt.' },
      { title: 'Was die Website zurückhält', body: 'Was auf der Seite Google und die KI-Engines daran hindert, das Geschäft zu verstehen — vom Wichtigsten zum Unwichtigsten.' },
      { title: 'Wie bereit die Website für KI ist', body: 'Ob ChatGPT und Gemini die Website lesen und sie nennen können.' },
    ],
  },
  form: {
    label: 'Adresse der Website',
    placeholder: 'beispiel.de',
    submit: 'Website analysieren',
    hint: 'Ein einziges Feld. Mehr ist nicht auszufüllen.',
    errors: {
      invalid_url: 'Diese Adresse sieht nicht richtig aus. Versuchen Sie es erneut, zum Beispiel beispiel.de',
      blocked_url: 'Analysiert werden können nur öffentlich erreichbare Websites. Interne Adressen und IP-Adressen werden nicht unterstützt.',
      unreachable: 'Die Website war nicht erreichbar. Prüfen Sie die Adresse und versuchen Sie es erneut.',
      not_html: 'Diese Adresse liefert keine Webseite, die wir lesen können.',
      rate_limited: 'Es wurden mehrere Analysen in kurzer Folge gestartet. Versuchen Sie es in einer Minute erneut.',
      daily_cap: 'Die kostenlose Analyse ist gerade stark nachgefragt. Versuchen Sie es später erneut, oder eröffnen Sie ein Konto für die vollständige Analyse.',
      internal: 'Bei uns ist etwas nicht durchgelaufen. Versuchen Sie es in einem Moment erneut.',
    },
  },
  loading: {
    title: 'Wir lesen die Website und den Aufbau ihrer Seiten',
    sub: 'Das dauert weniger als eine Minute. Wir lesen die Website wirklich, wir raten nicht.',
    footer: 'Wird verarbeitet, die Zusammenfassung ist fast fertig',
    steps: [
      'Die Website und den Aufbau ihrer Seiten lesen',
      'Erkennen, was das Unternehmen tut und wer seine Kunden sind',
      'Prüfen, was die Website in Google zurückhält',
      'Nach Wettbewerbern suchen',
    ],
  },
  results: {
    heading: 'Die erste Analyse-Zusammenfassung',
    scanned: 'Analysiert haben wir',
    countersTitle: 'Was wir gefunden haben',
    counters: { keywords: 'Keywords, die sich lohnen', fixes: 'Punkte, die auf der Website zu korrigieren sind', geo: 'Bereit für KI-Antworten', articles: 'Artikel, die bereit sind, geschrieben zu werden' },
    businessTitle: 'Was wir über das Unternehmen verstanden haben',
    audienceTitle: 'Wer die Kunden sind',
    competitorsTitle: 'Wer die Wettbewerber sind',
    competitorsLocked: 'Für weitere Wettbewerber und die vollständige Übersicht genügt ein kostenloses Konto',
    findingsTitle: 'Was die Website gerade zurückhält',
    findingsEmpty: 'Die Website ist bei allem, was wir prüfen, tadellos. Gratulation.',
    findingsLocked: 'Weitere Befunde warten in Ihrem Konto',
    geoTitle: 'Wie bereit die Website für KI-Antworten ist',
    geoIntro: 'KI-Engines wie ChatGPT und Perplexity erstellen keine Rangliste, sie nennen Quellen. Wir haben geprüft, wie leicht diese Website zu nennen ist.',
    geoScore: 'Signale in gutem Zustand',
    articlesTitle: 'Die Artikel, die wir schreiben würden',
    articlesNote: 'Die Artikel entstehen aus einer Content-Strategie, die auf den besten Keyword-Chancen aufbaut.',
    gateTitle: 'Das war nur eine Vorschau. Die eigentliche Analyse beginnt nach der Anmeldung',
    gateBody: 'Eröffnen Sie ein kostenloses Konto, und das System macht sich an Ihre Website.',
    gateBullets: [
      'Die vollständige Analyse, mit echten Suchvolumen',
      'Ein Content-Plan für ein ganzes Quartal, auf Ihre Branche gebaut',
      'Der erste Artikel, von uns geschrieben',
      'Eine vollständige Wettbewerberübersicht und die Überwachung der Nennungen in KI-Antworten',
    ],
    gateCta: 'Kostenloses Konto eröffnen',
    gateSecondary: 'Sie haben schon ein Konto? Anmelden',
    gateTerms: 'Wenn Sie fortfahren, stimmen Sie den Nutzungsbedingungen und der Datenschutzerklärung zu.',
    again: 'Eine andere Website analysieren',
    aiUnavailable: 'Die technische Prüfung ist fertig. Die Zusammenfassung zum Unternehmen und die Keywords stehen in Ihrem Konto bereit.',
  },
  findings: {
    title_missing: { title: 'Der Seite fehlt ein Title-Tag', detail: 'Der Title ist das, was Google in seinen Ergebnissen anzeigt. Ohne ihn erfindet Google einen anstelle des Unternehmens.' },
    title_short: { title: 'Der Title der Seite ist zu kurz', detail: 'Unter 30 Zeichen bleibt der Platz, den Google gewährt, ungenutzt, und die gesuchten Begriffe fehlen meist.' },
    title_long: { title: 'Der Title der Seite ist zu lang', detail: 'Über 65 Zeichen schneidet Google den Title mitten im Satz ab.' },
    description_missing: { title: 'Keine Meta-Description', detail: 'Die Description ist der Werbesatz in den Suchergebnissen. Ohne sie nimmt Google irgendeinen Satz von der Seite.' },
    description_length: { title: 'Die Meta-Description hat nicht die richtige Länge', detail: 'Unter 70 oder über 165 Zeichen wird sie abgeschnitten oder schlecht genutzt angezeigt.' },
    h1_missing: { title: 'Der Seite fehlt eine H1', detail: 'Die H1 sagt Google und den KI-Engines, worum es auf der Seite geht. Ohne sie leiten sie es aus dem Text ab.' },
    h1_multiple: { title: 'Mehr als eine H1 auf der Seite', detail: 'Mehrere H1 teilen die Aussage der Seite auf und schwächen jede einzelne.' },
    images_alt: { title: 'Einigen Bildern fehlt der Alternativtext', detail: 'Google sieht keine Bilder, es liest den Alternativtext. Ohne ihn bringen die Bilder keine Besucher, und die Barrierefreiheit leidet.' },
    thin_content: { title: 'Zu wenig Text auf der Seite', detail: 'Eine dünne Seite gibt Google und den KI-Engines zu wenig, um sie einzuordnen oder zu nennen.' },
    no_schema: { title: 'Keine strukturierten Daten (Schema)', detail: 'Ohne Schema können Google und die KI-Engines nicht sicher sein, wer das Unternehmen ist und was es tut.' },
    no_canonical: { title: 'Kein Canonical-Tag', detail: 'Ohne Canonical kann dieselbe Seite mehrfach gezählt werden und sich selbst Konkurrenz machen.' },
    no_viewport: { title: 'Kein mobiles Viewport definiert', detail: 'Google bewertet die mobile Version. Ohne Viewport sieht die Seite auf dem Telefon kaputt aus.' },
    no_open_graph: { title: 'Keine Sharing-Tags (Open Graph)', detail: 'Geteilte Links in WhatsApp und Facebook zeigen weder Bild noch den richtigen Titel.' },
    robots_blocks_all: { title: 'robots.txt sperrt alle Crawler aus', detail: 'Die Datei bittet alle Crawler, die Website nicht zu erfassen, was sie aus Google heraushält.' },
    robots_blocks_ai: { title: 'robots.txt sperrt die Crawler der KI-Engines aus', detail: 'Ausgesperrte Crawler können das Unternehmen in Antworten wie denen von ChatGPT nicht nennen.' },
    no_faq: { title: 'Kein Fragen-und-Antworten-Abschnitt', detail: 'KI-Engines beantworten Fragen, deshalb nennen sie Seiten, die Fragen beantworten.' },
  },
  geo: {
    schema: {
      pass: { title: 'Die strukturierten Daten benennen das Unternehmen', detail: 'Die KI-Engines wissen, wer das Unternehmen ist und was es tut.' },
      fail: { title: 'Keine strukturierten Daten benennen das Unternehmen', detail: 'Ohne ein Schema für das Unternehmen wissen die KI-Engines nicht genau, um wen es sich handelt.' },
    },
    faq: {
      pass: { title: 'Es gibt einen Fragen-und-Antworten-Abschnitt', detail: 'Eine Seite, die Fragen beantwortet, wird deutlich häufiger genannt.' },
      fail: { title: 'Kein Fragen-und-Antworten-Abschnitt', detail: 'KI-Engines beantworten Fragen, deshalb nennen sie Seiten, die Fragen beantworten. Eine Seite ohne Fragen wird selten genannt.' },
    },
    robots: {
      pass: { title: 'Die KI-Engines dürfen die Website lesen', detail: 'robots.txt sperrt keinen Crawler der KI-Engines aus.' },
      fail: { title: 'robots.txt sperrt die Crawler der KI-Engines aus', detail: 'Ausgesperrte Crawler können das Unternehmen nicht nennen.' },
    },
    llms: {
      pass: { title: 'Es gibt eine llms.txt-Datei', detail: 'Die Website gibt den KI-Engines eine klare Karte von sich — ein Vorsprung gegenüber dem größten Teil des Marktes.' },
      fail: { title: 'Keine llms.txt-Datei', detail: 'Eine llms.txt-Datei gibt den KI-Engines eine klare Karte der Website. Der größte Teil des Marktes hat sie noch nicht.' },
    },
  },
  evidence: {
    images: (missing, total) => `${missing} von ${total} Bildern`,
    words: (n) => `${n} Wörter auf der Seite`,
    h1: (n) => `${n} H1-Überschriften`,
  },
}

const pl: FreeCheckCopy = {
  page: {
    badge: 'Bezpłatna analiza, bez zobowiązań',
    title: 'Analiza SEO i AI Państwa witryny,',
    titleAccent: 'w mniej niż minutę',
    subtitle: 'Wystarczy podać adres witryny. Czytamy ją naprawdę, rozpoznajemy, czym firma się zajmuje, i pokazujemy, co ją powstrzymuje w Google i w odpowiedziach AI.',
    trust: ['Bezpłatnie, bez karty kredytowej', 'Nic do instalowania', 'Bez rejestracji'],
    expect: [
      { title: 'Co zrozumieliśmy', body: 'Czym firma się zajmuje i kim są jej klienci — tak, jak pokazuje to sama witryna.' },
      { title: 'Co powstrzymuje witrynę', body: 'Co na stronie nie pozwala Google i asystentom AI zrozumieć tej firmy — od najważniejszego do najmniej ważnego.' },
      { title: 'Na ile witryna jest gotowa na AI', body: 'Czy ChatGPT i Gemini mogą ją przeczytać i wymienić.' },
    ],
  },
  form: {
    label: 'Adres witryny',
    placeholder: 'przyklad.pl',
    submit: 'Analizuj witrynę',
    hint: 'Jedno pole. Nic więcej nie trzeba wypełniać.',
    errors: {
      invalid_url: 'Ten adres nie wygląda poprawnie. Prosimy spróbować ponownie, na przykład przyklad.pl',
      blocked_url: 'Analizować można wyłącznie witryny dostępne publicznie. Adresy wewnętrzne i adresy IP nie są obsługiwane.',
      unreachable: 'Witryna była nieosiągalna. Prosimy sprawdzić adres i spróbować ponownie.',
      not_html: 'Pod tym adresem nie ma strony internetowej, którą moglibyśmy przeczytać.',
      rate_limited: 'W krótkim czasie uruchomiono kilka analiz. Prosimy spróbować ponownie za minutę.',
      daily_cap: 'Bezpłatna analiza jest w tej chwili bardzo obciążona. Prosimy spróbować później albo utworzyć konto, żeby otrzymać pełną analizę.',
      internal: 'Po naszej stronie coś nie przeszło do końca. Prosimy spróbować ponownie za chwilę.',
    },
  },
  loading: {
    title: 'Czytamy witrynę i budowę jej stron',
    sub: 'Zajmie to mniej niż minutę. Czytamy witrynę naprawdę, nie zgadujemy.',
    footer: 'Przetwarzamy, podsumowanie jest już prawie gotowe',
    steps: [
      'Czytanie witryny i budowy jej stron',
      'Rozpoznanie, czym firma się zajmuje i kim są jej klienci',
      'Sprawdzenie, co powstrzymuje witrynę w Google',
      'Szukanie konkurentów',
    ],
  },
  results: {
    heading: 'Pierwsze podsumowanie analizy',
    scanned: 'Przeanalizowaliśmy',
    countersTitle: 'Co znaleźliśmy',
    counters: { keywords: 'Słowa kluczowe warte uwagi', fixes: 'Rzeczy do poprawienia na witrynie', geo: 'Gotowość na odpowiedzi AI', articles: 'Artykuły gotowe do napisania' },
    businessTitle: 'Co zrozumieliśmy o firmie',
    audienceTitle: 'Kim są klienci',
    competitorsTitle: 'Kim są konkurenci',
    competitorsLocked: 'Po więcej konkurentów i pełny przegląd wystarczy bezpłatne konto',
    findingsTitle: 'Co w tej chwili powstrzymuje witrynę',
    findingsEmpty: 'Witryna jest bez zarzutu we wszystkim, co sprawdzamy. Gratulacje.',
    findingsLocked: 'Kolejne ustalenia czekają na Państwa koncie',
    geoTitle: 'Na ile witryna jest gotowa na odpowiedzi AI',
    geoIntro: 'Asystenci AI, tacy jak ChatGPT i Perplexity, nie tworzą rankingu — podają źródła. Sprawdziliśmy, jak łatwo tę witrynę wskazać jako źródło.',
    geoScore: 'Sygnały w dobrym stanie',
    articlesTitle: 'Artykuły, które napisalibyśmy',
    articlesNote: 'Artykuły wynikają ze strategii treści zbudowanej na najlepszych szansach w słowach kluczowych.',
    gateTitle: 'To była dopiero próbka. Prawdziwa analiza zaczyna się po rejestracji',
    gateBody: 'Wystarczy bezpłatne konto, a system weźmie się do pracy nad Państwa witryną.',
    gateBullets: [
      'Pełna analiza, z prawdziwymi liczbami wyszukiwań',
      'Plan treści na cały kwartał, zbudowany dla Państwa branży',
      'Pierwszy artykuł, napisany przez nas',
      'Pełny przegląd konkurencji i monitorowanie wzmianek w odpowiedziach AI',
    ],
    gateCta: 'Utwórz bezpłatne konto',
    gateSecondary: 'Mają już Państwo konto? Zaloguj się',
    gateTerms: 'Kontynuując, akceptują Państwo regulamin i politykę prywatności.',
    again: 'Przeanalizuj inną witrynę',
    aiUnavailable: 'Kontrola techniczna jest gotowa. Podsumowanie o firmie i słowa kluczowe czekają na Państwa koncie.',
  },
  findings: {
    title_missing: { title: 'Strona nie ma znacznika title', detail: 'Title to to, co Google pokazuje w swoich wynikach. Bez tego znacznika Google wymyśla go sam, zamiast firmy.' },
    title_short: { title: 'Title strony jest zbyt krótki', detail: 'Poniżej 30 znaków miejsce, które daje Google, pozostaje niewykorzystane, a szukanych wyrażeń zwykle brakuje.' },
    title_long: { title: 'Title strony jest zbyt długi', detail: 'Powyżej 65 znaków Google ucina title w środku zdania.' },
    description_missing: { title: 'Brak znacznika meta description', detail: 'Description to zdanie zachęcające w wynikach wyszukiwania. Bez tego znacznika Google bierze dowolne zdanie ze strony.' },
    description_length: { title: 'Meta description nie ma właściwej długości', detail: 'Poniżej 70 lub powyżej 165 znaków zostaje ucięty albo źle wykorzystany.' },
    h1_missing: { title: 'Strona nie ma nagłówka H1', detail: 'H1 mówi Google i asystentom AI, o czym jest ta strona. Bez tego nagłówka muszą to wywnioskować z tekstu.' },
    h1_multiple: { title: 'Na stronie jest więcej niż jeden H1', detail: 'Kilka nagłówków H1 rozdziela przekaz strony i osłabia każdy z nich.' },
    images_alt: { title: 'Przy części obrazów brakuje tekstu alternatywnego', detail: 'Google nie widzi obrazów, lecz czyta tekst alternatywny. Bez niego obrazy nie przynoszą wejść, a dostępność na tym traci.' },
    thin_content: { title: 'Zbyt mało tekstu na stronie', detail: 'Uboga strona daje Google i asystentom AI zbyt mało, by ją umiejscowić albo wskazać.' },
    no_schema: { title: 'Brak danych strukturalnych (schema)', detail: 'Bez danych strukturalnych Google i asystenci AI nie mogą być pewni, kim jest ta firma i czym się zajmuje.' },
    no_canonical: { title: 'Brak znacznika canonical', detail: 'Bez znacznika canonical ta sama strona może być liczona wielokrotnie i konkurować sama ze sobą.' },
    no_viewport: { title: 'Nie zdefiniowano mobilnego viewportu', detail: 'Google ocenia wersję mobilną. Bez viewportu strona wygląda na telefonie jak zepsuta.' },
    no_open_graph: { title: 'Brak znaczników udostępniania (Open Graph)', detail: 'Udostępnione linki w WhatsAppie i na Facebooku nie pokazują obrazu ani właściwego tytułu.' },
    robots_blocks_all: { title: 'Plik robots.txt wyklucza wszystkie roboty', detail: 'Plik prosi wszystkie roboty, by nie uwzględniały tej witryny, co trzyma ją poza Google.' },
    robots_blocks_ai: { title: 'Plik robots.txt wyklucza roboty asystentów AI', detail: 'Wykluczone roboty nie mogą wymienić tej firmy w odpowiedziach takich jak te z ChatGPT.' },
    no_faq: { title: 'Brak bloku pytań i odpowiedzi', detail: 'Asystenci AI odpowiadają na pytania i dlatego wskazują strony, które na pytania odpowiadają.' },
  },
  geo: {
    schema: {
      pass: { title: 'Dane strukturalne nazywają firmę', detail: 'Asystenci AI wiedzą, kim jest ta firma i czym się zajmuje.' },
      fail: { title: 'Żadne dane strukturalne nie nazywają firmy', detail: 'Bez danych strukturalnych o firmie asystenci AI nie wiedzą dokładnie, o kogo chodzi.' },
    },
    faq: {
      pass: { title: 'Jest blok pytań i odpowiedzi', detail: 'Strona, która odpowiada na pytania, jest wskazywana wyraźnie częściej.' },
      fail: { title: 'Brak bloku pytań i odpowiedzi', detail: 'Asystenci AI odpowiadają na pytania i dlatego wskazują strony, które na pytania odpowiadają. Strona bez pytań bywa wskazywana rzadko.' },
    },
    robots: {
      pass: { title: 'Asystenci AI mogą czytać tę witrynę', detail: 'Plik robots.txt nie wyklucza żadnego robota asystentów AI.' },
      fail: { title: 'Plik robots.txt wyklucza roboty asystentów AI', detail: 'Wykluczone roboty nie mogą wymienić tej firmy.' },
    },
    llms: {
      pass: { title: 'Jest plik llms.txt', detail: 'Witryna daje asystentom AI wyraźną mapę samej siebie — przewagę nad większością rynku.' },
      fail: { title: 'Brak pliku llms.txt', detail: 'Plik llms.txt daje asystentom AI wyraźną mapę witryny. Większość rynku go jeszcze nie ma.' },
    },
  },
  evidence: {
    images: (missing, total) => `${missing} z ${total} obrazów`,
    words: (n) => `${n} słów na stronie`,
    h1: (n) => `${n} nagłówków H1`,
  },
}

const nl: FreeCheckCopy = {
  page: {
    badge: 'Gratis analyse, zonder verplichting',
    title: 'Een SEO- en AI-analyse van uw website,',
    titleAccent: 'in minder dan een minuut',
    subtitle: 'U vult alleen het adres van uw website in. Wij lezen de website echt, herkennen wat het bedrijf doet en laten zien wat het tegenhoudt in Google en in AI-antwoorden.',
    trust: ['Gratis, zonder creditcard', 'Niets te installeren', 'Zonder aanmelden'],
    expect: [
      { title: 'Wat wij hebben begrepen', body: 'Wat het bedrijf doet en wie zijn klanten zijn, zoals de website het zelf laat zien.' },
      { title: 'Wat de website tegenhoudt', body: 'Wat er op de pagina Google en de AI-assistenten belet het bedrijf te begrijpen — van het belangrijkste naar het minst belangrijke.' },
      { title: 'Hoe klaar de website is voor AI', body: 'Of ChatGPT en Gemini de website kunnen lezen en kunnen noemen.' },
    ],
  },
  form: {
    label: 'Adres van de website',
    placeholder: 'voorbeeld.nl',
    submit: 'Website analyseren',
    hint: 'Één enkel veld. Meer is er niet in te vullen.',
    errors: {
      invalid_url: 'Dit adres ziet er niet goed uit. Probeer het opnieuw, bijvoorbeeld voorbeeld.nl',
      blocked_url: 'Alleen openbaar bereikbare websites kunnen worden geanalyseerd. Interne adressen en IP-adressen worden niet ondersteund.',
      unreachable: 'De website was niet bereikbaar. Controleer het adres en probeer het opnieuw.',
      not_html: 'Dit adres levert geen webpagina die wij kunnen lezen.',
      rate_limited: 'Er zijn kort achter elkaar meerdere analyses gestart. Probeer het over een minuut opnieuw.',
      daily_cap: 'De gratis analyse is op dit moment erg in de vraag. Probeer het later opnieuw, of open een account voor de volledige analyse.',
      internal: 'Bij ons is iets niet doorgelopen. Probeer het over een moment opnieuw.',
    },
  },
  loading: {
    title: 'Wij lezen de website en de opbouw van haar pagina’s',
    sub: 'Dit duurt minder dan een minuut. Wij lezen de website echt, wij gokken niet.',
    footer: 'Wordt verwerkt, de samenvatting is bijna klaar',
    steps: [
      'De website en de opbouw van haar pagina’s lezen',
      'Herkennen wat het bedrijf doet en wie zijn klanten zijn',
      'Nagaan wat de website tegenhoudt in Google',
      'Zoeken naar concurrenten',
    ],
  },
  results: {
    heading: 'De eerste samenvatting van de analyse',
    scanned: 'Geanalyseerd hebben wij',
    countersTitle: 'Wat wij hebben gevonden',
    counters: { keywords: 'Zoekwoorden die de moeite waard zijn', fixes: 'Punten die op de website te herstellen zijn', geo: 'Klaar voor AI-antwoorden', articles: 'Artikelen die klaar zijn om geschreven te worden' },
    businessTitle: 'Wat wij over het bedrijf hebben begrepen',
    audienceTitle: 'Wie de klanten zijn',
    competitorsTitle: 'Wie de concurrenten zijn',
    competitorsLocked: 'Voor meer concurrenten en het volledige overzicht is een gratis account genoeg',
    findingsTitle: 'Wat de website op dit moment tegenhoudt',
    findingsEmpty: 'De website is op alles wat wij nagaan onberispelijk. Gefeliciteerd.',
    findingsLocked: 'Meer bevindingen wachten in uw account',
    geoTitle: 'Hoe klaar de website is voor AI-antwoorden',
    geoIntro: 'AI-assistenten zoals ChatGPT en Perplexity maken geen ranglijst, zij noemen bronnen. Wij hebben nagegaan hoe makkelijk deze website te noemen is.',
    geoScore: 'Signalen in goede staat',
    articlesTitle: 'De artikelen die wij zouden schrijven',
    articlesNote: 'De artikelen komen uit een contentstrategie die op de beste kansen in zoekwoorden is gebouwd.',
    gateTitle: 'Dit was pas een voorproefje. De echte analyse begint na het aanmelden',
    gateBody: 'Open een gratis account, en het systeem gaat aan de slag met uw website.',
    gateBullets: [
      'De volledige analyse, met echte zoekvolumes',
      'Een contentplan voor een heel kwartaal, op uw branche gebouwd',
      'Het eerste artikel, door ons geschreven',
      'Een volledig concurrentenoverzicht en het bijhouden van de vermeldingen in AI-antwoorden',
    ],
    gateCta: 'Gratis account openen',
    gateSecondary: 'Heeft u al een account? Inloggen',
    gateTerms: 'Als u doorgaat, gaat u akkoord met de gebruiksvoorwaarden en de privacyverklaring.',
    again: 'Een andere website analyseren',
    aiUnavailable: 'De technische controle is klaar. De samenvatting over het bedrijf en de zoekwoorden staan klaar in uw account.',
  },
  findings: {
    title_missing: { title: 'De pagina heeft geen title-tag', detail: 'De title is wat Google in zijn resultaten laat zien. Zonder die tag verzint Google er zelf een in plaats van het bedrijf.' },
    title_short: { title: 'De title van de pagina is te kort', detail: 'Onder 30 tekens blijft de ruimte die Google geeft ongebruikt, en ontbreken de gezochte termen meestal.' },
    title_long: { title: 'De title van de pagina is te lang', detail: 'Boven 65 tekens kapt Google de title midden in de zin af.' },
    description_missing: { title: 'Geen meta description', detail: 'De description is de wervende zin in de zoekresultaten. Zonder die tag pakt Google een willekeurige zin van de pagina.' },
    description_length: { title: 'De meta description heeft niet de juiste lengte', detail: 'Onder 70 of boven 165 tekens wordt die afgekapt of slecht benut weergegeven.' },
    h1_missing: { title: 'De pagina heeft geen H1', detail: 'De H1 vertelt Google en de AI-assistenten waar de pagina over gaat. Zonder die kop leiden zij het uit de tekst af.' },
    h1_multiple: { title: 'Meer dan één H1 op de pagina', detail: 'Meerdere H1-koppen splitsen de boodschap van de pagina en zwakken elke kop af.' },
    images_alt: { title: 'Bij sommige afbeeldingen ontbreekt de alternatieve tekst', detail: 'Google ziet geen afbeeldingen, het leest de alternatieve tekst. Zonder die tekst brengen de afbeeldingen geen bezoekers, en de toegankelijkheid lijdt eronder.' },
    thin_content: { title: 'Te weinig tekst op de pagina', detail: 'Een dunne pagina geeft Google en de AI-assistenten te weinig om haar te plaatsen of te noemen.' },
    no_schema: { title: 'Geen structured data (schema)', detail: 'Zonder schema kunnen Google en de AI-assistenten er niet zeker van zijn wie het bedrijf is en wat het doet.' },
    no_canonical: { title: 'Geen canonical-tag', detail: 'Zonder canonical kan dezelfde pagina meerdere keren worden geteld en met zichzelf concurreren.' },
    no_viewport: { title: 'Geen mobiele viewport gedefinieerd', detail: 'Google beoordeelt de mobiele versie. Zonder viewport ziet de pagina er op de telefoon kapot uit.' },
    no_open_graph: { title: 'Geen deel-tags (Open Graph)', detail: 'Gedeelde links in WhatsApp en Facebook laten geen afbeelding en niet de juiste titel zien.' },
    robots_blocks_all: { title: 'robots.txt sluit alle crawlers uit', detail: 'Het bestand vraagt alle crawlers de website niet op te nemen, wat haar buiten Google houdt.' },
    robots_blocks_ai: { title: 'robots.txt sluit de crawlers van de AI-assistenten uit', detail: 'Uitgesloten crawlers kunnen het bedrijf niet noemen in antwoorden zoals die van ChatGPT.' },
    no_faq: { title: 'Geen vraag-en-antwoordblok', detail: 'AI-assistenten beantwoorden vragen, en daarom noemen zij pagina’s die vragen beantwoorden.' },
  },
  geo: {
    schema: {
      pass: { title: 'De structured data benoemen het bedrijf', detail: 'De AI-assistenten weten wie het bedrijf is en wat het doet.' },
      fail: { title: 'Geen structured data benoemen het bedrijf', detail: 'Zonder een schema voor het bedrijf weten de AI-assistenten niet precies om wie het gaat.' },
    },
    faq: {
      pass: { title: 'Er is een vraag-en-antwoordblok', detail: 'Een pagina die vragen beantwoordt, wordt duidelijk vaker genoemd.' },
      fail: { title: 'Geen vraag-en-antwoordblok', detail: 'AI-assistenten beantwoorden vragen, en daarom noemen zij pagina’s die vragen beantwoorden. Een pagina zonder vragen wordt zelden genoemd.' },
    },
    robots: {
      pass: { title: 'De AI-assistenten mogen de website lezen', detail: 'robots.txt sluit geen crawler van de AI-assistenten uit.' },
      fail: { title: 'robots.txt sluit de crawlers van de AI-assistenten uit', detail: 'Uitgesloten crawlers kunnen het bedrijf niet noemen.' },
    },
    llms: {
      pass: { title: 'Er is een llms.txt-bestand', detail: 'De website geeft de AI-assistenten een duidelijke kaart van zichzelf — een voorsprong op het grootste deel van de markt.' },
      fail: { title: 'Geen llms.txt-bestand', detail: 'Een llms.txt-bestand geeft de AI-assistenten een duidelijke kaart van de website. Het grootste deel van de markt heeft dat nog niet.' },
    },
  },
  evidence: {
    images: (missing, total) => `${missing} van ${total} afbeeldingen`,
    words: (n) => `${n} woorden op de pagina`,
    h1: (n) => `${n} H1-koppen`,
  },
}

// KOREAN. 합니다체 throughout, and never a raw provider error: a failed fetch
// says the site could not be reached, not what the fetcher saw. The example
// address is a .kr one, because an address a Korean visitor would actually type
// is the point of the hint. The AI wording names the engines we really check,
// and says nothing about Naver, which we do not check.
const ko: FreeCheckCopy = {
  page: {
    badge: '무료 진단, 약정 없음',
    title: '내 사이트의 SEO와 AI 진단을',
    titleAccent: '1분 안에',
    subtitle: '사이트 주소만 입력하십시오. 사이트를 실제로 읽어, 이 사업이 무엇을 하는지 파악하고, Google과 AI 답변에서 무엇이 발목을 잡고 있는지 보여 드립니다.',
    trust: ['무료, 카드 등록 없음', '설치할 것 없음', '가입 없이'],
    expect: [
      { title: '저희가 읽어낸 것', body: '이 사업이 무엇을 하고 고객은 누구인지, 사이트가 스스로 말하는 대로 정리합니다.' },
      { title: '사이트의 발목을 잡는 것', body: 'Google과 AI 엔진이 이 사업을 이해하지 못하게 막는 요소를, 중요한 것부터 순서대로 보여 줍니다.' },
      { title: 'AI 답변에 대한 준비 정도', body: 'ChatGPT와 Gemini가 이 사이트를 읽고 언급할 수 있는 상태인지 확인합니다.' },
    ],
  },
  form: {
    label: '사이트 주소',
    placeholder: 'example.kr',
    submit: '사이트 진단하기',
    hint: '입력란은 하나뿐입니다. 더 채울 것은 없습니다.',
    errors: {
      invalid_url: '이 주소는 형식이 맞지 않아 보입니다. example.kr 같은 형태로 다시 입력해 주십시오',
      blocked_url: '공개된 사이트만 진단할 수 있습니다. 내부 주소와 IP 주소는 지원하지 않습니다.',
      unreachable: '사이트에 접속하지 못했습니다. 주소를 확인하고 다시 시도해 주십시오.',
      not_html: '이 주소는 저희가 읽을 수 있는 웹페이지를 돌려주지 않습니다.',
      rate_limited: '짧은 시간에 여러 번 진단을 시작했습니다. 1분 뒤에 다시 시도해 주십시오.',
      daily_cap: '지금 무료 진단 요청이 많습니다. 나중에 다시 시도하시거나, 전체 분석을 위해 계정을 만들어 주십시오.',
      internal: '저희 쪽에서 끝까지 처리되지 않았습니다. 잠시 뒤에 다시 시도해 주십시오.',
    },
  },
  loading: {
    title: '사이트와 페이지 구조를 읽고 있습니다',
    sub: '1분이 걸리지 않습니다. 추측하지 않고 사이트를 실제로 읽습니다.',
    footer: '처리 중입니다. 요약이 거의 다 됐습니다',
    steps: [
      '사이트와 페이지 구조 읽기',
      '이 사업이 무엇을 하고 고객은 누구인지 파악하기',
      'Google에서 사이트의 발목을 잡는 것 확인하기',
      '경쟁사 찾기',
    ],
  },
  results: {
    heading: '첫 진단 요약',
    scanned: '진단한 주소',
    countersTitle: '찾은 것',
    counters: { keywords: '값어치가 있는 키워드', fixes: '사이트에서 고칠 지점', geo: 'AI 답변 준비 상태', articles: '바로 쓸 수 있는 글' },
    businessTitle: '이 사업에 대해 읽어낸 것',
    audienceTitle: '고객은 누구인가',
    competitorsTitle: '경쟁사는 누구인가',
    competitorsLocked: '경쟁사 전체와 자세한 내용은 무료 계정만 만들면 보실 수 있습니다',
    findingsTitle: '지금 사이트의 발목을 잡는 것',
    findingsEmpty: '저희가 확인하는 항목 모두에서 문제가 없습니다. 축하합니다.',
    findingsLocked: '나머지 지적 사항은 계정에서 기다리고 있습니다',
    geoTitle: 'AI 답변에 대한 준비 정도',
    geoIntro: 'ChatGPT나 Perplexity 같은 AI 엔진은 순위를 매기지 않고 출처를 댑니다. 이 사이트가 얼마나 인용하기 쉬운 상태인지 확인했습니다.',
    geoScore: '상태가 좋은 신호',
    articlesTitle: '저희가 쓸 글',
    articlesNote: '글은 가장 기회가 큰 키워드를 바탕으로 짠 콘텐츠 전략에서 나옵니다.',
    gateTitle: '여기까지는 미리보기입니다. 실제 분석은 가입 뒤에 시작됩니다',
    gateBody: '무료 계정을 만드시면 시스템이 사이트에 본격적으로 달라붙습니다.',
    gateBullets: [
      '실제 검색량이 들어간 전체 분석',
      '내 업종에 맞춰 짠 한 분기치 콘텐츠 계획',
      '저희가 쓴 첫 번째 글',
      '경쟁사 전체 현황과 AI 답변에서의 언급 추적',
    ],
    gateCta: '무료 계정 만들기',
    gateSecondary: '이미 계정이 있으십니까? 로그인',
    gateTerms: '계속하시면 이용약관과 개인정보처리방침에 동의하는 것으로 봅니다.',
    again: '다른 사이트 진단하기',
    aiUnavailable: '기술 점검은 끝났습니다. 사업 요약과 키워드는 계정에서 준비되어 있습니다.',
  },
  findings: {
    title_missing: { title: '페이지에 title 태그가 없습니다', detail: 'title은 Google이 검색 결과에 보여 주는 문장입니다. 없으면 Google이 업체 대신 문장을 만들어 냅니다.' },
    title_short: { title: '페이지의 title이 너무 짧습니다', detail: '30자가 되지 않으면 Google이 주는 자리를 쓰지 못하고, 사람들이 찾는 말도 대개 빠집니다.' },
    title_long: { title: '페이지의 title이 너무 깁니다', detail: '65자를 넘으면 Google이 문장 중간에서 잘라 버립니다.' },
    description_missing: { title: '메타 설명이 없습니다', detail: '메타 설명은 검색 결과에서의 홍보 문장입니다. 없으면 Google이 페이지에서 아무 문장이나 가져다 씁니다.' },
    description_length: { title: '메타 설명의 길이가 적절하지 않습니다', detail: '70자 미만이거나 165자를 넘으면 잘리거나 자리를 제대로 쓰지 못합니다.' },
    h1_missing: { title: '페이지에 H1이 없습니다', detail: 'H1은 이 페이지가 무엇에 대한 것인지 Google과 AI 엔진에 알려 줍니다. 없으면 본문에서 짐작합니다.' },
    h1_multiple: { title: '페이지에 H1이 여러 개 있습니다', detail: 'H1이 여러 개면 페이지의 주제가 쪼개지고 각각이 약해집니다.' },
    images_alt: { title: '일부 이미지에 대체 텍스트가 없습니다', detail: 'Google은 이미지를 보지 못하고 대체 텍스트를 읽습니다. 없으면 이미지가 방문자를 데려오지 못하고 접근성도 나빠집니다.' },
    thin_content: { title: '페이지의 글이 너무 적습니다', detail: '내용이 얄팍한 페이지는 Google과 AI 엔진이 분류하거나 인용할 근거를 주지 못합니다.' },
    no_schema: { title: '구조화된 데이터(Schema)가 없습니다', detail: 'Schema가 없으면 Google과 AI 엔진이 이 업체가 누구이고 무엇을 하는지 확신하지 못합니다.' },
    no_canonical: { title: 'canonical 태그가 없습니다', detail: 'canonical이 없으면 같은 페이지가 여러 번 집계되어 스스로와 경쟁할 수 있습니다.' },
    no_viewport: { title: '모바일 viewport가 지정되지 않았습니다', detail: 'Google은 모바일 버전을 기준으로 평가합니다. viewport가 없으면 휴대폰에서 화면이 깨져 보입니다.' },
    no_open_graph: { title: '공유 태그(Open Graph)가 없습니다', detail: 'WhatsApp이나 Facebook에 링크를 공유해도 이미지와 제목이 제대로 나오지 않습니다.' },
    robots_blocks_all: { title: 'robots.txt가 모든 크롤러를 막고 있습니다', detail: '이 파일이 모든 크롤러에게 사이트를 수집하지 말라고 요청하고 있어 Google에서 빠지게 됩니다.' },
    robots_blocks_ai: { title: 'robots.txt가 AI 엔진의 크롤러를 막고 있습니다', detail: '막힌 크롤러는 ChatGPT 같은 답변에서 이 업체를 언급할 수 없습니다.' },
    no_faq: { title: '질문과 답변 영역이 없습니다', detail: 'AI 엔진은 질문에 답하므로, 질문에 답하는 페이지를 인용합니다.' },
  },
  geo: {
    schema: {
      pass: { title: '구조화된 데이터가 업체를 밝히고 있습니다', detail: 'AI 엔진이 이 업체가 누구이고 무엇을 하는지 알 수 있습니다.' },
      fail: { title: '업체를 밝히는 구조화된 데이터가 없습니다', detail: '업체용 Schema가 없으면 AI 엔진이 누구를 말하는지 정확히 알지 못합니다.' },
    },
    faq: {
      pass: { title: '질문과 답변 영역이 있습니다', detail: '질문에 답하는 페이지는 훨씬 자주 인용됩니다.' },
      fail: { title: '질문과 답변 영역이 없습니다', detail: 'AI 엔진은 질문에 답하므로 질문에 답하는 페이지를 인용합니다. 질문이 없는 페이지는 좀처럼 인용되지 않습니다.' },
    },
    robots: {
      pass: { title: 'AI 엔진이 사이트를 읽을 수 있습니다', detail: 'robots.txt가 AI 엔진의 크롤러를 막고 있지 않습니다.' },
      fail: { title: 'robots.txt가 AI 엔진의 크롤러를 막고 있습니다', detail: '막힌 크롤러는 이 업체를 언급할 수 없습니다.' },
    },
    llms: {
      pass: { title: 'llms.txt 파일이 있습니다', detail: '사이트가 AI 엔진에 자기 자신에 대한 분명한 지도를 주고 있습니다. 시장 대부분보다 앞선 상태입니다.' },
      fail: { title: 'llms.txt 파일이 없습니다', detail: 'llms.txt 파일은 AI 엔진에 사이트의 분명한 지도를 줍니다. 시장 대부분은 아직 없습니다.' },
    },
  },
  evidence: {
    images: (missing, total) => `이미지 ${total}개 중 ${missing}개`,
    words: (n) => `페이지의 단어 ${n}개`,
    h1: (n) => `H1 제목 ${n}개`,
  },
}

const COPY: Record<PublicLocale, FreeCheckCopy> = { he, en, es, 'pt-BR': ptBR, fr, it, ja, de, nl, pl, ko }

export function freeCheckCopy(locale: PublicLocale): FreeCheckCopy {
  return COPY[locale] ?? COPY.he
}
