/**
 * Go Top SEO compared with Rank Math, in every language the public site speaks.
 *
 * EVERY STATEMENT IN THE `theirs` COLUMN comes from a page Rank Math owns —
 * their pricing page, their Content AI page and their own WordPress.org plugin
 * listing — read on the date in `checkedOn`. Three things are deliberately NOT
 * said anywhere here, because they could not be verified from those pages:
 *
 *   - that Rank Math does not post to Google Business Profile. Their pages
 *     simply do not mention it, which is what the table says. Absence from a
 *     page is not a denial, and we do not make one on their behalf.
 *   - how often their AI Visibility check runs. The listing describes the
 *     feature and what it reports; it does not state a frequency, so neither
 *     do we.
 *   - what their AI features cost on their own. Rank Math AI is sold
 *     separately from the SEO plugin plans and its own price is not on the
 *     pricing page we read.
 *
 * The honest headline of this page: Rank Math SHIPS AI VISIBILITY. Their
 * WordPress.org listing markets tracking of how ChatGPT and Gemini mention a
 * brand, with sentiment, competitor comparison and full transcripts. Any copy
 * of ours that treats "we are the only ones who measure AI mentions" as true
 * is out of date and must not be written again.
 */
import type { PublicLocale } from '@/lib/i18n/locales'
import type { ComparisonCopy } from './types'

const CHECKED = '2026-10-22'

const SOURCES = [
  { label: 'rankmath.com/pricing', href: 'https://rankmath.com/pricing/' },
  { label: 'Content AI', href: 'https://rankmath.com/content-ai/' },
  { label: 'Rank Math SEO on WordPress.org', href: 'https://wordpress.org/plugins/seo-by-rank-math/' },
]

