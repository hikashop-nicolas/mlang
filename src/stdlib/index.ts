// The standard library, one domain per module. Every function raises a precise
// "unsupported" error for shapes it does not cover, so gaps are visible, never silent.
import { Env, evalNode } from "../interpret.js";
import { NULL, type MValue } from "../values.js";
import { requestParse } from "../async-runtime.js";
import { fn, textOf } from "./helpers.js";
import { registerConstants } from "./constants.js";
import { registerTable } from "./table.js";
import { registerList } from "./list.js";
import { registerText } from "./text.js";
import { registerNumber } from "./number.js";
import { registerRecord } from "./record.js";
import { registerDateTime } from "./datetime.js";
import { registerDocument } from "./document.js";
import { registerBinary } from "./binary.js";
import { registerBinaryFormat } from "./binaryformat.js";
import { registerConnectors } from "./connectors.js";
import { registerWorkbook } from "./workbook.js";
import { registerXml } from "./xml.js";
import { registerGeo } from "./geo.js";
import { registerFuzzy } from "./fuzzy.js";

export function registerStdlib(env: Env): void {
  registerConstants(env);
  registerTable(env);
  registerList(env);
  registerText(env);
  registerNumber(env);
  registerRecord(env);
  registerDateTime(env);
  registerDocument(env);
  registerBinary(env);
  registerBinaryFormat(env);
  registerWorkbook(env);
  registerXml(env);
  registerGeo(env);
  registerFuzzy(env);
  registerConnectors(env);

  // Error.Record: the constructor used by `error Error.Record(...)`.
  env.defineValue("Error.Record", fn("Error.Record", [{ name: "reason" }, { name: "message", optional: true }, { name: "detail", optional: true }], (a) => {
    const fields = new Map<string, MValue>();
    fields.set("Reason", a[0] ?? NULL);
    fields.set("Message", a[1] ?? NULL);
    fields.set("Detail", a[2] ?? NULL);
    return { kind: "record", fields };
  }));

  // Expression.Evaluate(document, environment?): parse and evaluate an M string. The parser is
  // async, so on a cache miss requestParse throws PendingParse and the replay driver parses it.
  // Per the spec (oracle-confirmed) the document sees ONLY the environment record's bindings -
  // NOT the standard library. Pass #shared as the environment for library access.
  env.defineValue("Expression.Evaluate", fn("Expression.Evaluate", [{ name: "document" }, { name: "environment", optional: true }], (a) => {
    const ast = requestParse(textOf(a[0]!, "Expression.Evaluate document"));
    const sub = new Env();
    if (a[1] && a[1].kind === "record") for (const [k, v] of a[1].fields) sub.defineValue(k, v);
    return evalNode(ast as never, sub);
  }));

  // #shared: a record of every name in scope (the standard library here), for Expression.Evaluate.
  env.defineValue("#shared", { kind: "record", fields: env.snapshot() });
}
