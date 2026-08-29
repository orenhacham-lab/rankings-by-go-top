import Link from 'next/link'
import { createClient } from '@/lib/supabase/server'
import { PublicNav } from '@/components/PublicNav'
import { Footer } from '@/components/Footer'
import { PLAN_CATALOG, TRIAL_CATALOG, type PlanCode } from '@/lib/plans/catalog'

const PLAN_ORDER: PlanCode[] = ['regular', 'advanced', 'premium', 'large_agency']

const PLAN_UI: Record<PlanCode, { name: string; description: string }> = {
  regular: { name: 'בייסיק', description: 'פרויקט אחד, בסיס מושלם להתחלה' },
  advanced: { name: 'מתקדם', description: 'לעסקים בצמיחה עם כמה אתרים' },
  premium: { name: 'פרימיום', description: 'לעסקים ולסוכנויות עם צרכים מתקדמים' },
  large_agency: { name: 'סוכנות', description: 'לסוכנויות עם הרבה לקוחות' },
}

/** Highlighted / "most popular" plan — a UI choice, currently pinned to Advanced. */
const HIGHLIGHTED_PLAN: PlanCode = 'advanced'

function formatILS(amount: number): string {
  return `₪${amount.toLocaleString('he-IL')}`
}

const faqs = [
  {
    q: 'איך עובדת מכסת המאמרים?',
    a: 'מכסת המאמרים משותפת לכל הפרויקטים בחשבון שלך ומתחדשת בכל מחזור חיוב. מאמרים שלא נוצלו לא עוברים למחזור הבא.',
  },
  {
    q: 'איך נספרת "בדיקת AI"?',
    a: 'בדיקת AI אחת היא בדיקה של שאילתה אחת במנוע AI אחד. אם אתה בודק את אותה שאילתה במספר מנועי AI (לדוגמה ChatGPT ו-Gemini), כל מנוע נספר כבדיקה נפרדת.',
  },
  {
    q: 'איך נספרת "בדיקת גוגל"?',
    a: 'בדיקת גוגל אחת היא בדיקה של מילת מפתח אחת ביעד אחד — גוגל אורגני או גוגל מפות. אם אתה בודק את אותה מילת מפתח גם באורגני וגם במפות, זה נספר כשתי בדיקות.',
  },
  {
    q: 'מה ההבדל בין סריקה ידנית לסריקה אוטומטית?',
    a: 'אפשר להריץ סריקה ידנית בכל רגע שתרצה, ואפשר גם להפעיל סריקה אוטומטית חודשית שרצה בעצמה בכל מחזור חיוב. אין כרגע אפשרות לסריקה אוטומטית יומית או שבועית — רק ידנית ואוטומטית חודשית.',
  },
  {
    q: 'מה קורה כשאני יוצר מאמר חדש?',
    a: 'יצירת מאמר חדש צורכת קרדיט אחד ממכסת המאמרים שלך. עריכה, תזמון או פרסום של מאמר קיים לא צורכים קרדיט נוסף.',
  },
  {
    q: 'האם אפשר לתזמן ולפרסם מאמרים אוטומטית?',
    a: 'כן. אפשר לתזמן מאמר לפרסום עתידי או לפרסם אותו ישירות לאתר וורדפרס או שופיפיי מחובר.',
  },
  {
    q: 'האם אפשר לשדרג או להוריד תוכנית?',
    a: 'כן, אפשר לעבור בין תוכניות בכל זמן. השינוי נכנס לתוקף והמגבלות החדשות חלות מרגע השינוי ואילך.',
  },
  {
    q: 'איך עובד הניסיון החינם?',
    a: `מקבלים ${TRIAL_CATALOG.days} ימי ניסיון חינם, ללא צורך בכרטיס אשראי, עם פרויקט אחד, עד ${TRIAL_CATALOG.maxKeywordsPerProject} מילות מפתח, עד ${TRIAL_CATALOG.maxGoogleChecksLifetime} בדיקות גוגל ועד ${TRIAL_CATALOG.maxAIChecksLifetime} בדיקות AI לכל אורך תקופת הניסיון, וכן מאמר אחד שנוצר על ידי AI כדי להתנסות בתהליך המלא.`,
  },
  {
    q: 'איך אני מבטל את המנוי?',
    a: 'הביטול פשוט ומיידי. אפשר לבטל את המנוי בכל זמן מתוך הדאשבורד שלך, ללא קנסות או דמי ביטול.',
  },
  {
    q: 'האם הנתונים שלי מאובטחים?',
    a: 'בהחלט. כל הנתונים מוצפנים, מאוחסנים בשרתים מאובטחים ולא משותפים עם צדדים שלישיים. הפרטיות שלך חשובה לנו.',
  },
]

