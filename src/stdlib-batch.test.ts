import { describe, expect, it } from "vitest";
import { evaluate, toJS } from "./index.js";

const js = async (m: string): Promise<unknown> => toJS(await evaluate(m));

describe("coverage batch: Lines / Json / Uri / Binary", () => {
  it("Lines.FromBinary splits decoded bytes into lines", async () => {
    expect(await js(`Lines.FromBinary(Text.ToBinary("a" & Character.FromNumber(10) & "b"))`)).toEqual(["a", "b"]);
    expect(await js(`Lines.FromBinary(Text.ToBinary("a" & Character.FromNumber(10) & "b"), null, true)`)).toEqual(["a\n", "b"]);
  });
  it("Json.FromValue round-trips through Json.Document", async () => {
    expect(await js(`Json.Document(Json.FromValue([a = 1, b = "x", c = {1, 2}]))`)).toEqual({ a: 1, b: "x", c: [1, 2] });
    expect(await js(`Text.FromBinary(Json.FromValue(#date(2020, 1, 31)))`)).toBe(`"2020-01-31"`);
  });
  it("Uri.BuildQueryString / EscapeDataString", async () => {
    expect(await js(`Uri.BuildQueryString([a = "1", b = "x y"])`)).toBe("a=1&b=x%20y");
    expect(await js(`Uri.EscapeDataString("a b!")`)).toBe("a%20b%21");
    expect(await js(`Uri.Combine("http://h/x/", "y")`)).toBe("http://h/x/y");
  });
  it("Binary.Compress is the inverse of Binary.Decompress", async () => {
    expect(await js(`Text.FromBinary(Binary.Decompress(Binary.Compress(Text.ToBinary("hello"), Compression.Deflate), Compression.Deflate))`)).toBe("hello");
    expect(await js(`Text.FromBinary(Binary.Decompress(Binary.Compress(Text.ToBinary("gz"), Compression.GZip), Compression.GZip))`)).toBe("gz");
  });
});

describe("coverage batch: Number / Date / Time", () => {
  it("Number constants and parity", async () => {
    expect(await js(`Number.Round(Number.PI, 4)`)).toBe(3.1416);
    expect(await js(`Number.IsEven(4)`)).toBe(true);
    expect(await js(`Number.IsOdd(4)`)).toBe(false);
    expect(await js(`Byte.From("255")`)).toBe(255);
    expect(await js(`Percentage.From("50%")`)).toBe(0.5);
  });
  it("Date/Time text parsers and leap year", async () => {
    expect(await js(`Date.FromText("2021-03-14")`)).toBe("#date(2021,3,14)");
    expect(await js(`Time.FromText("13:05:07")`)).toBe(`#time(${13 * 3600 + 5 * 60 + 7})`);
    expect(await js(`Time.FromText("1:05 PM")`)).toBe(`#time(${13 * 3600 + 5 * 60})`);
    expect(await js(`Date.IsLeapYear(2020)`)).toBe(true);
    expect(await js(`Date.IsLeapYear(2021)`)).toBe(false);
  });
  it("List.DateTimes steps by a duration", async () => {
    expect(await js(`List.Count(List.DateTimes(#datetime(2020,1,1,0,0,0), 3, #duration(1,0,0,0)))`)).toBe(3);
    expect(await js(`List.Last(List.DateTimes(#datetime(2020,1,1,0,0,0), 3, #duration(1,0,0,0)))`)).toBe("#datetime(2020,1,3,0)");
  });
});

describe("coverage batch: List / Table / Value", () => {
  it("List.ContainsAll/Any, Split, TransformMany, Remove*N", async () => {
    expect(await js(`List.ContainsAll({1, 2, 3}, {1, 3})`)).toBe(true);
    expect(await js(`List.ContainsAll({1, 2, 3}, {1, 4})`)).toBe(false);
    expect(await js(`List.ContainsAny({1, 2}, {4, 2})`)).toBe(true);
    expect(await js(`List.Split({1, 2, 3, 4, 5}, 2)`)).toEqual([[1, 2], [3, 4], [5]]);
    expect(await js(`List.TransformMany({1, 2}, each {_, _ * 10}, (x, y) => x + y)`)).toEqual([2, 11, 4, 22]);
    expect(await js(`List.RemoveFirstN({1, 2, 3}, 2)`)).toEqual([3]);
    expect(await js(`List.RemoveLastN({1, 2, 3}, 2)`)).toEqual([1]);
  });
  it("Table.IsDistinct / SingleRow / RemoveFirstN", async () => {
    expect(await js(`Table.IsDistinct(#table({"A"}, {{1}, {2}}))`)).toBe(true);
    expect(await js(`Table.IsDistinct(#table({"A"}, {{1}, {1}}))`)).toBe(false);
    expect(await js(`Table.SingleRow(#table({"A"}, {{7}}))`)).toEqual({ A: 7 });
    expect(await js(`Table.RowCount(Table.RemoveFirstN(#table({"A"}, {{1}, {2}, {3}}), 1))`)).toBe(2);
  });
  it("Value.Add/Divide/Compare and Comparer.Equals", async () => {
    expect(await js(`Value.Add(2, 3)`)).toBe(5);
    expect(await js(`Value.Divide(10, 4)`)).toBe(2.5);
    expect(await js(`Value.Divide(1, null)`)).toBe(null);
    expect(await js(`Value.Compare(1, 2)`)).toBe(-1);
    expect(await js(`Value.Compare("b", "a")`)).toBe(1);
    expect(await js(`Comparer.Equals(Comparer.Ordinal, "a", "a")`)).toBe(true);
    expect(await js(`Comparer.Equals(Comparer.OrdinalIgnoreCase, "A", "a")`)).toBe(true);
  });
  it("Splitter.SplitTextByRepeatedLengths", async () => {
    expect(await js(`Splitter.SplitTextByRepeatedLengths({2})("aabbcc")`)).toEqual(["aa", "bb", "cc"]);
  });
});
