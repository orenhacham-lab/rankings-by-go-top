/**
 * A project's research screen: the progress of its first scan, then the
 * research summary, reachable again at this one address whatever started the
 * run (the new-project screen, a claimed free check, a Shopify install).
 *
 * Only the project's owner sees it, and only with the seeding scan on;
 * anyone else, or the scan off, gets "not found". The latest run is read here,
 * through the owner's own client, so the first paint is already the right
 * state (lib/onboarding/surfaces.ts).
 */
import { notFound } from 'next/navigation'
import SeedNotice from '@/components/onboarding/SeedNotice'
import SeedRunScreen from '@/components/onboarding/SeedRunScreen'
import { readHandedOffNotice } from '@/lib/onboarding/handoff'
import { summaryHref } from '@/lib/onboarding/links'
import { loadSummarySurface } from '@/lib/onboarding/server'
import { SurfaceUnavailableError, type SummarySurface } from '@/lib/onboarding/surfaces'

export const dynamic = 'force-dynamic'

export default async function ProjectSummaryPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>
  searchParams: Promise<Record<string, string | string[] | undefined>>
}) {
  const { id } = await params
  let surface: SummarySurface | null
  try {
    surface = await loadSummarySurface(id)
  } catch (err) {
    if (!(err instanceof SurfaceUnavailableError)) throw err
    // The project could not be read at all: an outage, said as one, with a refresh.
    return (
      <section className="w-full max-w-[640px] pt-2 md:pt-10" data-seed-screen="error">
        <SeedNotice notice={{ key: 'failed', action: 'refresh' }} projectId={null} returnPath={summaryHref(id)} />
      </section>
    )
  }
  if (!surface) notFound()
  return <SeedRunScreen key={surface.projectId} {...surface} initialNotice={readHandedOffNotice(await searchParams)} />
}
