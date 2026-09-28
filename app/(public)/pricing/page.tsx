import { Check, Gift, Info } from 'lucide-react'
import { createClient } from '@/lib/supabase/server'
import { PublicNav } from '@/components/PublicNav'
import { Footer } from '@/components/Footer'
import { ButtonLink, Callout, CtaBand, FaqList, IconSquircle, PageHero, Section, SectionIntro } from '@/components/public/marketing'
import { PLAN_CATALOG, TRIAL_CATALOG, type PlanCode } from '@/lib/plans/catalog'
import { planLimitLines, PLAN_AUDIENCE_LABEL, PLAN_AUDIENCE_DESCRIPTION } from '@/lib/plans/features'
import { cn } from '@/lib/utils'
import { authHref } from '@/lib/i18n/auth-href'

const PLAN_ORDER: PlanCode[] = ['regular', 'advanced', 'premium', 'large_agency']

/** Card display NAMES. The audience label and description live in
 *  lib/plans/features.ts so they cannot drift from the catalog again —
 *  Advanced was still sold here as a multi-site plan after it became a
 *  one-project plan. */
const PLAN_NAME: Record<PlanCode, string> = {
  regular: 'בייסיק',
  advanced: 'מתקדם',
  premium: 'פרימיום',
  large_agency: 'סוכנות',
}

/** Highlighted / "most popular" plan — a UI choice, currently pinned to Advanced. */
const HIGHLIGHTED_PLAN: PlanCode = 'advanced'

function formatILS(amount: number): string {
  return `₪${amount.toLocaleString('he-IL')}`
}

const faqs = [
  {
    q: 'איך עובדת מכסת המאמרים?',
    a: 'מכסת המאמרים משותפת לכל הפרויקטים בחשבון שלך ומתחדשת בכל מחזור חיוב. מאמרים שלא נוצלו לא עוברים למחזור הבא.',
  },
  {
    q: 'איך נספרת "בדיקת AI"?',
    a: 'בדיקת AI אחת היא בדיקה של שאילתה אחת במנוע AI אחד. אם אתה בודק את אותה שאילתה במספר מנועי AI (לדוגמה ChatGPT ו-Gemini), כל מנוע נספר כבדיקה נפרדת.',
  },
  {
    q: 'איך נספרת "בדיקת גוגל"?',
    a: 'בדיקת גוגל אחת היא בדיקה של מילת מפתח אחת ביעד אחד — גוגל אורגני או גוגל מפות. אם אתה בודק את אותה מילת מפתח גם באורגני וגם במפות, זה נספר כשתי בדיקות.',
  },
  {
    q: 'מה ההבדל בין סריקה ידנית לסריקה אוטומטית?',
    a: 'אפשר להריץ סריקה ידנית בכל רגע שתרצה, ואפשר גם להפעיל סריקה אוטומטית חודשית שרצה בעצמה בכל מחזור חיוב. אין כרגע אפשרות לסריקה אוטומטית יומית או שבועית — רק ידנית ואוטומטית חודשית.',
  },
  {
    q: 'מה קורה כשאני יוצר מאמר חדש?',
    a: 'יצירת מאמר חדש צורכת קרדיט אחד ממכסת המאמרים שלך. עריכה, תזמון או פרסום של מאמר קיים לא צורכים קרדיט נוסף.',
  },
  {
    q: 'האם אפשר לתזמן ולפרסם מאמרים אוטומטית?',
    a: 'כן. אפשר לתזמן מאמר לפרסום עתידי או לפרסם אותו ישירות לאתר וורדפרס או שופיפיי מחובר.',
  },
  {
    q: 'האם אפשר לשדרג או להוריד תוכנית?',
    a: 'כן, אפשר לעבור בין תוכניות בכל זמן. השינוי נכנס לתוקף והמגבלות החדשות חלות מרגע השינוי ואילך.',
  },
  {
    q: 'איך עובד הניסיון החינם?',
    a: `מקבלים ${TRIAL_CATALOG.days} ימי ניסיון חינם, ללא צורך בכרטיס אשראי, עם פרויקט אחד, עד ${TRIAL_CATALOG.maxKeywordsPerProject} מילות מפתח, עד ${TRIAL_CATALOG.maxGoogleChecksLifetime} בדיקות גוגל ועד ${TRIAL_CATALOG.maxAIChecksLifetime} בדיקות AI לכל אורך תקופת הניסיון, וכן מאמר אחד שנוצר על ידי AI כדי להתנסות בתהליך המלא.`,
  },
  {
    q: 'איך אני מבטל את המנוי?',
    a: 'הביטול פשוט ומיידי. אפשר לבטל את המנוי בכל זמן מתוך הדאשבורד שלך, ללא קנסות או דמי ביטול.',
  },
  {
    q: 'האם הנתונים שלי מאובטחים?',
    a: 'בהחלט. כל הנתונים מוצפנים, מאוחסנים בשרתים מאובטחים ולא משותפים עם צדדים שלישיים. הפרטיות שלך חשובה לנו.',
  },
]

