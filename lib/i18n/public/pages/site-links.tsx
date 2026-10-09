/**
 * /features/site-links in four languages (w11). The owner asked on 9 Oct 2026
 * whether links belonged in the "what the system does" menu; they do, because
 * the Links tab has shipped and is not behind a flag or a plan.
 *
 * WHAT THIS PAGE CLAIMS, and where it comes from:
 *   - internal links between the customer's own pages are added to an article
 *     while it is written (lib/content/auto-internal-links/step.ts, on by
 *     default, draft only). It is NOT an approval queue, so nothing here says
 *     "you choose which ones go in": the customer's approval of the article is
 *     the approval of its links;
 *   - the tab reports what each article links to, what links to it, and which
 *     pages nothing links to (components/site-links/InternalLinksSection.tsx);
 *   - the free-listings list is hand-checked and filtered by the project's
 *     country and language (lib/site-links/free-listings.ts);
 *   - Search Console has no links report in its API, so the tab links into
 *     Search Console and can take a CSV snapshot the customer exports
 *     (lib/site-links/search-console-links.ts, lib/site-links/gsc-import).
 *
 * WHAT IT DELIBERATELY LEAVES OUT: the opt-in link network between Go Top
 * customers. It exists, it has consent, caps and relevance rules, and the terms
 * already describe it — but advertising a link network on a marketing page is a
 * Google spam-policy judgement that belongs to the owner, not to this file.
 * Nothing here implies links can be bought, traded or obtained from us.
 */
import { ArrowLeftRight, FileSearch, Info, Link2, ListChecks, MapPinned, Network, Search, Unlink } from 'lucide-react'
import { WorkListVisual } from '@/components/public/feature-visuals'
import { FEATURE_COMMON } from '@/lib/i18n/public/feature-common'
import type { MarketingPage } from './marketing-page'

const he = FEATURE_COMMON.he
const en = FEATURE_COMMON.en
const es = FEATURE_COMMON.es
const pt = FEATURE_COMMON['pt-BR']

