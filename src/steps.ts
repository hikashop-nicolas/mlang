// Step-level view and editing of a Power Query section member, for a Power Query editor UI.
//
// A query is a `let` expression; its "Applied Steps" are the ordered let bindings and the
// `in` clause names the returned step. This module decomposes a member into steps and edits
// them by SLICING the original source (so untouched step expressions are preserved verbatim,
// comments and quoting included) and regenerating only the `let ... in` scaffold. It never
// evaluates anything: read the steps here, then evaluate through the normal section API with
// the host's connectors. Owned by mlang because the parser AST lives here.

import { DefaultSettings, TaskUtils } from "@microsoft/powerquery-parser";
import { decodeIdentifier } from "./interpret.js";
import { MError } from "./values.js";

export interface MStep {
  /** Decoded step name, as shown to the user (`Changed Type`). */
  name: string;
  /** Raw source identifier, as re-emitted into M (`#"Changed Type"` or `Source`). */
  rawName: string;
  /** The step's expression text, sliced verbatim from the source. */
  expression: string;
}

export interface MemberSteps {
  steps: MStep[];
  /** Decoded name of the step the `in` clause returns. */
  inTarget: string;
  /** False when the member is a single non-`let` expression (one implicit step). */
  isLet: boolean;
}

interface Node {
  kind: string;
  [key: string]: unknown;
}

const M_KEYWORDS = new Set([
  "and", "as", "each", "else", "error", "false", "if", "in", "is", "let", "meta",
  "not", "null", "otherwise", "or", "section", "shared", "then", "true", "try", "type",
]);

async function parse(m: string): Promise<Node> {
  const task = await TaskUtils.tryLexParse(DefaultSettings, m);
  if (!TaskUtils.isParseStageOk(task)) {
    const msg = TaskUtils.isLexStageError(task) || TaskUtils.isParseStageError(task) ? task.error.message : "parse failed";
    throw new MError("Syntax.Error", msg ?? "parse failed");
  }
  return task.ast as unknown as Node;
}

async function parseSection(sectionM: string): Promise<Node> {
  const ast = await parse(sectionM);
  if (ast.kind !== "Section") throw new MError("Syntax.Error", "Expected a section document.");
  return ast;
}

const startOf = (n: Node): number => (n.tokenRange as { positionStart: { codeUnit: number } }).positionStart.codeUnit;
const endOf = (n: Node): number => (n.tokenRange as { positionEnd: { codeUnit: number } }).positionEnd.codeUnit;
const slice = (src: string, n: Node): string => src.slice(startOf(n), endOf(n));

/** The member nodes of a section, in document order. */
function members(section: Node): Node[] {
  return ((section.sectionMembers as Node).elements as Node[]) ?? [];
}

/** Find one member by its decoded name, or throw. */
function findMember(section: Node, name: string): { member: Node; pair: Node; key: Node; value: Node } {
  for (const member of members(section)) {
    const pair = member.namePairedExpression as Node;
    const key = pair.key as Node;
    if (decodeIdentifier(key.literal as string) === name) return { member, pair, key, value: pair.value as Node };
  }
  throw new MError("Expression.Error", `No query named '${name}'.`);
}

/** Quote a name as an M identifier: bare when it is a simple identifier, else `#"..."`. */
export function quoteIdentifier(name: string): string {
  if (/^[A-Za-z_][A-Za-z0-9_]*$/.test(name) && !M_KEYWORDS.has(name)) return name;
  return `#"${name.replace(/"/g, '""')}"`;
}

/** Read a member's `let` bindings as ordered steps (a non-`let` member is one implicit step). */
export async function parseMemberSteps(sectionM: string, memberName: string): Promise<MemberSteps> {
  const section = await parseSection(sectionM);
  const { value } = findMember(section, memberName);
  if (value.kind !== "LetExpression") {
    return { steps: [{ name: memberName, rawName: quoteIdentifier(memberName), expression: slice(sectionM, value) }], inTarget: memberName, isLet: false };
  }
  const steps: MStep[] = [];
  for (const csv of (value.variableList as Node).elements as Node[]) {
    const node = csv.node as Node;
    const key = node.key as Node;
    const rawName = slice(sectionM, key);
    steps.push({ name: decodeIdentifier(key.literal as string), rawName, expression: slice(sectionM, node.value as Node) });
  }
  const inExpr = value.expression as Node;
  const inTarget = inExpr.kind === "IdentifierExpression" ? decodeIdentifier((inExpr.identifier as Node).literal as string) : slice(sectionM, inExpr);
  return { steps, inTarget, isLet: true };
}

