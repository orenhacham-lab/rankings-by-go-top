import { createAdminClient } from '@/lib/supabase/admin'
import Link from 'next/link'

export const dynamic = 'force-dynamic'

export default async function AdminArticlesPage() {
  const admin = createAdminClient()
  const { data: articles, error } = await admin
    .from('articles')
    .select('id, slug, title, is_published, published_at, created_at, author')
    .order('created_at', { ascending: false })

  return (
    <div dir="rtl">
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-2xl font-bold text-slate-800">ניהול מאמרים</h1>
        <Link href="/admin/articles/new" className="px-4 py-2 bg-blue-600 text-white rounded-lg text-sm font-medium hover:bg-blue-700 transition-colors">
          + מאמר חדש
        </Link>
      </div>

      {error && (
        <div className="bg-red-50 border border-red-200 text-red-700 rounded-lg px-4 py-3 text-sm mb-4">{error.message}</div>
      )}

      {!articles?.length ? (
        <div className="text-center py-16 text-slate-400">
          <p className="text-lg mb-2">אין מאמרים עדיין</p>
          <p className="text-sm">לחץ על &quot;+ מאמר חדש&quot; כדי להתחיל</p>
        </div>
      ) : (
        <div className="bg-white rounded-xl border border-slate-200 overflow-hidden">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-slate-200 bg-slate-50 text-slate-600 text-right">
                <th className="px-4 py-3 font-medium">כותרת</th>
                <th className="px-4 py-3 font-medium hidden md:table-cell">Slug</th>
                <th className="px-4 py-3 font-medium">סטטוס</th>
                <th className="px-4 py-3 font-medium hidden md:table-cell">תאריך יצירה</th>
                <th className="px-4 py-3 font-medium"></th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {articles.map(article => (
                <tr key={article.id} className="hover:bg-slate-50 transition-colors">
                  <td className="px-4 py-3 font-medium text-slate-800 max-w-[200px] truncate">{article.title}</td>
                  <td className="px-4 py-3 text-slate-500 hidden md:table-cell font-mono text-xs">{article.slug}</td>
                  <td className="px-4 py-3">
                    <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium ${article.is_published ? 'bg-green-100 text-green-700' : 'bg-slate-100 text-slate-600'}`}>
                      {article.is_published ? 'מפורסם' : 'טיוטה'}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-slate-500 hidden md:table-cell text-xs">
                    {new Date(article.created_at).toLocaleDateString('he-IL')}
                  </td>
                  <td className="px-4 py-3 text-left">
                    <Link href={`/admin/articles/${article.id}`} className="text-blue-600 hover:text-blue-800 text-xs font-medium">
                      עריכה
                    </Link>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}
