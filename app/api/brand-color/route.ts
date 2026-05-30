import { NextResponse } from "next/server";
import { getBrandColor, setBrandColor } from "@/lib/kv";

export const runtime = "nodejs";

const browserUa = "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36";
const genericColors = new Set(["#fff", "#ffffff", "#000", "#000000"]);

function cleanHex(value: string | undefined): string | null {
  if (!value) return null;
  const color = value.trim();
  if (!/^#[0-9a-f]{3,8}$/i.test(color)) return null;
  if (genericColors.has(color.toLowerCase())) return null;
  return color;
}

function themeColor(html: string): string | null {
  const match =
    html.match(/<meta[^>]+name=["']theme-color["'][^>]+content=["']([^"']+)["']/i) ??
    html.match(/<meta[^>]+content=["']([^"']+)["'][^>]+name=["']theme-color["']/i);
  return cleanHex(match?.[1]);
}

async function resolveDomain(company: string): Promise<string | null> {
  const queries = Array.from(
    new Set([
      company,
      company.replace(/\b(Holding|Holdings|N\.V\.|Inc\.|Corp\.|Corporation|Ltd\.?|PLC|S\.A\.)\b/gi, "").trim(),
      company.split(/\s+/)[0]
    ].filter(Boolean))
  );

  for (const query of queries) {
    const response = await fetch(
      `https://autocomplete.clearbit.com/v1/companies/suggest?query=${encodeURIComponent(query)}`,
      { signal: AbortSignal.timeout(8000), headers: { "User-Agent": browserUa } }
    );
    if (!response.ok) continue;
    const suggestions = (await response.json()) as { domain?: string }[];
    if (suggestions[0]?.domain) return suggestions[0].domain;
  }
  return null;
}

async function fetchThemeColor(domain: string): Promise<string | null> {
  for (const url of [`https://www.${domain}`, `https://${domain}`]) {
    try {
      const response = await fetch(url, {
        redirect: "follow",
        signal: AbortSignal.timeout(8000),
        headers: { "User-Agent": browserUa }
      });
      if (!response.ok) continue;
      const color = themeColor(await response.text());
      if (color) return color;
    } catch {
      // Try the next host form.
    }
  }
  return null;
}

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const company = searchParams.get("company")?.trim();
  if (!company) return NextResponse.json({ color: null });

  try {
    const cached = await getBrandColor(company);
    if (cached !== undefined) return NextResponse.json({ color: cached });

    const domain = await resolveDomain(company);
    if (!domain) {
      await setBrandColor(company, null);
      return NextResponse.json({ color: null });
    }

    const color = await fetchThemeColor(domain);
    await setBrandColor(company, color);
    return NextResponse.json({ color });
  } catch {
    return NextResponse.json({ color: null });
  }
}
