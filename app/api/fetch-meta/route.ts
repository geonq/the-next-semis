import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import { verifySession } from "@/lib/auth";
import { isSafePublicUrl } from "@/lib/ssrf";

export const runtime = "nodejs";

const MAX_REDIRECTS = 4;
const MAX_BYTES = 512 * 1024; // only need <head> for og:title/<title>

// Follow redirects manually, re-validating each hop, so a public URL can't 302 us onto
// an internal address. Caps total bytes read.
async function fetchHtmlGuarded(startUrl: string): Promise<string | null> {
  let url = startUrl;
  for (let hop = 0; hop <= MAX_REDIRECTS; hop += 1) {
    if (!(await isSafePublicUrl(url))) return null;

    const response = await fetch(url, {
      redirect: "manual",
      headers: { "user-agent": "Mozilla/5.0 (compatible; bot)" },
      signal: AbortSignal.timeout(5000)
    });

    if (response.status >= 300 && response.status < 400) {
      const location = response.headers.get("location");
      if (!location) return null;
      url = new URL(location, url).toString();
      continue;
    }
    if (!response.ok || !response.body) return null;

    const reader = response.body.getReader();
    const chunks: Uint8Array[] = [];
    let total = 0;
    while (total < MAX_BYTES) {
      const { done, value } = await reader.read();
      if (done) break;
      chunks.push(value);
      total += value.length;
    }
    await reader.cancel().catch(() => {});

    const buffer = new Uint8Array(total);
    let offset = 0;
    for (const chunk of chunks) {
      buffer.set(chunk.subarray(0, Math.min(chunk.length, MAX_BYTES - offset)), offset);
      offset += chunk.length;
      if (offset >= MAX_BYTES) break;
    }
    return new TextDecoder().decode(buffer);
  }
  return null;
}

export async function GET(request: Request) {
  const cookieStore = await cookies();
  const token = cookieStore.get("session")?.value;
  if (!token || !(await verifySession(token))) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const url = new URL(request.url).searchParams.get("url");
  if (!url) return NextResponse.json({ error: "Missing url" }, { status: 400 });
  if (!(await isSafePublicUrl(url))) return NextResponse.json({ error: "Unsupported url" }, { status: 400 });

  try {
    const html = await fetchHtmlGuarded(url);
    if (html === null) return NextResponse.json({ title: "" });
    const ogTitle = html.match(/<meta[^>]+property="og:title"[^>]+content="([^"]+)"/i)?.[1]
      ?? html.match(/<meta[^>]+content="([^"]+)"[^>]+property="og:title"/i)?.[1];
    const pageTitle = html.match(/<title[^>]*>([^<]+)<\/title>/i)?.[1];
    const title = (ogTitle ?? pageTitle ?? "").trim().replace(/&amp;/g, "&").replace(/&quot;/g, '"');
    return NextResponse.json({ title });
  } catch {
    return NextResponse.json({ title: "" });
  }
}
