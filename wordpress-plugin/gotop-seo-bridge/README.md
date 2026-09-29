# GO TOP SEO Bridge 2.0 (companion WordPress plugin)

Two jobs, both authenticated, both narrow:

1. **1.x, unchanged:** `POST /wp-json/gotop/v1/seo-meta` writes allowlisted Yoast / Rank Math
   keys when WordPress core REST silently drops protected SEO meta while publishing an article.
   Auth: the WordPress application password of a user who can edit the post.
2. **2.0, site-health fixes:** applies ONE fix the merchant approved in the GO TOP app, per
   request, and can undo it.

## 2.0 routes (namespace `gotop/v1`)

| Route | Auth | What it does |
|---|---|---|
| `POST /pair` | signed-in administrator (`manage_options`, via application password) | stores the site key from a pairing code |
| `POST /status` | signed (HMAC) | version, SEO plugin, the nine fix types |
| `POST /inspect` | signed | one post/page: content hash, SEO fields |
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

The app serves the same zip to signed-in users at `/api/site-health/plugin-zip` (built into
`lib/site-fix/plugin-zip.generated.ts`; `--check` fails when it is stale). Install through
**Plugins → Add New → Upload Plugin**, then pair.
