import { Metadata } from 'next'
import Link from 'next/link'
import { PublicNav } from '@/components/PublicNav'
import { Footer } from '@/components/Footer'

export const metadata: Metadata = {
  title: 'עקיבת נראות ב-AI | Rankings by Go Top',
  description: 'גלו האם העסק שלכם מוזכר בתשובות ChatGPT, Gemini, Perplexity ו-Google AI. עקבו אחרי הנראות בעולם ה-AI.',
}

export default function AIVisibilityFeaturePage() {
  return (
    <div className="flex flex-col min-h-screen bg-white">
      <PublicNav locale="he" />

      <main className="flex-1 pt-40">
        {/* Hero Section */}
        <section className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 py-16">
          <div className="text-center mb-12">
            <h1 className="text-4xl sm:text-5xl font-bold text-slate-900 mb-4">
              עקיבת נראות ב-AI
            </h1>
            <p className="text-xl text-slate-600 mb-8">
              גלו האם העסק שלכם מוזכר בתשובות של AI. עקבו אחרי הנראות בהנדסות המודעות החדשות של גוגל, ChatGPT, Gemini ועוד.
            </p>
          </div>

          {/* Key Features */}
          <div className="grid md:grid-cols-2 gap-8 mb-12">
            <div className="bg-purple-50 rounded-lg p-6 border border-purple-200">
              <h3 className="text-lg font-semibold text-slate-900 mb-2">ChatGPT ו-Gemini</h3>
              <p className="text-slate-600">
                בדקו אם העסק שלכם מוזכר בתשובות ChatGPT של OpenAI ו-Gemini של Google.
              </p>
            </div>
            <div className="bg-purple-50 rounded-lg p-6 border border-purple-200">
              <h3 className="text-lg font-semibold text-slate-900 mb-2">Perplexity ועוד</h3>
              <p className="text-slate-600">
                עקבו אחרי הנראות גם ב-Perplexity וכלים AI אחרים.
              </p>
            </div>
            <div className="bg-purple-50 rounded-lg p-6 border border-purple-200">
              <h3 className="text-lg font-semibold text-slate-900 mb-2">מעקב ציטוטים</h3>
              <p className="text-slate-600">
                ראו אילו מקורות (דפי אתר) מקבלים ציטוטים בתשובות AI.
              </p>
            </div>
            <div className="bg-purple-50 rounded-lg p-6 border border-purple-200">
              <h3 className="text-lg font-semibold text-slate-900 mb-2">עקיבה לאורך זמן</h3>
              <p className="text-slate-600">
                עקבו אחרי השינויים בנראות בAI לאורך זמן.
              </p>
            </div>
          </div>

          {/* Benefits Section */}
          <div className="bg-gradient-to-br from-purple-50 to-indigo-50 rounded-lg p-8 mb-12 border border-purple-200">
            <h2 className="text-2xl font-bold text-slate-900 mb-6">למה זה חשוב?</h2>
            <ul className="space-y-4">
              <li className="flex items-start gap-3">
                <span className="flex-shrink-0 w-6 h-6 rounded-full bg-purple-600 text-white flex items-center justify-center text-sm font-bold">✓</span>
                <span className="text-slate-700">
                  AI משנה את דרך החיפוש - משתמשים לא בטוחים בנכונות המידע
                </span>
              </li>
              <li className="flex items-start gap-3">
                <span className="flex-shrink-0 w-6 h-6 rounded-full bg-purple-600 text-white flex items-center justify-center text-sm font-bold">✓</span>
                <span className="text-slate-700">
                  הערות בתשובות AI = בדיקת אמינות וביקוש גבוה יותר
                </span>
              </li>
              <li className="flex items-start gap-3">
                <span className="flex-shrink-0 w-6 h-6 rounded-full bg-purple-600 text-white flex items-center justify-center text-sm font-bold">✓</span>
                <span className="text-slate-700">
                  בשנים הקרובות - נראות בAI תהיה חלק חשוב מה-SEO
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
