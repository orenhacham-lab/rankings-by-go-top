import Link from 'next/link'
import { createClient } from '@/lib/supabase/server'
import { PublicNav } from '@/components/PublicNav'
import { Footer } from '@/components/Footer'



interface Plan {
  name: string
  price: string
  priceSuffix?: string
  description: string
  features: string[]
  cta: string
  highlighted?: boolean
  badge?: string
}

const plans: Plan[] = [
  {
    name: 'ניסיון',
    price: '₪0',
    priceSuffix: 'חינם לנצח',
    description: 'מושלם להתנסות במערכת לפני קבלת החלטה',
    features: [
      'פרויקט אחד',
      'עד 30 מילות מפתח',
      'סריקה אחת בחודש',
      'תמיכה בסיסית',
    ],
    cta: 'התחל ניסיון חינם',
  },
  {
    name: 'רגיל',
    price: '₪69',
    priceSuffix: '/ חודש',
    description: 'לעסקים קטנים שרוצים לעקוב אחרי מספר פרויקטים',
    features: [
      'עד 3 פרויקטים',
      'עד 50 מילות מפתח לפרויקט',
      'סריקה 1 בחודש לכל פרויקט',
      'דוחות PDF ו-Excel',
      'גוגל אורגני וגוגל מפות',
      'תמיכה בעברית',
    ],
    cta: 'בחר תוכנית',
  },
  {
    name: 'מתקדם',
    price: '₪199',
    priceSuffix: '/ חודש',
    description: 'התוכנית הפופולרית ביותר לעסקים בצמיחה',
    features: [
      'עד 10 פרויקטים',
      'עד 50 מילות מפתח לפרויקט',
      '2 סריקות בחודש לכל פרויקט',
      'דוחות PDF ו-Excel',
      'גוגל אורגני וגוגל מפות',
      'מעקב מגמות מתקדם',
      'תמיכה אישית',
    ],
    cta: 'בחר תוכנית',
    highlighted: true,
    badge: 'הכי פופולרי',
  },
  {
    name: 'פרמיום',
    price: '₪299',
    priceSuffix: '/ חודש',
    description: 'לסוכנויות ועסקים גדולים עם דרישות מתקדמות',
    features: [
      'עד 25 פרויקטים',
      'עד 100 מילות מפתח לפרויקט',
      '2 סריקות בחודש לכל פרויקט',
      'דוחות PDF ו-Excel',
      'גוגל אורגני וגוגל מפות',
      'מעקב מגמות מתקדם',
      'תמיכה VIP בעדיפות',
      'הדרכה אישית',
    ],
    cta: 'בחר תוכנית',
  },
]

