import { Metadata } from 'next'
import { FileSpreadsheet, FileText, Globe, History, LineChart, Link2, MapPin, Smartphone, Target, TrendingUp } from 'lucide-react'
import { FeaturePage, type FeaturePageContent } from '@/components/public/FeaturePage'
import { RankVisual } from '@/components/public/landing/visuals'
import { buildHreflangAlternates } from '@/lib/seo/hreflang'
import { FEATURE_COMMON } from '@/lib/i18n/public/feature-common'
import { landingHe } from '@/lib/i18n/public/landing-he'

export const metadata: Metadata = {
  title: 'מעקב דירוג בגוגל חיפוש | Rankings by Go Top',
  description: 'עקבו אחרי דירוגים אורגניים בגוגל לפי ביטוי חיפוש, מדינה, שפה ומכשיר. סריקה ידנית בכל רגע וסריקה אוטומטית חודשית, דוחות מפורטים ומעקב מתחרים.',
  alternates: {
    canonical: 'https://www.gotopseo.com/features/google-organic-rank-tracking',
    languages: buildHreflangAlternates(
      '/features/google-organic-rank-tracking',
      '/en/features/google-organic-rank-tracking'
    ),
  },
}

export default function GoogleOrganicFeaturePage() {
  return <FeaturePage locale="he" content={CONTENT} />
}

const C = FEATURE_COMMON.he

const CONTENT: FeaturePageContent = {
  hero: {
    eyebrow: 'מיקומים בגוגל',
    eyebrowIcon: TrendingUp,
    title: 'תדעו איפה אתם בגוגל,',
    accent: 'ואם העבודה על האתר מביאה תוצאות',
    subtitle: 'מעקב אחרי כל ביטוי שחשוב לכם, לפי מדינה, עיר, שפה ומכשיר. סריקה ידנית מתי שרוצים, או אוטומטית פעם בחודש, עם היסטוריה של כל שינוי.',
    trust: C.trust,
    primary: C.check,
    secondary: C.trial,
    visual: <RankVisual copy={landingHe.features.rank.visual} />,
  },
  sections: [
    {
      kind: 'cards',
      tone: 'contrast',
      eyebrow: 'למה למדוד',
      title: 'מה שלא נמדד, לא משתפר',
      intro: 'בלי מעקב אי אפשר לדעת אם מאמר חדש, שינוי באתר או עבודה של ספק הזיזו משהו.',
      items: [
        { icon: LineChart, title: 'רואים את הכיוון', body: 'עלייה, ירידה או יציבות לכל ביטוי, מסריקה לסריקה.' },
        { icon: FileText, title: 'מחברים תוכן לתוצאה', body: 'רואים אילו עמודים עולים אחרי שמתפרסם מאמר, ועל מה כדאי לכתוב בפעם הבאה.' },
        { icon: Target, title: 'מתמקדים במה שקרוב', body: 'ביטויים שנמצאים ממש מתחת לעמוד הראשון הם בדרך כלל ההזדמנות הקרובה ביותר. המעקב מראה אותם.' },
      ],
    },
    {
      kind: 'steps',
      eyebrow: 'איך זה עובד',
      title: 'מגדירים פעם אחת, ורואים כל שינוי',
      items: [
        { title: 'מוסיפים ביטויים', body: 'מקלידים את הביטויים שחשובים לכם, או מוסיפים אותם ממחקר הביטויים בלחיצה.' },
        { title: 'בוחרים איפה ובאיזה מכשיר', body: 'מדינה, שפה, עיר, מחשב או נייד, כי התוצאות משתנות לפי כל אחד מהם.' },
        { title: 'סורקים ורואים מגמה', body: 'סריקה ידנית בכל רגע, או סריקה אוטומטית חודשית שרצה לבד. כל תוצאה נשמרת בהיסטוריה.' },
      ],
    },
    {
      kind: 'cards',
      eyebrow: 'מה מקבלים',
      title: 'תמונה מדויקת של המקום שלכם בגוגל',
      items: [
        { icon: Smartphone, title: 'מחשב ונייד בנפרד', body: 'התוצאות בנייד ובמחשב לא תמיד זהות. בודקים כל אחד לחוד.' },
        { icon: Globe, title: 'לפי מדינה, עיר ושפה', body: 'רואים את מה שרואה לקוח שמחפש מהמקום שחשוב לכם.' },
        { icon: Link2, title: 'איזה עמוד מופיע', body: 'לכל ביטוי רואים איזה עמוד באתר מופיע בתוצאות.' },
        { icon: History, title: 'היסטוריה מלאה', body: 'כל סריקה נשמרת, כך שאפשר לראות את הדרך ולא רק את המצב היום.' },
        { icon: MapPin, title: 'גם בגוגל מפות', body: 'את אותם ביטויים אפשר לעקוב גם במפות, לפי עיר או אזור.' },
        { icon: FileSpreadsheet, title: 'דוח PDF ו-Excel', body: 'מיקומים, שינויים והיסטוריה בדוח שאפשר לשלוח הלאה.' },
      ],
    },
    {
      kind: 'faq',
      eyebrow: 'שאלות',
      title: 'מה ששואלים על מעקב מיקומים',
      items: [
        { q: 'כל כמה זמן נבדקים המיקומים?', a: 'בכל פעם שמריצים סריקה ידנית, ובנוסף אפשר להפעיל סריקה אוטומטית חודשית. כרגע אין סריקה אוטומטית יומית או שבועית.' },
        { q: 'למה מה שאני רואה בגוגל שונה ממה שבמערכת?', a: 'גוגל מתאים תוצאות לפי מיקום, מכשיר והיסטוריית חיפוש אישית. המערכת בודקת בתנאים קבועים שהגדרתם, ולכן היא מדד טוב יותר להשוואה לאורך זמן.' },
        { q: 'כמה ביטויים אפשר לעקוב?', a: 'זה תלוי בתוכנית. המכסות המדויקות מופיעות בעמוד המחירים.' },
      ],
    },
  ],
  cta: {
    title: 'תדעו איפה אתם עומדים היום',
    body: C.closeBody,
    primary: C.check,
    secondary: C.trial,
  },
}
