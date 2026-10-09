<?php
/**
 * Plugin Name:       GO TOP SEO Bridge
 * Description:       Connects your site to GO TOP: publishes the articles you send from GO TOP and applies the SEO fixes you approve there, each one undoable.
 * Version:           3.0.0
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
 *   No route is open: each has a permission_callback that fails closed.
 *   /fix accepts ONLY the eleven fix types in gotop_seo_bridge_fix_types() (2.1.0 added h1_demote
 *   and llms_txt), re-validates every value here, and stores the previous value before it writes.
 *   Public (no route, no write): GET /llms.txt answers the approved llms.txt text when the site has
 *   no llms.txt file of its own (includes/llms.php).
 */

if (!defined('ABSPATH')) { exit; }

define('GOTOP_SEO_BRIDGE_VERSION', '3.0.0');
define('GOTOP_SEO_BRIDGE_DIR', __DIR__);

require_once GOTOP_SEO_BRIDGE_DIR . '/includes/auth.php';
require_once GOTOP_SEO_BRIDGE_DIR . '/includes/content.php';
require_once GOTOP_SEO_BRIDGE_DIR . '/includes/fixes.php';
require_once GOTOP_SEO_BRIDGE_DIR . '/includes/llms.php';
require_once GOTOP_SEO_BRIDGE_DIR . '/includes/output.php';
require_once GOTOP_SEO_BRIDGE_DIR . '/includes/publish.php';
require_once GOTOP_SEO_BRIDGE_DIR . '/includes/admin.php';

// ── 1.x: the SEO meta bridge (unchanged behaviour) ──────────────────────────

// The ONLY meta keys this bridge may write — the exact Yoast and Rank Math SEO fields.
function gotop_seo_bridge_allowed_keys() {
    return array(
        // Yoast SEO
        '_yoast_wpseo_title',
        '_yoast_wpseo_metadesc',
        '_yoast_wpseo_focuskw',
        // Rank Math
        'rank_math_title',
        'rank_math_description',
        'rank_math_focus_keyword',
    );
}

add_action('rest_api_init', 'gotop_seo_bridge_register_routes');

function gotop_seo_bridge_register_routes() {
    register_rest_route('gotop/v1', '/seo-meta', array(
        'methods'  => 'POST',
        'callback' => 'gotop_seo_bridge_write',
        'permission_callback' => function (WP_REST_Request $request) {
            $post_id = absint($request->get_param('post_id'));
            if (!$post_id) { return false; }
            return current_user_can('edit_post', $post_id);
        },
        'args' => array(
            'post_id' => array('required' => true, 'type' => 'integer'),
            'plugin'  => array('required' => false, 'type' => 'string'),
            'meta'    => array('required' => true, 'type' => 'object'),
        ),
    ));

    register_rest_route('gotop/v1', '/pair', array(
        'methods'  => 'POST',
        'callback' => 'gotop_seo_bridge_route_pair',
        'permission_callback' => 'gotop_seo_bridge_admin_permission',
    ));

    foreach (gotop_seo_bridge_signed_routes() as $route => $callback) {
        register_rest_route('gotop/v1', $route, array(
            'methods'  => 'POST',
            'callback' => $callback,
            'permission_callback' => 'gotop_seo_bridge_signed_permission',
        ));
    }
}

/** Every signed route and its handler. */
function gotop_seo_bridge_signed_routes() {
    return array(
        '/status'  => 'gotop_seo_bridge_route_status',
        '/inspect' => 'gotop_seo_bridge_route_inspect',
        '/search'  => 'gotop_seo_bridge_route_search',
        '/fix'     => 'gotop_seo_bridge_route_fix',
        '/undo'    => 'gotop_seo_bridge_route_undo',
        '/terms'   => 'gotop_seo_bridge_route_terms',
        '/media'   => 'gotop_seo_bridge_route_media',
        '/publish' => 'gotop_seo_bridge_route_publish',
    );
}

function gotop_seo_bridge_admin_permission() {
    return current_user_can('manage_options');
}

function gotop_seo_bridge_write(WP_REST_Request $request) {
    $post_id = absint($request->get_param('post_id'));
    $meta    = $request->get_param('meta');
    if (!$post_id || get_post_status($post_id) === false) {
        return new WP_Error('invalid_post', 'Post not found.', array('status' => 404));
    }
    if (!is_array($meta)) {
        return new WP_Error('invalid_meta', 'meta must be an object.', array('status' => 400));
    }

    $allowed = gotop_seo_bridge_allowed_keys();
    $applied = array();
    foreach ($meta as $key => $value) {
        if (!in_array($key, $allowed, true)) {
            // Silently ignore any non-allowlisted key — never write arbitrary meta.
            continue;
        }
        $clean = sanitize_text_field(is_scalar($value) ? (string) $value : '');
        update_post_meta($post_id, $key, $clean);
        // Read back the ACTUAL stored value for per-field verification.
        $applied[$key] = get_post_meta($post_id, $key, true);
    }

    return new WP_REST_Response(array(
        'ok'      => true,
        'post_id' => $post_id,
        'plugin'  => sanitize_text_field((string) $request->get_param('plugin')),
        'fields'  => $applied, // the applied (read-back) values — for exact verification
    ), 200);
}

