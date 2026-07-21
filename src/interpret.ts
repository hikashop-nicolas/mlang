// Tree-walking evaluator over @microsoft/powerquery-parser's AST. Semantics follow the
// public M specification: let bindings are lazy, memoized and mutually recursive; errors
// propagate until try...otherwise; null propagates through arithmetic; three-valued and/or.
// The parser AST is consumed structurally (one place to adapt if its shape changes).

import { MError, NULL, date, datetime, duration, err, equals, compare, logical, number, text, time, rowRecord, type MFunction, type MValue } from "./values.js";
import { civilFromDays, daysFromCivil } from "./temporal.js";

// Minimal structural view of parser nodes; every access goes through helpers below.
interface Node {
  kind: string;
  [key: string]: unknown;
}
const asNode = (v: unknown): Node => v as Node;
const child = (n: Node, key: string): Node => asNode(n[key]);
/** Unwrap ArrayWrapper<Csv<T>> into the T nodes. */
function csvNodes(wrapper: unknown): Node[] {
  const w = asNode(wrapper);
  if (!w || !Array.isArray(w.elements)) return [];
  return (w.elements as Node[]).map((c) => child(c, "node"));
}

// --- environments -------------------------------------------------------------

interface Thunk {
  forced?: MValue;
  forcing?: boolean;
  compute?: () => MValue;
}

export class Env {
  private vars = new Map<string, Thunk>();
  constructor(private parent: Env | null = null) {}
  child(): Env {
    return new Env(this);
  }
  define(name: string, compute: () => MValue): void {
    this.vars.set(name, { compute });
  }
  defineValue(name: string, value: MValue): void {
    this.vars.set(name, { forced: value });
  }
  lookup(name: string): MValue {
    const t = this.vars.get(name);
    if (!t) {
      if (this.parent) return this.parent.lookup(name);
      err("Expression.Error", `The name '${name}' wasn't recognized.`);
    }
    if (t.forced !== undefined) return t.forced;
    if (t.forcing) err("Expression.Error", `Cyclic reference to '${name}'.`);
    t.forcing = true;
    try {
      t.forced = t.compute!();
    } finally {
      t.forcing = false;
    }
    return t.forced;
  }
  has(name: string): boolean {
    return this.vars.has(name) || (this.parent?.has(name) ?? false);
  }
}

// --- literal decoding ----------------------------------------------------------

/** Unquote an M text literal: strip quotes, "" doubling, #(lf)/#(cr)/#(tab)/#(#)/#(hex). */
export function decodeTextLiteral(raw: string): string {
  let s = raw.startsWith('"') && raw.endsWith('"') ? raw.slice(1, -1) : raw;
  s = s.replace(/""/g, '"');
  return s.replace(/#\(([^)]*)\)/g, (_, esc: string) =>
    esc
      .split(",")
      .map((e) => {
        const k = e.trim();
        if (k === "lf") return "\n";
        if (k === "cr") return "\r";
        if (k === "tab") return "\t";
        if (k === "#") return "#";
        if (/^[0-9A-Fa-f]{4,8}$/.test(k)) return String.fromCodePoint(parseInt(k, 16));
        return `#(${k})`;
      })
      .join(""),
  );
}

/** Normalize identifiers: #"quoted name" -> quoted name. */
export function decodeIdentifier(raw: string): string {
  if (raw.startsWith('#"')) return decodeTextLiteral(raw.slice(1));
  return raw;
}

// --- the evaluator ---------------------------------------------------------------

