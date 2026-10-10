<?php
/**
 * Settings > GO TOP SEO: pair this site with the GO TOP app (paste the code the app shows),
 * see whether it is paired, choose who articles are published as, disconnect, and see what the
 * app did here lately.
 * Administrators only (manage_options); every form is nonce-protected; everything printed is escaped.
 */

namespace GoTopSeoBridge;

if (!defined('ABSPATH')) { exit; }

add_action('admin_menu', __NAMESPACE__ . '\\gotop_seo_bridge_admin_menu');
function gotop_seo_bridge_admin_menu() {
    add_options_page('GO TOP SEO', 'GO TOP SEO', 'manage_options', 'go-top-seo-bridge', 'gotop_seo_bridge_admin_page');
}

add_filter('plugin_action_links_' . plugin_basename(GOTOP_SEO_BRIDGE_DIR . '/gotop-seo-bridge.php'), __NAMESPACE__ . '\\gotop_seo_bridge_action_links');
function gotop_seo_bridge_action_links($links) {
    array_unshift($links, '<a href="' . esc_url(admin_url('options-general.php?page=go-top-seo-bridge')) . '">' . esc_html__('Settings', 'go-top-seo-bridge') . '</a>');
    return $links;
}

add_action('admin_post_gotop_seo_bridge_pair', __NAMESPACE__ . '\\gotop_seo_bridge_admin_pair');
function gotop_seo_bridge_admin_pair() {
    if (!current_user_can('manage_options')) { wp_die(esc_html__('Not allowed.', 'go-top-seo-bridge'), 403); }
    check_admin_referer('gotop_seo_bridge_pair');
    $code = isset($_POST['gotop_code']) ? sanitize_text_field(wp_unslash($_POST['gotop_code'])) : '';
    $parsed = gotop_seo_bridge_parse_pairing_code($code);
    $status = 'invalid';
    if ($parsed) {
        gotop_seo_bridge_store_key($parsed['key_id'], $parsed['secret'], get_current_user_id());
        $status = 'paired';
    }
    wp_safe_redirect(add_query_arg('gotop', $status, admin_url('options-general.php?page=go-top-seo-bridge')));
    exit;
}

add_action('admin_post_gotop_seo_bridge_author', __NAMESPACE__ . '\\gotop_seo_bridge_admin_author');
function gotop_seo_bridge_admin_author() {
    if (!current_user_can('manage_options')) { wp_die(esc_html__('Not allowed.', 'go-top-seo-bridge'), 403); }
    check_admin_referer('gotop_seo_bridge_author');
    $id = isset($_POST['gotop_author']) ? absint($_POST['gotop_author']) : 0;
    $status = 'author_invalid';
    if ($id && user_can($id, 'publish_posts')) {
        update_option('gotop_seo_bridge_author', $id, false);
        $status = 'author_saved';
    }
    wp_safe_redirect(add_query_arg('gotop', $status, admin_url('options-general.php?page=go-top-seo-bridge')));
    exit;
}

add_action('admin_post_gotop_seo_bridge_forget', __NAMESPACE__ . '\\gotop_seo_bridge_admin_forget');
function gotop_seo_bridge_admin_forget() {
    if (!current_user_can('manage_options')) { wp_die(esc_html__('Not allowed.', 'go-top-seo-bridge'), 403); }
    check_admin_referer('gotop_seo_bridge_forget');
    gotop_seo_bridge_forget_key();
    wp_safe_redirect(add_query_arg('gotop', 'forgotten', admin_url('options-general.php?page=go-top-seo-bridge')));
    exit;
}

