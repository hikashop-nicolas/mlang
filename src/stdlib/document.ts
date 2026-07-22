// Document/source parsers: Csv.Document, Json.Document, Lines.*, and the binary-free text
// entry points that let queries process embedded data. From the public reference; the
// CSV/JSON option shapes not covered raise precise errors.
import type { Env } from "../interpret.js";
import { NULL, binary, compare, equals as equalsVal, err, list, logical, number, record, table, text, typeVal, type MFunction, type MType, type MValue } from "../values.js";
import { fn, listOf, textOf, type Table } from "./helpers.js";
import { fromJson } from "../host.js";
import { mtypeOfValue, subtypeOf, typeName, valueMatchesType } from "../types.js";

const asFunc = (v: MValue | undefined, who: string): MFunction => {
  if (!v || v.kind !== "function") err("Expression.Error", `${who}: expected a function.`);
  return v;
};

/** Best-effort runtime locale for the Culture.Current default (host bindings override it). */
function runtimeLocale(): string {
  const nav = (globalThis as { navigator?: { language?: string } }).navigator;
  if (nav?.language) return nav.language;
  try {
    const resolved = Intl.DateTimeFormat().resolvedOptions().locale;
    if (resolved) return resolved;
  } catch { /* Intl unavailable */ }
  return "en-US";
}

/** Coerce to a JS number for Value.* arithmetic (numbers pass; text parses). */
function numberish(v: MValue, who: string): number {
  if (v.kind === "number") return v.value;
  if (v.kind === "text") { const n = Number(v.value); if (!Number.isNaN(n)) return n; }
  err("Expression.Error", `${who}: cannot use a ${v.kind} value in arithmetic.`);
}

