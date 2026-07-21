<?php
/**
 * Plugin Name: GO TOP SEO Bridge
 * Description: Minimal authenticated REST endpoint that lets the GO TOP app write ONLY the
 *              supported SEO plugin's exact meta fields (Yoast / Rank Math) for a specific
 *              post, with per-field read-back verification. No arbitrary meta writes.
 * Version:     1.0.0
 * Requires at least: 5.6
 * License:     GPL-2.0-or-later
 *
 * Security model:
 *   - Route: POST /wp-json/gotop/v1/seo-meta
 *   - permission_callback: the authenticated user must be able to edit the TARGET post
 *     (current_user_can('edit_post', post_id)) — which implies edit_posts.
 *   - Only an ALLOWLIST of Yoast/Rank Math SEO meta keys may be written. Any other key is
 *     rejected. This endpoint can NEVER write arbitrary post meta.
 *   - Returns the applied values (read back with get_post_meta) so the caller can verify
 *     exact normalized values. Exposes no credentials, options, or unrelated data.
 */

if (!defined('ABSPATH')) { exit; }

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

add_action('rest_api_init', function () {
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
});

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
