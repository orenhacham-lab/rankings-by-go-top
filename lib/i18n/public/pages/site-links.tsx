/**
 * /features/site-links in four languages (w11, reworked w12).
 *
 * The owner asked on 9 Oct 2026 for links to appear in the "what the system
 * does" menu. The first version of this page described the links INSIDE the
 * customer's own site; he meant the opt-in link network between Go Top
 * customers (lib/link-network), and said so on 9 Oct 2026. So the network leads
 * the page now, and the internal links follow it, in the same order as the
 * Links tab in the app (app/(dashboard)/site-links/page.tsx).
 *
 * WHAT THIS PAGE CLAIMS ABOUT THE NETWORK, and where each claim comes from
 * (lib/link-network/rules.ts, place.ts, store.ts, and clause 15A of the terms,
 * which is already public in all four languages):
 *   - opt-in per project, off by default, by the project's owner, after
 *     accepting the network's terms on screen (membership route + consent.ts);
 *   - only a site whose owner proved control of the domain in the app, so a
 *     stranger's site can never enter (rules.ts, provenDomains);
 *   - at most ONE outgoing link per article, inside a paragraph that already
 *     exists, on words already in it; nothing is rewritten (place.ts step 4-6,
 *     anchor.ts);
 *   - the giving side sees the link in the log before the article is published
 *     and can take it out (place.ts: the link sits in the DRAFT);
 *   - never a competitor or the same line of business, never reciprocal, never
 *     a short loop, never the same owner / client / server address (rules.ts);
 *   - low caps, and they ramp for a new member: at most 1 received link in the
 *     first month, 2 in the second, 3 a month later; at most 4 given a month
 *     (LINK_NETWORK_RULES);
 *   - a site that is new or thin does not take part (minProjectAgeDays,
 *     minPublishedArticles / minIndexedPages);
 *   - a Shopify store joins like any other site, and its links go only into
 *     articles we write and publish to its blog (rules.ts, terms 15A);
 *   - we publish no member list; the receiving side sees the linking domain
 *     (terms 15A, "פרטיות");
 *   - no number of links and no ranking promise, and the network is not part of
 *     what a plan commits to (terms 15A).
 * WHAT THE PAGE DELIBERATELY DOES NOT SAY: the owner's instruction on 9 Oct
 * 2026 was that no wording may read as link manipulation to Google. So the
 * public copy never uses the vocabulary of link schemes, link building or
 * backlinks, never frames the feature as a way to influence ranking, and never
 * lists the monthly caps like a quota to fill. It describes an editorial
 * mention that earns its place in a paragraph, and the restraint around it.
 * The Google risk itself is disclosed where it legally belongs and where the
 * owner accepts it: clause 15A of the terms and the joining screen in the app.
 * Guard 4j below keeps that vocabulary off the page.
 *
 * The rest of the page (internal links while an article is written, orphan
 * pages, the hand-checked free listings, the Search Console links report) is
 * unchanged and comes from lib/content/auto-internal-links/step.ts,
 * components/site-links/InternalLinksSection.tsx, lib/site-links/free-listings.ts
 * and lib/site-links/search-console-links.ts.
 *
 * Nothing here implies links can be bought, sold or traded. Guarded by
 * components/public/__qa__/public-nav-menus.qa.ts (4f, 4g).
 */