/** M value -> plain JS ready for JSON.stringify (used by Json.FromValue). */
function toJsonValue(v: MValue): unknown {
  switch (v.kind) {
    case "null": return null;
    case "logical": return v.value;
    case "number": return v.value;
    case "text": return v.value;
    case "date": return `${String(v.y).padStart(4, "0")}-${String(v.m).padStart(2, "0")}-${String(v.d).padStart(2, "0")}`;
    case "datetime": case "datetimezone": case "time": case "duration": return String(toJsonScalar(v));
    case "list": return v.items.map(toJsonValue);
    case "record": return Object.fromEntries([...v.fields].map(([k, x]) => [k, toJsonValue(x)]));
    case "error": throw v.error;
    default: err("Expression.Error", `Json.FromValue: cannot serialize a ${v.kind} value.`);
  }
}
function toJsonScalar(v: Extract<MValue, { kind: "datetime" | "datetimezone" | "time" | "duration" }>): string {
  if (v.kind === "time") { const t = Math.round(v.secs); return `${String(Math.floor(t / 3600)).padStart(2, "0")}:${String(Math.floor((t % 3600) / 60)).padStart(2, "0")}:${String(t % 60).padStart(2, "0")}`; }
  if (v.kind === "duration") return String(v.secs);
  const date = `${String(v.y).padStart(4, "0")}-${String(v.m).padStart(2, "0")}-${String(v.d).padStart(2, "0")}`;
  const s = Math.floor(v.secs);
  const time = `${String(Math.floor(s / 3600)).padStart(2, "0")}:${String(Math.floor((s % 3600) / 60)).padStart(2, "0")}:${String(s % 60).padStart(2, "0")}`;
  return v.kind === "datetimezone" ? `${date}T${time}` : `${date}T${time}`;
}

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
  // Lines.FromBinary(binary, opt quoteStyle, opt includeLineSeparators, opt encoding): decode
  // then split as Lines.FromText. includeLineSeparators=true keeps the terminator on each line.
  def("Lines.FromBinary", fn("Lines.FromBinary", [{ name: "binary" }, { name: "quoteStyle", optional: true }, { name: "includeLineSeparators", optional: true }, { name: "encoding", optional: true }], (a) => {
    const s = sourceText(a[0]!, "Lines.FromBinary");
    const keep = a[2]?.kind === "logical" && a[2].value;
    if (keep) {
      const parts = s.match(/[^\r\n]*(?:\r\n|\n|\r|$)/g) ?? [];
      if (parts.length > 0 && parts[parts.length - 1] === "") parts.pop();
      return list(parts.map(text));
    }
    const parts = s.split(/\r\n|\n|\r/);
    if (parts.length > 0 && parts[parts.length - 1] === "") parts.pop();
    return list(parts.map(text));
  }));
  def("Lines.ToBinary", fn("Lines.ToBinary", [{ name: "lines" }, { name: "lineSeparator", optional: true }, { name: "encoding", optional: true }, { name: "includeByteOrderMark", optional: true }], (a) => {
    const sep = a[1] ? textOf(a[1], "separator") : "\r\n";
    const s = listOf(a[0]!, "Lines.ToBinary").map((v) => textOf(v, "line")).join(sep);
    return binary(new TextEncoder().encode(s));
  }));

  // Json.FromValue(value, opt encoding) -> UTF-8 binary. Records->objects, lists->arrays,
  // temporal values serialize to their M/ISO text form.
  def("Json.FromValue", fn("Json.FromValue", [{ name: "value" }, { name: "encoding", optional: true }], (a) =>
    binary(new TextEncoder().encode(JSON.stringify(toJsonValue(a[0]!))))));

  // Uri.* — build/escape query strings. M escapes per RFC 3986 (encodeURIComponent, but with
  // "!'()*" also percent-encoded, which Excel does).
  const escapeData = (s: string): string => encodeURIComponent(s).replace(/[!'()*]/g, (c) => "%" + c.charCodeAt(0).toString(16).toUpperCase());
  def("Uri.EscapeDataString", fn("Uri.EscapeDataString", [{ name: "data" }], (a) => text(escapeData(textOf(a[0]!, "Uri.EscapeDataString")))));
  def("Uri.UnescapeDataString", fn("Uri.UnescapeDataString", [{ name: "data" }], (a) => text(decodeURIComponent(textOf(a[0]!, "Uri.UnescapeDataString")))));
  def("Uri.BuildQueryString", fn("Uri.BuildQueryString", [{ name: "query" }], (a) => {
    const rec = a[0]!;
    if (rec.kind !== "record") err("Expression.Error", "Uri.BuildQueryString: expected a record.");
    const parts: string[] = [];
    for (const [k, v] of rec.fields) parts.push(`${escapeData(k)}=${escapeData(v.kind === "text" ? v.value : v.kind === "null" ? "" : String(toJsonValue(v)))}`);
    return text(parts.join("&"));
  }));
  def("Uri.Combine", fn("Uri.Combine", [{ name: "baseUri" }, { name: "relativeUri" }], (a) => {
    const base = textOf(a[0]!, "Uri.Combine"), rel = textOf(a[1]!, "Uri.Combine");
    if (/^[a-z][a-z0-9+.-]*:\/\//i.test(rel)) return text(rel);
    return text(base.replace(/\/+$/, "") + "/" + rel.replace(/^\/+/, ""));
  }));
  def("Uri.Parts", fn("Uri.Parts", [{ name: "absoluteUri" }], (a) => {
    const raw = textOf(a[0]!, "Uri.Parts");
    const withScheme = /^[a-z][a-z0-9+.-]*:\/\//i.test(raw) ? raw : "http://" + raw;
    let u: URL;
    try { u = new URL(withScheme); } catch { err("Expression.Error", `Uri.Parts: "${raw}" is not a valid URI.`); }
    const scheme = u.protocol.replace(/:$/, "");
    const port = u.port ? Number(u.port) : scheme === "https" ? 443 : scheme === "http" ? 80 : scheme === "ftp" ? 21 : -1;
    const query = new Map<string, MValue>();
    for (const [k, v] of u.searchParams) query.set(k, text(v));
    return record([
      ["Scheme", text(scheme)], ["Host", text(u.hostname)], ["Port", number(port)],
      ["Path", text(u.pathname || "/")], ["Query", { kind: "record", fields: query }],
      ["Fragment", text(u.hash.replace(/^#/, ""))], ["UserName", text(decodeURIComponent(u.username))], ["Password", text(decodeURIComponent(u.password))],
    ]);
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
    return logical(valueMatchesType(a[0]!, ty));
  }));
  def("Value.Type", fn("Value.Type", [{ name: "value" }], (a) => typeVal(mtypeOfValue(a[0]!))));
  // Value.ReplaceType / ReplaceMetadata are used pervasively to document functions; the
  // ascribed type and metadata are advisory here, so the value passes through unchanged.
  def("Value.ReplaceType", fn("Value.ReplaceType", [{ name: "value" }, { name: "type" }], (a) => a[0]!));
  def("Value.ReplaceMetadata", fn("Value.ReplaceMetadata", [{ name: "value" }, { name: "metadata" }], (a) => a[0]!));
  def("Value.Metadata", fn("Value.Metadata", [{ name: "value" }], () => ({ kind: "record", fields: new Map() })));

  // Value.Add/Subtract/Multiply/Divide: arithmetic that respects the precision argument's
  // presence but computes plainly here; null with anything is null (spec).
  const arith = (name: string, op: (x: number, y: number) => number): void =>
    def(name, fn(name, [{ name: "value1" }, { name: "value2" }, { name: "precision", optional: true }], (a) => {
      if (a[0]!.kind === "null" || a[1]!.kind === "null") return NULL;
      return number(op(numberish(a[0]!, name), numberish(a[1]!, name)));
    }));
  arith("Value.Add", (x, y) => x + y);
  arith("Value.Subtract", (x, y) => x - y);
  arith("Value.Multiply", (x, y) => x * y);
  arith("Value.Divide", (x, y) => x / y);
  def("Value.Compare", fn("Value.Compare", [{ name: "value1" }, { name: "value2" }, { name: "comparer", optional: true }], (a) => {
    const x = a[0]!, y = a[1]!;
    if (x.kind === "null" && y.kind === "null") return number(0);
    if (x.kind === "null") return number(-1);
    if (y.kind === "null") return number(1);
    const c = compare(x, y);
    return number(c < 0 ? -1 : c > 0 ? 1 : 0);
  }));
  def("Value.Equals", fn("Value.Equals", [{ name: "value1" }, { name: "value2" }, { name: "comparer", optional: true }], (a) => logical(equalsVal(a[0]!, a[1]!))));
  def("Value.NullableEquals", fn("Value.NullableEquals", [{ name: "value1" }, { name: "value2" }, { name: "comparer", optional: true }], (a) =>
    a[0]!.kind === "null" || a[1]!.kind === "null" ? NULL : logical(equalsVal(a[0]!, a[1]!))));
  def("Value.As", fn("Value.As", [{ name: "value" }, { name: "type" }], (a) => {
    const ty = a[1]!;
    if (ty.kind !== "type") err("Expression.Error", "Value.As: second argument must be a type.");
    if (!valueMatchesType(a[0]!, ty)) err("Expression.Error", "Value.As: value is not compatible with the given type.");
    return a[0]!;
  }));
  def("Value.RemoveMetadata", fn("Value.RemoveMetadata", [{ name: "value" }], (a) => a[0]!));

  def("Comparer.Equals", fn("Comparer.Equals", [{ name: "comparer" }, { name: "x" }, { name: "y" }], (a) => {
    // comparer(x,y)==0 means equal; if a plain comparer function was passed, honour it.
    if (a[0]!.kind === "function") { const r = a[0]!.call([a[1]!, a[2]!]); return logical(r.kind === "number" ? r.value === 0 : equalsVal(a[1]!, a[2]!)); }
    return logical(equalsVal(a[1]!, a[2]!));
  }));
  def("Comparer.FromCulture", fn("Comparer.FromCulture", [{ name: "culture" }, { name: "ignoreCase", optional: true }], (a) => {
    const ignore = a[1]?.kind === "logical" && a[1].value;
    return fn("comparer", [{ name: "x" }, { name: "y" }], (b) => {
      const x = textOf(b[0]!, "comparer"), y = textOf(b[1]!, "comparer");
      const [xx, yy] = ignore ? [x.toLowerCase(), y.toLowerCase()] : [x, y];
      return number(xx < yy ? -1 : xx > yy ? 1 : 0);
    });
  }));
  // Function.IsDataSource: whether a function is a data-source access; unknown here -> false.
  def("Function.IsDataSource", fn("Function.IsDataSource", [{ name: "function" }], () => logical(false)));
  // Function.From(functionType, handler): a variadic function whose args are handed to the
  // handler as one list. The type only informs the signature, which is open here.
  def("Function.From", fn("Function.From", [{ name: "functionType" }, { name: "function" }], (a) => {
    const handler = a[1];
    if (!handler || handler.kind !== "function") err("Expression.Error", "Function.From: second argument must be a function.");
    return { kind: "function", name: "Function.From", params: [], call: (args) => handler.call([list(args)]) };
  }));
  // Culture.Current: the host culture (an M intrinsic value). The app should inject its own
  // via HostBindings (which override the stdlib); absent that, fall back to the runtime locale
  // (browser navigator.language / Node process locale), then to en-US.
  def("Culture.Current", text(runtimeLocale()));

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

  // --- Type.* --------------------------------------------------------------------------
  const asType = (v: MValue | undefined, who: string): MType => {
    if (!v || v.kind !== "type") err("Expression.Error", `${who}: expected a type value.`);
    return v;
  };
  def("Type.Is", fn("Type.Is", [{ name: "type" }, { name: "candidate" }], (a) => logical(subtypeOf(asType(a[0], "Type.Is"), asType(a[1], "Type.Is")))));
  def("Type.IsNullable", fn("Type.IsNullable", [{ name: "type" }], (a) => logical(!!asType(a[0], "Type.IsNullable").nullable)));
  def("Type.NonNullable", fn("Type.NonNullable", [{ name: "type" }], (a) => typeVal({ ...asType(a[0], "Type.NonNullable"), nullable: false })));
  def("Type.ListItem", fn("Type.ListItem", [{ name: "type" }], (a) => typeVal(asType(a[0], "Type.ListItem").item ?? { name: "any" })));
  def("Type.TableColumn", fn("Type.TableColumn", [{ name: "type" }, { name: "column" }], (a) => {
    const t = asType(a[0], "Type.TableColumn");
    const col = t.columns?.find((c) => c.name === textOf(a[1]!, "column"));
    if (!col) err("Expression.Error", `Type.TableColumn: no column '${textOf(a[1]!, "column")}'.`);
    return typeVal(col.type);
  }));

  // --- Function types --------------------------------------------------------------------
  def("Type.FunctionReturn", fn("Type.FunctionReturn", [{ name: "type" }], (a) => typeVal(asType(a[0], "Type.FunctionReturn").returnType ?? { name: "any" })));
  def("Type.FunctionParameters", fn("Type.FunctionParameters", [{ name: "type" }], (a) => {
    const params = asType(a[0], "Type.FunctionParameters").parameters ?? [];
    return { kind: "record", fields: new Map(params.map((p) => [p.name, typeVal(p.type)])) };
  }));
  def("Type.FunctionRequiredParameters", fn("Type.FunctionRequiredParameters", [{ name: "type" }], (a) => {
    const t = asType(a[0], "Type.FunctionRequiredParameters");
    return number(t.requiredParameters ?? (t.parameters ?? []).filter((p) => !p.optional).length);
  }));
  def("Type.ForFunction", fn("Type.ForFunction", [{ name: "signature" }, { name: "min" }], (a) => {
    const sig = a[0]!;
    if (sig.kind !== "record") err("Expression.Error", "Type.ForFunction: signature must be a record.");
    const min = a[1]!.kind === "number" ? a[1]!.value : err("Expression.Error", "Type.ForFunction: min must be a number.");
    const retV = sig.fields.get("ReturnType"); const paramsV = sig.fields.get("Parameters");
    const paramEntries = paramsV?.kind === "record" ? [...paramsV.fields] : [];
    const parameters = paramEntries.map(([name, t], i) => ({ name, type: asType(t, "Type.ForFunction parameter"), optional: i >= min }));
    return typeVal({ name: "function", parameters, returnType: retV ? asType(retV, "Type.ForFunction ReturnType") : { name: "any" }, requiredParameters: min });
  }));

  // --- Record types ----------------------------------------------------------------------
  def("Type.RecordFields", fn("Type.RecordFields", [{ name: "type" }], (a) => {
    const fields = asType(a[0], "Type.RecordFields").fields ?? [];
    return { kind: "record", fields: new Map(fields.map((f) => [f.name, record([["Type", typeVal(f.type)], ["Optional", logical(!!f.optional)]])])) };
  }));
  def("Type.ForRecord", fn("Type.ForRecord", [{ name: "fields" }, { name: "open" }], (a) => {
    const rec = a[0]!;
    if (rec.kind !== "record") err("Expression.Error", "Type.ForRecord: fields must be a record.");
    const fields = [...rec.fields].map(([name, spec]) => {
      if (spec.kind !== "record") err("Expression.Error", "Type.ForRecord: each field must be a [Type=..., Optional=...] record.");
      return { name, type: asType(spec.fields.get("Type"), "Type.ForRecord Type"), optional: logicalTrue(spec.fields.get("Optional") ?? logical(false)) };
    });
    return typeVal({ name: "record", fields, open: logicalTrue(a[1]!) });
  }));
  def("Type.OpenRecord", fn("Type.OpenRecord", [{ name: "type" }], (a) => typeVal({ ...asType(a[0], "Type.OpenRecord"), open: true })));
  def("Type.ClosedRecord", fn("Type.ClosedRecord", [{ name: "type" }], (a) => typeVal({ ...asType(a[0], "Type.ClosedRecord"), open: false })));
  def("Type.IsOpenRecord", fn("Type.IsOpenRecord", [{ name: "type" }], (a) => {
    const t = asType(a[0], "Type.IsOpenRecord");
    if (t.name !== "record") err("Expression.Error", "Type.IsOpenRecord: expected a record type.");
    return logical(!!t.open);
  }));

  // --- Table types -----------------------------------------------------------------------
  def("Type.TableRow", fn("Type.TableRow", [{ name: "type" }], (a) => {
    const t = asType(a[0], "Type.TableRow");
    return typeVal({ name: "record", fields: (t.columns ?? []).map((c) => ({ name: c.name, type: c.type, optional: false })), open: false });
  }));
  def("Type.TableSchema", fn("Type.TableSchema", [{ name: "tableType" }], (a) => {
    const t = asType(a[0], "Type.TableSchema");
    const cols = ["Name", "Position", "TypeName", "Kind", "IsNullable"];
    const rows = (t.columns ?? []).map((c, i) => [text(c.name), number(i), text(typeName(c.type)), text(c.type.name), logical(!!c.type.nullable)]);
    return table(cols, rows);
  }));
  def("Type.TableKeys", fn("Type.TableKeys", [{ name: "type" }], (a) => {
    const keys = asType(a[0], "Type.TableKeys").keys ?? [];
    return list(keys.map((k) => record([["Columns", list(k.columns.map(text))], ["Primary", logical(k.primary)]])));
  }));
  def("Type.AddTableKey", fn("Type.AddTableKey", [{ name: "type" }, { name: "columns" }, { name: "isPrimary" }], (a) => {
    const t = asType(a[0], "Type.AddTableKey");
    const cols = listOf(a[1]!, "Type.AddTableKey columns").map((c) => textOf(c, "column"));
    return typeVal({ ...t, keys: [...(t.keys ?? []), { columns: cols, primary: logicalTrue(a[2]!) }] });
  }));
  def("Type.ReplaceTableKeys", fn("Type.ReplaceTableKeys", [{ name: "type" }, { name: "keys" }], (a) => {
    const t = asType(a[0], "Type.ReplaceTableKeys");
    const keys = listOf(a[1]!, "Type.ReplaceTableKeys keys").map((k) => {
      if (k.kind !== "record") err("Expression.Error", "Type.ReplaceTableKeys: each key must be a record.");
      return { columns: listOf(k.fields.get("Columns") ?? list([]), "Columns").map((c) => textOf(c, "column")), primary: logicalTrue(k.fields.get("Primary") ?? logical(false)) };
    });
    return typeVal({ ...t, keys });
  }));

  // --- Facets & union --------------------------------------------------------------------
  def("Type.Facets", fn("Type.Facets", [{ name: "type" }], (a) => asType(a[0], "Type.Facets").facets ?? { kind: "record", fields: new Map() }));
  def("Type.ReplaceFacets", fn("Type.ReplaceFacets", [{ name: "type" }, { name: "facets" }], (a) => {
    const facets = a[1]!;
    if (facets.kind !== "record") err("Expression.Error", "Type.ReplaceFacets: facets must be a record.");
    return typeVal({ ...asType(a[0], "Type.ReplaceFacets"), facets });
  }));
  def("Type.Union", fn("Type.Union", [{ name: "types" }], (a) => {
    const types = listOf(a[0]!, "Type.Union").map((t) => asType(t, "Type.Union"));
    if (!types.length) return typeVal({ name: "none" });
    const first = types[0]!;
    const uniform = types.every((t) => t.name === first.name && !!t.nullable === !!first.nullable);
    return typeVal(uniform ? first : { name: "any" });
  }));
}

/** Quote an identifier that isn't a bare identifier (as Excel's Expression.Identifier does). */
function quoteIdentifier(name: string): string {
  return /^[A-Za-z_][A-Za-z0-9_]*$/.test(name) ? name : `#"${name.replace(/"/g, '""')}"`;
}

function logicalTrue(v: MValue): boolean {
  if (v.kind !== "logical") err("Expression.Error", "Expected a logical value.");
  return v.value;
}

export type { Table };
