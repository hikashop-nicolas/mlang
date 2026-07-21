// Helpers for HOST connectors (Web.Contents, OData.Feed, ...). A host that fetches JSON or
// records over HTTP uses these to turn the result into mlang values, so the shaping logic
// lives here (tested) instead of being re-invented per host.
import { NULL, list, logical, number, table, text, type MValue } from "./values.js";

/** JSON value -> M value. Objects become records, arrays become lists (Excel expands them). */
export function fromJson(v: unknown): MValue {
  if (v === null || v === undefined) return NULL;
  if (typeof v === "boolean") return logical(v);
  if (typeof v === "number") return number(v);
  if (typeof v === "string") return text(v);
  if (Array.isArray(v)) return list(v.map(fromJson));
  if (typeof v === "object") {
    const fields = new Map<string, MValue>();
    for (const [k, val] of Object.entries(v as Record<string, unknown>)) fields.set(k, fromJson(val));
    return { kind: "record", fields };
  }
  return NULL;
}

/** A list of record M values -> a table whose columns are the union of their field names,
    in first-seen order (the shape OData/REST feeds expand to). Non-records contribute
    nothing. */
export function tableFromRecords(records: MValue[]): MValue {
  const columns: string[] = [];
  for (const r of records) if (r.kind === "record") for (const k of r.fields.keys()) if (!columns.includes(k)) columns.push(k);
  const rows = records.map((r) => (r.kind === "record" ? columns.map((c) => r.fields.get(c) ?? NULL) : columns.map(() => NULL)));
  return table(columns, rows);
}

/** Convenience: a JSON array (or OData `value` array) -> a table. */
export function tableFromJson(records: unknown[]): MValue {
  return tableFromRecords(records.map(fromJson));
}
