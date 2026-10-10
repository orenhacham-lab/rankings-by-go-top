<?php
/**
 * Runs the REAL plugin files (wordpress-plugin/gotop-seo-bridge) under a minimal in-memory
 * WordPress: options, post meta, posts, transients, REST routing and the few helpers the plugin
 * calls. No database, no network. Used by lib/site-fix/__qa__/site-fix-plugin.qa.ts.
 *
 *   php plugin-harness.php <plugin dir> <calls.json>
 *
 * calls.json is a list of steps, run in order against one shared state:
 *   {"rest": "/gotop/v1/fix", "headers": {...}, "body": "<raw json>", "can": ["manage_options"]}
 *   {"post": 11}                       -> the post's content and meta
 *   {"option": "gotop_seo_bridge_key"} -> an option's value
 *   {"head": 11, "seo": "none"}         -> what wp_head / the title filter print for post 11
 *   {"setpost": 41, "content": "...", "url": "https://...", "meta": {...}} -> put a post in place (2.1.0 tests)
 *   {"llms": "/llms.txt", "method": "GET"} -> what a public request for that path answers (null: WordPress carries on)
 *   {"remote": "https://...", "base64": "..."} -> an image download_url() answers (3.0.0 /media tests)
 *   {"postfull": 100}                  -> the whole post object, its meta, every address downloaded so far
 *   {"notices": true}                  -> what the admin_notices hooks print (3.1.0: two copies active)
 *   {"media": 600, "file": "a.jpg", "sizes": ["a-300x200.jpg"], "alt": ""} -> a Media Library image (3.1.0 /media-alt)
 *   {"setpost": 41, ..., "type": "post", "status": "draft", "password": "x"} -> post type, status, password (3.1.0 /content)
 *
 * GOTOP_HARNESS_SECOND (environment): a second copy of the plugin, loaded after the first (3.1.0 duplicate guard).
 * Users: 1 (administrator) may do anything; 2 "Dana Editor" may publish posts; 3 "Sam Reader" may not.
 * It prints one JSON array: the result of every step.
 *
 * GOTOP_HARNESS_ROOT (environment) sets the site's root folder (ABSPATH), where a real llms.txt may sit.
 * The 3.0.0 /media route require_once's ABSPATH/wp-admin/includes/{file,media,image}.php: a test
 * that calls it points GOTOP_HARNESS_ROOT at a folder with those three (empty) files.
 */

define('ABSPATH', getenv('GOTOP_HARNESS_ROOT') ? rtrim(getenv('GOTOP_HARNESS_ROOT'), '/') . '/' : __DIR__ . '/');

// ── State ───────────────────────────────────────────────────────────────────
$GLOBALS['__options'] = array('show_on_front' => 'posts', 'page_on_front' => 0);
$GLOBALS['__meta'] = array();
$GLOBALS['__transients'] = array();
$GLOBALS['__filters'] = array();
$GLOBALS['__routes'] = array();
$GLOBALS['__caps'] = array();
$GLOBALS['__kses'] = true;
$GLOBALS['__updates'] = array();
$GLOBALS['__queried'] = 0;
$GLOBALS['__posts'] = array(
    11 => (object) array('ID' => 11, 'post_type' => 'page', 'post_status' => 'publish', 'post_title' => 'About us',
        'post_content' => "<!-- wp:paragraph --><p>We make boots by hand in Haifa.</p><!-- /wp:paragraph -->\n<p><img src=\"https://shop.example.org/wp-content/uploads/red-boots.jpg\" class=\"wp-image-5\"></p>\n<p><img src=\"https://shop.example.org/wp-content/uploads/ok.jpg\" alt=\"Kept as is\"></p>\n<p>See <a href=\"https://shop.example.org/old-page/\">our old page</a> and <a href=\"/old-page\">again</a>.</p>\n<h2>Waterproof boots</h2>\n<p>Our guide to waterproof boots explains how to keep them dry.</p>\n<iframe src=\"https://www.youtube.com/embed/x\"></iframe>"),
    21 => (object) array('ID' => 21, 'post_type' => 'post', 'post_status' => 'publish', 'post_title' => 'Waterproof boots',
        'post_content' => '<p>Orphan page.</p>'),
    31 => (object) array('ID' => 31, 'post_type' => 'product', 'post_status' => 'publish', 'post_title' => 'Red boots',
        'post_content' => '<p>Price: 100</p>'),
);
$GLOBALS['__urls'] = array(
    'https://shop.example.org/about/' => 11,
    'https://shop.example.org/blog/waterproof-boots/' => 21,
    'https://shop.example.org/product/red-boots/' => 31,
);

