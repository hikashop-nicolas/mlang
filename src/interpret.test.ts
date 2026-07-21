import { describe, expect, it } from "vitest";
import { evaluate, evaluateSection, toJS, type HostBindings } from "./index";
import { number, table, text, type MValue } from "./values";

const js = async (m: string, host?: HostBindings): Promise<unknown> => toJS(await evaluate(m, host));

describe("language core", () => {
  it("literals", async () => {
    expect(await js("1.5")).toBe(1.5);
    expect(await js('"a""b"')).toBe('a"b');
    expect(await js('"line#(lf)break"')).toBe("line\nbreak");
    expect(await js("true")).toBe(true);
    expect(await js("null")).toBe(null);
    expect(await js("0x1F")).toBe(31);
  });

  it("operators and precedence", async () => {
    expect(await js("1 + 2 * 3")).toBe(7);
    expect(await js("(1 + 2) * 3")).toBe(9);
    expect(await js('"a" & "b"')).toBe("ab");
    expect(await js("-2 + 5")).toBe(3);
    expect(await js("not false")).toBe(true);
  });

  it("null propagation and three-valued logic (spec)", async () => {
    expect(await js("1 + null")).toBe(null);
    expect(await js('"a" & null')).toBe(null);
    expect(await js("null = null")).toBe(true);
    expect(await js("1 = null")).toBe(false);
    expect(await js("null and false")).toBe(false);
    expect(await js("null and true")).toBe(null);
    expect(await js("null or true")).toBe(true);
    expect(await js("null or false")).toBe(null);
  });

  it("errors: division by zero, try/otherwise, bare try record", async () => {
    await expect(js("1/0")).rejects.toThrow(/Division by zero/);
    expect(await js("try 1/0 otherwise -1")).toBe(-1);
    const r = (await js("try 1/0")) as { HasError: boolean; Error: { Message: string } };
    expect(r.HasError).toBe(true);
    expect(r.Error.Message).toMatch(/Division by zero/);
  });

  it("let is lazy, memoized and order-independent", async () => {
    expect(await js("let a = b + 1, b = 2 in a")).toBe(3);
    // An unused binding that would raise must not be evaluated.
    expect(await js("let boom = 1/0, ok = 5 in ok")).toBe(5);
  });

  it("records, lists, item and field access", async () => {
    expect(await js("[A = 1, B = 2][B]")).toBe(2);
    expect(await js("[A = 1][Missing]?")).toBe(null);
    expect(await js("{10, 20, 30}{1}")).toBe(20);
    expect(await js("{1..4}")).toEqual([1, 2, 3, 4]);
    expect(await js("{9}{5}?")).toBe(null);
    await expect(js("{9}{5}")).rejects.toThrow(/bounds/);
  });

  it("functions, each, closures, optional params", async () => {
    expect(await js("let f = (x, optional y) => x + (if y = null then 0 else y) in f(2)")).toBe(2);
    expect(await js("let f = (x, y) => x * y in f(3, 4)")).toBe(12);
    expect(await js("let add = (n) => (m) => n + m in add(2)(3)")).toBe(5);
    expect(await js("List.Transform({1, 2}, each _ * 10)")).toEqual([10, 20]);
  });

  it("if and comparisons", async () => {
    expect(await js('if 2 > 1 then "y" else "n"')).toBe("y");
    await expect(js("1 > null")).rejects.toThrow(/compare/);
  });

  it("is / as", async () => {
    expect(await js("1 is number")).toBe(true);
    expect(await js('"x" is number')).toBe(false);
    expect(await js("1 as number")).toBe(1);
  });
});

