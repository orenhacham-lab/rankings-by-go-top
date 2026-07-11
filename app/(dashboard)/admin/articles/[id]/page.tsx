import { createAdminClient } from '@/lib/supabase/admin'
import ArticleForm from '@/components/admin/ArticleForm'
import { notFound } from 'next/navigation'

export const dynamic = 'force-dynamic'

export default async function EditArticlePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const admin = createAdminClient()
  const { data: article, error } = await admin.from('articles').select('*').eq('id', id).single()

  if (error || !article) notFound()

  return (
    <div dir="rtl">
      <h1 className="text-2xl font-bold text-slate-800 mb-6">עריכת מאמר</h1>
      <ArticleForm initial={article} />
    </div>
  )
}
