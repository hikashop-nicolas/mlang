import { describe, expect, it } from "vitest";
import { fromJson, tableFromJson, tableFromRecords, toJS } from "./index.js";

describe("host helpers", () => {
  it("fromJson maps JSON to M values", () => {
    expect(toJS(fromJson({ a: 1, b: [true, "x"], c: null }))).toEqual({ a: 1, b: [true, "x"], c: null });
    expect(toJS(fromJson(42))).toBe(42);
    expect(toJS(fromJson("hi"))).toBe("hi");
  });

  it("tableFromRecords unions field names in first-seen order", () => {
    const recs = [fromJson({ n: "a", v: 1 }), fromJson({ n: "b", extra: true })];
    const t = toJS(tableFromRecords(recs)) as { columns: string[]; rows: unknown[][] };
    expect(t.columns).toEqual(["n", "v", "extra"]);
    expect(t.rows).toEqual([["a", 1, null], ["b", null, true]]);
  });

  it("tableFromJson turns an OData value array into a table", () => {
    // A trimmed OData v4 response body's `value` array.
    const value = [
      { ID: 1, Name: "Bread", Price: 2.5 },
      { ID: 2, Name: "Milk", Price: 1.2 },
    ];
    const t = toJS(tableFromJson(value)) as { columns: string[]; rows: unknown[][] };
    expect(t.columns).toEqual(["ID", "Name", "Price"]);
    expect(t.rows).toEqual([[1, "Bread", 2.5], [2, "Milk", 1.2]]);
  });
});
