<?php
/**
 * The eleven fixes, and nothing else (nine since 2.0.0; h1_demote and llms_txt since 2.1.0).
 *
 * gotop_seo_bridge_fix_types() is the closed list. A request for any other type is refused
 * before anything is read. Each value is re-validated here (the app validated it too, but this
 * plugin never relies on that). Before any write the previous value is stored in the post's
 * meta "_gotop_fix_<job id>", which is what /undo restores from.
 *
 * Never: deleting content, touching prices or products (only posts and pages are written, see
 * gotop_seo_bridge_post_types()), the theme, plugins, options other than this plugin's own,
 * users, or a post's status (wp_update_post is called with the ID and the content only).
 */

if (!defined('ABSPATH')) { exit; }

function gotop_seo_bridge_fix_types() {
    return array(
        'seo_title',
        'meta_description',
        'canonical',
        'focus_keyphrase',
        'image_alt',
        'faq_block',
        'schema_jsonld',
        'broken_link',
        'internal_link',
        'h1_demote',
        'llms_txt',
    );
}

function gotop_seo_bridge_meta_types() {
    return array('seo_title', 'meta_description', 'canonical', 'focus_keyphrase', 'schema_jsonld');
}

/** Post types a fix may write to. Products and other types are left alone. */
function gotop_seo_bridge_post_types() {
    $types = apply_filters('gotop_seo_bridge_post_types', array('post', 'page'));
    return array_values(array_intersect((array) $types, array('post', 'page')));
}

function gotop_seo_bridge_schema_types() {
    return array('Organization', 'LocalBusiness', 'WebSite', 'WebPage', 'AboutPage', 'ContactPage', 'Article',
        'BlogPosting', 'NewsArticle', 'FAQPage', 'BreadcrumbList', 'Person', 'Service', 'Question', 'Answer',
        'ListItem', 'PostalAddress', 'ImageObject', 'SearchAction', 'EntryPoint', 'ContactPoint');
}

function gotop_seo_bridge_seo_plugin() {
    if (defined('WPSEO_VERSION')) { return 'yoast'; }
    if (defined('RANK_MATH_VERSION') || class_exists('RankMath')) { return 'rankmath'; }
    return 'none';
}

/** Where a meta fix is stored: the active SEO plugin's own field, or this plugin's. */
function gotop_seo_bridge_meta_key($type, $seo_plugin) {
    $keys = array(
        'seo_title'        => array('yoast' => '_yoast_wpseo_title', 'rankmath' => 'rank_math_title', 'none' => '_gotop_seo_title'),
        'meta_description' => array('yoast' => '_yoast_wpseo_metadesc', 'rankmath' => 'rank_math_description', 'none' => '_gotop_seo_description'),
        'canonical'        => array('yoast' => '_yoast_wpseo_canonical', 'rankmath' => 'rank_math_canonical_url', 'none' => '_gotop_canonical'),
        'focus_keyphrase'  => array('yoast' => '_yoast_wpseo_focuskw', 'rankmath' => 'rank_math_focus_keyword', 'none' => '_gotop_focus_keyphrase'),
    );
    if ($type === 'schema_jsonld') { return '_gotop_schema_jsonld'; }
    return isset($keys[$type][$seo_plugin]) ? $keys[$type][$seo_plugin] : null;
}

function gotop_seo_bridge_home_host() {
    $host = parse_url(home_url('/'), PHP_URL_HOST);
    return preg_replace('/^www\./', '', strtolower((string) $host));
}

/** An absolute http(s) address on this site, or null. */
function gotop_seo_bridge_on_site($url) {
    if (!is_string($url) || strlen($url) > 2048 || !preg_match('#^https?://#i', $url)) { return null; }
    if (preg_match('/["\'<>\s\\\\]/', $url)) { return null; }
    $host = parse_url($url, PHP_URL_HOST);
    if (!$host || preg_replace('/^www\./', '', strtolower($host)) !== gotop_seo_bridge_home_host()) { return null; }
    return $url;
}

function gotop_seo_bridge_plain($v) {
    return trim(preg_replace('/\s+/u', ' ', preg_replace('/[\x00-\x1f\x7f]/', ' ', (string) $v)));
}

function gotop_seo_bridge_text_ok($raw, $min, $max) {
    if (!is_string($raw) || preg_match('/[<>]/', $raw)) { return null; }
    $v = gotop_seo_bridge_plain($raw);
    $len = function_exists('mb_strlen') ? mb_strlen($v, 'UTF-8') : strlen($v);
    return ($len >= $min && $len <= $max) ? $v : null;
}

