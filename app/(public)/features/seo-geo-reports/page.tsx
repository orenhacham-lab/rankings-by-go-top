import { Metadata } from 'next'
import Link from 'next/link'
import { PublicNav } from '@/components/PublicNav'
import { Footer } from '@/components/Footer'
import { FileText, BarChart2, TrendingUp, Share2, Clock, Zap, Award } from 'lucide-react'

export const metadata: Metadata = {
  title: 'דוחות SEO/GEO מקצועיים | Rankings by Go Top',
  description: 'הפיקו דוחות PDF ו-Excel פרופסיונליים עם דירוגים, מגמות, תחרות ונראות AI. דוחות ללקוחות ודירוגים בלחיצת כפתור.',
}

export default function SEOGeoReportsFeaturePage() {
  return (
    <div className="flex flex-col min-h-screen bg-white">
      <PublicNav locale="he" />

      <main className="flex-1">
        {/* Hero Section */}
        <section className="relative pt-40 pb-20 px-4 sm:px-6 lg:px-8 bg-gradient-to-br from-green-50 via-white to-emerald-50 overflow-hidden">
          <div className="max-w-5xl mx-auto">
            {/* Badge */}
            <div className="flex justify-center mb-8">
              <span className="inline-flex items-center gap-2 px-4 py-2 rounded-full bg-green-100 text-green-800 text-sm font-medium border border-green-200">
                <FileText className="w-4 h-4" />
                דוחות מקצועיים בשנייה
              </span>
            </div>

            {/* Main Heading */}
            <h1 className="text-5xl sm:text-6xl font-bold text-slate-900 text-center mb-6 leading-tight">
              דוחות SEO/GEO שלקוחות אוהבים לראות
            </h1>

            {/* Subheading */}
            <p className="text-xl text-slate-600 text-center mb-12 max-w-2xl mx-auto">
              כל חודש, בלחיצת כפתור. דוחות PDF וExcel מקצועיים שמראים בדיוק מה קרה והיכן אתה מובילים את הלקוח.
            </p>

            {/* CTAs */}
            <div className="flex flex-col sm:flex-row gap-4 justify-center mb-16">
              <Link
                href="/signup"
                className="px-8 py-4 rounded-lg bg-gradient-to-r from-green-600 to-emerald-600 text-white text-lg font-semibold shadow-lg hover:shadow-xl hover:from-green-700 hover:to-emerald-700 transition-all text-center"
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
              <div className="p-8">
                <div className="mb-6">
                  <div className="flex items-center justify-between mb-6">
                    <h3 className="text-lg font-bold text-slate-900">דוח חודשי - מאי 2025</h3>
                    <div className="flex gap-2">
                      <button className="px-4 py-2 bg-blue-100 text-blue-700 rounded-lg text-sm font-medium hover:bg-blue-200">📄 PDF</button>
                      <button className="px-4 py-2 bg-green-100 text-green-700 rounded-lg text-sm font-medium hover:bg-green-200">📊 Excel</button>
                    </div>
                  </div>

                  <div className="grid grid-cols-4 gap-3 mb-6">
                    <div className="bg-blue-50 rounded-lg p-4 border border-blue-200">
                      <div className="text-sm text-slate-600 mb-2">דירוגים בעלייה</div>
                      <div className="text-3xl font-bold text-blue-600">+12</div>
                    </div>
                    <div className="bg-green-50 rounded-lg p-4 border border-green-200">
                      <div className="text-sm text-slate-600 mb-2">ביטויים בתצוגה</div>
                      <div className="text-3xl font-bold text-green-600">847</div>
                    </div>
                    <div className="bg-purple-50 rounded-lg p-4 border border-purple-200">
                      <div className="text-sm text-slate-600 mb-2">זמן בדירוג 1</div>
                      <div className="text-3xl font-bold text-purple-600">18</div>
                    </div>
                    <div className="bg-orange-50 rounded-lg p-4 border border-orange-200">
                      <div className="text-sm text-slate-600 mb-2">משכנתא ממוצע</div>
                      <div className="text-3xl font-bold text-orange-600">4.2</div>
                    </div>
                  </div>

                  <div className="border-t border-slate-200 pt-6">
                    <h4 className="font-semibold text-slate-900 mb-3">עמודי חצי בדירוג 1-3</h4>
                    <div className="space-y-2">
                      {['מילות מפתח: 12', 'דיוור: 8', 'נראות: 6'].map((item, i) => (
                        <div key={i} className="flex items-center justify-between bg-slate-50 p-3 rounded-lg">
                          <span className="text-sm text-slate-700">{item}</span>
                          <div className="h-2 w-20 bg-green-400 rounded-full" />
                        </div>
                      ))}
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </section>

        {/* Why It Matters */}
        <section className="py-20 px-4 sm:px-6 lg:px-8 bg-white">
          <div className="max-w-5xl mx-auto">
            <h2 className="text-4xl font-bold text-slate-900 text-center mb-4">למה דוחות מקצועיים חיוניים?</h2>
            <p className="text-xl text-slate-600 text-center mb-16 max-w-2xl mx-auto">
              דוחות הם דרך לאמור ללקוח: "זה מה שעשיתי לך." זה ההבדל בין שירות טוב לשירות מעולה.
            </p>

            <div className="grid md:grid-cols-3 gap-8">
              <div className="p-8 rounded-lg border border-green-200 bg-green-50 hover:shadow-lg transition-shadow">
                <Share2 className="w-10 h-10 text-green-600 mb-4" />
                <h3 className="text-lg font-bold text-slate-900 mb-3">הצגת ערך</h3>
                <p className="text-slate-700">
                  דוח ברור מראה ללקוח בדיוק מה השינוי בדירוגים, בתנועה, ובביצוע כללי.
                </p>
              </div>

              <div className="p-8 rounded-lg border border-blue-200 bg-blue-50 hover:shadow-lg transition-shadow">
                <Clock className="w-10 h-10 text-blue-600 mb-4" />
                <h3 className="text-lg font-bold text-slate-900 mb-3">חיסכון בזמן</h3>
                <p className="text-slate-700">
                  במקום להסביר בדברים, אתה משלח דוח. לקוח רואה, מבין, ופוקוס משנה לתוכנית הבאה.
                </p>
              </div>

              <div className="p-8 rounded-lg border border-purple-200 bg-purple-50 hover:shadow-lg transition-shadow">
                <Zap className="w-10 h-10 text-purple-600 mb-4" />
                <h3 className="text-lg font-bold text-slate-900 mb-3">בניית אמון</h3>
                <p className="text-slate-700">
                  דוח חודשי אומר: "אני כאן, אני עובד, אני רואה תוצאות." זה בוזר דברים קטנים שבנו אמון.
                </p>
              </div>
            </div>
          </div>
        </section>

        {/* How It Works */}
        <section className="py-20 px-4 sm:px-6 lg:px-8 bg-gradient-to-br from-green-50 to-emerald-50">
          <div className="max-w-5xl mx-auto">
            <h2 className="text-4xl font-bold text-slate-900 text-center mb-16">איך זה עובד</h2>

            <div className="grid md:grid-cols-3 gap-8">
              <div className="relative">
                <div className="absolute -top-6 -left-6 w-12 h-12 rounded-full bg-green-600 text-white flex items-center justify-center text-lg font-bold">1</div>
                <div className="bg-white rounded-lg p-8 border border-slate-200">
                  <h3 className="text-lg font-bold text-slate-900 mb-3">בחרו הגדרות דוח</h3>
                  <p className="text-slate-700">
                    בחרו אילו מדדים להוסיף לדוח: דירוגים, תחרות, AI, פרטים תרופאיים - הכל אפשרי.
                  </p>
                </div>
              </div>

              <div className="relative">
                <div className="absolute -top-6 -left-6 w-12 h-12 rounded-full bg-green-600 text-white flex items-center justify-center text-lg font-bold">2</div>
                <div className="bg-white rounded-lg p-8 border border-slate-200">
                  <h3 className="text-lg font-bold text-slate-900 mb-3">המערכת מייצרת את הדוח</h3>
                  <p className="text-slate-700">
                    אנחנו מהרים את הנתונים, מייצרים גרפים, וממלאים טמפלט פרופסיונלי.
                  </p>
                </div>
              </div>

              <div className="relative">
                <div className="absolute -top-6 -left-6 w-12 h-12 rounded-full bg-green-600 text-white flex items-center justify-center text-lg font-bold">3</div>
                <div className="bg-white rounded-lg p-8 border border-slate-200">
                  <h3 className="text-lg font-bold text-slate-900 mb-3">שלחו או הורידו</h3>
                  <p className="text-slate-700">
                    PDF או Excel בדקה. אתה משלח ללקוח או שמירה בלחיצת כפתור.
                  </p>
                </div>
              </div>
            </div>
          </div>
        </section>

        {/* Key Features */}
        <section className="py-20 px-4 sm:px-6 lg:px-8 bg-white">
          <div className="max-w-5xl mx-auto">
            <h2 className="text-4xl font-bold text-slate-900 text-center mb-16">מה כלול בדוחות</h2>

            <div className="grid md:grid-cols-2 gap-8">
              <div className="flex gap-4">
                <BarChart2 className="w-6 h-6 text-green-600 flex-shrink-0 mt-1" />
                <div>
                  <h3 className="font-bold text-slate-900 mb-2">סיכום דירוגים ומגמות</h3>
                  <p className="text-slate-700">ניתוח משוקלל מלא של הדירוגים שלך. עלייה? ירידה? ניתוח מפורט של מהו השינוי.</p>
                </div>
              </div>

              <div className="flex gap-4">
                <TrendingUp className="w-6 h-6 text-blue-600 flex-shrink-0 mt-1" />
                <div>
                  <h3 className="font-bold text-slate-900 mb-2">גרפים ותרשימים</h3>
                  <p className="text-slate-700">גרפים בחודש לחודש. קל להבין מה קרה כי הוא ויזואלי.</p>
                </div>
              </div>

              <div className="flex gap-4">
                <FileText className="w-6 h-6 text-purple-600 flex-shrink-0 mt-1" />
                <div>
                  <h3 className="font-bold text-slate-900 mb-2">רשימת מילים מפתח מלאה</h3>
                  <p className="text-slate-700">לכל מילה מפתח: דירוג נוכחי, דירוג עבר, שינוי, URL, וציון.</p>
                </div>
              </div>

              <div className="flex gap-4">
                <Award className="w-6 h-6 text-orange-600 flex-shrink-0 mt-1" />
                <div>
                  <h3 className="font-bold text-slate-900 mb-2">ניתוח תחרויות</h3>
                  <p className="text-slate-700">איפה אתה עומד לעומת התחרות. מי בשלוש ראשונות? מי מקדימים?</p>
                </div>
              </div>

              <div className="flex gap-4">
                <Share2 className="w-6 h-6 text-indigo-600 flex-shrink-0 mt-1" />
                <div>
                  <h3 className="font-bold text-slate-900 mb-2">אפשרויות עיצוב וברנדינג</h3>
                  <p className="text-slate-700">הוסיפו לוגו שלכם. בחרו צבעים. עשו את הדוח שלכם.</p>
                </div>
              </div>

              <div className="flex gap-4">
                <Clock className="w-6 h-6 text-red-600 flex-shrink-0 mt-1" />
                <div>
                  <h3 className="font-bold text-slate-900 mb-2">דוח חודשי אוטומטי</h3>
                  <p className="text-slate-700">הגדירו וקבלו דוח בעצמו חודש. אפילו לא צריך לדעת.</p>
                </div>
              </div>
            </div>
          </div>
        </section>

        {/* Who It's For */}
        <section className="py-20 px-4 sm:px-6 lg:px-8 bg-gradient-to-br from-slate-50 to-green-50">
          <div className="max-w-5xl mx-auto">
            <h2 className="text-4xl font-bold text-slate-900 text-center mb-16">למי זה החיוני</h2>

            <div className="grid md:grid-cols-2 gap-8">
              <div className="bg-white rounded-lg p-8 border-l-4 border-green-600">
                <h3 className="text-xl font-bold text-slate-900 mb-3">סוכנויות דיגיטל</h3>
                <p className="text-slate-700 mb-4">אתה עובד עם מספר לקוחות וכל אחד רוצה לדעת: איך הם לקוחות שלי עושים?</p>
                <ul className="space-y-2 text-sm text-slate-600">
                  <li>✓ דוחות אוטומטיים לכל לקוח</li>
                  <li>✓ עדויות לערך השירות שלך</li>
                  <li>✓ אמון וחידוש עם לקוחות</li>
                </ul>
              </div>

              <div className="bg-white rounded-lg p-8 border-l-4 border-emerald-600">
                <h3 className="text-xl font-bold text-slate-900 mb-3">עסקים בעצמם</h3>
                <p className="text-slate-700 mb-4">אתה עוקב אחרי דירוגים שלך וצריך להציג למנהלים התוצאות.</p>
                <ul className="space-y-2 text-sm text-slate-600">
                  <li>✓ דוחות כל חודש</li>
                  <li>✓ הוכחת השקעות בSEO</li>
                  <li>✓ תכנוני תחזוקה עתידיים</li>
                </ul>
              </div>

              <div className="bg-white rounded-lg p-8 border-l-4 border-blue-600">
                <h3 className="text-xl font-bold text-slate-900 mb-3">מקדמי תוכן</h3>
                <p className="text-slate-700 mb-4">אתה משתמש בRankings by Go Top לעקיבה, ותוכל לשתף דוחות עם צוות שלך.</p>
                <ul className="space-y-2 text-sm text-slate-600">
                  <li>✓ דוחות לחודשיים לצוות</li>
                  <li>✓ יעדים ברורים לכל כותב</li>
                  <li>✓ דוקומנטציה של השפעת תוכן</li>
                </ul>
              </div>

              <div className="bg-white rounded-lg p-8 border-l-4 border-purple-600">
                <h3 className="text-xl font-bold text-slate-900 mb-3">עסקים עם צוותי שיווק</h3>
                <p className="text-slate-700 mb-4">צוות השיווק שלך צריך לדעת: האם הקמפיין שלנו עובד?</p>
                <ul className="space-y-2 text-sm text-slate-600">
                  <li>✓ ROI ברור מSEO</li>
                  <li>✓ משוואה עם מקורות אחרים</li>
                  <li>✓ תוכניות שיפור עתידיות</li>
                </ul>
              </div>
            </div>
          </div>
        </section>

        {/* CTA Section */}
        <section className="py-20 px-4 sm:px-6 lg:px-8 bg-gradient-to-r from-green-600 to-emerald-600">
          <div className="max-w-3xl mx-auto text-center">
            <h2 className="text-4xl font-bold text-white mb-6">התחילו לייצר דוחות מקצועיים</h2>
            <p className="text-xl text-green-100 mb-8">
              דוח ראשון בדקה אחת. שם קורה ההבדל.
            </p>
            <Link
              href="/signup"
              className="inline-block px-8 py-4 rounded-lg bg-white text-green-600 text-lg font-bold shadow-lg hover:shadow-xl hover:scale-105 transition-all"
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