export const SITE_LINKS_PAGE: MarketingPage = {
  path: '/features/site-links',
  meta: {
    he: {
      title: 'קישורים לאתר | Go Top SEO',
      description: 'קישורים פנימיים נוספים למאמרים בזמן הכתיבה, דוח שמראה מה מקשר למה, עמודים שאף אחד לא מקשר אליהם, ורשימה של מקומות חינמיים שבהם כדאי שהעסק יופיע.',
    },
    en: {
      title: 'Links to Your Site | Go Top SEO',
      description: 'Internal links added to articles as they are written, a report of what links to what, pages nothing links to, and a list of free places your business should be listed in.',
    },
    es: {
      title: 'Enlaces a tu sitio | Go Top SEO',
      description: 'Enlaces internos añadidos a los artículos mientras se escriben, un informe de qué enlaza con qué, páginas a las que nadie enlaza y una lista de sitios gratuitos donde conviene aparecer.',
    },
    'pt-BR': {
      title: 'Links para o seu site | Go Top SEO',
      description: 'Links internos adicionados aos artigos enquanto são escritos, um relatório de o que liga a o quê, páginas que ninguém referencia e uma lista de lugares gratuitos onde vale a pena aparecer.',
    },
  },
  content: {
    he: {
      hero: {
        eyebrow: 'קישורים לאתר',
        eyebrowIcon: Link2,
        title: 'העמודים שלכם',
        accent: 'מחזקים זה את זה',
        subtitle: 'כל מאמר שנכתב מקבל קישורים פנימיים לעמודים הרלוונטיים אצלכם, ואתם רואים במסך אחד מה מקשר למה, לאילו עמודים אף אחד לא מקשר, ואיפה עוד כדאי שהעסק יופיע בלי לשלם.',
        trust: he.trust,
        primary: he.trial,
        secondary: he.check,
        visual: (
          <WorkListVisual
            heading="הקישורים באתר שלכם"
            rows={[
              { title: '3 קישורים פנימיים נוספו למאמר', detail: 'מדריך מחירים', icon: ArrowLeftRight, done: true, status: 'נוסף' },
              { title: 'עמוד שאף אחד לא מקשר אליו', detail: '', url: '/services/repair', icon: Unlink, done: false, status: 'לטיפול' },
              { title: 'מקום חינמי להופיע בו', detail: 'מדריך עסקים מקומי', icon: MapPinned, done: false, status: 'מומלץ' },
              { title: 'נתוני Search Console', detail: 'תמונת מצב מקובץ שייצאתם', icon: Search, done: true, status: 'מעודכן' },
            ]}
          />
        ),
      },
      sections: [
        {
          kind: 'cards',
          tone: 'contrast',
          eyebrow: 'מה יש במסך הקישורים',
          title: 'ארבעה דברים שאף אחד לא עושה ידנית',
          items: [
            { icon: ArrowLeftRight, title: 'קישורים פנימיים בכתיבה', body: 'בזמן שהמאמר נכתב, המערכת מחברת אותו לעמודים הרלוונטיים אצלכם, רק כשהביטוי כבר מופיע בטקסט באופן טבעי. אתם עוברים על המאמר לפני הפרסום, כמו תמיד.' },
            { icon: Network, title: 'מה מקשר למה', body: 'לכל מאמר רואים לאן הוא מקשר ומי מקשר אליו. זה מה שמסביר למה עמוד מסוים לא זז בגוגל בזמן שאחרים כן.' },
            { icon: Unlink, title: 'עמודים יתומים', body: 'עמודים שאף עמוד אחר באתר לא מקשר אליהם, ולכן גוגל מתקשה להגיע אליהם ולהבין שהם חשובים. העמודים שמקושרים מהתפריט או מדף הבית לא נספרים כיתומים.' },
            { icon: ListChecks, title: 'מקומות חינמיים להופיע בהם', body: 'רשימה שנבדקה ידנית של מדריכים ופרופילים עסקיים לפי המדינה והשפה של הפרויקט, עם סימון איפה העסק כבר מופיע.' },
          ],
        },
        {
          kind: 'callout',
          icon: Info,
          title: 'מה שאנחנו לא עושים',
          body: 'אנחנו לא מוכרים קישורים, לא קונים קישורים ולא מבטיחים קישורים מאתרים חיצוניים. מה שבמסך הזה הוא הקישורים שלכם, בתוך האתר שלכם, ורשימה של מקומות שבהם אפשר להופיע בחינם.',
        },
        {
          kind: 'cards',
          columns: 2,
          eyebrow: 'Search Console',
          title: 'הקישורים שגוגל כבר מצא',
          items: [
            { icon: FileSearch, title: 'קישור ישיר לדוח של גוגל', body: 'ל-Search Console אין ממשק שמחזיר את רשימת הקישורים, אז אנחנו לא ממציאים אותה. יש קישור ישיר לדוח אצל גוגל.' },
            { icon: Search, title: 'תמונת מצב מקובץ שייצאתם', body: 'אפשר להעלות קובץ CSV שייצאתם מ-Search Console ולראות אותו בתוך המערכת. זו תמונת מצב ליום שבו ייצאתם, והיא לא מתעדכנת לבד.' },
          ],
        },
        {
          kind: 'faq',
          eyebrow: 'שאלות נפוצות',
          title: 'מה שואלים על קישורים',
          items: [
            { q: 'אני צריך לאשר כל קישור פנימי?', a: 'לא. הקישורים הפנימיים נכנסים לטיוטה של המאמר בזמן הכתיבה, ואתם מאשרים את המאמר כולו לפני שהוא מתפרסם. אפשר למחוק או לשנות כל קישור בעורך.' },
            { q: 'למה לפעמים לא נוספו קישורים למאמר?', a: 'קישור פנימי נוסף רק כשיש מפת אתר עדכנית ויש עמוד מתאים באמת, והביטוי כבר מופיע בטקסט. במאמר הראשון באתר חדש, או כשאין עמוד רלוונטי, לא ייווספו קישורים.' },
            { q: 'זה עובד גם בחנות Shopify?', a: 'כן. הקישורים הפנימיים נכנסים למאמר עצמו, והמאמר מתפרסם לבלוג של החנות.' },
          ],
        },
      ],
      cta: { title: 'תנו לעמודים שלכם לעבוד אחד בשביל השני', body: he.closeBody, primary: he.trial, secondary: he.check },
    },
    en: {
      hero: {
        eyebrow: 'Links to your site',
        eyebrowIcon: Link2,
        title: 'Your pages',
        accent: 'strengthen each other',
        subtitle: 'Every article that gets written is linked to the relevant pages on your own site, and one screen shows you what links to what, which pages nothing links to, and where else your business should be listed for free.',
        trust: en.trust,
        primary: en.trial,
        secondary: en.check,
        visual: (
          <WorkListVisual
            heading="Links on your site"
            rows={[
              { title: '3 internal links added to an article', detail: 'Pricing guide', icon: ArrowLeftRight, done: true, status: 'Added' },
              { title: 'A page nothing links to', detail: '', url: '/services/repair', icon: Unlink, done: false, status: 'To do' },
              { title: 'A free place to be listed', detail: 'Local business directory', icon: MapPinned, done: false, status: 'Suggested' },
              { title: 'Search Console data', detail: 'Snapshot from a file you exported', icon: Search, done: true, status: 'Up to date' },
            ]}
          />
        ),
      },
      sections: [
        {
          kind: 'cards',
          tone: 'contrast',
          eyebrow: 'What the Links screen holds',
          title: 'Four things nobody does by hand',
          items: [
            { icon: ArrowLeftRight, title: 'Internal links as the article is written', body: 'While the article is being written, the system connects it to the relevant pages on your site, and only where the phrase already appears naturally in the text. You review the article before it publishes, as always.' },
            { icon: Network, title: 'What links to what', body: 'For every article you see where it links to and what links to it. That is what explains why one page will not move in Google while others do.' },
            { icon: Unlink, title: 'Orphan pages', body: 'Pages no other page on your site links to, which makes it hard for Google to reach them and to treat them as important. Pages linked from the home page or the menu are not counted as orphans.' },
            { icon: ListChecks, title: 'Free places to be listed', body: 'A hand-checked list of directories and business profiles for the project’s country and language, marked where your business already appears.' },
          ],
        },
        {
          kind: 'callout',
          icon: Info,
          title: 'What we do not do',
          body: 'We do not sell links, buy links, or promise links from other people’s sites. What this screen holds is your own links, inside your own site, and a list of places you can be listed in for free.',
        },
        {
          kind: 'cards',
          columns: 2,
          eyebrow: 'Search Console',
          title: 'The links Google already found',
          items: [
            { icon: FileSearch, title: 'A direct link to Google’s own report', body: 'Search Console has no API that returns the list of links, so we do not invent one. There is a direct link into the report at Google.' },
            { icon: Search, title: 'A snapshot from a file you exported', body: 'You can upload a CSV you exported from Search Console and see it inside the system. It is a snapshot of the day you exported it, and it does not update on its own.' },
          ],
        },
        {
          kind: 'faq',
          eyebrow: 'Common questions',
          title: 'What people ask about links',
          items: [
            { q: 'Do I have to approve every internal link?', a: 'No. Internal links go into the article draft while it is written, and you approve the whole article before it publishes. You can remove or change any link in the editor.' },
            { q: 'Why did an article get no links sometimes?', a: 'An internal link is only added when there is an up-to-date site map and a genuinely matching page, and the phrase already appears in the text. On a new site’s first article, or when no relevant page exists, no links are added.' },
            { q: 'Does this work on a Shopify store?', a: 'Yes. The internal links go into the article itself, and the article publishes to your store blog.' },
          ],
        },
      ],
      cta: { title: 'Let your pages work for each other', body: en.closeBody, primary: en.trial, secondary: en.check },
    },
    es: {
      hero: {
        eyebrow: 'Enlaces a tu sitio',
        eyebrowIcon: Link2,
        title: 'Tus páginas',
        accent: 'se refuerzan entre sí',
        subtitle: 'Cada artículo que se escribe se enlaza con las páginas relevantes de tu propio sitio, y una sola pantalla te muestra qué enlaza con qué, a qué páginas no enlaza nadie y dónde más conviene que tu negocio aparezca gratis.',
        trust: es.trust,
        primary: es.trial,
        secondary: es.check,
        visual: (
          <WorkListVisual
            heading="Los enlaces de tu sitio"
            rows={[
              { title: '3 enlaces internos añadidos a un artículo', detail: 'Guía de precios', icon: ArrowLeftRight, done: true, status: 'Añadido' },
              { title: 'Una página a la que nadie enlaza', detail: '', url: '/services/repair', icon: Unlink, done: false, status: 'Pendiente' },
              { title: 'Un sitio gratuito donde aparecer', detail: 'Directorio local de negocios', icon: MapPinned, done: false, status: 'Sugerido' },
              { title: 'Datos de Search Console', detail: 'Instantánea de un archivo que exportaste', icon: Search, done: true, status: 'Al día' },
            ]}
          />
        ),
      },
      sections: [
        {
          kind: 'cards',
          tone: 'contrast',
          eyebrow: 'Qué hay en la pantalla de enlaces',
          title: 'Cuatro cosas que nadie hace a mano',
          items: [
            { icon: ArrowLeftRight, title: 'Enlaces internos mientras se escribe', body: 'Mientras se escribe el artículo, el sistema lo conecta con las páginas relevantes de tu sitio, y solo donde la frase ya aparece de forma natural en el texto. Tú revisas el artículo antes de publicarlo, como siempre.' },
            { icon: Network, title: 'Qué enlaza con qué', body: 'De cada artículo ves a dónde enlaza y qué enlaza hacia él. Eso es lo que explica por qué una página no se mueve en Google mientras otras sí.' },
            { icon: Unlink, title: 'Páginas huérfanas', body: 'Páginas a las que ninguna otra página de tu sitio enlaza, lo que dificulta que Google llegue a ellas y las considere importantes. Las páginas enlazadas desde la portada o el menú no cuentan como huérfanas.' },
            { icon: ListChecks, title: 'Sitios gratuitos donde aparecer', body: 'Una lista revisada a mano de directorios y perfiles de empresa según el país y el idioma del proyecto, con una marca donde tu negocio ya aparece.' },
          ],
        },
        {
          kind: 'callout',
          icon: Info,
          title: 'Lo que no hacemos',
          body: 'No vendemos enlaces, no compramos enlaces y no prometemos enlaces desde sitios de terceros. Lo que hay en esta pantalla son tus propios enlaces, dentro de tu propio sitio, y una lista de lugares donde puedes aparecer gratis.',
        },
        {
          kind: 'cards',
          columns: 2,
          eyebrow: 'Search Console',
          title: 'Los enlaces que Google ya encontró',
          items: [
            { icon: FileSearch, title: 'Un enlace directo al informe de Google', body: 'Search Console no tiene una API que devuelva la lista de enlaces, así que no la inventamos. Hay un enlace directo al informe en Google.' },
            { icon: Search, title: 'Una instantánea de un archivo que exportaste', body: 'Puedes subir un CSV exportado de Search Console y verlo dentro del sistema. Es una instantánea del día en que lo exportaste y no se actualiza sola.' },
          ],
        },
        {
          kind: 'faq',
          eyebrow: 'Preguntas frecuentes',
          title: 'Lo que se pregunta sobre enlaces',
          items: [
            { q: '¿Tengo que aprobar cada enlace interno?', a: 'No. Los enlaces internos entran en el borrador del artículo mientras se escribe, y tú apruebas el artículo entero antes de publicarlo. Puedes quitar o cambiar cualquier enlace en el editor.' },
            { q: '¿Por qué a veces un artículo no recibió enlaces?', a: 'Un enlace interno solo se añade cuando hay un mapa del sitio actualizado y una página que de verdad encaja, y la frase ya aparece en el texto. En el primer artículo de un sitio nuevo, o cuando no existe una página relevante, no se añaden enlaces.' },
            { q: '¿Funciona también en una tienda Shopify?', a: 'Sí. Los enlaces internos entran en el propio artículo, y el artículo se publica en el blog de tu tienda.' },
          ],
        },
      ],
      cta: { title: 'Haz que tus páginas trabajen unas para otras', body: es.closeBody, primary: es.trial, secondary: es.check },
    },
    'pt-BR': {
      hero: {
        eyebrow: 'Links para o seu site',
        eyebrowIcon: Link2,
        title: 'Suas páginas',
        accent: 'fortalecem umas às outras',
        subtitle: 'Cada artigo que é escrito recebe links para as páginas relevantes do seu próprio site, e uma única tela mostra o que liga a o quê, quais páginas ninguém referencia e onde mais vale a pena o seu negócio aparecer de graça.',
        trust: pt.trust,
        primary: pt.trial,
        secondary: pt.check,
        visual: (
          <WorkListVisual
            heading="Os links do seu site"
            rows={[
              { title: '3 links internos adicionados a um artigo', detail: 'Guia de preços', icon: ArrowLeftRight, done: true, status: 'Adicionado' },
              { title: 'Uma página que ninguém referencia', detail: '', url: '/services/repair', icon: Unlink, done: false, status: 'Pendente' },
              { title: 'Um lugar gratuito para aparecer', detail: 'Diretório local de negócios', icon: MapPinned, done: false, status: 'Sugerido' },
              { title: 'Dados do Search Console', detail: 'Retrato de um arquivo que você exportou', icon: Search, done: true, status: 'Em dia' },
            ]}
          />
        ),
      },
      sections: [
        {
          kind: 'cards',
          tone: 'contrast',
          eyebrow: 'O que tem na tela de links',
          title: 'Quatro coisas que ninguém faz na mão',
          items: [
            { icon: ArrowLeftRight, title: 'Links internos enquanto o artigo é escrito', body: 'Enquanto o artigo é escrito, o sistema o conecta às páginas relevantes do seu site, e apenas onde a expressão já aparece naturalmente no texto. Você revisa o artigo antes de publicar, como sempre.' },
            { icon: Network, title: 'O que liga a o quê', body: 'De cada artigo você vê para onde ele aponta e o que aponta para ele. É isso que explica por que uma página não se mexe no Google enquanto outras se mexem.' },
            { icon: Unlink, title: 'Páginas órfãs', body: 'Páginas que nenhuma outra página do seu site referencia, o que dificulta que o Google chegue até elas e as trate como importantes. Páginas ligadas a partir da home ou do menu não contam como órfãs.' },
            { icon: ListChecks, title: 'Lugares gratuitos para aparecer', body: 'Uma lista verificada à mão de diretórios e perfis de empresa conforme o país e o idioma do projeto, marcando onde o seu negócio já aparece.' },
          ],
        },
        {
          kind: 'callout',
          icon: Info,
          title: 'O que a gente não faz',
          body: 'A gente não vende links, não compra links e não promete links de sites de terceiros. O que existe nesta tela são os seus próprios links, dentro do seu próprio site, e uma lista de lugares onde você pode aparecer de graça.',
        },
        {
          kind: 'cards',
          columns: 2,
          eyebrow: 'Search Console',
          title: 'Os links que o Google já encontrou',
          items: [
            { icon: FileSearch, title: 'Um link direto para o relatório do Google', body: 'O Search Console não tem uma API que devolva a lista de links, então a gente não inventa uma. Existe um link direto para o relatório no Google.' },
            { icon: Search, title: 'Um retrato de um arquivo que você exportou', body: 'Você pode enviar um CSV exportado do Search Console e vê-lo dentro do sistema. É um retrato do dia em que você exportou, e não se atualiza sozinho.' },
          ],
        },
        {
          kind: 'faq',
          eyebrow: 'Perguntas frequentes',
          title: 'O que perguntam sobre links',
          items: [
            { q: 'Preciso aprovar cada link interno?', a: 'Não. Os links internos entram no rascunho do artigo enquanto ele é escrito, e você aprova o artigo inteiro antes da publicação. Dá para remover ou trocar qualquer link no editor.' },
            { q: 'Por que às vezes um artigo não recebeu links?', a: 'Um link interno só é adicionado quando existe um mapa do site atualizado e uma página que de fato combina, e a expressão já aparece no texto. No primeiro artigo de um site novo, ou quando não existe página relevante, nenhum link é adicionado.' },
            { q: 'Funciona também em uma loja Shopify?', a: 'Sim. Os links internos entram no próprio artigo, e o artigo é publicado no blog da sua loja.' },
          ],
        },
      ],
      cta: { title: 'Deixe suas páginas trabalharem umas para as outras', body: pt.closeBody, primary: pt.trial, secondary: pt.check },
    },
  },
}
