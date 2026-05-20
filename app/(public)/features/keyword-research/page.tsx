import { Metadata } from 'next'
import Link from 'next/link'
import { PublicNav } from '@/components/PublicNav'
import { Footer } from '@/components/Footer'
import { Search, TrendingUp, Target, PieChart, Zap, Check } from 'lucide-react'

export const metadata: Metadata = {
  title: 'מחקר ביטויים | Rankings by Go Top',
  description: 'גלו רעיונות לביטויים מנתוני Google Ads. בדקו נפח חיפוש, תחרות והערכות CPC. הוסיפו ביטויים ישירות למעקב וליצירת שאלות AI.',
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
              חפשו רעיונות לביטויים, בדקו נפח חיפוש ותחרות, והוסיפו אותם ישירות למעקב דירוגים או לשאלות נראות AI.
            </p>

            {/* CTAs */}
            <div className="flex flex-col sm:flex-row gap-4 justify-center mb-16">
              <Link
                href="/signup"
                className="px-8 py-4 rounded-lg bg-gradient-to-r from-amber-600 to-orange-600 text-white text-lg font-semibold shadow-lg hover:shadow-xl hover:from-amber-700 hover:to-orange-700 transition-all text-center"
              >
                להתנסות בחינם
              </Link>
              <Link
                href="/pricing"
                className="px-8 py-4 rounded-lg border-2 border-slate-300 text-slate-700 text-lg font-semibold hover:bg-slate-50 transition-all text-center"
              >
                צפייה בתמחור
              </Link>
            </div>
          </div>
        </section>

        {/* Features Section */}
        <section className="py-20 px-4 sm:px-6 lg:px-8">
          <div className="max-w-5xl mx-auto">
            <h2 className="text-3xl sm:text-4xl font-bold text-slate-900 mb-12 text-center">מה אפשר לעשות במערכת</h2>

            <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-8">
              {[
                {
                  icon: Search,
                  title: 'רעיונות לביטויים',
                  description: 'קבלו רעיונות לביטויים רלוונטיים בהתבסס על ביטוי זרע או כתובת אתר, באמצעות נתונים מ-Google Ads API.',
                },
                {
                  icon: TrendingUp,
                  title: 'נפח חיפוש',
                  description: 'צפו בנפח חיפוש חודשי משוער לכל ביטוי כדי להבין את גודל הביקוש.',
                },
                {
                  icon: Target,
                  title: 'נתוני תחרות',
                  description: 'בדקו את רמת התחרות (נמוכה, בינונית או גבוהה) ואת מדד התחרותיות לכל ביטוי.',
                },
                {
                  icon: PieChart,
                  title: 'הערכות CPC',
                  description: 'ראו הערכות של הצעת מחיר מינימלית ומקסימלית בראש העמוד, להבנת עלות הקליק.',
                },
                {
                  icon: Zap,
                  title: 'הוספה מהירה לפרויקטים',
                  description: 'הוסיפו ביטויים נבחרים ישירות לפרויקטים שלכם למעקב דירוגים מיידי.',
                },
                {
                  icon: Check,
                  title: 'יצירת שאלות AI',
                  description: 'הפכו ביטויים לשאלות בשפה טבעית למעקב נראות במנועי AI.',
                },
              ].map((feature, i) => {
                const Icon = feature.icon
                return (
                  <div key={i} className="p-6 rounded-lg border border-slate-200 hover:border-amber-300 hover:shadow-lg transition-all">
                    <Icon className="w-8 h-8 text-amber-600 mb-4" />
                    <h3 className="text-lg font-semibold text-slate-900 mb-2">{feature.title}</h3>
                    <p className="text-slate-600 leading-relaxed">{feature.description}</p>
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
                  title: 'חפשו ביטויים',
                  description: 'הזינו ביטוי זרע או כתובת אתר, ובחרו מדינה ושפה.',
                },
                {
                  number: '2',
                  title: 'בדקו תוצאות',
                  description: 'עיינו ברעיונות שמוצגים יחד עם נפח חיפוש, רמת תחרות והערכות CPC.',
                },
                {
                  number: '3',
                  title: 'פעלו לפי הנתונים',
                  description: 'הוסיפו ביטויים לפרויקט קיים או הפכו אותם לשאלות AI בלחיצה אחת.',
                },
              ].map((step) => (
                <div key={step.number} className="text-center">
                  <div className="flex items-center justify-center w-12 h-12 mx-auto mb-4 rounded-full bg-amber-600 text-white font-bold text-lg">
                    {step.number}
                  </div>
                  <h3 className="text-xl font-semibold text-slate-900 mb-2">{step.title}</h3>
                  <p className="text-slate-600 leading-relaxed">{step.description}</p>
                </div>
              ))}
            </div>
          </div>
        </section>

        {/* Data Note */}
        <section className="py-16 px-4 sm:px-6 lg:px-8 bg-amber-50 border-t border-amber-200">
          <div className="max-w-3xl mx-auto">
            <h3 className="text-lg font-semibold text-slate-900 mb-4">על מקורות הנתונים</h3>
            <p className="text-slate-600 mb-3 leading-relaxed">
              נתוני מחקר הביטויים מתקבלים מ-Google Ads API. נפחי חיפוש, רמות תחרות והערכות CPC הם משוערים ומבוססים על נתונים מצטברים של Google. ביצועים בפועל עשויים להשתנות בהתאם לקמפיין, לתחום ולשאר נסיבות.
            </p>
            <p className="text-slate-600 leading-relaxed">
              השתמשו בנתונים הללו כנקודת פתיחה לאסטרטגיית ה-SEO והתוכן שלכם, ואמתו אותם תמיד מול נתוני המעקב והניתוח שלכם בפועל.
            </p>
          </div>
        </section>

        {/* CTA Section */}
        <section className="py-20 px-4 sm:px-6 lg:px-8">
          <div className="max-w-3xl mx-auto text-center">
            <h2 className="text-3xl font-bold text-slate-900 mb-6">מוכנים להאיץ את מחקר הביטויים?</h2>
            <p className="text-xl text-slate-600 mb-8">
              התחילו ניסיון חינם ל-7 ימים, ללא צורך בכרטיס אשראי.
            </p>
            <Link
              href="/signup"
              className="inline-block px-8 py-4 rounded-lg bg-gradient-to-r from-amber-600 to-orange-600 text-white text-lg font-semibold shadow-lg hover:shadow-xl hover:from-amber-700 hover:to-orange-700 transition-all"
            >
              להתנסות בחינם
            </Link>
          </div>
        </section>
      </main>

      <Footer />
    </div>
  )
}
