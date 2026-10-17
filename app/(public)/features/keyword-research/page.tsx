import { Metadata } from 'next'
import { Coins, Info, Lightbulb, Plus, Sparkles, Target, TrendingUp, Search } from 'lucide-react'
import { FeaturePage, type FeaturePageContent } from '@/components/public/FeaturePage'
import { KeywordIdeasVisual } from '@/components/public/feature-visuals'
import { buildHreflangAlternates } from '@/lib/seo/hreflang'
import { FEATURE_COMMON } from '@/lib/i18n/public/feature-common'

export const metadata: Metadata = {
  title: 'מחקר ביטויים | Go Top SEO',
  description: 'גלו רעיונות לביטויים מנתוני Google Ads. בדקו נפח חיפוש, תחרות והערכות CPC. הוסיפו ביטויים ישירות למעקב וליצירת שאלות AI.',
  alternates: {
    canonical: 'https://www.gotopseo.com/features/keyword-research',
    languages: buildHreflangAlternates('/features/keyword-research', '/en/features/keyword-research', '/es/features/keyword-research'),
  },
}

export default function KeywordResearchFeaturePage() {
  return <FeaturePage locale="he" content={CONTENT} path="/features/keyword-research" />
}

const C = FEATURE_COMMON.he

const CONTENT: FeaturePageContent = {
  hero: {
    eyebrow: 'מחקר ביטויים',
    eyebrowIcon: Search,
    title: 'תכתבו על מה שהלקוחות',
    accent: 'באמת מחפשים',
    subtitle: 'רעיונות לביטויים מנתוני Google Ads, עם נפח חיפוש חודשי, רמת תחרות והערכת עלות לקליק. את הטובים מוסיפים למעקב או הופכים לשאלות AI בלחיצה.',
    trust: C.trust,
    primary: C.check,
    secondary: C.trial,
    visual: (
      <KeywordIdeasVisual
        seed="התקנת מזגנים"
        headers={['ביטוי', 'חיפושים בחודש', 'תחרות']}
        rows={[
          { keyword: 'התקנת מזגן עילי', volume: '1,900', competition: 'בינונית', level: 'medium', added: true },
          { keyword: 'מחיר התקנת מזגן', volume: '1,300', competition: 'נמוכה', level: 'low' },
          { keyword: 'התקנת מיני מרכזי', volume: '590', competition: 'גבוהה', level: 'high' },
          { keyword: 'טכנאי מזגנים בחיפה', volume: '320', competition: 'נמוכה', level: 'low', added: true },
        ]}
      />
    ),
  },
  sections: [
    {
      kind: 'cards',
      tone: 'contrast',
      eyebrow: 'למה להתחיל כאן',
      title: 'מאמר מצוין על ביטוי שאף אחד לא מחפש, לא מביא אף אחד',
      intro: 'המחקר מראה מה מחפשים, כמה מחפשים, וכמה קשה להתחרות, עוד לפני שנכתבת מילה.',
      items: [
        { icon: TrendingUp, title: 'ביקוש אמיתי', body: 'נפח חיפוש חודשי משוער לכל ביטוי, מנתוני Google.' },
        { icon: Target, title: 'איפה אפשר לנצח', body: 'רמת תחרות לכל ביטוי, כדי לבחור ביטויים שאפשר באמת להגיע בהם למעלה.' },
        { icon: Coins, title: 'כמה שווה קליק', body: 'הערכת המחיר שמפרסמים משלמים על קליק, סימן טוב לכמה הביטוי שווה לעסקים.' },
      ],
    },
    {
      kind: 'steps',
      eyebrow: 'איך זה עובד',
      title: 'מרעיון לרשימת עבודה',
      items: [
        { title: 'מתחילים מביטוי או מאתר', body: 'מקלידים ביטוי או כתובת אתר, ובוחרים מדינה ושפה.' },
        { title: 'מקבלים רעיונות עם נתונים', body: 'רשימת ביטויים קשורים, עם נפח חיפוש, תחרות והערכת עלות לקליק.' },
        { title: 'מעבירים לעבודה', body: 'מוסיפים ביטויים למעקב המיקומים, או הופכים אותם לשאלות למעקב ה-AI.' },
      ],
    },
    {
      kind: 'cards',
      eyebrow: 'מה אפשר לעשות',
      title: 'כל מה שצריך כדי לבחור ביטויים נכון',
      items: [
        { icon: Lightbulb, title: 'רעיונות מביטוי או מאתר', body: 'ביטויים קשורים מתוך ביטוי אחד, או מתוך כתובת של אתר.' },
        { icon: TrendingUp, title: 'נפח חיפוש', body: 'כמה מחפשים כל ביטוי בחודש, בהערכה של Google.' },
        { icon: Target, title: 'רמת תחרות', body: 'נמוכה, בינונית או גבוהה, לכל ביטוי.' },
        { icon: Coins, title: 'הערכת עלות לקליק', body: 'טווח ההצעות בפרסום ממומן לראש העמוד.' },
        { icon: Plus, title: 'הוספה למעקב בלחיצה', body: 'ביטוי שנבחר נכנס ישר למעקב המיקומים בפרויקט.' },
        { icon: Sparkles, title: 'שאלות למעקב AI', body: 'הופכים ביטוי לשאלה בשפה טבעית, כדי לבדוק אם מנועי AI ממליצים עליכם.' },
      ],
    },
    {
      kind: 'callout',
      icon: Info,
      title: 'על הנתונים',
      body: (
        <>
          <p>הנתונים מגיעים מ-Google Ads API. נפח חיפוש, תחרות ועלות לקליק הם הערכות של Google, ומשתנים לפי תחום, עונה ומיקום.</p>
          <p>הם נקודת פתיחה טובה לבחירת נושאים. את התוצאה בפועל מודדים במעקב המיקומים.</p>
        </>
      ),
    },
  ],
  cta: {
    title: 'תמצאו את הביטויים ששווה לכתוב עליהם',
    body: C.closeBody,
    primary: C.check,
    secondary: C.trial,
  },
}
