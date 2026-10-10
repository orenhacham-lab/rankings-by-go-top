import { Metadata } from 'next'
import { FileCheck2, FileText, Globe, Image as ImageIcon, Link2, ListChecks, PenLine, Search, Send, ShieldCheck, ShoppingBag } from 'lucide-react'
import { FeaturePage, type FeaturePageContent } from '@/components/public/FeaturePage'
import { ContentVisual } from '@/components/public/landing/visuals'
import { buildHreflangAlternates } from '@/lib/seo/hreflang'
import { FEATURE_COMMON } from '@/lib/i18n/public/feature-common'
import { TRIAL_CATALOG } from '@/lib/plans/catalog'
import { landingHe } from '@/lib/i18n/public/landing-he'

export const metadata: Metadata = {
  title: 'יצירת, תזמון ופרסום מאמרי SEO ו-GEO | Go Top SEO',
  description:
    'תכננו נושאים, קבלו טיוטת מאמר מוכנה מ-AI, ערכו אותה, תזמנו אותה ופרסמו ישירות ל-WordPress או Shopify - הכול מתוך מקום אחד.',
  alternates: {
    canonical: 'https://www.gotopseo.com/features/seo-geo-content-publishing',
    languages: buildHreflangAlternates('/features/seo-geo-content-publishing', '/en/features/seo-geo-content-publishing', '/es/features/seo-geo-content-publishing'),
  },
}

export default function SeoGeoContentPublishingFeaturePage() {
  return <FeaturePage locale="he" content={CONTENT} path="/features/seo-geo-content-publishing" />
}

const C = FEATURE_COMMON.he

const faqs = [
  {
    q: 'צריך לערוך כל מאמר לפני שהוא עולה?',
    a: 'לא חובה, אבל תמיד אפשר. רק נושאים שאישרתם נכתבים, כל מאמר עובר בדיקת איכות לפני פרסום, ואתם יכולים לקרוא, לערוך ולאשר לפני שהוא עולה.',
  },
  {
    q: 'לאילו אתרים אפשר לפרסם?',
    a: 'פרסום ישיר עובד עם WordPress ועם Shopify. מחברים את האתר פעם אחת, ומאמרים מאושרים עולים אליו ישירות.',
  },
  {
    q: 'איך עובד תזמון?',
    a: 'אחרי שאישרתם מאמר, מפרסמים אותו מיד או קובעים תאריך ושעה. המערכת מפרסמת אותו לבד במועד שבחרתם.',
  },
  {
    q: 'יש תמונות וכותרות SEO?',
    a: 'כן. כל מאמר מגיע עם תמונה ראשית ותמונות בתוך הטקסט, כותרת ותיאור מטא, וכולם ניתנים לעריכה לפני הפרסום.',
  },
  {
    q: 'איך עובדת מכסת המאמרים?',
    a: 'כל תוכנית כוללת מספר מאמרים לכל מחזור חיוב. המכסה היא לכל החשבון, מתחדשת בכל מחזור, ומאמרים שלא נוצלו לא עוברים הלאה. יצירת מאמר צורכת מאמר אחד; עריכה, תזמון ופרסום לא צורכים כלום.',
  },
  {
    q: 'מה קורה אם המכסה נגמרה באמצע החודש?',
    a: 'אפשר לשדרג לתוכנית עם יותר מאמרים ולהמשיך באותו מחזור חיוב.',
  },
  {
    q: 'אפשר לנסות לפני שמשלמים?',
    a: `כן. ${TRIAL_CATALOG.days} ימי ניסיון בלי כרטיס אשראי, כולל מאמר אחד כדי לראות את כל התהליך עד הפרסום.`,
  },
]

