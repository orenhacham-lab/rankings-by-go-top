'use client'

/**
 * Project settings — everything that is true about ONE workspace.
 *
 * These lived on a project page that also carried the project's data: its stats,
 * its AI visibility, its keywords, its content. So "change the WordPress
 * connection" and "look at last week's positions" were the same screen, and the
 * sidebar needed a Projects tab to reach it. The data went to the screens that own
 * it; what stays here is the setup: who the business is, and what it is connected to.
 *
 * Scoped to the workspace the top bar names — there is no project picker on this
 * page, because the app has exactly one.
 *
 * Every section is its own card with its own save (components/settings). The
 * fields the site scan fills carry a "from the scan" chip until the owner edits
 * them, which makes them the owner's for good; "detect again with AI" only ever
 * suggests; and "scan the site again" leads the screen. All of that exists only
 * when the seed scan is on for the owner and its tables can be read
 * (settingsVisibility): otherwise the screen is the business card, the
 * sections whose tables can be read, and the connections, as before.
 */
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { Plug } from 'lucide-react'
import Header from '@/components/layout/Header'
import WorkspaceGate from '@/components/layout/WorkspaceGate'
import ContentSection from '@/components/content/ContentSection'
import GscPanel from '@/components/content/GscPanel'
import AudienceCard from '@/components/settings/AudienceCard'
import BusinessCard from '@/components/settings/BusinessCard'
import CompetitorsCard from '@/components/settings/CompetitorsCard'
import ArticleStyleCard from '@/components/settings/ArticleStyleCard'
import WritingGuidanceCard from '@/components/settings/WritingGuidanceCard'
import OfficialProfilesCard from '@/components/settings/OfficialProfilesCard'
import { useArticleSettings } from '@/components/settings/useArticleSettings'
import type { RedetectChain } from '@/components/settings/useRedetect'
import type { RedetectSection } from '@/lib/project-settings/types'
import DangerZone from '@/components/settings/DangerZone'
import Notice from '@/components/settings/Notice'
import ProfileCard from '@/components/settings/ProfileCard'
import WeeklyEmailCard from '@/components/reports/monthly/WeeklyEmailCard'
import ReminderEmailsCard from '@/components/reminders/ReminderEmailsCard'
import ScanBand from '@/components/settings/ScanBand'
import SiteAutoFixCard from '@/components/settings/SiteAutoFixCard'
import SettingsIndex from '@/components/settings/SettingsIndex'
import SettingsSkeleton from '@/components/settings/SettingsSkeleton'
import { Skeleton } from '@/components/ui/Skeleton'
import { LINKED_SECTIONS, SECTION, scrollToSection } from '@/components/settings/anchors'
import { useClock } from '@/components/settings/useDraft'
import { useProjectSettings } from '@/components/settings/useProjectSettings'
import { useSiteScan } from '@/components/settings/useSiteScan'
import { useDashboardLanguage } from '@/lib/i18n/dashboard/useDashboardLanguage'
import { getDashboardDictionary } from '@/lib/i18n/dashboard/getDashboardDictionary'
import { createClient } from '@/lib/supabase/client'
import { withDeadline } from '@/lib/active-project/useProjectRow'
import { useActiveProject } from '@/lib/active-project/ActiveProjectProvider'
import { PROJECT_CONNECTION_ANCHOR, SETTINGS_GSC_ANCHOR } from '@/lib/content/content-hub-setup'
import { fill, platformHint, settingsVisibility } from '@/lib/project-settings/view'
import { gscStatusUrl, readGscResponse } from '@/components/gsc/gsc-data'
import { useGscEnabled } from '@/components/gsc/GscFeature'
import { readKnown } from '@/lib/connection-status/useKnownRead'
import { projectConnectionUrls } from '@/lib/connection-status/project-connections'
import type { Project, Client } from '@/lib/supabase/types'

/** How long the settings skeleton waits for the connection reads beyond the settings' own. */
const CONNECTIONS_WAIT_MS = 3000

export default function ProjectSettingsPage() {
  const { uiLocale } = useDashboardLanguage()
  const t = getDashboardDictionary(uiLocale).projectSettings

  return (
    <div>
      <Header title={t.title} subtitle={t.subtitle} />
      <WorkspaceGate>
        {(project, reload) => <ProjectSettings key={project.id} project={project} reload={reload} />}
      </WorkspaceGate>
    </div>
  )
}

