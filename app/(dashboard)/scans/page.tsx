import { redirect } from 'next/navigation'
import { scanHistoryHref } from '@/lib/scans/history-href'

/**
 * The Scans tab is gone (UX review, decision 5): its history is a section of
 * Keywords and of Reports. This route stays only to send old links there, on the
 * server, before anything renders.
 */
export default async function ScansRedirect({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>
}) {
  const { projectId } = await searchParams
  redirect(scanHistoryHref(projectId))
}
