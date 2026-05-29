export function fmtUsd(value: number | null | undefined): string {
  if (value == null) return "—";
  return `$${fmtAbs(value)}`;
}

export function fmtSignedUsd(value: number | null | undefined): string {
  if (value == null) return "—";
  if (value >= 0) return `+$${fmtAbs(value)}`;
  return `-$${fmtAbs(Math.abs(value))}`;
}

export function fmtSignedPct(value: number | null | undefined): string {
  if (value == null) return "—";
  if (value >= 0) return `+${fmtAbs(value)}%`;
  return `-${fmtAbs(Math.abs(value))}%`;
}

export function fmtAbs(value: number): string {
  return Math.abs(value).toLocaleString("en-US", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2
  });
}

export function signClass(value: number | null | undefined): string {
  if (value == null) return "neutral";
  if (value > 0) return "gain";
  if (value < 0) return "loss";
  return "neutral";
}
