import { describe, expect, it } from "vitest";
import { evaluate, evaluateSection, toJS } from "./index.js";

const js = async (m: string): Promise<unknown> => toJS(await evaluate(m));

describe("Expression.Evaluate", () => {
  it("evaluates an M string (stdlib in scope)", async () => {
    expect(await js(`Expression.Evaluate("1 + 2 * 3")`)).toBe(7);
    expect(await js(`Expression.Evaluate("Text.Upper(""hi"")")`)).toBe("HI");
    expect(await js(`Expression.Evaluate("let a = 2 in a + 3")`)).toBe(5);
  });

  it("honours the environment record", async () => {
    expect(await js(`Expression.Evaluate("x * 10", [x = 5])`)).toBe(50);
    expect(await js(`Expression.Evaluate("a + b", [a = 1, b = 2])`)).toBe(3);
  });

  it("multiple distinct parses in one expression (multi-round replay)", async () => {
    expect(await js(`Expression.Evaluate("1") + Expression.Evaluate("2") + Expression.Evaluate("3")`)).toBe(6);
  });

  it("a parse error propagates through try...otherwise", async () => {
    expect(await js(`try Expression.Evaluate("1 +") otherwise "bad"`)).toBe("bad");
  });

  it("works inside a section member", async () => {
    const section = await evaluateSection(`section Section1;\nshared Q = Expression.Evaluate("Number.Abs(-9)");`, {});
    expect(toJS(await section.run("Q"))).toBe(9);
  });
});
