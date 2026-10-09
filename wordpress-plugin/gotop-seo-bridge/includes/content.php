<?php
/**
 * The five changes that touch a page's own content, as plain string functions (no WordPress
 * calls, so they are tested alone). None of them removes a word the merchant wrote:
 *   - alt text is added only to <img> tags that have none (or an empty one);
 *   - the FAQ block is appended after the last block;
 *   - a broken link gets a new address, or loses the link and keeps its words;
 *   - an internal link wraps words that are already there; nothing is added to the text;
 *   - (2.1.0) an extra main heading (<h1>) becomes a subheading (<h2>): the tag's name and the
 *     heading block's level change, its attributes and every word stay exactly as they were.
 */

if (!defined('ABSPATH')) { exit; }

function gotop_seo_bridge_esc($s) {
    return htmlspecialchars((string) $s, ENT_QUOTES | ENT_SUBSTITUTE, 'UTF-8');
}

/** The value of one attribute of a tag, or null when the tag does not have it. */
function gotop_seo_bridge_attr($tag, $name) {
    if (!preg_match('/\s' . preg_quote($name, '/') . '\s*=\s*("([^"]*)"|\'([^\']*)\'|([^\s>]+))/i', $tag, $m)) { return null; }
    if (isset($m[4]) && $m[4] !== '') { return $m[4]; }
    if (isset($m[3]) && $m[3] !== '') { return $m[3]; }
    return isset($m[2]) ? $m[2] : '';
}

/**
 * Add alt text to the images whose src is listed, only where the tag has no alt or an empty one.
 * Returns array(new content, number of images changed).
 */
function gotop_seo_bridge_set_missing_alts($content, $images) {
    $by_src = array();
    foreach ($images as $img) { $by_src[$img['src']] = $img['alt']; }
    $count = 0;
    $out = preg_replace_callback('/<img\b[^>]*>/i', function ($m) use ($by_src, &$count) {
        $tag = $m[0];
        $src = gotop_seo_bridge_attr($tag, 'src');
        if ($src === null || !isset($by_src[html_entity_decode($src, ENT_QUOTES, 'UTF-8')])) { return $tag; }
        $alt = gotop_seo_bridge_attr($tag, 'alt');
        if ($alt !== null && trim($alt) !== '') { return $tag; }
        $value = gotop_seo_bridge_esc($by_src[html_entity_decode($src, ENT_QUOTES, 'UTF-8')]);
        $count++;
        if ($alt !== null) {
            return preg_replace('/\salt\s*=\s*("[^"]*"|\'[^\']*\'|[^\s>]+)/i', ' alt="' . $value . '"', $tag, 1);
        }
        return preg_replace('/^<img\b/i', '<img alt="' . $value . '"', $tag, 1);
    }, $content);
    return array($out === null ? $content : $out, $count);
}

/** The FAQ block for one job, in block-editor markup, identified by its job so undo finds it. */
function gotop_seo_bridge_faq_block($job_id, $heading, $items) {
    $cls = 'gotop-faq gotop-fix-' . substr(preg_replace('/[^0-9a-f]/', '', $job_id), 0, 12);
    $html = '<!-- wp:group {"className":"' . $cls . '"} -->' . "\n";
    $html .= '<div class="wp-block-group ' . $cls . '"><!-- wp:heading -->' . "\n";
    $html .= '<h2 class="wp-block-heading">' . gotop_seo_bridge_esc($heading) . '</h2>' . "\n";
    $html .= '<!-- /wp:heading -->';
    foreach ($items as $item) {
        $html .= "\n\n" . '<!-- wp:heading {"level":3} -->' . "\n";
        $html .= '<h3 class="wp-block-heading">' . gotop_seo_bridge_esc($item['q']) . '</h3>' . "\n";
        $html .= '<!-- /wp:heading -->' . "\n\n";
        $html .= '<!-- wp:paragraph -->' . "\n" . '<p>' . gotop_seo_bridge_esc($item['a']) . '</p>' . "\n" . '<!-- /wp:paragraph -->';
    }
    $html .= '</div>' . "\n" . '<!-- /wp:group -->';
    return $html;
}

function gotop_seo_bridge_append_block($content, $block) {
    return rtrim($content) . "\n\n" . $block;
}

/** Remove exactly one copy of a block this plugin added; null when it is no longer there as written. */
function gotop_seo_bridge_remove_block($content, $block) {
    $at = strpos($content, $block);
    if ($at === false || strpos($content, $block, $at + 1) !== false) { return null; }
    $before = rtrim(substr($content, 0, $at));
    $after = substr($content, $at + strlen($block));
    return $before . $after;
}

