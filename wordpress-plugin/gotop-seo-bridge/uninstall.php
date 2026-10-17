<?php
/**
 * Deleting the plugin removes its settings: the connection key, the activity log, the approved
 * llms.txt and the chosen author (as before 3.1.0).
 *
 * Except while another copy of GO TOP SEO Bridge is still installed (the older one in the folder
 * gotop-seo-bridge/ next to the WordPress.org one in go-top-seo-bridge/, or the other way round):
 * both use the same settings, so deleting one copy keeps the connection of the other.
 */

if (!defined('WP_UNINSTALL_PLUGIN')) { exit; }

if (!function_exists('get_plugins')) { require_once ABSPATH . 'wp-admin/includes/plugin.php'; }

$gotop_seo_bridge_other_copy = false;
foreach (array_keys((array) get_plugins()) as $gotop_seo_bridge_file) {
    if ($gotop_seo_bridge_file !== WP_UNINSTALL_PLUGIN && basename($gotop_seo_bridge_file) === 'gotop-seo-bridge.php') {
        $gotop_seo_bridge_other_copy = true;
        break;
    }
}

if (!$gotop_seo_bridge_other_copy) {
    delete_option('gotop_seo_bridge_key');
    delete_option('gotop_seo_bridge_log');
    delete_option('gotop_seo_bridge_llms');
    delete_option('gotop_seo_bridge_llms_jobs');
    delete_option('gotop_seo_bridge_author');
}
