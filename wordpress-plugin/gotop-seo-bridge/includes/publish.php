<?php
/**
 * 3.0.0: publishing the articles the site owner sends from GO TOP, so the site needs no
 * application password.
 *
 * Three signed routes (the same HMAC check as every other route, see auth.php):
 *   POST /gotop/v1/terms     the site's categories or tags (id, name, slug, parent), to choose from.
 *   POST /gotop/v1/media     one image, downloaded from GO TOP's file storage (only) into the
 *                            Media Library, with its alt text. The same address is downloaded once.
 *   POST /gotop/v1/publish   one article: a new post, or an update of a post this plugin created
 *                            for the same GO TOP article. Never another post, never a page.
 *
 * What it never does: delete or trash anything, change a post it did not create, change pages,
 * products, the theme, plugins, users or settings. The content goes through wp_kses_post (the
 * HTML a post may hold), whatever the request says. The author is the user the site owner chose in
 * Settings > GO TOP SEO (by default the administrator who connected the site), and only while that
 * user may still publish posts.
 *
 * 3.1.0, on /publish:
 *   status future + date_gmt   a scheduled post (the date must be ahead, within two years);
 *   new_post                   a second, separate post for an article already sent (asked for in
 *                              GO TOP); later updates name the post they mean (post_id);
 *   author_id                  the article's own author, only a user who may publish posts;
 *   adopt + post_id            the post GO TOP published for this same article before the plugin
 *                              (over an application password) becomes this plugin's post: only a
 *                              post (never a page), not trashed, and not tied to another article.
 * /terms also answers each term's address and post count, and the WooCommerce product categories
 * (product_cat) when that taxonomy exists, for the internal-link index.
 */

namespace GoTopSeoBridge;

if (!defined('ABSPATH')) { exit; }

define('GOTOP_SEO_BRIDGE_CONTENT_MAX', 2000000);
define('GOTOP_SEO_BRIDGE_IMAGE_MAX', 15 * 1024 * 1024);

/** The meta key that ties a post to the GO TOP article it was published from. */
function gotop_seo_bridge_article_meta() {
    return '_gotop_article_id';
}

/** The user articles are published as, or 0 when there is none that may publish. */
function gotop_seo_bridge_author_id() {
    $chosen = (int) get_option('gotop_seo_bridge_author', 0);
    $key = gotop_seo_bridge_get_key();
    $paired = $key && !empty($key['user_id']) ? (int) $key['user_id'] : 0;
    foreach (array($chosen, $paired) as $id) {
        if ($id > 0 && user_can($id, 'publish_posts')) { return $id; }
    }
    return 0;
}

function gotop_seo_bridge_valid_article_id($id) {
    return is_string($id) && (bool) preg_match('/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/', $id);
}

/** The post this plugin published for a GO TOP article, or null. */
function gotop_seo_bridge_post_for_article($article_id) {
    $found = get_posts(array(
        'post_type'        => 'post',
        'post_status'      => array('publish', 'draft', 'pending', 'future', 'private'),
        'meta_key'         => gotop_seo_bridge_article_meta(), // phpcs:ignore WordPress.DB.SlowDBQuery.slow_db_query_meta_key
        'meta_value'       => $article_id, // phpcs:ignore WordPress.DB.SlowDBQuery.slow_db_query_meta_value
        'posts_per_page'   => 1,
        'fields'           => 'ids',
        'no_found_rows'    => true,
    ));
    return $found ? (int) $found[0] : null;
}

/** A list of existing term ids of one taxonomy, or null when any id is not one. */
function gotop_seo_bridge_term_ids($raw, $taxonomy) {
    if ($raw === null) { return array(); }
    if (!is_array($raw) || count($raw) > 50) { return null; }
    $out = array();
    foreach ($raw as $id) {
        if (!is_int($id) || $id <= 0) { return null; }
        $term = get_term($id, $taxonomy);
        if (!$term || is_wp_error($term)) { return null; }
        $out[] = $id;
    }
    return array_values(array_unique($out));
}

/** Script and style elements removed whole (wp_kses_post removes the tags but would keep their text). */
function gotop_seo_bridge_drop_code_blocks($html) {
    $out = preg_replace('#<(script|style)\b[^>]*>.*?</\1\s*>#is', '', $html);
    return is_string($out) ? $out : '';
}

