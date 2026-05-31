import { NextResponse } from "next/server";
import { z } from "zod";
import { capitalizeFirst } from "@/lib/format";
import { getSavedItems, setSavedItems } from "@/lib/kv";

const addSchema = z.object({
  type: z.enum(["article", "paper"]),
  title: z.string().min(1),
  url: z.string().url(),
  note: z.string().optional(),
  theme: z.string().optional(),
  tickers: z.array(z.string()).optional()
});

// Edit an existing item's content (id stays; ticker attachments unchanged — those
// are managed by PATCH attach/detach).
const editSchema = z.object({
  id: z.string().min(1),
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
    theme: parsed.data.theme ? capitalizeFirst(parsed.data.theme.trim()) : undefined,
    tickers: parsed.data.tickers?.map((ticker) => ticker.toUpperCase()) ?? [],
    addedAt: Math.floor(Date.now() / 1000)
  };
  await setSavedItems([...items, newItem]);
  return NextResponse.json({ ok: true, item: newItem });
}

export async function PUT(request: Request) {
  const body = await request.json();
  const parsed = editSchema.safeParse(body);
  if (!parsed.success) return NextResponse.json({ error: "Invalid input" }, { status: 400 });

  const items = await getSavedItems();
  if (!items.some((item) => item.id === parsed.data.id)) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  const next = items.map((item) =>
    item.id === parsed.data.id
      ? {
          ...item,
          type: parsed.data.type,
          title: parsed.data.title,
          url: parsed.data.url,
          note: parsed.data.note,
          theme: parsed.data.theme ? capitalizeFirst(parsed.data.theme.trim()) : undefined
        }
      : item
  );
  await setSavedItems(next);
  return NextResponse.json({ ok: true });
}

export async function PATCH(request: Request) {
  const { id, ticker, action } = await request.json();
  if (!id || !ticker || (action !== "attach" && action !== "detach")) {
    return NextResponse.json({ error: "Invalid input" }, { status: 400 });
  }

  const normalizedTicker = String(ticker).toUpperCase();
  const items = await getSavedItems();
  const next = items.map((item) => {
    if (item.id !== id) return item;
    const tickers = new Set(item.tickers);
    if (action === "attach") tickers.add(normalizedTicker);
    else tickers.delete(normalizedTicker);
    return { ...item, tickers: Array.from(tickers).sort() };
  });

  await setSavedItems(next);
  return NextResponse.json({ ok: true });
}

export async function DELETE(request: Request) {
  const { id } = await request.json();
  if (!id) return NextResponse.json({ error: "Missing id" }, { status: 400 });

  const items = await getSavedItems();
  await setSavedItems(items.filter((item) => item.id !== id));
  return NextResponse.json({ ok: true });
}
