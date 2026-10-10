<?php
/**
 * Plugin Name:       GO TOP SEO Bridge
 * Description:       Connects your site to GO TOP: publishes the articles you send from GO TOP and applies the SEO fixes you approve there, each one undoable.
 * Version:           3.1.0
 * Requires at least: 6.0
 * Requires PHP:      7.4
 * Author:            GO TOP MARKETING GRUO LTD
 * Author URI:        https://gotopseo.com
 * License:           GPLv2 or later
 * License URI:       https://www.gnu.org/licenses/gpl-2.0.html
 * Text Domain:       go-top-seo-bridge
 *
 * Security model:
 *   1.x route (unchanged, kept for existing installs):
 *     POST /wp-json/gotop/v1/seo-meta   application-password auth; the user must be able to edit
 *                                       the target post; writes ONLY the Yoast / Rank Math keys.
 *   2.0 routes:
 *     POST /wp-json/gotop/v1/pair       application-password auth of an administrator
 *                                       (manage_options): stores the site key the app issued.
 *     POST /wp-json/gotop/v1/status     \
 *     POST /wp-json/gotop/v1/inspect     |  signed: HMAC-SHA256 over the method, the route, the
 *     POST /wp-json/gotop/v1/search      |  time, a single-use nonce, the key id and the body's
 *     POST /wp-json/gotop/v1/fix         |  SHA-256, with the per-site secret. Constant-time
 *     POST /wp-json/gotop/v1/undo        |  compare; +-5 minutes; a nonce is accepted once.
 *   3.0 routes, signed the same way (includes/publish.php):
 *     POST /wp-json/gotop/v1/terms       |  the site's categories or tags
 *     POST /wp-json/gotop/v1/media       |  one image into the Media Library
 *     POST /wp-json/gotop/v1/publish    /   one article: a new post, or the post made for it
 *   3.1 routes, signed the same way (includes/read.php), so a site connected by this plugin alone
 *   needs no application password for anything GO TOP does:
 *     POST /wp-json/gotop/v1/content      \  one page of published posts or pages (id, address, title,
 *                                          |  slug, dates, focus keyphrase); no drafts, no protected posts
 *     POST /wp-json/gotop/v1/content-item |  one published post or page's displayed HTML (internal links)
 *     POST /wp-json/gotop/v1/authors      |  the users who may publish posts: id and display name only
 *     POST /wp-json/gotop/v1/media-alt   /   find a Media Library image by its file name, read it, or set
 *                                            its alt text (the only field it writes)
 *   /publish (3.1) also schedules (status future + date_gmt), makes a second post for an article on
 *   request (new_post), publishes as a chosen user who may publish posts (author_id), and takes over
 *   the post GO TOP published for the same article before the plugin (adopt; never a page, never a
 *   post tied to another article).
 *   No route is open: each has a permission_callback that fails closed.
 *   /fix accepts ONLY the eleven fix types in gotop_seo_bridge_fix_types() (2.1.0 added h1_demote
 *   and llms_txt), re-validates every value here, and stores the previous value before it writes.
 *   Public (no route, no write): GET /llms.txt answers the approved llms.txt text when the site has
 *   no llms.txt file of its own (includes/llms.php).
 */

if (!defined('ABSPATH')) { exit; }

/*
 * Two copies at once (an older one in the folder gotop-seo-bridge/ and the WordPress.org one in
 * go-top-seo-bridge/): whichever copy defines GOTOP_SEO_BRIDGE_VERSION first runs; this copy waits
 * until every plugin file is loaded (plugins_loaded, earliest priority) and then either starts or
 * stays off and says so to administrators. Nothing here declares a global function (includes/ is
 * in the GoTopSeoBridge namespace and is read only when this copy starts), so two copies never
 * collide into a fatal error, whichever of them WordPress loads first.
 */
add_action('plugins_loaded', function () {
    if (defined('GOTOP_SEO_BRIDGE_VERSION')) {
        add_action('admin_notices', function () {
            if (!current_user_can('activate_plugins')) { return; }
            echo '<div class="notice notice-warning"><p>' . esc_html__('Two copies of GO TOP SEO Bridge are active, and only one of them runs. Deactivate and delete the older copy in Plugins, then check in GO TOP that your site is still connected. If it is not, connect it again there.', 'go-top-seo-bridge') . '</p></div>';
        });
        return;
    }

    define('GOTOP_SEO_BRIDGE_VERSION', '3.1.0');
    define('GOTOP_SEO_BRIDGE_DIR', __DIR__);
    define('GOTOP_SEO_BRIDGE_FILE', __FILE__);

    require_once GOTOP_SEO_BRIDGE_DIR . '/includes/auth.php';
    require_once GOTOP_SEO_BRIDGE_DIR . '/includes/content.php';
    require_once GOTOP_SEO_BRIDGE_DIR . '/includes/fixes.php';
    require_once GOTOP_SEO_BRIDGE_DIR . '/includes/llms.php';
    require_once GOTOP_SEO_BRIDGE_DIR . '/includes/output.php';
    require_once GOTOP_SEO_BRIDGE_DIR . '/includes/publish.php';
    require_once GOTOP_SEO_BRIDGE_DIR . '/includes/read.php';
    require_once GOTOP_SEO_BRIDGE_DIR . '/includes/routes.php';
    require_once GOTOP_SEO_BRIDGE_DIR . '/includes/admin.php';
}, 0);