/** Regenerate a member's value M from ordered steps and the returned step's raw name. */
function rebuildValue(steps: MStep[], inTargetRaw: string): string {
  const bindings = steps.map((s) => `    ${s.rawName} = ${s.expression}`).join(",\n");
  return `let\n${bindings}\nin\n    ${inTargetRaw}`;
}

/** Replace a member's whole value span with new value M, preserving the rest of the section. */
function spliceValue(sectionM: string, section: Node, memberName: string, newValue: string): string {
  const { value } = findMember(section, memberName);
  return sectionM.slice(0, startOf(value)) + newValue + sectionM.slice(endOf(value));
}

/** Rewrite a member from an edited step list; `inTargetName` is the decoded returned step. */
async function withSteps(sectionM: string, memberName: string, steps: MStep[], inTargetName: string): Promise<string> {
  const section = await parseSection(sectionM);
  const target = steps.find((s) => s.name === inTargetName) ?? steps[steps.length - 1];
  return spliceValue(sectionM, section, memberName, rebuildValue(steps, target.rawName));
}

/** Replace one step's expression text (the formula-bar edit). */
export async function replaceStepExpression(sectionM: string, memberName: string, stepName: string, newExpr: string): Promise<string> {
  const { steps, inTarget } = await parseMemberSteps(sectionM, memberName);
  const step = steps.find((s) => s.name === stepName);
  if (!step) throw new MError("Expression.Error", `No step named '${stepName}'.`);
  step.expression = newExpr;
  return withSteps(sectionM, memberName, steps, inTarget);
}

/** Append a step after the current last one and return it (the new `in` target). */
export async function appendStep(sectionM: string, memberName: string, stepName: string, expr: string): Promise<string> {
  const { steps } = await parseMemberSteps(sectionM, memberName);
  if (steps.some((s) => s.name === stepName)) throw new MError("Expression.Error", `A step named '${stepName}' already exists.`);
  steps.push({ name: stepName, rawName: quoteIdentifier(stepName), expression: expr });
  return withSteps(sectionM, memberName, steps, stepName);
}

/** Insert a step immediately after `afterStep` (or at the front when null). The `in` target is
    unchanged unless the inserted step becomes the last one. */
export async function insertStep(sectionM: string, memberName: string, afterStep: string | null, stepName: string, expr: string): Promise<string> {
  const { steps, inTarget } = await parseMemberSteps(sectionM, memberName);
  if (steps.some((s) => s.name === stepName)) throw new MError("Expression.Error", `A step named '${stepName}' already exists.`);
  const at = afterStep === null ? 0 : steps.findIndex((s) => s.name === afterStep) + 1;
  if (afterStep !== null && at === 0) throw new MError("Expression.Error", `No step named '${afterStep}'.`);
  const step: MStep = { name: stepName, rawName: quoteIdentifier(stepName), expression: expr };
  steps.splice(at, 0, step);
  const newInTarget = at === steps.length - 1 ? stepName : inTarget;
  return withSteps(sectionM, memberName, steps, newInTarget);
}

/** Remove a step. When it was the `in` target, the previous step takes over. References to a
    removed step in later steps are left as-is (they surface as an error on the next preview,
    exactly as Excel reports a broken step). */
export async function removeStep(sectionM: string, memberName: string, stepName: string): Promise<string> {
  const { steps, inTarget } = await parseMemberSteps(sectionM, memberName);
  const idx = steps.findIndex((s) => s.name === stepName);
  if (idx < 0) throw new MError("Expression.Error", `No step named '${stepName}'.`);
  if (steps.length === 1) throw new MError("Expression.Error", "A query must keep at least one step.");
  steps.splice(idx, 1);
  const newInTarget = inTarget === stepName ? steps[Math.min(idx, steps.length - 1)].name : inTarget;
  return withSteps(sectionM, memberName, steps, newInTarget);
}

/** Move a step to a new index (0-based), keeping the same `in` target. */
export async function reorderStep(sectionM: string, memberName: string, stepName: string, toIndex: number): Promise<string> {
  const { steps, inTarget } = await parseMemberSteps(sectionM, memberName);
  const from = steps.findIndex((s) => s.name === stepName);
  if (from < 0) throw new MError("Expression.Error", `No step named '${stepName}'.`);
  const [moved] = steps.splice(from, 1);
  steps.splice(Math.max(0, Math.min(toIndex, steps.length)), 0, moved);
  return withSteps(sectionM, memberName, steps, inTarget);
}

