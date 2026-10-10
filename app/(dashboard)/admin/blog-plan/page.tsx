/**
 * /admin/blog-plan — what the blog publishes next, and the chance to stop it.
 *
 * The daily runner takes the highest-volume planned row of the day's language
 * (lib/blog/auto/rotation.ts), so this screen is read top-down: the first
 * planned row of a language is the next article in it. Taking a row out here is
 * the whole veto — there is no "approve", because waiting for one would mean no
 * article on the days nobody looked.
 */
import { createAdminClient } from '@/lib/supabase/admin'
import { Card } from '@/components/ui/Card'
import Badge from '@/components/ui/Badge'
import EmptyState from '@/components/ui/EmptyState'
import { NoticeBox } from '@/components/ui/Notice'
import { Table, TableHead, TableBody, TableRow, Th, Td } from '@/components/ui/Table'
import { CalendarClock } from 'lucide-react'
import { AddPlanRow, RowActions } from '@/components/admin/BlogPlanControls'
import { LOCALE_BY_WEEKDAY, localeForDay } from '@/lib/blog/auto/rotation'
import { PLAN_TABLE } from '@/lib/blog/auto/store'

export const dynamic = 'force-dynamic'

const LOCALE_NAME: Record<string, string> = { he: 'עברית', en: 'אנגלית', es: 'ספרדית', 'pt-BR': 'פורטוגזית' }
const DAY_NAME = ['ראשון', 'שני', 'שלישי', 'רביעי', 'חמישי', 'שישי', 'שבת']

const STATUS_LABEL: Record<string, string> = {
  planned: 'בתור',
  generating: 'נכתב עכשיו',
  ready: 'מוכן',
  published: 'פורסם',
  failed: 'נכשל',
  rejected: 'הוצא מהתור',
}
const STATUS_VARIANT: Record<string, 'neutral' | 'success' | 'danger' | 'warning' | 'info'> = {
  planned: 'info', generating: 'warning', ready: 'success', published: 'success', failed: 'danger', rejected: 'neutral',
}

interface Row {
  id: string
  locale: string
  topic: string
  primary_keyword: string
  monthly_searches: number | null
  status: string
  attempts: number
  last_error: string | null
  article_slug: string | null
  created_at: string
}

export default async function AdminBlogPlanPage() {
  const admin = createAdminClient()
  const { data, error } = await admin
    .from(PLAN_TABLE)
    .select('id, locale, topic, primary_keyword, monthly_searches, status, attempts, last_error, article_slug, created_at')
    .order('status', { ascending: true })
    .order('monthly_searches', { ascending: false, nullsFirst: false })
    .limit(200)

  const rows = (data ?? []) as Row[]
  const today = localeForDay()
  const pendingToday = rows.filter((r) => r.locale === today && r.status === 'planned')

  return (
    <div dir="rtl" className="space-y-8">
      <div className="min-w-0">
        <h1 className="text-title font-bold tracking-tight text-ink">תור המאמרים של הבלוג</h1>
        <p className="mt-1.5 text-caption text-muted">
          מאמר אחד ביום. השפה נקבעת לפי היום בשבוע: {DAY_NAME.map((d, i) => `${d} ${LOCALE_NAME[LOCALE_BY_WEEKDAY[i]]}`).join(' · ')}.
        </p>
        <p className="mt-1 text-caption text-muted">
          היום {LOCALE_NAME[today]}, ובתור {pendingToday.length} ביטויים בשפה הזו.
        </p>
      </div>

      {error && (
        <NoticeBox tone="bad" language="he">לא הצלחנו לטעון את התור. כדאי לרענן את העמוד בעוד רגע.</NoticeBox>
      )}

      <Card className="p-5">
        <h2 className="text-section font-semibold text-ink">הוספת ביטוי ביד</h2>
        <p className="mt-1 text-caption text-muted">
          ביטוי שנוסף כאן נכנס לתור כמו ביטוי שהמחקר מצא, ומתפרסם לפי אותו תור.
        </p>
        <div className="mt-4">
          <AddPlanRow />
        </div>
      </Card>

      {!rows.length ? (
        <EmptyState
          icon={<CalendarClock aria-hidden className="size-6" />}
          title="התור ריק"
          body="המחקר ממלא אותו אוטומטית לפני הפרסום הבא, ואפשר להוסיף ביטוי ביד."
        />
      ) : (
        <Card className="overflow-x-auto p-0">
          <Table>
            <TableHead>
              <TableRow>
                <Th>ביטוי</Th>
                <Th>שפה</Th>
                <Th>חיפושים בחודש</Th>
                <Th>מצב</Th>
                <Th>פעולות</Th>
              </TableRow>
            </TableHead>
            <TableBody>
              {rows.map((row) => (
                <TableRow key={row.id}>
                  <Td>
                    <span className="font-medium text-ink">{row.primary_keyword}</span>
                    {row.topic !== row.primary_keyword && (
                      <span className="block text-caption text-muted">{row.topic}</span>
                    )}
                    {row.article_slug && (
                      <span className="block text-caption text-muted">{row.article_slug}</span>
                    )}
                    {row.last_error && (
                      <span className="block text-caption text-bad">{row.last_error}</span>
                    )}
                  </Td>
                  <Td>{LOCALE_NAME[row.locale] ?? row.locale}</Td>
                  <Td className="tabular-nums">{row.monthly_searches ?? '—'}</Td>
                  <Td>
                    <Badge variant={STATUS_VARIANT[row.status] ?? 'neutral'}>{STATUS_LABEL[row.status] ?? row.status}</Badge>
                  </Td>
                  <Td><RowActions id={row.id} status={row.status} /></Td>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </Card>
      )}
    </div>
  )
}
