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
 * WHAT IT DELIBERATELY DOES NOT SAY: no AI-made photos (not shipped), no model
 * or provider name, no ranking promise, no number, no percentage, and nothing
 * that reads as Google endorsing or partnering with Go Top SEO. Google's names
 * are used only to say which product the posts land on.
 *
 * Guarded by components/public/__qa__/public-nav-menus.qa.ts (group 5).
 */
import {
  Crop, Eye, Info, Languages, Lock, MapPinned, MessageSquareText, MousePointerClick,
  PenLine, Repeat, ShieldCheck, Sparkles, ToggleLeft, Type, Zap,
} from 'lucide-react'
import { MapsPostVisual } from '@/components/public/feature-visuals'
import { FEATURE_COMMON } from '@/lib/i18n/public/feature-common'
import type { MarketingPage } from './marketing-page'

const he = FEATURE_COMMON.he
const en = FEATURE_COMMON.en
const es = FEATURE_COMMON.es
const pt = FEATURE_COMMON['pt-BR']

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
            { icon: MousePointerClick, title: 'כפתור שמוביל לפעולה', body: 'מידע נוסף, הזמנת תור, הזמנה אונליין, קנייה, הרשמה או התקשרו. הכפתור מוביל לעמוד באתר שלכם, ואפשר גם לאתר אחר כמו מערכת זימון תורים. "התקשרו" מחייג למספר שבפרופיל.' },
            { icon: Eye, title: 'רואים לפני שמפרסמים', body: 'לצד הכתיבה יש תצוגה מקדימה של הפוסט: שם העסק, התמונה, הטקסט והכפתור, כדי שלא יהיו הפתעות.' },
            { icon: Type, title: 'בתוך הכללים של גוגל', body: 'מונה תווים עד 1,500, המגבלה של גוגל. אם יש בטקסט מספר טלפון תקבלו התראה, כי גוגל מגבילה טלפונים בפוסטים, ולשיחות יש את הכפתור "התקשרו".' },
            { icon: Languages, title: 'בשפה של הלקוחות', body: 'הטיוטה נכתבת בעברית, באנגלית, בספרדית או בפורטוגזית, ואתם תמיד יכולים לשנות כל מילה לפני הפרסום.' },
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
            { icon: MousePointerClick, title: 'A button that leads somewhere', body: 'Learn more, Book, Order online, Buy, Sign up or Call now. The button leads to a page on your site, or to another site such as a booking system if you allow it. Call now dials the number on your profile.' },
            { icon: Eye, title: 'See it before it goes out', body: 'Next to the editor there is a preview of the post: the business name, the photo, the text and the button, so nothing comes as a surprise.' },
            { icon: Type, title: 'Within Google’s rules', body: 'A character counter up to 1,500, Google’s limit. If the text has a phone number you get a warning, because Google restricts phone numbers in posts, and calls have the Call now button.' },
            { icon: Languages, title: 'In your customers’ language', body: 'The draft is written in Hebrew, English, Spanish or Portuguese, and you can always change any word before publishing.' },
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
            { icon: MousePointerClick, title: 'Un botón que lleva a la acción', body: 'Más información, Reservar, Pedir online, Comprar, Registrarse o Llamar ahora. El botón lleva a una página de tu sitio o, si lo permites, a otro sitio, como un sistema de citas. Llamar ahora marca el número de tu perfil.' },
            { icon: Eye, title: 'La ves antes de publicarla', body: 'Junto al editor hay una vista previa de la publicación: el nombre del negocio, la foto, el texto y el botón, para que no haya sorpresas.' },
            { icon: Type, title: 'Dentro de las reglas de Google', body: 'Un contador de caracteres hasta 1500, el límite de Google. Si el texto lleva un número de teléfono recibes un aviso, porque Google limita los teléfonos en las publicaciones, y para las llamadas está el botón Llamar ahora.' },
            { icon: Languages, title: 'En el idioma de tus clientes', body: 'El borrador se escribe en hebreo, inglés, español o portugués, y siempre puedes cambiar cualquier palabra antes de publicar.' },
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
            { icon: MousePointerClick, title: 'Um botão que leva à ação', body: 'Saiba mais, Reservar, Pedir online, Comprar, Cadastrar-se ou Ligar agora. O botão leva a uma página do seu site ou, se você permitir, a outro site, como um sistema de agendamento. Ligar agora disca o número do seu perfil.' },
            { icon: Eye, title: 'Veja antes de publicar', body: 'Ao lado do editor há uma prévia do post: o nome do negócio, a foto, o texto e o botão, para não ter surpresas.' },
            { icon: Type, title: 'Dentro das regras do Google', body: 'Um contador de caracteres até 1.500, o limite do Google. Se o texto tiver um número de telefone, você recebe um aviso, porque o Google restringe telefones nos posts, e para ligações existe o botão Ligar agora.' },
            { icon: Languages, title: 'No idioma dos seus clientes', body: 'O rascunho é escrito em hebraico, inglês, espanhol ou português, e você sempre pode mudar qualquer palavra antes de publicar.' },
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
  },
}
