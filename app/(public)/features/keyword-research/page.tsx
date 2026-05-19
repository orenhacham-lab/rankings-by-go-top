import { Metadata } from 'next'
import Link from 'next/link'
import { PublicNav } from '@/components/PublicNav'
import { Footer } from '@/components/Footer'
import { Search, TrendingUp, Target, PieChart, Zap, Check } from 'lucide-react'

export const metadata: Metadata = {
  title: 'מחקר ביטויים | Rankings by Go Top',
  description: 'גלו רעיונות ביטויים מנתוני Google Ads. בדקו נפח חיפוש, תחרות והערכות CPC. הוסיפו ביטויים ישירות למעקב וליצירת שאלות AI.',
}

export default function KeywordResearchFeaturePage() {
  return (
    <div className="flex flex-col min-h-screen bg-white rtl">
      <PublicNav locale="he" />

      <main className="flex-1">
        {/* Hero Section */}
        <section className="relative pt-40 pb-20 px-4 sm:px-6 lg:px-8 bg-gradient-to-br from-amber-50 via-white to-orange-50 overflow-hidden">
          <div className="max-w-5xl mx-auto">
            {/* Badge */}
            <div className="flex justify-center mb-8">
              <span className="inline-flex items-center gap-2 px-4 py-2 rounded-full bg-amber-100 text-amber-800 text-sm font-medium border border-amber-200">
                <Search className="w-4 h-4" />
                מחקר ביטויים
              </span>
            </div>

            {/* Main Heading */}
            <h1 className="text-5xl sm:text-6xl font-bold text-slate-900 text-center mb-6 leading-tight">
              גלו ביטויים עם נתוני Google Ads
            </h1>

            {/* Subheading */}
            <p className="text-xl text-slate-600 text-center mb-12 max-w-2xl mx-auto">
              חפשו רעיונות ביטויים, בדקו נפח חיפוש ותחרות, והוסיפו אותם ישירות למעקב דירוגים או לשאלות נראות AI.
            </p>

            {/* CTAs */}
            <div className="flex flex-col sm:flex-row gap-4 justify-center mb-16">
              <Link
                href="/signup"
                className="px-8 py-4 rounded-lg bg-gradient-to-r from-amber-600 to-orange-600 text-white text-lg font-semibold shadow-lg hover:shadow-xl hover:from-amber-700 hover:to-orange-700 transition-all text-center"
              >
                התחל ניסיון חינם
              </Link>
              <Link
                href="/pricing"
                className="px-8 py-4 rounded-lg border-2 border-slate-300 text-slate-700 text-lg font-semibold hover:bg-slate-50 transition-all text-center"
              >
                צפה בתמחור
              </Link>
            </div>
          </div>
        </section>

        {/* Features Section */}
        <section className="py-20 px-4 sm:px-6 lg:px-8">
          <div className="max-w-5xl mx-auto">
            <h2 className="text-3xl sm:text-4xl font-bold text-slate-900 mb-12 text-center">מה אתה יכול לעשות</h2>

            <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-8">
              {[
                {
                  icon: Search,
                  title: 'רעיונות ביטויים',
                  description: 'מצא רעיונות ביטויים קשורים בהתאם לביטוי ההזרה שלך באמצעות נתוני Google Ads API.',
                },
                {
                  icon: TrendingUp,
                  title: 'נפח חיפוש',
                  description: 'צפה בנפח חיפוש חודשי משוער לכל ביטוי כדי להבין את הביקוש.',
                },
                {
                  icon: Target,
                  title: 'נתוני תחרות',
                  description: 'בדוק רמות תחרות (נמוכה, בינונית, גבוהה) ואינדקס תחרותיות.',
                },
                {
                  icon: PieChart,
                  title: 'הערכות CPC',
                  description: 'ראה הערכות של הצעות מחיר מינימום ומקסימום בראש העמוד.',
                },
                {
                  icon: Zap,
                  title: 'הוספה מהירה לפרויקטים',
                  description: 'הוסף ביטויים נבחרים ישירות לפרויקטים שלך למעקב דירוגים מיידי.',
                },
                {
                  icon: Check,
                  title: 'יצור שאלות AI',
                  description: 'הפוך ביטויים לשאלות בשפה טבעית לסריקת נראות AI.',
                },
              ].map((feature, i) => {
                const Icon = feature.icon
                return (
                  <div key={i} className="p-6 rounded-lg border border-slate-200 hover:border-amber-300 hover:shadow-lg transition-all">
                    <Icon className="w-8 h-8 text-amber-600 mb-4" />
                    <h3 className="text-lg font-semibold text-slate-900 mb-2">{feature.title}</h3>
                    <p className="text-slate-600">{feature.description}</p>
                  </div>
                )
              })}
            </div>
          </div>
        </section>

        {/* How It Works */}
        <section className="py-20 px-4 sm:px-6 lg:px-8 bg-slate-50">
          <div className="max-w-5xl mx-auto">
            <h2 className="text-3xl sm:text-4xl font-bold text-slate-900 mb-12 text-center">איך זה עובד</h2>

            <div className="grid sm:grid-cols-3 gap-8">
              {[
                {
                  number: '1',
                  title: 'חפש ביטויים',
                  description: 'הכנס ביטוי זרע בחר את המדינה והשפה שלך.',
                },
                {
                  number: '2',
                  title: 'בדוק תוצאות',
                  description: 'עיין בתיקיות הביטויים עם נתוני נפח חיפוש, תחרות ו-CPC.',
                },
                {
                  number: '3',
                  title: 'קח צעדים',
                  description: 'הוסף ביטויים לפרויקט או צור שאלות AI מהם.',
                },
              ].map((step) => (
                <div key={step.number} className="text-center">
                  <div className="flex items-center justify-center w-12 h-12 mx-auto mb-4 rounded-full bg-amber-600 text-white font-bold text-lg">
                    {step.number}
                  </div>
                  <h3 className="text-xl font-semibold text-slate-900 mb-2">{step.title}</h3>
                  <p className="text-slate-600">{step.description}</p>
                </div>
              ))}
            </div>
          </div>
        </section>

        {/* Data Note */}
        <section className="py-16 px-4 sm:px-6 lg:px-8 bg-amber-50 border-t border-amber-200">
          <div className="max-w-3xl mx-auto">
            <h3 className="text-lg font-semibold text-slate-900 mb-4">אודות הנתונים</h3>
            <p className="text-slate-600 mb-3">
              נתוני מחקר ביטויים מגיעים מ-Google Ads API. נפחי חיפוש, רמות תחרות והערכות CPC הם משוערים וממולאים מנתוני מצטברים של Google. ביצועים בפועל עשויים להשתנות לפי קמפיין, כיוונון והגורמים אחרים.
            </p>
            <p className="text-slate-600">
              השתמש בנתונים אלה כנקודת התחלה לאסטרטגיית ה-SEO ותוכן שלך. תמיד אמת עם הנתיחות שלך שלך ובדיקה.
            </p>
          </div>
        </section>

        {/* CTA Section */}
        <section className="py-20 px-4 sm:px-6 lg:px-8">
          <div className="max-w-3xl mx-auto text-center">
            <h2 className="text-3xl font-bold text-slate-900 mb-6">מוכן להאיץ את מחקר הביטויים שלך?</h2>
            <p className="text-xl text-slate-600 mb-8">
              התחל את הניסיון החינם 7 ימים שלך היום. לא נדרש כרטיס אשראי.
            </p>
            <Link
              href="/signup"
              className="inline-block px-8 py-4 rounded-lg bg-gradient-to-r from-amber-600 to-orange-600 text-white text-lg font-semibold shadow-lg hover:shadow-xl hover:from-amber-700 hover:to-orange-700 transition-all"
            >
              התחל ניסיון חינם
            </Link>
          </div>
        </section>
      </main>

      <Footer />
    </div>
  )
}
