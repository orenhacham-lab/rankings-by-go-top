import { createClient } from '@/lib/supabase/server'
import ArticleForm from '@/components/admin/ArticleForm'
import BackLink from '@/components/ui/BackLink'

export default async function NewArticlePage() {
  // The author defaults to the signed-in admin's own name, from their own
  // session's account metadata (where sign-up stores full_name), never to an
  // email address. profiles has no full_name column (id, role, timestamps), so
  // it is not read here: that query only ever failed.
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  const metaName = (user?.user_metadata as { full_name?: unknown } | undefined)?.full_name
  const defaultAuthor = typeof metaName === 'string' ? metaName.trim() : ''

  return (
    <div dir="rtl" className="space-y-8">
      <div>
        <BackLink href="/admin/articles" className="mb-2">כל המאמרים</BackLink>
        <h1 className="text-title font-bold tracking-tight text-ink">מאמר חדש</h1>
      </div>
      <ArticleForm defaultAuthor={defaultAuthor} />
    </div>
  )
}
