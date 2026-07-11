import ArticleForm from '@/components/admin/ArticleForm'

export default function NewArticlePage() {
  return (
    <div dir="rtl">
      <h1 className="text-2xl font-bold text-slate-800 mb-6">מאמר חדש</h1>
      <ArticleForm />
    </div>
  )
}
