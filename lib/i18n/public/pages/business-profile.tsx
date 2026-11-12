/**
 * /features/google-business-profile in all ten languages: the hub page for the
 * Google Business Profile cluster.
 *
 * WHY THIS PAGE EXISTS, and it is a measured reason rather than a hunch.
 * Google Ads Keyword Planner, eleven markets, pulled 11-12 Nov 2026 and written
 * up in growth/next-language.md addenda 7 and 8: the English term
 * `google my business` is the LARGEST term in seven of the eleven markets and
 * among the most expensive in all of them (top-of-page high ₪1,420 in Hungary,
 * ₪752 Czechia, ₪613 Denmark, ₪601 Romania, ₪587 Norway, ₪380 Sweden, ₪347
 * Greece), while the local-language equivalent often returns no data at all
 * (`προφίλ επιχείρησης google`, `profil de companie google`,
 * `google vállalkozásom`). Korea, Hungary and Finland are the exceptions, where
 * the local form is the bigger one. So the page targets BOTH forms — the local
 * name in the prose, the English name named once in the opening sentence and in
 * the title — and the cluster needed a page, not an eleventh locale.
 *
 * It is a hub, not a second copy of a feature page. The two feature pages it
 * sits above keep their jobs: /features/google-maps-rank-tracking is the
 * position on the map, /features/google-maps-posts is posts and review replies.
 * This page answers the question the category term is actually asking — "what
 * about my Google profile?" — and says which part of the system does what.
 *
 * WHAT THIS PAGE CLAIMS, and where each claim comes from:
 *   - one Google sign-in with the merchant's own consent, asking only to manage
 *     the profile, separate from Search Console, disconnectable at any moment
 *     (lib/gbp/config.ts GBP_SCOPE, lib/gbp/oauth.ts);
 *   - pick which of the businesses the account manages this project works on
 *     (app/api/gbp/locations, saveProjectLocation);
 *   - posts with a 4:3 image and one of Google's buttons, published now or
 *     scheduled, a first draft written for you and nothing published unread
 *     (lib/gbp/draft.ts, validate.ts, components/maps-posts/crop.ts);
 *   - automatic posting off by default, per project, never twice for one
 *     article (lib/gbp/auto-post.ts);
 *   - reviews read live from Google and not stored, unanswered ones marked, a
 *     reply drafted in the reviewer's own language (lib/gbp/reviews.ts,
 *     review-draft.ts);
 *   - the map position by phrase and by area, the businesses ranked ahead, and
 *     the movement over time (the Maps tracking feature page's own claims);
 *   - the map positions appear in the report that can be sent to a client.
 * WHAT IT DELIBERATELY DOES NOT SAY: no ranking promise and no number of
 * customers; no model or provider name; nothing that reads as Google endorsing
 * or partnering with Go Top SEO — Google's product names say where the work
 * lands and nothing more. It also states plainly what the system does NOT do:
 * it neither creates nor verifies a profile, and it never changes the hours,
 * the address or the phone number on one.
 */
import {
  BarChart3, Building2, ImagePlus, Info, MapPin, MessageSquareText, Phone, Repeat, Star, Users,
} from 'lucide-react'
import { MapsVisual } from '@/components/public/feature-visuals'
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

