<?php
/**
 * 3.1.0: what GO TOP did over an application password before, through this plugin's signed routes
 * (the same HMAC check as every other route, see auth.php), so a site connected by this plugin
 * alone needs no application password for anything:
 *
 *   POST /gotop/v1/content       one page of PUBLISHED posts or pages, for GO TOP's index of the
 *                                site's existing content: id, type, address, title, slug, dates and
 *                                the SEO plugin's focus keyphrase. No drafts, private or
 *                                password-protected posts; no content, no author, no other field.
 *   POST /gotop/v1/content-item  the displayed HTML of ONE published post or page (the links in it
 *                                are what the internal-link index reads). Same rules.
 *   POST /gotop/v1/authors       the users who may publish posts (to choose an article's author):
 *                                their id and display name only. No e-mail, login or role.
 *   POST /gotop/v1/media-alt     a Media Library image found by its file name, read by its id, or
 *                                its alt text set (the one field it writes; never the file, its
 *                                title or caption). Only images. The app keeps the previous words
 *                                and undoes back to them.
 *
 * Read only, except the alt text. Nothing here changes a post, a page, a user or a setting.
 */

namespace GoTopSeoBridge;

if (!defined('ABSPATH')) { exit; }

define('GOTOP_SEO_BRIDGE_ITEM_MAX', 2000000);

/** What this copy of the plugin can do (POST /status, `capabilities`). */
function gotop_seo_bridge_capabilities() {
    return array('content', 'content_item', 'authors', 'media_alt', 'terms_links', 'schedule', 'new_post', 'author', 'adopt');
}

/** The SEO plugin's focus keyphrase of a post, and where it came from, or array('', null). */
function gotop_seo_bridge_focus_of($post_id) {
    $yoast = trim((string) get_post_meta($post_id, '_yoast_wpseo_focuskw', true));
    if ($yoast !== '') { return array($yoast, 'yoast_focus_keyword'); }
    $rank = trim((string) get_post_meta($post_id, 'rank_math_focus_keyword', true));
    if ($rank !== '') {
        $first = explode(',', $rank);
        return array(trim($first[0]), 'rankmath_focus_keyword');
    }
    $own = trim((string) get_post_meta($post_id, '_gotop_focus_keyphrase', true));
    if ($own !== '') { return array($own, 'yoast_focus_keyword'); }
    return array('', null);
}

/** A post's title as visitors read it: no tags, entities decoded, one line. */
function gotop_seo_bridge_plain_title($post) {
    $title = html_entity_decode(wp_strip_all_tags((string) get_the_title($post)), ENT_QUOTES, 'UTF-8');
    return trim(preg_replace('/\s+/u', ' ', $title));
}

/** A published, not password-protected post or page this plugin may read, or null. */
function gotop_seo_bridge_readable_post($type, $id) {
    if (!in_array($type, gotop_seo_bridge_post_types(), true) || !is_int($id) || $id <= 0) { return null; }
    $post = get_post($id);
    if (!$post || $post->post_type !== $type || $post->post_status !== 'publish') { return null; }
    if (isset($post->post_password) && (string) $post->post_password !== '') { return null; }
    return $post;
}

