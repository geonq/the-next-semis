import dns from "node:dns/promises";
import net from "node:net";

// SSRF guards for the admin link-preview fetcher (`/api/fetch-meta`). Pure + DNS-only,
// so they can be unit-tested in isolation.

// Reject loopback, private, link-local (incl. 169.254.169.254 cloud metadata), CGNAT,
// and reserved ranges — for both IPv4 and IPv6 (including IPv4-mapped forms).
export function isPrivateIp(address: string): boolean {
  const ip = address.toLowerCase().replace(/^::ffff:/, "");
  if (net.isIPv4(ip)) {
    const [a, b] = ip.split(".").map(Number);
    if (a === 0 || a === 10 || a === 127) return true;
    if (a === 169 && b === 254) return true; // link-local + AWS/GCP metadata
    if (a === 172 && b >= 16 && b <= 31) return true;
    if (a === 192 && b === 168) return true;
    if (a === 100 && b >= 64 && b <= 127) return true; // CGNAT
    if (a >= 224) return true; // multicast / reserved
    return false;
  }
  if (net.isIPv6(ip)) {
    if (ip === "::" || ip === "::1") return true;
    if (ip.startsWith("fe80")) return true; // link-local
    if (ip.startsWith("fc") || ip.startsWith("fd")) return true; // unique-local fc00::/7
    return false;
  }
  return true; // unparseable → reject
}

// https/http only, no metadata/internal hostnames, and every resolved IP must be public
// (defends against a public hostname that points at a private address).
export async function isSafePublicUrl(rawUrl: string): Promise<boolean> {
  let parsed: URL;
  try {
    parsed = new URL(rawUrl);
  } catch {
    return false;
  }
  if (parsed.protocol !== "https:" && parsed.protocol !== "http:") return false;

  const host = parsed.hostname.replace(/^\[|\]$/g, "").toLowerCase();
  if (
    !host ||
    host === "localhost" ||
    host === "metadata" ||
    host.endsWith(".local") ||
    host.endsWith(".internal")
  ) {
    return false;
  }

  if (net.isIP(host)) return !isPrivateIp(host);

  try {
    const resolved = await dns.lookup(host, { all: true });
    return resolved.length > 0 && resolved.every((entry) => !isPrivateIp(entry.address));
  } catch {
    return false;
  }
}
