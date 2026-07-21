// Shared helpers for the standard library modules.
import { NULL, compare, err, expect, rowRecord, toJS, type MFunction, type MValue } from "../values.js";

export type Table = Extract<MValue, { kind: "table" }>;

export const fn = (name: string, arity: { name: string; optional?: boolean }[], call: (args: MValue[]) => MValue): MFunction => ({
  kind: "function",
  name,
  params: arity.map((p) => ({ name: p.name, optional: !!p.optional })),
  call: (args) => {
    const required = arity.filter((p) => !p.optional).length;
    if (args.length < required) err("Expression.Error", `${name}: ${args.length} arguments passed, expected at least ${required}.`);
    return call(args);
  },
});

export const asTable = (v: MValue, who: string): Table => expect(v, "table", who);
export const textOf = (v: MValue, who: string): string => expect(v, "text", who).value;
export const numOf = (v: MValue, who: string): number => expect(v, "number", who).value;
export const listOf = (v: MValue, who: string): MValue[] => expect(v, "list", who).items;
export const callFn = (v: MValue, args: MValue[]): MValue => {
  if (v.kind !== "function") err("Expression.Error", "Expected a function value.");
  return v.call(args);
};
export const truthy = (v: MValue): boolean => v.kind === "logical" && v.value;

/** One name or a list of names. */
export const namesOf = (v: MValue, who: string): string[] =>
  v.kind === "list" ? v.items.map((c) => textOf(c, who)) : [textOf(v, who)];

/** {{a,b},{c,d}} pair lists (RenameColumns/TransformColumnTypes shapes). */
export const pairList = (v: MValue, who: string): MValue[][] => {
  const items = listOf(v, who);
  if (items.length > 0 && items[0]!.kind !== "list") return [items];
  return items.map((p) => listOf(p, who));
};

export const colIndex = (t: Table, c: string): number => {
  const i = t.columns.indexOf(c);
  if (i < 0) err("Expression.Error", `The column '${c}' of the table wasn't found.`);
  return i;
};

/** Sort comparison for same-kind primitives (raises on mixed/other kinds). */
export const cmpForSort = (a: MValue, b: MValue): number => {
  if (a.kind === "number" && b.kind === "number") return a.value - b.value;
  if (a.kind === "text" && b.kind === "text") return a.value < b.value ? -1 : a.value > b.value ? 1 : 0;
  if (a.kind === "logical" && b.kind === "logical") return Number(a.value) - Number(b.value);
  return compare(a, b);
};

/** Nulls-first-ascending comparator used by Table.Sort and List.Sort (oracle-confirmed). */
export const cmpWithNulls = (a: MValue, b: MValue): number => {
  if (a.kind === "null" && b.kind === "null") return 0;
  if (a.kind === "null") return -1;
  if (b.kind === "null") return 1;
  return cmpForSort(a, b);
};

/** A canonical string for value equality grouping (Distinct/Group/join keys). */
export const keyOf = (v: MValue): string => JSON.stringify(toJS(v));

export const subTable = (t: Table, rowIdx: number[]): Table => ({
  kind: "table",
  columns: [...t.columns],
  rows: rowIdx.map((i) => t.rows[i]!),
  types: t.types,
});

export const rowOf = (t: Table, i: number): MValue => rowRecord(t, i);

export { NULL };
