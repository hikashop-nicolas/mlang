import { describe, expect, it } from "vitest";
import { evaluate, toJS } from "./index.js";

const js = async (m: string): Promise<unknown> => toJS(await evaluate(m));
// A table with a good and a bad conversion in an added column.
const T = `Table.AddColumn(#table({"A"}, {{"1"}, {"x"}, {"3"}}), "N", each Number.FromText([A]))`;

describe("per-cell errors", () => {
  it("Table.RemoveRowsWithErrors drops rows whose cells errored", async () => {
    expect(await js(`Table.RowCount(Table.RemoveRowsWithErrors(${T}))`)).toBe(2);
    expect(await js(`Table.Column(Table.RemoveRowsWithErrors(${T}), "N")`)).toEqual([1, 3]);
  });

  it("Table.SelectRowsWithErrors keeps only errored rows", async () => {
    expect(await js(`Table.RowCount(Table.SelectRowsWithErrors(${T}))`)).toBe(1);
    expect(await js(`Table.Column(Table.SelectRowsWithErrors(${T}), "A")`)).toEqual(["x"]);
  });

  it("Table.ReplaceErrorValues replaces the error cell", async () => {
    expect(await js(`Table.Column(Table.ReplaceErrorValues(${T}, {{"N", -1}}), "N")`)).toEqual([1, -1, 3]);
  });

  it("an error cell is caught by try and re-raised when used", async () => {
    expect(await js(`try (${T}){1}[N] otherwise "caught"`)).toBe("caught");
    await expect(js(`1 + (${T}){1}[N]`)).rejects.toThrow(/cannot convert/);
    // reading a good cell is unaffected
    expect(await js(`(${T}){0}[N]`)).toBe(1);
  });
});
