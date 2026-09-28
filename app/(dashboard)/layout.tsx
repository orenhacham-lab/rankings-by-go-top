import Sidebar from '@/components/layout/Sidebar'
import WorkspaceSwitcher from '@/components/layout/WorkspaceSwitcher'
import GuideMenu from '@/components/guide/GuideMenu'
import TrialBar from '@/components/layout/TrialBar'
import { loadTrialBar } from '@/lib/billing/trial-bar'
import { DashboardLocaleEffect } from '@/components/DashboardLocaleEffect'
import { DashboardDirectionWrapper } from '@/components/DashboardDirectionWrapper'
import { DashboardLanguageProvider } from '@/lib/i18n/dashboard/useDashboardLanguage'
import { getServerLocale } from '@/lib/i18n/server-locale'
// normalizeLocale comes from the PURE (non-'use client') module: this layout is a server
// component, and calling a function exported by a client module throws at runtime.
import { normalizeLocale } from '@/lib/i18n/dashboard/locale'
import { ActiveProjectProvider } from '@/lib/active-project/ActiveProjectProvider'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { ensureDefaultClient } from '@/lib/clients/ensure-default-client'
import { redirect } from 'next/navigation'
import { Suspense } from 'react'

/**
 * The trial bar's answer, read on the server for the signed-in user only. Its
 * own Suspense boundary, so the two small reads never hold up the screen.
 */
async function TrialBarSlot({ userId }: { userId: string }) {
  let admin: ReturnType<typeof createAdminClient>
  try { admin = createAdminClient() } catch { return null }
  return <TrialBar state={await loadTrialBar(admin, userId)} />
}

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
  try { await ensureDefaultClient(supabase, createAdminClient()) } catch { /* non-blocking */ }

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
  // The SERVER-resolved locale (cookie first, auth metadata as the first-visit
  // seed) — the same value the root layout rendered <html lang/dir> from, so the
  // provider's first client render cannot disagree with the server's.
  const initialLocale = await getServerLocale(user.user_metadata?.locale as string | null | undefined)

  // Area G — the language provider is seeded from the signup-origin locale.
  return (
    <DashboardLanguageProvider initialLocale={initialLocale}>
      {/* Area D — ONE global active-project source of truth for the whole dashboard.
          Wrapped in Suspense because the provider reads the URL via useSearchParams. */}
      <Suspense fallback={null}>
        <ActiveProjectProvider userId={user.id}>
          {/* The shell: the sidebar on the logical START (right in Hebrew, left in
              English — it follows the document's dir), the screen beside it. The
              sidebar sits in the flow and sticks, instead of being fixed over a
              matching margin, so the two can never disagree about its width. */}
          <div className="flex flex-col md:flex-row min-h-screen bg-canvas text-body">
            <DashboardLocaleEffect />
            <Sidebar isAdmin={isAdmin} />
            <main className="flex-1 min-w-0 min-h-screen bg-no-repeat bg-[radial-gradient(64rem_26rem_at_50%_-8rem,rgb(53_83_215/0.07),transparent_70%)]">
              <DashboardDirectionWrapper>
                {/* The top bar. Every screen shows the SAME workspace control, because
                    "which site am I looking at" is a question about the app, not about
                    the screen — it used to be answered by a different widget per page. */}
                <div className="sticky top-0 z-30 flex h-14 items-center gap-3 border-b border-line bg-canvas/85 px-4 backdrop-blur-md backdrop-saturate-150 md:px-8">
                  <WorkspaceSwitcher />
                  <GuideMenu userId={user.id} accountCreatedAt={user.created_at ?? null} />
                </div>
                <Suspense fallback={null}>
                  <TrialBarSlot userId={user.id} />
                </Suspense>
                <div className="mx-auto w-full max-w-[1280px] min-w-0 px-4 py-6 md:px-8 md:py-8">{children}</div>
              </DashboardDirectionWrapper>
            </main>
          </div>
        </ActiveProjectProvider>
      </Suspense>
    </DashboardLanguageProvider>
  )
}
