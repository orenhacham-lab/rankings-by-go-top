import { Metadata } from 'next'
import { ArrowUpDown, ChartColumn, Clock, Eye, FileSpreadsheet, Handshake, History, Sparkles, TrendingUp } from 'lucide-react'
import { FeaturePage, type FeaturePageContent } from '@/components/public/FeaturePage'
import { ReportsVisual } from '@/components/public/landing/visuals'
import { buildHreflangAlternates } from '@/lib/seo/hreflang'
import { FEATURE_COMMON } from '@/lib/i18n/public/feature-common'
import { landingHe } from '@/lib/i18n/public/landing-he'

export const metadata: Metadata = {
  title: 'דוחות SEO/GEO מקצועיים | Go Top SEO',
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

const C = FEATURE_COMMON.he

const CONTENT: FeaturePageContent = {
  hero: {
    eyebrow: 'דוחות',
    eyebrowIcon: ChartColumn,
    title: 'דוח שמראה מה השתנה,',
    accent: 'בלחיצה אחת',
    subtitle: 'מיקומים בגוגל ובמפות ונראות במנועי AI, בדוח PDF או Excel שמוכן לשליחה ללקוח, למנהל, או לעצמכם.',
    trust: C.trust,
    primary: C.check,
    secondary: C.trial,
    visual: <ReportsVisual copy={landingHe.features.reports.visual} />,
  },
  sections: [
    {
      kind: 'cards',
      tone: 'contrast',
      eyebrow: 'למה דוח',
      title: 'עבודה טובה צריכה להיראות',
      intro: 'דוח ברור חוסך הסברים, ומראה שהאתר מתקדם.',
      items: [
        { icon: Eye, title: 'התמונה המלאה', body: 'גוגל, מפות ו-AI במקום אחד, במקום צילומי מסך מכמה כלים.' },
        { icon: Clock, title: 'בלי להרכיב ידנית', body: 'הנתונים כבר במערכת. הדוח נוצר מהם בלחיצה.' },
        { icon: Handshake, title: 'אמון של לקוחות', body: 'לסוכנויות: דוח קבוע מראה ללקוח מה השתנה ולמה כדאי להמשיך.' },
      ],
    },
    {
      kind: 'steps',
      eyebrow: 'איך זה עובד',
      title: 'מנתונים לדוח בשלושה צעדים',
      items: [
        { title: 'בוחרים פרויקט', body: 'כל אתר מנוהל כפרויקט משלו, עם הדוחות שלו.' },
        { title: 'מייצאים', body: 'PDF לשליחה, או Excel לעבודה עם הנתונים.' },
        { title: 'שולחים', body: 'ללקוח, למנהל או לשותף, בלי לעצב שום דבר.' },
      ],
    },
    {
      kind: 'cards',
      eyebrow: 'מה בדוח',
      title: 'כל מה שחשוב, בלי מה שלא',
      items: [
        { icon: TrendingUp, title: 'מיקומים ושינויים', body: 'לכל ביטוי: המיקום היום, המיקום הקודם והשינוי ביניהם.' },
        { icon: ArrowUpDown, title: 'העמוד שמופיע', body: 'איזה עמוד באתר מופיע בתוצאות לכל ביטוי.' },
        { icon: ChartColumn, title: 'תנועה משוערת', body: 'הערכה של הביקורים מגוגל, לפי נפח החיפוש והמיקום הנוכחי.' },
        { icon: Sparkles, title: 'נראות ב-AI', body: 'אזכורים וציטוטים של האתר, לכל מנוע AI בנפרד.' },
        { icon: History, title: 'היסטוריה מלאה', body: 'בקובץ ה-Excel: כל הבדיקות לאורך זמן, לא רק האחרונה.' },
        { icon: FileSpreadsheet, title: 'PDF ו-Excel', body: 'PDF מסודר לשליחה, ו-Excel למי שרוצה לעבוד עם המספרים.' },
      ],
    },
    {
      kind: 'faq',
      eyebrow: 'שאלות',
      title: 'מה ששואלים על הדוחות',
      items: [
        { q: 'הדוחות בעברית?', a: 'כן. אפשר להפיק דוח בעברית או באנגלית.' },
        { q: 'אפשר להפיק דוח לכל לקוח בנפרד?', a: 'כן. כל אתר הוא פרויקט נפרד, וכל פרויקט מקבל דוח משלו. מספר הפרויקטים בכל תוכנית מופיע בעמוד המחירים.' },
        { q: 'הדוח כלול בכל תוכנית?', a: 'כן. דוחות PDF ו-Excel כלולים בכל התוכניות.' },
      ],
    },
  ],
  cta: {
    title: 'הדוח הראשון שלכם במרחק כמה ימים',
    body: C.closeBody,
    primary: C.check,
    secondary: C.trial,
  },
}
