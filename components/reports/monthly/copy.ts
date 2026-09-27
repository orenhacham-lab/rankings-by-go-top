/**
 * The monthly report's words, Hebrew and English. Kept beside the component
 * rather than in the shared dashboard dictionary so the feature is one
 * self-contained block. Written for this product; nothing is borrowed from
 * another tool's wording.
 */
import type { Locale } from '@/lib/i18n/locales'

const intlLocale = (l: Locale) => (l === 'he' ? 'he-IL' : 'en-US')

export function monthName(key: string, l: Locale): string {
  const [y, m] = key.split('-').map(Number)
  if (!y || !m) return key
  return new Intl.DateTimeFormat(intlLocale(l), { month: 'long', year: 'numeric', timeZone: 'UTC' }).format(new Date(Date.UTC(y, m - 1, 1)))
}

export function monthOnly(key: string, l: Locale): string {
  const [y, m] = key.split('-').map(Number)
  if (!y || !m) return key
  return new Intl.DateTimeFormat(intlLocale(l), { month: 'long', timeZone: 'UTC' }).format(new Date(Date.UTC(y, m - 1, 1)))
}

export function dayMonth(iso: string, l: Locale): string {
  const t = Date.parse(iso.length === 10 ? `${iso}T00:00:00Z` : iso)
  if (!Number.isFinite(t)) return iso
  return new Intl.DateTimeFormat(intlLocale(l), { day: 'numeric', month: 'long', timeZone: 'UTC' }).format(new Date(t))
}

export function count(n: number, l: Locale): string {
  return new Intl.NumberFormat(intlLocale(l), { maximumFractionDigits: 0 }).format(Math.round(n))
}

export function decimal(n: number, l: Locale): string {
  return new Intl.NumberFormat(intlLocale(l), { maximumFractionDigits: 1 }).format(n)
}

