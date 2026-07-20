# GO TOP SEO Bridge (companion WordPress plugin)

WordPress core's REST API silently drops **protected** SEO meta (Yoast `_yoast_wpseo_*`,
Rank Math `rank_math_*`) from `POST /wp-json/wp/v2/posts/:id { meta }` unless the site
registered those keys in REST. That is why publishing could return HTTP 200 while the Yoast
meta description / focus keyword stayed empty (`written_not_verifiable`).

This tiny companion plugin exposes ONE authenticated endpoint the GO TOP app calls **only when
core REST could not persist the SEO meta**:

```
POST /wp-json/gotop/v1/seo-meta
Authorization: <the same WordPress app-password used for publishing>
Body: { "post_id": 123, "plugin": "yoast", "meta": { "_yoast_wpseo_metadesc": "…", … } }
```

Guarantees:

- **Auth:** `permission_callback` requires the user to be able to edit the target post
  (`current_user_can('edit_post', post_id)`), i.e. `edit_posts`.
- **Allowlist only:** it writes ONLY the exact Yoast / Rank Math SEO keys. Any other meta key
  is ignored — it can never write arbitrary post meta.
- **Verifiable:** it returns the read-back applied values so the app verifies exact normalized
  values per field (only then does the app report `verified`).
- **No secrets:** it exposes no credentials, options, or unrelated data.

## Install

Copy the `gotop-seo-bridge` folder into `wp-content/plugins/` on the connected site and
activate it (or upload the zip via **Plugins → Add New → Upload**). The app **capability-detects**
the `gotop/v1` REST namespace automatically; until it is installed, the app surfaces the typed
state `seo_bridge_required` with this setup instruction — it never claims the SEO data was saved.
