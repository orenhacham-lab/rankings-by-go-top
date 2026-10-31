/**
 * Go Top SEO compared with Writesonic, in every language the public site speaks.
 *
 * THE PAGE WHERE THE HEADLINE NUMBER IS THE SAME. Writesonic's Starter plan is
 * $79 a month billed annually and ours starts at $79 a month plus tax, so this
 * page is not about price at all — it is about what each of us spends it on.
 * That is also why the page must be unusually careful: a reader arriving from
 * "writesonic alternative" is comparing two products at the same number and
 * will check every line.
 *
 * THE READING RULE THIS FILE OBEYS. Two things are deliberately NOT claimed:
 *
 *   - Nothing says Writesonic does not track Google organic rankings. Their
 *     homepage says "Track both" and lists Search Console and Keyword Planner
 *     among the integrations; we found no page describing a classic keyword
 *     rank tracker, and that is all the copy says.
 *   - Nothing says they are worse at AI answers. They are better: at the same
 *     $79 they follow 50 named prompts with 50 answers refreshed daily across
 *     ChatGPT, Gemini and Google AI Overviews, where our automatic check runs
 *     monthly across three. `theirStrengths` leads with it.
 *
 * Their pricing page lists no monthly-billed price, so none is quoted or
 * computed here. Their trial length is not stated anywhere on the page, so the
 * copy quotes only what the page says: "Start free. No credit card needed."
 */
import type { PublicLocale } from '@/lib/i18n/locales'
import type { ComparisonCopy } from './types'

const CHECKED = '2026-10-31'

const SOURCES = [
  { label: 'writesonic.com — pricing', href: 'https://writesonic.com/pricing' },
  { label: 'writesonic.com', href: 'https://writesonic.com/' },
]

