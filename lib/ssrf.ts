import dns from "node:dns/promises";
import net from "node:net";

// SSRF guards for the admin link-preview fetcher (`/api/fetch-meta`). Pure + DNS-only,
// so they can be unit-tested in isolation.

// Reject loopback, private, link-local (incl. 169.254.169.254 cloud metadata), CGNAT,
// and reserved ranges — for both IPv4 and IPv6, including IPv4-mapped, IPv4-compatible,
// NAT64 (64:ff9b::/96), and 6to4 (2002::/16) forms that embed a private IPv4.
export function isPrivateIp(address: string): boolean {
  // Strip IPv4-mapped dotted-quad form ::ffff:a.b.c.d → a.b.c.d
  const ip = address.toLowerCase().replace(/^::ffff:/i, "");

  function embeddedHexIpv4(hiText: string, loText: string): string | null {
    const hi = parseInt(hiText, 16);
    const lo = parseInt(loText, 16);
    if (!Number.isFinite(hi) || !Number.isFinite(lo) || hi < 0 || hi > 0xffff || lo < 0 || lo > 0xffff) {
      return null;
    }
    return `${hi >> 8}.${hi & 0xff}.${lo >> 8}.${lo & 0xff}`;
  }

  // IPv4-compatible ::x.y.z.w — deprecated but accepted by some kernels as loopback.
  const ipv4Compat = ip.match(/^::([0-9]+\.[0-9]+\.[0-9]+\.[0-9]+)$/);
  if (ipv4Compat) return !net.isIPv4(ipv4Compat[1]) || isPrivateIp(ipv4Compat[1]);

  // IPv4-compatible hex form ::hhhh:hhhh — equivalent to ::x.y.z.w.
  const ipv4CompatHex = ip.match(/^::([0-9a-f]{1,4}):([0-9a-f]{1,4})$/);
  if (ipv4CompatHex) {
    const embedded = embeddedHexIpv4(ipv4CompatHex[1], ipv4CompatHex[2]);
    return !embedded || isPrivateIp(embedded);
  }

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

    // NAT64 well-known prefix 64:ff9b::/96 — a NAT64 gateway routes these to the
    // embedded IPv4 in the last 32 bits (dotted-quad or two hex groups).
    if (ip.startsWith("64:ff9b::")) {
      const embedded = ip.slice("64:ff9b::".length);
      if (net.isIPv4(embedded)) return isPrivateIp(embedded);
      const m = embedded.match(/^([0-9a-f]{1,4}):([0-9a-f]{1,4})$/);
      if (m) {
        const v4 = embeddedHexIpv4(m[1], m[2]);
        return !v4 || isPrivateIp(v4);
      }
      return true; // unrecognised NAT64 suffix → reject
    }

    // Expanded NAT64 form 64:ff9b:0:0:0:0:hhhh:hhhh.
    const expandedNat64 = ip.match(/^64:ff9b:0{1,4}:0{1,4}:0{1,4}:0{1,4}:([0-9a-f]{1,4}):([0-9a-f]{1,4})$/);
    if (expandedNat64) {
      const v4 = embeddedHexIpv4(expandedNat64[1], expandedNat64[2]);
      return !v4 || isPrivateIp(v4);
    }

    // 6to4 2002::/16 — bits 17-48 encode the embedded IPv4 (groups 2 and 3).
    if (ip.startsWith("2002:")) {
      const parts = ip.split(":");
      if (parts[1] && parts[2]) {
        const v4 = embeddedHexIpv4(parts[1], parts[2]);
        if (v4 && net.isIPv4(v4)) return isPrivateIp(v4);
      }
      return true; // malformed 6to4 → reject
    }

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