export function evalNode(n: Node, env: Env): MValue {
  switch (n.kind) {
    case "LiteralExpression": {
      const raw = n.literal as string;
      switch (n.literalKind) {
        case "Numeric": return number(Number(raw));
        case "Text": return text(decodeTextLiteral(raw));
        case "Logical": return logical(raw === "true");
        case "Null": return NULL;
        default: err("Expression.Error", `Unsupported literal kind ${String(n.literalKind)}`);
      }
    }
    case "IdentifierExpression":
      return env.lookup(decodeIdentifier(child(n, "identifier").literal as string));
    case "Identifier":
      return env.lookup(decodeIdentifier(n.literal as string));
    case "ParenthesizedExpression":
      return evalNode(child(n, "content"), env);
    case "LetExpression": {
      const scope = env.child();
      for (const pair of csvNodes(n.variableList)) {
        const name = decodeIdentifier(child(pair, "key").literal as string);
        const valueNode = child(pair, "value");
        scope.define(name, () => evalNode(valueNode, scope));
      }
      return evalNode(child(n, "expression"), scope);
    }
    case "IfExpression": {
      const cond = evalNode(child(n, "condition"), env);
      if (cond.kind !== "logical") err("Expression.Error", "The if condition must be logical.");
      return cond.value ? evalNode(child(n, "trueExpression"), env) : evalNode(child(n, "falseExpression"), env);
    }
    case "RecordExpression": {
      const fields = new Map<string, MValue>();
      for (const pair of csvNodes(n.content)) {
        fields.set(decodeIdentifier(child(pair, "key").literal as string), evalNode(child(pair, "value"), env));
      }
      return { kind: "record", fields };
    }
    case "ListExpression": {
      const items: MValue[] = [];
      for (const el of csvNodes(n.content)) {
        if (el.kind === "RangeExpression") {
          const lo = expectNumber(evalNode(child(el, "left"), env));
          const hi = expectNumber(evalNode(child(el, "right"), env));
          for (let i = lo; i <= hi; i++) items.push(number(i));
        } else {
          items.push(evalNode(el, env));
        }
      }
      return { kind: "list", items };
    }
    case "EachExpression": {
      const body = child(n, "paired");
      const fn: MFunction = {
        kind: "function",
        params: [{ name: "_", optional: false }],
        call: (args) => {
          const scope = env.child();
          scope.defineValue("_", args[0] ?? NULL);
          return evalNode(body, scope);
        },
      };
      return fn;
    }
    case "FunctionExpression": {
      const params = csvNodes(child(n, "parameters").content).map((p) => ({
        name: decodeIdentifier(child(p, "name").literal as string),
        optional: p.optionalConstant !== undefined,
      }));
      const body = child(n, "expression");
      const fn: MFunction = {
        kind: "function",
        params,
        call: (args) => {
          const required = params.filter((p) => !p.optional).length;
          if (args.length < required) err("Expression.Error", `${args.length} arguments passed to a function which expects at least ${required}.`);
          const scope = env.child();
          params.forEach((p, i) => scope.defineValue(p.name, args[i] ?? NULL));
          return evalNode(body, scope);
        },
      };
      return fn;
    }
    case "RecursivePrimaryExpression": {
      let v = evalNode(child(n, "head"), env);
      for (const step of (child(n, "recursiveExpressions").elements as Node[]) ?? []) {
        v = applyStep(v, step, env);
      }
      return v;
    }
    case "FieldSelector":
      // Standalone [Field] selects from the implicit each-parameter `_`.
      return fieldAccess(env.lookup("_"), n, env);
    case "ItemAccessExpression":
      return itemAccess(env.lookup("_"), n, env);
    case "ErrorHandlingExpression": {
      const handler = n.handler ? asNode(n.handler) : null;
      const bareTry = !handler || handler.kind !== "OtherwiseExpression";
      try {
        const v = evalNode(child(n, "protectedExpression"), env);
        if (!bareTry) return v;
        // Bare try wraps success too: {HasError = false, Value = v} (spec).
        const fields = new Map<string, MValue>();
        fields.set("HasError", logical(false));
        fields.set("Value", v);
        return { kind: "record", fields };
      } catch (e) {
        if (!(e instanceof MError)) throw e;
        if (!bareTry) return evalNode(child(handler!, "paired"), env);
        const fields = new Map<string, MValue>();
        fields.set("HasError", logical(true));
        fields.set("Error", e.toRecord());
        return { kind: "record", fields };
      }
    }
    case "ErrorRaisingExpression": {
      const v = evalNode(child(n, "paired"), env);
      if (v.kind === "record") {
        const msg = v.fields.get("Message");
        const reason = v.fields.get("Reason");
        err(reason?.kind === "text" ? reason.value : "Expression.Error", msg?.kind === "text" ? msg.value : "error", v.fields.get("Detail"));
      }
      err("Expression.Error", v.kind === "text" ? v.value : "error");
    }
    case "UnaryExpression": {
      let v = evalNode(child(n, "typeExpression"), env);
      const ops = (child(n, "operators").elements as Node[]) ?? [];
      for (let i = ops.length - 1; i >= 0; i--) {
        const op = ops[i]!.constantKind;
        if (op === "-") v = v.kind === "null" ? NULL : v.kind === "duration" ? duration(-v.secs) : number(-expectNumber(v));
        else if (op === "+") v = v.kind === "null" ? NULL : number(+expectNumber(v));
        else if (op === "not") {
          if (v.kind === "null") v = NULL;
          else if (v.kind === "logical") v = logical(!v.value);
          else err("Expression.Error", "not expects a logical value.");
        }
      }
      return v;
    }
    case "ArithmeticExpression":
      return arithmetic(n, env);
    case "EqualityExpression": {
      const op = child(n, "operatorConstant").constantKind;
      const eq = equals(evalNode(child(n, "left"), env), evalNode(child(n, "right"), env));
      return logical(op === "=" ? eq : !eq);
    }
    case "RelationalExpression": {
      const op = child(n, "operatorConstant").constantKind as string;
      const c = compare(evalNode(child(n, "left"), env), evalNode(child(n, "right"), env));
      return logical(op === "<" ? c < 0 : op === "<=" ? c <= 0 : op === ">" ? c > 0 : c >= 0);
    }
    case "LogicalExpression": {
      // Three-valued, short-circuit per spec.
      const op = child(n, "operatorConstant").constantKind;
      const l = evalNode(child(n, "left"), env);
      if (op === "and") {
        if (l.kind === "logical" && !l.value) return logical(false);
        const r = evalNode(child(n, "right"), env);
        if (r.kind === "logical" && !r.value) return logical(false);
        if (l.kind === "null" || r.kind === "null") return NULL;
        return logical(expectLogical(l) && expectLogical(r));
      }
      if (l.kind === "logical" && l.value) return logical(true);
      const r = evalNode(child(n, "right"), env);
      if (r.kind === "logical" && r.value) return logical(true);
      if (l.kind === "null" || r.kind === "null") return NULL;
      return logical(expectLogical(l) || expectLogical(r));
    }
    case "AsExpression":
      // Tier 0: type ascription is a pass-through (FIDELITY: no runtime assert yet).
      return evalNode(child(n, "left"), env);
    case "IsExpression": {
      const v = evalNode(child(n, "left"), env);
      const t = typeOfNode(child(n, "right"));
      return logical(matchesPrimitive(v, t));
    }
    case "MetadataExpression":
      // `value meta record` - the metadata is advisory; evaluate and return the value.
      return evalNode(child(n, "left"), env);
    case "TypePrimaryType": {
      const paired = child(n, "paired");
      // `type table [Col = t, ...]` - encode the column names so #table can consume it.
      if (paired.kind === "TableType") {
        const specs = tableTypeFields(paired);
        return { kind: "type", name: `table:${specs.join("\t")}` };
      }
      return { kind: "type", name: primitiveName(paired) };
    }
    case "PrimitiveType":
      return { kind: "type", name: primitiveName(n) };
    case "NotImplementedExpression":
      err("Expression.Error", "Not implemented (...)");
    default:
      err("Expression.Error", `mlang: unsupported syntax '${n.kind}'`);
  }
}

