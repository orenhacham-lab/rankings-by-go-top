/**
 * The GO TOP SEO Bridge release the repo ships, file by file: the SHA-256 of every file of the zip
 * (scripts/build-wordpress-plugin.mjs). The repo's wordpress-plugin/gotop-seo-bridge must stay
 * byte-for-byte this list (the repo-only README.md aside): a change to the PHP is a new plugin
 * release, and this list moves with it on purpose.
 *
 * 3.2.0 is the release in this folder (27 Oct 2026): /media also accepts an address GO TOP signed
 * on its own storage, which is how the author photo the owner uploaded reaches a site connected by
 * the plugin alone (its bucket is private, so it has no public address), and a signed address is
 * imported once rather than once per signature. Its capability is reported as `author_photo`.
 * 3.1.3 is the release live on WordPress.org: Oren committed that tag on 20 Oct 2026 and
 * api.wordpress.org answers 3.1.3 for the slug. That release changed only the name, the tags and
 * the description the directory shows; its PHP is 3.1.2's. The two
 * constants may differ only while the folder is ahead of the directory, and
 * APPROVED_WPORG_VERSION moves only once the tag is really there — it is what merchants are
 * offered as an update. The app gates every 3.1 feature by `>=` the site's
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
export const APPROVED_WPORG_VERSION = '3.1.3'
/** The release in this folder (pinned below). */
export const APPROVED_PLUGIN_VERSION = '3.2.0'

export const APPROVED_PLUGIN_SHA256: Readonly<Record<string, string>> = {
  'gotop-seo-bridge.php': '04fde9d93bbb824fb06c8a6387fb3e8ade28fe9b39148c82aacfb99f17f6c1b7',
  'includes/admin.php': 'c329269dee8ed6deee6011e9fff6ff39fd034c7e37603dc755f17de109506560',
  'includes/auth.php': 'd3ed0d413a684d4f1a319636044acd4c0f8faca31981332fb0e76d5bea896873',
  'includes/content.php': '86caf96c0c5e6d4ed84fd40ec0e734dc459fe96e136bcc6faf45371c2e0845d1',
  'includes/fixes.php': 'dea97103756548e2640c39748637e2f80f51b39932047239dc3aad267813eb67',
  'includes/llms.php': 'bfb5ef0145a13f36c8c28c112661deed493c6c8e3979c0e6f9e0d49fecc4732d',
  'includes/output.php': '5b666fe08913ec321c139e165d12fd1eab198ac3838b9fd14195c714c44d41f9',
  'includes/publish.php': '671bb0cf93a91f6a2abf05fb5789f30448b7b62481e4ba4ed992bc77cd8639cd',
  'includes/read.php': '8d13be08d47369d2bd4715971d034c1d335568918cb8a807c5c2da3f79a8faae',
  'includes/routes.php': 'd990b59fdff6b005adb16c75cd76da61739ca83d282fc0e4c2fa674b9befe4e2',
  'readme.txt': 'efdac9fb57dc427ff35785002631175cba10e47f034320c75dcbdc52d59219ba',
  'uninstall.php': 'f938ecab70d2dbab268a2350bc7940db67f9054d0e3e497164b8cd2081e6cee1',
}

/** The plugin files under `dir` that differ from the approved release (missing ones included). */
export function pluginDrift(dir: string, read: (p: string) => Buffer = (p) => readFileSync(p)): string[] {
  return Object.entries(APPROVED_PLUGIN_SHA256)
    .filter(([rel, sha]) => !existsSync(join(dir, rel)) || createHash('sha256').update(read(join(dir, rel))).digest('hex') !== sha)
    .map(([rel]) => rel)
}
