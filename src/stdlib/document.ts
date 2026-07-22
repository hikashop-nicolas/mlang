// Document/source parsers: Csv.Document, Json.Document, Lines.*, and the binary-free text
// entry points that let queries process embedded data. From the public reference; the
// CSV/JSON option shapes not covered raise precise errors.
import type { Env } from "../interpret.js";
import { NULL, err, list, logical, number, table, text, type MFunction, type MValue } from "../values.js";
import { fn, listOf, textOf, type Table } from "./helpers.js";
import { fromJson } from "../host.js";

const asFunc = (v: MValue | undefined, who: string): MFunction => {
  if (!v || v.kind !== "function") err("Expression.Error", `${who}: expected a function.`);
  return v;
};

/** Parse one CSV line honouring RFC-4180 double-quote quoting. */
function parseCsvLine(line: string, delim: string): string[] {
  const out: string[] = [];
  let cur = "";
  let inQ = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i]!;
    if (inQ) {
      if (ch === '"') {
        if (line[i + 1] === '"') {
          cur += '"';
          i++;
        } else inQ = false;
      } else cur += ch;
    } else if (ch === '"') inQ = true;
    else if (line.startsWith(delim, i)) {
      out.push(cur);
      cur = "";
      i += delim.length - 1;
    } else cur += ch;
  }
  out.push(cur);
  return out;
}

/** Split into records on unquoted newlines (a quoted field may contain a newline). */
function splitCsvRecords(s: string): string[] {
  const records: string[] = [];
  let cur = "";
  let inQ = false;
  for (let i = 0; i < s.length; i++) {
    const ch = s[i]!;
    if (ch === '"') inQ = !inQ;
    if (!inQ && (ch === "\n" || ch === "\r")) {
      if (ch === "\r" && s[i + 1] === "\n") i++;
      records.push(cur);
      cur = "";
    } else cur += ch;
  }
  if (cur.length > 0) records.push(cur);
  return records;
}

