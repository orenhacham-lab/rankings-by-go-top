import { createAdminClient } from '@/lib/supabase/admin'
import ArticleForm from '@/components/admin/ArticleForm'
import BackLink from '@/components/ui/BackLink'
import { notFound } from 'next/navigation'

export const dynamic = 'force-dynamic'

export default async function EditArticlePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const admin = createAdminClient()
  const { data: article, error } = await admin.from('articles').select('*').eq('id', id).single()

  if (error || !article) notFound()

  return (
    <div dir="rtl" className="space-y-8">
      <div>
        <BackLink href="/admin/articles" className="mb-2">כל המאמרים</BackLink>
        <h1 className="text-title font-bold tracking-tight text-ink">עריכת מאמר</h1>
      </div>
      <ArticleForm initial={article} />
    </div>
  )
}
