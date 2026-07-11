import Link from 'next/link'
import { Footer } from '@/components/Footer'
import { Breadcrumbs } from '@/components/Breadcrumbs'
import { PublicNav } from '@/components/PublicNav'

export default function AboutPage() {
  const values = [
    {
      title: 'שירות אישי ללא פשרות',
      description:
        'אין אצלנו "מנהל תיק לקוח" שמתחלף כל חודש. אתם עובדים עם אנשי מקצוע שמכירים אתכם ואת העסק שלכם.',
    },
    {
      title: 'שקיפות מלאה',
      description: 'אתם תמיד יודעים מה קורה במערכת שלכם, מה עבד ומה לא, ואיך אפשר לשפר.',
    },
    {
      title: 'מקצועיות שמביאה תוצאות',
      description: 'ב-Go Top לא זורקים מונחים מפוצצים. אנחנו מביאים תוצאות אמיתיות, מדידות ומובנות.',
    },
    {
      title: 'אנחנו גם עסק',
      description: 'אנחנו מבינים מה משמעות הלחץ העסקי, התקציב המוגבל והרצון לראות תוצאות מיידיות.',
    },
  ]

  const problems = [
    {
      title: 'מעקב מיקומים ידני גוזל זמן',
      description: 'בדיקות חוזרות של ביטויים, מסכי תוצאות שונים וחישובים ידניים שמכבידים על השגרה.',
    },
    {
      title: 'דוחות מפוזרים על פני מספר כלים',
      description: 'נתונים ב-Google Search, ב-Google Maps, ב-AI ובמקורות נוספים — בלי תמונה אחת ברורה.',
    },
    {
      title: 'נראות AI הופכת קריטית',
      description: 'לקוחות פונים יותר ל-ChatGPT, Gemini ו-Perplexity. צריך לדעת אם העסק שלכם מופיע שם.',
    },
    {
      title: 'מחקר ביטויים שצריך להתחבר לפעולה',
      description: 'לא מספיק לדעת מה מחפשים. צריך להוסיף את הביטויים למעקב וליצור מהם שאלות AI במהירות.',
    },
  ]

  const approach = [
    {
      title: 'שקיפות',
      description: 'הנתונים והמתודולוגיה גלויים, כולל אופן החישוב והמקור של כל מדד.',
    },
    {
      title: 'נתונים שימושיים',
      description: 'דוחות שמספרים סיפור עסקי ברור — לא רק מספרים יפים.',
    },
    {
      title: 'ממשק פשוט',
      description: 'מסך אחד שבו רואים את הדירוגים בגוגל, מפות, AI ומחקר הביטויים — בלי עומס מיותר.',
    },
    {
      title: 'שילוב SEO ו-GEO',
      description: 'מעקב משולב על תוצאות אורגניות וגיאוגרפיות, לצד נראות במנועי AI.',
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
              אודות
              <br />
              <span className="bg-gradient-to-r from-blue-600 to-blue-400 bg-clip-text text-transparent">
                Rankings by Go Top
              </span>
            </h1>
            <p className="text-xl text-slate-600 leading-relaxed max-w-2xl mx-auto">
              מערכת אחת למעקב אחר מיקומים בגוגל, נראות במנועי AI, מחקר ביטויים והפקת דוחות — מבית
              Go Top, סוכנות דיגיטל עם ניסיון של מעל 11 שנה בקידום אתרים ובפרסום ממומן.
            </p>
          </div>
        </div>
      </section>

      <main className="flex-1">
        {/* Who is behind */}
        <section className="py-16 lg:py-24 px-4 sm:px-6 lg:px-8">
          <div className="max-w-5xl mx-auto">
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-12 items-center">
              <div className="space-y-6">
                <h2 className="text-4xl font-extrabold text-slate-900">מי עומדים מאחורי המערכת</h2>
                <div className="space-y-4 text-slate-700 leading-relaxed">
                  <p>
                    Rankings by Go Top נבנתה על ידי Go Top — סוכנות דיגיטל שעוסקת מעל 11 שנה
                    בקידום אתרים אורגני, פרסום ממומן ובניית אתרים לעסקים בישראל.
                  </p>
                  <p>
                    הגענו למערכת הזו מתוך הניסיון המעשי שלנו: ראינו אילו דוחות לקוחות באמת
                    מבינים, אילו נתונים עוזרים לקבל החלטות, ואיפה כלים אחרים מסתבכים. החיבור
                    בין מעקב מיקומים, מחקר ביטויים ונראות AI נולד מתוך עבודה יומיומית עם
                    לקוחות אמיתיים.
                  </p>
                </div>
              </div>

              <div className="relative bg-gradient-to-br from-blue-600 via-blue-500 to-blue-400 rounded-3xl p-12 flex items-center justify-center min-h-96 overflow-hidden shadow-xl">
                <div className="absolute -top-20 -right-20 w-60 h-60 rounded-full bg-white/10 blur-3xl" />
                <div className="absolute -bottom-20 -left-20 w-60 h-60 rounded-full bg-white/10 blur-3xl" />
                <div
                  className="absolute inset-0 opacity-20"
                  style={{
                    backgroundImage:
                      'linear-gradient(to right, rgba(255,255,255,0.1) 1px, transparent 1px), linear-gradient(to bottom, rgba(255,255,255,0.1) 1px, transparent 1px)',
                    backgroundSize: '32px 32px',
                  }}
                />
                <div className="relative text-center">
                  <div className="inline-flex items-center justify-center w-24 h-24 rounded-3xl bg-white/20 backdrop-blur-md border border-white/30 mb-6 shadow-lg">
                    <svg className="w-12 h-12 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M12 6.253v13m0-13C10.832 5.477 9.246 5 7.5 5S4.168 5.477 3 6.253v13C4.168 18.477 5.754 18 7.5 18s3.332.477 4.5 1.253m0-13C13.168 5.477 14.754 5 16.5 5c1.747 0 3.332.477 4.5 1.253v13C19.832 18.477 18.247 18 16.5 18c-1.746 0-3.332.477-4.5 1.253" />
                    </svg>
                  </div>
                  <div className="text-6xl font-extrabold text-white mb-2 tracking-tight">11+</div>
                  <p className="text-white text-xl font-semibold">שנות ניסיון</p>
                  <p className="text-blue-100 text-sm mt-2">בקידום אתרים ובדיגיטל</p>
                </div>
              </div>
            </div>
          </div>
        </section>

        {/* Why we built it */}
        <section className="py-16 lg:py-24 px-4 sm:px-6 lg:px-8 bg-slate-50">
          <div className="max-w-4xl mx-auto">
            <h2 className="text-4xl font-extrabold text-slate-900 mb-6 text-center">
              למה בנינו את המערכת
            </h2>
            <p className="text-lg text-slate-600 text-center mb-12 max-w-2xl mx-auto">
              רצינו לחבר בין כל הכלים שצריך כדי לעקוב אחר הנוכחות הדיגיטלית של עסק — במקום אחד,
              עם ממשק עברי נקי, ועם נתונים שאפשר להפעיל מיד.
            </p>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              {problems.map((problem) => (
                <div
                  key={problem.title}
                  className="bg-white rounded-2xl p-6 border border-slate-200 hover:border-blue-300 transition-colors"
                >
                  <h3 className="text-lg font-bold text-slate-900 mb-2">{problem.title}</h3>
                  <p className="text-slate-600 leading-relaxed">{problem.description}</p>
                </div>
              ))}
            </div>
          </div>
        </section>

        {/* What we solve */}
        <section className="py-16 lg:py-24 px-4 sm:px-6 lg:px-8">
          <div className="max-w-4xl mx-auto">
            <h2 className="text-4xl font-extrabold text-slate-900 mb-6 text-center">
              מה Rankings by Go Top פותרת
            </h2>
            <p className="text-lg text-slate-600 text-center mb-12 max-w-2xl mx-auto">
              דאשבורד אחד שבו רואים את התמונה המלאה: מיקומים אורגניים, נראות במפות, נוכחות
              במנועי AI ומחקר ביטויים. הנתונים מתחברים זה לזה, ולא יושבים בארבעה כלים נפרדים.
            </p>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              <div className="bg-white rounded-2xl p-8 border border-slate-200">
                <h3 className="text-xl font-bold text-slate-900 mb-3">מעקב מיקומים בגוגל</h3>
                <p className="text-slate-600 leading-relaxed">
                  בדיקה תקופתית של הדירוגים שלכם בעמודי 1-2 בגוגל אורגני, כולל מגמות והשוואות
                  על פני זמן.
                </p>
              </div>
              <div className="bg-white rounded-2xl p-8 border border-slate-200">
                <h3 className="text-xl font-bold text-slate-900 mb-3">נראות בגוגל מפות</h3>
                <p className="text-slate-600 leading-relaxed">
                  מעקב אחר נראות העסק בתוצאות Google Maps לפי מיקוד גיאוגרפי מדויק.
                </p>
              </div>
              <div className="bg-white rounded-2xl p-8 border border-slate-200">
                <h3 className="text-xl font-bold text-slate-900 mb-3">נראות במנועי AI</h3>
                <p className="text-slate-600 leading-relaxed">
                  בדיקה האם העסק שלכם מופיע, מצוטט או מומלץ בתשובות של ChatGPT, Gemini,
                  Perplexity ומנועי AI נוספים.
                </p>
              </div>
              <div className="bg-white rounded-2xl p-8 border border-slate-200">
                <h3 className="text-xl font-bold text-slate-900 mb-3">מחקר ביטויים מחובר לפעולה</h3>
                <p className="text-slate-600 leading-relaxed">
                  שליפת רעיונות, נפחי חיפוש ותחרות מ-Google Ads, עם אפשרות להוסיף ביטויים
                  ישירות למעקב או להפוך אותם לשאלות AI.
                </p>
              </div>
            </div>
          </div>
        </section>

        {/* Our approach */}
        <section className="py-16 lg:py-24 px-4 sm:px-6 lg:px-8 bg-slate-50">
          <div className="max-w-5xl mx-auto">
            <h2 className="text-4xl font-extrabold text-slate-900 mb-12 text-center">הגישה שלנו</h2>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
              {approach.map((item) => (
                <div
                  key={item.title}
                  className="bg-white rounded-2xl p-8 border border-slate-200"
                >
                  <h3 className="text-xl font-bold text-slate-900 mb-3">{item.title}</h3>
                  <p className="text-slate-600 leading-relaxed">{item.description}</p>
                </div>
              ))}
            </div>
          </div>
        </section>

        {/* Why choose */}
        <section className="py-16 lg:py-24 px-4 sm:px-6 lg:px-8">
          <div className="max-w-5xl mx-auto">
            <h2 className="text-4xl font-extrabold text-slate-900 mb-12 text-center">
              למה לבחור ב-Rankings by Go Top
            </h2>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              {values.map((value) => (
                <div
                  key={value.title}
                  className="bg-gradient-to-br from-blue-50 to-indigo-50 rounded-2xl p-8 border border-blue-200"
                >
                  <h3 className="text-xl font-bold text-slate-900 mb-3">{value.title}</h3>
                  <p className="text-slate-700 leading-relaxed">{value.description}</p>
                </div>
              ))}
            </div>
          </div>
        </section>

        {/* CTA */}
        <section className="py-16 lg:py-24 px-4 sm:px-6 lg:px-8 bg-gradient-to-br from-blue-600 to-blue-500">
          <div className="max-w-4xl mx-auto text-center">
            <h2 className="text-4xl lg:text-5xl font-extrabold text-white mb-6">רוצים להתחיל?</h2>
            <p className="text-xl text-blue-100 mb-8">
              ניסיון חינם ל-7 ימים. בלי כרטיס אשראי, בלי התחייבות.
            </p>

            <div className="flex flex-col sm:flex-row gap-4 justify-center">
              <Link
                href="/signup"
                className="px-8 py-4 rounded-lg bg-white text-blue-600 font-semibold text-lg hover:bg-blue-50 transition-colors shadow-lg"
              >
                התחילו ניסיון חינם
              </Link>
              <a
                href="mailto:oren@gotop.co.il"
                className="px-8 py-4 rounded-lg border-2 border-white text-white font-semibold text-lg hover:bg-white/10 transition-colors"
              >
                צרו קשר עם הצוות
              </a>
            </div>

            <p className="text-blue-100 text-sm mt-12 pt-8 border-t border-white/20">
              עמוד זה עודכן לאחרונה במאי 2026
            </p>
          </div>
        </section>
      </main>

      <Footer />
    </div>
  )
}
