/**
 * GET /api/setup/logs
 *
 * Returns recent scan errors and failed scans.
 * Requires auth (inside the dashboard) — but gracefully handles
 * the case where Supabase isn't configured yet.
 */

import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'

export async function GET(request: Request) {
  const url = new URL(request.url)
  const limit = Math.min(parseInt(url.searchParams.get('limit') || '50', 10), 200)

  // Check if Supabase is configured at all
  if (
    !process.env.NEXT_PUBLIC_SUPABASE_URL ||
    process.env.NEXT_PUBLIC_SUPABASE_URL.includes('your_')
  ) {
    return Response.json({ logs: [], error: 'Supabase לא מוגדר' })
  }

  try {
    // Use admin client for logs (bypasses RLS)
    const admin = createAdminClient()

    // 1. Recent failed scans
    const { data: failedScans } = await admin
      .from('scans')
      .select('id, status, triggered_by, failed_targets, total_targets, created_at, projects(name)')
      .in('status', ['failed'])
      .order('created_at', { ascending: false })
      .limit(20)

    // 2. Scan results with error messages
    const { data: errorResults } = await admin
      .from('scan_results')
      .select('id, keyword, engine_type, error_message, checked_at, tracking_targets(project_id, projects(name))')
      .not('error_message', 'is', null)
      .order('checked_at', { ascending: false })
      .limit(limit)

    // Normalise into a flat log list
    const logs: Array<{
      id: string
      type: 'scan_failed' | 'result_error'
      level: 'error' | 'warning' | 'info'
      message: string
      detail: string
      timestamp: string
      project: string
    }> = []

    for (const scan of failedScans || []) {
      const project = (scan.projects as unknown as { name: string } | null)?.name || 'פרויקט לא ידוע'
      logs.push({
        id: scan.id,
        type: 'scan_failed',
        level: 'error',
        message: `סריקה נכשלה — ${project}`,
        detail: `${scan.failed_targets} מתוך ${scan.total_targets} יעדים נכשלו. הופעל: ${scan.triggered_by === 'scheduled' ? 'אוטומטית' : 'ידנית'}`,
        timestamp: scan.created_at,
        project,
      })
    }

    for (const result of errorResults || []) {
      const target = result.tracking_targets as { projects?: { name: string } } | null
      const project = target?.projects?.name || 'פרויקט לא ידוע'
      logs.push({
        id: result.id,
        type: 'result_error',
        level: 'warning',
        message: `שגיאת סריקה — "${result.keyword}"`,
        detail: result.error_message || 'שגיאה לא ידועה',
        timestamp: result.checked_at,
        project,
      })
    }

    // Sort by timestamp desc
    logs.sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime())

    return Response.json({ logs: logs.slice(0, limit) })
  } catch (err) {
    return Response.json({ logs: [], error: (err as Error).message }, { status: 500 })
  }
}
