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
  def("Record.ToTable", fn("Record.ToTable", [{ name: "record" }], (a) => {
    const r = rec(a[0]!, "Record.ToTable");
    return { kind: "table", columns: ["Name", "Value"], rows: [...r.fields].map(([k, v]) => [text(k), v]) };
  }));
}
