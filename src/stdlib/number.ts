// Number.* functions. Number.Round defaults to banker's rounding (RoundingMode.ToEven),
// per the reference; the rounding cases are oracle-pinned.
import type { Env } from "../interpret.js";
import { FALSE, NULL, TRUE, err, number, type MValue } from "../values.js";
import { fn, numOf } from "./helpers.js";
import { formatNumber } from "../format.js";
import { nextRandom } from "../async-runtime.js";
import { numberFrom } from "./convert.js";
import { cultureOf, formatCurrency, isInvariant, numberSeparators } from "../culture.js";

const nn = (name: string, params: { name: string; optional?: boolean }[], f: (args: MValue[]) => MValue) =>
  fn(name, params, (a) => (a[0] && a[0].kind === "null" ? NULL : f(a)));

/** Round half to even at the given scale. */
export function roundToEven(x: number, digits: number): number {
  const scale = Math.pow(10, digits);
  const scaled = x * scale;
  const floor = Math.floor(scaled);
  const frac = scaled - floor;
  const EPS = 1e-9;
  let r: number;
  if (Math.abs(frac - 0.5) < EPS) r = floor % 2 === 0 ? floor : floor + 1;
  else r = Math.round(scaled);
  return r / scale;
}

export function registerNumber(env: Env): void {
  const def = (name: string, v: MValue): void => env.defineValue(name, v);

  def("Number.PositiveInfinity", number(Infinity));
  def("Number.NegativeInfinity", number(-Infinity));
  def("Number.NaN", number(NaN));
  def("Number.Epsilon", number(Number.EPSILON));
  def("Number.PI", number(Math.PI));
  def("Number.E", number(Math.E));
  // Non-deterministic: seeded per evaluation so replay reproduces (see async-runtime).
  def("Number.Random", fn("Number.Random", [], () => number(nextRandom())));
  def("Number.RandomBetween", fn("Number.RandomBetween", [{ name: "bottom" }, { name: "top" }], (a) => {
    const lo = numOf(a[0]!, "Number.RandomBetween"), hi = numOf(a[1]!, "Number.RandomBetween");
    return number(lo + nextRandom() * (hi - lo));
  }));
  def("Number.IsEven", nn("Number.IsEven", [{ name: "number" }], (a) => (Math.trunc(numOf(a[0]!, "Number.IsEven")) % 2 === 0 ? TRUE : FALSE)));
  def("Number.IsOdd", nn("Number.IsOdd", [{ name: "number" }], (a) => (Math.abs(Math.trunc(numOf(a[0]!, "Number.IsOdd")) % 2) === 1 ? TRUE : FALSE)));
  // Byte/Int8/Int16/Int32/Percentage all coerce to a number then round to whole (banker's).
  const intFrom = (name: string): void => def(name, fn(name, [{ name: "value" }, { name: "culture", optional: true }], (a) => {
    const v = numberFrom(a[0]!, cultureOf(a[1]?.kind === "text" ? a[1].value : null));
    return v.kind === "number" ? number(roundToEven(v.value, 0)) : v;
  }));
  intFrom("Byte.From");
  intFrom("Int8.From");
  intFrom("Int16.From");
  intFrom("Int32.From");
  // Float conversions: keep the fractional part. Single truncates to 32-bit float precision;
  // Currency rounds to 4 decimals (money scale).
  const floatFrom = (name: string, map: (x: number) => number): void => def(name, fn(name, [{ name: "value" }, { name: "culture", optional: true }], (a) => {
    const v = numberFrom(a[0]!, cultureOf(a[1]?.kind === "text" ? a[1].value : null));
    return v.kind === "number" ? number(map(v.value)) : v;
  }));
  floatFrom("Double.From", (x) => x);
  floatFrom("Decimal.From", (x) => x);
  floatFrom("Single.From", (x) => Math.fround(x));
  floatFrom("Currency.From", (x) => roundToEven(x, 4));
  def("Percentage.From", fn("Percentage.From", [{ name: "value" }, { name: "culture", optional: true }], (a) => {
    if (a[0]!.kind === "text") { const s = a[0]!.value.trim(); if (s.endsWith("%")) { const n = Number(s.slice(0, -1)); return Number.isNaN(n) ? err("Expression.Error", "Percentage.From: invalid value.") : number(n / 100); } }
    return numberFrom(a[0]!, cultureOf(a[1]?.kind === "text" ? a[1].value : null));
  }));
  def("Number.FromText", fn("Number.FromText", [{ name: "text" }, { name: "culture", optional: true }], (a) =>
    numberFrom(a[0]!, cultureOf(a[1]?.kind === "text" ? a[1].value : null))));
  // Int64.From: convert then round to a whole number (banker's rounding, oracle-checked).
  def("Int64.From", fn("Int64.From", [{ name: "value" }, { name: "culture", optional: true }], (a) => {
    const v = numberFrom(a[0]!, cultureOf(a[1]?.kind === "text" ? a[1].value : null));
    return v.kind === "number" ? number(roundToEven(v.value, 0)) : v;
  }));

  const unary = (name: string, f: (x: number) => number): void => def(name, nn(name, [{ name: "number" }], (a) => number(f(numOf(a[0]!, name)))));
  unary("Number.Exp", Math.exp);
  unary("Number.Ln", Math.log);
  unary("Number.Log10", Math.log10);
  unary("Number.Sin", Math.sin);
  unary("Number.Cos", Math.cos);
  unary("Number.Tan", Math.tan);
  unary("Number.Asin", Math.asin);
  unary("Number.Acos", Math.acos);
  unary("Number.Atan", Math.atan);
  unary("Number.Sinh", Math.sinh);
  unary("Number.Cosh", Math.cosh);
  unary("Number.Tanh", Math.tanh);
  def("Number.Log", nn("Number.Log", [{ name: "number" }, { name: "base", optional: true }], (a) => number(Math.log(numOf(a[0]!, "Number.Log")) / Math.log(a[1] && a[1].kind === "number" ? a[1].value : 10))));
  def("Number.Atan2", fn("Number.Atan2", [{ name: "y" }, { name: "x" }], (a) => number(Math.atan2(numOf(a[0]!, "Number.Atan2"), numOf(a[1]!, "Number.Atan2")))));
  const factorial = (n: number): number => { let r = 1; for (let i = 2; i <= n; i++) r *= i; return r; };
  def("Number.Factorial", nn("Number.Factorial", [{ name: "number" }], (a) => number(factorial(Math.round(numOf(a[0]!, "Number.Factorial"))))));
  def("Number.Combinations", nn("Number.Combinations", [{ name: "setSize" }, { name: "combinationSize" }], (a) => {
    const n = Math.round(numOf(a[0]!, "Number.Combinations")), k = Math.round(numOf(a[1]!, "Number.Combinations"));
    if (k < 0 || k > n) return number(0);
    let r = 1; for (let i = 0; i < k; i++) r = (r * (n - i)) / (i + 1); return number(Math.round(r));
  }));
  def("Number.Permutations", nn("Number.Permutations", [{ name: "setSize" }, { name: "permutationSize" }], (a) => {
    const n = Math.round(numOf(a[0]!, "Number.Permutations")), k = Math.round(numOf(a[1]!, "Number.Permutations"));
    if (k < 0 || k > n) return number(0);
    let r = 1; for (let i = 0; i < k; i++) r *= n - i; return number(r);
  }));
  const bit = (name: string, f: (a: number, b: number) => number): void => def(name, fn(name, [{ name: "number1" }, { name: "number2" }], (a) => number(f(numOf(a[0]!, name), numOf(a[1]!, name)))));
  bit("Number.BitwiseAnd", (x, y) => x & y);
  bit("Number.BitwiseOr", (x, y) => x | y);
  bit("Number.BitwiseXor", (x, y) => x ^ y);
  bit("Number.BitwiseShiftLeft", (x, y) => x * 2 ** y);
  bit("Number.BitwiseShiftRight", (x, y) => Math.floor(x / 2 ** y));
  def("Number.BitwiseNot", nn("Number.BitwiseNot", [{ name: "number" }], (a) => number(~numOf(a[0]!, "Number.BitwiseNot"))));

  def("Number.Abs", nn("Number.Abs", [{ name: "number" }], (a) => number(Math.abs(numOf(a[0]!, "Number.Abs")))));
  def("Number.Sign", nn("Number.Sign", [{ name: "number" }], (a) => number(Math.sign(numOf(a[0]!, "Number.Sign")))));
  def("Number.Sqrt", nn("Number.Sqrt", [{ name: "number" }], (a) => number(Math.sqrt(numOf(a[0]!, "Number.Sqrt")))));
  def("Number.Power", nn("Number.Power", [{ name: "number" }, { name: "power" }], (a) => number(Math.pow(numOf(a[0]!, "Number.Power"), numOf(a[1]!, "power")))));

  def("Number.Round", nn("Number.Round", [{ name: "number" }, { name: "digits", optional: true }, { name: "roundingMode", optional: true }], (a) => {
    const x = numOf(a[0]!, "Number.Round");
    const digits = a[1] && a[1].kind === "number" ? a[1].value : 0;
    const mode = a[2] && a[2].kind === "number" ? a[2].value : 4; // ToEven default
    const scale = Math.pow(10, digits);
    switch (mode) {
      case 0: return number(Math.ceil(x * scale) / scale); // Up
      case 1: return number(Math.floor(x * scale) / scale); // Down
      case 2: return number(Math.sign(x) * Math.round(Math.abs(x) * scale) / scale); // AwayFromZero
      case 3: return number(Math.trunc(x * scale) / scale); // TowardZero
      case 4: return number(roundToEven(x, digits)); // ToEven (banker's)
      default: err("Expression.Error", "Number.Round: unknown rounding mode.");
    }
  }));
  def("Number.RoundDown", nn("Number.RoundDown", [{ name: "number" }, { name: "digits", optional: true }], (a) => {
    const scale = Math.pow(10, a[1] && a[1].kind === "number" ? a[1].value : 0);
    return number(Math.floor(numOf(a[0]!, "Number.RoundDown") * scale) / scale);
  }));
  def("Number.RoundUp", nn("Number.RoundUp", [{ name: "number" }, { name: "digits", optional: true }], (a) => {
    const scale = Math.pow(10, a[1] && a[1].kind === "number" ? a[1].value : 0);
    return number(Math.ceil(numOf(a[0]!, "Number.RoundUp") * scale) / scale);
  }));
  def("Number.RoundAwayFromZero", nn("Number.RoundAwayFromZero", [{ name: "number" }, { name: "digits", optional: true }], (a) => {
    const scale = Math.pow(10, a[1] && a[1].kind === "number" ? a[1].value : 0);
    const x = numOf(a[0]!, "Number.RoundAwayFromZero");
    return number((x >= 0 ? Math.ceil(x * scale) : Math.floor(x * scale)) / scale);
  }));
  def("Number.RoundTowardZero", nn("Number.RoundTowardZero", [{ name: "number" }, { name: "digits", optional: true }], (a) => {
    const scale = Math.pow(10, a[1] && a[1].kind === "number" ? a[1].value : 0);
    const x = numOf(a[0]!, "Number.RoundTowardZero");
    return number((x >= 0 ? Math.floor(x * scale) : Math.ceil(x * scale)) / scale);
  }));

  def("Number.IntegerDivide", nn("Number.IntegerDivide", [{ name: "number1" }, { name: "number2" }], (a) => {
    const q = numOf(a[0]!, "Number.IntegerDivide") / numOf(a[1]!, "number2");
    return number(Math.trunc(q));
  }));
  def("Number.Mod", nn("Number.Mod", [{ name: "number" }, { name: "divisor" }], (a) => {
    const x = numOf(a[0]!, "Number.Mod");
    const d = numOf(a[1]!, "divisor");
    return number(x - d * Math.trunc(x / d)); // sign follows the dividend (oracle-pinned)
  }));

  def("Number.IsNaN", fn("Number.IsNaN", [{ name: "number" }], (a) => ({ kind: "logical", value: a[0]!.kind === "number" && Number.isNaN(a[0]!.value) })));
  def("Number.ToText", nn("Number.ToText", [{ name: "number" }, { name: "format", optional: true }, { name: "culture", optional: true }], (a) => {
    const v = numOf(a[0]!, "Number.ToText");
    const f = a[1];
    const c = cultureOf(a[2]?.kind === "text" ? a[2].value : null);
    if (!f || f.kind === "null") return { kind: "text", value: isInvariant(c) ? String(v) : String(v).replace(".", numberSeparators(c).decimal) };
    if (f.kind !== "text") err("Expression.Error", "Number.ToText: format must be text.");
    try {
      const sep = numberSeparators(c);
      return { kind: "text", value: formatNumber(v, f.value, { decimal: sep.decimal, group: sep.group, currency: (val, digits) => formatCurrency(c, val, digits) }) };
    } catch (e) {
      err("Expression.Error", (e as Error).message);
    }
  }));
}
