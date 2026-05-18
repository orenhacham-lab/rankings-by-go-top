import { Metadata } from 'next'
import Link from 'next/link'
import { PublicNav } from '@/components/PublicNav'
import { Footer } from '@/components/Footer'

export const metadata: Metadata = {
  title: 'דוחות SEO/GEO | Rankings by Go Top',
  description: 'הפיקו דוחות PDF ו-Excel פרופסיונליים. דוחות עם דירוגים, מגמות, תחרות ונראות ב-AI.',
}

export default function SEOGeoReportsFeaturePage() {
  return (
    <div className="flex flex-col min-h-screen bg-white">
      <PublicNav locale="he" />

      <main className="flex-1 pt-40">
        {/* Hero Section */}
        <section className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 py-16">
          <div className="text-center mb-12">
            <h1 className="text-4xl sm:text-5xl font-bold text-slate-900 mb-4">
              דוחות SEO/GEO מקצועיים
            </h1>
            <p className="text-xl text-slate-600 mb-8">
              הפיקו דוחות PDF ו-Excel פרופסיונליים עם דירוגים, מגמות ותחרות. משמעו דוחות שניתן להציג ללקוחות.
            </p>
          </div>

          {/* Key Features */}
          <div className="grid md:grid-cols-2 gap-8 mb-12">
            <div className="bg-green-50 rounded-lg p-6 border border-green-200">
              <h3 className="text-lg font-semibold text-slate-900 mb-2">דוחות PDF ו-Excel</h3>
              <p className="text-slate-600">
                הפיקו דוחות בנויים באופן מעודן בדקה אחת. מטמפלטים מוכנים שניתן להפיק בלחיצת כפתור.
              </p>
            </div>
            <div className="bg-green-50 rounded-lg p-6 border border-green-200">
              <h3 className="text-lg font-semibold text-slate-900 mb-2">גרפים ותרשימים</h3>
              <p className="text-slate-600">
                צפה בדירוגים כגרפים וממה לך מגמות החודשיות. הציגו נתונים בדרך ויזואלית קלה להבנה.
              </p>
            </div>
            <div className="bg-green-50 rounded-lg p-6 border border-green-200">
              <h3 className="text-lg font-semibold text-slate-900 mb-2">השוואה תקופתית</h3>
              <p className="text-slate-600">
                השוו דירוגים בין חודשים שונים. ראו שיפור או הידרדרות במיקומים.
              </p>
            </div>
            <div className="bg-green-50 rounded-lg p-6 border border-green-200">
              <h3 className="text-lg font-semibold text-slate-900 mb-2">פרטי תחרות</h3>
              <p className="text-slate-600">
                הראה לקוח מי המתחרים והיכן אתה עומד לעומתם בכל ביטוי חיפוש.
              </p>
            </div>
          </div>

          {/* Benefits Section */}
          <div className="bg-gradient-to-br from-green-50 to-emerald-50 rounded-lg p-8 mb-12 border border-green-200">
            <h2 className="text-2xl font-bold text-slate-900 mb-6">למה זה חשוב?</h2>
            <ul className="space-y-4">
              <li className="flex items-start gap-3">
                <span className="flex-shrink-0 w-6 h-6 rounded-full bg-green-600 text-white flex items-center justify-center text-sm font-bold">✓</span>
                <span className="text-slate-700">
                  דוחות מקצועיים הם דרך מעולה להראות ללקוח את הערך של השירות
                </span>
              </li>
              <li className="flex items-start gap-3">
                <span className="flex-shrink-0 w-6 h-6 rounded-full bg-green-600 text-white flex items-center justify-center text-sm font-bold">✓</span>
                <span className="text-slate-700">
                  דוחות חודשיים = הזדמנות לדבר עם הלקוח על התוצאות
                </span>
              </li>
              <li className="flex items-start gap-3">
                <span className="flex-shrink-0 w-6 h-6 rounded-full bg-green-600 text-white flex items-center justify-center text-sm font-bold">✓</span>
                <span className="text-slate-700">
                  דוחות בPDF = משהו שניתן להדפיס או לשלוח בדוא"ל
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
