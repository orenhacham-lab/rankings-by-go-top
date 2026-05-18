import { Metadata } from 'next'
import Link from 'next/link'
import { PublicNav } from '@/components/PublicNav'
import { Footer } from '@/components/Footer'
import { Brain, MessageSquare, Zap, TrendingUp, Link2, BarChart3 } from 'lucide-react'

export const metadata: Metadata = {
  title: 'מעקב נראות AI | Rankings by Go Top',
  description: 'גלו האם העסק, האתר או המותג שלכם מופיעים בתשובות של ChatGPT, Gemini, Perplexity, Google AI וכלים נוספים. מעקב GEO - Generative Engine Optimization.',
}

export default function AIVisibilityFeaturePage() {
  return (
    <div className="flex flex-col min-h-screen bg-white">
      <PublicNav locale="he" />

      <main className="flex-1">
        {/* Hero Section */}
        <section className="relative pt-40 pb-20 px-4 sm:px-6 lg:px-8 bg-gradient-to-br from-purple-50 via-white to-indigo-50 overflow-hidden">
          <div className="max-w-5xl mx-auto">
            {/* Badge */}
            <div className="flex justify-center mb-8">
              <span className="inline-flex items-center gap-2 px-4 py-2 rounded-full bg-purple-100 text-purple-800 text-sm font-medium border border-purple-200">
                <Brain className="w-4 h-4" />
                GEO - Generative Engine Optimization
              </span>
            </div>

            {/* Main Heading */}
            <h1 className="text-5xl sm:text-6xl font-bold text-slate-900 text-center mb-6 leading-tight">
              מעקב נראות העסק שלכם במנועי AI
            </h1>

            {/* Subheading */}
            <p className="text-xl text-slate-600 text-center mb-12 max-w-2xl mx-auto">
              ממעט אנשים מבינים זאת, אבל יותר ויותר לקוחות משתמשים בChatGPT, Gemini, וPerplexity בחיפוש. אם אתה שם, הם ימצאו אותך.
            </p>

            {/* CTAs */}
            <div className="flex flex-col sm:flex-row gap-4 justify-center mb-16">
              <Link
                href="/signup"
                className="px-8 py-4 rounded-lg bg-gradient-to-r from-purple-600 to-indigo-600 text-white text-lg font-semibold shadow-lg hover:shadow-xl hover:from-purple-700 hover:to-indigo-700 transition-all text-center"
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
                  <h3 className="font-bold text-slate-900 mb-4">נראות בתשובות AI לביטוי: "הלוואה לרכישת דירה"</h3>
                  <div className="space-y-3">
                    <div className="flex items-center gap-3 p-4 rounded-lg bg-gradient-to-r from-purple-50 to-indigo-50 border border-purple-200">
                      <div className="w-10 h-10 rounded-lg bg-purple-200 flex items-center justify-center">
                        <MessageSquare className="w-5 h-5 text-purple-700" />
                      </div>
                      <div className="flex-1">
                        <div className="font-semibold text-slate-900">ChatGPT (OpenAI)</div>
                        <div className="text-sm text-slate-600">✓ מוזכרים באתר הדירוג שלנו כחברה אמינה</div>
                      </div>
                      <span className="text-lg font-bold text-green-600">✓</span>
                    </div>
                    <div className="flex items-center gap-3 p-4 rounded-lg bg-gradient-to-r from-blue-50 to-cyan-50 border border-blue-200">
                      <div className="w-10 h-10 rounded-lg bg-blue-200 flex items-center justify-center">
                        <Zap className="w-5 h-5 text-blue-700" />
                      </div>
                      <div className="flex-1">
                        <div className="font-semibold text-slate-900">Gemini (Google)</div>
                        <div className="text-sm text-slate-600">✓ ציטוט ישיר מהאתר שלנו בתשובה</div>
                      </div>
                      <span className="text-lg font-bold text-green-600">✓</span>
                    </div>
                    <div className="flex items-center gap-3 p-4 rounded-lg bg-gray-50 border border-gray-200">
                      <div className="w-10 h-10 rounded-lg bg-gray-300 flex items-center justify-center">
                        <Brain className="w-5 h-5 text-gray-700" />
                      </div>
                      <div className="flex-1">
                        <div className="font-semibold text-slate-900">Perplexity</div>
                        <div className="text-sm text-slate-600">✗ לא מוזכר בתשובה</div>
                      </div>
                      <span className="text-lg font-bold text-red-600">✗</span>
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
            <h2 className="text-4xl font-bold text-slate-900 text-center mb-4">למה מעקב נראות AI משנה הכל?</h2>
            <p className="text-xl text-slate-600 text-center mb-16 max-w-2xl mx-auto">
              בעוד שנים קלות, GEO (Generative Engine Optimization) תהיה חלק חשוב לא פחות מ-SEO.
            </p>

            <div className="grid md:grid-cols-3 gap-8">
              <div className="p-8 rounded-lg border border-purple-200 bg-purple-50 hover:shadow-lg transition-shadow">
                <Brain className="w-10 h-10 text-purple-600 mb-4" />
                <h3 className="text-lg font-bold text-slate-900 mb-3">חיפוש חדש = שחקנים חדשים</h3>
                <p className="text-slate-700">
                  גוגל כבר לא הגבוה היחיד. יותר ויותר אנשים משתמשים בAI כדי למצוא תשובות, לא בגוגל רגיל.
                </p>
              </div>

              <div className="p-8 rounded-lg border border-indigo-200 bg-indigo-50 hover:shadow-lg transition-shadow">
                <Link2 className="w-10 h-10 text-indigo-600 mb-4" />
                <h3 className="text-lg font-bold text-slate-900 mb-3">הופעה בתשובות AI = אמינות</h3>
                <p className="text-slate-700">
                  אם ChatGPT או Gemini מציעים את האתר שלך, זה כמו הערכה מפי AI. זה שווה זהב בעיני לקוח.
                </p>
              </div>

              <div className="p-8 rounded-lg border border-pink-200 bg-pink-50 hover:shadow-lg transition-shadow">
                <TrendingUp className="w-10 h-10 text-pink-600 mb-4" />
                <h3 className="text-lg font-bold text-slate-900 mb-3">תחרות כבר שם</h3>
                <p className="text-slate-700">
                  התחרות שלך כבר מופיעות בתשובות AI. אם אתה לא שם, אתה מאחור.
                </p>
              </div>
            </div>
          </div>
        </section>

        {/* How It Works */}
        <section className="py-20 px-4 sm:px-6 lg:px-8 bg-gradient-to-br from-purple-50 to-indigo-50">
          <div className="max-w-5xl mx-auto">
            <h2 className="text-4xl font-bold text-slate-900 text-center mb-16">איך המעקב עובד</h2>

            <div className="grid md:grid-cols-3 gap-8">
              <div className="relative">
                <div className="absolute -top-6 -left-6 w-12 h-12 rounded-full bg-purple-600 text-white flex items-center justify-center text-lg font-bold">1</div>
                <div className="bg-white rounded-lg p-8 border border-slate-200">
                  <h3 className="text-lg font-bold text-slate-900 mb-3">בחרו שאלות רלוונטיות</h3>
                  <p className="text-slate-700">
                    בחרו את השאלות שלקוחות שלכם עלולים לשאול. למשל: "איפה אני מוצא המלצות על גלריה אמנות?"
                  </p>
                </div>
              </div>

              <div className="relative">
                <div className="absolute -top-6 -left-6 w-12 h-12 rounded-full bg-purple-600 text-white flex items-center justify-center text-lg font-bold">2</div>
                <div className="bg-white rounded-lg p-8 border border-slate-200">
                  <h3 className="text-lg font-bold text-slate-900 mb-3">המערכת שואלת AI</h3>
                  <p className="text-slate-700">
                    אנחנו שואלים את ChatGPT, Gemini, Perplexity ועוד. כל אחד מהם נשאל בנפרד.
                  </p>
                </div>
              </div>

              <div className="relative">
                <div className="absolute -top-6 -left-6 w-12 h-12 rounded-full bg-purple-600 text-white flex items-center justify-center text-lg font-bold">3</div>
                <div className="bg-white rounded-lg p-8 border border-slate-200">
                  <h3 className="text-lg font-bold text-slate-900 mb-3">קבלו תוצאות ברורות</h3>
                  <p className="text-slate-700">
                    ראו לכל שאלה - היכן אתה מוזכר, איפה את מצוטט, וכיצד הדירוג משתנה לאורך זמן.
                  </p>
                </div>
              </div>
            </div>
          </div>
        </section>

        {/* Key Features */}
        <section className="py-20 px-4 sm:px-6 lg:px-8 bg-white">
          <div className="max-w-5xl mx-auto">
            <h2 className="text-4xl font-bold text-slate-900 text-center mb-16">מה אתה יכול למדוד</h2>

            <div className="grid md:grid-cols-2 gap-8">
              <div className="flex gap-4">
                <Brain className="w-6 h-6 text-purple-600 flex-shrink-0 mt-1" />
                <div>
                  <h3 className="font-bold text-slate-900 mb-2">מעקב כל מנועי AI</h3>
                  <p className="text-slate-700">ChatGPT, Gemini, Perplexity, Google AI, ועוד - כל אחד עם מעקב נפרד.</p>
                </div>
              </div>

              <div className="flex gap-4">
                <MessageSquare className="w-6 h-6 text-indigo-600 flex-shrink-0 mt-1" />
                <div>
                  <h3 className="font-bold text-slate-900 mb-2">איתור ציטוטים מדויק</h3>
                  <p className="text-slate-700">ראו בדיוק איך האתר שלך מצוטט בתשובות AI. האם תקציר? לינק? הפניה?</p>
                </div>
              </div>

              <div className="flex gap-4">
                <Link2 className="w-6 h-6 text-green-600 flex-shrink-0 mt-1" />
                <div>
                  <h3 className="font-bold text-slate-900 mb-2">מעקב דפי מקור</h3>
                  <p className="text-slate-700">ראו אילו דפים מהאתר שלך מקבלים ציטוטים בAI. זה עזר לאופטימיזציה.</p>
                </div>
              </div>

              <div className="flex gap-4">
                <Zap className="w-6 h-6 text-orange-600 flex-shrink-0 mt-1" />
                <div>
                  <h3 className="font-bold text-slate-900 mb-2">עקיבה לאורך זמן</h3>
                  <p className="text-slate-700">ראו כיצד הנראות שלך משתנה בAI לאורך שבועות וחודשים.</p>
                </div>
              </div>

              <div className="flex gap-4">
                <BarChart3 className="w-6 h-6 text-blue-600 flex-shrink-0 mt-1" />
                <div>
                  <h3 className="font-bold text-slate-900 mb-2">דוחות ממודים</h3>
                  <p className="text-slate-700">דוחות PDF וExcel שמציגים את נראות AI שלך בברור.</p>
                </div>
              </div>

              <div className="flex gap-4">
                <TrendingUp className="w-6 h-6 text-red-600 flex-shrink-0 mt-1" />
                <div>
                  <h3 className="font-bold text-slate-900 mb-2">השוואת תחרות</h3>
                  <p className="text-slate-700">רוצים לדעת היכן המתחרים שלך מופיעים בAI? אנחנו עוקבים אחריהם.</p>
                </div>
              </div>
            </div>
          </div>
        </section>

        {/* Who It's For */}
        <section className="py-20 px-4 sm:px-6 lg:px-8 bg-gradient-to-br from-slate-50 to-purple-50">
          <div className="max-w-5xl mx-auto">
            <h2 className="text-4xl font-bold text-slate-900 text-center mb-16">למי זה קריטי</h2>

            <div className="grid md:grid-cols-2 gap-8">
              <div className="bg-white rounded-lg p-8 border-l-4 border-purple-600">
                <h3 className="text-xl font-bold text-slate-900 mb-3">מקדמי תוכן וכותבים</h3>
                <p className="text-slate-700 mb-4">אם אתה כותב בלוגים או תוכן, בעקבות נראות בAI זה קריטי - זו בעצם מטרת התוכן שלך.</p>
                <ul className="space-y-2 text-sm text-slate-600">
                  <li>✓ דעו איילו מאמרים מצוטטים בAI</li>
                  <li>✓ שפרו את הקטעים שמוזכרים</li>
                  <li>✓ בנו תוכן ספציפי לאופטימיזציה GEO</li>
                </ul>
              </div>

              <div className="bg-white rounded-lg p-8 border-l-4 border-indigo-600">
                <h3 className="text-xl font-bold text-slate-900 mb-3">סוכנויות דיגיטל וSEO</h3>
                <p className="text-slate-700 mb-4">אם אתה עובד עם לקוחות, הם בקרוב ישאלו: "איפה אנחנו בAI?"</p>
                <ul className="space-y-2 text-sm text-slate-600">
                  <li>✓ דוחות חדשות לללקוחות</li>
                  <li>✓ שירות נוסף לביצוע</li>
                  <li>✓ תחרויות בתחום חדש</li>
                </ul>
              </div>

              <div className="bg-white rounded-lg p-8 border-l-4 border-pink-600">
                <h3 className="text-xl font-bold text-slate-900 mb-3">בעלי פדקסטים / מדיה</h3>
                <p className="text-slate-700 mb-4">אם אתה מייצר תוכן או מדיה, הפקת נראות בAI היא דרך חדשה לפרסום.</p>
                <ul className="space-y-2 text-sm text-slate-600">
                  <li>✓ מעקב הזכרות בAI</li>
                  <li>✓ הוכחה של מגיע אל קהל</li>
                  <li>✓ פתחות לשותפויות חדשות</li>
                </ul>
              </div>

              <div className="bg-white rounded-lg p-8 border-l-4 border-orange-600">
                <h3 className="text-xl font-bold text-slate-900 mb-3">מנהלי שיווק וproduct</h3>
                <p className="text-slate-700 mb-4">אם אתה אחראי על אתר או מוצר, הנראות בAI היא מדד חדש להצלחה.</p>
                <ul className="space-y-2 text-sm text-slate-600">
                  <li>✓ מדד מודרני של הצלחה</li>
                  <li>✓ תחרויות בעין שלך</li>
                  <li>✓ דוחות למנהלים</li>
                </ul>
              </div>
            </div>
          </div>
        </section>

        {/* CTA Section */}
        <section className="py-20 px-4 sm:px-6 lg:px-8 bg-gradient-to-r from-purple-600 to-indigo-600">
          <div className="max-w-3xl mx-auto text-center">
            <h2 className="text-4xl font-bold text-white mb-6">הישארו קדימה בגל AI החדש</h2>
            <p className="text-xl text-purple-100 mb-8">
              מעקב נראות AI אינו עוד אפשרות. בעוד שנה זה יהיה חיוני. התחילו עכשיו.
            </p>
            <Link
              href="/signup"
              className="inline-block px-8 py-4 rounded-lg bg-white text-purple-600 text-lg font-bold shadow-lg hover:shadow-xl hover:scale-105 transition-all"
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