function gotop_seo_bridge_schema_ok($node, $depth, &$budget) {
    if ($depth > 8 || ++$budget > 400) { return false; }
    if ($node === null || is_bool($node) || is_int($node) || is_float($node)) { return true; }
    if (is_string($node)) { return strlen($node) <= 6000 && !preg_match('/[<>]/', $node); }
    if (!is_array($node)) { return false; }
    if (count($node) > 50) { return false; }
    foreach ($node as $k => $v) {
        if (is_string($k)) {
            if (!preg_match('/^@?[A-Za-z][A-Za-z0-9_]{0,63}$/', $k)) { return false; }
            if ($k === '@type') {
                $types = is_array($v) ? $v : array($v);
                foreach ($types as $t) {
                    if (!is_string($t) || !in_array($t, gotop_seo_bridge_schema_types(), true)) { return false; }
                }
                continue;
            }
        }
        if (!gotop_seo_bridge_schema_ok($v, $depth + 1, $budget)) { return false; }
    }
    return true;
}

/**
 * The request's fix, validated. Returns array('type' => ..., 'value' => ...) or a string code.
 */
function gotop_seo_bridge_validate_fix($type, $value) {
    if (!in_array($type, gotop_seo_bridge_fix_types(), true)) { return 'not_allowed'; }
    if (!is_array($value)) { return 'value_invalid'; }
    $allowed_keys = array(
        'seo_title' => array('value'), 'meta_description' => array('value'), 'canonical' => array('value'),
        'focus_keyphrase' => array('value'), 'image_alt' => array('images'), 'faq_block' => array('items', 'heading'),
        'schema_jsonld' => array('schema'), 'broken_link' => array('href', 'replacement'),
        'internal_link' => array('target', 'anchor'), 'h1_demote' => array('headings'), 'llms_txt' => array('text'),
    );
    foreach (array_keys($value) as $k) {
        if (!in_array($k, $allowed_keys[$type], true)) { return 'not_allowed'; }
    }
    switch ($type) {
        case 'seo_title':
            $v = gotop_seo_bridge_text_ok(isset($value['value']) ? $value['value'] : null, 1, 120);
            return $v === null ? 'value_invalid' : array('type' => $type, 'value' => $v);
        case 'meta_description':
            $v = gotop_seo_bridge_text_ok(isset($value['value']) ? $value['value'] : null, 1, 320);
            return $v === null ? 'value_invalid' : array('type' => $type, 'value' => $v);
        case 'focus_keyphrase':
            $v = gotop_seo_bridge_text_ok(isset($value['value']) ? $value['value'] : null, 2, 100);
            return $v === null ? 'value_invalid' : array('type' => $type, 'value' => $v);
        case 'canonical':
            $v = gotop_seo_bridge_on_site(isset($value['value']) ? $value['value'] : null);
            return $v === null ? 'off_site' : array('type' => $type, 'value' => $v);
        case 'image_alt':
            $images = isset($value['images']) ? $value['images'] : null;
            if (!is_array($images) || count($images) < 1 || count($images) > 20) { return 'value_invalid'; }
            $out = array();
            foreach ($images as $img) {
                if (!is_array($img) || array_diff(array_keys($img), array('src', 'alt'))) { return 'not_allowed'; }
                $src = isset($img['src']) && is_string($img['src']) ? trim($img['src']) : '';
                if ($src === '' || strlen($src) > 2048 || preg_match('/["<>\s]/', $src) || preg_match('/^(javascript|data|vbscript):/i', $src)) { return 'value_invalid'; }
                if (isset($img['alt']) && is_string($img['alt']) && strpos($img['alt'], '"') !== false) { return 'value_invalid'; }
                $alt = gotop_seo_bridge_text_ok(isset($img['alt']) ? $img['alt'] : null, 1, 150);
                if ($alt === null) { return 'value_invalid'; }
                $out[] = array('src' => $src, 'alt' => $alt);
            }
            return array('type' => $type, 'value' => $out);
        case 'faq_block':
            $items = isset($value['items']) ? $value['items'] : null;
            if (!is_array($items) || count($items) < 1 || count($items) > 8) { return 'value_invalid'; }
            $heading = gotop_seo_bridge_text_ok(isset($value['heading']) ? $value['heading'] : null, 2, 80);
            if ($heading === null) { return 'value_invalid'; }
            $out = array();
            foreach ($items as $item) {
                if (!is_array($item) || array_diff(array_keys($item), array('q', 'a'))) { return 'not_allowed'; }
                $q = gotop_seo_bridge_text_ok(isset($item['q']) ? $item['q'] : null, 5, 200);
                $a = gotop_seo_bridge_text_ok(isset($item['a']) ? $item['a'] : null, 10, 1200);
                if ($q === null || $a === null) { return 'value_invalid'; }
                $out[] = array('q' => $q, 'a' => $a);
            }
            return array('type' => $type, 'value' => array('heading' => $heading, 'items' => $out));
        case 'schema_jsonld':
            $schema = isset($value['schema']) ? $value['schema'] : null;
            if (!is_array($schema) || !isset($schema['@context'])
                || !in_array($schema['@context'], array('https://schema.org', 'http://schema.org'), true)) { return 'value_invalid'; }
            $nodes = isset($schema['@graph']) && is_array($schema['@graph']) ? $schema['@graph'] : array($schema);
            if (count($nodes) < 1) { return 'value_invalid'; }
            foreach ($nodes as $n) { if (!is_array($n) || !isset($n['@type'])) { return 'value_invalid'; } }
            $budget = 0;
            if (!gotop_seo_bridge_schema_ok($schema, 0, $budget)) { return 'value_invalid'; }
            $json = wp_json_encode($schema, JSON_UNESCAPED_SLASHES | JSON_UNESCAPED_UNICODE);
            if (!is_string($json) || strlen($json) > 16000) { return 'value_invalid'; }
            return array('type' => $type, 'value' => $json);
        case 'broken_link':
            $href = gotop_seo_bridge_on_site(isset($value['href']) ? $value['href'] : null);
            if ($href === null) { return 'off_site'; }
            $replacement = null;
            if (isset($value['replacement']) && $value['replacement'] !== null && $value['replacement'] !== '') {
                $replacement = gotop_seo_bridge_on_site($value['replacement']);
                if ($replacement === null) { return 'off_site'; }
                if ($replacement === $href) { return 'value_invalid'; }
            }
            return array('type' => $type, 'value' => array('href' => $href, 'replacement' => $replacement));
        case 'internal_link':
            $target = gotop_seo_bridge_on_site(isset($value['target']) ? $value['target'] : null);
            if ($target === null) { return 'off_site'; }
            $anchor = gotop_seo_bridge_text_ok(isset($value['anchor']) ? $value['anchor'] : null, 2, 80);
            if ($anchor === null) { return 'value_invalid'; }
            return array('type' => $type, 'value' => array('target' => $target, 'anchor' => $anchor));
        case 'h1_demote':
            // Which main headings of the post's own content become subheadings: by their place among
            // the content's <h1> tags AND their exact words (a page changed since is refused).
            $headings = isset($value['headings']) ? $value['headings'] : null;
            if (!is_array($headings) || count($headings) < 1 || count($headings) > 10) { return 'value_invalid'; }
            $out = array();
            $seen = array();
            foreach ($headings as $h) {
                if (!is_array($h) || array_diff(array_keys($h), array('n', 'text'))) { return 'not_allowed'; }
                if (!isset($h['n']) || !is_int($h['n']) || $h['n'] < 0 || $h['n'] > 49 || isset($seen[$h['n']])) { return 'value_invalid'; }
                $text = gotop_seo_bridge_text_ok(isset($h['text']) ? $h['text'] : null, 1, 300);
                if ($text === null) { return 'value_invalid'; }
                $seen[$h['n']] = true;
                $out[] = array('n' => $h['n'], 'text' => $text);
            }
            return array('type' => $type, 'value' => $out);
        case 'llms_txt':
            $text = gotop_seo_bridge_llms_text_ok(isset($value['text']) ? $value['text'] : null);
            return $text === null ? 'value_invalid' : array('type' => $type, 'value' => $text);
    }
    return 'not_allowed';
}

