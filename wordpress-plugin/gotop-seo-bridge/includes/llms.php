<?php
/**
 * 2.1.0: llms.txt, served by WordPress when the site has none.
 *
 * The text the merchant approved in GO TOP is kept in this plugin's own option
 * (gotop_seo_bridge_llms, not autoloaded) and answered at <home>/llms.txt as plain text. Nothing
 * is written to the disk. A real llms.txt file always wins:
 *   - a fix is refused (file_exists) when the site's root already holds one;
 *   - a request for /llms.txt that reaches WordPress at all means the web server found no file,
 *     and the plugin checks the root again before it answers, so a file added later is never
 *     shadowed.
 * Before every write the previous text is stored per job (gotop_seo_bridge_llms_jobs), which is
 * what /undo restores; undo refuses when the text was changed after the fix.
 */

if (!defined('ABSPATH')) { exit; }

define('GOTOP_SEO_BRIDGE_LLMS_MAX', 20000);

function gotop_seo_bridge_llms_get() {
    $v = get_option('gotop_seo_bridge_llms');
    return is_string($v) ? $v : '';
}

/** The site's root llms.txt as a file on disk (placed by the host, another plugin or by hand). */
function gotop_seo_bridge_llms_file_exists() {
    $roots = array(ABSPATH);
    if (!empty($_SERVER['DOCUMENT_ROOT']) && is_string($_SERVER['DOCUMENT_ROOT'])) { $roots[] = $_SERVER['DOCUMENT_ROOT']; }
    foreach ($roots as $root) {
        if (file_exists(rtrim($root, '/\\') . '/llms.txt')) { return true; }
    }
    return false;
}

/**
 * The approved text, validated: plain text (Markdown), no "<" anywhere, ">" only as a quote mark at
 * the start of a line, no control characters but line breaks and tabs, at most 20 000 characters.
 */
function gotop_seo_bridge_llms_text_ok($raw) {
    if (!is_string($raw)) { return null; }
    $t = str_replace(array("\r\n", "\r"), "\n", $raw);
    if (preg_match('/[\x00-\x08\x0b-\x1f\x7f]/', $t) || strpos($t, '<') !== false) { return null; }
    $lines = array();
    foreach (explode("\n", $t) as $line) {
        $line = rtrim($line);
        $body = preg_replace('/^(?:>[ \t]?)+/', '', $line);
        if (strpos((string) $body, '>') !== false) { return null; }
        if (strlen($line) > 2000) { return null; }
        $lines[] = $line;
    }
    $t = trim(implode("\n", $lines)) . "\n";
    $len = function_exists('mb_strlen') ? mb_strlen($t, 'UTF-8') : strlen($t);
    if ($len < 20 || $len > GOTOP_SEO_BRIDGE_LLMS_MAX) { return null; }
    if (strpos($t, '# ') !== 0) { return null; }
    return $t;
}

function gotop_seo_bridge_llms_jobs() {
    $jobs = get_option('gotop_seo_bridge_llms_jobs');
    return is_array($jobs) ? $jobs : array();
}

function gotop_seo_bridge_llms_backup($job_id) {
    $jobs = gotop_seo_bridge_llms_jobs();
    return isset($jobs[$job_id]) && is_array($jobs[$job_id]) ? $jobs[$job_id] : null;
}

function gotop_seo_bridge_llms_save_backup($job_id, $backup) {
    $jobs = gotop_seo_bridge_llms_jobs();
    unset($jobs[$job_id]);
    $jobs = array($job_id => $backup) + $jobs;
    $jobs = array_slice($jobs, 0, 20, true);
    if (get_option('gotop_seo_bridge_llms_jobs') === false) { add_option('gotop_seo_bridge_llms_jobs', $jobs, '', 'no'); }
    else { update_option('gotop_seo_bridge_llms_jobs', $jobs, 'no'); }
}

function gotop_seo_bridge_llms_store($text) {
    if ($text === '') { delete_option('gotop_seo_bridge_llms'); return true; }
    if (get_option('gotop_seo_bridge_llms') === false) { add_option('gotop_seo_bridge_llms', $text, '', 'no'); }
    else { update_option('gotop_seo_bridge_llms', $text, 'no'); }
    return gotop_seo_bridge_llms_get() === $text;
}