export default async function PricingPage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()

  return (
    <div className="flex min-h-screen flex-col bg-canvas">
      <PublicNav />

      <main className="flex-1">
        <PageHero
          compact
          eyebrow="תוכניות מחירים"
          title="תוכניות שמתאימות לכל"
          accent="גודל של עסק"
          subtitle="מחירים שקופים, ללא הפתעות. התחל בניסיון חינם וגדל בהתאם לצרכים שלך."
        />

        <Section className="pt-10 sm:pt-12 lg:pt-14">
          {/* Free trial — only for visitors who are not signed in */}
          {!user && (
            <div className="mx-auto mb-12 flex max-w-4xl flex-col items-start gap-4 rounded-card border border-line bg-surface p-5 shadow-card sm:flex-row sm:items-center sm:gap-5 sm:p-6">
              <IconSquircle icon={Gift} />
              <div className="min-w-0 flex-1">
                <h2 className="text-section font-semibold text-ink">רוצים לבדוק את המערכת לפני שמתחייבים?</h2>
                <p className="mt-1 text-copy text-body">
                  התחילו {TRIAL_CATALOG.days} ימי ניסיון בחינם — ללא כרטיס אשראי.
                </p>
              </div>
              <ButtonLink href={authHref('signup', 'he')} variant="secondary" size="lg" className="w-full sm:w-auto">
                התחל ניסיון חינם
              </ButtonLink>
            </div>
          )}

          {/* ONE row of four cards on a large screen, two columns on a tablet, one
              on a phone. The audience distinction is carried by a small label on
              each card rather than by full-width stacked sections, which pushed
              Premium and Agency below the fold. Static text — no toggle, no URL
              parameter, no cookie, no client state. The recommended plan is the
              only card with the action border and the one primary button. */}
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
            {PLAN_ORDER.map((code) => {
              const plan = PLAN_CATALOG[code]
              const highlighted = code === HIGHLIGHTED_PLAN

              // The five LIMIT lines come from the shared builder, so this card and
              // the dashboard's billing card cannot disagree with the server.
              const features = [
                ...planLimitLines(code, 'he'),
                'מעקב Google Organic ו-Google Maps',
                'מעקב נראות במנועי AI',
                'יצירה, תזמון ופרסום מאמרים לוורדפרס ולשופיפיי',
                'דוחות PDF ו-Excel',
                'תמיכה אישית',
              ]

              return (
                <div
                  key={code}
                  className={cn(
                    'relative flex flex-col rounded-card border bg-surface p-6 shadow-card',
                    highlighted ? 'border-action ring-1 ring-action' : 'border-line',
                  )}
                >
                  {highlighted && (
                    <div className="absolute inset-x-0 -top-3 mx-auto flex h-6 w-fit items-center rounded-pill bg-action px-3 text-caption font-semibold text-action-ink shadow-control">
                      הכי פופולרי
                    </div>
                  )}

                  <div className="mb-5">
                    <p className="mb-1.5 text-caption font-semibold text-muted">
                      {PLAN_AUDIENCE_LABEL[code]['he']}
                    </p>
                    <h3 className="text-section font-bold text-ink">
                      {PLAN_NAME[code]}
                    </h3>
                    <p className="mt-1 text-copy text-body">
                      {PLAN_AUDIENCE_DESCRIPTION[code]['he']}
                    </p>
                  </div>

                  <div className="mb-6 flex items-baseline gap-1.5">
                    <span className="text-display font-bold tracking-tight tabular-nums text-ink">
                      {formatILS(plan.priceILS)}
                    </span>
                    <span className="text-copy text-muted">לחודש</span>
                  </div>

                  <ul className="mb-8 flex-1 space-y-3 border-t border-line pt-5">
                    {features.map((feature) => (
                      <li key={feature} className="flex items-start gap-2.5 text-copy text-body">
                        <Check className="mt-1 size-4 shrink-0 text-action" strokeWidth={2.5} aria-hidden="true" />
                        <span>{feature}</span>
                      </li>
                    ))}
                  </ul>

                  <ButtonLink
                    href={user ? '/dashboard' : authHref('signup', 'he', { plan: code })}
                    variant={highlighted ? 'primary' : 'secondary'}
                    size="lg"
                    className="w-full"
                  >
                    להתנסות חינם
                  </ButtonLink>
                </div>
              )
            })}
          </div>

          {/* Usage clarification */}
          <div className="mx-auto mt-12 max-w-4xl">
            <Callout icon={Info}>
              <p>בדיקת AI אחת היא בדיקה של שאילתה אחת במנוע AI אחד. בדיקת אותה שאילתה במספר מנועים תחושב בנפרד עבור כל מנוע. מכסת המאמרים משותפת לכל הפרויקטים בחשבון ומתחדשת בכל מחזור חיוב.</p>
            </Callout>
          </div>

          {/* Comparison note */}
          <p className="mx-auto mt-6 max-w-3xl text-center text-copy text-muted">
            כל התוכניות כוללות מעקב Google Organic, Google Maps ונראות ב-AI, וכן יצירה ופרסום מאמרים. המכסות משתנות לפי התוכנית. ביטול בכל זמן ללא קנסות.
          </p>
        </Section>

        {/* FAQ */}
        <Section tone="surface">
          <div className="mx-auto max-w-3xl">
            <SectionIntro eyebrow="שאלות נפוצות" title="יש לך שאלה? יש לנו תשובה" />
            <FaqList items={faqs} />
          </div>
        </Section>

        {/* CTA */}
        <Section>
          <CtaBand title="מוכן להתחיל?" body={`התחל ניסיון חינם של ${TRIAL_CATALOG.days} ימים ובדוק את היכולות בעצמך`}>
            <ButtonLink href={user ? '/dashboard' : authHref('signup', 'he')} size="lg">
              {user ? 'לדאשבורד שלי' : 'התחל ניסיון חינם'}
            </ButtonLink>
          </CtaBand>
        </Section>
      </main>

      <Footer />
    </div>
  )
}
