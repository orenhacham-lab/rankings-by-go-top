import { LEGAL_FOOTNOTE, LegalDoc } from '@/components/public/LegalDoc'

export const metadata = {
  title: 'נגישות | Go Top SEO',
  description: 'מידע על נגישות באתר Go Top SEO',
  robots: 'noindex, nofollow',
}

export default function AccessibilityPage() {
  return (
    <LegalDoc
      locale="he"
      breadcrumbs={[{ label: 'נגישות', href: '/accessibility' }]}
      title="נגישות"
      subtitle="עמוד נגישות של Go Top SEO"
    >
      <section>
        <h2>התחייבותנו לנגישות</h2>
        <p>
          ב-Go Top SEO, אנו מחויבים להנגיש את המערכת שלנו לכולם, כולל אנשים עם מוגבלויות. אנו משתדלים לעמוד בתקנים גבוהים של נגישות דיגיטלית ולהמשיך להשתפר.
        </p>
      </section>

      <section>
        <h2>תקנים שאנו עומדים בהם</h2>
        <p>
          המערכת שלנו פותחה בהתאמה לנחיות WCAG 2.1 (Web Content Accessibility Guidelines) בדרגה AA. אנו משתמשים בסטנדרטים של HTML סמנטי, תוויות ARIA מתאימות, ודגשים על ניגודיות צבעים.
        </p>
        <p className="mt-3">
          בישראל חל על שירותי אינטרנט התקן הישראלי ת&quot;י 5568, המבוסס על WCAG 2.0 ברמה AA, לפי תקנות שוויון זכויות
          לאנשים עם מוגבלות (התאמות נגישות לשירות), התשע&quot;ג-2013. אנו פועלים להתאים את האתר והמערכת לתקן זה
          ברמה AA, ובנחיות WCAG 2.1 ברמה AA שאנו מיישמים כלולות גם דרישות WCAG 2.0.
        </p>
      </section>

      <section>
        <h2>יכולות נגישות</h2>
        <ul>
          <li>תמיכה מלאה בקורא מסך (Screen Reader)</li>
          <li>ניווט באמצעות לוח המקלדת בלבד</li>
          <li>תוויות ברורות לכל שדה בטפסים</li>
          <li>ניגודיות צבעים בדרגה AA לטקסט ולרכיבי הממשק, בעיצוב החדש של האתר והמערכת</li>
          <li>גדלים גדולים של טקסט וזמן מספיק להתמצאות</li>
          <li>סימון פוקוס ברור בניווט במקלדת, ותפריט נגישות באתר להתאמת גודל הטקסט, הניגודיות ועוד</li>
          <li>תמיכה בהעדפת &ldquo;הפחתת תנועה&rdquo; (prefers-reduced-motion) של מערכת ההפעלה: אנימציות ומעברים
          מופחתים או מבוטלים למי שביקש זאת</li>
          <li>תמיכה מלאה בעברית (כיוון מימין לשמאל, RTL) ובאנגלית (משמאל לימין, LTR), כולל כיוון הטקסט, הפריסה
          והניווט</li>
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
          אם נתקלתם בבעיה בנגישות, אנא צרו קשר עם צוות התמיכה שלנו, המשמש גם כרכז הנגישות של השירות:
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
        <h2>חלקים שעדיין לא נגישים במלואם</h2>
        <p>
          ייתכן שחלקים מסוימים, בעיקר תוכן של צד שלישי או קבצים שהועלו אלינו, עדיין אינם נגישים במלואם.
          אם נתקלתם בחלק כזה, כתבו לנו ונטפל בו.
        </p>
      </section>

      <section>
        <h2>עדכונים ושיפורים</h2>
        <p>
          אנחנו מעדכנים את האתר באופן קבוע על מנת לעדכן ולשפר את הנגישות. אם יש לכם הצעות לשיפור, אנא שלחו לנו דואר אלקטרוני.
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
          עמוד זה עודכן לאחרונה ב-29 בספטמבר 2026
        </p>
      </section>
    </LegalDoc>
  )
}
