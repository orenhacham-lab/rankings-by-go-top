/**
 * Go Top SEO compared with Booster SEO, in every language the public site speaks.
 *
 * WHY THIS PAGE EXISTS, AND WHY IT NAMES AVADA TOO. The demand research
 * (growth/competitor-facts.md, STEP 1) measured Google Autocomplete for the
 * Shopify apps and found that `booster seo vs`, `avada seo vs` and `seoant vs`
 * return NOTHING, while `best shopify seo app` autocompletes richly and
 * `best ai seo app for shopify` appears unprompted. The demand here is
 * category-shaped, not brand-shaped. So this is one page, not three: Booster is
 * the named competitor because it is the largest single listing, and Avada is
 * named inside the table and the FAQ as the other app a merchant is weighing.
 *
 * THE READING RULE THIS FILE OBEYS. These apps are cheaper than us, install in
 * about a minute, bill through Shopify with no new card, and both have a real
 * free tier and thousands of merchant reviews. `theirStrengths` says that
 * first, including the one job they are simply better at than us: image
 * compression, lazy loading and Core Web Vitals work at catalogue scale, which
 * we do not do at all.
 *
 * Three things are deliberately NOT claimed:
 *
 *   - Nothing says either app cannot write articles. Avada's listing names
 *     "blog posts" under onpage SEO without describing the scope, so the copy
 *     says only what the listings describe.
 *   - Nothing says they do not track rankings. The verified fact is narrower:
 *     their listings describe no rank tracking in Google, Maps or AI answers,
 *     and Booster's Premium plan surfaces Search Console metrics, which is
 *     Google's own data rather than a rank tracker.
 *   - Nothing blurs AI readiness into AI measurement. Booster prepares a store
 *     for AI search with LLMs.txt, Schema.org markup and AI-oriented meta tags.
 *     That is optimisation. Our monthly check is measurement. Two different
 *     things, and the table keeps them apart.
 *
 * Ratings and review counts move weekly, so they are date-stamped by the
 * table's `checkedOn` like every other claim, and they were re-read on the day
 * this page was written.
 */
import type { PublicLocale } from '@/lib/i18n/locales'
import type { ComparisonCopy } from './types'

const CHECKED = '2026-11-11'

const SOURCES = [
  { label: 'apps.shopify.com — Booster AI SEO + AEO Optimizer', href: 'https://apps.shopify.com/booster-apps-seo-optimizer' },
  { label: 'apps.shopify.com — Avada AI SEO Image Optimizer', href: 'https://apps.shopify.com/avada-seo-suite' },
]

