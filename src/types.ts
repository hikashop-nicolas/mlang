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

/** Does a value inhabit a type? (`is` operator, Value.Is.) Structured record/table/list types
    are checked structurally; a compound type with no field/column/item detail matches by kind. */
export function valueMatchesType(v: MValue, t: MType): boolean {
  if (t.union) return t.union.some((m) => valueMatchesType(v, m));
  if (t.name === "any") return true;
  if (v.kind === "null") return !!t.nullable || t.name === "null" || t.name === "none";
  if (t.name === "anynonnull") return true;
  if (t.name === "record" && t.fields) {
    if (v.kind !== "record") return false;
    for (const f of t.fields) {
      const fv = v.fields.get(f.name);
      if (fv === undefined) { if (!f.optional) return false; continue; }
      if (!valueMatchesType(fv, f.type)) return false;
    }
    if (!t.open) for (const k of v.fields.keys()) if (!t.fields.some((f) => f.name === k)) return false; // closed: no extra fields
    return true;
  }
  if (t.name === "table" && t.columns) {
    if (v.kind !== "table") return false;
    return t.columns.every((c) => v.columns.includes(c.name));
  }
  if (t.name === "list" && t.item && t.item.name !== "any") {
    if (v.kind !== "list") return false;
    return v.items.every((it) => valueMatchesType(it, t.item!));
  }
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
  // Structural: a <: b when a supplies every required field/column of b (compatibly) and, for a
  // closed b, adds nothing extra. Detail-free compound types stay compatible by kind.
  if (b.name === "record" && b.fields && a.fields) {
    for (const bf of b.fields) {
      const af = a.fields.find((f) => f.name === bf.name);
      if (!af) { if (!bf.optional) return false; continue; }
      if (!subtypeOf(af.type, bf.type)) return false;
    }
    if (!b.open && (a.open || a.fields.some((af) => !b.fields!.some((bf) => bf.name === af.name)))) return false;
    return true;
  }
  if (b.name === "table" && b.columns && a.columns) {
    return b.columns.every((bc) => { const ac = a.columns!.find((c) => c.name === bc.name); return !!ac && subtypeOf(ac.type, bc.type); });
  }
  if (b.name === "list" && b.item && a.item) return subtypeOf(a.item, b.item);
  if (b.name === "function" && b.parameters && a.parameters) {
    return a.parameters.length === b.parameters.length && (!b.returnType || !a.returnType || subtypeOf(a.returnType, b.returnType));
  }
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
