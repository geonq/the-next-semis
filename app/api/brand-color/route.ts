import { NextResponse } from "next/server";

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const company = searchParams.get("company")?.trim();
  if (!company) return NextResponse.json({ color: null });

  try {
    const clearbitRes = await fetch(
      `https://autocomplete.clearbit.com/v1/companies/suggest?query=${encodeURIComponent(company)}`,
      { signal: AbortSignal.timeout(3000), headers: { "User-Agent": "Mozilla/5.0" } }
    );
    const suggestions = (await clearbitRes.json()) as { domain: string }[];
    if (!suggestions.length) return NextResponse.json({ color: null });

    const domain = suggestions[0].domain;
    const siteRes = await fetch(`https://${domain}`, {
      signal: AbortSignal.timeout(4000),
      headers: { "User-Agent": "Mozilla/5.0" }
    });
    const html = await siteRes.text();

    const match =
      html.match(/<meta[^>]+name=["']theme-color["'][^>]+content=["']([^"']+)["']/i) ??
      html.match(/<meta[^>]+content=["']([^"']+)["'][^>]+name=["']theme-color["']/i);

    return NextResponse.json({ color: match?.[1] ?? null });
  } catch {
    return NextResponse.json({ color: null });
  }
}
