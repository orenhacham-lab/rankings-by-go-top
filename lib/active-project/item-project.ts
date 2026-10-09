/**
 * A screen about ONE item that belongs to one project (an article, a keyword's
 * history, a scan's details) against the GLOBAL active project.
 *
 * The owner reported, again, that switching projects leaves a page showing the
 * previous one. Area D fixed the per-project SCREENS: ProjectScoped and
 * WorkspaceGate discard a screen's state when the active project changes. An
 * item screen cannot be fixed that way, because its data is keyed by the item in
 * the url, not by the active project: switching the workspace only rewrote the
 * canonical ?projectId on the same url (ActiveProjectProvider.syncUrl), so the
 * header and the url named the new project while the screen kept showing an
 * item of the old one — and the panels around it, which take the project from
 * the item's own row, kept working on the old project too.
 *
 * Two different events have to be told apart, which is the whole reason this is
 * a pure decision rather than an inline comparison:
 *  - OPENING an item whose project is not the active one (a deep link, a link
 *    from an email, the back button). The item is what the owner asked for, so
 *    the workspace ADOPTS its project; nothing navigates.
 *  - SWITCHING the workspace while an item screen is open. The owner asked for
 *    another project, so the screen LEAVES for that project's list.
 *
 * `hasAdopted` is what distinguishes them: the first decision after the item's
 * project is known is the opening, every later one is a switch.
 */

export type ItemProjectDecision =
  /** Not enough is known yet (the list is still resolving, or the item has no project). */
  | { action: 'wait' }
  /** Make the item's project the active one: the url asked for this item. */
  | { action: 'adopt'; projectId: string }
  /** The workspace moved on: go to this screen's list for the active project. */
  | { action: 'leave'; projectId: string }
  /** The item belongs to the active project; nothing to do. */
  | { action: 'stay' }

export function decideItemProject(input: {
  /** The project the item itself belongs to, once its row has loaded. */
  itemProjectId: string | null | undefined
  /** The global active project, once resolved. */
  activeProjectId: string | null | undefined
  /** Whether the active project has been resolved at all (never guess from null). */
  isResolved: boolean
  /** Whether the item's project is one of the user's own active projects. */
  itemProjectKnown: boolean
  /** Whether the opening decision has already been taken for this item. */
  hasAdopted: boolean
}): ItemProjectDecision {
  const { itemProjectId, activeProjectId, isResolved, itemProjectKnown, hasAdopted } = input
  if (!isResolved || !itemProjectId) return { action: 'wait' }
  if (itemProjectId === activeProjectId) return { action: 'stay' }
  // An item whose project is not in the user's own list is never adopted and
  // never navigated away from: the screen's own loader decides what to show.
  if (!itemProjectKnown) return { action: 'stay' }
  if (!hasAdopted) return { action: 'adopt', projectId: itemProjectId }
  // A switch with no project to switch to (the last project was deleted) has
  // nowhere to send the screen.
  if (!activeProjectId) return { action: 'stay' }
  return { action: 'leave', projectId: activeProjectId }
}
