/**
 * One business, one client (wave 9, owner's ask). A customer who signs up gets ONE
 * client that is the business itself (ensureDefaultClient, from the signup data), and
 * every project goes under it. For that account the client layer is noise: the
 * projects list has no "client" column and the new-project form has no client
 * picker (the project goes to the only client). An account with two or more
 * clients (an agency, or the owner's admin account with its many clients) keeps
 * the full client management, and every plan keeps the way to add a client
 * (a quiet link on the projects list; the plan's maxClients still decides, on the
 * server, in the create route). No data changes: this is presentation only.
 *
 * Guarded by lib/clients/__qa__/single-client.qa.ts.
 */
export interface ClientLike { id: string }

/** True when the account has at most one active client: the client layer is hidden. */
export function isSingleClientAccount(clients: readonly ClientLike[] | null | undefined): boolean {
  return Array.isArray(clients) && clients.length <= 1
}

/** The client a new project goes to without asking: the only one, or null (the form then asks). */
export function implicitClientId(clients: readonly ClientLike[] | null | undefined): string | null {
  return Array.isArray(clients) && clients.length === 1 && typeof clients[0]?.id === 'string' && clients[0].id ? clients[0].id : null
}