/** POST /content  body: type (post|page), page (1..), per_page (1..50), modified_after (optional, ISO date). */
function gotop_seo_bridge_route_content(\WP_REST_Request $request) {
    $body = gotop_seo_bridge_json_body($request);
    $type = isset($body['type']) ? $body['type'] : '';
    if (!in_array($type, gotop_seo_bridge_post_types(), true)) { return gotop_seo_bridge_refuse('invalid_request', 400); }
    $page = isset($body['page']) && is_int($body['page']) ? $body['page'] : 1;
    $per_page = isset($body['per_page']) && is_int($body['per_page']) ? $body['per_page'] : 25;
    if ($page < 1 || $page > 1000 || $per_page < 1 || $per_page > 50) { return gotop_seo_bridge_refuse('invalid_request', 400); }
    $args = array(
        'post_type'      => $type,
        'post_status'    => 'publish',
        'has_password'   => false,
        'posts_per_page' => $per_page,
        'paged'          => $page,
        'orderby'        => 'modified',
        'order'          => 'DESC',
        'no_found_rows'  => true,
        'ignore_sticky_posts' => true,
    );
    if (isset($body['modified_after'])) {
        $after = is_string($body['modified_after']) ? strtotime($body['modified_after']) : false;
        if (!$after) { return gotop_seo_bridge_refuse('invalid_request', 400); }
        $args['date_query'] = array(array('column' => 'post_modified_gmt', 'after' => gmdate('Y-m-d H:i:s', $after)));
    }
    $query = new \WP_Query($args);
    $out = array();
    foreach ($query->posts as $post) {
        list($focus, $source) = gotop_seo_bridge_focus_of($post->ID);
        $out[] = array(
            'id'       => (int) $post->ID,
            'type'     => $post->post_type,
            'link'     => get_permalink($post),
            'slug'     => isset($post->post_name) ? (string) $post->post_name : '',
            'title'    => gotop_seo_bridge_plain_title($post),
            'date'     => isset($post->post_date_gmt) ? (string) $post->post_date_gmt : null,
            'modified' => isset($post->post_modified_gmt) ? (string) $post->post_modified_gmt : null,
            'focus_keyword' => $focus !== '' ? $focus : null,
            'focus_source'  => $source,
        );
    }
    return new \WP_REST_Response(array('ok' => true, 'items' => $out, 'page' => $page, 'per_page' => $per_page), 200);
}

/** POST /content-item  body: type (post|page), id. The HTML the post shows (its content filters run). */
function gotop_seo_bridge_route_content_item(\WP_REST_Request $request) {
    $body = gotop_seo_bridge_json_body($request);
    $post = gotop_seo_bridge_readable_post(isset($body['type']) ? $body['type'] : '', isset($body['id']) ? $body['id'] : 0);
    if (!$post) { return gotop_seo_bridge_refuse('not_in_wordpress', 404); }
    $html = gotop_seo_bridge_rendered_content($post);
    if (strlen($html) > GOTOP_SEO_BRIDGE_ITEM_MAX) { return gotop_seo_bridge_refuse('too_large', 413); }
    return new \WP_REST_Response(array('ok' => true, 'id' => (int) $post->ID, 'content' => $html), 200);
}

/** The content as WordPress shows it (blocks, shortcodes, a page builder's output), like the REST API's content.rendered. */
function gotop_seo_bridge_rendered_content($item) {
    global $post;
    $previous = $post;
    $post = $item; // phpcs:ignore WordPress.WP.GlobalVariablesOverride.Prohibited -- restored below; the content filters read the global post, as on the post's own page.
    setup_postdata($item);
    $html = (string) apply_filters('the_content', $item->post_content); // phpcs:ignore WordPress.NamingConventions.PrefixAllGlobals.NonPrefixedHooknameFound -- WordPress core's own filter.
    $post = $previous; // phpcs:ignore WordPress.WP.GlobalVariablesOverride.Prohibited
    if ($previous) { setup_postdata($previous); } else { wp_reset_postdata(); }
    return $html;
}

/** POST /authors  The users who may publish posts: id and display name. */
function gotop_seo_bridge_route_authors(\WP_REST_Request $request) {
    $users = get_users(array(
        'capability' => array('publish_posts'),
        'fields'     => array('ID', 'display_name'),
        'orderby'    => 'display_name',
        'order'      => 'ASC',
        'number'     => 200,
    ));
    $out = array();
    foreach ((array) $users as $user) {
        $id = (int) $user->ID;
        if ($id > 0 && user_can($id, 'publish_posts')) { $out[] = array('id' => $id, 'name' => (string) $user->display_name); }
    }
    return new \WP_REST_Response(array('ok' => true, 'items' => $out, 'default' => gotop_seo_bridge_author_id()), 200);
}

