/**
 * Go Top SEO compared with Yoast SEO, in every language the public site speaks.
 *
 * THE READING RULE THIS FILE OBEYS. Where Yoast's own page does not mention a
 * capability, the copy says that it does not appear in their feature list —
 * never that Yoast cannot do it. An absence from a marketing page is not proof
 * of an absence from a product, and a flat denial about a named company is the
 * one error here worth more than the page. Rank tracking and Google Business
 * Profile are both written that way on purpose: no rank-tracking feature
 * appears in the Premium feature list, and Yoast bundles a Local SEO plugin
 * whose own feature set was not read when this was written.
 *
 * Nothing here says Yoast is bad. It is the most trusted name in WordPress SEO,
 * it has a free version, a 30-day full refund and 24/7 support, and for an
 * owner who wants a tool that advises and never acts on its own it is the right
 * purchase. The real difference is the one the page leads with: Yoast tells you
 * what to fix inside your editor; it does not write the articles, publish them
 * or tell you where you rank.
 */
import type { PublicLocale } from '@/lib/i18n/locales'
import type { ComparisonCopy } from './types'

const CHECKED = '2026-10-31'

const SOURCES = [
  { label: 'yoast.com — Yoast SEO Premium', href: 'https://yoast.com/wordpress/plugins/seo/' },
  { label: 'yoast.com/shop', href: 'https://yoast.com/shop/' },
  { label: 'Refund policy', href: 'https://yoast.com/shop/refund-policy/' },
]

