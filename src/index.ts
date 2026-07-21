// mlang: a clean-room Power Query M evaluator for the browser.
//
// Front-end: @microsoft/powerquery-parser (MIT). Everything behind it (values, evaluation,
// standard library) is implemented from the PUBLIC M specification and function reference,
// validated against black-box oracle fixtures. No Microsoft binaries, no network access:
// external data sources must be injected by the host via `HostBindings`.

import { DefaultSettings, TaskUtils } from "@microsoft/powerquery-parser";
import { Env, evalNode, evalSection } from "./interpret.js";
import { registerStdlib } from "./stdlib.js";
import { MError, type MValue } from "./values.js";

export { MError, toJS, type MValue } from "./values.js";
export { decodeIdentifier, decodeTextLiteral } from "./interpret.js";

/** Values (usually connector functions like Excel.CurrentWorkbook) injected by the host. */
export type HostBindings = Record<string, MValue>;

async function parse(m: string): Promise<unknown> {
  const task = await TaskUtils.tryLexParse(DefaultSettings, m);
  if (!TaskUtils.isParseStageOk(task)) {
    const msg = TaskUtils.isLexStageError(task) || TaskUtils.isParseStageError(task) ? task.error.message : "parse failed";
    throw new MError("Syntax.Error", msg ?? "parse failed");
  }
  return task.ast;
}

function rootEnv(host?: HostBindings): Env {
  const env = new Env();
  registerStdlib(env);
  for (const [k, v] of Object.entries(host ?? {})) env.defineValue(k, v);
  return env;
}

/** Evaluate a single M expression. */
export async function evaluate(expression: string, host?: HostBindings): Promise<MValue> {
  const ast = await parse(expression);
  return evalNode(ast as never, rootEnv(host));
}

export interface SectionQueries {
  /** Member names in document order (shared and private). */
  names: string[];
  /** Evaluate one member (lazy; other members are computed only if referenced). */
  run(name: string): MValue;
}

/** Evaluate a section document (a workbook's Section1.m). */
export async function evaluateSection(sectionM: string, host?: HostBindings): Promise<SectionQueries> {
  const ast = (await parse(sectionM)) as { kind: string };
  if (ast.kind !== "Section") throw new MError("Syntax.Error", "Expected a section document.");
  const members = evalSection(ast as never, rootEnv(host));
  return {
    names: [...members.keys()],
    run(name) {
      const m = members.get(name);
      if (!m) throw new MError("Expression.Error", `No query named '${name}'.`);
      return m();
    },
  };
}