/** One Media Library image as the app compares it: its address, every size's address, its alt text and title. */
function gotop_seo_bridge_describe_media($id) {
    $url = wp_get_attachment_url($id);
    $sizes = array();
    $meta = wp_get_attachment_metadata($id);
    if (is_string($url) && is_array($meta) && !empty($meta['sizes']) && is_array($meta['sizes'])) {
        $base = substr($url, 0, strrpos($url, '/') + 1);
        foreach ($meta['sizes'] as $size) {
            if (is_array($size) && !empty($size['file']) && is_string($size['file'])) { $sizes[] = $base . rawurlencode(wp_basename($size['file'])); }
        }
    }
    return array(
        'id'         => (int) $id,
        'source_url' => is_string($url) ? $url : '',
        'size_urls'  => array_values(array_unique($sizes)),
        'alt'        => (string) get_post_meta($id, '_wp_attachment_image_alt', true),
        'title'      => gotop_seo_bridge_plain_title($id),
    );
}

/** POST /media-alt  body: action search (term, by title|slug) | get (id) | set (id, alt). */
function gotop_seo_bridge_route_media_alt(\WP_REST_Request $request) {
    $body = gotop_seo_bridge_json_body($request);
    $action = isset($body['action']) ? $body['action'] : '';
    if ($action === 'search') {
        $term = isset($body['term']) ? gotop_seo_bridge_text_ok($body['term'], 2, 100) : null;
        $by = isset($body['by']) ? $body['by'] : 'title';
        if ($term === null || !in_array($by, array('title', 'slug'), true)) { return gotop_seo_bridge_refuse('invalid_request', 400); }
        $args = array(
            'post_type'      => 'attachment',
            'post_status'    => 'inherit',
            'post_mime_type' => 'image',
            'posts_per_page' => 20,
            'fields'         => 'ids',
            'no_found_rows'  => true,
        );
        if ($by === 'slug') { $args['name'] = sanitize_title($term); } else { $args['s'] = $term; }
        $out = array();
        foreach (get_posts($args) as $id) {
            if (wp_attachment_is_image((int) $id)) { $out[] = gotop_seo_bridge_describe_media((int) $id); }
        }
        return new \WP_REST_Response(array('ok' => true, 'items' => $out), 200);
    }
    $id = isset($body['id']) && is_int($body['id']) ? $body['id'] : 0;
    if ($action !== 'get' && $action !== 'set') { return gotop_seo_bridge_refuse('invalid_request', 400); }
    if ($id <= 0 || !wp_attachment_is_image($id)) { return gotop_seo_bridge_refuse('not_in_wordpress', 404); }
    if ($action === 'get') {
        return new \WP_REST_Response(array('ok' => true, 'item' => gotop_seo_bridge_describe_media($id)), 200);
    }
    // The words: plain text, at most 150 characters; empty only to put back an empty alt (undo).
    if (!isset($body['alt']) || !is_string($body['alt']) || strpos($body['alt'], '"') !== false) { return gotop_seo_bridge_refuse('value_invalid', 400); }
    $alt = $body['alt'] === '' ? '' : gotop_seo_bridge_text_ok($body['alt'], 1, 150);
    if ($alt === null) { return gotop_seo_bridge_refuse('value_invalid', 400); }
    if ($alt === '') { delete_post_meta($id, '_wp_attachment_image_alt'); }
    else { update_post_meta($id, '_wp_attachment_image_alt', wp_slash($alt)); }
    gotop_seo_bridge_log('media-' . $id, 'image_alt', $id, $alt === '' ? 'reverted' : 'applied');
    return new \WP_REST_Response(array('ok' => true, 'item' => gotop_seo_bridge_describe_media($id)), 200);
}
