<?php
/**
 * What a REAL WordPress keeps of an article body on each publishing path. Used by
 * lib/content/__qa__/wordpress-plugin-publish.qa.ts (group K).
 *
 *   php wp-kses-runner.php <wordpress root> <plugin dir> <bodies.json>
 *
 * Boots the WordPress at <wordpress root> (wp-load.php; nothing is written) with NO signed-in user,
 * which is how a signed plugin request runs, and prints for each body:
 *   plugin  what GO TOP SEO Bridge 3.0.0 stores: its own gotop_seo_bridge_drop_code_blocks +
 *           wp_kses_post (includes/publish.php), then the content_save_pre kses WordPress applies to
 *           wp_insert_post for a user without unfiltered_html
 *   version the WordPress version
 * The application-password path is an administrator with unfiltered_html: WordPress keeps the body
 * as sent, so the caller compares against the body itself.
 */
$root = rtrim($argv[1], '/');
$plugin = rtrim($argv[2], '/');
$bodies = json_decode(file_get_contents($argv[3]), true);
define('WP_USE_THEMES', false);
require $root . '/wp-load.php';
wp_set_current_user(0);
if (!function_exists('gotop_seo_bridge_drop_code_blocks')) { require $plugin . '/includes/publish.php'; }
kses_init();
$out = array();
foreach ($bodies as $html) {
    $sent = wp_kses_post(gotop_seo_bridge_drop_code_blocks($html));
    $saved = wp_unslash(apply_filters('content_save_pre', wp_slash($sent)));
    $out[] = array('plugin' => $saved);
}
echo json_encode(array('version' => get_bloginfo('version'), 'items' => $out), JSON_UNESCAPED_SLASHES | JSON_UNESCAPED_UNICODE);
