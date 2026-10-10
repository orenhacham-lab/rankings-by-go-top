# GO TOP SEO Bridge 3.1 (companion WordPress plugin)

**3.0.0 is the release approved on WordPress.org** (slug `go-top-seo-bridge`,
https://wordpress.org/plugins/go-top-seo-bridge/). **3.1.0 is in this folder and is not yet
submitted**; `lib/site-fix/__qa__/approved-plugin.ts` pins every file's SHA-256 of the build in
`lib/site-fix/plugin-zip.generated.ts`. WordPress.org installs it into the folder
`go-top-seo-bridge/`; our older zips used `gotop-seo-bridge/`. Up to 3.0.0 both copies active was
a PHP redeclare fatal. From 3.1.0 every function is in the `GoTopSeoBridge` namespace and the copy
starts on `plugins_loaded` only if no other copy defined `GOTOP_SEO_BRIDGE_VERSION`; otherwise it
stays off and shows an admin notice (suite N23). Deleting an OLD copy still runs that copy's own
uninstall, which deletes the shared options (the pairing key): connect again afterwards. 3.1.0's
`uninstall.php` keeps the options while another copy is installed.

Four jobs, all authenticated, all narrow:

1. **1.x, unchanged:** `POST /wp-json/gotop/v1/seo-meta` writes allowlisted Yoast / Rank Math
   keys when WordPress core REST silently drops protected SEO meta while publishing an article.
   Auth: the WordPress application password of a user who can edit the post.
2. **2.0, site-health fixes:** applies ONE fix the merchant approved in the GO TOP app, per
   request, and can undo it.
3. **3.0, publishing** (`includes/publish.php`, signed like 2.0): `POST /terms` (categories or
   tags), `POST /media` (one image, from GO TOP's public storage only, once per address),
   `POST /publish` (one article: a new post, or an update of the post made for the same article
   id, `_gotop_article_id`; any other post is `not_ours`). The app publishes through these when
   the link is connected and reports >= 3.0.0 (`lib/content/wordpress-plugin-publish.ts`),
   otherwise over the application password as before.
4. **3.1, everything else without an application password** (`includes/read.php`, signed):
   `POST /content` (a page of published posts or pages: id, type, address, slug, title, dates,
   focus keyphrase), `POST /content-item` (one published item's displayed HTML), `POST /authors`
   (users who may publish posts: id and display name), `POST /media-alt` (find a Media Library
   image by file name, read it, set or undo its alt text). `/publish` gains `status: future` +
   `date_gmt`, `new_post`, `author_id` (must be able to `publish_posts`) and `adopt` (take over
   the untied post the app recorded for this article; never a page or another article's post).
   `/terms` adds each term's `link` and `count`, and `product_cat` when WooCommerce has it.
   `/status` answers `capabilities`; the app gates on them (`lib/site-fix/plugin-capabilities.ts`).

## 2.0 routes (namespace `gotop/v1`)

| Route | Auth | What it does |
|---|---|---|
| `POST /pair` | signed-in administrator (`manage_options`, via application password) | stores the site key from a pairing code |
| `POST /status` | signed (HMAC) | version, SEO plugin, the fix types (nine in 2.0.0, eleven since 2.1.0) |
| `POST /inspect` | signed | one post/page: content hash, SEO fields (2.1.0: the content's own H1 words, page-builder flag) |
| `POST /search` | signed | up to 5 posts/pages containing a phrase (internal-link fix) |
| `POST /fix` | signed | applies one approved fix |
| `POST /undo` | signed | restores the value stored before that fix |

The same pairing can be done by hand: **Settings → GO TOP SEO**, paste the code, **Connect**.

### Signing

Headers `X-GoTop-Key`, `X-GoTop-Timestamp`, `X-GoTop-Nonce` (32 hex), `X-GoTop-Signature: v1=<hex>`,
where the signature is HMAC-SHA256 with the site's secret over

```
GOTOP-HMAC-V1\nPOST\n/gotop/v1/<route>\n<timestamp>\n<nonce>\n<key id>\n<sha256(body)>
```

Checked with `hash_equals`; a timestamp more than 5 minutes off is refused; a nonce is stored
(10 minutes) only after the signature verified, so a replay is refused and a forgery cannot burn
a real nonce. The app side is `lib/site-fix/plugin-auth.ts`; the QA suite
`lib/site-fix/__qa__/site-fix-plugin.qa.ts` runs this PHP against the app's signer.

### What a fix can change (the whole list)

`seo_title`, `meta_description`, `canonical`, `focus_keyphrase` (Yoast / Rank Math keys, or the
plugin's own `_gotop_*` meta printed in `<head>` when there is no SEO plugin), `schema_jsonld`
(printed as escaped JSON-LD; no Product/Offer/Review types), `image_alt` (only images without an
alt), `faq_block` (appended at the end of the content), `broken_link` (point a dead same-site
link elsewhere, or unlink it keeping its words), `internal_link` (wrap words already in the text).

Posts and pages only. Before every write the previous value is stored in post meta
`_gotop_fix_<job id>`; undo refuses when the element changed since (an FAQ block is removed
exactly). It never deletes content, touches prices, products, the theme, plugins, settings or
users, and never publishes or unpublishes anything (only `ID` and `post_content` go to
`wp_update_post`).

## Build and install

```
node scripts/build-wordpress-plugin.mjs --out gotop-seo-bridge.zip
```

The app still serves the same zip to signed-in users at `/api/site-health/plugin-zip` (built into
`lib/site-fix/plugin-zip.generated.ts`; `--check` fails when it is stale), but no screen links it
any more: merchants install from WordPress.org (**Plugins → Add New**, search "GO TOP SEO
Bridge"), then pair. The zip stays as a fallback support can hand to a host that blocks
installs from WordPress.org.
