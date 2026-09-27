/**
 * /projects/[id]/summary lives in a route group of its own so that "not found"
 * is decided HERE, above the dashboard shell: the shell wraps its pages in a
 * Suspense boundary, and a notFound() below that boundary is streamed inside a
 * 200 response. Thrown from this layout, before anything is sent, it answers a
 * real 404: a project that is not theirs, or the seeding scan off for them.
 * Otherwise the page renders inside the same dashboard shell as every other
 * screen (app/(dashboard)/layout.tsx, used as it is).
 *
 * The decision (lib/onboarding/surfaces.ts decideSummaryGate) reads the same
 * request-cached summary the page renders, so the project is read once.
 */
import type { ReactNode } from 'react'
import { notFound } from 'next/navigation'
import DashboardLayout from '@/app/(dashboard)/layout'
import { loadSummaryGate } from '@/lib/onboarding/server'

export default async function ProjectSummaryLayout({
  children,
  params,
}: {
  children: ReactNode
  params: Promise<{ id: string }>
}) {
  const { id } = await params
  if ((await loadSummaryGate(id)) === 'not_found') notFound()
  return <DashboardLayout>{children}</DashboardLayout>
}