/** Same link: the exact address, or the same path on this site written without a host. */
function gotop_seo_bridge_same_link($written, $href, $home_host) {
    $w = trim(html_entity_decode((string) $written, ENT_QUOTES, 'UTF-8'));
    if ($w === '' ) { return false; }
    $norm = function ($u) { return rtrim(preg_replace('/#.*$/', '', $u), '/'); };
    if ($norm($w) === $norm($href)) { return true; }
    if ($w[0] === '/' && (strlen($w) < 2 || $w[1] !== '/')) {
        $parts = wp_parse_url($href);
        if (!$parts || empty($parts['host'])) { return false; }
        $host = preg_replace('/^www\./', '', strtolower($parts['host']));
        if ($host !== preg_replace('/^www\./', '', strtolower((string) $home_host))) { return false; }
        $path = (isset($parts['path']) ? $parts['path'] : '/') . (isset($parts['query']) ? '?' . $parts['query'] : '');
        return $norm($w) === $norm($path);
    }
    return false;
}

/**
 * Point every link to $href at $replacement, or (when $replacement is null) remove the link and
 * keep its words. Returns array(new content, number of links changed).
 */
function gotop_seo_bridge_fix_broken_link($content, $href, $replacement, $home_host) {
    $count = 0;
    $out = preg_replace_callback('/<a\b([^>]*)>(.*?)<\/a>/is', function ($m) use ($href, $replacement, $home_host, &$count) {
        $written = gotop_seo_bridge_attr(' ' . $m[1], 'href');
        if ($written === null || !gotop_seo_bridge_same_link($written, $href, $home_host)) { return $m[0]; }
        $count++;
        if ($replacement === null) { return $m[2]; }
        $attrs = preg_replace('/\shref\s*=\s*("[^"]*"|\'[^\']*\'|[^\s>]+)/i', ' href="' . gotop_seo_bridge_esc($replacement) . '"', ' ' . $m[1], 1);
        return '<a' . rtrim($attrs) . '>' . $m[2] . '</a>';
    }, $content);
    return array($out === null ? $content : $out, $count);
}

/** Whether the content already links to $target. */
function gotop_seo_bridge_links_to($content, $target, $home_host) {
    if (!preg_match_all('/<a\b([^>]*)>/i', $content, $all)) { return false; }
    foreach ($all[1] as $attrs) {
        $written = gotop_seo_bridge_attr(' ' . $attrs, 'href');
        if ($written !== null && gotop_seo_bridge_same_link($written, $target, $home_host)) { return true; }
    }
    return false;
}

/**
 * Wrap the first natural occurrence of $anchor (whole words, in running text: not inside a link,
 * a heading, a button, code, a script or a comment) in a link to $target. The text is unchanged.
 * Returns the new content, or null when there is no such place.
 */
function gotop_seo_bridge_add_internal_link($content, $target, $anchor) {
    $needle = htmlspecialchars($anchor, ENT_NOQUOTES, 'UTF-8');
    $pattern = '/(?<![\p{L}\p{N}])' . preg_quote($needle, '/') . '(?![\p{L}\p{N}])/u';
    $parts = preg_split('/(<!--.*?-->|<[^>]*>)/s', $content, -1, PREG_SPLIT_DELIM_CAPTURE);
    if ($parts === false) { return null; }
    $skip = array('a' => 0, 'h1' => 0, 'h2' => 0, 'h3' => 0, 'h4' => 0, 'h5' => 0, 'h6' => 0, 'script' => 0,
                  'style' => 0, 'code' => 0, 'pre' => 0, 'button' => 0, 'textarea' => 0, 'figcaption' => 0);
    foreach ($parts as $i => $part) {
        if ($part === '') { continue; }
        if ($part[0] === '<') {
            if (strpos($part, '<!--') === 0) { continue; }
            if (preg_match('/^<(\/?)([a-z0-9]+)/i', $part, $t)) {
                $name = strtolower($t[2]);
                if (isset($skip[$name]) && substr($part, -2) !== '/>') {
                    $skip[$name] = $t[1] === '/' ? max(0, $skip[$name] - 1) : $skip[$name] + 1;
                }
            }
            continue;
        }
        if (array_sum($skip) > 0) { continue; }
        if (preg_match($pattern, $part, $m, PREG_OFFSET_CAPTURE)) {
            $at = $m[0][1];
            $parts[$i] = substr($part, 0, $at) . '<a href="' . gotop_seo_bridge_esc($target) . '">' . $m[0][0] . '</a>' . substr($part, $at + strlen($m[0][0]));
            return implode('', $parts);
        }
    }
    return null;
}

// ── 2.1.0: extra main headings become subheadings ───────────────────────────

