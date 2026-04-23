'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { createClient } from '@/lib/supabase/client'
import { RichTextEditor } from '@/components/RichTextEditor'

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
    featured_image_url: '',
    featured_image_alt: '',
  })
  const [editingId, setEditingId] = useState<string | null>(null)
  const [uploadingFeatured, setUploadingFeatured] = useState(false)
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

  async function handleFeaturedImageUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (!file) return

    setUploadingFeatured(true)
    try {
      const supabase = createClient()
      const ext = file.name.split('.').pop()
      const sanitizedName = `featured-${Date.now()}.${ext}`

      const { data, error } = await supabase.storage
        .from('article-images')
        .upload(sanitizedName, file)

      if (error) {
        console.error('Upload error:', error)
        alert('שגיאה בהעלאת התמונה')
        return
      }

      const { data: { publicUrl } } = supabase.storage
        .from('article-images')
        .getPublicUrl(sanitizedName)

      setFormData({ ...formData, featured_image_url: publicUrl })
      alert('תמונה עלויה בהצלחה!')
    } catch (error) {
      console.error('Error:', error)
      alert('שגיאה בהעלאת התמונה')
    } finally {
      setUploadingFeatured(false)
    }
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

      // Reset form
      setFormData({
        title: '',
        slug: '',
        excerpt: '',
        content: '',
        meta_description: '',
        author: '',
        featured_image_url: '',
        featured_image_alt: '',
      })
      setEditingId(null)
      setShowForm(false)

      // Reload articles
      await loadArticles(supabase)
      alert('המאמר נשמר בהצלחה!')
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
                <RichTextEditor
                  value={formData.content}
                  onChange={(value) => setFormData({ ...formData, content: value })}
                  placeholder="כתוב את המאמר כאן... תוכל להוסיף כותרות, טבלאות, תמונות, וציון עיצוב"
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

              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">
                  תמונה ראשית
                </label>
                <div className="space-y-4">
                  <div>
                    <label className="block px-4 py-2 border-2 border-dashed border-slate-300 rounded-lg bg-slate-50 hover:bg-slate-100 cursor-pointer text-center text-sm text-slate-600">
                      {uploadingFeatured ? 'מעלה תמונה...' : 'לחץ להעלאת תמונה'}
                      <input
                        type="file"
                        accept="image/*"
                        onChange={handleFeaturedImageUpload}
                        disabled={uploadingFeatured}
                        className="hidden"
                      />
                    </label>
                  </div>

                  {formData.featured_image_url && (
                    <div>
                      <div className="relative w-full h-48 bg-slate-200 rounded-lg overflow-hidden">
                        <img
                          src={formData.featured_image_url}
                          alt="תמונה ראשית"
                          className="w-full h-full object-cover"
                        />
                      </div>
                      <button
                        type="button"
                        onClick={() => setFormData({ ...formData, featured_image_url: '', featured_image_alt: '' })}
                        className="mt-2 text-red-600 hover:text-red-700 text-sm"
                      >
                        הסר תמונה
                      </button>
                    </div>
                  )}

                  {formData.featured_image_url && (
                    <div>
                      <label className="block text-sm font-medium text-slate-700 mb-1">
                        טקסט חלופי (Alt Text)
                      </label>
                      <input
                        type="text"
                        value={formData.featured_image_alt}
                        onChange={(e) => setFormData({ ...formData, featured_image_alt: e.target.value })}
                        className="w-full px-4 py-2 border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                        placeholder="תיאור קצר של התמונה"
                      />
                    </div>
                  )}
                </div>
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
                            featured_image_url: article.featured_image_url || '',
                            featured_image_alt: article.featured_image_alt || '',
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
