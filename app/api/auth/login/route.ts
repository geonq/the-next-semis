import { NextResponse } from "next/server";
import { signSession } from "@/lib/auth";

export async function POST(request: Request) {
  const { password } = await request.json();
  const expected = process.env.ADMIN_PASSWORD;

  if (!expected || password !== expected) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const token = await signSession();
  const response = NextResponse.json({ ok: true });

  // httpOnly JWT for actual auth verification
  response.cookies.set("session", token, {
    httpOnly: true,
    sameSite: "strict",
    secure: process.env.NODE_ENV === "production",
    maxAge: 60 * 60 * 24 * 7
  });

  // Non-httpOnly display hint so the client-side nav can read it
  response.cookies.set("is_admin", "1", {
    httpOnly: false,
    sameSite: "strict",
    secure: process.env.NODE_ENV === "production",
    maxAge: 60 * 60 * 24 * 7
  });

  return response;
}
