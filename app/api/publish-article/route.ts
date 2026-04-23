import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

export async function POST(request: NextRequest) {
  try {
    // Verify this is an internal request with proper authorization
    const authHeader = request.headers.get('authorization')
    const token = process.env.INTERNAL_API_TOKEN

    if (!token || authHeader !== `Bearer ${token}`) {
      return NextResponse.json(
        { error: 'Unauthorized' },
        { status: 401 }
      )
    }

    const body = await request.json()

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
        content: body.content,
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
