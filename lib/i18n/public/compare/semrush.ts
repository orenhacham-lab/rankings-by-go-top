/**
 * Go Top SEO compared with Semrush, in every language the public site speaks.
 *
 * EVERY STATEMENT IN THE `theirs` COLUMN comes from a page Semrush owns, read
 * on the date in `checkedOn`, and the sources are listed under the table. Two
 * things are deliberately NOT said anywhere here, because they could not be
 * verified from Semrush's own pages on that date:
 *
 *   - that their trial requires a credit card. Semrush's "No credit card
 *     required" is attached to the Free plan; their trial pages and KB 1011 do
 *     not state it. Third-party blogs say a card is needed; that is not a
 *     source we publish against a named company.
 *   - what the equivalent bundle would cost. Adding up the SEO plan, the Local
 *     Toolkit per location and the Content toolkit is our arithmetic, not their
 *     price, and the Content toolkit's price is not published at all.
 *
 * Their plan names were repackaged this month (Free / SEO / Starter / Pro+ /
 * Advanced — not the Pro / Guru / Business that third-party articles still
 * quote), which is exactly why the table is dated and linked.
 */
import type { PublicLocale } from '@/lib/i18n/locales'
import type { ComparisonCopy } from './types'

const CHECKED = '2026-10-21'

const SOURCES = [
  { label: 'semrush.com/pricing', href: 'https://www.semrush.com/pricing/' },
  { label: 'Local Toolkit pricing (KB 1611)', href: 'https://www.semrush.com/kb/1611-local-toolkit-pricing-and-plans' },
  { label: 'Subscriptions (KB 1011)', href: 'https://www.semrush.com/kb/1011-subscriptions' },
  { label: 'Site Audit', href: 'https://www.semrush.com/features/site-audit/' },
  { label: 'Content toolkit plugin', href: 'https://wordpress.org/plugins/semrush-contentshake/' },
]