// ── WordPress, the parts the plugin uses ────────────────────────────────────
class WP_Error {
    public $code; public $message; public $data;
    function __construct($code = '', $message = '', $data = null) { $this->code = $code; $this->message = $message; $this->data = $data; }
}
class WP_REST_Response {
    public $data; public $status;
    function __construct($data = null, $status = 200) { $this->data = $data; $this->status = $status; }
}
class WP_REST_Request {
    private $route; private $headers; private $body; private $method;
    function __construct($method, $route, $headers, $body) { $this->method = $method; $this->route = $route; $this->headers = array_change_key_case($headers, CASE_LOWER); $this->body = $body; }
    function get_method() { return $this->method; }
    function get_route() { return $this->route; }
    function get_header($name) { $k = strtolower($name); return isset($this->headers[$k]) ? $this->headers[$k] : null; }
    function get_body() { return $this->body; }
    function get_param($name) { $j = json_decode($this->body, true); return is_array($j) && isset($j[$name]) ? $j[$name] : null; }
}
class WP_Query {
    public $posts = array();
    function __construct($args) {
        $GLOBALS['__queries'][] = $args;
        foreach ($GLOBALS['__posts'] as $p) {
            if (!in_array($p->post_type, (array) $args['post_type'], true)) { continue; }
            if (isset($args['s'])) { if (stripos($p->post_content, $args['s']) !== false) { $this->posts[] = $p; } continue; }
            // 3.1.0 /content: published, no password, newest change first, one page.
            if (isset($args['post_status']) && $p->post_status !== $args['post_status']) { continue; }
            if (isset($args['has_password']) && $args['has_password'] === false && !empty($p->post_password)) { continue; }
            $this->posts[] = $p;
        }
        if (!isset($args['s'])) {
            usort($this->posts, function ($a, $b) { return strcmp((string) $b->post_modified_gmt, (string) $a->post_modified_gmt) ?: $a->ID - $b->ID; });
            $page = isset($args['paged']) ? (int) $args['paged'] : 1;
            $this->posts = array_slice($this->posts, ($page - 1) * $args['posts_per_page'], $args['posts_per_page']);
            return;
        }
        $this->posts = array_slice($this->posts, 0, $args['posts_per_page']);
    }
}
$GLOBALS['__queries'] = array();
$GLOBALS['__users'] = array(
    1 => array('display_name' => 'Site Admin', 'user_email' => 'admin@shop.example.org', 'publish' => true),
    2 => array('display_name' => 'Dana Editor', 'user_email' => 'dana@shop.example.org', 'publish' => true),
    3 => array('display_name' => 'Sam Reader', 'user_email' => 'sam@shop.example.org', 'publish' => false),
);
function get_users($args) {
    $out = array();
    foreach ($GLOBALS['__users'] as $id => $u) {
        if (in_array('publish_posts', (array) $args['capability'], true) && !$u['publish']) { continue; }
        $row = array('ID' => $id, 'display_name' => $u['display_name'], 'user_email' => $u['user_email']);
        $out[] = (object) (isset($args['fields']) && is_array($args['fields']) ? array_intersect_key($row, array_flip($args['fields'])) : $row);
    }
    return $out;
}
function setup_postdata($p) { $GLOBALS['__setup'][] = is_object($p) ? $p->ID : $p; return true; }
function wp_reset_postdata() {}
function wp_strip_all_tags($s) { return trim(strip_tags((string) $s)); }
function taxonomy_exists($t) { return isset($GLOBALS['__terms'][$t]); }
function get_term_link($term) { return 'https://shop.example.org/category/' . $term->slug . '/'; }
function get_date_from_gmt($d) { return $d; }
function wp_get_attachment_metadata($id) { return isset($GLOBALS['__posts'][$id]->sizes) ? array('sizes' => array_map(function ($f) { return array('file' => $f); }, $GLOBALS['__posts'][$id]->sizes)) : array(); }
function add_action($hook, $cb, $prio = 10, $n = 1) { $GLOBALS['__filters'][$hook][] = $cb; }
function add_filter($hook, $cb, $prio = 10, $n = 1) { $GLOBALS['__filters'][$hook][] = $cb; }
function apply_filters($hook, $value) { return $value; }
function has_filter($hook, $cb) { return ($hook === 'content_save_pre' && $cb === 'wp_filter_post_kses' && $GLOBALS['__kses']) ? 10 : false; }
function kses_remove_filters() { $GLOBALS['__kses'] = false; }
function kses_init_filters() { $GLOBALS['__kses'] = true; }
function register_rest_route($ns, $route, $args) { $GLOBALS['__routes']['/' . $ns . $route] = $args; }
function register_uninstall_hook($file, $cb) {}
function plugin_basename($f) { return basename(dirname($f)) . '/' . basename($f); }
function current_user_can($cap, $id = null) { return in_array($cap, $GLOBALS['__caps'], true); }
function get_option($k, $d = false) { return array_key_exists($k, $GLOBALS['__options']) ? $GLOBALS['__options'][$k] : $d; }
function add_option($k, $v, $x = '', $a = 'yes') { $GLOBALS['__options'][$k] = $v; return true; }
function update_option($k, $v, $a = null) { $GLOBALS['__options'][$k] = $v; return true; }
function delete_option($k) { unset($GLOBALS['__options'][$k]); return true; }
function get_transient($k) { return isset($GLOBALS['__transients'][$k]) ? $GLOBALS['__transients'][$k] : false; }
function set_transient($k, $v, $ttl) { $GLOBALS['__transients'][$k] = $v; return true; }
function wp_slash($v) { return is_string($v) ? addslashes($v) : $v; }
function wp_unslash($v) { return is_string($v) ? stripslashes($v) : $v; }
function get_post_meta($id, $key, $single = true) { return isset($GLOBALS['__meta'][$id][$key]) ? $GLOBALS['__meta'][$id][$key] : ''; }
function update_post_meta($id, $key, $value) { $GLOBALS['__meta'][$id][$key] = wp_unslash($value); return true; }
function delete_post_meta($id, $key) { unset($GLOBALS['__meta'][$id][$key]); return true; }
function get_post_status($id) { return isset($GLOBALS['__posts'][$id]) ? $GLOBALS['__posts'][$id]->post_status : false; }
function get_post($id) { return isset($GLOBALS['__posts'][$id]) ? clone $GLOBALS['__posts'][$id] : null; }
function url_to_postid($url) { return isset($GLOBALS['__urls'][$url]) ? $GLOBALS['__urls'][$url] : 0; }
function get_permalink($p) { $id = is_object($p) ? $p->ID : $p; $u = array_search($id, $GLOBALS['__urls'], true); return $u ? $u : ''; }
function get_the_title($p) { $id = is_object($p) ? $p->ID : $p; return $GLOBALS['__posts'][$id]->post_title; }
function home_url($path = '') { return 'https://www.shop.example.org' . $path; }
function clean_post_cache($id) {}
function is_wp_error($v) { return $v instanceof WP_Error; }
function __return_true() { return true; }
function absint($v) { return abs((int) $v); }
function sanitize_text_field($v) { return trim(preg_replace('/[\r\n\t ]+/', ' ', strip_tags((string) $v))); }
function sanitize_key($v) { return preg_replace('/[^a-z0-9_\-]/', '', strtolower((string) $v)); }
function wp_json_encode($v, $flags = 0) { return json_encode($v, $flags); }
function esc_attr($v) { return htmlspecialchars((string) $v, ENT_QUOTES, 'UTF-8'); }
function esc_html($v) { return htmlspecialchars((string) $v, ENT_QUOTES, 'UTF-8'); }
function esc_url($v) { return htmlspecialchars((string) $v, ENT_QUOTES, 'UTF-8'); }
function esc_html__($v, $d = null) { return esc_html($v); }
function __($v, $d = null) { return $v; }
function admin_url($p = '') { return 'https://www.shop.example.org/wp-admin/' . $p; }
function is_singular() { return $GLOBALS['__queried'] > 0; }
function is_front_page() { return false; }
function get_queried_object_id() { return $GLOBALS['__queried']; }
function get_current_user_id() { return 1; }
function user_can($user, $cap) { $id = (int) $user; if ($id === 1) { return true; } return $cap === 'publish_posts' && isset($GLOBALS['__users'][$id]) && $GLOBALS['__users'][$id]['publish']; }
function wp_parse_url($url, $component = -1) { return parse_url($url, $component); }
function esc_url_raw($u) { return (string) $u; }
function wp_print_inline_script_tag($data, $attributes = array()) {
    $attrs = '';
    foreach ($attributes as $k => $v) { $attrs .= ' ' . $k . '="' . esc_attr($v) . '"'; }
    echo '<script' . $attrs . '>' . $data . "</script>\n";
}
function wp_update_post($arr, $wp_error = false) {
    $id = $arr['ID'];
    if (!isset($GLOBALS['__posts'][$id])) { return 0; }
    $content = wp_unslash($arr['post_content']);
    // What WordPress does without a signed-in user when kses is on: embeds are stripped.
    if ($GLOBALS['__kses']) { $content = preg_replace('/<iframe\b[^>]*>.*?<\/iframe>/is', '', $content); }
    $GLOBALS['__posts'][$id]->post_content = $content;
    // 3.0.0 publishing updates the other fields of its own post too (title, status, terms...).
    foreach ($arr as $k => $v) {
        if ($k !== 'ID' && $k !== 'post_content') { $GLOBALS['__posts'][$id]->$k = wp_unslash($v); }
    }
    $GLOBALS['__updates'][] = array_keys($arr);
    return $id;
}