export const BUSINESS_PROFILE_PAGE: MarketingPage = {
  path: '/features/google-business-profile',
  meta: {
    he: {
      title: 'פרופיל העסק בגוגל (Google My Business) | Go Top SEO',
      description: 'פרופיל העסק בגוגל הוא מה שלקוחות רואים לפני שהם מגיעים לאתר. המערכת עוקבת אחרי המיקום שלכם במפות, מפרסמת עדכונים עם תמונה וכפתור ומכינה תשובה לכל ביקורת, במקום אחד.',
    },
    en: {
      title: 'Google Business Profile (Google My Business) | Go Top SEO',
      description: 'Your Google Business Profile is what local customers see before they ever reach your site. Track your position on the map, publish updates with a photo and a button, and answer every review from one place.',
    },
    es: {
      title: 'Perfil de Empresa de Google (Google My Business) | Go Top SEO',
      description: 'El Perfil de Empresa de Google es lo que los clientes ven antes de llegar a tu sitio. El sistema sigue tu posición en Maps, publica novedades con foto y botón y prepara una respuesta a cada reseña, en un solo lugar.',
    },
    'pt-BR': {
      title: 'Perfil da Empresa no Google (Google My Business) | Go Top SEO',
      description: 'O Perfil da Empresa no Google é o que o cliente vê antes de chegar ao seu site. O sistema acompanha sua posição no Maps, publica novidades com foto e botão e prepara uma resposta para cada avaliação, em um só lugar.',
    },
    fr: {
      title: 'Fiche d’établissement Google (Google My Business) | Go Top SEO',
      description: 'Votre fiche d’établissement Google est ce que les clients voient avant d’arriver sur votre site. Le système suit votre position sur Maps, publie des actualités avec photo et bouton et prépare une réponse à chaque avis, au même endroit.',
    },
    it: {
      title: 'Profilo dell’attività su Google (Google My Business) | Go Top SEO',
      description: 'Il profilo dell’attività su Google è ciò che i clienti vedono prima di arrivare sul sito. Il sistema segue la posizione su Maps, pubblica novità con foto e pulsante e prepara una risposta a ogni recensione, in un unico posto.',
    },
    ja: {
      title: 'Googleビジネスプロフィール（Google My Business） | Go Top SEO',
      description: 'Googleビジネスプロフィールは、お客様がサイトにたどり着く前に目にする情報です。マップでの掲載順位の記録、写真とボタン付きの投稿、口コミへの返信の下書きを、一つの場所でまとめて行えます。',
    },
    de: {
      title: 'Google Unternehmensprofil (Google My Business) | Go Top SEO',
      description: 'Das Google Unternehmensprofil ist das, was Kunden sehen, bevor sie Ihre Website erreichen. Das System verfolgt Ihre Position auf Maps, veröffentlicht Neuigkeiten mit Foto und Button und bereitet eine Antwort auf jede Bewertung vor – an einer Stelle.',
    },
    nl: {
      title: 'Google Bedrijfsprofiel (Google My Business) | Go Top SEO',
      description: 'Uw Google Bedrijfsprofiel is wat klanten zien voordat ze uw site bereiken. Het systeem volgt uw positie op Maps, plaatst nieuws met foto en knop en schrijft een antwoord op elke review, op één plek.',
    },
    pl: {
      title: 'Profil Firmy w Google (Google My Business) | Go Top SEO',
      description: 'Profil Firmy w Google to pierwsze, co widzi klient, jeszcze przed wejściem na stronę. System śledzi pozycję w Mapach, publikuje nowości ze zdjęciem i przyciskiem oraz przygotowuje odpowiedź na każdą opinię, w jednym miejscu.',
    },
    ko: {
      title: '구글 비즈니스 프로필(Google My Business) | Go Top SEO',
      description: '구글 비즈니스 프로필은 고객이 사이트에 들어오기 전에 보는 화면입니다. 지도에서의 순위를 매월 기록하고, 사진과 버튼이 있는 게시물을 올리고, 모든 리뷰의 답변 초안을 한곳에서 준비합니다.',
    },
  },
  content: {
    he: {
      hero: {
        eyebrow: 'פרופיל העסק בגוגל',
        eyebrowIcon: Building2,
        title: 'פרופיל העסק בגוגל',
        accent: 'הוא חלון הראווה שלכם',
        subtitle: 'פרופיל העסק בגוגל, מה שנקרא בעבר Google My Business, הוא מה שאנשים רואים במפות ובחיפוש לפני שהם מגיעים לאתר שלכם: השם, הדירוג, הביקורות, התמונות והעדכונים. המערכת עוקבת אחרי המיקום שלכם במפה, מפרסמת לפרופיל עדכונים עם תמונה וכפתור ומכינה תשובה לכל ביקורת, מאותו מקום שבו נכתב התוכן לאתר.',
        trust: he.trust,
        primary: he.check,
        secondary: he.trial,
        visual: (
          <MapsVisual
            positionLabel="המיקום שלכם"
            position="3"
            positionSub='בתל אביב, "מרפאת שיניים"'
            changeLabel="החודש"
            change="2"
            changeSub="מקומות למעלה"
            reviewsLabel="ביקורות"
            rows={[
              { rank: 1, name: 'מרפאת שיניים רוטשילד', stars: 4.8, reviews: 212 },
              { rank: 2, name: 'דנטל סנטר הצפון', stars: 4.6, reviews: 174 },
              { rank: 3, name: 'העסק שלכם', stars: 4.7, reviews: 131, highlight: true },
              { rank: 4, name: 'מרפאת שיניים בן יהודה', stars: 4.4, reviews: 98 },
            ]}
          />
        ),
      },
      sections: [
        {
          kind: 'cards',
          tone: 'contrast',
          eyebrow: 'למה הפרופיל',
          title: 'ההחלטה נסגרת במפה, לא באתר',
          intro: 'מי שמחפש עסק כמו שלכם באזור רואה קודם כמה עסקים על המפה, ומשם מתקשר, מבקש הוראות הגעה או נכנס לאתר.',
          items: [
            { icon: Phone, title: 'מתקשרים מתוך הכרטיס', body: 'מתוך תוצאת המפה אפשר להתקשר, לנווט או להיכנס לאתר בלחיצה אחת, לפעמים בלי לקרוא אפילו עמוד אחד באתר.' },
            { icon: Users, title: 'מעט מקומות, הרבה עסקים', body: 'גוגל מציגה מספר קטן של עסקים מעל המפה. השאלה אם אתם ביניהם היא כל השאלה בחיפוש מקומי.' },
            { icon: Star, title: 'קודם קוראים את הביקורות', body: 'הדירוג ומספר הביקורות מופיעים ליד השם, לפני כל דבר אחר. ביקורת שלא נענתה נשארת כך.' },
          ],
        },
        {
          kind: 'steps',
          eyebrow: 'איך זה עובד',
          title: 'מחיבור אחד לפרופיל שלא נשאר שקט',
          items: [
            { title: 'מחברים את הפרופיל פעם אחת', body: 'נכנסים עם חשבון Google שמנהל את הפרופיל ומאשרים במסך של גוגל. ההרשאה היא רק לניהול הפרופיל, והחיבור נפרד מ-Search Console. אפשר לנתק בכל רגע.' },
            { title: 'בוחרים את העסק', body: 'המערכת מביאה את העסקים שהחשבון שלכם מנהל, ואתם בוחרים באיזה מהם הפרויקט הזה עובד.' },
            { title: 'מפרסמים ועונים', body: 'כותבים פוסט ממאמר שהמערכת העלתה לאתר, מנושא שהקלדתם או מדף ריק. מקבלים טיוטה ראשונה, ושום דבר לא מתפרסם בלי שקראתם. ביקורות מגיעות עם טיוטת תשובה בשפה שבה נכתבו.' },
            { title: 'עוקבים אחרי המיקום כל חודש', body: 'המיקום שלכם במפה לכל ביטוי ולכל אזור, מי העסקים שנמצאים מעליכם, ואיך המיקום שלכם זז לאורך הזמן.' },
          ],
        },
        {
          kind: 'cards',
          eyebrow: 'מה יש במערכת',
          title: 'הפרופיל והמפה באותה מערכת',
          columns: 3,
          items: [
            { icon: MapPin, title: 'המיקום שלכם במפה', body: 'מיקום לפי ביטוי ולפי אזור: עיר, או נקודה מדויקת על המפה.' },
            { icon: Users, title: 'מי מעליכם', body: 'העסקים שתופסים את המקומות שלפניכם, עם הדירוג ומספר הביקורות שלהם.' },
            { icon: ImagePlus, title: 'פוסטים עם תמונה וכפתור', body: 'עדכון עם תמונה שנחתכת ליחס שגוגל מציגה, ועם אחד מהכפתורים של גוגל: הזמנת תור, הזמנה, הרשמה, מידע נוסף או חיוג למספר שבפרופיל.' },
            { icon: Repeat, title: 'פרסום אוטומטי', body: 'כבוי כברירת מחדל, לכל פרויקט בנפרד. כשמפעילים, מאמר שהמערכת מעלה לאתר הופך לפוסט בפרופיל עם התמונה והכפתור שלו, ולא פעמיים לאותו מאמר.' },
            { icon: MessageSquareText, title: 'טיוטת תשובה לכל ביקורת', body: 'הביקורות נקראות מגוגל בזמן אמת ולא נשמרות אצלנו, מי שלא נענה מסומן, והתשובה נכתבת בשפת הביקורת. אתם מתקנים ושולחים, או מוחקים.' },
            { icon: BarChart3, title: 'בדוח החודשי', body: 'המיקומים במפה נכנסים לדוח שאפשר לשלוח ללקוח או לשותף, לצד שאר התמונה.' },
          ],
        },
        {
          kind: 'callout',
          icon: Info,
          title: 'מה המערכת לא עושה',
          body: 'המערכת לא פותחת פרופיל ולא עוברת בשבילכם את האימות של גוגל: זה קורה בחשבון Google שלכם, והוא גם החשבון שמתחבר כאן. שעות הפתיחה, הכתובת ומספר הטלפון שבפרופיל לא משתנים על ידי המערכת. שום פוסט ושום תשובה לא מתפרסמים בלי אישור שלכם, אלא אם הפעלתם בעצמכם פרסום אוטומטי. Go Top SEO אינה קשורה לגוגל, ושמות המוצרים של גוגל מופיעים כאן רק כדי לומר לאן העבודה מגיעה.',
        },
        {
          kind: 'faq',
          eyebrow: 'שאלות',
          title: 'פרופיל העסק בגוגל, במילים פשוטות',
          items: [
            { q: 'זה אותו דבר כמו Google My Business?', a: 'כן. גוגל שינתה את השם מ-Google My Business ל"פרופיל העסק בגוגל" וסגרה את האפליקציות הנפרדות לניהול; היום מנהלים את הפרופיל מתוך החיפוש והמפות, או דרך הממשק שהמערכת הזו עובדת איתו. הרבה אנשים עדיין מחפשים את השם הישן.' },
            { q: 'צריך אתר כדי שהפרופיל יהיה שווה משהו?', a: 'לא. פרופיל יכול להימצא בזכות עצמו, והפוסטים והתשובות לביקורות עובדים גם בלי אתר. אתר בכל זאת עוזר: לכפתורים בפוסטים יש לאן להוביל, והמאמרים שהמערכת כותבת נותנים לפרופיל מה לספר.' },
            { q: 'המערכת פותחת לי את הפרופיל?', a: 'לא. את הפרופיל פותחים ומאמתים בחשבון Google שלכם, ואותו חשבון מתחבר כאן. מהרגע הזה המערכת עובדת על הפרופיל שכבר שלכם.' },
            { q: 'מה באמת עוזר לפרופיל להופיע?', a: 'אף אחד מחוץ לגוגל לא יודע את המשקלים, ומי שמבטיח מיקום מנחש. מה שידוע: פרופיל מלא ומדויק, פעילות עליו וביקורות שנענות. המערכת מודדת את המיקום כדי שתראו מה העבודה שלכם שינתה, במקום להניח.' },
            { q: 'באיזו שפה נכתבים הפוסטים?', a: 'בשפת הפרויקט, בכל אחת מהשפות שהמערכת עובדת בהן, וביקורת נענית בשפה שבה היא נכתבה. אתם תמיד יכולים לשנות כל מילה לפני הפרסום.' },
          ],
        },
      ],
      cta: {
        title: 'תראו איפה העסק שלכם עומד במפה',
        body: he.closeBody,
        primary: he.check,
        secondary: he.trial,
      },
    },
    en: {
      hero: {
        eyebrow: 'Google Business Profile',
        eyebrowIcon: Building2,
        title: 'Your Google Business Profile',
        accent: 'is your shop window',
        subtitle: 'A Google Business Profile — what used to be called Google My Business — is what people see on Maps and in search before they ever reach your site: the name, the rating, the reviews, the photos and the updates. The system tracks where you stand on the map, publishes updates with a photo and a button to the profile, and drafts a reply to every review, in the same place the site content is written.',
        trust: en.trust,
        primary: en.check,
        secondary: en.trial,
        visual: (
          <MapsVisual
            positionLabel="Your position"
            position="3"
            positionSub='in Denver, "emergency dentist"'
            changeLabel="This month"
            change="2"
            changeSub="places up"
            reviewsLabel="reviews"
            rows={[
              { rank: 1, name: 'Highland Dental Care', stars: 4.8, reviews: 212 },
              { rank: 2, name: 'Cherry Creek Dentistry', stars: 4.6, reviews: 174 },
              { rank: 3, name: 'Your business', stars: 4.7, reviews: 131, highlight: true },
              { rank: 4, name: 'Baker Street Dental', stars: 4.4, reviews: 98 },
            ]}
          />
        ),
      },
      sections: [
        {
          kind: 'cards',
          tone: 'contrast',
          eyebrow: 'Why the profile',
          title: 'The decision is made on the map, not on your site',
          intro: 'Someone looking for a business like yours nearby sees a few businesses above the map first, and calls, asks for directions or opens a site from there.',
          items: [
            { icon: Phone, title: 'They call from the panel', body: 'From a map result people call, navigate or open your site in one tap, sometimes without reading a single page on it.' },
            { icon: Users, title: 'A few places, many businesses', body: 'Google shows a small number of businesses above the map. Whether you are one of them is the whole question in local search.' },
            { icon: Star, title: 'The reviews are read first', body: 'The rating and the review count sit next to your name, before anything else. A review left without an answer stays that way.' },
          ],
        },
        {
          kind: 'steps',
          eyebrow: 'How it works',
          title: 'From one sign-in to a profile that does not go quiet',
          items: [
            { title: 'Connect the profile once', body: 'Sign in with the Google account that manages the profile and approve it on Google’s own screen. The permission covers managing the profile only, and the connection is separate from Search Console. You can disconnect at any time.' },
            { title: 'Choose the business', body: 'The system lists the businesses your account manages, and you pick the one this project works on.' },
            { title: 'Publish and reply', body: 'Write a post from an article the system published to your site, from a topic you type, or from a blank page. A first draft is ready, and nothing is published unread. Reviews arrive with a drafted answer in the language they were written in.' },
            { title: 'Track the position every month', body: 'Your place on the map for each phrase and each area, the businesses ranked ahead of you, and how your own position moved over time.' },
          ],
        },
        {
          kind: 'cards',
          eyebrow: 'What you get',
          title: 'The profile and the map in one system',
          columns: 3,
          items: [
            { icon: MapPin, title: 'Your place on the map', body: 'Position by phrase and by area: a city, or an exact point on the map.' },
            { icon: Users, title: 'Who is ahead of you', body: 'The businesses holding the places above you, with their rating and their review count.' },
            { icon: ImagePlus, title: 'Posts with a photo and a button', body: 'An update with an image cropped to the ratio Google shows, and one of Google’s buttons: book, order, sign up, learn more, or call the number on the profile.' },
            { icon: Repeat, title: 'Automatic posting', body: 'Off by default, per project. Once it is on, an article the system publishes to your site becomes a post on the profile with its image and its button, and never twice for the same article.' },
            { icon: MessageSquareText, title: 'A reply drafted for every review', body: 'Reviews are read live from Google and not stored with us, the unanswered ones are marked, and the reply is written in the language of the review. You edit it and send it, or delete it.' },
            { icon: BarChart3, title: 'In the monthly report', body: 'The map positions go into the report you can send to a client or a partner, next to the rest of the picture.' },
          ],
        },
        {
          kind: 'callout',
          icon: Info,
          title: 'What the system does not do',
          body: 'It does not create a profile and does not go through Google’s verification for you: that happens in your own Google account, which is also the account that connects here. The opening hours, the address and the phone number on the profile are never changed by the system. No post and no reply is published without your approval, unless you turn automatic posting on yourself. Go Top SEO is not affiliated with Google, and Google’s product names appear here only to say where the work lands.',
        },
        {
          kind: 'faq',
          eyebrow: 'Questions',
          title: 'Google Business Profile, in plain words',
          items: [
            { q: 'Is this the same thing as Google My Business?', a: 'Yes. Google renamed Google My Business to Google Business Profile and retired the separate management apps; a profile is now managed from Search and Maps, or through the interface this system works with. Many people still search for the old name.' },
            { q: 'Do I need a website for a profile to be worth anything?', a: 'No. A profile can be found on its own, and posts and review replies work without a site. A site does help: the buttons on the posts have somewhere to lead, and the articles the system writes give the profile something to say.' },
            { q: 'Does the system create the profile for me?', a: 'No. The profile is created and verified in your own Google account, and that account is the one that connects here. From that point the system works on the profile you already own.' },
            { q: 'What actually helps a profile show up?', a: 'Nobody outside Google knows the weights, and anyone promising a position is guessing. What is known: a complete, accurate profile, activity on it, and reviews that get answered. The system measures the position so you can see what your work changed, instead of assuming.' },
            { q: 'Which language are the posts written in?', a: 'The project’s language, in any of the languages the system works in, and a review is answered in the language it was written in. You can change every word before anything is published.' },
          ],
        },
      ],
      cta: {
        title: 'See where your business stands on the map',
        body: en.closeBody,
        primary: en.check,
        secondary: en.trial,
      },
    },
    es: {
      hero: {
        eyebrow: 'Perfil de Empresa de Google',
        eyebrowIcon: Building2,
        title: 'Tu Perfil de Empresa de Google',
        accent: 'es tu escaparate',
        subtitle: 'El Perfil de Empresa de Google, lo que antes se llamaba Google My Business, es lo que la gente ve en Maps y en el buscador antes de llegar a tu sitio: el nombre, la valoración, las reseñas, las fotos y las novedades. El sistema sigue tu posición en el mapa, publica novedades con foto y botón en el perfil y prepara una respuesta a cada reseña, en el mismo lugar donde se escribe el contenido del sitio.',
        trust: es.trust,
        primary: es.check,
        secondary: es.trial,
        visual: (
          <MapsVisual
            positionLabel="Tu posición"
            position="3"
            positionSub='en Valencia, "clínica dental"'
            changeLabel="Este mes"
            change="2"
            changeSub="puestos arriba"
            reviewsLabel="reseñas"
            rows={[
              { rank: 1, name: 'Clínica Dental Ruzafa', stars: 4.8, reviews: 212 },
              { rank: 2, name: 'Dental Mediterráneo', stars: 4.6, reviews: 174 },
              { rank: 3, name: 'Tu negocio', stars: 4.7, reviews: 131, highlight: true },
              { rank: 4, name: 'Clínica Dental Benimaclet', stars: 4.4, reviews: 98 },
            ]}
          />
        ),
      },
      sections: [
        {
          kind: 'cards',
          tone: 'contrast',
          eyebrow: 'Por qué el perfil',
          title: 'La decisión se toma en el mapa, no en tu web',
          intro: 'Quien busca un negocio como el tuyo en su zona ve primero unos pocos negocios sobre el mapa, y desde ahí llama, pide indicaciones o entra en una web.',
          items: [
            { icon: Phone, title: 'Llaman desde la ficha', body: 'Desde un resultado del mapa se llama, se navega o se abre tu web con un toque, a veces sin leer ni una página.' },
            { icon: Users, title: 'Pocos puestos, muchos negocios', body: 'Google muestra unos pocos negocios sobre el mapa. Si estás entre ellos o no es toda la cuestión en la búsqueda local.' },
            { icon: Star, title: 'Primero se leen las reseñas', body: 'La valoración y el número de reseñas aparecen junto a tu nombre, antes que nada. Una reseña sin responder se queda así.' },
          ],
        },
        {
          kind: 'steps',
          eyebrow: 'Cómo funciona',
          title: 'De una conexión a un perfil que no se queda callado',
          items: [
            { title: 'Conectas el perfil una vez', body: 'Entras con la cuenta de Google que gestiona el perfil y lo autorizas en la pantalla de Google. El permiso sirve solo para gestionar el perfil y la conexión es independiente de Search Console. Puedes desconectarla cuando quieras.' },
            { title: 'Eliges el negocio', body: 'El sistema trae los negocios que gestiona tu cuenta y tú eliges en cuál trabaja este proyecto.' },
            { title: 'Publicas y respondes', body: 'Escribes una publicación a partir de un artículo que el sistema subió a tu sitio, de un tema que escribes o de una página en blanco. El primer borrador ya está listo y nada se publica sin leerlo. Las reseñas llegan con una respuesta preparada en el idioma en que se escribieron.' },
            { title: 'Sigues la posición cada mes', body: 'Tu lugar en el mapa para cada frase y cada zona, los negocios que están por delante y cómo se ha movido tu posición con el tiempo.' },
          ],
        },
        {
          kind: 'cards',
          eyebrow: 'Qué incluye',
          title: 'El perfil y el mapa en un mismo sistema',
          columns: 3,
          items: [
            { icon: MapPin, title: 'Tu lugar en el mapa', body: 'Posición por frase y por zona: una ciudad, o un punto exacto del mapa.' },
            { icon: Users, title: 'Quién está por delante', body: 'Los negocios que ocupan los puestos por encima del tuyo, con su valoración y su número de reseñas.' },
            { icon: ImagePlus, title: 'Publicaciones con foto y botón', body: 'Una novedad con una imagen recortada a la proporción que muestra Google y uno de los botones de Google: reservar, pedir, registrarse, más información o llamar al número del perfil.' },
            { icon: Repeat, title: 'Publicación automática', body: 'Desactivada por defecto, en cada proyecto. Al activarla, un artículo que el sistema sube a tu sitio se convierte en una publicación del perfil con su imagen y su botón, y nunca dos veces para el mismo artículo.' },
            { icon: MessageSquareText, title: 'Una respuesta lista para cada reseña', body: 'Las reseñas se leen de Google en tiempo real y no se guardan con nosotros, las no respondidas quedan marcadas y la respuesta se escribe en el idioma de la reseña. Tú la corriges y la envías, o la borras.' },
            { icon: BarChart3, title: 'En el informe mensual', body: 'Las posiciones del mapa entran en el informe que puedes enviar a un cliente o a un socio, junto al resto del panorama.' },
          ],
        },
        {
          kind: 'callout',
          icon: Info,
          title: 'Lo que el sistema no hace',
          body: 'No crea un perfil ni pasa por ti la verificación de Google: eso ocurre en tu propia cuenta de Google, que es además la cuenta que se conecta aquí. El horario, la dirección y el teléfono del perfil no los cambia el sistema. Ninguna publicación y ninguna respuesta sale sin tu aprobación, salvo que actives tú mismo la publicación automática. Go Top SEO no está afiliada a Google, y los nombres de los productos de Google aparecen aquí solo para decir dónde acaba el trabajo.',
        },
        {
          kind: 'faq',
          eyebrow: 'Preguntas',
          title: 'El Perfil de Empresa de Google, en palabras sencillas',
          items: [
            { q: '¿Es lo mismo que Google My Business?', a: 'Sí. Google cambió el nombre de Google My Business a Perfil de Empresa de Google y cerró las aplicaciones de gestión aparte; hoy el perfil se gestiona desde el buscador y Maps, o a través de la interfaz con la que trabaja este sistema. Mucha gente sigue buscando el nombre antiguo.' },
            { q: '¿Hace falta una web para que el perfil valga la pena?', a: 'No. Un perfil se encuentra por sí mismo, y las publicaciones y las respuestas a reseñas funcionan sin web. Una web ayuda: los botones de las publicaciones tienen a dónde llevar, y los artículos que escribe el sistema le dan al perfil algo que contar.' },
            { q: '¿El sistema me crea el perfil?', a: 'No. El perfil se crea y se verifica en tu propia cuenta de Google, y esa cuenta es la que se conecta aquí. A partir de ahí el sistema trabaja sobre el perfil que ya es tuyo.' },
            { q: '¿Qué ayuda de verdad a que un perfil aparezca?', a: 'Nadie fuera de Google conoce los pesos, y quien promete una posición está adivinando. Lo que se sabe: un perfil completo y exacto, actividad en él y reseñas respondidas. El sistema mide la posición para que veas qué cambió tu trabajo, en lugar de suponerlo.' },
            { q: '¿En qué idioma se escriben las publicaciones?', a: 'En el idioma del proyecto, en cualquiera de los idiomas en que trabaja el sistema, y una reseña se responde en el idioma en que fue escrita. Siempre puedes cambiar cada palabra antes de publicar.' },
          ],
        },
      ],
      cta: {
        title: 'Mira dónde está tu negocio en el mapa',
        body: es.closeBody,
        primary: es.check,
        secondary: es.trial,
      },
    },
    'pt-BR': {
      hero: {
        eyebrow: 'Perfil da Empresa no Google',
        eyebrowIcon: Building2,
        title: 'Seu Perfil da Empresa no Google',
        accent: 'é a sua vitrine',
        subtitle: 'O Perfil da Empresa no Google, o que antes se chamava Google My Business, é o que as pessoas veem no Maps e na busca antes de chegar ao seu site: o nome, a nota, as avaliações, as fotos e as novidades. O sistema acompanha sua posição no mapa, publica novidades com foto e botão no perfil e prepara uma resposta para cada avaliação, no mesmo lugar em que o conteúdo do site é escrito.',
        trust: pt.trust,
        primary: pt.check,
        secondary: pt.trial,
        visual: (
          <MapsVisual
            positionLabel="Sua posição"
            position="3"
            positionSub='em Belo Horizonte, "clínica odontológica"'
            changeLabel="Neste mês"
            change="2"
            changeSub="posições acima"
            reviewsLabel="avaliações"
            rows={[
              { rank: 1, name: 'Odonto Savassi', stars: 4.8, reviews: 212 },
              { rank: 2, name: 'Clínica Dental Pampulha', stars: 4.6, reviews: 174 },
              { rank: 3, name: 'Sua empresa', stars: 4.7, reviews: 131, highlight: true },
              { rank: 4, name: 'Sorriso Centro BH', stars: 4.4, reviews: 98 },
            ]}
          />
        ),
      },
      sections: [
        {
          kind: 'cards',
          tone: 'contrast',
          eyebrow: 'Por que o perfil',
          title: 'A decisão acontece no mapa, não no site',
          intro: 'Quem procura uma empresa como a sua na região vê primeiro algumas empresas acima do mapa e, dali, liga, pede rota ou abre um site.',
          items: [
            { icon: Phone, title: 'A ligação sai do cartão', body: 'No resultado do mapa dá para ligar, traçar rota ou abrir seu site com um toque, às vezes sem ler nenhuma página.' },
            { icon: Users, title: 'Poucas vagas, muitas empresas', body: 'O Google mostra poucas empresas acima do mapa. Estar entre elas é a questão inteira da busca local.' },
            { icon: Star, title: 'As avaliações vêm antes', body: 'A nota e o número de avaliações ficam ao lado do nome, antes de qualquer outra coisa. Uma avaliação sem resposta continua assim.' },
          ],
        },
        {
          kind: 'steps',
          eyebrow: 'Como funciona',
          title: 'De uma conexão a um perfil que não fica calado',
          items: [
            { title: 'Conecta o perfil uma vez', body: 'Você entra com a conta do Google que gerencia o perfil e autoriza na tela do próprio Google. A permissão é só para gerenciar o perfil e a conexão é separada do Search Console. Pode desconectar a qualquer momento.' },
            { title: 'Escolhe a empresa', body: 'O sistema traz as empresas que sua conta gerencia e você escolhe em qual delas este projeto trabalha.' },
            { title: 'Publica e responde', body: 'Você escreve um post a partir de um artigo que o sistema publicou no site, de um tema que digita ou de uma página em branco. O primeiro rascunho vem pronto e nada é publicado sem leitura. As avaliações chegam com uma resposta preparada no idioma em que foram escritas.' },
            { title: 'Acompanha a posição todo mês', body: 'Seu lugar no mapa para cada frase e cada região, as empresas que estão à sua frente e como sua posição se moveu ao longo do tempo.' },
          ],
        },
        {
          kind: 'cards',
          eyebrow: 'O que tem',
          title: 'O perfil e o mapa no mesmo sistema',
          columns: 3,
          items: [
            { icon: MapPin, title: 'Seu lugar no mapa', body: 'Posição por frase e por região: uma cidade, ou um ponto exato no mapa.' },
            { icon: Users, title: 'Quem está à frente', body: 'As empresas que ocupam as posições acima da sua, com a nota e o número de avaliações.' },
            { icon: ImagePlus, title: 'Posts com foto e botão', body: 'Uma novidade com imagem recortada na proporção que o Google mostra e um dos botões do Google: reservar, pedir, inscrever-se, saiba mais ou ligar para o número do perfil.' },
            { icon: Repeat, title: 'Publicação automática', body: 'Desligada por padrão, em cada projeto. Ligada, um artigo que o sistema publica no site vira um post no perfil com a imagem e o botão dele, e nunca duas vezes para o mesmo artigo.' },
            { icon: MessageSquareText, title: 'Uma resposta pronta para cada avaliação', body: 'As avaliações são lidas do Google em tempo real e não ficam guardadas conosco, as sem resposta são marcadas e a resposta é escrita no idioma da avaliação. Você ajusta e envia, ou apaga.' },
            { icon: BarChart3, title: 'No relatório mensal', body: 'As posições do mapa entram no relatório que você pode mandar para um cliente ou um parceiro, ao lado do resto do quadro.' },
          ],
        },
        {
          kind: 'callout',
          icon: Info,
          title: 'O que o sistema não faz',
          body: 'Ele não cria um perfil e não passa pela verificação do Google no seu lugar: isso acontece na sua própria conta do Google, que é também a conta conectada aqui. O horário, o endereço e o telefone do perfil não são alterados pelo sistema. Nenhum post e nenhuma resposta sai sem a sua aprovação, a não ser que você mesmo ligue a publicação automática. A Go Top SEO não tem vínculo com o Google, e os nomes dos produtos do Google aparecem aqui só para dizer onde o trabalho chega.',
        },
        {
          kind: 'faq',
          eyebrow: 'Perguntas',
          title: 'Perfil da Empresa no Google, em palavras simples',
          items: [
            { q: 'É a mesma coisa que Google My Business?', a: 'Sim. O Google trocou o nome de Google My Business para Perfil da Empresa no Google e encerrou os aplicativos separados de gerenciamento; hoje o perfil é gerenciado pela busca e pelo Maps, ou pela interface com que este sistema trabalha. Muita gente ainda procura pelo nome antigo.' },
            { q: 'Preciso de site para o perfil valer a pena?', a: 'Não. Um perfil é encontrado por conta própria, e os posts e as respostas a avaliações funcionam sem site. Um site ajuda: os botões dos posts têm para onde levar, e os artigos que o sistema escreve dão ao perfil o que contar.' },
            { q: 'O sistema cria o perfil para mim?', a: 'Não. O perfil é criado e verificado na sua própria conta do Google, e é essa conta que se conecta aqui. A partir daí o sistema trabalha no perfil que já é seu.' },
            { q: 'O que de fato ajuda um perfil a aparecer?', a: 'Ninguém fora do Google conhece os pesos, e quem promete posição está adivinhando. O que se sabe: perfil completo e correto, atividade nele e avaliações respondidas. O sistema mede a posição para você ver o que o seu trabalho mudou, em vez de supor.' },
            { q: 'Em que idioma os posts são escritos?', a: 'No idioma do projeto, em qualquer um dos idiomas em que o sistema trabalha, e uma avaliação é respondida no idioma em que foi escrita. Você pode mudar cada palavra antes de publicar.' },
          ],
        },
      ],
      cta: {
        title: 'Veja onde sua empresa está no mapa',
        body: pt.closeBody,
        primary: pt.check,
        secondary: pt.trial,
      },
    },
    fr: {
      hero: {
        eyebrow: 'Fiche d’établissement Google',
        eyebrowIcon: Building2,
        title: 'Votre fiche d’établissement Google',
        accent: 'est votre vitrine',
        subtitle: 'La fiche d’établissement Google, ce qu’on appelait Google My Business, est ce que les gens voient sur Maps et dans la recherche avant d’arriver sur votre site : le nom, la note, les avis, les photos et les actualités. Le système suit votre position sur la carte, publie sur la fiche des actualités avec photo et bouton et prépare une réponse à chaque avis, au même endroit où le contenu du site est écrit.',
        trust: fr.trust,
        primary: fr.check,
        secondary: fr.trial,
        visual: (
          <MapsVisual
            positionLabel="Votre position"
            position="3"
            positionSub="à Lyon, « cabinet dentaire »"
            changeLabel="Ce mois-ci"
            change="2"
            changeSub="places gagnées"
            reviewsLabel="avis"
            rows={[
              { rank: 1, name: 'Cabinet Dentaire Bellecour', stars: 4.8, reviews: 212 },
              { rank: 2, name: 'Centre Dentaire Part-Dieu', stars: 4.6, reviews: 174 },
              { rank: 3, name: 'Votre établissement', stars: 4.7, reviews: 131, highlight: true },
              { rank: 4, name: 'Dentiste Croix-Rousse', stars: 4.4, reviews: 98 },
            ]}
          />
        ),
      },
      sections: [
        {
          kind: 'cards',
          tone: 'contrast',
          eyebrow: 'Pourquoi la fiche',
          title: 'La décision se prend sur la carte, pas sur votre site',
          intro: 'Celui qui cherche une entreprise comme la vôtre près de chez lui voit d’abord quelques établissements au-dessus de la carte, et c’est de là qu’il appelle, demande l’itinéraire ou ouvre un site.',
          items: [
            { icon: Phone, title: 'L’appel part de la fiche', body: 'Depuis un résultat de la carte, on appelle, on lance l’itinéraire ou on ouvre votre site d’un geste, parfois sans lire une seule page.' },
            { icon: Users, title: 'Peu de places, beaucoup d’entreprises', body: 'Google affiche quelques établissements au-dessus de la carte. Savoir si vous en faites partie, c’est toute la question en recherche locale.' },
            { icon: Star, title: 'Les avis se lisent en premier', body: 'La note et le nombre d’avis se trouvent à côté de votre nom, avant tout le reste. Un avis laissé sans réponse le reste.' },
          ],
        },
        {
          kind: 'steps',
          eyebrow: 'Comment ça marche',
          title: 'D’une seule connexion à une fiche qui ne reste pas muette',
          items: [
            { title: 'Vous connectez la fiche une fois', body: 'Vous vous connectez avec le compte Google qui gère la fiche et vous validez sur l’écran de Google. L’autorisation ne couvre que la gestion de la fiche, et la connexion est distincte de Search Console. Vous pouvez la retirer à tout moment.' },
            { title: 'Vous choisissez l’établissement', body: 'Le système liste les établissements que votre compte gère, et vous choisissez celui sur lequel ce projet travaille.' },
            { title: 'Vous publiez et vous répondez', body: 'Vous écrivez un post à partir d’un article que le système a publié sur votre site, d’un sujet que vous tapez ou d’une page vierge. Un premier brouillon est prêt et rien n’est publié sans lecture. Les avis arrivent avec une réponse préparée dans leur propre langue.' },
            { title: 'Vous suivez la position chaque mois', body: 'Votre place sur la carte pour chaque expression et chaque zone, les établissements qui vous précèdent, et le mouvement de votre position dans le temps.' },
          ],
        },
        {
          kind: 'cards',
          eyebrow: 'Ce que vous avez',
          title: 'La fiche et la carte dans un seul système',
          columns: 3,
          items: [
            { icon: MapPin, title: 'Votre place sur la carte', body: 'Position par expression et par zone : une ville, ou un point précis sur la carte.' },
            { icon: Users, title: 'Qui vous précède', body: 'Les établissements qui occupent les places au-dessus de la vôtre, avec leur note et leur nombre d’avis.' },
            { icon: ImagePlus, title: 'Des posts avec photo et bouton', body: 'Une actualité avec une image recadrée au format que Google affiche, et l’un des boutons de Google : réserver, commander, s’inscrire, en savoir plus, ou appeler le numéro de la fiche.' },
            { icon: Repeat, title: 'Publication automatique', body: 'Désactivée par défaut, projet par projet. Une fois activée, un article que le système publie sur votre site devient un post sur la fiche avec son image et son bouton, et jamais deux fois pour le même article.' },
            { icon: MessageSquareText, title: 'Une réponse préparée pour chaque avis', body: 'Les avis sont lus en direct chez Google et ne sont pas conservés chez nous, ceux sans réponse sont signalés, et la réponse est écrite dans la langue de l’avis. Vous la corrigez et l’envoyez, ou vous la supprimez.' },
            { icon: BarChart3, title: 'Dans le rapport mensuel', body: 'Les positions sur la carte entrent dans le rapport que vous pouvez envoyer à un client ou à un partenaire, à côté du reste.' },
          ],
        },
        {
          kind: 'callout',
          icon: Info,
          title: 'Ce que le système ne fait pas',
          body: 'Il ne crée pas de fiche et ne passe pas la validation de Google à votre place : cela se fait dans votre propre compte Google, qui est aussi le compte connecté ici. Les horaires, l’adresse et le numéro de téléphone de la fiche ne sont jamais modifiés par le système. Aucun post et aucune réponse ne part sans votre accord, sauf si vous activez vous-même la publication automatique. Go Top SEO n’est pas affiliée à Google, et les noms des produits Google ne servent ici qu’à dire où le travail aboutit.',
        },
        {
          kind: 'faq',
          eyebrow: 'Questions',
          title: 'La fiche d’établissement Google, en mots simples',
          items: [
            { q: 'Est-ce la même chose que Google My Business ?', a: 'Oui. Google a renommé Google My Business en fiche d’établissement Google et a fermé les applications de gestion séparées ; aujourd’hui une fiche se gère depuis la recherche et Maps, ou par l’interface avec laquelle ce système travaille. Beaucoup de gens cherchent encore l’ancien nom.' },
            { q: 'Faut-il un site pour que la fiche serve à quelque chose ?', a: 'Non. Une fiche se trouve d’elle-même, et les posts comme les réponses aux avis fonctionnent sans site. Un site aide tout de même : les boutons des posts ont une destination, et les articles que le système écrit donnent à la fiche quelque chose à raconter.' },
            { q: 'Le système crée-t-il la fiche pour moi ?', a: 'Non. La fiche est créée et validée dans votre propre compte Google, et c’est ce compte qui se connecte ici. À partir de là, le système travaille sur la fiche qui est déjà la vôtre.' },
            { q: 'Qu’est-ce qui aide vraiment une fiche à apparaître ?', a: 'Personne en dehors de Google ne connaît les pondérations, et quiconque promet une position devine. Ce qu’on sait : une fiche complète et exacte, de l’activité dessus, et des avis auxquels on répond. Le système mesure la position pour que vous voyiez ce que votre travail a changé, au lieu de le supposer.' },
            { q: 'Dans quelle langue les posts sont-ils écrits ?', a: 'Dans la langue du projet, dans chacune des langues où le système travaille, et un avis reçoit sa réponse dans la langue où il a été écrit. Vous pouvez changer chaque mot avant la publication.' },
          ],
        },
      ],
      cta: {
        title: 'Voyez où votre établissement se situe sur la carte',
        body: fr.closeBody,
        primary: fr.check,
        secondary: fr.trial,
      },
    },
    it: {
      hero: {
        eyebrow: 'Profilo dell’attività su Google',
        eyebrowIcon: Building2,
        title: 'Il profilo dell’attività su Google',
        accent: 'è la tua vetrina',
        subtitle: 'Il profilo dell’attività su Google, quello che si chiamava Google My Business, è ciò che le persone vedono su Maps e nella ricerca prima di arrivare sul sito: il nome, la valutazione, le recensioni, le foto e le novità. Il sistema segue la posizione sulla mappa, pubblica sul profilo novità con foto e pulsante e prepara una risposta a ogni recensione, nello stesso posto in cui si scrive il contenuto del sito.',
        trust: it.trust,
        primary: it.check,
        secondary: it.trial,
        visual: (
          <MapsVisual
            positionLabel="La tua posizione"
            position="3"
            positionSub="a Bologna, «studio dentistico»"
            changeLabel="Questo mese"
            change="2"
            changeSub="posizioni in su"
            reviewsLabel="recensioni"
            rows={[
              { rank: 1, name: 'Studio Dentistico Saragozza', stars: 4.8, reviews: 212 },
              { rank: 2, name: 'Centro Dentale Bolognina', stars: 4.6, reviews: 174 },
              { rank: 3, name: 'La tua attività', stars: 4.7, reviews: 131, highlight: true },
              { rank: 4, name: 'Dentista Porta Nuova', stars: 4.4, reviews: 98 },
            ]}
          />
        ),
      },
      sections: [
        {
          kind: 'cards',
          tone: 'contrast',
          eyebrow: 'Perché il profilo',
          title: 'La decisione si prende sulla mappa, non sul sito',
          intro: 'Chi cerca un’attività come la tua in zona vede prima qualche attività sopra la mappa, e da lì chiama, chiede il percorso o apre un sito.',
          items: [
            { icon: Phone, title: 'La telefonata parte dalla scheda', body: 'Dal risultato sulla mappa si chiama, si avvia il percorso o si apre il sito con un tocco, a volte senza leggere nemmeno una pagina.' },
            { icon: Users, title: 'Pochi posti, molte attività', body: 'Google mostra poche attività sopra la mappa. Se ci sei o non ci sei è tutta la questione della ricerca locale.' },
            { icon: Star, title: 'Le recensioni si leggono prima', body: 'La valutazione e il numero di recensioni stanno accanto al nome, prima di ogni altra cosa. Una recensione senza risposta resta così.' },
          ],
        },
        {
          kind: 'steps',
          eyebrow: 'Come funziona',
          title: 'Da un collegamento a un profilo che non resta zitto',
          items: [
            { title: 'Si collega il profilo una volta', body: 'Si entra con l’account Google che gestisce il profilo e si autorizza nella schermata di Google. L’autorizzazione serve solo a gestire il profilo e il collegamento è separato da Search Console. Si può scollegare in qualsiasi momento.' },
            { title: 'Si sceglie l’attività', body: 'Il sistema porta le attività gestite dall’account e si sceglie quella su cui lavora questo progetto.' },
            { title: 'Si pubblica e si risponde', body: 'Si scrive un post partendo da un articolo che il sistema ha pubblicato sul sito, da un argomento digitato o da una pagina bianca. La prima bozza è pronta e niente viene pubblicato senza essere letto. Le recensioni arrivano con una risposta preparata nella lingua in cui sono scritte.' },
            { title: 'Si segue la posizione ogni mese', body: 'Il posto sulla mappa per ogni frase e ogni zona, le attività che stanno davanti e come si è mossa la posizione nel tempo.' },
          ],
        },
        {
          kind: 'cards',
          eyebrow: 'Che cosa c’è',
          title: 'Il profilo e la mappa in un solo sistema',
          columns: 3,
          items: [
            { icon: MapPin, title: 'Il posto sulla mappa', body: 'Posizione per frase e per zona: una città, o un punto esatto sulla mappa.' },
            { icon: Users, title: 'Chi sta davanti', body: 'Le attività che occupano i posti sopra il tuo, con la loro valutazione e il numero di recensioni.' },
            { icon: ImagePlus, title: 'Post con foto e pulsante', body: 'Una novità con un’immagine ritagliata nel formato che Google mostra e uno dei pulsanti di Google: prenota, ordina, iscriviti, scopri di più, oppure chiama il numero del profilo.' },
            { icon: Repeat, title: 'Pubblicazione automatica', body: 'Spenta per impostazione predefinita, progetto per progetto. Quando è attiva, un articolo che il sistema pubblica sul sito diventa un post sul profilo con la sua immagine e il suo pulsante, e mai due volte per lo stesso articolo.' },
            { icon: MessageSquareText, title: 'Una risposta pronta per ogni recensione', body: 'Le recensioni si leggono da Google in diretta e non restano da noi, quelle senza risposta sono segnate e la risposta è scritta nella lingua della recensione. Si corregge e si invia, oppure si cancella.' },
            { icon: BarChart3, title: 'Nel report mensile', body: 'Le posizioni sulla mappa entrano nel report che si può mandare a un cliente o a un partner, accanto al resto del quadro.' },
          ],
        },
        {
          kind: 'callout',
          icon: Info,
          title: 'Che cosa il sistema non fa',
          body: 'Non crea un profilo e non passa al posto tuo la verifica di Google: questo avviene nel tuo account Google, che è anche l’account collegato qui. Gli orari, l’indirizzo e il numero di telefono del profilo non vengono mai modificati dal sistema. Nessun post e nessuna risposta esce senza la tua approvazione, a meno che non sia tu ad attivare la pubblicazione automatica. Go Top SEO non è affiliata a Google, e i nomi dei prodotti Google compaiono qui solo per dire dove arriva il lavoro.',
        },
        {
          kind: 'faq',
          eyebrow: 'Domande',
          title: 'Il profilo dell’attività su Google, in parole semplici',
          items: [
            { q: 'È la stessa cosa di Google My Business?', a: 'Sì. Google ha cambiato il nome da Google My Business a profilo dell’attività su Google e ha chiuso le applicazioni di gestione separate; oggi il profilo si gestisce dalla ricerca e da Maps, o attraverso l’interfaccia con cui lavora questo sistema. Molti cercano ancora il nome vecchio.' },
            { q: 'Serve un sito perché il profilo valga qualcosa?', a: 'No. Un profilo si trova da solo, e i post e le risposte alle recensioni funzionano anche senza sito. Un sito aiuta: i pulsanti dei post hanno dove portare, e gli articoli che il sistema scrive danno al profilo qualcosa da raccontare.' },
            { q: 'Il sistema crea il profilo al posto mio?', a: 'No. Il profilo si crea e si verifica nel tuo account Google, ed è quello l’account che si collega qui. Da lì il sistema lavora sul profilo che è già tuo.' },
            { q: 'Che cosa aiuta davvero un profilo a comparire?', a: 'Nessuno fuori da Google conosce i pesi, e chi promette una posizione sta indovinando. Quello che si sa: un profilo completo ed esatto, attività su di esso e recensioni a cui si risponde. Il sistema misura la posizione perché si veda che cosa ha cambiato il lavoro, invece di immaginarlo.' },
            { q: 'In che lingua vengono scritti i post?', a: 'Nella lingua del progetto, in ognuna delle lingue in cui il sistema lavora, e una recensione riceve risposta nella lingua in cui è stata scritta. Ogni parola si può cambiare prima di pubblicare.' },
          ],
        },
      ],
      cta: {
        title: 'Guarda dove si trova la tua attività sulla mappa',
        body: it.closeBody,
        primary: it.check,
        secondary: it.trial,
      },
    },
    ja: {
      hero: {
        eyebrow: 'Googleビジネスプロフィール',
        eyebrowIcon: Building2,
        title: 'Googleビジネスプロフィールは',
        accent: 'お客様が最初に見る店先です',
        subtitle: 'Googleビジネスプロフィール（かつてのGoogle My Business）は、お客様がサイトにたどり着く前に、マップや検索で目にする情報です。店名、評価、口コミ、写真、お知らせがそこに並びます。本システムは、マップでの掲載順位を記録し、写真とボタン付きのお知らせをプロフィールに投稿し、口コミへの返信の下書きを用意します。サイトの記事を書く場所と同じ画面で行えます。',
        trust: ja.trust,
        primary: ja.check,
        secondary: ja.trial,
        visual: (
          <MapsVisual
            positionLabel="現在の順位"
            position="3"
            positionSub="渋谷区「歯科医院」"
            changeLabel="今月"
            change="2"
            changeSub="順位上昇"
            reviewsLabel="件の口コミ"
            rows={[
              { rank: 1, name: '渋谷駅前デンタルクリニック', stars: 4.8, reviews: 212 },
              { rank: 2, name: '桜丘歯科', stars: 4.6, reviews: 174 },
              { rank: 3, name: 'お客様の店舗', stars: 4.7, reviews: 131, highlight: true },
              { rank: 4, name: '道玄坂歯科医院', stars: 4.4, reviews: 98 },
            ]}
          />
        ),
      },
      sections: [
        {
          kind: 'cards',
          tone: 'contrast',
          eyebrow: 'プロフィールが先',
          title: '判断はマップで下され、サイトでは下されません',
          intro: '近くで同じような店を探している人は、まずマップの上に並ぶ数件を見ます。電話をかけ、経路を調べ、サイトを開くのもそこからです。',
          items: [
            { icon: Phone, title: '電話はその枠からかかります', body: 'マップの検索結果から、ワンタップで電話、経路案内、サイトの表示ができます。サイトのページを一枚も読まないこともあります。' },
            { icon: Users, title: '枠は少なく、店は多い', body: 'Googleがマップの上に並べる店はごく少数です。そこに入っているかどうかが、ローカル検索のすべてです。' },
            { icon: Star, title: '口コミが先に読まれます', body: '評価と口コミ件数は店名のすぐ横に、何よりも先に表示されます。返信のない口コミは、そのまま残ります。' },
          ],
        },
        {
          kind: 'steps',
          eyebrow: '仕組み',
          title: '一度の連携から、動きの止まらないプロフィールへ',
          items: [
            { title: '一度だけ連携します', body: 'プロフィールを管理しているGoogleアカウントでログインし、Googleの画面で許可します。権限はプロフィールの管理だけに限られ、Search Consoleとは別の連携です。いつでも解除できます。' },
            { title: '店舗を選びます', body: 'アカウントが管理している店舗が一覧で表示され、このプロジェクトが扱う店舗を選びます。' },
            { title: '投稿し、返信します', body: 'システムがサイトに公開した記事から、入力した話題から、または白紙から投稿を書けます。最初の下書きが用意され、未読のまま公開されることはありません。口コミは、書かれた言語の返信案とともに届きます。' },
            { title: '毎月、順位を記録します', body: 'キーワードごと、エリアごとのマップでの順位、上位にいる店舗、そして順位の推移が残ります。' },
          ],
        },
        {
          kind: 'cards',
          eyebrow: '含まれるもの',
          title: 'プロフィールとマップを一つのシステムで',
          columns: 3,
          items: [
            { icon: MapPin, title: 'マップでの順位', body: 'キーワード別、エリア別の順位。市区町村でも、地図上の特定の地点でも指定できます。' },
            { icon: Users, title: '上位にいる店舗', body: '自店より上の枠を占めている店舗と、その評価と口コミ件数。' },
            { icon: ImagePlus, title: '写真とボタン付きの投稿', body: 'Googleの表示比率に合わせて切り抜いた画像と、Googleのボタン（予約、注文、登録、詳細、またはプロフィールの番号への発信）を添えたお知らせ。' },
            { icon: Repeat, title: '自動投稿', body: '初期設定では停止、プロジェクトごとの設定です。有効にすると、システムがサイトに公開した記事が、その画像とボタンとともにプロフィールの投稿になります。同じ記事が二度投稿されることはありません。' },
            { icon: MessageSquareText, title: '口コミごとの返信案', body: '口コミはGoogleからその場で読み込み、当方には保存しません。未返信のものには印が付き、返信は口コミの言語で書かれます。手直しして送信するか、削除します。' },
            { icon: BarChart3, title: '月次レポートに', body: 'マップでの順位は、取引先や提携先に送れるレポートに、他の指標と並んで載ります。' },
          ],
        },
        {
          kind: 'callout',
          icon: Info,
          title: 'システムが行わないこと',
          body: 'プロフィールの作成は行わず、Googleのオーナー確認を代行することもありません。それはお客様ご自身のGoogleアカウントで行うもので、ここで連携するのも同じアカウントです。営業時間、住所、電話番号がシステムによって変更されることはありません。投稿も返信も、お客様の承認なしには公開されません（自動投稿をご自身で有効にした場合を除きます）。Go Top SEOはGoogleと提携関係にはなく、Googleの製品名は作業の届く先を示すためにのみ記載しています。',
        },
        {
          kind: 'faq',
          eyebrow: 'よくある質問',
          title: 'Googleビジネスプロフィールを、やさしい言葉で',
          items: [
            { q: 'Google My Businessと同じものですか。', a: 'はい。GoogleはGoogle My Businessという名称をGoogleビジネスプロフィールに変更し、専用の管理アプリを終了しました。現在は検索とマップから、または本システムが利用している管理用の仕組みから管理します。旧称で検索する方は今も多くいます。' },
            { q: 'ウェブサイトがなくてもプロフィールは役に立ちますか。', a: 'はい。プロフィールはそれ自体で見つけてもらえますし、投稿も口コミ返信もサイトなしで機能します。ただしサイトがあると役立ちます。投稿のボタンに行き先ができ、システムが書く記事がプロフィールで伝える内容になります。' },
            { q: 'プロフィールの開設も代わりにやってくれますか。', a: 'いいえ。プロフィールの作成とオーナー確認は、お客様ご自身のGoogleアカウントで行います。そのアカウントをここで連携します。そこから先は、すでにお持ちのプロフィールに対してシステムが働きます。' },
            { q: 'プロフィールが表示されるには、実際に何が効くのですか。', a: 'Googleの外にいる誰も重み付けを知りませんし、順位を約束する人は推測で話しています。分かっているのは、正確で過不足のないプロフィール、そこでの活動、そして返信されている口コミです。本システムは順位を測り、ご自身の取り組みが何を変えたのかを推測ではなく確認できるようにします。' },
            { q: '投稿は何語で書かれますか。', a: 'プロジェクトの言語で、システムが対応するいずれの言語でも書けます。口コミには、書かれた言語で返信します。公開前に一語ずつ手直しできます。' },
          ],
        },
      ],
      cta: {
        title: 'マップでの現在の位置をご確認ください',
        body: ja.closeBody,
        primary: ja.check,
        secondary: ja.trial,
      },
    },
    de: {
      hero: {
        eyebrow: 'Google Unternehmensprofil',
        eyebrowIcon: Building2,
        title: 'Ihr Google Unternehmensprofil',
        accent: 'ist Ihr Schaufenster',
        subtitle: 'Das Google Unternehmensprofil, früher Google My Business genannt, ist das, was Menschen auf Maps und in der Suche sehen, bevor sie Ihre Website erreichen: der Name, die Bewertung, die Rezensionen, die Fotos und die Neuigkeiten. Das System verfolgt Ihre Position auf der Karte, veröffentlicht Neuigkeiten mit Foto und Button im Profil und bereitet eine Antwort auf jede Bewertung vor – an derselben Stelle, an der die Inhalte für die Website entstehen.',
        trust: de.trust,
        primary: de.check,
        secondary: de.trial,
        visual: (
          <MapsVisual
            positionLabel="Ihre Position"
            position="3"
            positionSub="in München, „Zahnarzt“"
            changeLabel="Dieser Monat"
            change="2"
            changeSub="Plätze nach oben"
            reviewsLabel="Bewertungen"
            rows={[
              { rank: 1, name: 'Zahnarztpraxis Maxvorstadt', stars: 4.8, reviews: 212 },
              { rank: 2, name: 'Dental Zentrum Schwabing', stars: 4.6, reviews: 174 },
              { rank: 3, name: 'Ihr Unternehmen', stars: 4.7, reviews: 131, highlight: true },
              { rank: 4, name: 'Zahnärzte am Isartor', stars: 4.4, reviews: 98 },
            ]}
          />
        ),
      },
      sections: [
        {
          kind: 'cards',
          tone: 'contrast',
          eyebrow: 'Warum das Profil',
          title: 'Die Entscheidung fällt auf der Karte, nicht auf Ihrer Website',
          intro: 'Wer in der Nähe ein Unternehmen wie Ihres sucht, sieht zuerst einige Einträge über der Karte – und ruft von dort aus an, lässt sich den Weg zeigen oder öffnet eine Website.',
          items: [
            { icon: Phone, title: 'Angerufen wird aus dem Eintrag', body: 'Aus einem Kartenergebnis heraus wird mit einem Tipp angerufen, navigiert oder Ihre Website geöffnet, manchmal ohne eine einzige Seite zu lesen.' },
            { icon: Users, title: 'Wenige Plätze, viele Unternehmen', body: 'Google zeigt nur einige Unternehmen über der Karte. Ob Sie dazugehören, ist die ganze Frage der lokalen Suche.' },
            { icon: Star, title: 'Die Bewertungen werden zuerst gelesen', body: 'Note und Anzahl der Bewertungen stehen direkt neben Ihrem Namen, noch vor allem anderen. Eine Bewertung ohne Antwort bleibt ohne Antwort.' },
          ],
        },
        {
          kind: 'steps',
          eyebrow: 'So funktioniert es',
          title: 'Von einer Verbindung zu einem Profil, das nicht verstummt',
          items: [
            { title: 'Profil einmal verbinden', body: 'Sie melden sich mit dem Google-Konto an, das das Profil verwaltet, und bestätigen auf dem Bildschirm von Google. Die Berechtigung gilt nur für die Verwaltung des Profils, und die Verbindung ist von der Search Console getrennt. Sie können sie jederzeit trennen.' },
            { title: 'Unternehmen auswählen', body: 'Das System listet die Unternehmen auf, die Ihr Konto verwaltet, und Sie wählen aus, an welchem dieses Projekt arbeitet.' },
            { title: 'Veröffentlichen und antworten', body: 'Sie schreiben einen Beitrag aus einem Artikel, den das System auf Ihrer Website veröffentlicht hat, aus einem Thema, das Sie eingeben, oder aus einer leeren Seite. Ein erster Entwurf liegt bereit, und nichts wird ungelesen veröffentlicht. Bewertungen kommen mit einer vorbereiteten Antwort in ihrer eigenen Sprache.' },
            { title: 'Position monatlich verfolgen', body: 'Ihr Platz auf der Karte für jede Phrase und jedes Gebiet, die Unternehmen vor Ihnen und die Entwicklung Ihrer eigenen Position über die Zeit.' },
          ],
        },
        {
          kind: 'cards',
          eyebrow: 'Was enthalten ist',
          title: 'Profil und Karte in einem System',
          columns: 3,
          items: [
            { icon: MapPin, title: 'Ihr Platz auf der Karte', body: 'Position nach Phrase und nach Gebiet: eine Stadt oder ein genauer Punkt auf der Karte.' },
            { icon: Users, title: 'Wer vor Ihnen liegt', body: 'Die Unternehmen auf den Plätzen über Ihrem, mit ihrer Note und der Anzahl ihrer Bewertungen.' },
            { icon: ImagePlus, title: 'Beiträge mit Foto und Button', body: 'Eine Neuigkeit mit einem Bild im Seitenverhältnis, das Google anzeigt, und einem der Buttons von Google: buchen, bestellen, anmelden, mehr erfahren oder die Nummer im Profil anrufen.' },
            { icon: Repeat, title: 'Automatisches Veröffentlichen', body: 'Standardmäßig aus, je Projekt einstellbar. Ist es an, wird ein Artikel, den das System auf Ihrer Website veröffentlicht, mit seinem Bild und seinem Button zu einem Beitrag im Profil – und nie zweimal für denselben Artikel.' },
            { icon: MessageSquareText, title: 'Für jede Bewertung ein Antwortentwurf', body: 'Bewertungen werden live bei Google gelesen und nicht bei uns gespeichert, unbeantwortete sind markiert, und die Antwort entsteht in der Sprache der Bewertung. Sie bearbeiten und senden sie oder löschen sie.' },
            { icon: BarChart3, title: 'Im monatlichen Bericht', body: 'Die Positionen auf der Karte stehen in dem Bericht, den Sie an einen Kunden oder einen Partner senden können, neben dem übrigen Bild.' },
          ],
        },
        {
          kind: 'callout',
          icon: Info,
          title: 'Was das System nicht tut',
          body: 'Es erstellt kein Profil und übernimmt die Bestätigung bei Google nicht für Sie: das geschieht in Ihrem eigenen Google-Konto, und dieses Konto wird hier verbunden. Öffnungszeiten, Adresse und Telefonnummer im Profil werden vom System nie geändert. Kein Beitrag und keine Antwort geht ohne Ihre Zustimmung hinaus, es sei denn, Sie schalten das automatische Veröffentlichen selbst ein. Go Top SEO ist nicht mit Google verbunden, und die Produktnamen von Google stehen hier nur dafür, wo die Arbeit landet.',
        },
        {
          kind: 'faq',
          eyebrow: 'Fragen',
          title: 'Das Google Unternehmensprofil, in einfachen Worten',
          items: [
            { q: 'Ist das dasselbe wie Google My Business?', a: 'Ja. Google hat Google My Business in Google Unternehmensprofil umbenannt und die getrennten Verwaltungs-Apps eingestellt; heute wird ein Profil aus der Suche und aus Maps verwaltet oder über die Schnittstelle, mit der dieses System arbeitet. Viele suchen weiterhin nach dem alten Namen.' },
            { q: 'Brauche ich eine Website, damit das Profil etwas wert ist?', a: 'Nein. Ein Profil wird für sich gefunden, und Beiträge wie Bewertungsantworten funktionieren ohne Website. Eine Website hilft dennoch: die Buttons der Beiträge haben ein Ziel, und die Artikel, die das System schreibt, geben dem Profil etwas zu erzählen.' },
            { q: 'Legt das System das Profil für mich an?', a: 'Nein. Das Profil wird in Ihrem eigenen Google-Konto angelegt und bestätigt, und genau dieses Konto wird hier verbunden. Ab diesem Punkt arbeitet das System an dem Profil, das schon Ihnen gehört.' },
            { q: 'Was hilft einem Profil wirklich, zu erscheinen?', a: 'Niemand außerhalb von Google kennt die Gewichtung, und wer eine Position verspricht, rät. Bekannt ist: ein vollständiges, richtiges Profil, Aktivität darauf und Bewertungen, die beantwortet werden. Das System misst die Position, damit Sie sehen, was Ihre Arbeit verändert hat, statt es anzunehmen.' },
            { q: 'In welcher Sprache werden die Beiträge geschrieben?', a: 'In der Sprache des Projekts, in jeder der Sprachen, in denen das System arbeitet, und eine Bewertung wird in der Sprache beantwortet, in der sie geschrieben wurde. Sie können vor dem Veröffentlichen jedes Wort ändern.' },
          ],
        },
      ],
      cta: {
        title: 'Sehen Sie, wo Ihr Unternehmen auf der Karte steht',
        body: de.closeBody,
        primary: de.check,
        secondary: de.trial,
      },
    },
    nl: {
      hero: {
        eyebrow: 'Google Bedrijfsprofiel',
        eyebrowIcon: Building2,
        title: 'Uw Google Bedrijfsprofiel',
        accent: 'is uw etalage',
        subtitle: 'Het Google Bedrijfsprofiel, voorheen Google Mijn Bedrijf en in het Engels Google My Business, is wat mensen op Maps en in de zoekresultaten zien voordat ze uw site bereiken: de naam, de beoordeling, de reviews, de foto’s en het nieuws. Het systeem volgt uw positie op de kaart, plaatst nieuws met foto en knop in het profiel en schrijft een antwoord op elke review, op dezelfde plek waar de inhoud voor de site wordt geschreven.',
        trust: nl.trust,
        primary: nl.check,
        secondary: nl.trial,
        visual: (
          <MapsVisual
            positionLabel="Uw positie"
            position="3"
            positionSub="in Utrecht, ‘tandarts’"
            changeLabel="Deze maand"
            change="2"
            changeSub="plaatsen omhoog"
            reviewsLabel="reviews"
            rows={[
              { rank: 1, name: 'Tandartspraktijk Wittevrouwen', stars: 4.8, reviews: 212 },
              { rank: 2, name: 'Dental Centrum Lombok', stars: 4.6, reviews: 174 },
              { rank: 3, name: 'Uw bedrijf', stars: 4.7, reviews: 131, highlight: true },
              { rank: 4, name: 'Tandartsen Oudegracht', stars: 4.4, reviews: 98 },
            ]}
          />
        ),
      },
      sections: [
        {
          kind: 'cards',
          tone: 'contrast',
          eyebrow: 'Waarom het profiel',
          title: 'De keuze valt op de kaart, niet op uw site',
          intro: 'Wie in de buurt een bedrijf als het uwe zoekt, ziet eerst een paar bedrijven boven de kaart en belt, vraagt de route of opent daar een site.',
          items: [
            { icon: Phone, title: 'Er wordt vanuit het kaartje gebeld', body: 'Vanuit een resultaat op de kaart belt men, start men de route of opent men uw site met één tik, soms zonder één pagina te lezen.' },
            { icon: Users, title: 'Weinig plaatsen, veel bedrijven', body: 'Google zet maar een handvol bedrijven boven de kaart. Of u daartussen staat, is de hele vraag in lokaal zoeken.' },
            { icon: Star, title: 'De reviews worden eerst gelezen', body: 'De beoordeling en het aantal reviews staan naast uw naam, nog voor al het andere. Een review zonder antwoord blijft zonder antwoord.' },
          ],
        },
        {
          kind: 'steps',
          eyebrow: 'Hoe het werkt',
          title: 'Van één koppeling naar een profiel dat niet stilvalt',
          items: [
            { title: 'U koppelt het profiel één keer', body: 'U meldt zich aan met het Google-account dat het profiel beheert en geeft toestemming op het scherm van Google zelf. De toestemming geldt alleen voor het beheren van het profiel en staat los van Search Console. U kunt de koppeling altijd verbreken.' },
            { title: 'U kiest het bedrijf', body: 'Het systeem haalt de bedrijven op die uw account beheert, en u kiest aan welk bedrijf dit project werkt.' },
            { title: 'U plaatst en u antwoordt', body: 'U schrijft een bericht vanuit een artikel dat het systeem op uw site heeft gezet, vanuit een onderwerp dat u typt of vanuit een leeg blad. Er ligt een eerste versie klaar en niets gaat ongelezen online. Reviews komen binnen met een antwoord in de taal waarin ze zijn geschreven.' },
            { title: 'U volgt de positie elke maand', body: 'Uw plaats op de kaart per zoekterm en per gebied, de bedrijven die voor u staan en hoe uw eigen positie in de tijd is bewogen.' },
          ],
        },
        {
          kind: 'cards',
          eyebrow: 'Wat erin zit',
          title: 'Het profiel en de kaart in één systeem',
          columns: 3,
          items: [
            { icon: MapPin, title: 'Uw plaats op de kaart', body: 'Positie per zoekterm en per gebied: een stad, of een exact punt op de kaart.' },
            { icon: Users, title: 'Wie voor u staat', body: 'De bedrijven op de plaatsen boven de uwe, met hun beoordeling en hun aantal reviews.' },
            { icon: ImagePlus, title: 'Berichten met foto en knop', body: 'Nieuws met een afbeelding in de verhouding die Google laat zien, en een van de knoppen van Google: reserveren, bestellen, aanmelden, meer informatie, of bellen naar het nummer in het profiel.' },
            { icon: Repeat, title: 'Automatisch plaatsen', body: 'Standaard uit, per project. Staat het aan, dan wordt een artikel dat het systeem op uw site publiceert een bericht in het profiel met de eigen afbeelding en knop, en nooit twee keer voor hetzelfde artikel.' },
            { icon: MessageSquareText, title: 'Voor elke review een antwoord klaar', body: 'Reviews worden live bij Google gelezen en niet bij ons bewaard, de onbeantwoorde zijn gemarkeerd en het antwoord wordt geschreven in de taal van de review. U past het aan en verstuurt het, of u verwijdert het.' },
            { icon: BarChart3, title: 'In het maandrapport', body: 'De posities op de kaart komen in het rapport dat u naar een klant of een partner kunt sturen, naast de rest van het beeld.' },
          ],
        },
        {
          kind: 'callout',
          icon: Info,
          title: 'Wat het systeem niet doet',
          body: 'Het maakt geen profiel aan en doorloopt de verificatie van Google niet voor u: dat gebeurt in uw eigen Google-account, en dat is ook het account dat hier gekoppeld wordt. De openingstijden, het adres en het telefoonnummer in het profiel worden door het systeem nooit gewijzigd. Geen bericht en geen antwoord gaat zonder uw goedkeuring naar buiten, tenzij u zelf het automatisch plaatsen aanzet. Go Top SEO is niet verbonden aan Google, en de productnamen van Google staan hier alleen om te zeggen waar het werk terechtkomt.',
        },
        {
          kind: 'faq',
          eyebrow: 'Vragen',
          title: 'Het Google Bedrijfsprofiel, in gewone woorden',
          items: [
            { q: 'Is dit hetzelfde als Google My Business?', a: 'Ja. Google heeft Google My Business omgedoopt tot Google Bedrijfsprofiel en de aparte beheerapps gestopt; een profiel wordt nu beheerd vanuit de zoekresultaten en Maps, of via de koppeling waarmee dit systeem werkt. Veel mensen zoeken nog op de oude naam.' },
            { q: 'Heb ik een website nodig om iets aan het profiel te hebben?', a: 'Nee. Een profiel wordt op zichzelf gevonden, en berichten en antwoorden op reviews werken zonder site. Een site helpt wel: de knoppen in de berichten hebben een bestemming, en de artikelen die het systeem schrijft geven het profiel iets te vertellen.' },
            { q: 'Maakt het systeem het profiel voor mij aan?', a: 'Nee. Het profiel wordt aangemaakt en geverifieerd in uw eigen Google-account, en dat account koppelt u hier. Vanaf dat punt werkt het systeem aan het profiel dat al het uwe is.' },
            { q: 'Wat helpt een profiel echt om te verschijnen?', a: 'Niemand buiten Google kent de weging, en wie een positie belooft, gokt. Wat bekend is: een volledig en kloppend profiel, activiteit erop en reviews die worden beantwoord. Het systeem meet de positie, zodat u ziet wat uw werk heeft veranderd in plaats van het aan te nemen.' },
            { q: 'In welke taal worden de berichten geschreven?', a: 'In de taal van het project, in elk van de talen waarin het systeem werkt, en een review wordt beantwoord in de taal waarin die is geschreven. U kunt elk woord aanpassen voordat er iets online gaat.' },
          ],
        },
      ],
      cta: {
        title: 'Bekijk waar uw bedrijf op de kaart staat',
        body: nl.closeBody,
        primary: nl.check,
        secondary: nl.trial,
      },
    },
    pl: {
      hero: {
        eyebrow: 'Profil Firmy w Google',
        eyebrowIcon: Building2,
        title: 'Profil Firmy w Google',
        accent: 'to Twoja wizytówka w wyszukiwarce',
        subtitle: 'Profil Firmy w Google, dawniej Google Moja Firma, a po angielsku Google My Business, to wizytówka widoczna w Mapach i w wyszukiwarce, zanim ktokolwiek trafi na stronę: nazwa, ocena, opinie, zdjęcia i aktualności. System śledzi pozycję na mapie, publikuje w profilu nowości ze zdjęciem i przyciskiem oraz przygotowuje odpowiedź na każdą opinię, w tym samym miejscu, w którym powstają treści na stronę.',
        trust: pl.trust,
        primary: pl.check,
        secondary: pl.trial,
        visual: (
          <MapsVisual
            positionLabel="Pozycja firmy"
            position="3"
            positionSub="we Wrocławiu, „dentysta”"
            changeLabel="W tym miesiącu"
            change="2"
            changeSub="miejsca w górę"
            reviewsLabel="opinii"
            rows={[
              { rank: 1, name: 'Stomatologia Rynek', stars: 4.8, reviews: 212 },
              { rank: 2, name: 'Centrum Dentystyczne Krzyki', stars: 4.6, reviews: 174 },
              { rank: 3, name: 'Twoja firma', stars: 4.7, reviews: 131, highlight: true },
              { rank: 4, name: 'Dentysta Nadodrze', stars: 4.4, reviews: 98 },
            ]}
          />
        ),
      },
      sections: [
        {
          kind: 'cards',
          tone: 'contrast',
          eyebrow: 'Dlaczego profil',
          title: 'Decyzja zapada na mapie, nie na stronie',
          intro: 'Kto szuka w okolicy firmy takiej jak Twoja, najpierw widzi kilka firm nad mapą i właśnie stamtąd dzwoni, sprawdza trasę albo otwiera stronę.',
          items: [
            { icon: Phone, title: 'Telefon wychodzi z wizytówki', body: 'Z wyniku na mapie można zadzwonić, uruchomić nawigację albo otworzyć stronę jednym dotknięciem, czasem bez przeczytania ani jednej podstrony.' },
            { icon: Users, title: 'Mało miejsc, dużo firm', body: 'Google pokazuje nad mapą tylko kilka firm. Czy jesteś wśród nich, to całe pytanie w wyszukiwaniu lokalnym.' },
            { icon: Star, title: 'Opinie czyta się pierwsze', body: 'Ocena i liczba opinii stoją obok nazwy, przed wszystkim innym. Opinia bez odpowiedzi taka zostaje.' },
          ],
        },
        {
          kind: 'steps',
          eyebrow: 'Jak to działa',
          title: 'Od jednego połączenia do profilu, który nie milczy',
          items: [
            { title: 'Profil łączy się raz', body: 'Logujesz się kontem Google, które zarządza profilem, i zatwierdzasz na ekranie Google. Uprawnienie dotyczy wyłącznie zarządzania profilem, a połączenie jest odrębne od Search Console. Można je rozłączyć w każdej chwili.' },
            { title: 'Wybierasz firmę', body: 'System pobiera firmy, którymi zarządza Twoje konto, a Ty wybierasz tę, nad którą pracuje ten projekt.' },
            { title: 'Publikujesz i odpowiadasz', body: 'Wpis piszesz na podstawie artykułu, który system opublikował na stronie, z wpisanego tematu albo od zera. Pierwsza wersja czeka gotowa i nic nie trafia do publikacji bez przeczytania. Opinie przychodzą z gotową odpowiedzią w języku, w którym zostały napisane.' },
            { title: 'Śledzisz pozycję co miesiąc', body: 'Miejsce na mapie dla każdej frazy i każdego obszaru, firmy, które są przed Tobą, oraz to, jak Twoja pozycja zmieniała się w czasie.' },
          ],
        },
        {
          kind: 'cards',
          eyebrow: 'Co jest w środku',
          title: 'Profil i mapa w jednym systemie',
          columns: 3,
          items: [
            { icon: MapPin, title: 'Miejsce na mapie', body: 'Pozycja według frazy i według obszaru: miasto albo dokładny punkt na mapie.' },
            { icon: Users, title: 'Kto jest przed Tobą', body: 'Firmy zajmujące miejsca powyżej, z ich oceną i liczbą opinii.' },
            { icon: ImagePlus, title: 'Wpisy ze zdjęciem i przyciskiem', body: 'Nowość ze zdjęciem przyciętym do proporcji, jaką pokazuje Google, i jednym z przycisków Google: rezerwacja, zamówienie, rejestracja, więcej informacji albo połączenie z numerem z profilu.' },
            { icon: Repeat, title: 'Publikacja automatyczna', body: 'Domyślnie wyłączona, ustawiana dla każdego projektu. Po włączeniu artykuł, który system publikuje na stronie, staje się wpisem w profilu ze swoim zdjęciem i przyciskiem, i nigdy nie trafia tam dwa razy.' },
            { icon: MessageSquareText, title: 'Gotowa odpowiedź na każdą opinię', body: 'Opinie czytane są z Google na żywo i nie są u nas przechowywane, te bez odpowiedzi są oznaczone, a odpowiedź powstaje w języku opinii. Poprawiasz i wysyłasz albo usuwasz.' },
            { icon: BarChart3, title: 'W raporcie miesięcznym', body: 'Pozycje na mapie trafiają do raportu, który można wysłać klientowi lub partnerowi, obok pozostałych danych.' },
          ],
        },
        {
          kind: 'callout',
          icon: Info,
          title: 'Czego system nie robi',
          body: 'Nie zakłada profilu i nie przechodzi za Ciebie weryfikacji Google: to dzieje się na Twoim własnym koncie Google, które łączy się tutaj. Godziny otwarcia, adres i numer telefonu w profilu nigdy nie są zmieniane przez system. Żaden wpis i żadna odpowiedź nie wychodzi bez Twojej zgody, chyba że sam włączysz publikację automatyczną. Go Top SEO nie jest powiązana z Google, a nazwy produktów Google są tu tylko po to, by powiedzieć, gdzie trafia praca.',
        },
        {
          kind: 'faq',
          eyebrow: 'Pytania',
          title: 'Profil Firmy w Google, prostymi słowami',
          items: [
            { q: 'Czy to to samo co Google My Business?', a: 'Tak. Google zmieniło nazwę Google My Business na Profil Firmy w Google i zamknęło osobne aplikacje do zarządzania; dziś profilem zarządza się z wyszukiwarki i z Map albo przez interfejs, z którego korzysta ten system. Wiele osób wciąż szuka starej nazwy.' },
            { q: 'Czy profil ma sens bez strony internetowej?', a: 'Tak. Profil znajduje się sam, a wpisy i odpowiedzi na opinie działają bez strony. Strona jednak pomaga: przyciski we wpisach mają dokąd prowadzić, a artykuły, które pisze system, dają profilowi o czym mówić.' },
            { q: 'Czy system zakłada profil za mnie?', a: 'Nie. Profil zakłada się i weryfikuje na Twoim własnym koncie Google i to konto łączy się tutaj. Od tego miejsca system pracuje na profilu, który już jest Twój.' },
            { q: 'Co naprawdę pomaga profilowi się pokazywać?', a: 'Nikt poza Google nie zna wag, a kto obiecuje pozycję, zgaduje. Wiadomo tyle: kompletny i zgodny z prawdą profil, aktywność w nim oraz opinie, na które ktoś odpowiada. System mierzy pozycję, żebyś widział, co zmieniła Twoja praca, zamiast się jej domyślać.' },
            { q: 'W jakim języku powstają wpisy?', a: 'W języku projektu, w każdym z języków, w których pracuje system, a opinia dostaje odpowiedź w języku, w którym została napisana. Każde słowo można zmienić przed publikacją.' },
          ],
        },
      ],
      cta: {
        title: 'Sprawdź, gdzie Twoja firma stoi na mapie',
        body: pl.closeBody,
        primary: pl.check,
        secondary: pl.trial,
      },
    },
    ko: {
      hero: {
        eyebrow: '구글 비즈니스 프로필',
        eyebrowIcon: Building2,
        title: '구글 비즈니스 프로필은',
        accent: '검색에서 보이는 업체의 얼굴입니다',
        subtitle: '구글 비즈니스 프로필(옛 이름 Google My Business)은 누군가 사이트에 들어오기 전에 지도와 검색에서 먼저 보는 화면입니다. 업체 이름, 별점, 리뷰, 사진, 소식이 거기에 있습니다. 서비스는 지도에서의 순위를 기록하고, 사진과 버튼이 있는 게시물을 프로필에 올리고, 모든 리뷰의 답변 초안을 준비합니다. 사이트의 글을 쓰는 바로 그 화면에서 함께 합니다.',
        trust: ko.trust,
        primary: ko.check,
        secondary: ko.trial,
        visual: (
          <MapsVisual
            positionLabel="업체 순위"
            position="3"
            positionSub="서울 강남, 「치과」"
            changeLabel="이번 달"
            change="2"
            changeSub="계단 상승"
            reviewsLabel="개 리뷰"
            rows={[
              { rank: 1, name: '강남역 치과', stars: 4.8, reviews: 212 },
              { rank: 2, name: '서울 화이트 치과', stars: 4.6, reviews: 174 },
              { rank: 3, name: '고객님의 업체', stars: 4.7, reviews: 131, highlight: true },
              { rank: 4, name: '논현 미소 치과', stars: 4.4, reviews: 98 },
            ]}
          />
        ),
      },
      sections: [
        {
          kind: 'cards',
          tone: 'contrast',
          eyebrow: '왜 프로필인가',
          title: '결정은 지도에서 납니다, 사이트에서가 아니라',
          intro: '근처에서 고객님 같은 업체를 찾는 사람은 지도 위에 뜨는 몇 곳을 먼저 봅니다. 전화도, 길찾기도, 사이트 열기도 거기에서 시작됩니다.',
          items: [
            { icon: Phone, title: '전화가 프로필에서 걸립니다', body: '지도의 결과에서 한 번 눌러 전화를 걸고, 길찾기를 켜고, 사이트를 엽니다. 사이트의 어느 페이지도 읽지 않은 채로 그렇게 되는 일도 적지 않습니다.' },
            { icon: Users, title: '자리는 적고 업체는 많습니다', body: '구글은 지도 위에 몇 곳만 보여 줍니다. 그 안에 들어가는지가 지역 검색의 전부입니다.' },
            { icon: Star, title: '리뷰가 가장 먼저 읽힙니다', body: '별점과 리뷰 수가 업체 이름 옆에, 다른 모든 것보다 앞에 놓입니다. 답변 없는 리뷰는 그대로 남습니다.' },
          ],
        },
        {
          kind: 'steps',
          eyebrow: '어떻게 되는지',
          title: '한 번의 연결에서, 말을 하는 프로필까지',
          items: [
            { title: '프로필은 한 번 연결합니다', body: '프로필을 관리하시는 구글 계정으로 로그인하시고 구글 화면에서 승인하십니다. 권한은 프로필 관리에만 쓰이고, 이 연결은 Search Console 연결과 별개입니다. 언제든 해제하실 수 있습니다.' },
            { title: '업체를 고르십니다', body: '서비스가 고객님 계정이 관리하는 업체를 불러오고, 이 프로젝트가 작업할 업체를 고객님이 고르십니다.' },
            { title: '게시물을 올리고 답변합니다', body: '게시물은 서비스가 사이트에 발행한 글에서, 적어 주신 주제에서, 또는 처음부터 씁니다. 초안이 준비된 채로 기다리고, 읽지 않으신 것이 발행되는 일은 없습니다. 리뷰는 답변 초안과 함께 도착하며, 초안은 리뷰가 쓰인 언어로 씁니다.' },
            { title: '순위를 매월 기록합니다', body: '키워드마다, 지역마다 지도에서의 자리, 고객님보다 앞에 있는 업체, 그리고 그 자리가 시간에 따라 어떻게 움직였는지입니다.' },
          ],
        },
        {
          kind: 'cards',
          eyebrow: '무엇이 들어 있는지',
          title: '프로필과 지도가 한 시스템에',
          columns: 3,
          items: [
            { icon: MapPin, title: '지도에서의 자리', body: '키워드별, 지역별 순위입니다. 도시로도, 지도의 한 점으로도 볼 수 있습니다.' },
            { icon: Users, title: '앞에 있는 업체', body: '위의 자리를 차지한 업체와 그 별점, 리뷰 수입니다.' },
            { icon: ImagePlus, title: '사진과 버튼이 있는 게시물', body: '구글이 보여 주는 비율로 자른 사진과, 구글의 버튼 가운데 하나입니다. 예약, 주문, 가입, 자세히 보기, 또는 프로필의 번호로 전화하기입니다.' },
            { icon: Repeat, title: '자동 발행', body: '기본값은 꺼져 있고 프로젝트마다 정합니다. 켜 두시면 서비스가 사이트에 발행하는 글이 사진과 버튼이 있는 게시물로 프로필에도 올라가며, 같은 글이 두 번 올라가지는 않습니다.' },
            { icon: MessageSquareText, title: '모든 리뷰에 준비된 답변', body: '리뷰는 구글에서 그때그때 읽고 회사에 저장하지 않습니다. 답변이 없는 리뷰는 표시되고, 답변은 리뷰의 언어로 씁니다. 고치셔서 보내시거나 지우십니다.' },
            { icon: BarChart3, title: '월간 보고서 안에', body: '지도에서의 순위가 고객이나 파트너에게 보내실 수 있는 보고서에, 나머지 데이터와 나란히 들어갑니다.' },
          ],
        },
        {
          kind: 'callout',
          icon: Info,
          title: '서비스가 하지 않는 일',
          body: '프로필을 만들지 않고 구글의 인증을 대신 받지도 않습니다. 그것은 여기에 연결하시는 고객님 자신의 구글 계정에서 일어납니다. 프로필의 영업시간, 주소, 전화번호는 서비스가 결코 바꾸지 않습니다. 자동 발행을 직접 켜 두신 경우가 아니면 어떤 게시물도 어떤 답변도 고객님의 승인 없이 나가지 않습니다. Go Top SEO는 구글과 제휴하거나 보증받은 관계가 아니며, 구글의 제품 이름은 작업이 어디로 가는지 말하기 위해서만 쓰입니다.',
        },
        {
          kind: 'faq',
          eyebrow: '질문',
          title: '구글 비즈니스 프로필, 쉬운 말로',
          items: [
            { q: 'Google My Business와 같은 것입니까?', a: '같은 것입니다. 구글이 Google My Business의 이름을 구글 비즈니스 프로필로 바꾸고 따로 있던 관리 앱을 닫았습니다. 지금은 검색과 지도에서, 또는 이 서비스가 쓰는 연결로 프로필을 관리합니다. 옛 이름으로 찾으시는 분이 아직 많습니다.' },
            { q: '사이트가 없어도 프로필이 의미가 있습니까?', a: '있습니다. 프로필은 그 자체로 검색되고, 게시물과 리뷰 답변은 사이트 없이도 작동합니다. 다만 사이트가 있으면 게시물의 버튼이 갈 곳이 있고, 서비스가 쓰는 글이 프로필에 말할 거리를 줍니다.' },
            { q: '서비스가 프로필을 대신 만들어 줍니까?', a: '아닙니다. 프로필의 생성과 인증은 고객님 자신의 구글 계정에서 이루어지고, 그 계정을 여기에 연결하십니다. 서비스는 이미 고객님의 것이 된 프로필에서 일합니다.' },
            { q: '프로필이 보이게 하는 데 실제로 무엇이 도움이 됩니까?', a: '구글 밖의 누구도 가중치를 알지 못하고, 순위를 약속하는 사람은 짐작하는 것입니다. 알려진 것은 이만큼입니다. 빠짐없고 사실에 맞는 프로필, 그 안의 활동, 그리고 누군가 답하는 리뷰입니다. 서비스는 순위를 재서, 고객님의 작업이 무엇을 바꾸었는지 짐작하지 않고 보실 수 있게 합니다.' },
            { q: '게시물은 어떤 언어로 쓰입니까?', a: '프로젝트의 언어로, 서비스가 일하는 모든 언어에서 씁니다. 리뷰에는 그 리뷰가 쓰인 언어로 답변합니다. 발행 전에 모든 단어를 고치실 수 있습니다.' },
          ],
        },
      ],
      cta: {
        title: '지도에서 고객님의 업체가 어디에 있는지 확인해 보십시오',
        body: ko.closeBody,
        primary: ko.check,
        secondary: ko.trial,
      },
    },
  },
}
