/**
 * THE SAME TRUST BADGE, FOR A VISITOR WHOSE LAW DOES NOT REQUIRE PRIOR
 * CONSENT FOR IT.
 *
 * The other branch of the one territorial decision taken on the server in
 * lib/consent/eprivacy-territory.ts, exactly as MarketplacePixelUnconditional
 * is for the beacon. It takes no decision of its own: a component that asked
 * "am I allowed?" would be a second gate to keep in step with the first.
 *
 * WHY THE SCRIPT IS IN THE SERVER RESPONSE HERE. The gated sibling appends
 * the element after hydration, which is right for a tag that must wait for a
 * grant and wrong for one that must be visible to whoever loads the page. A
 * compliance reviewer reads the page, and the checklist item is that the
 * badge IS on the sales page; a tag inserted after hydration is absent from
 * view source and from anything that fetches the page without running it.
 * JVZoo rejected four products on precisely that reading of their pixel.
 *
 * `async` rather than `defer` or blocking: the badge is decoration and a
 * reseller statement, not something the rest of the page waits on.
 */
export function MarketplaceBadgeUnconditional({ src }: { src: string }) {
  return <script src={src} async data-ds24-badge="1" />
}
