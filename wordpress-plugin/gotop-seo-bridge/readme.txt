=== GO TOP SEO Bridge ===
Contributors: gotop
Tags: seo, schema, meta description, alt text, internal links
Requires at least: 5.6
Tested up to: 6.8
Requires PHP: 7.0
Stable tag: 2.1.0
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
* An extra main heading (H1) in the page's own content turned into a subheading (H2), words unchanged
  (never on a page-builder page, never a heading of the theme)
* An llms.txt for AI assistants, answered at /llms.txt only while the site has no llms.txt file

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

== Upgrade Notice ==

= 2.1.0 =
Adds two fixes you approve in GO TOP: extra main headings turned into subheadings, and llms.txt.
Upload the new zip over the old one ("Replace current with uploaded"); the connection is kept.

== Changelog ==

= 2.1.0 =
* New fix h1_demote: an extra <h1> in a post's own content becomes <h2> (its words and attributes
  unchanged; page-builder pages are refused). Stored before the write and undoable, like the others.
* New fix llms_txt: the approved text is kept in the plugin's own option and answered at /llms.txt,
  only while the site has no llms.txt file. Undoable.
* /inspect also reports the content's own main headings and whether a page builder renders the page.
* Everything from 2.0.0 is unchanged.

= 2.0.0 =
* Signed fix endpoints: status, inspect, search, fix, undo. Pairing with a one-time code.
* The nine approved fix types, each with a stored previous value and undo.
* Settings > GO TOP SEO: connection code, status, disconnect, recent fixes.
* The 1.x /gotop/v1/seo-meta endpoint is unchanged.

= 1.0.0 =
* Authenticated endpoint that writes Yoast / Rank Math SEO fields for the app.