import { ArrowDownToLine, ArrowLeftRight, ArrowUpFromLine, Ban, FileSearch, Info, Link2, ListChecks, MapPinned, Network, Search, ShieldCheck, Unlink } from 'lucide-react'
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
      description: 'עסקים משלימים שהם לקוחות Go Top SEO יכולים להזכיר אתכם בתוך מאמרים שנכתבים להם, רק כשזה עוזר לקורא. בלי החלפות ובלי מתחרים, ההשתתפות אופציונלית וכבויה כברירת מחדל. בנוסף: קישורים פנימיים, עמודים יתומים ומקומות חינמיים להופיע בהם.',
    },
    en: {
      title: 'Links to Your Site | Go Top SEO',
      description: 'Complementary businesses that use Go Top SEO can mention you inside the articles written for them, only where it helps the reader. No trades, never a competitor, optional and off by default. Plus internal links, orphan pages and free places to be listed in.',
    },
    es: {
      title: 'Enlaces a tu sitio | Go Top SEO',
      description: 'Negocios complementarios que usan Go Top SEO pueden mencionarte dentro de los artículos que escribimos para ellos, solo donde ayuda a quien lee. Sin intercambios, nunca un competidor, opcional y desactivado por defecto. Además: enlaces internos, páginas huérfanas y sitios gratuitos donde aparecer.',
    },
    'pt-BR': {
      title: 'Links para o seu site | Go Top SEO',
      description: 'Negócios complementares que usam a Go Top SEO podem mencionar você dentro dos artigos escritos para eles, só onde ajuda quem lê. Sem trocas, nunca um concorrente, opcional e vem desligado. Além disso: links internos, páginas órfãs e lugares gratuitos para aparecer.',
    },
  },
  content: {
    he: {
      hero: {
        eyebrow: 'קישורים לאתר',
        eyebrowIcon: Link2,
        title: 'אזכורים וקישורים',
        accent: 'מתוך תוכן של עסקים משלימים',
        subtitle: 'לקוחות Go Top SEO מתחומים משלימים יכולים להזכיר אתכם בתוך מאמרים שנכתבים עבורם, כשהעמוד שלכם באמת עוזר לקורא של אותה פסקה. אף פעם לא מתחרה ואף פעם לא בהחלפה הדדית. ההשתתפות אופציונלית וכבויה כברירת מחדל.',
        trust: he.trust,
        primary: he.trial,
        secondary: he.check,
        visual: (
          <WorkListVisual
            heading="אזכורים וקישורים"
            rows={[
              { title: 'קישור נכנס מעסק משלים', detail: 'מתוך מאמר שפורסם בבלוג שלו', icon: ArrowDownToLine, done: true, status: 'פורסם' },
              { title: 'קישור יוצא במאמר שלכם', detail: 'מוצג לפני הפרסום, אפשר להסיר', icon: ArrowUpFromLine, done: false, status: 'לאישור' },
              { title: 'עסק מאותו תחום', detail: 'לא משובץ, לא בכיוון אחד ולא בשני', icon: Ban, done: true, status: 'נחסם' },
              { title: '3 קישורים פנימיים נוספו למאמר', detail: 'מדריך מחירים', icon: ArrowLeftRight, done: true, status: 'נוסף' },
            ]}
          />
        ),
      },
      sections: [
        {
          kind: 'steps',
          eyebrow: 'עסקים משלימים',
          title: 'איך זה עובד',
          items: [
            { title: 'אתם מפעילים', body: 'ההשתתפות היא לכל אתר בנפרד, על ידי בעל הפרויקט, אחרי אישור התנאים במסך. כבויה כברירת מחדל, ואפשר לצאת בכל רגע.' },
            { title: 'רק אתרים אמיתיים', body: 'משתתפים רק אתרים שהבעלים חיבר במערכת דרך WordPress או Search Console. להקליד כתובת זה לא מספיק, ולכן אתר של זר לא יכול להיכנס.' },
            { title: 'האזכור נכנס לתוך המאמר', body: 'כשנכתב מאמר לעסק משלים, הוא יכול להזכיר עמוד רלוונטי אצלכם, על מילים שכבר נמצאות במשפט. אנחנו לא משנים את הטקסט ולא מוסיפים פסקאות.' },
            { title: 'אתם רואים הכל', body: 'כל שיבוץ נרשם ומוצג לשני הצדדים. קישור יוצא מהמאמר שלכם מופיע לפני הפרסום, ואפשר להסיר אותו.' },
          ],
        },
        {
          kind: 'cards',
          tone: 'contrast',
          eyebrow: 'הכללים',
          title: 'איך זה נשאר טבעי',
          items: [
            { icon: Ban, title: 'אף פעם לא מתחרה', body: 'לא עסק מאותו תחום ולא דומיין שאחד הצדדים סימן כמתחרה. אתר שהתחום שלו לא ידוע לנו נשאר בחוץ, אנחנו לא מנחשים.' },
            { icon: ArrowLeftRight, title: 'בלי החלפות', body: 'אנחנו לא עושים החלפות: מי שמקבל מכם אזכור לא מזכיר אתכם בחזרה, וזוג אתרים נפגש פעם אחת בלבד. גם מעגל קצר של שלושה אתרים נחסם.' },
            { icon: ShieldCheck, title: 'אחד, ובמשורה', body: 'קישור אחד לכל היותר במאמר, ואנחנו מעדיפים לוותר מאשר לדחוף עוד אחד. אתר שהצטרף זה עתה מתחיל לאט.' },
            { icon: Network, title: 'רק כשזה עוזר לקורא', body: 'אזכור נכנס רק כשהעמוד באמת עוזר לקורא של אותה פסקה. כשההתאמה חלשה לא נכנס כלום. אתרים חדשים או דלים בתוכן לא משתתפים.' },
          ],
        },
        {
          kind: 'callout',
          icon: Info,
          title: 'מה שאנחנו לא עושים',
          body: (
            <>
              <p>
                אנחנו לא מוכרים קישורים, לא קונים קישורים ולא מבטיחים קישורים מאתרים חיצוניים. אין התחייבות למספר
                קישורים ואין התחייבות לדירוג.
              </p>
              <p>
                ההשתתפות אופציונלית, כבויה כברירת מחדל, אפשר לצאת בכל רגע, והיא תוספת ולא חלק מההתחייבות של
                התוכנית. בתנאי השימוש היא מפורטת במלואה ב<a className="underline" href="/terms#link-network">סעיף 15א</a>,
                וכדאי לקרוא אותו לפני שמפעילים.
              </p>
              <p>
                אנחנו לא מפרסמים רשימה של האתרים המשתתפים. הצד שמקבל אזכור רואה את כתובת האתר שקישר אליו.
                האחריות לתוכן האתר ולעמידה בהנחיות מנועי החיפוש נשארת אצל בעל האתר, ואנחנו רשאים להשהות או להפסיק
                את השירות.
              </p>
            </>
          ),
        },
        {
          kind: 'cards',
          columns: 2,
          eyebrow: 'גם בתוך האתר שלכם',
          title: 'הקישורים שמחזיקים את האתר',
          items: [
            { icon: ArrowLeftRight, title: 'קישורים פנימיים בכתיבה', body: 'בזמן שהמאמר נכתב, המערכת מחברת אותו לעמודים הרלוונטיים אצלכם, רק כשהביטוי כבר מופיע בטקסט באופן טבעי. אתם עוברים על המאמר לפני הפרסום, כמו תמיד.' },
            { icon: Unlink, title: 'עמודים יתומים', body: 'עמודים שאף עמוד אחר באתר לא מקשר אליהם, ולכן גוגל מתקשה להגיע אליהם ולהבין שהם חשובים. העמודים שמקושרים מהתפריט או מדף הבית לא נספרים כיתומים.' },
            { icon: ListChecks, title: 'מקומות חינמיים להופיע בהם', body: 'רשימה שנבדקה ידנית של מדריכים ופרופילים עסקיים לפי המדינה והשפה של הפרויקט, עם סימון איפה העסק כבר מופיע.' },
            { icon: MapPinned, title: 'מה מקשר למה', body: 'לכל מאמר רואים לאן הוא מקשר ומי מקשר אליו. זה מה שמסביר למה עמוד מסוים לא זז בגוגל בזמן שאחרים כן.' },
          ],
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
            { q: 'כמה קישורים אקבל?', a: 'אין מספר מובטח, וגם לא מכסה שאנחנו מנסים למלא. אזכור נכנס רק כשנכתב מאמר שהעמוד שלכם באמת מתאים לפסקה בתוכו, ולכן זה קורה במשורה.' },
            { q: 'מישהו יראה שאני משתתף?', a: 'אנחנו לא מפרסמים רשימה של האתרים המשתתפים. הצד שמקבל אזכור רואה את כתובת האתר שקישר אליו, ואחרי הפרסום גם את העמוד שבו הקישור הופיע.' },
            { q: 'אני חייב להשתתף?', a: 'לא. זה כבוי כברירת מחדל, ההפעלה היא לכל אתר בנפרד, ואפשר לצאת בכל רגע. יציאה עוצרת אזכורים חדשים; קישורים שכבר פורסמו נשארים באתרים.' },
            { q: 'זה עובד גם בחנות Shopify?', a: 'כן, בהפעלה נפרדת ומרצון. האזכורים נכנסים רק למאמרים שאנחנו כותבים ומפרסמים לבלוג החנות. מאמר, עמוד, מוצר או קטגוריה שכבר קיימים בחנות לא נערכים.' },
            { q: 'מה עם הקישורים הפנימיים באתר?', a: 'הם ממשיכים לעבוד בלי קשר לזה: כל מאמר שנכתב מקבל קישורים לעמודים הרלוונטיים אצלכם, ואתם מאשרים את המאמר כולו לפני הפרסום.' },
          ],
        },
      ],
      cta: { title: 'תנו לעסקים משלימים לקשר אליכם', body: he.closeBody, primary: he.trial, secondary: he.check },
    },
    en: {
      hero: {
        eyebrow: 'Links to your site',
        eyebrowIcon: Link2,
        title: 'Mentions and links',
        accent: 'inside content from complementary businesses',
        subtitle: 'Go Top SEO customers in complementary fields can mention you inside the articles written for them, where your page genuinely helps the reader of that paragraph. Never a competitor, never a reciprocal trade. Taking part is optional and off by default.',
        trust: en.trust,
        primary: en.trial,
        secondary: en.check,
        visual: (
          <WorkListVisual
            heading="Mentions and links"
            rows={[
              { title: 'Incoming link from a complementary business', detail: 'From an article on its blog', icon: ArrowDownToLine, done: true, status: 'Published' },
              { title: 'Outgoing link in your article', detail: 'Shown before publishing, you can remove it', icon: ArrowUpFromLine, done: false, status: 'To review' },
              { title: 'Same line of business', detail: 'Not placed, in either direction', icon: Ban, done: true, status: 'Blocked' },
              { title: '3 internal links added to the article', detail: 'Pricing guide', icon: ArrowLeftRight, done: true, status: 'Added' },
            ]}
          />
        ),
      },
      sections: [
        {
          kind: 'steps',
          eyebrow: 'Complementary businesses',
          title: 'How it works',
          items: [
            { title: 'You switch it on', body: 'Taking part is per site, by the project owner, after accepting the terms on screen. Off by default, and you can leave whenever you like.' },
            { title: 'Only real sites', body: 'A site takes part only when its owner connected it in the app through WordPress or Search Console. Typing a domain in is not enough, so a stranger’s site cannot get in.' },
            { title: 'The mention goes inside the article', body: 'When an article is written for a complementary business, it can mention a relevant page of yours, on words already in the sentence. We do not rewrite the text and we add no paragraphs.' },
            { title: 'You see everything', body: 'Every placement is logged and shown to both sides. A link going out of your article appears before it is published, and you can take it out.' },
          ],
        },
        {
          kind: 'cards',
          tone: 'contrast',
          eyebrow: 'The rules',
          title: 'How it stays natural',
          items: [
            { icon: Ban, title: 'Never a competitor', body: 'Not the same line of business, and not a domain either side marked as a competitor. A site whose field we do not know stays out; we never guess.' },
            { icon: ArrowLeftRight, title: 'No trades', body: 'We do not trade: a site that receives a mention from you never mentions you back, and a pair meets once only. A short loop between three sites is blocked too.' },
            { icon: ShieldCheck, title: 'One, and sparingly', body: 'At most one link per article, and we would rather skip than push one more in. A site that has just started takes part slowly.' },
            { icon: Network, title: 'Only where it helps the reader', body: 'A mention goes in only where the page genuinely helps the reader of that paragraph. When the fit is weak, nothing goes in. New or thin sites do not take part.' },
          ],
        },
        {
          kind: 'callout',
          icon: Info,
          title: 'What we do not do',
          body: (
            <>
              <p>
                We do not sell links, buy links, or promise links from other people&rsquo;s sites. There is no promised
                number of links and no ranking promise.
              </p>
              <p>
                Taking part is optional, off by default, you can leave at any moment, and it is an extra rather than
                part of what a plan commits to. It is set out in full in{' '}
                <a className="underline" href="/en/terms#link-network">section 15A of the terms</a>, worth reading
                before you switch it on.
              </p>
              <p>
                We publish no list of participating sites. The receiving side sees the address of the site that linked
                to it. Responsibility for the site&rsquo;s content and for complying with search engine guidelines stays
                with the site owner, and we may pause or stop the service.
              </p>
            </>
          ),
        },
        {
          kind: 'cards',
          columns: 2,
          eyebrow: 'Inside your site too',
          title: 'The links that hold a site together',
          items: [
            { icon: ArrowLeftRight, title: 'Internal links while writing', body: 'As the article is written, the system connects it to the relevant pages on your site, only where the phrase already appears naturally in the text. You review the article before publishing, as always.' },
            { icon: Unlink, title: 'Orphan pages', body: 'Pages no other page on the site links to, so Google struggles to reach them and to see that they matter. Pages linked from the menu or the home page do not count as orphans.' },
            { icon: ListChecks, title: 'Free places to be listed', body: 'A hand-checked list of directories and business profiles for the project’s country and language, marking where the business already appears.' },
            { icon: MapPinned, title: 'What links to what', body: 'For every article you see what it links to and what links to it. That is what explains why one page is not moving in Google while others are.' },
          ],
        },
        {
          kind: 'cards',
          columns: 2,
          eyebrow: 'Search Console',
          title: 'The links Google already found',
          items: [
            { icon: FileSearch, title: 'A direct link to Google’s report', body: 'Search Console has no interface that returns the list of links, so we do not invent one. There is a direct link to the report at Google.' },
            { icon: Search, title: 'A snapshot from a file you export', body: 'You can upload a CSV you exported from Search Console and see it inside the system. It is a snapshot of the day you exported it and does not update by itself.' },
          ],
        },
        {
          kind: 'faq',
          eyebrow: 'FAQ',
          title: 'What people ask about links',
          items: [
            { q: 'How many links will I get?', a: 'There is no promised number, and no quota we try to fill. A mention goes in only when an article is written that your page genuinely fits a paragraph of, so it happens sparingly.' },
            { q: 'Will anyone see that I take part?', a: 'We publish no list of participating sites. The side receiving a mention sees the address of the site that linked to it, and after publishing also the page the link appeared on.' },
            { q: 'Do I have to take part?', a: 'No. It is off by default, switching it on is per site, and you can leave at any moment. Leaving stops new mentions; links already published stay on the sites.' },
            { q: 'Does it work on a Shopify store?', a: 'Yes, by switching it on separately and voluntarily. Mentions go only into articles we write and publish to the store blog. An article, page, product or collection that already exists in the store is not edited.' },
            { q: 'What about the internal links on my site?', a: 'They keep working regardless of this: every article written gets links to the relevant pages on your site, and you approve the whole article before it is published.' },
          ],
        },
      ],
      cta: { title: 'Let complementary businesses link to you', body: en.closeBody, primary: en.trial, secondary: en.check },
    },
    es: {
      hero: {
        eyebrow: 'Enlaces a tu sitio',
        eyebrowIcon: Link2,
        title: 'Menciones y enlaces',
        accent: 'dentro de contenido de negocios complementarios',
        subtitle: 'Clientes de Go Top SEO de sectores complementarios pueden mencionarte dentro de los artículos que escribimos para ellos, cuando tu página ayuda de verdad a quien lee ese párrafo. Nunca un competidor, nunca un intercambio recíproco. Participar es opcional y está desactivado por defecto.',
        trust: es.trust,
        primary: es.trial,
        secondary: es.check,
        visual: (
          <WorkListVisual
            heading="Menciones y enlaces"
            rows={[
              { title: 'Enlace recibido de un negocio complementario', detail: 'Desde un artículo de su blog', icon: ArrowDownToLine, done: true, status: 'Publicado' },
              { title: 'Enlace saliente en tu artículo', detail: 'Se muestra antes de publicar y puedes quitarlo', icon: ArrowUpFromLine, done: false, status: 'Por revisar' },
              { title: 'Negocio del mismo sector', detail: 'No se coloca, en ninguna dirección', icon: Ban, done: true, status: 'Bloqueado' },
              { title: '3 enlaces internos añadidos al artículo', detail: 'Guía de precios', icon: ArrowLeftRight, done: true, status: 'Añadido' },
            ]}
          />
        ),
      },
      sections: [
        {
          kind: 'steps',
          eyebrow: 'Negocios complementarios',
          title: 'Cómo funciona',
          items: [
            { title: 'Tú lo activas', body: 'Participar es por sitio, lo hace el propietario del proyecto y requiere aceptar los términos en pantalla. Está desactivado por defecto y puedes salir cuando quieras.' },
            { title: 'Solo sitios reales', body: 'Un sitio participa solo si su propietario lo conectó en la aplicación mediante WordPress o Search Console. Escribir un dominio no basta, así que el sitio de un desconocido no puede entrar.' },
            { title: 'La mención entra en el artículo', body: 'Cuando se escribe un artículo para un negocio complementario, puede mencionar una página relevante tuya, sobre palabras que ya están en la frase. No reescribimos el texto ni añadimos párrafos.' },
            { title: 'Lo ves todo', body: 'Cada colocación queda registrada y se muestra a las dos partes. Un enlace que sale de tu artículo aparece antes de publicarlo y puedes quitarlo.' },
          ],
        },
        {
          kind: 'cards',
          tone: 'contrast',
          eyebrow: 'Las reglas',
          title: 'Cómo se mantiene natural',
          items: [
            { icon: Ban, title: 'Nunca un competidor', body: 'Ni el mismo sector ni un dominio que alguna de las partes marcó como competidor. Un sitio cuyo sector no conocemos queda fuera; nunca lo adivinamos.' },
            { icon: ArrowLeftRight, title: 'Sin intercambios', body: 'No hacemos intercambios: quien recibe una mención tuya nunca te menciona de vuelta, y un par de sitios se encuentra una sola vez. También se bloquea el círculo corto entre tres sitios.' },
            { icon: ShieldCheck, title: 'Uno, y con mesura', body: 'Como máximo un enlace por artículo, y preferimos no poner ninguno antes que forzar uno más. Un sitio que acaba de empezar participa despacio.' },
            { icon: Network, title: 'Solo cuando ayuda a quien lee', body: 'Una mención entra solo donde la página ayuda de verdad a quien lee ese párrafo. Si el encaje es débil, no entra nada. Los sitios nuevos o con poco contenido no participan.' },
          ],
        },
        {
          kind: 'callout',
          icon: Info,
          title: 'Lo que no hacemos',
          body: (
            <>
              <p>
                No vendemos enlaces, no compramos enlaces y no prometemos enlaces de sitios de terceros. No hay un
                número de enlaces comprometido ni promesa de posicionamiento.
              </p>
              <p>
                Participar es opcional, está desactivado por defecto, puedes salir en cualquier momento y es un extra,
                no parte de lo que compromete un plan. Está explicado por completo en la sección 15A de los{' '}
                <a className="underline" href="/es/terms">términos de uso</a>, que conviene leer antes de activarlo.
              </p>
              <p>
                No publicamos ninguna lista de los sitios participantes. Quien recibe una mención ve la dirección del
                sitio que le enlazó. La responsabilidad por el contenido del sitio y por cumplir las directrices de los
                buscadores es del propietario del sitio, y podemos pausar o interrumpir el servicio.
              </p>
            </>
          ),
        },
        {
          kind: 'cards',
          columns: 2,
          eyebrow: 'También dentro de tu sitio',
          title: 'Los enlaces que sostienen un sitio',
          items: [
            { icon: ArrowLeftRight, title: 'Enlaces internos al escribir', body: 'Mientras se escribe el artículo, el sistema lo conecta con las páginas relevantes de tu sitio, solo cuando la expresión ya aparece de forma natural en el texto. Revisas el artículo antes de publicarlo, como siempre.' },
            { icon: Unlink, title: 'Páginas huérfanas', body: 'Páginas a las que ninguna otra página del sitio enlaza, por lo que a Google le cuesta llegar a ellas y entender que importan. Las páginas enlazadas desde el menú o la portada no cuentan como huérfanas.' },
            { icon: ListChecks, title: 'Sitios gratuitos donde aparecer', body: 'Una lista revisada a mano de directorios y perfiles de empresa según el país y el idioma del proyecto, con la marca de dónde ya aparece el negocio.' },
            { icon: MapPinned, title: 'Qué enlaza con qué', body: 'De cada artículo ves a qué enlaza y qué enlaza con él. Eso explica por qué una página no se mueve en Google mientras otras sí.' },
          ],
        },
        {
          kind: 'cards',
          columns: 2,
          eyebrow: 'Search Console',
          title: 'Los enlaces que Google ya encontró',
          items: [
            { icon: FileSearch, title: 'Enlace directo al informe de Google', body: 'Search Console no tiene una interfaz que devuelva la lista de enlaces, así que no la inventamos. Hay un enlace directo al informe en Google.' },
            { icon: Search, title: 'Una foto del archivo que exportes', body: 'Puedes subir un CSV exportado de Search Console y verlo dentro del sistema. Es una foto del día en que lo exportaste y no se actualiza sola.' },
          ],
        },
        {
          kind: 'faq',
          eyebrow: 'Preguntas frecuentes',
          title: 'Lo que se pregunta sobre los enlaces',
          items: [
            { q: '¿Cuántos enlaces recibiré?', a: 'No hay un número garantizado ni una cuota que intentemos llenar. Una mención entra solo cuando se escribe un artículo a cuyo párrafo tu página encaja de verdad, así que ocurre con mesura.' },
            { q: '¿Alguien verá que participo?', a: 'No publicamos ninguna lista de los sitios participantes. Quien recibe una mención ve la dirección del sitio que le enlazó y, tras la publicación, también la página donde apareció el enlace.' },
            { q: '¿Tengo que participar?', a: 'No. Está desactivado por defecto, se activa por sitio y puedes salir en cualquier momento. Salir detiene las menciones nuevas; los enlaces ya publicados se quedan en los sitios.' },
            { q: '¿Funciona en una tienda Shopify?', a: 'Sí, activándolo por separado y de forma voluntaria. Las menciones entran solo en los artículos que escribimos y publicamos en el blog de la tienda. Un artículo, una página, un producto o una colección que ya existan no se modifican.' },
            { q: '¿Y los enlaces internos de mi sitio?', a: 'Siguen funcionando al margen de esto: cada artículo que se escribe recibe enlaces a las páginas relevantes de tu sitio, y tú apruebas el artículo completo antes de publicarlo.' },
          ],
        },
      ],
      cta: { title: 'Deja que negocios complementarios te enlacen', body: es.closeBody, primary: es.trial, secondary: es.check },
    },
    'pt-BR': {
      hero: {
        eyebrow: 'Links para o seu site',
        eyebrowIcon: Link2,
        title: 'Menções e links',
        accent: 'dentro de conteúdo de negócios complementares',
        subtitle: 'Clientes da Go Top SEO de setores complementares podem mencionar você dentro dos artigos escritos para eles, quando a sua página realmente ajuda quem lê aquele parágrafo. Nunca um concorrente, nunca uma troca recíproca. Participar é opcional e vem desligado.',
        trust: pt.trust,
        primary: pt.trial,
        secondary: pt.check,
        visual: (
          <WorkListVisual
            heading="Menções e links"
            rows={[
              { title: 'Link recebido de um negócio complementar', detail: 'De um artigo no blog dele', icon: ArrowDownToLine, done: true, status: 'Publicado' },
              { title: 'Link de saída no seu artigo', detail: 'Aparece antes de publicar e você pode remover', icon: ArrowUpFromLine, done: false, status: 'Para revisar' },
              { title: 'Negócio do mesmo setor', detail: 'Não é inserido, em nenhuma direção', icon: Ban, done: true, status: 'Bloqueado' },
              { title: '3 links internos adicionados ao artigo', detail: 'Guia de preços', icon: ArrowLeftRight, done: true, status: 'Adicionado' },
            ]}
          />
        ),
      },
      sections: [
        {
          kind: 'steps',
          eyebrow: 'Negócios complementares',
          title: 'Como funciona',
          items: [
            { title: 'Você ativa', body: 'A participação é por site, feita pelo proprietário do projeto, depois de aceitar os termos na tela. Vem desligada e você pode sair quando quiser.' },
            { title: 'Só sites reais', body: 'Um site participa apenas quando o proprietário o conectou no aplicativo por WordPress ou Search Console. Digitar um domínio não basta, então o site de um estranho não entra.' },
            { title: 'A menção entra no artigo', body: 'Quando um artigo é escrito para um negócio complementar, ele pode mencionar uma página relevante sua, sobre palavras que já estão na frase. Não reescrevemos o texto nem acrescentamos parágrafos.' },
            { title: 'Você vê tudo', body: 'Cada inserção é registrada e mostrada aos dois lados. Um link que sai do seu artigo aparece antes da publicação e pode ser removido.' },
          ],
        },
        {
          kind: 'cards',
          tone: 'contrast',
          eyebrow: 'As regras',
          title: 'Como isso continua natural',
          items: [
            { icon: Ban, title: 'Nunca um concorrente', body: 'Nem o mesmo setor nem um domínio que algum dos lados marcou como concorrente. Um site cujo setor não conhecemos fica de fora; nunca adivinhamos.' },
            { icon: ArrowLeftRight, title: 'Sem trocas', body: 'Não fazemos trocas: quem recebe uma menção sua nunca menciona de volta, e um par de sites se encontra uma única vez. O círculo curto entre três sites também é bloqueado.' },
            { icon: ShieldCheck, title: 'Um, e com parcimônia', body: 'No máximo um link por artigo, e preferimos não colocar nenhum a forçar mais um. Um site que acabou de começar participa devagar.' },
            { icon: Network, title: 'Só quando ajuda quem lê', body: 'Uma menção entra apenas onde a página realmente ajuda quem lê aquele parágrafo. Se o encaixe é fraco, nada entra. Sites novos ou com pouco conteúdo não participam.' },
          ],
        },
        {
          kind: 'callout',
          icon: Info,
          title: 'O que não fazemos',
          body: (
            <>
              <p>
                A Go Top SEO não vende links, não compra links e não promete links de sites de terceiros. Não há número
                de links garantido nem promessa de posicionamento.
              </p>
              <p>
                Participar é opcional, vem desligado, você pode sair a qualquer momento e é um extra, não parte do que
                um plano compromete. Está descrito por inteiro na seção 15A dos{' '}
                <a className="underline" href="/pt-BR/terms">termos de uso</a>, que vale ler antes de ativar.
              </p>
              <p>
                Não publicamos nenhuma lista dos sites participantes. Quem recebe uma menção vê o endereço do site que
                criou o link. A responsabilidade pelo conteúdo do site e pelo cumprimento das diretrizes dos buscadores
                é do proprietário do site, e podemos pausar ou interromper o serviço.
              </p>
            </>
          ),
        },
        {
          kind: 'cards',
          columns: 2,
          eyebrow: 'Dentro do seu site também',
          title: 'Os links que sustentam um site',
          items: [
            { icon: ArrowLeftRight, title: 'Links internos na escrita', body: 'Enquanto o artigo é escrito, o sistema o conecta às páginas relevantes do seu site, só quando a expressão já aparece naturalmente no texto. Você revisa o artigo antes de publicar, como sempre.' },
            { icon: Unlink, title: 'Páginas órfãs', body: 'Páginas que nenhuma outra página do site referencia, então o Google tem dificuldade de chegar a elas e de entender que importam. Páginas ligadas no menu ou na home não contam como órfãs.' },
            { icon: ListChecks, title: 'Lugares gratuitos para aparecer', body: 'Uma lista verificada à mão de diretórios e perfis de empresa conforme o país e o idioma do projeto, marcando onde o negócio já aparece.' },
            { icon: MapPinned, title: 'O que liga a o quê', body: 'De cada artigo você vê para onde ele liga e o que liga para ele. É isso que explica por que uma página não se move no Google enquanto outras se movem.' },
          ],
        },
        {
          kind: 'cards',
          columns: 2,
          eyebrow: 'Search Console',
          title: 'Os links que o Google já encontrou',
          items: [
            { icon: FileSearch, title: 'Link direto para o relatório do Google', body: 'O Search Console não tem uma interface que devolva a lista de links, então não inventamos uma. Há um link direto para o relatório no Google.' },
            { icon: Search, title: 'Uma foto do arquivo que você exportar', body: 'Você pode enviar um CSV exportado do Search Console e vê-lo dentro do sistema. É uma foto do dia da exportação e não se atualiza sozinha.' },
          ],
        },
        {
          kind: 'faq',
          eyebrow: 'Perguntas frequentes',
          title: 'O que perguntam sobre links',
          items: [
            { q: 'Quantos links vou receber?', a: 'Não há número garantido nem cota que tentemos preencher. Uma menção entra só quando é escrito um artigo em cujo parágrafo a sua página realmente encaixa, então acontece com parcimônia.' },
            { q: 'Alguém vai ver que eu participo?', a: 'Não publicamos nenhuma lista dos sites participantes. Quem recebe uma menção vê o endereço do site que criou o link e, depois da publicação, também a página onde o link apareceu.' },
            { q: 'Preciso participar?', a: 'Não. Vem desligado, a ativação é por site e você pode sair a qualquer momento. Sair interrompe novas menções; links já publicados permanecem nos sites.' },
            { q: 'Funciona em uma loja Shopify?', a: 'Sim, com uma ativação separada e voluntária. As menções entram apenas nos artigos que escrevemos e publicamos no blog da loja. Um artigo, página, produto ou coleção que já exista não é editado.' },
            { q: 'E os links internos do meu site?', a: 'Continuam funcionando independentemente disso: todo artigo escrito recebe links para as páginas relevantes do seu site, e você aprova o artigo inteiro antes da publicação.' },
          ],
        },
      ],
      cta: { title: 'Deixe negócios complementares criarem links para você', body: pt.closeBody, primary: pt.trial, secondary: pt.check },
    },
  },
}
