import { createAdminClient } from '@/lib/supabase/admin'
import Link from 'next/link'
import { FileText, Plus } from 'lucide-react'
import { Card } from '@/components/ui/Card'
import Badge from '@/components/ui/Badge'
import EmptyState from '@/components/ui/EmptyState'
import { NoticeBox } from '@/components/ui/Notice'
import { Table, TableHead, TableBody, TableRow, Th, Td } from '@/components/ui/Table'
import { LinkButton } from '@/components/dashboard/ui'

export const dynamic = 'force-dynamic'

export default async function AdminArticlesPage() {
  const admin = createAdminClient()
  const { data: articles, error } = await admin
    .from('articles')
    .select('id, slug, title, is_published, published_at, created_at, author')
    .order('created_at', { ascending: false })

  const newArticle = (
    <LinkButton href="/admin/articles/new">
      <Plus aria-hidden className="size-4" />
      מאמר חדש
    </LinkButton>
  )

  return (
    <div dir="rtl" className="space-y-8">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div className="min-w-0">
          <h1 className="text-title font-bold tracking-tight text-ink">ניהול מאמרים</h1>
          {!!articles?.length && <p className="mt-1.5 text-caption text-muted tabular-nums">{articles.length} מאמרים</p>}
        </div>
        {!!articles?.length && newArticle}
      </div>

      {error && (
        // The provider's message stays out of the screen; it says what happened in our words.
        <NoticeBox tone="bad" language="he">לא הצלחנו לטעון את המאמרים. כדאי לרענן את העמוד בעוד רגע.</NoticeBox>
      )}

      {!articles?.length ? (
        !error && (
          <Card padding={false}>
            <EmptyState
              icon={<FileText />}
              title="כאן יופיעו המאמרים של הבלוג"
              body="כל מאמר שמוצג באתר הציבורי נכתב ונערך מכאן. אפשר לשמור טיוטה ולפרסם כשהיא מוכנה."
              action={newArticle}
            />
          </Card>
        )
      ) : (
        <Table>
          <TableHead>
            <tr>
              <Th>כותרת</Th>
              <Th className="hidden md:table-cell">כתובת</Th>
              <Th>סטטוס</Th>
              <Th className="hidden md:table-cell">נוצר</Th>
              <Th><span className="sr-only">פעולות</span></Th>
            </tr>
          </TableHead>
          <TableBody>
            {articles.map((article) => (
              <TableRow key={article.id}>
                <Td className="max-w-72">
                  <span className="block truncate font-semibold text-ink" title={article.title}>{article.title}</span>
                </Td>
                <Td className="hidden md:table-cell">
                  <span dir="ltr" title={article.slug} className="block max-w-64 truncate text-caption text-muted">/{article.slug}</span>
                </Td>
                <Td>
                  <Badge variant={article.is_published ? 'success' : 'neutral'} dot={article.is_published}>
                    {article.is_published ? 'מפורסם' : 'טיוטה'}
                  </Badge>
                </Td>
                <Td className="hidden text-caption text-muted tabular-nums md:table-cell">
                  {new Date(article.created_at).toLocaleDateString('he-IL')}
                </Td>
                <Td className="text-end">
                  <Link
                    href={`/admin/articles/${article.id}`}
                    className="inline-flex h-8 items-center rounded-control px-3 text-caption font-semibold text-action transition-colors duration-150 ease-snappy hover:bg-action-soft focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-action/20"
                  >
                    עריכה
                  </Link>
                </Td>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      )}
    </div>
  )
}