describe("Tier-0 stdlib", () => {
  const T = '#table({"Name", "Qty"}, {{"a", 10}, {"b", 3}, {"c", 7}})';

  it("#table + RowCount + ColumnNames", async () => {
    expect(await js(`Table.RowCount(${T})`)).toBe(3);
    expect(await js(`Table.ColumnNames(${T})`)).toEqual(["Name", "Qty"]);
  });

  it("SelectRows with each", async () => {
    expect(await js(`Table.RowCount(Table.SelectRows(${T}, each [Qty] > 5))`)).toBe(2);
  });

  it("Select/Remove/Rename columns", async () => {
    expect(await js(`Table.ColumnNames(Table.SelectColumns(${T}, {"Qty"}))`)).toEqual(["Qty"]);
    expect(await js(`Table.ColumnNames(Table.RemoveColumns(${T}, {"Qty"}))`)).toEqual(["Name"]);
    expect(await js(`Table.ColumnNames(Table.RenameColumns(${T}, {{"Qty", "Quantity"}}))`)).toEqual(["Name", "Quantity"]);
  });

  it("AddColumn + TransformColumnTypes", async () => {
    const out = (await js(`Table.AddColumn(${T}, "Double", each [Qty] * 2)`)) as { rows: unknown[][] };
    expect(out.rows.map((r) => r[2])).toEqual([20, 6, 14]);
    const conv = (await js(`Table.TransformColumnTypes(#table({"N"}, {{"12"}, {"3.5"}}), {{"N", type number}})`)) as { rows: unknown[][] };
    expect(conv.rows.map((r) => r[0])).toEqual([12, 3.5]);
  });

  it("Sort + FirstN", async () => {
    const sorted = (await js(`Table.Sort(${T}, {{"Qty", Order.Descending}})`)) as { rows: unknown[][] };
    expect(sorted.rows.map((r) => r[0])).toEqual(["a", "c", "b"]);
    const first = (await js(`Table.FirstN(Table.Sort(${T}, {"Qty"}), 1)`)) as { rows: unknown[][] };
    expect(first.rows[0]).toEqual(["b", 3]);
  });

  it("table{[key]} row lookup and table[Column] as list", async () => {
    expect(await js(`(${T}){[Name = "b"]}[Qty]`)).toBe(3);
    expect(await js(`(${T}){0}[Name]`)).toBe("a");
    expect(await js(`List.Sum((${T})[Qty])`)).toBe(20);
  });

  it("List/Text/Number", async () => {
    expect(await js('Text.From(12)')).toBe("12");
    expect(await js('Number.From("3.5")')).toBe(3.5);
    expect(await js('Text.Upper("ab")')).toBe("AB");
    expect(await js("List.Count({1, 2, 3})")).toBe(3);
    expect(await js("List.Sum({1, null, 2})")).toBe(3);
  });
});

describe("the spike query (workbook-backed)", () => {
  // Excel.CurrentWorkbook(): the host injects a table of {Name, Content}.
  const sales = table(["Product", "Qty", "Price"], [
    [text("Apples"), number(10), number(2.5)],
    [text("Pears"), number(4), number(3)],
    [text("Cherries"), number(20), number(5)],
  ]);
  const host: HostBindings = {
    "Excel.CurrentWorkbook": {
      kind: "function",
      name: "Excel.CurrentWorkbook",
      params: [],
      call: () => table(["Name", "Content"], [[text("Sales"), sales]]),
    },
  };

  const SPIKE = `let
    Source = Excel.CurrentWorkbook(){[Name="Sales"]}[Content],
    Typed = Table.TransformColumnTypes(Source, {{"Qty", type number}, {"Price", type number}}),
    Filtered = Table.SelectRows(Typed, each [Qty] > 5),
    Renamed = Table.RenameColumns(Filtered, {{"Qty", "Quantity"}}),
    Total = Table.AddColumn(Renamed, "Total", each [Quantity] * [Price]),
    Sorted = Table.Sort(Total, {{"Total", Order.Descending}})
  in Sorted`;

  it("evaluates the full step chain", async () => {
    const out = (await js(SPIKE, host)) as { columns: string[]; rows: unknown[][] };
    expect(out.columns).toEqual(["Product", "Quantity", "Price", "Total"]);
    expect(out.rows).toEqual([
      ["Cherries", 20, 5, 100],
      ["Apples", 10, 2.5, 25],
    ]);
  });

  it("runs as a section document (Section1.m shape)", async () => {
    const sectionM = `section Section1;\nshared Sales_Query = ${SPIKE};\nshared RowTotal = Table.RowCount(Sales_Query);`;
    const q = await evaluateSection(sectionM, host);
    expect(q.names).toEqual(["Sales_Query", "RowTotal"]);
    expect(toJS(q.run("RowTotal"))).toBe(2);
    const t = toJS(q.run("Sales_Query")) as { rows: unknown[][] };
    expect(t.rows.length).toBe(2);
  });

  it("reports unknown functions precisely", async () => {
    await expect(js("Web.Contents(\"https://x\")", host)).rejects.toThrow(/Web.Contents/);
  });
});

// keep helper import used (values are constructed for the host binding)
void ((): MValue => number(0));
