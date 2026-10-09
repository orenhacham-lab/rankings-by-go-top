import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { sanitizePublicArticleHtml } from '@/lib/content/public-article-html'
import { normalizePublicLocale } from '@/lib/i18n/locales'
import { articlePublishBlockReason } from '@/lib/articles/publish-rules'

/**
 * ONE allow-list for the public blog, the same one the article page renders
 * through (lib/content/public-article-html).
 *
 * The narrower list this replaces — no `img`, no `table`, no `figure` — was not
 * a security boundary, it was a silent editor: saving an existing article
 * through the admin form stripped the tables and images it was published with,
 * and there was no warning. The render-side list is the boundary (no script, no
 * event handlers, http(s)/mailto/tel only) and it is applied here too, so what
 * the editor saves is what the page shows.
 */
const sanitize = sanitizePublicArticleHtml

async function requireAdmin() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return null
  const { data: profile } = await supabase.from('profiles').select('role').eq('id', user.id).maybeSingle()
  if (profile?.role !== 'admin') return null
  return user
}

export async function GET() {
  const user = await requireAdmin()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const admin = createAdminClient()
  const { data, error } = await admin
    .from('articles')
    .select('id, slug, title, is_published, published_at, created_at, author')
    .order('created_at', { ascending: false })

  if (error) return NextResponse.json({ error: 'Request failed' }, { status: 500 })
  return NextResponse.json(data)
}

export async function POST(req: Request) {
  const user = await requireAdmin()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const body = await req.json()
  const { title, slug, excerpt, content, author, is_published, published_at, featured_image_url, featured_image_alt, meta_title, meta_description, locale } = body

  if (!title || !slug || !content) {
    return NextResponse.json({ error: 'title, slug, content are required' }, { status: 400 })
  }

  // A draft may be saved without a cover; a PUBLISHED article may not.
  const blocked = articlePublishBlockReason({ is_published, featured_image_url })
  if (blocked) return NextResponse.json({ error: blocked }, { status: 400 })

  const admin = createAdminClient()

  const { data: existing } = await admin.from('articles').select('id').eq('slug', slug).maybeSingle()
  if (existing) return NextResponse.json({ error: 'Slug already exists' }, { status: 409 })

  const { data, error } = await admin.from('articles').insert({
    title,
    slug,
    excerpt: excerpt || null,
    content: sanitize(content),
    author: author || 'orenhacham@gmail.com',
    is_published: is_published ?? false,
    published_at: published_at || null,
    featured_image_url: featured_image_url || null,
    featured_image_alt: featured_image_alt || null,
    meta_title: meta_title || null,
    meta_description: meta_description || null,
    // An unknown or missing value is Hebrew, which is what every article was
    // before the column existed; the database CHECK refuses anything else.
    locale: normalizePublicLocale(locale) ?? 'he',
  }).select().single()

  if (error) return NextResponse.json({ error: 'Request failed' }, { status: 500 })
  return NextResponse.json(data, { status: 201 })
}