/** The words of an HTML fragment: comments and tags out, entities decoded, whitespace collapsed. */
function gotop_seo_bridge_words($html) {
    $t = preg_replace('/<!--.*?-->/s', ' ', (string) $html);
    $t = preg_replace('/<[^>]*>/', ' ', $t);
    $t = html_entity_decode($t, ENT_QUOTES | ENT_HTML5, 'UTF-8');
    $t = str_replace("\xC2\xA0", ' ', $t);
    return trim(preg_replace('/\s+/u', ' ', $t));
}

/**
 * The <h1> elements of a post's content, in order: array of array(offset, length, open tag, inner).
 * null when the markup is not simple enough to be sure of (an <h1> without its end, or one inside
 * another): then nothing is changed.
 */
function gotop_seo_bridge_h1_list($content) {
    $opens = preg_match_all('/<h1\b/i', $content);
    if (!preg_match_all('/<h1\b([^>]*)>(.*?)<\/h1\s*>/is', $content, $m, PREG_OFFSET_CAPTURE | PREG_SET_ORDER)) {
        return $opens ? null : array();
    }
    if (count($m) !== $opens) { return null; }
    $out = array();
    foreach ($m as $one) {
        if (preg_match('/<h1\b/i', $one[2][0])) { return null; }
        $out[] = array('at' => $one[0][1], 'len' => strlen($one[0][0]), 'attrs' => $one[1][0], 'inner' => $one[2][0]);
    }
    return $out;
}

/**
 * Demote the listed <h1> elements ($headings: array of array(n => place among the content's h1s,
 * text => its words)) to <h2>. A heading block's comment right before the tag gets "level":2.
 * Returns array('ok' => true, 'content' => the new content), or array('ok' => false, 'code' => ...):
 * 'changed_since_preview' when a heading is no longer there with those words, 'no_safe_place' when
 * the markup is not simple, 'value_invalid' when the words of the page would change (they never
 * should: this is checked, not assumed). (Never a bare string: a content and a code must not be
 * mistaken for each other.)
 */
function gotop_seo_bridge_demote_h1s($content, $headings) {
    $list = gotop_seo_bridge_h1_list($content);
    if ($list === null) { return array('ok' => false, 'code' => 'no_safe_place'); }
    $want = array();
    foreach ($headings as $h) {
        if (!isset($list[$h['n']])) { return array('ok' => false, 'code' => 'changed_since_preview'); }
        if (gotop_seo_bridge_words($list[$h['n']]['inner']) !== gotop_seo_bridge_plain($h['text'])) { return array('ok' => false, 'code' => 'changed_since_preview'); }
        $want[$h['n']] = true;
    }
    // At least one main heading always stays in the content or the theme: never demote them all
    // unless the app said so for each (it checked the live page has a heading of its own).
    $out = $content;
    // From the last to the first, so the earlier offsets stay right.
    for ($i = count($list) - 1; $i >= 0; $i--) {
        if (empty($want[$i])) { continue; }
        $el = $list[$i];
        $replacement = '<h2' . $el['attrs'] . '>' . $el['inner'] . '</h2>';
        $before = substr($out, 0, $el['at']);
        $after = substr($out, $el['at'] + $el['len']);
        // The heading block's own comment, when it sits right before the tag.
        if (preg_match('/<!--\s*wp:heading\s*(\{[^}]*\})?\s*-->\s*$/', $before, $bm, PREG_OFFSET_CAPTURE)) {
            $comment = $bm[0][0];
            $fixed = preg_replace('/"level"\s*:\s*1\b/', '"level":2', $comment, 1);
            $before = substr($before, 0, $bm[0][1]) . $fixed;
        }
        $out = $before . $replacement . $after;
    }
    if (gotop_seo_bridge_words($out) !== gotop_seo_bridge_words($content)) { return array('ok' => false, 'code' => 'value_invalid'); }
    return array('ok' => true, 'content' => $out);
}

/**
 * A page built with a page builder: its builder renders from its own data (or its shortcodes), so
 * a change to the content would not show, or would be lost on the next save. Such pages are never
 * written by h1_demote.
 */
function gotop_seo_bridge_builder_page($post_id, $content) {
    $flags = array(
        '_elementor_edit_mode' => 'builder', '_et_pb_use_builder' => 'on', '_wpb_vc_js_status' => 'true',
        '_bricks_editor_mode' => 'bricks',
    );
    foreach ($flags as $key => $on) {
        if ((string) get_post_meta($post_id, $key, true) === $on) { return true; }
    }
    foreach (array('_fl_builder_enabled', 'ct_builder_shortcodes', '_ct_builder_shortcodes', '_breakdance_data', '_themify_builder_settings_json') as $key) {
        $v = get_post_meta($post_id, $key, true);
        if (!empty($v)) { return true; }
    }
    return (bool) preg_match('/\[(vc_row|et_pb_|fusion_|cs_content|fl_builder|elementor-template|themify_builder)/i', (string) $content);
}
