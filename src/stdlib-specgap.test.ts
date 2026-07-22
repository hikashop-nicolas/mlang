import { describe, expect, it } from "vitest";
import { evaluate, toJS } from "./index.js";

// Functions found by the full-spec diff (SPEC_GAP.md Tier 1) that the corpus never exercised.
const js = async (m: string): Promise<unknown> => toJS(await evaluate(m));

describe("specgap: number conversions & combinatorics", () => {
  it("float conversions", async () => {
    expect(await js(`Currency.From("3.14159")`)).toBe(3.1416);
    expect(await js(`Single.From(1.1) <> 1.1`)).toBe(true); // float32 rounding
    expect(await js(`Double.From("2.5")`)).toBe(2.5);
  });
  it("combinatorics & rounding modes", async () => {
    expect(await js(`Number.Combinations(5, 2)`)).toBe(10);
    expect(await js(`Number.Permutations(5, 2)`)).toBe(20);
    expect(await js(`Number.RoundAwayFromZero(2.1)`)).toBe(3);
    expect(await js(`Number.RoundAwayFromZero(-2.1)`)).toBe(-3);
    expect(await js(`Number.RoundTowardZero(-2.9)`)).toBe(-2);
  });
});

describe("specgap: logical & guid", () => {
  it("Logical.From/FromText/ToText", async () => {
    expect(await js(`Logical.From(0)`)).toBe(false);
    expect(await js(`Logical.From(5)`)).toBe(true);
    expect(await js(`Logical.FromText("true")`)).toBe(true);
    expect(await js(`Logical.ToText(true)`)).toBe("true");
  });
  it("Guid.From normalizes; Text.NewGuid is well-formed", async () => {
    expect(await js(`Guid.From("{0F8FAD5B-D9CB-469F-A165-70867728950E}")`)).toBe("0f8fad5b-d9cb-469f-a165-70867728950e");
    expect((await js(`Text.NewGuid()`)) as string).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/);
  });
});

describe("specgap: list additions", () => {
  it("range edits & positions", async () => {
    expect(await js(`List.InsertRange({1, 2, 5}, 2, {3, 4})`)).toEqual([1, 2, 3, 4, 5]);
    expect(await js(`List.RemoveRange({1, 2, 3, 4}, 1, 2)`)).toEqual([1, 4]);
    expect(await js(`List.ReplaceRange({1, 2, 3}, 1, 1, {9, 9})`)).toEqual([1, 9, 9, 3]);
    expect(await js(`List.PositionOfAny({1, 2, 3}, {3, 1})`)).toBe(0);
    expect(await js(`List.IsDistinct({1, 2, 2})`)).toBe(false);
    expect(await js(`List.NonNullCount({1, null, 3})`)).toBe(2);
  });
  it("matches / mode / percentile / findtext", async () => {
    expect(await js(`List.MatchesAll({2, 4}, each _ < 5)`)).toBe(true);
    expect(await js(`List.MatchesAny({2, 4}, each _ > 3)`)).toBe(true);
    expect(await js(`List.Mode({1, 2, 2, 3, 3, 3})`)).toBe(3);
    expect(await js(`List.Modes({1, 1, 2, 2})`)).toEqual([1, 2]);
    expect(await js(`List.Percentile({5, 3, 1, 7, 9}, 0.25)`)).toBe(3);
    expect(await js(`List.Percentile({5, 3, 1, 7, 9}, {0.25, 0.5, 0.75}, [PercentileMode = PercentileMode.ExcelExc])`)).toEqual([2, 5, 8]);
    expect(await js(`List.FindText({"apple", "pear", "grape"}, "ap")`)).toEqual(["apple", "grape"]);
  });
});

describe("specgap: date/time additions", () => {
  it("ToRecord family", async () => {
    expect(await js(`Date.ToRecord(#date(2021, 3, 14))`)).toEqual({ Year: 2021, Month: 3, Day: 14 });
    expect(await js(`Time.ToRecord(#time(9, 30, 15))`)).toEqual({ Hour: 9, Minute: 30, Second: 15 });
    expect(await js(`Duration.ToRecord(#duration(1, 2, 3, 4))`)).toEqual({ Days: 1, Hours: 2, Minutes: 3, Seconds: 4 });
  });
  it("text round-trips, AddZone, hour boundaries, generators", async () => {
    expect(await js(`Duration.ToText(#duration(1, 2, 3, 4))`)).toBe("1.02:03:04");
    expect(await js(`Duration.TotalHours(Duration.FromText("1.02:03:04"))`)).toBe(1 * 24 + 2 + 3 / 60 + 4 / 3600);
    expect(await js(`DateTimeZone.ZoneHours(DateTime.AddZone(#datetime(2021, 1, 1, 0, 0, 0), 9))`)).toBe(9);
    expect(await js(`Time.StartOfHour(#time(9, 45, 0))`)).toBe(`#time(${9 * 3600})`);
    expect(await js(`List.Count(List.Durations(#duration(0, 0, 0, 0), 3, #duration(1, 0, 0, 0)))`)).toBe(3);
    expect(await js(`List.Count(List.Times(#time(0, 0, 0), 4, #duration(0, 1, 0, 0)))`)).toBe(4);
  });
});

