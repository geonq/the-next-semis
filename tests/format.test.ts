import { describe, expect, it } from "vitest";
import { capitalizeFirst, fmtSignedPct, fmtSignedUsd, fmtUsd, signClass } from "@/lib/format";

describe("format helpers", () => {
  it("formats money and percentages consistently", () => {
    expect(fmtUsd(1234.5)).toBe("$1,234.50");
    expect(fmtSignedUsd(12.3)).toBe("+$12.30");
    expect(fmtSignedUsd(-12.3)).toBe("-$12.30");
    expect(fmtSignedPct(1.234)).toBe("+1.23%");
    expect(fmtSignedPct(null)).toBe("—");
  });

  it("maps signs to semantic classes", () => {
    expect(signClass(1)).toBe("gain");
    expect(signClass(-1)).toBe("loss");
    expect(signClass(0)).toBe("neutral");
    expect(signClass(undefined)).toBe("neutral");
  });

  it("capitalizes the first character only", () => {
    expect(capitalizeFirst("defense")).toBe("Defense");
    expect(capitalizeFirst("")).toBe("");
  });
});