// ── 3.0.0 publishing (includes/publish.php): posts, terms, media ────────────
$GLOBALS['__terms'] = array(
    'category' => array(3 => array('name' => 'News', 'slug' => 'news', 'parent' => 0), 4 => array('name' => 'Guides', 'slug' => 'guides', 'parent' => 3)),
    'post_tag' => array(7 => array('name' => 'boots', 'slug' => 'boots', 'parent' => 0)),
);
$GLOBALS['__remote'] = array();
$GLOBALS['__downloads'] = array();
function get_posts($args) {
    $out = array();
    foreach ($GLOBALS['__posts'] as $p) {
        if ($p->post_type !== $args['post_type']) { continue; }
        if (isset($args['s']) && stripos((string) $p->post_title, $args['s']) === false) { continue; }
        if (isset($args['name']) && (isset($p->post_name) ? $p->post_name : '') !== $args['name']) { continue; }
        if (!in_array($p->post_status, (array) $args['post_status'], true)) { continue; }
        if (isset($args['meta_key']) && get_post_meta($p->ID, $args['meta_key'], true) !== $args['meta_value']) { continue; }
        $out[] = $p->ID;
    }
    return array_slice($out, 0, $args['posts_per_page']);
}
function get_term($id, $tax) {
    if (!isset($GLOBALS['__terms'][$tax][$id])) { return null; }
    $t = $GLOBALS['__terms'][$tax][$id];
    return (object) array('term_id' => $id, 'name' => $t['name'], 'slug' => $t['slug'], 'parent' => $t['parent']);
}
function get_terms($args) {
    $out = array();
    foreach (array_keys(isset($GLOBALS['__terms'][$args['taxonomy']]) ? $GLOBALS['__terms'][$args['taxonomy']] : array()) as $id) { $out[] = get_term($id, $args['taxonomy']); }
    return $out;
}
function sanitize_title($v) { return trim(preg_replace('/[^a-z0-9]+/', '-', strtolower((string) $v)), '-'); }
/** The parts of wp_kses_post the tests look at: no script-capable tags, no on* handlers, no javascript: links. */
function wp_kses_post($html) {
    $html = preg_replace('#</?(script|style|iframe|object|embed|form|input)\b[^>]*>#i', '', (string) $html);
    $html = preg_replace('/\son\w+\s*=\s*("[^"]*"|\'[^\']*\'|[^\s>]+)/i', '', $html);
    return preg_replace('/(href|src)\s*=\s*(["\'])\s*javascript:[^"\']*\2/i', '$1=$2#$2', $html);
}
function wp_insert_post($arr, $wp_error = false) {
    $id = max(array_merge(array(99), array_keys($GLOBALS['__posts']))) + 1;
    $p = (object) array('ID' => $id);
    foreach ($arr as $k => $v) { $p->$k = wp_unslash($v); }
    $GLOBALS['__posts'][$id] = $p;
    $slug = isset($arr['post_name']) ? $arr['post_name'] : sanitize_title(wp_unslash($arr['post_title']));
    $GLOBALS['__urls']['https://shop.example.org/blog/' . $slug . '/'] = $id;
    return $id;
}
function set_post_thumbnail($post, $media) { update_post_meta($post, '_thumbnail_id', (int) $media); return true; }
function wp_attachment_is_image($id) { return isset($GLOBALS['__posts'][$id]) && $GLOBALS['__posts'][$id]->post_type === 'attachment'; }
function wp_get_attachment_url($id) { return isset($GLOBALS['__posts'][$id]->guid) ? $GLOBALS['__posts'][$id]->guid : false; }
function wp_basename($p) { return basename((string) $p); }
function sanitize_file_name($n) { return preg_replace('/[^A-Za-z0-9._-]/', '-', (string) $n); }
/** Only the addresses a test put in place answer; the plugin's own source check runs first. */
function download_url($url, $timeout = 300) {
    $GLOBALS['__downloads'][] = $url;
    if (!isset($GLOBALS['__remote'][$url])) { return new WP_Error('http_404', 'Not found'); }
    $tmp = tempnam(sys_get_temp_dir(), 'gtimg');
    file_put_contents($tmp, $GLOBALS['__remote'][$url]);
    return $tmp;
}
function wp_get_image_mime($file) { $i = @getimagesize($file); return $i ? $i['mime'] : false; }
function wp_check_filetype_and_ext($file, $name) { return array('type' => wp_get_image_mime($file), 'ext' => pathinfo($name, PATHINFO_EXTENSION)); }
function wp_delete_file($f) { if (is_file($f)) { unlink($f); } }
function media_handle_sideload($file, $post = 0, $desc = null) {
    $id = max(array_merge(array(499), array_keys($GLOBALS['__posts']))) + 1;
    $GLOBALS['__posts'][$id] = (object) array('ID' => $id, 'post_type' => 'attachment', 'post_status' => 'inherit', 'post_title' => (string) $desc,
        'post_content' => '', 'guid' => 'https://shop.example.org/wp-content/uploads/' . $file['name']);
    wp_delete_file($file['tmp_name']);
    return $id;
}

