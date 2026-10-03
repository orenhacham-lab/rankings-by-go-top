/**
 * One definition of "a link" for the network screen: a placement that is in an article, live or
 * waiting to go live. A link removed before publishing, or no longer in the article, is history,
 * not a link. The server's totals (lib/link-network/http.ts), the log's tab counts and the log's
 * list all use this, so the numbers and the list never disagree. Client-safe (no server imports).
 */
export type CountedState = 'waiting' | 'published' | 'rejected' | 'removed'

export const countsAsLink = (state: CountedState): boolean => state === 'published' || state === 'waiting'

export const linkCount = (items: readonly { state: CountedState }[]): number => items.filter((i) => countsAsLink(i.state)).length
