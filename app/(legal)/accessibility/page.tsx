import Link from 'next/link'

export const metadata = {
  title: 'נגישות | Rankings by Go Top',
  description: 'מידע על נגישות באתר Rankings by Go Top',
}

export default function AccessibilityPage() {
  return (
    <div className="min-h-screen bg-gradient-to-br from-blue-50 to-slate-100 py-12 px-4">
      <div className="max-w-3xl mx-auto bg-white rounded-2xl shadow-sm border border-slate-200 p-8">
        <div className="mb-6">
          <Link href="/" className="text-blue-600 hover:underline font-medium text-sm">
            ← חזור לעמוד הבית
          </Link>
        </div>
        <h1 className="text-4xl font-bold text-slate-900 mb-2">נגישות</h1>
        <p className="text-slate-600 mb-8">עמוד נגישות של Rankings by Go Top</p>

        <div className="prose prose-sm max-w-none space-y-6 text-slate-700">
          <section>
            <h2 className="text-2xl font-bold text-slate-900 mt-8 mb-4">התחייבותנו לנגישות</h2>
            <p>
              ב-Rankings by Go Top, אנו מחויבים להנגיש את המערכת שלנו לכולם, כולל אנשים עם מוגבלויות. אנו משתדלים לעמוד בתקנים גבוהים של נגישות דיגיטלית ולהמשיך להשתפר.
            </p>
          </section>

          <section>
            <h2 className="text-2xl font-bold text-slate-900 mt-8 mb-4">תקנים שאנו עומדים בהם</h2>
            <p>
              המערכת שלנו פותחה בהתאמה לנחיות WCAG 2.1 (Web Content Accessibility Guidelines) בדרגה AA. אנו משתמשים בסטנדרטים של HTML סמנטי, תוויות ARIA מתאימות, ודגשים על ניגודיות צבעים.
            </p>
          </section>

          <section>
            <h2 className="text-2xl font-bold text-slate-900 mt-8 mb-4">יכולות נגישות</h2>
            <ul className="list-disc list-inside space-y-2">
              <li>תמיכה מלאה בקורא מסך (Screen Reader)</li>
              <li>ניווט באמצעות לוח המקלדת בלבד</li>
              <li>תוויות תיאוריות למכשירים טפטופיים (form fields)</li>
              <li>ניגודיות צבעים מספקת לקריאה טובה</li>
              <li>גדלים גדולים של טקסט וזמן מספיק להתמצאות</li>
              <li>מעברים שכן משבשים ונגישים</li>
            </ul>
          </section>

          <section>
            <h2 className="text-2xl font-bold text-slate-900 mt-8 mb-4">דפדפנים נתמכים</h2>
            <p>
              המערכת שלנו תומכת בדפדפנים עדכניים:
            </p>
            <ul className="list-disc list-inside space-y-2">
              <li>Chrome (גרסה אחרונה)</li>
              <li>Firefox (גרסה אחרונה)</li>
              <li>Safari (גרסה אחרונה)</li>
              <li>Edge (גרסה אחרונה)</li>
            </ul>
          </section>

          <section>
            <h2 className="text-2xl font-bold text-slate-900 mt-8 mb-4">דיווח על בעיות נגישות</h2>
            <p>
              אם נתקלת בבעיה בנגישות, אנא צור קשר עם צוות התמיכה שלנו:
            </p>
            <p className="mt-2">
              <strong>דואר אלקטרוני:</strong>{' '}
              <a href="mailto:oren@gotop.co.il" className="text-blue-600 hover:underline">
                oren@gotop.co.il
              </a>
            </p>
            <p>
              <strong>טלפון:</strong> 054-9489377
            </p>
            <p className="mt-2">
              אנחנו נשתדל להשיב בתוך 48 שעות ולעבוד על פתרון הבעיה.
            </p>
          </section>

          <section>
            <h2 className="text-2xl font-bold text-slate-900 mt-8 mb-4">עדכונים ושיפורים</h2>
            <p>
              אנחנו מעדכנים את האתר באופן קבוע על מנת לעדכן ולשפר את הנגישות. אם יש לך הצעות לשיפור, אנא שלח/י לנו דואר אלקטרוני.
            </p>
          </section>

          <section>
            <h2 className="text-2xl font-bold text-slate-900 mt-8 mb-4">משאבים נוספים</h2>
            <ul className="list-disc list-inside space-y-2">
              <li>
                <a href="https://www.w3.org/WAI/WCAG21/quickref/" className="text-blue-600 hover:underline" target="_blank" rel="noopener noreferrer">
                  WCAG 2.1 Quick Reference
                </a>
              </li>
              <li>
                <a href="https://www.w3.org/WAI/" className="text-blue-600 hover:underline" target="_blank" rel="noopener noreferrer">
                  W3C Web Accessibility Initiative
                </a>
              </li>
            </ul>
          </section>

          <section>
            <p className="text-slate-500 text-sm mt-8 pt-8 border-t border-slate-200">
              עמוד זה עודכן לאחרונה באפריל 2026
            </p>
          </section>
        </div>
      </div>
    </div>
  )
}
