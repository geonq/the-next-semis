import { type NextRequest, NextResponse } from "next/server";
import { verifySession } from "@/lib/auth";

export async function middleware(request: NextRequest) {
  const isWrite = request.method === "POST" || request.method === "DELETE";
  if (isWrite) {
    const token = request.cookies.get("session")?.value;
    if (!token || !(await verifySession(token))) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
  }
  return NextResponse.next();
}

export const config = {
  matcher: ["/api/positions/:path*", "/api/watchlist/:path*"]
};