const he = {
  title: 'דוחות חודשיים',
  subtitle: 'בכל 1 לחודש נוצר כאן סיכום של החודש שהסתיים: דירוגים, תוכן, נראות ב-AI ו-Search Console. אין מה להגדיר.',
  monthsLabel: 'חודשים',
  loading: 'טוען את הדוחות החודשיים…',
  loadError: 'לא הצלחנו לטעון את הדוחות החודשיים.',
  retry: 'לנסות שוב',
  firstTitle: (date: string) => `הדוח החודשי הראשון ייווצר ב-${date}`,
  firstBody: (month: string) => `הוא ייבנה מעצמו ויסכם את ${month}: אילו מילים טיפסו ואילו נסוגו, מה עלה לאוויר, איך מנועי ה-AI הזכירו אתכם ומה על הפרק בחודש שאחריו. עד אז הנתונים ממשיכים להיאסף.`,
  firstList: ['תנועת מילות המפתח ומספר המילים בעמוד הראשון', 'המאמרים שפורסמו', 'אזכורים וציטוטים במנועי AI', 'קליקים וחשיפות מ-Search Console, אם מחובר', 'מה מתוכנן לחודש הבא'],
  missingTitle: (month: string) => `הדוח של ${month} עוד לא נוצר`,
  missingBody: 'זה קורה בפרויקט שנפתח באמצע החודש או לפני שהדוחות החודשיים הופעלו. אפשר ליצור אותו עכשיו מהנתונים שכבר שמורים; אחרי שנוצר הוא לא משתנה.',
  missingAction: (month: string) => `ליצור את הדוח של ${month}`,
  missingFailed: 'לא הצלחנו ליצור את הדוח. נסו שוב בעוד רגע.',
  nextReport: (date: string) => `הדוח הבא: ${date}`,
  generatedAuto: (date: string) => `נוצר אוטומטית ב-${date}`,
  generatedOwner: (date: string) => `נוצר לבקשתכם ב-${date}`,
  coversFrom: (date: string) => `הפרויקט נפתח ב-${date}, ולכן הדוח מתחיל מאותו יום.`,
  copy: 'העתקת הסיכום',
  copied: 'הסיכום הועתק',
  headlineParts: {
    firstPage: (n: string) => `${n} מילים בעמוד הראשון של גוגל`,
    improved: (n: string) => `${n} מילים טיפסו`,
    dropped: (n: string) => `${n} נסוגו`,
    published: (n: string) => `${n} מאמרים פורסמו`,
    clicks: (n: string) => `${n} קליקים מגוגל`,
    quiet: 'חודש שקט: לא נרשמה תנועה בדירוגים ולא פורסם תוכן.',
  },
  tiles: {
    firstPage: 'בעמוד הראשון',
    firstPageSource: 'מעקב הדירוג שלנו · מקומות 1-10',
    wasAtStart: (n: string) => `בתחילת החודש: ${n}`,
    improved: 'מילים שטיפסו',
    improvedSource: (steady: string) => `ללא שינוי: ${steady}`,
    published: 'מאמרים שפורסמו',
    publishedSource: 'וורדפרס ושופיפיי, דרך האפליקציה',
    clicks: 'קליקים מגוגל',
    clicksSource: (from: string, to: string) => `Search Console · ${from} עד ${to}`,
    clicksMissing: 'אין נתון',
    noChecks: 'לא נבדק החודש',
  },
  improvedTitle: 'מה טיפס',
  droppedTitle: 'מה נסוג',
  movesSub: 'מהבדיקה שלפני החודש עד הבדיקה האחרונה בו',
  outside: 'מחוץ ל-100',
  mapsTag: 'מפות',
  more: (n: string) => `ועוד ${n}`,
  noKeywords: 'עוד אין מילות מפתח במעקב, אז אין תנועה להשוות. מילים שתוסיפו ייכנסו לדוח הבא.',
  noKeywordsAction: 'להוספת מילות מפתח',
  noChecks: 'המילים לא נבדקו החודש. כדי לראות תנועה צריך לפחות בדיקת דירוג אחת בחודש.',
  noChecksAction: 'לבדיקת הדירוגים',
  noneImproved: (steady: string) => `אף מילה לא טיפסה החודש. ${steady} נשארו באותו מקום.`,
  noneDropped: 'אף מילה לא נסוגה החודש.',
  singleCheck: 'רוב המילים נבדקו פעם אחת בלבד, ולכן אין עדיין נקודת השוואה. מהחודש הבא תופיע כאן התנועה שלהן.',
  publishedTitle: 'מה פורסם',
  publishedNone: (month: string) => `לא פורסמו מאמרים ב${month}. כל מאמר שיעלה דרך האפליקציה ייספר בחודש שבו פורסם.`,
  publishedAction: 'לאסטרטגיית התוכן',
  channel: { wordpress: 'וורדפרס', shopify: 'שופיפיי', other: 'פורסם' },
  aiTitle: 'נראות במנועי AI',
  aiNone: 'לא הורצו בדיקות נראות ב-AI בחודש הזה. בדיקה אחת מספיקה כדי שהדוח הבא יראה כמה פעמים הוזכרתם ומתי צוטטתם כמקור.',
  aiAction: 'לבדיקת נראות',
  aiAnswers: 'תשובות שנבדקו',
  aiMentions: 'הוזכרתם',
  aiCitations: 'צוטטתם כמקור',
  gscTitle: 'Search Console',
  gscNotConnected: 'Search Console לא מחובר לפרויקט, ולכן אין כאן קליקים וחשיפות. מהחיבור והלאה הם ייכנסו לכל דוח.',
  gscConnect: 'לחיבור Search Console',
  gscNoData: 'Search Console מחובר, אבל אין סנכרון שמכסה את החודש הזה. הסנכרון רץ פעם בשבוע, וגוגל מעדכנת את הנתונים באיחור של כיומיים.',
  gscClicks: 'קליקים',
  gscImpressions: 'חשיפות',
  gscWindow: (from: string, to: string) => `28 ימים, ${from} עד ${to}`,
  gscVsPrevious: (from: string, to: string) => `לעומת ${from} עד ${to}`,
  planTitle: (month: string) => `מה מתוכנן ל${month}`,
  planSub: 'כפי שהתוכנית נראתה ביום שבו הדוח נוצר',
  planScheduled: 'מתוזמנים לפרסום',
  planQueued: (n: string) => `${n} מאמרים ממתינים בתור הפרסום האוטומטי`,
  planReady: (n: string) => `${n} מאמרים כתובים ומחכים לפרסום`,
  planApproved: 'נושאים שאישרתם לכתיבה',
  planIdeas: 'רעיונות שהוצעו ומחכים להחלטה',
  planEmpty: 'אין עדיין תוכנית תוכן לחודש הבא. אסטרטגיית התוכן תציע נושאים לפי מילות המפתח שלכם, ומה שתאשרו יופיע כאן.',
  teaser: {
    title: 'הדוח החודשי',
    open: 'לדוח המלא',
    firstBody: (date: string) => `הדוח הראשון ייווצר ב-${date} ויסכם את החודש הנוכחי.`,
    missingBody: (month: string) => `הדוח של ${month} עוד לא נוצר. אפשר ליצור אותו במסך הדוחות.`,
    goToReports: 'למסך הדוחות',
  },
  email: {
    title: 'סיכום שבועי במייל',
    description: 'תקציר קצר של הדירוגים והתוכן של הפרויקט, פעם בשבוע.',
    label: 'לשלוח לי סיכום שבועי',
    notLive: 'שליחת המיילים עוד לא הופעלה. ההעדפה נשמרת כבר עכשיו, ומיילים יתחילו לצאת רק אחרי שהשליחה תופעל.',
    on: 'פעיל',
    off: 'כבוי',
    saved: 'נשמר',
    failed: 'לא נשמר. נסו שוב.',
  },
}

