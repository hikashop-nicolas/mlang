import { describe, expect, it } from "vitest";
import { evaluate, toJS } from "./index.js";

const js = async (m: string): Promise<unknown> => toJS(await evaluate(m));
type T = { columns: string[]; rows: unknown[][] };

// Third Tier-2 batch, from the 92-file real-M corpus (function-library patterns).
describe("Tier-2 batch 3", () => {
  it("Value.ReplaceType / ReplaceMetadata / Metadata pass the value through", async () => {
    expect(await js(`Value.ReplaceType(42, type number)`)).toBe(42);
    expect(await js(`Value.ReplaceMetadata("x", [a = 1])`)).toBe("x");
    expect(await js(`Value.Metadata(42)`)).toEqual({});
  });

  it("Function.Invoke", async () => {
    expect(await js(`Function.Invoke((x, y) => x + y, {3, 4})`)).toBe(7);
  });

  it("List set operations", async () => {
    expect(await js(`List.Difference({1, 2, 3, 4}, {2, 4})`)).toEqual([1, 3]);
    expect(await js(`List.RemoveItems({1, 2, 2, 3}, {2})`)).toEqual([1, 3]);
    expect(await js(`List.Union({{1, 2}, {2, 3}})`)).toEqual([1, 2, 3]);
    expect(await js(`List.Intersect({{1, 2, 3}, {2, 3, 4}})`)).toEqual([2, 3]);
    expect(await js(`List.ReplaceMatchingItems({1, 2, 3}, {{2, 20}})`)).toEqual([1, 20, 3]);
    expect(await js(`List.IsEmpty({})`)).toBe(true);
    expect(await js(`List.IsEmpty({1})`)).toBe(false);
  });

  it("Text.ToList / SplitAny", async () => {
    expect(await js(`Text.ToList("abc")`)).toEqual(["a", "b", "c"]);
    expect(await js(`Text.SplitAny("a,b;c", ",;")`)).toEqual(["a", "b", "c"]);
  });

  it("Table.DuplicateColumn / ReorderColumns / ToRecords", async () => {
    const t = `#table({"A", "B"}, {{1, 2}})`;
    expect(((await js(`Table.DuplicateColumn(${t}, "A", "A2")`)) as T).columns).toEqual(["A", "B", "A2"]);
    expect(((await js(`Table.ReorderColumns(${t}, {"B", "A"})`)) as T).columns).toEqual(["B", "A"]);
    expect(await js(`Table.ToRecords(#table({"A"}, {{1}, {2}}))`)).toEqual([{ A: 1 }, { A: 2 }]);
  });

  it("Table.ReplaceErrorValues (no-op in our error-free model)", async () => {
    expect(((await js(`Table.ReplaceErrorValues(#table({"A"}, {{1}}), {{"A", 0}})`)) as T).rows).toEqual([[1]]);
  });
});
