// The M value model. Clean-room: shapes and semantics follow the public Power Query M
// specification only. Errors are raised as MError exceptions and propagate until caught by
// try...otherwise (ErrorHandlingExpression), matching the spec's error model.

export type MValue =
  | { kind: "null" }
  | { kind: "logical"; value: boolean }
  | { kind: "number"; value: number }
  | { kind: "text"; value: string }
  | { kind: "list"; items: MValue[] }
  | { kind: "record"; fields: Map<string, MValue> } // insertion-ordered
  | { kind: "table"; columns: string[]; rows: MValue[][]; types?: Map<string, string> }
  | MFunction
  | { kind: "type"; name: string; nullable?: boolean };

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
export const record = (entries: [string, MValue][]): MValue => ({ kind: "record", fields: new Map(entries) });
export const table = (columns: string[], rows: MValue[][], types?: Map<string, string>): MValue => ({ kind: "table", columns, rows, types });

export function err(reason: string, message: string, detail?: MValue): never {
  throw new MError(reason, message, detail);
}

export const typeName = (v: MValue): string => v.kind;

export function expect<K extends MValue["kind"]>(v: MValue, kind: K, what: string): Extract<MValue, { kind: K }> {
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
    case "type": return a.name === (b as typeof a).name;
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
  err("Expression.Error", `Cannot compare ${a.kind} values`);
}

/** Plain-JS projection for tests, demos and hosts. */
export function toJS(v: MValue): unknown {
  switch (v.kind) {
    case "null": return null;
    case "logical": return v.value;
    case "number": return v.value;
    case "text": return v.value;
    case "list": return v.items.map(toJS);
    case "record": return Object.fromEntries([...v.fields].map(([k, x]) => [k, toJS(x)]));
    case "table": return { columns: v.columns, rows: v.rows.map((r) => r.map(toJS)) };
    case "function": return `<function ${v.name ?? "anonymous"}>`;
    case "type": return `<type ${v.name}>`;
  }
}
