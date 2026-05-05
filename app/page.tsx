import Link from 'next/link'
import { createClient } from '@/lib/supabase/server'
import { PublicNav } from '@/components/PublicNav'
import { Footer } from '@/components/Footer'

export default async function HomePage() {
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
            מערכת מעקב מיקומים מתקדמת בעברית
          </div>

          <h1 className="text-2xl lg:text-3xl font-bold text-slate-900 mb-3 tracking-tight">
            Rankings by Go Top
          </h1>

          <h2 className="text-4xl sm:text-5xl lg:text-6xl xl:text-7xl font-extrabold text-slate-900 leading-tight tracking-tight mb-6">
            עקוב אחר הדירוגים שלך
            <br />
            <span className="bg-gradient-to-r from-indigo-600 via-purple-600 to-purple-500 bg-clip-text text-transparent">
              בגוגל בזמן אמת
            </span>
          </h2>

          <p className="text-lg lg:text-xl text-slate-600 max-w-3xl mx-auto leading-relaxed mb-10">
            מערכת מעקב מקצועית לקידום אתרים. בדוק את המיקום של האתר שלך בגוגל אורגני וגוגל מפות,
            קבל דוחות מפורטים ועקוב אחרי המתחרים — הכל ממקום אחד.
          </p>

          <div className="flex flex-col sm:flex-row items-center justify-center gap-3 mb-12">
            <Link
              href={user ? '/dashboard' : '/login'}
              className="w-full sm:w-auto px-8 py-4 rounded-xl bg-gradient-to-r from-blue-600 to-indigo-600 text-white font-semibold text-base shadow-lg shadow-blue-600/25 hover:shadow-xl hover:shadow-blue-600/30 hover:from-blue-700 hover:to-indigo-700 transition-all"
            >
              {user ? 'לדאשבורד' : 'התחל ניסיון חינם 7 ימים'}
            </Link>
            <Link
              href="/pricing"
              className="w-full sm:w-auto px-8 py-4 rounded-xl bg-white border border-slate-200 text-slate-900 font-semibold text-base shadow-sm hover:shadow-md hover:border-slate-300 transition-all"
            >
              צפה במחירים
            </Link>
          </div>

          {/* Trust indicators */}
          <div className="flex flex-wrap items-center justify-center gap-x-6 gap-y-2 text-sm text-slate-500">
            <div className="flex items-center gap-1.5">
              <svg className="w-4 h-4 text-green-500" fill="currentColor" viewBox="0 0 20 20">
                <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clipRule="evenodd" />
              </svg>
              ללא צורך בכרטיס אשראי
            </div>
            <div className="flex items-center gap-1.5">
              <svg className="w-4 h-4 text-green-500" fill="currentColor" viewBox="0 0 20 20">
                <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clipRule="evenodd" />
              </svg>
              ביטול בכל עת
            </div>
            <div className="flex items-center gap-1.5">
              <svg className="w-4 h-4 text-green-500" fill="currentColor" viewBox="0 0 20 20">
                <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clipRule="evenodd" />
              </svg>
              תמיכה אישית בעברית
            </div>
          </div>

          {/* Hero Visual: Dashboard mockup */}
          <div className="mt-16 lg:mt-20 relative max-w-5xl mx-auto">
            <div className="absolute -inset-x-4 -inset-y-4 bg-gradient-to-r from-blue-600/20 to-indigo-600/20 rounded-2xl blur-2xl" />
            <div className="relative bg-white rounded-2xl shadow-2xl border border-slate-200 overflow-hidden">
              {/* Browser chrome */}
              <div className="flex items-center gap-1.5 px-4 py-3 bg-slate-50 border-b border-slate-200">
                <div className="w-3 h-3 rounded-full bg-red-400" />
                <div className="w-3 h-3 rounded-full bg-yellow-400" />
                <div className="w-3 h-3 rounded-full bg-green-400" />
                <div className="ml-3 px-3 py-1 rounded-md bg-white border border-slate-200 text-xs text-slate-500 font-mono">
                  app.gotopseo.com/dashboard
                </div>
              </div>
              {/* Mock dashboard content */}
              <div className="p-6 lg:p-8 bg-gradient-to-br from-slate-50 to-white">
                <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 lg:gap-4 mb-6">
                  {[
                    { label: 'סה"כ ביטויים', value: '247', color: 'text-slate-900' },
                    { label: 'נמצאו', value: '189', color: 'text-green-600' },
                    { label: 'בעמוד 1', value: '142', color: 'text-blue-600' },
                    { label: 'כיסוי', value: '76%', color: 'text-indigo-600' },
                  ].map((stat) => (
                    <div key={stat.label} className="bg-white rounded-lg border border-slate-200 p-3 lg:p-4 text-right">
                      <div className="text-xs text-slate-500 mb-1">{stat.label}</div>
                      <div className={`text-xl lg:text-2xl font-bold ${stat.color}`}>{stat.value}</div>
                    </div>
                  ))}
                </div>
                <div className="bg-white rounded-lg border border-slate-200 overflow-hidden">
                  <div className="px-4 py-3 border-b border-slate-200 bg-slate-50 flex items-center justify-between">
                    <span className="text-sm font-semibold text-slate-700">מיקומים אחרונים</span>
                    <span className="text-xs text-slate-500">היום • 14:32</span>
                  </div>
                  <div className="divide-y divide-slate-100">
                    {[
                      { kw: 'קידום אתרים ברמת גן', pos: 3, change: '+2', up: true },
                      { kw: 'בניית אתרים תל אביב', pos: 7, change: '+1', up: true },
                      { kw: 'שיווק דיגיטלי', pos: 12, change: '-1', up: false },
                      { kw: 'SEO ישראל', pos: 5, change: '+4', up: true },
                    ].map((row) => (
                      <div key={row.kw} className="px-4 py-3 flex items-center justify-between text-sm">
                        <span className="font-medium text-slate-700">{row.kw}</span>
                        <div className="flex items-center gap-3">
                          <span className={`text-xs font-semibold ${row.up ? 'text-green-600' : 'text-red-500'}`}>
                            {row.change}
                          </span>
                          <span className="font-bold text-slate-900">#{row.pos}</span>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Features Section */}
      <section className="py-20 lg:py-28 bg-white">
        <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="text-center mb-14 lg:mb-16">
            <div className="inline-block text-blue-600 text-sm font-semibold mb-3">תכונות מתקדמות</div>
            <h2 className="text-3xl lg:text-5xl font-extrabold text-slate-900 mb-4 tracking-tight">
              כל מה שצריך לעקוב אחר הדירוגים
            </h2>
            <p className="text-lg text-slate-600 max-w-2xl mx-auto">
              כלים מקצועיים שמתאימים לעסקים קטנים ולסוכנויות, ללא עלויות מנופחות
            </p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {[
              {
                icon: (
                  <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
                  </svg>
                ),
                title: 'גוגל אורגני',
                desc: 'בדוק את הדירוגים שלך בעמודי 1-2 בגוגל. תוצאות מדויקות עם מיקומים אמיתיים בכל ביטוי.',
                color: 'from-blue-500 to-blue-600',
              },
              {
                icon: (
                  <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17.657 16.657L13.414 20.9a1.998 1.998 0 01-2.827 0l-4.244-4.243a8 8 0 1111.314 0z" />
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 11a3 3 0 11-6 0 3 3 0 016 0z" />
                  </svg>
                ),
                title: 'גוגל מפות',
                desc: 'מעקב אחרי המיקומים שלך בגוגל מפות עם מיקוד גיאוגרפי מדויק לפי עיר, מיקוד או נקודת ציון.',
                color: 'from-emerald-500 to-emerald-600',
              },
              {
                icon: (
                  <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 17v-2m3 2v-4m3 4v-6m2 10H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                  </svg>
                ),
                title: 'דוחות חכמים',
                desc: 'יצוא דוחות ל-PDF ול-Excel בלחיצת כפתור. תצוגה ברורה עם מגמות, שינויים והשוואות תקופתיות.',
                color: 'from-purple-500 to-purple-600',
              },
              {
                icon: (
                  <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 7h8m0 0v8m0-8l-8 8-4-4-6 6" />
                  </svg>
                ),
                title: 'מעקב מגמות',
                desc: 'ראה איך הדירוגים שלך משתנים לאורך זמן. גרפים אינטראקטיביים והשוואות בין תקופות.',
                color: 'from-orange-500 to-orange-600',
              },
              {
                icon: (
                  <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" />
                  </svg>
                ),
                title: 'נתונים מאובטחים',
                desc: 'כל הנתונים שלך מוצפנים ומאובטחים. ללא שיתוף עם צדדים שלישיים, פרטיות מלאה.',
                color: 'from-rose-500 to-rose-600',
              },
              {
                icon: (
                  <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 8l7.89 5.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" />
                  </svg>
                ),
                title: 'תמיכה אישית',
                desc: 'תמיכה ישירה בעברית מהצוות שלנו. אנחנו פה בשבילך עם תשובות מהירות ופתרונות מדויקים.',
                color: 'from-indigo-500 to-indigo-600',
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

      {/* How it works */}
      <section className="py-20 lg:py-28 bg-gradient-to-br from-slate-50 to-blue-50">
        <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="text-center mb-14 lg:mb-16">
            <div className="inline-block text-blue-600 text-sm font-semibold mb-3">איך זה עובד</div>
            <h2 className="text-3xl lg:text-5xl font-extrabold text-slate-900 mb-4 tracking-tight">
              להתחיל זה פשוט
            </h2>
            <p className="text-lg text-slate-600 max-w-2xl mx-auto">
              שלושה צעדים לקבל תמונה מלאה על המיקומים שלך בגוגל
            </p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
            {[
              {
                num: '01',
                title: 'הרשמה והגדרת פרויקט',
                desc: 'צור חשבון חינם, הוסף את האתר שלך ובחר את העיר או האזור שאליו אתה מכוון.',
              },
              {
                num: '02',
                title: 'הוספת ביטויי מפתח',
                desc: 'הוסף את הביטויים שאתה רוצה לעקוב אחריהם — בגוגל אורגני, בגוגל מפות או בשניהם.',
              },
              {
                num: '03',
                title: 'מעקב ודוחות',
                desc: 'המערכת תסרוק את המיקומים, תציג מגמות לאורך זמן ותפיק דוחות מקצועיים.',
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

      {/* CTA Section */}
      <section className="py-20 lg:py-28 bg-white">
        <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="relative overflow-hidden rounded-3xl bg-gradient-to-br from-blue-600 via-blue-500 to-blue-400 px-8 py-14 lg:px-16 lg:py-20 text-center shadow-2xl">
            {/* Decorative circles */}
            <div className="absolute -top-24 -right-24 w-64 h-64 rounded-full bg-white/10 blur-3xl" />
            <div className="absolute -bottom-24 -left-24 w-64 h-64 rounded-full bg-white/10 blur-3xl" />

            <div className="relative">
              <h2 className="text-3xl lg:text-5xl font-extrabold text-white mb-4 tracking-tight">
                מוכן להתחיל לעקוב?
              </h2>
              <p className="text-lg lg:text-xl text-blue-100 mb-8 max-w-2xl mx-auto">
                התחל ניסיון חינם של 7 ימים. ללא התחייבות, ללא כרטיס אשראי.
              </p>
              <div className="flex flex-col sm:flex-row items-center justify-center gap-3">
                <Link
                  href={user ? '/dashboard' : '/login'}
                  className="w-full sm:w-auto px-8 py-4 rounded-xl bg-white text-blue-700 font-semibold text-base shadow-lg hover:shadow-xl hover:bg-blue-50 transition-all"
                >
                  {user ? 'לדאשבורד שלי' : 'התחל ניסיון חינם'}
                </Link>
                <Link
                  href="/pricing"
                  className="w-full sm:w-auto px-8 py-4 rounded-xl bg-white/10 backdrop-blur border border-white/20 text-white font-semibold text-base hover:bg-white/20 transition-all"
                >
                  צפה במחירים
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