export const SEMRUSH_COMPARE: Record<PublicLocale, ComparisonCopy> = {
  he: {
    competitor: 'Semrush',
    eyebrow: 'Go Top SEO מול Semrush',
    metaTitle: 'Go Top SEO מול Semrush | השוואה',
    metaDescription:
      'השוואה בין Go Top SEO ל-Semrush: מי כותב ומפרסם את התוכן, מי מטפל ב-Google Business Profile, מה כולל כל מחיר ומתי Semrush הוא הבחירה הנכונה.',
    hero: {
      title: 'Semrush נותן לכם כלים.',
      accent: 'אנחנו עושים את העבודה',
      subtitle:
        'Semrush הוא אחד ממאגרי הנתונים הגדולים בתחום, והוא מראה לעסק מה לא בסדר. Go Top SEO נבנה בשביל בעל עסק שאין לו זמן לעשות את זה בעצמו: המערכת כותבת את המאמרים, מפרסמת אותם באתר, מעלה פוסטים ל-Google Business Profile ועוקבת אחרי הדירוגים.',
    },
    table: {
      eyebrow: 'ההשוואה',
      title: 'מה כל אחד עושה, לפי העמודים של Semrush עצמם',
      checkedOn: CHECKED,
      sources: SOURCES,
      rows: [
        {
          label: 'מחיר התחלתי',
          ours: 'בישראל החל מ-249 ש״ח לחודש כולל מע״מ. מחוץ לישראל מ-79 דולר לחודש בתוספת מס. הכל במחיר אחד.',
          theirs:
            'תוכנית SEO ב-139 דולר לחודש (117.33 בתשלום שנתי), עם 5 אתרים ו-500 ביטויים. יש גם תוכנית חינמית מוגבלת.',
        },
        {
          label: 'מי עושה את העבודה',
          ours: 'המערכת. אתם מאשרים נושא, והיא כותבת, מוסיפה תמונות וקישורים פנימיים ומפרסמת.',
          theirs:
            'משולב. סוכן ה-GBP מפרסם פוסטים לבד, המאמרים מתפרסמים בלחיצה, והתיקונים באתר עוברים אליכם או למתכנת.',
        },
        {
          label: 'מאמרים',
          ours: 'מתוכננים וכתובים אוטומטית, כולל תמונות וקישורים פנימיים, לפי תוכנית חודשית שאתם מאשרים.',
          theirs:
            'התוסף שלהם לוורדפרס עושה מחקר נושאים, כותב טיוטות ארוכות ומייצר תמונות AI. דורש חשבון בתשלום.',
        },
        {
          label: 'פרסום לאתר',
          ours: 'אוטומטי לוורדפרס ולשופיפיי, בלי שתיגעו בעורך.',
          theirs:
            'התוסף שלהם מפרסם לוורדפרס בלחיצה אחת, אחרי שבוחרים "Share" ואז WordPress.',
        },
        {
          label: 'Google Business Profile',
          ours: 'כלול באותו מחיר: פוסטים אוטומטיים לפרופיל, בהסכמה שלכם.',
          theirs:
            'ה-Local Toolkit נמכר בנפרד ולפי סניף: 30 דולר לחודש לסניף ב-Base ו-60 ב-Pro. סוכן ה-GBP מפרסם פוסטים ומשיב לביקורות חדשות.',
        },
        {
          label: 'תיקונים באתר',
          ours: 'חלק מהתיקונים נעשים דרך התוסף שלנו לוורדפרס, בלי לקרוא קוד.',
          theirs:
            'ה-Site Audit מדרג תקלות לפי חומרה ומסביר איך לתקן כל אחת. בעמוד שלהם אין טענה שהם מתקנים את האתר עצמו.',
        },
        {
          label: 'מעקב דירוגים',
          ours: 'בדיקה חודשית בגוגל, ב-Google Maps ובתשובות של מנועי AI (בהם ChatGPT, Gemini ו-Google AI), באותו מחיר.',
          theirs:
            '500 ביטויים במעקב יומי בתוכנית SEO. מעקב אחרי תשובות AI מתחיל בתוכנית Starter ב-199 דולר לחודש. מעקב במפות הוא חלק מה-Local הנפרד.',
        },
        {
          label: 'ניסיון',
          ours: '7 ימים, בלי כרטיס אשראי, ביטול בכל רגע.',
          theirs: '«Try Semrush free for seven days. Cancel anytime». ייצוא נתונים חסום בזמן הניסיון.',
        },
      ],
    },
    theirStrengths: {
      eyebrow: 'מתי Semrush עדיף',
      title: 'יש מצבים שבהם Semrush הוא הבחירה הנכונה',
      intro: 'אנחנו לא מנסים להיות Semrush, ואם זה מה שאתם צריכים, עדיף שתדעו את זה עכשיו.',
      items: [
        {
          title: 'כשרוצים לחקור, לא שיעשו בשבילכם',
          body:
            'מחקר מתחרים וביטויים, נתוני קישורים נכנסים, ניתוחי תנועה ושוק, נתונים היסטוריים ו-API. אם אתם או המשרד שלכם רוצים לחפור בשוק, הם עונים על שאלות שאנחנו לא.',
        },
        {
          title: 'כשצריך מעקב יומי ורחב',
          body:
            'תוכנית ה-SEO שלהם עוקבת אחרי 500 ביטויים כל יום. הבדיקה שלנו היא חודשית. אם אתם צריכים לראות תזוזה יומית, זה הפרש אמיתי לטובתם.',
        },
        {
          title: 'כשיש הרבה סניפים ורוצים הפצה לאינדקסים',
          body:
            'ב-Local Pro הם מפיצים את פרטי העסק ליותר מ-70 אינדקסים בלחיצה אחת. אנחנו לא עושים את זה בכלל.',
        },
      ],
    },
    ourStrengths: {
      eyebrow: 'מתי אנחנו מתאימים יותר',
      title: 'כשאין מי שיישב מול המערכת',
      intro: 'רוב בעלי העסקים שמדברים איתנו לא צריכים עוד דשבורד. הם צריכים שמישהו יעשה את זה.',
      items: [
        {
          title: 'מחיר אחד, בלי תוספות לפי סניף',
          body: 'המאמרים, הפוסטים ל-Google Business Profile והמעקב נמצאים באותו מחיר, ולא כל אחד בתוכנית אחרת.',
        },
        {
          title: 'התוכן מתפרסם לבד',
          body: 'אתם מאשרים נושאים פעם בחודש, והמאמרים עולים לאתר עם תמונות וקישורים פנימיים בלי שתיגעו בזה.',
        },
        {
          title: 'בעברית, לעסק ישראלי',
          body: 'המערכת, התוכן והתמיכה בעברית, והחיוב בשקלים כולל מע״מ.',
        },
        {
          title: 'בלי מתכנת',
          body: 'ההתקנה היא תוסף לוורדפרס או אפליקציה בשופיפיי. אין מה להטמיע ואין למי לפנות.',
        },
      ],
    },
    faq: {
      eyebrow: 'שאלות',
      title: 'מה ששואלים לפני שמחליפים',
      items: [
        {
          q: 'אפשר להשתמש בשניהם?',
          a: 'כן, והרבה משרדי פרסום עושים בדיוק את זה: Semrush למחקר, ואנחנו לביצוע השוטף. אין בינינו התנגשות טכנית.',
        },
        {
          q: 'אתם מודדים נראות ב-AI טוב יותר מהם?',
          a: 'לא. אנחנו בודקים פעם בחודש, והם בודקים כל יום מתוכנית Starter. היתרון שלנו הוא שהבדיקה כלולה במחיר הבסיסי ולא דורשת שדרוג.',
        },
        {
          q: 'המחירים שבעמוד הזה מעודכנים?',
          a: `הם נקראו מהעמודים של Semrush ב-${CHECKED}. חברות משנות מחירים, ו-Semrush שינתה לאחרונה את שמות התוכניות שלה, אז הקישורים מתחת לטבלה הם המקור.`,
        },
      ],
    },
    close: { title: 'תראו איפה האתר שלכם עומד, בלי להירשם' },
  },

  en: {
    competitor: 'Semrush',
    eyebrow: 'Go Top SEO vs Semrush',
    metaTitle: 'Go Top SEO vs Semrush | Comparison',
    metaDescription:
      'Go Top SEO compared with Semrush: who writes and publishes the content, who handles Google Business Profile, what each price includes, and when Semrush is the better buy.',
    hero: {
      title: 'Semrush hands you the tools.',
      accent: 'We do the work',
      subtitle:
        'Semrush is one of the deepest datasets in the industry and it will show you what is wrong. Go Top SEO is built for an owner who has no time to act on it: the system writes the articles, publishes them to the site, posts to Google Business Profile and tracks where you rank.',
    },
    table: {
      eyebrow: 'The comparison',
      title: "What each one does, taken from Semrush's own pages",
      checkedOn: CHECKED,
      sources: SOURCES,
      rows: [
        {
          label: 'Starting price',
          ours: 'From $79 a month plus tax, everything in one price. In Israel, from 249 ILS a month including VAT.',
          theirs:
            'SEO plan at $139/mo ($117.33 billed annually), with 5 websites and 500 keywords. A limited free plan is also offered.',
        },
        {
          label: 'Who does the work',
          ours: 'The system. You approve a topic; it writes, adds images and internal links, and publishes.',
          theirs:
            'Mixed. Their GBP agent posts on its own, articles publish in one click, and on-site fixes are handed to you or your developer.',
        },
        {
          label: 'Articles',
          ours: 'Planned and written automatically, with images and internal links, from a monthly plan you approve.',
          theirs:
            'Their WordPress plugin does topic research, drafts long-form content and generates AI images. It needs a paid account.',
        },
        {
          label: 'Publishing to the site',
          ours: 'Automatic to WordPress and Shopify. You never open the editor.',
          theirs: 'Their plugin publishes to WordPress in one click, via Share and then the WordPress option.',
        },
        {
          label: 'Google Business Profile',
          ours: 'Included in the same price: automatic posts to the profile, with your consent.',
          theirs:
            'The Local Toolkit is bought separately and priced per location: $30/mo per location on Base, $60 on Pro. Their GBP agent publishes posts and replies to new reviews.',
        },
        {
          label: 'On-site fixes',
          ours: 'Some fixes are applied through our WordPress plugin, with no code to read.',
          theirs:
            'Site Audit ranks issues by severity and gives tips for fixing each one. Their page makes no claim that Semrush changes your site.',
        },
        {
          label: 'Rank tracking',
          ours:
            'A monthly check in Google, in Google Maps and in AI answers (ChatGPT, Gemini and Google AI among them), at the same price.',
          theirs:
            '500 keywords tracked daily on the SEO plan. AI-answer tracking starts on Starter at $199/mo. Map tracking is part of the separate Local Toolkit.',
        },
        {
          label: 'Trial',
          ours: '7 days, no credit card, cancel anytime.',
          theirs: '"Try Semrush free for seven days. Cancel anytime." Exports are disabled during a trial.',
        },
      ],
    },
    theirStrengths: {
      eyebrow: 'When Semrush is the better buy',
      title: 'There are cases where Semrush is simply the right answer',
      intro: 'We are not trying to be Semrush, and if that is what you need, better to know it now.',
      items: [
        {
          title: 'When you want to investigate, not be served',
          body:
            'Competitor and keyword research, backlink data, traffic and market analytics, historical data and an API. If you or your agency want to dig into a market, they answer questions we do not.',
        },
        {
          title: 'When you need daily, wide tracking',
          body:
            'Their SEO plan tracks 500 keywords every day. Our check is monthly. If you need to see daily movement, that gap is real and it is theirs.',
        },
        {
          title: 'When you have many locations and want directory distribution',
          body: 'Local Pro pushes your business details to 70+ directories in one click. We do not offer that at all.',
        },
      ],
    },
    ourStrengths: {
      eyebrow: 'When we fit better',
      title: 'When nobody is going to sit in front of the dashboard',
      intro: 'Most owners who talk to us do not need another dashboard. They need the work done.',
      items: [
        {
          title: 'One price, with no per-location add-on',
          body: 'Articles, Google Business Profile posts and rank tracking sit in the same price, not in three different plans.',
        },
        {
          title: 'The content publishes itself',
          body: 'You approve topics once a month and the articles go live with images and internal links without you touching them.',
        },
        {
          title: 'Built for a small team',
          body: 'Nothing to configure beyond connecting the site, and no weekly routine to keep up.',
        },
        {
          title: 'No developer',
          body: 'Setup is a WordPress plugin or a Shopify app. There is nothing to implement and nobody to brief.',
        },
      ],
    },
    faq: {
      eyebrow: 'Questions',
      title: 'What people ask before switching',
      items: [
        {
          q: 'Can I use both?',
          a: 'Yes, and plenty of agencies do exactly that: Semrush for research, us for the work that has to happen every week. Nothing clashes technically.',
        },
        {
          q: 'Do you track AI visibility better than they do?',
          a: 'No. We check monthly; they check daily from their Starter plan. Our advantage is that the check is in the base price and needs no upgrade.',
        },
        {
          q: 'Are the prices on this page current?',
          a: `They were read from Semrush's own pages on ${CHECKED}. Companies change prices, and Semrush recently repackaged its plan names, so the links under the table are the source.`,
        },
      ],
    },
    close: { title: 'See where your site stands, without signing up' },
  },

  es: {
    competitor: 'Semrush',
    eyebrow: 'Go Top SEO frente a Semrush',
    metaTitle: 'Go Top SEO frente a Semrush | Comparativa',
    metaDescription:
      'Go Top SEO comparado con Semrush: quién escribe y publica el contenido, quién gestiona el perfil de Google Business, qué incluye cada precio y cuándo Semrush es la mejor opción.',
    hero: {
      title: 'Semrush te da las herramientas.',
      accent: 'Nosotros hacemos el trabajo',
      subtitle:
        'Semrush tiene uno de los conjuntos de datos más profundos del sector y te muestra qué falla. Go Top SEO está hecho para quien no tiene tiempo de actuar: el sistema escribe los artículos, los publica en la web, publica en el perfil de Google Business y sigue tus posiciones.',
    },
    table: {
      eyebrow: 'La comparativa',
      title: 'Qué hace cada uno, según las propias páginas de Semrush',
      checkedOn: CHECKED,
      sources: SOURCES,
      rows: [
        {
          label: 'Precio de entrada',
          ours: 'Desde 79 dólares al mes más impuestos, todo en un solo precio.',
          theirs:
            'Plan SEO por 139 dólares al mes (117,33 con pago anual), con 5 sitios y 500 palabras clave. También hay un plan gratuito limitado.',
        },
        {
          label: 'Quién hace el trabajo',
          ours: 'El sistema. Tú apruebas un tema; él escribe, añade imágenes y enlaces internos, y publica.',
          theirs:
            'Mixto. Su agente de GBP publica solo, los artículos se publican con un clic y las correcciones del sitio pasan a ti o a tu programador.',
        },
        {
          label: 'Artículos',
          ours: 'Planificados y escritos de forma automática, con imágenes y enlaces internos, según un plan mensual que tú apruebas.',
          theirs:
            'Su plugin de WordPress investiga temas, redacta borradores largos y genera imágenes con IA. Requiere una cuenta de pago.',
        },
        {
          label: 'Publicación en la web',
          ours: 'Automática en WordPress y Shopify. No abres el editor.',
          theirs: 'Su plugin publica en WordPress con un clic, desde «Share» y la opción de WordPress.',
        },
        {
          label: 'Perfil de Google Business',
          ours: 'Incluido en el mismo precio: publicaciones automáticas en el perfil, con tu consentimiento.',
          theirs:
            'El Local Toolkit se compra aparte y por ubicación: 30 dólares al mes por ubicación en Base y 60 en Pro. Su agente publica entradas y responde a las reseñas nuevas.',
        },
        {
          label: 'Correcciones en el sitio',
          ours: 'Algunas correcciones se aplican desde nuestro plugin de WordPress, sin leer código.',
          theirs:
            'Site Audit ordena los problemas por gravedad y explica cómo arreglar cada uno. Su página no afirma que Semrush cambie tu sitio.',
        },
        {
          label: 'Seguimiento de posiciones',
          ours:
            'Una revisión mensual en Google, en Google Maps y en las respuestas de la IA (entre ellas ChatGPT, Gemini y Google AI), al mismo precio.',
          theirs:
            '500 palabras clave con seguimiento diario en el plan SEO. El seguimiento de respuestas de IA empieza en Starter, por 199 dólares al mes. El seguimiento en mapas pertenece al Local Toolkit, que va aparte.',
        },
        {
          label: 'Prueba',
          ours: '7 días, sin tarjeta de crédito, cancelas cuando quieras.',
          theirs: '«Try Semrush free for seven days. Cancel anytime». Durante la prueba las exportaciones están desactivadas.',
        },
      ],
    },
    theirStrengths: {
      eyebrow: 'Cuándo conviene Semrush',
      title: 'Hay casos en los que Semrush es, sencillamente, la respuesta correcta',
      intro: 'No intentamos ser Semrush, y si es lo que necesitas, mejor saberlo ahora.',
      items: [
        {
          title: 'Cuando quieres investigar, no que te lo hagan',
          body:
            'Investigación de competencia y palabras clave, datos de enlaces, analítica de tráfico y de mercado, datos históricos y una API. Si tú o tu agencia queréis estudiar un mercado, responden preguntas que nosotros no.',
        },
        {
          title: 'Cuando necesitas seguimiento diario y amplio',
          body:
            'Su plan SEO sigue 500 palabras clave cada día. Nuestra revisión es mensual. Si necesitas ver el movimiento diario, esa diferencia es real y es suya.',
        },
        {
          title: 'Cuando tienes muchas sedes y quieres distribución en directorios',
          body: 'Local Pro envía los datos del negocio a más de 70 directorios con un clic. Nosotros no lo ofrecemos.',
        },
      ],
    },
    ourStrengths: {
      eyebrow: 'Cuándo encajamos mejor',
      title: 'Cuando nadie se va a sentar delante del panel',
      intro: 'La mayoría de los negocios que hablan con nosotros no necesitan otro panel. Necesitan que el trabajo se haga.',
      items: [
        {
          title: 'Un precio, sin suplemento por ubicación',
          body: 'Los artículos, las publicaciones en el perfil de Google Business y el seguimiento están en el mismo precio, no en tres planes distintos.',
        },
        {
          title: 'El contenido se publica solo',
          body: 'Apruebas los temas una vez al mes y los artículos salen con imágenes y enlaces internos sin que los toques.',
        },
        {
          title: 'Pensado para un equipo pequeño',
          body: 'No hay nada que configurar más allá de conectar la web, ni una rutina semanal que mantener.',
        },
        {
          title: 'Sin programador',
          body: 'La instalación es un plugin de WordPress o una app de Shopify. No hay nada que integrar.',
        },
      ],
    },
    faq: {
      eyebrow: 'Preguntas',
      title: 'Lo que se pregunta antes de cambiar',
      items: [
        {
          q: '¿Puedo usar los dos?',
          a: 'Sí, y muchas agencias hacen justo eso: Semrush para investigar y nosotros para el trabajo semanal. No hay conflicto técnico.',
        },
        {
          q: '¿Medís la visibilidad en IA mejor que ellos?',
          a: 'No. Nosotros revisamos una vez al mes y ellos a diario desde su plan Starter. Nuestra ventaja es que la revisión va en el precio base y no exige subir de plan.',
        },
        {
          q: '¿Los precios de esta página están al día?',
          a: `Se leyeron en las páginas de Semrush el ${CHECKED}. Las empresas cambian precios, y Semrush acaba de renombrar sus planes, así que los enlaces bajo la tabla son la fuente.`,
        },
      ],
    },
    close: { title: 'Mira cómo está tu web, sin registrarte' },
  },

  'pt-BR': {
    competitor: 'Semrush',
    eyebrow: 'Go Top SEO x Semrush',
    metaTitle: 'Go Top SEO x Semrush | Comparativo',
    metaDescription:
      'Go Top SEO comparado com o Semrush: quem escreve e publica o conteúdo, quem cuida do perfil do Google Business, o que cada preço inclui e quando o Semrush é a melhor escolha.',
    hero: {
      title: 'O Semrush entrega as ferramentas.',
      accent: 'Nós fazemos o trabalho',
      subtitle:
        'O Semrush tem uma das bases de dados mais completas do setor e mostra o que está errado. O Go Top SEO foi feito para quem não tem tempo de agir: o sistema escreve os artigos, publica no site, publica no perfil do Google Business e acompanha as posições.',
    },
    table: {
      eyebrow: 'O comparativo',
      title: 'O que cada um faz, segundo as próprias páginas do Semrush',
      checkedOn: CHECKED,
      sources: SOURCES,
      rows: [
        {
          label: 'Preço inicial',
          ours: 'A partir de 79 dólares por mês mais impostos, tudo em um preço só.',
          theirs:
            'Plano SEO por 139 dólares/mês (117,33 no anual), com 5 sites e 500 palavras-chave. Há também um plano gratuito limitado.',
        },
        {
          label: 'Quem faz o trabalho',
          ours: 'O sistema. Você aprova um tema; ele escreve, acrescenta imagens e links internos, e publica.',
          theirs:
            'Misto. O agente de GBP publica sozinho, os artigos saem com um clique e as correções no site ficam com você ou com seu programador.',
        },
        {
          label: 'Artigos',
          ours: 'Planejados e escritos automaticamente, com imagens e links internos, a partir de um plano mensal que você aprova.',
          theirs:
            'O plugin deles para WordPress pesquisa temas, escreve rascunhos longos e gera imagens com IA. Exige conta paga.',
        },
        {
          label: 'Publicação no site',
          ours: 'Automática no WordPress e na Shopify. Você não abre o editor.',
          theirs: 'O plugin deles publica no WordPress com um clique, em «Share» e depois na opção WordPress.',
        },
        {
          label: 'Perfil do Google Business',
          ours: 'Incluído no mesmo preço: publicações automáticas no perfil, com o seu consentimento.',
          theirs:
            'O Local Toolkit é comprado à parte e cobrado por unidade: 30 dólares/mês por unidade no Base e 60 no Pro. O agente deles publica posts e responde às avaliações novas.',
        },
        {
          label: 'Correções no site',
          ours: 'Parte das correções é aplicada pelo nosso plugin de WordPress, sem ler código.',
          theirs:
            'O Site Audit ordena os problemas por gravidade e explica como corrigir cada um. A página deles não afirma que o Semrush altera o seu site.',
        },
        {
          label: 'Acompanhamento de posições',
          ours:
            'Uma verificação mensal no Google, no Google Maps e nas respostas de IA (entre elas ChatGPT, Gemini e Google AI), pelo mesmo preço.',
          theirs:
            '500 palavras-chave com acompanhamento diário no plano SEO. O acompanhamento de respostas de IA começa no Starter, por 199 dólares/mês. O acompanhamento no mapa faz parte do Local Toolkit, vendido à parte.',
        },
        {
          label: 'Teste',
          ours: '7 dias, sem cartão de crédito, cancela quando quiser.',
          theirs: '«Try Semrush free for seven days. Cancel anytime». Durante o teste as exportações ficam bloqueadas.',
        },
      ],
    },
    theirStrengths: {
      eyebrow: 'Quando o Semrush é a melhor escolha',
      title: 'Há casos em que o Semrush é simplesmente a resposta certa',
      intro: 'Não tentamos ser o Semrush e, se é disso que você precisa, melhor saber agora.',
      items: [
        {
          title: 'Quando você quer investigar, e não ser atendido',
          body:
            'Pesquisa de concorrentes e de palavras-chave, dados de backlinks, análise de tráfego e de mercado, dados históricos e uma API. Se você ou sua agência querem estudar um mercado, eles respondem perguntas que nós não respondemos.',
        },
        {
          title: 'Quando é preciso acompanhamento diário e amplo',
          body:
            'O plano SEO deles acompanha 500 palavras-chave todo dia. A nossa verificação é mensal. Se você precisa ver o movimento diário, essa diferença é real e é deles.',
        },
        {
          title: 'Quando há muitas unidades e você quer distribuição em diretórios',
          body: 'No Local Pro eles enviam os dados do negócio para mais de 70 diretórios com um clique. Nós não oferecemos isso.',
        },
      ],
    },
    ourStrengths: {
      eyebrow: 'Quando combinamos melhor',
      title: 'Quando ninguém vai sentar na frente do painel',
      intro: 'A maior parte dos negócios que fala conosco não precisa de mais um painel. Precisa que o trabalho aconteça.',
      items: [
        {
          title: 'Um preço, sem adicional por unidade',
          body: 'Os artigos, as publicações no perfil do Google Business e o acompanhamento ficam no mesmo preço, e não em três planos.',
        },
        {
          title: 'O conteúdo se publica sozinho',
          body: 'Você aprova os temas uma vez por mês e os artigos entram no ar com imagens e links internos sem que você toque neles.',
        },
        {
          title: 'Feito para uma equipe pequena',
          body: 'Não há nada a configurar além de conectar o site, nem uma rotina semanal para manter.',
        },
        {
          title: 'Sem programador',
          body: 'A instalação é um plugin de WordPress ou um app da Shopify. Não há nada para integrar.',
        },
      ],
    },
    faq: {
      eyebrow: 'Perguntas',
      title: 'O que perguntam antes de trocar',
      items: [
        {
          q: 'Dá para usar os dois?',
          a: 'Dá, e muitas agências fazem exatamente isso: Semrush para pesquisar e nós para o trabalho de toda semana. Não há conflito técnico.',
        },
        {
          q: 'Vocês medem visibilidade em IA melhor do que eles?',
          a: 'Não. Verificamos uma vez por mês; eles verificam todo dia a partir do plano Starter. A nossa vantagem é que a verificação está no preço básico e não exige upgrade.',
        },
        {
          q: 'Os preços desta página estão atualizados?',
          a: `Foram lidos nas páginas do Semrush em ${CHECKED}. Empresas mudam preços, e o Semrush acabou de renomear seus planos, então os links abaixo da tabela são a fonte.`,
        },
      ],
    },
    close: { title: 'Veja como o seu site está, sem se cadastrar' },
  },

  fr: {
    competitor: 'Semrush',
    eyebrow: 'Go Top SEO face à Semrush',
    metaTitle: 'Go Top SEO face à Semrush | Comparatif',
    metaDescription:
      'Go Top SEO comparé à Semrush : qui écrit et publie le contenu, qui s’occupe de la fiche Google Business, ce que chaque prix comprend et dans quels cas Semrush est le meilleur choix.',
    hero: {
      title: 'Semrush vous donne les outils.',
      accent: 'Nous faisons le travail',
      subtitle:
        'Semrush s’appuie sur l’une des bases de données les plus profondes du secteur et vous montre ce qui ne va pas. Go Top SEO est conçu pour un dirigeant qui n’a pas le temps d’agir : le système écrit les articles, les publie sur le site, publie sur la fiche Google Business et suit vos positions.',
    },
    table: {
      eyebrow: 'Le comparatif',
      title: 'Ce que fait chacun, d’après les pages de Semrush elle-même',
      checkedOn: CHECKED,
      sources: SOURCES,
      rows: [
        {
          label: 'Prix de départ',
          ours: 'À partir de 79 dollars par mois hors taxes, tout dans un seul prix.',
          theirs:
            'Formule SEO à 139 dollars par mois (117,33 en paiement annuel), avec 5 sites et 500 mots-clés. Une formule gratuite limitée existe aussi.',
        },
        {
          label: 'Qui fait le travail',
          ours: 'Le système. Vous validez un sujet ; il écrit, ajoute les images et les liens internes, et publie.',
          theirs:
            'Les deux. Leur agent fiche Google Business publie seul, les articles se publient en un clic, et les corrections du site reviennent à vous ou à votre développeur.',
        },
        {
          label: 'Articles',
          ours: 'Planifiés et écrits automatiquement, avec images et liens internes, à partir d’un plan mensuel que vous validez.',
          theirs:
            'Leur extension WordPress fait de la recherche de sujets, rédige des brouillons longs et génère des images par IA. Elle demande un compte payant.',
        },
        {
          label: 'Publication sur le site',
          ours: 'Automatique vers WordPress et Shopify. Vous n’ouvrez jamais l’éditeur.',
          theirs: 'Leur extension publie sur WordPress en un clic, via « Share » puis l’option WordPress.',
        },
        {
          label: 'Fiche Google Business',
          ours: 'Comprise dans le même prix : publications automatiques sur la fiche, avec votre accord.',
          theirs:
            'Le Local Toolkit s’achète à part et se paie par établissement : 30 dollars par mois et par établissement en Base, 60 en Pro. Leur agent publie des posts et répond aux nouveaux avis.',
        },
        {
          label: 'Corrections sur le site',
          ours: 'Une partie des corrections passe par notre extension WordPress, sans lire une ligne de code.',
          theirs:
            'Site Audit classe les problèmes par gravité et explique comment corriger chacun. Leur page n’affirme pas que Semrush modifie votre site.',
        },
        {
          label: 'Suivi des positions',
          ours:
            'Une vérification mensuelle dans Google, dans Google Maps et dans les réponses des IA (dont ChatGPT, Gemini et Google AI), au même prix.',
          theirs:
            '500 mots-clés suivis chaque jour dans la formule SEO. Le suivi des réponses IA commence avec Starter, à 199 dollars par mois. Le suivi sur Maps fait partie du Local Toolkit, vendu à part.',
        },
        {
          label: 'Essai',
          ours: '7 jours, sans carte bancaire, résiliable à tout moment.',
          theirs: '« Try Semrush free for seven days. Cancel anytime. » Les exports sont bloqués pendant l’essai.',
        },
      ],
    },
    theirStrengths: {
      eyebrow: 'Quand Semrush vaut mieux',
      title: 'Il y a des cas où Semrush est tout simplement la bonne réponse',
      intro: 'Nous ne cherchons pas à être Semrush, et si c’est ce qu’il vous faut, autant le savoir maintenant.',
      items: [
        {
          title: 'Quand vous voulez enquêter, pas être servi',
          body:
            'Analyse des concurrents et des mots-clés, données de backlinks, trafic et études de marché, données historiques et une API. Si vous ou votre agence voulez creuser un marché, ils répondent à des questions que nous ne traitons pas.',
        },
        {
          title: 'Quand il faut un suivi quotidien et large',
          body:
            'Leur formule SEO suit 500 mots-clés chaque jour. Notre vérification est mensuelle. Si vous devez voir le mouvement au jour le jour, l’écart est réel et il est en leur faveur.',
        },
        {
          title: 'Quand vous avez beaucoup d’établissements et voulez la diffusion dans les annuaires',
          body: 'En Local Pro, ils envoient les informations de l’entreprise vers plus de 70 annuaires en un clic. Nous ne le faisons pas du tout.',
        },
      ],
    },
    ourStrengths: {
      eyebrow: 'Quand nous convenons mieux',
      title: 'Quand personne ne va s’asseoir devant le tableau de bord',
      intro: 'La plupart des dirigeants qui nous parlent n’ont pas besoin d’un tableau de bord de plus. Ils ont besoin que le travail soit fait.',
      items: [
        {
          title: 'Un seul prix, sans supplément par établissement',
          body: 'Les articles, les publications sur la fiche Google Business et le suivi des positions sont dans le même prix, et non dans trois formules différentes.',
        },
        {
          title: 'Le contenu se publie tout seul',
          body: 'Vous validez les sujets une fois par mois et les articles paraissent avec images et liens internes sans que vous y touchiez.',
        },
        {
          title: 'Pensé pour une petite équipe',
          body: 'Rien à configurer au-delà de la connexion du site, et aucune routine hebdomadaire à tenir.',
        },
        {
          title: 'Sans développeur',
          body: 'L’installation est une extension WordPress ou une application Shopify. Il n’y a rien à intégrer et personne à briefer.',
        },
      ],
    },
    faq: {
      eyebrow: 'Questions',
      title: 'Ce que l’on demande avant de changer',
      items: [
        {
          q: 'Peut-on utiliser les deux ?',
          a: 'Oui, et beaucoup d’agences font exactement cela : Semrush pour la recherche, nous pour le travail qui doit avoir lieu chaque semaine. Rien ne se télescope techniquement.',
        },
        {
          q: 'Mesurez-vous la visibilité dans les IA mieux qu’eux ?',
          a: 'Non. Nous vérifions une fois par mois ; ils vérifient chaque jour à partir de leur formule Starter. Notre avantage est que la vérification est dans le prix de base et ne demande aucune montée en gamme.',
        },
        {
          q: 'Les prix de cette page sont-ils à jour ?',
          a: `Ils ont été lus sur les pages de Semrush le ${CHECKED}. Les entreprises changent leurs prix, et Semrush a récemment renommé ses formules : les liens sous le tableau sont la source.`,
        },
      ],
    },
    close: { title: 'Voyez où en est votre site, sans vous inscrire' },
  },
  it: {
    competitor: 'Semrush',
    eyebrow: 'Go Top SEO a confronto con Semrush',
    metaTitle: 'Go Top SEO a confronto con Semrush | Confronto',
    metaDescription:
      'Go Top SEO a confronto con Semrush: chi scrive e pubblica i contenuti, chi si occupa del profilo Google Business, che cosa comprende ogni prezzo e in quali casi Semrush è la scelta migliore.',
    hero: {
      title: 'Semrush fornisce gli strumenti.',
      accent: 'Noi facciamo il lavoro',
      subtitle:
        'Semrush si appoggia a uno dei database più completi del settore e mostra che cosa non va. Go Top SEO è pensato per chi guida un’azienda e non ha il tempo di intervenire: il sistema scrive gli articoli, li pubblica sul sito, pubblica sul profilo Google Business e segue le posizioni.',
    },
    table: {
      eyebrow: 'Il confronto',
      title: 'Che cosa fa ciascuno, secondo le pagine di Semrush stessa',
      checkedOn: CHECKED,
      sources: SOURCES,
      rows: [
        {
          label: 'Prezzo di partenza',
          ours: 'A partire da 79 dollari al mese più imposte, tutto in un unico prezzo.',
          theirs:
            'Piano SEO a 139 dollari al mese (117,33 con pagamento annuale), con 5 siti e 500 parole chiave. Esiste anche un piano gratuito limitato.',
        },
        {
          label: 'Chi fa il lavoro',
          ours: 'Il sistema. Si approva un argomento; il sistema scrive, aggiunge le immagini e i link interni e pubblica.',
          theirs:
            'Entrambi. Il loro agente per il profilo Google Business pubblica da solo, gli articoli si pubblicano con un clic e le correzioni del sito restano all’azienda o al suo sviluppatore.',
        },
        {
          label: 'Articoli',
          ours: 'Pianificati e scritti automaticamente, con immagini e link interni, a partire da un piano mensile da approvare.',
          theirs:
            'La loro estensione per WordPress fa ricerca di argomenti, redige bozze lunghe e genera immagini con l’IA. Richiede un account a pagamento.',
        },
        {
          label: 'Pubblicazione sul sito',
          ours: 'Automatica su WordPress e Shopify. Non serve mai aprire l’editor.',
          theirs: 'La loro estensione pubblica su WordPress con un clic, tramite «Share» e poi l’opzione WordPress.',
        },
        {
          label: 'Profilo Google Business',
          ours: 'Compreso nello stesso prezzo: pubblicazioni automatiche sul profilo, previa approvazione.',
          theirs:
            'Il Local Toolkit si acquista a parte e si paga per sede: 30 dollari al mese per sede con Base, 60 con Pro. Il loro agente pubblica post e risponde alle nuove recensioni.',
        },
        {
          label: 'Correzioni sul sito',
          ours: 'Una parte delle correzioni passa dalla nostra estensione WordPress, senza leggere una riga di codice.',
          theirs:
            'Site Audit ordina i problemi per gravità e spiega come correggere ciascuno. La loro pagina non afferma che Semrush modifichi il sito.',
        },
        {
          label: 'Monitoraggio delle posizioni',
          ours:
            'Un controllo mensile su Google, su Google Maps e nelle risposte delle IA (fra cui ChatGPT, Gemini e Google AI), allo stesso prezzo.',
          theirs:
            '500 parole chiave monitorate ogni giorno nel piano SEO. Il monitoraggio delle risposte IA parte da Starter, a 199 dollari al mese. Il monitoraggio su Maps fa parte del Local Toolkit, venduto a parte.',
        },
        {
          label: 'Prova',
          ours: '7 giorni, senza carta di credito, con disdetta in qualsiasi momento.',
          theirs: '«Try Semrush free for seven days. Cancel anytime.» Durante la prova le esportazioni sono bloccate.',
        },
      ],
    },
    theirStrengths: {
      eyebrow: 'Quando Semrush è meglio',
      title: 'Ci sono casi in cui Semrush è semplicemente la risposta giusta',
      intro: 'Non cerchiamo di essere Semrush e, se è questo che serve, tanto vale saperlo subito.',
      items: [
        {
          title: 'Quando si vuole indagare, non essere serviti',
          body:
            'Analisi dei concorrenti e delle parole chiave, dati sui backlink, traffico e ricerche di mercato, dati storici e una API. Se un’azienda o la sua agenzia vuole approfondire un mercato, Semrush risponde a domande di cui noi non ci occupiamo.',
        },
        {
          title: 'Quando serve un monitoraggio quotidiano e ampio',
          body:
            'Il loro piano SEO monitora 500 parole chiave ogni giorno. Il nostro controllo è mensile. Se occorre vedere i movimenti giorno per giorno, la differenza è reale ed è a loro favore.',
        },
        {
          title: 'Quando le sedi sono molte e serve la diffusione nelle directory',
          body: 'Con Local Pro inviano le informazioni dell’azienda a oltre 70 directory con un clic. Noi non lo facciamo affatto.',
        },
      ],
    },
    ourStrengths: {
      eyebrow: 'Quando siamo più adatti noi',
      title: 'Quando nessuno si siederà davanti alla dashboard',
      intro: 'La maggior parte dei titolari che ci contatta non ha bisogno di un’altra dashboard. Ha bisogno che il lavoro venga fatto.',
      items: [
        {
          title: 'Un solo prezzo, senza supplementi per sede',
          body: 'Gli articoli, le pubblicazioni sul profilo Google Business e il monitoraggio delle posizioni sono nello stesso prezzo, e non in tre piani diversi.',
        },
        {
          title: 'I contenuti si pubblicano da soli',
          body: 'Gli argomenti si approvano una volta al mese e gli articoli escono con immagini e link interni senza alcun intervento.',
        },
        {
          title: 'Pensato per un piccolo team',
          body: 'Nulla da configurare oltre al collegamento del sito, e nessuna routine settimanale da mantenere.',
        },
        {
          title: 'Senza sviluppatore',
          body: 'L’installazione è un’estensione WordPress o un’app Shopify. Non c’è nulla da integrare e nessuno da istruire.',
        },
      ],
    },
    faq: {
      eyebrow: 'Domande',
      title: 'Che cosa si chiede prima di cambiare',
      items: [
        {
          q: 'Si possono usare entrambi?',
          a: 'Sì, e molte agenzie fanno esattamente questo: Semrush per la ricerca, noi per il lavoro che deve avvenire ogni settimana. Dal punto di vista tecnico non si sovrappone nulla.',
        },
        {
          q: 'Misurate la visibilità nelle IA meglio di loro?',
          a: 'No. Noi controlliamo una volta al mese; loro controllano ogni giorno a partire dal piano Starter. Il nostro vantaggio è che il controllo è compreso nel prezzo base e non richiede alcun passaggio a un piano superiore.',
        },
        {
          q: 'I prezzi di questa pagina sono aggiornati?',
          a: `Sono stati letti sulle pagine di Semrush il ${CHECKED}. Le aziende cambiano i prezzi e Semrush ha rinominato di recente i suoi piani: i link sotto la tabella sono la fonte.`,
        },
      ],
    },
    close: { title: 'Scopra a che punto è il suo sito, senza registrarsi' },
  },
}