export const RANKMATH_COMPARE: Record<PublicLocale, ComparisonCopy> = {
  he: {
    competitor: 'Rank Math',
    eyebrow: 'Go Top SEO מול Rank Math',
    metaTitle: 'Go Top SEO מול Rank Math | השוואה',
    metaDescription:
      'השוואה בין Go Top SEO ל-Rank Math: מי עובד בתוך וורדפרס בלבד, מי מפרסם ל-Google Business Profile, מה כולל כל מחיר ומתי Rank Math הוא הבחירה הנכונה.',
    hero: {
      title: 'Rank Math הוא תוסף מצוין לוורדפרס.',
      accent: 'אנחנו מערכת שעושה את העבודה',
      subtitle:
        'Rank Math יושב בתוך העורך של וורדפרס ועוזר לכתוב ולסמן נכון, וגם כולל היום מעקב אחרי אזכורים ב-AI. Go Top SEO עובד גם בשופיפיי, מפרסם ל-Google Business Profile ומנהל תוכנית תוכן חודשית שמתפרסמת לבד.',
    },
    table: {
      eyebrow: 'ההשוואה',
      title: 'מה כל אחד עושה, לפי העמודים של Rank Math עצמם',
      checkedOn: CHECKED,
      sources: SOURCES,
      rows: [
        {
          label: 'מחיר התחלתי',
          ours: 'בישראל החל מ-249 ש״ח לחודש כולל מע״מ. מחוץ לישראל מ-79 דולר לחודש בתוספת מס.',
          theirs:
            'תוסף חינמי, ו-PRO ב-7.99 אירו לחודש בתשלום שנתי לפני מע״מ (מתחדש ב-8.99). Business ב-24.99 אירו לחודש, מתחדש ב-27.99.',
        },
        {
          label: 'פלטפורמות',
          ours: 'וורדפרס ושופיפיי, באותו חשבון.',
          theirs: 'העמודים שלהם מתארים תוסף לוורדפרס.',
        },
        {
          label: 'מי עושה את העבודה',
          ours: 'המערכת. אתם מאשרים נושא, והיא כותבת, מוסיפה תמונות וקישורים פנימיים ומפרסמת.',
          theirs:
            'אתם, בתוך העורך. Content AI מספק מעל 40 כלים וטמפלטים לכתיבה, ואתם מפעילים אותם ומפרסמים.',
        },
        {
          label: 'תוכנית תוכן חודשית',
          ours: 'המערכת מציעה נושאים כל חודש, אתם מאשרים או מוחקים, והמאמרים מתפרסמים לפי לוח זמנים.',
          theirs:
            'העמודים שקראנו מתארים כתיבה לפי דרישה בתוך העורך, ולא תוכנית חודשית שמתפרסמת לבד.',
        },
        {
          label: 'Google Business Profile',
          ours: 'כלול באותו מחיר: פוסטים אוטומטיים לפרופיל, בהסכמה שלכם, וטיוטות תשובה לביקורות.',
          theirs: 'העמודים שקראנו עוסקים באתר עצמו ואינם מזכירים פרסום לפרופיל העסק בגוגל.',
        },
        {
          label: 'נראות במנועי AI',
          ours: 'בדיקה חודשית מול ChatGPT, Gemini ו-Google AI, כלולה במחיר הבסיסי.',
          theirs:
            'יש להם AI Visibility: ציון נראות, מעקב אחרי אזכורים ב-ChatGPT וב-Gemini, סנטימנט, השוואה למתחרים, תמלילים מלאים ובדיקה לפי מדינה. נמכר כחלק מ-Rank Math AI.',
        },
        {
          label: 'מעקב דירוגים',
          ours: 'בדיקה חודשית בגוגל וב-Google Maps, באותו מחיר.',
          theirs:
            '500 ביטויים ב-PRO ו-10,000 ב-Business, עם היסטוריית מיקומים של שנים עשר חודשים אחורה.',
        },
        {
          label: 'ניסיון',
          ours: '7 ימים, בלי כרטיס אשראי, ביטול בכל רגע.',
          theirs: 'התוסף הבסיסי חינמי, ותוכניות PRO כוללות ניסיון של 15 יום ל-Rank Math AI.',
        },
      ],
    },
    theirStrengths: {
      eyebrow: 'מתי Rank Math עדיף',
      title: 'יש מצבים שבהם Rank Math הוא הבחירה הנכונה',
      intro: 'הם מוצר בוגר ומוערך, ואם זה מה שאתם צריכים עדיף שתדעו את זה עכשיו.',
      items: [
        {
          title: 'כשהתקציב הוא אפס',
          body:
            'התוסף הבסיסי חינמי, ולפי העמוד שלהם הוא מותקן על מעל ארבעה מיליון אתרי וורדפרס. לעסק שרק מתחיל ואין לו תקציב חודשי, זו נקודת פתיחה שקשה להתווכח איתה, והיא נותנת סכמה, מפת אתר וניתוח עמוד בלי לשלם.',
        },
        {
          title: 'כשרוצים שליטה ידנית בתוך העורך',
          body:
            'מי שכותב בעצמו ואוהב לראות ציון SEO מתעדכן תוך כדי הקלדה יקבל אצלם חוויה טובה יותר משלנו. אנחנו בנויים סביב אוטומציה, והם בנויים סביב האדם שיושב ועובד.',
        },
        {
          title: 'כשצריך ניהול קישורים פנימיים בקנה מידה גדול',
          body:
            'AI Link Genius מציג את כל הקישורים באתר במקום אחד, מאפשר עדכון המוני, מציע קישורים תוך כדי כתיבה ומאתר עמודים שאף אחד לא מקשר אליהם. לאתר ותיק עם מאות עמודים זה כלי שאין לנו מקבילה לו.',
        },
      ],
    },
    ourStrengths: {
      eyebrow: 'מתי אנחנו מתאימים יותר',
      title: 'כשאין מי שיישב מול המערכת',
      intro: 'ההבדל אינו מי יודע יותר SEO, אלא מי עושה את העבודה בפועל בכל חודש.',
      items: [
        {
          title: 'גם שופיפיי, לא רק וורדפרס',
          body: 'חנות שופיפיי מקבלת את אותה מערכת, עם אותה תוכנית תוכן ואותו מעקב.',
        },
        {
          title: 'התוכן מתפרסם לבד',
          body: 'אתם מאשרים נושאים פעם בחודש, והמאמרים עולים לאתר עם תמונות וקישורים פנימיים בלי שתיגעו בעורך.',
        },
        {
          title: 'הנוכחות המקומית כלולה',
          body: 'פוסטים ל-Google Business Profile, טיוטות תשובה לביקורות ומעקב מיקום ב-Google Maps, באותו מחיר.',
        },
        {
          title: 'בעברית, לעסק ישראלי',
          body: 'המערכת, התוכן והתמיכה בעברית, והחיוב בשקלים כולל מע״מ.',
        },
      ],
    },
    faq: {
      eyebrow: 'שאלות',
      title: 'מה ששואלים לפני שמחליפים',
      items: [
        {
          q: 'אפשר להשתמש בשניהם?',
          a: 'כן. Rank Math מטפל בסכמה, במפת האתר ובסימון בתוך וורדפרס, ואנחנו כותבים ומפרסמים את התוכן ומטפלים בנוכחות המקומית. אין בינינו התנגשות טכנית.',
        },
        {
          q: 'אתם מודדים נראות ב-AI טוב יותר מהם?',
          a: 'לא בהכרח. יש להם AI Visibility עם סנטימנט, השוואה למתחרים ותמלילים, שאין לנו. אצלנו הבדיקה החודשית כלולה במחיר הבסיסי ולא נמכרת בנפרד.',
        },
        {
          q: 'המחירים שבעמוד הזה מעודכנים?',
          a: `הם נקראו מהעמודים של Rank Math ב-${CHECKED}. חברות משנות מחירים, אז הקישורים מתחת לטבלה הם המקור.`,
        },
      ],
    },
    close: { title: 'תראו איפה האתר שלכם עומד, בלי להירשם' },
  },

  en: {
    competitor: 'Rank Math',
    eyebrow: 'Go Top SEO vs Rank Math',
    metaTitle: 'Go Top SEO vs Rank Math | Comparison',
    metaDescription:
      'Go Top SEO compared with Rank Math: who works outside WordPress, who posts to Google Business Profile, what each price includes, and when Rank Math is the better buy.',
    hero: {
      title: 'Rank Math is an excellent WordPress plugin.',
      accent: 'We are a system that does the work',
      subtitle:
        'Rank Math lives inside the WordPress editor, helps you write and mark up a page properly, and now also tracks how AI assistants mention your brand. Go Top SEO works on Shopify as well, posts to Google Business Profile, and runs a monthly content plan that publishes itself.',
    },
    table: {
      eyebrow: 'The comparison',
      title: "What each one does, from Rank Math's own pages",
      checkedOn: CHECKED,
      sources: SOURCES,
      rows: [
        {
          label: 'Starting price',
          ours: 'From $79/month plus tax outside Israel; from 249 ILS/month including VAT in Israel.',
          theirs:
            'Free plugin, then PRO at €7.99/month billed annually ex VAT (renews at €8.99). Business is €24.99/month, renewing at €27.99.',
        },
        {
          label: 'Platforms',
          ours: 'WordPress and Shopify, in one account.',
          theirs: 'Their pages describe a WordPress plugin.',
        },
        {
          label: 'Who does the work',
          ours: 'The system. You approve a topic; it writes, adds images and internal links, and publishes.',
          theirs:
            'You do, inside the editor. Content AI gives you 40+ writing tools and templates, and you run them and publish.',
        },
        {
          label: 'Monthly content plan',
          ours: 'The system proposes topics each month, you approve or remove them, and articles publish on a schedule.',
          theirs:
            'The pages we read describe writing on demand inside the editor rather than a monthly plan that publishes on its own.',
        },
        {
          label: 'Google Business Profile',
          ours: 'Included in the same price: automatic posts with your consent, and drafted replies to reviews.',
          theirs: 'The pages we read are about the website itself and make no mention of posting to a Google Business Profile.',
        },
        {
          label: 'Visibility in AI engines',
          ours: 'A monthly check against ChatGPT, Gemini and Google AI, included in the base price.',
          theirs:
            'They ship AI Visibility: a visibility score, tracking of how ChatGPT and Gemini mention the brand, sentiment, competitor comparison, full response transcripts and per-country checks. Sold as part of Rank Math AI.',
        },
        {
          label: 'Rank tracking',
          ours: 'A monthly check in Google and in Google Maps, at the same price.',
          theirs: '500 keywords on PRO and 10,000 on Business, with twelve months of position history.',
        },
        {
          label: 'Trial',
          ours: '7 days, no credit card, cancel any time.',
          theirs: 'The core plugin is free, and PRO plans include a 15-day trial of Rank Math AI.',
        },
      ],
    },
    theirStrengths: {
      eyebrow: 'When Rank Math wins',
      title: 'There are cases where Rank Math is the right choice',
      intro: 'They are a mature, well-liked product, and you should know that before you read our side.',
      items: [
        {
          title: 'When the budget is zero',
          body:
            'The core plugin is free, and by their own figure it runs on more than four million WordPress sites. For a business just starting out with no monthly budget, that is a hard starting point to argue with, and it covers schema, sitemaps and on-page analysis without paying anything.',
        },
        {
          title: 'When you want hands-on control in the editor',
          body:
            'If you write your own posts and like watching an SEO score update as you type, their experience is better than ours. We are built around automation; they are built around the person sitting there doing the work.',
        },
        {
          title: 'When internal links need managing at scale',
          body:
            'AI Link Genius shows every link on the site in one dashboard, updates hundreds at once, suggests links as you write and finds pages nothing links to. On an older site with hundreds of pages, that is a tool we have no equivalent for.',
        },
      ],
    },
    ourStrengths: {
      eyebrow: 'When we fit better',
      title: 'When nobody is going to sit in front of the tool',
      intro: 'The difference is not who knows more SEO. It is who actually does the work each month.',
      items: [
        {
          title: 'Shopify too, not only WordPress',
          body: 'A Shopify store gets the same system, the same content plan and the same tracking.',
        },
        {
          title: 'The content publishes itself',
          body: 'You approve topics once a month and the articles go up with images and internal links without you opening the editor.',
        },
        {
          title: 'Local presence is included',
          body: 'Google Business Profile posts, drafted review replies and Google Maps position tracking, at the same price.',
        },
        {
          title: 'One price, one place',
          body: 'Writing, publishing, local posting and the monthly report are in the same plan rather than separate products.',
        },
      ],
    },
    faq: {
      eyebrow: 'Questions',
      title: 'What people ask before switching',
      items: [
        {
          q: 'Can I use both?',
          a: 'Yes. Rank Math handles schema, sitemaps and on-page markup inside WordPress; we write and publish the content and handle the local presence. There is no technical conflict.',
        },
        {
          q: 'Do you measure AI visibility better than they do?',
          a: 'Not necessarily. Their AI Visibility reports sentiment, competitor comparison and transcripts, which we do not. Ours is a monthly check included in the base price rather than a separate purchase.',
        },
        {
          q: 'Are the prices on this page current?',
          a: `They were read from Rank Math's own pages on ${CHECKED}. Companies change prices, so the links under the table are the source.`,
        },
      ],
    },
    close: { title: 'See where your site stands, without signing up' },
  },

  es: {
    competitor: 'Rank Math',
    eyebrow: 'Go Top SEO frente a Rank Math',
    metaTitle: 'Go Top SEO frente a Rank Math | Comparativa',
    metaDescription:
      'Comparativa entre Go Top SEO y Rank Math: quién funciona fuera de WordPress, quién publica en el Perfil de Empresa de Google, qué incluye cada precio y cuándo conviene Rank Math.',
    hero: {
      title: 'Rank Math es un plugin excelente para WordPress.',
      accent: 'Nosotros somos un sistema que hace el trabajo',
      subtitle:
        'Rank Math vive dentro del editor de WordPress, ayuda a escribir y a marcar bien una página, y hoy también sigue cómo los asistentes de IA mencionan la marca. Go Top SEO funciona además en Shopify, publica en el Perfil de Empresa de Google y mantiene un plan mensual de contenidos que se publica solo.',
    },
    table: {
      eyebrow: 'La comparativa',
      title: 'Qué hace cada uno, según las páginas del propio Rank Math',
      checkedOn: CHECKED,
      sources: SOURCES,
      rows: [
        {
          label: 'Precio inicial',
          ours: 'Desde 79 dólares al mes más impuestos fuera de Israel.',
          theirs:
            'Plugin gratuito y PRO a 7,99 euros al mes con pago anual sin IVA (se renueva a 8,99). Business a 24,99 euros al mes, con renovación a 27,99.',
        },
        {
          label: 'Plataformas',
          ours: 'WordPress y Shopify, en la misma cuenta.',
          theirs: 'Sus páginas describen un plugin para WordPress.',
        },
        {
          label: 'Quién hace el trabajo',
          ours: 'El sistema. Usted aprueba un tema y él escribe, añade imágenes y enlaces internos y publica.',
          theirs:
            'Usted, dentro del editor. Content AI ofrece más de 40 herramientas y plantillas de escritura, y usted las ejecuta y publica.',
        },
        {
          label: 'Plan mensual de contenidos',
          ours: 'El sistema propone temas cada mes, usted aprueba o elimina, y los artículos se publican según un calendario.',
          theirs:
            'Las páginas que leímos describen escritura bajo demanda dentro del editor, no un plan mensual que se publica solo.',
        },
        {
          label: 'Perfil de Empresa de Google',
          ours: 'Incluido en el mismo precio: publicaciones automáticas con su consentimiento y borradores de respuesta a reseñas.',
          theirs: 'Las páginas que leímos tratan del sitio web y no mencionan la publicación en el Perfil de Empresa de Google.',
        },
        {
          label: 'Visibilidad en motores de IA',
          ours: 'Una revisión mensual en ChatGPT, Gemini y Google AI, incluida en el precio base.',
          theirs:
            'Tienen AI Visibility: una puntuación de visibilidad, seguimiento de cómo ChatGPT y Gemini mencionan la marca, sentimiento, comparación con competidores, transcripciones completas y revisión por país. Se vende dentro de Rank Math AI.',
        },
        {
          label: 'Seguimiento de posiciones',
          ours: 'Revisión mensual en Google y en Google Maps, al mismo precio.',
          theirs: '500 palabras clave en PRO y 10.000 en Business, con doce meses de historial de posiciones.',
        },
        {
          label: 'Prueba',
          ours: '7 días, sin tarjeta, cancelación en cualquier momento.',
          theirs: 'El plugin básico es gratuito y los planes PRO incluyen 15 días de prueba de Rank Math AI.',
        },
      ],
    },
    theirStrengths: {
      eyebrow: 'Cuándo gana Rank Math',
      title: 'Hay casos en los que Rank Math es la elección correcta',
      intro: 'Es un producto maduro y bien valorado, y conviene saberlo antes de leer nuestra parte.',
      items: [
        {
          title: 'Cuando el presupuesto es cero',
          body:
            'El plugin básico es gratuito y, según su propia cifra, funciona en más de cuatro millones de sitios WordPress. Para un negocio que empieza sin presupuesto mensual es un punto de partida difícil de discutir, y ya cubre esquema, mapa del sitio y análisis de página sin pagar nada.',
        },
        {
          title: 'Cuando se quiere control manual en el editor',
          body:
            'Quien escribe sus propios textos y disfruta viendo la puntuación SEO actualizarse mientras teclea tendrá mejor experiencia con ellos que con nosotros. Nosotros estamos construidos alrededor de la automatización; ellos, alrededor de la persona que se sienta a trabajar.',
        },
        {
          title: 'Cuando hay que gestionar enlaces internos a escala',
          body:
            'AI Link Genius muestra todos los enlaces del sitio en un panel, actualiza cientos a la vez, sugiere enlaces mientras se escribe y encuentra páginas a las que nadie enlaza. En un sitio antiguo con cientos de páginas es una herramienta sin equivalente en nuestro lado.',
        },
      ],
    },
    ourStrengths: {
      eyebrow: 'Cuándo encajamos mejor',
      title: 'Cuando nadie va a sentarse delante de la herramienta',
      intro: 'La diferencia no es quién sabe más SEO, sino quién hace el trabajo cada mes.',
      items: [
        {
          title: 'También Shopify, no solo WordPress',
          body: 'Una tienda Shopify recibe el mismo sistema, el mismo plan de contenidos y el mismo seguimiento.',
        },
        {
          title: 'El contenido se publica solo',
          body: 'Usted aprueba temas una vez al mes y los artículos se publican con imágenes y enlaces internos sin abrir el editor.',
        },
        {
          title: 'La presencia local está incluida',
          body: 'Publicaciones en el Perfil de Empresa de Google, borradores de respuesta a reseñas y seguimiento en Google Maps, al mismo precio.',
        },
        {
          title: 'Un precio, un sitio',
          body: 'Escritura, publicación, presencia local e informe mensual están en el mismo plan y no en productos separados.',
        },
      ],
    },
    faq: {
      eyebrow: 'Preguntas',
      title: 'Lo que se pregunta antes de cambiar',
      items: [
        {
          q: '¿Puedo usar los dos?',
          a: 'Sí. Rank Math se encarga del esquema, el mapa del sitio y el marcado dentro de WordPress; nosotros escribimos y publicamos el contenido y gestionamos la presencia local. No hay conflicto técnico.',
        },
        {
          q: '¿Miden ustedes la visibilidad en IA mejor que ellos?',
          a: 'No necesariamente. Su AI Visibility informa de sentimiento, comparación con competidores y transcripciones, que nosotros no damos. La nuestra es una revisión mensual incluida en el precio base en lugar de una compra aparte.',
        },
        {
          q: '¿Los precios de esta página están actualizados?',
          a: `Se leyeron en las páginas del propio Rank Math el ${CHECKED}. Las empresas cambian precios, así que los enlaces bajo la tabla son la fuente.`,
        },
      ],
    },
    close: { title: 'Vea dónde está su sitio, sin registrarse' },
  },

  'pt-BR': {
    competitor: 'Rank Math',
    eyebrow: 'Go Top SEO frente ao Rank Math',
    metaTitle: 'Go Top SEO frente ao Rank Math | Comparativo',
    metaDescription:
      'Comparativo entre Go Top SEO e Rank Math: quem funciona fora do WordPress, quem publica no Perfil da Empresa no Google, o que cada preço inclui e quando o Rank Math é a escolha certa.',
    hero: {
      title: 'O Rank Math é um excelente plugin para WordPress.',
      accent: 'Nós somos um sistema que faz o trabalho',
      subtitle:
        'O Rank Math fica dentro do editor do WordPress, ajuda a escrever e a marcar a página corretamente e hoje também acompanha como os assistentes de IA mencionam a marca. O Go Top SEO funciona também no Shopify, publica no Perfil da Empresa no Google e mantém um plano mensal de conteúdo que se publica sozinho.',
    },
    table: {
      eyebrow: 'O comparativo',
      title: 'O que cada um faz, segundo as páginas do próprio Rank Math',
      checkedOn: CHECKED,
      sources: SOURCES,
      rows: [
        {
          label: 'Preço inicial',
          ours: 'A partir de 79 dólares por mês mais impostos fora de Israel.',
          theirs:
            'Plugin gratuito e PRO por 7,99 euros por mês no pagamento anual sem impostos (renova por 8,99). Business por 24,99 euros por mês, com renovação por 27,99.',
        },
        {
          label: 'Plataformas',
          ours: 'WordPress e Shopify, na mesma conta.',
          theirs: 'As páginas deles descrevem um plugin para WordPress.',
        },
        {
          label: 'Quem faz o trabalho',
          ours: 'O sistema. Você aprova um tema e ele escreve, acrescenta imagens e links internos e publica.',
          theirs:
            'Você, dentro do editor. O Content AI oferece mais de 40 ferramentas e modelos de escrita, e você os executa e publica.',
        },
        {
          label: 'Plano mensal de conteúdo',
          ours: 'O sistema propõe temas a cada mês, você aprova ou remove, e os artigos são publicados conforme um calendário.',
          theirs:
            'As páginas que lemos descrevem escrita sob demanda dentro do editor, e não um plano mensal que se publica sozinho.',
        },
        {
          label: 'Perfil da Empresa no Google',
          ours: 'Incluído no mesmo preço: publicações automáticas com o seu consentimento e rascunhos de resposta a avaliações.',
          theirs: 'As páginas que lemos tratam do site em si e não mencionam publicação no Perfil da Empresa no Google.',
        },
        {
          label: 'Visibilidade nos motores de IA',
          ours: 'Uma verificação mensal no ChatGPT, no Gemini e no Google AI, incluída no preço base.',
          theirs:
            'Eles têm o AI Visibility: pontuação de visibilidade, acompanhamento de como o ChatGPT e o Gemini mencionam a marca, sentimento, comparação com concorrentes, transcrições completas e verificação por país. Vendido dentro do Rank Math AI.',
        },
        {
          label: 'Acompanhamento de posições',
          ours: 'Verificação mensal no Google e no Google Maps, pelo mesmo preço.',
          theirs: '500 palavras-chave no PRO e 10.000 no Business, com doze meses de histórico de posições.',
        },
        {
          label: 'Teste',
          ours: '7 dias, sem cartão, cancelamento a qualquer momento.',
          theirs: 'O plugin básico é gratuito e os planos PRO incluem 15 dias de teste do Rank Math AI.',
        },
      ],
    },
    theirStrengths: {
      eyebrow: 'Quando o Rank Math vence',
      title: 'Há casos em que o Rank Math é a escolha certa',
      intro: 'É um produto maduro e bem avaliado, e convém saber disso antes de ler o nosso lado.',
      items: [
        {
          title: 'Quando o orçamento é zero',
          body:
            'O plugin básico é gratuito e, pelo número que eles mesmos publicam, roda em mais de quatro milhões de sites WordPress. Para um negócio que está começando sem orçamento mensal, é um ponto de partida difícil de contestar, e já cobre esquema, mapa do site e análise de página sem pagar nada.',
        },
        {
          title: 'Quando se quer controle manual no editor',
          body:
            'Quem escreve os próprios textos e gosta de ver a pontuação de SEO mudar enquanto digita terá uma experiência melhor com eles do que conosco. Nós fomos construídos em torno da automação; eles, em torno da pessoa sentada fazendo o trabalho.',
        },
        {
          title: 'Quando é preciso gerir links internos em escala',
          body:
            'O AI Link Genius mostra todos os links do site em um painel, atualiza centenas de uma vez, sugere links enquanto você escreve e encontra páginas que ninguém referencia. Em um site antigo com centenas de páginas, é uma ferramenta sem equivalente do nosso lado.',
        },
      ],
    },
    ourStrengths: {
      eyebrow: 'Quando nos encaixamos melhor',
      title: 'Quando ninguém vai sentar na frente da ferramenta',
      intro: 'A diferença não é quem sabe mais SEO, e sim quem faz o trabalho todo mês.',
      items: [
        {
          title: 'Shopify também, não só WordPress',
          body: 'Uma loja Shopify recebe o mesmo sistema, o mesmo plano de conteúdo e o mesmo acompanhamento.',
        },
        {
          title: 'O conteúdo se publica sozinho',
          body: 'Você aprova temas uma vez por mês e os artigos sobem com imagens e links internos sem abrir o editor.',
        },
        {
          title: 'A presença local está incluída',
          body: 'Publicações no Perfil da Empresa no Google, rascunhos de resposta a avaliações e acompanhamento no Google Maps, pelo mesmo preço.',
        },
        {
          title: 'Um preço, um lugar',
          body: 'Escrita, publicação, presença local e relatório mensal ficam no mesmo plano, não em produtos separados.',
        },
      ],
    },
    faq: {
      eyebrow: 'Perguntas',
      title: 'O que perguntam antes de trocar',
      items: [
        {
          q: 'Posso usar os dois?',
          a: 'Pode. O Rank Math cuida do esquema, do mapa do site e da marcação dentro do WordPress; nós escrevemos e publicamos o conteúdo e cuidamos da presença local. Não há conflito técnico.',
        },
        {
          q: 'Vocês medem visibilidade em IA melhor do que eles?',
          a: 'Não necessariamente. O AI Visibility deles traz sentimento, comparação com concorrentes e transcrições, que nós não entregamos. A nossa é uma verificação mensal incluída no preço base, e não uma compra à parte.',
        },
        {
          q: 'Os preços desta página estão atualizados?',
          a: `Foram lidos nas páginas do próprio Rank Math em ${CHECKED}. Empresas mudam preços, então os links abaixo da tabela são a fonte.`,
        },
      ],
    },
    close: { title: 'Veja onde o seu site está, sem se cadastrar' },
  },

  fr: {
    competitor: 'Rank Math',
    eyebrow: 'Go Top SEO face à Rank Math',
    metaTitle: 'Go Top SEO face à Rank Math | Comparatif',
    metaDescription:
      'Comparatif entre Go Top SEO et Rank Math : qui fonctionne en dehors de WordPress, qui publie sur la fiche d’établissement Google, ce que chaque prix comprend et quand Rank Math est le bon choix.',
    hero: {
      title: 'Rank Math est une excellente extension WordPress.',
      accent: 'Nous sommes un système qui fait le travail',
      subtitle:
        'Rank Math vit dans l’éditeur de WordPress, aide à rédiger et à baliser correctement une page, et suit aujourd’hui aussi la façon dont les assistants IA citent la marque. Go Top SEO fonctionne également sur Shopify, publie sur la fiche d’établissement Google et tient un plan de contenu mensuel qui se publie tout seul.',
    },
    table: {
      eyebrow: 'Le comparatif',
      title: 'Ce que fait chacun, d’après les pages de Rank Math elles-mêmes',
      checkedOn: CHECKED,
      sources: SOURCES,
      rows: [
        {
          label: 'Prix de départ',
          ours: 'À partir de 79 dollars par mois hors taxes en dehors d’Israël.',
          theirs:
            'Extension gratuite, puis PRO à 7,99 euros par mois en paiement annuel hors TVA (renouvellement à 8,99). Business à 24,99 euros par mois, renouvelé à 27,99.',
        },
        {
          label: 'Plateformes',
          ours: 'WordPress et Shopify, dans le même compte.',
          theirs: 'Leurs pages décrivent une extension WordPress.',
        },
        {
          label: 'Qui fait le travail',
          ours: 'Le système. Vous validez un sujet, il rédige, ajoute images et liens internes, puis publie.',
          theirs:
            'Vous, dans l’éditeur. Content AI propose plus de 40 outils et modèles de rédaction, que vous lancez et publiez vous-même.',
        },
        {
          label: 'Plan de contenu mensuel',
          ours: 'Le système propose des sujets chaque mois, vous validez ou supprimez, et les articles paraissent selon un calendrier.',
          theirs:
            'Les pages que nous avons lues décrivent une rédaction à la demande dans l’éditeur, et non un plan mensuel qui se publie seul.',
        },
        {
          label: 'Fiche d’établissement Google',
          ours: 'Comprise dans le même prix : publications automatiques avec votre accord et brouillons de réponse aux avis.',
          theirs: 'Les pages que nous avons lues portent sur le site lui-même et ne mentionnent pas la publication sur la fiche d’établissement Google.',
        },
        {
          label: 'Visibilité dans les moteurs IA',
          ours: 'Une vérification mensuelle sur ChatGPT, Gemini et Google AI, comprise dans le prix de base.',
          theirs:
            'Ils proposent AI Visibility : un score de visibilité, le suivi de la façon dont ChatGPT et Gemini citent la marque, le sentiment, la comparaison avec les concurrents, les transcriptions complètes et une vérification par pays. Vendu au sein de Rank Math AI.',
        },
        {
          label: 'Suivi de positions',
          ours: 'Une vérification mensuelle dans Google et dans Google Maps, au même prix.',
          theirs: '500 mots-clés en PRO et 10 000 en Business, avec douze mois d’historique de positions.',
        },
        {
          label: 'Essai',
          ours: '7 jours, sans carte bancaire, résiliable à tout moment.',
          theirs: 'L’extension de base est gratuite et les offres PRO comprennent 15 jours d’essai de Rank Math AI.',
        },
      ],
    },
    theirStrengths: {
      eyebrow: 'Quand Rank Math l’emporte',
      title: 'Il y a des cas où Rank Math est le bon choix',
      intro: 'C’est un produit mature et apprécié, et mieux vaut le savoir avant de lire notre côté.',
      items: [
        {
          title: 'Quand le budget est nul',
          body:
            'L’extension de base est gratuite et, selon leur propre chiffre, elle tourne sur plus de quatre millions de sites WordPress. Pour une entreprise qui démarre sans budget mensuel, c’est un point de départ difficile à contester, et il couvre déjà le balisage, le plan de site et l’analyse de page sans rien payer.',
        },
        {
          title: 'Quand on veut garder la main dans l’éditeur',
          body:
            'Celui qui rédige lui-même et aime voir un score SEO évoluer au fil de la frappe aura une meilleure expérience chez eux que chez nous. Nous sommes construits autour de l’automatisation ; eux, autour de la personne assise qui travaille.',
        },
        {
          title: 'Quand les liens internes se gèrent à grande échelle',
          body:
            'AI Link Genius affiche tous les liens du site dans un seul tableau de bord, en met des centaines à jour d’un coup, suggère des liens pendant la rédaction et repère les pages que personne ne cite. Sur un site ancien de plusieurs centaines de pages, c’est un outil sans équivalent chez nous.',
        },
      ],
    },
    ourStrengths: {
      eyebrow: 'Quand nous convenons mieux',
      title: 'Quand personne ne s’assiéra devant l’outil',
      intro: 'La différence n’est pas qui connaît le mieux le SEO, mais qui fait le travail chaque mois.',
      items: [
        {
          title: 'Shopify aussi, pas seulement WordPress',
          body: 'Une boutique Shopify reçoit le même système, le même plan de contenu et le même suivi.',
        },
        {
          title: 'Le contenu se publie seul',
          body: 'Vous validez des sujets une fois par mois et les articles paraissent avec images et liens internes sans ouvrir l’éditeur.',
        },
        {
          title: 'La présence locale est comprise',
          body: 'Publications sur la fiche d’établissement Google, brouillons de réponse aux avis et suivi de position dans Google Maps, au même prix.',
        },
        {
          title: 'Un prix, un seul endroit',
          body: 'Rédaction, publication, présence locale et rapport mensuel tiennent dans la même offre plutôt que dans des produits séparés.',
        },
      ],
    },
    faq: {
      eyebrow: 'Questions',
      title: 'Ce que l’on demande avant de changer',
      items: [
        {
          q: 'Puis-je utiliser les deux ?',
          a: 'Oui. Rank Math s’occupe du balisage, du plan de site et de l’optimisation dans WordPress ; nous rédigeons et publions le contenu et gérons la présence locale. Il n’y a aucun conflit technique.',
        },
        {
          q: 'Mesurez-vous la visibilité IA mieux qu’eux ?',
          a: 'Pas nécessairement. Leur AI Visibility donne le sentiment, la comparaison concurrentielle et les transcriptions, ce que nous ne faisons pas. La nôtre est une vérification mensuelle comprise dans le prix de base plutôt qu’un achat distinct.',
        },
        {
          q: 'Les prix de cette page sont-ils à jour ?',
          a: `Ils ont été lus sur les pages de Rank Math le ${CHECKED}. Les entreprises changent leurs prix : les liens sous le tableau font foi.`,
        },
      ],
    },
    close: { title: 'Voyez où en est votre site, sans inscription' },
  },
  it: {
    competitor: 'Rank Math',
    eyebrow: 'Go Top SEO a confronto con Rank Math',
    metaTitle: 'Go Top SEO a confronto con Rank Math | Confronto',
    metaDescription:
      'Confronto fra Go Top SEO e Rank Math: chi funziona anche fuori da WordPress, chi pubblica sul profilo dell’attività su Google, che cosa comprende ogni prezzo e quando Rank Math è la scelta giusta.',
    hero: {
      title: 'Rank Math è un’eccellente estensione per WordPress.',
      accent: 'Noi siamo un sistema che fa il lavoro',
      subtitle:
        'Rank Math vive nell’editor di WordPress, aiuta a scrivere e a marcare correttamente una pagina e oggi segue anche il modo in cui gli assistenti IA citano il marchio. Go Top SEO funziona anche su Shopify, pubblica sul profilo dell’attività su Google e tiene un piano di contenuti mensile che si pubblica da sé.',
    },
    table: {
      eyebrow: 'Il confronto',
      title: 'Che cosa fa ciascuno, secondo le pagine di Rank Math stessa',
      checkedOn: CHECKED,
      sources: SOURCES,
      rows: [
        {
          label: 'Prezzo di partenza',
          ours: 'A partire da 79 dollari al mese più imposte fuori da Israele.',
          theirs:
            'Estensione gratuita e poi PRO a 7,99 euro al mese con pagamento annuale senza IVA (si rinnova a 8,99). Business a 24,99 euro al mese, con rinnovo a 27,99.',
        },
        {
          label: 'Piattaforme',
          ours: 'WordPress e Shopify, nello stesso account.',
          theirs: 'Le loro pagine descrivono un’estensione per WordPress.',
        },
        {
          label: 'Chi fa il lavoro',
          ours: 'Il sistema. Si approva un argomento, il sistema scrive, aggiunge immagini e link interni e poi pubblica.',
          theirs:
            'Il cliente, nell’editor. Content AI offre più di 40 strumenti e modelli di scrittura, da avviare e pubblicare in autonomia.',
        },
        {
          label: 'Piano di contenuti mensile',
          ours: 'Il sistema propone argomenti ogni mese, che si approvano o si eliminano, e gli articoli escono secondo un calendario.',
          theirs:
            'Le pagine che abbiamo letto descrivono una scrittura su richiesta dentro l’editor, non un piano mensile che si pubblica da sé.',
        },
        {
          label: 'Profilo dell’attività su Google',
          ours: 'Compreso nello stesso prezzo: pubblicazioni automatiche previa approvazione e bozze di risposta alle recensioni.',
          theirs: 'Le pagine che abbiamo letto riguardano il sito stesso e non parlano della pubblicazione sul profilo dell’attività su Google.',
        },
        {
          label: 'Visibilità nei motori IA',
          ours: 'Un controllo mensile su ChatGPT, Gemini e Google AI, compreso nel prezzo base.',
          theirs:
            'Offrono AI Visibility: un punteggio di visibilità, il monitoraggio del modo in cui ChatGPT e Gemini citano il marchio, il sentiment, il confronto con i concorrenti, le trascrizioni complete e un controllo per paese. Venduto all’interno di Rank Math AI.',
        },
        {
          label: 'Monitoraggio delle posizioni',
          ours: 'Un controllo mensile su Google e su Google Maps, allo stesso prezzo.',
          theirs: '500 parole chiave in PRO e 10.000 in Business, con dodici mesi di storico delle posizioni.',
        },
        {
          label: 'Prova',
          ours: '7 giorni, senza carta di credito, con disdetta in qualsiasi momento.',
          theirs: 'L’estensione di base è gratuita e i piani PRO comprendono 15 giorni di prova di Rank Math AI.',
        },
      ],
    },
    theirStrengths: {
      eyebrow: 'Quando vince Rank Math',
      title: 'Ci sono casi in cui Rank Math è la scelta giusta',
      intro: 'È un prodotto maturo e apprezzato, e conviene saperlo prima di leggere la nostra parte.',
      items: [
        {
          title: 'Quando il budget è zero',
          body:
            'L’estensione di base è gratuita e, secondo il loro stesso dato, funziona su oltre quattro milioni di siti WordPress. Per un’azienda che parte senza budget mensile è un punto di partenza difficile da contestare, e copre già il markup, la sitemap e l’analisi della pagina senza pagare nulla.',
        },
        {
          title: 'Quando si vuole restare al comando nell’editor',
          body:
            'Chi scrive da sé e ama vedere un punteggio SEO muoversi mentre digita avrà un’esperienza migliore con loro che con noi. Noi siamo costruiti intorno all’automazione; loro intorno alla persona che si siede e lavora.',
        },
        {
          title: 'Quando i link interni si gestiscono su larga scala',
          body:
            'AI Link Genius mostra tutti i link del sito in una sola dashboard, ne aggiorna centinaia in una volta, suggerisce link durante la scrittura e individua le pagine che nessuno cita. Su un sito storico di diverse centinaia di pagine è uno strumento che da noi non ha equivalenti.',
        },
      ],
    },
    ourStrengths: {
      eyebrow: 'Quando siamo più adatti noi',
      title: 'Quando nessuno si siederà davanti allo strumento',
      intro: 'La differenza non è chi conosce meglio la SEO, ma chi fa il lavoro ogni mese.',
      items: [
        {
          title: 'Anche Shopify, non solo WordPress',
          body: 'Un negozio Shopify riceve lo stesso sistema, lo stesso piano di contenuti e lo stesso monitoraggio.',
        },
        {
          title: 'I contenuti si pubblicano da soli',
          body: 'Gli argomenti si approvano una volta al mese e gli articoli escono con immagini e link interni senza aprire l’editor.',
        },
        {
          title: 'La presenza locale è compresa',
          body: 'Pubblicazioni sul profilo dell’attività su Google, bozze di risposta alle recensioni e monitoraggio della posizione su Google Maps, allo stesso prezzo.',
        },
        {
          title: 'Un prezzo, un solo posto',
          body: 'Scrittura, pubblicazione, presenza locale e report mensile stanno nella stessa offerta anziché in prodotti separati.',
        },
      ],
    },
    faq: {
      eyebrow: 'Domande',
      title: 'Che cosa si chiede prima di cambiare',
      items: [
        {
          q: 'Si possono usare entrambi?',
          a: 'Sì. Rank Math si occupa del markup, della sitemap e dell’ottimizzazione dentro WordPress; noi scriviamo e pubblichiamo i contenuti e curiamo la presenza locale. Non c’è alcun conflitto tecnico.',
        },
        {
          q: 'Misurate la visibilità nelle IA meglio di loro?',
          a: 'Non necessariamente. Il loro AI Visibility dà il sentiment, il confronto con i concorrenti e le trascrizioni, cose che noi non facciamo. Il nostro è un controllo mensile compreso nel prezzo base anziché un acquisto a parte.',
        },
        {
          q: 'I prezzi di questa pagina sono aggiornati?',
          a: `Sono stati letti sulle pagine di Rank Math il ${CHECKED}. Le aziende cambiano i prezzi: i link sotto la tabella fanno fede.`,
        },
      ],
    },
    close: { title: 'Scopra a che punto è il suo sito, senza registrazione' },
  },
}
