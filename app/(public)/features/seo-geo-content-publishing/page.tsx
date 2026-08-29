import { Metadata } from 'next'
import Link from 'next/link'
import { PublicNav } from '@/components/PublicNav'
import { Footer } from '@/components/Footer'
import {
  FileText,
  Wand2,
  Edit3,
  CalendarClock,
  Send,
  Users,
  CheckCircle2,
  Image as ImageIcon,
  Link2,
  Search,
  Brain,
} from 'lucide-react'
import { buildHreflangAlternates } from '@/lib/seo/hreflang'

export const metadata: Metadata = {
  title: 'יצירת, תזמון ופרסום מאמרי SEO ו-GEO | Rankings by Go Top',
  description:
    'תכננו נושאים, קבלו טיוטת מאמר מוכנה מ-AI, ערכו אותה, תזמנו אותה ופרסמו ישירות ל-WordPress או Shopify - הכול מתוך מקום אחד.',
  alternates: {
    canonical: 'https://www.gotopseo.com/features/seo-geo-content-publishing',
    languages: buildHreflangAlternates(
      '/features/seo-geo-content-publishing',
      '/en/features/seo-geo-content-publishing'
    ),
  },
}

export default function SeoGeoContentPublishingFeaturePage() {
  return (
    <div className="flex flex-col min-h-screen bg-white rtl">
      <PublicNav locale="he" />

      <main className="flex-1">
        {/* Hero Section */}
        <section className="relative pt-40 pb-20 px-4 sm:px-6 lg:px-8 bg-gradient-to-br from-emerald-50 via-white to-teal-50 overflow-hidden">
          <div className="max-w-5xl mx-auto">
            {/* Badge */}
            <div className="flex justify-center mb-8">
              <span className="inline-flex items-center gap-2 px-4 py-2 rounded-full bg-emerald-100 text-emerald-800 text-sm font-medium border border-emerald-200">
                <FileText className="w-4 h-4" />
                יצירת ופרסום תוכן
              </span>
            </div>

            {/* Main Heading */}
            <h1 className="text-5xl sm:text-6xl font-bold text-slate-900 text-center mb-6 leading-tight">
              יצירת, תזמון ופרסום מאמרי SEO ו-GEO
            </h1>

            {/* Subheading */}
            <p className="text-xl text-slate-600 text-center mb-12 max-w-2xl mx-auto">
              מ תכנון נושא ועד מאמר מפורסם - בלי לקפוץ בין כלי מחקר, עורך תוכן נפרד ומערכת ניהול תוכן. הכול קורה במקום אחד, עם טיוטה שאתם תמיד סוקרים לפני שהיא יוצאת לאוויר.
            </p>

            {/* CTAs */}
            <div className="flex flex-col sm:flex-row gap-4 justify-center mb-16">
              <Link
                href="/signup"
                className="px-8 py-4 rounded-lg bg-gradient-to-r from-emerald-600 to-teal-600 text-white text-lg font-semibold shadow-lg hover:shadow-xl hover:from-emerald-700 hover:to-teal-700 transition-all text-center"
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

        {/* Why It Matters */}
        <section className="py-20 px-4 sm:px-6 lg:px-8 bg-white">
          <div className="max-w-5xl mx-auto">
            <h2 className="text-4xl font-bold text-slate-900 text-center mb-4">למה תוכן זה בדרך כלל כאב ראש</h2>
            <p className="text-xl text-slate-600 text-center mb-16 max-w-2xl mx-auto">
              כדי לפרסם מאמר אחד צריך בדרך כלל לעבור בין כמה כלים נפרדים - וזה מה שהופך תוכן קבוע למשימה שתמיד נדחית.
            </p>

            <div className="grid md:grid-cols-3 gap-8">
              <div className="p-8 rounded-lg border border-emerald-200 bg-emerald-50 hover:shadow-lg transition-shadow">
                <Search className="w-10 h-10 text-emerald-600 mb-4" />
                <h3 className="text-lg font-bold text-slate-900 mb-3">מחקר נושאים בכלי אחד</h3>
                <p className="text-slate-700">
                  צריך למצוא על מה כדאי לכתוב, לבדוק מה מתחרים מכסים ולוודא שהנושא באמת רלוונטי לעסק.
                </p>
              </div>

              <div className="p-8 rounded-lg border border-teal-200 bg-teal-50 hover:shadow-lg transition-shadow">
                <Edit3 className="w-10 h-10 text-teal-600 mb-4" />
                <h3 className="text-lg font-bold text-slate-900 mb-3">כתיבה ועריכה בכלי אחר</h3>
                <p className="text-slate-700">
                  לכתוב טיוטה איכותית לוקח זמן, ואז עוד צריך לערוך, לבדוק ולוודא שהתוכן תואם למה שרציתם להגיד.
                </p>
              </div>

              <div className="p-8 rounded-lg border border-cyan-200 bg-cyan-50 hover:shadow-lg transition-shadow">
                <Send className="w-10 h-10 text-cyan-600 mb-4" />
                <h3 className="text-lg font-bold text-slate-900 mb-3">פרסום ידני בכלי שלישי</h3>
                <p className="text-slate-700">
                  ואז עוד נותר להעתיק את התוכן לאתר, להעלות תמונה, למלא שדות SEO ולזכור מתי בעצם לפרסם.
                </p>
              </div>
            </div>
          </div>
        </section>

        {/* How It Works */}
        <section className="py-20 px-4 sm:px-6 lg:px-8 bg-gradient-to-br from-emerald-50 to-teal-50">
          <div className="max-w-5xl mx-auto">
            <h2 className="text-4xl font-bold text-slate-900 text-center mb-4">איך זה עובד</h2>
            <p className="text-xl text-slate-600 text-center mb-16 max-w-2xl mx-auto">
              חמישה שלבים, מתכנון הנושא ועד למאמר שמתפרסם באתר שלכם.
            </p>

            <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-x-8 gap-y-12">
              {[
                {
                  number: '1',
                  title: 'תכננו נושאים',
                  description: 'המערכת עוזרת לכם לתכנן נושאים רלוונטיים לעסק, בהתבסס על מילות המפתח והתחום שלכם.',
                },
                {
                  number: '2',
                  title: 'אשרו נושא',
                  description: 'עברו על רשימת הנושאים המוצעים ובחרו את אלה שרלוונטיים כרגע.',
                },
                {
                  number: '3',
                  title: 'קבלו טיוטת מאמר מ-AI',
                  description: 'מהנושא שאישרתם, המערכת יוצרת טיוטת מאמר מלאה - כותרת, גוף המאמר, כותרות משנה ושדות SEO.',
                },
                {
                  number: '4',
                  title: 'סקרו וערכו',
                  description: 'כל מאמר הוא טיוטה. קראו אותה, ערכו כמה שצריך, ואשרו רק כשהיא מוכנה בעיניכם.',
                },
                {
                  number: '5',
                  title: 'תזמנו או פרסמו',
                  description: 'קבעו תאריך ושעה לפרסום עתידי, או פרסמו מיד - ישירות ל-WordPress או ל-Shopify.',
                },
              ].map((step) => (
                <div key={step.number} className="relative">
                  <div className="flex items-center justify-center w-12 h-12 mb-4 rounded-full bg-emerald-600 text-white font-bold text-lg">
                    {step.number}
                  </div>
                  <h3 className="text-xl font-semibold text-slate-900 mb-2">{step.title}</h3>
                  <p className="text-slate-600 leading-relaxed">{step.description}</p>
                </div>
              ))}
            </div>
          </div>
        </section>

        {/* Key Features */}
        <section className="py-20 px-4 sm:px-6 lg:px-8 bg-white">
          <div className="max-w-5xl mx-auto">
            <h2 className="text-4xl font-bold text-slate-900 text-center mb-4">מה כלול בכל מאמר</h2>
            <p className="text-xl text-slate-600 text-center mb-16 max-w-2xl mx-auto">
              כל טיוטה שנוצרת מגיעה עם כל מה שצריך כדי לפרסם מאמר שלם, לא רק טקסט גולמי.
            </p>

            <div className="grid md:grid-cols-2 gap-8">
              <div className="flex gap-4">
                <Wand2 className="w-6 h-6 text-emerald-600 flex-shrink-0 mt-1" />
                <div>
                  <h3 className="font-bold text-slate-900 mb-2">טיוטת מאמר מלאה</h3>
                  <p className="text-slate-700">מהנושא שאישרתם, ה-AI כותב מאמר שלם - לא רק תקציר או ראשי פרקים.</p>
                </div>
              </div>

              <div className="flex gap-4">
                <Edit3 className="w-6 h-6 text-teal-600 flex-shrink-0 mt-1" />
                <div>
                  <h3 className="font-bold text-slate-900 mb-2">עריכה חופשית לפני פרסום</h3>
                  <p className="text-slate-700">שנו כל חלק בטיוטה - כותרת, תוכן, מבנה - עד שהיא מדויקת בשבילכם.</p>
                </div>
              </div>

              <div className="flex gap-4">
                <Search className="w-6 h-6 text-cyan-600 flex-shrink-0 mt-1" />
                <div>
                  <h3 className="font-bold text-slate-900 mb-2">כותרת ותקציר SEO</h3>
                  <p className="text-slate-700">כל מאמר יוצא עם כותרת מטא ותיאור מטא מותאמים, שגם אותם אפשר לערוך.</p>
                </div>
              </div>

              <div className="flex gap-4">
                <ImageIcon className="w-6 h-6 text-emerald-600 flex-shrink-0 mt-1" />
                <div>
                  <h3 className="font-bold text-slate-900 mb-2">תמונה ראשית לכל מאמר</h3>
                  <p className="text-slate-700">כל מאמר כולל תמונה ראשית, כדי שלא תצטרכו לחפש או להעלות תמונה בנפרד.</p>
                </div>
              </div>

              <div className="flex gap-4">
                <Link2 className="w-6 h-6 text-teal-600 flex-shrink-0 mt-1" />
                <div>
                  <h3 className="font-bold text-slate-900 mb-2">הצעות לקישורים פנימיים</h3>
                  <p className="text-slate-700">המערכת יכולה להציע קישורים פנימיים רלוונטיים מהאתר שלכם, ואתם מאשרים אילו מהם באמת יכנסו למאמר.</p>
                </div>
              </div>

              <div className="flex gap-4">
                <CalendarClock className="w-6 h-6 text-cyan-600 flex-shrink-0 mt-1" />
                <div>
                  <h3 className="font-bold text-slate-900 mb-2">תזמון פרסום</h3>
                  <p className="text-slate-700">קבעו מראש מתי מאמר מאושר יתפרסם, ותנו למערכת להוציא אותו לאוויר במועד שבחרתם.</p>
                </div>
              </div>
            </div>
          </div>
        </section>

        {/* Publishing Destinations */}
        <section className="py-20 px-4 sm:px-6 lg:px-8 bg-slate-50">
          <div className="max-w-5xl mx-auto text-center">
            <h2 className="text-4xl font-bold text-slate-900 mb-4">פרסום ישיר ל-WordPress ול-Shopify</h2>
            <p className="text-xl text-slate-600 mb-12 max-w-2xl mx-auto">
              חברו את אתר ה-WordPress או חנות ה-Shopify שלכם, ומאמר שאישרתם עובר ישירות אליהם - בלי העתקה-הדבקה ובלי כלי פרסום נוסף.
            </p>

            <div className="grid sm:grid-cols-2 gap-8 max-w-2xl mx-auto">
              <div className="p-8 rounded-lg border border-slate-200 bg-white hover:shadow-lg transition-shadow">
                <h3 className="text-lg font-bold text-slate-900 mb-2">WordPress</h3>
                <p className="text-slate-600">חברו את אתר ה-WordPress שלכם ופרסמו מאמרים ישירות אליו, כולל שדות SEO ותמונה ראשית.</p>
              </div>
              <div className="p-8 rounded-lg border border-slate-200 bg-white hover:shadow-lg transition-shadow">
                <h3 className="text-lg font-bold text-slate-900 mb-2">Shopify</h3>
                <p className="text-slate-600">חברו את חנות ה-Shopify שלכם ופרסמו מאמרי בלוג ישירות מתוך המערכת.</p>
              </div>
            </div>
          </div>
        </section>

        {/* Article Allowance */}
        <section className="py-16 px-4 sm:px-6 lg:px-8 bg-emerald-50 border-t border-emerald-200">
          <div className="max-w-3xl mx-auto">
            <h3 className="text-lg font-semibold text-slate-900 mb-4">איך עובדת מכסת המאמרים בחשבון שלכם</h3>
            <p className="text-slate-600 mb-3 leading-relaxed">
              כל תוכנית מנוי כוללת כמות מסוימת של מאמרים שנוצרים על ידי AI, למחזור החיוב. הכמות המדויקת מוצגת בעמוד התמחור, אבל העיקרון החשוב הוא זה: המכסה היא ברמת החשבון, לא ברמת פרויקט בודד.
            </p>
            <p className="text-slate-600 leading-relaxed">
              המשמעות היא שכל המאמרים שהחשבון שלכם מקבל בכל מחזור חיוב משותפים בין כל הפרויקטים והאתרים שמנוהלים באותו חשבון - אתם מחליטים כמה מאמרים ילכו לכל אתר.
            </p>
          </div>
        </section>

        {/* SEO & GEO */}
        <section className="py-20 px-4 sm:px-6 lg:px-8 bg-white">
          <div className="max-w-5xl mx-auto">
            <h2 className="text-4xl font-bold text-slate-900 text-center mb-4">איך זה תומך גם ב-SEO וגם ב-GEO</h2>
            <p className="text-xl text-slate-600 text-center mb-16 max-w-2xl mx-auto">
              תוכן עקבי ומתוכנן היטב הוא הבסיס גם לדירוג בגוגל וגם להופעה בתשובות של כלי AI - אלה שני יעדים שונים, וכדאי לבנות תוכן שמתייחס לשניהם.
            </p>

            <div className="grid md:grid-cols-2 gap-8">
              <div className="p-8 rounded-lg border border-emerald-200 bg-emerald-50">
                <Search className="w-10 h-10 text-emerald-600 mb-4" />
                <h3 className="text-lg font-bold text-slate-900 mb-3">SEO - חיפוש רגיל בגוגל</h3>
                <p className="text-slate-700">
                  מאמרים עם מבנה ברור, כותרות מטא ותיאורי מטא, ותוכן שעונה על שאלות אמיתיות של המשתמשים - כל אלה עוזרים לגוגל להבין ולדרג את הדפים שלכם. אנחנו לא מבטיחים דירוג מסוים, אבל תוכן איכותי ועקבי הוא תנאי בסיסי לשיפור.
                </p>
              </div>

              <div className="p-8 rounded-lg border border-teal-200 bg-teal-50">
                <Brain className="w-10 h-10 text-teal-600 mb-4" />
                <h3 className="text-lg font-bold text-slate-900 mb-3">GEO - הופעה בתשובות AI</h3>
                <p className="text-slate-700">
                  יותר משתמשים שואלים שאלות ישירות את ChatGPT, Gemini וכלי AI נוספים. תוכן ברור, עקבי ורלוונטי מגדיל את הסיכוי שהמאמרים שלכם ישמשו כמקור לתשובה - בלי הבטחה שכל שאלה תוביל להזכרה.
                </p>
              </div>
            </div>
          </div>
        </section>

        {/* Agencies */}
        <section className="py-20 px-4 sm:px-6 lg:px-8 bg-gradient-to-br from-slate-50 to-emerald-50">
          <div className="max-w-5xl mx-auto">
            <div className="bg-white rounded-lg p-8 md:p-12 border-l-4 border-emerald-600 max-w-3xl mx-auto">
              <div className="flex items-center gap-3 mb-4">
                <Users className="w-8 h-8 text-emerald-600" />
                <h2 className="text-2xl font-bold text-slate-900">לסוכנויות: חלוקת המכסה בין לקוחות</h2>
              </div>
              <p className="text-slate-700 leading-relaxed mb-3">
                מכיוון שמכסת המאמרים היא ברמת החשבון ומשותפת לכל הפרויקטים, סוכנות שמנהלת כמה אתרי לקוחות מאותו חשבון מחליטה בעצמה כל חודש כמה מהמאמרים הזמינים יופנו לכל לקוח.
              </p>
              <p className="text-slate-700 leading-relaxed">
                אין צורך לרכוש מנוי נפרד לכל לקוח - פשוט תעדיפו את הפרויקטים שדורשים תוכן החודש, ותשנו את החלוקה בחודש הבא לפי הצורך.
              </p>
            </div>
          </div>
        </section>

        {/* FAQ Section */}
        <section className="py-20 lg:py-24 bg-gradient-to-br from-slate-50 to-emerald-50">
          <div className="max-w-3xl mx-auto px-4 sm:px-6 lg:px-8">
            <div className="text-center mb-12">
              <div className="inline-block text-emerald-600 text-sm font-semibold mb-3">שאלות נפוצות</div>
              <h2 className="text-3xl lg:text-4xl font-extrabold text-slate-900 tracking-tight">
                שאלות על יצירה ופרסום תוכן
              </h2>
            </div>

            <div className="space-y-4">
              {faqs.map((faq) => (
                <details
                  key={faq.q}
                  className="group bg-white rounded-xl border border-slate-200 overflow-hidden transition-all hover:border-slate-300"
                >
                  <summary className="flex items-center justify-between gap-4 px-6 py-5 cursor-pointer list-none">
                    <h3 className="font-semibold text-slate-900 text-base">{faq.q}</h3>
                    <CheckCircle2 className="shrink-0 w-5 h-5 text-slate-300 group-open:text-emerald-600 transition-colors" />
                  </summary>
                  <div className="px-6 pb-5 text-slate-600 leading-relaxed text-sm">{faq.a}</div>
                </details>
              ))}
            </div>
          </div>
        </section>

        {/* CTA Section */}
        <section className="py-20 px-4 sm:px-6 lg:px-8">
          <div className="max-w-3xl mx-auto text-center">
            <h2 className="text-3xl font-bold text-slate-900 mb-6">מוכנים להפסיק לרדוף אחרי כלים נפרדים לתוכן?</h2>
            <p className="text-xl text-slate-600 mb-8">
              התחילו ניסיון חינם ל-7 ימים, ללא צורך בכרטיס אשראי.
            </p>
            <div className="flex flex-col sm:flex-row gap-4 justify-center">
              <Link
                href="/signup"
                className="inline-block px-8 py-4 rounded-lg bg-gradient-to-r from-emerald-600 to-teal-600 text-white text-lg font-semibold shadow-lg hover:shadow-xl hover:from-emerald-700 hover:to-teal-700 transition-all"
              >
                להתנסות בחינם
              </Link>
              <Link
                href="/pricing"
                className="inline-block px-8 py-4 rounded-lg border-2 border-slate-300 text-slate-700 text-lg font-semibold hover:bg-slate-50 transition-all"
              >
                צפייה בתמחור
              </Link>
            </div>
          </div>
        </section>
      </main>

      <Footer locale="he" />
    </div>
  )
}