/** Collect every node of a given kind, depth-first. */
function collect(node: unknown, kind: string, out: Node[]): void {
  if (!node || typeof node !== "object") return;
  if (Array.isArray(node)) { for (const c of node) collect(c, kind, out); return; }
  const n = node as Node;
  if (typeof n.kind === "string") { if (n.kind === kind) out.push(n); }
  for (const k of Object.keys(n)) if (k !== "tokenRange") collect(n[k], kind, out);
}

/** Replace bare identifier references to `oldName` with `newRaw` in an expression's text. */
async function renameRefsInExpr(expr: string, oldName: string, newRaw: string): Promise<string> {
  const ast = await parse(expr);
  const ids: Node[] = [];
  collect(ast, "IdentifierExpression", ids);
  const hits = ids
    .map((n) => n.identifier as Node)
    .filter((id) => decodeIdentifier(id.literal as string) === oldName)
    .sort((a, b) => startOf(b) - startOf(a)); // right-to-left so offsets stay valid
  let out = expr;
  for (const id of hits) out = out.slice(0, startOf(id)) + newRaw + out.slice(endOf(id));
  return out;
}

/** Rename a step, updating references to it in every later step and the `in` target. */
export async function renameStep(sectionM: string, memberName: string, oldName: string, newName: string): Promise<string> {
  if (oldName === newName) return sectionM;
  const { steps, inTarget } = await parseMemberSteps(sectionM, memberName);
  if (!steps.some((s) => s.name === oldName)) throw new MError("Expression.Error", `No step named '${oldName}'.`);
  if (steps.some((s) => s.name === newName)) throw new MError("Expression.Error", `A step named '${newName}' already exists.`);
  const newRaw = quoteIdentifier(newName);
  for (const s of steps) {
    if (s.name === oldName) { s.name = newName; s.rawName = newRaw; }
    else s.expression = await renameRefsInExpr(s.expression, oldName, newRaw);
  }
  return withSteps(sectionM, memberName, steps, inTarget === oldName ? newName : inTarget);
}

/** A section where `memberName`'s `in` clause returns `uptoStep` (the last step by default), so
    the caller can evaluate the member up to that step for a preview. Inter-query references keep
    working because the whole section is preserved. */
export async function previewSection(sectionM: string, memberName: string, uptoStep?: string): Promise<string> {
  const section = await parseSection(sectionM);
  const { value } = findMember(section, memberName);
  if (value.kind !== "LetExpression" || uptoStep === undefined) return sectionM;
  const { steps } = await parseMemberSteps(sectionM, memberName);
  const step = steps.find((s) => s.name === uptoStep);
  if (!step) throw new MError("Expression.Error", `No step named '${uptoStep}'.`);
  return withSteps(sectionM, memberName, steps, uptoStep);
}

/** Append a new member (query) to the section. */
export async function addMember(sectionM: string, memberName: string, expr: string, opts: { shared?: boolean } = {}): Promise<string> {
  const section = await parseSection(sectionM);
  if (members(section).some((m) => decodeIdentifier(((m.namePairedExpression as Node).key as Node).literal as string) === memberName)) {
    throw new MError("Expression.Error", `A query named '${memberName}' already exists.`);
  }
  const decl = `${opts.shared ? "shared " : ""}${quoteIdentifier(memberName)} = ${expr};`;
  const trimmed = sectionM.replace(/\s*$/, "");
  return `${trimmed}\n${decl}\n`;
}

/** Remove a member (query) from the section. */
export async function removeMember(sectionM: string, memberName: string): Promise<string> {
  const section = await parseSection(sectionM);
  const { member } = findMember(section, memberName);
  const before = sectionM.slice(0, startOf(member)).replace(/[ \t]*$/, "");
  const after = sectionM.slice(endOf(member));
  return (before.replace(/\n\s*$/, "\n") + after).replace(/\n{3,}/g, "\n\n");
}

/** Rename a member (query). References from other queries are left untouched. */
export async function renameMember(sectionM: string, oldName: string, newName: string): Promise<string> {
  if (oldName === newName) return sectionM;
  const section = await parseSection(sectionM);
  if (members(section).some((m) => decodeIdentifier(((m.namePairedExpression as Node).key as Node).literal as string) === newName)) {
    throw new MError("Expression.Error", `A query named '${newName}' already exists.`);
  }
  const { key } = findMember(section, oldName);
  return sectionM.slice(0, startOf(key)) + quoteIdentifier(newName) + sectionM.slice(endOf(key));
}