export const YOAST_COMPARE: Record<PublicLocale, ComparisonCopy> = {
  he: {
    competitor: 'Yoast SEO',
    eyebrow: 'Go Top SEO מול Yoast',
    metaTitle: 'Go Top SEO מול Yoast SEO | השוואה',
    metaDescription:
      'השוואה בין Go Top SEO ל-Yoast SEO: מי כותב ומפרסם את התוכן, מי עוקב אחרי דירוגים, מה כולל כל מחיר ומתי Yoast הוא הבחירה הנכונה.',
    hero: {
      title: 'Yoast אומר לכם מה לתקן.',
      accent: 'אנחנו מתקנים וכותבים',
      subtitle:
        'Yoast הוא השם הוותיק והבטוח ביותר ב-SEO לוורדפרס, והוא מלווה אתכם בתוך העורך בזמן שאתם כותבים. Go Top SEO נבנה בשביל מי שאין לו מי שיכתוב: המערכת מתכננת את הנושאים, כותבת את המאמרים, מפרסמת אותם ועוקבת אחרי הדירוגים.',
    },
    table: {
      eyebrow: 'ההשוואה',
      title: 'מה כל אחד עושה, לפי העמודים של Yoast עצמם',
      checkedOn: CHECKED,
      sources: SOURCES,
      rows: [
        {
          label: 'מחיר',
          ours: 'בישראל החל מ-249 ש״ח לחודש כולל מע״מ. מחוץ לישראל מ-79 דולר לחודש בתוספת מס.',
          theirs:
            'Yoast SEO Premium ב-118.80 דולר לשנה, לא כולל מע״מ. לשופיפיי: 19 דולר ל-30 יום, לא כולל מע״מ. יש גם גרסה חינמית.',
        },
        {
          label: 'כמה אתרים',
          ours: 'לפי התוכנית שבחרתם, בעמוד המחירים.',
          theirs: 'מנוי אחד מכסה אתר אחד או דומיין אחד. אתר נוסף הוא מנוי נוסף, עם הנחת כמות.',
        },
        {
          label: 'מי כותב את המאמרים',
          ours: 'המערכת. נושאים, טקסט, תמונות וקישורים פנימיים, אחרי אישור שלכם.',
          theirs:
            'אתם. העמוד שלהם מדבר על כותרות ותיאורי מטא בעזרת AI ועל רעיונות וטיוטות פתיחה ב-Content Planner. אין בו טענה לכתיבת מאמר שלם.',
        },
        {
          label: 'פרסום לאתר',
          ours: 'אוטומטי לוורדפרס ולשופיפיי.',
          theirs: 'לא מתואר. זה תוסף שעובד בתוך העורך שלכם בוורדפרס.',
        },
        {
          label: 'מעקב דירוגים',
          ours: 'בדיקה חודשית בגוגל, ב-Google Maps ובתשובות של מנועי AI (בהם ChatGPT, Gemini ו-Google AI).',
          theirs: 'ברשימת התכונות של Premium בעמוד המוצר שלהם לא מופיעה תכונת מעקב דירוגים.',
        },
        {
          label: 'Google Business Profile',
          ours: 'פוסטים אוטומטיים לפרופיל, בהסכמה שלכם.',
          theirs:
            'לא מופיע ברשימת התכונות של Premium. במנוי כלול תוסף Local SEO נפרד, שלא בדקנו את התכונות שלו.',
        },
        {
          label: 'עבודה באתר',
          ours: 'חלק מהתיקונים נעשים דרך התוסף שלנו, בלי לקרוא קוד.',
          theirs:
            'ליווי וכלים ידניים: ניהול הפניות כולל CSV, בדיקה מול חמישה ביטויים, הצעות לקישורים פנימיים, טיפול בתוכן יתום ונתונים מובנים אוטומטיים בוורדפרס.',
        },
        {
          label: 'ניסיון והחזר',
          ours: '7 ימי ניסיון, בלי כרטיס אשראי, ביטול בכל רגע.',
          theirs:
            'בעמוד המוצר לא מוזכר ניסיון חינם. יש החזר מלא תוך 30 יום מרכישה ראשונה, לא על חידושים.',
        },
      ],
    },
    theirStrengths: {
      eyebrow: 'מתי Yoast עדיף',
      title: 'במקרים האלה Yoast הוא הבחירה הנכונה',
      intro: 'Yoast הוא המוצר שהכי פחות סביר שישבור לכם משהו, ולפעמים זה בדיוק מה שצריך.',
      items: [
        {
          title: 'כשיש מי שכותב',
          body:
            'אם יש לכם כותב או משרד שכבר מייצר תוכן, Yoast מלווה אותו תוך כדי כתיבה וזה כל מה שחסר. אין טעם לשלם על מערכת שתכתוב במקומכם.',
        },
        {
          title: 'כשרוצים כלי שממליץ ולא פועל לבד',
          body:
            'Yoast לא נוגע בתוכן שלכם בלי שתבקשו. למי שרוצה שליטה מלאה על כל מילה שעולה לאתר, זו תכונה ולא חיסרון.',
        },
        {
          title: 'כשהמחיר והביטחון הם מה שחשוב',
          body:
            '118.80 דולר לשנה, גרסה חינמית, החזר מלא תוך 30 יום, תמיכה 24/7 ותוספי Local, News ו-Video כלולים. בערך מוחלט זו עסקה טובה מאוד.',
        },
      ],
    },
    ourStrengths: {
      eyebrow: 'מתי אנחנו מתאימים יותר',
      title: 'כשאין מי שיכתוב',
      intro: 'ההבדל האמיתי הוא לא טכני. הוא מי יושב ועושה את העבודה בפועל.',
      items: [
        {
          title: 'מאמרים שמתפרסמים בלי שתיגעו',
          body: 'תוכנית נושאים חודשית שאתם מאשרים, ואז מאמרים עם תמונות וקישורים פנימיים עולים לאתר לבד.',
        },
        {
          title: 'אתם רואים איפה אתם עומדים',
          body: 'בדיקה חודשית בגוגל, במפות ובתשובות של מנועי AI, בלי להוסיף כלי נוסף.',
        },
        {
          title: 'גם מחוץ לאתר',
          body: 'פוסטים ל-Google Business Profile, בהסכמה שלכם, באותו מחיר.',
        },
        {
          title: 'גם בשופיפיי וגם בוורדפרס',
          body: 'אותה מערכת לשתי הפלטפורמות, עם אותו דוח.',
        },
      ],
    },
    faq: {
      eyebrow: 'שאלות',
      title: 'מה ששואלים לפני שמחליפים',
      items: [
        {
          q: 'אפשר להשאיר את Yoast ולהוסיף אתכם?',
          a: 'כן. Yoast יכול להמשיך לנהל את הנתונים המובנים וההפניות, והמערכת שלנו תכתוב ותפרסם. מומלץ לבדוק שלא שני התוספים מייצרים אותם נתונים מובנים פעמיים.',
        },
        {
          q: 'Yoast באמת לא עוקב אחרי דירוגים?',
          a: 'ברשימת התכונות של Premium בעמוד המוצר שלהם אין תכונה כזו. זה מה שהעמוד שלהם אומר, ולא טענה שלנו על מה שהמוצר יודע לעשות.',
        },
        {
          q: 'אתם מחליפים את Yoast?',
          a: 'לא בהכרח. אנחנו עושים את העבודה של ייצור התוכן והמדידה, והוא כלי עריכה בתוך וורדפרס. הרבה אתרים מריצים את שניהם.',
        },
      ],
    },
    close: { title: 'תראו איפה האתר שלכם עומד, בלי להירשם' },
  },

  en: {
    competitor: 'Yoast SEO',
    eyebrow: 'Go Top SEO vs Yoast',
    metaTitle: 'Go Top SEO vs Yoast SEO | Comparison',
    metaDescription:
      'Go Top SEO compared with Yoast SEO: who writes and publishes the content, who tracks rankings, what each price includes, and when Yoast is the better buy.',
    hero: {
      title: 'Yoast tells you what to fix.',
      accent: 'We fix it and write it',
      subtitle:
        'Yoast is the oldest and safest name in WordPress SEO, and it coaches you inside the editor while you write. Go Top SEO is built for an owner with nobody to do the writing: the system plans the topics, writes the articles, publishes them and tracks where you rank.',
    },
    table: {
      eyebrow: 'The comparison',
      title: "What each one does, taken from Yoast's own pages",
      checkedOn: CHECKED,
      sources: SOURCES,
      rows: [
        {
          label: 'Price',
          ours: 'From $79 a month plus tax. In Israel, from 249 ILS a month including VAT.',
          theirs:
            'Yoast SEO Premium at $118.80 a year, ex. VAT. For Shopify, $19 per 30 days, ex. VAT. A free version is also offered.',
        },
        {
          label: 'How many sites',
          ours: 'Whatever your plan covers, on the pricing page.',
          theirs: 'One subscription covers one site or domain. Another site is another subscription, with a bulk discount.',
        },
        {
          label: 'Who writes the articles',
          ours: 'The system. Topics, text, images and internal links, after you approve.',
          theirs:
            'You do. Their page describes AI-drafted titles and meta descriptions and Content Planner ideas and starter drafts. It claims no full-article generation.',
        },
        {
          label: 'Publishing to the site',
          ours: 'Automatic to WordPress and Shopify.',
          theirs: 'Not described. It is a plugin inside your own WordPress editor.',
        },
        {
          label: 'Rank tracking',
          ours: 'A monthly check in Google, in Google Maps and in AI answers (ChatGPT, Gemini and Google AI among them).',
          theirs: 'No rank-tracking feature appears in the Premium feature list on their product page.',
        },
        {
          label: 'Google Business Profile',
          ours: 'Automatic posts to the profile, with your consent.',
          theirs:
            'Not in the Premium feature list. A separate Local SEO plugin is bundled with the subscription; we did not read its feature set.',
        },
        {
          label: 'Work on the site',
          ours: 'Some fixes are applied through our plugin, with no code to read.',
          theirs:
            'Guidance and manual tools: redirect management including bulk CSV, checking a post against up to five keyphrases, internal linking suggestions, the orphaned-content workout and automatic structured data in WordPress.',
        },
        {
          label: 'Trial and refund',
          ours: 'A 7-day trial, no credit card, cancel anytime.',
          theirs:
            'No free trial is mentioned on their product page. A full refund is offered within 30 days of an initial purchase, not on renewals.',
        },
      ],
    },
    theirStrengths: {
      eyebrow: 'When Yoast is the better buy',
      title: 'In these cases Yoast is the right answer',
      intro: 'Yoast is the product least likely to break anything you have, and sometimes that is exactly what is needed.',
      items: [
        {
          title: 'When somebody already writes',
          body:
            'If you have a writer or an agency producing content, Yoast coaches them as they write and that is the only thing missing. There is no reason to pay for a system to write instead of you.',
        },
        {
          title: 'When you want a tool that advises and never acts',
          body:
            'Yoast touches nothing without being asked. For an owner who wants control over every word that goes live, that is a feature rather than a limitation.',
        },
        {
          title: 'When price and safety are what matter',
          body:
            '$118.80 a year, a free version, a full 30-day refund, 24/7 support and the Local, News and Video SEO plugins included. In absolute terms that is excellent value.',
        },
      ],
    },
    ourStrengths: {
      eyebrow: 'When we fit better',
      title: 'When there is nobody to write',
      intro: 'The real difference is not technical. It is who sits down and does the work.',
      items: [
        {
          title: 'Articles that publish without you',
          body: 'A monthly topic plan you approve, then articles with images and internal links going live on their own.',
        },
        {
          title: 'You can see where you stand',
          body: 'A monthly check in Google, in Maps and in AI answers, without adding a second tool.',
        },
        {
          title: 'Off the site as well',
          body: 'Posts to your Google Business Profile, with your consent, in the same price.',
        },
        {
          title: 'Shopify as well as WordPress',
          body: 'The same system on both platforms, with the same report.',
        },
      ],
    },
    faq: {
      eyebrow: 'Questions',
      title: 'What people ask before switching',
      items: [
        {
          q: 'Can I keep Yoast and add you?',
          a: 'Yes. Yoast can keep handling your structured data and redirects while we write and publish. It is worth checking that both plugins are not emitting the same structured data twice.',
        },
        {
          q: 'Does Yoast really not track rankings?',
          a: 'No rank-tracking feature appears in the Premium feature list on their product page. That is what their page says, not a claim from us about what the product can do.',
        },
        {
          q: 'Do you replace Yoast?',
          a: 'Not necessarily. We do the producing and the measuring; it is an editing tool inside WordPress. Plenty of sites run both.',
        },
      ],
    },
    close: { title: 'See where your site stands, without signing up' },
  },

  es: {
    competitor: 'Yoast SEO',
    eyebrow: 'Go Top SEO frente a Yoast',
    metaTitle: 'Go Top SEO frente a Yoast SEO | Comparativa',
    metaDescription:
      'Go Top SEO comparado con Yoast SEO: quién escribe y publica el contenido, quién sigue las posiciones, qué incluye cada precio y cuándo Yoast es la mejor opción.',
    hero: {
      title: 'Yoast te dice qué corregir.',
      accent: 'Nosotros lo hacemos y lo escribimos',
      subtitle:
        'Yoast es el nombre más veterano y más seguro del SEO en WordPress, y te acompaña dentro del editor mientras escribes. Go Top SEO está hecho para quien no tiene a nadie que escriba: el sistema planifica los temas, escribe los artículos, los publica y sigue tus posiciones.',
    },
    table: {
      eyebrow: 'La comparativa',
      title: 'Qué hace cada uno, según las propias páginas de Yoast',
      checkedOn: CHECKED,
      sources: SOURCES,
      rows: [
        {
          label: 'Precio',
          ours: 'Desde 79 dólares al mes más impuestos.',
          theirs:
            'Yoast SEO Premium por 118,80 dólares al año, sin IVA. Para Shopify, 19 dólares por 30 días, sin IVA. También hay una versión gratuita.',
        },
        {
          label: 'Cuántos sitios',
          ours: 'Los que cubra tu plan, en la página de precios.',
          theirs: 'Una suscripción cubre un sitio o un dominio. Otro sitio es otra suscripción, con descuento por volumen.',
        },
        {
          label: 'Quién escribe los artículos',
          ours: 'El sistema. Temas, texto, imágenes y enlaces internos, después de que tú apruebes.',
          theirs:
            'Tú. Su página describe títulos y meta descripciones redactados con IA e ideas y borradores iniciales en Content Planner. No afirma generar artículos completos.',
        },
        {
          label: 'Publicación en la web',
          ours: 'Automática en WordPress y Shopify.',
          theirs: 'No se describe. Es un plugin dentro de tu propio editor de WordPress.',
        },
        {
          label: 'Seguimiento de posiciones',
          ours: 'Una revisión mensual en Google, en Google Maps y en las respuestas de la IA (entre ellas ChatGPT, Gemini y Google AI).',
          theirs: 'En la lista de funciones de Premium de su página de producto no aparece ninguna función de seguimiento de posiciones.',
        },
        {
          label: 'Perfil de Google Business',
          ours: 'Publicaciones automáticas en el perfil, con tu consentimiento.',
          theirs:
            'No aparece en la lista de funciones de Premium. La suscripción incluye un plugin Local SEO aparte, cuyas funciones no hemos revisado.',
        },
        {
          label: 'Trabajo en el sitio',
          ours: 'Algunas correcciones se aplican desde nuestro plugin, sin leer código.',
          theirs:
            'Acompañamiento y herramientas manuales: gestión de redirecciones con CSV, revisión frente a cinco frases clave, sugerencias de enlazado interno, contenido huérfano y datos estructurados automáticos en WordPress.',
        },
        {
          label: 'Prueba y devolución',
          ours: 'Prueba de 7 días, sin tarjeta de crédito, cancelas cuando quieras.',
          theirs:
            'En su página de producto no se menciona ninguna prueba gratuita. Ofrecen devolución íntegra en los 30 días siguientes a la primera compra, no en las renovaciones.',
        },
      ],
    },
    theirStrengths: {
      eyebrow: 'Cuándo conviene Yoast',
      title: 'En estos casos Yoast es la respuesta correcta',
      intro: 'Yoast es el producto con menos probabilidades de romperte algo, y a veces es justo lo que hace falta.',
      items: [
        {
          title: 'Cuando ya hay quien escriba',
          body:
            'Si tienes un redactor o una agencia produciendo contenido, Yoast le guía mientras escribe y es lo único que faltaba. No tiene sentido pagar por un sistema que escriba en tu lugar.',
        },
        {
          title: 'Cuando quieres una herramienta que aconseje y no actúe',
          body:
            'Yoast no toca nada sin que se lo pidas. Para quien quiere control sobre cada palabra que se publica, eso es una ventaja y no una carencia.',
        },
        {
          title: 'Cuando lo que importa es el precio y la tranquilidad',
          body:
            '118,80 dólares al año, versión gratuita, devolución íntegra en 30 días, soporte 24/7 y los plugins Local, News y Video incluidos. En términos absolutos es una muy buena compra.',
        },
      ],
    },
    ourStrengths: {
      eyebrow: 'Cuándo encajamos mejor',
      title: 'Cuando no hay quien escriba',
      intro: 'La diferencia real no es técnica. Es quién se sienta a hacer el trabajo.',
      items: [
        {
          title: 'Artículos que se publican sin ti',
          body: 'Un plan mensual de temas que tú apruebas y, después, artículos con imágenes y enlaces internos que salen solos.',
        },
        {
          title: 'Ves dónde estás',
          body: 'Una revisión mensual en Google, en Maps y en las respuestas de la IA, sin añadir otra herramienta.',
        },
        {
          title: 'También fuera de la web',
          body: 'Publicaciones en tu perfil de Google Business, con tu consentimiento, en el mismo precio.',
        },
        {
          title: 'Shopify además de WordPress',
          body: 'El mismo sistema en las dos plataformas, con el mismo informe.',
        },
      ],
    },
    faq: {
      eyebrow: 'Preguntas',
      title: 'Lo que se pregunta antes de cambiar',
      items: [
        {
          q: '¿Puedo quedarme con Yoast y añadiros a vosotros?',
          a: 'Sí. Yoast puede seguir ocupándose de los datos estructurados y las redirecciones mientras nosotros escribimos y publicamos. Conviene comprobar que los dos plugins no emiten los mismos datos estructurados por duplicado.',
        },
        {
          q: '¿De verdad Yoast no sigue posiciones?',
          a: 'En la lista de funciones de Premium de su página de producto no aparece ninguna. Eso es lo que dice su página, no una afirmación nuestra sobre lo que el producto sabe hacer.',
        },
        {
          q: '¿Sustituís a Yoast?',
          a: 'No necesariamente. Nosotros producimos y medimos; él es una herramienta de edición dentro de WordPress. Muchos sitios usan los dos.',
        },
      ],
    },
    close: { title: 'Mira cómo está tu web, sin registrarte' },
  },

  'pt-BR': {
    competitor: 'Yoast SEO',
    eyebrow: 'Go Top SEO x Yoast',
    metaTitle: 'Go Top SEO x Yoast SEO | Comparativo',
    metaDescription:
      'Go Top SEO comparado com o Yoast SEO: quem escreve e publica o conteúdo, quem acompanha as posições, o que cada preço inclui e quando o Yoast é a melhor escolha.',
    hero: {
      title: 'O Yoast diz o que corrigir.',
      accent: 'Nós corrigimos e escrevemos',
      subtitle:
        'O Yoast é o nome mais antigo e mais seguro do SEO no WordPress, e acompanha você dentro do editor enquanto escreve. O Go Top SEO foi feito para quem não tem ninguém para escrever: o sistema planeja os temas, escreve os artigos, publica e acompanha as posições.',
    },
    table: {
      eyebrow: 'O comparativo',
      title: 'O que cada um faz, segundo as próprias páginas do Yoast',
      checkedOn: CHECKED,
      sources: SOURCES,
      rows: [
        {
          label: 'Preço',
          ours: 'A partir de 79 dólares por mês mais impostos.',
          theirs:
            'Yoast SEO Premium por 118,80 dólares ao ano, sem impostos. Para Shopify, 19 dólares a cada 30 dias, sem impostos. Há também uma versão gratuita.',
        },
        {
          label: 'Quantos sites',
          ours: 'O que o seu plano cobrir, na página de planos.',
          theirs: 'Uma assinatura cobre um site ou um domínio. Outro site é outra assinatura, com desconto por volume.',
        },
        {
          label: 'Quem escreve os artigos',
          ours: 'O sistema. Temas, texto, imagens e links internos, depois da sua aprovação.',
          theirs:
            'Você. A página deles descreve títulos e meta descrições escritos com IA e ideias e rascunhos iniciais no Content Planner. Não há promessa de gerar o artigo inteiro.',
        },
        {
          label: 'Publicação no site',
          ours: 'Automática no WordPress e na Shopify.',
          theirs: 'Não é descrita. É um plugin dentro do seu próprio editor do WordPress.',
        },
        {
          label: 'Acompanhamento de posições',
          ours: 'Uma verificação mensal no Google, no Google Maps e nas respostas de IA (entre elas ChatGPT, Gemini e Google AI).',
          theirs: 'Na lista de recursos do Premium, na página de produto deles, não aparece nenhum recurso de acompanhamento de posições.',
        },
        {
          label: 'Perfil do Google Business',
          ours: 'Publicações automáticas no perfil, com o seu consentimento.',
          theirs:
            'Não está na lista de recursos do Premium. A assinatura inclui um plugin Local SEO à parte, cujos recursos não lemos.',
        },
        {
          label: 'Trabalho no site',
          ours: 'Parte das correções é aplicada pelo nosso plugin, sem ler código.',
          theirs:
            'Orientação e ferramentas manuais: gestão de redirecionamentos com CSV, verificação contra cinco frases-chave, sugestões de links internos, conteúdo órfão e dados estruturados automáticos no WordPress.',
        },
        {
          label: 'Teste e reembolso',
          ours: 'Teste de 7 dias, sem cartão de crédito, cancela quando quiser.',
          theirs:
            'A página de produto deles não menciona teste gratuito. Há reembolso integral em até 30 dias da primeira compra, não nas renovações.',
        },
      ],
    },
    theirStrengths: {
      eyebrow: 'Quando o Yoast é a melhor escolha',
      title: 'Nestes casos o Yoast é a resposta certa',
      intro: 'O Yoast é o produto com menos chance de quebrar alguma coisa, e às vezes é exatamente disso que se precisa.',
      items: [
        {
          title: 'Quando já existe quem escreva',
          body:
            'Se você tem um redator ou uma agência produzindo conteúdo, o Yoast orienta durante a escrita e é só isso que faltava. Não faz sentido pagar por um sistema que escreva no seu lugar.',
        },
        {
          title: 'Quando você quer uma ferramenta que aconselha e não age',
          body:
            'O Yoast não mexe em nada sem pedido. Para quem quer controle sobre cada palavra publicada, isso é uma vantagem, e não uma falta.',
        },
        {
          title: 'Quando o que pesa é preço e segurança',
          body:
            '118,80 dólares ao ano, versão gratuita, reembolso integral em 30 dias, suporte 24/7 e os plugins Local, News e Video inclusos. Em termos absolutos, é uma compra muito boa.',
        },
      ],
    },
    ourStrengths: {
      eyebrow: 'Quando combinamos melhor',
      title: 'Quando não há quem escreva',
      intro: 'A diferença real não é técnica. É quem senta e faz o trabalho.',
      items: [
        {
          title: 'Artigos que se publicam sem você',
          body: 'Um plano mensal de temas que você aprova e, depois, artigos com imagens e links internos entrando no ar sozinhos.',
        },
        {
          title: 'Você vê onde está',
          body: 'Uma verificação mensal no Google, no Maps e nas respostas de IA, sem acrescentar outra ferramenta.',
        },
        {
          title: 'Fora do site também',
          body: 'Publicações no seu perfil do Google Business, com o seu consentimento, no mesmo preço.',
        },
        {
          title: 'Shopify além do WordPress',
          body: 'O mesmo sistema nas duas plataformas, com o mesmo relatório.',
        },
      ],
    },
    faq: {
      eyebrow: 'Perguntas',
      title: 'O que perguntam antes de trocar',
      items: [
        {
          q: 'Dá para manter o Yoast e somar vocês?',
          a: 'Dá. O Yoast pode continuar cuidando dos dados estruturados e dos redirecionamentos enquanto nós escrevemos e publicamos. Vale conferir se os dois plugins não estão emitindo os mesmos dados estruturados em duplicidade.',
        },
        {
          q: 'O Yoast realmente não acompanha posições?',
          a: 'Na lista de recursos do Premium, na página de produto deles, não aparece nenhum. É o que a página deles diz, e não uma afirmação nossa sobre o que o produto sabe fazer.',
        },
        {
          q: 'Vocês substituem o Yoast?',
          a: 'Não necessariamente. Nós produzimos e medimos; ele é uma ferramenta de edição dentro do WordPress. Muitos sites usam os dois.',
        },
      ],
    },
  close: { title: 'Veja como o seu site está, sem se cadastrar' },
  },

  fr: {
    competitor: 'Yoast SEO',
    eyebrow: 'Go Top SEO face à Yoast',
    metaTitle: 'Go Top SEO face à Yoast SEO | Comparatif',
    metaDescription:
      'Go Top SEO comparé à Yoast SEO : qui écrit et publie le contenu, qui suit les positions, ce que chaque prix comprend et dans quels cas Yoast est le meilleur choix.',
    hero: {
      title: 'Yoast vous dit quoi corriger.',
      accent: 'Nous corrigeons et nous écrivons',
      subtitle:
        'Yoast est le nom le plus ancien et le plus sûr du SEO sur WordPress, et il vous accompagne dans l’éditeur pendant que vous écrivez. Go Top SEO est conçu pour un dirigeant qui n’a personne pour écrire : le système planifie les sujets, écrit les articles, les publie et suit vos positions.',
    },
    table: {
      eyebrow: 'Le comparatif',
      title: 'Ce que fait chacun, d’après les pages de Yoast elle-même',
      checkedOn: CHECKED,
      sources: SOURCES,
      rows: [
        {
          label: 'Prix',
          ours: 'À partir de 79 dollars par mois hors taxes.',
          theirs:
            'Yoast SEO Premium à 118,80 dollars par an, hors taxes. Pour Shopify, 19 dollars tous les 30 jours, hors taxes. Une version gratuite existe aussi.',
        },
        {
          label: 'Combien de sites',
          ours: 'Ce que couvre votre formule, sur la page des tarifs.',
          theirs: 'Un abonnement couvre un site ou un domaine. Un autre site, c’est un autre abonnement, avec une remise au volume.',
        },
        {
          label: 'Qui écrit les articles',
          ours: 'Le système. Sujets, texte, images et liens internes, après votre validation.',
          theirs:
            'Vous. Leur page décrit des titres et des méta-descriptions rédigés par IA, ainsi que des idées et des débuts de brouillon dans Content Planner. Elle ne promet pas d’article complet.',
        },
        {
          label: 'Publication sur le site',
          ours: 'Automatique vers WordPress et Shopify.',
          theirs: 'Non décrite. C’est une extension dans votre propre éditeur WordPress.',
        },
        {
          label: 'Suivi des positions',
          ours: 'Une vérification mensuelle dans Google, dans Google Maps et dans les réponses des IA (dont ChatGPT, Gemini et Google AI).',
          theirs: 'Aucune fonction de suivi des positions n’apparaît dans la liste des fonctions Premium de leur page produit.',
        },
        {
          label: 'Fiche Google Business',
          ours: 'Publications automatiques sur la fiche, avec votre accord.',
          theirs:
            'Absente de la liste des fonctions Premium. Une extension Local SEO distincte est incluse dans l’abonnement ; nous n’avons pas lu la liste de ses fonctions.',
        },
        {
          label: 'Travail sur le site',
          ours: 'Une partie des corrections passe par notre extension, sans lire une ligne de code.',
          theirs:
            'Conseils et outils manuels : gestion des redirections, y compris par import CSV, vérification d’un article face à cinq expressions clés, suggestions de liens internes, exercice sur le contenu orphelin et données structurées automatiques dans WordPress.',
        },
        {
          label: 'Essai et remboursement',
          ours: 'Un essai de 7 jours, sans carte bancaire, résiliable à tout moment.',
          theirs:
            'Leur page produit ne mentionne aucun essai gratuit. Un remboursement intégral est proposé dans les 30 jours suivant le premier achat, pas lors des renouvellements.',
        },
      ],
    },
    theirStrengths: {
      eyebrow: 'Quand Yoast vaut mieux',
      title: 'Dans ces cas-là, Yoast est la bonne réponse',
      intro: 'Yoast est le produit qui a le moins de chances de casser quelque chose, et c’est parfois exactement ce qu’il faut.',
      items: [
        {
          title: 'Quand quelqu’un écrit déjà',
          body:
            'Si vous avez un rédacteur ou une agence qui produit du contenu, Yoast le guide pendant l’écriture et c’est tout ce qui manquait. Payer pour un système qui écrit à votre place n’aurait pas de sens.',
        },
        {
          title: 'Quand vous voulez un outil qui conseille et n’agit pas',
          body:
            'Yoast ne touche à rien sans qu’on le lui demande. Pour qui veut garder la main sur chaque mot publié, c’est un avantage et non un manque.',
        },
        {
          title: 'Quand ce qui compte, c’est le prix et la tranquillité',
          body:
            '118,80 dollars par an, une version gratuite, un remboursement intégral sous 30 jours, une assistance 24/7 et les extensions Local, News et Video incluses. En valeur absolue, c’est un très bon achat.',
        },
      ],
    },
    ourStrengths: {
      eyebrow: 'Quand nous convenons mieux',
      title: 'Quand il n’y a personne pour écrire',
      intro: 'La vraie différence n’est pas technique. Elle est dans qui s’assoit pour faire le travail.',
      items: [
        {
          title: 'Des articles qui se publient sans vous',
          body: 'Un plan mensuel de sujets que vous validez, puis des articles avec images et liens internes qui paraissent tout seuls.',
        },
        {
          title: 'Vous voyez où vous en êtes',
          body: 'Une vérification mensuelle dans Google, dans Maps et dans les réponses des IA, sans ajouter un autre outil.',
        },
        {
          title: 'En dehors du site aussi',
          body: 'Des publications sur votre fiche Google Business, avec votre accord, dans le même prix.',
        },
        {
          title: 'Shopify en plus de WordPress',
          body: 'Le même système sur les deux plateformes, avec le même rapport.',
        },
      ],
    },
    faq: {
      eyebrow: 'Questions',
      title: 'Ce que l’on demande avant de changer',
      items: [
        {
          q: 'Peut-on garder Yoast et vous ajouter ?',
          a: 'Oui. Yoast peut continuer à s’occuper des données structurées et des redirections pendant que nous écrivons et publions. Il vaut la peine de vérifier que les deux extensions n’émettent pas les mêmes données structurées en double.',
        },
        {
          q: 'Yoast ne suit vraiment pas les positions ?',
          a: 'Aucune fonction de ce type n’apparaît dans la liste des fonctions Premium de leur page produit. C’est ce que dit leur page, et non une affirmation de notre part sur ce que le produit sait faire.',
        },
        {
          q: 'Remplacez-vous Yoast ?',
          a: 'Pas nécessairement. Nous produisons et nous mesurons ; lui est un outil d’édition dans WordPress. Beaucoup de sites utilisent les deux.',
        },
      ],
    },
    close: { title: 'Voyez où en est votre site, sans vous inscrire' },
  },
  it: {
    competitor: 'Yoast SEO',
    eyebrow: 'Go Top SEO a confronto con Yoast',
    metaTitle: 'Go Top SEO a confronto con Yoast SEO | Confronto',
    metaDescription:
      'Go Top SEO a confronto con Yoast SEO: chi scrive e pubblica i contenuti, chi monitora le posizioni, che cosa comprende ogni prezzo e in quali casi Yoast è la scelta migliore.',
    hero: {
      title: 'Yoast dice che cosa correggere.',
      accent: 'Noi correggiamo e scriviamo',
      subtitle:
        'Yoast è il nome più antico e più sicuro della SEO su WordPress e accompagna chi scrive dentro l’editor. Go Top SEO è pensato per chi guida un’azienda e non ha nessuno che scriva: il sistema pianifica gli argomenti, scrive gli articoli, li pubblica e segue le posizioni.',
    },
    table: {
      eyebrow: 'Il confronto',
      title: 'Che cosa fa ciascuno, secondo le pagine di Yoast stessa',
      checkedOn: CHECKED,
      sources: SOURCES,
      rows: [
        {
          label: 'Prezzo',
          ours: 'A partire da 79 dollari al mese più imposte.',
          theirs:
            'Yoast SEO Premium a 118,80 dollari all’anno, più imposte. Per Shopify, 19 dollari ogni 30 giorni, più imposte. Esiste anche una versione gratuita.',
        },
        {
          label: 'Quanti siti',
          ours: 'Quelli coperti dal piano scelto, indicati nella pagina dei prezzi.',
          theirs: 'Un abbonamento copre un sito o un dominio. Un altro sito richiede un altro abbonamento, con uno sconto a volume.',
        },
        {
          label: 'Chi scrive gli articoli',
          ours: 'Il sistema. Argomenti, testo, immagini e link interni, dopo l’approvazione.',
          theirs:
            'Il cliente. La loro pagina descrive titoli e meta description redatti dall’IA, oltre a idee e inizi di bozza in Content Planner. Non promette un articolo completo.',
        },
        {
          label: 'Pubblicazione sul sito',
          ours: 'Automatica su WordPress e Shopify.',
          theirs: 'Non descritta. È un’estensione dentro il proprio editor WordPress.',
        },
        {
          label: 'Monitoraggio delle posizioni',
          ours: 'Un controllo mensile su Google, su Google Maps e nelle risposte delle IA (fra cui ChatGPT, Gemini e Google AI).',
          theirs: 'Nessuna funzione di monitoraggio delle posizioni compare nell’elenco delle funzioni Premium della loro pagina di prodotto.',
        },
        {
          label: 'Profilo Google Business',
          ours: 'Pubblicazioni automatiche sul profilo, previa approvazione.',
          theirs:
            'Assente dall’elenco delle funzioni Premium. Un’estensione Local SEO separata è inclusa nell’abbonamento; non abbiamo letto l’elenco delle sue funzioni.',
        },
        {
          label: 'Lavoro sul sito',
          ours: 'Una parte delle correzioni passa dalla nostra estensione, senza leggere una riga di codice.',
          theirs:
            'Consigli e strumenti manuali: gestione dei reindirizzamenti, anche tramite importazione CSV, verifica di un articolo rispetto a cinque frasi chiave, suggerimenti di link interni, esercizio sui contenuti orfani e dati strutturati automatici in WordPress.',
        },
        {
          label: 'Prova e rimborso',
          ours: 'Una prova di 7 giorni, senza carta di credito, con disdetta in qualsiasi momento.',
          theirs:
            'La loro pagina di prodotto non indica alcuna prova gratuita. Un rimborso integrale è previsto entro 30 giorni dal primo acquisto, non ai rinnovi.',
        },
      ],
    },
    theirStrengths: {
      eyebrow: 'Quando Yoast è meglio',
      title: 'In questi casi Yoast è la risposta giusta',
      intro: 'Yoast è il prodotto che ha meno probabilità di rompere qualcosa, e a volte è esattamente ciò che serve.',
      items: [
        {
          title: 'Quando qualcuno scrive già',
          body:
            'Se in azienda c’è un redattore o un’agenzia che produce contenuti, Yoast lo guida durante la scrittura ed è tutto ciò che mancava. Pagare per un sistema che scrive al posto suo non avrebbe senso.',
        },
        {
          title: 'Quando si vuole uno strumento che consiglia e non agisce',
          body:
            'Yoast non tocca nulla senza che glielo si chieda. Per chi vuole mantenere il controllo su ogni parola pubblicata, è un vantaggio e non una mancanza.',
        },
        {
          title: 'Quando contano il prezzo e la tranquillità',
          body:
            '118,80 dollari all’anno, una versione gratuita, un rimborso integrale entro 30 giorni, assistenza 24/7 e le estensioni Local, News e Video incluse. In valore assoluto, è un ottimo acquisto.',
        },
      ],
    },
    ourStrengths: {
      eyebrow: 'Quando siamo più adatti noi',
      title: 'Quando non c’è nessuno che scriva',
      intro: 'La differenza vera non è tecnica. Sta in chi si siede a fare il lavoro.',
      items: [
        {
          title: 'Articoli che si pubblicano da sé',
          body: 'Un piano mensile di argomenti da approvare e poi articoli con immagini e link interni che escono da soli.',
        },
        {
          title: 'Sempre chiaro a che punto si è',
          body: 'Un controllo mensile su Google, su Maps e nelle risposte delle IA, senza aggiungere un altro strumento.',
        },
        {
          title: 'Anche fuori dal sito',
          body: 'Pubblicazioni sul profilo Google Business, previa approvazione, nello stesso prezzo.',
        },
        {
          title: 'Shopify oltre a WordPress',
          body: 'Lo stesso sistema sulle due piattaforme, con lo stesso report.',
        },
      ],
    },
    faq: {
      eyebrow: 'Domande',
      title: 'Che cosa si chiede prima di cambiare',
      items: [
        {
          q: 'Si può tenere Yoast e aggiungere voi?',
          a: 'Sì. Yoast può continuare a occuparsi dei dati strutturati e dei reindirizzamenti mentre noi scriviamo e pubblichiamo. Vale la pena verificare che le due estensioni non emettano gli stessi dati strutturati in doppio.',
        },
        {
          q: 'Yoast davvero non monitora le posizioni?',
          a: 'Nessuna funzione di questo tipo compare nell’elenco delle funzioni Premium della loro pagina di prodotto. È quanto dice la loro pagina, non un’affermazione nostra su ciò che il prodotto sa fare.',
        },
        {
          q: 'Sostituite Yoast?',
          a: 'Non necessariamente. Noi produciamo e misuriamo; Yoast è uno strumento di scrittura dentro WordPress. Molti siti usano entrambi.',
        },
      ],
    },
    close: { title: 'Scopra a che punto è il suo sito, senza registrarsi' },
  },
  // JAPANESE. Every claim about Yoast is a translation of the claim the other
  // locales make from their pages read on CHECKED, not a fresh reading: the
  // sources are the same pages, so the facts must not drift between languages.
  // Prices stay in the currency Yoast publishes them in.
  ja: {
    competitor: 'Yoast SEO',
    eyebrow: 'Go Top SEOとYoastの比較',
    metaTitle: 'Go Top SEOとYoast SEOの比較 | 比較',
    metaDescription:
      'Go Top SEOとYoast SEOの比較です。コンテンツを書いて公開するのはどちらか、検索順位を計測するのはどちらか、それぞれの料金に何が含まれるか、そしてYoastのほうが適しているのはどのような場合かをまとめました。',
    hero: {
      title: 'Yoastは何を直すべきか教えてくれます。',
      accent: '当社は直して、書きます',
      subtitle:
        'YoastはWordPressのSEOで最も歴史が長く、最も安心して使える名前であり、エディター内で書く人を助けてくれます。Go Top SEOは、会社を経営していて書く担当者がいない方のための製品です。システムが題材を計画し、記事を書き、公開し、検索順位を追います。',
    },
    table: {
      eyebrow: '比較',
      title: 'Yoast自身のページに書かれている内容にもとづく、それぞれの役割',
      checkedOn: CHECKED,
      sources: SOURCES,
      rows: [
        {
          label: '料金',
          ours: '月額79ドルから（税別）。',
          theirs:
            'Yoast SEO Premiumは年額118.80ドル（税別）。Shopify向けは30日ごとに19ドル（税別）。無料版もあります。',
        },
        {
          label: '対応サイト数',
          ours: 'お選びのプランに含まれる数で、料金ページに記載しています。',
          theirs: '1つの契約で1サイトまたは1ドメインです。別のサイトには別の契約が必要で、まとめ買いの割引があります。',
        },
        {
          label: '記事を書くのは誰か',
          ours: 'システムです。題材、本文、画像、内部リンクまで、承認後に用意します。',
          theirs:
            'お客様です。同社のページには、AIが作成するタイトルとメタディスクリプション、Content Plannerでの着想や下書きの出だしが記載されています。記事を1本仕上げるとは書かれていません。',
        },
        {
          label: 'サイトへの公開',
          ours: 'WordPressとShopifyに自動で公開します。',
          theirs: '記載がありません。ご自身のWordPressエディター内で動く拡張機能です。',
        },
        {
          label: '検索順位の計測',
          ours: 'Google、Googleマップ、そしてAIの回答（ChatGPT、Gemini、Google AIなど）について月に一度計測します。',
          theirs: '同社の製品ページのPremium機能一覧に、検索順位を計測する機能は記載されていません。',
        },
        {
          label: 'Googleビジネスプロフィール',
          ours: '承認後、プロフィールへ自動で投稿します。',
          theirs:
            'Premium機能の一覧にはありません。別の拡張機能であるLocal SEOが契約に含まれていますが、その機能一覧は当社では確認していません。',
        },
        {
          label: 'サイト側の作業',
          ours: '修正の一部は当社の拡張機能から行われ、コードを1行も読む必要はありません。',
          theirs:
            '助言と手作業の機能です。リダイレクトの管理（CSVの取り込みにも対応）、1本の記事を5つのキーフレーズに照らして確認、内部リンクの提案、孤立コンテンツの洗い出し、WordPressでの構造化データの自動付与などがあります。',
        },
        {
          label: 'トライアルと返金',
          ours: '7日間のトライアル、クレジットカード不要、いつでも解約できます。',
          theirs:
            '同社の製品ページには無料トライアルの記載がありません。初回購入から30日以内であれば全額返金があり、更新時には適用されません。',
        },
      ],
    },
    theirStrengths: {
      eyebrow: 'Yoastのほうがよい場合',
      title: 'このような場合はYoastが正しい答えです',
      intro: 'Yoastは何かを壊す可能性が最も低い製品で、それがまさに必要な場合もあります。',
      items: [
        {
          title: 'すでに書いている人がいる場合',
          body:
            '社内にライターがいる、あるいはコンテンツを制作している代理店がいる場合、Yoastは書いている最中に助言してくれるので、足りなかったものはそれだけです。代わりに書いてくれるシステムに料金を払う意味はありません。',
        },
        {
          title: '助言はしても手を出さない道具がほしい場合',
          body:
            'Yoastは、頼まない限り何にも手を加えません。公開するすべての言葉を自分で管理したい方にとっては、欠点ではなく長所です。',
        },
        {
          title: '料金と安心を重視する場合',
          body:
            '年額118.80ドル、無料版、30日以内の全額返金、24時間365日のサポート、そしてLocal・News・Videoの各拡張機能が含まれます。金額だけを見れば、とてもよい買い物です。',
        },
      ],
    },
    ourStrengths: {
      eyebrow: '当社のほうが適している場合',
      title: '書く担当者がいない場合',
      intro: '本当の違いは技術ではありません。誰が座って作業をするか、という点にあります。',
      items: [
        {
          title: '自動で公開される記事',
          body: '毎月の題材の計画をご承認いただくだけで、画像と内部リンクの入った記事が自動で公開されます。',
        },
        {
          title: '現状がいつでもわかります',
          body: 'Google、マップ、AIの回答について月に一度計測します。別の道具を増やす必要はありません。',
        },
        {
          title: 'サイトの外も',
          body: 'Googleビジネスプロフィールへの投稿も、承認後、同じ料金に含まれます。',
        },
        {
          title: 'WordPressに加えてShopifyも',
          body: '同じシステムが両方のプラットフォームで動き、レポートも同じです。',
        },
      ],
    },
    faq: {
      eyebrow: 'よくある質問',
      title: '乗り換える前に聞かれること',
      items: [
        {
          q: 'Yoastを残したまま、御社を追加できますか',
          a: 'はい。構造化データとリダイレクトはYoastに任せたまま、当社が記事を書いて公開することができます。2つの拡張機能が同じ構造化データを二重に出力していないかは、確認しておく価値があります。',
        },
        {
          q: 'Yoastは本当に検索順位を計測しないのですか',
          a: '同社の製品ページのPremium機能一覧に、その種の機能は記載されていません。これは同社のページに書かれている内容であり、製品の能力について当社が述べているものではありません。',
        },
        {
          q: 'Yoastの代わりになりますか',
          a: '必ずしもそうではありません。当社は制作して計測するものであり、YoastはWordPress内の執筆支援の道具です。両方を使っているサイトは少なくありません。',
        },
      ],
    },
    close: { title: 'ご自身のサイトの現状を、登録なしで確認する' },
  },
}