const faqs = [
  {
    q: 'איך עובד הניסיון החינם?',
    a: 'אתה מקבל 7 ימי ניסיון חינם בתוכנית הניסיון, ללא צורך בכרטיס אשראי. תוכל לבדוק את כל היכולות של המערכת לפני שאתה מחליט.',
  },
  {
    q: 'האם אפשר לשדרג או להוריד תוכנית?',
    a: 'כן! אפשר לעבור בין תוכניות בכל זמן. השדרוג נכנס לתוקף מיידית, וירידת תוכנית מתבצעת בתחילת מחזור החיוב הבא.',
  },
  {
    q: 'מה כוללת "סריקה" של מילות מפתח?',
    a: 'סריקה אחת בודקת את המיקום של כל מילות המפתח שהגדרת בפרויקט בגוגל אורגני ובגוגל מפות, ומפיקה דוח מלא עם המיקומים, המגמות והשינויים.',
  },
  {
    q: 'איך אני מבטל את המנוי?',
    a: 'הביטול פשוט ומיידי. אפשר לבטל את המנוי בכל זמן מתוך הדאשבורד שלך, ללא קנסות או דמי ביטול.',
  },
  {
    q: 'האם הנתונים שלי מאובטחים?',
    a: 'בהחלט. כל הנתונים מוצפנים, מאוחסנים בשרתים מאובטחים ולא משותפים עם צדדים שלישיים. הפרטיות שלך חשובה לנו.',
  },
  {
    q: 'מה ההבדל בין גוגל אורגני לגוגל מפות?',
    a: 'גוגל אורגני בודק את המיקום שלך בתוצאות החיפוש הרגילות של גוגל. גוגל מפות בודק את המיקום בתוצאות הממוקמות גיאוגרפית — חשוב במיוחד לעסקים מקומיים.',
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

      {/* Pricing Cards */}
      <section className="pb-20 lg:pb-28">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
            {plans.map((plan) => (
              <div
                key={plan.name}
                className={`relative rounded-2xl ${
                  plan.highlighted
                    ? 'bg-gradient-to-br from-blue-600 to-indigo-700 text-white shadow-2xl shadow-blue-600/30 scale-100 lg:scale-105 z-10'
                    : 'bg-white border border-slate-200 text-slate-900 shadow-sm'
                } p-6 lg:p-7 flex flex-col`}
              >
                {plan.badge && (
                  <div className="absolute -top-3 left-1/2 -translate-x-1/2 px-3 py-1 rounded-full bg-gradient-to-r from-amber-400 to-orange-500 text-white text-xs font-bold shadow-md">
                    {plan.badge}
                  </div>
                )}

                <div className="mb-5">
                  <h3 className={`text-xl font-bold mb-1 ${plan.highlighted ? 'text-white' : 'text-slate-900'}`}>
                    {plan.name}
                  </h3>
                  <p className={`text-sm ${plan.highlighted ? 'text-blue-100' : 'text-slate-500'}`}>
                    {plan.description}
                  </p>
                </div>

                <div className="mb-6">
                  <div className="flex items-baseline gap-1">
                    <span className={`text-4xl lg:text-5xl font-extrabold ${plan.highlighted ? 'text-white' : 'text-slate-900'}`}>
                      {plan.price}
                    </span>
                    {plan.priceSuffix && (
                      <span className={`text-sm ${plan.highlighted ? 'text-blue-100' : 'text-slate-500'}`}>
                        {plan.priceSuffix}
                      </span>
                    )}
                  </div>
                </div>

                <ul className="space-y-3 mb-8 flex-1">
                  {plan.features.map((feature) => (
                    <li key={feature} className="flex items-start gap-2 text-sm">
                      <span
                        className={`shrink-0 w-5 h-5 rounded-full flex items-center justify-center mt-0.5 ${
                          plan.highlighted ? 'bg-white/20' : 'bg-blue-50'
                        }`}
                      >
                        <svg
                          className={`w-3 h-3 ${plan.highlighted ? 'text-white' : 'text-blue-600'}`}
                          fill="none"
                          stroke="currentColor"
                          strokeWidth={3}
                          viewBox="0 0 24 24"
                        >
                          <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                        </svg>
                      </span>
                      <span className={plan.highlighted ? 'text-blue-50' : 'text-slate-700'}>
                        {feature}
                      </span>
                    </li>
                  ))}
                </ul>

                <Link
                  href={user ? '/dashboard' : '/login'}
                  className={`block w-full px-5 py-3 rounded-xl text-center font-semibold text-sm transition-all ${
                    plan.highlighted
                      ? 'bg-white text-blue-700 hover:bg-blue-50 shadow-lg'
                      : 'bg-slate-900 text-white hover:bg-slate-800 shadow-sm hover:shadow-md'
                  }`}
                >
                  {plan.cta}
                </Link>
              </div>
            ))}
          </div>

          {/* Comparison note */}
          <p className="text-center text-sm text-slate-500 mt-12">
            כל התוכניות כוללות גישה מלאה לכל היכולות. ביטול בכל זמן ללא קנסות.
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
                התחל ניסיון חינם של 7 ימים ובדוק את היכולות בעצמך
              </p>
              <Link
                href={user ? '/dashboard' : '/login'}
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
