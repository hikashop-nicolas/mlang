// Operations over structured M types (MType). Kept separate from values.ts (which only
// defines the data) so the type logic - subtyping, value->type, type->text - lives in one
// place. Pragmatic: compound subtyping is shallow (names + nullability), which the oracle
// confirms is enough for the common Type.* / Table.Schema / is-as uses.
import { type MType, type MValue } from "./values.js";

const PRIMITIVE_KINDS = new Set([
  "any", "none", "null", "logical", "number", "text", "binary", "date", "time",
  "datetime", "datetimezone", "duration", "list", "record", "table", "function", "type",
]);

/** The structural type of a value (columns/fields typed loosely where not tracked). */
export function mtypeOfValue(v: MValue): MType {
  switch (v.kind) {
    case "list":
      return { name: "list", item: { name: "any" } };
    case "record":
      return { name: "record", fields: [...v.fields.keys()].map((name) => ({ name, type: { name: "any" } })), open: false };
    case "table":
      return { name: "table", columns: v.columns.map((c) => ({ name: c, type: v.types?.get(c) ?? { name: "any" } })) };
    case "null":
      return { name: "null", nullable: true };
    case "function":
      return { name: "function", parameters: v.params.map((p) => ({ name: p.name, type: { name: "any" }, optional: p.optional })), returnType: { name: "any" }, requiredParameters: v.params.filter((p) => !p.optional).length };
    case "type":
      return { name: "type" };
    default:
      return { name: v.kind };
  }
}

/** Does a value inhabit a type? (`is` operator, Value.Is.) */
export function valueMatchesType(v: MValue, t: MType): boolean {
  if (t.union) return t.union.some((m) => valueMatchesType(v, m));
  if (t.name === "any") return true;
  if (v.kind === "null") return !!t.nullable || t.name === "null" || t.name === "none";
  if (t.name === "anynonnull") return true;
  return v.kind === t.name;
}

/** Is `a` assignable to `b`? Shallow: `any` absorbs all; equal primitive names with
    compatible nullability; a list/record/table matches the same kind. */
export function subtypeOf(a: MType, b: MType): boolean {
  if (b.union) return b.union.some((m) => subtypeOf(a, m)); // a fits if it fits any member
  if (a.union) return a.union.every((m) => subtypeOf(m, b)); // all members must fit b
  if (b.name === "any") return true;
  if (a.name === "none") return true;
  if (a.name !== b.name) return false;
  if (a.nullable && !b.nullable) return false;
  return true;
}

/** Excel-style TypeName (as Table.Schema reports it), preferring the ascribed surface name. */
export function typeName(t: MType): string {
  if (t.ascription) return t.ascription;
  const map: Record<string, string> = {
    any: "Any.Type", none: "None.Type", null: "Null.Type", logical: "Logical.Type",
    number: "Number.Type", text: "Text.Type", binary: "Binary.Type", date: "Date.Type",
    time: "Time.Type", datetime: "DateTime.Type", datetimezone: "DateTimeZone.Type",
    duration: "Duration.Type", list: "List.Type", record: "Record.Type", table: "Table.Type",
    function: "Function.Type", type: "Type.Type",
  };
  return map[t.name] ?? t.name;
}

export const isPrimitiveKind = (name: string): boolean => PRIMITIVE_KINDS.has(name);
