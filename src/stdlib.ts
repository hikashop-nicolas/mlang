// Tier-0 standard library: the functions the spike query set needs, implemented from the
// public Microsoft Learn reference. Every function raises a precise "unsupported" error for
// argument shapes it doesn't cover yet, so gaps are visible rather than silently wrong.

import { Env } from "./interpret.js";
import { MError, NULL, err, expect, list, logical, number, rowRecord, table, text, type MFunction, type MValue } from "./values.js";

type Table = Extract<MValue, { kind: "table" }>;

const fn = (name: string, arity: { name: string; optional?: boolean }[], call: (args: MValue[]) => MValue): MFunction => ({
  kind: "function",
  name,
  params: arity.map((p) => ({ name: p.name, optional: !!p.optional })),
  call: (args) => {
    const required = arity.filter((p) => !p.optional).length;
    if (args.length < required) err("Expression.Error", `${name}: ${args.length} arguments passed, expected at least ${required}.`);
    return call(args);
  },
});

const asTable = (v: MValue, who: string): Table => expect(v, "table", who);
const textOf = (v: MValue, who: string): string => expect(v, "text", who).value;
const listOf = (v: MValue, who: string): MValue[] => expect(v, "list", who).items;
const callFn = (v: MValue, args: MValue[]): MValue => {
  if (v.kind !== "function") err("Expression.Error", "Expected a function value.");
  return v.call(args);
};
const truthy = (v: MValue): boolean => v.kind === "logical" && v.value;

/** {{a,b},{c,d}} pair lists used by RenameColumns/TransformColumnTypes. */
const pairList = (v: MValue, who: string): MValue[][] => {
  const items = listOf(v, who);
  if (items.length > 0 && items[0]!.kind !== "list") return [items]; // single {a,b} pair
  return items.map((p) => listOf(p, who));
};

