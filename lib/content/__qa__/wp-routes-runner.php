<?php
/**
 * GO TOP SEO Bridge's REST routes inside a REAL WordPress. Used by
 * lib/content/__qa__/plugin-3-1-app.qa.ts (group E).
 *
 *   php wp-routes-runner.php <wordpress root> <plugin dir> <request.json> <state dir>
 *
 * NOTHING IS WRITTEN UNDER <wordpress root>: the database is the copy in <state dir> (the caller
 * copies wp.sqlite there), and uploads and the debug log go there too. The WordPress files are
 * only read.
 *
 * request.json is one of:
 *   {"deactivate": true}   switch off the copy's own active plugins (run first)
 *   {"setup": true, "code": "<pairing code>"}   pair the given copy with
 *        the code (as the administrator, through its own /pair route), add the posts, users, terms
 *        and the Media Library image the checks read, and print their ids
 *   {"route": "/gotop/v1/...", "headers": {...}, "body": "..."}   one signed request, answered by
 *        rest_do_request with no signed-in user (how the app's requests arrive), printed as
 *        {"status", "body"}
 *   {"read": <post id>}    the post and its meta, as WordPress stored them
 *   {"activate": "<dir>/<file>.php", "plugins_dir": "..."}   activate another plugin (a second copy)
 *        from plugins_dir (WP_PLUGIN_DIR for this run)
 *   {"notices": true, "admin": true}   the admin notices an administrator sees, the gotop/v1 routes,
 *        the running version and whether Settings > GO TOP SEO opens with its pairing form
 *
 * The given plugin dir is loaded the way WordPress loads an active plugin (after the must-use
 * plugins, before the other active plugins and plugins_loaded), through a hook set before wp-load.php,
 * so its plugins_loaded wait runs exactly as on a site, ahead of any other copy.
 */
$root = rtrim($argv[1], '/');
$gotop_qa_plugin_dir = rtrim($argv[2], '/');
$gotop_qa_req = json_decode(file_get_contents($argv[3]), true);
$gotop_qa_state = rtrim($argv[4], '/');
// Our database, log and no cron, defined before wp-config.php (whose own defines then do nothing).
error_reporting(E_ALL & ~E_WARNING);
define('DB_DIR', $gotop_qa_state . '/'); define('DB_FILE', 'wp.sqlite');
define('WP_DEBUG_LOG', $gotop_qa_state . '/debug.log'); define('DISABLE_WP_CRON', true);
// A second copy to activate lives in the state dir, never in the WordPress's own plugins folder.
if (!empty($gotop_qa_req['plugins_dir'])) { define('WP_PLUGIN_DIR', rtrim($gotop_qa_req['plugins_dir'], '/')); }
$_SERVER['HTTP_HOST'] = '127.0.0.1:8899';
$_SERVER['REQUEST_URI'] = '/';
define('WP_USE_THEMES', false);
if (!empty($gotop_qa_req['admin'])) { define('WP_ADMIN', true); }
$GLOBALS['wp_filter'] = array(
    'muplugins_loaded' => array(10 => array(array('function' => function () use ($gotop_qa_plugin_dir) {
        include $gotop_qa_plugin_dir . '/gotop-seo-bridge.php';
    }, 'accepted_args' => 0))),
    'upload_dir' => array(99 => array(array('function' => function ($u) use ($gotop_qa_state) {
        $u['basedir'] = $gotop_qa_state . '/uploads'; $u['path'] = $u['basedir'] . $u['subdir'];
        return $u;
    }, 'accepted_args' => 1))),
);
require $root . '/wp-load.php';
require_once ABSPATH . 'wp-admin/includes/plugin.php';

