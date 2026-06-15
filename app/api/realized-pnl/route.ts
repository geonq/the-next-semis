import { NextResponse } from "next/server";
import { z } from "zod";
import { realizedPnlSchema } from "@/lib/data";
import { getRealizedPnl, setRealizedPnl } from "@/lib/kv";

const addSchema = realizedPnlSchema.omit({ id: true }).extend({
  ticker: z.string().min(1).max(30).transform((value) => value.toUpperCase())
});

const updateSchema = realizedPnlSchema.extend({
  id: z.string().min(1)
});

type RealizedPnlInput = z.infer<typeof addSchema> | z.infer<typeof updateSchema>;

function sanitizeRealizedPnlInput<T extends RealizedPnlInput>(entry: T): T {
  if (entry.assetClass === "perp") {
    return {
      ...entry,
      currency: "USD"
    };
  }

  return {
    ...entry,
    assetClass: entry.assetClass ?? "stock",
    leverage: undefined,
    margin_mode: undefined,
    margin_used: undefined,
    bitstamp_market: undefined
  };
}

export async function GET() {
  const entries = await getRealizedPnl();
  return NextResponse.json(entries);
}

export async function POST(request: Request) {
  const body = await request.json();
  const parsed = addSchema.safeParse(body);
  if (!parsed.success) return NextResponse.json({ error: "Invalid input" }, { status: 400 });
  const submitted = sanitizeRealizedPnlInput(parsed.data);

  const entries = await getRealizedPnl();
  await setRealizedPnl([
    ...entries,
    {
      id: crypto.randomUUID(),
      ...submitted
    }
  ]);

  return NextResponse.json({ ok: true });
}

export async function PUT(request: Request) {
  const body = await request.json();
  const parsed = updateSchema.safeParse(body);
  if (!parsed.success) return NextResponse.json({ error: "Invalid input" }, { status: 400 });
  const submitted = sanitizeRealizedPnlInput(parsed.data);

  const entries = await getRealizedPnl();
  const exists = entries.some((entry) => entry.id === submitted.id);
  if (!exists) return NextResponse.json({ error: "Realized PnL entry not found" }, { status: 404 });

  await setRealizedPnl(entries.map((entry) => (entry.id === submitted.id ? submitted : entry)));
  return NextResponse.json({ ok: true });
}

export async function DELETE(request: Request) {
  const { id } = await request.json();
  if (!id) return NextResponse.json({ error: "Missing id" }, { status: 400 });

  const entries = await getRealizedPnl();
  await setRealizedPnl(entries.filter((entry) => entry.id !== id));
  return NextResponse.json({ ok: true });
}
