import { Metadata } from 'next'
import Link from 'next/link'
import { PublicNav } from '@/components/PublicNav'
import { Footer } from '@/components/Footer'

export const metadata: Metadata = {
  title: 'בדיקת דירוג בגוגל חיפוש | Rankings by Go Top',
  description: 'עקבו אחרי דירוגים אורגניים בגוגל. בדקו מיקומים לפי ביטוי חיפוש, מדינה, שפה ומכשיר. קבלו דוחות מפורטים ועקוב אחרי מגמות לאורך זמן.',
}

export default function GoogleOrganicFeaturePage() {
  return (
    <div className="flex flex-col min-h-screen bg-white">
      <PublicNav locale="he" />

      <main className="flex-1 pt-40">
        {/* Hero Section */}
        <section className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 py-16">
          <div className="text-center mb-12">
            <h1 className="text-4xl sm:text-5xl font-bold text-slate-900 mb-4">
              בדיקת דירוג בגוגל חיפוש
            </h1>
            <p className="text-xl text-slate-600 mb-8">
              עקבו אחרי הדירוגים שלכם בגוגל. בדקו מיקומים מדויקים לכל ביטוי חיפוש עם ניתוח תחרותי מתקדם.
            </p>
          </div>

          {/* Key Features */}
          <div className="grid md:grid-cols-2 gap-8 mb-12">
            <div className="bg-blue-50 rounded-lg p-6 border border-blue-200">
              <h3 className="text-lg font-semibold text-slate-900 mb-2">עקיבה מדויקת לדירוגים</h3>
              <p className="text-slate-600">
                קבלו נתוני דירוג מדויקים לכל ביטוי חיפוש. המערכת בודקת עמודים 1-2 בתוצאות הפרסום של גוגל.
              </p>
            </div>
            <div className="bg-blue-50 rounded-lg p-6 border border-blue-200">
              <h3 className="text-lg font-semibold text-slate-900 mb-2">סינון גיאוגרפי</h3>
              <p className="text-slate-600">
                עקבו אחרי דירוגים לפי מדינה, עיר, וקוד דואר. מושלם לעסקים מקומיים וארציים.
              </p>
            </div>
            <div className="bg-blue-50 rounded-lg p-6 border border-blue-200">
              <h3 className="text-lg font-semibold text-slate-900 mb-2">שפות ומכשירים שונים</h3>
              <p className="text-slate-600">
                בדקו דירוגים בשפות שונות וממכשירים שונים (דסקטופ, טלפון, טאבלט) כדי לקבל תמונת מצב מלאה.
              </p>
            </div>
            <div className="bg-blue-50 rounded-lg p-6 border border-blue-200">
              <h3 className="text-lg font-semibold text-slate-900 mb-2">ניתוח תחרותי</h3>
              <p className="text-slate-600">
                עקבו אחרי מיקומי המתחרים שלכם. הבינו את הפער וזהו הזדמנויות לשיפור.
              </p>
            </div>
          </div>

          {/* Benefits Section */}
          <div className="bg-gradient-to-br from-blue-50 to-indigo-50 rounded-lg p-8 mb-12 border border-blue-200">
            <h2 className="text-2xl font-bold text-slate-900 mb-6">למה זה חשוב?</h2>
            <ul className="space-y-4">
              <li className="flex items-start gap-3">
                <span className="flex-shrink-0 w-6 h-6 rounded-full bg-blue-600 text-white flex items-center justify-center text-sm font-bold">✓</span>
                <span className="text-slate-700">
                  דירוגים גבוהים בגוגל = תנועה אורגנית יותר וללא עלות לשיווק
                </span>
              </li>
              <li className="flex items-start gap-3">
                <span className="flex-shrink-0 w-6 h-6 rounded-full bg-blue-600 text-white flex items-center justify-center text-sm font-bold">✓</span>
                <span className="text-slate-700">
                  עקיבה קבועה עוזרת להבין מה עובד ומה צריך שיפור
                </span>
              </li>
              <li className="flex items-start gap-3">
                <span className="flex-shrink-0 w-6 h-6 rounded-full bg-blue-600 text-white flex items-center justify-center text-sm font-bold">✓</span>
                <span className="text-slate-700">
                  תחרות קלות - דעו אם אתם מקדימים או מפגרים לעומת כל מתחרה
                </span>
              </li>
            </ul>
          </div>

          {/* CTA Section */}
          <div className="text-center">
            <Link
              href="/signup"
              className="inline-block px-8 py-4 rounded-lg bg-gradient-to-r from-blue-600 to-indigo-600 text-white text-lg font-semibold shadow-md hover:shadow-lg hover:from-blue-700 hover:to-indigo-700 transition-all"
            >
              התחל ניסיון חינם
            </Link>
          </div>
        </section>
      </main>

      <Footer locale="he" />
    </div>
  )
}
