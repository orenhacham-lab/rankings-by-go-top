import { Metadata } from 'next'
import { Search, TrendingUp, Globe, Smartphone, BarChart3, Clock } from 'lucide-react'
import { FeaturePage, type FeaturePageContent } from '@/components/public/FeaturePage'
import { RankTableVisual } from '@/components/public/feature-visuals'
import { buildHreflangAlternates } from '@/lib/seo/hreflang'
import { authHref } from '@/lib/i18n/auth-href'

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

const CONTENT: FeaturePageContent = {
  hero: {
    eyebrow: 'מעקב דירוגים בגוגל',
    eyebrowIcon: Search,
    title: 'עקבו אחרי הדירוגים שלכם בגוגל, בכל רגע שתרצו',
    subtitle: 'קבלו מידע מדויק על מיקום האתר שלכם בתוצאות החיפוש של גוגל. הריצו סריקה ידנית מתי שנוח לכם, או תנו למערכת לסרוק אוטומטית פעם בחודש. עקבו אחרי מגמות, השוו לתחרות, וקבלו דוחות מפורטים.',
    primary: { label: 'התחילו ניסיון חינם', href: authHref('signup', 'he') },
    secondary: { label: 'צפו במחירים', href: '/pricing' },
    visual: (
      <RankTableVisual
        headers={['מילת מפתח', 'מיקום', 'שינוי', 'URL']}
        rows={[
          { keyword: 'הלוואה שיכון', pos: 3, move: { dir: 'up', value: '2' }, url: 'example.com' },
          { keyword: 'הלוואה ללא עיכול', pos: 8, move: { dir: 'down', value: '1' }, url: 'example.com' },
          { keyword: 'בנק דיגיטלי', pos: 1, move: { dir: 'flat' }, url: 'example.com' },
          { keyword: 'משכנתא זולה', pos: 12, move: { dir: 'up', value: '5' }, url: 'example.com' },
        ]}
      />
    ),
  },
  sections: [
    {
      kind: 'cards',
      title: 'למה מעקב דירוגים חשוב?',
      intro: 'בעולם דיגיטלי, דירוג גבוה בגוגל הוא מה שמביא לכם לקוחות. ככל שתדעו יותר על המיקום שלכם, כך תוכלו לקבל החלטות שיווק טובות יותר.',
      items: [
        { icon: TrendingUp, title: 'מעקב מגמות לאורך זמן', body: 'ראו כיצד הדירוג שלכם משתנה מסריקה לסריקה. תוך כמה חודשים תוכלו לראות אם הקמפיין שלכם ב-SEO עובד או לא.' },
        { icon: Globe, title: 'השוואה עם תחרות', body: 'דעו בדיוק איפה אתם עומדים לעומת המתחרים. היכן אתם מקדימים והיכן אתם מפגרים.' },
        { icon: BarChart3, title: 'דוחות מקצועיים', body: 'הציגו ללקוח / ללמנהלים דוחות שמראים בדיוק מה קרה וכיצד השיפורים משפרים את העסק.' },
      ],
    },
    {
      kind: 'steps',
      title: 'איך זה עובד',
      items: [
        { title: 'הוסיפו מילות מפתח', body: 'הוסיפו את מילות המפתח החשובות לתחום שלכם. אפשר להוסיף מהר ובקל דרך CSV.' },
        { title: 'בחרו הגדרות', body: 'בחרו מדינה, עיר, שפה, ומכשיר. אפשרות עשירה לבדיקה מדויקת של כל תרחיש.' },
        { title: 'קבלו תוצאות', body: 'הריצו סריקה ידנית מתי שנוח לכם, או הפעילו סריקה אוטומטית חודשית לשמירה על היסטוריה מעודכנת. תראו גרפים ודוחות ברגע שהתוצאות מוכנות.' },
      ],
    },
    {
      kind: 'cards',
      title: 'מה אתם יכולים למדוד',
      items: [
        { icon: Smartphone, title: 'מעקב לפי מכשיר', body: 'בדקו דירוגים בנפרד עבור דסקטופ וניידים. הדירוגים עלולים להיות שונים בכל מכשיר.' },
        { icon: Globe, title: 'מעקב גיאוגרפי', body: 'בדקו דירוגים לפי מדינה, עיר, שפה. כל אזור עשוי להיות שונה.' },
        { icon: TrendingUp, title: 'ניתוח מגמות', body: 'ראו כיצד הדירוגים משתנים לאורך זמן. גרפים ברורים יעזרו לכם להבין את הטרנדים.' },
        { icon: BarChart3, title: 'השוואת מתחרים', body: 'אם הזנתם את דירוגי המתחרים, תוכלו לראות בדיוק איפה אתם עומדים מולם.' },
        { icon: Clock, title: 'בדיקות אוטומטיות חודשיות', body: 'פעם בחודש המערכת תבדוק את הדירוגים שלכם באופן אוטומטי. תוכלו גם להריץ בדיקה ידנית בכל רגע שתרצו.' },
        { icon: Search, title: 'מידע מלא לכל ביטוי', body: 'עבור כל מילת מפתח, קבלו את ה-URL שמדורג, את המטא תיאור, ועוד.' },
      ],
    },
    {
      kind: 'audiences',
      title: 'למי זה מתאים',
      items: [
        { title: 'בעלי עסקים קטנים ובינוניים', body: 'אם יש לכם אתר וחשוב לכם שלקוחות ימצאו אתכם בגוגל, זה בדיוק מה שצריך.', bullets: ['מעקב פשוט וברור', 'מחיר נוח עבור עסק קטן', 'דוחות שאפשר להציג ללקוח'] },
        { title: 'סוכנויות דיגיטל', body: 'אם אתם עובדים עם לקוחות, הם יחזרו לכם כל חודש וישאלו: איך הקמפיין?', bullets: ['דוחות למצגות לקוחות', "מעקב של מס' פרויקטים בו זמנית", 'הוכחה לשווי השירות שלכם'] },
        { title: 'מנהלי שיווק ודיגיטל', body: 'אם אתם אחראים על ביצועי האתר, תזדקקו לדוח ברור על הדירוגים.', bullets: ['ניתוח מפורט של ביצועים', 'זיהוי בעיות ומקורות בעיות', 'עדויות להשפעת עבודה'] },
        { title: 'מקדמי SEO ובעלי מקצוע', body: 'אם אתם עובדים על SEO, תצטרכו לדעת בדיוק איפה ומתי הדירוגים משתנים.', bullets: ['סריקות לפי דרישה בכל רגע', 'הוכחה של השפעת העבודה', 'יעדים ומדדי KPI ברורים'] },
      ],
    },
  ],
  cta: {
    title: 'התחילו לעקוב אחרי הדירוגים שלכם היום',
    body: 'ניסיון חינם לשבוע, ללא כרטיס אשראי. בדקו בעצמכם איך זה עובד.',
    primary: { label: 'התחילו ניסיון חינם', href: authHref('signup', 'he') },
  },
}
