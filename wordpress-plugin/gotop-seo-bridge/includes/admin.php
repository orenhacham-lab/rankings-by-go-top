<?php
/**
 * Settings > GO TOP SEO: pair this site with the GO TOP app (paste the code the app shows),
 * see whether it is paired, disconnect, and see the last fixes the app applied here.
 * Administrators only (manage_options); every form is nonce-protected; everything printed is escaped.
 */

if (!defined('ABSPATH')) { exit; }

add_action('admin_menu', 'gotop_seo_bridge_admin_menu');
function gotop_seo_bridge_admin_menu() {
    add_options_page('GO TOP SEO', 'GO TOP SEO', 'manage_options', 'gotop-seo-bridge', 'gotop_seo_bridge_admin_page');
}

add_filter('plugin_action_links_' . plugin_basename(GOTOP_SEO_BRIDGE_DIR . '/gotop-seo-bridge.php'), 'gotop_seo_bridge_action_links');
function gotop_seo_bridge_action_links($links) {
    array_unshift($links, '<a href="' . esc_url(admin_url('options-general.php?page=gotop-seo-bridge')) . '">' . esc_html__('Settings', 'gotop-seo-bridge') . '</a>');
    return $links;
}

add_action('admin_post_gotop_seo_bridge_pair', 'gotop_seo_bridge_admin_pair');
function gotop_seo_bridge_admin_pair() {
    if (!current_user_can('manage_options')) { wp_die(esc_html__('Not allowed.', 'gotop-seo-bridge'), 403); }
    check_admin_referer('gotop_seo_bridge_pair');
    $code = isset($_POST['gotop_code']) ? sanitize_text_field(wp_unslash($_POST['gotop_code'])) : '';
    $parsed = gotop_seo_bridge_parse_pairing_code($code);
    $status = 'invalid';
    if ($parsed) {
        gotop_seo_bridge_store_key($parsed['key_id'], $parsed['secret']);
        $status = 'paired';
    }
    wp_safe_redirect(add_query_arg('gotop', $status, admin_url('options-general.php?page=gotop-seo-bridge')));
    exit;
}

add_action('admin_post_gotop_seo_bridge_forget', 'gotop_seo_bridge_admin_forget');
function gotop_seo_bridge_admin_forget() {
    if (!current_user_can('manage_options')) { wp_die(esc_html__('Not allowed.', 'gotop-seo-bridge'), 403); }
    check_admin_referer('gotop_seo_bridge_forget');
    gotop_seo_bridge_forget_key();
    wp_safe_redirect(add_query_arg('gotop', 'forgotten', admin_url('options-general.php?page=gotop-seo-bridge')));
    exit;
}

function gotop_seo_bridge_admin_page() {
    if (!current_user_can('manage_options')) { return; }
    $key = gotop_seo_bridge_get_key();
    $notice = isset($_GET['gotop']) ? sanitize_key(wp_unslash($_GET['gotop'])) : '';
    $log = get_option('gotop_seo_bridge_log');
    if (!is_array($log)) { $log = array(); }
    echo '<div class="wrap"><h1>' . esc_html__('GO TOP SEO', 'gotop-seo-bridge') . '</h1>';
    if ($notice === 'paired') {
        echo '<div class="notice notice-success"><p>' . esc_html__('This site is now connected. Go back to GO TOP and press "Check connection".', 'gotop-seo-bridge') . '</p></div>';
    } elseif ($notice === 'invalid') {
        echo '<div class="notice notice-error"><p>' . esc_html__('That code is not valid. Copy it again from GO TOP (Site health > Install the plugin).', 'gotop-seo-bridge') . '</p></div>';
    } elseif ($notice === 'forgotten') {
        echo '<div class="notice notice-info"><p>' . esc_html__('Disconnected. GO TOP can no longer apply fixes on this site.', 'gotop-seo-bridge') . '</p></div>';
    }

    echo '<p>' . esc_html__('GO TOP applies only the SEO fixes you approve in the app, one at a time, and keeps the previous value of each so you can undo it. It never deletes content, never changes prices, products, the theme, plugins, settings or users, and never publishes or unpublishes a page.', 'gotop-seo-bridge') . '</p>';

    if ($key) {
        echo '<p><strong>' . esc_html__('Status:', 'gotop-seo-bridge') . '</strong> ' . esc_html__('Connected', 'gotop-seo-bridge') . ' (' . esc_html($key['key_id']) . ')</p>';
        echo '<form method="post" action="' . esc_url(admin_url('admin-post.php')) . '">';
        wp_nonce_field('gotop_seo_bridge_forget');
        echo '<input type="hidden" name="action" value="gotop_seo_bridge_forget" />';
        submit_button(__('Disconnect', 'gotop-seo-bridge'), 'secondary');
        echo '</form>';
    } else {
        echo '<p><strong>' . esc_html__('Status:', 'gotop-seo-bridge') . '</strong> ' . esc_html__('Not connected', 'gotop-seo-bridge') . '</p>';
    }

    echo '<h2>' . esc_html__('Connection code', 'gotop-seo-bridge') . '</h2>';
    echo '<form method="post" action="' . esc_url(admin_url('admin-post.php')) . '">';
    wp_nonce_field('gotop_seo_bridge_pair');
    echo '<input type="hidden" name="action" value="gotop_seo_bridge_pair" />';
    echo '<p><input type="text" name="gotop_code" class="regular-text code" autocomplete="off" spellcheck="false" placeholder="GT1.gtk_…" /></p>';
    submit_button(__('Connect', 'gotop-seo-bridge'));
    echo '</form>';

    if ($log) {
        echo '<h2>' . esc_html__('Recent fixes', 'gotop-seo-bridge') . '</h2>';
        echo '<table class="widefat striped"><thead><tr><th>' . esc_html__('When', 'gotop-seo-bridge') . '</th><th>' . esc_html__('Fix', 'gotop-seo-bridge') . '</th><th>' . esc_html__('Page', 'gotop-seo-bridge') . '</th><th>' . esc_html__('Action', 'gotop-seo-bridge') . '</th></tr></thead><tbody>';
        foreach ($log as $row) {
            $post_id = isset($row['post_id']) ? (int) $row['post_id'] : 0;
            $edit = $post_id ? get_edit_post_link($post_id) : '';
            echo '<tr><td>' . esc_html(wp_date(get_option('date_format') . ' ' . get_option('time_format'), (int) $row['at'])) . '</td>';
            echo '<td>' . esc_html((string) $row['type']) . '</td>';
            echo '<td>' . ($edit ? '<a href="' . esc_url($edit) . '">' . esc_html(get_the_title($post_id)) . '</a>' : '') . '</td>';
            echo '<td>' . esc_html((string) $row['action']) . '</td></tr>';
        }
        echo '</tbody></table>';
    }
    echo '</div>';
}
