import { NextResponse } from "next/server";

export async function POST() {
  const response = NextResponse.json({ ok: true });
  response.cookies.delete({ name: "session", path: "/" });
  response.cookies.delete({ name: "is_admin", path: "/" });
  return response;
}