/** The post behind an address on this site (posts and pages only), or a string code. */
function gotop_seo_bridge_resolve_post($url) {
    if (gotop_seo_bridge_on_site($url) === null) { return 'off_site'; }
    $path = (string) parse_url($url, PHP_URL_PATH);
    $id = 0;
    if (trim($path, '/') === '' && get_option('show_on_front') === 'page') {
        $id = (int) get_option('page_on_front');
    } else {
        $id = (int) url_to_postid($url);
    }
    if ($id <= 0) { return 'not_in_wordpress'; }
    $post = get_post($id);
    if (!$post || !in_array($post->post_type, gotop_seo_bridge_post_types(), true)) { return 'not_in_wordpress'; }
    return $post;
}

function gotop_seo_bridge_describe_post($post) {
    $seo = gotop_seo_bridge_seo_plugin();
    $read = function ($type) use ($post, $seo) {
        $key = gotop_seo_bridge_meta_key($type, $seo);
        return $key ? (string) get_post_meta($post->ID, $key, true) : '';
    };
    $schema = (string) get_post_meta($post->ID, '_gotop_schema_jsonld', true);
    // 2.1.0: the content's own main headings (their words, in order; null when the markup is not
    // simple) and whether a page builder renders this page, for the app's H1 preview.
    $h1 = gotop_seo_bridge_h1_list($post->post_content);
    $h1_words = null;
    if ($h1 !== null) {
        $h1_words = array();
        foreach ($h1 as $el) { $h1_words[] = gotop_seo_bridge_words($el['inner']); }
    }
    return array(
        'post_id'     => (int) $post->ID,
        'post_type'   => $post->post_type,
        'link'        => get_permalink($post),
        'title'       => $post->post_title,
        'content'     => $post->post_content,
        'content_sha' => hash('sha256', $post->post_content),
        'seo_plugin'  => $seo,
        'seo'         => array(
            'title'       => $read('seo_title'),
            'description' => $read('meta_description'),
            'canonical'   => $read('canonical'),
            'focus'       => $read('focus_keyphrase'),
            'schema'      => $schema,
        ),
        'h1'          => $h1_words,
        'builder'     => gotop_seo_bridge_builder_page($post->ID, $post->post_content),
    );
}

