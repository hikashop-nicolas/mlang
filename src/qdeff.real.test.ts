import { readFileSync } from "node:fs";
import { unzipSync } from "fflate";
import { describe, expect, it } from "vitest";
import { evaluateSection, toJS } from "./index.js";
import { decodeOoxmlText, readWorkbookQueries } from "./qdeff.js";

// Real-world workbook (Microsoft connected-workbooks template, MIT - see
// test/fixtures/README.md): its DataMashup customXml item is UTF-16 LE, unlike the
// UTF-8 synthetic fixtures. This guards the whole read path against real Excel output.
const bytes = new Uint8Array(readFileSync(new URL("../test/fixtures/msft-simple-query.xlsx", import.meta.url)));

describe("qdeff on a real workbook", () => {
  it("decodes the UTF-16 customXml item and parses the payload", () => {
    const q = readWorkbookQueries(unzipSync(bytes));
    expect(q).not.toBeNull();
    expect(q!.itemPath).toBe("customXml/item1.xml");
    expect(q!.mashup.version).toBe(0);
    expect(Object.keys(q!.mashup.parts)).toContain("Formulas/Section1.m");
    expect(q!.mashup.sectionM).toContain("section Section1;");
    expect(q!.mashup.sectionM).toContain("shared Query1");
  });

  it("evaluates the template's query", async () => {
    const q = readWorkbookQueries(unzipSync(bytes))!;
    const section = await evaluateSection(q.mashup.sectionM, {});
    expect(section.names).toEqual(["Query1"]);
    expect(toJS(section.run("Query1"))).toBe("");
  });

  it("decodeOoxmlText handles BOMs", () => {
    const utf16 = new Uint8Array([0xff, 0xfe, 0x41, 0x00, 0x42, 0x00]);
    expect(decodeOoxmlText(utf16)).toBe("AB");
    expect(decodeOoxmlText(new Uint8Array([0x41, 0x42]))).toBe("AB");
  });
});
