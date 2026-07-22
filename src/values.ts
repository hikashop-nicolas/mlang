// The M value model. Clean-room: shapes and semantics follow the public Power Query M
// specification only. Errors are raised as MError exceptions and propagate until caught by
// try...otherwise (ErrorHandlingExpression), matching the spec's error model.

export type MValue =
  | { kind: "null" }
  | { kind: "logical"; value: boolean }
  | { kind: "number"; value: number }
  | { kind: "text"; value: string }
  | { kind: "date"; y: number; m: number; d: number }
  | { kind: "time"; secs: number } // seconds since midnight (fractional)
  | { kind: "datetime"; y: number; m: number; d: number; secs: number }
  | { kind: "duration"; secs: number } // fractional seconds, may be negative
  | { kind: "datetimezone"; y: number; m: number; d: number; secs: number; offset: number } // offset in minutes
  | { kind: "binary"; bytes: Uint8Array }
  | { kind: "list"; items: MValue[] }
  | { kind: "record"; fields: Map<string, MValue> } // insertion-ordered
  | { kind: "table"; columns: string[]; rows: MValue[][]; types?: Map<string, MType> }
  | { kind: "error"; error: MError } // a contained error value (e.g. an errored table cell)
  | MFunction
  | MTypeValue;

/** Structured M type. `name` is the primitive kind; the optional fields describe compound
    types. `ascription` preserves the surface name (e.g. Int64.Type) for reporting. */
export interface MType {
  name: string; // any | none | null | logical | number | text | binary | date | time | datetime | datetimezone | duration | list | record | table | function | type
  nullable?: boolean;
  ascription?: string;
  item?: MType; // list item type
  columns?: { name: string; type: MType }[]; // table columns
  fields?: { name: string; type: MType; optional?: boolean }[]; // record fields
  open?: boolean; // open record type
  parameters?: { name: string; type: MType; optional: boolean }[]; // function parameters
  returnType?: MType; // function return type
  requiredParameters?: number; // minimum arguments to invoke a function type
  facets?: MValue; // advisory facet record (Type.Facets / Type.ReplaceFacets)
  keys?: { columns: string[]; primary: boolean }[]; // table-type keys
  union?: MType[]; // member types of a union type (name === "union")
}
export type MTypeValue = { kind: "type" } & MType;

export interface MFunction {
  kind: "function";
  /** Required-first parameter list; natives may accept fewer args than params.length. */
  params: { name: string; optional: boolean }[];
  /** Native implementation, or undefined for closures (interpreter fills `call`). */
  call: (args: MValue[]) => MValue;
  name?: string;
}

export class MError extends Error {
  constructor(
    public reason: string,
    message: string,
    public detail?: MValue,
  ) {
    super(message);
  }
  toRecord(): MValue {
    const fields = new Map<string, MValue>();
    fields.set("Reason", text(this.reason));
    fields.set("Message", text(this.message));
    fields.set("Detail", this.detail ?? NULL);
    return { kind: "record", fields };
  }
}

export const NULL: MValue = { kind: "null" };
export const TRUE: MValue = { kind: "logical", value: true };
export const FALSE: MValue = { kind: "logical", value: false };
export const logical = (v: boolean): MValue => (v ? TRUE : FALSE);
export const number = (v: number): MValue => ({ kind: "number", value: v });
export const text = (v: string): MValue => ({ kind: "text", value: v });
export const list = (items: MValue[]): MValue => ({ kind: "list", items });
export const date = (y: number, m: number, d: number): MValue => ({ kind: "date", y, m, d });
export const time = (secs: number): MValue => ({ kind: "time", secs });
export const datetime = (y: number, m: number, d: number, secs: number): MValue => ({ kind: "datetime", y, m, d, secs });
export const duration = (secs: number): MValue => ({ kind: "duration", secs });
export const datetimezone = (y: number, m: number, d: number, secs: number, offset: number): MValue => ({ kind: "datetimezone", y, m, d, secs, offset });
export const binary = (bytes: Uint8Array): MValue => ({ kind: "binary", bytes });
export const errorValue = (e: MError): MValue => ({ kind: "error", error: e });
/** Re-raise a contained error value when it is consumed; pass anything else through. */
export const raiseIfError = (v: MValue): MValue => {
  if (v.kind === "error") throw v.error;
  return v;
};
export const typeVal = (t: MType): MTypeValue => ({ kind: "type", ...t });
export const primType = (name: string, extra: Partial<MType> = {}): MTypeValue => ({ kind: "type", name, ...extra });
export const record = (entries: [string, MValue][]): MValue => ({ kind: "record", fields: new Map(entries) });
export const table = (columns: string[], rows: MValue[][], types?: Map<string, MType>): MValue => ({ kind: "table", columns, rows, types });

export function err(reason: string, message: string, detail?: MValue): never {
  throw new MError(reason, message, detail);
}

export const typeName = (v: MValue): string => v.kind;

export function expect<K extends MValue["kind"]>(v: MValue, kind: K, what: string): Extract<MValue, { kind: K }> {
  if (v.kind === "error") throw v.error; // consuming an error value re-raises it
  if (v.kind !== kind) err("Expression.Error", `${what}: expected ${kind}, got ${v.kind}`);
  return v as Extract<MValue, { kind: K }>;
}

/** The record view of one table row (fresh, insertion order = column order). */
export function rowRecord(t: Extract<MValue, { kind: "table" }>, i: number): MValue {
  const fields = new Map<string, MValue>();
  t.columns.forEach((c, ci) => fields.set(c, t.rows[i]![ci] ?? NULL));
  return { kind: "record", fields };
}

