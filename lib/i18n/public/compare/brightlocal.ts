/**
 * Go Top SEO compared with BrightLocal, in every language the public site speaks.
 *
 * THE READING RULE THIS FILE OBEYS. Where BrightLocal's pricing page does not
 * list something, the copy says it does not appear among the plan inclusions —
 * never that BrightLocal cannot do it. Two rows are written that way on
 * purpose: article writing and publishing to the website, neither of which
 * appears anywhere in the three plans' inclusions, and changes to the site
 * itself, which the plans also do not list.
 *
 * THIS IS THE PAGE TO BE MOST CAREFUL WITH. On the local half of our product
 * BrightLocal is the stronger tool and the copy says so first: their entry tier
 * tracks up to 100 keywords and four competitors with a geo-grid map, where we
 * check once a month; their Grow tier collects reviews by email, SMS and
 * in-store, which we do not do at all; and their trial is fourteen days with no
 * card against our seven. Our case is that there is no content engine beside
 * it — to match us you would buy BrightLocal and a writing tool, and still fix
 * your own website.
 *
 * NOT IN THIS FILE, DELIBERATELY: the Managed SEO Service price. It was read on
 * 2026-10-21 but not re-read on the publication date, so it is out.
 */
import type { PublicLocale } from '@/lib/i18n/locales'
import type { ComparisonCopy } from './types'

const CHECKED = '2026-10-31'

const SOURCES = [{ label: 'brightlocal.com — pricing', href: 'https://www.brightlocal.com/pricing/' }]

