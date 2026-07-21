import { describe, expect, it } from "vitest";
import { evaluate, toJS } from "./index.js";

const js = async (m: string): Promise<unknown> => toJS(await evaluate(m));
type T = { columns: string[]; rows: unknown[][] };

const SALES = `#table({"Cat", "Item", "Val"}, {{"A", "x", 10}, {"B", "y", 3}, {"A", "z", 7}})`;

describe("Tier-1 Table functions", () => {
  it("Group with aggregations", async () => {
    const out = (await js(`Table.Group(${SALES}, "Cat", {{"Total", each List.Sum([Val])}, {"N", each Table.RowCount(_)}})`)) as T;
    expect(out.columns).toEqual(["Cat", "Total", "N"]);
    expect(out.rows).toEqual([["A", 17, 2], ["B", 3, 1]]);
  });

  it("Distinct (all and keyed)", async () => {
    const t = `#table({"A", "B"}, {{1, "x"}, {1, "y"}, {1, "x"}})`;
    expect(((await js(`Table.Distinct(${t})`)) as T).rows.length).toBe(2);
    expect(((await js(`Table.Distinct(${t}, "A")`)) as T).rows).toEqual([[1, "x"]]);
  });

  it("Combine unions columns in order of appearance", async () => {
    const out = (await js(`Table.Combine({#table({"A"}, {{1}}), #table({"B"}, {{2}})})`)) as T;
    expect(out.columns).toEqual(["A", "B"]);
    expect(out.rows).toEqual([[1, null], [null, 2]]);
  });

  it("NestedJoin (LeftOuter default) + ExpandTableColumn", async () => {
    const m = `let
      Orders = #table({"ID", "Cust"}, {{1, "a"}, {2, "b"}, {3, "c"}}),
      Names = #table({"Cust", "Name"}, {{"a", "Alice"}, {"b", "Bob"}}),
      J = Table.NestedJoin(Orders, "Cust", Names, "Cust", "N"),
      E = Table.ExpandTableColumn(J, "N", {"Name"})
    in E`;
    const out = (await js(m)) as T;
    expect(out.columns).toEqual(["ID", "Cust", "Name"]);
    expect(out.rows).toEqual([[1, "a", "Alice"], [2, "b", "Bob"], [3, "c", null]]);
  });

  it("NestedJoin Inner and LeftAnti", async () => {
    const base = `Table.NestedJoin(#table({"K"}, {{1}, {2}}), "K", #table({"K"}, {{1}}), "K", "N", `;
    expect(((await js(base + "JoinKind.Inner)")) as T).rows.length).toBe(1);
    const anti = (await js(base + "JoinKind.LeftAnti)")) as T;
    expect(anti.rows.length).toBe(1);
    expect(anti.rows[0]![0]).toBe(2);
  });

  it("UnpivotOtherColumns skips nulls", async () => {
    const m = `Table.UnpivotOtherColumns(#table({"K", "Q1", "Q2"}, {{"a", 1, null}, {"b", null, 2}}), {"K"}, "Attr", "Val")`;
    const out = (await js(m)) as T;
    expect(out.rows).toEqual([["a", "Q1", 1], ["b", "Q2", 2]]);
  });

  it("Pivot (single values)", async () => {
    const m = `Table.Pivot(#table({"K", "Attr", "Val"}, {{"a", "Q1", 1}, {"a", "Q2", 2}, {"b", "Q1", 3}}), {"Q1", "Q2"}, "Attr", "Val")`;
    const out = (await js(m)) as T;
    expect(out.columns).toEqual(["K", "Q1", "Q2"]);
    expect(out.rows).toEqual([["a", 1, 2], ["b", 3, null]]);
  });

  it("FillDown / FillUp", async () => {
    const t = `#table({"A"}, {{1}, {null}, {3}})`;
    expect(((await js(`Table.FillDown(${t}, {"A"})`)) as T).rows.map((r) => r[0])).toEqual([1, 1, 3]);
    expect(((await js(`Table.FillUp(${t}, {"A"})`)) as T).rows.map((r) => r[0])).toEqual([1, 3, 3]);
  });

  it("ReplaceValue with both replacers", async () => {
    const t = `#table({"A"}, {{"cat"}, {"catalog"}})`;
    const txt = (await js(`Table.ReplaceValue(${t}, "cat", "dog", Replacer.ReplaceText, {"A"})`)) as T;
    expect(txt.rows.map((r) => r[0])).toEqual(["dog", "dogalog"]);
    const val = (await js(`Table.ReplaceValue(${t}, "cat", "dog", Replacer.ReplaceValue, {"A"})`)) as T;
    expect(val.rows.map((r) => r[0])).toEqual(["dog", "catalog"]);
  });

  it("SplitColumn by delimiter with names", async () => {
    const m = `Table.SplitColumn(#table({"N"}, {{"a-b"}, {"c"}}), "N", Splitter.SplitTextByDelimiter("-"), {"N.1", "N.2"})`;
    const out = (await js(m)) as T;
    expect(out.columns).toEqual(["N.1", "N.2"]);
    expect(out.rows).toEqual([["a", "b"], ["c", null]]);
  });

  it("PromoteHeaders (nulls + duplicates) and DemoteHeaders", async () => {
    const out = (await js(`Table.PromoteHeaders(#table({"C1", "C2", "C3"}, {{"X", null, "X"}, {1, 2, 3}}))`)) as T;
    expect(out.columns).toEqual(["X", "Column2", "X_1"]);
    const demoted = (await js(`Table.DemoteHeaders(#table({"A", "B"}, {{1, 2}}))`)) as T;
    expect(demoted.columns).toEqual(["Column1", "Column2"]);
    expect(demoted.rows[0]).toEqual(["A", "B"]);
  });

  it("AddIndexColumn / Skip / LastN / First / Last / TransformColumns", async () => {
    const t = `#table({"A"}, {{10}, {20}, {30}})`;
    expect(((await js(`Table.AddIndexColumn(${t}, "I", 1, 1)`)) as T).rows.map((r) => r[1])).toEqual([1, 2, 3]);
    expect(((await js(`Table.Skip(${t}, 1)`)) as T).rows.length).toBe(2);
    expect(((await js(`Table.LastN(${t}, 1)`)) as T).rows[0]![0]).toBe(30);
    expect(await js(`Table.First(${t})[A]`)).toBe(10);
    expect(await js(`Table.Last(${t})[A]`)).toBe(30);
    expect(((await js(`Table.TransformColumns(${t}, {{"A", each _ * 2}})`)) as T).rows.map((r) => r[0])).toEqual([20, 40, 60]);
  });
});