/** Spec equality: null equals only null; lists/records/tables compare structurally. */
export function equals(a: MValue, b: MValue): boolean {
  if (a.kind !== b.kind) return false;
  switch (a.kind) {
    case "null": return true;
    case "logical": return a.value === (b as typeof a).value;
    case "number": return a.value === (b as typeof a).value;
    case "text": return a.value === (b as typeof a).value;
    case "date": {
      const bd = b as typeof a;
      return a.y === bd.y && a.m === bd.m && a.d === bd.d;
    }
    case "datetime": {
      const bd = b as typeof a;
      return a.y === bd.y && a.m === bd.m && a.d === bd.d && a.secs === bd.secs;
    }
    case "time": return a.secs === (b as typeof a).secs;
    case "duration": return a.secs === (b as typeof a).secs;
    case "datetimezone": return dtzInstant(a) === dtzInstant(b as typeof a);
    case "binary": {
      const bb = (b as typeof a).bytes;
      return a.bytes.length === bb.length && a.bytes.every((x, i) => x === bb[i]);
    }
    case "list": {
      const bl = b as typeof a;
      return a.items.length === bl.items.length && a.items.every((x, i) => equals(x, bl.items[i]!));
    }
    case "record": {
      const br = b as typeof a;
      if (a.fields.size !== br.fields.size) return false;
      for (const [k, v] of a.fields) {
        const bv = br.fields.get(k);
        if (!bv || !equals(v, bv)) return false;
      }
      return true;
    }
    case "table": {
      const bt = b as typeof a;
      return (
        a.columns.length === bt.columns.length &&
        a.columns.every((c, i) => c === bt.columns[i]) &&
        a.rows.length === bt.rows.length &&
        a.rows.every((r, i) => r.every((v, j) => equals(v, bt.rows[i]![j]!)))
      );
    }
    case "type": return a.name === (b as typeof a).name && !!a.nullable === !!(b as typeof a).nullable;
    case "error": throw a.error; // comparing an error value re-raises it
    case "function": return a === b;
  }
}

/** Ordering for relational operators and sorts; mixed types raise, null raises (spec). */
export function compare(a: MValue, b: MValue): number {
  if (a.kind === "null" || b.kind === "null") err("Expression.Error", "Cannot compare null values");
  if (a.kind !== b.kind) err("Expression.Error", `Cannot compare ${a.kind} with ${b.kind}`);
  if (a.kind === "number") return a.value - (b as typeof a).value;
  if (a.kind === "text") return a.value < (b as typeof a).value ? -1 : a.value > (b as typeof a).value ? 1 : 0;
  if (a.kind === "logical") return Number(a.value) - Number((b as typeof a).value);
  if (a.kind === "date" || a.kind === "datetime") {
    const bd = b as typeof a;
    const as = a.kind === "datetime" ? a.secs : 0;
    const bs = bd.kind === "datetime" ? bd.secs : 0;
    return a.y - bd.y || a.m - bd.m || a.d - bd.d || as - bs;
  }
  if (a.kind === "time" || a.kind === "duration") return a.secs - (b as typeof a).secs;
  if (a.kind === "datetimezone") return dtzInstant(a) - dtzInstant(b as typeof a);
  err("Expression.Error", `Cannot compare ${a.kind} values`);
}

/** UTC instant (seconds since 1970-01-01T00:00Z) of a datetimezone, for equality/compare. */
export function dtzInstant(v: Extract<MValue, { kind: "datetimezone" }>): number {
  return daysFromCivil1970(v.y, v.m, v.d) * 86400 + v.secs - v.offset * 60;
}
// Local copy of the civil-days algorithm (temporal.ts imports values, so avoid a cycle).
function daysFromCivil1970(y: number, m: number, d: number): number {
  y -= m <= 2 ? 1 : 0;
  const era = Math.floor(y / 400);
  const yoe = y - era * 400;
  const doy = Math.trunc((153 * (m + (m > 2 ? -3 : 9)) + 2) / 5) + d - 1;
  const doe = yoe * 365 + Math.floor(yoe / 4) - Math.floor(yoe / 100) + doy;
  return era * 146097 + doe - 719468;
}

/** Plain-JS projection for tests, demos and hosts. Temporal values project to tagged
    strings so they can't be confused with plain text. */
export function toJS(v: MValue): unknown {
  switch (v.kind) {
    case "null": return null;
    case "logical": return v.value;
    case "number": return v.value;
    case "text": return v.value;
    case "date": return `#date(${v.y},${v.m},${v.d})`;
    case "time": return `#time(${v.secs})`;
    case "datetime": return `#datetime(${v.y},${v.m},${v.d},${v.secs})`;
    case "duration": return `#duration(${v.secs})`;
    case "datetimezone": return `#datetimezone(${v.y},${v.m},${v.d},${v.secs},${v.offset})`;
    case "error": return { "#error": v.error.reason, message: v.error.message };
    case "binary": return `#binary(${btoa(String.fromCharCode(...v.bytes))})`;
    case "list": return v.items.map(toJS);
    case "record": return Object.fromEntries([...v.fields].map(([k, x]) => [k, toJS(x)]));
    case "table": return { columns: v.columns, rows: v.rows.map((r) => r.map(toJS)) };
    case "function": return `<function ${v.name ?? "anonymous"}>`;
    case "type": return `<type ${v.name}>`;
  }
}
