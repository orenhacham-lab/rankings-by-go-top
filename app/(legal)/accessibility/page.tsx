import { LEGAL_FOOTNOTE, LegalDoc } from '@/components/public/LegalDoc'

export const metadata = {
  title: 'נגישות | Rankings by Go Top',
  description: 'מידע על נגישות באתר Rankings by Go Top',
  robots: 'noindex, nofollow',
}

export default function AccessibilityPage() {
  return (
    <LegalDoc
      locale="he"
      breadcrumbs={[{ label: 'נגישות', href: '/accessibility' }]}
      title="נגישות"
      subtitle="עמוד נגישות של Rankings by Go Top"
    >
      <section>
        <h2>התחייבותנו לנגישות</h2>
        <p>
          ב-Rankings by Go Top, אנו מחויבים להנגיש את המערכת שלנו לכולם, כולל אנשים עם מוגבלויות. אנו משתדלים לעמוד בתקנים גבוהים של נגישות דיגיטלית ולהמשיך להשתפר.
        </p>
      </section>

      <section>
        <h2>תקנים שאנו עומדים בהם</h2>
        <p>
          המערכת שלנו פותחה בהתאמה לנחיות WCAG 2.1 (Web Content Accessibility Guidelines) בדרגה AA. אנו משתמשים בסטנדרטים של HTML סמנטי, תוויות ARIA מתאימות, ודגשים על ניגודיות צבעים.
        </p>
      </section>

      <section>
        <h2>יכולות נגישות</h2>
        <ul>
          <li>תמיכה מלאה בקורא מסך (Screen Reader)</li>
          <li>ניווט באמצעות לוח המקלדת בלבד</li>
          <li>תוויות תיאוריות למכשירים טפטופיים (form fields)</li>
          <li>ניגודיות צבעים מספקת לקריאה טובה</li>
          <li>גדלים גדולים של טקסט וזמן מספיק להתמצאות</li>
          <li>מעברים שכן משבשים ונגישים</li>
        </ul>
      </section>

      <section>
        <h2>דפדפנים נתמכים</h2>
        <p>
          המערכת שלנו תומכת בדפדפנים עדכניים:
        </p>
        <ul>
          <li>Chrome (גרסה אחרונה)</li>
          <li>Firefox (גרסה אחרונה)</li>
          <li>Safari (גרסה אחרונה)</li>
          <li>Edge (גרסה אחרונה)</li>
        </ul>
      </section>

      <section>
        <h2>דיווח על בעיות נגישות</h2>
        <p>
          אם נתקלת בבעיה בנגישות, אנא צור קשר עם צוות התמיכה שלנו:
        </p>
        <p className="mt-2">
          <strong>דואר אלקטרוני:</strong>{' '}
          <a href="mailto:oren@gotop.co.il">
            oren@gotop.co.il
          </a>
        </p>
        <p>
          <strong>טלפון:</strong>{' '}
          <a href="tel:0549489377">
            054-9489377
          </a>
        </p>
        <p className="mt-2">
          אנחנו נשתדל להשיב בתוך 48 שעות ולעבוד על פתרון הבעיה.
        </p>
      </section>

      <section>
        <h2>עדכונים ושיפורים</h2>
        <p>
          אנחנו מעדכנים את האתר באופן קבוע על מנת לעדכן ולשפר את הנגישות. אם יש לך הצעות לשיפור, אנא שלח לנו דואר אלקטרוני.
        </p>
      </section>

      <section>
        <h2>משאבים נוספים</h2>
        <ul>
          <li>
            <a href="https://www.w3.org/WAI/WCAG21/quickref/" target="_blank" rel="noopener noreferrer">
              WCAG 2.1 Quick Reference
            </a>
          </li>
          <li>
            <a href="https://www.w3.org/WAI/" target="_blank" rel="noopener noreferrer">
              W3C Web Accessibility Initiative
            </a>
          </li>
        </ul>
      </section>

      <section>
        <p className={LEGAL_FOOTNOTE}>
          עמוד זה עודכן לאחרונה באפריל 2026
        </p>
      </section>
    </LegalDoc>
  )
}