/** POST /terms */
function gotop_seo_bridge_route_terms(\WP_REST_Request $request) {
    $body = gotop_seo_bridge_json_body($request);
    $taxonomy = isset($body['taxonomy']) ? $body['taxonomy'] : '';
    $known = array('category', 'post_tag');
    if ($taxonomy === 'product_cat' && taxonomy_exists('product_cat')) { $known[] = 'product_cat'; }
    if (!in_array($taxonomy, $known, true)) { return gotop_seo_bridge_refuse('invalid_request', 400); }
    $terms = get_terms(array('taxonomy' => $taxonomy, 'hide_empty' => false, 'number' => 1000));
    $out = array();
    if (is_array($terms)) {
        foreach ($terms as $term) {
            $link = get_term_link($term);
            $out[] = array('id' => (int) $term->term_id, 'name' => $term->name, 'slug' => $term->slug, 'parent' => (int) $term->parent,
                'link' => is_string($link) ? $link : '', 'count' => isset($term->count) ? (int) $term->count : 0);
        }
    }
    return new \WP_REST_Response(array('ok' => true, 'items' => $out), 200);
}

/** POST /media */
function gotop_seo_bridge_route_media(\WP_REST_Request $request) {
    $result = gotop_seo_bridge_import_image(gotop_seo_bridge_json_body($request));
    return new \WP_REST_Response($result, empty($result['ok']) ? gotop_seo_bridge_status_for($result['code']) : 200);
}

/**
 * Images come only from GO TOP's file storage (its public Supabase storage), so the plugin can
 * never be told to fetch another address. The filter exists for a GO TOP storage move or a test
 * site; it can narrow or replace the list, and every entry is still https only.
 */
function gotop_seo_bridge_image_sources() {
    $sources = apply_filters('gotop_seo_bridge_image_sources', array('https://pmzicbtulloeynsosseh.supabase.co/storage/v1/object/public/'));
    return array_values(array_filter((array) $sources, function ($p) { return is_string($p) && stripos($p, 'https://') === 0; }));
}

function gotop_seo_bridge_image_source_ok($url) {
    foreach (gotop_seo_bridge_image_sources() as $prefix) {
        if (strpos($url, $prefix) === 0 && strpos(substr($url, strlen($prefix)), '..') === false) { return true; }
    }
    return false;
}

/**
 * Download one image into the Media Library. The address must be https and not on a private or
 * local network (wp_safe_remote_get refuses those); only JPEG, PNG, WebP and GIF, at most 15 MB.
 */
function gotop_seo_bridge_import_image($body) {
    $url = isset($body['url']) ? $body['url'] : '';
    if (!is_string($url) || strlen($url) > 2048 || !preg_match('#^https://#i', $url) || preg_match('/["\'<>\s\\\\]/', $url)) {
        return array('ok' => false, 'code' => 'value_invalid');
    }
    if (!gotop_seo_bridge_image_source_ok($url)) { return array('ok' => false, 'code' => 'off_site'); }
    $alt = isset($body['alt']) ? gotop_seo_bridge_text_ok($body['alt'], 0, 250) : '';
    if ($alt === null) { return array('ok' => false, 'code' => 'value_invalid'); }
    $source_key = hash('sha256', $url);

    $existing = get_posts(array(
        'post_type'      => 'attachment',
        'post_status'    => 'inherit',
        'meta_key'       => '_gotop_source', // phpcs:ignore WordPress.DB.SlowDBQuery.slow_db_query_meta_key
        'meta_value'     => $source_key, // phpcs:ignore WordPress.DB.SlowDBQuery.slow_db_query_meta_value
        'posts_per_page' => 1,
        'fields'         => 'ids',
        'no_found_rows'  => true,
    ));
    if ($existing) {
        $id = (int) $existing[0];
        return array('ok' => true, 'status' => 'already', 'media_id' => $id, 'url' => wp_get_attachment_url($id));
    }

    require_once ABSPATH . 'wp-admin/includes/file.php';
    require_once ABSPATH . 'wp-admin/includes/media.php';
    require_once ABSPATH . 'wp-admin/includes/image.php';

    $tmp = download_url($url, 30);
    if (is_wp_error($tmp)) { return array('ok' => false, 'code' => 'download_failed'); }
    $size = filesize($tmp);
    $name = sanitize_file_name(wp_basename((string) wp_parse_url($url, PHP_URL_PATH)));
    $check = wp_check_filetype_and_ext($tmp, $name !== '' ? $name : 'image.jpg');
    $allowed = array('image/jpeg', 'image/png', 'image/webp', 'image/gif');
    $real = function_exists('wp_get_image_mime') ? wp_get_image_mime($tmp) : $check['type'];
    if (!$size || $size > GOTOP_SEO_BRIDGE_IMAGE_MAX || !in_array($real, $allowed, true)) {
        wp_delete_file($tmp);
        return array('ok' => false, 'code' => 'not_an_image');
    }
    $ext = array('image/jpeg' => 'jpg', 'image/png' => 'png', 'image/webp' => 'webp', 'image/gif' => 'gif');
    if ($name === '' || !preg_match('/\.(jpe?g|png|webp|gif)$/i', $name)) {
        $name = 'gotop-image-' . substr($source_key, 0, 12) . '.' . $ext[$real];
    }
    $id = media_handle_sideload(array('name' => $name, 'tmp_name' => $tmp), 0, $alt !== '' ? $alt : null);
    if (is_wp_error($id)) {
        wp_delete_file($tmp);
        return array('ok' => false, 'code' => 'write_failed');
    }
    update_post_meta($id, '_gotop_source', $source_key);
    if ($alt !== '') { update_post_meta($id, '_wp_attachment_image_alt', $alt); }
    return array('ok' => true, 'status' => 'applied', 'media_id' => (int) $id, 'url' => wp_get_attachment_url($id));
}

