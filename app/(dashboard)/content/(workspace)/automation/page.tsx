/**
 * /content/automation — automatic article ideas and the publishing queue.
 *
 * Server component: the SINGLE authoritative Stage-D flag (RECO_PRO_FIRST_CONTROLLER,
 * via isProFirstControllerEnabled) is resolved server-side and passed down as a prop,
 * so the UI and the route can never disagree on whether Pro-first is active.
 *
 * The screen itself is hidden from the nav unless NEXT_PUBLIC_ENABLE_CONTENT_AUTOMATION
 * is on; the route says the same thing rather than rendering a half-working screen.
 */

import AutomationScreen from '@/components/content/workspace/AutomationScreen'
import { isProFirstControllerEnabled } from '@/lib/content/api-auth'

export default function ContentAutomationPage() {
  if (process.env.NEXT_PUBLIC_ENABLE_CONTENT_AUTOMATION !== 'true') {
    return (
      <div className="py-20 text-center text-slate-400 dark:text-slate-500 text-sm">
        Not available.
      </div>
    )
  }

  const proFirst = isProFirstControllerEnabled()

  return <AutomationScreen proFirst={proFirst} />
}