export function registerStdlib(env: Env): void {
  const def = (name: string, v: MValue): void => env.defineValue(name, v);

  // Enum-ish constants (numbers, per the reference).
  def("Order.Ascending", number(0));
  def("Order.Descending", number(1));
  def("MissingField.Error", number(0));
  def("MissingField.Ignore", number(1));
  def("MissingField.UseNull", number(2));

  // #table(columns, rows) - Tier 0 accepts a list of column names (type-spec form later).
  def("#table", fn("#table", [{ name: "columns" }, { name: "rows" }], (a) => {
    const cols = listOf(a[0]!, "#table columns").map((c) => textOf(c, "#table column name"));
    const rows = listOf(a[1]!, "#table rows").map((r) => listOf(r, "#table row"));
    for (const r of rows) if (r.length !== cols.length) err("Expression.Error", "#table: row width differs from column count.");
    return table(cols, rows);
  }));

  // --- Table.* ---------------------------------------------------------------
  def("Table.RowCount", fn("Table.RowCount", [{ name: "table" }], (a) => number(asTable(a[0]!, "Table.RowCount").rows.length)));
  def("Table.ColumnNames", fn("Table.ColumnNames", [{ name: "table" }], (a) => list(asTable(a[0]!, "Table.ColumnNames").columns.map(text))));

  def("Table.SelectRows", fn("Table.SelectRows", [{ name: "table" }, { name: "condition" }], (a) => {
    const t = asTable(a[0]!, "Table.SelectRows");
    const keep: MValue[][] = [];
    for (let i = 0; i < t.rows.length; i++) if (truthy(callFn(a[1]!, [rowRecord(t, i)]))) keep.push(t.rows[i]!);
    return table(t.columns, keep, t.types);
  }));

  def("Table.SelectColumns", fn("Table.SelectColumns", [{ name: "table" }, { name: "columns" }, { name: "missingField", optional: true }], (a) => {
    const t = asTable(a[0]!, "Table.SelectColumns");
    const wanted = (a[1]!.kind === "list" ? a[1]!.items : [a[1]!]).map((c) => textOf(c, "column name"));
    const idx = wanted.map((c) => {
      const i = t.columns.indexOf(c);
      if (i < 0) err("Expression.Error", `The column '${c}' of the table wasn't found.`);
      return i;
    });
    return table(wanted, t.rows.map((r) => idx.map((i) => r[i] ?? NULL)));
  }));

  def("Table.RemoveColumns", fn("Table.RemoveColumns", [{ name: "table" }, { name: "columns" }], (a) => {
    const t = asTable(a[0]!, "Table.RemoveColumns");
    const drop = new Set((a[1]!.kind === "list" ? a[1]!.items : [a[1]!]).map((c) => textOf(c, "column name")));
    for (const c of drop) if (!t.columns.includes(c)) err("Expression.Error", `The column '${c}' of the table wasn't found.`);
    const keep = t.columns.map((c, i) => [c, i] as const).filter(([c]) => !drop.has(c));
    return table(keep.map(([c]) => c), t.rows.map((r) => keep.map(([, i]) => r[i] ?? NULL)));
  }));

  def("Table.RenameColumns", fn("Table.RenameColumns", [{ name: "table" }, { name: "renames" }], (a) => {
    const t = asTable(a[0]!, "Table.RenameColumns");
    const cols = [...t.columns];
    for (const [from, to] of pairList(a[1]!, "Table.RenameColumns")) {
      const i = cols.indexOf(textOf(from!, "rename"));
      if (i < 0) err("Expression.Error", `The column '${textOf(from!, "rename")}' of the table wasn't found.`);
      cols[i] = textOf(to!, "rename");
    }
    return table(cols, t.rows, t.types);
  }));

  def("Table.TransformColumnTypes", fn("Table.TransformColumnTypes", [{ name: "table" }, { name: "transforms" }], (a) => {
    const t = asTable(a[0]!, "Table.TransformColumnTypes");
    const types = new Map(t.types ?? []);
    const rows = t.rows.map((r) => [...r]);
    for (const [colV, typeV] of pairList(a[1]!, "Table.TransformColumnTypes")) {
      const col = textOf(colV!, "transform column");
      const ci = t.columns.indexOf(col);
      if (ci < 0) err("Expression.Error", `The column '${col}' of the table wasn't found.`);
      const ty = typeV!.kind === "type" ? typeV!.name : err("Expression.Error", "Expected a type value.");
      types.set(col, ty);
      for (const r of rows) r[ci] = convertTo(r[ci] ?? NULL, ty, col);
    }
    return table(t.columns, rows, types);
  }));

  def("Table.AddColumn", fn("Table.AddColumn", [{ name: "table" }, { name: "newColumnName" }, { name: "columnGenerator" }, { name: "columnType", optional: true }], (a) => {
    const t = asTable(a[0]!, "Table.AddColumn");
    const name = textOf(a[1]!, "Table.AddColumn name");
    if (t.columns.includes(name)) err("Expression.Error", `A column named '${name}' already exists.`);
    const rows = t.rows.map((r, i) => {
      let v: MValue;
      try {
        v = callFn(a[2]!, [rowRecord(t, i)]);
      } catch (e) {
        if (!(e instanceof MError)) throw e;
        v = NULL; // Excel surfaces per-cell errors; Tier 0 stores null (FIDELITY: cell errors)
      }
      return [...r, v];
    });
    return table([...t.columns, name], rows, t.types);
  }));

  def("Table.Sort", fn("Table.Sort", [{ name: "table" }, { name: "comparisonCriteria" }], (a) => {
    const t = asTable(a[0]!, "Table.Sort");
    const crit = (a[1]!.kind === "list" ? a[1]!.items : [a[1]!]).map((c) => {
      if (c.kind === "text") return { ci: colIndex(t, c.value), desc: false };
      if (c.kind === "list" && c.items.length === 2) {
        const col = textOf(c.items[0]!, "sort column");
        const ord = expect(c.items[1]!, "number", "sort order").value;
        return { ci: colIndex(t, col), desc: ord === 1 };
      }
      err("Expression.Error", "Table.Sort: unsupported criteria shape (use column names or {name, Order.*}).");
    });
    const rows = [...t.rows].map((r, i) => ({ r, i }));
    rows.sort((x, y) => {
      for (const { ci, desc } of crit) {
        const av = x.r[ci] ?? NULL;
        const bv = y.r[ci] ?? NULL;
        if (av.kind === "null" && bv.kind === "null") continue;
        if (av.kind === "null") return desc ? 1 : -1; // nulls sort first ascending (FIDELITY: oracle-check)
        if (bv.kind === "null") return desc ? -1 : 1;
        const c = cmpForSort(av, bv);
        if (c !== 0) return desc ? -c : c;
      }
      return x.i - y.i; // stable
    });
    return table(t.columns, rows.map((x) => x.r), t.types);
  }));

  def("Table.FirstN", fn("Table.FirstN", [{ name: "table" }, { name: "countOrCondition" }], (a) => {
    const t = asTable(a[0]!, "Table.FirstN");
    if (a[1]!.kind === "number") return table(t.columns, t.rows.slice(0, a[1]!.value), t.types);
    const keep: MValue[][] = [];
    for (let i = 0; i < t.rows.length; i++) {
      if (!truthy(callFn(a[1]!, [rowRecord(t, i)]))) break;
      keep.push(t.rows[i]!);
    }
    return table(t.columns, keep, t.types);
  }));

  // --- List.* / Text.* / Number.* ---------------------------------------------
  def("List.Count", fn("List.Count", [{ name: "list" }], (a) => number(listOf(a[0]!, "List.Count").length)));
  def("List.Sum", fn("List.Sum", [{ name: "list" }], (a) => {
    let sum = 0;
    let any = false;
    for (const v of listOf(a[0]!, "List.Sum")) {
      if (v.kind === "null") continue;
      sum += expect(v, "number", "List.Sum").value;
      any = true;
    }
    return any ? number(sum) : NULL;
  }));
  def("List.Transform", fn("List.Transform", [{ name: "list" }, { name: "transform" }], (a) =>
    list(listOf(a[0]!, "List.Transform").map((v) => callFn(a[1]!, [v])))));

  def("Text.From", fn("Text.From", [{ name: "value" }, { name: "culture", optional: true }], (a) => {
    const v = a[0]!;
    if (v.kind === "null") return NULL;
    if (v.kind === "text") return v;
    if (v.kind === "number") return text(numToText(v.value));
    if (v.kind === "logical") return text(v.value ? "TRUE" : "FALSE");
    err("Expression.Error", `Text.From: cannot convert ${v.kind}.`);
  }));
  def("Text.Upper", fn("Text.Upper", [{ name: "text" }], (a) => (a[0]!.kind === "null" ? NULL : text(textOf(a[0]!, "Text.Upper").toUpperCase()))));
  def("Text.Lower", fn("Text.Lower", [{ name: "text" }], (a) => (a[0]!.kind === "null" ? NULL : text(textOf(a[0]!, "Text.Lower").toLowerCase()))));

  def("Number.From", fn("Number.From", [{ name: "value" }, { name: "culture", optional: true }], (a) => numberFrom(a[0]!)));

  // Error constructor used by generated queries.
  def("Error.Record", fn("Error.Record", [{ name: "reason" }, { name: "message", optional: true }, { name: "detail", optional: true }], (a) => {
    const fields = new Map<string, MValue>();
    fields.set("Reason", a[0] ?? NULL);
    fields.set("Message", a[1] ?? NULL);
    fields.set("Detail", a[2] ?? NULL);
    return { kind: "record", fields };
  }));
}

