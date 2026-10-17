import { redirect } from 'next/navigation'
import { scanHistoryHref } from '@/lib/scans/history-href'

/**
 * /scans/<id> never had a page of its own; with the Scans tab gone it leads to
 * the check history like /scans does. A run's details stay at /scans/<id>/details.
 */
export default async function ScanRedirect({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>
}) {
  const { projectId } = await searchParams
  redirect(scanHistoryHref(projectId))
}