const faqs = [
  {
    q: 'איך עובדת מכסת המאמרים ומתי היא מתאפסת?',
    a: 'כל תוכנית מנוי כוללת כמות מסוימת של מאמרי AI למחזור החיוב. המכסה משותפת לכל הפרויקטים בחשבון, מתאפסת בכל מחזור חיוב חדש, ומאמרים שלא נוצלו לא עוברים למחזור הבא.',
  },
  {
    q: 'מה קורה אם נגמרה לי המכסה באמצע התקופה?',
    a: 'כשמגיעים למכסת המאמרים של התוכנית הנוכחית, אפשר לשדרג לתוכנית עם מכסה גדולה יותר כדי להמשיך ליצור מאמרים באותו מחזור חיוב.',
  },
  {
    q: 'האם אני חייב לערוך את המאמר לפני שהוא מתפרסם?',
    a: 'לא חובה, אבל תמיד יש לכם הזדמנות לכך. כל מאמר שנוצר הוא טיוטה - אפשר לקרוא אותה, לערוך כל חלק בה, ורק אז לאשר אותה לפרסום או לתזמון.',
  },
  {
    q: 'לאיזה אתרים אפשר לפרסם?',
    a: 'פרסום ישיר נתמך ל-WordPress ול-Shopify. חברו את הפרויקט לאחד מהם, ומאמרים מאושרים יפורסמו ישירות אליו.',
  },
  {
    q: 'איך עובד תזמון פרסום?',
    a: 'לאחר שאישרתם מאמר, אפשר לפרסם אותו מיד או לקבוע תאריך ושעה עתידיים. המערכת תפרסם אותו אוטומטית במועד שבחרתם.',
  },
  {
    q: 'איך אפשר לחלק את המכסה בין כמה אתרי לקוחות?',
    a: 'המכסה היא ברמת החשבון ומשותפת לכל הפרויקטים בו. סוכנות שמנהלת כמה אתרי לקוחות מחליטה בעצמה, מחודש לחודש, כמה מהמאמרים הזמינים ילכו לכל פרויקט.',
  },
  {
    q: 'האם יש תמונה ראשית וכותרות SEO באופן אוטומטי?',
    a: 'כן - כל מאמר שנוצר מגיע עם תמונה ראשית וכן עם כותרת ותיאור מטא מותאמים ל-SEO, ואתם יכולים לערוך את כולם לפני הפרסום.',
  },
  {
    q: 'יש ניסיון חינם?',
    a: 'כן, יש ניסיון חינם ל-7 ימים ללא צורך בכרטיס אשראי, שכולל גם יצירת מאמר לדוגמה כדי שתוכלו להתרשם מהתהליך.',
  },
]
