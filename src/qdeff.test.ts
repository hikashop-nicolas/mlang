import { strToU8, zipSync } from "fflate";
import { describe, expect, it } from "vitest";
import { parseDataMashup, readWorkbookQueries } from "./qdeff";

// Build a synthetic MS-QDEFF payload: version + 4 length-prefixed blocks, the first being
// an OPC zip holding Formulas/Section1.m. Self-consistency fixture; a real-workbook
// validation runs alongside once a real .xlsx is in test/fixtures (spike item b).
function buildDataMashup(sectionM: string): Uint8Array {
  const pkg = zipSync({
    "[Content_Types].xml": strToU8('<?xml version="1.0"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"/>'),
    "Formulas/Section1.m": strToU8(sectionM),
  });
  const permissions = strToU8('<?xml version="1.0" encoding="utf-8"?><PermissionList/>');
  const metadata = new Uint8Array(0);
  const bindings = new Uint8Array(0);
  const total = 4 + 4 + pkg.length + 4 + permissions.length + 4 + metadata.length + 4 + bindings.length;
  const out = new Uint8Array(total);
  const view = new DataView(out.buffer);
  let off = 0;
  const u32 = (v: number): void => {
    view.setUint32(off, v, true);
    off += 4;
  };
  const block = (b: Uint8Array): void => {
    u32(b.length);
    out.set(b, off);
    off += b.length;
  };
  u32(0);
  block(pkg);
  block(permissions);
  block(metadata);
  block(bindings);
  return out;
}

const toB64 = (b: Uint8Array): string => btoa(String.fromCharCode(...b));

const SECTION = 'section Section1;\r\nshared Query1 = let Source = 1 + 1 in Source;';

describe("qdeff", () => {
  it("parses a DataMashup payload and finds Section1.m", () => {
    const dm = parseDataMashup(buildDataMashup(SECTION));
    expect(dm.version).toBe(0);
    expect(dm.sectionM).toBe(SECTION);
    expect(dm.permissionsXml).toContain("PermissionList");
  });

  it("strips a UTF-8 BOM from Section1.m", () => {
    const bom = "﻿" + SECTION;
    const dm = parseDataMashup(buildDataMashup(bom));
    expect(dm.sectionM).toBe(SECTION);
  });

  it("extracts from a workbook's customXml item", () => {
    const itemXml = `<?xml version="1.0"?><DataMashup xmlns="http://schemas.microsoft.com/DataMashup">${toB64(buildDataMashup(SECTION))}</DataMashup>`;
    const entries: Record<string, Uint8Array> = {
      "xl/workbook.xml": strToU8("<workbook/>"),
      "customXml/item1.xml": strToU8(itemXml),
    };
    const q = readWorkbookQueries(entries);
    expect(q).not.toBeNull();
    expect(q!.itemPath).toBe("customXml/item1.xml");
    expect(q!.mashup.sectionM).toBe(SECTION);
  });

  it("returns null for a workbook without queries", () => {
    expect(readWorkbookQueries({ "xl/workbook.xml": strToU8("<workbook/>") })).toBeNull();
  });

  it("rejects truncated payloads", () => {
    const good = buildDataMashup(SECTION);
    expect(() => parseDataMashup(good.subarray(0, 10))).toThrow(/truncated/);
  });
});
