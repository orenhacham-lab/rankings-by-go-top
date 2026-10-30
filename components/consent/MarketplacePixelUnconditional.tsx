/**
 * THE SAME MARKETPLACE BEACON, FOR A VISITOR WHOSE LAW DOES NOT REQUIRE
 * PRIOR CONSENT FOR IT.
 *
 * Its sibling, MarketplacePixel, is the gated one and is the default: it is a
 * client component that renders nothing until the marketing category has been
 * granted, and removes itself on withdrawal. This file is the other branch of
 * one territorial decision, taken on the server in lib/consent/
 * eprivacy-territory.ts, and nothing else: the tag, the alt text and the
 * dimensions are identical, and neither file decides WHO gets which.
 *
 * WHY IT IS A SERVER COMPONENT AND NOT A PROP ON THE GATED ONE. The gated
 * component deliberately renders nothing on the first paint, because consent
 * lives in localStorage and reading it during render would hydrate
 * differently for a visitor who had already decided. That is right for the
 * gated case and wrong for this one: the beacon has to be IN the document
 * that comes off the server. JVZoo's compliance reviewer reads the page, and
 * the whole of their remaining note is that the pixel is not there; a tag
 * inserted after hydration is absent from the response, absent from view
 * source, and absent from anything that fetches the page without running it.
 *
 * It takes no decision of its own on purpose. A component that could ask
 * "am I allowed?" would be a second gate to keep in step with the first, and
 * the one this project needs is the territorial check its caller already
 * made.
 */
export function MarketplacePixelUnconditional({ src, alt }: { src: string; alt: string }) {
  return (
    // A 1x1 third-party beacon, not an image to optimise: next/image would
    // proxy it through our own optimiser, which would make the request from
    // our server instead of the visitor's browser and record the wrong visit.
    // eslint-disable-next-line @next/next/no-img-element
    <img src={src} alt={alt} width={1} height={1} aria-hidden="true" referrerPolicy="no-referrer-when-downgrade" />
  )
}
