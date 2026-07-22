import { describe, expect, it } from "vitest";
import { evaluateSection } from "./index.js";
import {
  parseMemberSteps, previewSection, replaceStepExpression, appendStep, insertStep,
  removeStep, reorderStep, renameStep, addMember, removeMember, renameMember, quoteIdentifier,
} from "./steps.js";
import { toJS, type MValue } from "./values.js";

const SECTION = `section Section1;
shared Sales = let
    Source = #table({"Product", "Qty"}, {{"Apples", 10}, {"Pears", 4}, {"Cherries", 20}}),
    #"Changed Type" = Table.TransformColumnTypes(Source, {{"Qty", Int64.Type}}),
    Filtered = Table.SelectRows(#"Changed Type", each [Qty] > 5)
in
    Filtered;`;

// Evaluate a member of a section to plain JS (for asserting an edit produced valid, running M).
async function runMember(sectionM: string, name: string): Promise<unknown> {
  const s = await evaluateSection(sectionM, {});
  return toJS(await s.run(name));
}
const names = (v: unknown): string[] => ((v as { columns: string[] }).columns);
const rowCount = (v: unknown): number => ((v as { rows: MValue[][] }).rows).length;

describe("steps: decomposition", () => {
  it("reads let bindings as ordered steps, decoding quoted names", async () => {
    const { steps, inTarget, isLet } = await parseMemberSteps(SECTION, "Sales");
    expect(isLet).toBe(true);
    expect(steps.map((s) => s.name)).toEqual(["Source", "Changed Type", "Filtered"]);
    expect(steps[1].rawName).toBe('#"Changed Type"');
    expect(steps[2].expression).toBe('Table.SelectRows(#"Changed Type", each [Qty] > 5)');
    expect(inTarget).toBe("Filtered");
  });
  it("treats a non-let member as one implicit step", async () => {
    const sec = `section Section1;\nshared One = #table({"A"}, {{1}});`;
    const { steps, isLet, inTarget } = await parseMemberSteps(sec, "One");
    expect(isLet).toBe(false);
    expect(steps).toHaveLength(1);
    expect(steps[0].name).toBe("One");
    expect(inTarget).toBe("One");
  });
  it("throws for an unknown member", async () => {
    await expect(parseMemberSteps(SECTION, "Nope")).rejects.toThrow(/No query named/);
  });
});

describe("steps: preview", () => {
  it("re-points `in` to an earlier step and it still evaluates", async () => {
    const atSource = await previewSection(SECTION, "Sales", "Changed Type");
    expect(rowCount(await runMember(atSource, "Sales"))).toBe(3); // before the filter
    expect(rowCount(await runMember(SECTION, "Sales"))).toBe(2); // final: Qty > 5
  });
  it("returns the section unchanged when no step is given", async () => {
    expect(await previewSection(SECTION, "Sales")).toBe(SECTION);
  });
});

