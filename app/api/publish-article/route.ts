import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { createHash, timingSafeEqual } from 'crypto'
import { sanitizePublicArticleHtml } from '@/lib/content/public-article-html'
import { articlePublishBlockReason } from '@/lib/articles/publish-rules'

function constantTimeEquals(a: string, b: string): boolean {
  const ha = createHash('sha256').update(a).digest()
  const hb = createHash('sha256').update(b).digest()
  return timingSafeEqual(ha, hb)
}

export async function POST(request: NextRequest) {
  try {
    // Verify this is an internal request with proper authorization
    const authHeader = request.headers.get('authorization') ?? ''
    const token = process.env.INTERNAL_API_TOKEN

    if (!token || !constantTimeEquals(authHeader, `Bearer ${token}`)) {
      return NextResponse.json(
        { error: 'Unauthorized' },
        { status: 401 }
      )
    }

    const body = await request.json()

    // The same rule the admin API enforces: nothing reaches the blog published
    // without a cover image. This endpoint defaults is_published to true, so
    // without the check a caller that omits the image publishes a bare post.
    const blocked = articlePublishBlockReason({
      is_published: body.is_published !== false,
      featured_image_url: body.featured_image_url,
    })
    if (blocked) return NextResponse.json({ error: blocked }, { status: 400 })

    // Initialize Supabase admin client
    const supabase = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!
    )

    // Insert the article
    const { data, error } = await supabase
      .from('articles')
      .insert([{
        title: body.title,
        slug: body.slug,
        excerpt: body.excerpt || null,
        // Rendered as HTML on the public site — never stored as received.
        content: sanitizePublicArticleHtml(body.content),
        meta_description: body.meta_description || null,
        featured_image_url: body.featured_image_url || null,
        featured_image_alt: body.featured_image_alt || null,
        author: body.author || null,
        is_published: body.is_published !== false,
        published_at: new Date().toISOString(),
        created_at: new Date().toISOString(),
      }])

    if (error) {
      console.error('Article insertion error:', error)
      return NextResponse.json(
        { error: 'Failed to publish article' },
        { status: 500 }
      )
    }

    return NextResponse.json(
      { success: true, article: data },
      { status: 201 }
    )
  } catch (error) {
    console.error('Article publishing error:', error)
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    )
  }
}