/** POST /publish */
function gotop_seo_bridge_route_publish(\WP_REST_Request $request) {
    $result = gotop_seo_bridge_publish_article(gotop_seo_bridge_json_body($request));
    return new \WP_REST_Response($result, empty($result['ok']) ? gotop_seo_bridge_status_for($result['code']) : 200);
}

/**
 * Publish (or update) one article. Returns array('ok' => true, 'status' => 'created'|'updated',
 * 'post_id', 'link', 'post_status') or array('ok' => false, 'code' => ...).
 */
function gotop_seo_bridge_publish_article($body) {
    $article_id = isset($body['article_id']) ? $body['article_id'] : '';
    if (!gotop_seo_bridge_valid_article_id($article_id)) { return array('ok' => false, 'code' => 'invalid_request'); }

    $title = isset($body['title']) ? gotop_seo_bridge_text_ok($body['title'], 1, 300) : null;
    $content = isset($body['content']) && is_string($body['content']) ? $body['content'] : null;
    $status = isset($body['status']) ? $body['status'] : 'draft';
    if ($title === null || $content === null || trim($content) === '' || strlen($content) > GOTOP_SEO_BRIDGE_CONTENT_MAX
        || !in_array($status, array('publish', 'draft', 'future'), true)) {
        return array('ok' => false, 'code' => 'value_invalid');
    }
    // 3.1.0: a scheduled post needs its date (GMT), ahead of now and at most two years away.
    $date_gmt = null;
    if ($status === 'future' || isset($body['date_gmt'])) {
        $date_gmt = gotop_seo_bridge_future_date(isset($body['date_gmt']) ? $body['date_gmt'] : null);
        if ($date_gmt === null || $status !== 'future') { return array('ok' => false, 'code' => 'date_invalid'); }
    }
    $excerpt = isset($body['excerpt']) && $body['excerpt'] !== '' ? gotop_seo_bridge_text_ok($body['excerpt'], 1, 1000) : '';
    $slug = isset($body['slug']) && is_string($body['slug']) ? sanitize_title(rawurldecode($body['slug'])) : '';
    $categories = gotop_seo_bridge_term_ids(isset($body['categories']) ? $body['categories'] : null, 'category');
    $tags = gotop_seo_bridge_term_ids(isset($body['tags']) ? $body['tags'] : null, 'post_tag');
    if ($excerpt === null || $categories === null || $tags === null) { return array('ok' => false, 'code' => 'value_invalid'); }
    $featured = isset($body['featured_media']) ? $body['featured_media'] : null;
    if ($featured !== null && (!is_int($featured) || $featured <= 0 || !wp_attachment_is_image($featured))) {
        return array('ok' => false, 'code' => 'value_invalid');
    }

    // 3.1.0: the article's own author, checked here (a user who may publish posts), else the default.
    if (isset($body['author_id']) && $body['author_id'] !== null) {
        if (!is_int($body['author_id']) || $body['author_id'] <= 0 || !user_can($body['author_id'], 'publish_posts')) { return array('ok' => false, 'code' => 'author_invalid'); }
        $author = $body['author_id'];
    } else {
        $author = gotop_seo_bridge_author_id();
    }
    if (!$author) { return array('ok' => false, 'code' => 'no_author'); }

    $new_post = isset($body['new_post']) && $body['new_post'] === true;
    $adopt = isset($body['adopt']) && $body['adopt'] === true;
    $named = isset($body['post_id']) && $body['post_id'] !== null ? $body['post_id'] : null;
    if ($named !== null && (!is_int($named) || $named <= 0)) { return array('ok' => false, 'code' => 'not_ours'); }
    if ($new_post && $named !== null) { return array('ok' => false, 'code' => 'invalid_request'); }
    $adopted = false;
    if ($new_post) {
        // A second, separate post for this article (3.1.0): never an update of another one.
        $post_id = null;
    } elseif ($named !== null) {
        // An update only of a post published for this same article (3.0.0 kept one; 3.1.0 may keep more).
        $post_id = gotop_seo_bridge_post_is_for_article($named, $article_id) ? $named : null;
        if (!$post_id && $adopt && gotop_seo_bridge_may_adopt($named)) { $post_id = $named; $adopted = true; }
        if (!$post_id) { return array('ok' => false, 'code' => 'not_ours'); }
    } else {
        $post_id = gotop_seo_bridge_post_for_article($article_id);
    }

    $postarr = array(
        'post_type'    => 'post',
        'post_title'   => $title,
        'post_content' => wp_kses_post(gotop_seo_bridge_drop_code_blocks($content)),
        'post_excerpt' => (string) $excerpt,
        'post_status'  => $status,
        'post_author'  => $author,
    );
    if ($slug !== '') { $postarr['post_name'] = $slug; }
    if ($date_gmt !== null) {
        $postarr['post_date_gmt'] = $date_gmt;
        $postarr['post_date'] = get_date_from_gmt($date_gmt);
        $postarr['edit_date'] = true;
    }
    if ($categories) { $postarr['post_category'] = $categories; }
    if ($tags) { $postarr['tags_input'] = $tags; }
    if ($post_id) {
        $postarr['ID'] = $post_id;
        $written = wp_update_post(wp_slash($postarr), true);
    } else {
        $written = wp_insert_post(wp_slash($postarr), true);
    }
    if (is_wp_error($written) || !$written) { return array('ok' => false, 'code' => 'write_failed'); }
    $written = (int) $written;
    update_post_meta($written, gotop_seo_bridge_article_meta(), $article_id);
    if ($featured) { set_post_thumbnail($written, $featured); }
    gotop_seo_bridge_log($article_id, 'publish', $written, $adopted ? 'adopted' : ($post_id ? 'updated' : 'created'));
    return array(
        'ok'          => true,
        'status'      => $post_id ? 'updated' : 'created',
        'post_id'     => $written,
        'link'        => get_permalink($written),
        'post_status' => get_post_status($written),
    );
}

