import { del } from "@vercel/blob";
import { handleUpload, type HandleUploadBody } from "@vercel/blob/client";
import { cookies } from "next/headers";
import { NextRequest, NextResponse } from "next/server";
import { verifySession } from "@/lib/auth";
import { getResearchDocs, setResearchDocs } from "@/lib/kv";
import type { ResearchDoc } from "@/lib/types";

const MAX_BYTES = 25 * 1024 * 1024;

async function isAdmin(): Promise<boolean> {
  const cookieStore = await cookies();
  const token = cookieStore.get("session")?.value;
  return !!token && (await verifySession(token));
}

export async function GET() {
  const docs = await getResearchDocs();
  return NextResponse.json(docs);
}

// Handles both the token-generation step and the completion callback from Vercel Blob.
export async function POST(request: NextRequest): Promise<Response> {
  const body = (await request.json()) as HandleUploadBody;

  try {
    const jsonResponse = await handleUpload({
      body,
      request,
      onBeforeGenerateToken: async (_pathname, clientPayload) => {
        if (!(await isAdmin())) throw new Error("Unauthorized");
        const { name } = JSON.parse(clientPayload ?? "{}") as { name?: string };
        const ext = name?.split(".").pop()?.toLowerCase();
        if (ext !== "md" && ext !== "pdf") throw new Error("Only .md and .pdf files are accepted");
        return {
          allowedContentTypes: ["application/pdf", "text/markdown", "text/plain"],
          maximumSizeInBytes: MAX_BYTES,
          tokenPayload: clientPayload ?? "",
        };
      },
      onUploadCompleted: async ({ blob, tokenPayload }) => {
        const { name, size } = JSON.parse(tokenPayload ?? "{}") as {
          name?: string;
          size?: number;
        };
        const fileName = name ?? blob.pathname.split("/").pop() ?? blob.pathname;
        const ext = (fileName.split(".").pop()?.toLowerCase() ?? "pdf") as "md" | "pdf";
        const doc: ResearchDoc = {
          id: crypto.randomUUID(),
          name: fileName,
          type: ext,
          size: size ?? 0,
          blobUrl: blob.url,
          addedAt: Math.floor(Date.now() / 1000),
        };
        const docs = await getResearchDocs();
        await setResearchDocs([doc, ...docs]);
      },
    });

    return NextResponse.json(jsonResponse);
  } catch (err) {
    return NextResponse.json({ error: (err as Error).message }, { status: 400 });
  }
}

export async function DELETE(request: NextRequest) {
  if (!(await isAdmin())) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { id } = await request.json() as { id: string };
  if (!id) return NextResponse.json({ error: "No id" }, { status: 400 });

  const docs = await getResearchDocs();
  const doc = docs.find((d) => d.id === id);
  if (doc) {
    await del(doc.blobUrl);
    await setResearchDocs(docs.filter((d) => d.id !== id));
  }

  return NextResponse.json({ ok: true });
}