if (defined('GOTOP_HARNESS_SEO')) {}

$plugin_dir = $argv[1];
$calls = json_decode(file_get_contents($argv[2]), true);
require $plugin_dir . '/gotop-seo-bridge.php';
if (getenv('GOTOP_HARNESS_SECOND')) { require rtrim(getenv('GOTOP_HARNESS_SECOND'), '/') . '/gotop-seo-bridge.php'; }
// WordPress fires plugins_loaded once every active plugin file is read; 3.1.0 starts there.
foreach (isset($GLOBALS['__filters']['plugins_loaded']) ? $GLOBALS['__filters']['plugins_loaded'] : array() as $cb) { call_user_func($cb); }
foreach ($GLOBALS['__filters']['rest_api_init'] as $cb) { call_user_func($cb); }
/** A plugin function by name: 3.1.0 keeps them in the GoTopSeoBridge namespace, 3.0.0 and older are global. */
function gtp_fn($name) { return function_exists('GoTopSeoBridge\\' . $name) ? 'GoTopSeoBridge\\' . $name : $name; }

$out = array();
foreach ($calls as $step) {
    if (isset($step['rest'])) {
        $GLOBALS['__caps'] = isset($step['can']) ? $step['can'] : array();
        if (!isset($GLOBALS['__routes'][$step['rest']])) { $out[] = array('status' => 404, 'body' => array('code' => 'rest_no_route')); continue; }
        $route = $GLOBALS['__routes'][$step['rest']];
        $req = new WP_REST_Request(isset($step['method']) ? $step['method'] : 'POST', $step['rest'], isset($step['headers']) ? $step['headers'] : array(), isset($step['body']) ? $step['body'] : '');
        $perm = call_user_func($route['permission_callback'], $req);
        if ($perm !== true) {
            $out[] = array('status' => $perm instanceof WP_Error ? $perm->data['status'] : 401, 'body' => array('code' => $perm instanceof WP_Error ? $perm->code : 'rest_forbidden'));
            continue;
        }
        $res = call_user_func($route['callback'], $req);
        if ($res instanceof WP_Error) { $out[] = array('status' => $res->data['status'], 'body' => array('code' => $res->code)); continue; }
        $out[] = array('status' => $res->status, 'body' => $res->data);
    } elseif (isset($step['post'])) {
        $id = $step['post'];
        $out[] = array('content' => $GLOBALS['__posts'][$id]->post_content, 'meta' => isset($GLOBALS['__meta'][$id]) ? $GLOBALS['__meta'][$id] : new stdClass(), 'updates' => $GLOBALS['__updates']);
    } elseif (isset($step['option'])) {
        $out[] = array('value' => get_option($step['option'], null));
    } elseif (isset($step['head'])) {
        $GLOBALS['__queried'] = $step['head'];
        ob_start();
        call_user_func(gtp_fn('gotop_seo_bridge_head'));
        $head = ob_get_clean();
        $out[] = array('head' => $head, 'title' => call_user_func(gtp_fn('gotop_seo_bridge_document_title'), 'Theme title'));
        $GLOBALS['__queried'] = 0;
    } elseif (isset($step['setpost'])) {
        $id = (int) $step['setpost'];
        $GLOBALS['__posts'][$id] = (object) array('ID' => $id, 'post_type' => isset($step['type']) ? $step['type'] : 'page',
            'post_status' => isset($step['status']) ? $step['status'] : 'publish',
            'post_title' => isset($step['title']) ? $step['title'] : 'Page ' . $id, 'post_content' => (string) $step['content'],
            'post_name' => isset($step['slug']) ? $step['slug'] : 'page-' . $id, 'post_password' => isset($step['password']) ? $step['password'] : '',
            'post_date_gmt' => '2026-01-01 00:00:00', 'post_modified_gmt' => isset($step['modified']) ? $step['modified'] : '2026-01-01 00:00:00',
            'post_author' => 1);
        if (isset($step['url'])) { $GLOBALS['__urls'][$step['url']] = $id; }
        if (isset($step['meta']) && is_array($step['meta'])) { foreach ($step['meta'] as $k => $v) { $GLOBALS['__meta'][$id][$k] = $v; } }
        $out[] = array('value' => $id);
    } elseif (isset($step['llms'])) {
        $out[] = array('value' => call_user_func(gtp_fn('gotop_seo_bridge_llms_response'), isset($step['method']) ? $step['method'] : 'GET', $step['llms']));
    } elseif (isset($step['remote'])) {
        // An image the "storage" serves: {"remote": "https://...", "base64": "..."}
        $GLOBALS['__remote'][$step['remote']] = base64_decode($step['base64']);
        $out[] = array('value' => strlen($GLOBALS['__remote'][$step['remote']]));
    } elseif (isset($step['postfull'])) {
        $id = (int) $step['postfull'];
        $out[] = array('post' => isset($GLOBALS['__posts'][$id]) ? $GLOBALS['__posts'][$id] : null,
            'meta' => isset($GLOBALS['__meta'][$id]) ? $GLOBALS['__meta'][$id] : new stdClass(), 'downloads' => $GLOBALS['__downloads'],
            'count' => count($GLOBALS['__posts']));
    } elseif (isset($step['notices'])) {
        $GLOBALS['__caps'] = isset($step['can']) ? $step['can'] : array();
        ob_start();
        foreach (isset($GLOBALS['__filters']['admin_notices']) ? $GLOBALS['__filters']['admin_notices'] : array() as $cb) { call_user_func($cb); }
        $out[] = array('value' => ob_get_clean(), 'routes' => count($GLOBALS['__routes']), 'route_names' => array_keys($GLOBALS['__routes']), 'version' => defined('GOTOP_SEO_BRIDGE_VERSION') ? GOTOP_SEO_BRIDGE_VERSION : null);
    } elseif (isset($step['media'])) {
        $id = (int) $step['media'];
        $GLOBALS['__posts'][$id] = (object) array('ID' => $id, 'post_type' => 'attachment', 'post_status' => 'inherit', 'post_title' => preg_replace('/\.[a-z]+$/', '', $step['file']),
            'post_name' => preg_replace('/\.[a-z]+$/', '', $step['file']), 'post_content' => '', 'guid' => 'https://shop.example.org/wp-content/uploads/2026/01/' . $step['file'],
            'sizes' => isset($step['sizes']) ? $step['sizes'] : array());
        if (isset($step['alt'])) { $GLOBALS['__meta'][$id]['_wp_attachment_image_alt'] = $step['alt']; }
        $out[] = array('value' => $id);
    } elseif (isset($step['queries'])) {
        $out[] = array('value' => $GLOBALS['__queries']);
    } elseif (isset($step['define'])) {
        if (!defined($step['define'])) { define($step['define'], '1.0'); }
        $out[] = array('defined' => $step['define']);
    }
}
echo json_encode($out, JSON_UNESCAPED_SLASHES | JSON_UNESCAPED_UNICODE);
