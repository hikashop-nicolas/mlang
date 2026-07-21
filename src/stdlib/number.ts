// Number.* functions. Number.Round defaults to banker's rounding (RoundingMode.ToEven),
// per the reference; the rounding cases are oracle-pinned.
import type { Env } from "../interpret.js";
import { NULL, err, number, type MValue } from "../values.js";
import { fn, numOf } from "./helpers.js";

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
    if (a[1] && a[1].kind !== "null") err("Expression.Error", "Number.ToText: format strings are not supported yet.");
    return { kind: "text", value: String(numOf(a[0]!, "Number.ToText")) };
  }));
}