export const BOOSTER_COMPARE: Record<PublicLocale, ComparisonCopy> = {
  he: {
    competitor: 'Booster SEO',
    eyebrow: 'Go Top SEO מול Booster SEO',
    metaTitle: 'Go Top SEO מול Booster SEO | השוואה לאפליקציות ה-SEO של שופיפיי',
    metaDescription:
      'אפליקציית SEO לשופיפיי מסדרת את החנות. השוואה בין Go Top SEO לבין Booster SEO ו-Avada: מה כל אחד מתקן, מה נכתב, מה נמדד, ומתי אפליקציה בחינם היא הקנייה הנכונה.',
    hero: {
      title: 'האפליקציה מסדרת את החנות.',
      accent: 'מישהו עוד צריך למלא אותה',
      subtitle:
        'Booster ו-Avada מתקנים תגיות, קישורים שבורים ותמונות בחנות שופיפיי, יש להם מסלול חינמי והם מתחילים בעשרות דולרים. אנחנו עושים עבודה אחרת באותה חנות: כותבים ומפרסמים מאמרים, מפרסמים לפרופיל העסקי בגוגל, ומודדים פעם בחודש איפה החנות עומדת בגוגל, במפות גוגל ובתשובות AI.',
    },
    table: {
      eyebrow: 'ההשוואה',
      title: 'מה כל אחד עושה, לפי הרישומים של האפליקציות עצמן בחנות של שופיפיי',
      checkedOn: CHECKED,
      sources: SOURCES,
      rows: [
        {
          label: 'מחיר',
          ours: 'מ-79 דולר לחודש בתוספת מס. בישראל, מ-249 ש״ח לחודש כולל מע״מ.',
          theirs:
            'Booster: מסלול חינמי, Pro ב-39 דולר לחודש, Premium ב-69 דולר לחודש. Avada: מסלול חינמי, Pro ב-34.95 דולר לחודש, Enterprise ב-99 דולר לחודש.',
        },
        {
          label: 'מסלול חינמי ותקופת ניסיון',
          ours: '7 ימי ניסיון, בלי כרטיס אשראי, ביטול בכל רגע. אין מסלול חינמי קבוע.',
          theirs:
            'לשתיהן יש מסלול חינמי קבוע. במסלולים בתשלום: 14 ימי ניסיון ב-Booster, 7 ימים ב-Avada. החיוב עובר דרך חשבון שופיפיי הקיים, בלי כרטיס חדש.',
        },
        {
          label: 'תיקונים בחנות עצמה',
          ours: 'חלק מהתיקונים מוחלים דרך התוסף שלנו, באישורכם, בלי קוד לקרוא.',
          theirs:
            'Booster מתאר תיקונים אוטומטיים של תגיות וקישורים שבורים במסלול Pro, כולל ניטור מתמשך. Avada מתארת רשימת תיקונים שמוחלת על העמודים ועל התבנית.',
        },
        {
          label: 'תמונות ומהירות',
          ours: 'אנחנו לא דוחסים תמונות ולא עובדים על מהירות החנות. זה לא חלק מהמוצר.',
          theirs:
            'זו החוזקה שלהן. Booster: דחיסת תמונות עם 5GB אחסון בחודש ושמות קבצים אוטומטיים ב-Premium. Avada: אופטימיזציית תמונות ושיפור מהירות בכל המסלולים.',
        },
        {
          label: 'מי כותב את המאמרים',
          ours: 'המערכת. נושאים, טקסט, תמונות וקישורים פנימיים, אחרי שאתם מאשרים.',
          theirs:
            'ברישום של Booster לא מופיעה כתיבת מאמרים או בלוג בין התכונות ובמסלולים. הרישום של Avada מונה "blog posts" תחת onpage SEO בלי לתאר את ההיקף.',
        },
        {
          label: 'פרסום לחנות ולאתר',
          ours: 'פרסום אוטומטי לשופיפיי וגם לוורדפרס, מאותה תוכנית תוכן.',
          theirs: 'שתי האפליקציות עובדות על חנות שופיפיי.',
        },
        {
          label: 'מעקב מיקומים בגוגל',
          ours: 'בדיקה חודשית במיקומים האורגניים בגוגל.',
          theirs:
            'במסלול Premium של Booster מוצגים נתוני Google Search Console עם היסטוריה של 365 ימים — אלה הנתונים של גוגל עצמה. הרישומים שלהן אינם מתארים מעקב מיקומים בגוגל, במפות או בתשובות AI.',
        },
        {
          label: 'גוגל מפות והפרופיל העסקי',
          ours: 'פוסטים אוטומטיים לפרופיל באישורכם, טיוטות תשובה לביקורות, ובדיקה חודשית של המיקום במפות גוגל.',
          theirs: 'הפרופיל העסקי בגוגל, הביקורות והמפות אינם מוזכרים ברישומים של שתי האפליקציות.',
        },
        {
          label: 'תשובות AI',
          ours: 'בדיקה חודשית אוטומטית ב-ChatGPT, ב-Gemini וב-Google AI.',
          theirs:
            'Booster מכינה את החנות לחיפוש AI: LLMs.txt, סימון Schema.org ותגיות שמכוונות למנועי AI. זו הכנה. מדידה של מה שהמנועים עונים בפועל אינה מתוארת ברישום.',
        },
        {
          label: 'דוחות',
          ours: 'דוח חודשי אחד שמרכז את העבודה שבוצעה ואת המיקומים שנמדדו.',
          theirs:
            'Booster: לוח דוחות, סיכום שבועי במייל והיסטוריית תיקונים; דוחות PDF ב-Premium. Avada: בדיקות onpage, ללא הגבלה במסלול Pro.',
        },
      ],
    },
    theirStrengths: {
      eyebrow: 'מתי אפליקציית שופיפיי היא הקנייה הנכונה',
      title: 'במקרים האלה קחו אותן, לא אותנו',
      intro: 'הן זולות יותר, מותקנות בדקה, ובעבודת התחזוקה של קטלוג גדול הן פשוט טובות יותר מאיתנו.',
      items: [
        {
          title: 'כשהבעיה היא היגיינה של הקטלוג',
          body:
            'אם לעמודי המוצר אין תיאורי מטא, יש קישורים שבורים והתמונות כבדות, אפליקציה במסלול חינמי או ב-39 דולר היא הקנייה הנכונה והוגן להגיד את זה. Booster מתקנת תגיות וקישורים ברקע בלי לשאול, ו-Avada מטפלת בתמונות ובמהירות על אלפי מוצרים. אנחנו לא עושים את עבודת התמונות והמהירות בכלל.',
        },
        {
          title: 'כשרוצים להתחיל בלי להתחייב',
          body:
            'לשתיהן יש מסלול חינמי קבוע, לא רק ניסיון. ההתקנה לוקחת כדקה, החיוב עובר דרך חשבון שופיפיי הקיים ואין כרטיס חדש ואין חשבון חדש לפתוח. אצלנו יש שבעה ימי ניסיון בלי כרטיס, ואחריהם זה מוצר בתשלום.',
        },
        {
          title: 'כשרוצים מוצר עם המון משתמשים מאחוריו',
          body:
            'ב-11.11.2026 הרישום של Booster הראה דירוג 4.8 מתוך 5,485 חוות דעת, ו-Avada 4.9 מתוך 4,692. אלה סוחרים שהתקינו, נשארו וכתבו. לנו אין היקף כזה של חוות דעת בחנות של שופיפיי, וזה שיקול לגיטימי כשבוחרים.',
        },
      ],
    },
    ourStrengths: {
      eyebrow: 'מתי אנחנו מתאימים יותר',
      title: 'כשצריך שמישהו ימלא את החנות ויבדוק אם זה עבד',
      intro: 'האפליקציות מסדרות את מה שקיים. אנחנו מוסיפים תוכן חדש, את הצד המקומי, ומדידה.',
      items: [
        { title: 'תוכן שנכתב ומתפרסם', body: 'תוכנית נושאים חודשית שאתם מאשרים, ואז מאמרים עם תמונות וקישורים פנימיים מתפרסמים לחנות לבד.' },
        { title: 'הפרופיל העסקי בגוגל', body: 'פוסטים לפרופיל באישורכם וטיוטות תשובה לביקורות, מה שחשוב לחנות עם מיקום פיזי או שירות מקומי.' },
        { title: 'מדידה חודשית, לא רק אופטימיזציה', body: 'בדיקה חודשית של המיקומים בגוגל, במפות גוגל ובתשובות של ChatGPT, Gemini ו-Google AI.' },
        { title: 'גם וורדפרס, ובאחת עשרה שפות', body: 'אם יש לכם גם אתר וורדפרס, אותה תוכנית תוכן מפרסמת לשניהם. הממשק והדוחות בשפה שלכם, ובישראל מחיר בשקלים כולל מע״מ.' },
      ],
    },
    faq: {
      eyebrow: 'שאלות',
      title: 'מה שואלים לפני שמחליטים',
      items: [
        {
          q: 'אפשר להשאיר את האפליקציה ולהוסיף אותכם?',
          a: 'כן, וזה שילוב הגיוני. האפליקציה מטפלת בתגיות, בקישורים השבורים ובתמונות, ואנחנו מוסיפים את המאמרים, הפרופיל העסקי בגוגל והמדידה החודשית. אין התנגשות: אנחנו לא דוחסים תמונות והן לא כותבות מאמרים לפי תוכנית תוכן.',
        },
        {
          q: 'אתם מטפלים במהירות החנות ובתמונות?',
          a: 'לא. זה לא חלק מהמוצר שלנו, ואם זו הבעיה המרכזית שלכם אפליקציה כזו תפתור אותה טוב יותר ובפחות כסף. אנחנו עוסקים בתוכן, בצד המקומי ובמדידה.',
        },
        {
          q: 'ומה לגבי Avada? היא זולה יותר.',
          a: 'נכון, ה-Pro שלה 34.95 דולר לחודש ויש לה מסלול חינמי. היא חזקה בתמונות, במהירות ובבדיקות onpage. הרישום שלה מזכיר "blog posts" תחת onpage SEO בלי לתאר את ההיקף, ולכן כדאי לשאול אותם ישירות אם אתם מחפשים כתיבה ופרסום מתמשכים.',
        },
      ],
    },
    close: { title: 'בדקו איפה החנות עומדת, בלי להירשם' },
  },

  en: {
    competitor: 'Booster SEO',
    eyebrow: 'Go Top SEO vs Booster SEO',
    metaTitle: 'Go Top SEO vs Booster SEO | The Shopify SEO apps compared',
    metaDescription:
      'A Shopify SEO app tidies the store. Go Top SEO compared with Booster SEO and Avada: what each one fixes, what gets written, what gets measured, and when a free app is the right buy.',
    hero: {
      title: 'The app tidies the store.',
      accent: 'Someone still has to fill it',
      subtitle:
        'Booster and Avada fix meta tags, broken links and images on a Shopify store, both have a free plan and both start in the tens of dollars. We do a different job on the same store: we write and publish articles, post to your Google Business Profile, and check once a month where the store stands in Google, Google Maps and AI answers.',
    },
    table: {
      eyebrow: 'The comparison',
      title: "What each one does, taken from the apps' own Shopify App Store listings",
      checkedOn: CHECKED,
      sources: SOURCES,
      rows: [
        {
          label: 'Price',
          ours: 'From $79 a month plus tax. In Israel, from 249 ILS a month including VAT.',
          theirs:
            'Booster: a free plan, Pro $39 a month, Premium $69 a month. Avada: a free plan, Pro $34.95 a month, Enterprise $99 a month.',
        },
        {
          label: 'Free plan and trial',
          ours: 'A 7-day trial, no credit card, cancel anytime. There is no permanent free plan.',
          theirs:
            'Both have a permanent free plan. On the paid plans: a 14-day trial on Booster, 7 days on Avada. Billing runs through the existing Shopify account, with no new card.',
        },
        {
          label: 'Fixes on the store itself',
          ours: 'Some fixes are applied through our plugin, with your approval and no code to read.',
          theirs:
            "Booster describes automatic meta-tag and broken-link fixes on Pro, with continuous monitoring. Avada describes a checklist of fixes applied across the pages and the theme.",
        },
        {
          label: 'Images and speed',
          ours: 'We do not compress images and we do not work on store speed. It is not part of the product.',
          theirs:
            'This is their strength. Booster: image compression with 5GB of storage a month and automatic filenames on Premium. Avada: image optimisation and a speed booster on every plan.',
        },
        {
          label: 'Who writes the articles',
          ours: 'The system. Topics, text, images and internal links, after you approve.',
          theirs:
            'No blog or article writing appears among the features and plans in Booster\'s listing. Avada\'s listing names "blog posts" under onpage SEO without describing the scope.',
        },
        {
          label: 'Publishing to the store and the site',
          ours: 'Automatic publishing to Shopify and to WordPress, from the same content plan.',
          theirs: 'Both apps work on a Shopify store.',
        },
        {
          label: 'Google rank tracking',
          ours: 'A monthly check of your organic positions in Google.',
          theirs:
            "Booster's Premium plan surfaces Google Search Console metrics with 365-day history — that is Google's own data. Their listings describe no rank tracking in Google, in Maps or in AI answers.",
        },
        {
          label: 'Google Maps and Business Profile',
          ours: 'Automatic posts to the profile with your consent, drafted replies to reviews, and a monthly check of your position in Google Maps.',
          theirs: 'Google Business Profile, reviews and Maps are not mentioned in either listing.',
        },
        {
          label: 'AI answers',
          ours: 'An automatic monthly check in ChatGPT, Gemini and Google AI.',
          theirs:
            'Booster prepares the store for AI search: LLMs.txt, Schema.org markup and AI-oriented meta tags. That is preparation. Measuring what the engines actually answer is not described in the listing.',
        },
        {
          label: 'Reports',
          ours: 'One monthly report covering the work done and the positions measured.',
          theirs:
            'Booster: a reports dashboard, a weekly email summary and fix history; PDF reports on Premium. Avada: onpage audits, unlimited on Pro.',
        },
      ],
    },
    theirStrengths: {
      eyebrow: 'When a Shopify app is the right buy',
      title: 'In these cases take theirs, not ours',
      intro: 'They are cheaper, they install in a minute, and on the maintenance work of a large catalogue they are simply better than us.',
      items: [
        {
          title: 'When the problem is catalogue hygiene',
          body:
            'If your product pages have no meta descriptions, you have broken links and your images are heavy, an app on a free plan or at $39 is the right purchase and it is fair to say so. Booster fixes tags and links in the background without asking, and Avada handles images and speed across thousands of products. We do not do the image and speed work at all.',
        },
        {
          title: 'When you want to start without committing',
          body:
            'Both have a permanent free plan, not only a trial. Installing takes about a minute, billing runs through the Shopify account you already have, and there is no new card and no new account to open. We give seven days with no card, and after that it is a paid product.',
        },
        {
          title: 'When you want a product with many merchants behind it',
          body:
            "On 2026-11-11 Booster's listing showed 4.8 out of 5,485 reviews and Avada 4.9 out of 4,692. Those are merchants who installed, stayed and wrote. We do not have that volume of reviews on the Shopify App Store, and that is a legitimate thing to weigh.",
        },
      ],
    },
    ourStrengths: {
      eyebrow: 'When we fit better',
      title: 'When someone has to fill the store and check whether it worked',
      intro: 'The apps tidy what is already there. We add new content, the local side, and measurement.',
      items: [
        { title: 'Content written and published', body: 'A monthly topic plan you approve, and then articles with images and internal links publish to the store by themselves.' },
        { title: 'Your Google Business Profile', body: 'Posts to the profile with your consent and drafted replies to reviews, which matters for a store with a physical location or a local service.' },
        { title: 'Monthly measurement, not only optimisation', body: 'A monthly check of your positions in Google, in Google Maps and in the answers from ChatGPT, Gemini and Google AI.' },
        { title: 'WordPress too, in eleven languages', body: 'If you also run a WordPress site, the same content plan publishes to both. Interface and reports in your language, and in Israel a price in shekels with VAT included.' },
      ],
    },
    faq: {
      eyebrow: 'Questions',
      title: 'What people ask before deciding',
      items: [
        {
          q: 'Can I keep the app and add you?',
          a: 'Yes, and it is a sensible combination. The app handles tags, broken links and images, and we add the articles, the Google Business Profile and the monthly measurement. There is no clash: we do not compress images, and they do not write articles against a content plan.',
        },
        {
          q: 'Do you handle store speed and images?',
          a: 'No. It is not part of our product, and if that is your main problem an app like these will solve it better and for less money. Our work is content, the local side and measurement.',
        },
        {
          q: 'What about Avada? It is cheaper.',
          a: 'It is — Pro is $34.95 a month and it has a free plan. It is strong on images, speed and onpage audits. Its listing mentions "blog posts" under onpage SEO without describing the scope, so if you want ongoing writing and publishing it is worth asking them directly.',
        },
      ],
    },
    close: { title: 'See where your store stands, without signing up' },
  },

  es: {
    competitor: 'Booster SEO',
    eyebrow: 'Go Top SEO frente a Booster SEO',
    metaTitle: 'Go Top SEO frente a Booster SEO | Comparativa de apps SEO de Shopify',
    metaDescription:
      'Una app SEO de Shopify ordena la tienda. Go Top SEO comparado con Booster SEO y Avada: qué corrige cada uno, qué se escribe, qué se mide y cuándo una app gratuita es la compra correcta.',
    hero: {
      title: 'La app ordena la tienda.',
      accent: 'Alguien todavía tiene que llenarla',
      subtitle:
        'Booster y Avada corrigen metaetiquetas, enlaces roto y imágenes en una tienda Shopify, las dos tienen plan gratuito y empiezan en decenas de dólares. Nosotros hacemos otro trabajo en la misma tienda: escribimos y publicamos artículos, publicamos en tu Perfil de Empresa de Google y comprobamos una vez al mes dónde está la tienda en Google, en Google Maps y en las respuestas de IA.',
    },
    table: {
      eyebrow: 'La comparativa',
      title: 'Qué hace cada uno, según las propias fichas de las apps en la tienda de Shopify',
      checkedOn: CHECKED,
      sources: SOURCES,
      rows: [
        {
          label: 'Precio',
          ours: 'Desde 79 dólares al mes más impuestos. En Israel, desde 249 ILS al mes con IVA incluido.',
          theirs:
            'Booster: plan gratuito, Pro 39 dólares al mes, Premium 69 dólares al mes. Avada: plan gratuito, Pro 34,95 dólares al mes, Enterprise 99 dólares al mes.',
        },
        {
          label: 'Plan gratuito y prueba',
          ours: 'Prueba de 7 días, sin tarjeta, cancelas cuando quieras. No hay plan gratuito permanente.',
          theirs:
            'Las dos tienen plan gratuito permanente. En los planes de pago: 14 días de prueba en Booster y 7 días en Avada. El cobro pasa por la cuenta de Shopify que ya tienes, sin tarjeta nueva.',
        },
        {
          label: 'Correcciones en la propia tienda',
          ours: 'Parte de las correcciones se aplican con nuestro plugin, con tu aprobación y sin código que leer.',
          theirs:
            'Booster describe correcciones automáticas de metaetiquetas y enlaces roto en Pro, con monitorización continua. Avada describe una lista de correcciones que se aplica a las páginas y a la plantilla.',
        },
        {
          label: 'Imágenes y velocidad',
          ours: 'No comprimimos imágenes ni trabajamos la velocidad de la tienda. No forma parte del producto.',
          theirs:
            'Aquí está su fuerza. Booster: compresión de imágenes con 5GB de almacenamiento al mes y nombres de archivo automáticos en Premium. Avada: optimización de imágenes y acelerador de velocidad en todos los planes.',
        },
        {
          label: 'Quién escribe los artículos',
          ours: 'El sistema. Temas, texto, imágenes y enlaces internos, después de que lo apruebes.',
          theirs:
            'En la ficha de Booster no aparece la redacción de artículos ni de blog entre las funciones y los planes. La ficha de Avada menciona "blog posts" dentro del SEO onpage sin describir el alcance.',
        },
        {
          label: 'Publicación en la tienda y en el sitio',
          ours: 'Publicación automática en Shopify y en WordPress, desde el mismo plan de contenidos.',
          theirs: 'Las dos apps trabajan sobre una tienda Shopify.',
        },
        {
          label: 'Seguimiento de posiciones en Google',
          ours: 'Una comprobación mensual de tus posiciones orgánicas en Google.',
          theirs:
            'El plan Premium de Booster muestra métricas de Google Search Console con 365 días de historial, que son datos de Google. Sus fichas no describen seguimiento de posiciones en Google, en Maps ni en las respuestas de IA.',
        },
        {
          label: 'Google Maps y Perfil de Empresa',
          ours: 'Publicaciones automáticas en el perfil con tu consentimiento, borradores de respuesta a las reseñas y una comprobación mensual de tu posición en Google Maps.',
          theirs: 'El Perfil de Empresa de Google, las reseñas y Maps no se mencionan en ninguna de las dos fichas.',
        },
        {
          label: 'Respuestas de IA',
          ours: 'Una comprobación automática mensual en ChatGPT, Gemini y Google AI.',
          theirs:
            'Booster prepara la tienda para la búsqueda con IA: LLMs.txt, marcado Schema.org y metaetiquetas orientadas a la IA. Eso es preparación. Medir lo que los motores responden de verdad no se describe en la ficha.',
        },
        {
          label: 'Informes',
          ours: 'Un informe mensual con el trabajo hecho y las posiciones medidas.',
          theirs:
            'Booster: panel de informes, resumen semanal por correo e historial de correcciones; informes en PDF en Premium. Avada: auditorías onpage, ilimitadas en Pro.',
        },
      ],
    },
    theirStrengths: {
      eyebrow: 'Cuándo una app de Shopify es la compra correcta',
      title: 'En estos casos elige la suya, no la nuestra',
      intro: 'Son más baratas, se instalan en un minuto y en el mantenimiento de un catálogo grande son simplemente mejores que nosotros.',
      items: [
        {
          title: 'Cuando el problema es la higiene del catálogo',
          body:
            'Si tus páginas de producto no tienen meta descripciones, tienes enlaces roto y las imágenes pesan mucho, una app en plan gratuito o de 39 dólares es la compra correcta y es justo decirlo. Booster corrige etiquetas y enlaces en segundo plano sin preguntar, y Avada se ocupa de imágenes y velocidad en miles de productos. Nosotros no hacemos ese trabajo de imágenes y velocidad.',
        },
        {
          title: 'Cuando quieres empezar sin comprometerte',
          body:
            'Las dos tienen plan gratuito permanente, no solo prueba. Instalarlas tarda un minuto, el cobro pasa por la cuenta de Shopify que ya tienes y no hay tarjeta nueva ni cuenta nueva que abrir. Nosotros damos siete días sin tarjeta y después es un producto de pago.',
        },
        {
          title: 'Cuando quieres un producto con muchos comerciantes detrás',
          body:
            'El 11-11-2026 la ficha de Booster mostraba 4,8 sobre 5.485 reseñas y Avada 4,9 sobre 4.692. Son comerciantes que instalaron, se quedaron y escribieron. Nosotros no tenemos ese volumen de reseñas en la tienda de apps de Shopify, y eso es algo legítimo de valorar.',
        },
      ],
    },
    ourStrengths: {
      eyebrow: 'Cuándo encajamos mejor',
      title: 'Cuando alguien tiene que llenar la tienda y comprobar si funcionó',
      intro: 'Las apps ordenan lo que ya existe. Nosotros añadimos contenido nuevo, el lado local y la medición.',
      items: [
        { title: 'Contenido escrito y publicado', body: 'Un plan mensual de temas que tú apruebas, y después los artículos con imágenes y enlaces internos se publican solos en la tienda.' },
        { title: 'Tu Perfil de Empresa de Google', body: 'Publicaciones en el perfil con tu consentimiento y borradores de respuesta a las reseñas, algo que importa en una tienda con local físico o servicio local.' },
        { title: 'Medición mensual, no solo optimización', body: 'Una comprobación mensual de tus posiciones en Google, en Google Maps y en las respuestas de ChatGPT, Gemini y Google AI.' },
        { title: 'También WordPress, en once idiomas', body: 'Si además tienes un sitio WordPress, el mismo plan de contenidos publica en los dos. Interfaz e informes en tu idioma.' },
      ],
    },
    faq: {
      eyebrow: 'Preguntas',
      title: 'Lo que se pregunta antes de decidir',
      items: [
        {
          q: '¿Puedo quedarme con la app y añadiros a vosotros?',
          a: 'Sí, y es una combinación razonable. La app se ocupa de etiquetas, enlaces roto e imágenes, y nosotros añadimos los artículos, el Perfil de Empresa de Google y la medición mensual. No hay choque: nosotros no comprimimos imágenes y ellas no escriben artículos siguiendo un plan de contenidos.',
        },
        {
          q: '¿Os ocupáis de la velocidad de la tienda y de las imágenes?',
          a: 'No. No forma parte de nuestro producto, y si ese es tu problema principal una app así lo resolverá mejor y por menos dinero. Nuestro trabajo es el contenido, el lado local y la medición.',
        },
        {
          q: '¿Y Avada? Es más barata.',
          a: 'Lo es: Pro cuesta 34,95 dólares al mes y tiene plan gratuito. Es fuerte en imágenes, velocidad y auditorías onpage. Su ficha menciona "blog posts" dentro del SEO onpage sin describir el alcance, así que si buscas redacción y publicación continuas conviene preguntárselo directamente.',
        },
      ],
    },
    close: { title: 'Mira dónde está tu tienda, sin registrarte' },
  },

  'pt-BR': {
    competitor: 'Booster SEO',
    eyebrow: 'Go Top SEO em comparação com o Booster SEO',
    metaTitle: 'Go Top SEO x Booster SEO | Comparativo dos apps de SEO da Shopify',
    metaDescription:
      'Um app de SEO da Shopify organiza a loja. Go Top SEO comparado com Booster SEO e Avada: o que cada um corrige, o que é escrito, o que é medido e quando um app gratuito é a compra certa.',
    hero: {
      title: 'O app organiza a loja.',
      accent: 'Alguém ainda precisa preenchê-la',
      subtitle:
        'Booster e Avada corrigem metatags, links quebrados e imagens em uma loja Shopify, os dois têm plano gratuito e começam na casa das dezenas de dólares. Nós fazemos outro trabalho na mesma loja: escrevemos e publicamos artigos, publicamos no seu Perfil da Empresa no Google e verificamos uma vez por mês onde a loja está no Google, no Google Maps e nas respostas de IA.',
    },
    table: {
      eyebrow: 'O comparativo',
      title: 'O que cada um faz, segundo as próprias fichas dos apps na loja da Shopify',
      checkedOn: CHECKED,
      sources: SOURCES,
      rows: [
        {
          label: 'Preço',
          ours: 'A partir de 79 dólares por mês mais impostos. Em Israel, a partir de 249 ILS por mês com IVA incluído.',
          theirs:
            'Booster: plano gratuito, Pro 39 dólares por mês, Premium 69 dólares por mês. Avada: plano gratuito, Pro 34,95 dólares por mês, Enterprise 99 dólares por mês.',
        },
        {
          label: 'Plano gratuito e teste',
          ours: 'Teste de 7 dias, sem cartão, cancela quando quiser. Não existe plano gratuito permanente.',
          theirs:
            'Os dois têm plano gratuito permanente. Nos planos pagos: 14 dias de teste no Booster e 7 dias no Avada. A cobrança passa pela conta Shopify que você já tem, sem cartão novo.',
        },
        {
          label: 'Correções na própria loja',
          ours: 'Parte das correções é aplicada pelo nosso plugin, com a sua aprovação e sem código para ler.',
          theirs:
            'O Booster descreve correções automáticas de metatags e links quebrados no Pro, com monitoramento contínuo. O Avada descreve uma lista de correções aplicada às páginas e ao tema.',
        },
        {
          label: 'Imagens e velocidade',
          ours: 'Não comprimimos imagens e não trabalhamos a velocidade da loja. Isso não faz parte do produto.',
          theirs:
            'Aqui está a força deles. Booster: compressão de imagens com 5GB de armazenamento por mês e nomes de arquivo automáticos no Premium. Avada: otimização de imagens e acelerador de velocidade em todos os planos.',
        },
        {
          label: 'Quem escreve os artigos',
          ours: 'O sistema. Temas, texto, imagens e links internos, depois que você aprova.',
          theirs:
            'Na ficha do Booster não aparece escrita de artigos ou de blog entre os recursos e os planos. A ficha do Avada menciona "blog posts" dentro do SEO onpage sem descrever o alcance.',
        },
        {
          label: 'Publicação na loja e no site',
          ours: 'Publicação automática na Shopify e no WordPress, a partir do mesmo plano de conteúdo.',
          theirs: 'Os dois apps trabalham sobre uma loja Shopify.',
        },
        {
          label: 'Acompanhamento de posições no Google',
          ours: 'Uma verificação mensal das suas posições orgânicas no Google.',
          theirs:
            'O plano Premium do Booster mostra métricas do Google Search Console com 365 dias de histórico, que são dados do próprio Google. As fichas deles não descrevem acompanhamento de posições no Google, no Maps nem nas respostas de IA.',
        },
        {
          label: 'Google Maps e Perfil da Empresa',
          ours: 'Publicações automáticas no perfil com o seu consentimento, rascunhos de resposta às avaliações e uma verificação mensal da sua posição no Google Maps.',
          theirs: 'O Perfil da Empresa no Google, as avaliações e o Maps não são mencionados em nenhuma das duas fichas.',
        },
        {
          label: 'Respostas de IA',
          ours: 'Uma verificação automática mensal no ChatGPT, no Gemini e no Google AI.',
          theirs:
            'O Booster prepara a loja para a busca com IA: LLMs.txt, marcação Schema.org e metatags voltadas para IA. Isso é preparação. Medir o que os motores de fato respondem não é descrito na ficha.',
        },
        {
          label: 'Relatórios',
          ours: 'Um relatório mensal com o trabalho feito e as posições medidas.',
          theirs:
            'Booster: painel de relatórios, resumo semanal por e-mail e histórico de correções; relatórios em PDF no Premium. Avada: auditorias onpage, ilimitadas no Pro.',
        },
      ],
    },
    theirStrengths: {
      eyebrow: 'Quando um app da Shopify é a compra certa',
      title: 'Nestes casos fique com o deles, não com o nosso',
      intro: 'Eles são mais baratos, instalam em um minuto e, na manutenção de um catálogo grande, são simplesmente melhores do que nós.',
      items: [
        {
          title: 'Quando o problema é a higiene do catálogo',
          body:
            'Se as suas páginas de produto não têm meta descrições, você tem links quebrados e as imagens são pesadas, um app no plano gratuito ou de 39 dólares é a compra certa e é justo dizer isso. O Booster corrige tags e links em segundo plano sem perguntar, e o Avada cuida de imagens e velocidade em milhares de produtos. Nós não fazemos esse trabalho de imagens e velocidade.',
        },
        {
          title: 'Quando você quer começar sem se comprometer',
          body:
            'Os dois têm plano gratuito permanente, não só teste. Instalar leva cerca de um minuto, a cobrança passa pela conta Shopify que você já tem e não há cartão novo nem conta nova para abrir. Nós damos sete dias sem cartão e depois é um produto pago.',
        },
        {
          title: 'Quando você quer um produto com muitos lojistas por trás',
          body:
            'Em 11/11/2026 a ficha do Booster mostrava 4,8 de 5.485 avaliações e o Avada 4,9 de 4.692. São lojistas que instalaram, ficaram e escreveram. Nós não temos esse volume de avaliações na loja de apps da Shopify, e isso é algo legítimo de pesar.',
        },
      ],
    },
    ourStrengths: {
      eyebrow: 'Quando nós encaixamos melhor',
      title: 'Quando alguém precisa preencher a loja e verificar se funcionou',
      intro: 'Os apps organizam o que já existe. Nós acrescentamos conteúdo novo, o lado local e a medição.',
      items: [
        { title: 'Conteúdo escrito e publicado', body: 'Um plano mensal de temas que você aprova, e depois os artigos com imagens e links internos são publicados na loja sozinhos.' },
        { title: 'Seu Perfil da Empresa no Google', body: 'Publicações no perfil com o seu consentimento e rascunhos de resposta às avaliações, o que importa para uma loja com ponto físico ou serviço local.' },
        { title: 'Medição mensal, não só otimização', body: 'Uma verificação mensal das suas posições no Google, no Google Maps e nas respostas do ChatGPT, do Gemini e do Google AI.' },
        { title: 'WordPress também, em onze idiomas', body: 'Se você também tem um site WordPress, o mesmo plano de conteúdo publica nos dois. Interface e relatórios no seu idioma.' },
      ],
    },
    faq: {
      eyebrow: 'Perguntas',
      title: 'O que as pessoas perguntam antes de decidir',
      items: [
        {
          q: 'Posso manter o app e acrescentar vocês?',
          a: 'Sim, e é uma combinação sensata. O app cuida de tags, links quebrados e imagens, e nós acrescentamos os artigos, o Perfil da Empresa no Google e a medição mensal. Não há conflito: nós não comprimimos imagens e eles não escrevem artigos a partir de um plano de conteúdo.',
        },
        {
          q: 'Vocês cuidam da velocidade da loja e das imagens?',
          a: 'Não. Isso não faz parte do nosso produto, e se esse é o seu problema principal um app desses resolve melhor e por menos dinheiro. O nosso trabalho é conteúdo, o lado local e medição.',
        },
        {
          q: 'E o Avada? É mais barato.',
          a: 'É: o Pro custa 34,95 dólares por mês e ele tem plano gratuito. É forte em imagens, velocidade e auditorias onpage. A ficha dele menciona "blog posts" dentro do SEO onpage sem descrever o alcance, então, se você procura escrita e publicação contínuas, vale perguntar direto a eles.',
        },
      ],
    },
    close: { title: 'Veja onde a sua loja está, sem se cadastrar' },
  },

  fr: {
    competitor: 'Booster SEO',
    eyebrow: 'Go Top SEO face à Booster SEO',
    metaTitle: 'Go Top SEO face à Booster SEO | Comparatif des applis SEO Shopify',
    metaDescription:
      'Une appli SEO Shopify range la boutique. Go Top SEO comparé à Booster SEO et Avada : ce que chacun corrige, ce qui est écrit, ce qui est mesuré, et quand une appli gratuite est le bon achat.',
    hero: {
      title: "L'appli range la boutique.",
      accent: 'Quelqu’un doit encore la remplir',
      subtitle:
        'Booster et Avada corrigent les balises, les liens cassés et les images d’une boutique Shopify, les deux ont une offre gratuite et démarrent à quelques dizaines de dollars. Nous faisons un autre travail sur la même boutique : nous écrivons et publions des articles, nous publions sur votre fiche d’établissement Google, et nous vérifions une fois par mois où la boutique se situe dans Google, dans Google Maps et dans les réponses des IA.',
    },
    table: {
      eyebrow: 'Le comparatif',
      title: 'Ce que fait chacun, d’après les fiches des applis elles-mêmes sur la boutique Shopify',
      checkedOn: CHECKED,
      sources: SOURCES,
      rows: [
        {
          label: 'Prix',
          ours: 'À partir de 79 dollars par mois hors taxes. En Israël, à partir de 249 ILS par mois TVA comprise.',
          theirs:
            'Booster : une offre gratuite, Pro à 39 dollars par mois, Premium à 69 dollars par mois. Avada : une offre gratuite, Pro à 34,95 dollars par mois, Enterprise à 99 dollars par mois.',
        },
        {
          label: 'Offre gratuite et essai',
          ours: 'Un essai de 7 jours, sans carte bancaire, annulable à tout moment. Il n’y a pas d’offre gratuite permanente.',
          theirs:
            'Les deux ont une offre gratuite permanente. Sur les offres payantes : 14 jours d’essai chez Booster, 7 jours chez Avada. La facturation passe par le compte Shopify existant, sans nouvelle carte.',
        },
        {
          label: 'Corrections sur la boutique elle-même',
          ours: 'Une partie des corrections est appliquée par notre extension, avec votre accord et sans code à lire.',
          theirs:
            'Booster décrit des corrections automatiques des balises et des liens cassés sur Pro, avec une surveillance continue. Avada décrit une liste de corrections appliquée aux pages et au thème.',
        },
        {
          label: 'Images et vitesse',
          ours: 'Nous ne compressons pas les images et nous ne travaillons pas la vitesse de la boutique. Cela ne fait pas partie du produit.',
          theirs:
            'C’est leur force. Booster : compression d’images avec 5 Go de stockage par mois et noms de fichiers automatiques sur Premium. Avada : optimisation des images et accélérateur de vitesse sur toutes les offres.',
        },
        {
          label: 'Qui écrit les articles',
          ours: 'Le système. Sujets, texte, images et liens internes, après votre validation.',
          theirs:
            'La fiche de Booster ne fait apparaître ni rédaction d’articles ni blog parmi les fonctions et les offres. La fiche d’Avada mentionne « blog posts » dans le SEO onpage sans en décrire la portée.',
        },
        {
          label: 'Publication sur la boutique et le site',
          ours: 'Publication automatique sur Shopify et sur WordPress, depuis le même plan de contenu.',
          theirs: 'Les deux applis travaillent sur une boutique Shopify.',
        },
        {
          label: 'Suivi de positions dans Google',
          ours: 'Une vérification mensuelle de vos positions organiques dans Google.',
          theirs:
            'L’offre Premium de Booster affiche les métriques de Google Search Console avec 365 jours d’historique, ce sont les données de Google. Leurs fiches ne décrivent aucun suivi de positions dans Google, dans Maps ou dans les réponses des IA.',
        },
        {
          label: 'Google Maps et fiche d’établissement',
          ours: 'Des publications automatiques sur la fiche avec votre accord, des brouillons de réponse aux avis, et une vérification mensuelle de votre position dans Google Maps.',
          theirs: 'La fiche d’établissement Google, les avis et Maps ne sont mentionnés dans aucune des deux fiches.',
        },
        {
          label: 'Réponses des IA',
          ours: 'Une vérification automatique mensuelle dans ChatGPT, Gemini et Google AI.',
          theirs:
            'Booster prépare la boutique pour la recherche par IA : LLMs.txt, données structurées et balises orientées IA. C’est de la préparation. Mesurer ce que les moteurs répondent réellement n’est pas décrit dans la fiche.',
        },
        {
          label: 'Rapports',
          ours: 'Un rapport mensuel qui réunit le travail fait et les positions mesurées.',
          theirs:
            'Booster : tableau de rapports, résumé hebdomadaire par e-mail et historique des corrections ; rapports PDF sur Premium. Avada : audits onpage, illimités sur Pro.',
        },
      ],
    },
    theirStrengths: {
      eyebrow: 'Quand une appli Shopify est le bon achat',
      title: 'Dans ces cas-là, prenez la leur',
      intro: 'Elles coûtent moins cher, s’installent en une minute et, sur l’entretien d’un grand catalogue, elles sont tout simplement meilleures que nous.',
      items: [
        {
          title: 'Quand le problème est l’hygiène du catalogue',
          body:
            'Si vos pages produit n’ont pas de méta-descriptions, que vous avez des liens cassés et des images lourdes, une appli en offre gratuite ou à 39 dollars est le bon achat et il est juste de le dire. Booster corrige les balises et les liens en arrière-plan sans rien demander, et Avada traite les images et la vitesse sur des milliers de produits. Ce travail d’images et de vitesse, nous ne le faisons pas du tout.',
        },
        {
          title: 'Quand vous voulez commencer sans vous engager',
          body:
            'Les deux ont une offre gratuite permanente, pas seulement un essai. L’installation prend environ une minute, la facturation passe par le compte Shopify que vous avez déjà, et il n’y a ni nouvelle carte ni nouveau compte à ouvrir. Chez nous, c’est sept jours sans carte, puis un produit payant.',
        },
        {
          title: 'Quand vous voulez un produit avec beaucoup de marchands derrière',
          body:
            'Le 11/11/2026, la fiche de Booster affichait 4,8 sur 5 485 avis et Avada 4,9 sur 4 692. Ce sont des marchands qui ont installé, sont restés et ont écrit. Nous n’avons pas ce volume d’avis sur la boutique d’applis Shopify, et c’est un élément légitime à peser.',
        },
      ],
    },
    ourStrengths: {
      eyebrow: 'Quand nous convenons mieux',
      title: 'Quand il faut remplir la boutique et vérifier que ça a marché',
      intro: 'Les applis rangent ce qui existe déjà. Nous ajoutons du contenu nouveau, le volet local et la mesure.',
      items: [
        { title: 'Du contenu écrit et publié', body: 'Un plan de sujets mensuel que vous validez, puis des articles avec images et liens internes qui se publient seuls sur la boutique.' },
        { title: 'Votre fiche d’établissement Google', body: 'Des publications sur la fiche avec votre accord et des brouillons de réponse aux avis, ce qui compte pour une boutique avec un local ou un service local.' },
        { title: 'Une mesure mensuelle, pas seulement de l’optimisation', body: 'Une vérification mensuelle de vos positions dans Google, dans Google Maps et dans les réponses de ChatGPT, Gemini et Google AI.' },
        { title: 'WordPress aussi, en onze langues', body: 'Si vous avez aussi un site WordPress, le même plan de contenu publie sur les deux. Interface et rapports dans votre langue.' },
      ],
    },
    faq: {
      eyebrow: 'Questions',
      title: 'Ce que l’on demande avant de décider',
      items: [
        {
          q: 'Puis-je garder l’appli et vous ajouter ?',
          a: 'Oui, et c’est une combinaison sensée. L’appli s’occupe des balises, des liens cassés et des images, et nous ajoutons les articles, la fiche d’établissement Google et la mesure mensuelle. Il n’y a pas de conflit : nous ne compressons pas les images et elles n’écrivent pas d’articles à partir d’un plan de contenu.',
        },
        {
          q: 'Vous occupez-vous de la vitesse de la boutique et des images ?',
          a: 'Non. Cela ne fait pas partie de notre produit, et si c’est votre problème principal, une appli de ce type le résoudra mieux et pour moins cher. Notre travail, c’est le contenu, le volet local et la mesure.',
        },
        {
          q: 'Et Avada ? Elle coûte moins cher.',
          a: 'C’est vrai : son offre Pro est à 34,95 dollars par mois et elle a une offre gratuite. Elle est forte sur les images, la vitesse et les audits onpage. Sa fiche mentionne « blog posts » dans le SEO onpage sans en décrire la portée : si vous cherchez une rédaction et une publication continues, cela vaut la peine de le leur demander directement.',
        },
      ],
    },
    close: { title: 'Voyez où en est votre boutique, sans vous inscrire' },
  },

  it: {
    competitor: 'Booster SEO',
    eyebrow: 'Go Top SEO rispetto a Booster SEO',
    metaTitle: 'Go Top SEO rispetto a Booster SEO | Confronto tra le app SEO di Shopify',
    metaDescription:
      'Un’app SEO per Shopify sistema il negozio. Go Top SEO a confronto con Booster SEO e Avada: che cosa corregge ognuno, che cosa viene scritto, che cosa viene misurato e quando un’app gratuita è l’acquisto giusto.',
    hero: {
      title: 'L’app sistema il negozio.',
      accent: 'Qualcuno deve ancora riempirlo',
      subtitle:
        'Booster e Avada correggono i meta tag, i link rotti e le immagini di un negozio Shopify, hanno entrambe un piano gratuito e partono da poche decine di dollari. Noi facciamo un lavoro diverso sullo stesso negozio: scriviamo e pubblichiamo articoli, pubblichiamo sul vostro profilo dell’attività su Google e controlliamo una volta al mese dove si trova il negozio su Google, su Google Maps e nelle risposte delle IA.',
    },
    table: {
      eyebrow: 'Il confronto',
      title: 'Che cosa fa ognuno, secondo le schede delle app stesse nello store di Shopify',
      checkedOn: CHECKED,
      sources: SOURCES,
      rows: [
        {
          label: 'Prezzo',
          ours: 'Da 79 dollari al mese più imposte. In Israele, da 249 ILS al mese IVA inclusa.',
          theirs:
            'Booster: piano gratuito, Pro 39 dollari al mese, Premium 69 dollari al mese. Avada: piano gratuito, Pro 34,95 dollari al mese, Enterprise 99 dollari al mese.',
        },
        {
          label: 'Piano gratuito e prova',
          ours: 'Una prova di 7 giorni, senza carta, annullabile in qualsiasi momento. Non esiste un piano gratuito permanente.',
          theirs:
            'Entrambe hanno un piano gratuito permanente. Sui piani a pagamento: 14 giorni di prova su Booster, 7 giorni su Avada. L’addebito passa dall’account Shopify che avete già, senza una nuova carta.',
        },
        {
          label: 'Correzioni sul negozio stesso',
          ours: 'Una parte delle correzioni viene applicata dal nostro plugin, con la vostra approvazione e senza codice da leggere.',
          theirs:
            'Booster descrive correzioni automatiche dei meta tag e dei link rotti su Pro, con monitoraggio continuo. Avada descrive un elenco di correzioni applicato alle pagine e al tema.',
        },
        {
          label: 'Immagini e velocità',
          ours: 'Non comprimiamo le immagini e non lavoriamo sulla velocità del negozio. Non fa parte del prodotto.',
          theirs:
            'Qui sta la loro forza. Booster: compressione delle immagini con 5 GB di spazio al mese e nomi dei file automatici su Premium. Avada: ottimizzazione delle immagini e acceleratore di velocità su tutti i piani.',
        },
        {
          label: 'Chi scrive gli articoli',
          ours: 'Il sistema. Argomenti, testo, immagini e link interni, dopo la vostra approvazione.',
          theirs:
            'Nella scheda di Booster non compare la scrittura di articoli o di blog tra le funzioni e i piani. La scheda di Avada cita «blog posts» nella SEO onpage senza descriverne la portata.',
        },
        {
          label: 'Pubblicazione sul negozio e sul sito',
          ours: 'Pubblicazione automatica su Shopify e su WordPress, dallo stesso piano di contenuti.',
          theirs: 'Entrambe le app lavorano su un negozio Shopify.',
        },
        {
          label: 'Monitoraggio delle posizioni su Google',
          ours: 'Un controllo mensile delle vostre posizioni organiche su Google.',
          theirs:
            'Il piano Premium di Booster mostra le metriche di Google Search Console con 365 giorni di storico, che sono i dati di Google. Le loro schede non descrivono un monitoraggio delle posizioni su Google, su Maps o nelle risposte delle IA.',
        },
        {
          label: 'Google Maps e profilo dell’attività',
          ours: 'Pubblicazioni automatiche sul profilo con il vostro consenso, bozze di risposta alle recensioni e un controllo mensile della vostra posizione su Google Maps.',
          theirs: 'Il profilo dell’attività su Google, le recensioni e Maps non sono citati in nessuna delle due schede.',
        },
        {
          label: 'Risposte delle IA',
          ours: 'Un controllo automatico mensile su ChatGPT, Gemini e Google AI.',
          theirs:
            'Booster prepara il negozio per la ricerca con IA: LLMs.txt, dati strutturati e meta tag orientati alle IA. Questa è preparazione. Misurare che cosa rispondono davvero i motori non è descritto nella scheda.',
        },
        {
          label: 'Report',
          ours: 'Un report mensile con il lavoro svolto e le posizioni misurate.',
          theirs:
            'Booster: pannello dei report, riepilogo settimanale per e-mail e storico delle correzioni; report PDF su Premium. Avada: audit onpage, illimitati su Pro.',
        },
      ],
    },
    theirStrengths: {
      eyebrow: 'Quando un’app di Shopify è l’acquisto giusto',
      title: 'In questi casi prendete la loro, non la nostra',
      intro: 'Costano meno, si installano in un minuto e sulla manutenzione di un catalogo grande sono semplicemente migliori di noi.',
      items: [
        {
          title: 'Quando il problema è l’igiene del catalogo',
          body:
            'Se le vostre pagine prodotto non hanno meta descrizioni, avete link rotti e le immagini sono pesanti, un’app nel piano gratuito o da 39 dollari è l’acquisto giusto ed è onesto dirlo. Booster corregge tag e link in sottofondo senza chiedere, e Avada si occupa di immagini e velocità su migliaia di prodotti. Questo lavoro su immagini e velocità noi non lo facciamo affatto.',
        },
        {
          title: 'Quando volete iniziare senza impegnarvi',
          body:
            'Entrambe hanno un piano gratuito permanente, non solo una prova. L’installazione richiede circa un minuto, l’addebito passa dall’account Shopify che avete già e non c’è una nuova carta né un nuovo account da aprire. Da noi ci sono sette giorni senza carta e poi è un prodotto a pagamento.',
        },
        {
          title: 'Quando volete un prodotto con molti commercianti alle spalle',
          body:
            'L’11/11/2026 la scheda di Booster mostrava 4,8 su 5.485 recensioni e Avada 4,9 su 4.692. Sono commercianti che hanno installato, sono rimasti e hanno scritto. Noi non abbiamo quel volume di recensioni nello store di app di Shopify, e questo è un elemento legittimo da valutare.',
        },
      ],
    },
    ourStrengths: {
      eyebrow: 'Quando siamo più adatti noi',
      title: 'Quando qualcuno deve riempire il negozio e verificare se ha funzionato',
      intro: 'Le app sistemano quello che c’è già. Noi aggiungiamo contenuti nuovi, il lato locale e la misurazione.',
      items: [
        { title: 'Contenuti scritti e pubblicati', body: 'Un piano mensile di argomenti che approvate voi, e poi articoli con immagini e link interni che si pubblicano da soli sul negozio.' },
        { title: 'Il vostro profilo dell’attività su Google', body: 'Pubblicazioni sul profilo con il vostro consenso e bozze di risposta alle recensioni, cosa che conta per un negozio con una sede fisica o un servizio locale.' },
        { title: 'Misurazione mensile, non solo ottimizzazione', body: 'Un controllo mensile delle vostre posizioni su Google, su Google Maps e nelle risposte di ChatGPT, Gemini e Google AI.' },
        { title: 'Anche WordPress, in undici lingue', body: 'Se avete anche un sito WordPress, lo stesso piano di contenuti pubblica su entrambi. Interfaccia e report nella vostra lingua.' },
      ],
    },
    faq: {
      eyebrow: 'Domande',
      title: 'Che cosa si chiede prima di decidere',
      items: [
        {
          q: 'Posso tenere l’app e aggiungere voi?',
          a: 'Sì, ed è una combinazione sensata. L’app si occupa di tag, link rotti e immagini, e noi aggiungiamo gli articoli, il profilo dell’attività su Google e la misurazione mensile. Non c’è conflitto: noi non comprimiamo le immagini e loro non scrivono articoli a partire da un piano di contenuti.',
        },
        {
          q: 'Vi occupate della velocità del negozio e delle immagini?',
          a: 'No. Non fa parte del nostro prodotto e, se questo è il vostro problema principale, un’app così lo risolve meglio e con meno spesa. Il nostro lavoro è il contenuto, il lato locale e la misurazione.',
        },
        {
          q: 'E Avada? Costa meno.',
          a: 'È vero: il suo Pro costa 34,95 dollari al mese e ha un piano gratuito. È forte su immagini, velocità e audit onpage. La sua scheda cita «blog posts» nella SEO onpage senza descriverne la portata, quindi se cercate scrittura e pubblicazione continue vale la pena chiederlo direttamente a loro.',
        },
      ],
    },
    close: { title: 'Guardate dove si trova il vostro negozio, senza registrarvi' },
  },

  de: {
    competitor: 'Booster SEO',
    eyebrow: 'Go Top SEO im Vergleich mit Booster SEO',
    metaTitle: 'Go Top SEO im Vergleich mit Booster SEO | Die Shopify-SEO-Apps',
    metaDescription:
      'Eine Shopify-SEO-App räumt den Shop auf. Go Top SEO im Vergleich mit Booster SEO und Avada: was jeder korrigiert, was geschrieben wird, was gemessen wird und wann eine kostenlose App der richtige Kauf ist.',
    hero: {
      title: 'Die App räumt den Shop auf.',
      accent: 'Füllen muss ihn trotzdem jemand',
      subtitle:
        'Booster und Avada korrigieren Meta-Tags, defekte Links und Bilder in einem Shopify-Shop, beide haben einen kostenlosen Tarif und beginnen im zweistelligen Dollarbereich. Wir machen eine andere Arbeit im selben Shop: Wir schreiben und veröffentlichen Artikel, veröffentlichen in Ihrem Google-Unternehmensprofil und prüfen einmal im Monat, wo der Shop in Google, in Google Maps und in KI-Antworten steht.',
    },
    table: {
      eyebrow: 'Der Vergleich',
      title: 'Was jeder tut, nach den eigenen Einträgen der Apps im Shopify App Store',
      checkedOn: CHECKED,
      sources: SOURCES,
      rows: [
        {
          label: 'Preis',
          ours: 'Ab 79 Dollar pro Monat zuzüglich Steuer. In Israel ab 249 ILS pro Monat inklusive Mehrwertsteuer.',
          theirs:
            'Booster: ein kostenloser Tarif, Pro 39 Dollar pro Monat, Premium 69 Dollar pro Monat. Avada: ein kostenloser Tarif, Pro 34,95 Dollar pro Monat, Enterprise 99 Dollar pro Monat.',
        },
        {
          label: 'Kostenloser Tarif und Testphase',
          ours: 'Eine Testphase von 7 Tagen, ohne Kreditkarte, jederzeit kündbar. Einen dauerhaft kostenlosen Tarif gibt es nicht.',
          theirs:
            'Beide haben einen dauerhaft kostenlosen Tarif. In den bezahlten Tarifen: 14 Tage Testphase bei Booster, 7 Tage bei Avada. Die Abrechnung läuft über das bestehende Shopify-Konto, ohne neue Karte.',
        },
        {
          label: 'Korrekturen im Shop selbst',
          ours: 'Ein Teil der Korrekturen wird über unser Plugin angewendet, mit Ihrer Zustimmung und ohne Code zum Lesen.',
          theirs:
            'Booster beschreibt automatische Korrekturen von Meta-Tags und defekten Links im Pro-Tarif, mit laufender Überwachung. Avada beschreibt eine Liste von Korrekturen, die auf die Seiten und das Theme angewendet wird.',
        },
        {
          label: 'Bilder und Geschwindigkeit',
          ours: 'Wir komprimieren keine Bilder und arbeiten nicht an der Geschwindigkeit des Shops. Das ist nicht Teil des Produkts.',
          theirs:
            'Hier liegt ihre Stärke. Booster: Bildkomprimierung mit 5 GB Speicher pro Monat und automatische Dateinamen im Premium-Tarif. Avada: Bildoptimierung und ein Speed Booster in allen Tarifen.',
        },
        {
          label: 'Wer die Artikel schreibt',
          ours: 'Das System. Themen, Text, Bilder und interne Links, nachdem Sie zugestimmt haben.',
          theirs:
            'Im Eintrag von Booster erscheint das Schreiben von Artikeln oder eines Blogs nicht unter den Funktionen und Tarifen. Der Eintrag von Avada nennt „blog posts“ unter Onpage-SEO, ohne den Umfang zu beschreiben.',
        },
        {
          label: 'Veröffentlichen im Shop und auf der Website',
          ours: 'Automatisches Veröffentlichen in Shopify und in WordPress, aus demselben Inhaltsplan.',
          theirs: 'Beide Apps arbeiten an einem Shopify-Shop.',
        },
        {
          label: 'Positionsverfolgung in Google',
          ours: 'Eine monatliche Prüfung Ihrer organischen Positionen in Google.',
          theirs:
            'Der Premium-Tarif von Booster zeigt Metriken aus der Google Search Console mit 365 Tagen Verlauf, das sind Googles eigene Daten. Ihre Einträge beschreiben keine Positionsverfolgung in Google, in Maps oder in KI-Antworten.',
        },
        {
          label: 'Google Maps und Unternehmensprofil',
          ours: 'Automatische Beiträge im Profil mit Ihrer Zustimmung, Antwortentwürfe auf Bewertungen und eine monatliche Prüfung Ihrer Position in Google Maps.',
          theirs: 'Das Google-Unternehmensprofil, Bewertungen und Maps werden in keinem der beiden Einträge genannt.',
        },
        {
          label: 'KI-Antworten',
          ours: 'Eine automatische monatliche Prüfung in ChatGPT, Gemini und Google AI.',
          theirs:
            'Booster bereitet den Shop auf die KI-Suche vor: LLMs.txt, strukturierte Daten und auf KI ausgerichtete Meta-Tags. Das ist Vorbereitung. Dass gemessen wird, was die Maschinen tatsächlich antworten, steht nicht im Eintrag.',
        },
        {
          label: 'Berichte',
          ours: 'Ein monatlicher Bericht, der die getane Arbeit und die gemessenen Positionen zusammenführt.',
          theirs:
            'Booster: ein Berichte-Dashboard, eine wöchentliche E-Mail-Zusammenfassung und ein Verlauf der Korrekturen; PDF-Berichte im Premium-Tarif. Avada: Onpage-Audits, im Pro-Tarif unbegrenzt.',
        },
      ],
    },
    theirStrengths: {
      eyebrow: 'Wann eine Shopify-App der richtige Kauf ist',
      title: 'In diesen Fällen nehmen Sie ihre, nicht unsere',
      intro: 'Sie sind günstiger, in einer Minute installiert, und bei der Pflege eines großen Katalogs sind sie einfach besser als wir.',
      items: [
        {
          title: 'Wenn das Problem die Hygiene des Katalogs ist',
          body:
            'Wenn Ihre Produktseiten keine Meta-Beschreibungen haben, Sie defekte Links haben und die Bilder schwer sind, dann ist eine App im kostenlosen Tarif oder für 39 Dollar der richtige Kauf, und es ist fair, das zu sagen. Booster korrigiert Tags und Links im Hintergrund, ohne zu fragen, und Avada kümmert sich um Bilder und Geschwindigkeit bei tausenden Produkten. Diese Arbeit an Bildern und Geschwindigkeit machen wir überhaupt nicht.',
        },
        {
          title: 'Wenn Sie ohne Bindung anfangen wollen',
          body:
            'Beide haben einen dauerhaft kostenlosen Tarif, nicht nur eine Testphase. Die Installation dauert etwa eine Minute, die Abrechnung läuft über das Shopify-Konto, das Sie schon haben, und es gibt keine neue Karte und kein neues Konto zu eröffnen. Bei uns sind es sieben Tage ohne Karte, danach ist es ein bezahltes Produkt.',
        },
        {
          title: 'Wenn Sie ein Produkt mit vielen Händlern dahinter wollen',
          body:
            'Am 11.11.2026 zeigte der Eintrag von Booster 4,8 aus 5.485 Bewertungen und Avada 4,9 aus 4.692. Das sind Händler, die installiert haben, geblieben sind und geschrieben haben. Wir haben dieses Volumen an Bewertungen im Shopify App Store nicht, und das ist ein berechtigter Punkt bei der Wahl.',
        },
      ],
    },
    ourStrengths: {
      eyebrow: 'Wann wir besser passen',
      title: 'Wenn jemand den Shop füllen und prüfen muss, ob es gewirkt hat',
      intro: 'Die Apps räumen auf, was schon da ist. Wir fügen neue Inhalte hinzu, die lokale Seite und die Messung.',
      items: [
        { title: 'Inhalte, die geschrieben und veröffentlicht werden', body: 'Ein monatlicher Themenplan, dem Sie zustimmen, und danach veröffentlichen sich Artikel mit Bildern und internen Links von selbst im Shop.' },
        { title: 'Ihr Google-Unternehmensprofil', body: 'Beiträge im Profil mit Ihrer Zustimmung und Antwortentwürfe auf Bewertungen, was für einen Shop mit Ladengeschäft oder lokalem Service zählt.' },
        { title: 'Monatliche Messung, nicht nur Optimierung', body: 'Eine monatliche Prüfung Ihrer Positionen in Google, in Google Maps und in den Antworten von ChatGPT, Gemini und Google AI. Das System misst jeden Monat.' },
        { title: 'Auch WordPress, in elf Sprachen', body: 'Wenn Sie auch eine WordPress-Website haben, veröffentlicht derselbe Inhaltsplan auf beiden. Oberfläche und Berichte in Ihrer Sprache.' },
      ],
    },
    faq: {
      eyebrow: 'Fragen',
      title: 'Was man fragt, bevor man entscheidet',
      items: [
        {
          q: 'Kann ich die App behalten und Sie dazunehmen?',
          a: 'Ja, und das ist eine sinnvolle Kombination. Die App kümmert sich um Tags, defekte Links und Bilder, und wir fügen die Artikel, das Google-Unternehmensprofil und die monatliche Messung hinzu. Es gibt keinen Konflikt: Wir komprimieren keine Bilder, und sie schreiben keine Artikel nach einem Inhaltsplan.',
        },
        {
          q: 'Kümmern Sie sich um die Geschwindigkeit des Shops und um die Bilder?',
          a: 'Nein. Das ist nicht Teil unseres Produkts, und wenn das Ihr Hauptproblem ist, löst eine solche App es besser und für weniger Geld. Unsere Arbeit sind Inhalte, die lokale Seite und die Messung.',
        },
        {
          q: 'Und Avada? Die ist günstiger.',
          a: 'Das ist richtig: Pro kostet 34,95 Dollar pro Monat, und es gibt einen kostenlosen Tarif. Sie ist stark bei Bildern, Geschwindigkeit und Onpage-Audits. Ihr Eintrag nennt „blog posts“ unter Onpage-SEO, ohne den Umfang zu beschreiben. Wenn Sie laufendes Schreiben und Veröffentlichen suchen, lohnt es sich, das direkt dort zu fragen.',
        },
      ],
    },
    close: { title: 'Sehen Sie, wo Ihr Shop steht, ohne sich anzumelden' },
  },

  ja: {
    competitor: 'Booster SEO',
    eyebrow: 'Go Top SEO と Booster SEO の比較',
    metaTitle: 'Go Top SEO と Booster SEO の比較 | Shopify の SEO アプリ',
    metaDescription:
      'Shopify の SEO アプリはストアを整えます。Go Top SEO と Booster SEO、Avada の比較。それぞれが何を修正し、何を書き、何を計測するのか、そして無料アプリが正しい選択になるのはどんなときか。',
    hero: {
      title: 'アプリはストアを整えます。',
      accent: '中身を満たす人は別に必要です',
      subtitle:
        'Booster と Avada は Shopify ストアのメタタグ、リンク切れ、画像を修正します。どちらにも無料プランがあり、数十ドルから始まります。私たちは同じストアで別の仕事をします。記事を書いて公開し、Google ビジネス プロフィールに投稿し、ストアが Google、Google マップ、AI の回答でどこにいるかを月に一度計測します。',
    },
    table: {
      eyebrow: '比較',
      title: 'Shopify アプリストアにある各アプリ自身の掲載情報による比較',
      checkedOn: CHECKED,
      sources: SOURCES,
      rows: [
        {
          label: '価格',
          ours: '月額79ドルから（税別）。イスラエルでは月額249シェケルから（付加価値税込み）。',
          theirs:
            'Booster：無料プラン、Pro は月額39ドル、Premium は月額69ドル。Avada：無料プラン、Pro は月額34.95ドル、Enterprise は月額99ドル。',
        },
        {
          label: '無料プランと試用',
          ours: '7日間の試用、クレジットカード不要、いつでも解約できます。恒常的な無料プランはありません。',
          theirs:
            'どちらにも恒常的な無料プランがあります。有料プランでは Booster が14日間、Avada が7日間の試用です。請求は既存の Shopify アカウントを通るため、新しいカードは要りません。',
        },
        {
          label: 'ストア自体の修正',
          ours: '一部の修正は当社のプラグインから、お客様の承認のうえで適用します。コードを読む必要はありません。',
          theirs:
            'Booster は Pro でメタタグとリンク切れの自動修正と継続的な監視を説明しています。Avada はページとテーマに適用される修正の一覧を説明しています。',
        },
        {
          label: '画像と速度',
          ours: '当社は画像の圧縮を行わず、ストアの速度にも手を入れません。製品の範囲外です。',
          theirs:
            'ここが各社の強みです。Booster は Premium で月5GBの保存領域を伴う画像圧縮と自動のファイル名を提供します。Avada は全プランで画像最適化と速度向上を提供します。',
        },
        {
          label: '記事を書くのは誰か',
          ours: 'システムです。テーマ、本文、画像、内部リンクを、お客様の承認のあとに用意します。',
          theirs:
            'Booster の掲載情報には、機能とプランの中に記事やブログの執筆は現れません。Avada の掲載情報は onpage SEO の中で「blog posts」に触れていますが、その範囲は説明されていません。',
        },
        {
          label: 'ストアとサイトへの公開',
          ours: '同じコンテンツ計画から、Shopify と WordPress の両方へ自動で公開します。',
          theirs: 'どちらのアプリも Shopify ストアを対象に動きます。',
        },
        {
          label: 'Google の順位計測',
          ours: 'Google の自然検索での順位を毎月確認します。',
          theirs:
            'Booster の Premium は Google Search Console の指標を365日分の履歴とともに表示します。これは Google 自身のデータです。両社の掲載情報には、Google、マップ、AI の回答における順位計測の記述はありません。',
        },
        {
          label: 'Google マップとビジネス プロフィール',
          ours: 'お客様の同意のうえでプロフィールへ自動投稿し、クチコミへの返信案を用意し、Google マップでの位置を毎月確認します。',
          theirs: 'Google ビジネス プロフィール、クチコミ、マップは、どちらの掲載情報にも記載がありません。',
        },
        {
          label: 'AI の回答',
          ours: 'ChatGPT、Gemini、Google AI での自動確認を毎月行います。',
          theirs:
            'Booster は LLMs.txt、構造化データ、AI に向けたメタタグでストアを AI 検索に備えさせます。これは準備です。各エンジンが実際にどう答えるかの計測は、掲載情報には説明されていません。',
        },
        {
          label: 'レポート',
          ours: '実施した作業と計測した順位をまとめた月次レポートが1本です。',
          theirs:
            'Booster：レポートのダッシュボード、週次のメール要約、修正履歴。Premium では PDF レポート。Avada：onpage の監査、Pro では無制限。',
        },
      ],
    },
    theirStrengths: {
      eyebrow: 'Shopify アプリが正しい選択になるとき',
      title: 'こうした場合は当社ではなく各アプリを',
      intro: '価格は安く、導入は1分、そして大きなカタログの手入れでは、率直に言って私たちより優れています。',
      items: [
        {
          title: '課題がカタログの衛生状態であるとき',
          body:
            '商品ページにメタディスクリプションがなく、リンク切れがあり、画像が重いのであれば、無料プランや月額39ドルのアプリが正しい買い物です。それは正直に申し上げます。Booster は確認を求めずに背後でタグとリンクを直し、Avada は数千の商品で画像と速度を扱います。この画像と速度の仕事を、当社はまったく行いません。',
        },
        {
          title: '身軽に始めたいとき',
          body:
            'どちらにも試用ではなく恒常的な無料プランがあります。導入は1分ほどで、請求はすでにお持ちの Shopify アカウントを通り、新しいカードも新しいアカウントも要りません。当社はカード不要の7日間があり、そのあとは有料の製品です。',
        },
        {
          title: '多くの店舗に使われている製品がよいとき',
          body:
            '2026年11月11日時点で、Booster の掲載は5,485件のレビューで4.8、Avada は4,692件で4.9でした。導入して使い続け、感想を書いた店舗の数です。当社には Shopify アプリストアでそれだけの件数のレビューはなく、それは選ぶ際の正当な判断材料です。',
        },
      ],
    },
    ourStrengths: {
      eyebrow: '当社のほうが合うとき',
      title: '誰かがストアの中身を満たし、効いたかどうかを確かめる必要があるとき',
      intro: 'アプリは既にあるものを整えます。当社は新しいコンテンツ、ローカルの側面、そして計測を加えます。',
      items: [
        { title: '書かれて公開されるコンテンツ', body: 'お客様が承認する月次のテーマ計画があり、そのあとは画像と内部リンクを備えた記事がストアへ自動で公開されます。' },
        { title: 'Google ビジネス プロフィール', body: 'お客様の同意のうえでのプロフィールへの投稿と、クチコミへの返信案です。実店舗や地域向けサービスのあるストアには重要です。' },
        { title: '最適化だけでなく月次の計測', body: 'Google、Google マップ、そして ChatGPT、Gemini、Google AI の回答における順位を毎月確認します。' },
        { title: 'WordPress にも、11言語で', body: 'WordPress のサイトもお持ちなら、同じコンテンツ計画が両方へ公開します。画面もレポートもお客様の言語です。' },
      ],
    },
    faq: {
      eyebrow: '質問',
      title: '決める前によく聞かれること',
      items: [
        {
          q: 'アプリを使い続けたまま、そちらを追加できますか。',
          a: 'できます。そして理にかなった組み合わせです。アプリがタグ、リンク切れ、画像を扱い、当社が記事、Google ビジネス プロフィール、月次の計測を加えます。衝突はありません。当社は画像を圧縮せず、各アプリはコンテンツ計画に沿って記事を書くわけではありません。',
        },
        {
          q: 'ストアの速度や画像も見てもらえますか。',
          a: 'いいえ。当社の製品の範囲外です。そこが主な課題であれば、こうしたアプリのほうが安く上手に解決します。当社の仕事はコンテンツ、ローカルの側面、計測です。',
        },
        {
          q: 'Avada はどうですか。そちらのほうが安いです。',
          a: 'そのとおりで、Pro は月額34.95ドル、無料プランもあります。画像、速度、onpage の監査に強いです。掲載情報は onpage SEO の中で「blog posts」に触れていますが範囲の説明はないため、継続的な執筆と公開をお求めなら直接お尋ねになるとよいでしょう。',
        },
      ],
    },
    close: { title: '登録せずに、ストアの現状を確認する' },
  },

  nl: {
    competitor: 'Booster SEO',
    eyebrow: 'Go Top SEO vergeleken met Booster SEO',
    metaTitle: 'Go Top SEO vergeleken met Booster SEO | De Shopify-SEO-apps',
    metaDescription:
      'Een Shopify-SEO-app ruimt de winkel op. Go Top SEO vergeleken met Booster SEO en Avada: wat elk corrigeert, wat er geschreven wordt, wat er gemeten wordt, en wanneer een gratis app de juiste keuze is.',
    hero: {
      title: 'De app ruimt de winkel op.',
      accent: 'Vullen moet iemand hem nog steeds',
      subtitle:
        'Booster en Avada corrigeren metatags, gebroken links en afbeeldingen in een Shopify-winkel, beide hebben een gratis pakket en ze beginnen bij enkele tientallen dollars. Wij doen ander werk in dezelfde winkel: we schrijven en publiceren artikelen, plaatsen berichten op uw Google-bedrijfsprofiel en controleren één keer per maand waar de winkel staat in Google, in Google Maps en in AI-antwoorden.',
    },
    table: {
      eyebrow: 'De vergelijking',
      title: 'Wat elk doet, volgens de eigen vermeldingen van de apps in de Shopify App Store',
      checkedOn: CHECKED,
      sources: SOURCES,
      rows: [
        {
          label: 'Prijs',
          ours: 'Vanaf 79 dollar per maand plus belasting. In Israël vanaf 249 ILS per maand inclusief btw.',
          theirs:
            'Booster: een gratis pakket, Pro 39 dollar per maand, Premium 69 dollar per maand. Avada: een gratis pakket, Pro 34,95 dollar per maand, Enterprise 99 dollar per maand.',
        },
        {
          label: 'Gratis pakket en proefperiode',
          ours: 'Een proefperiode van 7 dagen, zonder creditcard, altijd opzegbaar. Er is geen permanent gratis pakket.',
          theirs:
            'Beide hebben een permanent gratis pakket. Bij de betaalde pakketten: 14 dagen proef bij Booster, 7 dagen bij Avada. De facturatie loopt via het bestaande Shopify-account, zonder nieuwe kaart.',
        },
        {
          label: 'Correcties in de winkel zelf',
          ours: 'Een deel van de correcties wordt via onze plugin toegepast, met uw goedkeuring en zonder code om te lezen.',
          theirs:
            'Booster beschrijft automatische correcties van metatags en gebroken links in Pro, met doorlopende monitoring. Avada beschrijft een lijst correcties die op de pagina’s en het thema wordt toegepast.',
        },
        {
          label: 'Afbeeldingen en snelheid',
          ours: 'Wij comprimeren geen afbeeldingen en werken niet aan de snelheid van de winkel. Dat hoort niet bij het product.',
          theirs:
            'Hier zit hun kracht. Booster: beeldcompressie met 5 GB opslag per maand en automatische bestandsnamen in Premium. Avada: beeldoptimalisatie en een snelheidsbooster in alle pakketten.',
        },
        {
          label: 'Wie de artikelen schrijft',
          ours: 'Het systeem. Onderwerpen, tekst, afbeeldingen en interne links, nadat u ze goedkeurt.',
          theirs:
            'In de vermelding van Booster komt het schrijven van artikelen of een blog niet voor bij de functies en pakketten. De vermelding van Avada noemt „blog posts” onder onpage SEO zonder de omvang te beschrijven.',
        },
        {
          label: 'Publiceren naar de winkel en de site',
          ours: 'Automatisch publiceren naar Shopify en naar WordPress, vanuit hetzelfde contentplan.',
          theirs: 'Beide apps werken op een Shopify-winkel.',
        },
        {
          label: 'Positiemeting in Google',
          ours: 'Een maandelijkse controle van uw organische posities in Google.',
          theirs:
            'Het Premium-pakket van Booster toont statistieken uit Google Search Console met 365 dagen geschiedenis; dat zijn Googles eigen gegevens. Hun vermeldingen beschrijven geen positiemeting in Google, in Maps of in AI-antwoorden.',
        },
        {
          label: 'Google Maps en bedrijfsprofiel',
          ours: 'Automatische berichten op het profiel met uw toestemming, concept-antwoorden op reviews en een maandelijkse controle van uw positie in Google Maps.',
          theirs: 'Het Google-bedrijfsprofiel, reviews en Maps worden in geen van beide vermeldingen genoemd.',
        },
        {
          label: 'AI-antwoorden',
          ours: 'Een automatische maandelijkse controle in ChatGPT, Gemini en Google AI.',
          theirs:
            'Booster maakt de winkel klaar voor zoeken met AI: LLMs.txt, Schema.org-markering en op AI gerichte metatags. Dat is voorbereiding. Meten wat de machines werkelijk antwoorden staat niet in de vermelding.',
        },
        {
          label: 'Rapporten',
          ours: 'Eén maandrapport met het gedane werk en de gemeten posities.',
          theirs:
            'Booster: een rapportendashboard, een wekelijkse e-mailsamenvatting en een geschiedenis van correcties; PDF-rapporten in Premium. Avada: onpage-audits, onbeperkt in Pro.',
        },
      ],
    },
    theirStrengths: {
      eyebrow: 'Wanneer een Shopify-app de juiste keuze is',
      title: 'Neem in deze gevallen die van hen',
      intro: 'Ze zijn goedkoper, ze zijn in een minuut geïnstalleerd en bij het onderhoud van een grote catalogus zijn ze simpelweg beter dan wij.',
      items: [
        {
          title: 'Als het probleem de hygiëne van de catalogus is',
          body:
            'Als uw productpagina’s geen metabeschrijvingen hebben, u gebroken links heeft en de afbeeldingen zwaar zijn, dan is een app op een gratis pakket of voor 39 dollar de juiste aankoop, en het is eerlijk om dat te zeggen. Booster corrigeert tags en links op de achtergrond zonder te vragen, en Avada pakt afbeeldingen en snelheid aan bij duizenden producten. Dat werk aan afbeeldingen en snelheid doen wij helemaal niet.',
        },
        {
          title: 'Als u zonder verplichting wilt beginnen',
          body:
            'Beide hebben een permanent gratis pakket, niet alleen een proefperiode. Installeren duurt ongeveer een minuut, de facturatie loopt via het Shopify-account dat u al heeft, en er is geen nieuwe kaart en geen nieuw account te openen. Bij ons zijn het zeven dagen zonder kaart, daarna is het een betaald product.',
        },
        {
          title: 'Als u een product met veel verkopers erachter wilt',
          body:
            'Op 11-11-2026 toonde de vermelding van Booster 4,8 uit 5.485 reviews en Avada 4,9 uit 4.692. Dat zijn verkopers die installeerden, bleven en schreven. Wij hebben dat aantal reviews in de Shopify App Store niet, en dat is een legitiem punt om mee te wegen.',
        },
      ],
    },
    ourStrengths: {
      eyebrow: 'Wanneer wij beter passen',
      title: 'Als iemand de winkel moet vullen en moet nagaan of het werkte',
      intro: 'De apps ruimen op wat er al is. Wij voegen nieuwe content toe, de lokale kant en de meting.',
      items: [
        { title: 'Content die geschreven en gepubliceerd wordt', body: 'Een maandelijks onderwerpenplan dat u goedkeurt, en daarna publiceren artikelen met afbeeldingen en interne links zichzelf naar de winkel.' },
        { title: 'Uw Google-bedrijfsprofiel', body: 'Berichten op het profiel met uw toestemming en concept-antwoorden op reviews, wat telt voor een winkel met een fysieke locatie of een lokale dienst.' },
        { title: 'Maandelijkse meting, niet alleen optimalisatie', body: 'Een maandelijkse controle van uw posities in Google, in Google Maps en in de antwoorden van ChatGPT, Gemini en Google AI.' },
        { title: 'WordPress ook, in elf talen', body: 'Heeft u ook een WordPress-site, dan publiceert hetzelfde contentplan naar beide. Interface en rapporten in uw taal.' },
      ],
    },
    faq: {
      eyebrow: 'Vragen',
      title: 'Wat mensen vragen voordat ze kiezen',
      items: [
        {
          q: 'Kan ik de app houden en u erbij nemen?',
          a: 'Ja, en het is een zinnige combinatie. De app doet tags, gebroken links en afbeeldingen, en wij voegen de artikelen, het Google-bedrijfsprofiel en de maandelijkse meting toe. Er is geen conflict: wij comprimeren geen afbeeldingen en zij schrijven geen artikelen volgens een contentplan.',
        },
        {
          q: 'Doen jullie de snelheid van de winkel en de afbeeldingen?',
          a: 'Nee. Dat hoort niet bij ons product, en als dat uw belangrijkste probleem is, lost zo’n app het beter en voor minder geld op. Ons werk is content, de lokale kant en meting.',
        },
        {
          q: 'En Avada? Die is goedkoper.',
          a: 'Dat is zo: Pro kost 34,95 dollar per maand en er is een gratis pakket. Die is sterk in afbeeldingen, snelheid en onpage-audits. De vermelding noemt „blog posts” onder onpage SEO zonder de omvang te beschrijven, dus als u doorlopend schrijven en publiceren zoekt, is het de moeite waard om het hen direct te vragen.',
        },
      ],
    },
    close: { title: 'Bekijk waar uw winkel staat, zonder u aan te melden' },
  },

  pl: {
    competitor: 'Booster SEO',
    eyebrow: 'Go Top SEO w porównaniu z Booster SEO',
    metaTitle: 'Go Top SEO a Booster SEO | Porównanie aplikacji SEO dla Shopify',
    metaDescription:
      'Aplikacja SEO dla Shopify porządkuje sklep. Go Top SEO w porównaniu z Booster SEO i Avada: co każde z nich poprawia, co jest pisane, co jest mierzone i kiedy darmowa aplikacja jest właściwym wyborem.',
    hero: {
      title: 'Aplikacja porządkuje sklep.',
      accent: 'Ktoś wciąż musi go wypełnić',
      subtitle:
        'Booster i Avada poprawiają metatagi, zepsute linki i obrazy w sklepie Shopify, obie mają darmowy plan i zaczynają od kilkudziesięciu dolarów. My wykonujemy w tym samym sklepie inną pracę: piszemy i publikujemy artykuły, publikujemy w Profilu Firmy w Google i raz w miesiącu sprawdzamy, gdzie sklep stoi w Google, w Mapach Google i w odpowiedziach AI.',
    },
    table: {
      eyebrow: 'Porównanie',
      title: 'Co robi każde z nich, według własnych wpisów aplikacji w sklepie Shopify',
      checkedOn: CHECKED,
      sources: SOURCES,
      rows: [
        {
          label: 'Cena',
          ours: 'Od 79 dolarów miesięcznie plus podatek. W Izraelu od 249 ILS miesięcznie z VAT.',
          theirs:
            'Booster: darmowy plan, Pro 39 dolarów miesięcznie, Premium 69 dolarów miesięcznie. Avada: darmowy plan, Pro 34,95 dolara miesięcznie, Enterprise 99 dolarów miesięcznie.',
        },
        {
          label: 'Darmowy plan i okres próbny',
          ours: '7 dni próby, bez karty, rezygnacja w każdej chwili. Nie ma stałego darmowego planu.',
          theirs:
            'Obie mają stały darmowy plan. W planach płatnych: 14 dni próby w Booster, 7 dni w Avada. Płatność idzie przez istniejące konto Shopify, bez nowej karty.',
        },
        {
          label: 'Poprawki w samym sklepie',
          ours: 'Część poprawek wprowadzamy przez naszą wtyczkę, za Państwa zgodą i bez kodu do czytania.',
          theirs:
            'Booster opisuje automatyczne poprawki metatagów i zepsutych linków w planie Pro, z ciągłym monitorowaniem. Avada opisuje listę poprawek stosowaną do stron i do szablonu.',
        },
        {
          label: 'Obrazy i szybkość',
          ours: 'Nie kompresujemy obrazów i nie pracujemy nad szybkością sklepu. To nie jest część produktu.',
          theirs:
            'Tu jest ich siła. Booster: kompresja obrazów z 5 GB miejsca na miesiąc i automatyczne nazwy plików w planie Premium. Avada: optymalizacja obrazów i przyspieszenie sklepu we wszystkich planach.',
        },
        {
          label: 'Kto pisze artykuły',
          ours: 'System. Tematy, tekst, obrazy i linki wewnętrzne, po Państwa zatwierdzeniu.',
          theirs:
            'We wpisie Booster pisanie artykułów ani bloga nie pojawia się wśród funkcji i planów. Wpis Avada wymienia „blog posts” w ramach SEO onpage, nie opisując zakresu.',
        },
        {
          label: 'Publikacja w sklepie i na stronie',
          ours: 'Automatyczna publikacja w Shopify i w WordPressie, z tego samego planu treści.',
          theirs: 'Obie aplikacje pracują na sklepie Shopify.',
        },
        {
          label: 'Monitorowanie pozycji w Google',
          ours: 'Comiesięczne sprawdzenie Państwa pozycji organicznych w Google.',
          theirs:
            'Plan Premium w Booster pokazuje dane Google Search Console z historią 365 dni, czyli dane samego Google. Ich wpisy nie opisują monitorowania pozycji w Google, w Mapach ani w odpowiedziach AI.',
        },
        {
          label: 'Mapy Google i Profil Firmy',
          ours: 'Automatyczne wpisy w profilu za Państwa zgodą, projekty odpowiedzi na opinie i comiesięczne sprawdzenie pozycji w Mapach Google.',
          theirs: 'Profil Firmy w Google, opinie i Mapy nie są wymienione w żadnym z dwóch wpisów.',
        },
        {
          label: 'Odpowiedzi AI',
          ours: 'Automatyczne comiesięczne sprawdzenie w ChatGPT, Gemini i Google AI.',
          theirs:
            'Booster przygotowuje sklep do wyszukiwania z AI: LLMs.txt, dane strukturalne i metatagi nastawione na AI. To przygotowanie. Pomiaru tego, co silniki naprawdę odpowiadają, we wpisie nie opisano.',
        },
        {
          label: 'Raporty',
          ours: 'Jeden raport miesięczny z wykonaną pracą i zmierzonymi pozycjami.',
          theirs:
            'Booster: panel raportów, tygodniowe podsumowanie e-mailem i historia poprawek; raporty PDF w planie Premium. Avada: audyty onpage, bez limitu w planie Pro.',
        },
      ],
    },
    theirStrengths: {
      eyebrow: 'Kiedy aplikacja Shopify jest właściwym wyborem',
      title: 'W tych przypadkach proszę wziąć ich, nie nas',
      intro: 'Są tańsze, instalują się w minutę, a w utrzymaniu dużego katalogu są po prostu lepsze od nas.',
      items: [
        {
          title: 'Kiedy problemem jest higiena katalogu',
          body:
            'Jeśli strony produktów nie mają metaopisów, są zepsute linki, a obrazy są ciężkie, to aplikacja w darmowym planie albo za 39 dolarów jest właściwym zakupem i uczciwie jest to powiedzieć. Booster poprawia tagi i linki w tle, nie pytając, a Avada zajmuje się obrazami i szybkością przy tysiącach produktów. Tej pracy nad obrazami i szybkością nie wykonujemy wcale.',
        },
        {
          title: 'Kiedy chcą Państwo zacząć bez zobowiązań',
          body:
            'Obie mają stały darmowy plan, a nie tylko okres próbny. Instalacja zajmuje około minuty, płatność idzie przez konto Shopify, które już Państwo mają, i nie ma nowej karty ani nowego konta do otwarcia. U nas jest siedem dni bez karty, a potem jest to produkt płatny.',
        },
        {
          title: 'Kiedy chcą Państwo produktu z wieloma sprzedawcami za sobą',
          body:
            '11.11.2026 wpis Booster pokazywał 4,8 z 5485 opinii, a Avada 4,9 z 4692. To sprzedawcy, którzy zainstalowali, zostali i napisali. My nie mamy takiej liczby opinii w sklepie z aplikacjami Shopify i jest to uzasadniony argument przy wyborze.',
        },
      ],
    },
    ourStrengths: {
      eyebrow: 'Kiedy my pasujemy lepiej',
      title: 'Kiedy ktoś musi wypełnić sklep i sprawdzić, czy to zadziałało',
      intro: 'Aplikacje porządkują to, co już jest. My dodajemy nowe treści, stronę lokalną i pomiar.',
      items: [
        { title: 'Treści napisane i opublikowane', body: 'Miesięczny plan tematów, który Państwo zatwierdzają, a potem artykuły z obrazami i linkami wewnętrznymi publikują się w sklepie same.' },
        { title: 'Państwa Profil Firmy w Google', body: 'Wpisy w profilu za Państwa zgodą i projekty odpowiedzi na opinie, co ma znaczenie dla sklepu z lokalem albo usługą lokalną.' },
        { title: 'Pomiar co miesiąc, nie tylko optymalizacja', body: 'Comiesięczne sprawdzenie pozycji w Google, w Mapach Google i w odpowiedziach ChatGPT, Gemini oraz Google AI.' },
        { title: 'Także WordPress, w jedenastu językach', body: 'Jeśli mają Państwo również stronę na WordPressie, ten sam plan treści publikuje w obu. Interfejs i raporty w Państwa języku.' },
      ],
    },
    faq: {
      eyebrow: 'Pytania',
      title: 'O co pytają przed decyzją',
      items: [
        {
          q: 'Czy mogę zostawić aplikację i dodać Państwa?',
          a: 'Tak, i to sensowne połączenie. Aplikacja zajmuje się tagami, zepsutymi linkami i obrazami, a my dodajemy artykuły, Profil Firmy w Google i comiesięczny pomiar. Nie ma konfliktu: my nie kompresujemy obrazów, a one nie piszą artykułów według planu treści.',
        },
        {
          q: 'Czy zajmują się Państwo szybkością sklepu i obrazami?',
          a: 'Nie. To nie część naszego produktu, a jeśli to jest główny problem, taka aplikacja rozwiąże go lepiej i taniej. Nasza praca to treści, strona lokalna i pomiar.',
        },
        {
          q: 'A Avada? Jest tańsza.',
          a: 'To prawda: Pro kosztuje 34,95 dolara miesięcznie i jest darmowy plan. Jest mocna w obrazach, szybkości i audytach onpage. Jej wpis wymienia „blog posts” w ramach SEO onpage, nie opisując zakresu, więc jeśli szukają Państwo stałego pisania i publikowania, warto zapytać ich wprost.',
        },
      ],
    },
    close: { title: 'Sprawdźcie, gdzie stoi sklep, bez rejestracji' },
  },
  ko: {
    competitor: 'Booster SEO',
    eyebrow: 'Go Top SEO와 Booster SEO',
    metaTitle: 'Go Top SEO와 Booster SEO | Shopify SEO 앱 비교',
    metaDescription:
      'Shopify SEO 앱은 쇼핑몰을 정리합니다. Go Top SEO와 Booster SEO, Avada 비교: 각자 무엇을 고치는지, 무엇이 쓰이는지, 무엇이 측정되는지, 그리고 무료 앱이 맞는 선택인 경우는 언제인지 적었습니다.',
    hero: {
      title: '앱은 쇼핑몰을 정리합니다.',
      accent: '채우는 일은 여전히 누군가 해야 합니다',
      subtitle:
        'Booster와 Avada는 Shopify 쇼핑몰의 메타 태그와 깨진 링크, 이미지를 고칩니다. 둘 다 무료 플랜이 있고 수십 달러부터 시작합니다. 저희는 같은 쇼핑몰에서 다른 일을 합니다. 글을 쓰고 발행하고, Google 비즈니스 프로필에 올리고, 한 달에 한 번 쇼핑몰이 Google과 Google 지도, AI 답변에서 어디에 있는지 확인합니다.',
    },
    table: {
      eyebrow: '비교',
      title: 'Shopify 앱스토어의 각 앱 소개 페이지를 기준으로, 각자 무엇을 하는가',
      checkedOn: CHECKED,
      sources: SOURCES,
      rows: [
        {
          label: '가격',
          ours: '월 79달러부터, 세금 별도. 이스라엘에서는 월 249셰켈부터, VAT 포함.',
          theirs:
            'Booster는 무료 플랜과 Pro 월 39달러, Premium 월 69달러입니다. Avada는 무료 플랜과 Pro 월 34.95달러, Enterprise 월 99달러입니다.',
        },
        {
          label: '무료 플랜과 체험',
          ours: '7일 체험, 카드 등록 없이, 언제든 해지. 상시 무료 플랜은 없습니다.',
          theirs:
            '둘 다 상시 무료 플랜이 있습니다. 유료 플랜의 체험은 Booster 14일, Avada 7일입니다. 결제는 이미 있는 Shopify 계정을 통하므로 새 카드가 필요하지 않습니다.',
        },
        {
          label: '쇼핑몰 자체의 수정',
          ours: '일부 수정은 승인하시면 저희 플러그인이 넣습니다. 코드를 읽을 필요가 없습니다.',
          theirs:
            'Booster는 Pro 플랜에서 메타 태그와 깨진 링크를 자동으로 고치고 계속 감시한다고 설명합니다. Avada는 페이지와 테마에 적용하는 수정 목록을 설명합니다.',
        },
        {
          label: '이미지와 속도',
          ours: '이미지를 압축하지 않고 쇼핑몰 속도 작업도 하지 않습니다. 제품에 들어 있지 않습니다.',
          theirs:
            '이쪽이 그들의 강점입니다. Booster는 월 5GB 용량의 이미지 압축과 Premium 플랜의 파일명 자동 지정을 제공합니다. Avada는 모든 플랜에서 이미지 최적화와 쇼핑몰 속도 개선을 제공합니다.',
        },
        {
          label: '글은 누가 쓰는가',
          ours: '시스템입니다. 승인하시면 주제와 본문, 이미지, 내부 링크까지 만듭니다.',
          theirs:
            'Booster 소개 페이지의 기능과 플랜에는 글이나 블로그 작성이 나오지 않습니다. Avada 소개 페이지는 온페이지 SEO 안에 "blog posts"를 적어 두었지만 범위는 설명하지 않습니다.',
        },
        {
          label: '쇼핑몰과 사이트 발행',
          ours: '같은 콘텐츠 계획에서 Shopify와 WordPress에 자동으로 발행합니다.',
          theirs: '두 앱 모두 Shopify 쇼핑몰에서 동작합니다.',
        },
        {
          label: 'Google 순위 측정',
          ours: 'Google 자연 검색에서의 순위를 매달 확인합니다.',
          theirs:
            'Booster의 Premium 플랜은 365일 기록이 붙은 Google Search Console 데이터를 보여 줍니다. 즉 Google 자신의 데이터입니다. 두 소개 페이지 모두 Google과 지도, AI 답변에서의 순위 측정은 설명하지 않습니다.',
        },
        {
          label: 'Google 지도와 비즈니스 프로필',
          ours: '승인하시면 프로필에 게시물을 올리고, 리뷰 답변 초안을 만들고, Google 지도 순위를 매달 확인합니다.',
          theirs: 'Google 비즈니스 프로필과 리뷰, 지도는 두 소개 페이지 어디에도 적혀 있지 않습니다.',
        },
        {
          label: 'AI 답변',
          ours: 'ChatGPT와 Gemini, Google AI에서 매달 자동으로 확인합니다.',
          theirs:
            'Booster는 쇼핑몰을 AI 검색에 대비시킵니다. LLMs.txt와 구조화된 데이터, AI를 겨냥한 메타 태그입니다. 그것은 준비입니다. 엔진이 실제로 무엇이라 답하는지에 대한 측정은 소개 페이지에 설명되어 있지 않습니다.',
        },
        {
          label: '리포트',
          ours: '한 달에 한 번, 한 리포트에 수행한 작업과 측정한 순위가 들어갑니다.',
          theirs:
            'Booster는 리포트 화면과 주간 이메일 요약, 수정 이력을 제공하고 Premium 플랜에서 PDF 리포트를 줍니다. Avada는 온페이지 감사를 제공하며 Pro 플랜에서는 제한이 없습니다.',
        },
      ],
    },
    theirStrengths: {
      eyebrow: 'Shopify 앱이 맞는 선택인 경우',
      title: '이런 경우에는 저희가 아니라 그쪽을 쓰십시오',
      intro: '그쪽이 더 싸고 1분이면 설치되며, 큰 카탈로그를 관리하는 일에서는 저희보다 낫습니다.',
      items: [
        {
          title: '문제가 카탈로그 정리일 때',
          body:
            '상품 페이지에 메타 설명이 없고 깨진 링크가 있고 이미지가 무겁다면, 무료 플랜이나 월 39달러 앱이 맞는 구매이며 그렇게 말하는 것이 정직합니다. Booster는 묻지 않고 뒤에서 태그와 링크를 고치고, Avada는 상품이 수천 개여도 이미지와 속도를 다룹니다. 이미지와 속도 작업은 저희가 아예 하지 않습니다.',
        },
        {
          title: '부담 없이 시작하고 싶을 때',
          body:
            '둘 다 체험이 아니라 상시 무료 플랜이 있습니다. 설치는 1분쯤 걸리고 결제는 이미 쓰고 계신 Shopify 계정을 통하므로 새 카드도 새 계정도 필요하지 않습니다. 저희는 카드 없이 7일이고, 그 뒤에는 유료입니다.',
        },
        {
          title: '뒤에 판매자가 많은 제품을 원할 때',
          body:
            '2026년 11월 11일 기준 Booster 소개 페이지는 리뷰 5,485개에 4.8점, Avada는 4,692개에 4.9점을 보여 주었습니다. 설치하고 남아서 글을 남긴 판매자들입니다. 저희는 Shopify 앱스토어에 그만큼의 리뷰가 없으며, 이것은 선택에서 정당한 근거입니다.',
        },
      ],
    },
    ourStrengths: {
      eyebrow: '저희가 더 맞는 경우',
      title: '쇼핑몰을 채우고 그것이 통했는지 확인할 사람이 필요할 때',
      intro: '앱은 이미 있는 것을 정리합니다. 저희는 새 콘텐츠와 지역 쪽, 그리고 측정을 더합니다.',
      items: [
        { title: '쓰이고 발행되는 콘텐츠', body: '승인하실 한 달치 주제 계획이 먼저 오고, 그다음 이미지와 내부 링크가 들어간 글이 쇼핑몰에 스스로 발행됩니다.' },
        { title: '내 Google 비즈니스 프로필', body: '승인하시면 프로필 게시물과 리뷰 답변 초안을 만듭니다. 매장이 있거나 지역 서비스를 하는 쇼핑몰에게 중요합니다.' },
        { title: '최적화만이 아니라 매달 측정', body: 'Google과 Google 지도, 그리고 ChatGPT와 Gemini, Google AI의 답변에서 순위를 매달 확인합니다.' },
        { title: 'WordPress도, 열한 개 언어로', body: 'WordPress 사이트도 있다면 같은 콘텐츠 계획이 양쪽에 발행합니다. 화면과 리포트는 내 언어로 제공합니다.' },
      ],
    },
    faq: {
      eyebrow: '질문',
      title: '정하기 전에 많이 묻는 것',
      items: [
        {
          q: '앱을 그대로 두고 저희를 더할 수 있습니까?',
          a: '네, 합리적인 조합입니다. 앱은 태그와 깨진 링크, 이미지를 맡고, 저희는 글과 Google 비즈니스 프로필, 매달 측정을 더합니다. 충돌하지 않습니다. 저희는 이미지를 압축하지 않고, 그쪽은 콘텐츠 계획에 따라 글을 쓰지 않습니다.',
        },
        {
          q: '쇼핑몰 속도와 이미지도 다룹니까?',
          a: '아니요. 저희 제품에 들어 있지 않으며, 그것이 주된 문제라면 그런 앱이 더 잘, 더 싸게 해결합니다. 저희 일은 콘텐츠와 지역 쪽, 그리고 측정입니다.',
        },
        {
          q: 'Avada는 어떻습니까? 더 쌉니다.',
          a: '맞습니다. Pro가 월 34.95달러이고 무료 플랜도 있습니다. 이미지와 속도, 온페이지 감사에 강합니다. 소개 페이지는 온페이지 SEO 안에 "blog posts"를 적어 두었지만 범위를 설명하지 않으니, 꾸준한 작성과 발행을 찾으신다면 그쪽에 직접 물어보시기 바랍니다.',
        },
      ],
    },
    close: { title: '가입하지 않고, 쇼핑몰이 지금 어디에 있는지 확인해 보십시오' },
  },
}
