import { describe, expect, it } from "vitest";
import { evaluate, toJS } from "./index.js";

const js = async (m: string): Promise<unknown> => toJS(await evaluate(m));
type T = { columns: string[]; rows: unknown[][] };

// Fourth Tier-2 batch, from the broadened 500-file real-M corpus.
describe("Tier-2 batch 4", () => {
  it("Number: Int64.From (banker's), FromText, infinities", async () => {
    expect(await js(`Int64.From(2.7)`)).toBe(3);
    expect(await js(`Int64.From(2.5)`)).toBe(2);
    expect(await js(`Int64.From(3.5)`)).toBe(4);
    expect(await js(`Number.FromText("1,234")`)).toBe(1234);
    expect(await js(`Number.PositiveInfinity`)).toBe(Infinity);
    expect(await js(`Number.NegativeInfinity`)).toBe(-Infinity);
  });

  it("List: AnyTrue / AllTrue / Product / MinN / MaxN", async () => {
    expect(await js(`List.AnyTrue({false, true})`)).toBe(true);
    expect(await js(`List.AllTrue({true, false})`)).toBe(false);
    expect(await js(`List.Product({2, 3, 4})`)).toBe(24);
    expect(await js(`List.MinN({5, 1, 3, 2}, 2)`)).toEqual([1, 2]);
    expect(await js(`List.MaxN({5, 1, 3, 2}, 2)`)).toEqual([5, 3]);
  });

  it("Text: Remove / combiners", async () => {
    expect(await js(`Text.Remove("a-b.c", {"-", "."})`)).toBe("abc");
    expect(await js(`Combiner.CombineTextByDelimiter("-")({"a", "b", "c"})`)).toBe("a-b-c");
  });

  it("Record: Combine / FromTable", async () => {
    expect(await js(`Record.Combine({[a = 1], [b = 2], [a = 9]})`)).toEqual({ a: 9, b: 2 });
    expect(await js(`Record.FromTable(#table({"Name", "Value"}, {{"a", 1}, {"b", 2}}))`)).toEqual({ a: 1, b: 2 });
  });

  it("Date: DaysInMonth / AddQuarters", async () => {
    expect(await js(`Date.DaysInMonth(#date(2020, 2, 1))`)).toBe(29);
    expect(await js(`Date.AddQuarters(#date(2021, 1, 15), 2)`)).toBe("#date(2021,7,15)");
  });

  it("Table: Transpose / ExpandListColumn / CombineColumns / TransformRows", async () => {
    expect(((await js(`Table.Transpose(#table({"A", "B"}, {{1, 2}, {3, 4}}))`)) as T).rows).toEqual([[1, 3], [2, 4]]);
    const exp = (await js(`Table.ExpandListColumn(#table({"K", "L"}, {{1, {10, 20}}}), "L")`)) as T;
    expect(exp.rows).toEqual([[1, 10], [1, 20]]);
    const comb = (await js(`Table.CombineColumns(#table({"A", "B", "C"}, {{"x", "y", 1}}), {"A", "B"}, Combiner.CombineTextByDelimiter("-"), "AB")`)) as T;
    expect(comb.columns).toEqual(["AB", "C"]);
    expect(comb.rows).toEqual([["x-y", 1]]);
    expect(await js(`Table.TransformRows(#table({"A"}, {{1}, {2}}), each [A] * 10)`)).toEqual([10, 20]);
  });

  it("Value.FromText / Type.ToText / Function.InvokeAfter", async () => {
    expect(await js(`Value.FromText("42")`)).toBe(42);
    expect(await js(`Value.FromText("true")`)).toBe(true);
    expect(await js(`Function.InvokeAfter(() => 7, #duration(0, 0, 0, 1))`)).toBe(7);
  });
});
