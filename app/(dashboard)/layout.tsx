import Sidebar from '@/components/layout/Sidebar'
import { DashboardLocaleEffect } from '@/components/DashboardLocaleEffect'
import { DashboardDirectionWrapper } from '@/components/DashboardDirectionWrapper'
import { DashboardLanguageProvider } from '@/lib/i18n/dashboard/useDashboardLanguage'
import { ActiveProjectProvider } from '@/lib/active-project/ActiveProjectProvider'
import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import { Suspense } from 'react'

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

  return (
    <DashboardLanguageProvider>
      {/* Area D — ONE global active-project source of truth for the whole dashboard.
          Wrapped in Suspense because the provider reads the URL via useSearchParams. */}
      <Suspense fallback={null}>
        <ActiveProjectProvider userId={user.id}>
          <div className="flex flex-col md:flex-row h-full min-h-screen dark:bg-slate-950">
            <DashboardLocaleEffect />
            <Sidebar isAdmin={isAdmin} />
            <main className="flex-1 md:mr-64 p-4 md:p-8 overflow-auto min-h-screen dark:bg-slate-950 dark:text-slate-50">
              <DashboardDirectionWrapper>{children}</DashboardDirectionWrapper>
            </main>
          </div>
        </ActiveProjectProvider>
      </Suspense>
    </DashboardLanguageProvider>
  )
}
