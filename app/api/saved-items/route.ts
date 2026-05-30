import { NextResponse } from "next/server";
import { z } from "zod";
import { getSavedItems, setSavedItems } from "@/lib/kv";

const addSchema = z.object({
  type: z.enum(["article", "paper"]),
  title: z.string().min(1),
  url: z.string().url(),
  note: z.string().optional(),
  theme: z.string().optional()
});

export async function GET() {
  const items = await getSavedItems();
  return NextResponse.json(items.slice().sort((a, b) => b.addedAt - a.addedAt));
}

export async function POST(request: Request) {
  const body = await request.json();
  const parsed = addSchema.safeParse(body);
  if (!parsed.success) return NextResponse.json({ error: "Invalid input" }, { status: 400 });

  const items = await getSavedItems();
  const newItem = {
    id: crypto.randomUUID(),
    ...parsed.data,
    addedAt: Math.floor(Date.now() / 1000)
  };
  await setSavedItems([...items, newItem]);
  return NextResponse.json({ ok: true, item: newItem });
}

export async function DELETE(request: Request) {
  const { id } = await request.json();
  if (!id) return NextResponse.json({ error: "Missing id" }, { status: 400 });

  const items = await getSavedItems();
  await setSavedItems(items.filter((item) => item.id !== id));
  return NextResponse.json({ ok: true });
}
