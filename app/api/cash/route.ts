import { NextResponse } from "next/server";
import { z } from "zod";
import { cashEntryBaseSchema } from "@/lib/data";
import { getCashEntries, setCashEntries } from "@/lib/kv";

const SUPPORTED_CURRENCIES = ["USD", "EUR", "GBP", "JPY"] as const;

const addSchema = cashEntryBaseSchema.omit({ id: true, amount_usd: true }).extend({
  currency: z.enum(SUPPORTED_CURRENCIES)
});
const updateSchema = cashEntryBaseSchema.extend({
  id: z.string().min(1)
});

async function fetchUsdRate(from: string, date: string): Promise<number | null> {
  if (from === "USD") return 1;
  const endpoint = `https://api.frankfurter.app/${date}?from=${encodeURIComponent(from)}&to=USD`;
  try {
    const res = await fetch(endpoint, { cache: "force-cache" });
    if (!res.ok) return null;
    const data = await res.json();
    return typeof data?.rates?.USD === "number" ? data.rates.USD : null;
  } catch {
    return null;
  }
}

async function amountUsd(entry: { amount: number; currency: string; date: string }): Promise<number | null> {
  const rate = await fetchUsdRate(entry.currency, entry.date);
  return rate == null ? null : entry.amount * rate;
}

export async function POST(request: Request) {
  const body = await request.json();
  const parsed = addSchema.safeParse(body);
  if (!parsed.success) return NextResponse.json({ error: "Invalid input" }, { status: 400 });
  const converted = await amountUsd(parsed.data);
  if (converted == null) return NextResponse.json({ error: "Could not convert cash amount to USD" }, { status: 400 });

  const entries = await getCashEntries();
  await setCashEntries([
    ...entries,
    {
      id: crypto.randomUUID(),
      ...parsed.data,
      amount_usd: converted
    }
  ]);

  return NextResponse.json({ ok: true });
}

export async function PUT(request: Request) {
  const body = await request.json();
  const parsed = updateSchema.safeParse(body);
  if (!parsed.success) return NextResponse.json({ error: "Invalid input" }, { status: 400 });
  const converted = await amountUsd(parsed.data);
  if (converted == null) return NextResponse.json({ error: "Could not convert cash amount to USD" }, { status: 400 });

  const entries = await getCashEntries();
  const exists = entries.some((entry) => entry.id === parsed.data.id);
  if (!exists) return NextResponse.json({ error: "Cash entry not found" }, { status: 404 });

  await setCashEntries(entries.map((entry) => (entry.id === parsed.data.id ? { ...parsed.data, amount_usd: converted } : entry)));
  return NextResponse.json({ ok: true });
}

export async function DELETE(request: Request) {
  const { id } = await request.json();
  if (!id) return NextResponse.json({ error: "Missing id" }, { status: 400 });

  const entries = await getCashEntries();
  await setCashEntries(entries.filter((entry) => entry.id !== id));
  return NextResponse.json({ ok: true });
}
