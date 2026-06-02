import dns from "node:dns/promises";
import { describe, expect, it, vi } from "vitest";
import { isPrivateIp, isSafePublicUrl } from "@/lib/ssrf";

vi.mock("node:dns/promises", () => ({
  default: {
    lookup: vi.fn()
  }
}));

const lookup = vi.mocked(dns.lookup);

describe("SSRF guards", () => {
  it("rejects private and metadata IP ranges", () => {
    expect(isPrivateIp("127.0.0.1")).toBe(true);
    expect(isPrivateIp("10.1.2.3")).toBe(true);
    expect(isPrivateIp("172.16.0.1")).toBe(true);
    expect(isPrivateIp("192.168.1.1")).toBe(true);
    expect(isPrivateIp("169.254.169.254")).toBe(true);
    expect(isPrivateIp("::1")).toBe(true);
    expect(isPrivateIp("::ffff:127.0.0.1")).toBe(true);
    expect(isPrivateIp("8.8.8.8")).toBe(false);
  });

  it("rejects IPv4-compatible, NAT64, and 6to4 addresses embedding private IPv4", () => {
    // IPv4-compatible ::x.y.z.w
    expect(isPrivateIp("::127.0.0.1")).toBe(true);
    expect(isPrivateIp("::169.254.169.254")).toBe(true);
    expect(isPrivateIp("::7f00:1")).toBe(true);
    expect(isPrivateIp("::a9fe:a9fe")).toBe(true);
    expect(isPrivateIp("::8.8.8.8")).toBe(false);
    expect(isPrivateIp("::808:808")).toBe(false);

    // NAT64 64:ff9b::/96 dotted-quad suffix
    expect(isPrivateIp("64:ff9b::127.0.0.1")).toBe(true);
    expect(isPrivateIp("64:ff9b::169.254.169.254")).toBe(true);
    expect(isPrivateIp("64:ff9b::8.8.8.8")).toBe(false);

    // NAT64 64:ff9b::/96 hex-group suffix (e.g. 7f00:1 = 127.0.0.1)
    expect(isPrivateIp("64:ff9b::7f00:1")).toBe(true);
    expect(isPrivateIp("64:ff9b::a9fe:a9fe")).toBe(true); // 169.254.169.254
    expect(isPrivateIp("64:ff9b::808:808")).toBe(false);  // 8.8.8.8
    expect(isPrivateIp("64:ff9b:0:0:0:0:7f00:1")).toBe(true);
    expect(isPrivateIp("64:ff9b:0000:0000:0000:0000:a9fe:a9fe")).toBe(true);
    expect(isPrivateIp("64:ff9b:0:0:0:0:808:808")).toBe(false);

    // 6to4 2002::/16 (2002:7f00:1:: embeds 127.0.0.1)
    expect(isPrivateIp("2002:7f00:1::")).toBe(true);
    expect(isPrivateIp("2002:a9fe:a9fe::")).toBe(true); // 169.254.169.254
    expect(isPrivateIp("2002:808:808::")).toBe(false);  // 8.8.8.8
  });

  it("validates protocols, internal hostnames, and resolved IPs", async () => {
    lookup.mockResolvedValueOnce([{ address: "93.184.216.34", family: 4 }]);
    await expect(isSafePublicUrl("https://example.com/article")).resolves.toBe(true);

    await expect(isSafePublicUrl("file:///etc/passwd")).resolves.toBe(false);
    await expect(isSafePublicUrl("http://localhost")).resolves.toBe(false);
    await expect(isSafePublicUrl("http://metadata.google.internal")).resolves.toBe(false);
    await expect(isSafePublicUrl("http://169.254.169.254/latest/meta-data")).resolves.toBe(false);

    lookup.mockResolvedValueOnce([{ address: "10.0.0.1", family: 4 }]);
    await expect(isSafePublicUrl("https://public-name.example")).resolves.toBe(false);
  });
});
