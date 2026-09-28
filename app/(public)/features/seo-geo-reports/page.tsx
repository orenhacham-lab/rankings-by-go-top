import { Metadata } from 'next'
import { FileText, BarChart2, TrendingUp, Share2, Clock, Zap, Award } from 'lucide-react'
import { FeaturePage, type FeaturePageContent } from '@/components/public/FeaturePage'
import { ReportVisual } from '@/components/public/feature-visuals'
import { buildHreflangAlternates } from '@/lib/seo/hreflang'
import { authHref } from '@/lib/i18n/auth-href'

export const metadata: Metadata = {
  title: 'דוחות SEO/GEO מקצועיים | Rankings by Go Top',
  description: 'הפיקו דוחות PDF ו-Excel פרופסיונליים עם דירוגים, מגמות, תחרות ונראות AI. דוחות ללקוחות ודירוגים בלחיצת כפתור.',
  alternates: {
    canonical: 'https://www.gotopseo.com/features/seo-geo-reports',
    languages: buildHreflangAlternates(
      '/features/seo-geo-reports',
      '/en/features/seo-geo-reports'
    ),
  },
}

export default function SEOGeoReportsFeaturePage() {
  return <FeaturePage locale="he" content={CONTENT} />
}

const CONTENT: FeaturePageContent = {
  hero: {
    eyebrow: 'דוחות מקצועיים בשנייה',
    eyebrowIcon: FileText,
    title: 'דוחות SEO/GEO שלקוחות אוהבים לראות',
    subtitle: 'כל חודש, בלחיצת כפתור. דוחות PDF וExcel מקצועיים שמראים בדיוק מה קרה והיכן אתה מובילים את הלקוח.',
    primary: { label: 'התחילו ניסיון חינם', href: authHref('signup', 'he') },
    secondary: { label: 'צפו במחירים', href: '/pricing' },
    visual: (
      <ReportVisual
        title="דוח חודשי - מאי 2025"
        stats={[
          { label: 'דירוגים בעלייה', value: '+12' },
          { label: 'ביטויים בתצוגה', value: '847' },
          { label: 'זמן בדירוג 1', value: '18' },
          { label: 'משכנתא ממוצע', value: '4.2' },
        ]}
        breakdownTitle="עמודי חצי בדירוג 1-3"
        breakdown={['מילות מפתח: 12', 'דיוור: 8', 'נראות: 6']}
      />
    ),
  },
  sections: [
    {
      kind: 'cards',
      title: 'למה דוחות מקצועיים חיוניים?',
      intro: 'דוחות הם דרך לאמור ללקוח: "זה מה שעשיתי לך." זה ההבדל בין שירות טוב לשירות מעולה.',
      items: [
        { icon: Share2, title: 'הצגת ערך', body: 'דוח ברור מראה ללקוח בדיוק מה השינוי בדירוגים, בתנועה, ובביצוע כללי.' },
        { icon: Clock, title: 'חיסכון בזמן', body: 'במקום להסביר בדברים, אתה משלח דוח. לקוח רואה, מבין, ופוקוס משנה לתוכנית הבאה.' },
        { icon: Zap, title: 'בניית אמון', body: 'דוח חודשי אומר: "אני כאן, אני עובד, אני רואה תוצאות." זה בוזר דברים קטנים שבנו אמון.' },
      ],
    },
    {
      kind: 'steps',
      title: 'איך זה עובד',
      items: [
        { title: 'בחרו הגדרות דוח', body: 'בחרו אילו מדדים להוסיף לדוח: דירוגים, תחרות, AI, פרטים תרופאיים - הכל אפשרי.' },
        { title: 'המערכת מייצרת את הדוח', body: 'אנחנו מהרים את הנתונים, מייצרים גרפים, וממלאים טמפלט פרופסיונלי.' },
        { title: 'שלחו או הורידו', body: 'PDF או Excel בדקה. אתה משלח ללקוח או שמירה בלחיצת כפתור.' },
      ],
    },
    {
      kind: 'cards',
      title: 'מה כלול בדוחות',
      items: [
        { icon: BarChart2, title: 'סיכום דירוגים ומגמות', body: 'ניתוח משוקלל מלא של הדירוגים שלך. עלייה? ירידה? ניתוח מפורט של מהו השינוי.' },
        { icon: TrendingUp, title: 'גרפים ותרשימים', body: 'גרפים בחודש לחודש. קל להבין מה קרה כי הוא ויזואלי.' },
        { icon: FileText, title: 'רשימת מילים מפתח מלאה', body: 'לכל מילה מפתח: דירוג נוכחי, דירוג עבר, שינוי, URL, וציון.' },
        { icon: Award, title: 'ניתוח תחרויות', body: 'איפה אתה עומד לעומת התחרות. מי בשלוש ראשונות? מי מקדימים?' },
        { icon: Share2, title: 'אפשרויות עיצוב וברנדינג', body: 'הוסיפו לוגו שלכם. בחרו צבעים. עשו את הדוח שלכם.' },
        { icon: Clock, title: 'דוח חודשי אוטומטי', body: 'הגדירו וקבלו דוח בעצמו חודש. אפילו לא צריך לדעת.' },
      ],
    },
    {
      kind: 'audiences',
      title: 'למי זה החיוני',
      items: [
        { title: 'סוכנויות דיגיטל', body: 'אתה עובד עם מספר לקוחות וכל אחד רוצה לדעת: איך הם לקוחות שלי עושים?', bullets: ['דוחות אוטומטיים לכל לקוח', 'עדויות לערך השירות שלך', 'אמון וחידוש עם לקוחות'] },
        { title: 'עסקים בעצמם', body: 'אתה עוקב אחרי דירוגים שלך וצריך להציג למנהלים התוצאות.', bullets: ['דוחות כל חודש', 'הוכחת השקעות בSEO', 'תכנוני תחזוקה עתידיים'] },
        { title: 'מקדמי תוכן', body: 'אתה משתמש בRankings by Go Top לעקיבה, ותוכל לשתף דוחות עם צוות שלך.', bullets: ['דוחות לחודשיים לצוות', 'יעדים ברורים לכל כותב', 'דוקומנטציה של השפעת תוכן'] },
        { title: 'עסקים עם צוותי שיווק', body: 'צוות השיווק שלך צריך לדעת: האם הקמפיין שלנו עובד?', bullets: ['ROI ברור מSEO', 'משוואה עם מקורות אחרים', 'תוכניות שיפור עתידיות'] },
      ],
    },
  ],
  cta: {
    title: 'התחילו לייצר דוחות מקצועיים',
    body: 'דוח ראשון בדקה אחת. שם קורה ההבדל.',
    primary: { label: 'התחילו ניסיון חינם', href: authHref('signup', 'he') },
  },
}
