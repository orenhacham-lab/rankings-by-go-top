import Sidebar from '@/components/layout/Sidebar'
import { DashboardLocaleEffect } from '@/components/DashboardLocaleEffect'
import { DashboardDirectionWrapper } from '@/components/DashboardDirectionWrapper'
import { DashboardLanguageProvider, normalizeLocale } from '@/lib/i18n/dashboard/useDashboardLanguage'
import { ActiveProjectProvider } from '@/lib/active-project/ActiveProjectProvider'
import { createClient } from '@/lib/supabase/server'
import { ensureDefaultClient } from '@/lib/clients/ensure-default-client'
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

  // Area C — catch-all: existing users who never had a client (and users who arrive via
  // a path that didn't run the signup/callback hooks, e.g. Google OAuth) get their default
  // client here on first dashboard load. Idempotent + quota-aware + best-effort (a cheap
  // head-count no-ops once any client exists; a failure never blocks the dashboard).
  try { await ensureDefaultClient(supabase) } catch { /* non-blocking */ }

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

  // Area G — the language provider is seeded from the signup-origin locale.
  return (
    <DashboardLanguageProvider initialLocale={initialLocale}>
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
