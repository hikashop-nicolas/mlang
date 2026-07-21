// List.* functions.
import type { Env } from "../interpret.js";
import { NULL, equals, err, list, logical, number, type MValue } from "../values.js";
import { callFn, cmpWithNulls, fn, listOf, numOf, truthy } from "./helpers.js";

export function registerList(env: Env): void {
  const def = (name: string, v: MValue): void => env.defineValue(name, v);

  def("List.Count", fn("List.Count", [{ name: "list" }], (a) => number(listOf(a[0]!, "List.Count").length)));

  const numericFold = (name: string, seed: (nums: number[]) => number) =>
    fn(name, [{ name: "list" }], (a) => {
      const nums: number[] = [];
      for (const v of listOf(a[0]!, name)) {
        if (v.kind === "null") continue;
        if (v.kind !== "number") err("Expression.Error", `${name}: non-numeric value (${v.kind}).`);
        nums.push(v.value);
      }
      return nums.length ? number(seed(nums)) : NULL;
    });
  def("List.Sum", numericFold("List.Sum", (ns) => ns.reduce((s, x) => s + x, 0)));
  def("List.Average", numericFold("List.Average", (ns) => ns.reduce((s, x) => s + x, 0) / ns.length));
  def("List.Min", numericFold("List.Min", (ns) => Math.min(...ns)));
  def("List.Max", numericFold("List.Max", (ns) => Math.max(...ns)));

  def("List.Transform", fn("List.Transform", [{ name: "list" }, { name: "transform" }], (a) =>
    list(listOf(a[0]!, "List.Transform").map((v) => callFn(a[1]!, [v])))));
  def("List.Select", fn("List.Select", [{ name: "list" }, { name: "selection" }], (a) =>
    list(listOf(a[0]!, "List.Select").filter((v) => truthy(callFn(a[1]!, [v]))))));
  def("List.RemoveNulls", fn("List.RemoveNulls", [{ name: "list" }], (a) =>
    list(listOf(a[0]!, "List.RemoveNulls").filter((v) => v.kind !== "null"))));
  def("List.Distinct", fn("List.Distinct", [{ name: "list" }], (a) => {
    const out: MValue[] = [];
    for (const v of listOf(a[0]!, "List.Distinct")) if (!out.some((x) => equals(x, v))) out.push(v);
    return list(out);
  }));
  def("List.Contains", fn("List.Contains", [{ name: "list" }, { name: "value" }], (a) =>
    logical(listOf(a[0]!, "List.Contains").some((v) => equals(v, a[1]!)))));
  def("List.PositionOf", fn("List.PositionOf", [{ name: "list" }, { name: "value" }], (a) =>
    number(listOf(a[0]!, "List.PositionOf").findIndex((v) => equals(v, a[1]!)))));

  def("List.First", fn("List.First", [{ name: "list" }, { name: "default", optional: true }], (a) => {
    const items = listOf(a[0]!, "List.First");
    return items[0] ?? a[1] ?? NULL;
  }));
  def("List.Last", fn("List.Last", [{ name: "list" }, { name: "default", optional: true }], (a) => {
    const items = listOf(a[0]!, "List.Last");
    return items[items.length - 1] ?? a[1] ?? NULL;
  }));
  def("List.FirstN", fn("List.FirstN", [{ name: "list" }, { name: "countOrCondition" }], (a) => {
    const items = listOf(a[0]!, "List.FirstN");
    if (a[1]!.kind === "number") return list(items.slice(0, a[1]!.value));
    const out: MValue[] = [];
    for (const v of items) {
      if (!truthy(callFn(a[1]!, [v]))) break;
      out.push(v);
    }
    return list(out);
  }));
  def("List.LastN", fn("List.LastN", [{ name: "list" }, { name: "countOrCondition" }], (a) => {
    const items = listOf(a[0]!, "List.LastN");
    if (a[1]!.kind !== "number") err("Expression.Error", "List.LastN: only a count is supported.");
    return list(items.slice(Math.max(0, items.length - a[1]!.value)));
  }));
  def("List.Skip", fn("List.Skip", [{ name: "list" }, { name: "countOrCondition", optional: true }], (a) => {
    const items = listOf(a[0]!, "List.Skip");
    const cond = a[1] ?? number(1);
    if (cond.kind === "number") return list(items.slice(cond.value));
    let i = 0;
    while (i < items.length && truthy(callFn(cond, [items[i]!]))) i++;
    return list(items.slice(i));
  }));
  def("List.Range", fn("List.Range", [{ name: "list" }, { name: "offset" }, { name: "count", optional: true }], (a) => {
    const items = listOf(a[0]!, "List.Range");
    const off = numOf(a[1]!, "offset");
    return list(a[2] ? items.slice(off, off + numOf(a[2], "count")) : items.slice(off));
  }));
  def("List.Reverse", fn("List.Reverse", [{ name: "list" }], (a) => list([...listOf(a[0]!, "List.Reverse")].reverse())));

  def("List.Sort", fn("List.Sort", [{ name: "list" }, { name: "comparisonCriteria", optional: true }], (a) => {
    const items = [...listOf(a[0]!, "List.Sort")];
    const crit = a[1];
    if (!crit || (crit.kind === "number" && crit.value === 0)) items.sort(cmpWithNulls);
    else if (crit.kind === "number" && crit.value === 1) items.sort((x, y) => -cmpWithNulls(x, y));
    else if (crit.kind === "function") items.sort((x, y) => {
      const r = callFn(crit, [x, y]);
      return r.kind === "number" ? r.value : 0;
    });
    else err("Expression.Error", "List.Sort: unsupported criteria.");
    return list(items);
  }));

  def("List.Numbers", fn("List.Numbers", [{ name: "start" }, { name: "count" }, { name: "increment", optional: true }], (a) => {
    const start = numOf(a[0]!, "start");
    const count = numOf(a[1]!, "count");
    const step = a[2] ? numOf(a[2], "increment") : 1;
    return list(Array.from({ length: count }, (_, i) => number(start + i * step)));
  }));
  def("List.Zip", fn("List.Zip", [{ name: "lists" }], (a) => {
    const parts = listOf(a[0]!, "List.Zip").map((v) => listOf(v, "List.Zip"));
    const n = Math.max(0, ...parts.map((p) => p.length));
    return list(Array.from({ length: n }, (_, i) => list(parts.map((p) => p[i] ?? NULL))));
  }));
  def("List.Accumulate", fn("List.Accumulate", [{ name: "list" }, { name: "seed" }, { name: "accumulator" }], (a) => {
    let acc = a[1]!;
    for (const v of listOf(a[0]!, "List.Accumulate")) acc = callFn(a[2]!, [acc, v]);
    return acc;
  }));

  // List.Combine: concatenate a list of lists into one (one level of flattening).
  def("List.Combine", fn("List.Combine", [{ name: "lists" }], (a) => {
    const out: MValue[] = [];
    for (const inner of listOf(a[0]!, "List.Combine")) out.push(...listOf(inner, "List.Combine"));
    return list(out);
  }));
  // List.Buffer: eager materialization; our lists are already eager, so it's identity.
  def("List.Buffer", fn("List.Buffer", [{ name: "list" }], (a) => list([...listOf(a[0]!, "List.Buffer")])));
  def("List.Median", numericFold("List.Median", (ns) => {
    const s = [...ns].sort((x, y) => x - y);
    const mid = s.length >> 1;
    return s.length % 2 ? s[mid]! : (s[mid - 1]! + s[mid]!) / 2;
  }));
  // Sample standard deviation (n-1 denominator, as the reference).
  def("List.StandardDeviation", numericFold("List.StandardDeviation", (ns) => {
    if (ns.length < 2) return 0;
    const mean = ns.reduce((s, x) => s + x, 0) / ns.length;
    return Math.sqrt(ns.reduce((s, x) => s + (x - mean) ** 2, 0) / (ns.length - 1));
  }));
}
