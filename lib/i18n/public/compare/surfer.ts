/**
 * Go Top SEO compared with Surfer, in every language the public site speaks.
 *
 * THE READING RULE THIS FILE OBEYS. Where Surfer's own pages do not mention a
 * capability, the copy says it is not mentioned on the pages we read — never
 * that Surfer cannot do it. Three rows are written that way on purpose: Google
 * Maps and Google Business Profile, which their homepage does not mention; the
 * WordPress plugin, which is referenced in a product-update headline without
 * their page describing what it publishes; and the trial, where every button
 * reads "Start for Free" but the pricing page states no length and does not
 * say whether a card is needed. Unknown is written as unknown.
 *
 * THE SLUG IS `surfer`, NOT `surferseo`. On 2026-10-31 surferseo.com
 * 301-redirects to surfer.ai while the product is still called Surfer. The
 * comparison guard checks that every source hostname contains the slug, and
 * `surfer.ai` contains `surfer` but not `surferseo`.
 *
 * Nothing here says Surfer is weak. For the craft of making one page rank it is
 * better than we are, and its AI-answer tracking is more frequent and covers
 * more engines than our monthly check across three. The honest difference is
 * scope and labour: Surfer is a tool a person uses, and we are the person.
 */
import type { PublicLocale } from '@/lib/i18n/locales'
import type { ComparisonCopy } from './types'

const CHECKED = '2026-10-31'

const SOURCES = [
  { label: 'surfer.ai — pricing', href: 'https://surfer.ai/pricing/' },
  { label: 'surfer.ai', href: 'https://surfer.ai/' },
]

