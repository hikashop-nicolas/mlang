// The standard library, one domain per module. Every function raises a precise
// "unsupported" error for shapes it does not cover, so gaps are visible, never silent.
import type { Env } from "../interpret.js";
import { NULL, type MValue } from "../values.js";
import { fn } from "./helpers.js";
import { registerConstants } from "./constants.js";
import { registerTable } from "./table.js";
import { registerList } from "./list.js";
import { registerText } from "./text.js";
import { registerNumber } from "./number.js";
import { registerRecord } from "./record.js";

export function registerStdlib(env: Env): void {
  registerConstants(env);
  registerTable(env);
  registerList(env);
  registerText(env);
  registerNumber(env);
  registerRecord(env);

  // Error.Record: the constructor used by `error Error.Record(...)`.
  env.defineValue("Error.Record", fn("Error.Record", [{ name: "reason" }, { name: "message", optional: true }, { name: "detail", optional: true }], (a) => {
    const fields = new Map<string, MValue>();
    fields.set("Reason", a[0] ?? NULL);
    fields.set("Message", a[1] ?? NULL);
    fields.set("Detail", a[2] ?? NULL);
    return { kind: "record", fields };
  }));
}
