import type { NextConfig } from "next";

// Baseline hardening headers on every response. CSP is intentionally limited to
// `frame-ancestors 'none'` (clickjacking) — a full script CSP needs per-route nonces
// for Next's inline bootstrap and is out of scope here.
const securityHeaders = [
  { key: "X-Content-Type-Options", value: "nosniff" },
  { key: "X-Frame-Options", value: "DENY" },
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=(), browsing-topics=()" },
  // frame-ancestors blocks clickjacking. object-src and base-uri need no nonces and
  // close two injection vectors regardless of whether a full script CSP is ever added.
  { key: "Content-Security-Policy", value: "frame-ancestors 'none'; object-src 'none'; base-uri 'none'" }
];

const nextConfig: NextConfig = {
  devIndicators: false,
  async headers() {
    return [{ source: "/:path*", headers: securityHeaders }];
  }
};

export default nextConfig;