export type MonthlyCopy = typeof he

const en: MonthlyCopy = {
  title: 'Monthly reports',
  subtitle: 'On the 1st of every month, a summary of the month that just ended appears here: rankings, content, AI visibility and Search Console. Nothing to set up.',
  monthsLabel: 'Months',
  loading: 'Loading your monthly reports…',
  loadError: 'We couldn’t load your monthly reports.',
  retry: 'Try again',
  firstTitle: (date) => `Your first monthly report arrives on ${date}`,
  firstBody: (month) => `It builds itself and sums up ${month}: which keywords climbed and which slipped, what went live, how AI engines mentioned you, and what’s lined up for the month after. Until then, the data keeps coming in.`,
  firstList: ['Keyword movement and your first-page count', 'Articles published', 'Mentions and citations in AI answers', 'Search Console clicks and impressions, if connected', 'What’s planned for next month'],
  missingTitle: (month) => `The ${month} report hasn’t been created`,
  missingBody: 'This happens when a project was opened mid-month or before monthly reports were switched on. You can create it now from the data already stored; once created, it doesn’t change.',
  missingAction: (month) => `Create the ${month} report`,
  missingFailed: 'We couldn’t create the report. Try again in a moment.',
  nextReport: (date) => `Next report: ${date}`,
  generatedAuto: (date) => `Created automatically on ${date}`,
  generatedOwner: (date) => `Created at your request on ${date}`,
  coversFrom: (date) => `The project was opened on ${date}, so the report starts from that day.`,
  copy: 'Copy summary',
  copied: 'Summary copied',
  headlineParts: {
    firstPage: (n) => `${n} keywords on Google’s first page`,
    improved: (n) => `${n} climbed`,
    dropped: (n) => `${n} slipped`,
    published: (n) => `${n} articles published`,
    clicks: (n) => `${n} clicks from Google`,
    quiet: 'A quiet month: no ranking movement and no new content.',
  },
  tiles: {
    firstPage: 'On page one',
    firstPageSource: 'Our rank tracking · positions 1-10',
    wasAtStart: (n) => `At the start of the month: ${n}`,
    improved: 'Keywords that climbed',
    improvedSource: (steady) => `Unchanged: ${steady}`,
    published: 'Articles published',
    publishedSource: 'WordPress and Shopify, through the app',
    clicks: 'Clicks from Google',
    clicksSource: (from, to) => `Search Console · ${from} to ${to}`,
    clicksMissing: 'No data',
    noChecks: 'Not checked this month',
  },
  improvedTitle: 'What climbed',
  droppedTitle: 'What slipped',
  movesSub: 'From the check before the month to its last check',
  outside: 'Outside 100',
  mapsTag: 'Maps',
  more: (n) => `and ${n} more`,
  noKeywords: 'No keywords are tracked yet, so there’s no movement to compare. Keywords you add will be in the next report.',
  noKeywordsAction: 'Add keywords',
  noChecks: 'Your keywords weren’t checked this month. Movement needs at least one rank check a month.',
  noChecksAction: 'Check rankings',
  noneImproved: (steady) => `No keyword climbed this month. ${steady} held their position.`,
  noneDropped: 'No keyword slipped this month.',
  singleCheck: 'Most keywords were checked only once, so there’s nothing to compare yet. Their movement shows here from next month.',
  publishedTitle: 'What went live',
  publishedNone: (month) => `No articles were published in ${month}. Every article published through the app counts in the month it went live.`,
  publishedAction: 'Open content strategy',
  channel: { wordpress: 'WordPress', shopify: 'Shopify', other: 'Published' },
  aiTitle: 'AI visibility',
  aiNone: 'No AI visibility checks ran this month. One check is enough for the next report to show how often you were mentioned and when you were cited as a source.',
  aiAction: 'Run a visibility check',
  aiAnswers: 'Answers checked',
  aiMentions: 'Mentioned you',
  aiCitations: 'Cited you as a source',
  gscTitle: 'Search Console',
  gscNotConnected: 'Search Console isn’t connected to this project, so there are no clicks or impressions here. Once connected, every report includes them.',
  gscConnect: 'Connect Search Console',
  gscNoData: 'Search Console is connected, but no sync covers this month. Syncs run weekly, and Google’s figures arrive about two days late.',
  gscClicks: 'Clicks',
  gscImpressions: 'Impressions',
  gscWindow: (from, to) => `28 days, ${from} to ${to}`,
  gscVsPrevious: (from, to) => `vs. ${from} to ${to}`,
  planTitle: (month) => `Planned for ${month}`,
  planSub: 'As the plan stood on the day this report was created',
  planScheduled: 'Scheduled to publish',
  planQueued: (n) => `${n} articles waiting in the automatic publishing queue`,
  planReady: (n) => `${n} articles written and ready to publish`,
  planApproved: 'Topics you approved for writing',
  planIdeas: 'Suggested ideas awaiting your call',
  planEmpty: 'There’s no content plan for next month yet. Your content strategy suggests topics from your keywords, and whatever you approve shows up here.',
  teaser: {
    title: 'Monthly report',
    open: 'Open the full report',
    firstBody: (date) => `Your first report is created on ${date} and covers the current month.`,
    missingBody: (month) => `The ${month} report hasn’t been created yet. You can create it on the Reports screen.`,
    goToReports: 'Go to Reports',
  },
  email: {
    title: 'Weekly email summary',
    description: 'A short digest of this project’s rankings and content, once a week.',
    label: 'Send me a weekly summary',
    notLive: 'Email sending isn’t switched on yet. Your preference is saved now, and emails will only start once sending goes live.',
    on: 'On',
    off: 'Off',
    saved: 'Saved',
    failed: 'Not saved. Try again.',
  },
}

export function monthlyCopy(l: Locale): MonthlyCopy {
  return l === 'en' ? en : he
}
