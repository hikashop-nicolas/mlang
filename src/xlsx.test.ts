import { strToU8, zipSync } from "fflate";
import { describe, expect, it } from "vitest";
import { evaluate, toJS, type MValue } from "./index.js";
import { binary } from "./values.js";

// Build a minimal 2-sheet xlsx: Sales (shared strings + numbers) and an empty Hidden sheet.
function buildXlsx(): Uint8Array {
  const files: Record<string, Uint8Array> = {
    "[Content_Types].xml": strToU8(
      '<?xml version="1.0"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">' +
        '<Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>' +
        '<Default Extension="xml" ContentType="application/xml"/>' +
        '<Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/>' +
        '<Override PartName="/xl/worksheets/sheet1.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>' +
        '<Override PartName="/xl/worksheets/sheet2.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>' +
        '<Override PartName="/xl/sharedStrings.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sharedStrings+xml"/></Types>',
    ),
    "_rels/.rels": strToU8('<?xml version="1.0"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/></Relationships>'),
    "xl/workbook.xml": strToU8(
      '<?xml version="1.0"?><workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships">' +
        '<sheets><sheet name="Sales" sheetId="1" r:id="rId1"/><sheet name="Hidden" sheetId="2" state="hidden" r:id="rId2"/></sheets></workbook>',
    ),
    "xl/_rels/workbook.xml.rels": strToU8(
      '<?xml version="1.0"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">' +
        '<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet1.xml"/>' +
        '<Relationship Id="rId2" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet2.xml"/>' +
        '<Relationship Id="rId3" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/sharedStrings" Target="sharedStrings.xml"/></Relationships>',
    ),
    "xl/sharedStrings.xml": strToU8('<?xml version="1.0"?><sst xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><si><t>Product</t></si><si><t>Qty</t></si><si><t>Apples</t></si></sst>'),
    "xl/worksheets/sheet1.xml": strToU8(
      '<?xml version="1.0"?><worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><sheetData>' +
        '<row r="1"><c r="A1" t="s"><v>0</v></c><c r="B1" t="s"><v>1</v></c></row>' +
        '<row r="2"><c r="A2" t="s"><v>2</v></c><c r="B2"><v>10</v></c></row>' +
        "</sheetData></worksheet>",
    ),
    "xl/worksheets/sheet2.xml": strToU8('<?xml version="1.0"?><worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><sheetData/></worksheet>'),
  };
  return zipSync(files);
}

const wbBinary = (): MValue => binary(buildXlsx());
type T = { columns: string[]; rows: unknown[][] };

describe("Excel.Workbook", () => {
  it("returns the navigation table over sheets", async () => {
    const nav = (await evaluate("Excel.Workbook(wb)", { wb: wbBinary() })) as Extract<MValue, { kind: "table" }>;
    expect(nav.columns).toEqual(["Name", "Data", "Item", "Kind", "Hidden"]);
    expect(nav.rows.map((r) => toJS(r[0]!))).toEqual(["Sales", "Hidden"]);
    expect(nav.rows.map((r) => toJS(r[4]!))).toEqual([false, true]);
    expect(nav.rows.map((r) => toJS(r[3]!))).toEqual(["Sheet", "Sheet"]);
  });

  it("navigates to a sheet's Data and promotes headers", async () => {
    const m = `let
      Book = Excel.Workbook(wb),
      Sales = Book{[Item = "Sales"]}[Data],
      Promoted = Table.PromoteHeaders(Sales),
      Typed = Table.TransformColumnTypes(Promoted, {{"Qty", type number}})
    in Typed`;
    const out = toJS(await evaluate(m, { wb: wbBinary() })) as T;
    expect(out.columns).toEqual(["Product", "Qty"]);
    expect(out.rows).toEqual([["Apples", 10]]);
  });

  it("raw Data grid uses Column1..N and preserves cell types", async () => {
    const out = toJS(await evaluate(`Excel.Workbook(wb){[Item="Sales"]}[Data]`, { wb: wbBinary() })) as T;
    expect(out.columns).toEqual(["Column1", "Column2"]);
    expect(out.rows).toEqual([["Product", "Qty"], ["Apples", 10]]);
  });

  it("composes with a host File.Contents connector", async () => {
    const bytes = buildXlsx();
    const fileContents: MValue = {
      kind: "function",
      name: "File.Contents",
      params: [{ name: "path", optional: false }],
      call: () => binary(bytes),
    };
    const m = `Table.RowCount(Excel.Workbook(File.Contents("book.xlsx")))`;
    expect(toJS(await evaluate(m, { "File.Contents": fileContents }))).toBe(2);
  });

  it("rejects a non-binary argument", async () => {
    await expect(evaluate(`Excel.Workbook("not a binary")`)).rejects.toThrow(/expected a binary/);
  });
});
