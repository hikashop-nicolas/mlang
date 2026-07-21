// Excel.Workbook: parse a workbook BINARY (already in memory) into the standard navigation
// table [Name, Data, Item, Kind, Hidden], one row per sheet, Data being the sheet grid as a
// nested table. Pure - the bytes come from a host connector (File.Contents) or Binary.*.
import type { Env } from "../interpret.js";
import { NULL, err, logical, table, text, type MValue } from "../values.js";
import { fn } from "./helpers.js";
import { readXlsx } from "../xlsx.js";

export function registerWorkbook(env: Env): void {
  const def = (name: string, v: MValue): void => env.defineValue(name, v);

  def("Excel.Workbook", fn("Excel.Workbook", [{ name: "workbook" }, { name: "useHeaders", optional: true }, { name: "delayTypes", optional: true }], (a) => {
    if (a[0]!.kind !== "binary") err("Expression.Error", "Excel.Workbook: expected a binary (e.g. from File.Contents).");
    const useHeaders = a[1]?.kind === "logical" ? a[1].value : false;
    const sheets = readXlsx(a[0]!.bytes);
    const rows: MValue[][] = sheets.map((s) => {
      const data = sheetTable(s.rows, useHeaders);
      return [text(s.name), data, text(s.name), text("Sheet"), logical(s.hidden)];
    });
    return table(["Name", "Data", "Item", "Kind", "Hidden"], rows);
  }));
}

/** Grid -> nested table. Default columns are Column1..N; useHeaders promotes the first row. */
function sheetTable(grid: MValue[][], useHeaders: boolean): MValue {
  if (grid.length === 0) return table([], []);
  const width = grid[0]!.length;
  if (useHeaders) {
    const header = grid[0]!;
    const used = new Set<string>();
    const columns = header.map((v, i) => {
      let name = v.kind === "text" ? v.value : v.kind === "number" ? String(v.value) : `Column${i + 1}`;
      if (name === "") name = `Column${i + 1}`;
      let cand = name;
      let n = 1;
      while (used.has(cand)) cand = `${name}_${n++}`;
      used.add(cand);
      return cand;
    });
    return table(columns, grid.slice(1).map((r) => pad(r, width)));
  }
  const columns = Array.from({ length: width }, (_, i) => `Column${i + 1}`);
  return table(columns, grid.map((r) => pad(r, width)));
}

const pad = (r: MValue[], width: number): MValue[] => Array.from({ length: width }, (_, i) => r[i] ?? NULL);