$out = array();
if (!empty($gotop_qa_req['deactivate'])) {
    // The copy's own active plugins (another GO TOP copy among them) are switched off first, so the
    // runs after this one load the given plugin alone.
    update_option('active_plugins', array());
    $out = array('active' => get_option('active_plugins'));
} elseif (!empty($gotop_qa_req['setup'])) {
    wp_set_current_user(1);
    $pair = new WP_REST_Request('POST', '/gotop/v1/pair');
    $pair->set_header('content-type', 'application/json');
    $pair->set_body(wp_json_encode(array('code' => $gotop_qa_req['code'])));
    $paired = rest_do_request($pair);
    $editor = wp_insert_user(array('user_login' => 'dana', 'user_pass' => wp_generate_password(), 'role' => 'editor', 'display_name' => 'Dana Editor', 'user_email' => 'dana@example.org'));
    $reader = get_user_by('login', 'reader');
    $reader = $reader ? $reader->ID : wp_insert_user(array('user_login' => 'reader', 'user_pass' => wp_generate_password(), 'role' => 'subscriber', 'user_email' => 'reader@example.org'));
    $older = wp_insert_post(array('post_title' => 'Older post', 'post_name' => 'older-post', 'post_content' => '<p>See <a href="http://127.0.0.1:8899/waterproof-boots/">waterproof boots</a>.</p>', 'post_status' => 'publish', 'post_author' => 1));
    $boots = wp_insert_post(array('post_title' => 'Waterproof boots', 'post_name' => 'waterproof-boots', 'post_content' => '<p>Our <a href="http://127.0.0.1:8899/older-post/">older post</a>.</p>', 'post_status' => 'publish', 'post_author' => 1));
    $draft = wp_insert_post(array('post_title' => 'Unfinished', 'post_content' => '<p>draft</p>', 'post_status' => 'draft', 'post_author' => 1));
    $page = wp_insert_post(array('post_title' => 'About', 'post_name' => 'about', 'post_type' => 'page', 'post_content' => '<p>About us.</p>', 'post_status' => 'publish', 'post_author' => 1));
    $upload = wp_upload_dir();
    @mkdir($upload['path'], 0777, true);
    file_put_contents($upload['path'] . '/red-boots.jpg', base64_decode('/9j/4AAQSkZJRgABAQEASABIAAD/2wBDAP//////////////////////////////////////////////////////////////////////////////////////wgALCAABAAEBAREA/8QAFBABAAAAAAAAAAAAAAAAAAAAAP/aAAgBAQABPxA='));
    $media = wp_insert_attachment(array('post_title' => 'red-boots', 'post_name' => 'red-boots', 'post_mime_type' => 'image/jpeg', 'post_status' => 'inherit', 'guid' => $upload['url'] . '/red-boots.jpg'), $upload['path'] . '/red-boots.jpg');
    update_post_meta($media, '_wp_attachment_metadata', array('file' => ltrim($upload['subdir'] . '/red-boots.jpg', '/'), 'width' => 1, 'height' => 1, 'sizes' => array()));
    wp_insert_term('Guides', 'category');
    $out = array('paired' => $paired->get_status(), 'editor' => $editor, 'reader' => $reader, 'older' => $older, 'boots' => $boots, 'draft' => $draft, 'page' => $page, 'media' => $media,
        'media_url' => wp_get_attachment_url($media), 'version' => get_bloginfo('version'), 'plugin' => defined('GOTOP_SEO_BRIDGE_VERSION') ? GOTOP_SEO_BRIDGE_VERSION : null);
} elseif (isset($gotop_qa_req['route'])) {
    wp_set_current_user(0);
    $req = new WP_REST_Request('POST', $gotop_qa_req['route']);
    foreach ((array) $gotop_qa_req['headers'] as $k => $v) { $req->set_header($k, $v); }
    $req->set_header('content-type', 'application/json');
    $req->set_body((string) $gotop_qa_req['body']);
    $res = rest_do_request($req);
    $data = rest_get_server()->response_to_data($res, false);
    $out = array('status' => $res->get_status(), 'body' => $data);
} elseif (isset($gotop_qa_req['read'])) {
    $p = get_post((int) $gotop_qa_req['read']);
    $out = array('post' => $p ? array('post_status' => $p->post_status, 'post_date_gmt' => $p->post_date_gmt, 'post_author' => (int) $p->post_author, 'post_title' => $p->post_title, 'post_type' => $p->post_type) : null,
        'meta' => array('article' => get_post_meta((int) $gotop_qa_req['read'], '_gotop_article_id', true), 'alt' => get_post_meta((int) $gotop_qa_req['read'], '_wp_attachment_image_alt', true)));
} elseif (isset($gotop_qa_req['activate'])) {
    $r = activate_plugin($gotop_qa_req['activate']);
    $out = array('activated' => is_wp_error($r) ? $r->get_error_code() : true, 'active' => get_option('active_plugins'));
} elseif (!empty($gotop_qa_req['notices'])) {
    wp_set_current_user(1);
    ob_start(); do_action('admin_notices'); $notices = ob_get_clean();
    // The settings page with the pairing form, opened as WordPress opens it (admin_menu, then its hook).
    require_once ABSPATH . 'wp-admin/includes/admin.php';
    do_action('admin_menu');
    $page = '';
    foreach (array_keys((array) $GLOBALS['_registered_pages']) as $hook) {
        if (substr($hook, -strlen('_go-top-seo-bridge')) === '_go-top-seo-bridge') { ob_start(); do_action($hook); $page = ob_get_clean(); }
    }
    $routes = array_keys(rest_get_server()->get_routes('gotop/v1'));
    $out = array('notices' => $notices, 'routes' => $routes, 'version' => defined('GOTOP_SEO_BRIDGE_VERSION') ? GOTOP_SEO_BRIDGE_VERSION : null,
        'settings_page' => strpos($page, 'name="gotop_code"') !== false);
}
echo "\n@@GOTOP@@" . wp_json_encode($out, JSON_UNESCAPED_SLASHES | JSON_UNESCAPED_UNICODE);
