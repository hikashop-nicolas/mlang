import { describe, expect, it } from "vitest";
import { evaluate, toJS } from "./index.js";

// Table.Fuzzy* — approximate matching via normalized Levenshtein similarity. These assertions
// reproduce the two examples in the Microsoft reference verbatim, plus the documented options.
const js = async (m: string): Promise<unknown> => toJS(await evaluate(m));
type T = { columns: string[]; rows: unknown[][] };

const EMP = `Table.FromRecords({[EmployeeID=1,Location="Seattle"],[EmployeeID=2,Location="seattl"],[EmployeeID=3,Location="Vancouver"],[EmployeeID=4,Location="Seatle"],[EmployeeID=5,Location="vancover"],[EmployeeID=6,Location="Seattle"],[EmployeeID=7,Location="Vancouver"]})`;

describe("Table.FuzzyGroup", () => {
  it("reproduces the reference example (Seattle=4, Vancouver=3)", async () => {
    const out = (await js(`Table.FuzzyGroup(${EMP}, "Location", {"Count", each Table.RowCount(_)}, [IgnoreCase=true, IgnoreSpace=true])`)) as T;
    expect(out.columns).toEqual(["Location", "Count"]);
    expect(out.rows).toEqual([["Seattle", 4], ["Vancouver", 3]]);
  });
});

describe("Table.FuzzyJoin", () => {
  const T1 = `Table.FromRecords({[CustomerID=1,FirstName1="Bob",Phone="555-1234"],[CustomerID=2,FirstName1="Robert",Phone="555-4567"]})`;
  const T2 = `Table.FromRecords({[CustomerStateID=1,FirstName2="Bob",State="TX"],[CustomerStateID=2,FirstName2="bOB",State="CA"]})`;
  it("reproduces the reference LeftOuter example", async () => {
    const out = (await js(`Table.FuzzyJoin(${T1}, {"FirstName1"}, ${T2}, {"FirstName2"}, JoinKind.LeftOuter, [IgnoreCase=true, IgnoreSpace=false])`)) as T;
    expect(out.rows).toEqual([
      [1, "Bob", "555-1234", 1, "Bob", "TX"],
      [1, "Bob", "555-1234", 2, "bOB", "CA"],
      [2, "Robert", "555-4567", null, null, null],
    ]);
  });
  it("inner join drops the unmatched row", async () => {
    expect(await js(`Table.RowCount(Table.FuzzyJoin(${T1}, {"FirstName1"}, ${T2}, {"FirstName2"}, JoinKind.Inner))`)).toBe(2);
  });
  it("NumberOfMatches caps matches per input row", async () => {
    expect(await js(`Table.RowCount(Table.FuzzyJoin(${T1}, {"FirstName1"}, ${T2}, {"FirstName2"}, JoinKind.LeftOuter, [NumberOfMatches=1]))`)).toBe(2);
  });
});

describe("fuzzy options", () => {
  const G = `Table.FromRecords({[A="Grapes"]})`;
  it("SimilarityColumnName adds the score (Grapes/Graes ≈ 0.833)", async () => {
    const s = (await js(`Table.Column(Table.FuzzyJoin(${G}, {"A"}, Table.FromRecords({[B="Graes"]}), {"B"}, JoinKind.Inner, [SimilarityColumnName="Sim"]), "Sim")`)) as number[];
    expect(s[0]).toBeCloseTo(0.8333, 3);
  });
  it("Threshold gates matches (Grapes/Graes only below 0.90)", async () => {
    expect(await js(`Table.RowCount(Table.FuzzyJoin(${G}, {"A"}, Table.FromRecords({[B="Graes"]}), {"B"}, JoinKind.Inner, [Threshold=0.8]))`)).toBe(1);
    expect(await js(`Table.RowCount(Table.FuzzyJoin(${G}, {"A"}, Table.FromRecords({[B="Graes"]}), {"B"}, JoinKind.Inner, [Threshold=0.9]))`)).toBe(0);
  });
  it("TransformationTable maps values (Grapes -> Raisins)", async () => {
    expect(await js(`Table.RowCount(Table.FuzzyJoin(${G}, {"A"}, Table.FromRecords({[B="Raisins"]}), {"B"}, JoinKind.Inner, [TransformationTable=Table.FromRecords({[From="Grapes", To="Raisins"]})]))`)).toBe(1);
  });
  it("IgnoreSpace combines text parts (Gra pes ~ Grapes)", async () => {
    const spaced = `Table.FromRecords({[A="Gra pes"]})`;
    const plain = `Table.FromRecords({[B="Grapes"]})`;
    expect(await js(`Table.RowCount(Table.FuzzyJoin(${spaced}, {"A"}, ${plain}, {"B"}, JoinKind.Inner, [IgnoreSpace=true]))`)).toBe(1);
    expect(await js(`Table.RowCount(Table.FuzzyJoin(${spaced}, {"A"}, ${plain}, {"B"}, JoinKind.Inner, [IgnoreSpace=false, Threshold=0.9]))`)).toBe(0);
  });
});

describe("Table.AddFuzzyClusterColumn", () => {
  it("labels each row with its cluster representative", async () => {
    expect(await js(`Table.Column(Table.AddFuzzyClusterColumn(Table.FromRecords({[L="Seattle"],[L="seattl"],[L="Seatle"]}), "L", "Cluster"), "Cluster")`)).toEqual(["Seattle", "Seattle", "Seattle"]);
  });
});
