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
 * Guard 4i below keeps that vocabulary off the page.
 *
 * TWO SENTENCES THE LEGAL SESSION REQUIRES HERE (9 Oct 2026), because leaving
 * the rest off the page is conditional on the page creating no opposite
 * impression: that a link type exists and is shown before joining (no SEO
 * claim about it), and that section 15A carries the risks of joining, so the
 * pointer to it reads as something to be careful about. Guards 4l and 4m.
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
const fr = FEATURE_COMMON.fr
const it = FEATURE_COMMON.it
const ja = FEATURE_COMMON.ja
const de = FEATURE_COMMON.de
const nl = FEATURE_COMMON.nl
const pl = FEATURE_COMMON.pl
const ko = FEATURE_COMMON.ko

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
    fr: {
      title: 'Liens vers votre site | Go Top SEO',
      description: 'Des entreprises complémentaires qui utilisent Go Top SEO peuvent vous mentionner dans les articles rédigés pour elles, uniquement là où cela aide le lecteur. Sans échange, jamais un concurrent, en option et désactivé par défaut. Et aussi : maillage interne, pages orphelines et annuaires gratuits.',
    },
    it: {
      title: 'Link verso il suo sito | Go Top SEO',
      description: 'Aziende complementari che usano Go Top SEO possono citare il suo sito negli articoli scritti per loro, soltanto dove questo aiuta chi legge. Senza scambi, mai un concorrente, facoltativo e disattivato per impostazione predefinita. E inoltre: link interni, pagine orfane e directory gratuite.',
    },
    ja: {
      title: 'サイトへのリンク | Go Top SEO',
      description: '補完関係にある企業のGo Top SEO利用者が、その企業向けに書かれた記事の中でお客様のサイトを言及できます。入るのは読者の役に立つ場所だけです。交換は行わず、競合には決して入らず、任意で初期設定では無効です。さらに内部リンク、孤立ページ、無料で掲載できるディレクトリも扱います。',
    },
    nl: {
      title: 'Links naar uw website | Go Top SEO',
      description: 'Bedrijven met een aanvullend aanbod die Go Top SEO gebruiken, kunnen u noemen in de artikelen die voor hen geschreven worden — alleen daar waar het de lezer helpt. Geen ruil, nooit een concurrent, vrijwillig en standaard uit. Daarnaast interne links, pagina\u2019s zonder links en gratis vermeldingen.',
    },
    de: {
      title: 'Links auf Ihre Website | Go Top SEO',
      description: 'Unternehmen mit ergänzendem Angebot, die Go Top SEO nutzen, können Sie in den für sie geschriebenen Artikeln nennen — nur dort, wo es dem Lesenden hilft. Kein Tausch, nie ein Wettbewerber, freiwillig und standardmäßig aus. Dazu interne Links, verwaiste Seiten und kostenlose Verzeichnisse.',
    },
    pl: {
      title: 'Linki do Państwa strony | Go Top SEO',
      description: 'Firmy z uzupełniającą ofertą, które korzystają z Go Top SEO, mogą wspomnieć o Państwa stronie w artykułach pisanych dla nich, ale tylko tam, gdzie to pomaga czytelnikowi. Bez wymiany, nigdy konkurent, dobrowolnie i domyślnie wyłączone. Poza tym linkowanie wewnętrzne, podstrony bez linków i bezpłatne katalogi.',
    },
    ko: {
      title: '내 사이트로 오는 링크 | Go Top SEO',
      description: 'Go Top SEO를 쓰는 보완 업종의 업체가 자신들을 위해 작성된 아티클에서 고객님의 페이지를 언급할 수 있습니다. 단, 그 문단의 독자에게 실제로 도움이 되는 자리에서만입니다. 상호 교환 없음, 경쟁사 제외, 선택 참여이며 기본값은 꺼짐입니다. 내부 링크, 링크가 없는 페이지, 무료 디렉터리도 함께 다룹니다.',
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
                ההשתתפות אופציונלית, כבויה כברירת מחדל ואפשר לצאת בכל רגע. היא אינה חלק מהתמורה שאתם משלמים
                עליה ואינה נכללת בתוכנית כהתחייבות. סוג הקישור נקבע לכל הרשת, מוצג לפניכם במסך ההצטרפות, ויכול
                להשתנות לגבי קישורים חדשים. הנוסח המלא נמצא ב
                <a className="underline" href="/terms#link-network">סעיף 15א בתנאי השימוש</a>, יחד עם הסיכונים
                שבהצטרפות, וכדאי לקרוא אותו לפני שמדליקים.
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
                Taking part is optional, off by default, and you can leave at any moment. It is not part of what you
                pay for and is not included in a plan as a commitment. The kind of link is set for the whole network,
                shown to you on the joining screen, and can change for future links. The full wording is in{' '}
                <a className="underline" href="/en/terms#link-network">section 15A of the Terms of Service</a>,
                together with the risks of joining, and it is worth reading before you switch this on.
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
                Participar es opcional, está desactivado por defecto y puedes salir en cualquier momento. No forma
                parte de lo que pagas ni se incluye en un plan como compromiso. El tipo de enlace se define para toda
                la red, se le muestra en la pantalla de incorporación y puede cambiar para los enlaces futuros. El
                texto completo está en la sección 15A de los{' '}
                <a className="underline" href="/es/terms">Términos de Servicio</a>, junto con los riesgos de la
                incorporación, y conviene leerlo antes de activarlo.
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
                Participar é opcional, vem desligado e você pode sair a qualquer momento. Não faz parte do que você
                paga nem é incluído em um plano como compromisso. O tipo de link é definido para toda a rede, é
                mostrado a você na tela de adesão e pode mudar para links futuros. O texto completo está na seção 15A
                dos <a className="underline" href="/pt-BR/terms">Termos de Serviço</a>, junto com os riscos da adesão,
                e vale a pena ler antes de ativar.
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
    fr: {
      hero: {
        eyebrow: 'Liens vers votre site',
        eyebrowIcon: Link2,
        title: 'Mentions et liens',
        accent: 'dans le contenu d’entreprises complémentaires',
        subtitle: 'Des clients Go Top SEO de secteurs complémentaires peuvent vous mentionner dans les articles rédigés pour eux, là où votre page aide vraiment le lecteur de ce paragraphe. Jamais un concurrent, jamais un échange réciproque. La participation est facultative et désactivée par défaut.',
        trust: fr.trust,
        primary: fr.trial,
        secondary: fr.check,
        visual: (
          <WorkListVisual
            heading="Mentions et liens"
            rows={[
              { title: 'Lien entrant d’une entreprise complémentaire', detail: 'Depuis un article de son blog', icon: ArrowDownToLine, done: true, status: 'Publié' },
              { title: 'Lien sortant dans votre article', detail: 'Affiché avant publication, vous pouvez le retirer', icon: ArrowUpFromLine, done: false, status: 'À valider' },
              { title: 'Même secteur d’activité', detail: 'Non placé, dans aucun des deux sens', icon: Ban, done: true, status: 'Bloqué' },
              { title: '3 liens internes ajoutés à l’article', detail: 'Guide des prix', icon: ArrowLeftRight, done: true, status: 'Ajouté' },
            ]}
          />
        ),
      },
      sections: [
        {
          kind: 'steps',
          eyebrow: 'Entreprises complémentaires',
          title: 'Comment ça marche',
          items: [
            { title: 'Vous l’activez', body: 'La participation se décide site par site, par le propriétaire du projet, après acceptation des conditions à l’écran. Désactivée par défaut, et vous pouvez partir quand vous voulez.' },
            { title: 'Uniquement de vrais sites', body: 'Un site ne participe que si son propriétaire l’a connecté dans l’application via WordPress ou Search Console. Saisir un domaine ne suffit pas : le site d’un inconnu ne peut donc pas entrer.' },
            { title: 'La mention se place dans l’article', body: 'Quand un article est rédigé pour une entreprise complémentaire, il peut mentionner une de vos pages pertinentes, sur des mots déjà présents dans la phrase. Nous ne réécrivons pas le texte et n’ajoutons aucun paragraphe.' },
            { title: 'Vous voyez tout', body: 'Chaque placement est consigné et montré aux deux parties. Un lien qui sort de votre article apparaît avant sa publication, et vous pouvez le retirer.' },
          ],
        },
        {
          kind: 'cards',
          tone: 'contrast',
          eyebrow: 'Les règles',
          title: 'Comment cela reste naturel',
          items: [
            { icon: Ban, title: 'Jamais un concurrent', body: 'Jamais le même secteur d’activité, ni un domaine que l’une des deux parties a signalé comme concurrent. Un site dont nous ne connaissons pas le secteur reste dehors ; nous ne devinons jamais.' },
            { icon: ArrowLeftRight, title: 'Aucun échange', body: 'Nous n’échangeons pas : un site qui reçoit une mention de votre part ne vous mentionne jamais en retour, et une paire ne se rencontre qu’une fois. Une boucle courte entre trois sites est bloquée aussi.' },
            { icon: ShieldCheck, title: 'Un seul, et avec parcimonie', body: 'Au plus un lien par article, et nous préférons nous abstenir plutôt que d’en glisser un de plus. Un site qui vient de démarrer participe lentement.' },
            { icon: Network, title: 'Seulement là où cela aide le lecteur', body: 'Une mention n’entre que là où la page aide vraiment le lecteur de ce paragraphe. Quand la pertinence est faible, rien n’est placé. Les sites récents ou trop légers ne participent pas.' },
          ],
        },
        {
          kind: 'callout',
          icon: Info,
          title: 'Ce que nous ne faisons pas',
          body: (
            <>
              <p>
                Go Top SEO ne vend pas de liens, n’achète pas de liens et ne promet aucun lien depuis le site d’autrui.
                Il n’y a aucun nombre de liens promis ni aucune promesse de position.
              </p>
              <p>
                La participation est facultative, désactivée par défaut, et vous pouvez partir à tout moment. Elle ne
                fait pas partie de ce que vous payez et n’est pas incluse dans une offre comme un engagement. Le type
                de lien est défini pour tout le réseau, vous est montré sur l’écran d’adhésion et peut changer pour les
                liens futurs. Le texte complet se trouve à la section 15A des{' '}
                <a className="underline" href="/fr/terms">Conditions d’utilisation</a>, avec les risques de l’adhésion,
                et il vaut la peine d’être lu avant d’activer cette option.
              </p>
              <p>
                Nous ne publions aucune liste des sites participants. La partie qui reçoit une mention voit l’adresse du
                site qui a fait le lien. La responsabilité du contenu du site et du respect des consignes des moteurs de
                recherche reste au propriétaire du site, et nous pouvons suspendre ou arrêter le service.
              </p>
            </>
          ),
        },
        {
          kind: 'cards',
          columns: 2,
          eyebrow: 'Dans votre site aussi',
          title: 'Le maillage interne qui tient un site',
          items: [
            { icon: ArrowLeftRight, title: 'Maillage interne pendant la rédaction', body: 'Au fil de la rédaction, le système relie l’article aux pages pertinentes de votre site, uniquement là où l’expression apparaît déjà naturellement dans le texte. Vous relisez l’article avant publication, comme toujours.' },
            { icon: Unlink, title: 'Pages orphelines', body: 'Les pages vers lesquelles aucune autre page du site ne pointe : Google a du mal à les atteindre et à voir qu’elles comptent. Les pages liées depuis le menu ou l’accueil ne comptent pas comme orphelines.' },
            { icon: ListChecks, title: 'Annuaires gratuits où figurer', body: 'Une liste vérifiée à la main d’annuaires et de fiches d’entreprise pour le pays et la langue du projet, en indiquant où l’entreprise apparaît déjà.' },
            { icon: MapPinned, title: 'Qui pointe vers quoi', body: 'Pour chaque article, vous voyez vers quoi il pointe et ce qui pointe vers lui. C’est ce qui explique pourquoi une page ne bouge pas dans Google alors que d’autres avancent.' },
          ],
        },
        {
          kind: 'cards',
          columns: 2,
          eyebrow: 'Search Console',
          title: 'Les liens que Google a déjà trouvés',
          items: [
            { icon: FileSearch, title: 'Un lien direct vers le rapport de Google', body: 'Search Console n’a aucune interface qui renvoie la liste des liens, donc nous n’en inventons pas une. Un lien direct mène au rapport chez Google.' },
            { icon: Search, title: 'Un instantané depuis un fichier exporté', body: 'Vous pouvez importer un CSV exporté de Search Console et le consulter dans le système. C’est un instantané du jour de l’export, qui ne se met pas à jour tout seul.' },
          ],
        },
        {
          kind: 'faq',
          eyebrow: 'Questions fréquentes',
          title: 'Ce que l’on demande sur les liens',
          items: [
            { q: 'Combien de liens vais-je recevoir ?', a: 'Il n’y a aucun nombre promis, et aucun quota que nous cherchons à remplir. Une mention n’entre que lorsqu’un article est rédigé et que votre page correspond vraiment à l’un de ses paragraphes, donc cela arrive avec parcimonie.' },
            { q: 'Quelqu’un verra-t-il que je participe ?', a: 'Nous ne publions aucune liste des sites participants. La partie qui reçoit une mention voit l’adresse du site qui a fait le lien et, après publication, aussi la page où le lien est apparu.' },
            { q: 'Suis-je obligé de participer ?', a: 'Non. C’est désactivé par défaut, l’activation se fait site par site, et vous pouvez partir à tout moment. Partir arrête les nouvelles mentions ; les liens déjà publiés restent sur les sites.' },
            { q: 'Cela fonctionne-t-il sur une boutique Shopify ?', a: 'Oui, avec une activation séparée et volontaire. Les mentions n’entrent que dans les articles que nous rédigeons et publions sur le blog de la boutique. Un article, une page, un produit ou une collection déjà présents dans la boutique ne sont pas modifiés.' },
            { q: 'Et le maillage interne de mon site ?', a: 'Il continue de fonctionner indépendamment : chaque article rédigé reçoit des liens vers les pages pertinentes de votre site, et vous validez l’article entier avant sa publication.' },
          ],
        },
      ],
      cta: { title: 'Laissez des entreprises complémentaires faire un lien vers vous', body: fr.closeBody, primary: fr.trial, secondary: fr.check },
    },
    it: {
      hero: {
        eyebrow: 'Link verso il suo sito',
        eyebrowIcon: Link2,
        title: 'Citazioni e link',
        accent: 'nei contenuti di aziende complementari',
        subtitle: 'Clienti Go Top SEO di settori complementari possono citare il suo sito negli articoli scritti per loro, là dove la sua pagina aiuta davvero chi legge quel paragrafo. Mai un concorrente, mai uno scambio reciproco. La partecipazione è facoltativa e disattivata per impostazione predefinita.',
        trust: it.trust,
        primary: it.trial,
        secondary: it.check,
        visual: (
          <WorkListVisual
            heading="Citazioni e link"
            rows={[
              { title: 'Link in entrata da un’azienda complementare', detail: 'Da un articolo del suo blog', icon: ArrowDownToLine, done: true, status: 'Pubblicato' },
              { title: 'Link in uscita nel suo articolo', detail: 'Mostrato prima della pubblicazione, si può rimuovere', icon: ArrowUpFromLine, done: false, status: 'Da approvare' },
              { title: 'Stesso settore di attività', detail: 'Non inserito, in nessuna delle due direzioni', icon: Ban, done: true, status: 'Bloccato' },
              { title: '3 link interni aggiunti all’articolo', detail: 'Guida ai prezzi', icon: ArrowLeftRight, done: true, status: 'Aggiunto' },
            ]}
          />
        ),
      },
      sections: [
        {
          kind: 'steps',
          eyebrow: 'Aziende complementari',
          title: 'Come funziona',
          items: [
            { title: 'L’attivazione', body: 'La partecipazione si decide sito per sito, da parte del proprietario del progetto, dopo l’accettazione delle condizioni mostrate a schermo. Disattivata per impostazione predefinita, e si può uscire quando si vuole.' },
            { title: 'Soltanto siti reali', body: 'Un sito partecipa solo se il suo proprietario lo ha collegato nell’applicazione tramite WordPress o Search Console. Inserire un dominio non basta: il sito di uno sconosciuto non può quindi entrare.' },
            { title: 'La citazione entra nell’articolo', body: 'Quando un articolo viene scritto per un’azienda complementare, può citare una delle sue pagine pertinenti, su parole già presenti nella frase. Non riscriviamo il testo e non aggiungiamo alcun paragrafo.' },
            { title: 'Tutto resta visibile', body: 'Ogni inserimento viene registrato e mostrato a entrambe le parti. Un link che esce dal suo articolo compare prima della pubblicazione e si può rimuovere.' },
          ],
        },
        {
          kind: 'cards',
          tone: 'contrast',
          eyebrow: 'Le regole',
          title: 'Come resta naturale',
          items: [
            { icon: Ban, title: 'Mai un concorrente', body: 'Mai lo stesso settore di attività, né un dominio che una delle due parti ha segnalato come concorrente. Un sito di cui non conosciamo il settore resta fuori; non tiriamo mai a indovinare.' },
            { icon: ArrowLeftRight, title: 'Nessuno scambio', body: 'Non scambiamo: un sito che riceve una citazione non ricambia mai, e una coppia si incontra una sola volta. Anche un giro breve fra tre siti è bloccato.' },
            { icon: ShieldCheck, title: 'Uno solo, e con parsimonia', body: 'Al massimo un link per articolo, e preferiamo astenerci piuttosto che infilarne un altro. Un sito appena avviato partecipa lentamente.' },
            { icon: Network, title: 'Solo dove aiuta chi legge', body: 'Una citazione entra solo dove la pagina aiuta davvero chi legge quel paragrafo. Quando la pertinenza è scarsa, non viene inserito nulla. I siti recenti o troppo leggeri non partecipano.' },
          ],
        },
        {
          kind: 'callout',
          icon: Info,
          title: 'Che cosa non facciamo',
          body: (
            <>
              <p>
                Go Top SEO non vende link, non compra link e non promette alcun link dal sito di altri. Non c’è alcun
                numero di link promesso né alcuna promessa di posizione.
              </p>
              <p>
                La partecipazione è facoltativa, disattivata per impostazione predefinita, e si può uscire in qualsiasi
                momento. Non fa parte di ciò che si paga e non è compresa in un piano come un impegno. Il tipo di link
                è definito per tutta la rete, viene mostrato nella schermata di adesione e può cambiare per i link
                futuri. Il testo completo si trova alla sezione 15A dei{' '}
                <a className="underline" href="/it/terms">Termini di servizio</a>, con i rischi dell’adesione, e vale la
                pena leggerlo prima di attivare questa opzione.
              </p>
              <p>
                Non pubblichiamo alcun elenco dei siti partecipanti. La parte che riceve una citazione vede l’indirizzo
                del sito che ha inserito il link. La responsabilità del contenuto del sito e del rispetto delle
                indicazioni dei motori di ricerca resta al proprietario del sito, e possiamo sospendere o interrompere
                il servizio.
              </p>
            </>
          ),
        },
        {
          kind: 'cards',
          columns: 2,
          eyebrow: 'Anche dentro il sito',
          title: 'I link interni che tengono insieme un sito',
          items: [
            { icon: ArrowLeftRight, title: 'Link interni durante la scrittura', body: 'Mentre scrive, il sistema collega l’articolo alle pagine pertinenti del sito, soltanto dove l’espressione compare già naturalmente nel testo. L’articolo si rilegge prima della pubblicazione, come sempre.' },
            { icon: Unlink, title: 'Pagine orfane', body: 'Le pagine verso cui nessun’altra pagina del sito punta: Google fa fatica a raggiungerle e a capire che contano. Le pagine collegate dal menu o dalla home non contano come orfane.' },
            { icon: ListChecks, title: 'Directory gratuite in cui comparire', body: 'Un elenco verificato a mano di directory e schede aziendali per il paese e la lingua del progetto, con l’indicazione di dove l’azienda compare già.' },
            { icon: MapPinned, title: 'Chi punta a che cosa', body: 'Per ogni articolo si vede verso che cosa punta e che cosa punta verso di lui. È ciò che spiega perché una pagina non si muove su Google mentre altre avanzano.' },
          ],
        },
        {
          kind: 'cards',
          columns: 2,
          eyebrow: 'Search Console',
          title: 'I link che Google ha già trovato',
          items: [
            { icon: FileSearch, title: 'Un collegamento diretto al report di Google', body: 'Search Console non ha alcuna interfaccia che restituisca l’elenco dei link, quindi non ne inventiamo una. Un collegamento diretto porta al report su Google.' },
            { icon: Search, title: 'Un’istantanea da un file esportato', body: 'Si può importare un CSV esportato da Search Console e consultarlo nel sistema. È un’istantanea del giorno dell’esportazione, che non si aggiorna da sé.' },
          ],
        },
        {
          kind: 'faq',
          eyebrow: 'Domande frequenti',
          title: 'Che cosa si chiede sui link',
          items: [
            { q: 'Quanti link arriveranno?', a: 'Non c’è alcun numero promesso, né alcuna quota che cerchiamo di riempire. Una citazione entra solo quando un articolo viene scritto e la sua pagina corrisponde davvero a uno dei suoi paragrafi, quindi accade con parsimonia.' },
            { q: 'Qualcuno vedrà che partecipo?', a: 'Non pubblichiamo alcun elenco dei siti partecipanti. La parte che riceve una citazione vede l’indirizzo del sito che ha inserito il link e, dopo la pubblicazione, anche la pagina in cui il link è comparso.' },
            { q: 'È obbligatorio partecipare?', a: 'No. È disattivato per impostazione predefinita, l’attivazione avviene sito per sito e si può uscire in qualsiasi momento. L’uscita ferma le nuove citazioni; i link già pubblicati restano sui siti.' },
            { q: 'Funziona su un negozio Shopify?', a: 'Sì, con un’attivazione separata e volontaria. Le citazioni entrano solo negli articoli che scriviamo e pubblichiamo sul blog del negozio. Un articolo, una pagina, un prodotto o una collezione già presenti nel negozio non vengono modificati.' },
            { q: 'E i link interni del mio sito?', a: 'Continuano a funzionare in modo indipendente: ogni articolo scritto riceve link verso le pagine pertinenti del sito, e l’articolo intero si approva prima della pubblicazione.' },
          ],
        },
      ],
      cta: { title: 'Lasci che aziende complementari rimandino al suo sito', body: it.closeBody, primary: it.trial, secondary: it.check },
    },
    // JAPANESE. The link to the terms points at /ja/terms, and clause 15A is
    // the same clause in every language. Nothing here promises a number of
    // links or a ranking, in Japanese either: 景品表示法 treats an unprovable
    // performance claim as a misrepresentation, and the claim would be false
    // anyway.
    nl: {
      hero: {
        eyebrow: 'Links naar uw website',
        eyebrowIcon: Link2,
        title: 'Vermeldingen en links',
        accent: 'in content van bedrijven met een aanvullend aanbod',
        subtitle: 'Klanten van Go Top SEO uit aanvullende branches kunnen u noemen in de artikelen die voor hen geschreven worden, daar waar uw pagina de lezer van die alinea werkelijk helpt. Nooit een concurrent, nooit een ruil op wederzijdse basis. Deelname is vrijwillig en staat standaard uit.',
        trust: nl.trust,
        primary: nl.trial,
        secondary: nl.check,
        visual: (
          <WorkListVisual
            heading="Vermeldingen en links"
            rows={[
              { title: 'Inkomende link van een aanvullend bedrijf', detail: 'Uit een artikel op zijn blog', icon: ArrowDownToLine, done: true, status: 'Gepubliceerd' },
              { title: 'Uitgaande link in uw artikel', detail: 'Voor de publicatie getoond, u kunt hem verwijderen', icon: ArrowUpFromLine, done: false, status: 'Te beoordelen' },
              { title: 'Zelfde branche', detail: 'Wordt in geen enkele richting geplaatst', icon: Ban, done: true, status: 'Geblokkeerd' },
              { title: '3 interne links in het artikel toegevoegd', detail: 'Prijzengids', icon: ArrowLeftRight, done: true, status: 'Toegevoegd' },
            ]}
          />
        ),
      },
      sections: [
        {
          kind: 'steps',
          eyebrow: 'Bedrijven met een aanvullend aanbod',
          title: 'Zo gaat het',
          items: [
            { title: 'U zet het aan', body: 'Deelname geldt per website en wordt door de eigenaar van het project aangezet na het aanvaarden van de voorwaarden op het scherm. Standaard uit, en u kunt wanneer u wilt stoppen.' },
            { title: 'Alleen echte websites', body: 'Een website doet alleen mee als haar eigenaar haar in de app verbonden heeft via WordPress of Search Console. Een domein intypen is niet genoeg, dus de website van een onbekende komt er niet in.' },
            { title: 'De vermelding staat in het artikel', body: 'Wordt een artikel voor een aanvullend bedrijf geschreven, dan kan het een passende pagina van u noemen, op woorden die al in de zin staan. Wij herschrijven de tekst niet en voegen geen alinea\u2019s toe.' },
            { title: 'U ziet alles', body: 'Elke plaatsing wordt vastgelegd en aan beide partijen getoond. Een link die uit uw artikel naar buiten leidt, verschijnt voor de publicatie, en u kunt hem verwijderen.' },
          ],
        },
        {
          kind: 'cards',
          tone: 'contrast',
          eyebrow: 'De regels',
          title: 'Hoe het natuurlijk blijft',
          items: [
            { icon: Ban, title: 'Nooit een concurrent', body: 'Niet dezelfde branche, en geen domein dat een van beide partijen als concurrent heeft gemarkeerd. Een website waarvan wij de branche niet kennen, blijft erbuiten; wij gokken nooit.' },
            { icon: ArrowLeftRight, title: 'Geen ruil', body: 'Wij ruilen niet: een website die een vermelding van u krijgt, noemt u nooit terug, en een paar komt elkaar maar één keer tegen. Ook een korte lus over drie websites wordt geblokkeerd.' },
            { icon: ShieldCheck, title: 'Eén, en spaarzaam', body: 'Hoogstens één link per artikel, en wij laten het liever weg dan er nog een in te duwen. Een website die net begonnen is, doet langzaam mee.' },
            { icon: Network, title: 'Alleen waar het de lezer helpt', body: 'Een vermelding komt alleen daar waar de pagina de lezer van die alinea werkelijk helpt. Past het maar zwak, dan komt er niets in. Nieuwe of dunne websites doen niet mee.' },
          ],
        },
        {
          kind: 'callout',
          icon: Info,
          title: 'Wat wij niet doen',
          body: (
            <>
              <p>
                Wij verkopen geen links, kopen geen links en beloven geen links van de websites van anderen. Er is
                geen beloofd aantal links en geen belofte over posities.
              </p>
              <p>
                Deelname is vrijwillig, staat standaard uit, en u kunt wanneer u wilt stoppen. Zij is geen onderdeel
                van wat u betaalt en in geen enkel pakket als toezegging opgenomen. Het soort link geldt voor het hele
                netwerk, wordt u op het aanmeldscherm getoond en kan voor toekomstige links wijzigen. De volledige
                tekst staat in{' '}
                <a className="underline" href="/nl/terms#link-network">artikel 15A van de algemene voorwaarden</a>,
                samen met de risico\u2019s van deelname, en die is het lezen waard voordat u dit aanzet.
              </p>
              <p>
                Wij publiceren geen lijst van deelnemende websites. De ontvangende partij ziet het adres van de
                website die naar haar gelinkt heeft. De verantwoordelijkheid voor de inhoud van de website en voor het
                naleven van de richtlijnen van de zoekmachines blijft bij de websitebeheerder, en wij kunnen de dienst
                opschorten of beëindigen.
              </p>
            </>
          ),
        },
        {
          kind: 'cards',
          columns: 2,
          eyebrow: 'Ook binnen uw website',
          title: 'De links die een website samenhouden',
          items: [
            { icon: ArrowLeftRight, title: 'Interne links tijdens het schrijven', body: 'Terwijl het artikel ontstaat, verbindt het systeem het met de passende pagina\u2019s van uw website, alleen daar waar de formulering al natuurlijk in de tekst voorkomt. U leest het artikel voor de publicatie, zoals altijd.' },
            { icon: Unlink, title: 'Pagina\u2019s zonder links', body: 'Pagina\u2019s waarnaar geen andere pagina van de website linkt, zodat Google ze moeilijk bereikt en hun belang niet ziet. Pagina\u2019s waarnaar het menu of de startpagina linkt, gelden niet als zodanig.' },
            { icon: ListChecks, title: 'Gratis vermeldingen', body: 'Een met de hand gecontroleerde lijst van gidsen en bedrijfsprofielen voor het land en de taal van het project, met de melding waar het bedrijf al verschijnt.' },
            { icon: MapPinned, title: 'Wat naar wat linkt', body: 'Voor elk artikel ziet u waarnaar het linkt en wat naar het artikel linkt. Dat verklaart waarom een pagina in Google niet beweegt terwijl andere dat wel doen.' },
          ],
        },
        {
          kind: 'cards',
          columns: 2,
          eyebrow: 'Search Console',
          title: 'De links die Google al gevonden heeft',
          items: [
            { icon: FileSearch, title: 'Een directe link naar het rapport van Google', body: 'Search Console heeft geen interface die de lijst met links teruggeeft, dus wij verzinnen er geen. Er is een directe link naar het rapport bij Google.' },
            { icon: Search, title: 'Een momentopname uit een exportbestand', body: 'U kunt een CSV-bestand uploaden dat u uit Search Console geëxporteerd hebt, en het in het systeem bekijken. Het is de momentopname van de exportdag en werkt zich niet van zelf bij.' },
          ],
        },
        {
          kind: 'faq',
          eyebrow: 'Veelgestelde vragen',
          title: 'Wat er over links gevraagd wordt',
          items: [
            { q: 'Hoeveel links krijg ik?', a: 'Er is geen beloofd aantal en geen quotum dat wij proberen te vullen. Een vermelding komt er alleen in wanneer een artikel geschreven wordt waarvan de alinea werkelijk bij uw pagina past — dat gebeurt dus spaarzaam.' },
            { q: 'Ziet iemand dat ik meedoe?', a: 'Wij publiceren geen lijst van deelnemende websites. De partij die een vermelding krijgt, ziet het adres van de website die naar haar gelinkt heeft, en na de publicatie ook de pagina waarop de link verschenen is.' },
            { q: 'Moet ik meedoen?', a: 'Nee. Het staat standaard uit, het aanzetten geldt per website, en u kunt wanneer u wilt stoppen. Stoppen beëindigt nieuwe vermeldingen; al gepubliceerde links blijven op de websites staan.' },
            { q: 'Werkt dit in een Shopify-webshop?', a: 'Ja, door het afzonderlijk en vrijwillig aan te zetten. Vermeldingen komen alleen in artikelen die wij schrijven en op de blog van de webshop publiceren. Een artikel, pagina, product of categorie die al in de webshop bestaat, wordt niet bewerkt.' },
            { q: 'Hoe zit het met de interne links op mijn website?', a: 'Die werken daar onafhankelijk van verder: elk geschreven artikel krijgt links naar de passende pagina\u2019s van uw website, en u keurt het hele artikel voor de publicatie goed.' },
          ],
        },
      ],
      cta: { title: 'Laat bedrijven met een aanvullend aanbod naar u linken', body: nl.closeBody, primary: nl.trial, secondary: nl.check },
    },
    de: {
      hero: {
        eyebrow: 'Links auf Ihre Website',
        eyebrowIcon: Link2,
        title: 'Nennungen und Links',
        accent: 'in Inhalten von Unternehmen mit ergänzendem Angebot',
        subtitle: 'Kunden von Go Top SEO aus ergänzenden Branchen können Sie in den für sie geschriebenen Artikeln nennen, wo Ihre Seite dem Lesenden dieses Absatzes wirklich hilft. Nie ein Wettbewerber, nie ein Tausch auf Gegenseitigkeit. Die Teilnahme ist freiwillig und standardmäßig aus.',
        trust: de.trust,
        primary: de.trial,
        secondary: de.check,
        visual: (
          <WorkListVisual
            heading="Nennungen und Links"
            rows={[
              { title: 'Eingehender Link von einem ergänzenden Unternehmen', detail: 'Aus einem Artikel in seinem Blog', icon: ArrowDownToLine, done: true, status: 'Veröffentlicht' },
              { title: 'Ausgehender Link in Ihrem Artikel', detail: 'Vor der Veröffentlichung gezeigt, Sie können ihn entfernen', icon: ArrowUpFromLine, done: false, status: 'Zu prüfen' },
              { title: 'Gleiche Branche', detail: 'Wird in keiner Richtung gesetzt', icon: Ban, done: true, status: 'Blockiert' },
              { title: '3 interne Links im Artikel ergänzt', detail: 'Preisratgeber', icon: ArrowLeftRight, done: true, status: 'Ergänzt' },
            ]}
          />
        ),
      },
      sections: [
        {
          kind: 'steps',
          eyebrow: 'Unternehmen mit ergänzendem Angebot',
          title: 'So läuft es',
          items: [
            { title: 'Sie schalten es ein', body: 'Die Teilnahme gilt je Website und wird von der Projektinhaberin bzw. dem Projektinhaber nach Annahme der Bedingungen auf dem Bildschirm aktiviert. Standardmäßig aus, und Sie können jederzeit aussteigen.' },
            { title: 'Nur echte Websites', body: 'Eine Website nimmt nur teil, wenn ihr Inhaber sie in der App über WordPress oder die Search Console verbunden hat. Eine Domain einzutippen reicht nicht, daher kommt die Website einer fremden Person nicht hinein.' },
            { title: 'Die Nennung steht im Artikel', body: 'Wird ein Artikel für ein ergänzendes Unternehmen geschrieben, kann er eine passende Seite von Ihnen nennen, auf Wörtern, die im Satz schon stehen. Wir schreiben den Text nicht um und ergänzen keine Absätze.' },
            { title: 'Sie sehen alles', body: 'Jede Platzierung wird protokolliert und beiden Seiten gezeigt. Ein Link, der aus Ihrem Artikel hinausführt, erscheint vor der Veröffentlichung, und Sie können ihn entfernen.' },
          ],
        },
        {
          kind: 'cards',
          tone: 'contrast',
          eyebrow: 'Die Regeln',
          title: 'Wie es natürlich bleibt',
          items: [
            { icon: Ban, title: 'Nie ein Wettbewerber', body: 'Nicht dieselbe Branche, und keine Domain, die eine der beiden Seiten als Wettbewerber markiert hat. Eine Website, deren Branche wir nicht kennen, bleibt außen vor; wir raten nie.' },
            { icon: ArrowLeftRight, title: 'Kein Tausch', body: 'Wir tauschen nicht: eine Website, die eine Nennung von Ihnen erhält, nennt Sie nie zurück, und ein Paar begegnet sich nur einmal. Auch eine kurze Schleife über drei Websites wird blockiert.' },
            { icon: ShieldCheck, title: 'Einer, und sparsam', body: 'Höchstens ein Link je Artikel, und wir lassen es lieber aus, als einen weiteren hineinzudrücken. Eine Website, die gerade angefangen hat, nimmt langsam teil.' },
            { icon: Network, title: 'Nur wo es dem Lesenden hilft', body: 'Eine Nennung kommt nur dorthin, wo die Seite dem Lesenden dieses Absatzes wirklich hilft. Passt es nur schwach, kommt nichts hinein. Neue oder dünne Websites nehmen nicht teil.' },
          ],
        },
        {
          kind: 'callout',
          icon: Info,
          title: 'Was wir nicht tun',
          body: (
            <>
              <p>
                Wir verkaufen keine Links, kaufen keine Links und versprechen keine Links von den Websites anderer
                Leute. Es gibt keine versprochene Anzahl von Links und kein Ranking-Versprechen.
              </p>
              <p>
                Die Teilnahme ist freiwillig, standardmäßig aus, und Sie können jederzeit aussteigen. Sie ist nicht
                Teil dessen, was Sie bezahlen, und als Zusage in keinem Tarif enthalten. Die Art des Links gilt für
                das gesamte Netzwerk, wird Ihnen auf dem Beitrittsbildschirm gezeigt und kann sich für künftige Links
                ändern. Der vollständige Wortlaut steht in{' '}
                <a className="underline" href="/de/terms#link-network">Abschnitt 15A der Nutzungsbedingungen</a>,
                zusammen mit den Risiken eines Beitritts, und er lohnt sich zu lesen, bevor Sie dies einschalten.
              </p>
              <p>
                Wir veröffentlichen keine Liste teilnehmender Websites. Die empfangende Seite sieht die Adresse der
                Website, die auf sie verlinkt hat. Die Verantwortung für die Inhalte der Website und für die Einhaltung
                der Richtlinien der Suchmaschinen bleibt beim Websitebetreiber, und wir können den Dienst aussetzen
                oder einstellen.
              </p>
            </>
          ),
        },
        {
          kind: 'cards',
          columns: 2,
          eyebrow: 'Auch innerhalb Ihrer Website',
          title: 'Die Links, die eine Website zusammenhalten',
          items: [
            { icon: ArrowLeftRight, title: 'Interne Links beim Schreiben', body: 'Während der Artikel entsteht, verbindet das System ihn mit den passenden Seiten Ihrer Website, nur dort, wo die Formulierung im Text schon natürlich vorkommt. Sie lesen den Artikel vor der Veröffentlichung, wie immer.' },
            { icon: Unlink, title: 'Verwaiste Seiten', body: 'Seiten, auf die keine andere Seite der Website verlinkt, sodass Google sie schwer erreicht und ihre Bedeutung nicht erkennt. Seiten, die aus dem Menü oder von der Startseite verlinkt sind, gelten nicht als verwaist.' },
            { icon: ListChecks, title: 'Kostenlose Verzeichnisse', body: 'Eine von Hand geprüfte Liste von Verzeichnissen und Unternehmensprofilen für Land und Sprache des Projekts, mit dem Hinweis, wo das Unternehmen schon erscheint.' },
            { icon: MapPinned, title: 'Was auf was verlinkt', body: 'Für jeden Artikel sehen Sie, worauf er verlinkt und was auf ihn verlinkt. Das erklärt, warum sich eine Seite in Google nicht bewegt, während andere es tun.' },
          ],
        },
        {
          kind: 'cards',
          columns: 2,
          eyebrow: 'Search Console',
          title: 'Die Links, die Google schon gefunden hat',
          items: [
            { icon: FileSearch, title: 'Ein direkter Link zu Googles Bericht', body: 'Die Search Console hat keine Schnittstelle, die die Liste der Links zurückgibt, daher erfinden wir keine. Es gibt einen direkten Link zum Bericht bei Google.' },
            { icon: Search, title: 'Eine Momentaufnahme aus einer Exportdatei', body: 'Sie können eine CSV-Datei hochladen, die Sie aus der Search Console exportiert haben, und sie im System ansehen. Es ist die Momentaufnahme des Exporttags und aktualisiert sich nicht von selbst.' },
          ],
        },
        {
          kind: 'faq',
          eyebrow: 'Häufige Fragen',
          title: 'Was zu Links gefragt wird',
          items: [
            { q: 'Wie viele Links bekomme ich?', a: 'Es gibt keine versprochene Anzahl und kein Soll, das wir zu füllen versuchen. Eine Nennung kommt nur dann hinein, wenn ein Artikel geschrieben wird, zu dessen Absatz Ihre Seite wirklich passt — das geschieht also sparsam.' },
            { q: 'Sieht jemand, dass ich teilnehme?', a: 'Wir veröffentlichen keine Liste teilnehmender Websites. Die Seite, die eine Nennung erhält, sieht die Adresse der Website, die auf sie verlinkt hat, und nach der Veröffentlichung auch die Seite, auf der der Link erschienen ist.' },
            { q: 'Muss ich teilnehmen?', a: 'Nein. Es ist standardmäßig aus, das Einschalten gilt je Website, und Sie können jederzeit aussteigen. Ein Ausstieg beendet neue Nennungen; bereits veröffentlichte Links bleiben auf den Websites.' },
            { q: 'Funktioniert das in einem Shopify-Shop?', a: 'Ja, durch separates, freiwilliges Einschalten. Nennungen kommen nur in Artikel, die wir schreiben und im Blog des Shops veröffentlichen. Ein Artikel, eine Seite, ein Produkt oder eine Kategorie, die im Shop bereits bestehen, werden nicht bearbeitet.' },
            { q: 'Was ist mit den internen Links auf meiner Website?', a: 'Die funktionieren davon unabhängig weiter: jeder geschriebene Artikel erhält Links auf die passenden Seiten Ihrer Website, und Sie geben den ganzen Artikel vor der Veröffentlichung frei.' },
          ],
        },
      ],
      cta: { title: 'Lassen Sie Unternehmen mit ergänzendem Angebot auf Sie verlinken', body: de.closeBody, primary: de.trial, secondary: de.check },
    },
    ja: {
      hero: {
        eyebrow: 'サイトへのリンク',
        eyebrowIcon: Link2,
        title: '補完関係にある企業の',
        accent: 'コンテンツからの言及とリンク',
        subtitle: '補完関係にある業種のGo Top SEOの利用者が、その企業向けに書かれた記事の中で、お客様のサイトを言及できます。入るのは、その段落の読者にとってお客様のページが実際に役立つ場合だけです。競合には決して入らず、相互リンクも行いません。参加は任意で、初期設定では無効です。',
        trust: ja.trust,
        primary: ja.trial,
        secondary: ja.check,
        visual: (
          <WorkListVisual
            heading="言及とリンク"
            rows={[
              { title: '補完関係にある企業からの被リンク', detail: '同社のブログ記事から', icon: ArrowDownToLine, done: true, status: '公開済み' },
              { title: 'お客様の記事からの発リンク', detail: '公開前に表示され、削除できます', icon: ArrowUpFromLine, done: false, status: '承認待ち' },
              { title: '同じ業種', detail: 'どちらの方向にも挿入しません', icon: Ban, done: true, status: '除外' },
              { title: '記事に内部リンクを3件追加', detail: '料金ガイド', icon: ArrowLeftRight, done: true, status: '追加済み' },
            ]}
          />
        ),
      },
      sections: [
        {
          kind: 'steps',
          eyebrow: '補完関係にある企業',
          title: '仕組み',
          items: [
            { title: '有効にする', body: '参加はサイトごとに、プロジェクトの所有者が、画面に表示される条件に同意したうえで決めます。初期設定では無効で、いつでも離脱できます。' },
            { title: '実在するサイトのみ', body: 'サイトが参加できるのは、所有者がWordPressまたはSearch Consoleを通じてアプリに連携した場合だけです。ドメインを入力するだけでは足りないため、第三者のサイトが入ることはできません。' },
            { title: '言及が記事に入ります', body: '補完関係にある企業向けに記事が書かれるとき、その文にすでに含まれている語の上に、お客様の関連ページへの言及が入ることがあります。本文を書き換えることはなく、段落を追加することもありません。' },
            { title: 'すべて見える状態に保たれます', body: 'どの挿入も記録され、双方に表示されます。お客様の記事から出ていくリンクは公開前に表示され、削除できます。' },
          ],
        },
        {
          kind: 'cards',
          tone: 'contrast',
          eyebrow: 'ルール',
          title: '自然さを保つための決まり',
          items: [
            { icon: Ban, title: '競合には入りません', body: '同じ業種、およびどちらかが競合として申告したドメインには入りません。業種が判明していないサイトは対象外で、推測は一切しません。' },
            { icon: ArrowLeftRight, title: '相互リンクはしません', body: '交換は行いません。言及を受けたサイトが返礼することはなく、同じ組み合わせは一度だけです。3サイトの短い循環も遮断します。' },
            { icon: ShieldCheck, title: '1本だけ、控えめに', body: '1記事につき最大1本で、もう1本入れるよりは入れないほうを選びます。公開して間もないサイトはゆっくり参加します。' },
            { icon: Network, title: '読者の役に立つ場所だけ', body: '言及が入るのは、その段落の読者にとってページが実際に役立つ場合だけです。関連性が弱いときは何も挿入しません。公開して間もないサイトや内容の薄いサイトは参加しません。' },
          ],
        },
        {
          kind: 'callout',
          icon: Info,
          title: '当社が行わないこと',
          body: (
            <>
              <p>
                Go Top SEOはリンクを販売せず、購入せず、他社のサイトからのリンクを約束することもありません。
                リンクの本数の約束も、検索順位の約束もありません。
              </p>
              <p>
                参加は任意で、初期設定では無効であり、いつでも離脱できます。ご利用料金に含まれるものではなく、
                プランの確約事項として含まれるものでもありません。リンクの種類はネットワーク全体で定められており、
                参加の画面に表示され、今後のリンクについて変更されることがあります。全文は
                <a className="underline" href="/ja/terms">利用規約</a>の第15A条にあり、参加に伴うリスクも記載しています。
                この機能を有効にする前にお読みになることをおすすめします。
              </p>
              <p>
                参加サイトの一覧は公開しません。言及を受けた側は、リンクを挿入したサイトのアドレスを確認できます。
                サイトの内容、および検索エンジンのガイドラインの遵守についての責任はサイトの所有者にあり、
                当社はこの機能を停止または終了することがあります。
              </p>
            </>
          ),
        },
        {
          kind: 'cards',
          columns: 2,
          eyebrow: 'サイトの内側でも',
          title: 'サイトをまとめる内部リンク',
          items: [
            { icon: ArrowLeftRight, title: '執筆中の内部リンク', body: '執筆しながら、システムが記事をサイト内の関連ページへつなぎます。入るのは、その語句が本文にすでに自然な形で現れている場所だけです。記事は、いつもどおり公開前にお読みいただけます。' },
            { icon: Unlink, title: '孤立ページ', body: 'サイト内のどのページからもリンクされていないページです。Googleはそこに到達しにくく、重要なページだと判断しにくくなります。メニューやトップページからリンクされているページは孤立とは数えません。' },
            { icon: ListChecks, title: '無料で掲載できるディレクトリ', body: 'プロジェクトの国と言語に合わせて人の手で確認したディレクトリと事業者掲載先の一覧で、すでに掲載されている箇所も示します。' },
            { icon: MapPinned, title: 'どこがどこを指しているか', body: '記事ごとに、どこを指していてどこから指されているかがわかります。あるページがGoogleで動かない一方でほかのページが伸びる理由は、ここで説明がつきます。' },
          ],
        },
        {
          kind: 'cards',
          columns: 2,
          eyebrow: 'Search Console',
          title: 'Googleがすでに見つけているリンク',
          items: [
            { icon: FileSearch, title: 'Googleのレポートへの直接リンク', body: 'Search Consoleにはリンクの一覧を返すインターフェースがないため、当社が代わりのものを作ることはしません。直接リンクでGoogleのレポートに移動します。' },
            { icon: Search, title: '書き出したファイルからの記録', body: 'Search Consoleから書き出したCSVを取り込み、システム内でご確認いただけます。書き出した日の記録であり、自動では更新されません。' },
          ],
        },
        {
          kind: 'faq',
          eyebrow: 'よくある質問',
          title: 'リンクについて聞かれること',
          items: [
            { q: 'リンクは何本くらい来ますか', a: '約束している本数はなく、埋めようとしている枠もありません。言及が入るのは、記事が書かれ、お客様のページがその段落に実際に合致したときだけですので、発生は控えめです。' },
            { q: '参加していることは誰かに見えますか', a: '参加サイトの一覧は公開しません。言及を受けた側は、リンクを挿入したサイトのアドレスを確認でき、公開後はリンクが掲載されたページも確認できます。' },
            { q: '参加は必須ですか', a: 'いいえ。初期設定では無効で、有効化はサイトごとに行い、いつでも離脱できます。離脱すると新しい言及は止まりますが、すでに公開されたリンクは各サイトに残ります。' },
            { q: 'Shopifyの店舗でも動きますか', a: 'はい。別途、任意で有効にしていただきます。言及が入るのは、当社が書いて店舗のブログに公開する記事の中だけです。店舗にすでにある記事、ページ、商品、コレクションは変更しません。' },
            { q: '自分のサイトの内部リンクはどうなりますか', a: 'それとは独立して動き続けます。作成する記事には、サイト内の関連ページへのリンクが入り、記事全体を公開前にご承認いただきます。' },
          ],
        },
      ],
      cta: { title: '補完関係にある企業からサイトへリンクしてもらう', body: ja.closeBody, primary: ja.trial, secondary: ja.check },
    },
    pl: {
      hero: {
        eyebrow: 'Linki do Państwa strony',
        eyebrowIcon: Link2,
        title: 'Wzmianki i linki',
        accent: 'w treściach firm z uzupełniającą ofertą',
        subtitle: 'Klienci Go Top SEO z uzupełniających branż mogą wspomnieć o Państwa stronie w artykułach pisanych dla nich, tam gdzie Państwa podstrona naprawdę pomaga czytelnikowi tego akapitu. Nigdy konkurent, nigdy wymiana na zasadzie wzajemności. Udział jest dobrowolny i domyślnie wyłączony.',
        trust: pl.trust,
        primary: pl.trial,
        secondary: pl.check,
        visual: (
          <WorkListVisual
            heading="Wzmianki i linki"
            rows={[
              { title: 'Link przychodzący od firmy uzupełniającej', detail: 'Z artykułu na jej blogu', icon: ArrowDownToLine, done: true, status: 'Opublikowany' },
              { title: 'Link wychodzący w Państwa artykule', detail: 'Pokazany przed publikacją, można go usunąć', icon: ArrowUpFromLine, done: false, status: 'Do przejrzenia' },
              { title: 'Ta sama branża', detail: 'Nie jest umieszczany w żadnym kierunku', icon: Ban, done: true, status: 'Zablokowane' },
              { title: 'Dodane 3 linki wewnętrzne w artykule', detail: 'Poradnik cenowy', icon: ArrowLeftRight, done: true, status: 'Dodane' },
            ]}
          />
        ),
      },
      sections: [
        {
          kind: 'steps',
          eyebrow: 'Firmy z uzupełniającą ofertą',
          title: 'Jak to przebiega',
          items: [
            { title: 'Państwo to włączają', body: 'Udział dotyczy pojedynczej strony i włącza go właściciel projektu po zaakceptowaniu warunków na ekranie. Domyślnie wyłączone, a zrezygnować można w każdej chwili.' },
            { title: 'Tylko prawdziwe strony', body: 'Strona bierze udział tylko wtedy, gdy jej właściciel podłączył ją w aplikacji przez WordPress albo Search Console. Wpisanie domeny nie wystarcza, więc strona obcej osoby tu nie wejdzie.' },
            { title: 'Wzmianka stoi w artykule', body: 'Gdy powstaje artykuł dla firmy uzupełniającej, może on wspomnieć pasującą Państwa podstronę, na słowach, które już są w zdaniu. Nie przepisujemy tekstu i nie dodajemy akapitów.' },
            { title: 'Państwo widzą wszystko', body: 'Każde umieszczenie jest zapisywane i pokazywane obu stronom. Link wychodzący z Państwa artykułu pojawia się przed publikacją i można go usunąć.' },
          ],
        },
        {
          kind: 'cards',
          tone: 'contrast',
          eyebrow: 'Zasady',
          title: 'Co sprawia, że to zostaje naturalne',
          items: [
            { icon: Ban, title: 'Nigdy konkurent', body: 'Nie ta sama branża i żadna domena, którą jedna ze stron oznaczyła jako konkurenta. Strona, której branży nie znamy, zostaje poza tym; nigdy nie zgadujemy.' },
            { icon: ArrowLeftRight, title: 'Bez wymiany', body: 'Nie wymieniamy się: strona, która dostaje wzmiankę, nigdy nie odwzajemnia jej z powrotem, a dana para spotyka się tylko raz. Blokowana jest też krótka pętla przez trzy strony.' },
            { icon: ShieldCheck, title: 'Jeden, i oszczędnie', body: 'Najwyżej jeden link na artykuł, a wolimy go pominąć, niż wepchnąć kolejny. Strona, która właśnie zaczęła, uczestniczy wolniej.' },
            { icon: Network, title: 'Tylko tam, gdzie pomaga czytelnikowi', body: 'Wzmianka pojawia się wyłącznie tam, gdzie podstrona naprawdę pomaga czytelnikowi tego akapitu. Jeśli pasuje słabo, nie pojawia się nic. Nowe albo ubogie strony nie uczestniczą.' },
          ],
        },
        {
          kind: 'callout',
          icon: Info,
          title: 'Czego nie robimy',
          body: (
            <>
              <p>
                Nie sprzedajemy linków, nie kupujemy linków i nie obiecujemy linków z cudzych stron. Nie ma
                obiecanej liczby linków ani obietnicy pozycji.
              </p>
              <p>
                Udział jest dobrowolny, domyślnie wyłączony i można z niego zrezygnować w każdej chwili. Nie jest
                częścią tego, za co Państwo płacą, i nie jest zobowiązaniem w żadnym pakiecie. Rodzaj linku dotyczy
                całej sieci, jest pokazywany na ekranie zgody i może się zmienić dla przyszłych linków. Pełny tekst
                znajduje się w{' '}
                <a className="underline" href="/pl/terms#link-network">artykule 15A regulaminu</a>, razem z ryzykami
                udziału, i warto go przeczytać przed włączeniem.
              </p>
              <p>
                Nie publikujemy listy uczestniczących stron. Strona otrzymująca widzi adres strony, która do niej
                zalinkowała. Odpowiedzialność za treść strony i za przestrzeganie wytycznych wyszukiwarek zostaje
                przy osobie zarządzającej witryną, a my możemy zawiesić albo zakończyć usługę.
              </p>
            </>
          ),
        },
        {
          kind: 'cards',
          columns: 2,
          eyebrow: 'Również wewnątrz Państwa strony',
          title: 'Linki, które trzymają stronę razem',
          items: [
            { icon: ArrowLeftRight, title: 'Linkowanie wewnętrzne podczas pisania', body: 'W trakcie powstawania artykułu system łączy go z pasującymi podstronami Państwa witryny, tylko tam, gdzie sformułowanie już naturalnie występuje w tekście. Artykuł czytają Państwo przed publikacją, jak zawsze.' },
            { icon: Unlink, title: 'Podstrony bez linków', body: 'Podstrony, do których nie linkuje żadna inna podstrona witryny, więc Google trudno do nich dociera i nie widzi ich wagi. Podstrony, do których linkuje menu albo strona główna, nie są tak liczone.' },
            { icon: ListChecks, title: 'Bezpłatne katalogi', body: 'Sprawdzona ręcznie lista katalogów i profili firmowych dla kraju i języka projektu, z informacją, gdzie firma już się pojawia.' },
            { icon: MapPinned, title: 'Co linkuje do czego', body: 'Dla każdego artykułu widzą Państwo, do czego on linkuje i co linkuje do niego. To wyjaśnia, dlaczego jedna podstrona nie rusza się w Google, a inne tak.' },
          ],
        },
        {
          kind: 'cards',
          columns: 2,
          eyebrow: 'Search Console',
          title: 'Linki, które Google już znalazł',
          items: [
            { icon: FileSearch, title: 'Bezpośredni link do raportu Google', body: 'Search Console nie ma interfejsu, który zwracałby listę linków, więc nie wymyślamy go. Jest bezpośredni link do raportu w Google.' },
            { icon: Search, title: 'Zdjęcie stanu z pliku eksportu', body: 'Można wgrać plik CSV wyeksportowany z Search Console i przejrzeć go w systemie. To stan z dnia eksportu i nie aktualizuje się sam.' },
          ],
        },
        {
          kind: 'faq',
          eyebrow: 'Często zadawane pytania',
          title: 'O co pytają w sprawie linków',
          items: [
            { q: 'Ile linków dostanę?', a: 'Nie ma obiecanej liczby ani limitu, który próbowalibyśmy wypełnić. Wzmianka pojawia się tylko wtedy, gdy powstaje artykuł, którego akapit naprawdę pasuje do Państwa podstrony, a to zdarza się oszczędnie.' },
            { q: 'Czy ktoś zobaczy, że biorę udział?', a: 'Nie publikujemy listy uczestniczących stron. Strona, która dostaje wzmiankę, widzi adres strony, która do niej zalinkowała, a po publikacji także podstronę, na której link się pojawił.' },
            { q: 'Czy muszę brać udział?', a: 'Nie. Domyślnie jest wyłączone, włącza się osobno dla każdej strony, a zrezygnować można w każdej chwili. Rezygnacja kończy nowe wzmianki; już opublikowane linki zostają na stronach.' },
            { q: 'Czy to działa w sklepie Shopify?', a: 'Tak, po osobnym i dobrowolnym włączeniu. Wzmianki trafiają tylko do artykułów, które piszemy i publikujemy na blogu sklepu. Artykuł, strona, produkt ani kategoria, które już istnieją w sklepie, nie są zmieniane.' },
            { q: 'A co z linkowaniem wewnętrznym na mojej stronie?', a: 'Działa niezależnie od tego: każdy napisany artykuł dostaje linki do pasujących podstron Państwa witryny, a cały artykuł zatwierdzają Państwo przed publikacją.' },
          ],
        },
      ],
      cta: { title: 'Proszę pozwolić firmom z uzupełniającą ofertą linkować do Państwa', body: pl.closeBody, primary: pl.trial, secondary: pl.check },
    },
    ko: {
      hero: {
        eyebrow: '내 사이트로 오는 링크',
        eyebrowIcon: Link2,
        title: '보완 업종 업체의 콘텐츠에',
        accent: '실리는 언급과 링크',
        subtitle: '보완 업종의 Go Top SEO 고객이 자신들을 위해 작성된 아티클에서 고객님의 페이지를 언급할 수 있습니다. 그 문단을 읽는 사람에게 고객님의 페이지가 실제로 도움이 되는 자리에서만입니다. 경쟁사는 절대 아니며, 품앗이식 상호 링크도 하지 않습니다. 참여는 선택이고 기본값은 꺼짐입니다.',
        trust: ko.trust,
        primary: ko.trial,
        secondary: ko.check,
        visual: (
          <WorkListVisual
            heading="언급과 링크"
            rows={[
              { title: '보완 업종 업체에서 온 링크', detail: '그 업체 블로그의 아티클에서', icon: ArrowDownToLine, done: true, status: '게시됨' },
              { title: '고객님 아티클의 외부 링크', detail: '게시 전에 보여 드리며 삭제하실 수 있습니다', icon: ArrowUpFromLine, done: false, status: '검토 필요' },
              { title: '같은 업종', detail: '어느 방향으로도 넣지 않습니다', icon: Ban, done: true, status: '차단됨' },
              { title: '아티클에 내부 링크 3개 추가', detail: '가격 가이드', icon: ArrowLeftRight, done: true, status: '추가됨' },
            ]}
          />
        ),
      },
      sections: [
        {
          kind: 'steps',
          eyebrow: '보완 업종 업체',
          title: '진행 방식',
          items: [
            { title: '고객님이 켜십니다', body: '참여는 사이트 단위이며, 프로젝트 소유자가 화면의 약관에 동의하신 뒤 켜십니다. 기본값은 꺼짐이고 언제든지 그만두실 수 있습니다.' },
            { title: '실제 사이트만', body: '소유자가 WordPress나 Search Console로 애플리케이션에 연결한 사이트만 참여합니다. 도메인을 입력하는 것만으로는 되지 않으므로, 남의 사이트가 여기에 들어오는 일은 없습니다.' },
            { title: '언급은 아티클 안에 자리합니다', body: '보완 업종 업체를 위한 아티클이 만들어질 때, 이미 문장 안에 있는 표현에 고객님의 알맞은 페이지를 언급할 수 있습니다. 본문을 다시 쓰거나 문단을 보태지는 않습니다.' },
            { title: '모든 내역을 보십니다', body: '모든 삽입이 기록되어 양쪽에 표시됩니다. 고객님의 아티클에서 나가는 링크는 게시 전에 표시되며 삭제하실 수 있습니다.' },
          ],
        },
        {
          kind: 'cards',
          tone: 'contrast',
          eyebrow: '규칙',
          title: '이것이 자연스럽게 유지되는 이유',
          items: [
            { icon: Ban, title: '경쟁사는 절대 아닙니다', body: '같은 업종은 제외하며, 어느 한쪽이 경쟁사로 표시한 도메인도 제외합니다. 업종을 알 수 없는 사이트는 아예 넣지 않습니다. 추측하지 않습니다.' },
            { icon: ArrowLeftRight, title: '교환하지 않습니다', body: '맞교환을 하지 않습니다. 언급을 받은 사이트가 되돌려 언급하는 일은 없고, 같은 쌍은 한 번만 만납니다. 사이트 세 곳을 거치는 짧은 고리도 막습니다.' },
            { icon: ShieldCheck, title: '하나만, 그것도 아껴서', body: '아티클당 최대 하나이며, 하나를 더 밀어 넣기보다 아예 넣지 않는 편을 택합니다. 막 시작한 사이트는 더 천천히 참여합니다.' },
            { icon: Network, title: '독자에게 도움이 되는 자리에만', body: '그 문단을 읽는 사람에게 해당 페이지가 실제로 도움이 되는 자리에만 언급이 들어갑니다. 잘 맞지 않으면 아무것도 넣지 않습니다. 새로 만들어졌거나 내용이 빈약한 사이트는 참여하지 않습니다.' },
          ],
        },
        {
          kind: 'callout',
          icon: Info,
          title: '저희가 하지 않는 일',
          body: (
            <>
              <p>
                링크를 팔지 않고, 사지 않으며, 남의 사이트에서 링크를 받아 드린다고 약속하지도 않습니다. 약속된
                링크 개수도 없고 순위에 대한 약속도 없습니다.
              </p>
              <p>
                참여는 선택이고 기본값은 꺼짐이며 언제든지 그만두실 수 있습니다. 결제하신 내용에 포함되지 않고,
                어떤 플랜의 약정 사항도 아닙니다. 링크의 유형은 네트워크 전체에 적용되며, 동의 화면에 표시되고,
                앞으로의 링크에 대해 달라질 수 있습니다. 전체 내용은{' '}
                <a className="underline" href="/ko/terms#link-network">이용약관 제15조의2</a>에 참여에 따르는
                위험과 함께 적혀 있으니, 켜시기 전에 읽어 보시는 편이 좋습니다.
              </p>
              <p>
                참여 사이트 목록은 공개하지 않습니다. 링크를 받은 사이트는 자신에게 링크한 사이트의 주소를 봅니다.
                사이트 내용과 검색엔진 가이드라인 준수에 대한 책임은 사이트를 운영하시는 분에게 있으며, 저희는
                서비스를 중지하거나 종료할 수 있습니다.
              </p>
            </>
          ),
        },
        {
          kind: 'cards',
          columns: 2,
          eyebrow: '사이트 내부에서도',
          title: '사이트를 하나로 묶어 주는 링크',
          items: [
            { icon: ArrowLeftRight, title: '작성 중에 붙는 내부 링크', body: '아티클이 만들어지는 동안, 시스템이 그 아티클을 사이트의 알맞은 페이지와 연결합니다. 해당 표현이 본문에 이미 자연스럽게 나오는 자리에만 넣습니다. 아티클 전체는 늘 그렇듯 게시 전에 읽어 보십니다.' },
            { icon: Unlink, title: '링크가 없는 페이지', body: '사이트의 다른 페이지 어디에서도 링크되지 않는 페이지입니다. Google이 찾아가기 어렵고 중요도를 알아보지 못합니다. 메뉴나 홈에서 링크되는 페이지는 여기에 포함되지 않습니다.' },
            { icon: ListChecks, title: '무료 디렉터리', body: '프로젝트의 국가와 언어에 맞는 디렉터리와 업체 프로필을 사람이 직접 확인해 정리한 목록입니다. 이미 등록돼 있는 곳도 함께 표시됩니다.' },
            { icon: MapPinned, title: '무엇이 무엇으로 연결되는지', body: '아티클마다 어디로 링크하고 어디에서 링크받는지 보여 드립니다. 어떤 페이지는 Google에서 움직이지 않고 어떤 페이지는 움직이는 이유가 여기서 드러납니다.' },
          ],
        },
        {
          kind: 'cards',
          columns: 2,
          eyebrow: 'Search Console',
          title: 'Google이 이미 찾아 둔 링크',
          items: [
            { icon: FileSearch, title: 'Google 보고서로 바로 연결', body: 'Search Console에는 링크 목록을 돌려주는 인터페이스가 없으므로, 저희가 그것을 지어내지 않습니다. Google의 보고서로 바로 가는 링크를 드립니다.' },
            { icon: Search, title: '내보낸 파일로 보는 당시 상태', body: 'Search Console에서 내보낸 CSV 파일을 올리시면 시스템에서 살펴보실 수 있습니다. 내보낸 날의 상태이며 저절로 갱신되지는 않습니다.' },
          ],
        },
        {
          kind: 'faq',
          eyebrow: '자주 묻는 질문',
          title: '링크에 대해 많이 묻는 것',
          items: [
            { q: '링크를 몇 개 받게 됩니까?', a: '약속된 개수도, 채우려고 애쓰는 할당량도 없습니다. 어떤 문단이 고객님의 페이지와 정말로 맞는 아티클이 만들어질 때에만 언급이 들어가며, 그런 일은 드물게 일어납니다.' },
            { q: '제가 참여하는 것을 누가 알게 됩니까?', a: '참여 사이트 목록은 공개하지 않습니다. 언급을 받은 사이트는 자신에게 링크한 사이트의 주소를 보고, 게시된 뒤에는 링크가 실린 페이지도 봅니다.' },
            { q: '꼭 참여해야 합니까?', a: '그렇지 않습니다. 기본값은 꺼짐이고 사이트마다 따로 켜며, 언제든지 그만두실 수 있습니다. 그만두시면 새 언급은 생기지 않고, 이미 게시된 링크는 해당 사이트에 남습니다.' },
            { q: 'Shopify 쇼핑몰에서도 작동합니까?', a: '별도로 선택해 켜시면 작동합니다. 언급은 저희가 쇼핑몰 블로그에 써서 게시하는 아티클에만 들어갑니다. 쇼핑몰에 이미 있는 아티클, 페이지, 상품, 컬렉션은 변경되지 않습니다.' },
            { q: '제 사이트 안의 내부 링크는 어떻습니까?', a: '그것과 무관하게 작동합니다. 작성되는 모든 아티클에 사이트의 알맞은 페이지로 가는 링크가 붙고, 아티클 전체는 게시 전에 고객님이 승인하십니다.' },
          ],
        },
      ],
      cta: { title: '보완 업종 업체가 고객님께 링크하도록 열어 두십시오', body: ko.closeBody, primary: ko.trial, secondary: ko.check },
    },
  },
}
