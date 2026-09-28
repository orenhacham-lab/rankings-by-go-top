import { createClient } from '@/lib/supabase/server'
import ArticleForm from '@/components/admin/ArticleForm'
import BackLink from '@/components/ui/BackLink'

export default async function NewArticlePage() {
  // The author defaults to the signed-in admin's own name (their profile, read
  // through their own session), never to an email address.
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  const { data: profile } = user
    ? await supabase.from('profiles').select('full_name').eq('id', user.id).maybeSingle()
    : { data: null }
  const metaName = (user?.user_metadata as { full_name?: unknown } | undefined)?.full_name
  const defaultAuthor = (profile?.full_name as string | null | undefined)?.trim() || (typeof metaName === 'string' ? metaName.trim() : '')

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
