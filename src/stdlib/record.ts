// Record.* functions.
import type { Env } from "../interpret.js";
import { NULL, err, expect, list, logical, text, type MValue } from "../values.js";
import { fn, namesOf, textOf } from "./helpers.js";

const rec = (v: MValue, who: string) => expect(v, "record", who);

export function registerRecord(env: Env): void {
  const def = (name: string, v: MValue): void => env.defineValue(name, v);

  def("Record.FieldNames", fn("Record.FieldNames", [{ name: "record" }], (a) => list([...rec(a[0]!, "Record.FieldNames").fields.keys()].map(text))));
  def("Record.FieldCount", fn("Record.FieldCount", [{ name: "record" }], (a) => ({ kind: "number", value: rec(a[0]!, "Record.FieldCount").fields.size })));
  def("Record.HasFields", fn("Record.HasFields", [{ name: "record" }, { name: "fields" }], (a) => {
    const r = rec(a[0]!, "Record.HasFields");
    return logical(namesOf(a[1]!, "field").every((f) => r.fields.has(f)));
  }));
  def("Record.Field", fn("Record.Field", [{ name: "record" }, { name: "field" }], (a) => {
    const r = rec(a[0]!, "Record.Field");
    const name = textOf(a[1]!, "field");
    const v = r.fields.get(name);
    if (v === undefined) err("Expression.Error", `The field '${name}' of the record wasn't found.`);
    return v;
  }));
  def("Record.FieldOrDefault", fn("Record.FieldOrDefault", [{ name: "record" }, { name: "field" }, { name: "default", optional: true }], (a) => {
    const r = rec(a[0]!, "Record.FieldOrDefault");
    return r.fields.get(textOf(a[1]!, "field")) ?? a[2] ?? NULL;
  }));
  def("Record.AddField", fn("Record.AddField", [{ name: "record" }, { name: "fieldName" }, { name: "value" }], (a) => {
    const r = rec(a[0]!, "Record.AddField");
    const name = textOf(a[1]!, "fieldName");
    if (r.fields.has(name)) err("Expression.Error", `The field '${name}' already exists in the record.`);
    return { kind: "record", fields: new Map([...r.fields, [name, a[2]!]]) };
  }));
  def("Record.RemoveFields", fn("Record.RemoveFields", [{ name: "record" }, { name: "fields" }, { name: "missingField", optional: true }], (a) => {
    const r = rec(a[0]!, "Record.RemoveFields");
    const drop = new Set(namesOf(a[1]!, "field"));
    return { kind: "record", fields: new Map([...r.fields].filter(([k]) => !drop.has(k))) };
  }));
  def("Record.SelectFields", fn("Record.SelectFields", [{ name: "record" }, { name: "fields" }, { name: "missingField", optional: true }], (a) => {
    const r = rec(a[0]!, "Record.SelectFields");
    const fields = new Map<string, MValue>();
    for (const f of namesOf(a[1]!, "field")) {
      const v = r.fields.get(f);
      if (v === undefined) err("Expression.Error", `The field '${f}' of the record wasn't found.`);
      fields.set(f, v);
    }
    return { kind: "record", fields };
  }));
  def("Record.ReorderFields", fn("Record.ReorderFields", [{ name: "record" }, { name: "fieldOrder" }, { name: "missingField", optional: true }], (a) => {
    const r = rec(a[0]!, "Record.ReorderFields");
    const order = namesOf(a[1]!, "field");
    const missing = a[2] && a[2].kind === "number" ? a[2].value : 0; // MissingField.Error default
    const fields = new Map<string, MValue>();
    for (const f of order) {
      const v = r.fields.get(f);
      if (v === undefined) { if (missing === 0) err("Expression.Error", `The field '${f}' of the record wasn't found.`); continue; }
      fields.set(f, v);
    }
    for (const [k, v] of r.fields) if (!fields.has(k)) fields.set(k, v); // trailing (un-listed) fields keep their order
    return { kind: "record", fields };
  }));
  def("Record.ToTable", fn("Record.ToTable", [{ name: "record" }], (a) => {
    const r = rec(a[0]!, "Record.ToTable");
    return { kind: "table", columns: ["Name", "Value"], rows: [...r.fields].map(([k, v]) => [text(k), v]) };
  }));
  def("Record.FieldValues", fn("Record.FieldValues", [{ name: "record" }], (a) => list([...rec(a[0]!, "Record.FieldValues").fields.values()])));
  def("Record.ToList", fn("Record.ToList", [{ name: "record" }], (a) => list([...rec(a[0]!, "Record.ToList").fields.values()])));
  def("Record.RenameFields", fn("Record.RenameFields", [{ name: "record" }, { name: "renames" }, { name: "missingField", optional: true }], (a) => {
    const r = rec(a[0]!, "Record.RenameFields");
    const pairs = a[1]!.kind === "list" && a[1]!.items[0]?.kind === "list" ? a[1]!.items : [a[1]!];
    const renameMap = new Map<string, string>();
    for (const p of pairs) { const l = expect(p, "list", "rename"); renameMap.set(textOf(l.items[0]!, "from"), textOf(l.items[1]!, "to")); }
    const fields = new Map<string, MValue>();
    for (const [k, v] of r.fields) fields.set(renameMap.get(k) ?? k, v);
    return { kind: "record", fields };
  }));
  def("Record.TransformFields", fn("Record.TransformFields", [{ name: "record" }, { name: "transforms" }, { name: "missingField", optional: true }], (a) => {
    const r = rec(a[0]!, "Record.TransformFields");
    const pairs = a[1]!.kind === "list" && a[1]!.items[0]?.kind === "list" ? a[1]!.items : [a[1]!];
    const fns = new Map<string, MValue>();
    for (const p of pairs) { const l = expect(p, "list", "transform"); fns.set(textOf(l.items[0]!, "field"), l.items[1]!); }
    const fields = new Map<string, MValue>();
    for (const [k, v] of r.fields) { const f = fns.get(k); fields.set(k, f && f.kind === "function" ? f.call([v]) : v); }
    return { kind: "record", fields };
  }));
  def("Record.Combine", fn("Record.Combine", [{ name: "records" }], (a) => {
    const fields = new Map<string, MValue>();
    for (const r of (a[0]!.kind === "list" ? a[0]!.items : [a[0]!])) for (const [k, v] of rec(r, "Record.Combine").fields) fields.set(k, v);
    return { kind: "record", fields };
  }));
  def("Record.FromTable", fn("Record.FromTable", [{ name: "table" }], (a) => {
    const t = expect(a[0]!, "table", "Record.FromTable");
    const nameI = t.columns.indexOf("Name");
    const valI = t.columns.indexOf("Value");
    if (nameI < 0 || valI < 0) err("Expression.Error", "Record.FromTable: table needs Name and Value columns.");
    const fields = new Map<string, MValue>();
    for (const row of t.rows) fields.set(textOf(row[nameI] ?? NULL, "field name"), row[valI] ?? NULL);
    return { kind: "record", fields };
  }));
  def("Record.FromList", fn("Record.FromList", [{ name: "values" }, { name: "fields" }], (a) => {
    const vals = a[0]!.kind === "list" ? a[0]!.items : err("Expression.Error", "Record.FromList: values must be a list.");
    const names = namesOf(a[1]!, "Record.FromList field");
    const fields = new Map<string, MValue>();
    names.forEach((n, i) => fields.set(n, vals[i] ?? NULL));
    return { kind: "record", fields };
  }));
}
