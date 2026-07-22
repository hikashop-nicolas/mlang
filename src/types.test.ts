import { describe, expect, it } from "vitest";
import { evaluate, toJS } from "./index.js";

const js = async (m: string): Promise<unknown> => toJS(await evaluate(m));
type T = { columns: string[]; rows: unknown[][] };

describe("type model", () => {
  it("is / nullable", async () => {
    expect(await js(`1 is number`)).toBe(true);
    expect(await js(`"x" is number`)).toBe(false);
    expect(await js(`null is number`)).toBe(false);
    expect(await js(`null is nullable number`)).toBe(true);
    expect(await js(`1 is any`)).toBe(true);
  });

  it("Type.Is / IsNullable / NonNullable / ListItem", async () => {
    expect(await js(`Type.Is(type number, type any)`)).toBe(true);
    expect(await js(`Type.Is(type number, type text)`)).toBe(false);
    expect(await js(`Type.Is(type number, type number)`)).toBe(true);
    expect(await js(`Type.IsNullable(type nullable number)`)).toBe(true);
    expect(await js(`Type.IsNullable(type number)`)).toBe(false);
    expect(await js(`Type.IsNullable(Type.NonNullable(type nullable number))`)).toBe(false);
    expect(await js(`Type.ListItem(List.Type) is type`)).toBe(true);
  });

  it("Value.Is with ascribed types", async () => {
    expect(await js(`Value.Is(3, type number)`)).toBe(true);
    expect(await js(`Value.Is(3, Int64.Type)`)).toBe(true);
    expect(await js(`Value.Is("x", type number)`)).toBe(false);
  });

  it("Table.ColumnsOfType (nullable columns -> only type any matches)", async () => {
    const typed = `Table.TransformColumnTypes(#table({"N", "S"}, {{"1", "x"}}), {{"N", Int64.Type}, {"S", type text}})`;
    // TransformColumnTypes makes columns nullable, so a non-nullable specific type never
    // matches; only type any does (oracle-confirmed).
    expect(await js(`Table.ColumnsOfType(${typed}, {Int64.Type})`)).toEqual([]);
    expect(await js(`Table.ColumnsOfType(${typed}, {type text})`)).toEqual([]);
    expect(await js(`Table.ColumnsOfType(${typed}, {type any})`)).toEqual(["N", "S"]);
  });

  it("Table.Schema reports Name / TypeName / IsNullable", async () => {
    const out = (await js(`Table.Schema(Table.TransformColumnTypes(#table({"N"}, {{"1"}}), {{"N", Int64.Type}}))`)) as T;
    expect(out.columns).toContain("Name");
    expect(out.columns).toContain("TypeName");
    const row = out.rows[0] as unknown[];
    expect(row[out.columns.indexOf("Name")]).toBe("N");
    expect(row[out.columns.indexOf("TypeName")]).toBe("Int64.Type");
  });
});