const CONTENT: FeaturePageContent = {
  hero: {
    eyebrow: 'כתיבה ופרסום',
    eyebrowIcon: FileText,
    title: 'מאמרים שנכתבים ומתפרסמים באתר,',
    accent: 'בלי צוות תוכן',
    subtitle: 'מתכננים נושאים, מאשרים, ומקבלים מאמר מלא עם תמונות, שאלות ותשובות וקישורים פנימיים. עורכים אם רוצים, ומפרסמים ל-WordPress או ל-Shopify, מיד או בתאריך שבחרתם.',
    trust: C.trust,
    primary: C.check,
    secondary: C.trial,
    visual: <ContentVisual copy={landingHe.features.content.visual} />,
  },
  sections: [
    {
      kind: 'cards',
      tone: 'contrast',
      eyebrow: 'למה תוכן נתקע',
      title: 'תוכן נדחה כי הוא בעצם שלוש עבודות',
      intro: 'למצוא נושא, לכתוב, ולהעלות לאתר. כל אחת לוקחת זמן, אז זה נדחה לחודש הבא. כאן שלושתן קורות במקום אחד.',
      items: [
        { icon: Search, title: 'למצוא על מה לכתוב', body: 'לבדוק מה מחפשים, מה המתחרים כבר כתבו, ומה עוד חסר באתר.' },
        { icon: PenLine, title: 'לכתוב טוב', body: 'טיוטה טובה לוקחת שעות, ואחריה עוד עריכה ובדיקה.' },
        { icon: Send, title: 'להעלות לאתר', body: 'להעתיק, להעלות תמונות, למלא שדות SEO, ולזכור לפרסם.' },
      ],
    },
    {
      kind: 'steps',
      eyebrow: 'איך זה עובד',
      title: 'מנושא למאמר באוויר, בחמישה צעדים',
      items: [
        { title: 'מתכננים נושאים', body: 'המערכת מציעה נושאים לפי הביטויים והתחום של העסק.' },
        { title: 'מאשרים', body: 'בוחרים את הנושאים שמתאימים עכשיו. רק הם נכתבים.' },
        { title: 'מקבלים מאמר מלא', body: 'כותרת, גוף, כותרות משנה, תמונות, שאלות ותשובות וקישורים פנימיים.' },
        { title: 'עוברים ועורכים', body: 'קוראים, משנים כמה שרוצים, ומאשרים כשזה מוכן.' },
        { title: 'מתזמנים או מפרסמים', body: 'מיד, או בתאריך ושעה שבחרתם, ישירות ל-WordPress או ל-Shopify.' },
      ],
    },
    {
      kind: 'cards',
      eyebrow: 'מה יש בכל מאמר',
      title: 'מאמר שלם, לא טקסט גולמי',
      items: [
        { icon: FileText, title: 'מאמר מלא', body: 'מהנושא שאישרתם נכתב מאמר שלם, לא תקציר ולא ראשי פרקים.' },
        { icon: ImageIcon, title: 'תמונות', body: 'תמונה ראשית ותמונות בתוך הטקסט, בלי לחפש ולהעלות בעצמכם.' },
        { icon: ListChecks, title: 'שאלות ותשובות ונתונים מובנים', body: 'מקטע שאלות ותשובות בכל מאמר. באתרי וורדפרס עם התוסף של Go Top מתווספים גם נתונים מובנים שגוגל ומנועי AI יודעים לקרוא.' },
        { icon: Link2, title: 'קישורים פנימיים', body: 'קישורים לעמודים רלוונטיים אצלכם נוספים לטיוטה בזמן הכתיבה, ואתם עוברים על המאמר לפני הפרסום.' },
        { icon: FileCheck2, title: 'כותרת ותיאור מטא', body: 'מותאמים לחיפוש, וניתנים לעריכה כמו כל השאר.' },
        { icon: ShieldCheck, title: 'בדיקת איכות לפני פרסום', body: 'כל מאמר נבדק לפני שהוא עולה, כדי שלא יתפרסם משהו חסר.' },
      ],
    },
    {
      kind: 'cards',
      eyebrow: 'פרסום ישיר',
      title: 'מחברים פעם אחת, ומפרסמים בלי להעתיק',
      intro: 'מאמר שאישרתם עובר ישירות לאתר, עם התמונות ושדות ה-SEO.',
      items: [
        { icon: Globe, title: 'WordPress', body: 'מחברים את אתר ה-WordPress ומפרסמים אליו מאמרים מיד או בתזמון.' },
        { icon: ShoppingBag, title: 'Shopify', body: 'מחברים את חנות ה-Shopify ומפרסמים מאמרי בלוג ישירות מהמערכת.' },
      ],
    },
    { kind: 'faq', eyebrow: 'שאלות', title: 'מה ששואלים על כתיבה ופרסום', items: faqs },
  ],
  cta: {
    title: 'המאמר הבא שלכם יכול להיכתב עוד היום',
    body: C.closeBody,
    primary: C.check,
    secondary: C.trial,
  },
}
