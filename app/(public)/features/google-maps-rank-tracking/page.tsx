import { Metadata } from 'next'
import { MapPin, Users, Phone, Star, Navigation, Award } from 'lucide-react'
import { FeaturePage, type FeaturePageContent } from '@/components/public/FeaturePage'
import { MapsVisual } from '@/components/public/feature-visuals'
import { buildHreflangAlternates } from '@/lib/seo/hreflang'
import { authHref } from '@/lib/i18n/auth-href'

export const metadata: Metadata = {
  title: 'מעקב דירוג בגוגל מפות | Rankings by Go Top',
  description: 'עקבו אחרי המיקום שלכם בגוגל מפות. בדקו נראות מקומית לפי עיר, אזור וביטוי חיפוש. Local SEO מתקדם.',
  alternates: {
    canonical: 'https://www.gotopseo.com/features/google-maps-rank-tracking',
    languages: buildHreflangAlternates(
      '/features/google-maps-rank-tracking',
      '/en/features/google-maps-rank-tracking'
    ),
  },
}

export default function GoogleMapsFeaturePage() {
  return <FeaturePage locale="he" content={CONTENT} />
}

const CONTENT: FeaturePageContent = {
  hero: {
    eyebrow: 'Local SEO - גוגל מפות',
    eyebrowIcon: MapPin,
    title: 'שלטו בגוגל מפות בשכונה שלכם',
    subtitle: 'לקוחות מקומיים מחפשים בגוגל מפות. אם אתם לא בשלושת המקומות הראשונים, הם ימצאו את המתחרים שלכם. דעו היכן אתם עומדים.',
    primary: { label: 'התחילו ניסיון חינם', href: authHref('signup', 'he') },
    secondary: { label: 'צפו במחירים', href: '/pricing' },
    visual: (
      <MapsVisual
        positionLabel="מיקומך"
        position="#3"
        positionSub='בתל אביב - "מסעדה איטלקית"'
        changeLabel="שינוי חודשי"
        change="1"
        changeSub="בעלייה"
        reviewsLabel="ביקורות"
        rows={[
          { rank: 1, name: 'מסעדת הכרמל', stars: 4.8, reviews: 234 },
          { rank: 2, name: 'פיצה פרימו', stars: 4.6, reviews: 189 },
          { rank: 3, name: 'המסעדה שלנו', stars: 4.5, reviews: 156, highlight: true },
          { rank: 4, name: 'אל-טאפול', stars: 4.4, reviews: 142 },
        ]}
      />
    ),
  },
  sections: [
    {
      kind: 'cards',
      title: 'למה גוגל מפות קריטי לעסקים מקומיים?',
      intro: 'כשמישהו מחפש "מסעדה בתל אביב", הוא נכנס לגוגל מפות, לא לגוגל חיפוש.',
      items: [
        { icon: Users, title: 'הכניסה הראשונה של לקוחות', body: 'לקוחות מקומיים לא מתפשרים. אם אתם לא בשלושת המקומות הראשונים בגוגל מפות, הם מוצאים מישהו אחר.' },
        { icon: Phone, title: 'שיחות וביקורים ישירים', body: 'מדירוג גבוה בגוגל מפות = שיחות ישירות וביקורים בחנות. מדד הצלחה מדויק.' },
        { icon: Star, title: 'ביקורות והערכה', body: 'דירוג גבוה בגוגל מפות יכול להשפיע על מספר הביקורות החיוביות שאתה מקבל.' },
      ],
    },
    {
      kind: 'steps',
      title: 'איך לעקוב אחרי הדירוגים שלכם',
      items: [
        { title: 'הגדירו את הסניפים שלכם', body: 'הוסיפו את כתובת העסק שלכם בגוגל מפות. אם יש לכם כמה סניפים, הוסיפו את כולם.' },
        { title: 'בחרו ביטויי חיפוש', body: 'בחרו את הביטויים שלקוחות משתמשים בהם. למשל: "מסעדה בתל אביב" או "טיפול שיניים בראש לציון".' },
        { title: 'קבלו מעקב שוטף', body: 'הריצו סריקה ידנית בכל רגע שתרצו, או הפעילו סריקה אוטומטית חודשית של הדירוגים שלכם בגוגל מפות. ראו כיצד השינויים משפיעים.' },
      ],
    },
    {
      kind: 'cards',
      title: 'יכולות מעקב גוגל מפות',
      items: [
        { icon: MapPin, title: 'מעקב לפי שכונה וקוד דואר', body: 'בדקו דירוגים לפי קוד דואר מדויק או שכונה. כל אזור יכול להיות שונה.' },
        { icon: Navigation, title: 'מעקב GPS מדויק', body: 'אפשר להגדיר דירוג לפי קואורדינטות GPS. מדויק לחלוטין.' },
        { icon: Award, title: 'היסטוריית דירוגים לאורך זמן', body: 'ראו כיצד המיקום שלכם בגוגל מפות השתנה משינוי לשינוי, וזהו מגמות עלייה או ירידה.' },
        { icon: Users, title: 'שיתוף פעולה לעסקים עם כמה סניפים', body: 'אם יש לכם כמה סניפים, אפשר לעקוב אחרי כולם בתוך מערכת אחת.' },
        { icon: Star, title: 'מעקב דירוגים תחרותיים', body: 'רוצים לדעת היכן המתחרים עומדים? אנחנו גם עוקבים אחריהם.' },
        { icon: Phone, title: 'התאמה מדויקת לפי שם העסק', body: 'המערכת מזהה את העסק שלכם בין כל התוצאות לפי שם ולפי דומיין, כדי שהדירוג שתראו יהיה תמיד מדויק.' },
      ],
    },
    {
      kind: 'audiences',
      title: 'למי זה קריטי',
      items: [
        { title: 'עסקים מקומיים עם מיקום פיזי', body: 'מסעדה, ספריה, חנות, קליניקה - כל עסק שלקוחות מחפשים ממקום מסוים.', bullets: ['דירוג בגוגל מפות = לקוחות ישירים', 'עקבו אחרי מתחרים מקומיים', 'זהו שינויים בדירוג בזמן'] },
        { title: 'עסקים עם מספר סניפים', body: 'רשתות חנויות, מרפאות ומשרדים עם כמה סניפים - כל עסק שרוצה לראות את כל הסניפים במקום אחד.', bullets: ['מעקב ממרכזי לכל סניף', 'השוואה בין ביצועי סניפים', 'סטנדרט איכות בכל מקום'] },
        { title: 'סוכנויות פרסום מקומיות', body: 'אם אתה עובד עם לקוחות מקומיים, הם רוצים לדעת - איפה אנחנו בגוגל מפות?', bullets: ['דוחות ברורים ללקוחות', 'הוכחה לערך העבודה שלך', 'יתרון תחרותי בנראות בגוגל מפות'] },
        { title: 'עסקים עם עונתיות', body: 'מלונות, בארים, שטח בחו"ל - עסקים שהביקוש משתנה לפי עונה או זמן.', bullets: ['דעו כיצד הביקוש משתנה', 'התאימו את ההשקעה בשיווק', 'שימו לב לירידות בדירוג'] },
      ],
    },
  ],
  cta: {
    title: 'שלטו בנראות שלכם בגוגל מפות היום',
    body: 'בדקו לראשונה בחינם. אתם מופתעים מהמיקום שלכם כרגע?',
    primary: { label: 'התחילו ניסיון חינם', href: authHref('signup', 'he') },
  },
}
