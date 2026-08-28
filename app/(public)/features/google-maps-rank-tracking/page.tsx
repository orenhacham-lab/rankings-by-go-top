import { Metadata } from 'next'
import Link from 'next/link'
import { PublicNav } from '@/components/PublicNav'
import { Footer } from '@/components/Footer'
import { MapPin, Users, Phone, Star, Award, Navigation } from 'lucide-react'
import { buildHreflangAlternates } from '@/lib/seo/hreflang'

export const metadata: Metadata = {
  title: 'מעקב דירוג בגוגל מפות | Rankings by Go Top',
  description: 'עקבו אחרי המיקום שלכם בגוגל מפות. בדקו נראות מקומית לפי עיר, אזור וביטוי חיפוש. Local SEO מתקדם.',
  alternates: {
    canonical: 'https://www.gotopseo.com/features/google-maps-rank-tracking',
    languages: buildHreflangAlternates(
      '/features/google-maps-rank-tracking',
      '/en/features/google-maps-rank-tracking'
    ),
  },
}

export default function GoogleMapsFeaturePage() {
  return (
    <div className="flex flex-col min-h-screen bg-white">
      <PublicNav locale="he" />

      <main className="flex-1">
        {/* Hero Section */}
        <section className="relative pt-40 pb-20 px-4 sm:px-6 lg:px-8 bg-gradient-to-br from-amber-50 via-white to-orange-50 overflow-hidden">
          <div className="max-w-5xl mx-auto">
            {/* Badge */}
            <div className="flex justify-center mb-8">
              <span className="inline-flex items-center gap-2 px-4 py-2 rounded-full bg-amber-100 text-amber-800 text-sm font-medium border border-amber-200">
                <MapPin className="w-4 h-4" />
                Local SEO - גוגל מפות
              </span>
            </div>

            {/* Main Heading */}
            <h1 className="text-5xl sm:text-6xl font-bold text-slate-900 text-center mb-6 leading-tight">
              שלטו בגוגל מפות בשכונה שלכם
            </h1>

            {/* Subheading */}
            <p className="text-xl text-slate-600 text-center mb-12 max-w-2xl mx-auto">
              לקוחות מקומיים מחפשים בגוגל מפות. אם אתם לא בשלושת המקומות הראשונים, הם ימצאו את המתחרים שלכם. דעו היכן אתם עומדים.
            </p>

            {/* CTAs */}
            <div className="flex flex-col sm:flex-row gap-4 justify-center mb-16">
              <Link
                href="/signup"
                className="px-8 py-4 rounded-lg bg-gradient-to-r from-amber-600 to-orange-600 text-white text-lg font-semibold shadow-lg hover:shadow-xl hover:from-amber-700 hover:to-orange-700 transition-all text-center"
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
              <div className="p-6">
                <div className="grid grid-cols-2 gap-4 mb-6">
                  <div className="bg-gradient-to-br from-amber-100 to-orange-100 rounded-lg p-4 border-2 border-amber-300">
                    <div className="text-xs font-semibold text-amber-800 mb-2">מיקומך</div>
                    <div className="text-2xl font-bold text-amber-900">#3</div>
                    <div className="text-xs text-amber-700 mt-1">בתל אביב - "מסעדה איטלקית"</div>
                  </div>
                  <div className="bg-gradient-to-br from-slate-100 to-slate-200 rounded-lg p-4 border-2 border-slate-300">
                    <div className="text-xs font-semibold text-slate-700 mb-2">שינוי חודשי</div>
                    <div className="text-2xl font-bold text-slate-900">↑1</div>
                    <div className="text-xs text-slate-600 mt-1">בעלייה</div>
                  </div>
                </div>
                <div className="space-y-3 border-t border-slate-200 pt-4">
                  {[
                    { rank: 1, name: 'מסעדת הכרמל', stars: 4.8, reviews: 234 },
                    { rank: 2, name: 'פיצה פרימו', stars: 4.6, reviews: 189 },
                    { rank: 3, name: 'המסעדה שלנו', stars: 4.5, reviews: 156, highlight: true },
                    { rank: 4, name: 'אל-טאפול', stars: 4.4, reviews: 142 },
                  ].map((item) => (
                    <div key={item.rank} className={`flex items-center justify-between p-3 rounded-lg ${item.highlight ? 'bg-amber-50 border border-amber-200' : 'bg-slate-50'}`}>
                      <div className="flex items-center gap-3">
                        <span className="font-bold text-slate-900 w-6">{item.rank}</span>
                        <div>
                          <div className="font-medium text-slate-900">{item.name}</div>
                          <div className="text-xs text-slate-600">{item.reviews} ביקורות</div>
                        </div>
                      </div>
                      <div className="text-sm font-semibold text-amber-600">★ {item.stars}</div>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </div>
        </section>

        {/* Why It Matters */}
        <section className="py-20 px-4 sm:px-6 lg:px-8 bg-white">
          <div className="max-w-5xl mx-auto">
            <h2 className="text-4xl font-bold text-slate-900 text-center mb-4">למה גוגל מפות קריטי לעסקים מקומיים?</h2>
            <p className="text-xl text-slate-600 text-center mb-16 max-w-2xl mx-auto">
              כשמישהו מחפש "מסעדה בתל אביב", הוא נכנס לגוגל מפות, לא לגוגל חיפוש.
            </p>

            <div className="grid md:grid-cols-3 gap-8">
              <div className="p-8 rounded-lg border border-amber-200 bg-amber-50 hover:shadow-lg transition-shadow">
                <Users className="w-10 h-10 text-amber-600 mb-4" />
                <h3 className="text-lg font-bold text-slate-900 mb-3">הכניסה הראשונה של לקוחות</h3>
                <p className="text-slate-700">
                  לקוחות מקומיים לא מתפשרים. אם אתם לא בשלושת המקומות הראשונים בגוגל מפות, הם מוצאים מישהו אחר.
                </p>
              </div>

              <div className="p-8 rounded-lg border border-green-200 bg-green-50 hover:shadow-lg transition-shadow">
                <Phone className="w-10 h-10 text-green-600 mb-4" />
                <h3 className="text-lg font-bold text-slate-900 mb-3">שיחות וביקורים ישירים</h3>
                <p className="text-slate-700">
                  מדירוג גבוה בגוגל מפות = שיחות ישירות וביקורים בחנות. מדד הצלחה מדויק.
                </p>
              </div>

              <div className="p-8 rounded-lg border border-purple-200 bg-purple-50 hover:shadow-lg transition-shadow">
                <Star className="w-10 h-10 text-purple-600 mb-4" />
                <h3 className="text-lg font-bold text-slate-900 mb-3">ביקורות והערכה</h3>
                <p className="text-slate-700">
                  דירוג גבוה בגוגל מפות יכול להשפיע על מספר הביקורות החיוביות שאתה מקבל.
                </p>
              </div>
            </div>
          </div>
        </section>

        {/* How It Works */}
        <section className="py-20 px-4 sm:px-6 lg:px-8 bg-gradient-to-br from-amber-50 to-orange-50">
          <div className="max-w-5xl mx-auto">
            <h2 className="text-4xl font-bold text-slate-900 text-center mb-16">איך לעקוב אחרי הדירוגים שלכם</h2>

            <div className="grid md:grid-cols-3 gap-8">
              <div className="relative">
                <div className="absolute -top-6 -left-6 w-12 h-12 rounded-full bg-amber-600 text-white flex items-center justify-center text-lg font-bold">1</div>
                <div className="bg-white rounded-lg p-8 border border-slate-200">
                  <h3 className="text-lg font-bold text-slate-900 mb-3">הגדירו את הסניפים שלכם</h3>
                  <p className="text-slate-700">
                    הוסיפו את כתובת העסק שלכם בגוגל מפות. אם יש לכם כמה סניפים, הוסיפו את כולם.
                  </p>
                </div>
              </div>

              <div className="relative">
                <div className="absolute -top-6 -left-6 w-12 h-12 rounded-full bg-amber-600 text-white flex items-center justify-center text-lg font-bold">2</div>
                <div className="bg-white rounded-lg p-8 border border-slate-200">
                  <h3 className="text-lg font-bold text-slate-900 mb-3">בחרו ביטויי חיפוש</h3>
                  <p className="text-slate-700">
                    בחרו את הביטויים שלקוחות משתמשים בהם. למשל: "מסעדה בתל אביב" או "טיפול שיניים בראש לציון".
                  </p>
                </div>
              </div>

              <div className="relative">
                <div className="absolute -top-6 -left-6 w-12 h-12 rounded-full bg-amber-600 text-white flex items-center justify-center text-lg font-bold">3</div>
                <div className="bg-white rounded-lg p-8 border border-slate-200">
                  <h3 className="text-lg font-bold text-slate-900 mb-3">קבלו מעקב שוטף</h3>
                  <p className="text-slate-700">
                    הריצו סריקה ידנית בכל רגע שתרצו, או הפעילו סריקה אוטומטית חודשית של הדירוגים שלכם בגוגל מפות. ראו כיצד השינויים משפיעים.
                  </p>
                </div>
              </div>
            </div>
          </div>
        </section>

        {/* Key Features */}
        <section className="py-20 px-4 sm:px-6 lg:px-8 bg-white">
          <div className="max-w-5xl mx-auto">
            <h2 className="text-4xl font-bold text-slate-900 text-center mb-16">יכולות מעקב גוגל מפות</h2>

            <div className="grid md:grid-cols-2 gap-8">
              <div className="flex gap-4">
                <MapPin className="w-6 h-6 text-amber-600 flex-shrink-0 mt-1" />
                <div>
                  <h3 className="font-bold text-slate-900 mb-2">מעקב לפי שכונה וקוד דואר</h3>
                  <p className="text-slate-700">בדקו דירוגים לפי קוד דואר מדויק או שכונה. כל אזור יכול להיות שונה.</p>
                </div>
              </div>

              <div className="flex gap-4">
                <Navigation className="w-6 h-6 text-green-600 flex-shrink-0 mt-1" />
                <div>
                  <h3 className="font-bold text-slate-900 mb-2">מעקב GPS מדויק</h3>
                  <p className="text-slate-700">אפשר להגדיר דירוג לפי קואורדינטות GPS. מדויק לחלוטין.</p>
                </div>
              </div>

              <div className="flex gap-4">
                <Award className="w-6 h-6 text-purple-600 flex-shrink-0 mt-1" />
                <div>
                  <h3 className="font-bold text-slate-900 mb-2">היסטוריית דירוגים לאורך זמן</h3>
                  <p className="text-slate-700">ראו כיצד המיקום שלכם בגוגל מפות השתנה משינוי לשינוי, וזהו מגמות עלייה או ירידה.</p>
                </div>
              </div>

              <div className="flex gap-4">
                <Users className="w-6 h-6 text-indigo-600 flex-shrink-0 mt-1" />
                <div>
                  <h3 className="font-bold text-slate-900 mb-2">שיתוף פעולה לעסקים עם כמה סניפים</h3>
                  <p className="text-slate-700">אם יש לכם כמה סניפים, אפשר לעקוב אחרי כולם בתוך מערכת אחת.</p>
                </div>
              </div>

              <div className="flex gap-4">
                <Star className="w-6 h-6 text-orange-600 flex-shrink-0 mt-1" />
                <div>
                  <h3 className="font-bold text-slate-900 mb-2">מעקב דירוגים תחרותיים</h3>
                  <p className="text-slate-700">רוצים לדעת היכן המתחרים עומדים? אנחנו גם עוקבים אחריהם.</p>
                </div>
              </div>

              <div className="flex gap-4">
                <Phone className="w-6 h-6 text-blue-600 flex-shrink-0 mt-1" />
                <div>
                  <h3 className="font-bold text-slate-900 mb-2">התאמה מדויקת לפי שם העסק</h3>
                  <p className="text-slate-700">המערכת מזהה את העסק שלכם בין כל התוצאות לפי שם ולפי דומיין, כדי שהדירוג שתראו יהיה תמיד מדויק.</p>
                </div>
              </div>
            </div>
          </div>
        </section>

        {/* Who It's For */}
        <section className="py-20 px-4 sm:px-6 lg:px-8 bg-gradient-to-br from-slate-50 to-amber-50">
          <div className="max-w-5xl mx-auto">
            <h2 className="text-4xl font-bold text-slate-900 text-center mb-16">למי זה קריטי</h2>

            <div className="grid md:grid-cols-2 gap-8">
              <div className="bg-white rounded-lg p-8 border-l-4 border-amber-600">
                <h3 className="text-xl font-bold text-slate-900 mb-3">עסקים מקומיים עם מיקום פיזי</h3>
                <p className="text-slate-700 mb-4">מסעדה, ספריה, חנות, קליניקה - כל עסק שלקוחות מחפשים ממקום מסוים.</p>
                <ul className="space-y-2 text-sm text-slate-600">
                  <li>✓ דירוג בגוגל מפות = לקוחות ישירים</li>
                  <li>✓ עקבו אחרי מתחרים מקומיים</li>
                  <li>✓ זהו שינויים בדירוג בזמן</li>
                </ul>
              </div>

              <div className="bg-white rounded-lg p-8 border-l-4 border-orange-600">
                <h3 className="text-xl font-bold text-slate-900 mb-3">עסקים עם מספר סניפים</h3>
                <p className="text-slate-700 mb-4">רשתות חנויות, מרפאות ומשרדים עם כמה סניפים - כל עסק שרוצה לראות את כל הסניפים במקום אחד.</p>
                <ul className="space-y-2 text-sm text-slate-600">
                  <li>✓ מעקב ממרכזי לכל סניף</li>
                  <li>✓ השוואה בין ביצועי סניפים</li>
                  <li>✓ סטנדרט איכות בכל מקום</li>
                </ul>
              </div>

              <div className="bg-white rounded-lg p-8 border-l-4 border-green-600">
                <h3 className="text-xl font-bold text-slate-900 mb-3">סוכנויות פרסום מקומיות</h3>
                <p className="text-slate-700 mb-4">אם אתה עובד עם לקוחות מקומיים, הם רוצים לדעת - איפה אנחנו בגוגל מפות?</p>
                <ul className="space-y-2 text-sm text-slate-600">
                  <li>✓ דוחות ברורים ללקוחות</li>
                  <li>✓ הוכחה לערך העבודה שלך</li>
                  <li>✓ יתרון תחרותי בנראות בגוגל מפות</li>
                </ul>
              </div>

              <div className="bg-white rounded-lg p-8 border-l-4 border-purple-600">
                <h3 className="text-xl font-bold text-slate-900 mb-3">עסקים עם עונתיות</h3>
                <p className="text-slate-700 mb-4">מלונות, בארים, שטח בחו"ל - עסקים שהביקוש משתנה לפי עונה או זמן.</p>
                <ul className="space-y-2 text-sm text-slate-600">
                  <li>✓ דעו כיצד הביקוש משתנה</li>
                  <li>✓ התאימו את ההשקעה בשיווק</li>
                  <li>✓ שימו לב לירידות בדירוג</li>
                </ul>
              </div>
            </div>
          </div>
        </section>

        {/* CTA Section */}
        <section className="py-20 px-4 sm:px-6 lg:px-8 bg-gradient-to-r from-amber-600 to-orange-600">
          <div className="max-w-3xl mx-auto text-center">
            <h2 className="text-4xl font-bold text-white mb-6">שלטו בנראות שלכם בגוגל מפות היום</h2>
            <p className="text-xl text-amber-100 mb-8">
              בדקו לראשונה בחינם. אתם מופתעים מהמיקום שלכם כרגע?
            </p>
            <Link
              href="/signup"
              className="inline-block px-8 py-4 rounded-lg bg-white text-amber-600 text-lg font-bold shadow-lg hover:shadow-xl hover:scale-105 transition-all"
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