export function registerDocument(env: Env): void {
  const def = (name: string, v: MValue): void => env.defineValue(name, v);

  // A source is text or a binary (decoded as UTF-8) - the latter is what a host connector
  // like File.Contents returns.
  const sourceText = (v: MValue, who: string): string => {
    if (v.kind === "text") return v.value;
    if (v.kind === "binary") return new TextDecoder("utf-8").decode(v.bytes);
    err("Expression.Error", `${who}: expected a text or binary source.`);
  };

  // Csv.Document(source, optional columns/options) -> a table. Tier-1 accepts text/binary
  // source, a Delimiter option, and either a column count or a list of names; other raise.
  def("Csv.Document", fn("Csv.Document", [{ name: "source" }, { name: "columns", optional: true }], (a) => {
    const srcText = sourceText(a[0]!, "Csv.Document");
    let delim = ",";
    let colSpec: MValue | undefined;
    const opt = a[1];
    if (opt) {
      if (opt.kind === "record") {
        const d = opt.fields.get("Delimiter");
        if (d) delim = textOf(d, "Csv.Document Delimiter");
        colSpec = opt.fields.get("Columns");
        for (const k of opt.fields.keys()) if (!["Delimiter", "Columns", "Encoding", "QuoteStyle", "ExtraValues"].includes(k)) err("Expression.Error", `Csv.Document: option '${k}' is not supported yet.`);
      } else if (opt.kind === "number" || opt.kind === "list") {
        colSpec = opt;
      } else err("Expression.Error", "Csv.Document: unsupported second argument.");
    }
    const records = splitCsvRecords(srcText).map((r) => parseCsvLine(r, delim).map(text) as MValue[]);
    let width = records.reduce((w, r) => Math.max(w, r.length), 0);
    let columns: string[];
    if (colSpec && colSpec.kind === "list") {
      columns = colSpec.items.map((c) => textOf(c, "column"));
      width = columns.length;
    } else if (colSpec && colSpec.kind === "number") {
      width = colSpec.value;
      columns = Array.from({ length: width }, (_, i) => `Column${i + 1}`);
    } else {
      columns = Array.from({ length: width }, (_, i) => `Column${i + 1}`);
    }
    // Csv.Document yields all-text cells; short rows pad with "" (not null) - oracle-checked.
    const rows = records.map((r) => Array.from({ length: width }, (_, i) => r[i] ?? text("")));
    return table(columns, rows);
  }));

  // Json.Document(text) -> M value tree (records/lists/text/number/logical/null).
  def("Json.Document", fn("Json.Document", [{ name: "jsonText" }, { name: "encoding", optional: true }], (a) => {
    const src = sourceText(a[0]!, "Json.Document");
    let parsed: unknown;
    try {
      parsed = JSON.parse(src);
    } catch (e) {
      err("Expression.Error", `Json.Document: invalid JSON (${(e as Error).message}).`);
    }
    return fromJson(parsed);
  }));

  def("Lines.FromText", fn("Lines.FromText", [{ name: "text" }, { name: "quoteStyle", optional: true }], (a) => {
    const s = textOf(a[0]!, "Lines.FromText");
    const parts = s.split(/\r\n|\n|\r/);
    if (parts.length > 0 && parts[parts.length - 1] === "") parts.pop();
    return list(parts.map(text));
  }));
  def("Lines.ToText", fn("Lines.ToText", [{ name: "lines" }, { name: "lineSeparator", optional: true }], (a) => {
    const sep = a[1] ? textOf(a[1], "separator") : "\n";
    return text(listOf(a[0]!, "Lines.ToText").map((v) => textOf(v, "line")).join(sep));
  }));

  def("Table.FromColumns", fn("Table.FromColumns", [{ name: "lists" }, { name: "columns", optional: true }], (a) => {
    const cols = listOf(a[0]!, "Table.FromColumns").map((c) => listOf(c, "column"));
    const height = cols.reduce((h, c) => Math.max(h, c.length), 0);
    const names = a[1]
      ? (a[1].kind === "list" ? a[1].items.map((c) => textOf(c, "column name")) : [textOf(a[1], "column name")])
      : cols.map((_, i) => `Column${i + 1}`);
    const rows = Array.from({ length: height }, (_, r) => cols.map((c) => c[r] ?? NULL));
    return table(names, rows);
  }));

  def("Table.FromList", fn("Table.FromList", [{ name: "list" }, { name: "splitter", optional: true }, { name: "columns", optional: true }], (a) => {
    const items = listOf(a[0]!, "Table.FromList");
    const splitter = a[1];
    const rows: MValue[][] = items.map((item) => {
      if (!splitter || splitter.kind === "null") return [item];
      return listOf(asFunc(splitter, "Table.FromList splitter").call([item]), "splitter result");
    });
    const width = rows.reduce((w, r) => Math.max(w, r.length), 0);
    let columns: string[];
    if (a[2] && a[2].kind === "list") columns = a[2].items.map((c) => textOf(c, "column"));
    else if (a[2] && a[2].kind === "number") columns = Array.from({ length: a[2].value }, (_, i) => `Column${i + 1}`);
    else columns = width <= 1 ? ["Column1"] : Array.from({ length: width }, (_, i) => `Column${i + 1}`);
    return table(columns, rows.map((r) => Array.from({ length: columns.length }, (_, i) => r[i] ?? NULL)));
  }));

  // List.Generate(initial, condition, next, optional selector) - the imperative loop combinator.
  def("List.Generate", fn("List.Generate", [{ name: "initial" }, { name: "condition" }, { name: "next" }, { name: "selector", optional: true }], (a) => {
    const initF = asFunc(a[0], "List.Generate initial");
    const condF = asFunc(a[1], "List.Generate condition");
    const nextF = asFunc(a[2], "List.Generate next");
    const selF = a[3] && a[3].kind === "function" ? a[3] : null;
    const out: MValue[] = [];
    let state = initF.call([]);
    let guard = 0;
    while (logicalTrue(condF.call([state]))) {
      out.push(selF ? selF.call([state]) : state);
      state = nextF.call([state]);
      if (++guard > 1_000_000) err("Expression.Error", "List.Generate: exceeded 1e6 iterations (likely non-terminating).");
    }
    return list(out);
  }));

  // Value.* introspection used in conditional query steps.
  def("Value.Is", fn("Value.Is", [{ name: "value" }, { name: "type" }], (a) => {
    const ty = a[1]!;
    if (ty.kind !== "type") err("Expression.Error", "Value.Is: second argument must be a type.");
    return logical(valueMatchesType(a[0]!, ty.name));
  }));
  def("Value.Type", fn("Value.Type", [{ name: "value" }], (a) => ({ kind: "type", name: a[0]!.kind })));
  // Value.ReplaceType / ReplaceMetadata are used pervasively to document functions; the
  // ascribed type and metadata are advisory here, so the value passes through unchanged.
  def("Value.ReplaceType", fn("Value.ReplaceType", [{ name: "value" }, { name: "type" }], (a) => a[0]!));
  def("Value.ReplaceMetadata", fn("Value.ReplaceMetadata", [{ name: "value" }, { name: "metadata" }], (a) => a[0]!));
  def("Value.Metadata", fn("Value.Metadata", [{ name: "value" }], () => ({ kind: "record", fields: new Map() })));

  def("Function.Invoke", fn("Function.Invoke", [{ name: "function" }, { name: "args" }], (a) => {
    if (a[0]!.kind !== "function") err("Expression.Error", "Function.Invoke: first argument must be a function.");
    return a[0]!.call(a[1]!.kind === "list" ? a[1]!.items : [a[1]!]);
  }));
  // InvokeAfter delays in Excel; deterministic here, so invoke immediately.
  def("Function.InvokeAfter", fn("Function.InvokeAfter", [{ name: "function" }, { name: "delay" }], (a) => {
    if (a[0]!.kind !== "function") err("Expression.Error", "Function.InvokeAfter: first argument must be a function.");
    return a[0]!.call([]);
  }));

  def("Value.FromText", fn("Value.FromText", [{ name: "text" }, { name: "culture", optional: true }], (a) => {
    const s = textOf(a[0]!, "Value.FromText").trim();
    if (s === "") return NULL;
    if (s === "true") return logical(true);
    if (s === "false") return logical(false);
    if (/^-?\d+(\.\d+)?([eE][+-]?\d+)?$/.test(s)) return number(Number(s));
    return text(s);
  }));
  def("Binary.Buffer", fn("Binary.Buffer", [{ name: "binary" }], (a) => a[0]!)); // eager already

  // Expression.Evaluate (dynamic M eval) is deferred: it needs a synchronous parse the async
  // evaluator can't provide inside a sync call, and it's used mainly by test frameworks.
  def("Expression.Identifier", fn("Expression.Identifier", [{ name: "name" }], (a) => text(quoteIdentifier(textOf(a[0]!, "Expression.Identifier")))));
}

/** Quote an identifier that isn't a bare identifier (as Excel's Expression.Identifier does). */
function quoteIdentifier(name: string): string {
  return /^[A-Za-z_][A-Za-z0-9_]*$/.test(name) ? name : `#"${name.replace(/"/g, '""')}"`;
}

function logicalTrue(v: MValue): boolean {
  if (v.kind !== "logical") err("Expression.Error", "Expected a logical value.");
  return v.value;
}

function valueMatchesType(v: MValue, ty: string): boolean {
  switch (ty) {
    case "any": return true;
    case "number": return v.kind === "number";
    case "text": return v.kind === "text";
    case "logical": return v.kind === "logical";
    case "date": return v.kind === "date";
    case "time": return v.kind === "time";
    case "datetime": return v.kind === "datetime";
    case "duration": return v.kind === "duration";
    case "record": return v.kind === "record";
    case "list": return v.kind === "list";
    case "table": return v.kind === "table";
    default: return false;
  }
}


export type { Table };