/** The post exists, is a post, and was published by this plugin for this article. */
function gotop_seo_bridge_post_is_for_article($post_id, $article_id) {
    $post = get_post($post_id);
    if (!$post || $post->post_type !== 'post' || $post->post_status === 'trash') { return false; }
    return (string) get_post_meta($post_id, gotop_seo_bridge_article_meta(), true) === $article_id;
}

/**
 * A post GO TOP published before the plugin (over an application password) may become this
 * plugin's post for the article: a post (never a page or a product), not trashed, and not already
 * tied to another GO TOP article. The app sends it only for the post id it recorded for that article.
 */
function gotop_seo_bridge_may_adopt($post_id) {
    $post = get_post($post_id);
    if (!$post || $post->post_type !== 'post' || $post->post_status === 'trash') { return false; }
    return (string) get_post_meta($post_id, gotop_seo_bridge_article_meta(), true) === '';
}

/** "YYYY-MM-DD HH:MM:SS" (or the same with a T and a trailing Z), GMT, ahead of now and within two years; else null. */
function gotop_seo_bridge_future_date($raw) {
    if (!is_string($raw) || !preg_match('/^(\d{4}-\d{2}-\d{2})[ T](\d{2}:\d{2}:\d{2})(?:\.\d{1,6})?Z?$/', $raw, $m)) { return null; }
    $at = strtotime($m[1] . ' ' . $m[2] . ' UTC');
    if (!$at || $at < time() + 60 || $at > time() + 2 * 366 * 86400) { return null; }
    return gmdate('Y-m-d H:i:s', $at);
}