function applyStep(v: MValue, step: Node, env: Env): MValue {
  switch (step.kind) {
    case "InvokeExpression": {
      if (v.kind !== "function") err("Expression.Error", "Invocation target is not a function.");
      const args = csvNodes(step.content).map((a) => evalNode(a, env));
      return v.call(args);
    }
    case "ItemAccessExpression":
      return itemAccess(v, step, env);
    case "FieldSelector":
      return fieldAccess(v, step, env);
    case "FieldProjection": {
      if (v.kind !== "record") err("Expression.Error", "Field projection expects a record.");
      const fields = new Map<string, MValue>();
      for (const sel of csvNodes(step.content)) {
        const name = decodeIdentifier(child(sel, "content").literal as string);
        const fv = v.fields.get(name);
        if (fv === undefined && step.optionalConstant === undefined) err("Expression.Error", `The field '${name}' of the record wasn't found.`);
        fields.set(name, fv ?? NULL);
      }
      return { kind: "record", fields };
    }
    default:
      err("Expression.Error", `mlang: unsupported access '${step.kind}'`);
  }
}

function itemAccess(v: MValue, step: Node, env: Env): MValue {
  const optional = step.optionalConstant !== undefined;
  const key = evalNode(child(step, "content"), env);
  if (v.kind === "list") {
    if (key.kind !== "number") err("Expression.Error", "List indexer must be a number.");
    const item = v.items[key.value];
    if (item === undefined) {
      if (optional) return NULL;
      err("Expression.Error", "The index is outside the bounds of the list.");
    }
    return item;
  }
  if (v.kind === "table") {
    if (key.kind === "number") {
      if (key.value < 0 || key.value >= v.rows.length) {
        if (optional) return NULL;
        err("Expression.Error", "The index is outside the bounds of the table.");
      }
      return rowRecord(v, key.value);
    }
    if (key.kind === "record") {
      // Row-matching selector: t{[Name="x"]} -> the single matching row record.
      const idx: number[] = [];
      for (let i = 0; i < v.rows.length; i++) {
        let ok = true;
        for (const [k, want] of key.fields) {
          const ci = v.columns.indexOf(k);
          if (ci < 0 || !equals(v.rows[i]![ci] ?? NULL, want)) {
            ok = false;
            break;
          }
        }
        if (ok) idx.push(i);
      }
      if (idx.length === 1) return rowRecord(v, idx[0]!);
      if (idx.length === 0 && optional) return NULL;
      err("Expression.Error", idx.length === 0 ? "The key didn't match any rows in the table." : "The key matched more than one row in the table.");
    }
  }
  err("Expression.Error", `Cannot index a ${v.kind} value.`);
}

