/**
 * The GO TOP SEO Bridge release the repo ships, file by file: the SHA-256 of every file of the zip
 * (scripts/build-wordpress-plugin.mjs). The repo's wordpress-plugin/gotop-seo-bridge must stay
 * byte-for-byte this list (the repo-only README.md aside): a change to the PHP is a new plugin
 * release, and this list moves with it on purpose.
 *
 * 3.1.1 is live on WordPress.org (Oren uploaded it and confirmed the listing, 13 Oct 2026), so
 * APPROVED_WPORG_VERSION and APPROVED_PLUGIN_VERSION are both 3.1.1: it carries the corrected English
 * company name in the plugin header and the readme. The app gates every 3.1 feature by `>=` the site's
 * plugin version (lib/site-fix/plugin-capabilities.ts), so a site still on 3.1.0 is unaffected and is
 * offered the update (PLUGIN_LATEST_VERSION in ../types.ts, which never runs ahead of this constant).
 *
 * Not a suite (no .qa.ts): imported by lib/content/__qa__/wordpress-plugin-publish.qa.ts and
 * lib/content/__qa__/wordpress-schema.qa.ts.
 */
import { createHash } from 'crypto'
import { existsSync, readFileSync } from 'fs'
import { join } from 'path'

/** The release on WordPress.org today (slug go-top-seo-bridge). */
export const APPROVED_WPORG_VERSION = '3.1.1'
/** The release in this folder (pinned below). */
export const APPROVED_PLUGIN_VERSION = '3.1.1'

export const APPROVED_PLUGIN_SHA256: Readonly<Record<string, string>> = {
  'gotop-seo-bridge.php': 'b50f5ad87318db86755e4084b3ae249087be26fb7f700f7a2f83e5548e1a2a9b',
  'includes/admin.php': 'c329269dee8ed6deee6011e9fff6ff39fd034c7e37603dc755f17de109506560',
  'includes/auth.php': 'd3ed0d413a684d4f1a319636044acd4c0f8faca31981332fb0e76d5bea896873',
  'includes/content.php': '86caf96c0c5e6d4ed84fd40ec0e734dc459fe96e136bcc6faf45371c2e0845d1',
  'includes/fixes.php': 'dea97103756548e2640c39748637e2f80f51b39932047239dc3aad267813eb67',
  'includes/llms.php': 'bfb5ef0145a13f36c8c28c112661deed493c6c8e3979c0e6f9e0d49fecc4732d',
  'includes/output.php': '5b666fe08913ec321c139e165d12fd1eab198ac3838b9fd14195c714c44d41f9',
  'includes/publish.php': '982c394fa3e669de7cae6a2bfe731aed976d16ef0f1c6c9c85a0b3efbaad03de',
  'includes/read.php': 'dead168a3ebcc214645d1778022ba3d9d1502caf18ed20ea72a4ed058fce5fa0',
  'includes/routes.php': 'd990b59fdff6b005adb16c75cd76da61739ca83d282fc0e4c2fa674b9befe4e2',
  'readme.txt': '693c8526e403a7c89d241d935e1361c24654aba29713a657b39bcdad2e3d75fb',
  'uninstall.php': 'f938ecab70d2dbab268a2350bc7940db67f9054d0e3e497164b8cd2081e6cee1',
}

/** The plugin files under `dir` that differ from the approved release (missing ones included). */
export function pluginDrift(dir: string, read: (p: string) => Buffer = (p) => readFileSync(p)): string[] {
  return Object.entries(APPROVED_PLUGIN_SHA256)
    .filter(([rel, sha]) => !existsSync(join(dir, rel)) || createHash('sha256').update(read(join(dir, rel))).digest('hex') !== sha)
    .map(([rel]) => rel)
}
