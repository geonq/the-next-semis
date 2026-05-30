import { NextResponse } from "next/server";
import { z } from "zod";
import { getPositions, setPositions } from "@/lib/kv";

const addSchema = z.object({
  ticker: z.string().min(1).transform((v) => v.toUpperCase()),
  company: z.string().min(1),
  shares: z.number(),
  average_cost: z.number(),
  currency: z.string().min(1),
  sector: z.string().min(1),
  thesis_id: z.string().optional()
});

export async function POST(request: Request) {
  const body = await request.json();
  const parsed = addSchema.safeParse(body);
  if (!parsed.success) return NextResponse.json({ error: "Invalid input" }, { status: 400 });

  const positions = await getPositions();
  const exists = positions.some((p) => p.ticker === parsed.data.ticker);
  if (exists) return NextResponse.json({ error: "Ticker already exists" }, { status: 409 });

  await setPositions([...positions, parsed.data]);
  return NextResponse.json({ ok: true });
}

export async function DELETE(request: Request) {
  const { ticker } = await request.json();
  if (!ticker) return NextResponse.json({ error: "Missing ticker" }, { status: 400 });

  const positions = await getPositions();
  const next = positions.filter((p) => p.ticker !== ticker.toUpperCase());
  await setPositions(next);
  return NextResponse.json({ ok: true });
}
