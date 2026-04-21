'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { createClient } from '@/lib/supabase/client'

export default function AdminArticlesPage() {
  const [user, setUser] = useState<any>(null)
  const [articles, setArticles] = useState<any[]>([])
  const [loading, setLoading] = useState(true)
  const [isAdmin, setIsAdmin] = useState(false)
  const [showForm, setShowForm] = useState(false)
  const [formData, setFormData] = useState({
    title: '',
    slug: '',
    excerpt: '',
    content: '',
    meta_description: '',
    author: '',
  })
  const [editingId, setEditingId] = useState<string | null>(null)
  const router = useRouter()

  useEffect(() => {
    checkAuthAndLoadArticles()
  }, [])

  async function checkAuthAndLoadArticles() {
    const supabase = createClient()
    const { data: { session } } = await supabase.auth.getSession()

    if (!session) {
      router.push('/login')
      return
    }

    setUser(session.user)
    const adminEmail = process.env.NEXT_PUBLIC_ADMIN_EMAIL || 'oren@gotop.co.il'
    setIsAdmin(session.user.email === adminEmail)

    if (session.user.email !== adminEmail) {
      router.push('/dashboard')
      return
    }

    loadArticles(supabase)
  }

  async function loadArticles(supabase: any) {
    const { data, error } = await supabase
      .from('articles')
      .select('*')
      .order('created_at', { ascending: false })

    if (!error && data) {
      setArticles(data)
    }
    setLoading(false)
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    const supabase = createClient()

    try {
      if (editingId) {
        // Update article
        const { error } = await supabase
          .from('articles')
          .update({
            ...formData,
            updated_at: new Date().toISOString(),
          })
          .eq('id', editingId)

        if (error) throw error
      } else {
        // Create article
        const { error } = await supabase
          .from('articles')
          .insert([
            {
              ...formData,
              is_published: false,
              created_at: new Date().toISOString(),
            },
          ])

        if (error) throw error
      }

      // Reload articles
      const { data: { session } } = await supabase.auth.getSession()
      if (session) {
        loadArticles(supabase)
      }

      // Reset form
      setFormData({
        title: '',
        slug: '',
        excerpt: '',
        content: '',
        meta_description: '',
        author: '',
      })
      setEditingId(null)
      setShowForm(false)
    } catch (error) {
      console.error('Error saving article:', error)
      alert('שגיאה בשמירת המאמר')
    }
  }

  async function togglePublished(id: string, current_status: boolean) {
    const supabase = createClient()
    const { error } = await supabase
      .from('articles')
      .update({ is_published: !current_status })
      .eq('id', id)

    if (!error) {
      loadArticles(supabase)
    }
  }

  async function deleteArticle(id: string) {
    if (!confirm('האם בטוח שברצונך למחוק מאמר זה?')) return

    const supabase = createClient()
    const { error } = await supabase
      .from('articles')
      .delete()
      .eq('id', id)

    if (!error) {
      loadArticles(supabase)
    }
  }

  if (loading) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-blue-50 to-slate-100 flex items-center justify-center">
        <div className="text-slate-500">טוען...</div>
      </div>
    )
  }

  if (!isAdmin) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-blue-50 to-slate-100 flex items-center justify-center">
        <div className="text-slate-500">אין גישה</div>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-blue-50 to-slate-100 py-12 px-4">
      <div className="max-w-6xl mx-auto">
        <div className="mb-8 flex items-center justify-between">
          <div>
            <Link href="/dashboard" className="text-blue-600 hover:underline text-sm mb-2 inline-block">
              ← חזור
            </Link>
            <h1 className="text-4xl font-bold text-slate-900">ניהול מאמרים</h1>
          </div>
          <button
            onClick={() => setShowForm(!showForm)}
            className="bg-blue-600 hover:bg-blue-700 text-white font-medium py-2 px-4 rounded-lg"
          >
            {showForm ? 'ביטול' : '+ מאמר חדש'}
          </button>
        </div>

        {showForm && (
          <div className="bg-white rounded-2xl shadow-sm border border-slate-200 p-8 mb-8">
            <h2 className="text-2xl font-bold text-slate-900 mb-6">
              {editingId ? 'עריכת מאמר' : 'יצירת מאמר חדש'}
            </h2>
            <form onSubmit={handleSubmit} className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">
                  כותרת *
                </label>
                <input
                  type="text"
                  required
                  value={formData.title}
                  onChange={(e) => setFormData({ ...formData, title: e.target.value })}
                  className="w-full px-4 py-2 border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">
                  Slug (URL) *
                </label>
                <input
                  type="text"
                  required
                  value={formData.slug}
                  onChange={(e) => setFormData({ ...formData, slug: e.target.value.toLowerCase().replace(/\s/g, '-') })}
                  className="w-full px-4 py-2 border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                  placeholder="e.g., seo-tips"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">
                  תמצית (Excerpt)
                </label>
                <textarea
                  value={formData.excerpt}
                  onChange={(e) => setFormData({ ...formData, excerpt: e.target.value })}
                  className="w-full px-4 py-2 border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                  rows={2}
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">
                  תיאור Meta (SEO)
                </label>
                <textarea
                  value={formData.meta_description}
                  onChange={(e) => setFormData({ ...formData, meta_description: e.target.value })}
                  className="w-full px-4 py-2 border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                  rows={2}
                  maxLength={160}
                  placeholder="עד 160 תווים"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">
                  תוכן *
                </label>
                <textarea
                  required
                  value={formData.content}
                  onChange={(e) => setFormData({ ...formData, content: e.target.value })}
                  className="w-full px-4 py-2 border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                  rows={10}
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">
                  מחבר
                </label>
                <input
                  type="text"
                  value={formData.author}
                  onChange={(e) => setFormData({ ...formData, author: e.target.value })}
                  className="w-full px-4 py-2 border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
              </div>

              <button
                type="submit"
                className="w-full bg-blue-600 hover:bg-blue-700 text-white font-medium py-2 px-4 rounded-lg"
              >
                {editingId ? 'עדכן מאמר' : 'שמור מאמר'}
              </button>
            </form>
          </div>
        )}

        <div className="bg-white rounded-2xl shadow-sm border border-slate-200 overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead className="bg-slate-50 border-b border-slate-200">
                <tr>
                  <th className="px-6 py-3 text-right text-sm font-medium text-slate-700">כותרת</th>
                  <th className="px-6 py-3 text-right text-sm font-medium text-slate-700">Slug</th>
                  <th className="px-6 py-3 text-right text-sm font-medium text-slate-700">סטטוס</th>
                  <th className="px-6 py-3 text-right text-sm font-medium text-slate-700">פעולות</th>
                </tr>
              </thead>
              <tbody>
                {articles.map((article) => (
                  <tr key={article.id} className="border-b border-slate-200 hover:bg-slate-50">
                    <td className="px-6 py-3 text-sm text-slate-900">{article.title}</td>
                    <td className="px-6 py-3 text-sm text-slate-600">{article.slug}</td>
                    <td className="px-6 py-3 text-sm">
                      <button
                        onClick={() => togglePublished(article.id, article.is_published)}
                        className={`px-3 py-1 rounded text-xs font-medium ${
                          article.is_published
                            ? 'bg-green-100 text-green-800'
                            : 'bg-yellow-100 text-yellow-800'
                        }`}
                      >
                        {article.is_published ? 'פורסום' : 'טיוטה'}
                      </button>
                    </td>
                    <td className="px-6 py-3 text-sm space-x-2 flex">
                      <button
                        onClick={() => {
                          setFormData({
                            title: article.title,
                            slug: article.slug,
                            excerpt: article.excerpt || '',
                            content: article.content,
                            meta_description: article.meta_description || '',
                            author: article.author || '',
                          })
                          setEditingId(article.id)
                          setShowForm(true)
                        }}
                        className="text-blue-600 hover:underline"
                      >
                        עריכה
                      </button>
                      <button
                        onClick={() => deleteArticle(article.id)}
                        className="text-red-600 hover:underline"
                      >
                        מחיקה
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </div>
  )
}
