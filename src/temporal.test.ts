import { describe, expect, it } from "vitest";
import { evaluate, toJS } from "./index.js";
import { civilFromDays, daysFromCivil } from "./temporal.js";

const js = async (m: string): Promise<unknown> => toJS(await evaluate(m));

describe("civil date math", () => {
  it("round-trips days<->civil across leap years and centuries", () => {
    for (const [y, m, d] of [[1970, 1, 1], [2000, 2, 29], [1900, 3, 1], [2026, 7, 21], [1899, 12, 30], [9999, 12, 31], [1, 1, 1]] as const) {
      const days = daysFromCivil(y, m, d);
      expect(civilFromDays(days)).toEqual({ y, m, d });
    }
    expect(daysFromCivil(1970, 1, 1)).toBe(0);
  });
});

describe("temporal values and operators", () => {
  it("constructors and accessors", async () => {
    expect(await js("#date(2021, 1, 31)")).toBe("#date(2021,1,31)");
    expect(await js("#time(6, 30, 0)")).toBe(`#time(${6 * 3600 + 30 * 60})`);
    expect(await js("#datetime(2021, 1, 1, 10, 0, 0)")).toBe(`#datetime(2021,1,1,${10 * 3600})`);
    expect(await js("#duration(1, 2, 3, 4)")).toBe(`#duration(${86400 + 2 * 3600 + 3 * 60 + 4})`);
    await expect(js("#date(2021, 2, 30)")).rejects.toThrow(/out of range/);
  });

  it("date arithmetic and comparisons", async () => {
    expect(await js("#date(2021, 1, 31) - #date(2021, 1, 1)")).toBe(`#duration(${30 * 86400})`);
    expect(await js("#date(2021, 1, 1) + #duration(31, 0, 0, 0)")).toBe("#date(2021,2,1)");
    expect(await js("#datetime(2021, 1, 1, 10, 0, 0) - #datetime(2021, 1, 1, 8, 30, 0)")).toBe(`#duration(${1.5 * 3600})`);
    expect(await js("#date(2021, 3, 1) & #time(6, 30, 0)")).toBe(`#datetime(2021,3,1,${6.5 * 3600})`);
    expect(await js("#time(23, 0, 0) + #duration(0, 2, 0, 0)")).toBe(`#time(${1 * 3600})`); // wraps
    expect(await js("#date(2021, 1, 2) > #date(2021, 1, 1)")).toBe(true);
    expect(await js("#duration(0, 1, 0, 0) * 2")).toBe(`#duration(${2 * 3600})`);
    expect(await js("- #duration(0, 1, 0, 0)")).toBe(`#duration(${-3600})`);
    expect(await js("#duration(1, 0, 0, 0) / #duration(0, 12, 0, 0)")).toBe(2);
  });

  it("Date functions", async () => {
    expect(await js("Date.Year(#date(2021, 5, 4))")).toBe(2021);
    expect(await js("Date.AddMonths(#date(2021, 1, 31), 1)")).toBe("#date(2021,2,28)"); // clamps
    expect(await js("Date.AddMonths(#date(2020, 1, 31), 1)")).toBe("#date(2020,2,29)"); // leap clamp
    expect(await js("Date.AddDays(#date(2021, 12, 31), 1)")).toBe("#date(2022,1,1)");
    expect(await js("Date.AddYears(#date(2020, 2, 29), 1)")).toBe("#date(2021,2,28)");
    expect(await js("Date.DayOfWeek(#date(2026, 7, 21))")).toBe(2); // a Tuesday, Sunday-first
    expect(await js("Date.DayOfWeek(#date(2026, 7, 21), Day.Monday)")).toBe(1);
    expect(await js("Date.DayOfYear(#date(2021, 2, 1))")).toBe(32);
    expect(await js("Date.StartOfMonth(#date(2021, 5, 20))")).toBe("#date(2021,5,1)");
    expect(await js("Date.EndOfMonth(#date(2021, 2, 5))")).toBe("#date(2021,2,28)");
    expect(await js("Date.From(44197)")).toBe("#date(2021,1,1)"); // Excel serial
    expect(await js('Date.From("2021-01-31")')).toBe("#date(2021,1,31)");
    expect(await js('Date.From("1/31/2021")')).toBe("#date(2021,1,31)");
  });

  it("DateTime / Time / Duration functions", async () => {
    expect(await js("DateTime.From(44197.5)")).toBe(`#datetime(2021,1,1,${43200})`);
    expect(await js("DateTime.Date(#datetime(2021, 1, 2, 3, 0, 0))")).toBe("#date(2021,1,2)");
    expect(await js("Time.Hour(#time(6, 30, 15))")).toBe(6);
    expect(await js("Time.Minute(#time(6, 30, 15))")).toBe(30);
    expect(await js("Time.Second(#time(6, 30, 15))")).toBe(15);
    expect(await js("Duration.TotalDays(#duration(1, 12, 0, 0))")).toBe(1.5);
    expect(await js("Duration.Hours(#duration(0, 25, 0, 0))")).toBe(1); // 25h = 1d 1h
    expect(await js("Duration.Days(#duration(0, 25, 0, 0))")).toBe(1);
    expect(await js("Duration.From(1.5)")).toBe(`#duration(${1.5 * 86400})`);
  });

  it("conversions: TransformColumnTypes to date, Text.From, Number.From", async () => {
    const out = (await js(`Table.TransformColumnTypes(#table({"D"}, {{44197}, {"2021-03-01"}}), {{"D", type date}})`)) as { rows: unknown[][] };
    expect(out.rows.map((r) => r[0])).toEqual(["#date(2021,1,1)", "#date(2021,3,1)"]);
    expect(await js("Text.From(#date(2021, 1, 31))")).toBe("1/31/2021"); // en-US default
    expect(await js("Date.ToText(#date(2021, 1, 31))")).toBe("1/31/2021");
    expect(await js("Time.ToText(#time(6, 5, 4))")).toBe("6:05 AM"); // short time, no seconds
    expect(await js("DateTime.ToText(#datetime(2021, 1, 31, 13, 5, 4))")).toBe("1/31/2021 1:05:04 PM");
    expect(await js("Date.EndOfMonth(#datetime(2021, 2, 5, 6, 30, 0))")).toBe(`#datetime(2021,2,28,${86399.9999999})`);
    expect(await js("Number.From(#date(2021, 1, 1))")).toBe(44197);
    expect(await js("Number.From(#duration(1, 12, 0, 0))")).toBe(1.5);
  });

  it("sorting and grouping over dates", async () => {
    const m = `Table.Sort(#table({"D"}, {{#date(2021, 3, 1)}, {#date(2020, 1, 1)}, {#date(2021, 1, 1)}}), {"D"})`;
    const out = (await js(m)) as { rows: unknown[][] };
    expect(out.rows.map((r) => r[0])).toEqual(["#date(2020,1,1)", "#date(2021,1,1)", "#date(2021,3,1)"]);
  });
});