const colIndex = (t: Table, c: string): number => {
  const i = t.columns.indexOf(c);
  if (i < 0) err("Expression.Error", `The column '${c}' of the table wasn't found.`);
  return i;
};

const cmpForSort = (a: MValue, b: MValue): number => {
  if (a.kind === "number" && b.kind === "number") return a.value - b.value;
  if (a.kind === "text" && b.kind === "text") return a.value < b.value ? -1 : a.value > b.value ? 1 : 0;
  if (a.kind === "logical" && b.kind === "logical") return Number(a.value) - Number(b.value);
  err("Expression.Error", `Cannot sort ${a.kind} against ${b.kind}.`);
};

function numberFrom(v: MValue): MValue {
  if (v.kind === "null") return NULL;
  if (v.kind === "number") return v;
  if (v.kind === "logical") return number(v.value ? 1 : 0);
  if (v.kind === "text") {
    const t = v.value.trim();
    const n = Number(t.replace(/,/g, "")); // FIDELITY: culture-aware parsing later
    if (t === "" || Number.isNaN(n)) err("Expression.Error", `Number.From: cannot convert "${v.value}" to a number.`);
    return number(n);
  }
  err("Expression.Error", `Number.From: cannot convert ${v.kind}.`);
}

const numToText = (n: number): string => String(n);

function convertTo(v: MValue, ty: string, col: string): MValue {
  if (v.kind === "null") return NULL;
  switch (ty) {
    case "number": return numberFrom(v);
    case "text": return v.kind === "text" ? v : v.kind === "number" ? text(numToText(v.value)) : v.kind === "logical" ? text(v.value ? "TRUE" : "FALSE") : err("Expression.Error", `Cannot convert column '${col}' to text.`);
    case "logical":
      if (v.kind === "logical") return v;
      if (v.kind === "number") return logical(v.value !== 0);
      if (v.kind === "text") return v.value.toLowerCase() === "true" ? logical(true) : v.value.toLowerCase() === "false" ? logical(false) : err("Expression.Error", `Cannot convert '${v.value}' to logical.`);
      err("Expression.Error", `Cannot convert column '${col}' to logical.`);
      break;
    case "any": return v;
    default:
      err("Expression.Error", `mlang: column type '${ty}' not supported yet (column '${col}').`);
  }
  return v;
}
