=== GO TOP SEO Bridge ===
Contributors: gotop
Tags: seo, schema, meta description, alt text, internal links
Requires at least: 5.6
Tested up to: 6.8
Requires PHP: 7.0
Stable tag: 2.0.0
License: GPLv2 or later

Applies the SEO fixes you approve in GO TOP, one at a time, and keeps the previous value of each so it can be undone.

== Description ==

GO TOP finds SEO problems on your site (Site health). When you approve a fix in the app, this plugin
writes exactly that one element:

* SEO title and meta description (in Yoast or Rank Math when one is active, otherwise printed by this plugin)
* Canonical address
* Focus keyphrase
* Image alt text (only for images in the page content that have none)
* An FAQ block at the end of a page
* JSON-LD schema (Organization, WebSite, WebPage, Article, FAQPage and similar; never Product)
* A broken link inside existing content (new address, or the link removed and its words kept)
* An internal link on words that are already in the text

It never deletes content, never changes prices or products, the theme, plugins, settings or users,
and never publishes or unpublishes a page. Only posts and pages are written.

Every request from GO TOP is signed with a key only your site and your GO TOP project share
(HMAC-SHA256, single-use nonce, five-minute window). The previous value is stored before every
write; "Undo" in GO TOP restores it, and WordPress keeps a revision of every content change.

== Installation ==

1. In GO TOP open Site health and choose "Install the plugin". Download the zip.
2. In WordPress: Plugins > Add New > Upload Plugin, choose the zip, Install Now, then Activate.
3. Connect: if your site is already connected to GO TOP with an application password, press
   "Connect automatically" in GO TOP. Otherwise copy the connection code from GO TOP and paste it in
   Settings > GO TOP SEO on your site.

== Changelog ==

= 2.0.0 =
* Signed fix endpoints: status, inspect, search, fix, undo. Pairing with a one-time code.
* The nine approved fix types, each with a stored previous value and undo.
* Settings > GO TOP SEO: connection code, status, disconnect, recent fixes.
* The 1.x /gotop/v1/seo-meta endpoint is unchanged.

= 1.0.0 =
* Authenticated endpoint that writes Yoast / Rank Math SEO fields for the app.
