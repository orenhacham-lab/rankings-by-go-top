/**
 * THE SPELLING OF THE SEEDING-SCAN READ PATH, in a module with no 'use client'.
 *
 * The shared reader (lib/client/seed-read.ts) is a client module, so every
 * export of it is a client reference and a server component cannot call one.
 * The dashboard layout builds this answer itself and hands it to the screen
 * keyed by the URL the reader would have fetched, so both sides must spell it
 * the same way: a seed stored under another spelling is an answer nobody reads.
 */
export function seedRunUrl(projectId: string): string {
  return `/api/projects/${encodeURIComponent(projectId)}/seed`
}