export const BRIGHTLOCAL_COMPARE: Record<PublicLocale, ComparisonCopy> = {
  he: {
    competitor: 'BrightLocal',
    eyebrow: 'Go Top SEO מול BrightLocal',
    metaTitle: 'Go Top SEO מול BrightLocal | השוואה',
    metaDescription:
      'השוואה בין Go Top SEO לבין BrightLocal: מי מודד מקומי ומי כותב ומפרסם תוכן, מה כלול בכל מחיר, ומתי BrightLocal הוא הבחירה הנכונה לעסק מקומי.',
    hero: {
      title: 'BrightLocal מודד את הנוכחות המקומית שלכם.',
      accent: 'אנחנו גם כותבים ומפרסמים',
      subtitle:
        'BrightLocal הוא כלי מדידה מקומי מעמיק — דירוגים, מפת רשת גאוגרפית, ציטוטים, ביקורות. Go Top SEO מכסה את החצי הזה בבדיקה חודשית, ומוסיף את מה שאין לו: מאמרים שנכתבים ומתפרסמים לאתר, ופוסטים לפרופיל העסקי בגוגל.',
    },
    table: {
      eyebrow: 'ההשוואה',
      title: 'מה כל אחד עושה, לפי עמוד המחירים של BrightLocal עצמם',
      checkedOn: CHECKED,
      sources: SOURCES,
      rows: [
        {
          label: 'מחיר',
          ours: 'מ-79 דולר לחודש בתוספת מס. בישראל, מ-249 ש״ח לחודש כולל מע״מ.',
          theirs:
            'לעסק עם מיקום אחד: Track ב-41 דולר לחודש או 369 דולר לשנה (31 לחודש); Manage ב-54 לחודש או 485 לשנה (40); Grow ב-65 לחודש או 584 לשנה (49). ליותר ממיקום אחד יש מדרגות מחיר נפרדות.',
        },
        {
          label: 'מי כותב את המאמרים',
          ours: 'המערכת. נושאים, טקסט, תמונות וקישורים פנימיים, אחרי שאתם מאשרים.',
          theirs: 'כתיבת תוכן אינה מופיעה ברשימת מה שכלול בשלושת המסלולים בעמוד המחירים שלהם.',
        },
        {
          label: 'פרסום לאתר',
          ours: 'אוטומטי לוורדפרס ולשופיפיי.',
          theirs: 'פרסום מאמרים לאתר אינו מופיע ברשימת מה שכלול במסלולים.',
        },
        {
          label: 'מעקב מיקומים',
          ours: 'בדיקה חודשית בגוגל, בגוגל מפות ובתשובות AI.',
          theirs:
            'כבר ב-Track: מעקב דירוגים מקומי עד 100 מילות מפתח ומול ארבעה מתחרים, ומפת רשת גאוגרפית עד חמש מילות מפתח.',
        },
        {
          label: 'תשובות AI',
          ours: 'בדיקה חודשית אוטומטית ב-ChatGPT, ב-Gemini וב-Google AI.',
          theirs:
            'ה-Local AI Visibility Tracker כלול כבר ב-Track. עמוד המחירים אינו מציין באילו מנועי AI מדובר.',
        },
        {
          label: 'פוסטים לפרופיל העסקי בגוגל',
          ours: 'פוסטים אוטומטיים לפרופיל, באישורכם.',
          theirs:
            'פוסטים מתוזמנים לפרופיל העסקי מתחילים ב-Manage. ביקורת הפרופיל מול מתחרים כלולה כבר ב-Track.',
        },
        {
          label: 'ביקורות',
          ours: 'אנחנו מנסחים טיוטות תשובה, ואתם מאשרים לפני שהן נשלחות.',
          theirs:
            'מעקב אחרי ביקורות ומענה להן בכמה אתרים מתחילים ב-Grow, יחד עם בקשות לביקורת במייל, ב-SMS ובחנות, ופרסום הביקורות באתר שלכם.',
        },
        {
          label: 'ציטוטים ורישומים',
          ours: 'אנחנו לא מנהלים ציטוטים ולא מפיצים את פרטי העסק למדריכים.',
          theirs:
            'מעקב אחרי דיוק הציטוטים כלול כבר ב-Track, וסנכרון פרטי העסק באתרים מרכזיים מתחיל ב-Manage.',
        },
        {
          label: 'עבודה על האתר',
          ours: 'חלק מהתיקונים מוחלים דרך התוסף שלנו, בלי קוד לקרוא.',
          theirs: 'המסלולים מכסים ביקורות, ציטוטים ודיוק רישומים. שינויים באתר שלכם אינם מופיעים ברשימת מה שכלול.',
        },
        {
          label: 'תקופת ניסיון',
          ours: '7 ימי ניסיון, בלי כרטיס אשראי, ביטול בכל רגע.',
          theirs:
            '14 יום של גישה מלאה. לשאלה אם צריך כרטיס אשראי כדי להתחיל, עמוד המחירים עונה שלא.',
        },
      ],
    },
    theirStrengths: {
      eyebrow: 'מתי BrightLocal הוא הבחירה הנכונה',
      title: 'בחצי המקומי הם פשוט עמוקים יותר',
      intro: 'אם כל השאלה שלכם היא מקומית, BrightLocal מודד אותה טוב יותר מאיתנו, וחבל להעמיד פנים אחרת.',
      items: [
        {
          title: 'כשמדידה מקומית היא כל העבודה',
          body:
            'כבר במסלול הזול הם עוקבים אחרי עד 100 מילות מפתח ומול ארבעה מתחרים, עם מפת רשת גאוגרפית לחמש מילים. אנחנו בודקים אחת לחודש. למי שהמיקום במפות הוא הפרנסה, ההפרש הזה משמעותי.',
        },
        {
          title: 'כשצריך שביקורות יגיעו, לא רק שייענו',
          body:
            'מסלול Grow אוסף ביקורות במייל, ב-SMS ובחנות, ומפרסם אותן באתר. אנחנו מנסחים תשובות לביקורות שכבר נכתבו, אבל לא מייצרים ביקורות חדשות. זה תחום שלם שאין לנו.',
        },
        {
          title: 'כשהרישומים והציטוטים מבולגנים',
          body:
            'מעקב דיוק הציטוטים וסנכרון פרטי העסק באתרים מרכזיים הם עבודה שאנחנו לא עושים בכלל. גם תקופת הניסיון שלהם ארוכה משלנו — 14 יום מול 7, בשניהם בלי כרטיס אשראי.',
        },
      ],
    },
    ourStrengths: {
      eyebrow: 'מתי אנחנו מתאימים יותר',
      title: 'כשצריך גם שמישהו יכתוב',
      intro: 'ההבדל המרכזי פשוט: BrightLocal מראה לכם מה קורה. מישהו עדיין צריך לכתוב ולפרסם.',
      items: [
        { title: 'מאמרים שמתפרסמים בלעדיכם', body: 'תוכנית נושאים חודשית שאתם מאשרים, ואז מאמרים עם תמונות וקישורים פנימיים שעולים לאוויר לבד.' },
        { title: 'מנוי אחד במקום שניים', body: 'כדי להגיע לאותו כיסוי צריך כלי מקומי וגם כלי כתיבה. אצלנו זה מחיר אחד.' },
        { title: 'גם האתר עצמו', body: 'חלק מהתיקונים באתר מוחלים דרך התוסף שלנו, ולא נשארים כרשימת משימות.' },
        { title: 'עברית, ושבע שפות', body: 'הממשק, התוכן והדוחות בשפה שלכם — כולל עברית ו-RTL — על וורדפרס ועל שופיפיי.' },
      ],
    },
    faq: {
      eyebrow: 'שאלות',
      title: 'מה שואלים לפני שמחליטים',
      items: [
        {
          q: 'BrightLocal זול יותר. למה שלא אקח אותו?',
          a: 'אם מה שחסר לכם זו מדידה מקומית, קחו אותו — המסלול הראשון שלהם זול משלנו, תקופת הניסיון ארוכה יותר ובלי כרטיס אשראי, והמדידה עצמה עמוקה יותר. השאלה היא מה קורה אחרי שהדוח מגיע: אם אין מי שיכתוב את העמודים ויעלה אותם, הדוח יראה את אותו דבר גם בחודש הבא.',
        },
        {
          q: 'אפשר להשתמש בשניהם?',
          a: 'כן, ולחלק מהעסקים זה השילוב הנכון: הם למדידה המקומית המפורטת, אנחנו לכתיבה, לפרסום ולפוסטים בפרופיל העסקי. אין התנגשות בין השניים.',
        },
        {
          q: 'אתם נותנים מפת רשת גאוגרפית כמו שלהם?',
          a: 'לא. אנחנו בודקים פעם בחודש את המיקום בגוגל מפות, ולא פורסים אותו על רשת של נקודות ברחבי העיר. מי שצריך את הרזולוציה הזו — זה הצד שבו הם חזקים יותר.',
        },
      ],
    },
    close: { title: 'בדקו איפה העסק עומד, בלי להירשם' },
  },

  en: {
    competitor: 'BrightLocal',
    eyebrow: 'Go Top SEO vs BrightLocal',
    metaTitle: 'Go Top SEO vs BrightLocal | Comparison',
    metaDescription:
      'Go Top SEO compared with BrightLocal: who measures local and who writes and publishes the content, what each price covers, and when BrightLocal is the better buy for a local business.',
    hero: {
      title: 'BrightLocal measures your local presence.',
      accent: 'We also write and publish',
      subtitle:
        'BrightLocal is a deep local measurement tool — rankings, a geo-grid map, citations, reviews. Go Top SEO covers that half with a monthly check, and adds the part it has no engine for: articles written and published to your site, and posts to your Google Business Profile.',
    },
    table: {
      eyebrow: 'The comparison',
      title: "What each one does, taken from BrightLocal's own pricing page",
      checkedOn: CHECKED,
      sources: SOURCES,
      rows: [
        {
          label: 'Price',
          ours: 'From $79 a month plus tax. In Israel, from 249 ILS a month including VAT.',
          theirs:
            'For one location: Track $41 a month or $369 a year ($31 a month); Manage $54 or $485 ($40); Grow $65 or $584 ($49). More locations are priced in separate bands.',
        },
        {
          label: 'Who writes the articles',
          ours: 'The system. Topics, text, images and internal links, after you approve.',
          theirs: 'Content writing does not appear among the three plans’ inclusions on their pricing page.',
        },
        {
          label: 'Publishing to the site',
          ours: 'Automatic to WordPress and Shopify.',
          theirs: 'Publishing articles to your website does not appear among the plans’ inclusions.',
        },
        {
          label: 'Rank tracking',
          ours: 'A monthly check in Google, in Google Maps and in AI answers.',
          theirs:
            'From Track up: local rank monitoring for up to 100 keywords and four competitors, plus a geo-grid map for up to five keywords.',
        },
        {
          label: 'AI answers',
          ours: 'An automatic monthly check in ChatGPT, Gemini and Google AI.',
          theirs:
            'The Local AI Visibility Tracker is included from Track up. The pricing page does not name which AI engines it covers.',
        },
        {
          label: 'Google Business Profile posts',
          ours: 'Automatic posts to the profile, with your consent.',
          theirs:
            'Scheduled Google Business Profile posts start at Manage. Profile auditing with competitor benchmarking is already in Track.',
        },
        {
          label: 'Reviews',
          ours: 'We draft the replies and you approve them before they go out.',
          theirs:
            'Review monitoring and responses across multiple sites start at Grow, together with review requests by email, SMS and in-store campaigns, and publishing reviews on your website.',
        },
        {
          label: 'Citations and listings',
          ours: 'We do not manage citations or distribute your business details to directories.',
          theirs:
            'Citation accuracy monitoring is included from Track up, and syncing your business details across key sites starts at Manage.',
        },
        {
          label: 'Work on the site',
          ours: 'Some fixes are applied through our plugin, with no code to read.',
          theirs: 'The plans cover audits, citations and listing accuracy. Changes to your own website do not appear among the inclusions.',
        },
        {
          label: 'Trial',
          ours: 'A 7-day trial, no credit card, cancel anytime.',
          theirs:
            '"You’ll have 14 days of full access." To the question of whether a credit card is needed to start, their pricing page answers: "No credit card is required."',
        },
      ],
    },
    theirStrengths: {
      eyebrow: 'When BrightLocal is the better buy',
      title: 'On the local half they are simply deeper',
      intro: 'If your whole question is local, BrightLocal measures it better than we do, and there is no point pretending otherwise.',
      items: [
        {
          title: 'When local measurement is the whole job',
          body:
            'Even their cheapest tier tracks up to 100 keywords against four competitors, with a geo-grid map for five. We check once a month. For a business whose living depends on its position in Maps, that gap matters.',
        },
        {
          title: 'When reviews need to arrive, not just be answered',
          body:
            'Their Grow tier collects reviews by email, SMS and in-store campaigns, and publishes them on your site. We draft replies to reviews that already exist; we do not generate new ones. That is a whole area we do not cover.',
        },
        {
          title: 'When listings and citations are a mess',
          body:
            'Citation accuracy monitoring and syncing your details across key sites is work we do not do at all. Their trial is also longer than ours — 14 days against 7, both with no card.',
        },
      ],
    },
    ourStrengths: {
      eyebrow: 'When we fit better',
      title: 'When somebody also has to write',
      intro: 'The central difference is simple: BrightLocal shows you what is happening. Someone still has to write and publish.',
      items: [
        { title: 'Articles that publish without you', body: 'A monthly topic plan you approve, then articles with images and internal links going live on their own.' },
        { title: 'One subscription instead of two', body: 'Matching the same coverage means buying a local tool and a writing tool. With us it is one price.' },
        { title: 'The site itself as well', body: 'Some on-site fixes are applied through our plugin rather than left as a to-do list.' },
        { title: 'Seven languages, Hebrew included', body: 'Interface, content and reports in your language — right-to-left included — on WordPress and on Shopify.' },
      ],
    },
    faq: {
      eyebrow: 'Questions',
      title: 'What people ask before deciding',
      items: [
        {
          q: 'BrightLocal is cheaper. Why would I not just take it?',
          a: 'If measurement is what you are missing, take it — their entry tier costs less than ours, their trial is longer and needs no card, and the measurement itself is deeper. The question is what happens after the report arrives: if there is nobody to write the pages and put them live, next month’s report shows the same thing.',
        },
        {
          q: 'Can I use both?',
          a: 'Yes, and for some businesses that is the right combination: them for detailed local measurement, us for the writing, the publishing and the Google Business Profile posts. The two do not conflict.',
        },
        {
          q: 'Do you offer a geo-grid map like theirs?',
          a: 'No. We check your position in Google Maps once a month; we do not spread it across a grid of points around the city. If you need that resolution, this is the side where they are stronger.',
        },
      ],
    },
    close: { title: 'See where your business stands, without signing up' },
  },

  es: {
    competitor: 'BrightLocal',
    eyebrow: 'Go Top SEO frente a BrightLocal',
    metaTitle: 'Go Top SEO frente a BrightLocal | Comparativa',
    metaDescription:
      'Go Top SEO comparado con BrightLocal: quién mide lo local y quién escribe y publica el contenido, qué cubre cada precio y cuándo BrightLocal es la mejor opción para un negocio local.',
    hero: {
      title: 'BrightLocal mide tu presencia local.',
      accent: 'Nosotros además escribimos y publicamos',
      subtitle:
        'BrightLocal es una herramienta de medición local muy completa: posiciones, mapa de cuadrícula geográfica, citaciones, reseñas. Go Top SEO cubre esa mitad con una comprobación mensual y añade lo que allí no hay motor: artículos escritos y publicados en tu sitio, y publicaciones en tu perfil de empresa en Google.',
    },
    table: {
      eyebrow: 'La comparativa',
      title: 'Qué hace cada uno, según la propia página de precios de BrightLocal',
      checkedOn: CHECKED,
      sources: SOURCES,
      rows: [
        {
          label: 'Precio',
          ours: 'Desde 79 dólares al mes más impuestos. En Israel, desde 249 ILS al mes con IVA incluido.',
          theirs:
            'Para una sola ubicación: Track 41 dólares al mes o 369 al año (31 al mes); Manage 54 o 485 (40); Grow 65 o 584 (49). Para más ubicaciones hay tramos de precio aparte.',
        },
        {
          label: 'Quién escribe los artículos',
          ours: 'El sistema. Temas, texto, imágenes y enlaces internos, después de que lo apruebes.',
          theirs: 'La redacción de contenido no figura entre lo incluido en los tres planes de su página de precios.',
        },
        {
          label: 'Publicación en el sitio',
          ours: 'Automática en WordPress y en Shopify.',
          theirs: 'La publicación de artículos en tu web no figura entre lo incluido en los planes.',
        },
        {
          label: 'Seguimiento de posiciones',
          ours: 'Una comprobación mensual en Google, en Google Maps y en respuestas de IA.',
          theirs:
            'Desde Track: seguimiento de posiciones locales de hasta 100 palabras clave y frente a cuatro competidores, más un mapa de cuadrícula geográfica para hasta cinco palabras clave.',
        },
        {
          label: 'Respuestas de IA',
          ours: 'Una comprobación mensual automática en ChatGPT, Gemini y Google AI.',
          theirs:
            'El Local AI Visibility Tracker se incluye desde Track. La página de precios no indica qué motores de IA cubre.',
        },
        {
          label: 'Publicaciones en el perfil de empresa en Google',
          ours: 'Publicaciones automáticas en el perfil, con tu consentimiento.',
          theirs:
            'Las publicaciones programadas en el perfil de empresa empiezan en Manage. La auditoría del perfil comparada con la competencia ya está en Track.',
        },
        {
          label: 'Reseñas',
          ours: 'Redactamos los borradores de respuesta y tú los apruebas antes de que salgan.',
          theirs:
            'El seguimiento de reseñas y las respuestas en varios sitios empiezan en Grow, junto con las solicitudes de reseña por correo, SMS y campañas en tienda, y la publicación de reseñas en tu web.',
        },
        {
          label: 'Citaciones y directorios',
          ours: 'No gestionamos citaciones ni distribuimos los datos de tu negocio a directorios.',
          theirs:
            'La monitorización de la exactitud de las citaciones se incluye desde Track, y la sincronización de tus datos en sitios clave empieza en Manage.',
        },
        {
          label: 'Trabajo sobre el sitio',
          ours: 'Algunas correcciones se aplican a través de nuestro plugin, sin código que leer.',
          theirs: 'Los planes cubren auditorías, citaciones y exactitud de los directorios. Los cambios en tu propia web no figuran entre lo incluido.',
        },
        {
          label: 'Prueba gratuita',
          ours: 'Prueba de 7 días, sin tarjeta de crédito, cancelas cuando quieras.',
          theirs:
            '«Tendrás 14 días de acceso completo». A la pregunta de si hace falta tarjeta para empezar, su página de precios responde que no.',
        },
      ],
    },
    theirStrengths: {
      eyebrow: 'Cuándo BrightLocal es la mejor compra',
      title: 'En la mitad local son sencillamente más profundos',
      intro: 'Si toda tu pregunta es local, BrightLocal la mide mejor que nosotros, y no tiene sentido fingir lo contrario.',
      items: [
        {
          title: 'Cuando medir lo local es todo el trabajo',
          body:
            'Incluso su plan más barato sigue hasta 100 palabras clave frente a cuatro competidores, con un mapa de cuadrícula para cinco. Nosotros comprobamos una vez al mes. Para un negocio que vive de su posición en Maps, esa diferencia pesa.',
        },
        {
          title: 'Cuando las reseñas tienen que llegar, no solo responderse',
          body:
            'Su plan Grow recoge reseñas por correo, SMS y campañas en tienda, y las publica en tu web. Nosotros redactamos respuestas a reseñas que ya existen; no generamos nuevas. Es un área entera que no cubrimos.',
        },
        {
          title: 'Cuando los directorios y las citaciones están desordenados',
          body:
            'La monitorización de citaciones y la sincronización de tus datos en sitios clave es un trabajo que no hacemos en absoluto. Su prueba también es más larga que la nuestra: 14 días frente a 7, ambas sin tarjeta.',
        },
      ],
    },
    ourStrengths: {
      eyebrow: 'Cuándo encajamos mejor',
      title: 'Cuando además alguien tiene que escribir',
      intro: 'La diferencia central es sencilla: BrightLocal te enseña lo que ocurre. Alguien sigue teniendo que escribir y publicar.',
      items: [
        { title: 'Artículos que se publican sin ti', body: 'Un plan mensual de temas que tú apruebas y, después, artículos con imágenes y enlaces internos que salen solos.' },
        { title: 'Una suscripción en lugar de dos', body: 'Igualar esa cobertura significa comprar una herramienta local y otra de redacción. Con nosotros es un solo precio.' },
        { title: 'También el propio sitio', body: 'Algunas correcciones en la web se aplican a través de nuestro plugin en vez de quedarse en una lista de tareas.' },
        { title: 'Siete idiomas, hebreo incluido', body: 'Interfaz, contenido e informes en tu idioma —incluida la escritura de derecha a izquierda— en WordPress y en Shopify.' },
      ],
    },
    faq: {
      eyebrow: 'Preguntas',
      title: 'Lo que se pregunta antes de decidir',
      items: [
        {
          q: 'BrightLocal es más barato. ¿Por qué no cogerlo sin más?',
          a: 'Si lo que te falta es medición, cógelo: su plan de entrada cuesta menos que el nuestro, su prueba es más larga y no pide tarjeta, y la medición en sí es más profunda. La pregunta es qué pasa cuando llega el informe: si no hay quien escriba las páginas y las publique, el informe del mes siguiente dirá lo mismo.',
        },
        {
          q: '¿Puedo usar los dos?',
          a: 'Sí, y para algunos negocios es la combinación correcta: ellos para la medición local detallada, nosotros para la redacción, la publicación y las publicaciones en el perfil de empresa. No chocan entre sí.',
        },
        {
          q: '¿Ofrecéis un mapa de cuadrícula geográfica como el suyo?',
          a: 'No. Comprobamos tu posición en Google Maps una vez al mes; no la repartimos por una cuadrícula de puntos alrededor de la ciudad. Si necesitas esa resolución, ese es el lado en el que ellos son más fuertes.',
        },
      ],
    },
    close: { title: 'Mira cómo está tu negocio, sin registrarte' },
  },

  'pt-BR': {
    competitor: 'BrightLocal',
    eyebrow: 'Go Top SEO x BrightLocal',
    metaTitle: 'Go Top SEO x BrightLocal | Comparativo',
    metaDescription:
      'Go Top SEO comparado com o BrightLocal: quem mede o local e quem escreve e publica o conteúdo, o que cada preço cobre e quando o BrightLocal é a melhor escolha para um negócio local.',
    hero: {
      title: 'O BrightLocal mede a sua presença local.',
      accent: 'Nós também escrevemos e publicamos',
      subtitle:
        'O BrightLocal é uma ferramenta de medição local profunda — posições, mapa de grade geográfica, citações, avaliações. O Go Top SEO cobre essa metade com uma verificação mensal e acrescenta o que ali não tem motor: artigos escritos e publicados no seu site, e publicações no seu perfil da empresa no Google.',
    },
    table: {
      eyebrow: 'O comparativo',
      title: 'O que cada um faz, segundo a própria página de preços do BrightLocal',
      checkedOn: CHECKED,
      sources: SOURCES,
      rows: [
        {
          label: 'Preço',
          ours: 'A partir de 79 dólares por mês mais impostos. Em Israel, a partir de 249 ILS por mês com imposto incluído.',
          theirs:
            'Para um único endereço: Track 41 dólares por mês ou 369 por ano (31 por mês); Manage 54 ou 485 (40); Grow 65 ou 584 (49). Para mais endereços há faixas de preço separadas.',
        },
        {
          label: 'Quem escreve os artigos',
          ours: 'O sistema. Temas, texto, imagens e links internos, depois que você aprova.',
          theirs: 'A redação de conteúdo não aparece entre os itens incluídos nos três planos da página de preços deles.',
        },
        {
          label: 'Publicação no site',
          ours: 'Automática no WordPress e na Shopify.',
          theirs: 'A publicação de artigos no seu site não aparece entre os itens incluídos nos planos.',
        },
        {
          label: 'Monitoramento de posições',
          ours: 'Uma verificação mensal no Google, no Google Maps e nas respostas de IA.',
          theirs:
            'A partir do Track: monitoramento de posições locais de até 100 palavras-chave e diante de quatro concorrentes, mais um mapa de grade geográfica para até cinco palavras-chave.',
        },
        {
          label: 'Respostas de IA',
          ours: 'Uma verificação mensal automática no ChatGPT, no Gemini e no Google AI.',
          theirs:
            'O Local AI Visibility Tracker vem incluído a partir do Track. A página de preços não informa quais motores de IA ele cobre.',
        },
        {
          label: 'Publicações no perfil da empresa no Google',
          ours: 'Publicações automáticas no perfil, com o seu consentimento.',
          theirs:
            'As publicações agendadas no perfil da empresa começam no Manage. A auditoria do perfil comparada com a concorrência já está no Track.',
        },
        {
          label: 'Avaliações',
          ours: 'Escrevemos os rascunhos de resposta e você aprova antes de serem enviados.',
          theirs:
            'O monitoramento de avaliações e as respostas em vários sites começam no Grow, junto com pedidos de avaliação por e-mail, SMS e campanhas na loja, e a publicação das avaliações no seu site.',
        },
        {
          label: 'Citações e diretórios',
          ours: 'Não gerenciamos citações nem distribuímos os dados do seu negócio para diretórios.',
          theirs:
            'O monitoramento da exatidão das citações vem incluído a partir do Track, e a sincronização dos dados do negócio em sites principais começa no Manage.',
        },
        {
          label: 'Trabalho no site',
          ours: 'Algumas correções são aplicadas pelo nosso plugin, sem código para ler.',
          theirs: 'Os planos cobrem auditorias, citações e exatidão de diretórios. Mudanças no seu próprio site não aparecem entre os itens incluídos.',
        },
        {
          label: 'Teste grátis',
          ours: 'Teste de 7 dias, sem cartão de crédito, cancele quando quiser.',
          theirs:
            '"Você terá 14 dias de acesso completo". À pergunta se é preciso cartão para começar, a página de preços deles responde que não.',
        },
      ],
    },
    theirStrengths: {
      eyebrow: 'Quando o BrightLocal é a melhor compra',
      title: 'Na metade local eles são simplesmente mais profundos',
      intro: 'Se toda a sua pergunta é local, o BrightLocal mede isso melhor do que nós, e não adianta fingir o contrário.',
      items: [
        {
          title: 'Quando medir o local é todo o trabalho',
          body:
            'Mesmo o plano mais barato deles acompanha até 100 palavras-chave diante de quatro concorrentes, com um mapa de grade para cinco. Nós verificamos uma vez por mês. Para um negócio que vive da posição no Maps, essa diferença pesa.',
        },
        {
          title: 'Quando as avaliações precisam chegar, não só ser respondidas',
          body:
            'O plano Grow deles coleta avaliações por e-mail, SMS e campanhas na loja, e as publica no seu site. Nós escrevemos respostas para avaliações que já existem; não geramos novas. É uma área inteira que não cobrimos.',
        },
        {
          title: 'Quando os diretórios e as citações estão bagunçados',
          body:
            'O monitoramento de citações e a sincronização dos seus dados em sites principais é um trabalho que não fazemos de jeito nenhum. O teste deles também é mais longo que o nosso: 14 dias contra 7, ambos sem cartão.',
        },
      ],
    },
    ourStrengths: {
      eyebrow: 'Quando combinamos melhor',
      title: 'Quando alguém também precisa escrever',
      intro: 'A diferença central é simples: o BrightLocal mostra o que está acontecendo. Alguém ainda precisa escrever e publicar.',
      items: [
        { title: 'Artigos que publicam sem você', body: 'Um plano mensal de temas que você aprova e, depois, artigos com imagens e links internos que entram no ar sozinhos.' },
        { title: 'Uma assinatura em vez de duas', body: 'Igualar essa cobertura significa comprar uma ferramenta local e outra de escrita. Conosco é um preço só.' },
        { title: 'O próprio site também', body: 'Algumas correções no site são aplicadas pelo nosso plugin em vez de ficarem como lista de tarefas.' },
        { title: 'Sete idiomas, hebraico incluído', body: 'Interface, conteúdo e relatórios no seu idioma — inclusive da direita para a esquerda — no WordPress e na Shopify.' },
      ],
    },
    faq: {
      eyebrow: 'Perguntas',
      title: 'O que perguntam antes de decidir',
      items: [
        {
          q: 'O BrightLocal é mais barato. Por que não pegar logo ele?',
          a: 'Se o que falta para você é medição, pegue: o plano de entrada deles custa menos que o nosso, o teste é mais longo e não pede cartão, e a medição em si é mais profunda. A pergunta é o que acontece depois que o relatório chega: se não há quem escreva as páginas e as publique, o relatório do mês seguinte vai dizer a mesma coisa.',
        },
        {
          q: 'Posso usar os dois?',
          a: 'Pode, e para alguns negócios essa é a combinação certa: eles para a medição local detalhada, nós para a escrita, a publicação e as publicações no perfil da empresa. Os dois não se atrapalham.',
        },
        {
          q: 'Vocês oferecem um mapa de grade geográfica como o deles?',
          a: 'Não. Verificamos a sua posição no Google Maps uma vez por mês; não a espalhamos por uma grade de pontos pela cidade. Se você precisa dessa resolução, é o lado em que eles são mais fortes.',
        },
      ],
    },
    close: { title: 'Veja como seu negócio está hoje, sem se cadastrar' },
  },

  fr: {
    competitor: 'BrightLocal',
    eyebrow: 'Go Top SEO face à BrightLocal',
    metaTitle: 'Go Top SEO face à BrightLocal | Comparatif',
    metaDescription:
      'Go Top SEO comparé à BrightLocal : qui mesure le local et qui rédige et publie le contenu, ce que couvre chaque tarif, et quand BrightLocal est le bon choix pour un commerce local.',
    hero: {
      title: 'BrightLocal mesure votre présence locale.',
      accent: 'Nous rédigeons et publions aussi',
      subtitle:
        "BrightLocal est un outil de mesure locale très complet : positions, carte en grille géographique, citations, avis. Go Top SEO couvre cette moitié par une vérification mensuelle et ajoute ce pour quoi il n'y a pas de moteur en face : des articles rédigés et publiés sur votre site, et des publications sur votre fiche d'établissement Google.",
    },
    table: {
      eyebrow: 'Le comparatif',
      title: 'Ce que fait chacun, d’après la page de tarifs de BrightLocal elle-même',
      checkedOn: CHECKED,
      sources: SOURCES,
      rows: [
        {
          label: 'Tarif',
          ours: 'À partir de 79 dollars par mois hors taxes. En Israël, à partir de 249 ILS par mois TVA comprise.',
          theirs:
            'Pour un seul établissement : Track 41 dollars par mois ou 369 par an (31 par mois) ; Manage 54 ou 485 (40) ; Grow 65 ou 584 (49). Au-delà, les tarifs sont répartis en paliers.',
        },
        {
          label: 'Qui écrit les articles',
          ours: 'Le système. Sujets, texte, images et liens internes, après votre validation.',
          theirs: "La rédaction de contenu ne figure pas parmi les éléments inclus dans les trois forfaits de leur page de tarifs.",
        },
        {
          label: 'Publication sur le site',
          ours: 'Automatique sur WordPress et sur Shopify.',
          theirs: "La publication d'articles sur votre site ne figure pas parmi les éléments inclus dans les forfaits.",
        },
        {
          label: 'Suivi de positions',
          ours: 'Une vérification mensuelle dans Google, dans Google Maps et dans les réponses IA.',
          theirs:
            "À partir de Track : suivi des positions locales sur jusqu'à 100 mots-clés et face à quatre concurrents, plus une carte en grille géographique pour cinq mots-clés.",
        },
        {
          label: 'Réponses IA',
          ours: 'Une vérification mensuelle automatique dans ChatGPT, Gemini et Google AI.',
          theirs:
            "Le Local AI Visibility Tracker est inclus dès Track. La page de tarifs n'indique pas quels moteurs d'IA il couvre.",
        },
        {
          label: "Publications sur la fiche d'établissement Google",
          ours: 'Des publications automatiques sur la fiche, avec votre accord.',
          theirs:
            "Les publications programmées sur la fiche d'établissement commencent avec Manage. L'audit de la fiche comparée aux concurrents est déjà dans Track.",
        },
        {
          label: 'Avis',
          ours: 'Nous rédigeons les brouillons de réponse et vous les validez avant leur envoi.',
          theirs:
            "Le suivi des avis et les réponses sur plusieurs sites commencent avec Grow, avec les demandes d'avis par e-mail, SMS et campagnes en boutique, et la publication des avis sur votre site.",
        },
        {
          label: 'Citations et annuaires',
          ours: 'Nous ne gérons pas les citations et ne diffusons pas les coordonnées de votre établissement aux annuaires.',
          theirs:
            "Le suivi de l'exactitude des citations est inclus dès Track, et la synchronisation de vos coordonnées sur les sites clés commence avec Manage.",
        },
        {
          label: 'Travail sur le site',
          ours: 'Certaines corrections sont appliquées par notre extension, sans code à lire.',
          theirs: "Les forfaits couvrent les audits, les citations et l'exactitude des annuaires. Les modifications de votre propre site ne figurent pas parmi les éléments inclus.",
        },
        {
          label: "Période d'essai",
          ours: "Essai de 7 jours, sans carte bancaire, résiliation à tout moment.",
          theirs:
            "« Vous disposerez de 14 jours d'accès complet ». À la question de savoir si une carte est nécessaire pour commencer, leur page de tarifs répond que non.",
        },
      ],
    },
    theirStrengths: {
      eyebrow: 'Quand BrightLocal est le meilleur choix',
      title: 'Sur la moitié locale, ils sont tout simplement plus profonds',
      intro: "Si toute votre question est locale, BrightLocal la mesure mieux que nous, et il ne sert à rien de prétendre le contraire.",
      items: [
        {
          title: 'Quand la mesure locale est tout le travail',
          body:
            "Même leur palier le moins cher suit jusqu'à 100 mots-clés face à quatre concurrents, avec une carte en grille pour cinq. Nous vérifions une fois par mois. Pour un commerce qui vit de sa position dans Maps, cet écart compte.",
        },
        {
          title: 'Quand les avis doivent arriver, pas seulement recevoir une réponse',
          body:
            "Leur palier Grow collecte des avis par e-mail, SMS et campagnes en boutique, et les publie sur votre site. Nous rédigeons des réponses à des avis qui existent déjà ; nous n'en suscitons pas de nouveaux. C'est tout un domaine que nous ne couvrons pas.",
        },
        {
          title: 'Quand les annuaires et les citations sont en désordre',
          body:
            "Le suivi des citations et la synchronisation de vos coordonnées sur les sites clés est un travail que nous ne faisons pas du tout. Leur essai est aussi plus long que le nôtre : 14 jours contre 7, les deux sans carte.",
        },
      ],
    },
    ourStrengths: {
      eyebrow: 'Quand nous convenons mieux',
      title: "Quand il faut aussi que quelqu'un écrive",
      intro: "La différence centrale est simple : BrightLocal vous montre ce qui se passe. Quelqu'un doit encore écrire et publier.",
      items: [
        { title: 'Des articles qui se publient sans vous', body: 'Un plan de sujets mensuel que vous validez, puis des articles avec images et liens internes qui partent en ligne tout seuls.' },
        { title: 'Un abonnement au lieu de deux', body: "Égaler cette couverture suppose d'acheter un outil local et un outil de rédaction. Chez nous, c'est un seul tarif." },
        { title: 'Le site lui-même aussi', body: "Certaines corrections du site sont appliquées par notre extension au lieu de rester une liste de tâches." },
        { title: 'Sept langues, hébreu compris', body: "Interface, contenu et rapports dans votre langue — écriture de droite à gauche comprise — sur WordPress et sur Shopify." },
      ],
    },
    faq: {
      eyebrow: 'Questions',
      title: 'Ce que l’on demande avant de choisir',
      items: [
        {
          q: 'BrightLocal est moins cher. Pourquoi ne pas simplement le prendre ?',
          a: "Si c'est la mesure qui vous manque, prenez-le : leur palier d'entrée coûte moins que le nôtre, leur essai est plus long et sans carte, et la mesure elle-même est plus profonde. La question est ce qui se passe une fois le rapport arrivé : s'il n'y a personne pour écrire les pages et les mettre en ligne, le rapport du mois suivant dira la même chose.",
        },
        {
          q: 'Puis-je utiliser les deux ?',
          a: "Oui, et pour certaines entreprises c'est la bonne combinaison : eux pour la mesure locale détaillée, nous pour la rédaction, la publication et les publications sur la fiche d'établissement. Les deux ne se gênent pas.",
        },
        {
          q: 'Proposez-vous une carte en grille géographique comme la leur ?',
          a: "Non. Nous vérifions votre position dans Google Maps une fois par mois ; nous ne la répartissons pas sur une grille de points dans la ville. Si vous avez besoin de cette finesse, c'est le domaine où ils sont plus forts.",
        },
      ],
    },
    close: { title: 'Voyez où en est votre établissement, sans inscription' },
  },

  it: {
    competitor: 'BrightLocal',
    eyebrow: 'Go Top SEO a confronto con BrightLocal',
    metaTitle: 'Go Top SEO a confronto con BrightLocal | Confronto',
    metaDescription:
      'Go Top SEO a confronto con BrightLocal: chi misura il locale e chi scrive e pubblica i contenuti, che cosa copre ciascun prezzo e quando BrightLocal è la scelta giusta per un’attività locale.',
    hero: {
      title: 'BrightLocal misura la vostra presenza locale.',
      accent: 'Noi scriviamo e pubblichiamo anche',
      subtitle:
        "BrightLocal è uno strumento di misurazione locale molto approfondito: posizioni, mappa a griglia geografica, citazioni, recensioni. Go Top SEO copre quella metà con una verifica mensile e aggiunge ciò per cui lì non c'è un motore: articoli scritti e pubblicati sul sito, e pubblicazioni sul profilo dell'attività su Google.",
    },
    table: {
      eyebrow: 'Il confronto',
      title: 'Che cosa fa ciascuno, secondo la pagina dei prezzi di BrightLocal stessa',
      checkedOn: CHECKED,
      sources: SOURCES,
      rows: [
        {
          label: 'Prezzo',
          ours: 'Da 79 dollari al mese più imposte. In Israele, da 249 ILS al mese IVA inclusa.',
          theirs:
            'Per una sola sede: Track 41 dollari al mese o 369 all’anno (31 al mese); Manage 54 o 485 (40); Grow 65 o 584 (49). Per più sedi i prezzi sono divisi in fasce.',
        },
        {
          label: 'Chi scrive gli articoli',
          ours: 'Il sistema. Argomenti, testo, immagini e link interni, dopo la vostra approvazione.',
          theirs: 'La scrittura di contenuti non compare fra le voci incluse nei tre piani della loro pagina dei prezzi.',
        },
        {
          label: 'Pubblicazione sul sito',
          ours: 'Automatica su WordPress e su Shopify.',
          theirs: 'La pubblicazione di articoli sul vostro sito non compare fra le voci incluse nei piani.',
        },
        {
          label: 'Monitoraggio delle posizioni',
          ours: 'Una verifica mensile su Google, su Google Maps e nelle risposte IA.',
          theirs:
            'Da Track in su: monitoraggio delle posizioni locali fino a 100 parole chiave e rispetto a quattro concorrenti, più una mappa a griglia geografica per un massimo di cinque parole chiave.',
        },
        {
          label: 'Risposte IA',
          ours: 'Una verifica mensile automatica su ChatGPT, Gemini e Google AI.',
          theirs:
            'Il Local AI Visibility Tracker è incluso già da Track. La pagina dei prezzi non indica quali motori di IA copra.',
        },
        {
          label: "Pubblicazioni sul profilo dell'attività su Google",
          ours: 'Pubblicazioni automatiche sul profilo, con il vostro consenso.',
          theirs:
            "Le pubblicazioni programmate sul profilo dell'attività iniziano con Manage. L'analisi del profilo rispetto ai concorrenti è già in Track.",
        },
        {
          label: 'Recensioni',
          ours: 'Prepariamo le bozze di risposta e voi le approvate prima che partano.',
          theirs:
            'Il monitoraggio delle recensioni e le risposte su più siti iniziano con Grow, insieme alle richieste di recensione via e-mail, SMS e campagne in negozio, e alla pubblicazione delle recensioni sul vostro sito.',
        },
        {
          label: 'Citazioni ed elenchi',
          ours: 'Non gestiamo le citazioni e non distribuiamo i dati della vostra attività agli elenchi.',
          theirs:
            "Il monitoraggio dell'accuratezza delle citazioni è incluso già da Track, e la sincronizzazione dei dati dell'attività sui siti principali inizia con Manage.",
        },
        {
          label: 'Lavoro sul sito',
          ours: 'Alcune correzioni vengono applicate tramite il nostro plugin, senza codice da leggere.',
          theirs: "I piani coprono analisi, citazioni e accuratezza degli elenchi. Le modifiche al vostro sito non compaiono fra le voci incluse.",
        },
        {
          label: 'Prova gratuita',
          ours: 'Prova di 7 giorni, senza carta di credito, disdetta in qualsiasi momento.',
          theirs:
            '"Avrete 14 giorni di accesso completo". Alla domanda se serva una carta per iniziare, la loro pagina dei prezzi risponde di no.',
        },
      ],
    },
    theirStrengths: {
      eyebrow: 'Quando BrightLocal è la scelta migliore',
      title: 'Sulla metà locale sono semplicemente più approfonditi',
      intro: 'Se la vostra domanda è tutta locale, BrightLocal la misura meglio di noi, e non ha senso fingere il contrario.',
      items: [
        {
          title: 'Quando misurare il locale è tutto il lavoro',
          body:
            'Anche il loro piano più economico segue fino a 100 parole chiave rispetto a quattro concorrenti, con una mappa a griglia per cinque. Noi verifichiamo una volta al mese. Per un’attività che vive della propria posizione su Maps, quella distanza pesa.',
        },
        {
          title: 'Quando le recensioni devono arrivare, non solo ricevere risposta',
          body:
            'Il loro piano Grow raccoglie recensioni via e-mail, SMS e campagne in negozio, e le pubblica sul sito. Noi scriviamo risposte a recensioni già esistenti; non ne generiamo di nuove. È un’area intera che non copriamo.',
        },
        {
          title: 'Quando elenchi e citazioni sono in disordine',
          body:
            "Il monitoraggio delle citazioni e la sincronizzazione dei dati sui siti principali è un lavoro che non facciamo affatto. Anche la loro prova è più lunga della nostra: 14 giorni contro 7, entrambe senza carta.",
        },
      ],
    },
    ourStrengths: {
      eyebrow: 'Quando siamo più adatti noi',
      title: 'Quando serve anche qualcuno che scriva',
      intro: 'La differenza centrale è semplice: BrightLocal vi mostra che cosa sta succedendo. Qualcuno deve ancora scrivere e pubblicare.',
      items: [
        { title: 'Articoli che si pubblicano senza di voi', body: 'Un piano mensile di argomenti che approvate, e poi articoli con immagini e link interni che vanno online da soli.' },
        { title: 'Un abbonamento invece di due', body: 'Per avere la stessa copertura servono uno strumento locale e uno di scrittura. Da noi è un prezzo solo.' },
        { title: 'Anche il sito stesso', body: 'Alcune correzioni sul sito vengono applicate tramite il nostro plugin invece di restare un elenco di cose da fare.' },
        { title: 'Sette lingue, ebraico compreso', body: "Interfaccia, contenuti e report nella vostra lingua — scrittura da destra a sinistra compresa — su WordPress e su Shopify." },
      ],
    },
    faq: {
      eyebrow: 'Domande',
      title: 'Che cosa si chiede prima di decidere',
      items: [
        {
          q: 'BrightLocal costa meno. Perché non prendere direttamente quello?',
          a: 'Se quello che vi manca è la misurazione, prendetelo: il loro piano d’ingresso costa meno del nostro, la prova è più lunga e non chiede la carta, e la misurazione in sé è più approfondita. La domanda è che cosa succede dopo che arriva il report: se non c’è nessuno che scriva le pagine e le pubblichi, il report del mese dopo dirà la stessa cosa.',
        },
        {
          q: 'Posso usarli entrambi?',
          a: "Sì, e per alcune attività è la combinazione giusta: loro per la misurazione locale dettagliata, noi per la scrittura, la pubblicazione e le pubblicazioni sul profilo dell'attività. I due non si ostacolano.",
        },
        {
          q: 'Offrite una mappa a griglia geografica come la loro?',
          a: 'No. Verifichiamo la posizione su Google Maps una volta al mese; non la distribuiamo su una griglia di punti in città. Se vi serve quella risoluzione, è il lato in cui loro sono più forti.',
        },
      ],
    },
    close: { title: 'Guardate a che punto è la vostra attività, senza registrarvi' },
  },
  ja: {
    competitor: 'BrightLocal',
    eyebrow: 'Go Top SEOとBrightLocalの比較',
    metaTitle: 'Go Top SEOとBrightLocalの比較 | 比較',
    metaDescription:
      'Go Top SEOとBrightLocalの比較です。ローカルを計測するのはどちらで、コンテンツを書いて公開するのはどちらか、それぞれの料金に何が含まれるか、そして地域の商売にとってBrightLocalのほうが適しているのはどのような場合かをまとめました。',
    hero: {
      title: 'BrightLocalは、地域での見え方を計測します。',
      accent: '当社は書いて公開するところまで行います',
      subtitle:
        'BrightLocalはローカルの計測を深く掘る道具です。順位、地図上の格子状の表示、引用情報、口コミを扱います。Go Top SEOはその半分を月に一度の計測でまかない、そのうえで同社に仕組みのない部分を足します。記事を書いてサイトへ公開し、Googleビジネスプロフィールへ投稿するところです。',
    },
    table: {
      eyebrow: '比較',
      title: 'BrightLocal自身の料金ページに書かれている内容にもとづく、それぞれの役割',
      checkedOn: CHECKED,
      sources: SOURCES,
      rows: [
        {
          label: '料金',
          ours: '月額79ドルから（税別）。イスラエルでは月額249シェケルから（付加価値税込み）。',
          theirs:
            '拠点1つの場合、Trackは月額41ドルまたは年額369ドル（月あたり31ドル）、Manageは54ドルまたは485ドル（40ドル）、Growは65ドルまたは584ドル（49ドル）です。拠点が増える場合は別の価格帯になります。',
        },
        {
          label: '記事を書くのは誰か',
          ours: 'システムです。題材、本文、画像、内部リンクを、ご承認のあとに用意します。',
          theirs: '記事の執筆は、同社の料金ページの3つのプランの内容には挙げられていません。',
        },
        {
          label: 'サイトへの公開',
          ours: 'WordPressとShopifyへ自動で公開します。',
          theirs: '記事をご自身のサイトへ公開することは、プランの内容には挙げられていません。',
        },
        {
          label: '検索順位の計測',
          ours: 'Google、Googleマップ、そしてAIの回答について月に一度計測します。',
          theirs:
            'Track以上で、キーワード最大100件と競合4社までのローカル順位の計測、さらにキーワード5件までの地図上の格子状の表示が含まれます。',
        },
        {
          label: 'AIの回答',
          ours: 'ChatGPT、Gemini、Google AIについて、自動で月に一度計測します。',
          theirs:
            'Local AI Visibility TrackerはTrack以上に含まれます。どのAIエンジンを対象にしているかは、料金ページには書かれていません。',
        },
        {
          label: 'Googleビジネスプロフィールへの投稿',
          ours: 'ご同意のうえで、プロフィールへ自動で投稿します。',
          theirs:
            'Googleビジネスプロフィールへの投稿の予約はManageから始まります。プロフィールの監査と競合との比較はTrackにすでに入っています。',
        },
        {
          label: '口コミ',
          ours: '返信の下書きを当社が用意し、ご承認いただいてから送ります。',
          theirs:
            '複数のサイトにまたがる口コミの監視と返信はGrowから始まり、メール、SMS、店頭での口コミの依頼、そして自分のサイトへの口コミの掲載も同じプランに入っています。',
        },
        {
          label: '引用情報と掲載先',
          ours: '引用情報の管理や、ディレクトリへの事業情報の配信は行っていません。',
          theirs:
            '引用情報の正確さの監視はTrack以上に含まれ、主要なサイトへの事業情報の同期はManageから始まります。',
        },
        {
          label: 'サイトへの作業',
          ours: '修正の一部は当社の拡張機能から適用され、コードを読む必要はありません。',
          theirs: 'プランが扱うのは監査、引用情報、掲載内容の正確さです。ご自身のサイトへの変更は、内容には挙げられていません。',
        },
        {
          label: 'トライアル',
          ours: '7日間、クレジットカード不要、いつでも解約できます。',
          theirs:
            '「You’ll have 14 days of full access.」とあります。始めるためにクレジットカードが必要かという問いには、同社の料金ページが「No credit card is required.」と答えています。',
        },
      ],
    },
    theirStrengths: {
      eyebrow: 'BrightLocalのほうがよい場合',
      title: 'ローカルの半分については、同社のほうが単純に深いです',
      intro: '問いのすべてがローカルであれば、BrightLocalは当社より上手に計測します。そこを取り繕う意味はありません。',
      items: [
        {
          title: 'ローカルの計測が仕事のすべてである場合',
          body:
            '同社のいちばん安いプランでも、キーワード最大100件を競合4社と並べて計測し、5件については地図上の格子状の表示まで出ます。当社は月に一度の確認です。マップでの位置が暮らしを左右する商売にとって、この差は実際に効きます。',
        },
        {
          title: '口コミに返すだけでなく、集める必要がある場合',
          body:
            '同社のGrowは、メール、SMS、店頭の取り組みで口コミを集め、サイトへ掲載します。当社はすでにある口コミへの返信の下書きを用意するだけで、新しい口コミを集めることはしていません。まるごと当社が扱っていない領域です。',
        },
        {
          title: '掲載先や引用情報が整っていない場合',
          body:
            '引用情報の正確さの監視も、主要なサイトへの情報の同期も、当社がまったく行っていない作業です。トライアルの長さも同社のほうが上で、14日と7日、どちらもカードは不要です。',
        },
      ],
    },
    ourStrengths: {
      eyebrow: '当社のほうが適している場合',
      title: '書く作業も誰かがやらなければならない場合',
      intro: '中心にある違いは単純です。BrightLocalは何が起きているかを見せます。書いて公開するのは、やはり誰かの仕事です。',
      items: [
        { title: '手をかけずに公開される記事', body: '月に一度、題材の計画をご承認いただくと、画像と内部リンクの入った記事がそのまま公開されます。' },
        { title: '契約を2つではなく1つに', body: '同じ範囲をそろえるには、ローカルの道具と執筆の道具を別に買うことになります。当社では1つの料金です。' },
        { title: 'サイト自体にも手が入ります', body: '一部の修正は当社の拡張機能から適用され、やることのリストとして残りません。' },
        { title: '7つの言語、ヘブライ語も', body: '画面、コンテンツ、レポートをご自身の言語で用意します。右から左に書く言語も含め、WordPressでもShopifyでも同じです。' },
      ],
    },
    faq: {
      eyebrow: 'よくある質問',
      title: '決める前によく聞かれること',
      items: [
        {
          q: 'BrightLocalのほうが安いのに、そちらを選ばない理由はありますか',
          a: '足りないものが計測であれば、同社を選んでください。入口のプランは当社より安く、トライアルは長く、カードも不要で、計測そのものも深いです。問題はレポートが届いたあとです。ページを書いて公開する人がいなければ、翌月のレポートには同じことが書かれています。',
        },
        {
          q: '両方を使えますか',
          a: 'はい。商売によってはそれが正しい組み合わせです。細かいローカルの計測は同社、執筆と公開とGoogleビジネスプロフィールへの投稿は当社、という形です。両者がぶつかるところはありません。',
        },
        {
          q: '同社のような地図上の格子状の表示はありますか',
          a: 'いいえ。当社はGoogleマップでの位置を月に一度確認するだけで、街の中の複数の地点に広げて見ることはしていません。その細かさが必要であれば、同社のほうが強い領域です。',
        },
      ],
    },
    close: { title: 'お店の現状を、登録なしで確認する' },
  },
}
