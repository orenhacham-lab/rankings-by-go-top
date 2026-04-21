import Link from 'next/link'

export const metadata = {
  title: 'מדיניות פרטיות | Rankings by Go Top',
  description: 'מדיניות הפרטיות של Rankings by Go Top',
}

export default function PrivacyPage() {
  return (
    <div className="min-h-screen bg-gradient-to-br from-blue-50 to-slate-100 py-12 px-4">
      <div className="max-w-3xl mx-auto bg-white rounded-2xl shadow-sm border border-slate-200 p-8">
        <div className="mb-6">
          <Link href="/" className="text-blue-600 hover:underline font-medium text-sm">
            ← חזור לעמוד הבית
          </Link>
        </div>
        <h1 className="text-4xl font-bold text-slate-900 mb-2">מדיניות פרטיות</h1>
        <p className="text-slate-600 mb-8">מדיניות הפרטיות של Rankings by Go Top</p>

        <div className="prose prose-sm max-w-none space-y-6 text-slate-700">
          <section>
            <h2 className="text-2xl font-bold text-slate-900 mt-8 mb-4">מבוא</h2>
            <p>
              Rankings by Go Top (&ldquo;אנחנו&rdquo;, &ldquo;שלנו&rdquo; או &ldquo;החברה&rdquo;) מפעילה את האתר https://rankings.gotop.co.il (להלן &ldquo;השירות&rdquo;). מדיניות הפרטיות הזו מציינת את המדיניות שלנו בנוגע לאיסוף, שימוש וגילוי של מידע אישי בעת השימוש בשירות שלנו.
            </p>
          </section>

          <section>
            <h2 className="text-2xl font-bold text-slate-900 mt-8 mb-4">מידע שאנו אוספים</h2>
            <p>
              אנו אוספים סוגים שונים של מידע, כולל:
            </p>
            <ul className="list-disc list-inside space-y-2">
              <li><strong>מידע אימות:</strong> שם, כתובת דואר אלקטרוני, סיסמה (מוצפנת)</li>
              <li><strong>מידע פרופיל:</strong> מידע על התוכנית שלך, הנוי שלך</li>
              <li><strong>מידע עסקי:</strong> שם חברה, דומיין, מילות מפתח, נתוני דירוג</li>
              <li><strong>מידע טכני:</strong> כתובת IP, סוג דפדפן, דף שנכנסת ממנו</li>
              <li><strong>מידע תשלום:</strong> מידע כרטיס אשראי (מעובד דרך PayPal בלבד)</li>
            </ul>
          </section>

          <section>
            <h2 className="text-2xl font-bold text-slate-900 mt-8 mb-4">כיצד אנו משתמשים בנתונים שלך</h2>
            <p>
              אנו משתמשים במידע שלך ל:
            </p>
            <ul className="list-disc list-inside space-y-2">
              <li>מתן שירות ניטור דירוגים</li>
              <li>אימות משתמש וניהול חשבון</li>
              <li>עיבוד תשלומים</li>
              <li>שליחת עדכוני שירות וחדשות</li>
              <li>שיפור השירות שלנו</li>
              <li>ציות לדרישות משפטיות</li>
            </ul>
          </section>

          <section>
            <h2 className="text-2xl font-bold text-slate-900 mt-8 mb-4">שיתוף מידע</h2>
            <p>
              אנו לא משתפים את המידע האישי שלך עם צדדים שלישיים, מלבד:
            </p>
            <ul className="list-disc list-inside space-y-2">
              <li><strong>PayPal:</strong> לעיבוד תשלומים בלבד</li>
              <li><strong>Supabase:</strong> לאחסון נתונים מאובטח</li>
              <li><strong>Serper:</strong> לביצוע חיפושים בגוגל</li>
              <li><strong>Vercel:</strong> להנעת האתר</li>
              <li>כאשר דרוש על פי חוק</li>
            </ul>
          </section>

          <section>
            <h2 className="text-2xl font-bold text-slate-900 mt-8 mb-4">אבטחת נתונים</h2>
            <p>
              אנו משתמשים בהצפנה SSL/TLS לכל התקשורת. הסיסמאות שלך מאוחסנות בצורה מוצפנת דרך Supabase Auth. אנו מקיימים סטנדרטים גבוהים של אבטחת נתונים, אך לא יכולים להבטיח 100% אבטחה.
            </p>
          </section>

          <section>
            <h2 className="text-2xl font-bold text-slate-900 mt-8 mb-4">הזכויות שלך</h2>
            <p>
              בהתאם לחוק הגנת הפרטיות, בישראל, יש לך זכות:
            </p>
            <ul className="list-disc list-inside space-y-2">
              <li>לגשת לנתונים האישיים שלך</li>
              <li>לתקן נתונים שגויים</li>
              <li>למחוק את החשבון שלך</li>
              <li>להתנגד לעיבוד מסוים</li>
              <li>לבקש העברת נתונים</li>
            </ul>
            <p className="mt-4">
              כדי להפעיל את הזכויות הללו, צור קשר עם:
              <a href="mailto:oren@gotop.co.il" className="text-blue-600 hover:underline mr-1 ml-1">
                oren@gotop.co.il
              </a>
            </p>
          </section>

          <section>
            <h2 className="text-2xl font-bold text-slate-900 mt-8 mb-4">עוגיות (Cookies)</h2>
            <p>
              אנו משתמשים בעוגיות לצרכים חיוניים:
            </p>
            <ul className="list-disc list-inside space-y-2">
              <li><strong>עוגיות סשן:</strong> לתקשורת מאובטחת עם השרת ולניהול ההתחברות</li>
              <li><strong>עוגיות Analytics:</strong> לניתוח שימוש באתר דרך Google Analytics ו-Google Tag Manager</li>
            </ul>
            <p className="mt-4">
              בהמשך השימוש באתר, אתה מסכים לשימוש בעוגיות כמפורט לעיל.
            </p>
          </section>

          <section>
            <h2 className="text-2xl font-bold text-slate-900 mt-8 mb-4">שירותי ניתוח וערוץ שיווק</h2>
            <p>
              אנו משתמשים בשירותים הבאים לניתוח התנהגות משתמשים וניהול ערוצי שיווק:
            </p>
            <ul className="list-disc list-inside space-y-2">
              <li><strong>Google Analytics:</strong> לניתוח נתוני עברות וערוצי תעבורה לאתר</li>
              <li><strong>Google Tag Manager:</strong> לניהול תגיות וניתוח הרכב משתמשים</li>
            </ul>
            <p className="mt-4">
              עוגיות אלו אינן מזהות אותך באופן אישי ומשמשות לשיפור חוויית ההשתמש והשירות.
            </p>
          </section>

          <section>
            <h2 className="text-2xl font-bold text-slate-900 mt-8 mb-4">שדרוגי מדיניות זו</h2>
            <p>
              אנו עשויים לעדכן מדיניות זו מעת לעת. השינויים יהיו בתוקף מיד עם פרסום. אנו מעודדים אתך לסקור מדיניות זו בתדירות קבועה.
            </p>
          </section>

          <section>
            <h2 className="text-2xl font-bold text-slate-900 mt-8 mb-4">צור קשר</h2>
            <p>
              אם יש לך שאלות בנוגע למדיניות פרטיות זו, אנא צור קשר:
            </p>
            <p className="mt-2">
              <strong>דואר אלקטרוני:</strong>{' '}
              <a href="mailto:oren@gotop.co.il" className="text-blue-600 hover:underline">
                oren@gotop.co.il
              </a>
            </p>
          </section>

          <section>
            <p className="text-slate-500 text-sm mt-8 pt-8 border-t border-slate-200">
              מדיניות זו עודכנה לאחרונה ביוני 2026
            </p>
          </section>
        </div>
      </div>
    </div>
  )
}
