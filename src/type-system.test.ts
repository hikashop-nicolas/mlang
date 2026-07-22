import { describe, expect, it } from "vitest";
import { evaluate, toJS } from "./index.js";

// SPEC_GAP Tier 2: the type-system functions. The type model now carries function
// parameters/return, typed record fields, open/closed records, table keys, and facets.
const js = async (m: string): Promise<unknown> => toJS(await evaluate(m));

describe("type system: function types", () => {
  it("parameters, return, required count (matches the reference examples)", async () => {
    expect(await js(`Record.FieldNames(Type.FunctionParameters(type function (x as number, y as text) as any))`)).toEqual(["x", "y"]);
    expect(await js(`Type.Is(Type.FunctionReturn(type function (x as number) as text), type text)`)).toBe(true);
    expect(await js(`Type.FunctionRequiredParameters(type function (x as number, optional y as text) as any)`)).toBe(1);
  });
  it("Type.ForFunction round-trips", async () => {
    const sig = `[ReturnType = type number, Parameters = [X = type number, Y = type text]]`;
    expect(await js(`Type.Is(Type.FunctionReturn(Type.ForFunction(${sig}, 1)), type number)`)).toBe(true);
    expect(await js(`Type.FunctionRequiredParameters(Type.ForFunction(${sig}, 1))`)).toBe(1);
    expect(await js(`Record.FieldNames(Type.FunctionParameters(Type.ForFunction(${sig}, 1)))`)).toEqual(["X", "Y"]);
  });
  it("Value.Type exposes a function value's parameters", async () => {
    expect(await js(`Record.FieldNames(Type.FunctionParameters(Value.Type((a, b) => a + b)))`)).toEqual(["a", "b"]);
  });
});

describe("type system: record types", () => {
  it("Type.RecordFields shape (matches the reference example)", async () => {
    expect(await js(`Type.RecordFields(type [A = number, optional B = any])[A][Optional]`)).toBe(false);
    expect(await js(`Type.RecordFields(type [A = number, optional B = any])[B][Optional]`)).toBe(true);
    expect(await js(`Type.Is(Type.RecordFields(type [A = number])[A][Type], type number)`)).toBe(true);
  });
  it("open / closed records", async () => {
    expect(await js(`Type.IsOpenRecord(type [A = number])`)).toBe(false);
    expect(await js(`Type.IsOpenRecord(type [A = number, ...])`)).toBe(true);
    expect(await js(`Type.IsOpenRecord(Type.OpenRecord(type [A = number]))`)).toBe(true);
    expect(await js(`Type.IsOpenRecord(Type.ClosedRecord(type [A = number, ...]))`)).toBe(false);
  });
  it("Type.ForRecord builds a record type", async () => {
    const flds = `[Name = [Type = type text, Optional = false], Score = [Type = type number, Optional = false]]`;
    expect(await js(`Record.FieldNames(Type.RecordFields(Type.ForRecord(${flds}, false)))`)).toEqual(["Name", "Score"]);
  });
});

describe("type system: table types & keys", () => {
  const TT = `type table [A = number, B = text]`;
  it("TableSchema & TableRow", async () => {
    expect(await js(`Table.Column(Type.TableSchema(${TT}), "Name")`)).toEqual(["A", "B"]);
    expect(await js(`Table.Column(Type.TableSchema(${TT}), "TypeName")`)).toEqual(["Number.Type", "Text.Type"]);
    expect(await js(`Record.FieldNames(Type.RecordFields(Type.TableRow(${TT})))`)).toEqual(["A", "B"]);
  });
  it("keys round-trip", async () => {
    expect(await js(`Type.TableKeys(Type.AddTableKey(${TT}, {"A"}, true))`)).toEqual([{ Columns: ["A"], Primary: true }]);
    expect(await js(`Type.TableKeys(Type.ReplaceTableKeys(Type.AddTableKey(${TT}, {"A"}, true), {}))`)).toEqual([]);
  });
});

describe("type system: facets & union", () => {
  it("Type.Facets returns the canonical record; ReplaceFacets round-trips a real facet", async () => {
    // Unset facets are present but null (not an empty record).
    expect(await js(`Type.Facets(type number)[NumericPrecision]`)).toBe(null);
    expect(await js(`Record.HasFields(Type.Facets(type number), "NativeTypeName")`)).toBe(true);
    expect(await js(`Type.Facets(Type.ReplaceFacets(type number, [NumericPrecision = 10]))[NumericPrecision]`)).toBe(10);
  });
  it("Type.Union: dedupes to a single type, includes members, excludes non-members", async () => {
    expect(await js(`Type.Is(Type.Union({type number, type number}), type number)`)).toBe(true); // collapses to number
    expect(await js(`Type.Is(type number, Type.Union({type number, type text}))`)).toBe(true); // number is a member
    expect(await js(`Type.Is(type text, Type.Union({type number, type text}))`)).toBe(true); // text is a member
    expect(await js(`Type.Is(type date, Type.Union({type number, type text}))`)).toBe(false); // date is NOT a member
    expect(await js(`Value.Is(123, Type.Union({type number, type text}))`)).toBe(true);
    expect(await js(`Value.Is(#date(2020,1,1), Type.Union({type number, type text}))`)).toBe(false);
  });
});
