import { Metadata } from 'next'
import { FileSpreadsheet, History, MapPin, Navigation, Phone, Search, Store, Users } from 'lucide-react'
import { FeaturePage, type FeaturePageContent } from '@/components/public/FeaturePage'
import { MapsVisual } from '@/components/public/feature-visuals'
import { buildHreflangAlternates } from '@/lib/seo/hreflang'
import { FEATURE_COMMON } from '@/lib/i18n/public/feature-common'

export const metadata: Metadata = {
  title: 'מעקב דירוג בגוגל מפות | Go Top SEO',
  description: 'עקבו אחרי המיקום שלכם בגוגל מפות. בדקו נראות מקומית לפי עיר, אזור וביטוי חיפוש. Local SEO מתקדם.',
  alternates: {
    canonical: 'https://www.gotopseo.com/features/google-maps-rank-tracking',
    languages: buildHreflangAlternates('/features/google-maps-rank-tracking', '/en/features/google-maps-rank-tracking', '/es/features/google-maps-rank-tracking'),
  },
}

export default function GoogleMapsFeaturePage() {
  return <FeaturePage locale="he" content={CONTENT} />
}

const C = FEATURE_COMMON.he

const CONTENT: FeaturePageContent = {
  hero: {
    eyebrow: 'גוגל מפות',
    eyebrowIcon: MapPin,
    title: 'כשמחפשים עסק כמו שלכם באזור,',
    accent: 'תדעו איפה אתם במפה',
    subtitle: 'מעקב אחרי המיקום שלכם בגוגל מפות לפי ביטוי ולפי אזור: עיר, או נקודה מדויקת על המפה. רואים מי לפניכם, ואיך המיקום זז לאורך זמן.',
    trust: C.trust,
    primary: C.check,
    secondary: C.trial,
    visual: (
      <MapsVisual
        positionLabel="המיקום שלכם"
        position="3"
        positionSub='בחיפה, "התקנת מזגנים"'
        changeLabel="שינוי החודש"
        change="2"
        changeSub="מקומות למעלה"
        reviewsLabel="ביקורות"
        rows={[
          { rank: 1, name: 'קור פלוס מיזוג', stars: 4.8, reviews: 212 },
          { rank: 2, name: 'אוויר נקי', stars: 4.6, reviews: 174 },
          { rank: 3, name: 'העסק שלכם', stars: 4.7, reviews: 131, highlight: true },
          { rank: 4, name: 'מיזוג המפרץ', stars: 4.4, reviews: 98 },
        ]}
      />
    ),
  },
  sections: [
    {
      kind: 'cards',
      tone: 'contrast',
      eyebrow: 'למה המפה',
      title: 'בחיפוש מקומי, המפה היא חלון הראווה',
      intro: 'כשמחפשים שירות באזור, גוגל מציג קודם כמה עסקים על המפה. שם נופלת ההחלטה למי להתקשר.',
      items: [
        { icon: Phone, title: 'משם מתקשרים', body: 'מהתוצאות במפה אפשר להתקשר, לנווט או להיכנס לאתר בלחיצה אחת.' },
        { icon: Users, title: 'מעט מקומות, הרבה מתחרים', body: 'רק כמה עסקים מקבלים את המקומות הראשונים. חשוב לדעת אם אתם ביניהם.' },
        { icon: MapPin, title: 'כל אזור הוא תחרות אחרת', body: 'אפשר להיות ראשונים בעיר אחת ולא להופיע בשכנה. המעקב לפי אזור מראה את זה.' },
      ],
    },
    {
      kind: 'steps',
      eyebrow: 'איך זה עובד',
      title: 'שלושה צעדים למפה ברורה',
      items: [
        { title: 'מגדירים את העסק', body: 'מוסיפים את העסק ואת האזור שבו אתם עובדים.' },
        { title: 'בוחרים ביטויים ואזורים', body: 'למשל "התקנת מזגנים" בחיפה, או מנקודה מדויקת על המפה.' },
        { title: 'עוקבים לאורך זמן', body: 'סריקה ידנית בכל רגע או אוטומטית פעם בחודש, עם היסטוריה של כל שינוי.' },
      ],
    },
    {
      kind: 'cards',
      eyebrow: 'מה מקבלים',
      title: 'המקום שלכם במפה, בלי לנחש',
      items: [
        { icon: MapPin, title: 'לפי עיר או אזור', body: 'בודקים כל ביטוי באזור שבו נמצאים הלקוחות שלכם.' },
        { icon: Navigation, title: 'נקודה מדויקת על המפה', body: 'בדיקה מקואורדינטות שבחרתם, כדי לראות מה רואה לקוח שנמצא שם.' },
        { icon: Store, title: 'מי מופיע לפניכם', body: 'העסקים שמעליכם בתוצאות, עם הדירוג שלהם בגוגל.' },
        { icon: History, title: 'היסטוריית מיקומים', body: 'רואים איך המיקום השתנה מסריקה לסריקה.' },
        { icon: Search, title: 'גם בחיפוש הרגיל', body: 'את אותם ביטויים אפשר לעקוב גם בתוצאות הרגילות של גוגל.' },
        { icon: FileSpreadsheet, title: 'דוח PDF ו-Excel', body: 'המיקומים במפות נכנסים לדוח שאפשר לשלוח הלאה.' },
      ],
    },
    {
      kind: 'faq',
      eyebrow: 'שאלות',
      title: 'מה ששואלים על מעקב במפות',
      items: [
        { q: 'צריך פרופיל עסק בגוגל?', a: 'כדי להופיע במפות צריך פרופיל עסק בגוגל. המעקב מראה איפה הפרופיל שלכם מופיע, ואם הוא לא מופיע בכלל.' },
        { q: 'כל כמה זמן נבדק המיקום?', a: 'בכל פעם שמריצים סריקה ידנית, ובנוסף אפשר להפעיל סריקה אוטומטית חודשית. כרגע אין סריקה אוטומטית יומית או שבועית.' },
        { q: 'כל ביטוי במפות נספר כבדיקה נפרדת?', a: 'כן. בדיקת גוגל אחת היא ביטוי אחד ביעד אחד, כך שאותו ביטוי בחיפוש הרגיל ובמפות נספר כשתי בדיקות.' },
      ],
    },
  ],
  cta: {
    title: 'תדעו מי מקבל את השיחות באזור שלכם',
    body: C.closeBody,
    primary: C.check,
    secondary: C.trial,
  },
}
