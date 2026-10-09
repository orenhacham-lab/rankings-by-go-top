/**
 * The GO TOP SEO Bridge 3.0.0 that WordPress.org approved (slug go-top-seo-bridge), file by file:
 * the SHA-256 of every file of the zip that was submitted (gotop-seo-bridge-3.0.0-r3.zip). The
 * repo's wordpress-plugin/gotop-seo-bridge must stay byte-for-byte this release (the repo-only
 * README.md aside): a change to the PHP is a new plugin release, reviewed and published on
 * WordPress.org first, and then this list moves with it.
 *
 * Not a suite (no .qa.ts): imported by lib/content/__qa__/wordpress-plugin-publish.qa.ts and
 * lib/content/__qa__/wordpress-schema.qa.ts.
 */
import { createHash } from 'crypto'
import { existsSync, readFileSync } from 'fs'
import { join } from 'path'

export const APPROVED_PLUGIN_VERSION = '3.0.0'

export const APPROVED_PLUGIN_SHA256: Readonly<Record<string, string>> = {
  'gotop-seo-bridge.php': '2017316fe90b3a9f75795315eb3629e19b1479e6bbdd50ac1707e86bc62de9b0',
  'includes/admin.php': '2fa9eb1aab71a2721bb906652da09d9a1023f383666f87eee9703e7a5bfc7c82',
  'includes/auth.php': 'f14b8e66bae2530e75ac73094ffe10f5aa539befb9abd253b84adb7605a47013',
  'includes/content.php': 'a421c0e02aa57cfc4739c506d3d4cd95d1fedae706f26ac2b7ef3fd3ff6f9097',
  'includes/fixes.php': '11e0dc73f61eac17cd27497070581968a998f74860d69f8f200b7eaffc631b09',
  'includes/llms.php': 'eff076e3976c721585363499ed3ea2421412c24e9d8b14e5f1a89f51bf27a2a1',
  'includes/output.php': '6764342e939ea9b24c2802352144d180eeadc5053b41570d459e770644c8d5ab',
  'includes/publish.php': 'd56ba62f2351c2918df50a7223b0e97e1a885eda112b4fdbe33cde2cfd58fb66',
  'readme.txt': '36a1e9df316d736f57d27beb49c03c9b7c89d33ad45c98f4c09497fc41821121',
}

/** The plugin files under `dir` that differ from the approved release (missing ones included). */
export function pluginDrift(dir: string, read: (p: string) => Buffer = (p) => readFileSync(p)): string[] {
  return Object.entries(APPROVED_PLUGIN_SHA256)
    .filter(([rel, sha]) => !existsSync(join(dir, rel)) || createHash('sha256').update(read(join(dir, rel))).digest('hex') !== sha)
    .map(([rel]) => rel)
}
