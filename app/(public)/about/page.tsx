import Link from 'next/link'
import { Footer } from '@/components/Footer'
import { Breadcrumbs } from '@/components/Breadcrumbs'
import { PublicNav } from '@/components/PublicNav'

export default function AboutPage() {
  return (
    <div className="min-h-screen bg-gradient-to-br from-blue-50 to-slate-100 flex flex-col">
      <PublicNav />
      <main className="flex-1 pt-28 pb-12 px-4">
        <div className="max-w-3xl mx-auto">
          <Breadcrumbs items={[{ label: 'אודות', href: '/about' }]} />

          <div className="bg-white rounded-2xl shadow-sm border border-slate-200 p-8 mb-8">
            <h1 className="text-4xl font-bold text-slate-900 mb-6">אודות Rankings by Go Top</h1>

            <div className="prose prose-sm max-w-none space-y-6 text-slate-700">
              <section>
                <h2 className="text-2xl font-bold text-slate-900 mt-8 mb-4">הסיפור של Go Top</h2>
                <p>
                  בעולם מלא בבינה מלאכותית, אוטומציות, בוטים וחברות גדולות שמדברות גבוהה – בחברת GO TOP אנחנו באים לעשות משהו אחר.
                </p>
                <p>
                  משהו אנושי, חד, ממוקד תוצאות – ומבוסס על ניסיון של מעל 11 שנים של עשייה דיגיטלית אמיתית. בדגש על קידום אתרים לעסקים, בניית אתרים, ופרסום בדיגיטל.
                </p>
              </section>

              <section>
                <h2 className="text-2xl font-bold text-slate-900 mt-8 mb-4">הפילוסופיה שלנו</h2>
                <p>
                  אנחנו לא מתרכזים בכמות אלא באיכות. אנחנו בוחרים לעבוד עם עסקים שמתאימים לנו – ולתן להם תשומת לב מקסימלית, יחס אישי ושירות מדויק.
                </p>
                <p>
                  בחברת גו טופ אנחנו לא מתלהבים מקליקים וחשיפות. אנחנו מתלהבים מהטלפון שלך שמתחיל לצלצל. כי בסוף – זה מה שחשוב באמת.
                </p>
              </section>

              <section>
                <h2 className="text-2xl font-bold text-slate-900 mt-8 mb-4">פיתוח Rankings by Go Top</h2>
                <p>
                  בעוד שעסקים רבים משתמשים בכלים גנריים לעקיבה אחרי דירוגים, התחלנו לשמוע שוב ושוב אותה בעיה:
                </p>
                <ul className="list-disc list-inside space-y-2">
                  <li>כלים יקרים ומסובכים שלא מתאימים לעסקים קטנים</li>
                  <li>בדוחות שלא מבינים, נתונים שלא משתמשים בהם</li>
                  <li>חוסר תמיכה אמיתית כשצריכים עזרה</li>
                </ul>
                <p className="mt-4">
                  בגלל זה פיתחנו את <strong>Rankings by Go Top</strong> – מערכת עקיבה אחרי מיקומים שמתמקדת בתוצאות כמו שאנחנו מתמקדים.
                </p>
              </section>

              <section>
                <h2 className="text-2xl font-bold text-slate-900 mt-8 mb-4">מה חוקרים Rankings by Go Top?</h2>
                <ul className="list-disc list-inside space-y-2">
                  <li><strong>עקיבה אחרי מיקומים בחיפוש:</strong> מעקב בזמן אמת אחרי המיקומים שלך בגוגל אורגני</li>
                  <li><strong>קידום בגוגל מפות:</strong> דו"ח מפורט על הביצועים שלך בתוצאות הממוקמות</li>
                  <li><strong>ניתוח מתחרים:</strong> בדוק איך אתה עומד במול המתחרים שלך</li>
                  <li><strong>עקיבה אחרי ביצועים:</strong> דוחות שמראים מה שחשוב באמת</li>
                </ul>
              </section>

              <section>
                <h2 className="text-2xl font-bold text-slate-900 mt-8 mb-4">למה לבחור ב-Rankings by Go Top?</h2>
                <p><strong>שירות אישי בלי פשרות</strong></p>
                <p className="ml-4 text-slate-600">
                  אין אצלנו "מנהל תיק לקוח" שמחליף כל חודש. אתה עובד עם אנשי מקצוע שמכירים אותך, עונים מהר, ומבינים את העסק שלך באמת.
                </p>

                <p className="mt-4"><strong>שקיפות מלאה</strong></p>
                <p className="ml-4 text-slate-600">
                  אתה תמיד יודע מה קורה עם המערכת שלך, מה עבד ומה לא, ואיך אפשר לשפר.
                </p>

                <p className="mt-4"><strong>מקצוענות שמביאה תוצאות</strong></p>
                <p className="ml-4 text-slate-600">
                  ב- Go Top לא נזרוק עליך מונחים מפוצצים. אנחנו נביא לך יותר פניות, יותר לקוחות ויותר שקט נפשי.
                </p>

                <p className="mt-4"><strong>אנחנו גם עסק, בדיוק כמו שלך</strong></p>
                <p className="ml-4 text-slate-600">
                  אז אנחנו מבינים אותך. את הלחץ, את התקציב, את השאיפה לראות תוצאות מהר – ומביאים פתרונות שמתאימים באמת.
                </p>
              </section>

              <section>
                <h2 className="text-2xl font-bold text-slate-900 mt-8 mb-4">רוצה להתחיל?</h2>
                <p>
                  <Link href="/login" className="text-blue-600 hover:underline font-medium">
                    הרשמה בחינם
                  </Link>
                  {' '}או{' '}
                  <a href="mailto:oren@gotop.co.il" className="text-blue-600 hover:underline font-medium">
                    צור קשר עם הצוות שלנו
                  </a>
                </p>
              </section>

              <section>
                <p className="text-slate-600 text-sm mt-8 pt-8 border-t border-slate-200">
                  עמוד זה עודכן לאחרונה באפריל 2026
                </p>
              </section>
            </div>
          </div>
        </div>
      </main>
      <Footer />
    </div>
  )
}