function gotop_seo_bridge_valid_job($job_id) {
    return is_string($job_id) && preg_match('/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/', $job_id);
}

function gotop_seo_bridge_backup_key($job_id) {
    return '_gotop_fix_' . $job_id;
}

function gotop_seo_bridge_read_backup($post_id, $job_id) {
    $raw = get_post_meta($post_id, gotop_seo_bridge_backup_key($job_id), true);
    $decoded = is_string($raw) ? json_decode($raw, true) : null;
    return is_array($decoded) ? $decoded : null;
}

function gotop_seo_bridge_write_backup($post_id, $job_id, $backup) {
    update_post_meta($post_id, gotop_seo_bridge_backup_key($job_id), wp_slash(wp_json_encode($backup)));
}

function gotop_seo_bridge_log($job_id, $type, $post_id, $action) {
    $log = get_option('gotop_seo_bridge_log');
    if (!is_array($log)) { $log = array(); }
    array_unshift($log, array('job' => $job_id, 'type' => $type, 'post_id' => (int) $post_id, 'action' => $action, 'at' => time()));
    $log = array_slice($log, 0, 50);
    if (get_option('gotop_seo_bridge_log') === false) { add_option('gotop_seo_bridge_log', $log, '', 'no'); }
    else { update_option('gotop_seo_bridge_log', $log, 'no'); }
}

/** Write a post's content ONLY (the status, author, dates and everything else stay). */
function gotop_seo_bridge_write_content($post_id, $content) {
    // Without a signed-in user WordPress would pass the content through kses and strip what an
    // editor put there on purpose (an embed, a form). The merchant's content is kept as it is.
    $kses = has_filter('content_save_pre', 'wp_filter_post_kses') !== false;
    if ($kses) { kses_remove_filters(); }
    $result = wp_update_post(array('ID' => $post_id, 'post_content' => wp_slash($content)), true);
    if ($kses) { kses_init_filters(); }
    if (is_wp_error($result) || !$result) { return false; }
    clean_post_cache($post_id);
    return true;
}

function gotop_seo_bridge_current_content($post_id) {
    clean_post_cache($post_id);
    $post = get_post($post_id);
    return $post ? (string) $post->post_content : '';
}

/**
 * Apply one approved fix. $body = array(job_id, type, url, value, expected?).
 * 'expected' is the compare-and-set value from the preview: the previous meta value for a meta fix,
 * the SHA-256 of the content for a content fix. A page changed since is refused.
 */
