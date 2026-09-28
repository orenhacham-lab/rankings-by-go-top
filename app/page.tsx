import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { LandingPage, type LandingCopy } from '@/components/public/LandingPage'
import { isContentModuleEnabled } from '@/lib/content/api-auth'
import { getShopifyOAuthConfig, detectSignedShopifyLaunch } from '@/lib/shopify/oauth'
import { authHref } from '@/lib/i18n/auth-href'

export default async function HomePage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>
}) {
  // Hotfix — a signed Shopify app-launch (`?shop=...&hmac=...&host=...
  // &timestamp=...`, sent by Shopify to this app's configured Application
  // URL on every install AND every reopen) must NEVER fall through to the
  // public marketing homepage. This is checked BEFORE any Supabase call and
  // before rendering anything — a bare, unsigned visit to `/` (the normal
  // case, zero query params) skips this entirely via the cheap presence
  // check below. Fails safely (renders the normal homepage) on ANY
  // ambiguity: missing params, invalid/tampered HMAC, unparseable/expired
  // timestamp, an unconfigured OAuth client, or the content module being
  // disabled — nothing is trusted or persisted here, this ONLY decides
  // whether to hand off to the real embedded entry point (/shopify/app,
  // which itself treats `shop` as non-privileged — see its own header
  // comment). Never logs the raw hmac/shop/host/timestamp values.
  const sp = await searchParams
  const shopParam = typeof sp.shop === 'string' ? sp.shop : ''
  const hmacParam = typeof sp.hmac === 'string' ? sp.hmac : ''
  if (isContentModuleEnabled() && shopParam && hmacParam) {
    const config = getShopifyOAuthConfig()
    if (config) {
      const params: Record<string, string> = {}
      for (const [k, v] of Object.entries(sp)) {
        if (typeof v === 'string') params[k] = v
      }
      const launch = detectSignedShopifyLaunch(params, config.clientSecret)
      if (launch.ok) {
        const qs = new URLSearchParams(params).toString()
        redirect(`/shopify/app${qs ? `?${qs}` : ''}`)
      } else {
        console.warn('[Shopify launch] rejected at app URL', { route: 'home_page', reason: launch.reason })
      }
    }
  }

  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()

  // Hero Section and the rest of the marketing page (components/public/LandingPage.tsx)
  // render only from here, after the signed-launch check above.
  return <LandingPage locale="he" copy={HE} signedIn={!!user} signupHref={authHref('signup', 'he')} pricingHref="/pricing" />
}