describe("Tier-1 List/Text/Number/Record", () => {
  it("List aggregates and utilities", async () => {
    expect(await js("List.Average({1, 2, 3})")).toBe(2);
    expect(await js("List.Min({3, 1, 2})")).toBe(1);
    expect(await js("List.Max({3, 1, 2})")).toBe(3);
    expect(await js("List.Distinct({1, 2, 1})")).toEqual([1, 2]);
    expect(await js("List.Contains({1, 2}, 2)")).toBe(true);
    expect(await js('List.PositionOf({"a", "b"}, "z")')).toBe(-1);
    expect(await js("List.Sort({3, 1, 2}, Order.Descending)")).toEqual([3, 2, 1]);
    expect(await js("List.Zip({{1, 2}, {\"a\", \"b\"}})")).toEqual([[1, "a"], [2, "b"]]);
    expect(await js("List.Accumulate({1, 2, 3}, 0, (s, x) => s + x)")).toBe(6);
    expect(await js("List.Numbers(5, 3)")).toEqual([5, 6, 7]);
    expect(await js("List.RemoveNulls({1, null, 2})")).toEqual([1, 2]);
  });

  it("Text functions", async () => {
    expect(await js('Text.Trim("  hi  ")')).toBe("hi");
    expect(await js('Text.Trim("xxhixx", "x")')).toBe("hi");
    expect(await js('Text.Contains("Hello", "hello")')).toBe(false);
    expect(await js('Text.Contains("Hello", "hello", Comparer.OrdinalIgnoreCase)')).toBe(true);
    expect(await js('Text.PositionOf("banana", "an")')).toBe(1);
    expect(await js('Text.PositionOf("banana", "an", Occurrence.Last)')).toBe(3);
    expect(await js('Text.PositionOf("banana", "an", Occurrence.All)')).toEqual([1, 3]);
    expect(await js('Text.Replace("aaa", "a", "b")')).toBe("bbb");
    expect(await js('Text.Split("a,b", ",")')).toEqual(["a", "b"]);
    expect(await js('Text.Combine({"a", null, "b"}, "-")')).toBe("a-b");
    expect(await js('Text.Start("hello", 2)')).toBe("he");
    expect(await js('Text.End("hello", 2)')).toBe("lo");
    expect(await js('Text.Middle("hello", 1, 3)')).toBe("ell");
    expect(await js('Text.PadStart("7", 3, "0")')).toBe("007");
    expect(await js('Text.Proper("john von neumann")')).toBe("John Von Neumann");
    expect(await js('Text.Length("héllo")')).toBe(5);
  });

  it("Number functions (banker's rounding, mod signs)", async () => {
    expect(await js("Number.Round(2.5)")).toBe(2);
    expect(await js("Number.Round(3.5)")).toBe(4);
    expect(await js("Number.Round(2.345, 2)")).toBe(2.34); // 2.345 is 2.34499... as a double (oracle-checked)
    expect(await js("Number.RoundDown(-1.2)")).toBe(-2);
    expect(await js("Number.RoundUp(-1.2)")).toBe(-1);
    expect(await js("Number.Mod(-5, 3)")).toBe(-2);
    expect(await js("Number.IntegerDivide(-7, 2)")).toBe(-3);
    expect(await js("Number.Abs(-4)")).toBe(4);
    expect(await js("Number.Power(2, 10)")).toBe(1024);
  });

  it("Record functions", async () => {
    expect(await js("Record.FieldNames([A = 1, B = 2])")).toEqual(["A", "B"]);
    expect(await js('Record.Field([A = 1], "A")')).toBe(1);
    expect(await js('Record.FieldOrDefault([A = 1], "B", 9)')).toBe(9);
    expect(await js('Record.AddField([A = 1], "B", 2)')).toEqual({ A: 1, B: 2 });
    expect(await js('Record.RemoveFields([A = 1, B = 2], "A")')).toEqual({ B: 2 });
    expect(await js('Record.SelectFields([A = 1, B = 2], {"B"})')).toEqual({ B: 2 });
    const t = (await js("Record.ToTable([A = 1])")) as T;
    expect(t.columns).toEqual(["Name", "Value"]);
    expect(t.rows).toEqual([["A", 1]]);
  });
});
