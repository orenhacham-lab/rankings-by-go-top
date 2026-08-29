import { Metadata } from 'next'
import Link from 'next/link'
import { PublicNav } from '@/components/PublicNav'
import { Footer } from '@/components/Footer'
import { Search, TrendingUp, Globe, Smartphone, BarChart3, Clock } from 'lucide-react'
import { buildHreflangAlternates } from '@/lib/seo/hreflang'

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
  return (
    <div className="flex flex-col min-h-screen bg-white">
      <PublicNav locale="he" />

      <main className="flex-1">
        {/* Hero Section */}
        <section className="relative pt-40 pb-20 px-4 sm:px-6 lg:px-8 bg-gradient-to-br from-blue-50 via-white to-indigo-50 overflow-hidden">
          <div className="max-w-5xl mx-auto">
            {/* Badge */}
            <div className="flex justify-center mb-8">
              <span className="inline-flex items-center gap-2 px-4 py-2 rounded-full bg-blue-100 text-blue-800 text-sm font-medium border border-blue-200">
                <Search className="w-4 h-4" />
                מעקב דירוגים בגוגל
              </span>
            </div>

            {/* Main Heading */}
            <h1 className="text-5xl sm:text-6xl font-bold text-slate-900 text-center mb-6 leading-tight">
              עקבו אחרי הדירוגים שלכם בגוגל, בכל רגע שתרצו
            </h1>

            {/* Subheading */}
            <p className="text-xl text-slate-600 text-center mb-12 max-w-2xl mx-auto">
              קבלו מידע מדויק על מיקום האתר שלכם בתוצאות החיפוש של גוגל. הריצו סריקה ידנית מתי שנוח לכם, או תנו למערכת לסרוק אוטומטית פעם בחודש. עקבו אחרי מגמות, השוו לתחרות, וקבלו דוחות מפורטים.
            </p>

            {/* CTAs */}
            <div className="flex flex-col sm:flex-row gap-4 justify-center mb-16">
              <Link
                href="/signup"
                className="px-8 py-4 rounded-lg bg-gradient-to-r from-blue-600 to-indigo-600 text-white text-lg font-semibold shadow-lg hover:shadow-xl hover:from-blue-700 hover:to-indigo-700 transition-all text-center"
              >
                התחילו ניסיון חינם
              </Link>
              <Link
                href="/pricing"
                className="px-8 py-4 rounded-lg border-2 border-slate-300 text-slate-700 text-lg font-semibold hover:bg-slate-50 transition-all text-center"
              >
                צפו במחירים
              </Link>
            </div>

            {/* Visual Mockup */}
            <div className="relative bg-white rounded-xl shadow-2xl border border-slate-200 overflow-hidden">
              <div className="bg-gradient-to-r from-slate-900 to-slate-800 px-6 py-4 flex items-center gap-2">
                <div className="flex gap-2">
                  <div className="w-3 h-3 rounded-full bg-red-400" />
                  <div className="w-3 h-3 rounded-full bg-yellow-400" />
                  <div className="w-3 h-3 rounded-full bg-green-400" />
                </div>
              </div>
              <div className="p-6">
                <div className="space-y-4">
                  <div className="flex items-center justify-between">
                    <div className="text-sm font-medium text-slate-700">מילת מפתח</div>
                    <div className="text-sm font-medium text-slate-700">מיקום</div>
                    <div className="text-sm font-medium text-slate-700">שינוי</div>
                    <div className="text-sm font-medium text-slate-700">URL</div>
                  </div>
                  <div className="border-t border-slate-200" />
                  {[
                    { keyword: 'הלוואה שיכון', pos: 3, change: '↑2', url: 'example.com' },
                    { keyword: 'הלוואה ללא עיכול', pos: 8, change: '↓1', url: 'example.com' },
                    { keyword: 'בנק דיגיטלי', pos: 1, change: '→', url: 'example.com' },
                    { keyword: 'משכנתא זולה', pos: 12, change: '↑5', url: 'example.com' },
                  ].map((item, i) => (
                    <div key={i} className="flex items-center justify-between text-sm">
                      <span className="text-slate-900 font-medium">{item.keyword}</span>
                      <span className="text-slate-600">{item.pos}</span>
                      <span className={item.change.includes('↑') ? 'text-green-600' : item.change.includes('↓') ? 'text-red-600' : 'text-slate-600'}>
                        {item.change}
                      </span>
                      <span className="text-slate-600 text-xs">{item.url}</span>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </div>
        </section>

        {/* Why It Matters */}
        <section className="py-20 px-4 sm:px-6 lg:px-8 bg-white">
          <div className="max-w-5xl mx-auto">
            <h2 className="text-4xl font-bold text-slate-900 text-center mb-4">למה מעקב דירוגים חשוב?</h2>
            <p className="text-xl text-slate-600 text-center mb-16 max-w-2xl mx-auto">
              בעולם דיגיטלי, דירוג גבוה בגוגל הוא מה שמביא לכם לקוחות. ככל שתדעו יותר על המיקום שלכם, כך תוכלו לקבל החלטות שיווק טובות יותר.
            </p>

            <div className="grid md:grid-cols-3 gap-8">
              <div className="p-8 rounded-lg border border-blue-200 bg-blue-50 hover:shadow-lg transition-shadow">
                <TrendingUp className="w-10 h-10 text-blue-600 mb-4" />
                <h3 className="text-lg font-bold text-slate-900 mb-3">מעקב מגמות לאורך זמן</h3>
                <p className="text-slate-700">
                  ראו כיצד הדירוג שלכם משתנה מסריקה לסריקה. תוך כמה חודשים תוכלו לראות אם הקמפיין שלכם ב-SEO עובד או לא.
                </p>
              </div>

              <div className="p-8 rounded-lg border border-green-200 bg-green-50 hover:shadow-lg transition-shadow">
                <Globe className="w-10 h-10 text-green-600 mb-4" />
                <h3 className="text-lg font-bold text-slate-900 mb-3">השוואה עם תחרות</h3>
                <p className="text-slate-700">
                  דעו בדיוק איפה אתם עומדים לעומת המתחרים. היכן אתם מקדימים והיכן אתם מפגרים.
                </p>
              </div>

              <div className="p-8 rounded-lg border border-purple-200 bg-purple-50 hover:shadow-lg transition-shadow">
                <BarChart3 className="w-10 h-10 text-purple-600 mb-4" />
                <h3 className="text-lg font-bold text-slate-900 mb-3">דוחות מקצועיים</h3>
                <p className="text-slate-700">
                  הציגו ללקוח / ללמנהלים דוחות שמראים בדיוק מה קרה וכיצד השיפורים משפרים את העסק.
                </p>
              </div>
            </div>
          </div>
        </section>

        {/* How It Works */}
        <section className="py-20 px-4 sm:px-6 lg:px-8 bg-gradient-to-br from-blue-50 to-indigo-50">
          <div className="max-w-5xl mx-auto">
            <h2 className="text-4xl font-bold text-slate-900 text-center mb-16">איך זה עובד</h2>

            <div className="grid md:grid-cols-3 gap-8">
              <div className="relative">
                <div className="absolute -top-6 -left-6 w-12 h-12 rounded-full bg-blue-600 text-white flex items-center justify-center text-lg font-bold">1</div>
                <div className="bg-white rounded-lg p-8 border border-slate-200">
                  <h3 className="text-lg font-bold text-slate-900 mb-3">הוסיפו מילות מפתח</h3>
                  <p className="text-slate-700">
                    הוסיפו את מילות המפתח החשובות לתחום שלכם. אפשר להוסיף מהר ובקל דרך CSV.
                  </p>
                </div>
              </div>

              <div className="relative">
                <div className="absolute -top-6 -left-6 w-12 h-12 rounded-full bg-blue-600 text-white flex items-center justify-center text-lg font-bold">2</div>
                <div className="bg-white rounded-lg p-8 border border-slate-200">
                  <h3 className="text-lg font-bold text-slate-900 mb-3">בחרו הגדרות</h3>
                  <p className="text-slate-700">
                    בחרו מדינה, עיר, שפה, ומכשיר. אפשרות עשירה לבדיקה מדויקת של כל תרחיש.
                  </p>
                </div>
              </div>

              <div className="relative">
                <div className="absolute -top-6 -left-6 w-12 h-12 rounded-full bg-blue-600 text-white flex items-center justify-center text-lg font-bold">3</div>
                <div className="bg-white rounded-lg p-8 border border-slate-200">
                  <h3 className="text-lg font-bold text-slate-900 mb-3">קבלו תוצאות</h3>
                  <p className="text-slate-700">
                    הריצו סריקה ידנית מתי שנוח לכם, או הפעילו סריקה אוטומטית חודשית לשמירה על היסטוריה מעודכנת. תראו גרפים ודוחות ברגע שהתוצאות מוכנות.
                  </p>
                </div>
              </div>
            </div>
          </div>
        </section>

        {/* Key Features */}
        <section className="py-20 px-4 sm:px-6 lg:px-8 bg-white">
          <div className="max-w-5xl mx-auto">
            <h2 className="text-4xl font-bold text-slate-900 text-center mb-16">מה אתם יכולים למדוד</h2>

            <div className="grid md:grid-cols-2 gap-8">
              <div className="flex gap-4">
                <Smartphone className="w-6 h-6 text-blue-600 flex-shrink-0 mt-1" />
                <div>
                  <h3 className="font-bold text-slate-900 mb-2">מעקב לפי מכשיר</h3>
                  <p className="text-slate-700">בדקו דירוגים בנפרד עבור דסקטופ וניידים. הדירוגים עלולים להיות שונים בכל מכשיר.</p>
                </div>
              </div>

              <div className="flex gap-4">
                <Globe className="w-6 h-6 text-green-600 flex-shrink-0 mt-1" />
                <div>
                  <h3 className="font-bold text-slate-900 mb-2">מעקב גיאוגרפי</h3>
                  <p className="text-slate-700">בדקו דירוגים לפי מדינה, עיר, שפה. כל אזור עשוי להיות שונה.</p>
                </div>
              </div>

              <div className="flex gap-4">
                <TrendingUp className="w-6 h-6 text-purple-600 flex-shrink-0 mt-1" />
                <div>
                  <h3 className="font-bold text-slate-900 mb-2">ניתוח מגמות</h3>
                  <p className="text-slate-700">ראו כיצד הדירוגים משתנים לאורך זמן. גרפים ברורים יעזרו לכם להבין את הטרנדים.</p>
                </div>
              </div>

              <div className="flex gap-4">
                <BarChart3 className="w-6 h-6 text-orange-600 flex-shrink-0 mt-1" />
                <div>
                  <h3 className="font-bold text-slate-900 mb-2">השוואת מתחרים</h3>
                  <p className="text-slate-700">אם הזנתם את דירוגי המתחרים, תוכלו לראות בדיוק איפה אתם עומדים מולם.</p>
                </div>
              </div>

              <div className="flex gap-4">
                <Clock className="w-6 h-6 text-indigo-600 flex-shrink-0 mt-1" />
                <div>
                  <h3 className="font-bold text-slate-900 mb-2">בדיקות אוטומטיות חודשיות</h3>
                  <p className="text-slate-700">פעם בחודש המערכת תבדוק את הדירוגים שלכם באופן אוטומטי. תוכלו גם להריץ בדיקה ידנית בכל רגע שתרצו.</p>
                </div>
              </div>

              <div className="flex gap-4">
                <Search className="w-6 h-6 text-pink-600 flex-shrink-0 mt-1" />
                <div>
                  <h3 className="font-bold text-slate-900 mb-2">מידע מלא לכל ביטוי</h3>
                  <p className="text-slate-700">עבור כל מילת מפתח, קבלו את ה-URL שמדורג, את המטא תיאור, ועוד.</p>
                </div>
              </div>
            </div>
          </div>
        </section>

        {/* Who It's For */}
        <section className="py-20 px-4 sm:px-6 lg:px-8 bg-gradient-to-br from-slate-50 to-blue-50">
          <div className="max-w-5xl mx-auto">
            <h2 className="text-4xl font-bold text-slate-900 text-center mb-16">למי זה מתאים</h2>

            <div className="grid md:grid-cols-2 gap-8">
              <div className="bg-white rounded-lg p-8 border-l-4 border-blue-600">
                <h3 className="text-xl font-bold text-slate-900 mb-3">בעלי עסקים קטנים ובינוניים</h3>
                <p className="text-slate-700 mb-4">אם יש לכם אתר וחשוב לכם שלקוחות ימצאו אתכם בגוגל, זה בדיוק מה שצריך.</p>
                <ul className="space-y-2 text-sm text-slate-600">
                  <li>✓ מעקב פשוט וברור</li>
                  <li>✓ מחיר נוח עבור עסק קטן</li>
                  <li>✓ דוחות שאפשר להציג ללקוח</li>
                </ul>
              </div>

              <div className="bg-white rounded-lg p-8 border-l-4 border-indigo-600">
                <h3 className="text-xl font-bold text-slate-900 mb-3">סוכנויות דיגיטל</h3>
                <p className="text-slate-700 mb-4">אם אתם עובדים עם לקוחות, הם יחזרו לכם כל חודש וישאלו: איך הקמפיין?</p>
                <ul className="space-y-2 text-sm text-slate-600">
                  <li>✓ דוחות למצגות לקוחות</li>
                  <li>✓ מעקב של מס' פרויקטים בו זמנית</li>
                  <li>✓ הוכחה לשווי השירות שלכם</li>
                </ul>
              </div>

              <div className="bg-white rounded-lg p-8 border-l-4 border-green-600">
                <h3 className="text-xl font-bold text-slate-900 mb-3">מנהלי שיווק ודיגיטל</h3>
                <p className="text-slate-700 mb-4">אם אתם אחראים על ביצועי האתר, תזדקקו לדוח ברור על הדירוגים.</p>
                <ul className="space-y-2 text-sm text-slate-600">
                  <li>✓ ניתוח מפורט של ביצועים</li>
                  <li>✓ זיהוי בעיות ומקורות בעיות</li>
                  <li>✓ עדויות להשפעת עבודה</li>
                </ul>
              </div>

              <div className="bg-white rounded-lg p-8 border-l-4 border-purple-600">
                <h3 className="text-xl font-bold text-slate-900 mb-3">מקדמי SEO ובעלי מקצוע</h3>
                <p className="text-slate-700 mb-4">אם אתם עובדים על SEO, תצטרכו לדעת בדיוק איפה ומתי הדירוגים משתנים.</p>
                <ul className="space-y-2 text-sm text-slate-600">
                  <li>✓ סריקות לפי דרישה בכל רגע</li>
                  <li>✓ הוכחה של השפעת העבודה</li>
                  <li>✓ יעדים ומדדי KPI ברורים</li>
                </ul>
              </div>
            </div>
          </div>
        </section>

        {/* CTA Section */}
        <section className="py-20 px-4 sm:px-6 lg:px-8 bg-gradient-to-r from-blue-600 to-indigo-600">
          <div className="max-w-3xl mx-auto text-center">
            <h2 className="text-4xl font-bold text-white mb-6">התחילו לעקוב אחרי הדירוגים שלכם היום</h2>
            <p className="text-xl text-blue-100 mb-8">
              ניסיון חינם לשבוע, ללא כרטיס אשראי. בדקו בעצמכם איך זה עובד.
            </p>
            <Link
              href="/signup"
              className="inline-block px-8 py-4 rounded-lg bg-white text-blue-600 text-lg font-bold shadow-lg hover:shadow-xl hover:scale-105 transition-all"
            >
              התחילו ניסיון חינם
            </Link>
          </div>
        </section>
      </main>

      <Footer locale="he" />
    </div>
  )
}
