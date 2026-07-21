// Xml.Document / Xml.Tables / Html.Table - pure parsers over in-memory text or binary.
import type { Env } from "../interpret.js";
import { NULL, err, table, text, type MValue } from "../values.js";
import { fn, textOf } from "./helpers.js";
import { findAll, innerText, parseXml, type XmlNode } from "../xml.js";

const sourceText = (v: MValue, who: string): string => {
  if (v.kind === "text") return v.value;
  if (v.kind === "binary") return new TextDecoder("utf-8").decode(v.bytes);
  err("Expression.Error", `${who}: expected a text or binary source.`);
};

/** Xml.Document shape: table [Name, Namespace, Value, Attributes] recursively (Value is a
    nested table for element children, or text for a leaf). A pragmatic subset of the real
    shape - enough to navigate and extract element data. */
function elementRow(node: XmlNode): MValue[] {
  const kids = node.children;
  const attrs = Object.keys(node.attrs).length
    ? table(["Name", "Value"], Object.entries(node.attrs).map(([k, v]) => [text(k), text(v)]))
    : NULL;
  const value: MValue = kids.length ? xmlTable(kids) : text(node.text.trim());
  return [text(node.name), text(""), value, attrs];
}

function xmlTable(nodes: XmlNode[]): MValue {
  return table(["Name", "Namespace", "Value", "Attributes"], nodes.map(elementRow));
}

export function registerXml(env: Env): void {
  const def = (name: string, v: MValue): void => env.defineValue(name, v);

  def("Xml.Document", fn("Xml.Document", [{ name: "contents" }, { name: "options", optional: true }], (a) => {
    const root = parseXml(sourceText(a[0]!, "Xml.Document"));
    return xmlTable(root.children);
  }));

  // Xml.Tables: a table [Name, Table] with one row per repeated-element group (the nested
  // Table holds that element's instances). Shape oracle-confirmed. Tier-1 targets the common
  // "list of records" XML (repeated <row>/<item>).
  def("Xml.Tables", fn("Xml.Tables", [{ name: "contents" }, { name: "options", optional: true }], (a) => {
    const root = parseXml(sourceText(a[0]!, "Xml.Tables"));
    const groups = repeatedGroups(root);
    return table(["Name", "Table"], groups.map((g) => [text(g[0]!.name), recordsToTable(g)]));
  }));

  // Html.Table(html, columnNameSelectorPairs, options): rowSelector defaults to table rows.
  // Tier-1 supports the common shapes: no selector (first <table>) or {name, "td:nth-child(k)"}.
  def("Html.Table", fn("Html.Table", [{ name: "html" }, { name: "columnNameSelectorPairs", optional: true }, { name: "options", optional: true }], (a) => {
    const root = parseXml(sourceText(a[0]!, "Html.Table"), true);
    const tables = findAll(root, "table");
    if (tables.length === 0) err("Expression.Error", "Html.Table: no <table> found.");
    const rowsEl = findAll(tables[0]!, "tr");
    const grid = rowsEl.map((tr) => [...findAll(tr, "th"), ...findAll(tr, "td")].map((c) => innerText(c)));
    const spec = a[1];
    if (spec && spec.kind === "list") {
      const cols = spec.items.map((p) => (p.kind === "list" ? textOf(p.items[0]!, "column name") : textOf(p, "column name")));
      const idx = spec.items.map((p) => {
        const sel = p.kind === "list" ? (p.items[1]?.kind === "text" ? p.items[1].value : "") : "";
        const m = /nth-child\((\d+)\)/.exec(sel);
        return m ? Number(m[1]) - 1 : -1;
      });
      const dataRows = grid.map((r) => idx.map((i) => text(i >= 0 ? (r[i] ?? "") : "")));
      return table(cols, dataRows);
    }
    // Default: Column1..N over the widest row.
    const width = grid.reduce((w, r) => Math.max(w, r.length), 0);
    const columns = Array.from({ length: width }, (_, i) => `Column${i + 1}`);
    return table(columns, grid.map((r) => Array.from({ length: width }, (_, i) => text(r[i] ?? ""))));
  }));
}

/** Find sets of >=2 same-named sibling elements (the repeated records in the doc). */
function repeatedGroups(root: XmlNode): XmlNode[][] {
  const out: XmlNode[][] = [];
  const walk = (n: XmlNode): void => {
    const byName = new Map<string, XmlNode[]>();
    for (const c of n.children) (byName.get(c.name) ?? byName.set(c.name, []).get(c.name)!).push(c);
    for (const group of byName.values()) if (group.length >= 2 && group.some((g) => g.children.length > 0)) out.push(group);
    for (const c of n.children) walk(c);
  };
  walk(root);
  return out;
}

/** A repeated group -> a table: columns are the union of child element names. */
function recordsToTable(group: XmlNode[]): MValue {
  const columns: string[] = [];
  for (const rec of group) for (const c of rec.children) if (!columns.includes(c.name)) columns.push(c.name);
  const rows = group.map((rec) => {
    const byName = new Map<string, string>();
    for (const c of rec.children) byName.set(c.name, c.text.trim());
    return columns.map((col) => (byName.has(col) ? text(byName.get(col)!) : NULL));
  });
  return table(columns, rows);
}
