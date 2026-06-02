import { extractBrandApiColor } from "./brand-color";

const browserUa = "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36";

type BrandfetchInput = {
  ticker?: string | null;
  domain?: string | null;
  signal?: AbortSignal;
};

function withTimeout(ms: number, signal?: AbortSignal): AbortSignal {
  return signal ? AbortSignal.any([signal, AbortSignal.timeout(ms)]) : AbortSignal.timeout(ms);
}

export async function fetchBrandfetchColor({ ticker, domain, signal }: BrandfetchInput): Promise<string | null> {
  const apiKey = process.env.BRANDFETCH_API_KEY;
  if (!apiKey) return null;

  const paths: string[] = [];
  if (ticker) paths.push(`/v2/brands/ticker/${encodeURIComponent(ticker)}`);
  if (domain) paths.push(`/v2/brands/domain/${encodeURIComponent(domain)}`);

  for (const path of paths) {
    try {
      const response = await fetch(`https://api.brandfetch.io${path}`, {
        signal: withTimeout(4000, signal),
        headers: {
          Authorization: `Bearer ${apiKey}`,
          "User-Agent": browserUa
        }
      });
      if (!response.ok) continue;
      const color = extractBrandApiColor(await response.json());
      if (color) return color;
    } catch {
      // Brandfetch is a best-effort color source; callers decide fallback behavior.
    }
  }

  return null;
}
