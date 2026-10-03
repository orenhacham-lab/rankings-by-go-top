<?php
/**
 * Printing what a fix stored, on the public page.
 *
 * With Yoast or Rank Math active, the SEO title, description, canonical and focus keyphrase live in
 * that plugin's own fields and it prints them; nothing here runs for them. Without an SEO plugin,
 * this plugin prints its own stored values (the "core fallback"). JSON-LD schema is always this
 * plugin's own, printed with every "<", ">" and "&" escaped so it can never close the script tag.
 */

if (!defined('ABSPATH')) { exit; }

function gotop_seo_bridge_current_post_id() {
    if (is_singular()) { return (int) get_queried_object_id(); }
    if (is_front_page() && get_option('show_on_front') === 'page') { return (int) get_option('page_on_front'); }
    return 0;
}

add_filter('pre_get_document_title', 'gotop_seo_bridge_document_title', 20);
function gotop_seo_bridge_document_title($title) {
    if (gotop_seo_bridge_seo_plugin() !== 'none') { return $title; }
    $id = gotop_seo_bridge_current_post_id();
    if (!$id) { return $title; }
    $ours = (string) get_post_meta($id, '_gotop_seo_title', true);
    return $ours !== '' ? $ours : $title;
}

add_filter('get_canonical_url', 'gotop_seo_bridge_canonical_url', 20, 2);
function gotop_seo_bridge_canonical_url($url, $post) {
    if (gotop_seo_bridge_seo_plugin() !== 'none' || !$post) { return $url; }
    $ours = (string) get_post_meta($post->ID, '_gotop_canonical', true);
    return $ours !== '' ? $ours : $url;
}

add_action('wp_head', 'gotop_seo_bridge_head', 5);
function gotop_seo_bridge_head() {
    $id = gotop_seo_bridge_current_post_id();
    if (!$id) { return; }
    if (gotop_seo_bridge_seo_plugin() === 'none') {
        $description = (string) get_post_meta($id, '_gotop_seo_description', true);
        if ($description !== '') {
            echo '<meta name="description" content="' . esc_attr($description) . '" />' . "\n";
        }
    }
    $schema = (string) get_post_meta($id, '_gotop_schema_jsonld', true);
    if ($schema !== '') {
        $decoded = json_decode($schema, true);
        if (is_array($decoded)) {
            $json = wp_json_encode($decoded, JSON_UNESCAPED_SLASHES | JSON_UNESCAPED_UNICODE | JSON_HEX_TAG | JSON_HEX_AMP);
            if (is_string($json)) {
                echo '<script type="application/ld+json" class="gotop-schema">' . $json . '</script>' . "\n";
            }
        }
    }
}
