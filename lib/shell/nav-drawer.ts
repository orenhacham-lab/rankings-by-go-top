/**
 * Asking the phone's navigation drawer (components/layout/Sidebar.tsx) to open
 * or close from elsewhere in the shell: the guided tour opens it to point at a
 * sidebar entry, which on a phone lives inside the closed drawer, and closes it
 * again when the tour moves on. A window event, so the tour and the sidebar
 * share no state and neither imports the other.
 *
 * `restoreFocus: false` closes the drawer without sending focus back to the menu
 * button: the tour keeps focus in its own bubble.
 */
export const NAV_DRAWER_EVENT = 'rankings:nav-drawer'

export interface NavDrawerRequest { open: boolean; restoreFocus: boolean }

export function requestNavDrawer(open: boolean, { restoreFocus = true }: { restoreFocus?: boolean } = {}): void {
  if (typeof window === 'undefined') return
  window.dispatchEvent(new CustomEvent<NavDrawerRequest>(NAV_DRAWER_EVENT, { detail: { open, restoreFocus } }))
}

/** The drawer is the phone's navigation: the rail itself shows from this width up (Tailwind `md`). */
export const NAV_RAIL_MIN_WIDTH = 768
export function navIsDrawer(): boolean {
  return typeof window !== 'undefined' && window.innerWidth < NAV_RAIL_MIN_WIDTH
}
