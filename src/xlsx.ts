// Minimal xlsx reader for Excel.Workbook: unzip, read shared strings, and turn each sheet's
// used range into a grid of M values. Pure (operates on bytes already in memory); no host
// I/O. XML is scanned with focused regexes over the small, well-known OOXML shapes rather
// than a full DOM, to stay dependency-light and browser-portable.
import { strFromU8, unzipSync } from "fflate";
import { NULL, logical, number, text, type MValue } from "./values.js";

export interface SheetGrid {
  name: string;
  hidden: boolean;
  rows: MValue[][];
}

const A = "A".charCodeAt(0);

/** "AB12" -> zero-based column index (11). */
function colFromRef(ref: string): number {
  const m = /^([A-Z]+)/.exec(ref);
  if (!m) return 0;
  let col = 0;
  for (const ch of m[1]!) col = col * 26 + (ch.charCodeAt(0) - A + 1);
  return col - 1;
}

function decodeXmlEntities(s: string): string {
  return s
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&#x([0-9A-Fa-f]+);/g, (_, h) => String.fromCodePoint(parseInt(h, 16)))
    .replace(/&#(\d+);/g, (_, d) => String.fromCodePoint(Number(d)))
    .replace(/&amp;/g, "&");
}

/** Concatenate the <t> runs inside a shared-string or inline-string element. */
function textRuns(xml: string): string {
  let out = "";
  const re = /<t[^>]*>([\s\S]*?)<\/t>|<t\s*\/>/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(xml))) out += m[1] !== undefined ? decodeXmlEntities(m[1]) : "";
  return out;
}

function parseSharedStrings(entries: Record<string, Uint8Array>): string[] {
  const data = entries["xl/sharedStrings.xml"];
  if (!data) return [];
  const xml = strFromU8(data);
  const out: string[] = [];
  const re = /<si>([\s\S]*?)<\/si>/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(xml))) out.push(textRuns(m[1]!));
  return out;
}

/** Map r:id -> worksheet part path via xl/_rels/workbook.xml.rels. */
function sheetTargets(entries: Record<string, Uint8Array>): Record<string, string> {
  const rels = entries["xl/_rels/workbook.xml.rels"];
  const out: Record<string, string> = {};
  if (!rels) return out;
  const xml = strFromU8(rels);
  const re = /<Relationship\b[^>]*\/?>/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(xml))) {
    const id = /Id="([^"]+)"/.exec(m[0])?.[1];
    const target = /Target="([^"]+)"/.exec(m[0])?.[1];
    if (id && target) out[id] = target.replace(/^\//, "").replace(/^(\.\.\/|xl\/)?/, "xl/").replace(/^xl\/xl\//, "xl/");
  }
  return out;
}

function attr(tag: string, name: string): string | undefined {
  return new RegExp(`${name}="([^"]*)"`).exec(tag)?.[1];
}

/** Parse one worksheet's <sheetData> into a rectangular grid of M values. */
function parseSheet(xml: string, shared: string[]): MValue[][] {
  const rowsRaw: { r: number; cells: { c: number; v: MValue }[] }[] = [];
  let maxCol = -1;
  const rowRe = /<row\b([^>]*)>([\s\S]*?)<\/row>/g;
  let rm: RegExpExecArray | null;
  while ((rm = rowRe.exec(xml))) {
    const rIdx = Number(attr(rm[1]!, "r") ?? rowsRaw.length + 1) - 1;
    const cells: { c: number; v: MValue }[] = [];
    const cellRe = /<c\b([^>]*?)(?:\/>|>([\s\S]*?)<\/c>)/g;
    let cm: RegExpExecArray | null;
    while ((cm = cellRe.exec(rm[2]!))) {
      const ctag = cm[1]!;
      const body = cm[2] ?? "";
      const ref = attr(ctag, "r");
      const ci = ref ? colFromRef(ref) : cells.length;
      const t = attr(ctag, "t");
      const v = cellValue(t, body, shared);
      cells.push({ c: ci, v });
      if (ci > maxCol) maxCol = ci;
    }
    rowsRaw.push({ r: rIdx, cells });
  }
  if (rowsRaw.length === 0) return [];
  const maxRow = Math.max(...rowsRaw.map((r) => r.r));
  const width = maxCol + 1;
  const grid: MValue[][] = Array.from({ length: maxRow + 1 }, () => Array.from({ length: width }, () => NULL));
  for (const row of rowsRaw) for (const cell of row.cells) if (cell.c < width) grid[row.r]![cell.c] = cell.v;
  return grid;
}

function cellValue(t: string | undefined, body: string, shared: string[]): MValue {
  if (t === "s") {
    const idx = Number(/<v>([\s\S]*?)<\/v>/.exec(body)?.[1] ?? "0");
    return text(shared[idx] ?? "");
  }
  if (t === "inlineStr") return text(textRuns(body));
  if (t === "str") return text(decodeXmlEntities(/<v>([\s\S]*?)<\/v>/.exec(body)?.[1] ?? ""));
  if (t === "b") return logical(/<v>([\s\S]*?)<\/v>/.exec(body)?.[1] === "1");
  const raw = /<v>([\s\S]*?)<\/v>/.exec(body)?.[1];
  if (raw === undefined || raw === "") return NULL;
  return number(Number(raw));
}

/** Read an xlsx binary into its sheets (in workbook order). */
export function readXlsx(bytes: Uint8Array): SheetGrid[] {
  const entries = unzipSync(bytes);
  const shared = parseSharedStrings(entries);
  const targets = sheetTargets(entries);
  const wb = entries["xl/workbook.xml"];
  if (!wb) return [];
  const wbXml = strFromU8(wb);
  const out: SheetGrid[] = [];
  const re = /<sheet\b[^>]*\/?>/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(wbXml))) {
    const name = decodeXmlEntities(attr(m[0], "name") ?? "");
    const hidden = (attr(m[0], "state") ?? "") === "hidden";
    const rid = /r:id="([^"]+)"/.exec(m[0])?.[1];
    const path = rid ? targets[rid] : undefined;
    const data = path ? entries[path] : undefined;
    const rows = data ? parseSheet(strFromU8(data), shared) : [];
    out.push({ name, hidden, rows });
  }
  return out;
}
