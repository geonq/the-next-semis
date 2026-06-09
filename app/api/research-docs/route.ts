import { cookies } from "next/headers";
import { NextRequest, NextResponse } from "next/server";
import { verifySession } from "@/lib/auth";
import {
  deleteResearchDocContent,
  getResearchDocContent,
  getResearchDocs,
  setResearchDocContent,
  setResearchDocs
} from "@/lib/kv";
import type { ResearchDoc } from "@/lib/types";

const MAX_BYTES = 4 * 1024 * 1024;

async function assertAdmin(): Promise<boolean> {
  const cookieStore = await cookies();
  const token = cookieStore.get("session")?.value;
  return !!token && (await verifySession(token));
}

export async function GET(request: NextRequest) {
  const id = request.nextUrl.searchParams.get("id");

  if (id) {
    const docs = await getResearchDocs();
    const doc = docs.find((d) => d.id === id);
    if (!doc) return NextResponse.json({ error: "Not found" }, { status: 404 });

    const content = await getResearchDocContent(id);
    if (content === null) return NextResponse.json({ error: "Content not found" }, { status: 404 });

    if (doc.type === "md") {
      return new NextResponse(content, {
        headers: {
          "Content-Type": "text/markdown; charset=utf-8",
          "Content-Disposition": `attachment; filename="${doc.name}"`
        }
      });
    }

    const buffer = Buffer.from(content, "base64");
    return new NextResponse(buffer, {
      headers: {
        "Content-Type": "application/pdf",
        "Content-Disposition": `inline; filename="${doc.name}"`
      }
    });
  }

  const docs = await getResearchDocs();
  return NextResponse.json(docs);
}

export async function POST(request: NextRequest) {
  if (!(await assertAdmin())) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const formData = await request.formData();
  const file = formData.get("file") as File | null;
  if (!file) return NextResponse.json({ error: "No file" }, { status: 400 });

  const ext = file.name.split(".").pop()?.toLowerCase();
  if (ext !== "md" && ext !== "pdf") {
    return NextResponse.json({ error: "Only .md and .pdf files are accepted" }, { status: 400 });
  }

  if (file.size > MAX_BYTES) {
    return NextResponse.json({ error: "File exceeds 4 MB limit" }, { status: 400 });
  }

  const id = `${Date.now()}-${Math.random().toString(36).slice(2)}`;
  const bytes = await file.arrayBuffer();
  const content =
    ext === "md" ? new TextDecoder().decode(bytes) : Buffer.from(bytes).toString("base64");

  const doc: ResearchDoc = {
    id,
    name: file.name,
    type: ext,
    size: file.size,
    addedAt: Math.floor(Date.now() / 1000)
  };

  await setResearchDocContent(id, content);
  const docs = await getResearchDocs();
  await setResearchDocs([doc, ...docs]);

  return NextResponse.json(doc, { status: 201 });
}

export async function DELETE(request: NextRequest) {
  if (!(await assertAdmin())) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { id } = await request.json();
  if (!id) return NextResponse.json({ error: "No id" }, { status: 400 });

  const docs = await getResearchDocs();
  await setResearchDocs(docs.filter((d) => d.id !== id));
  await deleteResearchDocContent(id);

  return NextResponse.json({ ok: true });
}
