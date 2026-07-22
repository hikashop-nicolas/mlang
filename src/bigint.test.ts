import { describe, expect, it } from "vitest";
import { evaluate, toJS } from "./index.js";

// Exact integers beyond 2^53 (64-bit IDs) keep a BigInt shadow so equality, sorting, dedup,
// conversions, +/-/* and text output stay exact. (toJS display and stdlib aggregations remain
// IEEE-double - a documented boundary; see FIDELITY.md.)
const js = async (m: string): Promise<unknown> => toJS(await evaluate(m));

describe("exact large integers", () => {
  it("literals and Text.From render exactly", async () => {
    expect(await js(`Text.From(9007199254740993)`)).toBe("9007199254740993");
    expect(await js(`Number.ToText(9223372036854775807)`)).toBe("9223372036854775807");
  });
  it("distinct 64-bit values are not conflated by equality", async () => {
    expect(await js(`9007199254740993 = 9007199254740992`)).toBe(false);
    expect(await js(`9007199254740993 = 9007199254740993`)).toBe(true);
    expect(await js(`9007199254740993 > 9007199254740992`)).toBe(true);
  });
  it("Number.FromText / Int64.From preserve 64-bit ids", async () => {
    expect(await js(`Number.FromText("9007199254740993") = 9007199254740993`)).toBe(true);
    expect(await js(`Int64.From("9223372036854775807") = 9223372036854775807`)).toBe(true);
    expect(await js(`Text.From(Number.FromText("12345678901234567"))`)).toBe("12345678901234567");
  });
  it("+/-/* stay exact (rendered via text)", async () => {
    expect(await js(`Text.From(9007199254740993 + 2)`)).toBe("9007199254740995");
    expect(await js(`Text.From(9007199254740993 - 5)`)).toBe("9007199254740988");
    expect(await js(`Text.From(9007199254740993 * 3)`)).toBe("27021597764222979");
  });
  it("dedup and sort keep 64-bit keys distinct", async () => {
    expect(await js(`List.Count(List.Distinct({9007199254740993, 9007199254740992, 9007199254740993}))`)).toBe(2);
    expect(await js(`List.Transform(List.Sort({9007199254740993, 9007199254740991, 9007199254740992}), each Text.From(_))`))
      .toEqual(["9007199254740991", "9007199254740992", "9007199254740993"]);
  });
  it("no regression for ordinary numbers", async () => {
    expect(await js(`1 + 2`)).toBe(3);
    expect(await js(`2 = 2`)).toBe(true);
    expect(await js(`0.1 + 0.2`)).toBe(0.30000000000000004); // correct IEEE double, matches .NET
    expect(await js(`List.Distinct({1, 1, 2})`)).toEqual([1, 2]);
  });
});
