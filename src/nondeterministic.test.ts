import { describe, expect, it } from "vitest";
import { evaluate, toJS } from "./index.js";

const js = async (m: string): Promise<unknown> => toJS(await evaluate(m));

// These functions are non-deterministic, so we assert structural invariants (ranges, shape,
// fixed-per-evaluation equality, seeded repeatability, relative-date logic vs LocalNow) rather
// than exact values. They can't be oracle-validated for the same reason.
describe("clock functions", () => {
  it("LocalNow/UtcNow return the right kinds and are fixed within one evaluation", async () => {
    expect(await js(`Value.Is(DateTime.LocalNow(), DateTime.Type)`)).toBe(true);
    expect(await js(`Value.Is(DateTimeZone.UtcNow(), DateTimeZone.Type)`)).toBe(true);
    expect(await js(`DateTime.LocalNow() = DateTime.LocalNow()`)).toBe(true);
    expect(await js(`DateTimeZone.UtcNow() = DateTimeZone.UtcNow()`)).toBe(true);
  });
  it("UtcNow has a zero offset and LocalNow/FixedLocalNow agree", async () => {
    expect(await js(`DateTimeZone.ZoneHours(DateTimeZone.UtcNow())`)).toBe(0);
    expect(await js(`DateTime.LocalNow() = DateTime.FixedLocalNow()`)).toBe(true);
  });
});

describe("relative-date family (vs the fixed LocalNow)", () => {
  const today = `DateTime.Date(DateTime.LocalNow())`;
  it("current/previous/next day", async () => {
    expect(await js(`Date.IsInCurrentDay(${today})`)).toBe(true);
    expect(await js(`Date.IsInPreviousDay(Date.AddDays(${today}, -1))`)).toBe(true);
    expect(await js(`Date.IsInNextDay(Date.AddDays(${today}, 1))`)).toBe(true);
    expect(await js(`Date.IsInCurrentDay(Date.AddDays(${today}, 1))`)).toBe(false);
  });
  it("current month/quarter/year", async () => {
    expect(await js(`Date.IsInCurrentMonth(${today})`)).toBe(true);
    expect(await js(`Date.IsInCurrentQuarter(${today})`)).toBe(true);
    expect(await js(`Date.IsInCurrentYear(${today})`)).toBe(true);
    expect(await js(`Date.IsInPreviousYear(Date.AddYears(${today}, -1))`)).toBe(true);
    expect(await js(`Date.IsInNextYear(Date.AddYears(${today}, 1))`)).toBe(true);
  });
  it("N-period windows exclude the current period", async () => {
    expect(await js(`Date.IsInPreviousNDays(Date.AddDays(${today}, -5), 7)`)).toBe(true);
    expect(await js(`Date.IsInPreviousNDays(${today}, 7)`)).toBe(false); // today is excluded
    expect(await js(`Date.IsInNextNDays(Date.AddDays(${today}, 3), 7)`)).toBe(true);
    expect(await js(`Date.IsInYearToDate(Date.StartOfYear(${today}))`)).toBe(true);
  });
});

describe("random functions", () => {
  it("Number.Random is in [0,1) and RandomBetween respects bounds", async () => {
    expect(await js(`Number.Random() >= 0 and Number.Random() < 1`)).toBe(true);
    expect(await js(`let r = Number.RandomBetween(10, 20) in r >= 10 and r <= 20`)).toBe(true);
  });
  it("List.Random yields the requested count of [0,1) values", async () => {
    expect(await js(`List.Count(List.Random(5))`)).toBe(5);
    expect(await js(`List.AllTrue(List.Transform(List.Random(8), each _ >= 0 and _ < 1))`)).toBe(true);
  });
  it("a seed makes List.Random repeatable", async () => {
    expect(await js(`List.Random(4, 42) = List.Random(4, 42)`)).toBe(true);
    expect(await js(`List.Random(4, 42) = List.Random(4, 7)`)).toBe(false);
  });
});
