<?php
/**
 * The REST routes and the 1.x SEO meta bridge (moved here from the main file in 3.1.0, so that a
 * second copy of the plugin stops before any function is declared). Behaviour unchanged.
 */

namespace GoTopSeoBridge;

if (!defined('ABSPATH')) { exit; }

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

add_action('rest_api_init', __NAMESPACE__ . '\\gotop_seo_bridge_register_routes');

function gotop_seo_bridge_register_routes() {
    register_rest_route('gotop/v1', '/seo-meta', array(
        'methods'  => 'POST',
        'callback' => __NAMESPACE__ . '\\gotop_seo_bridge_write',
        'permission_callback' => function (\WP_REST_Request $request) {
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
        'callback' => __NAMESPACE__ . '\\gotop_seo_bridge_route_pair',
        'permission_callback' => __NAMESPACE__ . '\\gotop_seo_bridge_admin_permission',
    ));

    foreach (gotop_seo_bridge_signed_routes() as $route => $callback) {
        register_rest_route('gotop/v1', $route, array(
            'methods'  => 'POST',
            'callback' => $callback,
            'permission_callback' => __NAMESPACE__ . '\\gotop_seo_bridge_signed_permission',
        ));
    }
}

/** Every signed route and its handler. */
function gotop_seo_bridge_signed_routes() {
    return array(
        '/status'  => __NAMESPACE__ . '\\gotop_seo_bridge_route_status',
        '/inspect' => __NAMESPACE__ . '\\gotop_seo_bridge_route_inspect',
        '/search'  => __NAMESPACE__ . '\\gotop_seo_bridge_route_search',
        '/fix'     => __NAMESPACE__ . '\\gotop_seo_bridge_route_fix',
        '/undo'    => __NAMESPACE__ . '\\gotop_seo_bridge_route_undo',
        '/terms'   => __NAMESPACE__ . '\\gotop_seo_bridge_route_terms',
        '/media'   => __NAMESPACE__ . '\\gotop_seo_bridge_route_media',
        '/publish' => __NAMESPACE__ . '\\gotop_seo_bridge_route_publish',
        // 3.1.0 (includes/read.php)
        '/content'      => __NAMESPACE__ . '\\gotop_seo_bridge_route_content',
        '/content-item' => __NAMESPACE__ . '\\gotop_seo_bridge_route_content_item',
        '/authors'      => __NAMESPACE__ . '\\gotop_seo_bridge_route_authors',
        '/media-alt'    => __NAMESPACE__ . '\\gotop_seo_bridge_route_media_alt',
    );
}

function gotop_seo_bridge_admin_permission() {
    return current_user_can('manage_options');
}

function gotop_seo_bridge_write(\WP_REST_Request $request) {
    $post_id = absint($request->get_param('post_id'));
    $meta    = $request->get_param('meta');
    if (!$post_id || get_post_status($post_id) === false) {
        return new \WP_Error('invalid_post', 'Post not found.', array('status' => 404));
    }
    if (!is_array($meta)) {
        return new \WP_Error('invalid_meta', 'meta must be an object.', array('status' => 400));
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

    return new \WP_REST_Response(array(
        'ok'      => true,
        'post_id' => $post_id,
        'plugin'  => sanitize_text_field((string) $request->get_param('plugin')),
        'fields'  => $applied, // the applied (read-back) values — for exact verification
    ), 200);
}

// ── 2.0 routes ──────────────────────────────────────────────────────────────

/** A JSON answer with a stable code. Never a PHP or database message. */
function gotop_seo_bridge_refuse($code, $status) {
    return new \WP_REST_Response(array('ok' => false, 'code' => $code), $status);
}

function gotop_seo_bridge_route_pair(\WP_REST_Request $request) {
    $body = gotop_seo_bridge_json_body($request);
    $parsed = gotop_seo_bridge_parse_pairing_code(isset($body['code']) && is_string($body['code']) ? $body['code'] : '');
    if (!$parsed) { return gotop_seo_bridge_refuse('invalid_code', 400); }
    gotop_seo_bridge_store_key($parsed['key_id'], $parsed['secret'], get_current_user_id());
    return new \WP_REST_Response(array('ok' => true, 'version' => GOTOP_SEO_BRIDGE_VERSION, 'key_id' => $parsed['key_id']), 200);
}

function gotop_seo_bridge_route_status(\WP_REST_Request $request) {
    return new \WP_REST_Response(array(
        'ok'         => true,
        'version'    => GOTOP_SEO_BRIDGE_VERSION,
        'seo_plugin' => gotop_seo_bridge_seo_plugin(),
        'fix_types'  => gotop_seo_bridge_fix_types(),
        'publishing' => array('ready' => gotop_seo_bridge_author_id() > 0),
        // 3.1.0: what this copy can do, so the app turns each feature on by what the site says.
        'capabilities' => gotop_seo_bridge_capabilities(),
    ), 200);
}

function gotop_seo_bridge_route_inspect(\WP_REST_Request $request) {
    $body = gotop_seo_bridge_json_body($request);
    $post = gotop_seo_bridge_resolve_post(isset($body['url']) ? $body['url'] : '');
    if (is_string($post)) { return gotop_seo_bridge_refuse($post, 404); }
    return new \WP_REST_Response(array('ok' => true, 'item' => gotop_seo_bridge_describe_post($post)), 200);
}

function gotop_seo_bridge_route_search(\WP_REST_Request $request) {
    $body = gotop_seo_bridge_json_body($request);
    $term = isset($body['term']) && is_string($body['term']) ? trim($body['term']) : '';
    if (strlen($term) < 3 || strlen($term) > 240) { return gotop_seo_bridge_refuse('invalid_request', 400); }
    $limit = isset($body['limit']) ? max(1, min(10, absint($body['limit']))) : 5;
    $query = new \WP_Query(array(
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
    return new \WP_REST_Response(array('ok' => true, 'items' => $out), 200);
}

function gotop_seo_bridge_route_fix(\WP_REST_Request $request) {
    $result = gotop_seo_bridge_apply_fix(gotop_seo_bridge_json_body($request));
    return new \WP_REST_Response($result, empty($result['ok']) ? gotop_seo_bridge_status_for($result['code']) : 200);
}

function gotop_seo_bridge_route_undo(\WP_REST_Request $request) {
    $result = gotop_seo_bridge_undo_fix(gotop_seo_bridge_json_body($request));
    return new \WP_REST_Response($result, empty($result['ok']) ? gotop_seo_bridge_status_for($result['code']) : 200);
}

function gotop_seo_bridge_status_for($code) {
    $map = array(
        'not_allowed' => 400, 'value_invalid' => 400, 'invalid_request' => 400, 'off_site' => 400,
        'not_in_wordpress' => 404, 'nothing_to_undo' => 404,
        'changed_since_preview' => 409, 'file_exists' => 409, 'no_safe_place' => 422, 'nothing_to_change' => 422,
        'builder_page' => 422, 'write_failed' => 500,
        'not_ours' => 409, 'no_author' => 409, 'seo_plugin_schema' => 409, 'download_failed' => 502, 'not_an_image' => 415,
        'author_invalid' => 400, 'date_invalid' => 400, 'too_large' => 413,
    );
    return isset($map[$code]) ? $map[$code] : 400;
}

/** The request body as an array (the signature was checked over these exact bytes). */
function gotop_seo_bridge_json_body(\WP_REST_Request $request) {
    $decoded = json_decode((string) $request->get_body(), true);
    return is_array($decoded) ? $decoded : array();
}
