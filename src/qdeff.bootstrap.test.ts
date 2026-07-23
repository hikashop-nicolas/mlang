import { strToU8, unzipSync, zipSync } from "fflate";
import { describe, expect, it } from "vitest";
import { createWorkbookQueries, queryNamesFromSectionM, readWorkbookQueries, writeWorkbookSectionM, connectionsXml } from "./qdeff.js";

// A minimal query-less xlsx (the parts sheetedit/Excel always have).
function emptyXlsx(): Record<string, Uint8Array> {
  return {
    "[Content_Types].xml": strToU8('<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/></Types>'),
    "_rels/.rels": strToU8('<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/></Relationships>'),
    "xl/workbook.xml": strToU8('<workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><sheets><sheet name="Sheet1" sheetId="1" r:id="rId1"/></sheets></workbook>'),
    "xl/_rels/workbook.xml.rels": strToU8('<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet1.xml"/></Relationships>'),
    "xl/worksheets/sheet1.xml": strToU8('<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><sheetData/></worksheet>'),
  };
}

const SECTION = 'section Section1;\r\n\r\nshared Sales = let\n    Source = Excel.CurrentWorkbook(){[Name="T"]}[Content]\nin\n    Source;\r\n';

describe("qdeff bootstrap", () => {
  it("extracts shared query names (plain and quoted)", () => {
    expect(queryNamesFromSectionM('section Section1;\nshared Foo = 1;\nshared #"Bar Baz" = 2;')).toEqual(["Foo", "Bar Baz"]);
  });

  it("createWorkbookQueries produces a readable payload with the section + names", () => {
    const out = createWorkbookQueries(emptyXlsx(), SECTION, "{ABCDEF01-0000-0000-0000-000000000000}");
    const found = readWorkbookQueries(out);
    expect(found).not.toBeNull();
    expect(found!.mashup.sectionM.trim()).toBe(SECTION.trim());
    expect(queryNamesFromSectionM(found!.mashup.sectionM)).toEqual(["Sales"]);
    // customXml parts + itemProps + rels registered
    expect(out["customXml/item1.xml"]).toBeTruthy();
    expect(out["customXml/itemProps1.xml"]).toBeTruthy();
    expect(out["customXml/_rels/item1.xml.rels"]).toBeTruthy();
    // connections + content type + workbook rel
    const conn = new TextDecoder().decode(out["xl/connections.xml"]);
    expect(conn).toContain('name="Query - Sales"');
    expect(conn).toContain("Location=Sales");
    expect(new TextDecoder().decode(out["[Content_Types].xml"])).toContain("connections+xml");
    expect(new TextDecoder().decode(out["[Content_Types].xml"])).toContain("customXmlProperties+xml");
    const rels = new TextDecoder().decode(out["xl/_rels/workbook.xml.rels"]);
    expect(rels).toContain("../customXml/item1.xml");
    expect(rels).toContain("connections.xml");
    // the whole thing zips + unzips (not corrupt)
    expect(() => unzipSync(zipSync(out))).not.toThrow();
  });

  it("writeWorkbookSectionM bootstraps when there is no payload, then edits in place", () => {
    const created = writeWorkbookSectionM(emptyXlsx(), SECTION);
    expect(readWorkbookQueries(created)!.mashup.sectionM.trim()).toBe(SECTION.trim());
    // A second write (payload now exists) updates the M and adds the new query to nothing extra breaking.
    const edited = 'section Section1;\nshared Sales = 1;\nshared Extra = 2;';
    const out2 = writeWorkbookSectionM(created, edited);
    expect(readWorkbookQueries(out2)!.mashup.sectionM.trim()).toBe(edited.trim());
  });

  it("connectionsXml lists one connection per name", () => {
    const xml = connectionsXml(["A", "B"]);
    expect((xml.match(/<connection /g) || []).length).toBe(2);
    expect(xml).toContain('name="Query - A"');
    expect(xml).toContain('name="Query - B"');
  });
});
