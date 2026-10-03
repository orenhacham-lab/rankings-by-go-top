import { Metadata } from 'next'
import { Award, FileSpreadsheet, Lightbulb, LineChart, Link2, MessagesSquare, Sparkles, Target, Users } from 'lucide-react'
import { FeaturePage, type FeaturePageContent } from '@/components/public/FeaturePage'
import { AiVisual } from '@/components/public/landing/visuals'
import { buildHreflangAlternates } from '@/lib/seo/hreflang'
import { FEATURE_COMMON } from '@/lib/i18n/public/feature-common'
import { landingHe } from '@/lib/i18n/public/landing-he'

export const metadata: Metadata = {
  title: 'מעקב נראות AI | Go Top SEO',
  description: 'גלו האם העסק, האתר או המותג שלכם מופיעים בתשובות של ChatGPT, Gemini, Perplexity, Google AI וכלים נוספים. מעקב GEO - Generative Engine Optimization.',
  alternates: {
    canonical: 'https://www.gotopseo.com/features/ai-visibility-tracking',
    languages: buildHreflangAlternates(
      '/features/ai-visibility-tracking',
      '/en/features/ai-visibility-tracking'
    ),
  },
}

export default function AIVisibilityFeaturePage() {
  return <FeaturePage locale="he" content={CONTENT} />
}

const C = FEATURE_COMMON.he

const CONTENT: FeaturePageContent = {
  hero: {
    eyebrow: 'נראות במנועי AI',
    eyebrowIcon: Sparkles,
    title: 'כשלקוח שואל את ChatGPT,',
    accent: 'תדעו אם ממליצים עליכם',
    subtitle: 'המערכת שואלת את ChatGPT, Gemini, Perplexity, Copilot, Grok ו-Google AI את השאלות שהלקוחות שלכם שואלים, ומראה מי מופיע בתשובה: אתם, או המתחרה.',
    trust: C.trust,
    primary: C.check,
    secondary: C.trial,
    visual: <AiVisual copy={landingHe.features.ai.visual} />,
  },
  sections: [
    {
      kind: 'cards',
      tone: 'contrast',
      eyebrow: 'למה זה חשוב עכשיו',
      title: 'חלק מהלקוחות כבר לא מחפשים בגוגל. הם שואלים AI.',
      intro: 'מי שמופיע בתשובה מקבל את ההמלצה. מי שלא מופיע, לא קיים בשיחה.',
      items: [
        { icon: MessagesSquare, title: 'השאלה עברה לצ׳אט', body: 'במקום לעבור על עשר תוצאות, שואלים שאלה אחת ומקבלים תשובה אחת עם כמה שמות. כדאי שאחד מהם יהיה שלכם.' },
        { icon: Award, title: 'המלצה שנשמעת אמינה', body: 'כשמנוע AI מזכיר עסק בתשובה, זה נשמע כמו המלצה. לקוח שמגיע ככה כבר מגיע עם כוונה.' },
        { icon: Target, title: 'אולי המתחרים כבר שם', body: 'בלי בדיקה אי אפשר לדעת מי מקבל את ההמלצה בתחום שלכם. המעקב מראה את זה לפי שאלה ולפי מנוע.' },
      ],
    },
    {
      kind: 'steps',
      eyebrow: 'איך זה עובד',
      title: 'שלוש פעולות, ותמונה ברורה',
      items: [
        { title: 'בוחרים שאלות', body: 'המערכת מציעה שאלות מתוך הביטויים של העסק, ואתם מוסיפים או מוחקים. למשל: "מי מתקין מזגנים בחיפה?"' },
        { title: 'כל מנוע נשאל בנפרד', body: 'כל שאלה נשלחת לכל אחד מששת המנועים, והתשובה נקראת ונבדקת.' },
        { title: 'רואים מי בפנים', body: 'לכל שאלה: אם הוזכרתם, אם האתר שלכם צוטט כמקור, ומי הוזכר במקומכם.' },
      ],
    },
    {
      kind: 'cards',
      eyebrow: 'מה מקבלים',
      title: 'כל מה שצריך כדי להיכנס לתשובה',
      items: [
        { icon: Sparkles, title: 'אזכור לפי מנוע', body: 'בכל אחד מששת המנועים בנפרד, כי כל מנוע עונה אחרת.' },
        { icon: Link2, title: 'ציטוט כמקור', body: 'האם התשובה מפנה לאתר שלכם כמקור, ולא רק מזכירה את השם.' },
        { icon: Users, title: 'מי מוזכר במקומכם', body: 'המתחרים שמופיעים בתשובות, ובאילו שאלות הם לוקחים את ההמלצה.' },
        { icon: Lightbulb, title: 'מה לשפר', body: 'המלצות מה להוסיף או לשנות באתר כדי להגדיל את הסיכוי להיכנס לתשובה.' },
        { icon: LineChart, title: 'מגמה לאורך זמן', body: 'כל בדיקה נשמרת, כך שרואים אם הנראות עולה אחרי שמתפרסמים מאמרים.' },
        { icon: FileSpreadsheet, title: 'דוח PDF ו-Excel', body: 'אזכורים וציטוטים לפי מנוע, בדוח שאפשר לשלוח ללקוח או למנהל.' },
      ],
    },
    {
      kind: 'faq',
      eyebrow: 'שאלות',
      title: 'מה ששואלים על נראות ב-AI',
      items: [
        { q: 'מה ההבדל בין SEO ל-GEO?', a: 'SEO הוא הופעה בתוצאות של גוגל. GEO הוא הופעה בתשובות של מנועי AI. המערכת מודדת את שניהם, והמאמרים שהיא כותבת בנויים לשניהם: מבנה ברור, שאלות ותשובות ונתונים מובנים.' },
        { q: 'אתם מבטיחים שנופיע בתשובות?', a: 'לא. אף אחד לא שולט במה שמנוע AI עונה. מה שכן: מודדים בדיוק איפה אתם עומדים, מראים מי מופיע במקומכם, ובונים תוכן שמגדיל את הסיכוי.' },
        { q: 'איך נספרת בדיקת AI?', a: 'שאילתה אחת במנוע אחד היא בדיקה אחת. אותה שאילתה בששת המנועים היא שש בדיקות. המכסה של כל תוכנית מופיעה בעמוד המחירים.' },
      ],
    },
  ],
  cta: {
    title: 'תגלו מה ChatGPT אומר על התחום שלכם',
    body: C.closeBody,
    primary: C.check,
    secondary: C.trial,
  },
}