describe("specgap: table additions", () => {
  const T = `#table({"A", "B"}, {{3, "x"}, {7, "y"}, {5, "z"}})`;
  it("min/max/reverse/range/firstValue/toList", async () => {
    expect(await js(`Table.Max(${T}, "A")`)).toEqual({ A: 7, B: "y" });
    expect(await js(`Table.Min(${T}, "A")`)).toEqual({ A: 3, B: "x" });
    expect(await js(`Table.RowCount(Table.MaxN(${T}, "A", 2))`)).toBe(2);
    expect(await js(`Table.FirstValue(${T})`)).toBe(3);
    expect(await js(`Table.ToList(#table({"A", "B"}, {{1, 2}}))`)).toEqual(["1,2"]);
    expect(await js(`Table.Column(Table.ReverseRows(${T}), "A")`)).toEqual([5, 7, 3]);
  });
  it("membership & rank (Competition)", async () => {
    expect(await js(`Table.Contains(${T}, [A = 7])`)).toBe(true);
    expect(await js(`Table.Contains(${T}, [A = 99])`)).toBe(false);
    expect(await js(`Table.PositionOf(${T}, [A = 5])`)).toBe(2);
    expect(await js(`Table.MatchesAllRows(${T}, each [A] > 0)`)).toBe(true);
    expect(await js(`Table.Column(Table.AddRankColumn(#table({"R"}, {{200}, {100}, {200}, {50}}), "K", {"R", Order.Descending}), "K")`)).toEqual([1, 3, 1, 4]);
  });
  it("row edits & profile", async () => {
    expect(await js(`Table.RowCount(Table.RemoveRows(${T}, 1))`)).toBe(2);
    expect(await js(`Table.Column(Table.InsertRows(${T}, 0, {[A = 0, B = "q"]}), "A")`)).toEqual([0, 3, 7, 5]);
    expect(await js(`Table.Profile(${T}){0}[Max]`)).toBe(7);
  });
});

describe("specgap: uri / binary / splitters / value", () => {
  it("Uri.Parts (matches the reference example shape)", async () => {
    expect(await js(`Uri.Parts("https://host.com/a?x=1&y=hi")[Host]`)).toBe("host.com");
    expect(await js(`Uri.Parts("https://host.com/a?x=1&y=hi")[Query][y]`)).toBe("hi");
    expect(await js(`Uri.Parts("http://h/")[Port]`)).toBe(80);
  });
  it("binary helpers", async () => {
    expect(await js(`Binary.Length(Binary.Combine({Text.ToBinary("ab"), Text.ToBinary("cd")}))`)).toBe(4);
    expect(await js(`Text.FromBinary(Binary.Range(Text.ToBinary("abcdef"), 2, 2))`)).toBe("cd");
    expect(await js(`List.Count(Binary.Split(Text.ToBinary("abcdef"), 2))`)).toBe(3);
  });
  it("splitters & combiners", async () => {
    expect(await js(`Splitter.SplitTextByRanges({{0, 5}, {5, null}})("98052Redmond")`)).toEqual(["98052", "Redmond"]);
    expect(await js(`Splitter.SplitTextByWhitespace()("  a   b c ")`)).toEqual(["a", "b", "c"]);
    expect(await js(`Splitter.SplitTextByLengths({2, 3})("aabbb")`)).toEqual(["aa", "bbb"]);
  });
  it("value functions", async () => {
    expect(await js(`Value.Equals(1, 1)`)).toBe(true);
    expect(await js(`Value.NullableEquals(1, null)`)).toBe(null);
    expect(await js(`Value.As(5, Int64.Type)`)).toBe(5);
  });
  it("Record.ReorderFields", async () => {
    expect(await js(`Record.FieldNames(Record.ReorderFields([a = 1, b = 2, c = 3], {"c", "a"}))`)).toEqual(["c", "a", "b"]);
  });
});
