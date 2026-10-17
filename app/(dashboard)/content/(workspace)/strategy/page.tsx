/**
 * /content/strategy — the content strategy tab: what will be written, when, and why.
 *
 * It replaced two screens, "topics" (/content/topics) and "automation"
 * (/content/automation), whose addresses now redirect into its list view (see
 * app/content/topics and app/content/automation).
 *
 * Server component: the single authoritative Stage-D flag (RECO_PRO_FIRST_CONTROLLER,
 * via isProFirstControllerEnabled) is resolved here and passed down, exactly as the
 * automation screen's page did, so the UI and the route can never disagree on it.
 */

import ContentStrategyScreen from '@/components/content-strategy/ContentStrategyScreen'
import { isProFirstControllerEnabled } from '@/lib/content/api-auth'

export default function ContentStrategyPage() {
  return <ContentStrategyScreen proFirst={isProFirstControllerEnabled()} />
}
