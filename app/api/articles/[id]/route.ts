import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import sanitizeHtml from 'sanitize-html'

const ALLOWED_TAGS = ['p', 'h2', 'h3', 'ul', 'ol', 'li', 'strong', 'em', 'a', 'br', 'blockquote', 'hr', 'code']

function sanitize(html: string) {
  return sanitizeHtml(html, {
    allowedTags: ALLOWED_TAGS,
    allowedAttributes: { a: ['href', 'target', 'rel'] },
    transformTags: {
      a: (tagName, attribs) => {
        const href = attribs.href || ''
        if (href.startsWith('javascript:')) return { tagName: 'span', attribs: {} }
        return { tagName, attribs: { ...attribs, target: '_blank', rel: 'noopener noreferrer' } }
      },
    },
  })
}

async function requireAdmin() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return null
  const { data: profile } = await supabase.from('profiles').select('role').eq('id', user.id).maybeSingle()
  if (profile?.role !== 'admin') return null
  return user
}

export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const user = await requireAdmin()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { id } = await params
  const admin = createAdminClient()
  const { data, error } = await admin.from('articles').select('*').eq('id', id).single()
  if (error) return NextResponse.json({ error: error.message }, { status: 404 })
  return NextResponse.json(data)
}

export async function PUT(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const user = await requireAdmin()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { id } = await params
  const body = await req.json()
  const { title, slug, excerpt, content, author, is_published, published_at, featured_image_url, featured_image_alt, meta_title, meta_description } = body

  if (!title || !slug || !content) {
    return NextResponse.json({ error: 'title, slug, content are required' }, { status: 400 })
  }

  const admin = createAdminClient()

  const { data: existing } = await admin.from('articles').select('id').eq('slug', slug).neq('id', id).maybeSingle()
  if (existing) return NextResponse.json({ error: 'Slug already exists' }, { status: 409 })

  const { data, error } = await admin.from('articles').update({
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
  }).eq('id', id).select().single()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json(data)
}

export async function DELETE(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const user = await requireAdmin()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { id } = await params
  const admin = createAdminClient()
  const { error } = await admin.from('articles').delete().eq('id', id)
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ success: true })
}