// ── 2.0 routes ──────────────────────────────────────────────────────────────

/** A JSON answer with a stable code. Never a PHP or database message. */
function gotop_seo_bridge_refuse($code, $status) {
    return new WP_REST_Response(array('ok' => false, 'code' => $code), $status);
}

function gotop_seo_bridge_route_pair(WP_REST_Request $request) {
    $body = gotop_seo_bridge_json_body($request);
    $parsed = gotop_seo_bridge_parse_pairing_code(isset($body['code']) && is_string($body['code']) ? $body['code'] : '');
    if (!$parsed) { return gotop_seo_bridge_refuse('invalid_code', 400); }
    gotop_seo_bridge_store_key($parsed['key_id'], $parsed['secret'], get_current_user_id());
    return new WP_REST_Response(array('ok' => true, 'version' => GOTOP_SEO_BRIDGE_VERSION, 'key_id' => $parsed['key_id']), 200);
}

function gotop_seo_bridge_route_status(WP_REST_Request $request) {
    return new WP_REST_Response(array(
        'ok'         => true,
        'version'    => GOTOP_SEO_BRIDGE_VERSION,
        'seo_plugin' => gotop_seo_bridge_seo_plugin(),
        'fix_types'  => gotop_seo_bridge_fix_types(),
        'publishing' => array('ready' => gotop_seo_bridge_author_id() > 0),
    ), 200);
}

function gotop_seo_bridge_route_inspect(WP_REST_Request $request) {
    $body = gotop_seo_bridge_json_body($request);
    $post = gotop_seo_bridge_resolve_post(isset($body['url']) ? $body['url'] : '');
    if (is_string($post)) { return gotop_seo_bridge_refuse($post, 404); }
    return new WP_REST_Response(array('ok' => true, 'item' => gotop_seo_bridge_describe_post($post)), 200);
}

function gotop_seo_bridge_route_search(WP_REST_Request $request) {
    $body = gotop_seo_bridge_json_body($request);
    $term = isset($body['term']) && is_string($body['term']) ? trim($body['term']) : '';
    if (strlen($term) < 3 || strlen($term) > 240) { return gotop_seo_bridge_refuse('invalid_request', 400); }
    $limit = isset($body['limit']) ? max(1, min(10, absint($body['limit']))) : 5;
    $query = new WP_Query(array(
        's'              => $term,
        'post_type'      => gotop_seo_bridge_post_types(),
        'post_status'    => 'publish',
        'posts_per_page' => $limit,
        'no_found_rows'  => true,
    ));
    $out = array();
    foreach ($query->posts as $post) {
        $out[] = array('post_id' => (int) $post->ID, 'link' => get_permalink($post), 'title' => get_the_title($post));
    }
    return new WP_REST_Response(array('ok' => true, 'items' => $out), 200);
}

function gotop_seo_bridge_route_fix(WP_REST_Request $request) {
    $result = gotop_seo_bridge_apply_fix(gotop_seo_bridge_json_body($request));
    return new WP_REST_Response($result, empty($result['ok']) ? gotop_seo_bridge_status_for($result['code']) : 200);
}

function gotop_seo_bridge_route_undo(WP_REST_Request $request) {
    $result = gotop_seo_bridge_undo_fix(gotop_seo_bridge_json_body($request));
    return new WP_REST_Response($result, empty($result['ok']) ? gotop_seo_bridge_status_for($result['code']) : 200);
}

function gotop_seo_bridge_status_for($code) {
    $map = array(
        'not_allowed' => 400, 'value_invalid' => 400, 'invalid_request' => 400, 'off_site' => 400,
        'not_in_wordpress' => 404, 'nothing_to_undo' => 404,
        'changed_since_preview' => 409, 'file_exists' => 409, 'no_safe_place' => 422, 'nothing_to_change' => 422,
        'builder_page' => 422, 'write_failed' => 500,
        'not_ours' => 409, 'no_author' => 409, 'seo_plugin_schema' => 409, 'download_failed' => 502, 'not_an_image' => 415,
    );
    return isset($map[$code]) ? $map[$code] : 400;
}

/** The request body as an array (the signature was checked over these exact bytes). */
function gotop_seo_bridge_json_body(WP_REST_Request $request) {
    $decoded = json_decode((string) $request->get_body(), true);
    return is_array($decoded) ? $decoded : array();
}

register_uninstall_hook(__FILE__, 'gotop_seo_bridge_uninstall');
function gotop_seo_bridge_uninstall() {
    delete_option('gotop_seo_bridge_key');
    delete_option('gotop_seo_bridge_log');
    delete_option('gotop_seo_bridge_llms');
    delete_option('gotop_seo_bridge_llms_jobs');
    delete_option('gotop_seo_bridge_author');
}
