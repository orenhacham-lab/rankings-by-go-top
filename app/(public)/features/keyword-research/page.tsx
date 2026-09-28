import { Metadata } from 'next'
import { Search, TrendingUp, Target, PieChart, Zap, Check, Info } from 'lucide-react'
import { FeaturePage, type FeaturePageContent } from '@/components/public/FeaturePage'
import { buildHreflangAlternates } from '@/lib/seo/hreflang'
import { authHref } from '@/lib/i18n/auth-href'

export const metadata: Metadata = {
  title: 'מחקר ביטויים | Rankings by Go Top',
  description: 'גלו רעיונות לביטויים מנתוני Google Ads. בדקו נפח חיפוש, תחרות והערכות CPC. הוסיפו ביטויים ישירות למעקב וליצירת שאלות AI.',
  alternates: {
    canonical: 'https://www.gotopseo.com/features/keyword-research',
    languages: buildHreflangAlternates(
      '/features/keyword-research',
      '/en/features/keyword-research'
    ),
  },
}

export default function KeywordResearchFeaturePage() {
  return <FeaturePage locale="he" content={CONTENT} />
}

const CONTENT: FeaturePageContent = {
  hero: {
    eyebrow: 'מחקר ביטויים',
    eyebrowIcon: Search,
    title: 'גלו ביטויים עם נתוני Google Ads',
    subtitle: 'חפשו רעיונות לביטויים, בדקו נפח חיפוש ותחרות, והוסיפו אותם ישירות למעקב דירוגים או לשאלות נראות AI.',
    primary: { label: 'להתנסות בחינם', href: authHref('signup', 'he') },
    secondary: { label: 'צפייה בתמחור', href: '/pricing' },
  },
  sections: [
    {
      kind: 'cards',
      title: 'מה אפשר לעשות במערכת',
      items: [
        { icon: Search, title: 'רעיונות לביטויים', body: 'קבלו רעיונות לביטויים רלוונטיים בהתבסס על ביטוי זרע או כתובת אתר, באמצעות נתונים מ-Google Ads API.' },
        { icon: TrendingUp, title: 'נפח חיפוש', body: 'צפו בנפח חיפוש חודשי משוער לכל ביטוי כדי להבין את גודל הביקוש.' },
        { icon: Target, title: 'נתוני תחרות', body: 'בדקו את רמת התחרות (נמוכה, בינונית או גבוהה) ואת מדד התחרותיות לכל ביטוי.' },
        { icon: PieChart, title: 'הערכות CPC', body: 'ראו הערכות של הצעת מחיר מינימלית ומקסימלית בראש העמוד, להבנת עלות הקליק.' },
        { icon: Zap, title: 'הוספה מהירה לפרויקטים', body: 'הוסיפו ביטויים נבחרים ישירות לפרויקטים שלכם למעקב דירוגים מיידי.' },
        { icon: Check, title: 'יצירת שאלות AI', body: 'הפכו ביטויים לשאלות בשפה טבעית למעקב נראות במנועי AI.' },
      ],
    },
    {
      kind: 'steps',
      title: 'איך זה עובד',
      items: [
        { title: 'חפשו ביטויים', body: 'הזינו ביטוי זרע או כתובת אתר, ובחרו מדינה ושפה.' },
        { title: 'בדקו תוצאות', body: 'עיינו ברעיונות שמוצגים יחד עם נפח חיפוש, רמת תחרות והערכות CPC.' },
        { title: 'פעלו לפי הנתונים', body: 'הוסיפו ביטויים לפרויקט קיים או הפכו אותם לשאלות AI בלחיצה אחת.' },
      ],
    },
    {
      kind: 'callout',
      icon: Info,
      title: 'על מקורות הנתונים',
      body: (
        <>
          <p>נתוני מחקר הביטויים מתקבלים מ-Google Ads API. נפחי חיפוש, רמות תחרות והערכות CPC הם משוערים ומבוססים על נתונים מצטברים של Google. ביצועים בפועל עשויים להשתנות בהתאם לקמפיין, לתחום ולשאר נסיבות.</p>
          <p>השתמשו בנתונים הללו כנקודת פתיחה לאסטרטגיית ה-SEO והתוכן שלכם, ואמתו אותם תמיד מול נתוני המעקב והניתוח שלכם בפועל.</p>
        </>
      ),
    },
  ],
  cta: {
    title: 'מוכנים להאיץ את מחקר הביטויים?',
    body: 'התחילו ניסיון חינם ל-7 ימים, ללא צורך בכרטיס אשראי.',
    primary: { label: 'להתנסות בחינם', href: authHref('signup', 'he') },
  },
}
