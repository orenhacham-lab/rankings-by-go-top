'use client'

/**
 * The in-app twin of the public site's floating "free demo" button (w11).
 *
 * Oren asked for the same offer inside the product, so a customer who is stuck
 * halfway through setup can ask for a walkthrough from the screen they are on
 * rather than hunting for a contact menu. It reuses components/public/DemoFloat
 * so the two can never drift in shape or motion, and it reuses the dashboard
 * ContactMenu's habit of naming the active project's site in the message, so the
 * conversation starts with the domain already on the table.
 *
 * It does NOT replace anything: the top-bar contact pill and the rail's support
 * row stay where they are. The dashboard has no other floating element, so this
 * owns the end corner at z-[59] on every size. Admins never see it, exactly as
 * they never see the contact pill or the rail's support row.
 */
import { DemoFloat } from '@/components/public/DemoFloat'
import { whatsappHelpUrl } from '@/components/public/contact'
import { useActiveProject } from '@/lib/active-project/ActiveProjectProvider'
import { getDashboardDictionary } from '@/lib/i18n/dashboard/getDashboardDictionary'
import { useDashboardLanguage } from '@/lib/i18n/dashboard/useDashboardLanguage'

export default function DemoFloatApp() {
  const { uiLocale } = useDashboardLanguage()
  const t = getDashboardDictionary(uiLocale).contact
  const { activeProjectId, projects } = useActiveProject()
  const domain = projects.find((p) => p.id === activeProjectId)?.target_domain?.trim() ?? ''

  return (
    <DemoFloat
      href={whatsappHelpUrl(t.demoMessage(domain))}
      label={t.demo}
      ariaLabel={t.demoAria}
      tone="app"
    />
  )
}
