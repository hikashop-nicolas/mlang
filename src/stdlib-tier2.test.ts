import { describe, expect, it } from "vitest";
import { evaluate, toJS } from "./index.js";

const js = async (m: string): Promise<unknown> => toJS(await evaluate(m));
type T = { columns: string[]; rows: unknown[][] };

// Gaps found in real workbooks (gsimardnet/PowerQueryNet, MIT). See qdeff.real.test.ts.
describe("Tier-2 additions from real workbooks", () => {
  it("#table with a numeric column count", async () => {
    const out = (await js(`#table(2, {{1, "a"}, {2, "b"}})`)) as T;
    expect(out.columns).toEqual(["Column1", "Column2"]);
    expect(out.rows).toEqual([[1, "a"], [2, "b"]]);
  });

  it("List.Dates generates a date sequence", async () => {
    const out = (await js(`List.Dates(#date(2018, 1, 1), 3, #duration(1, 0, 0, 0))`)) as unknown[];
    expect(out).toEqual(["#date(2018,1,1)", "#date(2018,1,2)", "#date(2018,1,3)"]);
  });

  it("Date.DayOfWeekName / Date.MonthName", async () => {
    expect(await js(`Date.DayOfWeekName(#date(2018, 1, 1))`)).toBe("Monday");
    expect(await js(`Date.MonthName(#date(2018, 3, 1))`)).toBe("March");
  });

  it("Int64.Type (and friends) coerce in TransformColumnTypes", async () => {
    const out = (await js(`Table.TransformColumnTypes(#table({"N"}, {{"42"}}), {{"N", Int64.Type}})`)) as T;
    expect(out.rows).toEqual([[42]]);
  });

  it("Splitter.SplitByNothing keeps the whole value", async () => {
    const out = (await js(`Table.FromList({"a", "b"}, Splitter.SplitByNothing(), null, null, ExtraValues.Error)`)) as T;
    expect(out.columns).toEqual(["Column1"]);
    expect(out.rows).toEqual([["a"], ["b"]]);
  });

  it("Binary.Decompress (deflate) + Json.Document", async () => {
    // "[1,2,3]" raw-deflated then base64'd.
    const { deflateRawSync } = await import("node:zlib");
    const b64 = deflateRawSync(Buffer.from("[1,2,3]")).toString("base64");
    expect(await js(`Json.Document(Binary.Decompress(Binary.FromText("${b64}", BinaryEncoding.Base64), Compression.Deflate))`)).toEqual([1, 2, 3]);
  });

  it("`x meta record` returns the value; `type table [...]` names #table columns", async () => {
    expect(await js(`1 meta [note = "hi"]`)).toBe(1);
    const out = (await js(`let _t = ((type text) meta [Serialized.Text = true]) in #table(type table [Year = _t, #"NY Date" = _t], {{"2019", "2019-02-05"}})`)) as T;
    expect(out.columns).toEqual(["Year", "NY Date"]);
    expect(out.rows).toEqual([["2019", "2019-02-05"]]);
  });
});
