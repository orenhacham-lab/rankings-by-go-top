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

const COPY: Record<PublicLocale, FreeCheckCopy> = { he, en, es }

export function freeCheckCopy(locale: PublicLocale): FreeCheckCopy {
  return COPY[locale] ?? COPY.he
}