describe("steps: editing preserves untouched expressions and stays runnable", () => {
  it("replaceStepExpression swaps one step's formula", async () => {
    const edited = await replaceStepExpression(SECTION, "Sales", "Filtered", "Table.SelectRows(#\"Changed Type\", each [Qty] > 15)");
    expect(rowCount(await runMember(edited, "Sales"))).toBe(1); // only Cherries (20)
    // untouched step text is preserved verbatim
    expect((await parseMemberSteps(edited, "Sales")).steps[0].expression).toContain("#table");
  });
  it("appendStep adds a step and makes it the result", async () => {
    const edited = await appendStep(SECTION, "Sales", "Sorted", "Table.Sort(Filtered, {{\"Qty\", Order.Descending}})");
    const steps = await parseMemberSteps(edited, "Sales");
    expect(steps.steps.map((s) => s.name)).toEqual(["Source", "Changed Type", "Filtered", "Sorted"]);
    expect(steps.inTarget).toBe("Sorted");
    const v = await runMember(edited, "Sales");
    expect((v as { rows: MValue[][] }).rows[0][1]).toBe(20); // Cherries first
  });
  it("appendStep rejects a duplicate name", async () => {
    await expect(appendStep(SECTION, "Sales", "Filtered", "Source")).rejects.toThrow(/already exists/);
  });
  it("insertStep places a step after another", async () => {
    const edited = await insertStep(SECTION, "Sales", "Source", "Kept", "Table.FirstN(Source, 2)");
    expect((await parseMemberSteps(edited, "Sales")).steps.map((s) => s.name)).toEqual(["Source", "Kept", "Changed Type", "Filtered"]);
    expect((await parseMemberSteps(edited, "Sales")).inTarget).toBe("Filtered"); // in target unchanged
  });
  it("removeStep drops a step and repoints the result when needed", async () => {
    const edited = await removeStep(SECTION, "Sales", "Filtered");
    const steps = await parseMemberSteps(edited, "Sales");
    expect(steps.steps.map((s) => s.name)).toEqual(["Source", "Changed Type"]);
    expect(steps.inTarget).toBe("Changed Type");
    expect(rowCount(await runMember(edited, "Sales"))).toBe(3);
  });
  it("removeStep refuses to empty a query", async () => {
    const one = `section Section1;\nshared One = #table({"A"}, {{1}});`;
    await expect(removeStep(one, "One", "One")).rejects.toThrow(/at least one step/);
  });
  it("reorderStep moves a step", async () => {
    const edited = await reorderStep(SECTION, "Sales", "Filtered", 1);
    expect((await parseMemberSteps(edited, "Sales")).steps.map((s) => s.name)).toEqual(["Source", "Filtered", "Changed Type"]);
  });
  it("renameStep updates references and the in target", async () => {
    const edited = await renameStep(SECTION, "Sales", "Changed Type", "Typed");
    const steps = await parseMemberSteps(edited, "Sales");
    expect(steps.steps.map((s) => s.name)).toEqual(["Source", "Typed", "Filtered"]);
    // the reference inside Filtered was rewritten
    expect(steps.steps[2].expression).toBe("Table.SelectRows(Typed, each [Qty] > 5)");
    expect(rowCount(await runMember(edited, "Sales"))).toBe(2); // still runs
  });
  it("renameStep rewrites a reference that was the in target too", async () => {
    const edited = await renameStep(SECTION, "Sales", "Filtered", "Result");
    expect((await parseMemberSteps(edited, "Sales")).inTarget).toBe("Result");
    expect(rowCount(await runMember(edited, "Sales"))).toBe(2);
  });
});

describe("steps: member (query) editing", () => {
  it("addMember appends a runnable query", async () => {
    const edited = await addMember(SECTION, "Doubled", "Table.TransformColumns(Sales, {{\"Qty\", each _ * 2}})", { shared: true });
    const v = await runMember(edited, "Doubled");
    expect((v as { rows: MValue[][] }).rows[0][1]).toBe(20); // Apples 10 -> 20; wait Apples filtered? Sales final has Pears? no
    expect(names(v)).toEqual(["Product", "Qty"]);
  });
  it("addMember rejects a duplicate query name", async () => {
    await expect(addMember(SECTION, "Sales", "1")).rejects.toThrow(/already exists/);
  });
  it("renameMember renames the query", async () => {
    const edited = await renameMember(SECTION, "Sales", "Orders");
    expect((await evaluateSection(edited, {})).names).toEqual(["Orders"]);
  });
  it("removeMember drops the query", async () => {
    const two = SECTION.replace(";$", ";") + `\nshared Extra = 1;\n`;
    const edited = await removeMember(two, "Extra");
    expect((await evaluateSection(edited, {})).names).toEqual(["Sales"]);
  });
});

describe("steps: identifier quoting", () => {
  it("quotes names that need it", () => {
    expect(quoteIdentifier("Source")).toBe("Source");
    expect(quoteIdentifier("Changed Type")).toBe('#"Changed Type"');
    expect(quoteIdentifier("let")).toBe('#"let"'); // keyword
    expect(quoteIdentifier('has"quote')).toBe('#"has""quote"');
  });
});
