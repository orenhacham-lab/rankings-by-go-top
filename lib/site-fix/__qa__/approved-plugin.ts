/**
 * The GO TOP SEO Bridge release the repo ships, file by file: the SHA-256 of every file of the zip
 * (scripts/build-wordpress-plugin.mjs). The repo's wordpress-plugin/gotop-seo-bridge must stay
 * byte-for-byte this list (the repo-only README.md aside): a change to the PHP is a new plugin
 * release, and this list moves with it on purpose.
 *
 * 3.1.0 is the release candidate in this folder, NOT yet approved on WordPress.org: WordPress.org
 * serves 3.0.0 (APPROVED_WPORG_VERSION) until the 3.1.0 zip is submitted and approved. The app gates
 * every 3.1 feature by the site's plugin version (lib/site-fix/plugin-capabilities.ts), so a site on
 * 3.0.0 keeps exactly its 3.0.0 behaviour meanwhile.
 *
 * Not a suite (no .qa.ts): imported by lib/content/__qa__/wordpress-plugin-publish.qa.ts and
 * lib/content/__qa__/wordpress-schema.qa.ts.
 */
import { createHash } from 'crypto'
import { existsSync, readFileSync } from 'fs'
import { join } from 'path'

/** The release on WordPress.org today (slug go-top-seo-bridge). */
export const APPROVED_WPORG_VERSION = '3.0.0'
/** The release in this folder (pinned below). */
export const APPROVED_PLUGIN_VERSION = '3.1.0'

export const APPROVED_PLUGIN_SHA256: Readonly<Record<string, string>> = {
  'gotop-seo-bridge.php': 'e03973fab72d23db163072efffc77da5d487569eeff4fa4117e59e8f69ee66e9',
  'includes/admin.php': 'ed33a187494ff16b9a4b9f328e7211b2a4da21a36338698b1859ce55d2d36bf4',
  'includes/auth.php': 'd3ed0d413a684d4f1a319636044acd4c0f8faca31981332fb0e76d5bea896873',
  'includes/content.php': '86caf96c0c5e6d4ed84fd40ec0e734dc459fe96e136bcc6faf45371c2e0845d1',
  'includes/fixes.php': 'dea97103756548e2640c39748637e2f80f51b39932047239dc3aad267813eb67',
  'includes/llms.php': 'bfb5ef0145a13f36c8c28c112661deed493c6c8e3979c0e6f9e0d49fecc4732d',
  'includes/output.php': '5b666fe08913ec321c139e165d12fd1eab198ac3838b9fd14195c714c44d41f9',
  'includes/publish.php': '982c394fa3e669de7cae6a2bfe731aed976d16ef0f1c6c9c85a0b3efbaad03de',
  'includes/read.php': 'dead168a3ebcc214645d1778022ba3d9d1502caf18ed20ea72a4ed058fce5fa0',
  'includes/routes.php': 'd990b59fdff6b005adb16c75cd76da61739ca83d282fc0e4c2fa674b9befe4e2',
  'readme.txt': '91c6e8f081312f4bae63f413903a817b9818a107e102383a10156ba557fd4566',
  'uninstall.php': 'f938ecab70d2dbab268a2350bc7940db67f9054d0e3e497164b8cd2081e6cee1',
}

/** The plugin files under `dir` that differ from the approved release (missing ones included). */
export function pluginDrift(dir: string, read: (p: string) => Buffer = (p) => readFileSync(p)): string[] {
  return Object.entries(APPROVED_PLUGIN_SHA256)
    .filter(([rel, sha]) => !existsSync(join(dir, rel)) || createHash('sha256').update(read(join(dir, rel))).digest('hex') !== sha)
    .map(([rel]) => rel)
}
