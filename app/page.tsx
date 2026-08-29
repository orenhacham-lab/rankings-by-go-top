import Link from 'next/link'
import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { PublicNav } from '@/components/PublicNav'
import { Footer } from '@/components/Footer'
import { isContentModuleEnabled } from '@/lib/content/api-auth'
import { getShopifyOAuthConfig, detectSignedShopifyLaunch } from '@/lib/shopify/oauth'

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

  return (
    <div className="min-h-screen bg-white">
      <PublicNav />

      {/* Hero Section */}
      <section className="relative pt-28 lg:pt-36 pb-20 lg:pb-28 overflow-hidden">
        {/* Background gradient + grid */}
        <div className="absolute inset-0 bg-gradient-to-br from-blue-50 via-white to-indigo-50" />
        <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_top,_rgba(59,130,246,0.15),_transparent_50%)]" />
        <div
          className="absolute inset-0 opacity-30"
          style={{
            backgroundImage:
              'linear-gradient(to right, rgb(226 232 240) 1px, transparent 1px), linear-gradient(to bottom, rgb(226 232 240) 1px, transparent 1px)',
            backgroundSize: '48px 48px',
            maskImage: 'radial-gradient(ellipse 60% 50% at 50% 30%, black, transparent)',
          }}
        />

        <div className="relative max-w-6xl mx-auto px-4 sm:px-6 lg:px-8 text-center">
          {/* Trust badge */}
          <div className="inline-flex items-center gap-2 px-4 py-1.5 rounded-full bg-blue-50 border border-blue-100 text-blue-700 text-xs lg:text-sm font-medium mb-6">
            <span className="w-2 h-2 rounded-full bg-green-500 animate-pulse" />
            מערכת SEO ו-GEO לעסקים ולסוכנויות
          </div>

          <h1 className="text-4xl sm:text-5xl lg:text-6xl xl:text-7xl font-extrabold text-slate-900 leading-tight tracking-tight mb-6">
            צרו, תזמנו ופרסמו תוכן שמחזק
            <br />
            <span className="bg-gradient-to-r from-indigo-600 via-purple-600 to-purple-500 bg-clip-text text-transparent">
              את הנראות שלכם בגוגל ובמנועי AI
            </span>
          </h1>

          <p className="text-lg lg:text-xl text-slate-600 max-w-3xl mx-auto leading-relaxed mb-10">
            במקום לעבוד עם כמה מערכות שונות, Go Top מרכזת עבורכם את כל תהליך הקידום: מתכנון נושאים
            ויצירת מאמרים, דרך תזמון ופרסום ישירות באתר, ועד מעקב אחרי המיקומים בגוגל, הנראות במפות
            והאזכורים ב-ChatGPT, Gemini ומנועי AI נוספים.
          </p>

          <div className="flex flex-col sm:flex-row items-center justify-center gap-3 mb-12">
            <Link
              href={user ? '/dashboard' : '/signup'}
              className="w-full sm:w-auto px-8 py-4 rounded-xl bg-gradient-to-r from-blue-600 to-indigo-600 text-white font-semibold text-base shadow-lg shadow-blue-600/25 hover:shadow-xl hover:shadow-blue-600/30 hover:from-blue-700 hover:to-indigo-700 transition-all"
            >
              {user ? 'לדאשבורד' : 'התחילו 7 ימים בחינם'}
            </Link>
            <Link
              href="#workflow"
              className="w-full sm:w-auto px-8 py-4 rounded-xl bg-white border border-slate-200 text-slate-900 font-semibold text-base shadow-sm hover:shadow-md hover:border-slate-300 transition-all"
            >
              גלו איך זה עובד
            </Link>
          </div>

          {/* Trust indicators */}
          <div className="flex flex-wrap items-center justify-center gap-x-6 gap-y-2 text-sm text-slate-500">
            <div className="flex items-center gap-1.5">
              <svg className="w-4 h-4 text-green-500" fill="currentColor" viewBox="0 0 20 20">
                <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clipRule="evenodd" />
              </svg>
              ללא כרטיס אשראי
            </div>
            <div className="flex items-center gap-1.5">
              <svg className="w-4 h-4 text-green-500" fill="currentColor" viewBox="0 0 20 20">
                <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clipRule="evenodd" />
              </svg>
              חיבור ל-WordPress ול-Shopify
            </div>
            <div className="flex items-center gap-1.5">
              <svg className="w-4 h-4 text-green-500" fill="currentColor" viewBox="0 0 20 20">
                <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clipRule="evenodd" />
              </svg>
              תמיכה אישית בעברית
            </div>
          </div>

          {/* Hero Visual: Content pipeline mockup */}
          <div className="mt-16 lg:mt-20 relative max-w-5xl mx-auto">
            <div className="absolute -inset-x-4 -inset-y-4 bg-gradient-to-r from-blue-600/20 to-indigo-600/20 rounded-2xl blur-2xl" />
            <div className="relative bg-white rounded-2xl shadow-2xl border border-slate-200 overflow-hidden">
              {/* Browser chrome */}
              <div className="flex items-center gap-1.5 px-4 py-3 bg-slate-50 border-b border-slate-200">
                <div className="w-3 h-3 rounded-full bg-red-400" />
                <div className="w-3 h-3 rounded-full bg-yellow-400" />
                <div className="w-3 h-3 rounded-full bg-green-400" />
                <div className="ml-3 px-3 py-1 rounded-md bg-white border border-slate-200 text-xs text-slate-500 font-mono">
                  gotopseo.com/content
                </div>
              </div>
              {/* Mock content pipeline */}
              <div className="p-6 lg:p-8 bg-gradient-to-br from-slate-50 to-white">
                <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 lg:gap-4 mb-6">
                  {[
                    { label: 'נושאים מתוכננים', value: '18', color: 'text-slate-900' },
                    { label: 'מאמרים בעריכה', value: '5', color: 'text-blue-600' },
                    { label: 'מתוזמנים לפרסום', value: '9', color: 'text-indigo-600' },
                    { label: 'פורסמו החודש', value: '14', color: 'text-green-600' },
                  ].map((stat) => (
                    <div key={stat.label} className="bg-white rounded-lg border border-slate-200 p-3 lg:p-4 text-right">
                      <div className="text-xs text-slate-500 mb-1">{stat.label}</div>
                      <div className={`text-xl lg:text-2xl font-bold ${stat.color}`}>{stat.value}</div>
                    </div>
                  ))}
                </div>
                <div className="bg-white rounded-lg border border-slate-200 overflow-hidden">
                  <div className="px-4 py-3 border-b border-slate-200 bg-slate-50 flex items-center justify-between">
                    <span className="text-sm font-semibold text-slate-700">לוח תוכן</span>
                    <span className="text-xs text-slate-500">4 מאמרים אחרונים</span>
                  </div>
                  <div className="divide-y divide-slate-100">
                    {[
                      { title: 'מדריך קידום אתרים לעסקים קטנים', status: 'פורסם', color: 'text-green-600 bg-green-50' },
                      { title: 'איך לבחור סוכנות שיווק דיגיטלי', status: 'מתוזמן', color: 'text-blue-600 bg-blue-50' },
                      { title: 'טרנדים ב-GEO לשנה הקרובה', status: 'בסקירה', color: 'text-amber-600 bg-amber-50' },
                      { title: 'מדריך נראות במנועי AI', status: 'טיוטה', color: 'text-slate-500 bg-slate-100' },
                    ].map((row) => (
                      <div key={row.title} className="px-4 py-3 flex items-center justify-between text-sm">
                        <span className="font-medium text-slate-700">{row.title}</span>
                        <span className={`text-xs font-semibold px-2.5 py-1 rounded-full ${row.color}`}>
                          {row.status}
                        </span>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Problem / Solution Section */}
      <section className="py-20 lg:py-28 bg-white">
        <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="text-center mb-14 lg:mb-16">
            <div className="inline-block text-blue-600 text-sm font-semibold mb-3">למה Go Top</div>
            <h2 className="text-3xl lg:text-5xl font-extrabold text-slate-900 mb-4 tracking-tight">
              עד עכשיו קידום אתרים דרש כמה מערכות. עכשיו מספיקה אחת
            </h2>
            <p className="text-lg text-slate-600 max-w-2xl mx-auto">
              כתיבה בכלי אחד, תכנון בגיליון אלקטרוני, מעקב מיקומים במערכת נפרדת ופרסום ידני
              ב-CMS — כל מעבר בין מערכת למערכת עולה זמן וגורם לדברים ליפול בין הכיסאות.
            </p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <div className="bg-slate-50 rounded-2xl border border-slate-200 p-8">
              <h3 className="text-lg font-bold text-slate-900 mb-5">איך זה עובד בלי Go Top</h3>
              <ul className="space-y-4">
                {[
                  'כלי כתיבה נפרד ליצירת תוכן',
                  'גיליון אלקטרוני לתכנון נושאים ומעקב סטטוסים',
                  'מערכת נפרדת למעקב מיקומים בגוגל',
                  'כניסה ידנית ל-CMS כדי להעלות כל מאמר',
                ].map((item) => (
                  <li key={item} className="flex items-start gap-3 text-slate-600">
                    <svg className="w-5 h-5 text-red-400 shrink-0 mt-0.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                    </svg>
                    {item}
                  </li>
                ))}
              </ul>
            </div>

            <div className="bg-gradient-to-br from-blue-600 to-indigo-600 rounded-2xl p-8 text-white shadow-xl">
              <h3 className="text-lg font-bold mb-5">איך זה עובד עם Go Top</h3>
              <ul className="space-y-4">
                {[
                  'תכנון, יצירה ועריכה של מאמרים באותה מערכת',
                  'תזמון ופרסום ישירות ל-WordPress או ל-Shopify',
                  'מעקב אחרי המיקומים בגוגל והנראות ב-AI לצד התוכן',
                  'תמונה אחת ברורה על כל תהליך הקידום, ממקום אחד',
                ].map((item) => (
                  <li key={item} className="flex items-start gap-3">
                    <svg className="w-5 h-5 text-blue-200 shrink-0 mt-0.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                    </svg>
                    {item}
                  </li>
                ))}
              </ul>
            </div>
          </div>
        </div>
      </section>

      {/* Primary content workflow — core positioning */}
      <section id="workflow" className="scroll-mt-28 lg:scroll-mt-36 py-20 lg:py-28 bg-gradient-to-br from-slate-900 via-slate-900 to-indigo-950 relative overflow-hidden">
        <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_top,_rgba(99,102,241,0.25),_transparent_50%)]" />
        <div className="relative max-w-6xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="text-center mb-14 lg:mb-16">
            <div className="inline-block text-blue-300 text-sm font-semibold mb-3">מהרעיון לפרסום</div>
            <h2 className="text-3xl lg:text-5xl font-extrabold text-white mb-4 tracking-tight">
              תהליך יצירת התוכן שלכם, מקצה לקצה
            </h2>
            <p className="text-lg text-slate-300 max-w-2xl mx-auto">
              ארבעה שלבים שהופכים רעיון לנושא למאמר מפורסם שתומך בקידום שלכם
            </p>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6">
            {[
              {
                num: '1',
                title: 'תכננו נושאים רלוונטיים',
                desc: 'קבלו הצעות לנושאי SEO ו-GEO רלוונטיים לעסק שלכם, מבוססים על מילות מפתח ושאלות שאנשים באמת שואלים.',
              },
              {
                num: '2',
                title: 'צרו מאמרים מלאים',
                desc: 'הפיקו מאמר מלא ומוכן לפרסום עבור כל נושא שבחרתם, במקום להתחיל מדף ריק.',
              },
              {
                num: '3',
                title: 'סקרו ועדכנו',
                desc: 'עברו על כל מאמר, ערכו לפי הטון והמידע שלכם, ואשרו אותו לפני שהוא יוצא לאוויר.',
              },
              {
                num: '4',
                title: 'תזמנו או פרסמו',
                desc: 'פרסמו מיד או תזמנו לתאריך עתידי — ישירות לאתר ה-WordPress או ה-Shopify המחובר שלכם.',
              },
            ].map((step, idx, arr) => (
              <div key={step.num} className="relative">
                <div className="bg-white/5 backdrop-blur rounded-2xl border border-white/10 p-6 h-full">
                  <div className="w-10 h-10 rounded-full bg-gradient-to-br from-blue-500 to-indigo-500 text-white font-bold flex items-center justify-center mb-4">
                    {step.num}
                  </div>
                  <h3 className="text-lg font-bold text-white mb-2">{step.title}</h3>
                  <p className="text-sm text-slate-300 leading-relaxed">{step.desc}</p>
                </div>
                {idx < arr.length - 1 && (
                  <svg
                    className="hidden lg:block absolute top-1/2 -translate-y-1/2 -left-4 w-8 h-8 text-blue-400/60 rotate-180"
                    fill="none"
                    stroke="currentColor"
                    viewBox="0 0 24 24"
                  >
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                  </svg>
                )}
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Supporting capabilities */}
      <section className="py-20 lg:py-28 bg-white">
        <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="text-center mb-14 lg:mb-16">
            <div className="inline-block text-blue-600 text-sm font-semibold mb-3">יכולות תומכות</div>
            <h2 className="text-3xl lg:text-5xl font-extrabold text-slate-900 mb-4 tracking-tight">
              הכל נמדד, כדי שתדעו שהתוכן עובד
            </h2>
            <p className="text-lg text-slate-600 max-w-2xl mx-auto">
              לצד תכנון, יצירה ופרסום התוכן — Go Top עוקבת אחרי הביצועים שלכם ונותנת לכם תמונה מלאה
            </p>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6">
            {[
              {
                icon: (
                  <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
                  </svg>
                ),
                title: 'מעקב מיקומים בגוגל אורגני',
                desc: 'עקבו אחרי המיקומים שלכם בגוגל לאורך זמן, לפי ביטוי, ובדקו איך התוכן שאתם מפרסמים משפיע.',
                color: 'from-blue-500 to-blue-600',
              },
              {
                icon: (
                  <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17.657 16.657L13.414 20.9a1.998 1.998 0 01-2.827 0l-4.244-4.243a8 8 0 1111.314 0z" />
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 11a3 3 0 11-6 0 3 3 0 016 0z" />
                  </svg>
                ),
                title: 'נראות בגוגל מפות',
                desc: 'עקבו אחרי המיקום שלכם בגוגל מפות לפי עיר, מיקוד או נקודת ציון.',
                color: 'from-emerald-500 to-emerald-600',
              },
              {
                icon: (
                  <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 10V3L4 14h7v7l9-11h-7z" />
                  </svg>
                ),
                title: 'נראות במנועי AI',
                desc: 'בדקו האם העסק שלכם מוזכר בתשובות של ChatGPT, Gemini, Perplexity, Copilot, Grok ו-Google AI.',
                color: 'from-rose-500 to-rose-600',
              },
              {
                icon: (
                  <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9.663 17h4.673M12 3v1m6.364 1.636l-.707.707M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                  </svg>
                ),
                title: 'מחקר מילות מפתח',
                desc: 'גלו ביטויים רלוונטיים עם נתוני נפח חיפוש ותחרות, והפכו אותם לנושאי תוכן חדשים.',
                color: 'from-amber-500 to-orange-600',
              },
              {
                icon: (
                  <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 17v-2m3 2v-4m3 4v-6m2 10H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                  </svg>
                ),
                title: 'דוחות PDF ואקסל',
                desc: 'ייצאו דוחות ברורים ל-PDF ולאקסל בלחיצת כפתור, לשימוש פנימי או לשיתוף עם לקוחות.',
                color: 'from-purple-500 to-purple-600',
              },
              {
                icon: (
                  <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 7h8m0 0v8m0-8l-8 8-4-4-6 6" />
                  </svg>
                ),
                title: 'אותות מגמה ומתחרים',
                desc: 'קבלו אינדיקציות למגמות לאורך זמן ולפעילות מתחרים, לצד המעקב על האתר שלכם.',
                color: 'from-orange-500 to-orange-600',
              },
            ].map((feat) => (
              <div
                key={feat.title}
                className="group relative bg-white rounded-2xl border border-slate-200 p-6 hover:border-slate-300 hover:shadow-lg transition-all"
              >
                <div className={`w-12 h-12 rounded-xl bg-gradient-to-br ${feat.color} text-white flex items-center justify-center mb-4 shadow-md group-hover:scale-110 transition-transform`}>
                  {feat.icon}
                </div>
                <h3 className="text-lg font-bold text-slate-900 mb-2">{feat.title}</h3>
                <p className="text-sm text-slate-600 leading-relaxed">{feat.desc}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Account-level 3-step journey */}
      <section className="py-20 lg:py-28 bg-gradient-to-br from-slate-50 to-blue-50">
        <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="text-center mb-14 lg:mb-16">
            <div className="inline-block text-blue-600 text-sm font-semibold mb-3">להתחיל</div>
            <h2 className="text-3xl lg:text-5xl font-extrabold text-slate-900 mb-4 tracking-tight">
              להתחיל זה פשוט
            </h2>
            <p className="text-lg text-slate-600 max-w-2xl mx-auto">
              שלושה צעדים מחיבור האתר ועד תוכן מתוכנן, מפורסם ונמדד
            </p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
            {[
              {
                num: '01',
                title: 'חברו אתר וצרו פרויקט',
                desc: 'צרו חשבון, חברו את אתר ה-WordPress או ה-Shopify שלכם והגדירו פרויקט לעסק או ללקוח.',
              },
              {
                num: '02',
                title: 'בחרו נושאים וצרו תוכן',
                desc: 'בחרו ואשרו את הנושאים המוצעים, צרו מאמרים ועברו עליהם לפני שהם יוצאים החוצה.',
              },
              {
                num: '03',
                title: 'תזמנו פרסום ועקבו אחרי הנראות',
                desc: 'תזמנו את הפרסום לאתר המחובר, ועקבו אחרי המיקומים בגוגל והנראות ב-AI לאורך זמן.',
              },
            ].map((step) => (
              <div key={step.num} className="relative">
                <div className="bg-white rounded-2xl border border-slate-200 p-8 shadow-sm h-full">
                  <div className="text-5xl font-extrabold bg-gradient-to-br from-blue-600 to-indigo-600 bg-clip-text text-transparent mb-4">
                    {step.num}
                  </div>
                  <h3 className="text-xl font-bold text-slate-900 mb-3">{step.title}</h3>
                  <p className="text-slate-600 leading-relaxed">{step.desc}</p>
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Audience */}
      <section className="py-20 lg:py-28 bg-white">
        <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="text-center mb-14 lg:mb-16">
            <div className="inline-block text-blue-600 text-sm font-semibold mb-3">למי זה מתאים</div>
            <h2 className="text-3xl lg:text-5xl font-extrabold text-slate-900 mb-4 tracking-tight">
              נבנה עבור כל מי שאחראי על קידום אתר
            </h2>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6">
            {[
              {
                title: 'עסקים קטנים',
                desc: 'מערכת אחת פשוטה במקום להתעסק עם כמה כלים, גם בלי צוות שיווק פנימי.',
              },
              {
                title: 'פרילנסרים בתחום ה-SEO',
                desc: 'תכננו, כתבו ופרסמו תוכן ללקוחות מהר יותר, ותראו את התוצאות באותה מערכת.',
              },
              {
                title: 'סוכנויות דיגיטל',
                desc: 'נהלו כמה אתרי לקוחות במקביל, מתכנון התוכן ועד דוחות ברורים לכל לקוח.',
              },
              {
                title: 'צוותי שיווק',
                desc: 'שמרו על קצב פרסום קבוע ועל תמונה משותפת של הביצועים, בלי לרדוף אחרי גיליונות.',
              },
            ].map((aud) => (
              <div key={aud.title} className="bg-slate-50 rounded-2xl border border-slate-200 p-6 hover:border-slate-300 hover:shadow-lg transition-all">
                <h3 className="text-lg font-bold text-slate-900 mb-2">{aud.title}</h3>
                <p className="text-sm text-slate-600 leading-relaxed">{aud.desc}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Why subscribe */}
      <section className="py-20 lg:py-28 bg-gradient-to-br from-slate-50 to-blue-50">
        <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="text-center mb-14 lg:mb-16">
            <div className="inline-block text-blue-600 text-sm font-semibold mb-3">למה להירשם</div>
            <h2 className="text-3xl lg:text-5xl font-extrabold text-slate-900 mb-4 tracking-tight">
              מה תקבלו עם המנוי
            </h2>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6">
            {[
              {
                title: 'חיסכון בזמן',
                desc: 'פחות מעברים בין כלים ופחות עבודה ידנית בתכנון, כתיבה ופרסום תוכן.',
              },
              {
                title: 'קצב פרסום עקבי',
                desc: 'תזמון מראש שעוזר לכם לשמור על פרסום סדיר, בלי לרדוף אחרי דדליינים.',
              },
              {
                title: 'ניהול תוכן ונראות במקום אחד',
                desc: 'מהנושא הראשון ועד המעקב אחרי המיקומים — הכל תחת אותה מערכת.',
              },
              {
                title: 'תמונה ברורה של מה עובד',
                desc: 'הבינו אילו מאמרים ונושאים תומכים בנראות שלכם, ואיפה עוד יש עבודה.',
              },
              {
                title: 'ניהול כמה אתרי לקוחות',
                desc: 'נהלו כמה פרויקטים ואתרי לקוחות מדאשבורד אחד, בלי לקפוץ בין חשבונות.',
              },
            ].map((why) => (
              <div key={why.title} className="bg-white rounded-2xl border border-slate-200 p-6">
                <div className="w-10 h-10 rounded-lg bg-blue-50 text-blue-600 flex items-center justify-center mb-4">
                  <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                  </svg>
                </div>
                <h3 className="text-lg font-bold text-slate-900 mb-2">{why.title}</h3>
                <p className="text-sm text-slate-600 leading-relaxed">{why.desc}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Pricing preview */}
      <section className="py-16 lg:py-20 bg-white">
        <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 text-center">
          <h2 className="text-2xl lg:text-3xl font-extrabold text-slate-900 mb-3 tracking-tight">
            תוכניות שמתאימות לכל גודל עסק
          </h2>
          <p className="text-slate-600 max-w-xl mx-auto mb-8">
            מעסק קטן שמתחיל לפרסם תוכן ועד סוכנות שמנהלת כמה לקוחות — יש תוכנית שמתאימה לכם.
          </p>
          <Link
            href="/pricing"
            className="inline-block px-8 py-4 rounded-xl bg-white border border-slate-200 text-slate-900 font-semibold text-base shadow-sm hover:shadow-md hover:border-slate-300 transition-all"
          >
            צפו במחירים
          </Link>
        </div>
      </section>

      {/* CTA Section */}
      <section className="py-20 lg:py-28 bg-white">
        <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="relative overflow-hidden rounded-3xl bg-gradient-to-br from-blue-600 via-blue-500 to-blue-400 px-8 py-14 lg:px-16 lg:py-20 text-center shadow-2xl">
            {/* Decorative circles */}
            <div className="absolute -top-24 -right-24 w-64 h-64 rounded-full bg-white/10 blur-3xl" />
            <div className="absolute -bottom-24 -left-24 w-64 h-64 rounded-full bg-white/10 blur-3xl" />

            <div className="relative">
              <h2 className="text-3xl lg:text-5xl font-extrabold text-white mb-4 tracking-tight">
                תכננו, כתבו ופרסמו את המאמר הבא שלכם היום
              </h2>
              <p className="text-lg lg:text-xl text-blue-100 mb-8 max-w-2xl mx-auto">
                התחילו 7 ימים בחינם. ללא התחייבות, ללא כרטיס אשראי.
              </p>
              <div className="flex flex-col sm:flex-row items-center justify-center gap-3">
                <Link
                  href={user ? '/dashboard' : '/signup'}
                  className="w-full sm:w-auto px-8 py-4 rounded-xl bg-white text-blue-700 font-semibold text-base shadow-lg hover:shadow-xl hover:bg-blue-50 transition-all"
                >
                  {user ? 'לדאשבורד שלי' : 'התחילו 7 ימים בחינם'}
                </Link>
                <Link
                  href="/pricing"
                  className="w-full sm:w-auto px-8 py-4 rounded-xl bg-white/10 backdrop-blur border border-white/20 text-white font-semibold text-base hover:bg-white/20 transition-all"
                >
                  צפו במחירים
                </Link>
              </div>
            </div>
          </div>
        </div>
      </section>

      <Footer />
    </div>
  )
}