/** Apply one approved llms.txt. $url must be this site's address (the job's page is the home page). */
function gotop_seo_bridge_llms_apply($job_id, $url, $text, $expected) {
    if (gotop_seo_bridge_on_site($url) === null) { return array('ok' => false, 'code' => 'off_site'); }
    if (gotop_seo_bridge_llms_file_exists()) { return array('ok' => false, 'code' => 'file_exists'); }
    $existing = gotop_seo_bridge_llms_backup($job_id);
    if ($existing && empty($existing['undone'])) {
        return array('ok' => true, 'status' => 'already', 'fix_id' => $job_id, 'post_id' => 0);
    }
    $previous = gotop_seo_bridge_llms_get();
    if ($previous === $text) {
        return array('ok' => true, 'status' => 'already', 'fix_id' => $job_id, 'post_id' => 0, 'previous' => $previous, 'applied' => $text);
    }
    if ($expected !== null && $expected !== $previous) { return array('ok' => false, 'code' => 'changed_since_preview'); }
    // The previous text is stored BEFORE the write.
    gotop_seo_bridge_llms_save_backup($job_id, array('type' => 'llms_txt', 'previous' => $previous, 'value' => $text, 'at' => time()));
    if (!gotop_seo_bridge_llms_store($text)) {
        $jobs = gotop_seo_bridge_llms_jobs();
        unset($jobs[$job_id]);
        update_option('gotop_seo_bridge_llms_jobs', $jobs, 'no');
        return array('ok' => false, 'code' => 'write_failed');
    }
    gotop_seo_bridge_log($job_id, 'llms_txt', 0, 'applied');
    return array('ok' => true, 'status' => 'applied', 'fix_id' => $job_id, 'post_id' => 0, 'where' => 'llms',
        'previous' => $previous, 'applied' => $text, 'served_at' => home_url('/llms.txt'));
}

function gotop_seo_bridge_llms_undo($job_id) {
    $backup = gotop_seo_bridge_llms_backup($job_id);
    if (!$backup) { return array('ok' => false, 'code' => 'nothing_to_undo'); }
    if (!empty($backup['undone'])) { return array('ok' => true, 'status' => 'already', 'fix_id' => $job_id); }
    // Someone changed the text after the fix: their text stays; nothing is overwritten.
    if (gotop_seo_bridge_llms_get() !== (string) $backup['value']) { return array('ok' => false, 'code' => 'changed_since_preview'); }
    if (!gotop_seo_bridge_llms_store((string) $backup['previous'])) { return array('ok' => false, 'code' => 'write_failed'); }
    $backup['undone'] = true;
    $backup['undone_at'] = time();
    gotop_seo_bridge_llms_save_backup($job_id, $backup);
    gotop_seo_bridge_log($job_id, 'llms_txt', 0, 'reverted');
    return array('ok' => true, 'status' => 'reverted', 'fix_id' => $job_id, 'post_id' => 0);
}

/**
 * What a request answers: the stored text for GET/HEAD <home path>/llms.txt when there is one and no
 * real file; otherwise null (WordPress carries on as usual).
 */
function gotop_seo_bridge_llms_response($method, $request_uri) {
    if ($method !== 'GET' && $method !== 'HEAD') { return null; }
    $path = parse_url((string) $request_uri, PHP_URL_PATH);
    $home = parse_url(home_url('/'), PHP_URL_PATH);
    $want = rtrim(is_string($home) ? $home : '', '/') . '/llms.txt';
    if (!is_string($path) || $path !== $want) { return null; }
    $text = gotop_seo_bridge_llms_get();
    if ($text === '' || gotop_seo_bridge_llms_file_exists()) { return null; }
    return $text;
}

add_action('init', 'gotop_seo_bridge_llms_serve', 0);
function gotop_seo_bridge_llms_serve() {
    $method = isset($_SERVER['REQUEST_METHOD']) ? strtoupper((string) $_SERVER['REQUEST_METHOD']) : 'GET';
    $uri = isset($_SERVER['REQUEST_URI']) ? (string) $_SERVER['REQUEST_URI'] : '';
    $text = gotop_seo_bridge_llms_response($method, $uri);
    if ($text === null) { return; }
    if (!headers_sent()) {
        status_header(200);
        header('Content-Type: text/plain; charset=utf-8');
        header('X-Content-Type-Options: nosniff');
    }
    if ($method === 'GET') { echo $text; }
    exit;
}
