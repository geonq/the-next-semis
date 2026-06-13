import { type NextRequest, NextResponse } from "next/server";
import { verifySession } from "@/lib/auth";

function sameOriginWrite(request: NextRequest): boolean {
  const origin = request.headers.get("origin");
  if (!origin) return true;

  try {
    const originUrl = new URL(origin);
    const host = request.headers.get("x-forwarded-host") ?? request.headers.get("host") ?? request.nextUrl.host;
    const proto = request.headers.get("x-forwarded-proto") ?? request.nextUrl.protocol.replace(":", "");
    return originUrl.origin === `${proto}://${host}`;
  } catch {
    return false;
  }
}

export async function middleware(request: NextRequest) {
  const isWrite =
    request.method === "POST" ||
    request.method === "DELETE" ||
    request.method === "PUT" ||
    request.method === "PATCH";
  if (isWrite) {
    if (!sameOriginWrite(request)) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    const token = request.cookies.get("session")?.value;
    if (!token || !(await verifySession(token))) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
  }
  return NextResponse.next();
}

export const config = {
  matcher: [
    "/api/positions/:path*",
    "/api/realized-pnl/:path*",
    "/api/watchlist/:path*",
    "/api/saved-items/:path*",
    "/api/thesis/:path*",
    "/api/discovery-scan/:path*"
  ]
};