/** The Hebrew home page's words. The layout is components/public/LandingPage.tsx. */
const HE: LandingCopy = {
  hero: {
    eyebrow: 'מערכת SEO ו-GEO לעסקים ולסוכנויות',
    title: 'צרו, תזמנו ופרסמו תוכן שמחזק',
    accent: 'את הנראות שלכם בגוגל ובמנועי AI',
    subtitle:
      'במקום לעבוד עם כמה מערכות שונות, Go Top מרכזת עבורכם את כל תהליך הקידום: מתכנון נושאים ויצירת מאמרים, דרך תזמון ופרסום ישירות באתר, ועד מעקב אחרי המיקומים בגוגל, הנראות במפות והאזכורים ב-ChatGPT, Gemini ומנועי AI נוספים.',
    signup: 'התחילו 7 ימים בחינם',
    dashboard: 'לדאשבורד',
    howItWorks: 'גלו איך זה עובד',
    trust: ['ללא כרטיס אשראי', 'חיבור ל-WordPress ול-Shopify', 'תמיכה אישית בעברית'],
  },
  mock: {
    address: 'gotopseo.com/content',
    stats: [
      { label: 'נושאים מתוכננים', value: '18' },
      { label: 'מאמרים בעריכה', value: '5' },
      { label: 'מתוזמנים לפרסום', value: '9' },
      { label: 'פורסמו החודש', value: '14' },
    ],
    boardTitle: 'לוח תוכן',
    boardMeta: '4 מאמרים אחרונים',
    rows: [
      { title: 'מדריך קידום אתרים לעסקים קטנים', status: 'פורסם', tone: 'success' },
      { title: 'איך לבחור סוכנות שיווק דיגיטלי', status: 'מתוזמן', tone: 'info' },
      { title: 'טרנדים ב-GEO לשנה הקרובה', status: 'בסקירה', tone: 'warning' },
      { title: 'מדריך נראות במנועי AI', status: 'טיוטה', tone: 'neutral' },
    ],
  },
  problem: {
    eyebrow: 'למה Go Top',
    title: 'עד עכשיו קידום אתרים דרש כמה מערכות. עכשיו מספיקה אחת',
    body: 'כתיבה בכלי אחד, תכנון בגיליון אלקטרוני, מעקב מיקומים במערכת נפרדת ופרסום ידני ב-CMS — כל מעבר בין מערכת למערכת עולה זמן וגורם לדברים ליפול בין הכיסאות.',
    withoutTitle: 'איך זה עובד בלי Go Top',
    without: [
      'כלי כתיבה נפרד ליצירת תוכן',
      'גיליון אלקטרוני לתכנון נושאים ומעקב סטטוסים',
      'מערכת נפרדת למעקב מיקומים בגוגל',
      'כניסה ידנית ל-CMS כדי להעלות כל מאמר',
    ],
    withTitle: 'איך זה עובד עם Go Top',
    with: [
      'תכנון, יצירה ועריכה של מאמרים באותה מערכת',
      'תזמון ופרסום ישירות ל-WordPress או ל-Shopify',
      'מעקב אחרי המיקומים בגוגל והנראות ב-AI לצד התוכן',
      'תמונה אחת ברורה על כל תהליך הקידום, ממקום אחד',
    ],
  },
  workflow: {
    eyebrow: 'מהרעיון לפרסום',
    title: 'תהליך יצירת התוכן שלכם, מקצה לקצה',
    body: 'ארבעה שלבים שהופכים רעיון לנושא למאמר מפורסם שתומך בקידום שלכם',
    steps: [
      { title: 'תכננו נושאים רלוונטיים', desc: 'קבלו הצעות לנושאי SEO ו-GEO רלוונטיים לעסק שלכם, מבוססים על מילות מפתח ושאלות שאנשים באמת שואלים.' },
      { title: 'צרו מאמרים מלאים', desc: 'הפיקו מאמר מלא ומוכן לפרסום עבור כל נושא שבחרתם, במקום להתחיל מדף ריק.' },
      { title: 'סקרו ועדכנו', desc: 'עברו על כל מאמר, ערכו לפי הטון והמידע שלכם, ואשרו אותו לפני שהוא יוצא לאוויר.' },
      { title: 'תזמנו או פרסמו', desc: 'פרסמו מיד או תזמנו לתאריך עתידי — ישירות לאתר ה-WordPress או ה-Shopify המחובר שלכם.' },
    ],
  },
  capabilities: {
    eyebrow: 'יכולות תומכות',
    title: 'הכל נמדד, כדי שתדעו שהתוכן עובד',
    body: 'לצד תכנון, יצירה ופרסום התוכן — Go Top עוקבת אחרי הביצועים שלכם ונותנת לכם תמונה מלאה',
    items: [
      { title: 'מעקב מיקומים בגוגל אורגני', desc: 'עקבו אחרי המיקומים שלכם בגוגל לאורך זמן, לפי ביטוי, ובדקו איך התוכן שאתם מפרסמים משפיע.' },
      { title: 'נראות בגוגל מפות', desc: 'עקבו אחרי המיקום שלכם בגוגל מפות לפי עיר, מיקוד או נקודת ציון.' },
      { title: 'נראות במנועי AI', desc: 'בדקו האם העסק שלכם מוזכר בתשובות של ChatGPT, Gemini, Perplexity, Copilot, Grok ו-Google AI.' },
      { title: 'מחקר מילות מפתח', desc: 'גלו ביטויים רלוונטיים עם נתוני נפח חיפוש ותחרות, והפכו אותם לנושאי תוכן חדשים.' },
      { title: 'דוחות PDF ואקסל', desc: 'ייצאו דוחות ברורים ל-PDF ולאקסל בלחיצת כפתור, לשימוש פנימי או לשיתוף עם לקוחות.' },
      { title: 'אותות מגמה ומתחרים', desc: 'קבלו אינדיקציות למגמות לאורך זמן ולפעילות מתחרים, לצד המעקב על האתר שלכם.' },
    ],
  },
  journey: {
    eyebrow: 'להתחיל',
    title: 'להתחיל זה פשוט',
    body: 'שלושה צעדים מחיבור האתר ועד תוכן מתוכנן, מפורסם ונמדד',
    steps: [
      { title: 'חברו אתר וצרו פרויקט', desc: 'צרו חשבון, חברו את אתר ה-WordPress או ה-Shopify שלכם והגדירו פרויקט לעסק או ללקוח.' },
      { title: 'בחרו נושאים וצרו תוכן', desc: 'בחרו ואשרו את הנושאים המוצעים, צרו מאמרים ועברו עליהם לפני שהם יוצאים החוצה.' },
      { title: 'תזמנו פרסום ועקבו אחרי הנראות', desc: 'תזמנו את הפרסום לאתר המחובר, ועקבו אחרי המיקומים בגוגל והנראות ב-AI לאורך זמן.' },
    ],
  },
  audience: {
    eyebrow: 'למי זה מתאים',
    title: 'נבנה עבור כל מי שאחראי על קידום אתר',
    items: [
      { title: 'עסקים קטנים', desc: 'מערכת אחת פשוטה במקום להתעסק עם כמה כלים, גם בלי צוות שיווק פנימי.' },
      { title: 'פרילנסרים בתחום ה-SEO', desc: 'תכננו, כתבו ופרסמו תוכן ללקוחות מהר יותר, ותראו את התוצאות באותה מערכת.' },
      { title: 'סוכנויות דיגיטל', desc: 'נהלו כמה אתרי לקוחות במקביל, מתכנון התוכן ועד דוחות ברורים לכל לקוח.' },
      { title: 'צוותי שיווק', desc: 'שמרו על קצב פרסום קבוע ועל תמונה משותפת של הביצועים, בלי לרדוף אחרי גיליונות.' },
    ],
  },
  why: {
    eyebrow: 'למה להירשם',
    title: 'מה תקבלו עם המנוי',
    items: [
      { title: 'חיסכון בזמן', desc: 'פחות מעברים בין כלים ופחות עבודה ידנית בתכנון, כתיבה ופרסום תוכן.' },
      { title: 'קצב פרסום עקבי', desc: 'תזמון מראש שעוזר לכם לשמור על פרסום סדיר, בלי לרדוף אחרי דדליינים.' },
      { title: 'ניהול תוכן ונראות במקום אחד', desc: 'מהנושא הראשון ועד המעקב אחרי המיקומים — הכל תחת אותה מערכת.' },
      { title: 'תמונה ברורה של מה עובד', desc: 'הבינו אילו מאמרים ונושאים תומכים בנראות שלכם, ואיפה עוד יש עבודה.' },
      { title: 'ניהול כמה אתרי לקוחות', desc: 'נהלו כמה פרויקטים ואתרי לקוחות מדאשבורד אחד, בלי לקפוץ בין חשבונות.' },
    ],
  },
  pricing: {
    title: 'תוכניות שמתאימות לכל גודל עסק',
    body: 'מעסק קטן שמתחיל לפרסם תוכן ועד סוכנות שמנהלת כמה לקוחות — יש תוכנית שמתאימה לכם.',
    cta: 'צפו במחירים',
  },
  cta: {
    title: 'תכננו, כתבו ופרסמו את המאמר הבא שלכם היום',
    body: 'התחילו 7 ימים בחינם. ללא התחייבות, ללא כרטיס אשראי.',
    signup: 'התחילו 7 ימים בחינם',
    dashboard: 'לדאשבורד שלי',
    pricing: 'צפו במחירים',
  },
}
