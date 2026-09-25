import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  images: {
    remotePatterns: [
      {
        protocol: 'https',
        hostname: '*.supabase.co',
        pathname: '/storage/v1/object/public/**',
      },
    ],
  },
  async headers() {
    return [
      {
        // Baseline hardening for every response (OWASP A02). None of these
        // change what a page may load, so they cannot break GTM, PayPal or
        // App Bridge; a full script CSP is intentionally NOT set here.
        source: '/:path*',
        headers: [
          { key: 'X-Content-Type-Options', value: 'nosniff' },
          { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
          { key: 'Strict-Transport-Security', value: 'max-age=31536000' },
          { key: 'Permissions-Policy', value: 'camera=(), microphone=(), geolocation=()' },
        ],
      },
      {
        // Anti-clickjacking for everything EXCEPT the Shopify surfaces, which
        // Shopify Admin frames (the /shopify/app rule below scopes those to
        // Shopify). Sending a second CSP there would be enforced alongside it
        // and block the Admin iframe, hence the exclusion.
        source: '/((?!shopify/|shopify$|api/shopify/).*)',
        headers: [
          { key: 'X-Frame-Options', value: 'SAMEORIGIN' },
          { key: 'Content-Security-Policy', value: "frame-ancestors 'self'" },
        ],
      },
      {
        source: '/favicon.ico',
        headers: [
          {
            key: 'Cache-Control',
            value: 'public, max-age=3600',
          },
        ],
      },
      {
        source: '/favicon-:size(16|32|64|192|512).png',
        headers: [
          {
            key: 'Cache-Control',
            value: 'public, max-age=3600',
          },
        ],
      },
      {
        source: '/apple-touch-icon.png',
        headers: [
          {
            key: 'Cache-Control',
            value: 'public, max-age=3600',
          },
        ],
      },
      {
        // Phase 2 — the embedded Shopify App Home is the ONLY page in this
        // app meant to render inside an iframe. Explicitly scope
        // frame-ancestors to Shopify only, rather than leaving framing
        // unrestricted (the site otherwise sets no X-Frame-Options/CSP).
        source: '/shopify/app/:path*',
        headers: [
          {
            key: 'Content-Security-Policy',
            value: 'frame-ancestors https://admin.shopify.com https://*.myshopify.com;',
          },
        ],
      },
    ];
  },
};

export default nextConfig;
