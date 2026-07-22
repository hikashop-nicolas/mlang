import { describe, expect, it } from "vitest";
import { evaluate, toJS } from "./index.js";

const js = async (m: string): Promise<unknown> => toJS(await evaluate(m));

describe("long-tail standard functions", () => {
  it("Number math + bitwise", async () => {
    expect(await js(`Number.Exp(0)`)).toBe(1);
    expect(await js(`Number.Log(8, 2)`)).toBe(3);
    expect(await js(`Number.Log10(1000)`)).toBe(3);
    expect(await js(`Number.Factorial(5)`)).toBe(120);
    expect(await js(`Number.BitwiseAnd(6, 3)`)).toBe(2);
    expect(await js(`Number.BitwiseOr(4, 1)`)).toBe(5);
    expect(await js(`Number.BitwiseXor(6, 3)`)).toBe(5);
    expect(await js(`Number.BitwiseShiftLeft(1, 4)`)).toBe(16);
    expect(await js(`Number.BitwiseShiftRight(16, 2)`)).toBe(4);
  });

  it("Text range + Format", async () => {
    expect(await js(`Text.Insert("abc", 1, "XY")`)).toBe("aXYbc");
    expect(await js(`Text.RemoveRange("abcd", 1, 2)`)).toBe("ad");
    expect(await js(`Text.ReplaceRange("abcd", 1, 2, "XY")`)).toBe("aXYd");
    expect(await js(`Text.Format("#{0}-#{1}", {"a", "b"})`)).toBe("a-b");
    expect(await js(`Text.Format("#[x]/#[y]", [x = 1, y = 2])`)).toBe("1/2");
  });

  it("List Repeat / Positions / Single", async () => {
    expect(await js(`List.Repeat({1, 2}, 3)`)).toEqual([1, 2, 1, 2, 1, 2]);
    expect(await js(`List.Positions({7, 8, 9})`)).toEqual([0, 1, 2]);
    expect(await js(`List.Single({5})`)).toBe(5);
    await expect(js(`List.Single({1, 2})`)).rejects.toThrow(/exactly one/);
  });

  it("Record ToList / RenameFields / TransformFields", async () => {
    expect(await js(`Record.ToList([a = 1, b = 2])`)).toEqual([1, 2]);
    expect(await js(`Record.RenameFields([a = 1, b = 2], {{"a", "x"}})`)).toEqual({ x: 1, b: 2 });
    expect(await js(`Record.TransformFields([a = 1, b = 2], {{"a", each _ * 10}})`)).toEqual({ a: 10, b: 2 });
  });

  it("Binary FromList / ToList", async () => {
    expect(await js(`Binary.ToText(Binary.FromList({104, 105}))`)).toBe("aGk=");
    expect(await js(`Binary.ToList(Binary.FromText("aGk="))`)).toEqual([104, 105]);
  });

  it("Table Repeat / Split / Partition", async () => {
    expect(((await js(`Table.Repeat(#table({"A"}, {{1}}), 3)`)) as { rows: unknown[][] }).rows).toEqual([[1], [1], [1]]);
    expect(await js(`List.Count(Table.Split(#table({"A"}, {{1}, {2}, {3}}), 2))`)).toBe(2);
    expect(await js(`List.Count(Table.Partition(#table({"A"}, {{0}, {1}, {2}, {3}}), "A", 2, each _))`)).toBe(2);
  });
});
