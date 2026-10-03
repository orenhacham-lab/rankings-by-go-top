<?php
/**
 * Signed requests from the GO TOP app.
 *
 * The site holds ONE key: a public id ("gtk_" + 16 hex) and a 32-byte secret, issued by the app
 * and given to this site once (a pairing code pasted in Settings > GO TOP SEO, or pushed by an
 * administrator's application password through /gotop/v1/pair). It is stored in a non-autoloaded
 * option and never printed back.
 *
 * A signed request carries X-GoTop-Key, X-GoTop-Timestamp, X-GoTop-Nonce and X-GoTop-Signature
 * ("v1=" + hex HMAC-SHA256 of the canonical string below). The check fails closed:
 *   - no key stored, or a different key id           -> 401 unknown_key
 *   - a malformed header                              -> 401 bad_headers
 *   - a timestamp more than 300 s from this clock     -> 401 stale
 *   - a signature that does not match (hash_equals)   -> 401 bad_signature
 *   - a nonce seen before (kept for 600 s)            -> 401 replay
 * The nonce is recorded only after the signature verified, so a forgery cannot burn a real one.
 */

if (!defined('ABSPATH')) { exit; }

define('GOTOP_SEO_BRIDGE_WINDOW', 300);

function gotop_seo_bridge_get_key() {
    $key = get_option('gotop_seo_bridge_key');
    if (!is_array($key) || empty($key['key_id']) || empty($key['secret'])) { return null; }
    return $key;
}

function gotop_seo_bridge_store_key($key_id, $secret) {
    $value = array('key_id' => $key_id, 'secret' => $secret, 'paired_at' => time());
    if (get_option('gotop_seo_bridge_key') === false) {
        add_option('gotop_seo_bridge_key', $value, '', 'no');
    } else {
        update_option('gotop_seo_bridge_key', $value, 'no');
    }
}

function gotop_seo_bridge_forget_key() {
    delete_option('gotop_seo_bridge_key');
}

/** "GT1.<key id>.<secret>" -> array(key_id, secret), or null. */
function gotop_seo_bridge_parse_pairing_code($code) {
    $parts = explode('.', trim((string) $code));
    if (count($parts) !== 3 || $parts[0] !== 'GT1') { return null; }
    if (!preg_match('/^gtk_[0-9a-f]{16}$/', $parts[1])) { return null; }
    if (!preg_match('/^[A-Za-z0-9_-]{43}$/', $parts[2])) { return null; }
    return array('key_id' => $parts[1], 'secret' => $parts[2]);
}

function gotop_seo_bridge_canonical_string($method, $route, $timestamp, $nonce, $key_id, $body) {
    return implode("\n", array('GOTOP-HMAC-V1', $method, $route, $timestamp, $nonce, $key_id, hash('sha256', $body)));
}

/**
 * The check itself, free of WordPress so it can be tested alone.
 * $seen(nonce_key) says whether a nonce was used; $remember(nonce_key) records one.
 * Returns true, or a string code.
 */
function gotop_seo_bridge_verify($method, $route, $headers, $body, $stored_key, $now, $seen, $remember) {
    $key_id = isset($headers['x-gotop-key']) ? (string) $headers['x-gotop-key'] : '';
    $ts     = isset($headers['x-gotop-timestamp']) ? (string) $headers['x-gotop-timestamp'] : '';
    $nonce  = isset($headers['x-gotop-nonce']) ? (string) $headers['x-gotop-nonce'] : '';
    $sig    = isset($headers['x-gotop-signature']) ? (string) $headers['x-gotop-signature'] : '';

    if ($method !== 'POST'
        || !preg_match('/^gtk_[0-9a-f]{16}$/', $key_id)
        || !preg_match('/^\d{9,11}$/', $ts)
        || !preg_match('/^[0-9a-f]{32}$/', $nonce)
        || !preg_match('/^v1=[0-9a-f]{64}$/', $sig)) {
        return 'bad_headers';
    }
    if (!is_array($stored_key) || empty($stored_key['secret']) || !is_string($stored_key['key_id'])
        || !hash_equals($stored_key['key_id'], $key_id)) {
        return 'unknown_key';
    }
    if (abs($now - (int) $ts) > GOTOP_SEO_BRIDGE_WINDOW) {
        return 'stale';
    }
    $expected = 'v1=' . hash_hmac('sha256', gotop_seo_bridge_canonical_string($method, $route, $ts, $nonce, $key_id, $body), $stored_key['secret']);
    if (!hash_equals($expected, $sig)) {
        return 'bad_signature';
    }
    $nonce_key = 'gotop_n_' . substr($key_id, 4) . $nonce;
    if (call_user_func($seen, $nonce_key)) {
        return 'replay';
    }
    call_user_func($remember, $nonce_key);
    return true;
}

/** permission_callback of every signed route. */
function gotop_seo_bridge_signed_permission(WP_REST_Request $request) {
    $headers = array();
    foreach (array('x-gotop-key', 'x-gotop-timestamp', 'x-gotop-nonce', 'x-gotop-signature') as $name) {
        $headers[$name] = (string) $request->get_header($name);
    }
    $result = gotop_seo_bridge_verify(
        strtoupper($request->get_method()),
        $request->get_route(),
        $headers,
        (string) $request->get_body(),
        gotop_seo_bridge_get_key(),
        time(),
        function ($k) { return get_transient($k) !== false; },
        function ($k) { set_transient($k, 1, 2 * GOTOP_SEO_BRIDGE_WINDOW); }
    );
    if ($result === true) { return true; }
    return new WP_Error('gotop_' . $result, 'Request not authorized.', array('status' => 401));
}
