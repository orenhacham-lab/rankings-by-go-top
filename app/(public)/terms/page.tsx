import { PublicNav } from '@/components/PublicNav'
import { Footer } from '@/components/Footer'
import { Breadcrumbs } from '@/components/Breadcrumbs'

export const metadata = {
  title: 'תקנון ותנאי שימוש | Rankings by Go Top',
  description: 'תקנון ותנאי השימוש של Rankings by Go Top — התנאים המסדירים את השימוש בשירות.',
  robots: 'noindex, nofollow',
  openGraph: {
    title: 'תקנון ותנאי שימוש | Rankings by Go Top',
    description: 'תקנון ותנאי השימוש של Rankings by Go Top',
    url: 'https://www.gotopseo.com/terms',
    locale: 'he_IL',
  },
}

export default function HebrewTermsPage() {
  return (
    <div className="min-h-screen bg-gradient-to-br from-blue-50 to-slate-100 flex flex-col">
      <PublicNav locale="he" />
      <div className="flex-1 pt-28 lg:pt-36 pb-12 px-4">
        <div className="max-w-3xl mx-auto bg-white rounded-2xl shadow-sm border border-slate-200 p-8">
          <Breadcrumbs items={[{ label: 'תקנון ותנאי שימוש', href: '/terms' }]} locale="he" />
          <h1 className="text-4xl font-bold text-slate-900 mb-2">תקנון ותנאי שימוש</h1>
          <p className="text-slate-600 mb-8">Rankings by Go Top</p>

          <div className="prose prose-sm max-w-none space-y-6 text-slate-700 leading-relaxed">
            <section>
              <h2 className="text-2xl font-bold text-slate-900 mt-8 mb-4">1. מבוא והגדרת השירות</h2>
              <p>
                Rankings by Go Top (להלן: &ldquo;השירות&rdquo; או &ldquo;המערכת&rdquo;) הוא שירות SaaS המופעל על ידי
                Go Top Digital Marketing &amp; Advertising Ltd. (להלן: &ldquo;החברה&rdquo;), המאפשר ללקוחות לעקוב אחר
                מיקומים בתוצאות החיפוש של Google, נראות בתוצאות Google Maps, נראות במנועי AI כגון ChatGPT, Gemini,
                Perplexity ואחרים, לבצע מחקר ביטויים ולהפיק דוחות מקצועיים.
              </p>
            </section>

            <section>
              <h2 className="text-2xl font-bold text-slate-900 mt-8 mb-4">2. קבלת התנאים</h2>
              <p>
                השימוש במערכת מהווה הסכמה מלאה ובלתי חוזרת לתנאים המפורטים בתקנון זה. ככל שאינכם מסכימים לאחד
                או יותר מהתנאים, אין להירשם למערכת ואין לעשות בה שימוש.
              </p>
            </section>

            <section>
              <h2 className="text-2xl font-bold text-slate-900 mt-8 mb-4">3. פתיחת חשבון ואחריות המשתמש</h2>
              <p>
                בעת ההרשמה למערכת מתחייב המשתמש למסור פרטים נכונים, מלאים ועדכניים. המשתמש אחראי לשמירה על
                סודיות פרטי ההתחברות והסיסמה לחשבונו, ולכל פעילות המתבצעת בחשבונו. במקרה של חשד לשימוש לא
                מורשה, יש לדווח לחברה ללא דיחוי.
              </p>
            </section>

            <section>
              <h2 className="text-2xl font-bold text-slate-900 mt-8 mb-4">4. תקופת ניסיון</h2>
              <p>
                המערכת מציעה תקופת ניסיון בת 7 ימים ללקוחות חדשים. מגבלות תקופת הניסיון מוצגות במערכת
                ועשויות להשתנות מעת לעת לפי שיקול דעת החברה. סיום תקופת הניסיון מחייב מעבר לתוכנית בתשלום
                לצורך המשך השימוש בשירות.
              </p>
            </section>

            <section>
              <h2 className="text-2xl font-bold text-slate-900 mt-8 mb-4">5. מנויים ותשלומים</h2>
              <p>
                המערכת פועלת במודל מנוי חודשי. כל עוד המנוי פעיל, החיוב יתחדש באופן אוטומטי בכל חודש
                לפי התוכנית שנבחרה. המחירים, התוכניות והמגבלות עשויים להשתנות מעת לעת והעדכון יוצג
                במערכת ובמחירון.
              </p>
              <p className="mt-3">
                <strong>אופן החיוב תלוי באופן שבו נפתח החשבון:</strong>
              </p>
              <ul className="list-disc ms-6 mt-2 space-y-2">
                <li>
                  <strong>סוחרים שהתקינו את האפליקציה דרך Shopify</strong> (וכל חשבון שסמכות החיוב שלו היא
                  Shopify) מחויבים אך ורק באמצעות Shopify App Pricing, כחלק מחשבונית ה-Shopify שלהם.
                  סוחרים אלה לעולם אינם מופנים ל-PayPal או לכל תהליך תשלום אחר מחוץ ל-Shopify, ואיננו
                  גובים מהם תשלום בערוץ נוסף.
                </li>
                <li>
                  <strong>לקוחות שנרשמו ישירות באתר</strong>, שסמכות החיוב שלהם אינה Shopify, משלמים
                  באמצעות ספק תשלומים חיצוני (PayPal).
                </li>
                <li>
                  חיבור חנות Shopify לצורך פרסום תוכן, על ידי לקוח שכבר מחויב דרך האתר, אינו יוצר חיוב
                  כפול: חשבון מחויב בערוץ אחד בלבד בכל רגע נתון.
                </li>
              </ul>
            </section>

            <section>
              <h2 className="text-2xl font-bold text-slate-900 mt-8 mb-4">6. ביטול מנוי</h2>
              <p>
                המשתמש רשאי לבטל את חידוש המנוי בכל עת דרך הגדרות החשבון. הגישה למערכת תישמר עד תום
                תקופת החיוב ששולמה. אין ביטול רטרואקטיבי של תקופה שכבר שולמה, למעט מקרים המחויבים על
                פי דין.
              </p>
            </section>

            <section>
              <h2 className="text-2xl font-bold text-slate-900 mt-8 mb-4">7. החזרים</h2>
              <p>
                ככלל, דמי המנוי אינם ניתנים להחזר עבור תקופה שכבר החלה או שולמה. החברה רשאית, לפי שיקול
                דעתה הבלעדי או על פי הוראות הדין, להעניק החזר כספי במקרים מיוחדים. בקשות להחזר תועברנה
                בכתב לכתובת המייל של החברה.
              </p>
            </section>

            <section>
              <h2 className="text-2xl font-bold text-slate-900 mt-8 mb-4">8. מגבלות שימוש</h2>
              <p>
                כל תוכנית במערכת כוללת מגבלות לפי המפורט במחירון ובדף ניהול החשבון, ובכלל זה:
              </p>
              <ul className="list-disc list-inside space-y-1 mr-4">
                <li>מספר פרויקטים</li>
                <li>מספר מילות מפתח לפרויקט</li>
                <li>מספר סריקות דירוג חודשיות</li>
                <li>מספר סריקות נראות AI חודשיות</li>
                <li>היקף השימוש במחקר ביטויים</li>
                <li>היקף הפקת הדוחות</li>
              </ul>
              <p>
                המגבלות מוצגות במערכת ועשויות להשתנות בהתאם לתוכנית ולמדיניות החברה. חריגה מהמגבלות
                עשויה להוביל להגבלת השימוש או לדרישה לשדרוג התוכנית.
              </p>
            </section>

            <section>
              <h2 className="text-2xl font-bold text-slate-900 mt-8 mb-4">9. נתונים ממקורות צד שלישי</h2>
              <p>
                המערכת מסתמכת ועשויה להסתמך על נתונים ושירותים של ספקי צד שלישי, ובכלל זה:
                Google, Google Ads API, Google Maps, ספקי חיפוש שונים, ספקי AI (ChatGPT, Gemini,
                Perplexity ואחרים), ספקי תשלום (Shopify עבור חשבונות המחויבים דרך Shopify, PayPal עבור
                לקוחות המחויבים דרך האתר) וספקי תשתית ואחסון (Supabase וספקי hosting
                נוספים). הנתונים המתקבלים מצדדים שלישיים עשויים להיות חלקיים, משוערים, מעוכבים או
                בלתי זמינים, וזמינותם או דיוקם אינם בשליטת החברה.
              </p>
            </section>

            <section>
              <h2 className="text-2xl font-bold text-slate-900 mt-8 mb-4">10. דיוק הנתונים ואי התחייבות</h2>
              <p>
                החברה אינה מתחייבת לדיוק מוחלט של נתוני הדירוגים, נפחי החיפוש, רמות התחרות, הערכות ה-CPC,
                תוצאות נראות AI או הדוחות. הנתונים מסופקים &ldquo;כפי שהם&rdquo; (AS-IS) ועשויים להיות פערים
                בין תוצאות המערכת לבין בדיקות ידניות או נתונים ממקורות אחרים.
              </p>
            </section>

            <section>
              <h2 className="text-2xl font-bold text-slate-900 mt-8 mb-4">11. היעדר התחייבות לתוצאות עסקיות</h2>
              <p>
                החברה אינה מתחייבת לתוצאות עסקיות כלשהן, ובכלל זה שיפור דירוגים, תנועה לאתר, לידים,
                מכירות, הכנסות או הופעה במנועי AI. המערכת מספקת כלים למעקב וניתוח בלבד.
              </p>
            </section>

            <section>
              <h2 className="text-2xl font-bold text-slate-900 mt-8 mb-4">12. זמינות השירות</h2>
              <p>
                השירות ניתן כפי שהוא וייתכנו תקלות, פעולות תחזוקה, השבתות מתוכננות או בלתי מתוכננות,
                מגבלות של ממשקי API חיצוניים או בעיות אצל ספקי צד שלישי. החברה תפעל בסבירות לצמצם
                הפסקות שירות, אך אינה מתחייבת לזמינות רציפה של 100%.
              </p>
            </section>

            <section>
              <h2 className="text-2xl font-bold text-slate-900 mt-8 mb-4">13. שימוש אסור</h2>
              <p>חל איסור לבצע במערכת כל אחת מהפעולות הבאות:</p>
              <ul className="list-disc list-inside space-y-1 mr-4">
                <li>פגיעה בתשתית המערכת או ניסיון לשבש את פעולתה</li>
                <li>עקיפה של מגבלות המערכת או של מנגנוני אבטחה</li>
                <li>ביצוע reverse engineering, פירוק או חילוץ של קוד</li>
                <li>שימוש במערכת לגרידת נתונים בלתי מורשית</li>
                <li>העברת פרטי גישה לצדדים שאינם מורשים</li>
                <li>שימוש במערכת תוך הפרה של דין כלשהו</li>
              </ul>
            </section>

            <section>
              <h2 className="text-2xl font-bold text-slate-900 mt-8 mb-4">14. קניין רוחני</h2>
              <p>
                כלל הזכויות במערכת, בממשק, בעיצוב, בקוד, בדוחות, בלוגו ובמותג שייכות לחברה. אין להעתיק,
                לשכפל, להפיץ, למכור או לעשות כל שימוש לא מורשה בתכני המערכת או במרכיביה. השימוש המותר
                במערכת הוא אך ורק לצרכיו של המנוי בהתאם לתוכנית שרכש.
              </p>
            </section>

            <section>
              <h2 className="text-2xl font-bold text-slate-900 mt-8 mb-4">15. תוכן משתמש</h2>
              <p>
                המשתמש אחראי באופן בלעדי לכל תוכן שהוא מזין למערכת, ובכלל זה דומיינים, מילות מפתח,
                שאלות AI, פרטי לקוחות וכל מידע אחר. המשתמש מצהיר כי יש בידיו את ההרשאות הנדרשות לעשות
                שימוש בתוכן זה.
              </p>
            </section>

            <section>
              <h2 className="text-2xl font-bold text-slate-900 mt-8 mb-4">16. פרטיות</h2>
              <p>
                השימוש במערכת כפוף גם למדיניות הפרטיות של החברה, המהווה חלק בלתי נפרד מתקנון זה.
                במידה ומדיניות פרטיות נפרדת מתפרסמת באתר, יש לעיין בה לצד תקנון זה.
              </p>
            </section>

            <section>
              <h2 className="text-2xl font-bold text-slate-900 mt-8 mb-4">17. הגבלת אחריות</h2>
              <p>
                בכפוף להוראות הדין, החברה לא תהיה אחראית לכל נזק עקיף, תוצאתי, מיוחד או עונשי, ובכלל זה
                אובדן רווחים, אובדן מידע, פגיעה עסקית או הסתמכות על נתוני המערכת. אחריותה הכוללת של
                החברה, ככל שתחול, לא תעלה על הסכומים ששולמו על ידי המשתמש בפועל ב-12 החודשים שקדמו
                לאירוע נשוא התביעה.
              </p>
            </section>

            <section>
              <h2 className="text-2xl font-bold text-slate-900 mt-8 mb-4">18. השעיה או סיום חשבון</h2>
              <p>
                החברה רשאית להשעות או לחסום חשבון משתמש, באופן זמני או קבוע, במקרה של הפרת תנאי תקנון
                זה, אי תשלום, חשד לשימוש לרעה, ניסיון פגיעה במערכת או כל סיבה סבירה אחרת. במקרה של
                סיום חשבון, המידע השמור עשוי להימחק לפי מדיניות החברה ולפי הוראות הדין.
              </p>
            </section>

            <section>
              <h2 className="text-2xl font-bold text-slate-900 mt-8 mb-4">19. שינויים בתנאים</h2>
              <p>
                החברה רשאית לעדכן את תקנון זה מעת לעת. הנוסח המעודכן יפורסם באתר ויהיה תקף ממועד
                פרסומו. המשך השימוש במערכת לאחר עדכון התנאים מהווה הסכמה לתנאים המעודכנים.
              </p>
            </section>

            <section>
              <h2 className="text-2xl font-bold text-slate-900 mt-8 mb-4">20. דין וסמכות שיפוט</h2>
              <p>
                תקנון זה כפוף לדיני מדינת ישראל. סמכות השיפוט הייחודית בכל מחלוקת הקשורה בתקנון זה
                ובשימוש במערכת נתונה לבתי המשפט המוסמכים בישראל.
              </p>
            </section>

            <section>
              <h2 className="text-2xl font-bold text-slate-900 mt-8 mb-4">21. יצירת קשר</h2>
              <p>בכל שאלה הנוגעת לתקנון זה או לשירות, ניתן לפנות אלינו בכתובת הדוא&rdquo;ל:</p>
              <p className="mt-4">
                <strong>Go Top Digital Marketing &amp; Advertising Ltd.</strong>
                <br />
                דוא&rdquo;ל:{' '}
                <a href="mailto:oren@gotop.co.il" className="text-blue-600 hover:underline">
                  oren@gotop.co.il
                </a>
              </p>
            </section>

            <section>
              <p className="mt-8 pt-8 border-t border-slate-200 text-sm text-slate-500">
                מסמך זה הוא טיוטה עסקית. מומלץ להעבירו לבדיקת עורך דין לפני שימוש סופי.
                <br />
                עדכון אחרון: מאי 2026
              </p>
            </section>
          </div>
        </div>
      </div>
      <Footer locale="he" />
    </div>
  )
}
