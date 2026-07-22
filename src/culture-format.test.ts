import { describe, expect, it } from "vitest";
import { evaluate, toJS } from "./index.js";

// Culture-aware OUTPUT formatting (localized month/day names, date patterns, number separators).
// Intl uses a narrow no-break space (U+202F) as the fr group separator; normalize whitespace so
// assertions are robust to which space variant the runtime's ICU picks.
const js = async (m: string): Promise<unknown> => toJS(await evaluate(m));
const ws = async (m: string): Promise<string> => ((await js(m)) as string).replace(/[\s  ]+/g, " ");

describe("localized names", () => {
  it("Date.MonthName / Date.DayOfWeekName follow the culture", async () => {
    expect(await js(`Date.MonthName(#date(2026,7,22), "fr-FR")`)).toBe("juillet");
    expect(await js(`Date.MonthName(#date(2026,7,22), "ja-JP")`)).toBe("7月");
    expect(await js(`Date.DayOfWeekName(#date(2026,7,22), "fr-FR")`)).toBe("mercredi");
    expect(await js(`Date.MonthName(#date(2026,7,22))`)).toBe("July"); // no culture -> invariant
  });
});

describe("culture-aware date output", () => {
  it("standard patterns", async () => {
    expect(await js(`Date.ToText(#date(2026,7,22), "d", "fr-FR")`)).toBe("22/07/2026");
    expect(await ws(`Date.ToText(#date(2026,7,22), "D", "fr-FR")`)).toBe("mercredi 22 juillet 2026");
    expect(await js(`Date.ToText(#date(2026,7,22), "d", "en-US")`)).toBe("7/22/2026"); // no regression
    expect(await js(`Date.ToText(#date(2026,7,22), "d")`)).toBe("7/22/2026"); // no culture
  });
  it("custom patterns localize month names", async () => {
    expect(await ws(`Date.ToText(#date(2026,7,22), "dd MMMM yyyy", "fr-FR")`)).toBe("22 juillet 2026");
    expect(await js(`Date.ToText(#date(2026,1,5), "ddd", "fr-FR")`)).toMatch(/^lun/i);
  });
});

describe("culture-aware number output", () => {
  it("separators follow the culture", async () => {
    expect(await ws(`Number.ToText(1234.5, "N2", "fr-FR")`)).toBe("1 234,50");
    expect(await js(`Number.ToText(1234.5, "N2", "de-DE")`)).toBe("1.234,50");
    expect(await js(`Number.ToText(1234.5, "N2")`)).toBe("1,234.50"); // no regression
    expect(await js(`Number.ToText(0.1265, "P2", "fr-FR")`)).toBe("12,65%");
  });
  it("currency uses the culture's symbol", async () => {
    expect(await ws(`Number.ToText(1234.56, "C2", "fr-FR")`)).toBe("1 234,56 €");
    expect(await js(`Number.ToText(50, "C0", "ja-JP")`)).toMatch(/[¥￥]/); // half- or full-width yen
  });
});
