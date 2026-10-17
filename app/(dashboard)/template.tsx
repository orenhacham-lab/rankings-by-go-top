/**
 * Mounted afresh on every navigation between dashboard tabs (a template, unlike
 * the layout, is not kept), so the tab's content enters once: its blocks rise 8px
 * and fade in over 180ms, 30ms apart for the first four (.tab-enter in
 * globals.css). CSS only, nothing with reduced motion, never per table row, and
 * the sidebar and the top bar, which live in the layout, stay still.
 */
export default function DashboardTemplate({ children }: { children: React.ReactNode }) {
  return <div className="tab-enter">{children}</div>
}
