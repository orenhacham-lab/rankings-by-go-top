import ArticleForm from '@/components/admin/ArticleForm'
import BackLink from '@/components/ui/BackLink'

export default function NewArticlePage() {
  return (
    <div dir="rtl" className="space-y-8">
      <div>
        <BackLink href="/admin/articles" className="mb-2">כל המאמרים</BackLink>
        <h1 className="text-title font-bold tracking-tight text-ink">מאמר חדש</h1>
      </div>
      <ArticleForm />
    </div>
  )
}
