/**
 * /features/google-maps-posts in four languages: posts and review replies on
 * the business's Google Business Profile, from inside the app.
 *
 * The owner asked on 16 Oct 2026 for the capabilities menu to carry a page for
 * "posts on Google Maps and every option we added there". The feature is live:
 * GBP_POSTS_ENABLED was turned on in Production on 12 Oct 2026.
 *
 * WHAT THIS PAGE CLAIMS, and where each claim comes from:
 *   - one Google sign-in with the merchant's own consent, asking only to manage
 *     the profile, separate from Search Console, disconnectable at any moment;
 *     the account must own or manage the profile (lib/gbp/config.ts GBP_SCOPE,
 *     lib/gbp/oauth.ts, the dashboard dictionary's mapsPosts.connect);
 *   - pick which of the businesses the account manages this project posts to
 *     (app/api/gbp/locations, saveProjectLocation);
 *   - start from one of the project's articles, from a typed topic, or from a
 *     blank page (PostComposer `Source`); the first draft is written in one of
 *     the app's four languages under Google's 1,500-character limit and lands in
 *     the editor, never published unread (lib/gbp/draft.ts, validate.ts);
 *   - a photo uploaded and cropped to 4:3 with zoom and position, or the
 *     article's own image (components/maps-posts/crop.ts, lib/gbp/image.ts);
 *   - the six buttons, a link on the project's own site by default, another
 *     site only when ticked, and CALL dialling the number on the profile
 *     (validate.ts GBP_CTA_TYPES and the other-site rule);
 *   - a phone number in the text is flagged (containsPhoneNumber);
 *   - publish now or at a date and time up to a year ahead, and a scheduled
 *     post can be cancelled (validate.ts MAX_AHEAD_MS, store.ts cancelPost);
 *   - the list shows each post's status: live, under review, scheduled,
 *     rejected (PostsList STATUS_TONE);
 *   - automatic posting: off by default, per project, only once a business is
 *     chosen, the article's button and image, never twice for one article, and
 *     it goes out without a read, which is why it is the owner's choice
 *     (lib/gbp/auto-post.ts, migration 20261012180000_gbp_auto_post.sql);
 *   - reviews: read live from Google and not stored, summary, unanswered count,
 *     "new" marks, sorting by rating; a drafted reply in the reviewer's own
 *     language, without the reviewer's name; edit and delete a reply
 *     (lib/gbp/reviews.ts, review-draft.ts, ReviewsPanel);
 *   - nothing else on the profile (hours, address, phone) is changed.
 *   - an illustrative AI image for a post written from a topic only, said to be
 *     a generic picture and not a photo of the business, its staff or products,
 *     used only if the owner picks it (lib/gbp/topic-image.ts; terms 15F);
 * WHAT IT DELIBERATELY DOES NOT SAY: no model or provider name, no ranking promise, no number, no percentage, and nothing
 * that reads as Google endorsing or partnering with Go Top SEO. Google's names
 * are used only to say which product the posts land on.
 *
 * Guarded by components/public/__qa__/public-nav-menus.qa.ts (group 5).
 */
import {
  Crop, Eye, ImagePlus, Info, Languages, Lock, MapPinned, MessageSquareText, MousePointerClick,
  PenLine, Repeat, ShieldCheck, Sparkles, ToggleLeft, Type, Zap,
} from 'lucide-react'
import { MapsPostVisual } from '@/components/public/feature-visuals'
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

