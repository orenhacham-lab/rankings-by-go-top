import { Metadata } from 'next'
import Link from 'next/link'
import { PublicNav } from '@/components/PublicNav'
import { PublicFooter } from '@/components/PublicFooter'

export const metadata: Metadata = {
  title: 'בדיקת דירוג בגוגל מפות | Rankings by Go Top',
  description: 'עקבו אחרי המיקום שלכם בגוגל מפות. בדקו נראות מקומית לפי עיר, אזור וביטוי חיפוש. דוחות מפורטים ועקוב לאורך זמן.',
}

export default function GoogleMapsFeaturePage() {
  return (
    <div className="flex flex-col min-h-screen bg-white">
      <PublicNav locale="he" />

      <main className="flex-1 pt-40">
        {/* Hero Section */}
        <section className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 py-16">
          <div className="text-center mb-12">
            <h1 className="text-4xl sm:text-5xl font-bold text-slate-900 mb-4">
              בדיקת דירוג בגוגל מפות
            </h1>
            <p className="text-xl text-slate-600 mb-8">
              עקבו אחרי הנראות המקומית שלכם בגוגל מפות. בדקו מיקומים בערים ואזורים שונים ותחרו בשוק המקומי.
            </p>
          </div>

          {/* Key Features */}
          <div className="grid md:grid-cols-2 gap-8 mb-12">
            <div className="bg-amber-50 rounded-lg p-6 border border-amber-200">
              <h3 className="text-lg font-semibold text-slate-900 mb-2">עקיבה מקומית מדויקת</h3>
              <p className="text-slate-600">
                בדקו את המיקום שלכם בגוגל מפות לפי עיר ואזור. קבלו נתונים מדויקים על מיקום בחיפוש מקומי.
              </p>
            </div>
            <div className="bg-amber-50 rounded-lg p-6 border border-amber-200">
              <h3 className="text-lg font-semibold text-slate-900 mb-2">מיקום גאוגרפי דקיק</h3>
              <p className="text-slate-600">
                בדקו דירוגים לפי קואורדינטות GPS, קוד דואר או שכונה. עבור עסקים עם מספר מקומות.
              </p>
            </div>
            <div className="bg-amber-50 rounded-lg p-6 border border-amber-200">
              <h3 className="text-lg font-semibold text-slate-900 mb-2">ביטויי חיפוש מקומיים</h3>
              <p className="text-slate-600">
                עקבו אחרי ביטויי חיפוש עם סיומות מקומיות כמו "תיקיה בתל אביב" או "רופא שיניים בחיפה".
              </p>
            </div>
            <div className="bg-amber-50 rounded-lg p-6 border border-amber-200">
              <h3 className="text-lg font-semibold text-slate-900 mb-2">עקיבת תחרות מקומית</h3>
              <p className="text-slate-600">
                עקבו אחרי דירוגי המתחרים המקומיים שלכם בכל ביטוי חיפוש.
              </p>
            </div>
          </div>

          {/* Benefits Section */}
          <div className="bg-gradient-to-br from-amber-50 to-orange-50 rounded-lg p-8 mb-12 border border-amber-200">
            <h2 className="text-2xl font-bold text-slate-900 mb-6">למה זה חשוב?</h2>
            <ul className="space-y-4">
              <li className="flex items-start gap-3">
                <span className="flex-shrink-0 w-6 h-6 rounded-full bg-amber-600 text-white flex items-center justify-center text-sm font-bold">✓</span>
                <span className="text-slate-700">
                  גוגל מפות = הדרך הראשונה שלקוחות מחפשים עסקים מקומיים בסביבתם
                </span>
              </li>
              <li className="flex items-start gap-3">
                <span className="flex-shrink-0 w-6 h-6 rounded-full bg-amber-600 text-white flex items-center justify-center text-sm font-bold">✓</span>
                <span className="text-slate-700">
                  מיקום גבוה בגוגל מפות = יותר שיחות, פניות וביקורים בחנות
                </span>
              </li>
              <li className="flex items-start gap-3">
                <span className="flex-shrink-0 w-6 h-6 rounded-full bg-amber-600 text-white flex items-center justify-center text-sm font-bold">✓</span>
                <span className="text-slate-700">
                  בעסקים מקומיים - גוגל מפות הוא עם יותר חשיבות מ-SEO רגיל
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

      <PublicFooter locale="he" />
    </div>
  )
}
