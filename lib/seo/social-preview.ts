/**
 * The image every public page offers to a link preview.
 *
 * Why this file exists: a page that declares its own `openGraph` object does
 * NOT inherit the root layout's `images`, so on 12.11.2026 every public page
 * except the home page was serving no `og:image` at all. A directory tried to
 * fetch a preview of our free AI-crawler checker — the one asset that earns us
 * do-follow links — and got `null`. Everywhere our pages are shared (WhatsApp,
 * LinkedIn, Slack, X, Facebook) they showed a bare link and nothing else.
 *
 * The URL is absolute on purpose. This project sets no `metadataBase`, and a
 * relative path without one resolves against a base Next.js chooses rather than
 * our own origin, so an absolute URL is the only form that is correct here
 * regardless of where the page is built or served.
 */
export const SOCIAL_PREVIEW_IMAGE = 'https://www.gotopseo.com/gotop-primary.png'