function gotop_seo_bridge_apply_fix($body) {
    $job_id = isset($body['job_id']) ? $body['job_id'] : null;
    if (!gotop_seo_bridge_valid_job($job_id)) { return array('ok' => false, 'code' => 'invalid_request'); }
    $type = isset($body['type']) ? $body['type'] : '';
    $fix = gotop_seo_bridge_validate_fix($type, isset($body['value']) ? $body['value'] : null);
    if (is_string($fix)) { return array('ok' => false, 'code' => $fix); }
    // llms.txt belongs to the site, not to a post: its own store, backup and undo (includes/llms.php).
    if ($type === 'llms_txt') { return gotop_seo_bridge_llms_apply($job_id, isset($body['url']) ? $body['url'] : '', $fix['value'], isset($body['expected']) && is_string($body['expected']) ? $body['expected'] : null); }
    $post = gotop_seo_bridge_resolve_post(isset($body['url']) ? $body['url'] : '');
    if (is_string($post)) { return array('ok' => false, 'code' => $post); }
    $expected = isset($body['expected']) && is_string($body['expected']) ? $body['expected'] : null;
    $existing = gotop_seo_bridge_read_backup($post->ID, $job_id);
    if ($existing && empty($existing['undone'])) {
        return array('ok' => true, 'status' => 'already', 'fix_id' => $job_id, 'post_id' => (int) $post->ID);
    }

    if (in_array($type, gotop_seo_bridge_meta_types(), true)) {
        $seo = gotop_seo_bridge_seo_plugin();
        $key = gotop_seo_bridge_meta_key($type, $seo);
        $previous = (string) get_post_meta($post->ID, $key, true);
        $new = $fix['value'];
        if ($previous === $new) {
            return array('ok' => true, 'status' => 'already', 'fix_id' => $job_id, 'post_id' => (int) $post->ID, 'previous' => $previous, 'applied' => $new);
        }
        if ($expected !== null && $expected !== $previous) { return array('ok' => false, 'code' => 'changed_since_preview'); }
        // The previous value is stored BEFORE the write.
        gotop_seo_bridge_write_backup($post->ID, $job_id, array('type' => $type, 'key' => $key, 'previous' => $previous, 'value' => $new, 'at' => time()));
        update_post_meta($post->ID, $key, wp_slash($new));
        $applied = (string) get_post_meta($post->ID, $key, true);
        if ($applied !== $new) {
            delete_post_meta($post->ID, gotop_seo_bridge_backup_key($job_id));
            return array('ok' => false, 'code' => 'write_failed');
        }
        gotop_seo_bridge_log($job_id, $type, $post->ID, 'applied');
        return array('ok' => true, 'status' => 'applied', 'fix_id' => $job_id, 'post_id' => (int) $post->ID,
            'where' => $seo === 'none' ? 'gotop' : $seo, 'previous' => $previous, 'applied' => $applied);
    }

    $content = (string) $post->post_content;
    $sha = hash('sha256', $content);
    if ($expected !== null && $expected !== $sha) { return array('ok' => false, 'code' => 'changed_since_preview'); }
    $host = gotop_seo_bridge_home_host();
    $block = null;
    switch ($type) {
        case 'image_alt':
            list($next, $count) = gotop_seo_bridge_set_missing_alts($content, $fix['value']);
            if ($count === 0) { return array('ok' => true, 'status' => 'already', 'fix_id' => $job_id, 'post_id' => (int) $post->ID); }
            break;
        case 'faq_block':
            $block = gotop_seo_bridge_faq_block($job_id, $fix['value']['heading'], $fix['value']['items']);
            $next = gotop_seo_bridge_append_block($content, $block);
            break;
        case 'broken_link':
            list($next, $count) = gotop_seo_bridge_fix_broken_link($content, $fix['value']['href'], $fix['value']['replacement'], $host);
            if ($count === 0) { return array('ok' => false, 'code' => 'nothing_to_change'); }
            break;
        case 'internal_link':
            if (gotop_seo_bridge_links_to($content, $fix['value']['target'], $host)) {
                return array('ok' => true, 'status' => 'already', 'fix_id' => $job_id, 'post_id' => (int) $post->ID);
            }
            $next = gotop_seo_bridge_add_internal_link($content, $fix['value']['target'], $fix['value']['anchor']);
            if ($next === null) { return array('ok' => false, 'code' => 'no_safe_place'); }
            break;
        case 'h1_demote':
            // Only a post's own content, never a page-builder page (the builder renders from its own
            // data, so a change here would not show, or would be overwritten on the next save).
            if (gotop_seo_bridge_builder_page($post->ID, $content)) { return array('ok' => false, 'code' => 'builder_page'); }
            $demoted = gotop_seo_bridge_demote_h1s($content, $fix['value']);
            if (empty($demoted['ok'])) { return array('ok' => false, 'code' => $demoted['code']); }
            $next = $demoted['content'];
            break;
        default:
            return array('ok' => false, 'code' => 'not_allowed');
    }

    // The previous content is stored BEFORE the write.
    gotop_seo_bridge_write_backup($post->ID, $job_id, array('type' => $type, 'previous_content' => $content, 'previous_sha' => $sha, 'block' => $block, 'at' => time()));
    if (!gotop_seo_bridge_write_content($post->ID, $next)) {
        delete_post_meta($post->ID, gotop_seo_bridge_backup_key($job_id));
        return array('ok' => false, 'code' => 'write_failed');
    }
    $stored = gotop_seo_bridge_current_content($post->ID);
    $backup = gotop_seo_bridge_read_backup($post->ID, $job_id);
    $backup['new_sha'] = hash('sha256', $stored);
    gotop_seo_bridge_write_backup($post->ID, $job_id, $backup);
    gotop_seo_bridge_log($job_id, $type, $post->ID, 'applied');
    return array('ok' => true, 'status' => 'applied', 'fix_id' => $job_id, 'post_id' => (int) $post->ID,
        'previous_sha' => $sha, 'content_sha' => $backup['new_sha']);
}