function fieldAccess(v: MValue, step: Node, env: Env): MValue {
  void env;
  const optional = step.optionalConstant !== undefined;
  const name = decodeIdentifier(child(step, "content").literal as string);
  if (v.kind === "record") {
    const fv = v.fields.get(name);
    if (fv === undefined) {
      if (optional) return NULL;
      err("Expression.Error", `The field '${name}' of the record wasn't found.`);
    }
    return fv;
  }
  if (v.kind === "table") {
    // table[Column] -> that column as a list (per spec's table field access).
    const ci = v.columns.indexOf(name);
    if (ci < 0) {
      if (optional) return NULL;
      err("Expression.Error", `The column '${name}' of the table wasn't found.`);
    }
    return { kind: "list", items: v.rows.map((r) => r[ci] ?? NULL) };
  }
  if (v.kind === "null") return NULL; // null propagates through field access (spec: null[F] is error; PQ steps rely on ? — keep strict? FIDELITY)
  err("Expression.Error", `Cannot access field '${name}' on a ${v.kind} value.`);
}

function arithmetic(n: Node, env: Env): MValue {
  const op = child(n, "operatorConstant").constantKind as string;
  const l = evalNode(child(n, "left"), env);
  const r = evalNode(child(n, "right"), env);
  if (l.kind === "null" || r.kind === "null") return NULL; // null propagates (spec)
  if (op === "&") {
    if (l.kind === "text" && r.kind === "text") return text(l.value + r.value);
    if (l.kind === "list" && r.kind === "list") return { kind: "list", items: [...l.items, ...r.items] };
    if (l.kind === "record" && r.kind === "record") {
      const fields = new Map(l.fields);
      for (const [k, v2] of r.fields) fields.set(k, v2);
      return { kind: "record", fields };
    }
    if (l.kind === "date" && r.kind === "time") return datetime(l.y, l.m, l.d, r.secs); // date & time -> datetime
    err("Expression.Error", `Cannot apply & to ${l.kind} and ${r.kind}.`);
  }

  const temporal = temporalArithmetic(op, l, r);
  if (temporal) return temporal;

  const a = expectNumber(l);
  const b = expectNumber(r);
  switch (op) {
    case "+": return number(a + b);
    case "-": return number(a - b);
    case "*": return number(a * b);
    case "/":
      // IEEE754 like the real engine: 1/0 = #infinity, 0/0 = #nan (oracle-confirmed).
      return number(a / b);
    default:
      err("Expression.Error", `Unsupported operator ${op}`);
  }
}

