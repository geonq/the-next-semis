import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import { verifySession } from "@/lib/auth";
import { getThesis, setThesis } from "@/lib/kv";

export async function GET() {
  const markdown = await getThesis();
  return NextResponse.json({ markdown });
}

export async function PUT(request: Request) {
  const cookieStore = await cookies();
  const token = cookieStore.get("session")?.value;
  if (!token || !(await verifySession(token))) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { markdown } = (await request.json()) as { markdown: string };
  if (typeof markdown !== "string") {
    return NextResponse.json({ error: "markdown must be a string" }, { status: 400 });
  }

  await setThesis(markdown);
  return NextResponse.json({ ok: true });
}
