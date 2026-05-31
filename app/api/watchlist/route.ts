import { NextResponse } from "next/server";
import { z } from "zod";
import { capitalizeFirst } from "@/lib/format";
import { getWatchlist, setWatchlist } from "@/lib/kv";

const addSchema = z.object({
  ticker: z.string().min(1).transform((v) => v.toUpperCase()),
  company: z.string().min(1),
  theme: z.string().min(1),
  conditions: z.array(z.string()),
  conviction: z.string().min(1),
  status: z.string().min(1)
});

// Partial update of an existing entry (detail-view editing). Identity is the
// ticker; only the supplied fields change.
const updateSchema = z.object({
  ticker: z.string().min(1).transform((v) => v.toUpperCase()),
  theme: z.string().min(1).optional(),
  conditions: z.array(z.string()).optional(),
  conviction: z.enum(["draft", "medium", "high"]).optional(),
  status: z.enum(["watching", "triggered", "invalidated"]).optional()
});

export async function POST(request: Request) {
  const body = await request.json();
  const parsed = addSchema.safeParse(body);
  if (!parsed.success) return NextResponse.json({ error: "Invalid input" }, { status: 400 });

  const entries = await getWatchlist();
  const exists = entries.some((e) => e.ticker === parsed.data.ticker);
  if (exists) return NextResponse.json({ error: "Ticker already exists" }, { status: 409 });

  await setWatchlist([...entries, { ...parsed.data, theme: capitalizeFirst(parsed.data.theme.trim()) }]);
  return NextResponse.json({ ok: true });
}

export async function PUT(request: Request) {
  const body = await request.json();
  const parsed = updateSchema.safeParse(body);
  if (!parsed.success) return NextResponse.json({ error: "Invalid input" }, { status: 400 });

  const entries = await getWatchlist();
  const index = entries.findIndex((e) => e.ticker === parsed.data.ticker);
  if (index === -1) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const current = entries[index];
  const next = [...entries];
  next[index] = {
    ...current,
    theme: parsed.data.theme ? capitalizeFirst(parsed.data.theme.trim()) : current.theme,
    conditions: parsed.data.conditions ?? current.conditions,
    conviction: parsed.data.conviction ?? current.conviction,
    status: parsed.data.status ?? current.status
  };
  await setWatchlist(next);
  return NextResponse.json({ ok: true });
}

export async function DELETE(request: Request) {
  const { ticker } = await request.json();
  if (!ticker) return NextResponse.json({ error: "Missing ticker" }, { status: 400 });

  const entries = await getWatchlist();
  const next = entries.filter((e) => e.ticker !== ticker.toUpperCase());
  await setWatchlist(next);
  return NextResponse.json({ ok: true });
}
