import { Metadata } from 'next'
import { createClient } from '@/lib/supabase/server'

export async function generateMetadata(
  { params }: { params: Promise<{ slug: string }> }
): Promise<Metadata> {
  const { slug } = await params
  const supabase = await createClient()

  const { data: article } = await supabase
    .from('articles')
    .select('title, meta_description, excerpt, featured_image_url, featured_image_alt, author, published_at')
    .eq('slug', slug)
    .eq('is_published', true)
    .single()

  if (!article) {
    return {
      title: 'מאמר לא נמצא | Rankings by Go Top',
      description: 'המאמר המבוקש אינו קיים או הוסר',
    }
  }

  const description = article.meta_description || article.excerpt || `מאמר בנושא ${article.title} מאת Rankings by Go Top`
  const url = `https://www.gotopseo.com/articles/${slug}`

  return {
    title: `${article.title} | Rankings by Go Top`,
    description,
    openGraph: {
      title: article.title,
      description,
      url,
      type: 'article',
      ...(article.featured_image_url && {
        images: [
          {
            url: article.featured_image_url,
            alt: article.featured_image_alt || article.title,
          },
        ],
      }),
      ...(article.published_at && {
        publishedTime: article.published_at,
      }),
      ...(article.author && {
        authors: [article.author],
      }),
    },
    twitter: {
      card: 'summary_large_image',
      title: article.title,
      description,
      ...(article.featured_image_url && {
        images: [article.featured_image_url],
      }),
    },
    alternates: {
      canonical: url,
    },
  }
}

export default function ArticleLayout({ children }: { children: React.ReactNode }) {
  return children
}
