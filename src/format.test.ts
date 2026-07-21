import { describe, expect, it } from "vitest";
import { evaluate, toJS } from "./index.js";

const js = async (m: string): Promise<unknown> => toJS(await evaluate(m));

describe("date/time format strings", () => {
  it("custom date specifiers", async () => {
    expect(await js(`Date.ToText(#date(2021, 3, 7), "yyyy-MM-dd")`)).toBe("2021-03-07");
    expect(await js(`Date.ToText(#date(2021, 3, 7), "M/d/yy")`)).toBe("3/7/21");
    expect(await js(`Date.ToText(#date(2021, 3, 7), "dddd, MMMM d, yyyy")`)).toBe("Sunday, March 7, 2021");
    expect(await js(`Date.ToText(#date(2021, 3, 7), "ddd MMM")`)).toBe("Sun Mar");
  });

  it("custom time specifiers and AM/PM", async () => {
    expect(await js(`Time.ToText(#time(13, 5, 9), "HH:mm:ss")`)).toBe("13:05:09");
    expect(await js(`Time.ToText(#time(13, 5, 9), "h:mm tt")`)).toBe("1:05 PM");
    expect(await js(`Time.ToText(#time(0, 30, 0), "h:mm tt")`)).toBe("12:30 AM");
    expect(await js(`DateTime.ToText(#datetime(2021, 3, 7, 13, 5, 9), "yyyy-MM-dd HH:mm:ss")`)).toBe("2021-03-07 13:05:09");
  });

  it("standard single-letter patterns and literals", async () => {
    expect(await js(`Date.ToText(#date(2021, 3, 7), "d")`)).toBe("3/7/2021");
    expect(await js(`DateTime.ToText(#datetime(2021, 3, 7, 13, 5, 9), "s")`)).toBe("2021-03-07T13:05:09");
    expect(await js(`Date.ToText(#date(2021, 3, 7), "yyyy'y'")`)).toBe("2021y");
    expect(await js(`Date.ToText(#date(2021, 3, 7), "yyyy\\\\MM")`)).toBe("2021\\03");
  });

  it("options-record form and unsupported specifier", async () => {
    expect(await js(`Date.ToText(#date(2021, 3, 7), [Format = "yyyy.MM.dd"])`)).toBe("2021.03.07");
    await expect(js(`Date.ToText(#date(2021, 3, 7), "yyyy Q")`)).rejects.toThrow(/unsupported specifier/);
  });
});

describe("number format strings", () => {
  it("standard specifiers", async () => {
    expect(await js(`Number.ToText(1234.5, "N2")`)).toBe("1,234.50");
    expect(await js(`Number.ToText(1234.5, "F0")`)).toBe("1235");
    expect(await js(`Number.ToText(0.1256, "P1")`)).toBe("12.6 %");
    expect(await js(`Number.ToText(1234.5, "C2")`)).toBe("$1,234.50");
    expect(await js(`Number.ToText(42, "D5")`)).toBe("00042");
    expect(await js(`Number.ToText(255, "X2")`)).toBe("FF");
  });

  it("custom picture formats", async () => {
    expect(await js(`Number.ToText(1234.5, "#,##0.00")`)).toBe("1,234.50");
    expect(await js(`Number.ToText(5, "000")`)).toBe("005");
    expect(await js(`Number.ToText(0.5, "0%")`)).toBe("50%");
    expect(await js(`Number.ToText(-3.14159, "0.00")`)).toBe("-3.14");
    await expect(js(`Number.ToText(1, "weird")`)).rejects.toThrow(/unsupported format/);
  });
});

describe("culture-aware parsing", () => {
  it("Number.From with decimal/group separators", async () => {
    expect(await js(`Number.From("1,234.5")`)).toBe(1234.5); // en-US default
    expect(await js(`Number.From("1.234,5", "de-DE")`)).toBe(1234.5);
    expect(await js(`Number.From("1 234,5", "fr-FR")`)).toBe(1234.5);
    expect(await js(`Number.From("50%")`)).toBe(0.5);
  });

  it("Date.From with culture date order", async () => {
    expect(await js(`Date.From("3/7/2021")`)).toBe("#date(2021,3,7)"); // en-US m/d/y
    expect(await js(`Date.From("7/3/2021", "fr-FR")`)).toBe("#date(2021,3,7)"); // d/m/y
    expect(await js(`Date.From("2021-03-07", "de-DE")`)).toBe("#date(2021,3,7)"); // ISO always
    expect(await js(`Date.From("07.03.2021", "de-DE")`)).toBe("#date(2021,3,7)"); // d.m.y
  });
});

describe("Binary.* in-memory", () => {
  it("base64 and hex round trips through a real binary kind", async () => {
    expect(await js(`Text.FromBinary(Binary.FromText("aGVsbG8="))`)).toBe("hello");
    expect(await js(`Binary.ToText(Text.ToBinary("hi"))`)).toBe("aGk=");
    expect(await js(`Binary.ToText(Text.ToBinary("hi"), BinaryEncoding.Hex)`)).toBe("6869");
    expect(await js(`Binary.Length(Text.ToBinary("hello"))`)).toBe(5);
    expect(await js(`Binary.FromText("6869", BinaryEncoding.Hex)`)).toBe(`#binary(${btoa("hi")})`);
  });

  it("Csv.Document over a decoded base64 binary (as a host connector would supply)", async () => {
    const m = `Csv.Document(Binary.FromText("YSxiCjEsMg=="))`; // "a,b\n1,2"
    const out = (await js(m)) as { rows: unknown[][] };
    expect(out.rows).toEqual([["a", "b"], ["1", "2"]]);
  });
});
