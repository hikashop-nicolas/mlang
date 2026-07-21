import { describe, expect, it } from "vitest";
import { evaluate, toJS } from "./index.js";

const js = async (m: string): Promise<unknown> => toJS(await evaluate(m));
type T = { columns: string[]; rows: unknown[][] };

// Second Tier-2 batch, scoped from a corpus of real .pq files (ImkeF/M, ninmonkey, etc.).
describe("Tier-2 batch 2 (from real M corpus)", () => {
  it("List.Combine / Buffer / Median / StandardDeviation", async () => {
    expect(await js(`List.Combine({{1, 2}, {3}, {4, 5}})`)).toEqual([1, 2, 3, 4, 5]);
    expect(await js(`List.Buffer({1, 2})`)).toEqual([1, 2]);
    expect(await js(`List.Median({3, 1, 2})`)).toBe(2);
    expect(await js(`List.Median({4, 1, 2, 3})`)).toBe(2.5);
    expect(await js(`List.StandardDeviation({2, 4, 4, 4, 5, 5, 7, 9})`)).toBeCloseTo(2.138, 3);
  });

  it("Text delimiter extraction + Clean + Select + Character", async () => {
    expect(await js(`Text.BeforeDelimiter("a-b-c", "-")`)).toBe("a");
    expect(await js(`Text.AfterDelimiter("a-b-c", "-")`)).toBe("b-c");
    expect(await js(`Text.AfterDelimiter("a-b-c", "-", 1)`)).toBe("c");
    expect(await js(`Text.BetweenDelimiters("[x] [y]", "[", "]")`)).toBe("x");
    expect(await js(`Text.Clean("a#(cr)#(lf)b")`)).toBe("ab");
    expect(await js(`Text.Select("a1b2c3", {"0".."9"})`)).toBe("123");
    expect(await js(`Character.FromNumber(65)`)).toBe("A");
    expect(await js(`Character.ToNumber("A")`)).toBe(65);
  });

  it("Record.FromList / FieldValues", async () => {
    expect(await js(`Record.FromList({1, 2}, {"a", "b"})`)).toEqual({ a: 1, b: 2 });
    expect(await js(`Record.FieldValues([a = 1, b = 2])`)).toEqual([1, 2]);
  });

  it("Date quarter / week family", async () => {
    expect(await js(`Date.QuarterOfYear(#date(2021, 5, 10))`)).toBe(2);
    expect(await js(`Date.StartOfQuarter(#date(2021, 5, 10))`)).toBe("#date(2021,4,1)");
    expect(await js(`Date.EndOfQuarter(#date(2021, 5, 10))`)).toBe("#date(2021,6,30)");
    expect(await js(`Date.StartOfWeek(#date(2021, 5, 12))`)).toBe("#date(2021,5,9)"); // Sunday
    expect(await js(`Date.EndOfWeek(#date(2021, 5, 12))`)).toBe("#date(2021,5,15)");
    expect(await js(`Date.WeekOfYear(#date(2021, 1, 1))`)).toBe(1);
  });

  it("Table.Column / TransformColumnNames / PrefixColumns / FromValue", async () => {
    const t = `#table({"A", "B"}, {{1, "x"}, {2, "y"}})`;
    expect(await js(`Table.Column(${t}, "A")`)).toEqual([1, 2]);
    expect(((await js(`Table.TransformColumnNames(${t}, Text.Lower)`)) as T).columns).toEqual(["a", "b"]);
    expect(((await js(`Table.PrefixColumns(${t}, "T")`)) as T).columns).toEqual(["T.A", "T.B"]);
    expect(((await js(`Table.FromValue({10, 20})`)) as T).rows).toEqual([[10], [20]]);
  });

  it("Table.ExpandRecordColumn", async () => {
    const m = `let
      T = #table({"K", "R"}, {{1, [a = 10, b = 20]}, {2, [a = 30, b = 40]}}),
      E = Table.ExpandRecordColumn(T, "R", {"a", "b"})
    in E`;
    const out = (await js(m)) as T;
    expect(out.columns).toEqual(["K", "a", "b"]);
    expect(out.rows).toEqual([[1, 10, 20], [2, 30, 40]]);
  });

  it("Table.Join (inner + left outer)", async () => {
    const setup = `#table({"K", "V"}, {{1, "a"}, {2, "b"}}), "K", #table({"K2", "W"}, {{1, "x"}}), "K2"`;
    const inner = (await js(`Table.Join(${setup}, JoinKind.Inner)`)) as T;
    expect(inner.columns).toEqual(["K", "V", "K2", "W"]);
    expect(inner.rows).toEqual([[1, "a", 1, "x"]]);
    const left = (await js(`Table.Join(${setup}, JoinKind.LeftOuter)`)) as T;
    expect(left.rows).toEqual([[1, "a", 1, "x"], [2, "b", null, null]]);
  });
});