export const MAPS_POSTS_PAGE: MarketingPage = {
  path: '/features/google-maps-posts',
  meta: {
    he: {
      title: 'פוסטים בגוגל מפות | Go Top SEO',
      description: 'מפרסמים עדכונים עם תמונה וכפתור בפרופיל העסק בגוגל, ישר מהמערכת: טיוטה ראשונה מוכנה, אתם מתקנים ומפרסמים עכשיו או בשעה שבחרתם. ובאותו מקום עונים גם לביקורות בגוגל.',
    },
    en: {
      title: 'Google Maps Posts | Go Top SEO',
      description: 'Publish updates with a photo and a button to your Google Business Profile, right from the app: a first draft is ready, you edit it and publish now or at a time you choose. Reply to your Google reviews in the same place.',
    },
    es: {
      title: 'Publicaciones en Google Maps | Go Top SEO',
      description: 'Publica novedades con foto y botón en el Perfil de Empresa de Google desde la aplicación: el primer borrador ya está listo, lo corriges y lo publicas ahora o a la hora que elijas. Y en el mismo lugar respondes a tus reseñas de Google.',
    },
    'pt-BR': {
      title: 'Posts no Google Maps | Go Top SEO',
      description: 'Publique novidades com foto e botão no Perfil da Empresa no Google direto do aplicativo: o primeiro rascunho já vem pronto, você ajusta e publica agora ou no horário que escolher. E no mesmo lugar responde às suas avaliações do Google.',
    },
    fr: {
      title: 'Posts Google Maps | Go Top SEO',
      description: 'Publiez des actualités avec photo et bouton sur votre fiche Google Business Profile, depuis l’application : un premier brouillon est prêt, vous le corrigez et publiez tout de suite ou à l’heure choisie. Et au même endroit, vous répondez à vos avis Google.',
    },
    it: {
      title: 'Post Google Maps | Go Top SEO',
      description: 'Dall’applicazione si pubblicano novità con foto e pulsante sul profilo Google Business Profile: una prima bozza è pronta, si corregge e si pubblica subito o all’ora scelta. E nello stesso posto si risponde alle recensioni Google.',
    },
    ja: {
      title: 'Googleマップの投稿 | Go Top SEO',
      description: 'アプリから、写真とボタン付きのお知らせをGoogleビジネスプロフィールに公開できます。最初の下書きが用意されるので、手直ししてすぐに公開するか、お選びの時刻に公開します。Googleの口コミへの返信も同じ場所で行えます。',
    },
    nl: {
      title: 'Berichten in uw Google Bedrijfsprofiel | Go Top SEO',
      description: 'Publiceer nieuws met foto en knop rechtstreeks uit de app in uw Google Bedrijfsprofiel: er ligt een eerste versie klaar, u past die aan en publiceert direct of op een moment van uw keuze. Antwoorden op uw Google-reviews op dezelfde plek.',
    },
    de: {
      title: 'Beiträge im Google Unternehmensprofil | Go Top SEO',
      description: 'Veröffentlichen Sie Neuigkeiten mit Foto und Button direkt aus der App in Ihrem Google Unternehmensprofil: ein erster Entwurf liegt bereit, Sie bearbeiten ihn und veröffentlichen sofort oder zu einem Zeitpunkt Ihrer Wahl. Antworten auf Ihre Google-Bewertungen an derselben Stelle.',
    },
    pl: {
      title: 'Wpisy w Profilu Firmy w Google | Go Top SEO',
      description: 'Nowości ze zdjęciem i przyciskiem publikowane wprost z aplikacji w Profilu Firmy w Google: pierwsza wersja czeka gotowa, można ją poprawić i opublikować od razu albo w wybranym momencie. Odpowiedzi na opinie w Google w tym samym miejscu.',
    },
    ko: {
      title: 'Google 비즈니스 프로필 게시물 | Go Top SEO',
      description: '사진과 버튼이 들어간 소식을 애플리케이션에서 바로 Google 비즈니스 프로필에 올립니다. 첫 초안이 준비돼 있어, 고치신 다음 지금 바로 또는 원하시는 시각에 게시하실 수 있습니다. Google 리뷰 답글도 같은 자리에서 쓰실 수 있습니다.',
    },
  },
  content: {
    he: {
      hero: {
        eyebrow: 'פוסטים בגוגל מפות',
        eyebrowIcon: MapPinned,
        title: 'פרופיל העסק בגוגל',
        accent: 'מתעדכן גם כשאין לכם זמן',
        subtitle: 'מי שמוצא אתכם בגוגל מפות רואה מה חדש אצלכם: מבצע, שירות חדש, מאמר שעלה לאתר. כותבים מהמערכת פוסט עם תמונה וכפתור, מקבלים טיוטה ראשונה, מתקנים ומפרסמים עכשיו או בשעה שבחרתם. ובאותו מקום עונים גם לביקורות.',
        trust: he.trust,
        primary: he.trial,
        secondary: he.check,
        visual: (
          <MapsPostVisual
            business="מכון כושר ברחוב הרצל"
            kind="עדכון · יום חמישי 10:00"
            text="פתחנו קבוצת אימון בוקר חדשה לגילאי 50 ומעלה, בימים שני ורביעי ב-7:00. מאמן צמוד, קבוצה קטנה ואימון ניסיון בלי התחייבות."
            button="הזמנת תור"
            queueHeading="הפוסטים שלכם"
            queue={[
              { title: 'אימון בוקר לגילאי 50 ומעלה', detail: 'מתוזמן ליום חמישי 10:00', status: 'מתוזמן', done: false },
              { title: 'מדריך: איך לבחור נעלי ריצה', detail: 'ממאמר חדש באתר', status: 'עלה', auto: true, done: true },
            ]}
            review={{
              heading: 'ביקורת חדשה',
              author: 'דנה כ.',
              stars: 5,
              starsLabel: '5 מתוך 5 כוכבים',
              text: 'מקום נקי, מאמנים סבלניים ואווירה טובה. מגיעה כבר חצי שנה.',
              replyLabel: 'טיוטת תשובה',
              reply: 'תודה רבה על המילים החמות! שמחים שטוב לך אצלנו, ונתראה באימון הבא.',
            }}
          />
        ),
      },
      sections: [
        {
          kind: 'steps',
          eyebrow: 'איך זה עובד',
          title: 'מחיבור ועד פוסט באוויר',
          items: [
            { title: 'מתחברים פעם אחת', body: 'נכנסים עם חשבון Google שמנהל את פרופיל העסק ומאשרים במסך של גוגל. ההרשאה היא רק לניהול הפרופיל, והחיבור נפרד מ-Search Console. אפשר לנתק בכל רגע.' },
            { title: 'בוחרים את העסק', body: 'המערכת מביאה את העסקים שאתם מנהלים בגוגל, ואתם בוחרים באיזה מהם יתפרסמו הפוסטים של האתר הזה.' },
            { title: 'כותבים, או מקבלים טיוטה', body: 'מתחילים ממאמר שהמערכת כתבה לאתר, מנושא שאתם מקלידים או מדף ריק. מקבלים טיוטה ראשונה בתוך מגבלת האורך של גוגל, ועורכים אותה כמו שאתם רוצים.' },
            { title: 'מפרסמים או מתזמנים', body: 'עכשיו, או בתאריך ושעה שתבחרו, עד שנה קדימה. ברשימת הפוסטים רואים מה כבר עלה, מה מתוזמן ומה גוגל עדיין בודקת.' },
          ],
        },
        {
          kind: 'cards',
          eyebrow: 'בכל פוסט',
          title: 'פוסט שנראה כמו שצריך',
          items: [
            { icon: Crop, title: 'תמונה בגודל הנכון', body: 'מעלים תמונה וחותכים אותה ליחס 4:3, כמו שגוגל מציגה, עם זום ומיקום. בפוסט שנכתב ממאמר אפשר לקחת את תמונת המאמר בלחיצה.' },
            { icon: ImagePlus, title: 'תמונה מוכנה לפוסט לפי נושא', body: 'כשכותבים פוסט מנושא שהקלדתם, אפשר לבקש מהמערכת ליצור תמונה להמחשה בעזרת AI. זו תמונה כללית, לא צילום של העסק, של העובדים או של המוצרים שלכם, והיא נכנסת לפוסט רק אם בחרתם בה.' },
            { icon: MousePointerClick, title: 'כפתור שמוביל לפעולה', body: 'מידע נוסף, הזמנת תור, הזמנה אונליין, קנייה, הרשמה או התקשרו. הכפתור מוביל לעמוד באתר שלכם, ואפשר גם לאתר אחר כמו מערכת זימון תורים. "התקשרו" מחייג למספר שבפרופיל.' },
            { icon: Eye, title: 'רואים לפני שמפרסמים', body: 'לצד הכתיבה יש תצוגה מקדימה של הפוסט: שם העסק, התמונה, הטקסט והכפתור, כדי שלא יהיו הפתעות.' },
            { icon: Type, title: 'בתוך הכללים של גוגל', body: 'מונה תווים עד 1,500, המגבלה של גוגל. אם יש בטקסט מספר טלפון תקבלו התראה, כי גוגל מגבילה טלפונים בפוסטים, ולשיחות יש את הכפתור "התקשרו".' },
            { icon: Languages, title: 'בשפה של הלקוחות', body: 'הטיוטה נכתבת בשפת הפרויקט, בכל אחת מהשפות שהמערכת תומכת בהן, ואתם תמיד יכולים לשנות כל מילה לפני הפרסום.' },
            { icon: ShieldCheck, title: 'רק מה שאישרתם', body: 'מתפרסמים רק פוסטים ותשובות שאישרתם, או פוסטים אוטומטיים אם הפעלתם אותם. שעות הפתיחה, הכתובת ושאר פרטי העסק לא משתנים.' },
          ],
        },
        {
          kind: 'cards',
          tone: 'contrast',
          eyebrow: 'פרסום אוטומטי',
          title: 'מאמר חדש באתר, פוסט חדש בגוגל',
          items: [
            { icon: Zap, title: 'קורה מעצמו', body: 'אם תפעילו, כל מאמר שהמערכת מפרסמת באתר הופך גם לפוסט קצר בפרופיל העסק, עם תמונת המאמר וכפתור "מידע נוסף" שמוביל אליו.' },
            { icon: ToggleLeft, title: 'כבוי עד שתפעילו', body: 'ההגדרה כבויה כברירת מחדל ונקבעת לכל אתר בנפרד. הפוסט האוטומטי עולה בלי שתעברו עליו קודם, ולכן זו החלטה שלכם. אפשר לכבות בכל רגע, והפוסטים שכבר עלו נשארים.' },
            { icon: Repeat, title: 'פעם אחת לכל מאמר', body: 'אותו מאמר לא יעלה פעמיים לפרופיל, גם אם הפרסום באתר חוזר על עצמו. כך הפרופיל לא מתמלא בפוסטים כפולים.' },
          ],
        },
        {
          kind: 'cards',
          columns: 2,
          eyebrow: 'ביקורות בגוגל',
          title: 'עונים לכל ביקורת, ממקום אחד',
          items: [
            { icon: MessageSquareText, title: 'כל הביקורות מול העיניים', body: 'הביקורות על העסק בגוגל, עם הדירוג הממוצע, כמה ביקורות עוד מחכות לתשובה וסימון לביקורות חדשות. אפשר למיין לפי דירוג.' },
            { icon: Sparkles, title: 'טיוטת תשובה בלחיצה', body: 'מקבלים הצעה לתשובה עניינית ומנומסת, בשפה שבה הלקוח כתב. אתם עורכים ושולחים, והתשובה מתפרסמת בגוגל מתחת לביקורת.' },
            { icon: PenLine, title: 'עורכים או מוחקים', body: 'אפשר לערוך תשובה שכבר פורסמה או למחוק אותה. הביקורת עצמה נשארת כמו שהיא.' },
            { icon: Lock, title: 'הביקורות לא נשמרות אצלנו', body: 'הביקורות נקראות מגוגל בכל פתיחה ולא נשמרות במערכת. שם הלקוח לא נשלח לכתיבת הטיוטה, ואם תרצו לפנות אליו בשמו תוסיפו אותו בעצמכם.' },
          ],
        },
        {
          kind: 'callout',
          icon: Info,
          title: 'כדאי לדעת',
          body: (
            <>
              <p>
                גוגל בודקת כל פוסט לפני שהוא מוצג, ולפעמים דוחה פוסט. ברשימת הפוסטים רואים את המצב של כל אחד, כולל
                פוסט שנדחה. כדי להתחבר צריך חשבון Google שהוא בעלים או מנהל של פרופיל העסק.
              </p>
              <p>
                Go Top SEO אינה קשורה ל-Google. פוסטים ותשובות לביקורות עוזרים ללקוחות לראות עסק פעיל, אבל אין
                התחייבות לדירוג בגוגל מפות או בחיפוש.
              </p>
            </>
          ),
        },
        {
          kind: 'faq',
          eyebrow: 'שאלות נפוצות',
          title: 'מה שואלים על פוסטים בגוגל מפות',
          items: [
            { q: 'המערכת יכולה לשנות את השעות או הכתובת של העסק?', a: 'לא. אנחנו מפרסמים רק פוסטים ותשובות לביקורות. שעות הפתיחה, הכתובת, הטלפון ושאר הפרטים בפרופיל נשארים כמו שהם.' },
            { q: 'הטיוטה מתפרסמת לבד?', a: 'בכתיבה רגילה, לא: הטיוטה מופיעה במסך ומתפרסמת רק כשאתם לוחצים. פוסטים על מאמרים חדשים עולים לבד רק אם הפעלתם פרסום אוטומטי.' },
            { q: 'אפשר לתזמן פוסטים מראש?', a: 'כן, לתאריך ושעה שתבחרו, עד שנה קדימה. פוסט מתוזמן אפשר לבטל כל עוד הוא לא עלה.' },
            { q: 'זה עובד גם לחנות Shopify או לאתר שלא בוורדפרס?', a: 'כן. הפוסט עולה לפרופיל העסק בגוגל ולא לאתר, ולכן זה עובד בכל פרויקט, בכל פלטפורמה.' },
            { q: 'מה קורה אם אנתק את החיבור?', a: 'פוסטים מתוזמנים לא יתפרסמו עד שתתחברו שוב. פוסטים שכבר פורסמו נשארים בגוגל.' },
            { q: 'אני מנהל כמה עסקים בגוגל. זה בעיה?', a: 'לא. המערכת מציגה את כל העסקים שהחשבון מנהל, ולכל אתר במערכת בוחרים את העסק שאליו יעלו הפוסטים שלו.' },
          ],
        },
      ],
      cta: { title: 'תנו ללקוחות לראות מה חדש אצלכם', body: he.closeBody, primary: he.trial, secondary: he.check },
    },
    en: {
      hero: {
        eyebrow: 'Google Maps posts',
        eyebrowIcon: MapPinned,
        title: 'Your Google Business Profile',
        accent: 'kept fresh, even when you are busy',
        subtitle: 'People who find you on Google Maps see what is new with you: an offer, a new service, an article that just went live. Write a post with a photo and a button in the app, get a first draft, edit it and publish now or at a time you choose. Reply to your reviews in the same place.',
        trust: en.trust,
        primary: en.trial,
        secondary: en.check,
        visual: (
          <MapsPostVisual
            business="Main Street Fitness"
            kind="Update · Thursday 10:00"
            text="We have opened a new morning group for ages 50 and up, Mondays and Wednesdays at 7:00. A personal coach, a small group and a free trial session, no commitment."
            button="Book"
            queueHeading="Your posts"
            queue={[
              { title: 'Morning group for 50+', detail: 'Scheduled for Thursday 10:00', status: 'Scheduled', done: false },
              { title: 'Guide: choosing running shoes', detail: 'From a new article on the site', status: 'Live', auto: true, done: true },
            ]}
            review={{
              heading: 'New review',
              author: 'Dana K.',
              stars: 5,
              starsLabel: '5 out of 5 stars',
              text: 'Clean place, patient trainers and a good atmosphere. I have been coming for six months.',
              replyLabel: 'Draft reply',
              reply: 'Thank you so much for the kind words! We are glad you enjoy it here, see you at the next session.',
            }}
          />
        ),
      },
      sections: [
        {
          kind: 'steps',
          eyebrow: 'How it works',
          title: 'From connecting to a live post',
          items: [
            { title: 'Connect once', body: 'Sign in with the Google account that manages your Business Profile and approve on Google’s screen. The permission covers managing the profile only, and it is separate from Search Console. You can disconnect at any moment.' },
            { title: 'Pick the business', body: 'The app lists the businesses you manage on Google, and you choose which one this site’s posts go to.' },
            { title: 'Write, or get a draft', body: 'Start from an article the system wrote for your site, from a topic you type, or from a blank page. You get a first draft within Google’s length limit and edit it however you like.' },
            { title: 'Publish or schedule', body: 'Now, or at a date and time you choose, up to a year ahead. The posts list shows what is live, what is scheduled and what Google is still reviewing.' },
          ],
        },
        {
          kind: 'cards',
          eyebrow: 'In every post',
          title: 'A post that looks right',
          items: [
            { icon: Crop, title: 'The right photo size', body: 'Upload a photo and crop it to 4:3, the way Google shows it, with zoom and position. A post written from an article can use the article’s image in one click.' },
            { icon: ImagePlus, title: 'A ready image for a topic post', body: 'When you write a post from a topic you typed, you can have the app create an illustrative image with AI. It is a generic picture, not a photo of your business, your staff or your products, and it goes into the post only if you choose it.' },
            { icon: MousePointerClick, title: 'A button that leads somewhere', body: 'Learn more, Book, Order online, Buy, Sign up or Call now. The button leads to a page on your site, or to another site such as a booking system if you allow it. Call now dials the number on your profile.' },
            { icon: Eye, title: 'See it before it goes out', body: 'Next to the editor there is a preview of the post: the business name, the photo, the text and the button, so nothing comes as a surprise.' },
            { icon: Type, title: 'Within Google’s rules', body: 'A character counter up to 1,500, Google’s limit. If the text has a phone number you get a warning, because Google restricts phone numbers in posts, and calls have the Call now button.' },
            { icon: Languages, title: 'In your customers’ language', body: 'The draft is written in your project’s language, in any of the languages the app supports, and you can always change any word before publishing.' },
            { icon: ShieldCheck, title: 'Only what you approved', body: 'Only posts and replies you approved go out, plus automatic posts if you turned them on. Opening hours, address and the rest of the business details are never changed.' },
          ],
        },
        {
          kind: 'cards',
          tone: 'contrast',
          eyebrow: 'Automatic posting',
          title: 'A new article on your site, a new post on Google',
          items: [
            { icon: Zap, title: 'It happens on its own', body: 'If you turn it on, every article the system publishes to your site also becomes a short post on your Business Profile, with the article’s image and a Learn more button that leads to it.' },
            { icon: ToggleLeft, title: 'Off until you turn it on', body: 'It is off by default and set per site. An automatic post goes out without you reading it first, which is why it is your call. You can turn it off at any moment, and posts already live stay up.' },
            { icon: Repeat, title: 'Once per article', body: 'The same article never goes to the profile twice, even if the publish on your site is retried. So the profile does not fill up with duplicate posts.' },
          ],
        },
        {
          kind: 'cards',
          columns: 2,
          eyebrow: 'Google reviews',
          title: 'Reply to every review, from one place',
          items: [
            { icon: MessageSquareText, title: 'Every review in view', body: 'Your business’s Google reviews, with the average rating, how many are still waiting for a reply, and new ones marked. You can sort by rating.' },
            { icon: Sparkles, title: 'A draft reply in one click', body: 'You get a suggested reply, polite and to the point, in the language the customer wrote in. You edit and send it, and the reply appears on Google under the review.' },
            { icon: PenLine, title: 'Edit or delete', body: 'You can edit a reply that is already published, or delete it. The review itself stays as it is.' },
            { icon: Lock, title: 'Reviews are not stored with us', body: 'Reviews are read from Google each time you open the screen and are not stored in the system. The customer’s name is not sent to write the draft; add it yourself if you want to address them by name.' },
          ],
        },
        {
          kind: 'callout',
          icon: Info,
          title: 'Good to know',
          body: (
            <>
              <p>
                Google reviews every post before showing it, and sometimes rejects one. The posts list shows where each
                one stands, including a rejected post. To connect you need a Google account that owns or manages the
                Business Profile.
              </p>
              <p>
                Go Top SEO is not affiliated with Google. Posts and review replies help customers see an active
                business, but there is no ranking promise for Google Maps or Search.
              </p>
            </>
          ),
        },
        {
          kind: 'faq',
          eyebrow: 'FAQ',
          title: 'What people ask about Google Maps posts',
          items: [
            { q: 'Can the app change my opening hours or address?', a: 'No. We publish only posts and review replies. Opening hours, address, phone number and the other profile details stay exactly as they are.' },
            { q: 'Does the draft publish by itself?', a: 'When you write a post, no: the draft appears on screen and is published only when you press the button. Posts about new articles go out on their own only if you turned automatic posting on.' },
            { q: 'Can I schedule posts in advance?', a: 'Yes, for a date and time you choose, up to a year ahead. A scheduled post can be cancelled as long as it has not gone out.' },
            { q: 'Does it work for a Shopify store or a site that is not on WordPress?', a: 'Yes. The post goes to your Business Profile on Google, not to your site, so it works for every project on any platform.' },
            { q: 'What happens if I disconnect?', a: 'Scheduled posts will not be published until you connect again. Posts already published stay on Google.' },
            { q: 'I manage several businesses on Google. Is that a problem?', a: 'No. The app shows every business the account manages, and for each site in the system you choose the business its posts go to.' },
          ],
        },
      ],
      cta: { title: 'Let customers see what is new with you', body: en.closeBody, primary: en.trial, secondary: en.check },
    },
    es: {
      hero: {
        eyebrow: 'Publicaciones en Google Maps',
        eyebrowIcon: MapPinned,
        title: 'Tu Perfil de Empresa en Google',
        accent: 'al día, aunque no tengas tiempo',
        subtitle: 'Quien te encuentra en Google Maps ve qué hay de nuevo en tu negocio: una oferta, un servicio nuevo, un artículo recién publicado. Escribe desde la aplicación una publicación con foto y botón, recibe un primer borrador, corrígelo y publícalo ahora o a la hora que elijas. Y en el mismo lugar respondes a tus reseñas.',
        trust: es.trust,
        primary: es.trial,
        secondary: es.check,
        visual: (
          <MapsPostVisual
            business="Gimnasio Calle Mayor"
            kind="Novedad · jueves 10:00"
            text="Abrimos un nuevo grupo de mañana para mayores de 50, lunes y miércoles a las 7:00. Entrenador personal, grupo reducido y una clase de prueba sin compromiso."
            button="Reservar"
            queueHeading="Tus publicaciones"
            queue={[
              { title: 'Grupo de mañana para mayores de 50', detail: 'Programada para el jueves a las 10:00', status: 'Programada', done: false },
              { title: 'Guía: cómo elegir zapatillas para correr', detail: 'De un artículo nuevo del sitio', status: 'Publicada', auto: true, done: true },
            ]}
            review={{
              heading: 'Reseña nueva',
              author: 'Lucía G.',
              stars: 5,
              starsLabel: '5 de 5 estrellas',
              text: 'Lugar limpio, entrenadores pacientes y muy buen ambiente. Vengo desde hace seis meses.',
              replyLabel: 'Borrador de respuesta',
              reply: '¡Muchas gracias por tus palabras! Nos alegra que estés a gusto con nosotros. Nos vemos en la próxima clase.',
            }}
          />
        ),
      },
      sections: [
        {
          kind: 'steps',
          eyebrow: 'Cómo funciona',
          title: 'De la conexión a la publicación',
          items: [
            { title: 'Te conectas una vez', body: 'Entras con la cuenta de Google que gestiona tu Perfil de Empresa y das tu aprobación en la pantalla de Google. El permiso es solo para gestionar el perfil y va aparte de Search Console. Puedes desconectarlo cuando quieras.' },
            { title: 'Eliges el negocio', body: 'La aplicación muestra los negocios que gestionas en Google y tú eliges en cuál se publican las novedades de este sitio.' },
            { title: 'Escribes, o recibes un borrador', body: 'Empiezas desde un artículo que el sistema escribió para tu sitio, desde un tema que escribes o desde cero. Recibes un primer borrador dentro del límite de longitud de Google y lo editas como quieras.' },
            { title: 'Publicas o programas', body: 'Ahora, o en la fecha y hora que elijas, con hasta un año de antelación. En la lista ves qué ya está publicado, qué está programado y qué sigue revisando Google.' },
          ],
        },
        {
          kind: 'cards',
          eyebrow: 'En cada publicación',
          title: 'Una publicación que se ve bien',
          items: [
            { icon: Crop, title: 'La foto del tamaño correcto', body: 'Subes una foto y la recortas en formato 4:3, como la muestra Google, con zoom y posición. Si la publicación sale de un artículo, puedes usar la imagen del artículo con un clic.' },
            { icon: ImagePlus, title: 'Una imagen lista para la publicación por tema', body: 'Cuando escribes una publicación a partir de un tema, puedes pedir que la aplicación cree una imagen ilustrativa con IA. Es una imagen genérica, no una foto de tu negocio, de tu equipo ni de tus productos, y solo entra en la publicación si la eliges.' },
            { icon: MousePointerClick, title: 'Un botón que lleva a la acción', body: 'Más información, Reservar, Pedir online, Comprar, Registrarse o Llamar ahora. El botón lleva a una página de tu sitio o, si lo permites, a otro sitio, como un sistema de citas. Llamar ahora marca el número de tu perfil.' },
            { icon: Eye, title: 'La ves antes de publicarla', body: 'Junto al editor hay una vista previa de la publicación: el nombre del negocio, la foto, el texto y el botón, para que no haya sorpresas.' },
            { icon: Type, title: 'Dentro de las reglas de Google', body: 'Un contador de caracteres hasta 1500, el límite de Google. Si el texto lleva un número de teléfono recibes un aviso, porque Google limita los teléfonos en las publicaciones, y para las llamadas está el botón Llamar ahora.' },
            { icon: Languages, title: 'En el idioma de tus clientes', body: 'El borrador se escribe en el idioma de tu proyecto, en cualquiera de los idiomas que admite la aplicación, y siempre puedes cambiar cualquier palabra antes de publicar.' },
            { icon: ShieldCheck, title: 'Solo lo que apruebas', body: 'Solo salen las publicaciones y respuestas que apruebas, y las automáticas si las activaste. El horario, la dirección y el resto de los datos del negocio no se tocan.' },
          ],
        },
        {
          kind: 'cards',
          tone: 'contrast',
          eyebrow: 'Publicación automática',
          title: 'Un artículo nuevo en tu sitio, una publicación nueva en Google',
          items: [
            { icon: Zap, title: 'Sucede sola', body: 'Si la activas, cada artículo que el sistema publica en tu sitio se convierte también en una publicación breve en tu Perfil de Empresa, con la imagen del artículo y un botón Más información que lleva a él.' },
            { icon: ToggleLeft, title: 'Desactivada hasta que la actives', body: 'Viene desactivada por defecto y se configura por sitio. La publicación automática sale sin que la revises antes, por eso la decisión es tuya. Puedes desactivarla en cualquier momento y lo ya publicado se queda.' },
            { icon: Repeat, title: 'Una vez por artículo', body: 'Un mismo artículo nunca llega dos veces al perfil, aunque la publicación en tu sitio se repita. Así el perfil no se llena de publicaciones duplicadas.' },
          ],
        },
        {
          kind: 'cards',
          columns: 2,
          eyebrow: 'Reseñas de Google',
          title: 'Responde a cada reseña desde un solo lugar',
          items: [
            { icon: MessageSquareText, title: 'Todas las reseñas a la vista', body: 'Las reseñas de tu negocio en Google, con la valoración media, cuántas esperan respuesta y las nuevas marcadas. Puedes ordenarlas por valoración.' },
            { icon: Sparkles, title: 'Un borrador de respuesta con un clic', body: 'Recibes una propuesta de respuesta amable y concreta, en el idioma en que escribió el cliente. La editas, la envías y aparece en Google debajo de la reseña.' },
            { icon: PenLine, title: 'Editar o eliminar', body: 'Puedes editar una respuesta ya publicada o eliminarla. La reseña en sí se queda como está.' },
            { icon: Lock, title: 'No guardamos las reseñas', body: 'Las reseñas se leen de Google cada vez que abres la pantalla y no se guardan en el sistema. El nombre del cliente no se envía para escribir el borrador; si quieres dirigirte a él por su nombre, lo añades tú.' },
          ],
        },
        {
          kind: 'callout',
          icon: Info,
          title: 'Conviene saber',
          body: (
            <>
              <p>
                Google revisa cada publicación antes de mostrarla y a veces rechaza alguna. En la lista ves el estado de
                cada una, también si fue rechazada. Para conectarte necesitas una cuenta de Google que sea propietaria o
                administradora del Perfil de Empresa.
              </p>
              <p>
                Go Top SEO no está vinculada a Google. Las publicaciones y las respuestas a reseñas ayudan a que los
                clientes vean un negocio activo, pero no hay promesa de posicionamiento en Google Maps ni en la búsqueda.
              </p>
            </>
          ),
        },
        {
          kind: 'faq',
          eyebrow: 'Preguntas frecuentes',
          title: 'Lo que se pregunta sobre las publicaciones en Google Maps',
          items: [
            { q: '¿La aplicación puede cambiar mi horario o mi dirección?', a: 'No. Solo publicamos novedades y respuestas a reseñas. El horario, la dirección, el teléfono y el resto de los datos del perfil se quedan como están.' },
            { q: '¿El borrador se publica solo?', a: 'Cuando escribes una publicación, no: el borrador aparece en pantalla y se publica solo cuando pulsas el botón. Las publicaciones sobre artículos nuevos salen solas únicamente si activaste la publicación automática.' },
            { q: '¿Puedo programar publicaciones?', a: 'Sí, para la fecha y hora que elijas, con hasta un año de antelación. Una publicación programada se puede cancelar mientras no haya salido.' },
            { q: '¿Funciona en una tienda Shopify o en un sitio que no es WordPress?', a: 'Sí. La publicación va a tu Perfil de Empresa en Google, no a tu sitio, así que funciona en cualquier proyecto y en cualquier plataforma.' },
            { q: '¿Qué pasa si me desconecto?', a: 'Las publicaciones programadas no saldrán hasta que te vuelvas a conectar. Las ya publicadas se quedan en Google.' },
            { q: 'Gestiono varios negocios en Google. ¿Es un problema?', a: 'No. La aplicación muestra todos los negocios que gestiona la cuenta y, para cada sitio del sistema, eliges el negocio al que van sus publicaciones.' },
          ],
        },
      ],
      cta: { title: 'Deja que tus clientes vean lo nuevo', body: es.closeBody, primary: es.trial, secondary: es.check },
    },
    'pt-BR': {
      hero: {
        eyebrow: 'Posts no Google Maps',
        eyebrowIcon: MapPinned,
        title: 'Seu Perfil da Empresa no Google',
        accent: 'sempre atualizado, mesmo sem tempo',
        subtitle: 'Quem encontra você no Google Maps vê o que há de novo no seu negócio: uma promoção, um serviço novo, um artigo que acabou de sair. Escreva no aplicativo um post com foto e botão, receba um primeiro rascunho, ajuste e publique agora ou no horário que escolher. E no mesmo lugar responda às suas avaliações.',
        trust: pt.trust,
        primary: pt.trial,
        secondary: pt.check,
        visual: (
          <MapsPostVisual
            business="Academia Rua das Flores"
            kind="Novidade · quinta 10:00"
            text="Abrimos uma nova turma de manhã para quem tem 50 anos ou mais, segundas e quartas às 7:00. Professor dedicado, turma pequena e uma aula experimental sem compromisso."
            button="Reservar"
            queueHeading="Seus posts"
            queue={[
              { title: 'Turma da manhã para 50+', detail: 'Agendado para quinta às 10:00', status: 'Agendado', done: false },
              { title: 'Guia: como escolher um tênis de corrida', detail: 'De um artigo novo do site', status: 'No ar', auto: true, done: true },
            ]}
            review={{
              heading: 'Avaliação nova',
              author: 'Mariana S.',
              stars: 5,
              starsLabel: '5 de 5 estrelas',
              text: 'Lugar limpo, professores pacientes e um clima ótimo. Frequento há seis meses.',
              replyLabel: 'Rascunho da resposta',
              reply: 'Muito obrigado pelo carinho! Ficamos felizes que você goste daqui. Até a próxima aula.',
            }}
          />
        ),
      },
      sections: [
        {
          kind: 'steps',
          eyebrow: 'Como funciona',
          title: 'Da conexão ao post no ar',
          items: [
            { title: 'Conecte uma vez', body: 'Entre com a conta do Google que gerencia o seu Perfil da Empresa e aprove na tela do Google. A permissão é só para gerenciar o perfil e é separada do Search Console. Dá para desconectar a qualquer momento.' },
            { title: 'Escolha o negócio', body: 'O aplicativo mostra os negócios que você gerencia no Google, e você escolhe em qual deles vão os posts deste site.' },
            { title: 'Escreva, ou receba um rascunho', body: 'Comece por um artigo que o sistema escreveu para o seu site, por um tema que você digita ou do zero. Você recebe um primeiro rascunho dentro do limite de tamanho do Google e edita como quiser.' },
            { title: 'Publique ou agende', body: 'Agora, ou na data e hora que escolher, até um ano à frente. Na lista de posts você vê o que já está no ar, o que está agendado e o que o Google ainda está analisando.' },
          ],
        },
        {
          kind: 'cards',
          eyebrow: 'Em cada post',
          title: 'Um post com cara de profissional',
          items: [
            { icon: Crop, title: 'A foto no tamanho certo', body: 'Envie uma foto e recorte no formato 4:3, do jeito que o Google mostra, com zoom e posição. Num post feito a partir de um artigo, dá para usar a imagem do artigo com um clique.' },
            { icon: ImagePlus, title: 'Uma imagem pronta para o post por tema', body: 'Quando você escreve um post a partir de um tema, pode pedir que o app crie uma imagem ilustrativa com IA. É uma imagem genérica, não uma foto do seu negócio, da sua equipe ou dos seus produtos, e só entra no post se você escolher.' },
            { icon: MousePointerClick, title: 'Um botão que leva à ação', body: 'Saiba mais, Reservar, Pedir online, Comprar, Cadastrar-se ou Ligar agora. O botão leva a uma página do seu site ou, se você permitir, a outro site, como um sistema de agendamento. Ligar agora disca o número do seu perfil.' },
            { icon: Eye, title: 'Veja antes de publicar', body: 'Ao lado do editor há uma prévia do post: o nome do negócio, a foto, o texto e o botão, para não ter surpresas.' },
            { icon: Type, title: 'Dentro das regras do Google', body: 'Um contador de caracteres até 1.500, o limite do Google. Se o texto tiver um número de telefone, você recebe um aviso, porque o Google restringe telefones nos posts, e para ligações existe o botão Ligar agora.' },
            { icon: Languages, title: 'No idioma dos seus clientes', body: 'O rascunho é escrito no idioma do seu projeto, em qualquer um dos idiomas que o aplicativo oferece, e você sempre pode mudar qualquer palavra antes de publicar.' },
            { icon: ShieldCheck, title: 'Só o que você aprovou', body: 'Só saem os posts e as respostas que você aprovou, e os automáticos se você os ativou. Horário de funcionamento, endereço e os outros dados do negócio não são alterados.' },
          ],
        },
        {
          kind: 'cards',
          tone: 'contrast',
          eyebrow: 'Publicação automática',
          title: 'Artigo novo no site, post novo no Google',
          items: [
            { icon: Zap, title: 'Acontece sozinho', body: 'Se você ativar, cada artigo que o sistema publica no seu site vira também um post curto no seu Perfil da Empresa, com a imagem do artigo e um botão Saiba mais que leva até ele.' },
            { icon: ToggleLeft, title: 'Desligado até você ativar', body: 'Vem desligado e é definido por site. O post automático sai sem que você o revise antes, por isso a decisão é sua. Dá para desligar a qualquer momento, e os posts que já estão no ar continuam lá.' },
            { icon: Repeat, title: 'Uma vez por artigo', body: 'O mesmo artigo nunca vai duas vezes para o perfil, mesmo que a publicação no site se repita. Assim o perfil não se enche de posts duplicados.' },
          ],
        },
        {
          kind: 'cards',
          columns: 2,
          eyebrow: 'Avaliações do Google',
          title: 'Responda a cada avaliação num só lugar',
          items: [
            { icon: MessageSquareText, title: 'Todas as avaliações à vista', body: 'As avaliações do seu negócio no Google, com a nota média, quantas ainda esperam resposta e as novas marcadas. Dá para ordenar pela nota.' },
            { icon: Sparkles, title: 'Um rascunho de resposta com um clique', body: 'Você recebe uma sugestão de resposta educada e objetiva, no idioma em que o cliente escreveu. Você edita, envia e a resposta aparece no Google embaixo da avaliação.' },
            { icon: PenLine, title: 'Editar ou apagar', body: 'Dá para editar uma resposta já publicada ou apagá-la. A avaliação em si continua como está.' },
            { icon: Lock, title: 'Não guardamos as avaliações', body: 'As avaliações são lidas do Google sempre que você abre a tela e não ficam salvas no sistema. O nome do cliente não é enviado para escrever o rascunho; se quiser chamá-lo pelo nome, acrescente você mesmo.' },
          ],
        },
        {
          kind: 'callout',
          icon: Info,
          title: 'Bom saber',
          body: (
            <>
              <p>
                O Google analisa cada post antes de exibi-lo e às vezes recusa algum. Na lista você vê a situação de
                cada um, inclusive de um post recusado. Para conectar, é preciso uma conta do Google que seja
                proprietária ou administradora do Perfil da Empresa.
              </p>
              <p>
                A Go Top SEO não tem vínculo com o Google. Posts e respostas a avaliações ajudam os clientes a ver um
                negócio ativo, mas não há promessa de posicionamento no Google Maps nem na busca.
              </p>
            </>
          ),
        },
        {
          kind: 'faq',
          eyebrow: 'Perguntas frequentes',
          title: 'O que perguntam sobre posts no Google Maps',
          items: [
            { q: 'O aplicativo pode mudar meu horário ou meu endereço?', a: 'Não. Só publicamos posts e respostas a avaliações. Horário de funcionamento, endereço, telefone e os outros dados do perfil continuam como estão.' },
            { q: 'O rascunho é publicado sozinho?', a: 'Quando você escreve um post, não: o rascunho aparece na tela e só é publicado quando você clica no botão. Posts sobre artigos novos saem sozinhos apenas se você ativou a publicação automática.' },
            { q: 'Dá para agendar posts?', a: 'Sim, para a data e hora que você escolher, até um ano à frente. Um post agendado pode ser cancelado enquanto não tiver saído.' },
            { q: 'Funciona para uma loja Shopify ou um site que não é WordPress?', a: 'Sim. O post vai para o seu Perfil da Empresa no Google, não para o seu site, então funciona em qualquer projeto e em qualquer plataforma.' },
            { q: 'O que acontece se eu desconectar?', a: 'Os posts agendados não serão publicados até você conectar de novo. Os que já foram publicados continuam no Google.' },
            { q: 'Gerencio vários negócios no Google. Isso é um problema?', a: 'Não. O aplicativo mostra todos os negócios que a conta gerencia e, para cada site do sistema, você escolhe o negócio para onde vão os posts dele.' },
          ],
        },
      ],
      cta: { title: 'Deixe seus clientes verem o que há de novo', body: pt.closeBody, primary: pt.trial, secondary: pt.check },
    },
    fr: {
      hero: {
        eyebrow: 'Posts Google Maps',
        eyebrowIcon: MapPinned,
        title: 'Votre fiche Google Business Profile',
        accent: 'à jour, même quand vous manquez de temps',
        subtitle: 'Les personnes qui vous trouvent sur Google Maps voient ce qui est nouveau chez vous : une offre, un nouveau service, un article qui vient de paraître. Rédigez depuis l’application un post avec photo et bouton, recevez un premier brouillon, corrigez-le et publiez tout de suite ou à l’heure que vous choisissez. Et au même endroit, vous répondez à vos avis.',
        trust: fr.trust,
        primary: fr.trial,
        secondary: fr.check,
        visual: (
          <MapsPostVisual
            business="Salle de sport de la Grand-Rue"
            kind="Actualité · jeudi 10:00"
            text="Nous ouvrons un nouveau cours collectif du matin pour les 50 ans et plus, les lundis et mercredis à 7:00. Un coach dédié, un petit groupe et une séance d’essai gratuite, sans engagement."
            button="Réserver"
            queueHeading="Vos posts"
            queue={[
              { title: 'Cours du matin pour les 50 ans et plus', detail: 'Programmé pour jeudi 10:00', status: 'Programmé', done: false },
              { title: 'Guide : bien choisir ses chaussures de running', detail: 'À partir d’un nouvel article du site', status: 'En ligne', auto: true, done: true },
            ]}
            review={{
              heading: 'Nouvel avis',
              author: 'Dana K.',
              stars: 5,
              starsLabel: '5 étoiles sur 5',
              text: 'Lieu propre, coachs patients et bonne ambiance. J’y viens depuis six mois.',
              replyLabel: 'Brouillon de réponse',
              reply: 'Merci beaucoup pour ces mots ! Nous sommes ravis que vous vous y sentiez bien, à bientôt pour la prochaine séance.',
            }}
          />
        ),
      },
      sections: [
        {
          kind: 'steps',
          eyebrow: 'Comment ça marche',
          title: 'De la connexion au post en ligne',
          items: [
            { title: 'Connectez-vous une fois', body: 'Connectez-vous avec le compte Google qui gère votre fiche Google Business Profile et validez sur l’écran de Google. L’autorisation ne couvre que la gestion de la fiche, et elle est distincte de Search Console. Vous pouvez vous déconnecter à tout moment.' },
            { title: 'Choisissez l’établissement', body: 'L’application liste les établissements que vous gérez sur Google, et vous choisissez celui sur lequel les posts de ce site seront publiés.' },
            { title: 'Rédigez, ou partez d’un brouillon', body: 'Partez d’un article que le système a écrit pour votre site, d’un sujet que vous saisissez, ou d’une page blanche. Vous obtenez un premier brouillon dans la limite de longueur de Google et vous le modifiez comme vous voulez.' },
            { title: 'Publiez ou programmez', body: 'Tout de suite, ou à la date et à l’heure que vous choisissez, jusqu’à un an à l’avance. La liste des posts montre ce qui est en ligne, ce qui est programmé et ce que Google examine encore.' },
          ],
        },
        {
          kind: 'cards',
          eyebrow: 'Dans chaque post',
          title: 'Un post qui a l’air soigné',
          items: [
            { icon: Crop, title: 'La photo à la bonne taille', body: 'Importez une photo et recadrez-la en 4:3, comme Google l’affiche, avec zoom et position. Un post écrit à partir d’un article peut reprendre l’image de l’article en un clic.' },
            { icon: ImagePlus, title: 'Une image prête pour un post par sujet', body: 'Quand vous écrivez un post à partir d’un sujet que vous avez saisi, vous pouvez demander à l’application de créer une image d’illustration par IA. C’est une image générique, pas une photo de votre entreprise, de votre équipe ou de vos produits, et elle n’entre dans le post que si vous la choisissez.' },
            { icon: MousePointerClick, title: 'Un bouton qui mène à une action', body: 'En savoir plus, Réserver, Commander en ligne, Acheter, S’inscrire ou Appeler. Le bouton mène à une page de votre site ou, si vous l’autorisez, à un autre site comme un outil de réservation. Appeler compose le numéro de votre fiche.' },
            { icon: Eye, title: 'Voyez avant de publier', body: 'À côté de l’éditeur, un aperçu du post : le nom de l’établissement, la photo, le texte et le bouton, pour éviter toute surprise.' },
            { icon: Type, title: 'Dans les règles de Google', body: 'Un compteur de caractères jusqu’à 1 500, la limite de Google. Si le texte contient un numéro de téléphone, vous recevez un avertissement, car Google limite les numéros dans les posts, et pour les appels il y a le bouton Appeler.' },
            { icon: Languages, title: 'Dans la langue de vos clients', body: 'Le brouillon est rédigé dans la langue de votre projet, dans chacune des langues que prend en charge l’application, et vous pouvez toujours changer chaque mot avant de publier.' },
            { icon: ShieldCheck, title: 'Uniquement ce que vous avez validé', body: 'Seuls partent les posts et les réponses que vous avez validés, plus les posts automatiques si vous les avez activés. Les horaires, l’adresse et les autres informations de l’établissement ne sont jamais modifiés.' },
          ],
        },
        {
          kind: 'cards',
          tone: 'contrast',
          eyebrow: 'Publication automatique',
          title: 'Un nouvel article sur le site, un nouveau post sur Google',
          items: [
            { icon: Zap, title: 'Cela se fait tout seul', body: 'Si vous l’activez, chaque article que le système publie sur votre site devient aussi un post court sur votre fiche Google Business Profile, avec l’image de l’article et un bouton En savoir plus qui y mène.' },
            { icon: ToggleLeft, title: 'Désactivé jusqu’à ce que vous l’activiez', body: 'C’est désactivé par défaut et réglé site par site. Un post automatique part sans que vous l’ayez relu, et c’est pourquoi la décision vous revient. Vous pouvez le désactiver à tout moment, et les posts déjà en ligne y restent.' },
            { icon: Repeat, title: 'Une fois par article', body: 'Le même article ne part jamais deux fois sur la fiche, même si la publication sur votre site est relancée. La fiche ne se remplit donc pas de doublons.' },
          ],
        },
        {
          kind: 'cards',
          columns: 2,
          eyebrow: 'Avis Google',
          title: 'Répondez à chaque avis, depuis un seul endroit',
          items: [
            { icon: MessageSquareText, title: 'Tous les avis sous les yeux', body: 'Les avis Google de votre établissement, avec la note moyenne, le nombre de ceux qui attendent encore une réponse, et les nouveaux signalés. Vous pouvez trier par note.' },
            { icon: Sparkles, title: 'Un brouillon de réponse en un clic', body: 'Vous recevez une réponse suggérée, polie et précise, dans la langue où le client a écrit. Vous la modifiez et l’envoyez, et elle apparaît sur Google sous l’avis.' },
            { icon: PenLine, title: 'Modifier ou supprimer', body: 'Vous pouvez modifier une réponse déjà publiée, ou la supprimer. L’avis lui-même reste tel quel.' },
            { icon: Lock, title: 'Les avis ne sont pas conservés chez nous', body: 'Les avis sont lus depuis Google chaque fois que vous ouvrez l’écran et ne sont pas stockés dans le système. Le nom du client n’est pas envoyé pour rédiger le brouillon ; ajoutez-le vous-même si vous voulez l’appeler par son nom.' },
          ],
        },
        {
          kind: 'callout',
          icon: Info,
          title: 'Bon à savoir',
          body: (
            <>
              <p>
                Google examine chaque post avant de l’afficher et en refuse parfois un. La liste des posts montre où en
                est chacun d’eux, y compris un post refusé. Pour vous connecter, il faut un compte Google propriétaire
                ou gestionnaire de la fiche Google Business Profile.
              </p>
              <p>
                Go Top SEO n’est pas affilié à Google. Les posts et les réponses aux avis aident les clients à voir une
                entreprise active, mais il n’y a aucune promesse de position sur Google Maps ni dans la recherche.
              </p>
            </>
          ),
        },
        {
          kind: 'faq',
          eyebrow: 'Questions fréquentes',
          title: 'Ce que l’on demande sur les posts Google Maps',
          items: [
            { q: 'L’application peut-elle modifier mes horaires ou mon adresse ?', a: 'Non. Nous publions uniquement des posts et des réponses aux avis. Les horaires, l’adresse, le numéro de téléphone et les autres informations de la fiche restent exactement tels quels.' },
            { q: 'Le brouillon se publie-t-il tout seul ?', a: 'Quand vous écrivez un post, non : le brouillon s’affiche à l’écran et n’est publié que lorsque vous appuyez sur le bouton. Les posts sur de nouveaux articles ne partent seuls que si vous avez activé la publication automatique.' },
            { q: 'Puis-je programmer des posts à l’avance ?', a: 'Oui, à la date et à l’heure que vous choisissez, jusqu’à un an à l’avance. Un post programmé peut être annulé tant qu’il n’est pas parti.' },
            { q: 'Cela fonctionne-t-il pour une boutique Shopify ou un site qui n’est pas sous WordPress ?', a: 'Oui. Le post part sur votre fiche Google Business Profile, pas sur votre site, donc cela fonctionne pour tous les projets, sur n’importe quelle plateforme.' },
            { q: 'Que se passe-t-il si je me déconnecte ?', a: 'Les posts programmés ne seront pas publiés tant que vous ne vous reconnectez pas. Ceux déjà publiés restent sur Google.' },
            { q: 'Je gère plusieurs établissements sur Google. Est-ce un problème ?', a: 'Non. L’application affiche tous les établissements que le compte gère, et pour chaque site du système vous choisissez celui sur lequel ses posts partent.' },
          ],
        },
      ],
      cta: { title: 'Montrez à vos clients ce qui est nouveau chez vous', body: fr.closeBody, primary: fr.trial, secondary: fr.check },
    },
    it: {
      hero: {
        eyebrow: 'Post Google Maps',
        eyebrowIcon: MapPinned,
        title: 'Il profilo Google Business Profile',
        accent: 'aggiornato anche quando il tempo manca',
        subtitle: 'Chi trova l’attività su Google Maps vede che cosa c’è di nuovo: un’offerta, un nuovo servizio, un articolo appena uscito. Dall’applicazione si scrive un post con foto e pulsante, si riceve una prima bozza, si corregge e si pubblica subito o all’ora scelta. E nello stesso posto si risponde alle recensioni.',
        trust: it.trust,
        primary: it.trial,
        secondary: it.check,
        visual: (
          <MapsPostVisual
            business="Palestra di Via Roma"
            kind="Novità · giovedì 10:00"
            text="Apriamo un nuovo corso collettivo del mattino per gli over 50, il lunedì e il mercoledì alle 7:00. Un istruttore dedicato, un gruppo piccolo e una lezione di prova gratuita, senza impegno."
            button="Prenota"
            queueHeading="I suoi post"
            queue={[
              { title: 'Corso del mattino per gli over 50', detail: 'Programmato per giovedì 10:00', status: 'Programmato', done: false },
              { title: 'Guida: come scegliere le scarpe da running', detail: 'Da un nuovo articolo del sito', status: 'Online', auto: true, done: true },
            ]}
            review={{
              heading: 'Nuova recensione',
              author: 'Dana K.',
              stars: 5,
              starsLabel: '5 stelle su 5',
              text: 'Locale pulito, istruttori pazienti e bella atmosfera. Ci vengo da sei mesi.',
              replyLabel: 'Bozza di risposta',
              reply: 'Grazie di cuore per queste parole! Siamo felici che si trovi bene da noi, a presto per la prossima lezione.',
            }}
          />
        ),
      },
      sections: [
        {
          kind: 'steps',
          eyebrow: 'Come funziona',
          title: 'Dal collegamento al post online',
          items: [
            { title: 'Un solo collegamento', body: 'Si accede con l’account Google che gestisce il profilo Google Business Profile e si conferma nella schermata di Google. L’autorizzazione copre soltanto la gestione del profilo ed è distinta da Search Console. Si può scollegare in qualsiasi momento.' },
            { title: 'Scelta della sede', body: 'L’applicazione elenca le sedi gestite su Google e si sceglie quella su cui verranno pubblicati i post di questo sito.' },
            { title: 'Scrittura, o partenza da una bozza', body: 'Si parte da un articolo che il sistema ha scritto per il sito, da un argomento inserito a mano o da una pagina bianca. Si ottiene una prima bozza entro il limite di lunghezza di Google e si modifica a piacere.' },
            { title: 'Pubblicazione o programmazione', body: 'Subito, oppure alla data e all’ora scelte, fino a un anno prima. L’elenco dei post mostra che cosa è online, che cosa è programmato e che cosa Google sta ancora esaminando.' },
          ],
        },
        {
          kind: 'cards',
          eyebrow: 'In ogni post',
          title: 'Un post dall’aspetto curato',
          items: [
            { icon: Crop, title: 'La foto nella misura giusta', body: 'Si carica una foto e si ritaglia in 4:3, come la mostra Google, con zoom e posizione. Un post scritto a partire da un articolo può riprenderne l’immagine con un clic.' },
            { icon: ImagePlus, title: 'Un’immagine pronta per un post da argomento', body: 'Quando si scrive un post a partire da un argomento inserito a mano, si può chiedere all’applicazione di creare un’immagine illustrativa con l’IA. È un’immagine generica, non una foto dell’azienda, del team o dei prodotti, ed entra nel post solo se viene scelta.' },
            { icon: MousePointerClick, title: 'Un pulsante che porta a un’azione', body: 'Scopri di più, Prenota, Ordina online, Acquista, Iscriviti o Chiama. Il pulsante porta a una pagina del sito oppure, se autorizzato, a un altro sito come uno strumento di prenotazione. Chiama compone il numero del profilo.' },
            { icon: Eye, title: 'Si vede prima di pubblicare', body: 'Accanto all’editor, un’anteprima del post: il nome della sede, la foto, il testo e il pulsante, per evitare qualsiasi sorpresa.' },
            { icon: Type, title: 'Nelle regole di Google', body: 'Un contatore di caratteri fino a 1.500, il limite di Google. Se il testo contiene un numero di telefono compare un avviso, perché Google limita i numeri nei post, e per le chiamate c’è il pulsante Chiama.' },
            { icon: Languages, title: 'Nella lingua dei clienti', body: 'La bozza viene scritta nella lingua del progetto, in ognuna delle lingue che l’applicazione supporta, e ogni parola si può cambiare prima di pubblicare.' },
            { icon: ShieldCheck, title: 'Solo ciò che è stato approvato', body: 'Partono solo i post e le risposte approvati, più i post automatici se sono stati attivati. Gli orari, l’indirizzo e le altre informazioni della sede non vengono mai modificati.' },
          ],
        },
        {
          kind: 'cards',
          tone: 'contrast',
          eyebrow: 'Pubblicazione automatica',
          title: 'Un nuovo articolo sul sito, un nuovo post su Google',
          items: [
            { icon: Zap, title: 'Avviene da sé', body: 'Se la si attiva, ogni articolo che il sistema pubblica sul sito diventa anche un post breve sul profilo Google Business Profile, con l’immagine dell’articolo e un pulsante Scopri di più che vi porta.' },
            { icon: ToggleLeft, title: 'Disattivata finché non viene attivata', body: 'È disattivata per impostazione predefinita e si regola sito per sito. Un post automatico parte senza essere stato riletto, e per questo la decisione resta al cliente. Si può disattivare in qualsiasi momento, e i post già online restano.' },
            { icon: Repeat, title: 'Una volta per articolo', body: 'Lo stesso articolo non parte mai due volte sul profilo, anche se la pubblicazione sul sito viene ripetuta. Il profilo non si riempie quindi di duplicati.' },
          ],
        },
        {
          kind: 'cards',
          columns: 2,
          eyebrow: 'Recensioni Google',
          title: 'Rispondere a ogni recensione da un solo posto',
          items: [
            { icon: MessageSquareText, title: 'Tutte le recensioni sotto gli occhi', body: 'Le recensioni Google della sede, con il voto medio, il numero di quelle che attendono ancora una risposta e le nuove segnalate. Si può ordinare per voto.' },
            { icon: Sparkles, title: 'Una bozza di risposta con un clic', body: 'Si riceve una risposta suggerita, cortese e precisa, nella lingua in cui il cliente ha scritto. Si modifica e si invia, e compare su Google sotto la recensione.' },
            { icon: PenLine, title: 'Modificare o eliminare', body: 'Una risposta già pubblicata si può modificare o eliminare. La recensione in sé resta come è.' },
            { icon: Lock, title: 'Le recensioni non restano da noi', body: 'Le recensioni vengono lette da Google ogni volta che si apre la schermata e non sono conservate nel sistema. Il nome del cliente non viene inviato per scrivere la bozza; si può aggiungere a mano per rivolgersi al cliente per nome.' },
          ],
        },
        {
          kind: 'callout',
          icon: Info,
          title: 'Buono a sapersi',
          body: (
            <>
              <p>
                Google esamina ogni post prima di mostrarlo e a volte ne rifiuta uno. L’elenco dei post mostra a che
                punto è ciascuno, compreso un post rifiutato. Per collegarsi serve un account Google proprietario o
                gestore del profilo Google Business Profile.
              </p>
              <p>
                Go Top SEO non è affiliata a Google. I post e le risposte alle recensioni aiutano i clienti a vedere
                un’azienda attiva, ma non c’è alcuna promessa di posizione su Google Maps né nella ricerca.
              </p>
            </>
          ),
        },
        {
          kind: 'faq',
          eyebrow: 'Domande frequenti',
          title: 'Che cosa si chiede sui post Google Maps',
          items: [
            { q: 'L’applicazione può modificare gli orari o l’indirizzo?', a: 'No. Pubblichiamo soltanto post e risposte alle recensioni. Gli orari, l’indirizzo, il numero di telefono e le altre informazioni del profilo restano esattamente come sono.' },
            { q: 'La bozza si pubblica da sé?', a: 'Quando si scrive un post, no: la bozza compare sullo schermo e viene pubblicata solo premendo il pulsante. I post sui nuovi articoli partono da soli solo se la pubblicazione automatica è stata attivata.' },
            { q: 'Si possono programmare post in anticipo?', a: 'Sì, alla data e all’ora scelte, fino a un anno prima. Un post programmato può essere annullato finché non è partito.' },
            { q: 'Funziona per un negozio Shopify o per un sito che non è su WordPress?', a: 'Sì. Il post parte sul profilo Google Business Profile, non sul sito, quindi funziona per tutti i progetti, su qualsiasi piattaforma.' },
            { q: 'Che cosa succede scollegando l’account?', a: 'I post programmati non verranno pubblicati fino a un nuovo collegamento. Quelli già pubblicati restano su Google.' },
            { q: 'Gestisco più sedi su Google. È un problema?', a: 'No. L’applicazione mostra tutte le sedi gestite dall’account e, per ogni sito del sistema, si sceglie quella su cui partono i suoi post.' },
          ],
        },
      ],
      cta: { title: 'Mostri ai suoi clienti che cosa c’è di nuovo', body: it.closeBody, primary: it.trial, secondary: it.check },
    },
    // JAPANESE. The sample business, the review author and the class times are
    // Japanese, because a Via Roma gym in a Japanese screenshot reads as a
    // translation left half-finished. The two honest limits are kept word for
    // word: the AI image is generic and never a photo of the business, and
    // there is no promise of a position on Maps or in search — in Japanese that
    // second one is also what 景品表示法 requires of a performance claim.
    nl: {
      hero: {
        eyebrow: 'Berichten in uw Google Bedrijfsprofiel',
        eyebrowIcon: MapPinned,
        title: 'Uw Google Bedrijfsprofiel',
        accent: 'blijft actueel, ook als u geen tijd hebt',
        subtitle: 'Wie u in Google Maps vindt, ziet wat er bij u nieuw is: een aanbieding, een nieuwe dienst, een artikel dat net online is gegaan. Schrijf in de app een bericht met foto en knop, krijg een eerste versie, pas die aan en publiceer direct of op een moment van uw keuze. Op uw reviews antwoordt u op dezelfde plek.',
        trust: nl.trust,
        primary: nl.trial,
        secondary: nl.check,
        visual: (
          <MapsPostVisual
            business="Fitness aan het Plein"
            kind="Nieuws · donderdag 10:00"
            text="Wij zijn een nieuwe ochtendgroep vanaf 50 gestart, maandag en woensdag om 7:00. Met persoonlijke begeleiding, een kleine groep en een gratis proefles, zonder verplichting."
            button="Afspraak maken"
            queueHeading="Uw berichten"
            queue={[
              { title: 'Ochtendgroep vanaf 50', detail: 'Gepland voor donderdag 10:00', status: 'Gepland', done: false },
              { title: 'Gids: hardloopschoenen kiezen', detail: 'Uit een nieuw artikel op de website', status: 'Online', auto: true, done: true },
            ]}
            review={{
              heading: 'Nieuwe review',
              author: 'Dana K.',
              stars: 5,
              starsLabel: '5 van de 5 sterren',
              text: 'Schone zaak, geduldige trainers en een goede sfeer. Ik kom er al een half jaar.',
              replyLabel: 'Concept-antwoord',
              reply: 'Hartelijk dank voor de vriendelijke woorden! Wij zijn blij dat u het bij ons naar uw zin hebt — tot de volgende les.',
            }}
          />
        ),
      },
      sections: [
        {
          kind: 'steps',
          eyebrow: 'Zo gaat het',
          title: 'Van verbinden tot een gepubliceerd bericht',
          items: [
            { title: 'Eén keer verbinden', body: 'Meld u aan met het Google-account dat uw Bedrijfsprofiel beheert, en keur het goed op het scherm van Google. De machtiging dekt alleen het beheer van het profiel en staat los van Search Console. U kunt de verbinding wanneer u wilt verbreken.' },
            { title: 'Bedrijf kiezen', body: 'De app toont de bedrijven die u bij Google beheert, en u kiest naar welk bedrijf de berichten van deze website gaan.' },
            { title: 'Schrijven, of een concept krijgen', body: 'Begin met een artikel dat het systeem voor uw website geschreven heeft, met een onderwerp dat u invoert, of met een leeg blad. U krijgt een eerste versie binnen de lengtegrens van Google en past die naar wens aan.' },
            { title: 'Publiceren of plannen', body: 'Direct of op een datum en tijd van uw keuze, tot een jaar vooruit. De lijst met berichten laat zien wat online staat, wat gepland is en wat Google nog controleert.' },
          ],
        },
        {
          kind: 'cards',
          eyebrow: 'In elk bericht',
          title: 'Een bericht dat er goed uitziet',
          items: [
            { icon: Crop, title: 'Het juiste beeldformaat', body: 'Upload een foto en snijd die bij op 4:3, zoals Google hem toont, met zoom en positie. Een bericht dat uit een artikel ontstaat, kan de afbeelding daarvan met één klik overnemen.' },
            { icon: ImagePlus, title: 'Een kant-en-klare afbeelding voor een themabericht', body: 'Schrijft u een bericht op grond van een ingevoerd onderwerp, dan kan de app met AI een illustratieve afbeelding maken. Het is een algemene afbeelding, geen foto van uw bedrijf, uw team of uw producten, en zij komt alleen in het bericht als u haar kiest.' },
            { icon: MousePointerClick, title: 'Een knop die ergens naartoe leidt', body: 'Meer informatie, Afspraak maken, Online bestellen, Kopen, Aanmelden of Nu bellen. De knop leidt naar een pagina van uw website of, als u dat toestaat, naar een andere website zoals een reserveringssysteem. «Nu bellen» draait het nummer in uw profiel.' },
            { icon: Eye, title: 'Vooraf bekijken', body: 'Naast de editor ligt een voorbeeld van het bericht: bedrijfsnaam, foto, tekst en knop, zodat niets u verrast.' },
            { icon: Type, title: 'Binnen de regels van Google', body: 'Een tekenteller tot 1.500, de grens van Google. Staat er een telefoonnummer in de tekst, dan krijgt u een melding, omdat Google telefoonnummers in berichten beperkt — voor bellen is er de knop «Nu bellen».' },
            { icon: Languages, title: 'In de taal van uw klanten', body: 'Het concept wordt geschreven in de taal van uw project, in elke taal die de app ondersteunt, en u kunt voor de publicatie elk woord wijzigen.' },
            { icon: ShieldCheck, title: 'Alleen wat u hebt goedgekeurd', body: 'Er gaan alleen berichten en antwoorden uit die u hebt goedgekeurd, plus automatische berichten als u die hebt aangezet. Openingstijden, adres en de overige bedrijfsgegevens worden nooit gewijzigd.' },
          ],
        },
        {
          kind: 'cards',
          tone: 'contrast',
          eyebrow: 'Automatische berichten',
          title: 'Een nieuw artikel op uw website, een nieuw bericht bij Google',
          items: [
            { icon: Zap, title: 'Het gebeurt van zelf', body: 'Zet u het aan, dan wordt van elk artikel dat het systeem op uw website publiceert ook een kort bericht in uw Bedrijfsprofiel, met de afbeelding van het artikel en een knop «Meer informatie» die daarheen leidt.' },
            { icon: ToggleLeft, title: 'Uit, totdat u het aanzet', body: 'Standaard uit en per website in te stellen. Een automatisch bericht gaat uit zonder dat u het vooraf leest — daarom is dat uw beslissing. U kunt het wanneer u wilt uitzetten, en al gepubliceerde berichten blijven staan.' },
            { icon: Repeat, title: 'Eén keer per artikel', body: 'Hetzelfde artikel gaat nooit twee keer naar het profiel, ook niet als de publicatie op uw website herhaald wordt. Zo vult het profiel zich niet met dubbele berichten.' },
          ],
        },
        {
          kind: 'cards',
          columns: 2,
          eyebrow: 'Google-reviews',
          title: 'Op elke review antwoorden, vanaf één plek',
          items: [
            { icon: MessageSquareText, title: 'Elke review in beeld', body: 'De Google-reviews van uw bedrijf, met het gemiddelde cijfer, hoeveel er nog op een antwoord wachten, en nieuwe reviews gemarkeerd. U kunt op cijfer sorteren.' },
            { icon: Sparkles, title: 'Een concept-antwoord met één klik', body: 'U krijgt een voorstel voor een antwoord, hoffelijk en to the point, in de taal waarin de klant geschreven heeft. U past het aan en verstuurt het, en het antwoord verschijnt bij Google onder de review.' },
            { icon: PenLine, title: 'Aanpassen of verwijderen', body: 'U kunt een al gepubliceerd antwoord aanpassen of verwijderen. De review zelf blijft zoals hij is.' },
            { icon: Lock, title: 'Reviews worden bij ons niet opgeslagen', body: 'Reviews worden bij elke keer dat u het overzicht opent van Google gelezen en niet in het systeem opgeslagen. De naam van de klant wordt niet meegestuurd om het concept te maken; voeg hem zelf toe als u iemand bij naam wilt aanspreken.' },
          ],
        },
        {
          kind: 'callout',
          icon: Info,
          title: 'Goed om te weten',
          body: (
            <>
              <p>
                Google controleert elk bericht voordat het getoond wordt, en wijst er soms een af. De lijst met
                berichten laat zien waar elk bericht staat, ook een afgewezen bericht. Om te verbinden hebt u een
                Google-account nodig dat het Bedrijfsprofiel bezit of beheert.
              </p>
              <p>
                Go Top SEO staat in geen enkel verband met Google. Berichten en antwoorden op reviews helpen klanten
                een actief bedrijf te zien, maar er is geen belofte over posities in Google Maps of in de
                Google-zoekresultaten.
              </p>
            </>
          ),
        },
        {
          kind: 'faq',
          eyebrow: 'Veelgestelde vragen',
          title: 'Wat er over berichten in het Bedrijfsprofiel gevraagd wordt',
          items: [
            { q: 'Kan de app mijn openingstijden of mijn adres wijzigen?', a: 'Nee. Wij publiceren uitsluitend berichten en antwoorden op reviews. Openingstijden, adres, telefoonnummer en de overige profielgegevens blijven precies zoals ze zijn.' },
            { q: 'Publiceert het concept zich van zelf?', a: 'Schrijft u een bericht, dan niet: het concept verschijnt op het scherm en wordt pas gepubliceerd als u op de knop drukt. Berichten over nieuwe artikelen gaan alleen van zelf uit als u de automatische berichten hebt aangezet.' },
            { q: 'Kan ik berichten vooruit plannen?', a: 'Ja, op een datum en tijd van uw keuze, tot een jaar vooruit. Een gepland bericht is te annuleren zolang het niet is uitgegaan.' },
            { q: 'Werkt dit voor een Shopify-webshop of een website die niet op WordPress draait?', a: 'Ja. Het bericht gaat naar uw Bedrijfsprofiel bij Google, niet naar uw website, dus het werkt voor elk project op elk platform.' },
            { q: 'Wat gebeurt er als ik de verbinding verbreek?', a: 'Geplande berichten worden niet gepubliceerd totdat u opnieuw verbindt. Al gepubliceerde berichten blijven bij Google staan.' },
            { q: 'Ik beheer meerdere bedrijven bij Google. Is dat een probleem?', a: 'Nee. De app toont elk bedrijf dat het account beheert, en voor elke website in het systeem kiest u het bedrijf waar haar berichten naartoe gaan.' },
          ],
        },
      ],
      cta: { title: 'Laat klanten zien wat er bij u nieuw is', body: nl.closeBody, primary: nl.trial, secondary: nl.check },
    },
    de: {
      hero: {
        eyebrow: 'Beiträge im Google Unternehmensprofil',
        eyebrowIcon: MapPinned,
        title: 'Ihr Google Unternehmensprofil',
        accent: 'bleibt aktuell, auch wenn Sie keine Zeit haben',
        subtitle: 'Wer Sie in Google Maps findet, sieht, was bei Ihnen neu ist: ein Angebot, eine neue Leistung, ein Artikel, der gerade online ging. Schreiben Sie in der App einen Beitrag mit Foto und Button, bekommen Sie einen ersten Entwurf, bearbeiten ihn und veröffentlichen sofort oder zu einem Zeitpunkt Ihrer Wahl. Auf Ihre Bewertungen antworten Sie an derselben Stelle.',
        trust: de.trust,
        primary: de.trial,
        secondary: de.check,
        visual: (
          <MapsPostVisual
            business="Fitness am Hauptplatz"
            kind="Neuigkeit · Donnerstag 10:00"
            text="Wir haben eine neue Morgengruppe ab 50 eröffnet, montags und mittwochs um 7:00. Mit persönlicher Betreuung, kleiner Gruppe und einer kostenlosen Probestunde, ohne Verpflichtung."
            button="Termin buchen"
            queueHeading="Ihre Beiträge"
            queue={[
              { title: 'Morgengruppe ab 50', detail: 'Geplant für Donnerstag 10:00', status: 'Geplant', done: false },
              { title: 'Ratgeber: Laufschuhe auswählen', detail: 'Aus einem neuen Artikel auf der Website', status: 'Online', auto: true, done: true },
            ]}
            review={{
              heading: 'Neue Bewertung',
              author: 'Dana K.',
              stars: 5,
              starsLabel: '5 von 5 Sternen',
              text: 'Sauberer Ort, geduldige Trainer und eine gute Stimmung. Ich komme seit einem halben Jahr.',
              replyLabel: 'Antwortentwurf',
              reply: 'Vielen Dank für die freundlichen Worte! Wir freuen uns, dass es Ihnen bei uns gefällt — bis zur nächsten Stunde.',
            }}
          />
        ),
      },
      sections: [
        {
          kind: 'steps',
          eyebrow: 'So läuft es',
          title: 'Vom Verbinden zum veröffentlichten Beitrag',
          items: [
            { title: 'Einmal verbinden', body: 'Melden Sie sich mit dem Google-Konto an, das Ihr Unternehmensprofil verwaltet, und geben Sie es auf Googles Bildschirm frei. Die Berechtigung deckt nur die Verwaltung des Profils ab und ist von der Search Console getrennt. Sie können die Verbindung jederzeit trennen.' },
            { title: 'Unternehmen auswählen', body: 'Die App listet die Unternehmen auf, die Sie bei Google verwalten, und Sie wählen, zu welchem die Beiträge dieser Website gehen.' },
            { title: 'Schreiben, oder einen Entwurf bekommen', body: 'Beginnen Sie mit einem Artikel, den das System für Ihre Website geschrieben hat, mit einem Thema, das Sie eingeben, oder mit einer leeren Seite. Sie erhalten einen ersten Entwurf innerhalb der Längenbegrenzung von Google und bearbeiten ihn nach Belieben.' },
            { title: 'Veröffentlichen oder planen', body: 'Sofort oder zu einem Datum und einer Uhrzeit Ihrer Wahl, bis zu ein Jahr im Voraus. Die Liste der Beiträge zeigt, was online ist, was geplant ist und was Google noch prüft.' },
          ],
        },
        {
          kind: 'cards',
          eyebrow: 'In jedem Beitrag',
          title: 'Ein Beitrag, der richtig aussieht',
          items: [
            { icon: Crop, title: 'Das richtige Bildformat', body: 'Laden Sie ein Foto hoch und schneiden Sie es auf 4:3 zu, so wie Google es zeigt, mit Zoom und Position. Ein Beitrag, der aus einem Artikel entsteht, kann dessen Bild mit einem Klick übernehmen.' },
            { icon: ImagePlus, title: 'Ein fertiges Bild für einen Themenbeitrag', body: 'Wenn Sie einen Beitrag aus einem eingegebenen Thema schreiben, kann die App ein illustrierendes Bild mit KI erzeugen. Es ist ein allgemeines Bild, kein Foto Ihres Unternehmens, Ihres Teams oder Ihrer Produkte, und es kommt nur in den Beitrag, wenn Sie es auswählen.' },
            { icon: MousePointerClick, title: 'Ein Button, der irgendwohin führt', body: 'Mehr erfahren, Termin buchen, Online bestellen, Kaufen, Anmelden oder Jetzt anrufen. Der Button führt auf eine Seite Ihrer Website oder, wenn Sie das erlauben, auf eine andere Website wie ein Buchungssystem. «Jetzt anrufen» wählt die Nummer in Ihrem Profil.' },
            { icon: Eye, title: 'Vorher ansehen', body: 'Neben dem Editor liegt eine Vorschau des Beitrags: Unternehmensname, Foto, Text und Button, damit nichts überrascht.' },
            { icon: Type, title: 'Innerhalb der Regeln von Google', body: 'Ein Zeichenzähler bis 1.500, der Grenze von Google. Steht eine Telefonnummer im Text, erhalten Sie einen Hinweis, weil Google Telefonnummern in Beiträgen einschränkt — für Anrufe gibt es den Button «Jetzt anrufen».' },
            { icon: Languages, title: 'In der Sprache Ihrer Kunden', body: 'Der Entwurf wird in der Sprache Ihres Projekts geschrieben, in jeder von der App unterstützten Sprache, und Sie können vor der Veröffentlichung jedes Wort ändern.' },
            { icon: ShieldCheck, title: 'Nur, was Sie freigegeben haben', body: 'Es gehen nur Beiträge und Antworten hinaus, die Sie freigegeben haben, plus automatische Beiträge, wenn Sie diese eingeschaltet haben. Öffnungszeiten, Adresse und die übrigen Unternehmensdaten werden nie verändert.' },
          ],
        },
        {
          kind: 'cards',
          tone: 'contrast',
          eyebrow: 'Automatische Beiträge',
          title: 'Ein neuer Artikel auf Ihrer Website, ein neuer Beitrag bei Google',
          items: [
            { icon: Zap, title: 'Es passiert von selbst', body: 'Wenn Sie es einschalten, wird aus jedem Artikel, den das System auf Ihrer Website veröffentlicht, auch ein kurzer Beitrag in Ihrem Unternehmensprofil, mit dem Bild des Artikels und einem Button «Mehr erfahren», der dorthin führt.' },
            { icon: ToggleLeft, title: 'Aus, bis Sie es einschalten', body: 'Standardmäßig aus und je Website einstellbar. Ein automatischer Beitrag geht hinaus, ohne dass Sie ihn vorher lesen — darum ist das Ihre Entscheidung. Sie können es jederzeit ausschalten, und bereits veröffentlichte Beiträge bleiben stehen.' },
            { icon: Repeat, title: 'Einmal je Artikel', body: 'Derselbe Artikel geht nie zweimal in das Profil, auch wenn die Veröffentlichung auf Ihrer Website wiederholt wird. So füllt sich das Profil nicht mit doppelten Beiträgen.' },
          ],
        },
        {
          kind: 'cards',
          columns: 2,
          eyebrow: 'Google-Bewertungen',
          title: 'Auf jede Bewertung antworten, von einer Stelle aus',
          items: [
            { icon: MessageSquareText, title: 'Jede Bewertung im Blick', body: 'Die Google-Bewertungen Ihres Unternehmens, mit der Durchschnittsbewertung, wie viele noch auf eine Antwort warten, und neue markiert. Sie können nach Bewertung sortieren.' },
            { icon: Sparkles, title: 'Ein Antwortentwurf mit einem Klick', body: 'Sie erhalten einen Antwortvorschlag, höflich und auf den Punkt, in der Sprache, in der die Kundin oder der Kunde geschrieben hat. Sie bearbeiten ihn und senden ihn ab, und die Antwort erscheint bei Google unter der Bewertung.' },
            { icon: PenLine, title: 'Bearbeiten oder löschen', body: 'Sie können eine bereits veröffentlichte Antwort bearbeiten oder löschen. Die Bewertung selbst bleibt, wie sie ist.' },
            { icon: Lock, title: 'Bewertungen werden bei uns nicht gespeichert', body: 'Bewertungen werden bei jedem Öffnen der Ansicht von Google gelesen und nicht im System gespeichert. Der Name der Kundin oder des Kunden wird nicht zum Erstellen des Entwurfs übermittelt; fügen Sie ihn selbst ein, wenn Sie namentlich ansprechen möchten.' },
          ],
        },
        {
          kind: 'callout',
          icon: Info,
          title: 'Gut zu wissen',
          body: (
            <>
              <p>
                Google prüft jeden Beitrag, bevor er gezeigt wird, und lehnt gelegentlich einen ab. Die Liste der
                Beiträge zeigt, wo jeder einzelne steht, auch ein abgelehnter. Zum Verbinden brauchen Sie ein
                Google-Konto, das das Unternehmensprofil besitzt oder verwaltet.
              </p>
              <p>
                Go Top SEO steht in keiner Verbindung zu Google. Beiträge und Antworten auf Bewertungen helfen
                Kunden, ein aktives Unternehmen zu sehen, aber es gibt kein Ranking-Versprechen für Google Maps oder
                die Google-Suche.
              </p>
            </>
          ),
        },
        {
          kind: 'faq',
          eyebrow: 'Häufige Fragen',
          title: 'Was zu Beiträgen im Unternehmensprofil gefragt wird',
          items: [
            { q: 'Kann die App meine Öffnungszeiten oder meine Adresse ändern?', a: 'Nein. Wir veröffentlichen ausschließlich Beiträge und Antworten auf Bewertungen. Öffnungszeiten, Adresse, Telefonnummer und die übrigen Profildaten bleiben genau so, wie sie sind.' },
            { q: 'Veröffentlicht sich der Entwurf von selbst?', a: 'Wenn Sie einen Beitrag schreiben, nein: der Entwurf erscheint auf dem Bildschirm und wird erst veröffentlicht, wenn Sie den Button drücken. Beiträge über neue Artikel gehen nur dann von selbst hinaus, wenn Sie die automatischen Beiträge eingeschaltet haben.' },
            { q: 'Kann ich Beiträge im Voraus planen?', a: 'Ja, auf ein Datum und eine Uhrzeit Ihrer Wahl, bis zu ein Jahr im Voraus. Ein geplanter Beitrag lässt sich abbrechen, solange er nicht hinausgegangen ist.' },
            { q: 'Funktioniert das für einen Shopify-Shop oder eine Website, die nicht auf WordPress läuft?', a: 'Ja. Der Beitrag geht in Ihr Unternehmensprofil bei Google, nicht auf Ihre Website, daher funktioniert er für jedes Projekt auf jeder Plattform.' },
            { q: 'Was passiert, wenn ich die Verbindung trenne?', a: 'Geplante Beiträge werden nicht veröffentlicht, bis Sie wieder verbinden. Bereits veröffentlichte Beiträge bleiben bei Google.' },
            { q: 'Ich verwalte mehrere Unternehmen bei Google. Ist das ein Problem?', a: 'Nein. Die App zeigt jedes Unternehmen, das das Konto verwaltet, und für jede Website im System wählen Sie das Unternehmen, zu dem ihre Beiträge gehen.' },
          ],
        },
      ],
      cta: { title: 'Lassen Sie Kunden sehen, was bei Ihnen neu ist', body: de.closeBody, primary: de.trial, secondary: de.check },
    },
    ja: {
      hero: {
        eyebrow: 'Googleマップの投稿',
        eyebrowIcon: MapPinned,
        title: 'Googleビジネスプロフィールを、',
        accent: '時間がないときも最新の状態に',
        subtitle: 'Googleマップでお店を見つけた人が、今何があるかを目にします。キャンペーン、新しいサービス、公開したばかりの記事などです。アプリから写真とボタン付きの投稿を書くと、最初の下書きが届きます。手直しして、すぐに公開するか、お選びの時刻に公開します。口コミへの返信も同じ場所で行えます。',
        trust: ja.trust,
        primary: ja.trial,
        secondary: ja.check,
        visual: (
          <MapsPostVisual
            business="青山スポーツジム"
            kind="お知らせ · 木曜 10:00"
            text="50歳以上の方向けの朝のグループレッスンを新設しました。月曜と水曜の7時からです。担当トレーナーが付き、少人数で、体験レッスンは無料、継続の縛りもありません。"
            button="予約する"
            queueHeading="投稿一覧"
            queue={[
              { title: '50歳以上の方向けの朝のレッスン', detail: '木曜10:00に予約', status: '予約済み', done: false },
              { title: 'ガイド：ランニングシューズの選び方', detail: 'サイトの新しい記事から', status: '公開中', auto: true, done: true },
            ]}
            review={{
              heading: '新しい口コミ',
              author: '田中 ゆ.',
              stars: 5,
              starsLabel: '5つ星のうち5',
              text: '清潔な施設で、トレーナーの方も丁寧、雰囲気もいいです。半年通っています。',
              replyLabel: '返信の下書き',
              reply: 'うれしいお言葉をありがとうございます。気持ちよくご利用いただけているようで何よりです。次回のレッスンでお待ちしております。',
            }}
          />
        ),
      },
      sections: [
        {
          kind: 'steps',
          eyebrow: '進め方',
          title: '連携から公開まで',
          items: [
            { title: '連携は一度だけ', body: 'Googleビジネスプロフィールを管理しているGoogleアカウントでログインし、Googleの画面で承認します。権限はプロフィールの管理のみで、Search Consoleとは別です。いつでも解除できます。' },
            { title: '店舗を選ぶ', body: 'アプリがGoogleで管理中の店舗を一覧表示しますので、このサイトの投稿先となる店舗をお選びください。' },
            { title: '書く、または下書きから始める', body: 'システムがサイト向けに書いた記事から始める、ご自身で入力した題材から始める、白紙から始める、のいずれでも可能です。Googleの文字数制限の中で最初の下書きが届きますので、ご自由に手直しいただけます。' },
            { title: '公開または予約', body: 'すぐに公開するか、お選びの日時に、最大1年先まで予約できます。投稿の一覧で、公開中のもの、予約済みのもの、Googleが審査中のものがわかります。' },
          ],
        },
        {
          kind: 'cards',
          eyebrow: 'どの投稿にも',
          title: '見栄えの整った投稿',
          items: [
            { icon: Crop, title: '適切なサイズの写真', body: '写真をアップロードし、Googleの表示に合わせて4:3で切り抜きます。拡大と位置の調整もできます。記事から書いた投稿では、その記事の画像をワンクリックで使えます。' },
            { icon: ImagePlus, title: '題材から書く投稿用の画像', body: 'ご自身で入力した題材から投稿を書くとき、AIでイメージ画像を作成するようアプリに指示できます。これは一般的な画像で、その事業、従業員、商品の写真ではありません。お選びになった場合にのみ投稿に入ります。' },
            { icon: MousePointerClick, title: '行動につながるボタン', body: '詳細、予約、オンライン注文、購入、登録、電話のいずれかです。ボタンはサイトのページに移動しますし、許可すれば予約システムなど別のサイトにも移動できます。「電話」はプロフィールに登録された番号に発信します。' },
            { icon: Eye, title: '公開前に確認できます', body: '編集画面のとなりに投稿のプレビューがあります。店舗名、写真、本文、ボタンが表示されるので、思いがけない仕上がりになりません。' },
            { icon: Type, title: 'Googleのルールの中で', body: '文字数は1,500字まで、Googleの制限に合わせて数えます。本文に電話番号が含まれていると注意が表示されます。Googleは投稿内の電話番号を制限しており、電話には「電話」ボタンがあるためです。' },
            { icon: Languages, title: '顧客の言語で', body: '下書きはプロジェクトの言語、すなわちアプリが対応しているいずれの言語でも作成され、公開前にどの語句も変更できます。' },
            { icon: ShieldCheck, title: 'ご承認いただいたものだけ', body: 'ご承認いただいた投稿と返信、そして自動投稿を有効にした場合の自動投稿だけが公開されます。営業時間、住所、そのほかの店舗情報は一切変更されません。' },
          ],
        },
        {
          kind: 'cards',
          tone: 'contrast',
          eyebrow: '自動投稿',
          title: 'サイトに新しい記事が出れば、Googleにも新しい投稿',
          items: [
            { icon: Zap, title: '自動で行われます', body: '有効にすると、システムがサイトに公開した記事はすべて、Googleビジネスプロフィールの短い投稿にもなります。記事の画像と、その記事に移動する「詳細」ボタンが付きます。' },
            { icon: ToggleLeft, title: '有効にするまでは無効です', body: '初期設定では無効で、サイトごとに設定します。自動投稿はお読みいただく前に公開されるため、判断はお客様にお任せしています。いつでも無効にでき、すでに公開された投稿はそのまま残ります。' },
            { icon: Repeat, title: '1記事につき一度だけ', body: '同じ記事がプロフィールに二度公開されることはありません。サイトへの公開が再試行された場合も同じです。プロフィールが重複した投稿で埋まることはありません。' },
          ],
        },
        {
          kind: 'cards',
          columns: 2,
          eyebrow: 'Googleの口コミ',
          title: 'すべての口コミに、一つの場所から返信',
          items: [
            { icon: MessageSquareText, title: 'すべての口コミが一覧できます', body: '店舗のGoogleの口コミを、平均評価、返信待ちの件数とともに表示し、新しいものには印が付きます。評価順に並べ替えられます。' },
            { icon: Sparkles, title: 'ワンクリックで返信の下書き', body: '顧客が書いた言語で、礼儀正しく要点を押さえた返信案が届きます。手直しして送信すると、Googleの口コミの下に返信が表示されます。' },
            { icon: PenLine, title: '編集も削除も', body: '公開済みの返信は編集も削除もできます。口コミ自体はそのまま残ります。' },
            { icon: Lock, title: '口コミは当社に保存されません', body: '口コミは画面を開くたびにGoogleから読み取り、システムには保存しません。下書きの作成に顧客の名前は送信しませんので、名前で呼びかけたい場合はご自身で加えてください。' },
          ],
        },
        {
          kind: 'callout',
          icon: Info,
          title: '知っておいていただきたいこと',
          body: (
            <>
              <p>
                Googleは表示前にすべての投稿を審査し、ときに投稿を却下します。投稿の一覧では、却下されたものも含め、
                それぞれの状況がわかります。連携には、Googleビジネスプロフィールのオーナーまたは管理者である
                Googleアカウントが必要です。
              </p>
              <p>
                Go Top SEOはGoogleとは関係のない独立した事業者です。投稿や口コミへの返信は、活動している事業だと
                顧客に伝わる助けになりますが、Googleマップや検索での掲載順位をお約束するものではありません。
              </p>
            </>
          ),
        },
        {
          kind: 'faq',
          eyebrow: 'よくある質問',
          title: 'Googleマップの投稿について聞かれること',
          items: [
            { q: 'アプリが営業時間や住所を変更することはありますか', a: 'いいえ。当社が公開するのは投稿と口コミへの返信だけです。営業時間、住所、電話番号、そのほかのプロフィールの情報はそのまま残ります。' },
            { q: '下書きが自動で公開されますか', a: '投稿を書く場合は公開されません。下書きは画面に表示され、ボタンを押したときにだけ公開されます。新しい記事についての投稿が自動で公開されるのは、自動投稿を有効にした場合だけです。' },
            { q: '投稿を事前に予約できますか', a: 'はい。お選びの日時に、最大1年先まで予約できます。予約した投稿は、公開される前であれば取り消せます。' },
            { q: 'Shopifyの店舗や、WordPress以外のサイトでも動きますか', a: 'はい。投稿はサイトではなくGoogleビジネスプロフィールに公開されるため、どのプラットフォームのどのプロジェクトでも動きます。' },
            { q: '連携を解除するとどうなりますか', a: '予約した投稿は、再度連携するまで公開されません。すでに公開された投稿はGoogleに残ります。' },
            { q: 'Googleで複数の店舗を管理しています。問題はありますか', a: 'いいえ。アプリはそのアカウントが管理するすべての店舗を表示し、システム内のサイトごとに、その投稿先となる店舗をお選びいただけます。' },
          ],
        },
      ],
      cta: { title: '今あるものを顧客に見てもらう', body: ja.closeBody, primary: ja.trial, secondary: ja.check },
    },
    pl: {
      hero: {
        eyebrow: 'Wpisy w Profilu Firmy w Google',
        eyebrowIcon: MapPinned,
        title: 'Profil Firmy w Google',
        accent: 'pozostaje aktualny, nawet bez czasu',
        subtitle: 'Kto znajdzie firmę w Google Maps, widzi, co jest u Państwa nowego: ofertę, nową usługę, artykuł, który właśnie się ukazał. W aplikacji piszą Państwo wpis ze zdjęciem i przyciskiem, dostają pierwszą wersję, poprawiają ją i publikują od razu albo w wybranym momencie. Na opinie odpowiadają Państwo w tym samym miejscu.',
        trust: pl.trust,
        primary: pl.trial,
        secondary: pl.check,
        visual: (
          <MapsPostVisual
            business="Fitness na Rynku"
            kind="Nowość · czwartek 10:00"
            text="Uruchomiliśmy nową grupę poranną 50+, w poniedziałki i środy o 7:00. Z opieką trenera, w małej grupie i z bezpłatnymi zajęciami próbnymi, bez zobowiązań."
            button="Zarezerwuj termin"
            queueHeading="Państwa wpisy"
            queue={[
              { title: 'Grupa poranna 50+', detail: 'Zaplanowane na czwartek 10:00', status: 'Zaplanowane', done: false },
              { title: 'Poradnik: jak wybrać buty do biegania', detail: 'Z nowego artykułu na stronie', status: 'Opublikowane', auto: true, done: true },
            ]}
            review={{
              heading: 'Nowa opinia',
              author: 'Anna K.',
              stars: 5,
              starsLabel: '5 z 5 gwiazdek',
              text: 'Czysto, cierpliwi trenerzy i dobra atmosfera. Przychodzę już pół roku.',
              replyLabel: 'Szkic odpowiedzi',
              reply: 'Serdecznie dziękujemy za miłe słowa. Cieszymy się, że dobrze się u nas czujesz, i do zobaczenia na kolejnych zajęciach.',
            }}
          />
        ),
      },
      sections: [
        {
          kind: 'steps',
          eyebrow: 'Jak to przebiega',
          title: 'Od połączenia do opublikowanego wpisu',
          items: [
            { title: 'Jedno połączenie', body: 'Logują się Państwo kontem Google, które zarządza Profilem Firmy, i zatwierdzają zgodę na ekranie Google. Uprawnienie obejmuje wyłącznie zarządzanie profilem i jest niezależne od Search Console. Połączenie można rozwiązać w każdej chwili.' },
            { title: 'Wybór firmy', body: 'Aplikacja pokazuje firmy, którymi Państwo zarządzają w Google, i wybierają Państwo, do której firmy mają trafiać wpisy z tej strony.' },
            { title: 'Pisanie albo gotowy szkic', body: 'Można zacząć od artykułu, który system napisał dla Państwa strony, od wpisanego tematu albo od pustej kartki. Pierwsza wersja mieści się w limicie długości Google i można ją dowolnie poprawić.' },
            { title: 'Publikacja albo zaplanowanie', body: 'Od razu albo w wybranym dniu i o wybranej godzinie, nawet rok naprzód. Lista wpisów pokazuje, co jest opublikowane, co zaplanowane, a co Google jeszcze sprawdza.' },
          ],
        },
        {
          kind: 'cards',
          eyebrow: 'W każdym wpisie',
          title: 'Wpis, który dobrze wygląda',
          items: [
            { icon: Crop, title: 'Właściwy format obrazu', body: 'Wgrywają Państwo zdjęcie i przycinają je do 4:3, tak jak pokazuje je Google, z przybliżeniem i przesunięciem. Wpis powstający z artykułu może przejąć jego obraz jednym kliknięciem.' },
            { icon: ImagePlus, title: 'Gotowy obraz do wpisu tematycznego', body: 'Przy wpisie pisanym na podstawie wpisanego tematu aplikacja może wygenerować obraz ilustracyjny przez AI. Jest to obraz ogólny, a nie zdjęcie Państwa firmy, zespołu czy produktów, i trafia do wpisu tylko wtedy, gdy Państwo go wybiorą.' },
            { icon: MousePointerClick, title: 'Przycisk, który gdzieś prowadzi', body: 'Więcej informacji, Zarezerwuj termin, Zamów online, Kup, Zapisz się albo Zadzwoń teraz. Przycisk prowadzi na podstronę Państwa witryny albo, za Państwa zgodą, na inną stronę, na przykład do systemu rezerwacji. „Zadzwoń teraz” wybiera numer z profilu.' },
            { icon: Eye, title: 'Podgląd przed publikacją', body: 'Obok edytora jest podgląd wpisu: nazwa firmy, zdjęcie, tekst i przycisk, żeby nic Państwa nie zaskoczyło.' },
            { icon: Type, title: 'W granicach zasad Google', body: 'Licznik znaków do 1500, czyli do limitu Google. Jeśli w tekście pojawi się numer telefonu, dostaną Państwo ostrzeżenie, bo Google ogranicza numery telefonu we wpisach. Do dzwonienia służy przycisk „Zadzwoń teraz”.' },
            { icon: Languages, title: 'W języku Państwa klientów', body: 'Szkic jest pisany w języku projektu, w każdym języku, który aplikacja obsługuje, i przed publikacją można zmienić każde słowo.' },
            { icon: ShieldCheck, title: 'Tylko to, co Państwo zatwierdzą', body: 'Wychodzą wyłącznie wpisy i odpowiedzi zatwierdzone przez Państwa, a poza tym wpisy automatyczne, jeśli zostały włączone. Godziny otwarcia, adres i pozostałe dane firmy nigdy nie są zmieniane.' },
          ],
        },
        {
          kind: 'cards',
          tone: 'contrast',
          eyebrow: 'Wpisy automatyczne',
          title: 'Nowy artykuł na stronie, nowy wpis w Google',
          items: [
            { icon: Zap, title: 'Dzieje się samo', body: 'Po włączeniu z każdego artykułu, który system opublikuje na Państwa stronie, powstaje też krótki wpis w Profilu Firmy, z obrazem artykułu i przyciskiem „Więcej informacji”, który do niego prowadzi.' },
            { icon: ToggleLeft, title: 'Wyłączone, dopóki Państwo nie włączą', body: 'Domyślnie wyłączone i ustawiane osobno dla każdej strony. Wpis automatyczny wychodzi bez wcześniejszego przeczytania, dlatego to Państwa decyzja. Można to wyłączyć w każdej chwili, a już opublikowane wpisy zostają.' },
            { icon: Repeat, title: 'Raz na artykuł', body: 'Ten sam artykuł nigdy nie trafia do profilu dwa razy, także wtedy, gdy publikacja na stronie się powtórzy. Profil nie zapełnia się więc duplikatami.' },
          ],
        },
        {
          kind: 'cards',
          columns: 2,
          eyebrow: 'Opinie w Google',
          title: 'Odpowiedź na każdą opinię, z jednego miejsca',
          items: [
            { icon: MessageSquareText, title: 'Każda opinia pod ręką', body: 'Opinie firmy w Google, ze średnią oceną, liczbą opinii czekających na odpowiedź i oznaczeniem nowych. Można sortować według oceny.' },
            { icon: Sparkles, title: 'Szkic odpowiedzi jednym kliknięciem', body: 'Dostają Państwo propozycję odpowiedzi, uprzejmą i na temat, w języku, w którym napisał klient. Po poprawieniu i wysłaniu odpowiedź pojawia się w Google pod opinią.' },
            { icon: PenLine, title: 'Zmiana albo usunięcie', body: 'Już opublikowaną odpowiedź można zmienić albo usunąć. Sama opinia zostaje bez zmian.' },
            { icon: Lock, title: 'Opinii nie przechowujemy', body: 'Opinie są czytane z Google przy każdym otwarciu listy i nie są zapisywane w systemie. Imię klienta nie jest przekazywane do przygotowania szkicu. Jeśli chcą Państwo zwrócić się do kogoś po imieniu, prosimy dopisać je samodzielnie.' },
          ],
        },
        {
          kind: 'callout',
          icon: Info,
          title: 'Warto wiedzieć',
          body: (
            <>
              <p>
                Google sprawdza każdy wpis przed wyświetleniem i czasem go odrzuca. Lista wpisów pokazuje stan
                każdego z nich, również wpisu odrzuconego. Do połączenia potrzebne jest konto Google, które jest
                właścicielem Profilu Firmy albo nim zarządza.
              </p>
              <p>
                Go Top SEO nie jest w żaden sposób powiązany z Google. Wpisy i odpowiedzi na opinie pomagają
                klientom zobaczyć działającą firmę, ale nie są obietnicą pozycji w Google Maps ani w wynikach
                wyszukiwania Google.
              </p>
            </>
          ),
        },
        {
          kind: 'faq',
          eyebrow: 'Często zadawane pytania',
          title: 'O co pytają w sprawie wpisów w Profilu Firmy',
          items: [
            { q: 'Czy aplikacja może zmienić moje godziny otwarcia albo adres?', a: 'Nie. Publikujemy wyłącznie wpisy i odpowiedzi na opinie. Godziny otwarcia, adres, numer telefonu i pozostałe dane profilu zostają dokładnie takie, jakie są.' },
            { q: 'Czy szkic publikuje się sam?', a: 'Przy wpisie pisanym przez Państwa nie: szkic pojawia się na ekranie i zostaje opublikowany dopiero po naciśnięciu przycisku. Wpisy o nowych artykułach wychodzą same tylko wtedy, gdy włączone są wpisy automatyczne.' },
            { q: 'Czy mogę planować wpisy naprzód?', a: 'Tak, na wybrany dzień i godzinę, nawet rok naprzód. Zaplanowany wpis można anulować, dopóki nie został wysłany.' },
            { q: 'Czy to działa dla sklepu Shopify albo strony, która nie stoi na WordPressie?', a: 'Tak. Wpis trafia do Profilu Firmy w Google, a nie na Państwa stronę, więc działa dla każdego projektu na każdej platformie.' },
            { q: 'Co się stanie, jeśli rozwiążę połączenie?', a: 'Zaplanowane wpisy nie zostaną opublikowane, dopóki połączenie nie wróci. Już opublikowane wpisy zostają w Google.' },
            { q: 'Zarządzam kilkoma firmami w Google. Czy to problem?', a: 'Nie. Aplikacja pokazuje każdą firmę, którą zarządza konto, a dla każdej strony w systemie wybierają Państwo firmę, do której mają trafiać jej wpisy.' },
          ],
        },
      ],
      cta: { title: 'Proszę pokazać klientom, co jest u Państwa nowego', body: pl.closeBody, primary: pl.trial, secondary: pl.check },
    },
    ko: {
      hero: {
        eyebrow: 'Google 비즈니스 프로필 게시물',
        eyebrowIcon: MapPinned,
        title: 'Google 비즈니스 프로필을',
        accent: '바쁠 때에도 최신 상태로',
        subtitle: 'Google 지도에서 업체를 찾은 사람은 지금 무엇이 새로운지 봅니다. 진행 중인 할인, 새로 시작한 서비스, 방금 올라간 아티클 같은 것들입니다. 애플리케이션에서 사진과 버튼이 있는 게시물을 쓰시면 첫 초안이 나오고, 고치신 다음 바로 또는 원하시는 시각에 게시하실 수 있습니다. 리뷰 답글도 같은 자리에서 쓰십니다.',
        trust: ko.trust,
        primary: ko.trial,
        secondary: ko.check,
        visual: (
          <MapsPostVisual
            business="성수동 피트니스"
            kind="소식 · 목요일 10:00"
            text="월·수 오전 7시, 50세 이상 아침 그룹 수업을 새로 시작했습니다. 전담 코치가 함께하는 소규모 그룹이고, 체험 수업은 약정 없이 무료입니다."
            button="예약하기"
            queueHeading="고객님의 게시물"
            queue={[
              { title: '50세 이상 아침 그룹 수업', detail: '목요일 10:00 예약됨', status: '예약됨', done: false },
              { title: '가이드: 러닝화 고르는 법', detail: '사이트의 새 아티클에서', status: '게시됨', auto: true, done: true },
            ]}
            review={{
              heading: '새 리뷰',
              author: '김다은',
              stars: 5,
              starsLabel: '별 5개 중 5개',
              text: '시설이 깨끗하고 트레이너분들이 차분히 봐주셔서 분위기가 좋습니다. 반년째 다니고 있어요.',
              replyLabel: '답글 초안',
              reply: '좋은 말씀 남겨 주셔서 정말 감사합니다. 편하게 운동하고 계셔서 기쁩니다. 다음 수업에서 뵙겠습니다.',
            }}
          />
        ),
      },
      sections: [
        {
          kind: 'steps',
          eyebrow: '진행 방식',
          title: '연결부터 게시까지',
          items: [
            { title: '한 번만 연결', body: '비즈니스 프로필을 관리하는 Google 계정으로 로그인하신 뒤 Google 화면에서 동의하십니다. 권한은 프로필 관리에만 쓰이며 Search Console과는 별개입니다. 연결은 언제든지 해제하실 수 있습니다.' },
            { title: '업체 선택', body: '애플리케이션이 Google에서 관리 중인 업체 목록을 보여 드리고, 이 사이트의 게시물이 어느 업체로 올라갈지 고르십니다.' },
            { title: '직접 쓰거나 초안 받기', body: '시스템이 사이트에 쓴 아티클에서 시작하실 수도 있고, 주제를 입력하거나 빈 화면에서 시작하실 수도 있습니다. 첫 초안은 Google의 길이 제한 안에서 만들어지며 원하시는 대로 고치실 수 있습니다.' },
            { title: '게시 또는 예약', body: '지금 바로, 또는 원하시는 날짜와 시각에 최대 1년까지 예약하실 수 있습니다. 게시물 목록에는 게시된 것, 예약된 것, Google이 검토 중인 것이 함께 표시됩니다.' },
          ],
        },
        {
          kind: 'cards',
          eyebrow: '모든 게시물에',
          title: '제대로 보이는 게시물',
          items: [
            { icon: Crop, title: '알맞은 이미지 비율', body: '사진을 올리고 Google이 보여 주는 4:3 비율로, 확대와 위치를 조정해 잘라내십니다. 아티클에서 만든 게시물은 그 아티클의 이미지를 한 번의 클릭으로 가져올 수 있습니다.' },
            { icon: ImagePlus, title: '주제 게시물용 이미지 생성', body: '직접 입력하신 주제로 게시물을 쓰실 때에는 애플리케이션이 AI로 설명용 이미지를 만들어 드릴 수 있습니다. 일반적인 이미지이며 고객님의 업체, 직원, 제품을 찍은 사진이 아니고, 직접 고르신 경우에만 게시물에 들어갑니다.' },
            { icon: MousePointerClick, title: '행동으로 이어지는 버튼', body: '자세히 보기, 예약하기, 온라인 주문, 구매하기, 가입하기, 지금 전화하기 중에서 고르십니다. 버튼은 고객님 사이트의 페이지로 연결되며, 예약 시스템처럼 다른 사이트로 보내는 것도 허용하시면 가능합니다. "지금 전화하기"는 프로필에 등록된 번호로 연결됩니다.' },
            { icon: Eye, title: '게시 전에 미리 보기', body: '편집 화면 옆에 게시물 미리보기가 있습니다. 업체명, 사진, 본문, 버튼이 그대로 보이므로 놀랄 일이 없습니다.' },
            { icon: Type, title: 'Google 규정 안에서', body: 'Google의 제한인 1,500자까지 글자 수를 세어 드립니다. 본문에 전화번호가 들어가면 알려 드립니다. Google이 게시물 안의 전화번호를 제한하기 때문이며, 전화를 받으시려면 "지금 전화하기" 버튼을 쓰시면 됩니다.' },
            { icon: Languages, title: '고객의 언어로', body: '초안은 프로젝트의 언어로, 애플리케이션이 지원하는 어떤 언어로든 작성됩니다. 게시 전에 한 단어까지 고치실 수 있습니다.' },
            { icon: ShieldCheck, title: '승인하신 것만', body: '승인하신 게시물과 답글만 올라가며, 자동 게시를 켜 두신 경우에는 자동 게시물도 올라갑니다. 영업시간, 주소, 그 밖의 업체 정보는 절대 변경되지 않습니다.' },
          ],
        },
        {
          kind: 'cards',
          tone: 'contrast',
          eyebrow: '자동 게시',
          title: '사이트에 새 아티클, Google에 새 게시물',
          items: [
            { icon: Zap, title: '저절로 올라갑니다', body: '켜 두시면 시스템이 사이트에 게시하는 모든 아티클이 비즈니스 프로필의 짧은 게시물로도 올라갑니다. 아티클의 이미지와, 그 아티클로 연결되는 "자세히 보기" 버튼이 함께 들어갑니다.' },
            { icon: ToggleLeft, title: '켜시기 전까지는 꺼져 있습니다', body: '기본값은 꺼짐이며 사이트별로 설정됩니다. 자동 게시물은 고객님이 먼저 읽지 않은 상태로 올라가므로, 켤지 여부는 고객님의 결정입니다. 언제든지 끄실 수 있고, 이미 올라간 게시물은 그대로 남습니다.' },
            { icon: Repeat, title: '아티클당 한 번', body: '사이트 게시가 다시 실행되더라도 같은 아티클이 프로필에 두 번 올라가지는 않습니다. 그래서 프로필이 중복 게시물로 채워지지 않습니다.' },
          ],
        },
        {
          kind: 'cards',
          columns: 2,
          eyebrow: 'Google 리뷰',
          title: '모든 리뷰에, 한곳에서 답글',
          items: [
            { icon: MessageSquareText, title: '모든 리뷰를 한눈에', body: '업체의 Google 리뷰를 평균 별점, 답글을 기다리는 건수, 새 리뷰 표시와 함께 보여 드립니다. 별점순으로 정렬하실 수 있습니다.' },
            { icon: Sparkles, title: '클릭 한 번으로 답글 초안', body: '고객이 쓴 언어로, 정중하고 요점이 분명한 답글 초안을 받으십니다. 고치신 뒤 보내시면 Google의 리뷰 아래에 답글이 표시됩니다.' },
            { icon: PenLine, title: '수정 또는 삭제', body: '이미 게시한 답글을 수정하거나 삭제하실 수 있습니다. 리뷰 자체는 그대로 남습니다.' },
            { icon: Lock, title: '리뷰는 저장하지 않습니다', body: '리뷰는 목록을 열 때마다 Google에서 읽어 오며 시스템에 저장되지 않습니다. 초안 작성에 고객의 이름은 전달되지 않으므로, 이름을 넣어 부르고 싶으시면 직접 적어 주십시오.' },
          ],
        },
        {
          kind: 'callout',
          icon: Info,
          title: '알아 두실 점',
          body: (
            <>
              <p>
                Google은 모든 게시물을 표시 전에 검토하며, 때로는 거부합니다. 게시물 목록에는 거부된 게시물을 포함해
                각 게시물의 상태가 표시됩니다. 연결하시려면 비즈니스 프로필의 소유자이거나 관리자인 Google 계정이
                필요합니다.
              </p>
              <p>
                Go Top SEO는 Google과 아무런 제휴 관계가 없습니다. 게시물과 리뷰 답글은 고객이 활발히 운영되는
                업체라는 것을 보기에 도움이 되지만, Google 지도나 Google 검색의 순위를 약속하는 것은 아닙니다.
              </p>
            </>
          ),
        },
        {
          kind: 'faq',
          eyebrow: '자주 묻는 질문',
          title: '비즈니스 프로필 게시물에 대해 많이 묻는 것',
          items: [
            { q: '애플리케이션이 영업시간이나 주소를 바꿀 수 있습니까?', a: '바꾸지 않습니다. 저희가 게시하는 것은 게시물과 리뷰 답글뿐입니다. 영업시간, 주소, 전화번호, 그 밖의 프로필 정보는 그대로 유지됩니다.' },
            { q: '초안이 저절로 게시됩니까?', a: '직접 쓰시는 게시물은 그렇지 않습니다. 초안이 화면에 나타나고, 버튼을 누르셔야 게시됩니다. 새 아티클에 대한 게시물은 자동 게시를 켜 두신 경우에만 저절로 올라갑니다.' },
            { q: '게시물을 미리 예약할 수 있습니까?', a: '예, 원하시는 날짜와 시각으로 최대 1년까지 예약하실 수 있습니다. 예약된 게시물은 발송되기 전까지 취소하실 수 있습니다.' },
            { q: 'Shopify 쇼핑몰이나 WordPress가 아닌 사이트에서도 됩니까?', a: '됩니다. 게시물은 고객님의 사이트가 아니라 Google 비즈니스 프로필로 올라가므로, 플랫폼과 무관하게 모든 프로젝트에서 작동합니다.' },
            { q: '연결을 해제하면 어떻게 됩니까?', a: '예약된 게시물은 연결이 복구될 때까지 게시되지 않습니다. 이미 게시된 게시물은 Google에 그대로 남습니다.' },
            { q: 'Google에서 여러 업체를 관리하고 있습니다. 문제가 됩니까?', a: '문제없습니다. 애플리케이션이 계정이 관리하는 모든 업체를 보여 드리고, 시스템의 사이트마다 그 사이트의 게시물이 올라갈 업체를 고르시면 됩니다.' },
          ],
        },
      ],
      cta: { title: '무엇이 새로운지 고객에게 보여 주십시오', body: ko.closeBody, primary: ko.trial, secondary: ko.check },
    },
  },
}