function gotop_seo_bridge_admin_page() {
    if (!current_user_can('manage_options')) { return; }
    $key = gotop_seo_bridge_get_key();
    // Only picks which notice to show after one of the nonce-checked forms above redirected here.
    $notice = isset($_GET['gotop']) ? sanitize_key(wp_unslash($_GET['gotop'])) : ''; // phpcs:ignore WordPress.Security.NonceVerification.Recommended
    $log = get_option('gotop_seo_bridge_log');
    if (!is_array($log)) { $log = array(); }
    echo '<div class="wrap"><h1>' . esc_html__('GO TOP SEO', 'go-top-seo-bridge') . '</h1>';
    if ($notice === 'paired') {
        echo '<div class="notice notice-success"><p>' . esc_html__('This site is now connected. Go back to GO TOP and press "Check connection".', 'go-top-seo-bridge') . '</p></div>';
    } elseif ($notice === 'invalid') {
        echo '<div class="notice notice-error"><p>' . esc_html__('That code is not valid. Copy it again from GO TOP (Site health > Install the plugin).', 'go-top-seo-bridge') . '</p></div>';
    } elseif ($notice === 'forgotten') {
        echo '<div class="notice notice-info"><p>' . esc_html__('Disconnected. GO TOP can no longer publish articles or apply fixes on this site.', 'go-top-seo-bridge') . '</p></div>';
    } elseif ($notice === 'author_saved') {
        echo '<div class="notice notice-success"><p>' . esc_html__('Saved. New articles will be published as this user.', 'go-top-seo-bridge') . '</p></div>';
    } elseif ($notice === 'author_invalid') {
        echo '<div class="notice notice-error"><p>' . esc_html__('That user cannot publish posts. Choose another one.', 'go-top-seo-bridge') . '</p></div>';
    }

    echo '<p>' . esc_html__('GO TOP publishes the articles you send from the app as posts, and applies the SEO fixes you approve there, one at a time, keeping the previous value of each so you can undo it.', 'go-top-seo-bridge') . '</p>';
    echo '<p>' . esc_html__('It never deletes or trashes anything, never changes a post it did not publish (except the fixes you approve), and never changes prices, products, the theme, plugins, settings or users.', 'go-top-seo-bridge') . '</p>';

    if ($key) {
        echo '<p><strong>' . esc_html__('Status:', 'go-top-seo-bridge') . '</strong> ' . esc_html__('Connected', 'go-top-seo-bridge') . ' (' . esc_html($key['key_id']) . ')</p>';
        echo '<form method="post" action="' . esc_url(admin_url('admin-post.php')) . '">';
        wp_nonce_field('gotop_seo_bridge_forget');
        echo '<input type="hidden" name="action" value="gotop_seo_bridge_forget" />';
        submit_button(__('Disconnect', 'go-top-seo-bridge'), 'secondary');
        echo '</form>';

        $author = gotop_seo_bridge_author_id();
        echo '<h2>' . esc_html__('Publish articles as', 'go-top-seo-bridge') . '</h2>';
        if (!$author) {
            echo '<div class="notice notice-warning inline"><p>' . esc_html__('No user is set who can publish posts, so GO TOP cannot publish articles yet. Choose one below.', 'go-top-seo-bridge') . '</p></div>';
        }
        echo '<form method="post" action="' . esc_url(admin_url('admin-post.php')) . '">';
        wp_nonce_field('gotop_seo_bridge_author');
        echo '<input type="hidden" name="action" value="gotop_seo_bridge_author" />';
        wp_dropdown_users(array('name' => 'gotop_author', 'selected' => $author, 'capability' => array('publish_posts'), 'show' => 'display_name_with_login'));
        submit_button(__('Save', 'go-top-seo-bridge'), 'secondary');
        echo '</form>';
    } else {
        echo '<p><strong>' . esc_html__('Status:', 'go-top-seo-bridge') . '</strong> ' . esc_html__('Not connected', 'go-top-seo-bridge') . '</p>';
    }

    echo '<h2>' . esc_html__('Connection code', 'go-top-seo-bridge') . '</h2>';
    echo '<form method="post" action="' . esc_url(admin_url('admin-post.php')) . '">';
    wp_nonce_field('gotop_seo_bridge_pair');
    echo '<input type="hidden" name="action" value="gotop_seo_bridge_pair" />';
    echo '<p><input type="text" name="gotop_code" class="regular-text code" autocomplete="off" spellcheck="false" placeholder="GT1.gtk_…" /></p>';
    submit_button(__('Connect', 'go-top-seo-bridge'));
    echo '</form>';

    if ($log) {
        echo '<h2>' . esc_html__('Recent activity', 'go-top-seo-bridge') . '</h2>';
        echo '<table class="widefat striped"><thead><tr><th>' . esc_html__('When', 'go-top-seo-bridge') . '</th><th>' . esc_html__('What', 'go-top-seo-bridge') . '</th><th>' . esc_html__('Page', 'go-top-seo-bridge') . '</th><th>' . esc_html__('Action', 'go-top-seo-bridge') . '</th></tr></thead><tbody>';
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
