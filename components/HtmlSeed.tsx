/**
 * Renders one server-built answer into the page as a script (lib/client/html-seed.ts).
 *
 * A server component, deliberately: it must be part of the HTML the browser
 * parses, not a client component whose render React can schedule after the
 * screen's own effects have already fetched.
 */
import { seedScript } from '@/lib/client/html-seed'

export default function HtmlSeed({ url, status, body }: { url: string; status: number; body: unknown }) {
  return (
    <script
      // This visitor's own answer, built for them a moment ago in the same
      // request. It is never cached and never shared.
      dangerouslySetInnerHTML={{ __html: seedScript(url, status, body) }}
    />
  )
}