export default async function PricingPage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()

  return (
    <div className="min-h-screen bg-white">
      <PublicNav />

      {/* Hero */}
      <section className="relative pt-28 lg:pt-36 pb-12 lg:pb-16 overflow-hidden">
        <div className="absolute inset-0 bg-gradient-to-br from-blue-50 via-white to-indigo-50" />
        <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_top,_rgba(59,130,246,0.15),_transparent_50%)]" />

        <div className="relative max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 text-center">
          <div className="inline-block text-blue-600 text-sm font-semibold mb-3">תוכניות מחירים</div>
          <h1 className="text-4xl sm:text-5xl lg:text-6xl font-extrabold text-slate-900 leading-tight tracking-tight mb-6">
            תוכניות שמתאימות לכל
            <br />
            <span className="bg-gradient-to-r from-blue-600 via-blue-500 to-blue-400 bg-clip-text text-transparent">
              גודל של עסק
            </span>
          </h1>
          <p className="text-lg lg:text-xl text-slate-600 leading-relaxed">
            מחירים שקופים, ללא הפתעות. התחל בניסיון חינם וגדל בהתאם לצרכים שלך.
          </p>
        </div>
      </section>

      {/* Free Trial CTA */}
      {!user && (
        <section className="pb-10">
          <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8">
            <div className="rounded-2xl border border-blue-200 bg-blue-50 px-6 py-6 sm:px-8 sm:py-7 flex flex-col sm:flex-row items-center gap-4 sm:gap-6 text-center sm:text-right">
              <div className="flex-1">
                <h3 className="text-lg sm:text-xl font-bold text-slate-900 mb-1">
                  רוצים לבדוק את המערכת לפני שמתחייבים?
                </h3>
                <p className="text-sm text-slate-600">
                  התחילו {TRIAL_CATALOG.days} ימי ניסיון בחינם — ללא כרטיס אשראי.
                </p>
              </div>
              <Link
                href="/signup"
                className="inline-block whitespace-nowrap px-6 py-3 rounded-xl bg-blue-600 text-white font-semibold text-sm shadow-md hover:bg-blue-700 transition-colors"
              >
                התחל ניסיון חינם
              </Link>
            </div>
          </div>
        </section>
      )}

      {/* Pricing Cards */}
      <section className="pb-12 lg:pb-16">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
            {PLAN_ORDER.map((code) => {
              const plan = PLAN_CATALOG[code]
              const ui = PLAN_UI[code]
              const highlighted = code === HIGHLIGHTED_PLAN

              const features = [
                plan.maxProjects === 1 ? 'פרויקט אחד' : `עד ${plan.maxProjects} פרויקטים`,
                `עד ${plan.maxKeywordsPerProject} מילות מפתח לכל פרויקט`,
                `עד ${plan.maxGoogleChecksPerPeriodPerProject} בדיקות גוגל בכל מחזור חיוב לפרויקט`,
                `עד ${plan.maxAIChecksPerPeriodPerProject} בדיקות AI בכל מחזור חיוב לפרויקט`,
                `${plan.maxArticlesPerPeriodAccountWide} מאמרים בכל מחזור חיוב, משותפים לכל הפרויקטים בחשבון`,
                'מעקב Google Organic ו-Google Maps',
                'מעקב נראות במנועי AI',
                'יצירה, תזמון ופרסום מאמרים לוורדפרס ולשופיפיי',
                'דוחות PDF ו-Excel',
                'תמיכה אישית',
              ]

              return (
                <div
                  key={code}
                  className={`relative rounded-2xl ${
                    highlighted
                      ? 'bg-gradient-to-br from-blue-600 to-indigo-700 text-white shadow-2xl shadow-blue-600/30 scale-100 lg:scale-105 z-10'
                      : 'bg-white border border-slate-200 text-slate-900 shadow-sm'
                  } p-6 lg:p-7 flex flex-col`}
                >
                  {highlighted && (
                    <div className="absolute -top-3 left-1/2 -translate-x-1/2 px-3 py-1 rounded-full bg-gradient-to-r from-amber-400 to-orange-500 text-white text-xs font-bold shadow-md">
                      הכי פופולרי
                    </div>
                  )}

                  <div className="mb-5">
                    <h3 className={`text-xl font-bold mb-1 ${highlighted ? 'text-white' : 'text-slate-900'}`}>
                      {ui.name}
                    </h3>
                    <p className={`text-sm ${highlighted ? 'text-blue-100' : 'text-slate-500'}`}>
                      {ui.description}
                    </p>
                  </div>

                  <div className="mb-6">
                    <div className="flex items-baseline gap-1">
                      <span className={`text-4xl lg:text-5xl font-extrabold ${highlighted ? 'text-white' : 'text-slate-900'}`}>
                        {formatILS(plan.priceILS)}
                      </span>
                      <span className={`text-sm ${highlighted ? 'text-blue-100' : 'text-slate-500'}`}>
                        לחודש
                      </span>
                    </div>
                  </div>

                  <ul className="space-y-3 mb-8 flex-1">
                    {features.map((feature) => (
                      <li key={feature} className="flex items-start gap-2 text-sm">
                        <span
                          className={`shrink-0 w-5 h-5 rounded-full flex items-center justify-center mt-0.5 ${
                            highlighted ? 'bg-white/20' : 'bg-blue-50'
                          }`}
                        >
                          <svg
                            className={`w-3 h-3 ${highlighted ? 'text-white' : 'text-blue-600'}`}
                            fill="none"
                            stroke="currentColor"
                            strokeWidth={3}
                            viewBox="0 0 24 24"
                          >
                            <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                          </svg>
                        </span>
                        <span className={highlighted ? 'text-blue-50' : 'text-slate-700'}>
                          {feature}
                        </span>
                      </li>
                    ))}
                  </ul>

                  <Link
                    href={user ? '/dashboard' : `/signup?plan=${code}`}
                    className={`block w-full px-5 py-3 rounded-xl text-center font-semibold text-sm transition-all ${
                      highlighted
                        ? 'bg-white text-blue-700 hover:bg-blue-50 shadow-lg'
                        : 'bg-slate-900 text-white hover:bg-slate-800 shadow-sm hover:shadow-md'
                    }`}
                  >
                    להתנסות חינם
                  </Link>
                </div>
              )
            })}
          </div>

          {/* Usage clarification */}
          <div className="mt-10 max-w-4xl mx-auto rounded-2xl border border-blue-100 bg-blue-50/60 px-6 py-5 text-center text-sm text-slate-600 leading-relaxed">
            בדיקת AI אחת היא בדיקה של שאילתה אחת במנוע AI אחד. בדיקת אותה שאילתה במספר מנועים תחושב בנפרד עבור כל מנוע. מכסת המאמרים משותפת לכל הפרויקטים בחשבון ומתחדשת בכל מחזור חיוב.
          </div>

          {/* Comparison note */}
          <p className="text-center text-sm text-slate-500 mt-8">
            כל התוכניות כוללות מעקב Google Organic, Google Maps ונראות ב-AI, וכן יצירה ופרסום מאמרים. המכסות משתנות לפי התוכנית. ביטול בכל זמן ללא קנסות.
          </p>
        </div>
      </section>

      {/* FAQ Section */}
      <section className="py-20 lg:py-24 bg-gradient-to-br from-slate-50 to-blue-50">
        <div className="max-w-3xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="text-center mb-12">
            <div className="inline-block text-blue-600 text-sm font-semibold mb-3">שאלות נפוצות</div>
            <h2 className="text-3xl lg:text-4xl font-extrabold text-slate-900 tracking-tight">
              יש לך שאלה? יש לנו תשובה
            </h2>
          </div>

          <div className="space-y-4">
            {faqs.map((faq) => (
              <details
                key={faq.q}
                className="group bg-white rounded-xl border border-slate-200 overflow-hidden transition-all hover:border-slate-300"
              >
                <summary className="flex items-center justify-between gap-4 px-6 py-5 cursor-pointer list-none">
                  <h3 className="font-semibold text-slate-900 text-base">{faq.q}</h3>
                  <svg
                    className="shrink-0 w-5 h-5 text-slate-400 group-open:rotate-180 transition-transform"
                    fill="none"
                    stroke="currentColor"
                    viewBox="0 0 24 24"
                  >
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                  </svg>
                </summary>
                <div className="px-6 pb-5 text-slate-600 leading-relaxed text-sm">
                  {faq.a}
                </div>
              </details>
            ))}
          </div>
        </div>
      </section>

      {/* CTA Section */}
      <section className="py-20 lg:py-24 bg-white">
        <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="relative overflow-hidden rounded-3xl bg-gradient-to-br from-blue-600 via-blue-500 to-blue-400 px-8 py-12 lg:px-16 lg:py-16 text-center shadow-2xl">
            <div className="absolute -top-24 -right-24 w-64 h-64 rounded-full bg-white/10 blur-3xl" />
            <div className="absolute -bottom-24 -left-24 w-64 h-64 rounded-full bg-white/10 blur-3xl" />

            <div className="relative">
              <h2 className="text-3xl lg:text-4xl font-extrabold text-white mb-4 tracking-tight">
                מוכן להתחיל?
              </h2>
              <p className="text-lg text-blue-100 mb-8 max-w-2xl mx-auto">
                התחל ניסיון חינם של {TRIAL_CATALOG.days} ימים ובדוק את היכולות בעצמך
              </p>
              <Link
                href={user ? '/dashboard' : '/signup'}
                className="inline-block px-8 py-4 rounded-xl bg-white text-blue-700 font-semibold text-base shadow-lg hover:shadow-xl hover:bg-blue-50 transition-all"
              >
                {user ? 'לדאשבורד שלי' : 'התחל ניסיון חינם'}
              </Link>
            </div>
          </div>
        </div>
      </section>

      <Footer />
    </div>
  )
}