export const WRITESONIC_COMPARE: Record<PublicLocale, ComparisonCopy> = {
  he: {
    competitor: 'Writesonic',
    eyebrow: 'Go Top SEO מול Writesonic',
    metaTitle: 'Go Top SEO מול Writesonic | השוואה',
    metaDescription:
      'שני מוצרים באותו מחיר התחלתי של 79 דולר. השוואה בין Go Top SEO לבין Writesonic: על מה כל אחד מוציא את הכסף, מה נמדד, ומתי Writesonic הוא הבחירה הנכונה.',
    hero: {
      title: 'אותם 79 דולר, שתי עבודות שונות.',
      accent: 'השאלה היא על מה',
      subtitle:
        'מסלול ה-Starter של Writesonic עולה 79 דולר לחודש בחיוב שנתי, ואנחנו מתחילים מ-79 דולר לחודש בתוספת מס. אצלם הכסף הולך בעיקר למדידה עמוקה של נוכחות בתשובות AI; אצלנו הוא נפרס על כתיבה, פרסום, תיקונים באתר, הפרופיל העסקי בגוגל ובדיקה חודשית בגוגל, במפות ובתשובות AI.',
    },
    table: {
      eyebrow: 'ההשוואה',
      title: 'מה כל אחד עושה, לפי העמודים של Writesonic עצמם',
      checkedOn: CHECKED,
      sources: SOURCES,
      rows: [
        {
          label: 'מחיר',
          ours: 'מ-79 דולר לחודש בתוספת מס. בישראל, מ-249 ש״ח לחודש כולל מע״מ.',
          theirs:
            'Starter ב-79 דולר לחודש בחיוב שנתי, Basic ב-199, Growth ב-399, ו-Enterprise במחיר מותאם. עמוד המחירים שלהם אינו מציג מחיר לחיוב חודשי.',
        },
        {
          label: 'מה כלול במסלול הראשון',
          ours: 'כל התחומים נכללים מהמסלול הראשון; מה שמשתנה בין המסלולים מופיע בעמוד המחירים.',
          theirs:
            'ב-Starter: 50 פרומפטים במעקב, 50 תשובות שנמדדות מדי יום, 15 מאמרי AI בחודש, 10 בדיקות אתר של 100 עמודים כל אחת, משתמש אחד ופרויקט אחד.',
        },
        {
          label: 'מי כותב את המאמרים',
          ours: 'המערכת. נושאים, טקסט, תמונות וקישורים פנימיים, אחרי שאתם מאשרים.',
          theirs: 'גם אצלם המערכת כותבת. עמוד המחירים מודד "AI articles" לפי מסלול — 15 בחודש ב-Starter.',
        },
        {
          label: 'פרסום לאתר',
          ours: 'אוטומטי לוורדפרס ולשופיפיי.',
          theirs: 'וורדפרס הוא אינטגרציית הפרסום היחידה שמוזכרת בעמוד הבית שלהם.',
        },
        {
          label: 'תשובות AI',
          ours: 'בדיקה חודשית אוטומטית ב-ChatGPT, ב-Gemini וב-Google AI.',
          theirs:
            'Starter, Basic ו-Growth עוקבים אחרי ChatGPT, Gemini ו-Google AI Overviews, עם תשובות שמתרעננות מדי יום. כל תשע הפלטפורמות — בהן Perplexity, Claude, Grok ו-Microsoft Copilot — הן ב-Enterprise.',
        },
        {
          label: 'מעקב מיקומים בגוגל',
          ours: 'בדיקה חודשית במיקומים האורגניים בגוגל.',
          theirs:
            'עמוד הבית שלהם מונה את Google Search Console ואת Keyword Planner בין האינטגרציות. לא מצאנו עמוד שמתאר מעקב מילות מפתח קלאסי.',
        },
        {
          label: 'גוגל מפות והפרופיל העסקי',
          ours: 'פוסטים אוטומטיים לפרופיל באישורכם, ובדיקה חודשית של המיקום במפות.',
          theirs: 'גוגל מפות והפרופיל העסקי בגוגל אינם מוזכרים בעמוד הבית שלהם.',
        },
        {
          label: 'עבודה על האתר',
          ours: 'חלק מהתיקונים מוחלים דרך התוסף שלנו, בלי קוד לקרוא.',
          theirs:
            'Action Center שמדרג הזדמנויות ומציע תיקון בלחיצה אחת. ב-Starter, התהליכים האוטומטיים מוגדרים "Limited access (10 trial runs)".',
        },
        {
          label: 'תקופת ניסיון',
          ours: '7 ימי ניסיון, בלי כרטיס אשראי, ביטול בכל רגע.',
          theirs:
            'בראש עמוד המחירים כתוב "Start free. No credit card needed." אורך תקופת הניסיון אינו מצוין בעמוד.',
        },
      ],
    },
    theirStrengths: {
      eyebrow: 'מתי Writesonic הוא הבחירה הנכונה',
      title: 'במקרים האלה כדאי לקחת אותם',
      intro: 'בנוכחות בתשובות AI הם מומחים ואנחנו לא. באותו מחיר, הם מודדים את זה עמוק יותר.',
      items: [
        {
          title: 'כשכל השאלה היא האם AI מזכיר אתכם',
          body:
            'באותם 79 דולר הם עוקבים אחרי 50 פרומפטים בשם ומודדים 50 תשובות מדי יום ב-ChatGPT, ב-Gemini וב-Google AI Overviews. הבדיקה שלנו היא חודשית. אם זו השאלה המרכזית שלכם, התשובה שלהם מפורטת יותר.',
        },
        {
          title: 'כשצריך יותר ממנוע אחד או שניים',
          body:
            'מסלול Enterprise שלהם מכסה תשע פלטפורמות, בהן Perplexity, Claude, Grok ו-Microsoft Copilot. אנחנו בודקים שלוש. למותג שנמדד על פני כל נוף ה-AI, זה פער אמיתי.',
        },
        {
          title: 'כשרוצים לנסות בלי כלום',
          body:
            'בעמוד שלהם כתוב "Start free. No credit card needed." אצלנו גם אין כרטיס אשראי, אבל הניסיון מוגבל לשבעה ימים; אצלם אורך התקופה לא מצוין בעמוד, אז ייתכן שתקבלו יותר זמן להתרשם.',
        },
      ],
    },
    ourStrengths: {
      eyebrow: 'מתי אנחנו מתאימים יותר',
      title: 'כשצריך שהעבודה תיעשה, לא רק תימדד',
      intro: 'אותו מחיר, פריסה אחרת. אנחנו מוותרים על עומק המדידה כדי לכסות יותר מהעבודה עצמה.',
      items: [
        { title: 'גם הצד המקומי', body: 'פוסטים לפרופיל העסקי בגוגל באישורכם, טיוטות תשובה לביקורות, ובדיקה חודשית של המיקום בגוגל מפות.' },
        { title: 'שופיפיי וגם וורדפרס', body: 'פרסום אוטומטי לשתי הפלטפורמות, עם אותו דוח חודשי.' },
        { title: 'בלי שמישהו יפעיל את זה', body: 'תוכנית נושאים חודשית שאתם מאשרים, ואז הכל רץ לבד — בלי פרומפטים להגדיר ובלי לוח בקרה לפתוח.' },
        { title: 'עברית ושבע שפות', body: 'הממשק, התוכן והדוחות בשפה שלכם, ובישראל מחיר בשקלים כולל מע״מ.' },
      ],
    },
    faq: {
      eyebrow: 'שאלות',
      title: 'מה שואלים לפני שמחליטים',
      items: [
        {
          q: 'שניכם 79 דולר. מה בעצם ההבדל?',
          a: 'על מה המחיר מתפרס. אצלם רוב המשקל הוא במדידה יומית של נוכחות בתשובות AI, פלוס 15 מאמרים בחודש. אצלנו אותו סכום מכסה כתיבה ופרסום, תיקונים באתר, פוסטים לפרופיל העסקי בגוגל, וגם בדיקה חודשית בגוגל, במפות ובתשובות AI. אם אתם מודדים AI — הם. אם צריך שהעבודה תיעשה — אנחנו.',
        },
        {
          q: 'אתם בודקים כמה פלטפורמות AI כמוהם?',
          a: 'לא. הבדיקה האוטומטית שלנו מכסה את ChatGPT, את Gemini ואת Google AI, אחת לחודש. המסלולים שלהם מרעננים תשובות מדי יום, ו-Enterprise שלהם מגיע לתשע פלטפורמות.',
        },
        {
          q: 'יש לכם שופיפיי?',
          a: 'כן. אנחנו מפרסמים לוורדפרס ולשופיפיי. בעמוד הבית שלהם וורדפרס היא אינטגרציית הפרסום היחידה שמוזכרת — אם החנות שלכם בשופיפיי, זה שווה בדיקה מולם לפני שמחליטים.',
        },
      ],
    },
    close: { title: 'בדקו איפה האתר עומד, בלי להירשם' },
  },

  en: {
    competitor: 'Writesonic',
    eyebrow: 'Go Top SEO vs Writesonic',
    metaTitle: 'Go Top SEO vs Writesonic | Comparison',
    metaDescription:
      'Two products at the same $79 starting price. Go Top SEO compared with Writesonic: what each one spends it on, what gets measured, and when Writesonic is the better buy.',
    hero: {
      title: 'The same $79, two different jobs.',
      accent: 'The question is what for',
      subtitle:
        "Writesonic's Starter plan is $79 a month billed annually, and we start at $79 a month plus tax. Their money goes mostly into deep measurement of how AI answers mention you; ours is spread across writing, publishing, on-site fixes, your Google Business Profile and a monthly check in Google, Maps and AI answers.",
    },
    table: {
      eyebrow: 'The comparison',
      title: "What each one does, taken from Writesonic's own pages",
      checkedOn: CHECKED,
      sources: SOURCES,
      rows: [
        {
          label: 'Price',
          ours: 'From $79 a month plus tax. In Israel, from 249 ILS a month including VAT.',
          theirs:
            'Starter $79 a month billed annually, Basic $199, Growth $399, Enterprise custom. Their pricing page shows no monthly-billed price.',
        },
        {
          label: 'What the entry plan includes',
          ours: 'Every area is in the entry plan; what changes between plans is on the pricing page.',
          theirs:
            'Starter: 50 prompts tracked, 50 answers tracked daily, 15 AI articles a month, 10 site audits of 100 pages each, 1 user and 1 project.',
        },
        {
          label: 'Who writes the articles',
          ours: 'The system. Topics, text, images and internal links, after you approve.',
          theirs: 'Their system writes too. The pricing page meters "AI articles" per plan — 15 a month on Starter.',
        },
        {
          label: 'Publishing to the site',
          ours: 'Automatic to WordPress and Shopify.',
          theirs: 'WordPress is the only publishing integration named on their homepage.',
        },
        {
          label: 'AI answers',
          ours: 'An automatic monthly check in ChatGPT, Gemini and Google AI.',
          theirs:
            'Starter, Basic and Growth all track ChatGPT, Gemini and Google AI Overviews, with answers refreshed daily. All nine platforms — among them Perplexity, Claude, Grok and Microsoft Copilot — are on Enterprise.',
        },
        {
          label: 'Google rank tracking',
          ours: 'A monthly check of your organic positions in Google.',
          theirs:
            'Their homepage lists Google Search Console and Keyword Planner among the integrations. We did not find a page describing a classic keyword rank tracker.',
        },
        {
          label: 'Google Maps and Business Profile',
          ours: 'Automatic posts to the profile with your consent, and a monthly check of your position in Maps.',
          theirs: 'Google Maps and Google Business Profile are not mentioned on their homepage.',
        },
        {
          label: 'Work on the site',
          ours: 'Some fixes are applied through our plugin, with no code to read.',
          theirs:
            'An Action Center that ranks opportunities and offers a one-click fix. On Starter, the agentic runs are listed as "Limited access (10 trial runs)".',
        },
        {
          label: 'Trial',
          ours: 'A 7-day trial, no credit card, cancel anytime.',
          theirs:
            'The top of their pricing page reads "Start free. No credit card needed." No trial length is stated on the page.',
        },
      ],
    },
    theirStrengths: {
      eyebrow: 'When Writesonic is the better buy',
      title: 'In these cases take theirs',
      intro: 'On visibility inside AI answers they are specialists and we are not. At the same price, they measure it more deeply.',
      items: [
        {
          title: 'When the whole question is whether AI mentions you',
          body:
            'For the same $79 they follow 50 named prompts and measure 50 answers every day across ChatGPT, Gemini and Google AI Overviews. Our check is monthly. If that is your central question, their answer is more detailed than ours.',
        },
        {
          title: 'When one or two engines are not enough',
          body:
            'Their Enterprise tier covers nine platforms, among them Perplexity, Claude, Grok and Microsoft Copilot. We check three. For a brand measured across the whole AI landscape, that is a real gap.',
        },
        {
          title: 'When you want to try with nothing at stake',
          body:
            'Their page reads "Start free. No credit card needed." We ask for no card either, but our trial is capped at seven days; their page states no length, so you may get longer to form a view.',
        },
      ],
    },
    ourStrengths: {
      eyebrow: 'When we fit better',
      title: 'When the work has to get done, not only measured',
      intro: 'Same price, different spread. We give up measurement depth to cover more of the work itself.',
      items: [
        { title: 'The local side as well', body: 'Posts to your Google Business Profile with your consent, drafted replies to reviews, and a monthly check of your position in Google Maps.' },
        { title: 'Shopify as well as WordPress', body: 'Automatic publishing to both platforms, with the same monthly report.' },
        { title: 'Nobody has to run it', body: 'A monthly topic plan you approve, and then it runs by itself — no prompts to configure, no dashboard to open.' },
        { title: 'Seven languages, Hebrew included', body: 'Interface, content and reports in your language, and in Israel a price in shekels with VAT included.' },
      ],
    },
    faq: {
      eyebrow: 'Questions',
      title: 'What people ask before deciding',
      items: [
        {
          q: 'You are both $79. What is actually different?',
          a: 'What the price is spread across. Most of theirs sits in daily measurement of how AI answers mention you, plus 15 articles a month. The same amount with us covers writing and publishing, on-site fixes, posts to your Google Business Profile, and a monthly check in Google, in Maps and in AI answers. If you are measuring AI, take theirs. If the work needs doing, take ours.',
        },
        {
          q: 'Do you check as many AI platforms as they do?',
          a: 'No. Our automatic check covers ChatGPT, Gemini and Google AI, once a month. Their plans refresh answers daily, and their Enterprise tier reaches nine platforms.',
        },
        {
          q: 'Do you do Shopify?',
          a: 'Yes. We publish to WordPress and to Shopify. On their homepage WordPress is the only publishing integration named — if your store is on Shopify, that is worth checking with them before you decide.',
        },
      ],
    },
    close: { title: 'See where your site stands, without signing up' },
  },

  es: {
    competitor: 'Writesonic',
    eyebrow: 'Go Top SEO frente a Writesonic',
    metaTitle: 'Go Top SEO frente a Writesonic | Comparativa',
    metaDescription:
      'Dos productos con el mismo precio de entrada de 79 dólares. Go Top SEO comparado con Writesonic: en qué lo gasta cada uno, qué se mide y cuándo Writesonic es la mejor opción.',
    hero: {
      title: 'Los mismos 79 dólares, dos trabajos distintos.',
      accent: 'La pregunta es para qué',
      subtitle:
        'El plan Starter de Writesonic cuesta 79 dólares al mes con facturación anual, y nosotros empezamos en 79 dólares al mes más impuestos. Su dinero va sobre todo a medir en profundidad cómo te mencionan las respuestas de IA; el nuestro se reparte entre redacción, publicación, correcciones en el sitio, tu perfil de empresa en Google y una comprobación mensual en Google, Maps y respuestas de IA.',
    },
    table: {
      eyebrow: 'La comparativa',
      title: 'Qué hace cada uno, según las propias páginas de Writesonic',
      checkedOn: CHECKED,
      sources: SOURCES,
      rows: [
        {
          label: 'Precio',
          ours: 'Desde 79 dólares al mes más impuestos. En Israel, desde 249 ILS al mes con IVA incluido.',
          theirs:
            'Starter 79 dólares al mes con facturación anual, Basic 199, Growth 399 y Enterprise a medida. Su página de precios no muestra ningún precio de facturación mensual.',
        },
        {
          label: 'Qué incluye el plan de entrada',
          ours: 'Todas las áreas están en el plan de entrada; lo que cambia entre planes está en la página de precios.',
          theirs:
            'Starter: 50 prompts monitorizados, 50 respuestas medidas cada día, 15 artículos de IA al mes, 10 auditorías de sitio de 100 páginas cada una, 1 usuario y 1 proyecto.',
        },
        {
          label: 'Quién escribe los artículos',
          ours: 'El sistema. Temas, texto, imágenes y enlaces internos, después de que lo apruebes.',
          theirs: 'Su sistema también escribe. La página de precios mide los "AI articles" por plan: 15 al mes en Starter.',
        },
        {
          label: 'Publicación en el sitio',
          ours: 'Automática en WordPress y en Shopify.',
          theirs: 'WordPress es la única integración de publicación citada en su página de inicio.',
        },
        {
          label: 'Respuestas de IA',
          ours: 'Una comprobación mensual automática en ChatGPT, Gemini y Google AI.',
          theirs:
            'Starter, Basic y Growth siguen ChatGPT, Gemini y Google AI Overviews, con respuestas actualizadas a diario. Las nueve plataformas —entre ellas Perplexity, Claude, Grok y Microsoft Copilot— están en Enterprise.',
        },
        {
          label: 'Seguimiento de posiciones en Google',
          ours: 'Una comprobación mensual de tus posiciones orgánicas en Google.',
          theirs:
            'Su página de inicio cita Google Search Console y Keyword Planner entre las integraciones. No encontramos una página que describa un rastreador clásico de palabras clave.',
        },
        {
          label: 'Google Maps y perfil de empresa',
          ours: 'Publicaciones automáticas en el perfil con tu consentimiento, y una comprobación mensual de tu posición en Maps.',
          theirs: 'Google Maps y el perfil de empresa en Google no se mencionan en su página de inicio.',
        },
        {
          label: 'Trabajo sobre el sitio',
          ours: 'Algunas correcciones se aplican a través de nuestro plugin, sin código que leer.',
          theirs:
            'Un Action Center que ordena las oportunidades y ofrece corregirlas con un clic. En Starter, las ejecuciones automáticas figuran como "Limited access (10 trial runs)".',
        },
        {
          label: 'Prueba gratuita',
          ours: 'Prueba de 7 días, sin tarjeta de crédito, cancelas cuando quieras.',
          theirs:
            'La cabecera de su página de precios dice "Start free. No credit card needed." La duración de la prueba no se indica en la página.',
        },
      ],
    },
    theirStrengths: {
      eyebrow: 'Cuándo Writesonic es la mejor compra',
      title: 'En estos casos coge el suyo',
      intro: 'En presencia dentro de las respuestas de IA ellos son especialistas y nosotros no. Al mismo precio, lo miden más a fondo.',
      items: [
        {
          title: 'Cuando toda la pregunta es si la IA te menciona',
          body:
            'Por los mismos 79 dólares siguen 50 prompts concretos y miden 50 respuestas cada día en ChatGPT, Gemini y Google AI Overviews. Nuestra comprobación es mensual. Si esa es tu pregunta central, su respuesta es más detallada que la nuestra.',
        },
        {
          title: 'Cuando uno o dos motores no bastan',
          body:
            'Su plan Enterprise cubre nueve plataformas, entre ellas Perplexity, Claude, Grok y Microsoft Copilot. Nosotros comprobamos tres. Para una marca que se mide en todo el panorama de la IA, esa es una diferencia real.',
        },
        {
          title: 'Cuando quieres probar sin arriesgar nada',
          body:
            'Su página dice "Start free. No credit card needed." Nosotros tampoco pedimos tarjeta, pero nuestra prueba se limita a siete días; su página no indica duración, así que puede que tengas más tiempo para formarte una opinión.',
        },
      ],
    },
    ourStrengths: {
      eyebrow: 'Cuándo encajamos mejor',
      title: 'Cuando el trabajo tiene que hacerse, no solo medirse',
      intro: 'Mismo precio, reparto distinto. Renunciamos a profundidad de medición para cubrir más del trabajo en sí.',
      items: [
        { title: 'También el lado local', body: 'Publicaciones en tu perfil de empresa en Google con tu consentimiento, borradores de respuesta a las reseñas y una comprobación mensual de tu posición en Google Maps.' },
        { title: 'Shopify además de WordPress', body: 'Publicación automática en las dos plataformas, con el mismo informe mensual.' },
        { title: 'Nadie tiene que manejarlo', body: 'Un plan mensual de temas que tú apruebas y, después, funciona solo: sin prompts que configurar y sin panel que abrir.' },
        { title: 'Siete idiomas, hebreo incluido', body: 'Interfaz, contenido e informes en tu idioma y, en Israel, un precio en shekels con IVA incluido.' },
      ],
    },
    faq: {
      eyebrow: 'Preguntas',
      title: 'Lo que se pregunta antes de decidir',
      items: [
        {
          q: 'Los dos costáis 79 dólares. ¿Qué cambia de verdad?',
          a: 'En qué se reparte el precio. El suyo pesa sobre todo en la medición diaria de cómo te mencionan las respuestas de IA, más 15 artículos al mes. La misma cantidad con nosotros cubre redacción y publicación, correcciones en el sitio, publicaciones en tu perfil de empresa en Google y una comprobación mensual en Google, en Maps y en respuestas de IA. Si mides IA, coge el suyo. Si hay trabajo que hacer, coge el nuestro.',
        },
        {
          q: '¿Comprobáis tantas plataformas de IA como ellos?',
          a: 'No. Nuestra comprobación automática cubre ChatGPT, Gemini y Google AI, una vez al mes. Sus planes actualizan respuestas a diario, y su plan Enterprise llega a nueve plataformas.',
        },
        {
          q: '¿Trabajáis con Shopify?',
          a: 'Sí. Publicamos en WordPress y en Shopify. En su página de inicio WordPress es la única integración de publicación citada: si tu tienda está en Shopify, conviene preguntárselo a ellos antes de decidir.',
        },
      ],
    },
    close: { title: 'Mira cómo está tu sitio, sin registrarte' },
  },

  'pt-BR': {
    competitor: 'Writesonic',
    eyebrow: 'Go Top SEO x Writesonic',
    metaTitle: 'Go Top SEO x Writesonic | Comparativo',
    metaDescription:
      'Dois produtos com o mesmo preço inicial de 79 dólares. Go Top SEO comparado com o Writesonic: no que cada um gasta, o que é medido e quando o Writesonic é a melhor escolha.',
    hero: {
      title: 'Os mesmos 79 dólares, dois trabalhos diferentes.',
      accent: 'A pergunta é para quê',
      subtitle:
        'O plano Starter do Writesonic custa 79 dólares por mês com cobrança anual, e nós começamos em 79 dólares por mês mais impostos. O dinheiro deles vai principalmente para medir a fundo como as respostas de IA citam você; o nosso se divide entre escrita, publicação, correções no site, o seu perfil da empresa no Google e uma verificação mensal no Google, no Maps e nas respostas de IA.',
    },
    table: {
      eyebrow: 'O comparativo',
      title: 'O que cada um faz, segundo as próprias páginas do Writesonic',
      checkedOn: CHECKED,
      sources: SOURCES,
      rows: [
        {
          label: 'Preço',
          ours: 'A partir de 79 dólares por mês mais impostos. Em Israel, a partir de 249 ILS por mês com imposto incluído.',
          theirs:
            'Starter 79 dólares por mês com cobrança anual, Basic 199, Growth 399 e Enterprise sob medida. A página de preços deles não mostra preço com cobrança mensal.',
        },
        {
          label: 'O que o plano de entrada inclui',
          ours: 'Todas as áreas estão no plano de entrada; o que muda entre os planos está na página de preços.',
          theirs:
            'Starter: 50 prompts monitorados, 50 respostas medidas por dia, 15 artigos de IA por mês, 10 auditorias de site de 100 páginas cada, 1 usuário e 1 projeto.',
        },
        {
          label: 'Quem escreve os artigos',
          ours: 'O sistema. Temas, texto, imagens e links internos, depois que você aprova.',
          theirs: 'O sistema deles também escreve. A página de preços mede os "AI articles" por plano: 15 por mês no Starter.',
        },
        {
          label: 'Publicação no site',
          ours: 'Automática no WordPress e na Shopify.',
          theirs: 'O WordPress é a única integração de publicação citada na página inicial deles.',
        },
        {
          label: 'Respostas de IA',
          ours: 'Uma verificação mensal automática no ChatGPT, no Gemini e no Google AI.',
          theirs:
            'Starter, Basic e Growth acompanham ChatGPT, Gemini e Google AI Overviews, com respostas atualizadas diariamente. As nove plataformas — entre elas Perplexity, Claude, Grok e Microsoft Copilot — estão no Enterprise.',
        },
        {
          label: 'Monitoramento de posições no Google',
          ours: 'Uma verificação mensal das suas posições orgânicas no Google.',
          theirs:
            'A página inicial deles cita o Google Search Console e o Keyword Planner entre as integrações. Não encontramos uma página que descreva um rastreador clássico de palavras-chave.',
        },
        {
          label: 'Google Maps e perfil da empresa',
          ours: 'Publicações automáticas no perfil com o seu consentimento, e uma verificação mensal da sua posição no Maps.',
          theirs: 'O Google Maps e o perfil da empresa no Google não são mencionados na página inicial deles.',
        },
        {
          label: 'Trabalho no site',
          ours: 'Algumas correções são aplicadas pelo nosso plugin, sem código para ler.',
          theirs:
            'Um Action Center que ordena as oportunidades e oferece correção com um clique. No Starter, as execuções automáticas aparecem como "Limited access (10 trial runs)".',
        },
        {
          label: 'Teste grátis',
          ours: 'Teste de 7 dias, sem cartão de crédito, cancele quando quiser.',
          theirs:
            'No topo da página de preços deles está escrito "Start free. No credit card needed." A duração do teste não é informada na página.',
        },
      ],
    },
    theirStrengths: {
      eyebrow: 'Quando o Writesonic é a melhor compra',
      title: 'Nestes casos fique com o deles',
      intro: 'Em presença dentro das respostas de IA eles são especialistas e nós não. Pelo mesmo preço, medem isso mais a fundo.',
      items: [
        {
          title: 'Quando toda a pergunta é se a IA cita você',
          body:
            'Pelos mesmos 79 dólares eles acompanham 50 prompts nomeados e medem 50 respostas todos os dias no ChatGPT, no Gemini e no Google AI Overviews. A nossa verificação é mensal. Se essa é a sua pergunta central, a resposta deles é mais detalhada que a nossa.',
        },
        {
          title: 'Quando um ou dois motores não bastam',
          body:
            'O plano Enterprise deles cobre nove plataformas, entre elas Perplexity, Claude, Grok e Microsoft Copilot. Nós verificamos três. Para uma marca medida em todo o cenário de IA, essa é uma diferença real.',
        },
        {
          title: 'Quando você quer experimentar sem arriscar nada',
          body:
            'A página deles diz "Start free. No credit card needed." Nós também não pedimos cartão, mas o nosso teste é limitado a sete dias; a página deles não informa duração, então você pode ter mais tempo para formar uma opinião.',
        },
      ],
    },
    ourStrengths: {
      eyebrow: 'Quando combinamos melhor',
      title: 'Quando o trabalho precisa ser feito, não só medido',
      intro: 'Mesmo preço, divisão diferente. Abrimos mão de profundidade de medição para cobrir mais do trabalho em si.',
      items: [
        { title: 'O lado local também', body: 'Publicações no seu perfil da empresa no Google com o seu consentimento, rascunhos de resposta às avaliações e uma verificação mensal da sua posição no Google Maps.' },
        { title: 'Shopify além de WordPress', body: 'Publicação automática nas duas plataformas, com o mesmo relatório mensal.' },
        { title: 'Ninguém precisa operar', body: 'Um plano mensal de temas que você aprova e, depois, tudo roda sozinho: sem prompts para configurar e sem painel para abrir.' },
        { title: 'Sete idiomas, hebraico incluído', body: 'Interface, conteúdo e relatórios no seu idioma e, em Israel, um preço em shekels com imposto incluído.' },
      ],
    },
    faq: {
      eyebrow: 'Perguntas',
      title: 'O que perguntam antes de decidir',
      items: [
        {
          q: 'Os dois custam 79 dólares. O que muda de verdade?',
          a: 'Em que o preço se divide. O deles pesa principalmente na medição diária de como as respostas de IA citam você, mais 15 artigos por mês. O mesmo valor conosco cobre escrita e publicação, correções no site, publicações no seu perfil da empresa no Google e uma verificação mensal no Google, no Maps e nas respostas de IA. Se você mede IA, fique com o deles. Se há trabalho a fazer, fique com o nosso.',
        },
        {
          q: 'Vocês verificam tantas plataformas de IA quanto eles?',
          a: 'Não. A nossa verificação automática cobre ChatGPT, Gemini e Google AI, uma vez por mês. Os planos deles atualizam respostas diariamente, e o Enterprise chega a nove plataformas.',
        },
        {
          q: 'Vocês atendem Shopify?',
          a: 'Sim. Publicamos no WordPress e na Shopify. Na página inicial deles o WordPress é a única integração de publicação citada: se a sua loja é Shopify, vale confirmar isso com eles antes de decidir.',
        },
      ],
    },
    close: { title: 'Veja como seu site está hoje, sem se cadastrar' },
  },

  fr: {
    competitor: 'Writesonic',
    eyebrow: 'Go Top SEO face à Writesonic',
    metaTitle: 'Go Top SEO face à Writesonic | Comparatif',
    metaDescription:
      'Deux produits au même tarif de départ de 79 dollars. Go Top SEO comparé à Writesonic : à quoi chacun le consacre, ce qui est mesuré, et quand Writesonic est le bon choix.',
    hero: {
      title: 'Les mêmes 79 dollars, deux métiers différents.',
      accent: 'La question est pour quoi faire',
      subtitle:
        "Le forfait Starter de Writesonic coûte 79 dollars par mois en facturation annuelle, et nous démarrons à 79 dollars par mois hors taxes. Leur budget part surtout dans une mesure fine de la façon dont les réponses IA vous citent ; le nôtre se répartit entre rédaction, publication, corrections sur le site, votre fiche d'établissement Google et une vérification mensuelle dans Google, Maps et les réponses IA.",
    },
    table: {
      eyebrow: 'Le comparatif',
      title: 'Ce que fait chacun, d’après les pages de Writesonic elle-même',
      checkedOn: CHECKED,
      sources: SOURCES,
      rows: [
        {
          label: 'Tarif',
          ours: 'À partir de 79 dollars par mois hors taxes. En Israël, à partir de 249 ILS par mois TVA comprise.',
          theirs:
            "Starter 79 dollars par mois en facturation annuelle, Basic 199, Growth 399, Enterprise sur mesure. Leur page de tarifs n'affiche aucun prix en facturation mensuelle.",
        },
        {
          label: "Ce que comprend le forfait d'entrée",
          ours: "Tous les domaines sont dans le forfait d'entrée ; ce qui change d'un forfait à l'autre figure sur la page des tarifs.",
          theirs:
            'Starter : 50 prompts suivis, 50 réponses mesurées chaque jour, 15 articles IA par mois, 10 audits de site de 100 pages chacun, 1 utilisateur et 1 projet.',
        },
        {
          label: 'Qui écrit les articles',
          ours: 'Le système. Sujets, texte, images et liens internes, après votre validation.',
          theirs: 'Leur système écrit aussi. La page de tarifs compte les « AI articles » par forfait : 15 par mois sur Starter.',
        },
        {
          label: 'Publication sur le site',
          ours: 'Automatique sur WordPress et sur Shopify.',
          theirs: "WordPress est la seule intégration de publication citée sur leur page d'accueil.",
        },
        {
          label: 'Réponses IA',
          ours: 'Une vérification mensuelle automatique dans ChatGPT, Gemini et Google AI.',
          theirs:
            'Starter, Basic et Growth suivent ChatGPT, Gemini et Google AI Overviews, avec des réponses actualisées chaque jour. Les neuf plateformes — dont Perplexity, Claude, Grok et Microsoft Copilot — sont sur Enterprise.',
        },
        {
          label: 'Suivi de positions dans Google',
          ours: 'Une vérification mensuelle de vos positions organiques dans Google.',
          theirs:
            "Leur page d'accueil cite Google Search Console et Keyword Planner parmi les intégrations. Nous n'avons pas trouvé de page décrivant un suivi de mots-clés classique.",
        },
        {
          label: "Google Maps et fiche d'établissement",
          ours: 'Des publications automatiques sur la fiche avec votre accord, et une vérification mensuelle de votre position dans Maps.',
          theirs: "Google Maps et la fiche d'établissement Google ne sont pas mentionnés sur leur page d'accueil.",
        },
        {
          label: 'Travail sur le site',
          ours: 'Certaines corrections sont appliquées par notre extension, sans code à lire.',
          theirs:
            "Un Action Center qui classe les occasions et propose une correction en un clic. Sur Starter, les exécutions automatiques sont indiquées « Limited access (10 trial runs) ».",
        },
        {
          label: "Période d'essai",
          ours: "Essai de 7 jours, sans carte bancaire, résiliation à tout moment.",
          theirs:
            "Le haut de leur page de tarifs indique « Start free. No credit card needed. » La durée de l'essai n'est pas précisée sur la page.",
        },
      ],
    },
    theirStrengths: {
      eyebrow: 'Quand Writesonic est le meilleur choix',
      title: 'Dans ces cas-là, prenez le leur',
      intro: 'Sur la présence dans les réponses IA, ce sont des spécialistes et nous ne le sommes pas. Au même tarif, ils la mesurent plus finement.',
      items: [
        {
          title: "Quand toute la question est de savoir si l'IA vous cite",
          body:
            'Pour les mêmes 79 dollars, ils suivent 50 prompts nommés et mesurent 50 réponses chaque jour dans ChatGPT, Gemini et Google AI Overviews. Notre vérification est mensuelle. Si c’est votre question centrale, leur réponse est plus détaillée que la nôtre.',
        },
        {
          title: 'Quand un ou deux moteurs ne suffisent pas',
          body:
            "Leur palier Enterprise couvre neuf plateformes, dont Perplexity, Claude, Grok et Microsoft Copilot. Nous en vérifions trois. Pour une marque mesurée sur tout le paysage de l'IA, c'est un écart réel.",
        },
        {
          title: 'Quand vous voulez essayer sans rien risquer',
          body:
            "Leur page indique « Start free. No credit card needed. » Nous ne demandons pas de carte non plus, mais notre essai est limité à sept jours ; leur page n'annonce pas de durée, vous aurez donc peut-être plus de temps pour vous faire une idée.",
        },
      ],
    },
    ourStrengths: {
      eyebrow: 'Quand nous convenons mieux',
      title: 'Quand le travail doit être fait, pas seulement mesuré',
      intro: 'Même tarif, répartition différente. Nous renonçons à la finesse de mesure pour couvrir davantage du travail lui-même.',
      items: [
        { title: 'Le volet local aussi', body: "Des publications sur votre fiche d'établissement Google avec votre accord, des brouillons de réponse aux avis, et une vérification mensuelle de votre position dans Google Maps." },
        { title: 'Shopify autant que WordPress', body: 'Une publication automatique sur les deux plateformes, avec le même rapport mensuel.' },
        { title: "Personne n'a à le piloter", body: 'Un plan de sujets mensuel que vous validez, puis tout tourne seul : aucun prompt à configurer, aucun tableau de bord à ouvrir.' },
        { title: 'Sept langues, hébreu compris', body: "Interface, contenu et rapports dans votre langue, et en Israël un tarif en shekels TVA comprise." },
      ],
    },
    faq: {
      eyebrow: 'Questions',
      title: 'Ce que l’on demande avant de choisir',
      items: [
        {
          q: 'Vous êtes tous les deux à 79 dollars. Quelle est la vraie différence ?',
          a: "Ce sur quoi le tarif se répartit. Le leur pèse surtout dans la mesure quotidienne de la façon dont les réponses IA vous citent, plus 15 articles par mois. Le même montant chez nous couvre la rédaction et la publication, les corrections sur le site, les publications sur votre fiche d'établissement Google, et une vérification mensuelle dans Google, dans Maps et dans les réponses IA. Si vous mesurez l'IA, prenez le leur. S'il y a du travail à faire, prenez le nôtre.",
        },
        {
          q: "Vérifiez-vous autant de plateformes d'IA qu'eux ?",
          a: "Non. Notre vérification automatique couvre ChatGPT, Gemini et Google AI, une fois par mois. Leurs forfaits actualisent les réponses chaque jour, et leur palier Enterprise atteint neuf plateformes.",
        },
        {
          q: 'Faites-vous Shopify ?',
          a: "Oui. Nous publions sur WordPress et sur Shopify. Sur leur page d'accueil, WordPress est la seule intégration de publication citée : si votre boutique est sur Shopify, cela vaut la peine de le leur demander avant de choisir.",
        },
      ],
    },
    close: { title: 'Voyez où en est votre site, sans inscription' },
  },

  it: {
    competitor: 'Writesonic',
    eyebrow: 'Go Top SEO a confronto con Writesonic',
    metaTitle: 'Go Top SEO a confronto con Writesonic | Confronto',
    metaDescription:
      'Due prodotti allo stesso prezzo di partenza di 79 dollari. Go Top SEO a confronto con Writesonic: su che cosa ciascuno li spende, che cosa viene misurato e quando Writesonic è la scelta giusta.',
    hero: {
      title: 'Gli stessi 79 dollari, due lavori diversi.',
      accent: 'La domanda è per che cosa',
      subtitle:
        "Il piano Starter di Writesonic costa 79 dollari al mese con fatturazione annuale, e noi partiamo da 79 dollari al mese più imposte. I loro soldi vanno soprattutto in una misurazione approfondita di come le risposte IA vi citano; i nostri si distribuiscono fra scrittura, pubblicazione, correzioni sul sito, il profilo dell'attività su Google e una verifica mensile su Google, su Maps e nelle risposte IA.",
    },
    table: {
      eyebrow: 'Il confronto',
      title: 'Che cosa fa ciascuno, secondo le pagine di Writesonic stessa',
      checkedOn: CHECKED,
      sources: SOURCES,
      rows: [
        {
          label: 'Prezzo',
          ours: 'Da 79 dollari al mese più imposte. In Israele, da 249 ILS al mese IVA inclusa.',
          theirs:
            'Starter 79 dollari al mese con fatturazione annuale, Basic 199, Growth 399 ed Enterprise su misura. La loro pagina dei prezzi non mostra alcun prezzo con fatturazione mensile.',
        },
        {
          label: "Che cosa comprende il piano d'ingresso",
          ours: "Tutte le aree sono già nel piano d'ingresso; ciò che cambia fra i piani è sulla pagina dei prezzi.",
          theirs:
            'Starter: 50 prompt monitorati, 50 risposte misurate ogni giorno, 15 articoli IA al mese, 10 analisi del sito da 100 pagine ciascuna, 1 utente e 1 progetto.',
        },
        {
          label: 'Chi scrive gli articoli',
          ours: 'Il sistema. Argomenti, testo, immagini e link interni, dopo la vostra approvazione.',
          theirs: 'Anche il loro sistema scrive. La pagina dei prezzi conta gli "AI articles" per piano: 15 al mese con Starter.',
        },
        {
          label: 'Pubblicazione sul sito',
          ours: 'Automatica su WordPress e su Shopify.',
          theirs: 'WordPress è l’unica integrazione di pubblicazione citata nella loro home page.',
        },
        {
          label: 'Risposte IA',
          ours: 'Una verifica mensile automatica su ChatGPT, Gemini e Google AI.',
          theirs:
            'Starter, Basic e Growth seguono ChatGPT, Gemini e Google AI Overviews, con risposte aggiornate ogni giorno. Tutte e nove le piattaforme — fra cui Perplexity, Claude, Grok e Microsoft Copilot — sono su Enterprise.',
        },
        {
          label: 'Monitoraggio delle posizioni su Google',
          ours: 'Una verifica mensile delle vostre posizioni organiche su Google.',
          theirs:
            'La loro home page cita Google Search Console e Keyword Planner fra le integrazioni. Non abbiamo trovato una pagina che descriva un monitoraggio classico delle parole chiave.',
        },
        {
          label: "Google Maps e profilo dell'attività",
          ours: 'Pubblicazioni automatiche sul profilo con il vostro consenso, e una verifica mensile della posizione su Maps.',
          theirs: "Google Maps e il profilo dell'attività su Google non sono citati nella loro home page.",
        },
        {
          label: 'Lavoro sul sito',
          ours: 'Alcune correzioni vengono applicate tramite il nostro plugin, senza codice da leggere.',
          theirs:
            'Un Action Center che ordina le opportunità e propone la correzione con un clic. Con Starter le esecuzioni automatiche risultano "Limited access (10 trial runs)".',
        },
        {
          label: 'Prova gratuita',
          ours: 'Prova di 7 giorni, senza carta di credito, disdetta in qualsiasi momento.',
          theirs:
            'In cima alla loro pagina dei prezzi si legge "Start free. No credit card needed." La durata della prova non è indicata nella pagina.',
        },
      ],
    },
    theirStrengths: {
      eyebrow: 'Quando Writesonic è la scelta migliore',
      title: 'In questi casi prendete il loro',
      intro: 'Sulla presenza dentro le risposte IA loro sono specialisti e noi no. Allo stesso prezzo, la misurano più a fondo.',
      items: [
        {
          title: 'Quando tutta la domanda è se l’IA vi cita',
          body:
            'Per gli stessi 79 dollari seguono 50 prompt specifici e misurano 50 risposte ogni giorno su ChatGPT, Gemini e Google AI Overviews. La nostra verifica è mensile. Se è quella la vostra domanda centrale, la loro risposta è più dettagliata della nostra.',
        },
        {
          title: 'Quando uno o due motori non bastano',
          body:
            "Il loro piano Enterprise copre nove piattaforme, fra cui Perplexity, Claude, Grok e Microsoft Copilot. Noi ne verifichiamo tre. Per un marchio misurato su tutto il panorama dell'IA, è una differenza reale.",
        },
        {
          title: 'Quando volete provare senza rischiare nulla',
          body:
            'La loro pagina dice "Start free. No credit card needed." Nemmeno noi chiediamo la carta, ma la nostra prova è limitata a sette giorni; la loro pagina non indica una durata, quindi potreste avere più tempo per farvi un’idea.',
        },
      ],
    },
    ourStrengths: {
      eyebrow: 'Quando siamo più adatti noi',
      title: 'Quando il lavoro va fatto, non solo misurato',
      intro: 'Stesso prezzo, distribuzione diversa. Rinunciamo alla profondità della misurazione per coprire di più il lavoro vero e proprio.',
      items: [
        { title: 'Anche il lato locale', body: "Pubblicazioni sul profilo dell'attività su Google con il vostro consenso, bozze di risposta alle recensioni e una verifica mensile della posizione su Google Maps." },
        { title: 'Shopify oltre a WordPress', body: 'Pubblicazione automatica su entrambe le piattaforme, con lo stesso report mensile.' },
        { title: 'Nessuno deve farlo funzionare', body: 'Un piano mensile di argomenti che approvate, e poi tutto gira da solo: nessun prompt da configurare, nessuna dashboard da aprire.' },
        { title: 'Sette lingue, ebraico compreso', body: 'Interfaccia, contenuti e report nella vostra lingua e, in Israele, un prezzo in shekel IVA inclusa.' },
      ],
    },
    faq: {
      eyebrow: 'Domande',
      title: 'Che cosa si chiede prima di decidere',
      items: [
        {
          q: 'Costate entrambi 79 dollari. Che cosa cambia davvero?',
          a: "Su che cosa si distribuisce il prezzo. Il loro pesa soprattutto sulla misurazione quotidiana di come le risposte IA vi citano, più 15 articoli al mese. La stessa cifra da noi copre scrittura e pubblicazione, correzioni sul sito, pubblicazioni sul profilo dell'attività su Google e una verifica mensile su Google, su Maps e nelle risposte IA. Se state misurando l'IA, prendete il loro. Se c'è lavoro da fare, prendete il nostro.",
        },
        {
          q: 'Verificate tante piattaforme IA quante loro?',
          a: 'No. La nostra verifica automatica copre ChatGPT, Gemini e Google AI, una volta al mese. I loro piani aggiornano le risposte ogni giorno, e il piano Enterprise arriva a nove piattaforme.',
        },
        {
          q: 'Lavorate con Shopify?',
          a: 'Sì. Pubblichiamo su WordPress e su Shopify. Nella loro home page WordPress è l’unica integrazione di pubblicazione citata: se il vostro negozio è su Shopify, conviene chiederlo a loro prima di decidere.',
        },
      ],
    },
    close: { title: 'Guardate a che punto è il sito, senza registrarvi' },
  },
  ja: {
    competitor: 'Writesonic',
    eyebrow: 'Go Top SEOとWritesonicの比較',
    metaTitle: 'Go Top SEOとWritesonicの比較 | 比較',
    metaDescription:
      '開始料金が同じ79ドルの2つの製品です。Go Top SEOとWritesonicの比較として、その79ドルが何に使われるのか、何が計測されるのか、そしてWritesonicのほうが適しているのはどのような場合かをまとめました。',
    hero: {
      title: '同じ79ドルで、仕事の中身が違います。',
      accent: '問いは、何のための79ドルかです',
      subtitle:
        'WritesonicのStarterは年払いで月額79ドル、当社は月額79ドルから（税別）です。同社の料金は主に、AIの回答が自分をどう取り上げるかを深く計測することに向かいます。当社の料金は、執筆、公開、サイトへの修正、Googleビジネスプロフィール、そしてGoogle、マップ、AIの回答についての月に一度の計測に広く分かれます。',
    },
    table: {
      eyebrow: '比較',
      title: 'Writesonic自身のページに書かれている内容にもとづく、それぞれの役割',
      checkedOn: CHECKED,
      sources: SOURCES,
      rows: [
        {
          label: '料金',
          ours: '月額79ドルから（税別）。イスラエルでは月額249シェケルから（付加価値税込み）。',
          theirs:
            'Starterは年払いで月額79ドル、Basicは199ドル、Growthは399ドル、Enterpriseは個別見積もりです。同社の料金ページには月払いの価格は表示されていません。',
        },
        {
          label: '入口のプランに含まれるもの',
          ours: 'すべての領域が最初のプランに入っています。プランごとに変わる点は料金ページに書かれています。',
          theirs:
            'Starterは、追跡するプロンプト50件、毎日追跡する回答50件、AIによる記事は月15本、100ページまでのサイト監査を月10回、利用者1名、プロジェクト1件です。',
        },
        {
          label: '記事を書くのは誰か',
          ours: 'システムです。題材、本文、画像、内部リンクを、ご承認のあとに用意します。',
          theirs: '同社のシステムも書きます。料金ページはプランごとに「AI articles」の本数を区切っており、Starterでは月15本です。',
        },
        {
          label: 'サイトへの公開',
          ours: 'WordPressとShopifyへ自動で公開します。',
          theirs: '同社のトップページで公開先として名前が挙がっている連携はWordPressだけです。',
        },
        {
          label: 'AIの回答',
          ours: 'ChatGPT、Gemini、Google AIについて、自動で月に一度計測します。',
          theirs:
            'Starter、Basic、GrowthのいずれもChatGPT、Gemini、Google AI Overviewsを対象にし、回答は毎日更新されます。Perplexity、Claude、Grok、Microsoft Copilotを含む9つのプラットフォームすべてはEnterpriseです。',
        },
        {
          label: 'Googleでの順位の計測',
          ours: 'Googleでの自然検索の順位を月に一度確認します。',
          theirs:
            '同社のトップページには、連携としてGoogle Search ConsoleとKeyword Plannerが挙げられています。一般的なキーワード順位計測ツールを説明するページは見つかりませんでした。',
        },
        {
          label: 'GoogleマップとGoogleビジネスプロフィール',
          ours: 'ご同意のうえでプロフィールへ自動で投稿し、マップでの位置を月に一度計測します。',
          theirs: 'GoogleマップとGoogleビジネスプロフィールについては、同社のトップページには書かれていません。',
        },
        {
          label: 'サイトへの作業',
          ours: '修正の一部は当社の拡張機能から適用され、コードを読む必要はありません。',
          theirs:
            '取り組むべき点を並べ、ワンクリックでの修正を示すAction Centerがあります。Starterでは自動実行は「Limited access (10 trial runs)」と記載されています。',
        },
        {
          label: 'トライアル',
          ours: '7日間、クレジットカード不要、いつでも解約できます。',
          theirs:
            '同社の料金ページの上部には「Start free. No credit card needed.」とあります。トライアルの期間はページのどこにも書かれていません。',
        },
      ],
    },
    theirStrengths: {
      eyebrow: 'Writesonicのほうがよい場合',
      title: 'こうした場合は同社を選んでください',
      intro: 'AIの回答の中での見え方については、同社が専門で、当社はそうではありません。同じ料金で、同社のほうが深く計測します。',
      items: [
        {
          title: '問いのすべてが「AIが自分に触れるか」である場合',
          body:
            '同じ79ドルで、同社は指定したプロンプト50件を追い、ChatGPT、Gemini、Google AI Overviewsにまたがって毎日50件の回答を計測します。当社の確認は月に一度です。それが中心の問いであれば、同社の答えのほうが細かいです。',
        },
        {
          title: '1つや2つのエンジンでは足りない場合',
          body:
            '同社のEnterpriseはPerplexity、Claude、Grok、Microsoft Copilotを含む9つのプラットフォームを対象にします。当社は3つを確認します。AIの世界全体にまたがって見られるブランドにとって、これは実際の差です。',
        },
        {
          title: '何も賭けずに試したい場合',
          body:
            '同社のページには「Start free. No credit card needed.」とあります。当社もカードは求めませんが、トライアルは7日間で区切られます。同社のページには期間が書かれていないため、判断するための時間はより長く取れるかもしれません。',
        },
      ],
    },
    ourStrengths: {
      eyebrow: '当社のほうが適している場合',
      title: '計測だけでなく、作業そのものが終わらなければならない場合',
      intro: '料金は同じで、配り方が違います。当社は計測の深さを譲って、作業そのものをより広く引き受けます。',
      items: [
        { title: '地域の側も', body: 'ご同意のうえでGoogleビジネスプロフィールへ投稿し、口コミへの返信の下書きを用意し、Googleマップでの位置を月に一度確認します。' },
        { title: 'WordPressだけでなくShopifyも', body: '両方のプラットフォームへ自動で公開し、月のレポートも同じものです。' },
        { title: '誰も運用しなくてよい', body: '月に一度、題材の計画をご承認いただいたあとは、そのまま動きます。設定するプロンプトも、開くダッシュボードもありません。' },
        { title: '7つの言語、ヘブライ語も', body: '画面、コンテンツ、レポートをご自身の言語で用意し、イスラエルでは付加価値税込みのシェケル建ての価格です。' },
      ],
    },
    faq: {
      eyebrow: 'よくある質問',
      title: '決める前によく聞かれること',
      items: [
        {
          q: 'どちらも79ドルです。実際の違いは何ですか',
          a: '料金が何に配られるかです。同社の料金の多くは、AIの回答が自分をどう取り上げるかを毎日計測することと、月15本の記事に向かいます。当社では同じ金額が、執筆と公開、サイトへの修正、Googleビジネスプロフィールへの投稿、そしてGoogle、マップ、AIの回答についての月に一度の計測に充てられます。AIを計測したいのであれば同社、作業を終わらせたいのであれば当社です。',
        },
        {
          q: 'AIのプラットフォームは同社と同じ数を確認しますか',
          a: 'いいえ。当社の自動の確認はChatGPT、Gemini、Google AIの3つで、月に一度です。同社のプランは回答を毎日更新し、Enterpriseでは9つのプラットフォームに届きます。',
        },
        {
          q: 'Shopifyには対応していますか',
          a: 'はい。当社はWordPressとShopifyへ公開します。同社のトップページで公開先として名前が挙がっている連携はWordPressだけなので、ストアがShopifyであれば、決める前に同社に確かめる価値があります。',
        },
      ],
    },
    close: { title: 'サイトの現状を、登録なしで確認する' },
  },
}
