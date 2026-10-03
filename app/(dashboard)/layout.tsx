import Sidebar from '@/components/layout/Sidebar'
import SkipLink from '@/components/layout/SkipLink'
import DocumentTitle from '@/components/layout/DocumentTitle'
import { MAIN_CONTENT_ID } from '@/components/layout/main-content'
import WorkspaceSwitcher from '@/components/layout/WorkspaceSwitcher'
import GuideMenu from '@/components/guide/GuideMenu'
import ContactMenu from '@/components/guide/ContactMenu'
import TopBarActions from '@/components/layout/TopBarActions'
import TrialBar from '@/components/layout/TrialBar'
import { TRIAL_BAR_HIDE_COOKIE, trialBarDismissed } from '@/lib/billing/trial-bar-dismissal'
import { loadTrialBar } from '@/lib/billing/trial-bar'
import { DashboardLocaleEffect } from '@/components/DashboardLocaleEffect'
import { DashboardDirectionWrapper } from '@/components/DashboardDirectionWrapper'
import { DashboardLanguageProvider } from '@/lib/i18n/dashboard/useDashboardLanguage'
import { getServerPublicLocale } from '@/lib/i18n/server-locale'
import { ActiveProjectProvider } from '@/lib/active-project/ActiveProjectProvider'
import { GscFeatureProvider } from '@/components/gsc/GscFeature'
import { isGscReadOnlyEnabled } from '@/lib/gsc/config'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { ensureDefaultClient } from '@/lib/clients/ensure-default-client'
import { redirect } from 'next/navigation'
import { cookies } from 'next/headers'
import { Suspense } from 'react'
import type { Metadata } from 'next'

/**
 * Nothing behind the sign-in is for search engines: no index, no follow, no
 * cached copy. An extra layer on top of the auth wall, so the links an owner
 * imports (site-links) are never crawled from here. Guarded by
 * lib/site-links/gsc-import/__qa__/gsc-import.qa.ts (section K).
 */
export const metadata: Metadata = {
  robots: { index: false, follow: false, nocache: true, googleBot: { index: false, follow: false } },
}

/**
 * The trial bar's answer, read on the server for the signed-in user only. Its
 * own Suspense boundary, so the two small reads never hold up the screen.
 */
async function TrialBarSlot({ userId }: { userId: string }) {
  let admin: ReturnType<typeof createAdminClient>
  try { admin = createAdminClient() } catch { return null }
  // The viewer's own "hide for a day", read here so a dismissed bar is never painted (w7 P1-1).
  const dismissed = trialBarDismissed((await cookies()).get(TRIAL_BAR_HIDE_COOKIE)?.value)
  return <TrialBar state={await loadTrialBar(admin, userId)} dismissed={dismissed} />
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
  // getServerPublicLocale, not getServerLocale: the dashboard's WORDS can be
  // Spanish, so the value the provider starts from has to be able to say so.
  // normalizeDashboardUiLocale inside the provider still refuses 'es' while the
  // Spanish build is off, so this cannot open a half-translated dashboard.
  const initialLocale = await getServerPublicLocale(user.user_metadata?.locale as string | null | undefined)

  // Area G — the language provider is seeded from the signup-origin locale.
  return (
    <DashboardLanguageProvider initialLocale={initialLocale}>
      {/* The server's own Search Console flag, so a screen with it off asks nothing
          (components/gsc/GscFeature.tsx) instead of learning it from a 404. */}
      <GscFeatureProvider enabled={isGscReadOnlyEnabled()}>
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
            <DocumentTitle />
            <SkipLink />
            <Sidebar isAdmin={isAdmin} />
            <main className="flex-1 min-w-0 min-h-screen bg-no-repeat bg-[radial-gradient(64rem_26rem_at_50%_-8rem,rgb(0_112_214/0.06),transparent_70%)]">
              <DashboardDirectionWrapper>
                {/* The top bar. Every screen shows the SAME workspace control, because
                    "which site am I looking at" is a question about the app, not about
                    the screen — it used to be answered by a different widget per page.
                    On a phone it is the only bar: the menu button (the sidebar's) sits
                    at its start, hence the wider start padding there. Beside the switcher,
                    "Contact us" (WhatsApp, phone, email; customers only, as the rail's
                    support row), then the Guide; at the end, settings and notifications. */}
                <div className="sticky top-0 z-30 flex h-14 items-center gap-2 sm:gap-3 border-b border-line bg-canvas/85 pe-4 ps-16 backdrop-blur-md backdrop-saturate-150 md:px-8">
                  <WorkspaceSwitcher />
                  {!isAdmin && <ContactMenu />}
                  <GuideMenu userId={user.id} accountCreatedAt={user.created_at ?? null} />
                  {/* At the bar's end: the project's settings and the notifications bell (wave 9). */}
                  <TopBarActions />
                </div>
                <Suspense fallback={null}>
                  <TrialBarSlot userId={user.id} />
                </Suspense>
                <div id={MAIN_CONTENT_ID} tabIndex={-1} className="mx-auto w-full max-w-[1280px] min-w-0 px-4 py-6 focus:outline-none md:px-8 md:py-8">{children}</div>
              </DashboardDirectionWrapper>
            </main>
          </div>
        </ActiveProjectProvider>
      </Suspense>
      </GscFeatureProvider>
    </DashboardLanguageProvider>
  )
}
