/**
 * GET /api/site-health/plugin-zip — the GO TOP SEO Bridge plugin, as the zip WordPress's
 * "Upload plugin" takes. Signed-in users only (proxy.ts does not cover /api/*, so this checks).
 * The bytes come from lib/site-fix/plugin-zip.generated.ts, which scripts/build-wordpress-plugin.mjs
 * builds from wordpress-plugin/gotop-seo-bridge; a QA guard keeps the two in step.
 */
import { createClient } from '@/lib/supabase/server'
import { PLUGIN_VERSION, PLUGIN_ZIP_BASE64, PLUGIN_ZIP_SHA256 } from '@/lib/site-fix/plugin-zip.generated'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

export async function GET() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return Response.json({ ok: false, code: 'unauthorized' }, { status: 401, headers: { 'cache-control': 'no-store' } })
  const bytes = Buffer.from(PLUGIN_ZIP_BASE64, 'base64')
  return new Response(new Uint8Array(bytes), {
    status: 200,
    headers: {
      'content-type': 'application/zip',
      'content-disposition': `attachment; filename="gotop-seo-bridge-${PLUGIN_VERSION}.zip"`,
      'content-length': String(bytes.length),
      'x-content-sha256': PLUGIN_ZIP_SHA256,
      'cache-control': 'private, no-store',
      'x-content-type-options': 'nosniff',
    },
  })
}