function ProjectSettings({ project, reload }: { project: Project; reload: () => void }) {
  const { language, uiLocale } = useDashboardLanguage()
  const dict = getDashboardDictionary(uiLocale)
  const t = dict.projectSettings
  const [redetectChain, setRedetectChain] = useState<{ step: number; n: number } | null>(null)
  const [clients, setClients] = useState<Client[]>([])
  const [competitorsShown, setCompetitorsShown] = useState(true)
  const [autoFixShown, setAutoFixShown] = useState(false)
  // A rename shows in the top bar's switcher too, so a save reloads its list.
  const { reloadProjects } = useActiveProject()

  // The profile, the audiences and the scan's state. The screen renders once they
  // answered (or failed), so the cards appear in place instead of one by one.
  const settings = useProjectSettings(project.id)
  // The article design and the official profiles: one row per project, their own load.
  const article = useArticleSettings(project.id)
  const data = settings.state.status === 'ready' ? settings.state.data : null
  const settingsReady = settings.state.status !== 'loading'

  // The connections section's reads start with the screen, beside the settings
  // themselves: by the time the cards render, their answers are usually in hand and
  // they draw their final state at once (lib/connection-status), instead of a
  // skeleton, or worse, "not connected", while each asks on its own afterwards.
  // The screen's skeleton waits for them too (up to CONNECTIONS_WAIT_MS), so the
  // connections section opens in its final size instead of growing under the reader.
  const gscEnabled = useGscEnabled()
  const [connectionsRead, setConnectionsRead] = useState(false)
  useEffect(() => {
    const urls = projectConnectionUrls(project.id)
    let done = false
    const finish = () => { if (!done) { done = true; setConnectionsRead(true) } }
    void Promise.allSettled([
      readKnown(urls.wordpress), readKnown(urls.shopify), readKnown(urls.site),
      gscEnabled !== false ? readGscResponse(gscStatusUrl(project.id)) : null,
    ]).then(finish)
    const cap = window.setTimeout(finish, CONNECTIONS_WAIT_MS)
    return () => window.clearTimeout(cap)
  }, [project.id, gscEnabled])

  const ready = settingsReady && connectionsRead
  const visibility = settingsVisibility(data)
  const now = useClock()

  // A finished scan may have filled the business fields (the project row) and
  // the switcher's name, as well as the profile and the audiences.
  const reloadSettings = settings.reload
  const onScanFinished = useCallback(async () => {
    reload()
    reloadProjects()
    await reloadSettings()
  }, [reload, reloadProjects, reloadSettings])
  const scan = useSiteScan({
    projectId: project.id,
    enabled: visibility.seedFeatures,
    rescan: data?.rescan ?? null,
    locale: language,
    onFinished: onScanFinished,
  })
  const startScan = scan.start
  const scanFromCard = useCallback(() => {
    scrollToSection(SECTION.scan)
    void startScan()
  }, [startScan])

  // Links from elsewhere open a section of this screen (#platform, #search-console,
  // and the onboarding summary's #business, #audiences, #competitors).
  // The sections exist only once the project and its settings have loaded, after
  // the browser's own jump to the anchor, so the jump happens here. The panels
  // then finish loading and grow, which moves the section, so the jump follows the
  // screen's size until it settles or the user scrolls, whichever comes first.
  const rootRef = useRef<HTMLDivElement>(null)
  useEffect(() => {
    if (!ready) return
    const id = window.location.hash.slice(1)
    const root = rootRef.current
    if (!root || (id !== PROJECT_CONNECTION_ANCHOR && id !== SETTINGS_GSC_ANCHOR && !LINKED_SECTIONS.includes(id))) return
    const jump = () => document.getElementById(id)?.scrollIntoView({ block: 'start' })
    const follow = new ResizeObserver(jump)
    const userEvents = ['wheel', 'touchstart', 'pointerdown', 'keydown'] as const
    const stop = () => {
      follow.disconnect()
      for (const e of userEvents) window.removeEventListener(e, stop)
    }
    follow.observe(root)
    for (const e of userEvents) window.addEventListener(e, stop, { passive: true })
    const settle = window.setTimeout(stop, 3000)
    return () => { window.clearTimeout(settle); stop() }
  }, [ready])

  // The form's client list. RLS scopes the read to the signed-in owner.
  useEffect(() => {
    let cancelled = false
    void withDeadline(createClient().from('clients').select('*').order('name'))
      .then((res) => { if (!cancelled) setClients((res?.data ?? []) as Client[]) })
    return () => { cancelled = true }
  }, [])

  const rescan = visibility.seedFeatures ? data?.rescan ?? null : null
  const neverScanned = rescan?.latest === null
  const profile = data?.profile.state === 'ok' ? data.profile.value : null
  const audiences = data?.audiences.state === 'ok' ? data.audiences.value : []
  // The article-design preview is about this business, not a stock example (review P2-4).
  const niche = profile?.niche ?? null
  const previewSubject = useMemo(() => ({ niche, business: project.business_name ?? project.name ?? null }), [niche, project.business_name, project.name])
  const detected = visibility.seedFeatures ? platformHint(profile?.detected_platform) : null
  const platform = detected && {
    label: fill(detected.connect ? t.platformDetected : t.platformDetectedOther, { platform: detected.name }),
    preferred: detected.connect,
  }
  // One "detect again with AI" for the business group (business, description, niche and audiences):
  // the cards run one after another, the first card carries the only button (review P2-6).
  const chainOrder: RedetectSection[] = ['business', ...(visibility.profileCard ? ['profile' as const] : []), ...(visibility.audienceCard ? ['audience' as const] : [])]
  const chainFor = (section: RedetectSection): RedetectChain => ({
    turn: redetectChain && chainOrder[redetectChain.step] === section ? redetectChain.n + redetectChain.step : 0,
    done: (stop) => setRedetectChain((c) => {
      if (!c || chainOrder[c.step] !== section) return c
      const next = c.step + 1
      return stop || next >= chainOrder.length ? null : { ...c, step: next }
    }),
    lead: section === 'business'
      ? { working: !!redetectChain, start: () => setRedetectChain((c) => c ?? { step: 0, n: Date.now() }) }
      : null,
  })
  const cardProps = {
    projectId: project.id,
    seedFeatures: visibility.seedFeatures,
    scanBusy: scan.busy,
    neverScanned,
    onRescan: scanFromCard,
    onData: settings.setData,
    t,
    locale: language,
  }

  const index: { id: string; label: string }[] = []
  if (rescan) index.push({ id: SECTION.scan, label: t.scan.title })
  index.push({ id: SECTION.business, label: t.businessTitle })
  if (visibility.profileCard) index.push({ id: SECTION.profile, label: t.profile.title })
  if (visibility.audienceCard) index.push({ id: SECTION.audience, label: t.audience.title })
  if (competitorsShown) index.push({ id: SECTION.competitors, label: t.competitors.title })
  index.push({ id: SECTION.writingGuidance, label: t.writingGuidance.navLabel })
  if (article.state.status !== 'loading') {
    index.push({ id: SECTION.articleDesign, label: t.articleStyle.title }, { id: SECTION.officialProfiles, label: t.officialProfiles.navLabel })
  }
  index.push({ id: SECTION.connections, label: t.connectionsTitle })
  // The card hides itself while its table is not installed; the index follows it.
  if (autoFixShown) index.push({ id: SECTION.siteAutoFix, label: dict.siteHealth.autofix.auto.title })
  index.push({ id: SECTION.danger, label: t.danger.title })

  return (
    <div ref={rootRef}>
      {!ready ? (
        <SettingsSkeleton label={dict.common.loading} />
      ) : (
        <div className="grid gap-8 xl:grid-cols-[minmax(0,1fr)_13rem] xl:gap-10">
          <div className="min-w-0 space-y-6">
            {settings.state.status === 'failed' && (
              <Notice tone="bad" action={{ label: t.retry, onClick: () => void settings.reload() }}>
                {t.loadFailed}
              </Notice>
            )}

            {rescan && (
              <ScanBand rescan={rescan} scan={scan} domain={project.target_domain} now={now} t={t} locale={language} />
            )}

            <BusinessCard
              {...cardProps}
              chain={visibility.seedFeatures ? chainFor('business') : undefined}
              project={project}
              clients={clients}
              data={data}
              onSaved={() => { reload(); reloadProjects() }}
            />

            {visibility.profileCard && <ProfileCard {...cardProps} profile={profile} chain={visibility.seedFeatures ? chainFor('profile') : undefined} />}
            {visibility.audienceCard && <AudienceCard {...cardProps} profile={profile} audiences={audiences} chain={visibility.seedFeatures ? chainFor('audience') : undefined} />}

            <CompetitorsCard
              projectId={project.id}
              projectDomain={project.target_domain}
              scanCompetitors={data?.scanCompetitors ?? []}
              seedFeatures={visibility.seedFeatures}
              onScanLink={() => scrollToSection(SECTION.scan)}
              onScan={rescan ? scanFromCard : undefined}
              scanBusy={scan.busy}
              onAvailability={setCompetitorsShown}
              t={t}
            />

            <WritingGuidanceCard projectId={project.id} t={t} />

            {article.state.status === 'ready' ? (
              <>
                <ArticleStyleCard
                  projectId={project.id}
                  view={article.state.data}
                  signals={article.signals}
                  onReadSite={() => void article.readSignals()}
                  onData={article.setData}
                  t={t}
                  locale={language}
                  subject={previewSubject}
                />
                <OfficialProfilesCard
                  projectId={project.id}
                  view={article.state.data}
                  signals={article.signals}
                  onReadSite={() => void article.readSignals()}
                  onData={article.setData}
                  t={t}
                />
              </>
            ) : article.state.status === 'failed' ? (
              <Notice tone="bad" action={{ label: t.articleStyle.retry, onClick: () => void article.reload() }}>
                {t.articleStyle.loadFailed}
              </Notice>
            ) : (
              // Still on its way (it may wait behind the page's other reads): its place, not a blank.
              <div aria-busy="true" data-article-style="loading" className="rounded-card border border-line bg-surface p-5">
                <span className="sr-only">{dict.common.loading}</span>
                <Skeleton className="h-5 w-40" />
                <Skeleton className="mt-3 h-4 w-full max-w-lg" />
                <Skeleton className="mt-5 h-24 w-full" />
              </div>
            )}

            <section id={SECTION.connections} aria-labelledby={`${SECTION.connections}-title`} className="scroll-mt-20 space-y-4">
              <div className="flex items-start gap-3 pt-2">
                <span aria-hidden className="grid h-9 w-9 shrink-0 place-items-center rounded-control bg-action-soft text-action">
                  <Plug size={18} />
                </span>
                <div className="min-w-0">
                  <h2 id={`${SECTION.connections}-title`} className="text-section font-semibold text-ink">{t.connectionsTitle}</h2>
                  <p className="mt-0.5 text-copy text-muted">{t.connectionsBody}</p>
                </div>
              </div>

              {/* The publishing platform: WordPress or Shopify, one at a time. It owns
                  its own connect/disconnect flow; this page only gives it a home, and
                  the platform the scan read off the site as a hint. */}
              <div id={PROJECT_CONNECTION_ANCHOR} className="scroll-mt-20">
                <ContentSection projectId={project.id} platformHint={platform} />
              </div>

              {/* Search Console: optional evidence, the same panel the content screens link to. */}
              <div id={SETTINGS_GSC_ANCHOR} className="scroll-mt-20">
                <GscPanel projectId={project.id} />
              </div>

              {/* Only what the merchant can act on. Google Ads (Go Top's own key for
                  search volumes, not a project connection) and "Google Analytics 4
                  is not available yet" were cards that led nowhere; they are gone. */}
            </section>

            {/* Automatic site-health fixes: off by default, WordPress with the Go Top plugin only. */}
            <SiteAutoFixCard projectId={project.id} onShown={setAutoFixShown} />

            {/* Monthly report: the weekly-email switch (off by default; nothing sends yet). */}
            <WeeklyEmailCard projectId={project.id} language={uiLocale} />
            <ReminderEmailsCard projectId={project.id} uiLocale={uiLocale} />

            <DangerZone project={project} deleteLabels={dict.projects.deleteDialog} t={t} />
          </div>

          <aside className="hidden xl:block">
            <div className="sticky top-20">
              <SettingsIndex items={index} title={t.onThisPage} />
            </div>
          </aside>
        </div>
      )}
    </div>
  )
}
