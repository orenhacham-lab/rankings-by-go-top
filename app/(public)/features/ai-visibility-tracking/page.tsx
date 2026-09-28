import { Metadata } from 'next'
import { Brain, MessageSquare, Zap, TrendingUp, Link2, BarChart3 } from 'lucide-react'
import { FeaturePage, type FeaturePageContent } from '@/components/public/FeaturePage'
import { AiAnswersVisual } from '@/components/public/feature-visuals'
import { buildHreflangAlternates } from '@/lib/seo/hreflang'
import { authHref } from '@/lib/i18n/auth-href'

export const metadata: Metadata = {
  title: 'מעקב נראות AI | Rankings by Go Top',
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

const CONTENT: FeaturePageContent = {
  hero: {
    eyebrow: 'GEO - Generative Engine Optimization',
    eyebrowIcon: Brain,
    title: 'מעקב נראות העסק שלכם במנועי AI',
    subtitle: 'ממעט אנשים מבינים זאת, אבל יותר ויותר לקוחות משתמשים בChatGPT, Gemini, וPerplexity בחיפוש. אם אתה שם, הם ימצאו אותך.',
    primary: { label: 'התחילו ניסיון חינם', href: authHref('signup', 'he') },
    secondary: { label: 'צפו במחירים', href: '/pricing' },
    visual: (
      <AiAnswersVisual
        heading={'נראות בתשובות AI לביטוי: "הלוואה לרכישת דירה"'}
        rows={[
          { engine: 'ChatGPT (OpenAI)', detail: 'מוזכרים באתר הדירוג שלנו כחברה אמינה', ok: true, icon: MessageSquare },
          { engine: 'Gemini (Google)', detail: 'ציטוט ישיר מהאתר שלנו בתשובה', ok: true, icon: Zap },
          { engine: 'Perplexity', detail: 'לא מוזכר בתשובה', ok: false, icon: Brain },
        ]}
      />
    ),
  },
  sections: [
    {
      kind: 'cards',
      title: 'למה מעקב נראות AI משנה הכל?',
      intro: 'בעוד שנים קלות, GEO (Generative Engine Optimization) תהיה חלק חשוב לא פחות מ-SEO.',
      items: [
        { icon: Brain, title: 'חיפוש חדש = שחקנים חדשים', body: 'גוגל כבר לא הגבוה היחיד. יותר ויותר אנשים משתמשים בAI כדי למצוא תשובות, לא בגוגל רגיל.' },
        { icon: Link2, title: 'הופעה בתשובות AI = אמינות', body: 'אם ChatGPT או Gemini מציעים את האתר שלך, זה כמו הערכה מפי AI. זה שווה זהב בעיני לקוח.' },
        { icon: TrendingUp, title: 'תחרות כבר שם', body: 'התחרות שלך כבר מופיעות בתשובות AI. אם אתה לא שם, אתה מאחור.' },
      ],
    },
    {
      kind: 'steps',
      title: 'איך המעקב עובד',
      items: [
        { title: 'בחרו שאלות רלוונטיות', body: 'בחרו את השאלות שלקוחות שלכם עלולים לשאול. למשל: "איפה אני מוצא המלצות על גלריה אמנות?"' },
        { title: 'המערכת שואלת AI', body: 'אנחנו שואלים את ChatGPT, Gemini, Perplexity ועוד. כל אחד מהם נשאל בנפרד.' },
        { title: 'קבלו תוצאות ברורות', body: 'ראו לכל שאלה - היכן אתה מוזכר, איפה את מצוטט, וכיצד הדירוג משתנה לאורך זמן.' },
      ],
    },
    {
      kind: 'cards',
      title: 'מה אתה יכול למדוד',
      items: [
        { icon: Brain, title: 'מעקב כל מנועי AI', body: 'ChatGPT, Gemini, Perplexity, Google AI, ועוד - כל אחד עם מעקב נפרד.' },
        { icon: MessageSquare, title: 'איתור ציטוטים מדויק', body: 'ראו בדיוק איך האתר שלך מצוטט בתשובות AI. האם תקציר? לינק? הפניה?' },
        { icon: Link2, title: 'מעקב דפי מקור', body: 'ראו אילו דפים מהאתר שלך מקבלים ציטוטים בAI. זה עזר לאופטימיזציה.' },
        { icon: Zap, title: 'עקיבה לאורך זמן', body: 'ראו כיצד הנראות שלך משתנה בAI לאורך שבועות וחודשים.' },
        { icon: BarChart3, title: 'דוחות ממודים', body: 'דוחות PDF וExcel שמציגים את נראות AI שלך בברור.' },
        { icon: TrendingUp, title: 'השוואת תחרות', body: 'רוצים לדעת היכן המתחרים שלך מופיעים בAI? אנחנו עוקבים אחריהם.' },
      ],
    },
    {
      kind: 'audiences',
      title: 'למי זה קריטי',
      items: [
        { title: 'מקדמי תוכן וכותבים', body: 'אם אתה כותב בלוגים או תוכן, בעקבות נראות בAI זה קריטי - זו בעצם מטרת התוכן שלך.', bullets: ['דעו איילו מאמרים מצוטטים בAI', 'שפרו את הקטעים שמוזכרים', 'בנו תוכן ספציפי לאופטימיזציה GEO'] },
        { title: 'סוכנויות דיגיטל וSEO', body: 'אם אתה עובד עם לקוחות, הם בקרוב ישאלו: "איפה אנחנו בAI?"', bullets: ['דוחות חדשות לללקוחות', 'שירות נוסף לביצוע', 'תחרויות בתחום חדש'] },
        { title: 'בעלי פדקסטים / מדיה', body: 'אם אתה מייצר תוכן או מדיה, הפקת נראות בAI היא דרך חדשה לפרסום.', bullets: ['מעקב הזכרות בAI', 'הוכחה של מגיע אל קהל', 'פתחות לשותפויות חדשות'] },
        { title: 'מנהלי שיווק וproduct', body: 'אם אתה אחראי על אתר או מוצר, הנראות בAI היא מדד חדש להצלחה.', bullets: ['מדד מודרני של הצלחה', 'תחרויות בעין שלך', 'דוחות למנהלים'] },
      ],
    },
  ],
  cta: {
    title: 'הישארו קדימה בגל AI החדש',
    body: 'מעקב נראות AI אינו עוד אפשרות. בעוד שנה זה יהיה חיוני. התחילו עכשיו.',
    primary: { label: 'התחילו ניסיון חינם', href: authHref('signup', 'he') },
  },
}