// Temporal operator combinations per the spec's operator tables; null when not temporal.
function temporalArithmetic(op: string, l: MValue, r: MValue): MValue | null {
  const dtSecs = (v: Extract<MValue, { kind: "date" } | { kind: "datetime" }>): number =>
    daysFromCivil(v.y, v.m, v.d) * 86400 + (v.kind === "datetime" ? v.secs : 0);
  const fromSecs = (total: number, asDate: boolean): MValue => {
    const days = Math.floor(total / 86400);
    const secs = total - days * 86400;
    const c = civilFromDays(days);
    return asDate ? date(c.y, c.m, c.d) : datetime(c.y, c.m, c.d, secs);
  };
  if (op === "+") {
    if ((l.kind === "date" || l.kind === "datetime") && r.kind === "duration") return fromSecs(dtSecs(l) + r.secs, l.kind === "date");
    if (l.kind === "duration" && (r.kind === "date" || r.kind === "datetime")) return fromSecs(dtSecs(r) + l.secs, r.kind === "date");
    if (l.kind === "time" && r.kind === "duration") return time(((l.secs + r.secs) % 86400 + 86400) % 86400);
    if (l.kind === "duration" && r.kind === "time") return time(((r.secs + l.secs) % 86400 + 86400) % 86400);
    if (l.kind === "duration" && r.kind === "duration") return duration(l.secs + r.secs);
    return null;
  }
  if (op === "-") {
    if ((l.kind === "date" || l.kind === "datetime") && (r.kind === "date" || r.kind === "datetime") && l.kind === r.kind)
      return duration(dtSecs(l) - dtSecs(r));
    if ((l.kind === "date" || l.kind === "datetime") && r.kind === "duration") return fromSecs(dtSecs(l) - r.secs, l.kind === "date");
    if (l.kind === "time" && r.kind === "time") return duration(l.secs - r.secs);
    if (l.kind === "time" && r.kind === "duration") return time(((l.secs - r.secs) % 86400 + 86400) % 86400);
    if (l.kind === "duration" && r.kind === "duration") return duration(l.secs - r.secs);
    return null;
  }
  if (op === "*") {
    if (l.kind === "duration" && r.kind === "number") return duration(l.secs * r.value);
    if (l.kind === "number" && r.kind === "duration") return duration(l.value * r.secs);
    return null;
  }
  if (op === "/") {
    if (l.kind === "duration" && r.kind === "number") return duration(l.secs / r.value);
    if (l.kind === "duration" && r.kind === "duration") return number(l.secs / r.secs);
    return null;
  }
  return null;
}

const expectNumber = (v: MValue): number => {
  if (v.kind !== "number") err("Expression.Error", `Expected a number, got ${v.kind}.`);
  return v.value;
};
const expectLogical = (v: MValue): boolean => {
  if (v.kind !== "logical") err("Expression.Error", `Expected a logical, got ${v.kind}.`);
  return v.value;
};

const primitiveName = (n: Node): string => (n.primitiveTypeKind as string) ?? "any";

/** Column names from a `table [Col = t, ...]` type node (decoding #"quoted" identifiers). */
function tableTypeFields(tableType: Node): string[] {
  const list = asNode(tableType.rowType ?? tableType.fields ?? tableType.content);
  // Walk to the FieldSpecificationList's ArrayWrapper of FieldSpecification nodes.
  const specs: Node[] = [];
  const collect = (node: unknown): void => {
    const nd = node as Node;
    if (!nd || typeof nd !== "object") return;
    if (nd.kind === "FieldSpecification") specs.push(nd);
    for (const v of Object.values(nd)) {
      if (Array.isArray(v)) v.forEach((x) => collect((x as Node)?.node ?? x));
      else if (v && typeof v === "object") collect(v);
    }
  };
  collect(list.elements ? list : tableType);
  return specs.map((s) => decodeIdentifier(child(s, "name").literal as string));
}
const typeOfNode = (n: Node): string => (n.kind === "PrimitiveType" ? primitiveName(n) : n.kind === "NullablePrimitiveType" ? primitiveName(child(n, "paired")) : "any");

function matchesPrimitive(v: MValue, t: string): boolean {
  switch (t) {
    case "any": return true;
    case "null": return v.kind === "null";
    case "logical": return v.kind === "logical";
    case "number": return v.kind === "number";
    case "text": return v.kind === "text";
    case "list": return v.kind === "list";
    case "record": return v.kind === "record";
    case "table": return v.kind === "table";
    case "function": return v.kind === "function";
    case "date": return v.kind === "date";
    case "time": return v.kind === "time";
    case "datetime": return v.kind === "datetime";
    case "duration": return v.kind === "duration";
    case "binary": return v.kind === "binary";
    default: return false;
  }
}

// --- section documents -----------------------------------------------------------

/** Evaluate a section document: every member becomes a lazy binding; returns the member map. */
export function evalSection(sectionAst: Node, env: Env): Map<string, () => MValue> {
  const out = new Map<string, () => MValue>();
  const scope = env.child();
  const members = (child(sectionAst, "sectionMembers").elements as Node[]) ?? [];
  for (const m of members) {
    const pair = child(m, "namePairedExpression");
    const name = decodeIdentifier(child(pair, "key").literal as string);
    const valueNode = child(pair, "value");
    scope.define(name, () => evalNode(valueNode, scope));
    out.set(name, () => scope.lookup(name));
  }
  return out;
}
