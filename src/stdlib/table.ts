// Table.* functions, implemented from the public reference. Argument shapes not covered
// yet raise precise "unsupported" errors rather than approximating.
import type { Env } from "../interpret.js";
import { MError, NULL, equals as equalsCell, err, errorValue, expect, list, logical, number, rowRecord, table, text, type MType, type MValue } from "../values.js";
import { asTable, callFn, cmpWithNulls, colIndex, colNamesFromSpec, fn, keyOf, listOf, namesOf, pairList, subTable, textOf, truthy, type Table } from "./helpers.js";
import { convertTo, textFrom } from "./convert.js";
import { typeName } from "../types.js";

const rowsWhere = (t: Table, pred: (i: number) => boolean): number[] => {
  const out: number[] = [];
  for (let i = 0; i < t.rows.length; i++) if (pred(i)) out.push(i);
  return out;
};

/** Key tuple string for row i over the given column indexes. */
const rowKey = (t: Table, i: number, cols: number[]): string => JSON.stringify(cols.map((c) => keyOf(t.rows[i]![c] ?? NULL)));

export function registerTable(env: Env): void {
  const def = (name: string, v: MValue): void => env.defineValue(name, v);

  // #table(columns, rows) - a list of names, or a "type table [A = t, ...]" spec.
  def("#table", fn("#table", [{ name: "columns" }, { name: "rows" }], (a) => {
    let cols: string[];
    if (a[0]!.kind === "list") cols = a[0]!.items.map((c) => textOf(c, "#table column name"));
    else if (a[0]!.kind === "number") cols = Array.from({ length: a[0]!.value }, (_, i) => `Column${i + 1}`);
    else if (a[0]!.kind === "type" && a[0]!.name === "table" && a[0]!.columns) cols = a[0]!.columns.map((c) => c.name);
    else err("Expression.Error", "#table: unsupported column spec (use a list of names or a column count).");
    const rows = listOf(a[1]!, "#table rows").map((r) => listOf(r, "#table row"));
    for (const r of rows) if (r.length !== cols.length) err("Expression.Error", "#table: row width differs from column count.");
    return table(cols, rows);
  }));

  def("Table.RowCount", fn("Table.RowCount", [{ name: "table" }], (a) => number(asTable(a[0]!, "Table.RowCount").rows.length)));
  def("Table.ColumnCount", fn("Table.ColumnCount", [{ name: "table" }], (a) => number(asTable(a[0]!, "Table.ColumnCount").columns.length)));
  def("Table.ColumnNames", fn("Table.ColumnNames", [{ name: "table" }], (a) => list(asTable(a[0]!, "Table.ColumnNames").columns.map(text))));
  def("Table.Column", fn("Table.Column", [{ name: "table" }, { name: "column" }], (a) => {
    const t = asTable(a[0]!, "Table.Column");
    const ci = colIndex(t, textOf(a[1]!, "Table.Column"));
    return list(t.rows.map((r) => r[ci] ?? NULL));
  }));
  def("Table.TransformColumnNames", fn("Table.TransformColumnNames", [{ name: "table" }, { name: "nameGenerator" }], (a) => {
    const t = asTable(a[0]!, "Table.TransformColumnNames");
    return table(t.columns.map((c) => textOf(callFn(a[1]!, [text(c)]), "new column name")), t.rows, t.types);
  }));
  def("Table.PrefixColumns", fn("Table.PrefixColumns", [{ name: "table" }, { name: "prefix" }], (a) => {
    const t = asTable(a[0]!, "Table.PrefixColumns");
    const p = textOf(a[1]!, "prefix");
    return table(t.columns.map((c) => `${p}.${c}`), t.rows, t.types);
  }));
  def("Table.DuplicateColumn", fn("Table.DuplicateColumn", [{ name: "table" }, { name: "column" }, { name: "newColumnName" }, { name: "columnType", optional: true }], (a) => {
    const t = asTable(a[0]!, "Table.DuplicateColumn");
    const ci = colIndex(t, textOf(a[1]!, "column"));
    const name = textOf(a[2]!, "new column name");
    if (t.columns.includes(name)) err("Expression.Error", `A column named '${name}' already exists.`);
    return table([...t.columns, name], t.rows.map((r) => [...r, r[ci] ?? NULL]), t.types);
  }));
  def("Table.ReorderColumns", fn("Table.ReorderColumns", [{ name: "table" }, { name: "columnOrder" }, { name: "missingField", optional: true }], (a) => {
    const t = asTable(a[0]!, "Table.ReorderColumns");
    const order = namesOf(a[1]!, "column");
    for (const c of order) colIndex(t, c);
    const rest = t.columns.filter((c) => !order.includes(c)); // lenient: append any not listed
    const cols = [...order, ...rest];
    const idx = cols.map((c) => t.columns.indexOf(c));
    return table(cols, t.rows.map((r) => idx.map((i) => r[i] ?? NULL)));
  }));
  def("Table.ToRecords", fn("Table.ToRecords", [{ name: "table" }], (a) => {
    const t = asTable(a[0]!, "Table.ToRecords");
    return list(t.rows.map((_, i) => rowRecord(t, i)));
  }));
  def("Table.Repeat", fn("Table.Repeat", [{ name: "table" }, { name: "count" }], (a) => {
    const t = asTable(a[0]!, "Table.Repeat");
    const n = typeof (a[1] as { value?: number }).value === "number" ? (a[1] as { value: number }).value : 0;
    const rows: MValue[][] = [];
    for (let i = 0; i < n; i++) rows.push(...t.rows.map((r) => [...r]));
    return table(t.columns, rows, t.types);
  }));
  def("Table.Split", fn("Table.Split", [{ name: "table" }, { name: "pageSize" }], (a) => {
    const t = asTable(a[0]!, "Table.Split");
    const size = Math.max(1, (a[1] as { value?: number }).value ?? 1);
    const pages: MValue[] = [];
    for (let i = 0; i < t.rows.length; i += size) pages.push(table(t.columns, t.rows.slice(i, i + size), t.types));
    return list(pages);
  }));
  def("Table.Partition", fn("Table.Partition", [{ name: "table" }, { name: "column" }, { name: "groups" }, { name: "hashFunction" }], (a) => {
    const t = asTable(a[0]!, "Table.Partition");
    const ci = colIndex(t, textOf(a[1]!, "column"));
    const groups = (a[2] as { value?: number }).value ?? 1;
    const buckets: MValue[][][] = Array.from({ length: groups }, () => []);
    for (const r of t.rows) {
      const h = callFn(a[3]!, [r[ci] ?? NULL]);
      const idx = ((h.kind === "number" ? Math.trunc(h.value) : 0) % groups + groups) % groups;
      buckets[idx]!.push(r);
    }
    return list(buckets.map((rows) => table(t.columns, rows, t.types)));
  }));
  def("Table.Transpose", fn("Table.Transpose", [{ name: "table" }, { name: "columns", optional: true }], (a) => {
    const t = asTable(a[0]!, "Table.Transpose");
    const width = t.rows.length;
    const columns = a[1] ? namesOf(a[1], "column") : Array.from({ length: width }, (_, i) => `Column${i + 1}`);
    const rows = t.columns.map((_, ci) => t.rows.map((r) => r[ci] ?? NULL));
    return table(columns, rows);
  }));
  def("Table.TransformRows", fn("Table.TransformRows", [{ name: "table" }, { name: "transform" }], (a) => {
    const t = asTable(a[0]!, "Table.TransformRows");
    return list(t.rows.map((_, i) => callFn(a[1]!, [rowRecord(t, i)])));
  }));
  def("Table.ExpandListColumn", fn("Table.ExpandListColumn", [{ name: "table" }, { name: "column" }], (a) => {
    const t = asTable(a[0]!, "Table.ExpandListColumn");
    const ci = colIndex(t, textOf(a[1]!, "column"));
    const rows: MValue[][] = [];
    for (const r of t.rows) {
      const cell = r[ci] ?? NULL;
      const items = cell.kind === "list" ? cell.items : [cell];
      if (items.length === 0) rows.push([...r.slice(0, ci), NULL, ...r.slice(ci + 1)]);
      else for (const it of items) rows.push([...r.slice(0, ci), it, ...r.slice(ci + 1)]);
    }
    return table(t.columns, rows, t.types);
  }));
  def("Table.CombineColumns", fn("Table.CombineColumns", [{ name: "table" }, { name: "sourceColumns" }, { name: "combiner" }, { name: "column" }], (a) => {
    const t = asTable(a[0]!, "Table.CombineColumns");
    const srcIdx = namesOf(a[1]!, "column").map((c) => colIndex(t, c));
    const newName = textOf(a[3]!, "new column name");
    const srcSet = new Set(srcIdx);
    const firstSrc = Math.min(...srcIdx);
    // The combined column takes the position of the first source column (oracle-confirmed).
    const columns: string[] = [];
    for (let i = 0; i < t.columns.length; i++) {
      if (i === firstSrc) columns.push(newName);
      if (!srcSet.has(i)) columns.push(t.columns[i]!);
    }
    const rows = t.rows.map((r) => {
      const combined = callFn(a[2]!, [list(srcIdx.map((i) => r[i] ?? NULL))]);
      const out: MValue[] = [];
      for (let i = 0; i < t.columns.length; i++) {
        if (i === firstSrc) out.push(combined);
        if (!srcSet.has(i)) out.push(r[i] ?? NULL);
      }
      return out;
    });
    return table(columns, rows);
  }));
  // No per-cell error values in our model, so these validate and pass through / select none.
  // Error cells are error values (from AddColumn/TransformColumns/TransformColumnTypes).
  const errCols = (t: Table, colArg: MValue | undefined): number[] =>
    colArg && colArg.kind !== "null" ? namesOf(colArg, "column").map((c) => colIndex(t, c)) : t.columns.map((_, i) => i);
  const rowHasError = (r: MValue[], cols: number[]): boolean => cols.some((i) => (r[i] ?? NULL).kind === "error");
  def("Table.RemoveRowsWithErrors", fn("Table.RemoveRowsWithErrors", [{ name: "table" }, { name: "columns", optional: true }], (a) => {
    const t = asTable(a[0]!, "Table.RemoveRowsWithErrors");
    const cols = errCols(t, a[1]);
    return table(t.columns, t.rows.filter((r) => !rowHasError(r, cols)), t.types);
  }));
  def("Table.SelectRowsWithErrors", fn("Table.SelectRowsWithErrors", [{ name: "table" }, { name: "columns", optional: true }], (a) => {
    const t = asTable(a[0]!, "Table.SelectRowsWithErrors");
    const cols = errCols(t, a[1]);
    return table(t.columns, t.rows.filter((r) => rowHasError(r, cols)), t.types);
  }));
  def("Table.ColumnsOfType", fn("Table.ColumnsOfType", [{ name: "table" }, { name: "listOfTypes" }], (a) => {
    const t = asTable(a[0]!, "Table.ColumnsOfType");
    const wanted = a[1]!.kind === "list" ? a[1]!.items : [a[1]!];
    // Excel matches nominally: Int64.Type does NOT match `type number` (oracle). Compare the
    // ascribed surface name, except `type any` which matches everything.
    const key = (ty: MType): string => `${ty.ascription ?? ty.name}${ty.nullable ? "?" : ""}`;
    return list(t.columns.filter((c) => {
      const ct = t.types?.get(c);
      return ct !== undefined && wanted.some((w) => w.kind === "type" && (w.name === "any" || key(w) === key(ct)));
    }).map(text));
  }));
  def("Table.Schema", fn("Table.Schema", [{ name: "table" }], (a) => {
    const t = asTable(a[0]!, "Table.Schema");
    const cols = ["Name", "Position", "TypeName", "Kind", "IsNullable"];
    const rows = t.columns.map((c, i) => {
      const ty = t.types?.get(c);
      return [text(c), number(i), text(ty ? typeName(ty) : "Any.Type"), text(ty?.name ?? "any"), logical(!!ty?.nullable)];
    });
    return table(cols, rows);
  }));
  // Replace error cells in the given columns with a value: {{column, replacement}, ...}.
  def("Table.ReplaceErrorValues", fn("Table.ReplaceErrorValues", [{ name: "table" }, { name: "errorReplacement" }], (a) => {
    const t = asTable(a[0]!, "Table.ReplaceErrorValues");
    const repl = new Map<number, MValue>();
    for (const [colV, valV] of pairList(a[1]!, "Table.ReplaceErrorValues")) repl.set(colIndex(t, textOf(colV!, "column")), valV!);
    const rows = t.rows.map((r) => r.map((v, i) => (repl.has(i) && (v ?? NULL).kind === "error" ? repl.get(i)! : v)));
    return table(t.columns, rows, t.types);
  }));
  def("Table.FromValue", fn("Table.FromValue", [{ name: "value" }, { name: "options", optional: true }], (a) => {
    const v = a[0]!;
    if (v.kind === "list") return table(["Value"], v.items.map((x) => [x]));
    if (v.kind === "table") return v;
    return table(["Value"], [[v]]);
  }));
  def("Table.ExpandRecordColumn", fn("Table.ExpandRecordColumn", [{ name: "table" }, { name: "column" }, { name: "fieldNames" }, { name: "newColumnNames", optional: true }], (a) => {
    const t = asTable(a[0]!, "Table.ExpandRecordColumn");
    const ci = colIndex(t, textOf(a[1]!, "expand column"));
    const fields = namesOf(a[2]!, "field name");
    const outNames = a[3] ? namesOf(a[3], "new column name") : fields;
    const columns = [...t.columns.slice(0, ci), ...outNames, ...t.columns.slice(ci + 1)];
    const rows = t.rows.map((r) => {
      const cell = r[ci] ?? NULL;
      const vals = fields.map((f) => (cell.kind === "record" ? cell.fields.get(f) ?? NULL : NULL));
      return [...r.slice(0, ci), ...vals, ...r.slice(ci + 1)];
    });
    return table(columns, rows);
  }));
  def("Table.Join", fn("Table.Join", [{ name: "table1" }, { name: "key1" }, { name: "table2" }, { name: "key2" }, { name: "joinKind", optional: true }, { name: "joinAlgorithm", optional: true }], (a) => {
    const t1 = asTable(a[0]!, "Table.Join");
    const t2 = asTable(a[2]!, "Table.Join");
    const k1 = namesOf(a[1]!, "join key").map((c) => colIndex(t1, c));
    const k2 = namesOf(a[3]!, "join key").map((c) => colIndex(t2, c));
    const kind = a[4] && a[4].kind === "number" ? a[4].value : 0; // Inner default
    // Excel rejects a join that would produce duplicate column names (e.g. same-named keys).
    for (const c of t2.columns) if (t1.columns.includes(c)) err("Expression.Error", `A join operation cannot result in a table with duplicate column names ("${c}").`);
    const byKey = new Map<string, number[]>();
    for (let j = 0; j < t2.rows.length; j++) {
      const k = JSON.stringify(k2.map((c) => keyOf(t2.rows[j]![c] ?? NULL)));
      (byKey.get(k) ?? byKey.set(k, []).get(k)!).push(j);
    }
    const columns = [...t1.columns, ...t2.columns];
    const rows: MValue[][] = [];
    const matchedT2 = new Set<number>();
    for (let i = 0; i < t1.rows.length; i++) {
      const matches = byKey.get(JSON.stringify(k1.map((c) => keyOf(t1.rows[i]![c] ?? NULL)))) ?? [];
      matches.forEach((j) => matchedT2.add(j));
      if (kind === 4 && matches.length === 0) rows.push([...t1.rows[i]!, ...t2.columns.map(() => NULL)]); // LeftAnti
      else if (kind === 4) continue;
      else if (matches.length === 0 && (kind === 1 || kind === 3)) rows.push([...t1.rows[i]!, ...t2.columns.map(() => NULL)]); // Left/Full outer, no match
      else for (const j of matches) rows.push([...t1.rows[i]!, ...t2.rows[j]!]);
    }
    if (kind === 2 || kind === 3) for (let j = 0; j < t2.rows.length; j++) if (!matchedT2.has(j)) rows.push([...t1.columns.map(() => NULL), ...t2.rows[j]!]); // Right/Full outer
    return table(columns, rows);
  }));
  def("Table.HasColumns", fn("Table.HasColumns", [{ name: "table" }, { name: "columns" }], (a) => {
    const t = asTable(a[0]!, "Table.HasColumns");
    return logical(namesOf(a[1]!, "column").every((c) => t.columns.includes(c)));
  }));
  def("Table.IsEmpty", fn("Table.IsEmpty", [{ name: "table" }], (a) => logical(asTable(a[0]!, "Table.IsEmpty").rows.length === 0)));
  def("Table.Buffer", fn("Table.Buffer", [{ name: "table" }], (a) => asTable(a[0]!, "Table.Buffer")));

  def("Table.SelectRows", fn("Table.SelectRows", [{ name: "table" }, { name: "condition" }], (a) => {
    const t = asTable(a[0]!, "Table.SelectRows");
    return subTable(t, rowsWhere(t, (i) => truthy(callFn(a[1]!, [rowRecord(t, i)]))));
  }));

  def("Table.SelectColumns", fn("Table.SelectColumns", [{ name: "table" }, { name: "columns" }, { name: "missingField", optional: true }], (a) => {
    const t = asTable(a[0]!, "Table.SelectColumns");
    const wanted = namesOf(a[1]!, "column name");
    const idx = wanted.map((c) => colIndex(t, c));
    return table(wanted, t.rows.map((r) => idx.map((i) => r[i] ?? NULL)));
  }));

  def("Table.RemoveColumns", fn("Table.RemoveColumns", [{ name: "table" }, { name: "columns" }, { name: "missingField", optional: true }], (a) => {
    const t = asTable(a[0]!, "Table.RemoveColumns");
    const drop = new Set(namesOf(a[1]!, "column name"));
    for (const c of drop) colIndex(t, c);
    const keep = t.columns.map((c, i) => [c, i] as const).filter(([c]) => !drop.has(c));
    return table(keep.map(([c]) => c), t.rows.map((r) => keep.map(([, i]) => r[i] ?? NULL)));
  }));

  def("Table.RenameColumns", fn("Table.RenameColumns", [{ name: "table" }, { name: "renames" }, { name: "missingField", optional: true }], (a) => {
    const t = asTable(a[0]!, "Table.RenameColumns");
    const cols = [...t.columns];
    for (const [from, to] of pairList(a[1]!, "Table.RenameColumns")) {
      const i = colIndex(t, textOf(from!, "rename"));
      cols[i] = textOf(to!, "rename");
    }
    return table(cols, t.rows, t.types);
  }));

  def("Table.TransformColumnTypes", fn("Table.TransformColumnTypes", [{ name: "table" }, { name: "transforms" }, { name: "culture", optional: true }], (a) => {
    const t = asTable(a[0]!, "Table.TransformColumnTypes");
    const types = new Map(t.types ?? []);
    const rows = t.rows.map((r) => [...r]);
    for (const [colV, typeV] of pairList(a[1]!, "Table.TransformColumnTypes")) {
      const col = textOf(colV!, "transform column");
      const ci = colIndex(t, col);
      if (typeV!.kind !== "type") err("Expression.Error", "Expected a type value.");
      // Excel makes transformed columns nullable, so ColumnsOfType({Int64.Type}) yields {}
      // (a nullable Int64.Type is not the non-nullable Int64.Type) - oracle-confirmed.
      types.set(col, { ...(typeV as MType), nullable: true });
      for (const r of rows) r[ci] = convertTo(r[ci] ?? NULL, typeV!.name, col);
    }
    return table(t.columns, rows, types);
  }));

  def("Table.TransformColumns", fn("Table.TransformColumns", [{ name: "table" }, { name: "transformOperations" }, { name: "defaultTransformation", optional: true }, { name: "missingField", optional: true }], (a) => {
    const t = asTable(a[0]!, "Table.TransformColumns");
    const rows = t.rows.map((r) => [...r]);
    for (const op of pairList(a[1]!, "Table.TransformColumns")) {
      const ci = colIndex(t, textOf(op[0]!, "transform column"));
      const f = op[1]!;
      for (const r of rows) r[ci] = callFn(f, [r[ci] ?? NULL]);
    }
    return table(t.columns, rows, t.types);
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
        v = errorValue(e); // Excel stores a per-cell error value
      }
      return [...r, v];
    });
    return table([...t.columns, name], rows, t.types);
  }));

  def("Table.AddIndexColumn", fn("Table.AddIndexColumn", [{ name: "table" }, { name: "newColumnName" }, { name: "initialValue", optional: true }, { name: "increment", optional: true }, { name: "columnType", optional: true }], (a) => {
    const t = asTable(a[0]!, "Table.AddIndexColumn");
    const name = textOf(a[1]!, "index column name");
    const start = a[2] && a[2].kind === "number" ? a[2].value : 0;
    const step = a[3] && a[3].kind === "number" ? a[3].value : 1;
    return table([...t.columns, name], t.rows.map((r, i) => [...r, number(start + i * step)]), t.types);
  }));

  def("Table.Sort", fn("Table.Sort", [{ name: "table" }, { name: "comparisonCriteria" }], (a) => {
    const t = asTable(a[0]!, "Table.Sort");
    const crit = (a[1]!.kind === "list" ? a[1]!.items : [a[1]!]).map((c) => {
      if (c.kind === "text") return { ci: colIndex(t, c.value), desc: false };
      if (c.kind === "list" && c.items.length === 2) {
        return { ci: colIndex(t, textOf(c.items[0]!, "sort column")), desc: expect(c.items[1]!, "number", "sort order").value === 1 };
      }
      err("Expression.Error", "Table.Sort: unsupported criteria shape (use column names or {name, Order.*}).");
    });
    const rows = t.rows.map((r, i) => ({ r, i }));
    rows.sort((x, y) => {
      for (const { ci, desc } of crit) {
        const c = cmpWithNulls(x.r[ci] ?? NULL, y.r[ci] ?? NULL);
        if (c !== 0) return desc ? -c : c;
      }
      return x.i - y.i;
    });
    return table(t.columns, rows.map((x) => x.r), t.types);
  }));

  const firstN = (t: Table, cond: MValue): Table => {
    if (cond.kind === "number") return subTable(t, t.rows.map((_, i) => i).slice(0, cond.value));
    const keep: number[] = [];
    for (let i = 0; i < t.rows.length; i++) {
      if (!truthy(callFn(cond, [rowRecord(t, i)]))) break;
      keep.push(i);
    }
    return subTable(t, keep);
  };
  def("Table.FirstN", fn("Table.FirstN", [{ name: "table" }, { name: "countOrCondition" }], (a) => firstN(asTable(a[0]!, "Table.FirstN"), a[1]!)));
  def("Table.LastN", fn("Table.LastN", [{ name: "table" }, { name: "countOrCondition" }], (a) => {
    const t = asTable(a[0]!, "Table.LastN");
    if (a[1]!.kind !== "number") err("Expression.Error", "Table.LastN: only a count is supported.");
    return subTable(t, t.rows.map((_, i) => i).slice(Math.max(0, t.rows.length - a[1]!.value)));
  }));
  def("Table.Skip", fn("Table.Skip", [{ name: "table" }, { name: "countOrCondition", optional: true }], (a) => {
    const t = asTable(a[0]!, "Table.Skip");
    const cond = a[1] ?? number(1);
    if (cond.kind === "number") return subTable(t, t.rows.map((_, i) => i).slice(cond.value));
    let i = 0;
    while (i < t.rows.length && truthy(callFn(cond, [rowRecord(t, i)]))) i++;
    return subTable(t, t.rows.map((_, j) => j).slice(i));
  }));
  def("Table.First", fn("Table.First", [{ name: "table" }, { name: "default", optional: true }], (a) => {
    const t = asTable(a[0]!, "Table.First");
    return t.rows.length ? rowRecord(t, 0) : (a[1] ?? NULL);
  }));
  def("Table.Last", fn("Table.Last", [{ name: "table" }, { name: "default", optional: true }], (a) => {
    const t = asTable(a[0]!, "Table.Last");
    return t.rows.length ? rowRecord(t, t.rows.length - 1) : (a[1] ?? NULL);
  }));

  def("Table.Distinct", fn("Table.Distinct", [{ name: "table" }, { name: "equationCriteria", optional: true }], (a) => {
    const t = asTable(a[0]!, "Table.Distinct");
    const cols = a[1] ? namesOf(a[1], "distinct column").map((c) => colIndex(t, c)) : t.columns.map((_, i) => i);
    const seen = new Set<string>();
    return subTable(t, rowsWhere(t, (i) => {
      const k = rowKey(t, i, cols);
      if (seen.has(k)) return false;
      seen.add(k);
      return true;
    }));
  }));

  def("Table.IsDistinct", fn("Table.IsDistinct", [{ name: "table" }, { name: "comparisonCriteria", optional: true }], (a) => {
    const t = asTable(a[0]!, "Table.IsDistinct");
    const cols = a[1] ? namesOf(a[1], "Table.IsDistinct column").map((c) => colIndex(t, c)) : t.columns.map((_, i) => i);
    const seen = new Set<string>();
    for (let i = 0; i < t.rows.length; i++) { const k = rowKey(t, i, cols); if (seen.has(k)) return logical(false); seen.add(k); }
    return logical(true);
  }));
  def("Table.RemoveFirstN", fn("Table.RemoveFirstN", [{ name: "table" }, { name: "countOrCondition", optional: true }], (a) => {
    const t = asTable(a[0]!, "Table.RemoveFirstN");
    const cond = a[1] ?? number(1);
    if (cond.kind === "number") return subTable(t, t.rows.map((_, i) => i).slice(cond.value));
    let i = 0; while (i < t.rows.length && truthy(callFn(cond, [rowRecord(t, i)]))) i++;
    return subTable(t, t.rows.map((_, j) => j).slice(i));
  }));
  def("Table.RemoveLastN", fn("Table.RemoveLastN", [{ name: "table" }, { name: "countOrCondition", optional: true }], (a) => {
    const t = asTable(a[0]!, "Table.RemoveLastN");
    const n = a[1]?.kind === "number" ? a[1].value : 1;
    return subTable(t, t.rows.map((_, i) => i).slice(0, Math.max(0, t.rows.length - n)));
  }));
  def("Table.RemoveMatchingRows", fn("Table.RemoveMatchingRows", [{ name: "table" }, { name: "rows" }, { name: "equationCriteria", optional: true }], (a) => {
    const t = asTable(a[0]!, "Table.RemoveMatchingRows");
    const remove = listOf(a[1]!, "Table.RemoveMatchingRows rows");
    const matches = (i: number): boolean => remove.some((rv) => rv.kind === "record" && t.columns.every((c) => { const cell = t.rows[i]![t.columns.indexOf(c)] ?? NULL; const rf = rv.fields.get(c); return rf === undefined || equalsCell(cell, rf); }));
    return subTable(t, rowsWhere(t, (i) => !matches(i)));
  }));
  // Table.SingleRow: the one row as a record; errors unless exactly one row.
  def("Table.SingleRow", fn("Table.SingleRow", [{ name: "table" }], (a) => {
    const t = asTable(a[0]!, "Table.SingleRow");
    if (t.rows.length !== 1) err("Expression.Error", "Table.SingleRow: the table must have exactly one row.");
    return rowRecord(t, 0);
  }));
  // Table.AddKey: keys are metadata Excel uses for relationships; passthrough here.
  def("Table.AddKey", fn("Table.AddKey", [{ name: "table" }, { name: "columns" }, { name: "isPrimary" }], (a) => a[0]!));

  def("Table.Combine", fn("Table.Combine", [{ name: "tables" }, { name: "columns", optional: true }], (a) => {
    const parts = listOf(a[0]!, "Table.Combine").map((v) => asTable(v, "Table.Combine"));
    const columns: string[] = a[1] ? namesOf(a[1], "column") : [];
    if (!a[1]) for (const p of parts) for (const c of p.columns) if (!columns.includes(c)) columns.push(c);
    const rows: MValue[][] = [];
    for (const p of parts) {
      const map = columns.map((c) => p.columns.indexOf(c));
      for (const r of p.rows) rows.push(map.map((i) => (i < 0 ? NULL : (r[i] ?? NULL))));
    }
    return table(columns, rows);
  }));

  def("Table.Group", fn("Table.Group", [{ name: "table" }, { name: "key" }, { name: "aggregatedColumns" }, { name: "groupKind", optional: true }, { name: "comparer", optional: true }], (a) => {
    const t = asTable(a[0]!, "Table.Group");
    if (a[4]) err("Expression.Error", "Table.Group: comparers are not supported yet.");
    if (a[3] && a[3].kind === "number" && a[3].value === 0) err("Expression.Error", "Table.Group: GroupKind.Local is not supported yet.");
    const keyCols = namesOf(a[1]!, "group key").map((c) => colIndex(t, c));
    const aggs = pairList(a[2]!, "Table.Group aggregations").map((p) => ({ name: textOf(p[0]!, "aggregate name"), f: p[1]! }));
    const groups = new Map<string, number[]>();
    for (let i = 0; i < t.rows.length; i++) {
      const k = rowKey(t, i, keyCols);
      const g = groups.get(k);
      if (g) g.push(i);
      else groups.set(k, [i]);
    }
    const columns = [...keyCols.map((ci) => t.columns[ci]!), ...aggs.map((g) => g.name)];
    const rows: MValue[][] = [];
    for (const idx of groups.values()) {
      const sub = subTable(t, idx);
      rows.push([...keyCols.map((ci) => t.rows[idx[0]!]![ci] ?? NULL), ...aggs.map((g) => callFn(g.f, [sub]))]);
    }
    return table(columns, rows);
  }));

  def("Table.NestedJoin", fn("Table.NestedJoin", [{ name: "table1" }, { name: "key1" }, { name: "table2" }, { name: "key2" }, { name: "newColumnName" }, { name: "joinKind", optional: true }], (a) => {
    const t1 = asTable(a[0]!, "Table.NestedJoin");
    const t2 = asTable(a[2]!, "Table.NestedJoin");
    const k1 = namesOf(a[1]!, "join key").map((c) => colIndex(t1, c));
    const k2 = namesOf(a[3]!, "join key").map((c) => colIndex(t2, c));
    if (k1.length !== k2.length) err("Expression.Error", "Table.NestedJoin: key column counts differ.");
    const newCol = textOf(a[4]!, "new column name");
    const kind = a[5] && a[5].kind === "number" ? a[5].value : 1; // JoinKind.LeftOuter default
    const byKey = new Map<string, number[]>();
    for (let j = 0; j < t2.rows.length; j++) {
      const k = rowKey(t2, j, k2);
      const g = byKey.get(k);
      if (g) g.push(j);
      else byKey.set(k, [j]);
    }
    const columns = [...t1.columns, newCol];
    const rows: MValue[][] = [];
    const matchedT2 = new Set<number>();
    for (let i = 0; i < t1.rows.length; i++) {
      const matches = byKey.get(rowKey(t1, i, k1)) ?? [];
      matches.forEach((j) => matchedT2.add(j));
      const nested = subTable(t2, matches);
      if (kind === 0 && matches.length === 0) continue; // Inner
      if (kind === 4 && matches.length > 0) continue; // LeftAnti
      if (kind === 5) continue; // RightAnti keeps no left-matched rows (handled below)
      rows.push([...t1.rows[i]!, nested]);
    }
    if (kind === 2 || kind === 3 || kind === 5) {
      // Right/Full outer + RightAnti: one null-left row carrying each unmatched t2 row.
      for (let j = 0; j < t2.rows.length; j++) {
        if (matchedT2.has(j) && kind !== 2) continue;
        if (kind === 2 && matchedT2.has(j)) continue;
        rows.push([...t1.columns.map(() => NULL), subTable(t2, [j])]);
      }
      if (kind === 2) {
        // RightOuter also keeps the matched left rows (already pushed above).
      }
    }
    return table(columns, rows);
  }));

  def("Table.ExpandTableColumn", fn("Table.ExpandTableColumn", [{ name: "table" }, { name: "column" }, { name: "columnNames" }, { name: "newColumnNames", optional: true }], (a) => {
    const t = asTable(a[0]!, "Table.ExpandTableColumn");
    const ci = colIndex(t, textOf(a[1]!, "expand column"));
    const inner = namesOf(a[2]!, "expand column name");
    const outNames = a[3] ? namesOf(a[3], "new column name") : inner;
    const columns = [...t.columns.slice(0, ci), ...outNames, ...t.columns.slice(ci + 1)];
    const rows: MValue[][] = [];
    for (const r of t.rows) {
      const cell = r[ci] ?? NULL;
      const emit = (vals: MValue[]): void => {
        rows.push([...r.slice(0, ci), ...vals, ...r.slice(ci + 1)]);
      };
      if (cell.kind === "table" && cell.rows.length > 0) {
        const map = inner.map((c) => cell.columns.indexOf(c));
        for (const nr of cell.rows) emit(map.map((i) => (i < 0 ? NULL : (nr[i] ?? NULL))));
      } else {
        emit(inner.map(() => NULL)); // empty nested table or null -> one row of nulls
      }
    }
    return table(columns, rows);
  }));

  def("Table.FillDown", fn("Table.FillDown", [{ name: "table" }, { name: "columns" }], (a) => {
    const t = asTable(a[0]!, "Table.FillDown");
    const cols = namesOf(a[1]!, "fill column").map((c) => colIndex(t, c));
    const rows = t.rows.map((r) => [...r]);
    for (const ci of cols) {
      let last: MValue = NULL;
      for (const r of rows) {
        if ((r[ci] ?? NULL).kind === "null") r[ci] = last;
        else last = r[ci]!;
      }
    }
    return table(t.columns, rows, t.types);
  }));
  def("Table.FillUp", fn("Table.FillUp", [{ name: "table" }, { name: "columns" }], (a) => {
    const t = asTable(a[0]!, "Table.FillUp");
    const cols = namesOf(a[1]!, "fill column").map((c) => colIndex(t, c));
    const rows = t.rows.map((r) => [...r]);
    for (const ci of cols) {
      let last: MValue = NULL;
      for (let i = rows.length - 1; i >= 0; i--) {
        if ((rows[i]![ci] ?? NULL).kind === "null") rows[i]![ci] = last;
        else last = rows[i]![ci]!;
      }
    }
    return table(t.columns, rows, t.types);
  }));

  def("Table.ReplaceValue", fn("Table.ReplaceValue", [{ name: "table" }, { name: "oldValue" }, { name: "newValue" }, { name: "replacer" }, { name: "columnsToSearch" }], (a) => {
    const t = asTable(a[0]!, "Table.ReplaceValue");
    const cols = namesOf(a[4]!, "replace column").map((c) => colIndex(t, c));
    const replacer = a[3]!;
    if (replacer.kind !== "function") err("Expression.Error", "Table.ReplaceValue: expected a replacer function.");
    const resolve = (v: MValue, row: MValue): MValue => (v.kind === "function" ? callFn(v, [row]) : v);
    const rows = t.rows.map((r, i) => {
      const rec = rowRecord(t, i);
      const oldV = resolve(a[1]!, rec);
      const newV = resolve(a[2]!, rec);
      const out = [...r];
      for (const ci of cols) out[ci] = callFn(replacer, [out[ci] ?? NULL, oldV, newV]);
      return out;
    });
    return table(t.columns, rows, t.types);
  }));

  def("Table.PromoteHeaders", fn("Table.PromoteHeaders", [{ name: "table" }, { name: "options", optional: true }], (a) => {
    const t = asTable(a[0]!, "Table.PromoteHeaders");
    if (t.rows.length === 0) return t;
    const used = new Set<string>();
    const columns = t.rows[0]!.map((v, i) => {
      let name = v.kind === "null" ? `Column${i + 1}` : textFrom(v);
      if (name === "") name = `Column${i + 1}`;
      let candidate = name;
      let n = 1;
      while (used.has(candidate)) candidate = `${name}_${n++}`;
      used.add(candidate);
      return candidate;
    });
    return table(columns, t.rows.slice(1));
  }));
  def("Table.DemoteHeaders", fn("Table.DemoteHeaders", [{ name: "table" }], (a) => {
    const t = asTable(a[0]!, "Table.DemoteHeaders");
    return table(t.columns.map((_, i) => `Column${i + 1}`), [t.columns.map(text), ...t.rows]);
  }));

  def("Table.UnpivotOtherColumns", fn("Table.UnpivotOtherColumns", [{ name: "table" }, { name: "pivotColumns" }, { name: "attributeColumn" }, { name: "valueColumn" }], (a) => {
    const t = asTable(a[0]!, "Table.UnpivotOtherColumns");
    const keep = namesOf(a[1]!, "pivot column").map((c) => colIndex(t, c));
    const melt = t.columns.map((_, i) => i).filter((i) => !keep.includes(i));
    return unpivot(t, keep, melt, textOf(a[2]!, "attribute column"), textOf(a[3]!, "value column"));
  }));
  def("Table.Unpivot", fn("Table.Unpivot", [{ name: "table" }, { name: "pivotColumns" }, { name: "attributeColumn" }, { name: "valueColumn" }], (a) => {
    const t = asTable(a[0]!, "Table.Unpivot");
    const melt = namesOf(a[1]!, "unpivot column").map((c) => colIndex(t, c));
    const keep = t.columns.map((_, i) => i).filter((i) => !melt.includes(i));
    return unpivot(t, keep, melt, textOf(a[2]!, "attribute column"), textOf(a[3]!, "value column"));
  }));

  def("Table.Pivot", fn("Table.Pivot", [{ name: "table" }, { name: "pivotValues" }, { name: "attributeColumn" }, { name: "valueColumn" }, { name: "aggregationFunction", optional: true }], (a) => {
    const t = asTable(a[0]!, "Table.Pivot");
    const pivotVals = listOf(a[1]!, "Table.Pivot values").map((v) => textOf(v, "pivot value"));
    const attrCi = colIndex(t, textOf(a[2]!, "attribute column"));
    const valCi = colIndex(t, textOf(a[3]!, "value column"));
    const keyCols = t.columns.map((_, i) => i).filter((i) => i !== attrCi && i !== valCi);
    const groups = new Map<string, { key: MValue[]; cells: Map<string, MValue[]> }>();
    for (const r of t.rows) {
      const k = JSON.stringify(keyCols.map((c) => keyOf(r[c] ?? NULL)));
      let g = groups.get(k);
      if (!g) {
        g = { key: keyCols.map((c) => r[c] ?? NULL), cells: new Map() };
        groups.set(k, g);
      }
      const attr = r[attrCi] ?? NULL;
      const label = attr.kind === "text" ? attr.value : textFrom(attr);
      const arr = g.cells.get(label) ?? [];
      arr.push(r[valCi] ?? NULL);
      g.cells.set(label, arr);
    }
    const agg = a[4];
    const columns = [...keyCols.map((c) => t.columns[c]!), ...pivotVals];
    const rows: MValue[][] = [];
    for (const g of groups.values()) {
      const cells = pivotVals.map((pv) => {
        const vals = g.cells.get(pv) ?? [];
        if (agg) return callFn(agg, [list(vals)]);
        if (vals.length === 0) return NULL;
        if (vals.length === 1) return vals[0]!;
        err("Expression.Error", "Table.Pivot: more than one value per cell; pass an aggregation function.");
      });
      rows.push([...g.key, ...cells]);
    }
    return table(columns, rows);
  }));

  def("Table.SplitColumn", fn("Table.SplitColumn", [{ name: "table" }, { name: "sourceColumn" }, { name: "splitter" }, { name: "columnNamesOrNumber", optional: true }, { name: "default", optional: true }, { name: "extraValues", optional: true }], (a) => {
    const t = asTable(a[0]!, "Table.SplitColumn");
    const ci = colIndex(t, textOf(a[1]!, "split column"));
    const splitter = a[2]!;
    const parts = t.rows.map((r) => {
      const cell = r[ci] ?? NULL;
      if (cell.kind === "null") return [] as MValue[];
      return listOf(callFn(splitter, [cell]), "splitter result");
    });
    let names: string[];
    if (a[3] && a[3].kind === "list") names = a[3].items.map((v) => textOf(v, "split column name"));
    else {
      const src = t.columns[ci]!;
      const n = a[3] && a[3].kind === "number" ? a[3].value : Math.max(1, ...parts.map((p) => p.length));
      names = Array.from({ length: n }, (_, i) => `${src}.${i + 1}`);
    }
    const columns = [...t.columns.slice(0, ci), ...names, ...t.columns.slice(ci + 1)];
    const rows = t.rows.map((r, i) => [
      ...r.slice(0, ci),
      ...names.map((_, j) => parts[i]![j] ?? NULL),
      ...r.slice(ci + 1),
    ]);
    return table(columns, rows);
  }));

  def("Table.ToRows", fn("Table.ToRows", [{ name: "table" }], (a) => {
    const t = asTable(a[0]!, "Table.ToRows");
    return list(t.rows.map((r) => list([...r])));
  }));
  def("Table.ToColumns", fn("Table.ToColumns", [{ name: "table" }], (a) => {
    const t = asTable(a[0]!, "Table.ToColumns");
    return list(t.columns.map((_, ci) => list(t.rows.map((r) => r[ci] ?? NULL))));
  }));
  def("Table.FromRows", fn("Table.FromRows", [{ name: "rows" }, { name: "columns", optional: true }], (a) => {
    const rows = listOf(a[0]!, "Table.FromRows").map((r) => listOf(r, "row"));
    const width = rows.length ? rows[0]!.length : 0;
    const columns = a[1] ? colNamesFromSpec(a[1], "column") : Array.from({ length: width }, (_, i) => `Column${i + 1}`);
    return table(columns, rows);
  }));
  def("Table.FromRecords", fn("Table.FromRecords", [{ name: "records" }, { name: "columns", optional: true }], (a) => {
    const recs = listOf(a[0]!, "Table.FromRecords").map((r) => expect(r, "record", "Table.FromRecords"));
    const columns: string[] = a[1] ? namesOf(a[1], "column") : [];
    if (!a[1]) for (const r of recs) for (const k of r.fields.keys()) if (!columns.includes(k)) columns.push(k);
    return table(columns, recs.map((r) => columns.map((c) => r.fields.get(c) ?? NULL)));
  }));
}

function unpivot(t: Table, keep: number[], melt: number[], attrName: string, valName: string): MValue {
  const columns = [...keep.map((i) => t.columns[i]!), attrName, valName];
  const rows: MValue[][] = [];
  for (const r of t.rows) {
    for (const mi of melt) {
      const cell = r[mi] ?? NULL;
      if (cell.kind === "null") continue; // nulls are skipped (reference semantics)
      rows.push([...keep.map((i) => r[i] ?? NULL), text(t.columns[mi]!), cell]);
    }
  }
  return table(columns, rows);
}