/** Undo one fix this plugin applied: body = array(job_id, url). */
function gotop_seo_bridge_undo_fix($body) {
    $job_id = isset($body['job_id']) ? $body['job_id'] : null;
    if (!gotop_seo_bridge_valid_job($job_id)) { return array('ok' => false, 'code' => 'invalid_request'); }
    if (gotop_seo_bridge_llms_backup($job_id) !== null) { return gotop_seo_bridge_llms_undo($job_id); }
    $post = gotop_seo_bridge_resolve_post(isset($body['url']) ? $body['url'] : '');
    if (is_string($post)) { return array('ok' => false, 'code' => $post); }
    $backup = gotop_seo_bridge_read_backup($post->ID, $job_id);
    if (!$backup || empty($backup['type'])) { return array('ok' => false, 'code' => 'nothing_to_undo'); }
    if (!empty($backup['undone'])) { return array('ok' => true, 'status' => 'already', 'fix_id' => $job_id); }

    if (isset($backup['key'])) {
        $current = (string) get_post_meta($post->ID, $backup['key'], true);
        // Someone changed the field after the fix: their value stays; nothing is overwritten.
        if ($current !== (string) $backup['value']) { return array('ok' => false, 'code' => 'changed_since_preview'); }
        if ((string) $backup['previous'] === '') { delete_post_meta($post->ID, $backup['key']); }
        else { update_post_meta($post->ID, $backup['key'], wp_slash((string) $backup['previous'])); }
        if ((string) get_post_meta($post->ID, $backup['key'], true) !== (string) $backup['previous']) {
            return array('ok' => false, 'code' => 'write_failed');
        }
    } else {
        $current = gotop_seo_bridge_current_content($post->ID);
        if (isset($backup['new_sha']) && hash('sha256', $current) === $backup['new_sha']) {
            $restore = (string) $backup['previous_content'];
        } elseif (!empty($backup['block'])) {
            // The page was edited since, but the FAQ block is still there exactly as added: remove only it.
            $restore = gotop_seo_bridge_remove_block($current, $backup['block']);
            if ($restore === null) { return array('ok' => false, 'code' => 'changed_since_preview'); }
        } else {
            return array('ok' => false, 'code' => 'changed_since_preview');
        }
        if (!gotop_seo_bridge_write_content($post->ID, $restore)) { return array('ok' => false, 'code' => 'write_failed'); }
    }
    $backup['undone'] = true;
    $backup['undone_at'] = time();
    gotop_seo_bridge_write_backup($post->ID, $job_id, $backup);
    gotop_seo_bridge_log($job_id, $backup['type'], $post->ID, 'reverted');
    return array('ok' => true, 'status' => 'reverted', 'fix_id' => $job_id, 'post_id' => (int) $post->ID);
}
