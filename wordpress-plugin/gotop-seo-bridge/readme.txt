=== GO TOP SEO Bridge ===
Contributors: gotopil
Tags: seo, schema, publishing, content, ai
Requires at least: 6.0
Tested up to: 7.1
Requires PHP: 7.4
Stable tag: 3.1.0
License: GPLv2 or later
License URI: https://www.gnu.org/licenses/gpl-2.0.html

Connects your site to GO TOP: publishes the articles you send from GO TOP and applies the SEO fixes you approve there.

== Description ==

GO TOP (https://gotopseo.com) plans and writes articles for your business and finds SEO problems on your site. This plugin is the connection between GO TOP and your WordPress site. It needs a GO TOP account; on its own it does nothing.

= Publishing articles =

When you publish an article from GO TOP, the plugin:

* creates the post (or updates the post GO TOP recorded earlier for the same article), as a draft, published, or scheduled for a date you chose in GO TOP;
* adds the article's images to your Media Library, with their alt text, and sets the featured image;
* sets the categories and tags you chose from your site's own list.

You can also publish a second, separate post for the same article, and publish a given article as another user who may publish, chosen in GO TOP from your site's own list.

Posts are published as the user you choose in Settings > GO TOP SEO (by default the administrator who connected the site), or as another user who may publish, chosen per article in GO TOP. The content passes through WordPress's own filter for post HTML.

Other than the fixes below, the plugin changes only the post GO TOP recorded for an article. That is normally a post this plugin created; it can also be one GO TOP published on your site before the plugin was installed, using an application password. In that case the plugin takes that post over for the article, and only that one post: never a page, never a post in the trash, and never a post already tied to another GO TOP article.

= SEO fixes you approve =

When you approve a fix in GO TOP, the plugin writes exactly that one element on a post or page:

* SEO title and meta description (in Yoast SEO or Rank Math when one is active, otherwise printed by this plugin)
* Canonical address
* Focus keyphrase
* Image alt text: for an image in the content that has none, and for an image in your Media Library, where the text is written on the image itself and so applies on every page that shows it (undoing the fix removes it again)
* An FAQ block at the end of a page
* JSON-LD structured data (Organization, WebSite, WebPage, Article, FAQPage and similar; never Product). When Yoast SEO, Rank Math, All in One SEO, SEOPress or The SEO Framework is active, that plugin's structured data is kept and only the FAQPage part for the FAQ block is added
* A broken link inside existing content (new address, or the link removed and its words kept)
* An internal link on words that are already in the text
* An extra main heading (H1) in the content turned into a subheading (H2), words unchanged
* An llms.txt for AI assistants, answered at /llms.txt only while your site has no llms.txt file

The previous value is stored before every fix, and "Undo" in GO TOP restores it. WordPress also keeps a revision of every content change.

= What it never does =

It never deletes or trashes anything, and never changes prices, products, the theme, plugins, settings or users.

= Security =

Every request from GO TOP is signed with a key that only your site and your GO TOP project share (HMAC-SHA256, a single-use nonce, a five-minute window). Requests without a valid signature are refused. "Disconnect" in Settings > GO TOP SEO removes the key at once.

== External services ==

This plugin connects your site to GO TOP (https://gotopseo.com), a search-optimisation
service operated by GO TOP MARKETING GRUO LTD, company number 517274346, Israel. You need
a GO TOP account to use it. The plugin does nothing until you connect your site, and you
connect it yourself with a pairing code from your GO TOP account.

What GO TOP asks your site for, once it is connected. Every request is signed with the key
created at pairing, and your site refuses anything it cannot verify:

* Publishing: the articles you choose to publish in GO TOP, which your site saves as posts. A publish may
  name a date in the future, another user who may publish, a second post for the same article, or the post
  GO TOP recorded for that article.
* Fixes: the changes you approve in GO TOP, from a closed list (SEO title, meta description,
  canonical address, focus keyword, image alternative text, FAQ block, JSON-LD schema,
  internal links, broken-link repair, duplicate H1 demotion, llms.txt).
* Reading a post or page, by its address or by its id, so GO TOP can show you what is there now and what a
  fix would change: its title, address, content as WordPress displays it, headings and SEO fields.
* Listing your published posts and pages, which answers for each one with its id, type, address, slug,
  title, publication date, last modified date, and the focus keyphrase recorded for it in your SEO plugin.
  A post or page that is not published, or that is password protected, is not listed, and products are
  never listed. GO TOP uses this for its content index, its internal-link scan and its site map.
* Listing the users who may publish posts, which answers with each one's WordPress user id and display
  name, and the id of the user set for publishing. No e-mail address, login name, role or anything else
  about them is sent. GO TOP uses this only so you can choose whose name an article is published under.
* Finding, reading and setting Media Library alt text: a search by a word in a file name, title or slug
  answers with each image's id, the address of the file and of its resized copies, its alt text and its
  title; setting writes only the alt-text field, and an empty value removes it, which is how undo works.
* Your categories, tags and WooCommerce product categories, which answer with each term's id, name, slug,
  address and post count.
* Searching your published posts and pages by a word GO TOP sends, which answers with the id,
  address and title of up to ten matches. GO TOP uses this to find the page an internal link
  should point at.
* A status check, which answers with the plugin's version, which SEO plugin your site uses, whether an
  author is set for publishing, and which of the features above this copy of the plugin supports.

What leaves your site. Your site replies to each of those requests, and the reply is what is
sent to GO TOP: the new post's id, address and status; the details of a post or page GO TOP
asked to read, which includes its content; the list of your published posts and pages with the
fields named above; the ids and display names of the users who may publish; the Media Library
items a search matched; and your terms with their addresses and counts. Nothing beyond the
replies to those requests is sent. The plugin starts no request of its own, with one exception
described next: downloading the images of an article you publish. It reports nothing in the
background.

The one address your site contacts by itself: GO TOP's file storage, hosted on Supabase.

* What it is and why: the images of the articles you publish from GO TOP are kept in GO TOP's
  file storage. Your site downloads each image into its own Media Library so the published post
  shows it from your site.
* When: only while an article you chose to publish in GO TOP is being saved as a post, and only
  for the images that article carries. Never in the background and never for your visitors.
* Where: https://pmzicbtulloeynsosseh.supabase.co/storage/v1/object/public/. By default the
  plugin accepts images from this address only and refuses any other, and only JPEG, PNG, WebP
  or GIF, at most 15 MB. A site owner or developer can narrow or replace the list of accepted
  addresses with the filter gotop_seo_bridge_image_sources; every address on it must be https.
* What is sent: an ordinary download request for each image file. Like any web request, it
  carries your server's IP address and WordPress's standard request headers, whose user agent
  names your WordPress version and your site's address. No content, user data or visitor data
  of your site is sent.
* The storage is provided by Supabase, Inc.: terms of service https://supabase.com/terms,
  privacy policy https://supabase.com/privacy. GO TOP's own terms and privacy policy, below,
  cover how GO TOP uses it.

The plugin adds no tracking, no analytics and no script to your site's pages, and it sends
nothing about your visitors anywhere.

GO TOP terms of service: https://gotopseo.com/en/terms
GO TOP privacy policy: https://gotopseo.com/en/privacy

== Installation ==

1. Install and activate the plugin (Plugins > Add New, search for "GO TOP SEO Bridge").
2. In GO TOP, open your project's settings, go to Connections and choose WordPress. Click "Get a connection code" and copy it.
3. In WordPress, open Settings > GO TOP SEO, paste the code and press "Connect".
4. Optional: in the same screen, choose the user articles are published as.

== Frequently Asked Questions ==

= Do I need a GO TOP account? =

Yes. The plugin only carries out what you do in GO TOP.

= Do I still need an application password? =

No. Once the plugin is connected, GO TOP publishes and applies fixes through it. A password you gave us earlier stays stored and is used in one case only: when the plugin refuses to update the post GO TOP recorded for an article.

= Does it work with Yoast SEO or Rank Math? =

Yes. SEO titles, descriptions, canonical addresses and focus keyphrases are written into their own fields, and they keep printing them.

= Can I undo a fix? =

Yes. Every fix can be undone from GO TOP, and WordPress keeps a revision of every content change.

= How do I disconnect? =

Settings > GO TOP SEO > Disconnect. GO TOP can no longer reach the site. Deleting the plugin also removes its settings; from 3.1.0 the connection key is kept while another copy of the plugin is still installed on the site, so that deleting one copy does not disconnect the other. Deleting an older copy still removes the shared key.

== Screenshots ==

1. Settings > GO TOP SEO after pairing: the connection, the user articles are published as, and recent activity.
2. Connecting in GO TOP: install the plugin, get a one-time connection code, and check the connection.
3. Site health in GO TOP with the plugin connected: findings that can be fixed in one click through the plugin.

== Changelog ==

= 3.1.0 =
* Everything GO TOP does now works with this plugin alone, without an application password: new signed routes list your published posts and pages (for the index of your existing content), read one published post or page as it is displayed (its HTML), list the users who may publish posts (id and display name), and find, read and set the alt text of Media Library images.
* Publishing: schedule a post for a date, publish a second separate post for an article when you ask for it, choose the author of each article (only users who may publish posts), and update the post GO TOP published for the same article before the plugin was installed.
* Categories, tags and WooCommerce product categories are listed with their address and post count.
* Two copies of the plugin active at once (the older one and the WordPress.org one) no longer stop the site: the second one stays off and shows a notice. Deleting one copy keeps the connection while the other copy is installed.
* The Settings link and the messages after Connect, Save and Disconnect open the right settings page.

= 3.0.0 =
* Publishing: new signed routes publish an article as a post (or update the post made for it), add its images to the Media Library, and read the site's categories and tags. No application password is needed.
* Settings > GO TOP SEO: choose the user articles are published as.
* Structured data is printed with wp_print_inline_script_tag.
* With an SEO plugin that prints its own structured data (Yoast SEO, Rank Math, All in One SEO, SEOPress, The SEO Framework), only the FAQPage part is printed.
* Requires WordPress 6.0 and PHP 7.4.

= 2.1.0 =
* New fixes: an extra main heading turned into a subheading, and llms.txt.

= 2.0.0 =
* Signed fix endpoints, pairing with a one-time code, undo, Settings > GO TOP SEO.

= 1.0.0 =
* First release.

== Upgrade Notice ==

= 3.1.0 =
GO TOP no longer needs an application password for anything once the plugin is connected. The connection is kept.

= 3.0.0 =
Adds publishing articles from GO TOP without an application password. The connection is kept.
