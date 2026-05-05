import Link from 'next/link'
import { Footer } from '@/components/Footer'
import { Breadcrumbs } from '@/components/Breadcrumbs'
import { PublicNav } from '@/components/PublicNav'

export default function AboutPage() {
  const values = [
    {
      icon: '👥',
      title: 'שירות אישי בלי פשרות',
      description: 'אין אצלנו "מנהל תיק לקוח" שמחליף כל חודש. אתה עובד עם אנשי מקצוע שמכירים אותך.'
    },
    {
      icon: '🔍',
      title: 'שקיפות מלאה',
      description: 'אתה תמיד יודע מה קורה עם המערכת שלך, מה עבד ומה לא, ואיך אפשר לשפר.'
    },
    {
      icon: '📈',
      title: 'מקצוענות שמביאה תוצאות',
      description: 'ב- Go Top אנחנו לא נזרוק עליך מונחים מפוצצים. אנחנו נביא לך תוצאות אמיתיות.'
    },
    {
      icon: '💼',
      title: 'אנחנו גם עסק',
      description: 'אז אנחנו מבינים אותך. את הלחץ, את התקציב, ואת השאיפה לראות תוצאות.'
    },
  ]

  const features = [
    {
      icon: '🔎',
      title: 'עקיבה אחרי מיקומים בחיפוש',
      description: 'מעקב בזמן אמת אחרי המיקומים שלך בגוגל אורגני'
    },
    {
      icon: '🗺️',
      title: 'קידום בגוגל מפות',
      description: 'דו"ח מפורט על הביצועים שלך בתוצאות הממוקמות'
    },
    {
      icon: '⚔️',
      title: 'ניתוח מתחרים',
      description: 'בדוק איך אתה עומד במול המתחרים שלך'
    },
    {
      icon: '📊',
      title: 'עקיבה אחרי ביצועים',
      description: 'דוחות שמראים מה שחשוב באמת'
    },
  ]

  return (
    <div className="min-h-screen bg-white flex flex-col">
      <PublicNav />

      {/* Hero Section */}
      <section className="relative pt-28 lg:pt-36 pb-12 lg:pb-16 overflow-hidden bg-gradient-to-br from-blue-50 via-white to-indigo-50">
        <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_top,_rgba(59,130,246,0.15),_transparent_50%)]" />

        <div className="relative max-w-4xl mx-auto px-4 sm:px-6 lg:px-8">
          <Breadcrumbs items={[{ label: 'אודות', href: '/about' }]} />

          <div className="text-center mt-8">
            <h1 className="text-5xl lg:text-6xl font-extrabold text-slate-900 leading-tight tracking-tight mb-6">
              אודות<br />
              <span className="bg-gradient-to-r from-blue-600 to-blue-400 bg-clip-text text-transparent">
                Rankings by Go Top
              </span>
            </h1>
            <p className="text-xl text-slate-600 leading-relaxed max-w-2xl mx-auto">
              יותר מ-11 שנים של ניסיון דיגיטלי אמיתי. ועכשיו – תוכנית מעקב מיקומים שמתמקדת בתוצאות.
            </p>
          </div>
        </div>
      </section>

      <main className="flex-1">
        {/* Story Section */}
        <section className="py-16 lg:py-24 px-4 sm:px-6 lg:px-8">
          <div className="max-w-5xl mx-auto">
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-12 items-center">
              <div className="space-y-6">
                <h2 className="text-4xl font-extrabold text-slate-900">הסיפור של Go Top</h2>
                <div className="space-y-4 text-slate-700 leading-relaxed">
                  <p>
                    בעולם מלא בבינה מלאכותית, אוטומציות וחברות גדולות שמדברות גבוהה – בחברת GO TOP אנחנו באים לעשות משהו אחר.
                  </p>
                  <p>
                    משהו אנושי, חד, ממוקד תוצאות – ומבוסס על ניסיון של מעל 11 שנים של עשייה דיגיטלית אמיתית. בדגש על קידום אתרים לעסקים, בניית אתרים, ופרסום בדיגיטל.
                  </p>
                </div>
              </div>

              <div className="bg-gradient-to-br from-blue-100 to-indigo-100 rounded-2xl p-12 flex items-center justify-center min-h-96">
                <div className="text-center">
                  <div className="text-8xl mb-4">📖</div>
                  <p className="text-slate-600 font-medium">11+ שנים של ניסיון</p>
                </div>
              </div>
            </div>
          </div>
        </section>

        {/* Philosophy Section */}
        <section className="py-16 lg:py-24 px-4 sm:px-6 lg:px-8 bg-slate-50">
          <div className="max-w-5xl mx-auto">
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-12 items-center">
              <div className="bg-gradient-to-br from-blue-100 to-indigo-100 rounded-2xl p-12 flex items-center justify-center min-h-96 order-2 lg:order-1">
                <div className="text-center">
                  <div className="text-8xl mb-4">✨</div>
                  <p className="text-slate-600 font-medium">איכות על כמות</p>
                </div>
              </div>

              <div className="space-y-6 order-1 lg:order-2">
                <h2 className="text-4xl font-extrabold text-slate-900">הפילוסופיה שלנו</h2>
                <div className="space-y-4 text-slate-700 leading-relaxed">
                  <p>
                    אנחנו לא מתרכזים בכמות אלא באיכות. אנחנו בוחרים לעבוד עם עסקים שמתאימים לנו – ולתן להם תשומת לב מקסימלית, יחס אישי ושירות מדויק.
                  </p>
                  <p>
                    בחברת גו טופ אנחנו לא מתלהבים מקליקים וחשיפות. אנחנו מתלהבים מהטלפון שלך שמתחיל לצלצל. כי בסוף – זה מה שחשוב באמת.
                  </p>
                </div>
              </div>
            </div>
          </div>
        </section>

        {/* Why We Built It */}
        <section className="py-16 lg:py-24 px-4 sm:px-6 lg:px-8">
          <div className="max-w-4xl mx-auto">
            <h2 className="text-4xl font-extrabold text-slate-900 mb-12 text-center">למה בנינו את Rankings by Go Top</h2>

            <div className="bg-gradient-to-br from-blue-50 to-indigo-50 rounded-2xl p-8 lg:p-12 mb-8 border border-blue-200">
              <p className="text-lg text-slate-700 mb-6">
                בעוד שעסקים רבים משתמשים בכלים גנריים לעקיבה אחרי דירוגים, התחלנו לשמוע שוב ושוב אותה בעיה:
              </p>

              <div className="space-y-4">
                <div className="flex gap-4">
                  <div className="flex-shrink-0 text-2xl">❌</div>
                  <div>
                    <p className="font-semibold text-slate-900">כלים יקרים ומסובכים</p>
                    <p className="text-slate-600">שלא מתאימים לעסקים קטנים</p>
                  </div>
                </div>

                <div className="flex gap-4">
                  <div className="flex-shrink-0 text-2xl">❌</div>
                  <div>
                    <p className="font-semibold text-slate-900">דוחות שלא מבינים</p>
                    <p className="text-slate-600">נתונים שלא משתמשים בהם</p>
                  </div>
                </div>

                <div className="flex gap-4">
                  <div className="flex-shrink-0 text-2xl">❌</div>
                  <div>
                    <p className="font-semibold text-slate-900">חוסר תמיכה אמיתית</p>
                    <p className="text-slate-600">כשצריכים עזרה ביותר</p>
                  </div>
                </div>
              </div>
            </div>

            <p className="text-center text-lg text-slate-700">
              בגלל זה פיתחנו את <strong>Rankings by Go Top</strong> – מערכת עקיבה אחרי מיקומים שמתמקדת בתוצאות כמו שאנחנו מתמקדים.
            </p>
          </div>
        </section>

        {/* Features */}
        <section className="py-16 lg:py-24 px-4 sm:px-6 lg:px-8 bg-slate-50">
          <div className="max-w-5xl mx-auto">
            <h2 className="text-4xl font-extrabold text-slate-900 mb-12 text-center">מה חוקרים Rankings by Go Top</h2>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
              {features.map((feature) => (
                <div key={feature.title} className="bg-white rounded-2xl p-8 border border-slate-200 hover:border-blue-300 transition-colors">
                  <div className="text-5xl mb-4">{feature.icon}</div>
                  <h3 className="text-xl font-bold text-slate-900 mb-3">{feature.title}</h3>
                  <p className="text-slate-600">{feature.description}</p>
                </div>
              ))}
            </div>
          </div>
        </section>

        {/* Values */}
        <section className="py-16 lg:py-24 px-4 sm:px-6 lg:px-8">
          <div className="max-w-5xl mx-auto">
            <h2 className="text-4xl font-extrabold text-slate-900 mb-12 text-center">למה לבחור ב-Rankings by Go Top</h2>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
              {values.map((value) => (
                <div key={value.title} className="bg-gradient-to-br from-blue-50 to-indigo-50 rounded-2xl p-8 border border-blue-200">
                  <div className="text-5xl mb-4">{value.icon}</div>
                  <h3 className="text-xl font-bold text-slate-900 mb-3">{value.title}</h3>
                  <p className="text-slate-600 leading-relaxed">{value.description}</p>
                </div>
              ))}
            </div>
          </div>
        </section>

        {/* CTA Section */}
        <section className="py-16 lg:py-24 px-4 sm:px-6 lg:px-8 bg-gradient-to-br from-blue-600 to-blue-500">
          <div className="max-w-4xl mx-auto text-center">
            <h2 className="text-4xl lg:text-5xl font-extrabold text-white mb-6">רוצה להתחיל?</h2>
            <p className="text-xl text-blue-100 mb-8">
              התחל עכשיו בחינם ובדוק את היכולות בעצמך
            </p>

            <div className="flex flex-col sm:flex-row gap-4 justify-center">
              <Link
                href="/login"
                className="px-8 py-4 rounded-lg bg-white text-blue-600 font-semibold text-lg hover:bg-blue-50 transition-colors shadow-lg"
              >
                התחל ניסיון חינם
              </Link>
              <a
                href="mailto:oren@gotop.co.il"
                className="px-8 py-4 rounded-lg border-2 border-white text-white font-semibold text-lg hover:bg-white/10 transition-colors"
              >
                צור קשר עם הצוות
              </a>
            </div>

            <p className="text-blue-100 text-sm mt-12 pt-8 border-t border-white/20">
              עמוד זה עודכן לאחרונה באפריל 2026
            </p>
          </div>
        </section>
      </main>

      <Footer />
    </div>
  )
}
