import Sidebar from '@/components/layout/Sidebar'
import { DashboardLocaleEffect } from '@/components/DashboardLocaleEffect'
import { DashboardDirectionWrapper } from '@/components/DashboardDirectionWrapper'
import { DashboardLanguageProvider, normalizeLocale } from '@/lib/i18n/dashboard/useDashboardLanguage'
import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'

export default async function DashboardLayout({
  children,
}: {
  children: React.ReactNode
}) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()

  if (!user) {
    redirect('/login')
  }

  // Fetch profile to determine admin status
  const { data: profile } = await supabase
    .from('profiles')
    .select('role')
    .eq('id', user.id)
    .maybeSingle()

  const isAdmin = profile?.role === 'admin'

  // Area G — seed the dashboard language from the signup-origin locale saved in auth
  // metadata, so a fresh device's first login (empty localStorage) opens in the
  // signup language. The switcher / a prior stored choice still overrides client-side.
  const initialLocale = normalizeLocale(user.user_metadata?.locale)

  return (
    <DashboardLanguageProvider initialLocale={initialLocale}>
      <div className="flex flex-col md:flex-row h-full min-h-screen dark:bg-slate-950">
        <DashboardLocaleEffect />
        <Sidebar isAdmin={isAdmin} />
        <main className="flex-1 md:mr-64 p-4 md:p-8 overflow-auto min-h-screen dark:bg-slate-950 dark:text-slate-50">
          <DashboardDirectionWrapper>{children}</DashboardDirectionWrapper>
        </main>
      </div>
    </DashboardLanguageProvider>
  )
}