export const SURFER_COMPARE: Record<PublicLocale, ComparisonCopy> = {
  he: {
    competitor: 'Surfer',
    eyebrow: 'Go Top SEO מול Surfer',
    metaTitle: 'Go Top SEO מול Surfer | השוואה',
    metaDescription:
      'השוואה בין Go Top SEO לבין Surfer: מי כותב את התוכן ומי מפרסם אותו, מה כלול בכל מחיר, איך נמדדת נוכחות בתשובות AI, ומתי Surfer הוא הבחירה הנכונה.',
    hero: {
      title: 'Surfer עוזר לכתוב עמוד שמדורג.',
      accent: 'אנחנו כותבים את העמודים',
      subtitle:
        'Surfer הוא כלי אופטימיזציה מקצועי: כותב יושב מולו ומעצב עמוד אחד מול תוצאות החיפוש. Go Top SEO בנוי לבעל עסק שאין לו מי שיכתוב — המערכת מתכננת נושאים, כותבת, מפרסמת, מפרסמת גם בפרופיל העסקי בגוגל, ובודקת פעם בחודש איפה אתם עומדים.',
    },
    table: {
      eyebrow: 'ההשוואה',
      title: 'מה כל אחד עושה, לפי העמודים של Surfer עצמם',
      checkedOn: CHECKED,
      sources: SOURCES,
      rows: [
        {
          label: 'מחיר',
          ours: 'מ-79 דולר לחודש בתוספת מס. בישראל, מ-249 ש״ח לחודש כולל מע״מ.',
          theirs:
            'כל המחירים מוצגים לחודש בחיוב שנתי: Discovery ב-49 דולר, Standard ב-99, Pro ב-182, Peace of Mind ב-299, ותוכנית נפרדת לנוכחות ב-AI ב-82 דולר. התשלום השנתי נגבה מראש לשנה שלמה.',
        },
        {
          label: 'מה כלול במסלול הזול',
          ours: 'כל התחומים נכללים מהמסלול הראשון; מה שמשתנה בין המסלולים מופיע בעמוד המחירים.',
          theirs:
            'ב-Discovery בן 49 הדולר: 120 מסמכים, מעקב אחרי 10 עמודים, ואפס פרומפטים למעקב AI. מעקב פרומפטים מתחיל ב-Standard עם 25 פרומפטים שמתרעננים שבועית.',
        },
        {
          label: 'מי כותב את המאמרים',
          ours: 'המערכת. נושאים, טקסט, תמונות וקישורים פנימיים, אחרי שאתם מאשרים.',
          theirs:
            'אתם, בעזרתם. העמוד שלהם מתאר עורך תוכן עם הנחיות חיות מתוך תוצאות החיפוש, ראשי פרקים וכתיבה בעזרת AI: "Write articles that rank — fast — using real-time SEO data".',
        },
        {
          label: 'פרסום לאתר',
          ours: 'אוטומטי לוורדפרס ולשופיפיי.',
          theirs:
            'בעמוד הבית מופיעה כותרת עדכון על תוסף וורדפרס של Surfer. העמוד עצמו לא מתאר מה התוסף מפרסם ואיך, ולא קראנו עמוד שמסביר זאת.',
        },
        {
          label: 'מעקב מיקומים',
          ours: 'בדיקה חודשית בגוגל, בגוגל מפות ובתשובות AI (ChatGPT, Gemini ו-Google AI בהן).',
          theirs:
            'המסלולים סופרים "עמודים במעקב" — 10 ב-Discovery — ועמוד הבית מתאר התרעות כשעמוד יורד. מעקב מילות מפתח קלאסי לא מתואר בעמודים שקראנו.',
        },
        {
          label: 'תשובות AI',
          ours: 'בדיקה חודשית אוטומטית ב-ChatGPT, ב-Gemini וב-Google AI.',
          theirs:
            'מעקב פרומפטים נמדד לפי מסלול: אפס ב-Discovery, 25 שמתרעננים שבועית ב-Standard, 50 שמתרעננים יומית ב-Pro. עמוד הבית מציג תחת "Boost visibility in" את Google AI Mode, AI Overviews, Gemini, ChatGPT, Claude ו-Perplexity.',
        },
        {
          label: 'הפרופיל העסקי בגוגל וגוגל מפות',
          ours: 'פוסטים אוטומטיים לפרופיל העסקי באישורכם, ובדיקה חודשית של המיקום במפות.',
          theirs: 'חיפוש מקומי, גוגל מפות והפרופיל העסקי בגוגל אינם מוזכרים בעמוד הבית או בעמוד המחירים שקראנו.',
        },
        {
          label: 'עבודה על האתר',
          ours: 'חלק מהתיקונים מוחלים דרך התוסף שלנו, בלי קוד לקרוא.',
          theirs:
            'הכוונה, ניקוד ואופטימיזציה מחדש בתוך העורך שלהם. הסוכן האוטומטי שלהם, Surfy Agent, מופיע בעמוד הבית עם התווית "soon".',
        },
        {
          label: 'תקופת ניסיון',
          ours: '7 ימי ניסיון, בלי כרטיס אשראי, ביטול בכל רגע.',
          theirs:
            'כל כפתורי המסלולים אומרים "Start for Free". עמוד המחירים לא מציין את אורך תקופת הניסיון ולא כותב אם נדרש כרטיס אשראי.',
        },
      ],
    },
    theirStrengths: {
      eyebrow: 'מתי Surfer הוא הבחירה הנכונה',
      title: 'במקרים האלה כדאי לקחת את Surfer',
      intro: 'במלאכה של להביא עמוד אחד למעלה, Surfer טוב מאיתנו. זה לא משפט מנומס — זה מה שהם בנו.',
      items: [
        {
          title: 'כשהמטרה היא עמוד אחד שינצח',
          body:
            'הניקוד שלהם נגזר מתוצאות החיפוש עצמן, וכותב מיומן שעובד עם ההנחיות האלה יחדד עמוד תחרותי טוב יותר מכל צינור אוטומטי. אם יש לכם מי שכותב והבעיה היא רק החידוד, זה בדיוק הכלי.',
        },
        {
          title: 'כשתשובות AI הן מה שאתם מודדים',
          body:
            'המסלולים שלהם מודדים פרומפטים בשם — 25 שבועית ב-Standard, 50 יומית ב-Pro — ועמוד הבית מציג שישה מנועים. זה תכוף יותר ורחב יותר מהבדיקה החודשית שלנו בשלושה. אם זו כל השאלה שלכם, הם עונים עליה טוב יותר.',
        },
        {
          title: 'כשכותבים הרבה',
          body: '49 דולר לחודש קונים 120 מסמכים. למי שמייצר תוכן בכמות, זה מחיר ליחידת עבודה שקשה להתחרות בו.',
        },
      ],
    },
    ourStrengths: {
      eyebrow: 'מתי אנחנו מתאימים יותר',
      title: 'כשאין מי שיעשה את העבודה',
      intro: 'ההבדל האמיתי אינו טכני. הוא בשאלה מי יושב וכותב, ומי נזכר לפרסם.',
      items: [
        { title: 'מאמרים שמתפרסמים בלעדיכם', body: 'תוכנית נושאים חודשית שאתם מאשרים, ואז מאמרים עם תמונות וקישורים פנימיים שעולים לאוויר לבד.' },
        { title: 'גם מחוץ לאתר', body: 'פוסטים לפרופיל העסקי בגוגל באישורכם, וטיוטות תשובה לביקורות — באותו מחיר.' },
        { title: 'תמונת מצב אחת', body: 'בדיקה חודשית בגוגל, במפות ובתשובות AI, בלי להוסיף כלי שני ובלי דוח שצריך להרכיב.' },
        { title: 'שופיפיי וגם וורדפרס', body: 'אותה מערכת על שתי הפלטפורמות, ובשבע שפות — עברית ביניהן.' },
      ],
    },
    faq: {
      eyebrow: 'שאלות',
      title: 'מה שואלים לפני שמחליטים',
      items: [
        {
          q: 'Surfer עולה 49 דולר ואתם 79. למה?',
          a: 'כי זה לא אותו דבר שנמכר. ב-49 דולר מקבלים 120 מסמכים ומעקב אחרי 10 עמודים, בלי מעקב פרומפטים כלל, ואדם עדיין כותב ומפרסם. אצלנו המחיר כולל גם את הכתיבה, גם את הפרסום, גם את הפרופיל העסקי בגוגל וגם את הבדיקה החודשית. אם יש לכם מי שכותב, שלהם זול יותר ונכון יותר.',
        },
        {
          q: 'זה אותו מוצר כמו "Surfer SEO"?',
          a: 'כן. נכון ל-31 באוקטובר 2026, הכתובת surferseo.com מפנה אוטומטית ל-surfer.ai, והמוצר עדיין נקרא Surfer. הקישורים בטבלה מובילים לעמודים שקראנו.',
        },
        {
          q: 'מי מודד תשובות AI טוב יותר?',
          a: 'הם. המסלולים הגבוהים שלהם מרעננים עשרות פרומפטים בשם מדי יום ומציגים שישה מנועים, ואנחנו בודקים אחת לחודש ב-ChatGPT, ב-Gemini וב-Google AI. היתרון שלנו שם הוא שהבדיקה כלולה ולא דורשת כלי נפרד, לא שהיא עמוקה יותר.',
        },
      ],
    },
    close: { title: 'בדקו איפה האתר עומד, בלי להירשם' },
  },

  en: {
    competitor: 'Surfer',
    eyebrow: 'Go Top SEO vs Surfer',
    metaTitle: 'Go Top SEO vs Surfer | Comparison',
    metaDescription:
      'Go Top SEO compared with Surfer: who writes the content and who publishes it, what each price includes, how AI-answer tracking differs, and when Surfer is the better buy.',
    hero: {
      title: 'Surfer helps you write a page that ranks.',
      accent: 'We write the pages',
      subtitle:
        'Surfer is a specialist optimisation tool: a writer sits with it and shapes one page against the search results. Go Top SEO is built for an owner with nobody to do the writing — the system plans the topics, writes, publishes, posts to your Google Business Profile and checks once a month where you stand.',
    },
    table: {
      eyebrow: 'The comparison',
      title: "What each one does, taken from Surfer's own pages",
      checkedOn: CHECKED,
      sources: SOURCES,
      rows: [
        {
          label: 'Price',
          ours: 'From $79 a month plus tax. In Israel, from 249 ILS a month including VAT.',
          theirs:
            'All prices shown per month, billed yearly: Discovery $49, Standard $99, Pro $182, Peace of Mind $299, and a separate AI-visibility plan at $82. Yearly plans are charged for the full year upfront.',
        },
        {
          label: 'What the cheapest plan includes',
          ours: 'Every area is in the entry plan; what changes between plans is on the pricing page.',
          theirs:
            'Discovery at $49: 120 documents, 10 pages tracked and 0 AI prompts. Prompt tracking starts on Standard, with 25 prompts refreshed weekly.',
        },
        {
          label: 'Who writes the articles',
          ours: 'The system. Topics, text, images and internal links, after you approve.',
          theirs:
            'You do, with their help. Their page describes a content editor with live guidelines drawn from the search results, outlines and AI drafting: "Write articles that rank — fast — using real-time SEO data."',
        },
        {
          label: 'Publishing to the site',
          ours: 'Automatic to WordPress and Shopify.',
          theirs:
            'Their homepage carries a product-update headline about a Surfer WordPress plugin. The page itself does not describe what the plugin publishes, and we did not find a page that explains it.',
        },
        {
          label: 'Rank tracking',
          ours: 'A monthly check in Google, in Google Maps and in AI answers (ChatGPT, Gemini and Google AI among them).',
          theirs:
            'The plans count "pages tracked" — 10 on Discovery — and the homepage describes alerts when a page slips. A classic keyword rank tracker is not described on the pages we read.',
        },
        {
          label: 'AI answers',
          ours: 'An automatic monthly check in ChatGPT, Gemini and Google AI.',
          theirs:
            'Prompt tracking is metered per plan: 0 on Discovery, 25 refreshed weekly on Standard, 50 refreshed daily on Pro. Their homepage shows Google AI Mode, AI Overviews, Gemini, ChatGPT, Claude and Perplexity under "Boost visibility in".',
        },
        {
          label: 'Google Business Profile and Maps',
          ours: 'Automatic posts to the profile with your consent, and a monthly check of your position in Maps.',
          theirs: 'Local search, Google Maps and Google Business Profile are not mentioned on the homepage or the pricing page we read.',
        },
        {
          label: 'Work on the site',
          ours: 'Some fixes are applied through our plugin, with no code to read.',
          theirs:
            'Guidance, scoring and re-optimisation inside their own editor. Their automated agent, Surfy Agent, appears on the homepage labelled "soon".',
        },
        {
          label: 'Trial',
          ours: 'A 7-day trial, no credit card, cancel anytime.',
          theirs:
            'Every plan button reads "Start for Free". Their pricing page states no trial length and does not say whether a credit card is required.',
        },
      ],
    },
    theirStrengths: {
      eyebrow: 'When Surfer is the better buy',
      title: 'In these cases Surfer is the right answer',
      intro: 'At the craft of getting one page to the top, Surfer is better than we are. That is not politeness — it is what they built.',
      items: [
        {
          title: 'When the goal is one page winning',
          body:
            'Their scoring comes out of the search results themselves, and a skilled writer working to those guidelines will sharpen a competitive page better than any automated pipeline. If somebody already writes for you and the only gap is the sharpening, that is exactly the tool.',
        },
        {
          title: 'When AI answers are what you measure',
          body:
            'Their plans track named prompts — 25 weekly on Standard, 50 daily on Pro — and their homepage shows six engines. That is more frequent and broader than our monthly check across three. If that is your whole question, they answer it better.',
        },
        {
          title: 'When you write a lot',
          body: '$49 a month buys 120 documents. For anyone producing content in volume, that is a price per unit of work that is hard to argue with.',
        },
      ],
    },
    ourStrengths: {
      eyebrow: 'When we fit better',
      title: 'When there is nobody to do the work',
      intro: 'The real difference is not technical. It is who sits down and writes, and who remembers to publish.',
      items: [
        { title: 'Articles that publish without you', body: 'A monthly topic plan you approve, then articles with images and internal links going live on their own.' },
        { title: 'Off the site as well', body: 'Posts to your Google Business Profile with your consent, and drafted replies to reviews, in the same price.' },
        { title: 'One picture of where you stand', body: 'A monthly check in Google, in Maps and in AI answers, without adding a second tool or assembling a report.' },
        { title: 'Shopify as well as WordPress', body: 'The same system on both platforms, in seven languages.' },
      ],
    },
    faq: {
      eyebrow: 'Questions',
      title: 'What people ask before deciding',
      items: [
        {
          q: 'Surfer is $49 and you are $79. Why?',
          a: 'Because it is not the same thing being sold. $49 buys 120 documents and 10 pages tracked, with no prompt tracking at all, and a person still writes and publishes. Our price covers the writing, the publishing, the Google Business Profile and the monthly check together. If you already have a writer, theirs is cheaper and it is the right call.',
        },
        {
          q: 'Is this the same product as "Surfer SEO"?',
          a: 'Yes. As of 31 October 2026, surferseo.com redirects to surfer.ai and the product is still called Surfer. The links in the table go to the pages we read.',
        },
        {
          q: 'Who measures AI answers better?',
          a: 'They do. Their higher plans refresh dozens of named prompts daily and show six engines, while we check once a month in ChatGPT, Gemini and Google AI. Our advantage there is that the check is included and needs no separate tool — not that it is deeper.',
        },
      ],
    },
    close: { title: 'See where your site stands, without signing up' },
  },

  es: {
    competitor: 'Surfer',
    eyebrow: 'Go Top SEO frente a Surfer',
    metaTitle: 'Go Top SEO frente a Surfer | Comparativa',
    metaDescription:
      'Go Top SEO comparado con Surfer: quién escribe el contenido y quién lo publica, qué incluye cada precio, cómo se mide la presencia en respuestas de IA y cuándo Surfer es la mejor opción.',
    hero: {
      title: 'Surfer te ayuda a escribir una página que posicione.',
      accent: 'Nosotros escribimos las páginas',
      subtitle:
        'Surfer es una herramienta de optimización especializada: alguien se sienta con ella y da forma a una página frente a los resultados de búsqueda. Go Top SEO está pensado para un negocio que no tiene a nadie que escriba: el sistema planifica los temas, escribe, publica, publica también en tu perfil de empresa en Google y comprueba una vez al mes dónde estás.',
    },
    table: {
      eyebrow: 'La comparativa',
      title: 'Qué hace cada uno, según las propias páginas de Surfer',
      checkedOn: CHECKED,
      sources: SOURCES,
      rows: [
        {
          label: 'Precio',
          ours: 'Desde 79 dólares al mes más impuestos. En Israel, desde 249 ILS al mes con IVA incluido.',
          theirs:
            'Todos los precios se muestran por mes con facturación anual: Discovery 49 dólares, Standard 99, Pro 182, Peace of Mind 299, y un plan aparte de visibilidad en IA por 82 dólares. El plan anual se cobra por adelantado por el año completo.',
        },
        {
          label: 'Qué incluye el plan más barato',
          ours: 'Todas las áreas están en el plan de entrada; lo que cambia entre planes está en la página de precios.',
          theirs:
            'Discovery, de 49 dólares: 120 documentos, 10 páginas monitorizadas y 0 prompts de IA. El seguimiento de prompts empieza en Standard, con 25 prompts que se actualizan cada semana.',
        },
        {
          label: 'Quién escribe los artículos',
          ours: 'El sistema. Temas, texto, imágenes y enlaces internos, después de que lo apruebes.',
          theirs:
            'Tú, con su ayuda. Su página describe un editor de contenido con directrices en vivo tomadas de los resultados de búsqueda, esquemas y redacción asistida por IA: "Write articles that rank — fast — using real-time SEO data".',
        },
        {
          label: 'Publicación en el sitio',
          ours: 'Automática en WordPress y en Shopify.',
          theirs:
            'En su página de inicio aparece un titular de novedades sobre un plugin de Surfer para WordPress. La página no describe qué publica ese plugin, y no encontramos una página que lo explique.',
        },
        {
          label: 'Seguimiento de posiciones',
          ours: 'Una comprobación mensual en Google, en Google Maps y en respuestas de IA (entre ellas ChatGPT, Gemini y Google AI).',
          theirs:
            'Los planes cuentan "páginas monitorizadas" —10 en Discovery— y la página de inicio describe avisos cuando una página baja. Un rastreador clásico de palabras clave no se describe en las páginas que leímos.',
        },
        {
          label: 'Respuestas de IA',
          ours: 'Una comprobación mensual automática en ChatGPT, Gemini y Google AI.',
          theirs:
            'El seguimiento de prompts se mide por plan: 0 en Discovery, 25 con actualización semanal en Standard y 50 con actualización diaria en Pro. Su página de inicio muestra Google AI Mode, AI Overviews, Gemini, ChatGPT, Claude y Perplexity bajo "Boost visibility in".',
        },
        {
          label: 'Perfil de empresa en Google y Maps',
          ours: 'Publicaciones automáticas en el perfil con tu consentimiento, y una comprobación mensual de tu posición en Maps.',
          theirs: 'La búsqueda local, Google Maps y el perfil de empresa en Google no se mencionan en la página de inicio ni en la de precios que leímos.',
        },
        {
          label: 'Trabajo sobre el sitio',
          ours: 'Algunas correcciones se aplican a través de nuestro plugin, sin código que leer.',
          theirs:
            'Orientación, puntuación y reoptimización dentro de su propio editor. Su agente automático, Surfy Agent, aparece en la página de inicio con la etiqueta "soon".',
        },
        {
          label: 'Prueba gratuita',
          ours: 'Prueba de 7 días, sin tarjeta de crédito, cancelas cuando quieras.',
          theirs:
            'Todos los botones de los planes dicen "Start for Free". Su página de precios no indica la duración de la prueba ni dice si hace falta una tarjeta.',
        },
      ],
    },
    theirStrengths: {
      eyebrow: 'Cuándo Surfer es la mejor compra',
      title: 'En estos casos Surfer es la respuesta correcta',
      intro: 'En el oficio de llevar una página concreta a lo más alto, Surfer es mejor que nosotros. No es cortesía: es lo que han construido.',
      items: [
        {
          title: 'Cuando el objetivo es que gane una página',
          body:
            'Su puntuación sale de los propios resultados de búsqueda, y alguien que escriba bien siguiendo esas directrices afinará una página competitiva mejor que cualquier proceso automático. Si ya tienes quien escriba y lo único que falta es ese afinado, esa es justamente la herramienta.',
        },
        {
          title: 'Cuando lo que mides son las respuestas de IA',
          body:
            'Sus planes siguen prompts concretos —25 semanales en Standard, 50 diarios en Pro— y su página muestra seis motores. Eso es más frecuente y más amplio que nuestra comprobación mensual en tres. Si esa es toda tu pregunta, ellos la responden mejor.',
        },
        {
          title: 'Cuando se escribe mucho',
          body: '49 dólares al mes dan 120 documentos. Para quien produce contenido en volumen, es un precio por unidad de trabajo difícil de discutir.',
        },
      ],
    },
    ourStrengths: {
      eyebrow: 'Cuándo encajamos mejor',
      title: 'Cuando no hay quien haga el trabajo',
      intro: 'La diferencia real no es técnica. Es quién se sienta a escribir y quién se acuerda de publicar.',
      items: [
        { title: 'Artículos que se publican sin ti', body: 'Un plan mensual de temas que tú apruebas y, después, artículos con imágenes y enlaces internos que salen solos.' },
        { title: 'También fuera del sitio', body: 'Publicaciones en tu perfil de empresa en Google con tu consentimiento, y borradores de respuesta a las reseñas, en el mismo precio.' },
        { title: 'Una sola foto de dónde estás', body: 'Una comprobación mensual en Google, en Maps y en respuestas de IA, sin añadir una segunda herramienta ni montar un informe.' },
        { title: 'Shopify además de WordPress', body: 'El mismo sistema en las dos plataformas y en siete idiomas.' },
      ],
    },
    faq: {
      eyebrow: 'Preguntas',
      title: 'Lo que se pregunta antes de decidir',
      items: [
        {
          q: 'Surfer cuesta 49 dólares y vosotros 79. ¿Por qué?',
          a: 'Porque no se vende lo mismo. 49 dólares dan 120 documentos y 10 páginas monitorizadas, sin ningún seguimiento de prompts, y una persona sigue escribiendo y publicando. Nuestro precio cubre a la vez la escritura, la publicación, el perfil de empresa en Google y la comprobación mensual. Si ya tienes quien escriba, lo suyo sale más barato y es la decisión correcta.',
        },
        {
          q: '¿Es el mismo producto que "Surfer SEO"?',
          a: 'Sí. A 31 de octubre de 2026, surferseo.com redirige a surfer.ai y el producto se sigue llamando Surfer. Los enlaces de la tabla llevan a las páginas que leímos.',
        },
        {
          q: '¿Quién mide mejor las respuestas de IA?',
          a: 'Ellos. Sus planes altos actualizan a diario decenas de prompts concretos y muestran seis motores, mientras que nosotros comprobamos una vez al mes en ChatGPT, Gemini y Google AI. Nuestra ventaja ahí es que la comprobación va incluida y no necesita otra herramienta, no que sea más profunda.',
        },
      ],
    },
    close: { title: 'Mira cómo está tu sitio, sin registrarte' },
  },

  'pt-BR': {
    competitor: 'Surfer',
    eyebrow: 'Go Top SEO x Surfer',
    metaTitle: 'Go Top SEO x Surfer | Comparativo',
    metaDescription:
      'Go Top SEO comparado com o Surfer: quem escreve o conteúdo e quem publica, o que cada preço inclui, como a presença nas respostas de IA é medida e quando o Surfer é a melhor escolha.',
    hero: {
      title: 'O Surfer ajuda você a escrever uma página que ranqueia.',
      accent: 'Nós escrevemos as páginas',
      subtitle:
        'O Surfer é uma ferramenta de otimização especializada: alguém senta com ela e molda uma página diante dos resultados de busca. O Go Top SEO foi feito para o dono de negócio que não tem quem escreva — o sistema planeja os temas, escreve, publica, publica também no seu perfil da empresa no Google e confere uma vez por mês onde você está.',
    },
    table: {
      eyebrow: 'O comparativo',
      title: 'O que cada um faz, segundo as próprias páginas do Surfer',
      checkedOn: CHECKED,
      sources: SOURCES,
      rows: [
        {
          label: 'Preço',
          ours: 'A partir de 79 dólares por mês mais impostos. Em Israel, a partir de 249 ILS por mês com imposto incluído.',
          theirs:
            'Todos os preços aparecem por mês com cobrança anual: Discovery 49 dólares, Standard 99, Pro 182, Peace of Mind 299, e um plano separado de visibilidade em IA por 82 dólares. O plano anual é cobrado adiantado pelo ano inteiro.',
        },
        {
          label: 'O que o plano mais barato inclui',
          ours: 'Todas as áreas estão no plano de entrada; o que muda entre os planos está na página de preços.',
          theirs:
            'Discovery, de 49 dólares: 120 documentos, 10 páginas monitoradas e 0 prompts de IA. O monitoramento de prompts começa no Standard, com 25 prompts atualizados semanalmente.',
        },
        {
          label: 'Quem escreve os artigos',
          ours: 'O sistema. Temas, texto, imagens e links internos, depois que você aprova.',
          theirs:
            'Você, com a ajuda deles. A página descreve um editor de conteúdo com diretrizes ao vivo tiradas dos resultados de busca, estruturas de texto e redação com IA: "Write articles that rank — fast — using real-time SEO data".',
        },
        {
          label: 'Publicação no site',
          ours: 'Automática no WordPress e na Shopify.',
          theirs:
            'Na página inicial há um título de novidade sobre um plugin do Surfer para WordPress. A página não descreve o que esse plugin publica, e não encontramos uma página que explique isso.',
        },
        {
          label: 'Monitoramento de posições',
          ours: 'Uma verificação mensal no Google, no Google Maps e nas respostas de IA (entre elas ChatGPT, Gemini e Google AI).',
          theirs:
            'Os planos contam "páginas monitoradas" — 10 no Discovery — e a página inicial descreve alertas quando uma página cai. Um rastreador clássico de palavras-chave não é descrito nas páginas que lemos.',
        },
        {
          label: 'Respostas de IA',
          ours: 'Uma verificação mensal automática no ChatGPT, no Gemini e no Google AI.',
          theirs:
            'O monitoramento de prompts é medido por plano: 0 no Discovery, 25 com atualização semanal no Standard e 50 com atualização diária no Pro. A página inicial mostra Google AI Mode, AI Overviews, Gemini, ChatGPT, Claude e Perplexity sob "Boost visibility in".',
        },
        {
          label: 'Perfil da empresa no Google e Maps',
          ours: 'Publicações automáticas no perfil com o seu consentimento, e uma verificação mensal da sua posição no Maps.',
          theirs: 'Busca local, Google Maps e perfil da empresa no Google não são mencionados na página inicial nem na de preços que lemos.',
        },
        {
          label: 'Trabalho no site',
          ours: 'Algumas correções são aplicadas pelo nosso plugin, sem código para ler.',
          theirs:
            'Orientação, pontuação e reotimização dentro do editor deles. O agente automático deles, o Surfy Agent, aparece na página inicial com a etiqueta "soon".',
        },
        {
          label: 'Teste grátis',
          ours: 'Teste de 7 dias, sem cartão de crédito, cancele quando quiser.',
          theirs:
            'Todos os botões dos planos dizem "Start for Free". A página de preços não informa a duração do teste nem diz se é preciso cartão.',
        },
      ],
    },
    theirStrengths: {
      eyebrow: 'Quando o Surfer é a melhor compra',
      title: 'Nestes casos o Surfer é a resposta certa',
      intro: 'No ofício de levar uma página específica ao topo, o Surfer é melhor do que nós. Não é cortesia: é o que eles construíram.',
      items: [
        {
          title: 'Quando o objetivo é uma página vencer',
          body:
            'A pontuação deles sai dos próprios resultados de busca, e quem escreve bem seguindo essas diretrizes vai afinar uma página competitiva melhor do que qualquer processo automático. Se já existe alguém escrevendo e o que falta é só esse acabamento, é exatamente essa a ferramenta.',
        },
        {
          title: 'Quando o que você mede são as respostas de IA',
          body:
            'Os planos deles acompanham prompts nomeados — 25 por semana no Standard, 50 por dia no Pro — e a página mostra seis motores. É mais frequente e mais amplo do que a nossa verificação mensal em três. Se essa é toda a sua pergunta, eles respondem melhor.',
        },
        {
          title: 'Quando se escreve muito',
          body: '49 dólares por mês dão 120 documentos. Para quem produz conteúdo em volume, é um preço por unidade de trabalho difícil de contestar.',
        },
      ],
    },
    ourStrengths: {
      eyebrow: 'Quando combinamos melhor',
      title: 'Quando não há quem faça o trabalho',
      intro: 'A diferença real não é técnica. É quem senta para escrever e quem lembra de publicar.',
      items: [
        { title: 'Artigos que publicam sem você', body: 'Um plano mensal de temas que você aprova e, depois, artigos com imagens e links internos que entram no ar sozinhos.' },
        { title: 'Fora do site também', body: 'Publicações no seu perfil da empresa no Google com o seu consentimento, e rascunhos de resposta às avaliações, no mesmo preço.' },
        { title: 'Uma única foto de onde você está', body: 'Uma verificação mensal no Google, no Maps e nas respostas de IA, sem somar uma segunda ferramenta nem montar relatório.' },
        { title: 'Shopify além de WordPress', body: 'O mesmo sistema nas duas plataformas e em sete idiomas.' },
      ],
    },
    faq: {
      eyebrow: 'Perguntas',
      title: 'O que perguntam antes de decidir',
      items: [
        {
          q: 'O Surfer custa 49 dólares e vocês 79. Por quê?',
          a: 'Porque não é a mesma coisa sendo vendida. 49 dólares dão 120 documentos e 10 páginas monitoradas, sem nenhum monitoramento de prompts, e uma pessoa continua escrevendo e publicando. O nosso preço cobre a escrita, a publicação, o perfil da empresa no Google e a verificação mensal juntos. Se você já tem quem escreva, o deles sai mais barato e é a escolha certa.',
        },
        {
          q: 'É o mesmo produto que o "Surfer SEO"?',
          a: 'Sim. Em 31 de outubro de 2026, surferseo.com redireciona para surfer.ai e o produto continua se chamando Surfer. Os links da tabela levam às páginas que lemos.',
        },
        {
          q: 'Quem mede melhor as respostas de IA?',
          a: 'Eles. Os planos mais altos atualizam diariamente dezenas de prompts nomeados e mostram seis motores, enquanto nós verificamos uma vez por mês no ChatGPT, no Gemini e no Google AI. A nossa vantagem ali é que a verificação vem incluída e não exige outra ferramenta, não que ela seja mais profunda.',
        },
      ],
    },
    close: { title: 'Veja como seu site está hoje, sem se cadastrar' },
  },

  fr: {
    competitor: 'Surfer',
    eyebrow: 'Go Top SEO face à Surfer',
    metaTitle: 'Go Top SEO face à Surfer | Comparatif',
    metaDescription:
      'Go Top SEO comparé à Surfer : qui écrit le contenu et qui le publie, ce que chaque tarif comprend, comment la présence dans les réponses IA est mesurée, et quand Surfer est le bon choix.',
    hero: {
      title: 'Surfer vous aide à écrire une page qui se positionne.',
      accent: 'Nous écrivons les pages',
      subtitle:
        "Surfer est un outil d'optimisation spécialisé : quelqu'un s'installe devant et façonne une page face aux résultats de recherche. Go Top SEO est conçu pour un dirigeant qui n'a personne pour écrire — le système planifie les sujets, rédige, publie, publie aussi sur votre fiche d'établissement Google et vérifie une fois par mois où vous en êtes.",
    },
    table: {
      eyebrow: 'Le comparatif',
      title: 'Ce que fait chacun, d’après les pages de Surfer elle-même',
      checkedOn: CHECKED,
      sources: SOURCES,
      rows: [
        {
          label: 'Tarif',
          ours: 'À partir de 79 dollars par mois hors taxes. En Israël, à partir de 249 ILS par mois TVA comprise.',
          theirs:
            "Tous les tarifs sont affichés par mois en facturation annuelle : Discovery 49 dollars, Standard 99, Pro 182, Peace of Mind 299, et un forfait distinct de visibilité IA à 82 dollars. L'abonnement annuel est prélevé d'avance pour l'année entière.",
        },
        {
          label: 'Ce que comprend le forfait le moins cher',
          ours: "Tous les domaines sont dans le forfait d'entrée ; ce qui change d'un forfait à l'autre figure sur la page des tarifs.",
          theirs:
            'Discovery, à 49 dollars : 120 documents, 10 pages suivies et 0 prompt IA. Le suivi de prompts commence avec Standard, qui en compte 25 actualisés chaque semaine.',
        },
        {
          label: 'Qui écrit les articles',
          ours: 'Le système. Sujets, texte, images et liens internes, après votre validation.',
          theirs:
            'Vous, avec leur aide. Leur page décrit un éditeur de contenu avec des consignes en direct tirées des résultats de recherche, des plans et une rédaction assistée par IA : « Write articles that rank — fast — using real-time SEO data ».',
        },
        {
          label: 'Publication sur le site',
          ours: 'Automatique sur WordPress et sur Shopify.',
          theirs:
            "Leur page d'accueil affiche un titre de nouveauté au sujet d'une extension Surfer pour WordPress. La page ne décrit pas ce que cette extension publie, et nous n'avons pas trouvé de page qui l'explique.",
        },
        {
          label: 'Suivi de positions',
          ours: 'Une vérification mensuelle dans Google, dans Google Maps et dans les réponses IA (dont ChatGPT, Gemini et Google AI).',
          theirs:
            "Les forfaits comptent des « pages suivies » — 10 pour Discovery — et la page d'accueil décrit des alertes lorsqu'une page recule. Un suivi de mots-clés classique n'est pas décrit sur les pages que nous avons lues.",
        },
        {
          label: 'Réponses IA',
          ours: 'Une vérification mensuelle automatique dans ChatGPT, Gemini et Google AI.',
          theirs:
            "Le suivi de prompts est compté par forfait : 0 pour Discovery, 25 actualisés chaque semaine pour Standard, 50 actualisés chaque jour pour Pro. Leur page d'accueil affiche Google AI Mode, AI Overviews, Gemini, ChatGPT, Claude et Perplexity sous « Boost visibility in ».",
        },
        {
          label: "Fiche d'établissement Google et Maps",
          ours: 'Des publications automatiques sur la fiche avec votre accord, et une vérification mensuelle de votre position dans Maps.',
          theirs: "La recherche locale, Google Maps et la fiche d'établissement Google ne sont pas mentionnés sur la page d'accueil ni sur la page des tarifs que nous avons lues.",
        },
        {
          label: 'Travail sur le site',
          ours: 'Certaines corrections sont appliquées par notre extension, sans code à lire.',
          theirs:
            "Des conseils, une note et une réoptimisation à l'intérieur de leur propre éditeur. Leur agent automatique, Surfy Agent, apparaît sur la page d'accueil avec la mention « soon ».",
        },
        {
          label: "Période d'essai",
          ours: "Essai de 7 jours, sans carte bancaire, résiliation à tout moment.",
          theirs:
            "Tous les boutons des forfaits indiquent « Start for Free ». Leur page de tarifs n'indique pas la durée de l'essai et ne précise pas si une carte est requise.",
        },
      ],
    },
    theirStrengths: {
      eyebrow: 'Quand Surfer est le meilleur choix',
      title: 'Dans ces cas-là, Surfer est la bonne réponse',
      intro: "Pour l'art d'amener une page précise tout en haut, Surfer est meilleur que nous. Ce n'est pas de la politesse : c'est ce qu'ils ont construit.",
      items: [
        {
          title: "Quand l'objectif est qu'une page gagne",
          body:
            "Leur note sort des résultats de recherche eux-mêmes, et quelqu'un qui écrit bien en suivant ces consignes affinera une page concurrentielle mieux que n'importe quelle chaîne automatique. Si une personne écrit déjà chez vous et qu'il ne manque que cet affinage, c'est exactement l'outil.",
        },
        {
          title: 'Quand ce que vous mesurez, ce sont les réponses IA',
          body:
            "Leurs forfaits suivent des prompts nommés — 25 par semaine sur Standard, 50 par jour sur Pro — et leur page affiche six moteurs. C'est plus fréquent et plus large que notre vérification mensuelle dans trois. Si c'est toute votre question, ils y répondent mieux.",
        },
        {
          title: "Quand on écrit beaucoup",
          body: '49 dollars par mois donnent 120 documents. Pour qui produit du contenu en volume, c’est un prix par unité de travail difficile à contester.',
        },
      ],
    },
    ourStrengths: {
      eyebrow: 'Quand nous convenons mieux',
      title: "Quand il n'y a personne pour faire le travail",
      intro: "La vraie différence n'est pas technique. Elle tient à qui s'assoit pour écrire, et à qui pense à publier.",
      items: [
        { title: 'Des articles qui se publient sans vous', body: 'Un plan de sujets mensuel que vous validez, puis des articles avec images et liens internes qui partent en ligne tout seuls.' },
        { title: 'En dehors du site aussi', body: "Des publications sur votre fiche d'établissement Google avec votre accord, et des brouillons de réponse aux avis, dans le même tarif." },
        { title: 'Une seule photo de votre situation', body: 'Une vérification mensuelle dans Google, dans Maps et dans les réponses IA, sans ajouter un second outil ni monter un rapport.' },
        { title: 'Shopify autant que WordPress', body: 'Le même système sur les deux plateformes, en sept langues.' },
      ],
    },
    faq: {
      eyebrow: 'Questions',
      title: 'Ce que l’on demande avant de choisir',
      items: [
        {
          q: 'Surfer est à 49 dollars et vous à 79. Pourquoi ?',
          a: "Parce que ce n'est pas la même chose qui est vendue. 49 dollars donnent 120 documents et 10 pages suivies, sans aucun suivi de prompts, et une personne écrit et publie toujours. Notre tarif couvre ensemble la rédaction, la publication, la fiche d'établissement Google et la vérification mensuelle. Si vous avez déjà quelqu'un qui écrit, le leur revient moins cher et c'est le bon choix.",
        },
        {
          q: 'Est-ce le même produit que « Surfer SEO » ?',
          a: "Oui. Au 31 octobre 2026, surferseo.com redirige vers surfer.ai et le produit s'appelle toujours Surfer. Les liens du tableau mènent aux pages que nous avons lues.",
        },
        {
          q: 'Qui mesure le mieux les réponses IA ?',
          a: "Eux. Leurs forfaits élevés actualisent chaque jour des dizaines de prompts nommés et affichent six moteurs, tandis que nous vérifions une fois par mois dans ChatGPT, Gemini et Google AI. Notre avantage là-dessus est que la vérification est comprise et n'exige pas un second outil, pas qu'elle soit plus profonde.",
        },
      ],
    },
    close: { title: 'Voyez où en est votre site, sans inscription' },
  },

  it: {
    competitor: 'Surfer',
    eyebrow: 'Go Top SEO a confronto con Surfer',
    metaTitle: 'Go Top SEO a confronto con Surfer | Confronto',
    metaDescription:
      'Go Top SEO a confronto con Surfer: chi scrive i contenuti e chi li pubblica, che cosa comprende ciascun prezzo, come viene misurata la presenza nelle risposte IA e quando Surfer è la scelta giusta.',
    hero: {
      title: 'Surfer aiuta a scrivere una pagina che si posiziona.',
      accent: 'Noi scriviamo le pagine',
      subtitle:
        "Surfer è uno strumento di ottimizzazione specializzato: una persona ci si siede davanti e modella una pagina rispetto ai risultati di ricerca. Go Top SEO è pensato per chi non ha nessuno che scriva — il sistema pianifica gli argomenti, scrive, pubblica, pubblica anche sul profilo dell'attività su Google e verifica una volta al mese a che punto siete.",
    },
    table: {
      eyebrow: 'Il confronto',
      title: 'Che cosa fa ciascuno, secondo le pagine di Surfer stessa',
      checkedOn: CHECKED,
      sources: SOURCES,
      rows: [
        {
          label: 'Prezzo',
          ours: 'Da 79 dollari al mese più imposte. In Israele, da 249 ILS al mese IVA inclusa.',
          theirs:
            "Tutti i prezzi sono mostrati al mese con fatturazione annuale: Discovery 49 dollari, Standard 99, Pro 182, Peace of Mind 299, e un piano separato di visibilità nelle IA a 82 dollari. Il piano annuale viene addebitato in anticipo per l'intero anno.",
        },
        {
          label: 'Che cosa comprende il piano più economico',
          ours: "Tutte le aree sono già nel piano d'ingresso; ciò che cambia fra i piani è sulla pagina dei prezzi.",
          theirs:
            'Discovery, da 49 dollari: 120 documenti, 10 pagine monitorate e 0 prompt IA. Il monitoraggio dei prompt parte da Standard, con 25 prompt aggiornati ogni settimana.',
        },
        {
          label: 'Chi scrive gli articoli',
          ours: 'Il sistema. Argomenti, testo, immagini e link interni, dopo la vostra approvazione.',
          theirs:
            'Voi, con il loro aiuto. La loro pagina descrive un editor di contenuti con indicazioni dal vivo ricavate dai risultati di ricerca, scalette e scrittura assistita dall’IA: "Write articles that rank — fast — using real-time SEO data".',
        },
        {
          label: 'Pubblicazione sul sito',
          ours: 'Automatica su WordPress e su Shopify.',
          theirs:
            'Sulla loro home page compare un titolo di aggiornamento su un plugin Surfer per WordPress. La pagina non descrive che cosa pubblichi quel plugin, e non abbiamo trovato una pagina che lo spieghi.',
        },
        {
          label: 'Monitoraggio delle posizioni',
          ours: 'Una verifica mensile su Google, su Google Maps e nelle risposte IA (fra cui ChatGPT, Gemini e Google AI).',
          theirs:
            'I piani contano le "pagine monitorate" — 10 con Discovery — e la home page descrive avvisi quando una pagina scende. Un monitoraggio classico delle parole chiave non è descritto nelle pagine che abbiamo letto.',
        },
        {
          label: 'Risposte IA',
          ours: 'Una verifica mensile automatica su ChatGPT, Gemini e Google AI.',
          theirs:
            'Il monitoraggio dei prompt è misurato per piano: 0 con Discovery, 25 con aggiornamento settimanale su Standard, 50 con aggiornamento quotidiano su Pro. La home page mostra Google AI Mode, AI Overviews, Gemini, ChatGPT, Claude e Perplexity sotto "Boost visibility in".',
        },
        {
          label: "Profilo dell'attività su Google e Maps",
          ours: 'Pubblicazioni automatiche sul profilo con il vostro consenso, e una verifica mensile della posizione su Maps.',
          theirs: "La ricerca locale, Google Maps e il profilo dell'attività su Google non sono citati nella home page né nella pagina dei prezzi che abbiamo letto.",
        },
        {
          label: 'Lavoro sul sito',
          ours: 'Alcune correzioni vengono applicate tramite il nostro plugin, senza codice da leggere.',
          theirs:
            'Indicazioni, punteggio e riottimizzazione dentro il loro editor. Il loro agente automatico, Surfy Agent, compare sulla home page con l’etichetta "soon".',
        },
        {
          label: 'Prova gratuita',
          ours: 'Prova di 7 giorni, senza carta di credito, disdetta in qualsiasi momento.',
          theirs:
            'Tutti i pulsanti dei piani riportano "Start for Free". La loro pagina dei prezzi non indica la durata della prova e non dice se serva una carta.',
        },
      ],
    },
    theirStrengths: {
      eyebrow: 'Quando Surfer è la scelta migliore',
      title: 'In questi casi Surfer è la risposta giusta',
      intro: "Nel mestiere di portare in alto una singola pagina, Surfer è migliore di noi. Non è cortesia: è ciò che hanno costruito.",
      items: [
        {
          title: 'Quando l’obiettivo è far vincere una pagina',
          body:
            'Il loro punteggio nasce dai risultati di ricerca stessi, e chi scrive bene seguendo quelle indicazioni rifinirà una pagina competitiva meglio di qualsiasi catena automatica. Se qualcuno già scrive per voi e manca soltanto quella rifinitura, è esattamente lo strumento giusto.',
        },
        {
          title: 'Quando ciò che misurate sono le risposte IA',
          body:
            'I loro piani seguono prompt specifici — 25 a settimana su Standard, 50 al giorno su Pro — e la loro pagina mostra sei motori. È più frequente e più ampio della nostra verifica mensile su tre. Se è tutta qui la vostra domanda, loro rispondono meglio.',
        },
        {
          title: 'Quando si scrive molto',
          body: '49 dollari al mese danno 120 documenti. Per chi produce contenuti in quantità, è un prezzo per unità di lavoro difficile da contestare.',
        },
      ],
    },
    ourStrengths: {
      eyebrow: 'Quando siamo più adatti noi',
      title: 'Quando non c’è nessuno che faccia il lavoro',
      intro: 'La differenza vera non è tecnica. Sta in chi si siede a scrivere e in chi si ricorda di pubblicare.',
      items: [
        { title: 'Articoli che si pubblicano senza di voi', body: 'Un piano mensile di argomenti che approvate, e poi articoli con immagini e link interni che vanno online da soli.' },
        { title: 'Anche fuori dal sito', body: "Pubblicazioni sul profilo dell'attività su Google con il vostro consenso, e bozze di risposta alle recensioni, nello stesso prezzo." },
        { title: 'Una sola fotografia della situazione', body: 'Una verifica mensile su Google, su Maps e nelle risposte IA, senza aggiungere un secondo strumento né comporre un report.' },
        { title: 'Shopify oltre a WordPress', body: 'Lo stesso sistema su entrambe le piattaforme e in sette lingue.' },
      ],
    },
    faq: {
      eyebrow: 'Domande',
      title: 'Che cosa si chiede prima di decidere',
      items: [
        {
          q: 'Surfer costa 49 dollari e voi 79. Perché?',
          a: "Perché non si vende la stessa cosa. 49 dollari danno 120 documenti e 10 pagine monitorate, senza alcun monitoraggio dei prompt, e una persona continua a scrivere e a pubblicare. Il nostro prezzo copre insieme la scrittura, la pubblicazione, il profilo dell'attività su Google e la verifica mensile. Se avete già chi scrive, il loro costa meno ed è la scelta giusta.",
        },
        {
          q: 'È lo stesso prodotto di "Surfer SEO"?',
          a: 'Sì. Al 31 ottobre 2026 surferseo.com reindirizza a surfer.ai e il prodotto si chiama ancora Surfer. I link in tabella portano alle pagine che abbiamo letto.',
        },
        {
          q: 'Chi misura meglio le risposte IA?',
          a: 'Loro. I piani più alti aggiornano ogni giorno decine di prompt specifici e mostrano sei motori, mentre noi verifichiamo una volta al mese su ChatGPT, Gemini e Google AI. Il nostro vantaggio lì è che la verifica è inclusa e non richiede un secondo strumento, non che sia più approfondita.',
        },
      ],
    },
    close: { title: 'Guardate a che punto è il sito, senza registrarvi' },
  },
  ja: {
    competitor: 'Surfer',
    eyebrow: 'Go Top SEOとSurferの比較',
    metaTitle: 'Go Top SEOとSurferの比較 | 比較',
    metaDescription:
      'Go Top SEOとSurferの比較です。記事を書くのはどちらで、公開するのはどちらか、それぞれの料金に何が含まれるか、AIの回答の計測はどう違うか、そしてSurferのほうが適しているのはどのような場合かをまとめました。',
    hero: {
      title: 'Surferは、順位の取れるページを書く助けになります。',
      accent: '当社はそのページ自体を書きます',
      subtitle:
        'Surferは最適化に特化した道具です。書き手がその画面に向かい、検索結果と照らし合わせて1本のページを整えていきます。Go Top SEOは、書く人がいない経営者のための製品です。システムが題材を立案し、本文を書き、サイトに公開し、Googleビジネスプロフィールへ投稿し、月に一度、今どのあたりにいるのかを確かめます。',
    },
    table: {
      eyebrow: '比較',
      title: 'Surfer自身のページに書かれている内容にもとづく、それぞれの役割',
      checkedOn: CHECKED,
      sources: SOURCES,
      rows: [
        {
          label: '料金',
          ours: '月額79ドルから（税別）。イスラエルでは月額249シェケルから（付加価値税込み）。',
          theirs:
            '表示はいずれも「年払いの場合の月額」です。Discovery 49ドル、Standard 99ドル、Pro 182ドル、Peace of Mind 299ドル、そしてAIでの可視性のための別プランが82ドルです。年払いは1年分がまとめて前払いで請求されます。',
        },
        {
          label: '最も安いプランに含まれるもの',
          ours: 'すべての領域が最初のプランに入っています。プランごとに変わる点は料金ページに書かれています。',
          theirs:
            '49ドルのDiscoveryは、ドキュメント120件、追跡できるページ10件、AIプロンプトは0件です。プロンプトの追跡はStandardから始まり、25件が週に一度更新されます。',
        },
        {
          label: '記事を書くのは誰か',
          ours: 'システムです。題材、本文、画像、内部リンクを、ご承認のあとに用意します。',
          theirs:
            '書くのは利用者で、同社はそれを支えます。同社のページは、検索結果から引いた指針がその場に表示されるエディター、構成案の作成、AIによる下書きを説明しています。「Write articles that rank — fast — using real-time SEO data」という一文があります。',
        },
        {
          label: 'サイトへの公開',
          ours: 'WordPressとShopifyへ自動で公開します。',
          theirs:
            '同社のトップページには、SurferのWordPress拡張機能に関する製品更新の見出しがあります。ページ自体はその拡張機能が何を公開するのかを説明しておらず、それを説明するページは見つかりませんでした。',
        },
        {
          label: '検索順位の計測',
          ours: 'Google、Googleマップ、そしてAIの回答（ChatGPT、Gemini、Google AIなど）について月に一度計測します。',
          theirs:
            '同社のプランは「追跡するページ数」を数えており、Discoveryでは10件です。トップページには、ページの順位が下がったときに知らせる仕組みの説明があります。一般的なキーワード順位計測ツールについては、当社が読んだページには書かれていません。',
        },
        {
          label: 'AIの回答',
          ours: 'ChatGPT、Gemini、Google AIについて、自動で月に一度計測します。',
          theirs:
            'プロンプトの追跡はプランごとに上限があり、Discoveryは0件、Standardは25件を週に一度更新、Proは50件を毎日更新します。トップページでは「Boost visibility in」の見出しの下に、Google AI Mode、AI Overviews、Gemini、ChatGPT、Claude、Perplexityが並んでいます。',
        },
        {
          label: 'GoogleビジネスプロフィールとGoogleマップ',
          ours: 'ご同意のうえでプロフィールへ自動で投稿し、マップでの位置を月に一度計測します。',
          theirs: 'ローカル検索、Googleマップ、Googleビジネスプロフィールについては、当社が読んだトップページと料金ページのどちらにも書かれていません。',
        },
        {
          label: 'サイトへの作業',
          ours: '修正の一部は当社の拡張機能から適用され、コードを読む必要はありません。',
          theirs:
            '同社のエディターの中で、指針、採点、再最適化が行われます。自動で動くSurfy Agentは、トップページで「soon」と添えられて紹介されています。',
        },
        {
          label: 'トライアル',
          ours: '7日間、クレジットカード不要、いつでも解約できます。',
          theirs:
            'どのプランのボタンにも「Start for Free」とあります。同社の料金ページにはトライアルの期間が書かれておらず、クレジットカードが必要かどうかも書かれていません。',
        },
      ],
    },
    theirStrengths: {
      eyebrow: 'Surferのほうがよい場合',
      title: 'こうした場合は、Surferが正しい答えです',
      intro: '1本のページを上まで押し上げる手仕事では、Surferは当社より優れています。これは気遣いではなく、同社が作ったものがまさにそれだからです。',
      items: [
        {
          title: '1ページの勝ち負けが目的の場合',
          body:
            '同社の採点は検索結果そのものから導かれており、その指針に沿って腕のある書き手が手を入れたページは、どんな自動の仕組みよりも鋭くなります。すでに書く人がいて、足りないのが磨き上げだけであれば、まさにそのための道具です。',
        },
        {
          title: 'AIの回答こそを計測したい場合',
          body:
            '同社のプランは指定したプロンプトを追跡します。Standardでは週に25件、Proでは毎日50件で、トップページには6つのエンジンが並びます。月に一度、3つを見る当社の計測よりも、頻度も範囲も上です。それが問いのすべてであれば、同社のほうがよく答えます。',
        },
        {
          title: '書く量が多い場合',
          body: '月額49ドルでドキュメント120件が使えます。量を出す立場から見れば、作業あたりの単価としては反論しにくい水準です。',
        },
      ],
    },
    ourStrengths: {
      eyebrow: '当社のほうが適している場合',
      title: '作業をする人がいない場合',
      intro: '本当の違いは技術ではありません。誰が座って書くのか、そして誰が公開を忘れずにいるのか、という違いです。',
      items: [
        { title: '手をかけずに公開される記事', body: '月に一度、題材の計画をご承認いただくと、画像と内部リンクの入った記事がそのまま公開されます。' },
        { title: 'サイトの外側も', body: 'ご同意のうえでGoogleビジネスプロフィールへ投稿し、口コミへの返信の下書きも同じ料金に入っています。' },
        { title: '今いる場所が1枚でわかります', body: 'Google、マップ、AIの回答を月に一度まとめて確認します。2つ目の道具もレポートの組み立ても不要です。' },
        { title: 'WordPressだけでなくShopifyも', body: '同じ仕組みを両方のプラットフォームで、7つの言語で使えます。' },
      ],
    },
    faq: {
      eyebrow: 'よくある質問',
      title: '決める前によく聞かれること',
      items: [
        {
          q: 'Surferは49ドルで、当社は79ドルです。なぜですか',
          a: '売っているものが同じではないからです。49ドルで買えるのはドキュメント120件と追跡できるページ10件で、プロンプトの追跡はまったく含まれず、書いて公開するのは人です。当社の料金は、執筆、公開、Googleビジネスプロフィール、そして月に一度の計測をまとめて含みます。すでに書き手がいるのであれば、同社のほうが安く、そちらが正しい選び方です。',
        },
        {
          q: '「Surfer SEO」と同じ製品ですか',
          a: 'はい。2026年10月31日の時点で、surferseo.comはsurfer.aiへ転送され、製品の名称は引き続きSurferです。表の下のリンクは、当社が読んだページに向いています。',
        },
        {
          q: 'AIの回答の計測は、どちらが優れていますか',
          a: '同社です。同社の上位プランは指定したプロンプトを毎日更新し、6つのエンジンを示します。当社はChatGPT、Gemini、Google AIについて月に一度確認します。当社の利点は、その確認が基本料金に含まれ、別の道具を足さずに済むことで、より深いという意味ではありません。',
        },
      ],
    },
    close: { title: 'サイトの現状を、登録なしで確認する' },
  },
}
