import { describe, expect, it } from "vitest";
import { evaluate, toJS } from "./index.js";

const js = async (m: string): Promise<unknown> => toJS(await evaluate(m));
type T = { columns: string[]; rows: unknown[][] };

describe("Csv.Document", () => {
  it("parses a delimited text source with quoting", async () => {
    const m = `Csv.Document("a,b,c#(cr,lf)1,2,3#(cr,lf)""x,y"",5,6")`;
    const out = (await js(m)) as T;
    expect(out.columns).toEqual(["Column1", "Column2", "Column3"]);
    expect(out.rows).toEqual([["a", "b", "c"], ["1", "2", "3"], ["x,y", "5", "6"]]);
  });

  it("promote-headers pipeline over CSV", async () => {
    const m = `let
      Raw = Csv.Document("Name,Qty#(lf)Apples,10#(lf)Pears,4"),
      H = Table.PromoteHeaders(Raw),
      T = Table.TransformColumnTypes(H, {{"Qty", type number}})
    in T`;
    const out = (await js(m)) as T;
    expect(out.columns).toEqual(["Name", "Qty"]);
    expect(out.rows).toEqual([["Apples", 10], ["Pears", 4]]);
  });

  it("honours a Delimiter option and a Columns count", async () => {
    expect(((await js(`Csv.Document("a;b;c", [Delimiter = ";"])`)) as T).rows).toEqual([["a", "b", "c"]]);
    expect(((await js(`Csv.Document("a,b", 3)`)) as T).rows).toEqual([["a", "b", null]]);
    await expect(js(`Csv.Document("a,b", [Unknown = 1])`)).rejects.toThrow(/not supported/);
  });

  it("preserves embedded newlines inside quoted fields", async () => {
    const out = (await js(`Csv.Document("""line1#(lf)line2"",b")`)) as T;
    expect(out.rows).toEqual([["line1\nline2", "b"]]);
  });
});

describe("Json.Document", () => {
  it("parses objects, arrays and scalars into M values", async () => {
    expect(await js(`Json.Document("{""a"": 1, ""b"": [2, 3], ""c"": null}")`)).toEqual({ a: 1, b: [2, 3], c: null });
    expect(await js(`Json.Document("[true, false]")`)).toEqual([true, false]);
    expect(await js(`Json.Document("42")`)).toBe(42);
    await expect(js(`Json.Document("{bad}")`)).rejects.toThrow(/invalid JSON/);
  });

  it("array of objects -> Table.FromRecords", async () => {
    const m = `Table.FromRecords(Json.Document("[{""n"": ""a"", ""v"": 1}, {""n"": ""b"", ""v"": 2}]"))`;
    const out = (await js(m)) as T;
    expect(out.columns).toEqual(["n", "v"]);
    expect(out.rows).toEqual([["a", 1], ["b", 2]]);
  });
});

describe("Lines / Table.From* / List.Generate / Value.*", () => {
  it("Lines.FromText and Lines.ToText", async () => {
    expect(await js(`Lines.FromText("a#(lf)b#(lf)c")`)).toEqual(["a", "b", "c"]);
    expect(await js(`Lines.FromText("a#(lf)b#(lf)")`)).toEqual(["a", "b"]);
    expect(await js(`Lines.ToText({"a", "b"}, "|")`)).toBe("a|b");
  });

  it("Table.FromColumns / Table.FromList", async () => {
    const c = (await js(`Table.FromColumns({{1, 2}, {"a", "b"}}, {"N", "L"})`)) as T;
    expect(c.columns).toEqual(["N", "L"]);
    expect(c.rows).toEqual([[1, "a"], [2, "b"]]);
    const l = (await js(`Table.FromList({"a-1", "b-2"}, Splitter.SplitTextByDelimiter("-"), {"K", "V"})`)) as T;
    expect(l.rows).toEqual([["a", "1"], ["b", "2"]]);
  });

  it("List.Generate builds a bounded sequence", async () => {
    expect(await js(`List.Generate(() => 1, each _ <= 5, each _ + 1)`)).toEqual([1, 2, 3, 4, 5]);
    // [i]/[acc] inside the next-record read the OLD state, so acc lags one step.
    const m = `List.Generate(() => [i = 0, acc = 0], each [i] < 3, each [i = [i] + 1, acc = [acc] + [i]], each [acc])`;
    expect(await js(m)).toEqual([0, 0, 1]);
  });

  it("Value.Is / Value.Type", async () => {
    expect(await js(`Value.Is(3, type number)`)).toBe(true);
    expect(await js(`Value.Is("x", type number)`)).toBe(false);
    expect(await js(`Value.Is(#date(2021, 1, 1), type date)`)).toBe(true);
  });
});
