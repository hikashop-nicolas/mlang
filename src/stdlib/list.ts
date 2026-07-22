// List.* functions.
import type { Env } from "../interpret.js";
import { NULL, equals, err, expect, list, logical, number, type MValue } from "../values.js";
import { callFn, cmpWithNulls, fn, listOf, numOf, truthy } from "./helpers.js";
import { nextRandom } from "../async-runtime.js";

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
  // List.TransformMany: for each item, produce a collection, then flatten with a result selector.
  def("List.TransformMany", fn("List.TransformMany", [{ name: "list" }, { name: "collectionTransform" }, { name: "resultTransform" }], (a) => {
    const out: MValue[] = [];
    for (const item of listOf(a[0]!, "List.TransformMany")) {
      for (const sub of listOf(callFn(a[1]!, [item]), "List.TransformMany collection")) out.push(callFn(a[2]!, [item, sub]));
    }
    return list(out);
  }));
  // List.Split: break a list into sublists of at most pageSize items.
  def("List.Split", fn("List.Split", [{ name: "list" }, { name: "pageSize" }], (a) => {
    const items = listOf(a[0]!, "List.Split");
    const size = Math.max(1, Math.trunc(numOf(a[1]!, "List.Split pageSize")));
    const out: MValue[] = [];
    for (let i = 0; i < items.length; i += size) out.push(list(items.slice(i, i + size)));
    return list(out);
  }));
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
  // List.Random(count, opt seed): count random numbers in [0,1). A seed makes it repeatable
  // within and across runs (its own mulberry32); without one it uses the run RNG.
  def("List.Random", fn("List.Random", [{ name: "count" }, { name: "seed", optional: true }], (a) => {
    const count = Math.max(0, Math.trunc(numOf(a[0]!, "List.Random count")));
    if (a[1] && a[1].kind === "number") {
      let s = a[1].value >>> 0;
      const out: MValue[] = [];
      for (let i = 0; i < count; i++) { s = (s + 0x6d2b79f5) | 0; let t = Math.imul(s ^ (s >>> 15), 1 | s); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; out.push(number(((t ^ (t >>> 14)) >>> 0) / 4294967296)); }
      return list(out);
    }
    return list(Array.from({ length: count }, () => number(nextRandom())));
  }));
  def("List.ContainsAll", fn("List.ContainsAll", [{ name: "list" }, { name: "values" }, { name: "equationCriteria", optional: true }], (a) => {
    const items = listOf(a[0]!, "List.ContainsAll");
    return logical(listOf(a[1]!, "List.ContainsAll values").every((val) => items.some((v) => equals(v, val))));
  }));
  def("List.ContainsAny", fn("List.ContainsAny", [{ name: "list" }, { name: "values" }, { name: "equationCriteria", optional: true }], (a) => {
    const items = listOf(a[0]!, "List.ContainsAny");
    return logical(listOf(a[1]!, "List.ContainsAny values").some((val) => items.some((v) => equals(v, val))));
  }));
  def("List.PositionOfAny", fn("List.PositionOfAny", [{ name: "list" }, { name: "values" }, { name: "occurrence", optional: true }, { name: "equationCriteria", optional: true }], (a) => {
    const items = listOf(a[0]!, "List.PositionOfAny");
    const vals = listOf(a[1]!, "List.PositionOfAny values");
    const occ = a[2] && a[2].kind === "number" ? a[2].value : 0;
    const hits = items.map((v, i) => (vals.some((x) => equals(v, x)) ? i : -1)).filter((i) => i >= 0);
    if (occ === 2) return list(hits.map(number));
    return number(occ === 1 ? (hits[hits.length - 1] ?? -1) : (hits[0] ?? -1));
  }));
  def("List.IsDistinct", fn("List.IsDistinct", [{ name: "list" }, { name: "equationCriteria", optional: true }], (a) => {
    const items = listOf(a[0]!, "List.IsDistinct");
    for (let i = 0; i < items.length; i++) for (let j = i + 1; j < items.length; j++) if (equals(items[i]!, items[j]!)) return logical(false);
    return logical(true);
  }));
  def("List.NonNullCount", fn("List.NonNullCount", [{ name: "list" }], (a) => number(listOf(a[0]!, "List.NonNullCount").filter((v) => v.kind !== "null").length)));
  def("List.MatchesAll", fn("List.MatchesAll", [{ name: "list" }, { name: "condition" }], (a) => logical(listOf(a[0]!, "List.MatchesAll").every((v) => truthy(callFn(a[1]!, [v]))))));
  def("List.MatchesAny", fn("List.MatchesAny", [{ name: "list" }, { name: "condition" }], (a) => logical(listOf(a[0]!, "List.MatchesAny").some((v) => truthy(callFn(a[1]!, [v]))))));
  def("List.FindText", fn("List.FindText", [{ name: "list" }, { name: "text" }], (a) => {
    const needle = expect(a[1]!, "text", "List.FindText").value;
    const has = (v: MValue): boolean =>
      v.kind === "text" ? v.value.includes(needle)
        : v.kind === "record" ? [...v.fields.values()].some(has)
          : v.kind === "list" ? v.items.some(has) : false;
    return list(listOf(a[0]!, "List.FindText").filter(has));
  }));
  // Positional edits: insert/remove/replace a contiguous range.
  def("List.InsertRange", fn("List.InsertRange", [{ name: "list" }, { name: "index" }, { name: "values" }], (a) => {
    const items = listOf(a[0]!, "List.InsertRange").slice();
    items.splice(numOf(a[1]!, "index"), 0, ...listOf(a[2]!, "List.InsertRange values"));
    return list(items);
  }));
  def("List.RemoveRange", fn("List.RemoveRange", [{ name: "list" }, { name: "index" }, { name: "count", optional: true }], (a) => {
    const items = listOf(a[0]!, "List.RemoveRange").slice();
    items.splice(numOf(a[1]!, "index"), a[2] && a[2].kind === "number" ? a[2].value : 1);
    return list(items);
  }));
  def("List.ReplaceRange", fn("List.ReplaceRange", [{ name: "list" }, { name: "index" }, { name: "count" }, { name: "replaceWith" }], (a) => {
    const items = listOf(a[0]!, "List.ReplaceRange").slice();
    items.splice(numOf(a[1]!, "index"), numOf(a[2]!, "count"), ...listOf(a[3]!, "List.ReplaceRange replaceWith"));
    return list(items);
  }));
  def("List.ReplaceValue", fn("List.ReplaceValue", [{ name: "list" }, { name: "oldValue" }, { name: "newValue" }, { name: "replacer", optional: true }], (a) => {
    if (a[3] && a[3].kind === "function") return list(listOf(a[0]!, "List.ReplaceValue").map((v) => callFn(a[3]!, [v, a[1]!, a[2]!])));
    return list(listOf(a[0]!, "List.ReplaceValue").map((v) => (equals(v, a[1]!) ? a[2]! : v)));
  }));
  // Statistics: mode(s), covariance, percentile (ExcelInc default; ExcelExc supported).
  const modeCounts = (items: MValue[]): { v: MValue; n: number }[] => {
    const groups: { v: MValue; n: number }[] = [];
    for (const it of items) { if (it.kind === "null") continue; const g = groups.find((x) => equals(x.v, it)); if (g) g.n++; else groups.push({ v: it, n: 1 }); }
    return groups;
  };
  def("List.Mode", fn("List.Mode", [{ name: "list" }, { name: "equationCriteria", optional: true }], (a) => {
    const g = modeCounts(listOf(a[0]!, "List.Mode")); if (!g.length) return NULL;
    return g.reduce((best, x) => (x.n > best.n ? x : best)).v;
  }));
  def("List.Modes", fn("List.Modes", [{ name: "list" }, { name: "equationCriteria", optional: true }], (a) => {
    const g = modeCounts(listOf(a[0]!, "List.Modes")); const max = g.reduce((m, x) => Math.max(m, x.n), 0);
    return list(g.filter((x) => x.n === max).map((x) => x.v));
  }));
  def("List.Covariance", fn("List.Covariance", [{ name: "list1" }, { name: "list2" }], (a) => {
    const xs = listOf(a[0]!, "List.Covariance").map((v) => numOf(v, "List.Covariance")), ys = listOf(a[1]!, "List.Covariance").map((v) => numOf(v, "List.Covariance"));
    const n = Math.min(xs.length, ys.length); if (n === 0) return NULL;
    const mx = xs.reduce((s, x) => s + x, 0) / n, my = ys.reduce((s, y) => s + y, 0) / n;
    let cov = 0; for (let i = 0; i < n; i++) cov += (xs[i]! - mx) * (ys[i]! - my);
    return number(cov / n);
  }));
  const percentile = (sorted: number[], p: number, exc: boolean): number => {
    const n = sorted.length;
    const rank = exc ? p * (n + 1) - 1 : p * (n - 1); // 0-based fractional index
    if (rank <= 0) return sorted[0]!;
    if (rank >= n - 1) return sorted[n - 1]!;
    const lo = Math.floor(rank), frac = rank - lo;
    return sorted[lo]! + frac * (sorted[lo + 1]! - sorted[lo]!);
  };
  def("List.Percentile", fn("List.Percentile", [{ name: "list" }, { name: "percentiles" }, { name: "options", optional: true }], (a) => {
    const sorted = listOf(a[0]!, "List.Percentile").filter((v) => v.kind !== "null").map((v) => numOf(v, "List.Percentile")).sort((x, y) => x - y);
    if (!sorted.length) return NULL;
    const opt = a[2]; const exc = opt?.kind === "record" && opt.fields.get("PercentileMode")?.kind === "number" && (opt.fields.get("PercentileMode") as { value: number }).value === 1;
    const one = (p: number): MValue => number(percentile(sorted, p, exc));
    return a[1]!.kind === "list" ? list(a[1]!.items.map((p) => one(numOf(p, "percentile")))) : one(numOf(a[1]!, "percentile"));
  }));

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

  def("List.IsEmpty", fn("List.IsEmpty", [{ name: "list" }], (a) => logical(listOf(a[0]!, "List.IsEmpty").length === 0)));
  def("List.Repeat", fn("List.Repeat", [{ name: "list" }, { name: "count" }], (a) => {
    const items = listOf(a[0]!, "List.Repeat");
    const out: MValue[] = [];
    for (let i = 0; i < numOf(a[1]!, "count"); i++) out.push(...items);
    return list(out);
  }));
  def("List.Positions", fn("List.Positions", [{ name: "list" }], (a) => list(listOf(a[0]!, "List.Positions").map((_, i) => number(i)))));
  def("List.Single", fn("List.Single", [{ name: "list" }], (a) => {
    const items = listOf(a[0]!, "List.Single");
    if (items.length !== 1) err("Expression.Error", "List.Single: the list does not have exactly one item.");
    return items[0]!;
  }));
  def("List.SingleOrDefault", fn("List.SingleOrDefault", [{ name: "list" }, { name: "default", optional: true }], (a) => {
    const items = listOf(a[0]!, "List.SingleOrDefault");
    if (items.length > 1) err("Expression.Error", "List.SingleOrDefault: the list has more than one item.");
    return items[0] ?? a[1] ?? NULL;
  }));
  def("List.AnyTrue", fn("List.AnyTrue", [{ name: "list" }], (a) => logical(listOf(a[0]!, "List.AnyTrue").some(truthy))));
  def("List.AllTrue", fn("List.AllTrue", [{ name: "list" }], (a) => logical(listOf(a[0]!, "List.AllTrue").every(truthy))));
  def("List.Product", numericFold("List.Product", (ns) => ns.reduce((p, x) => p * x, 1)));
  const takeN = (name: string, cmp: (a: number, b: number) => number) =>
    fn(name, [{ name: "list" }, { name: "countOrCondition" }], (a) => {
      const nums = listOf(a[0]!, name).filter((v) => v.kind !== "null");
      const sorted = [...nums].sort((x, y) => cmp(numOf(x, name), numOf(y, name)));
      const n = numOf(a[1]!, "count");
      return list(sorted.slice(0, n));
    });
  def("List.MinN", takeN("List.MinN", (x, y) => x - y));
  def("List.MaxN", takeN("List.MaxN", (x, y) => y - x));
  def("List.Difference", fn("List.Difference", [{ name: "list1" }, { name: "list2" }, { name: "equationCriteria", optional: true }], (a) => {
    const remove = listOf(a[1]!, "List.Difference");
    return list(listOf(a[0]!, "List.Difference").filter((v) => !remove.some((r) => equals(r, v))));
  }));
  def("List.RemoveItems", fn("List.RemoveItems", [{ name: "list1" }, { name: "list2" }], (a) => {
    const remove = listOf(a[1]!, "List.RemoveItems");
    return list(listOf(a[0]!, "List.RemoveItems").filter((v) => !remove.some((r) => equals(r, v))));
  }));
  def("List.RemoveMatchingItems", fn("List.RemoveMatchingItems", [{ name: "list1" }, { name: "list2" }, { name: "equationCriteria", optional: true }], (a) => {
    const remove = listOf(a[1]!, "List.RemoveMatchingItems");
    return list(listOf(a[0]!, "List.RemoveMatchingItems").filter((v) => !remove.some((r) => equals(r, v))));
  }));
  // List.RemoveFirstN / RemoveLastN: drop N (or while a condition holds) from an end.
  def("List.RemoveFirstN", fn("List.RemoveFirstN", [{ name: "list" }, { name: "countOrCondition", optional: true }], (a) => {
    const items = listOf(a[0]!, "List.RemoveFirstN");
    if (!a[1]) return list(items.slice(1));
    if (a[1].kind === "number") return list(items.slice(a[1].value));
    let i = 0; while (i < items.length && truthy(callFn(a[1], [items[i]!]))) i++;
    return list(items.slice(i));
  }));
  def("List.RemoveLastN", fn("List.RemoveLastN", [{ name: "list" }, { name: "countOrCondition", optional: true }], (a) => {
    const items = listOf(a[0]!, "List.RemoveLastN");
    if (!a[1]) return list(items.slice(0, -1));
    if (a[1].kind === "number") return list(a[1].value >= items.length ? [] : items.slice(0, items.length - a[1].value));
    let i = items.length; while (i > 0 && truthy(callFn(a[1], [items[i - 1]!]))) i--;
    return list(items.slice(0, i));
  }));
  def("List.Union", fn("List.Union", [{ name: "lists" }, { name: "equationCriteria", optional: true }], (a) => {
    const out: MValue[] = [];
    for (const inner of listOf(a[0]!, "List.Union")) for (const v of listOf(inner, "List.Union")) if (!out.some((x) => equals(x, v))) out.push(v);
    return list(out);
  }));
  def("List.Intersect", fn("List.Intersect", [{ name: "lists" }, { name: "equationCriteria", optional: true }], (a) => {
    const parts = listOf(a[0]!, "List.Intersect").map((v) => listOf(v, "List.Intersect"));
    if (parts.length === 0) return list([]);
    const out: MValue[] = [];
    for (const v of parts[0]!) if (parts.every((p) => p.some((x) => equals(x, v))) && !out.some((x) => equals(x, v))) out.push(v);
    return list(out);
  }));
  def("List.ReplaceMatchingItems", fn("List.ReplaceMatchingItems", [{ name: "list" }, { name: "replacements" }, { name: "equationCriteria", optional: true }], (a) => {
    const reps = listOf(a[1]!, "List.ReplaceMatchingItems").map((p) => listOf(p, "replacement"));
    return list(listOf(a[0]!, "List.ReplaceMatchingItems").map((v) => {
      const hit = reps.find((r) => equals(r[0]!, v));
      return hit ? hit[1]! : v;
    }));
  }));
  // List.Alternate(list, count, optional repeatInterval, optional offset): keep `offset`, then
  // repeatedly remove `count` and keep `repeatInterval` (default repeatInterval = 1).
  def("List.Alternate", fn("List.Alternate", [{ name: "list" }, { name: "count" }, { name: "repeatInterval", optional: true }, { name: "offset", optional: true }], (a) => {
    const items = listOf(a[0]!, "List.Alternate");
    const count = numOf(a[1]!, "count");
    // Omitting repeatInterval keeps everything after the single removal (oracle-confirmed).
    const repeat = a[2] && a[2].kind === "number" ? a[2].value : Infinity;
    const offset = a[3] && a[3].kind === "number" ? a[3].value : 0;
    const out: MValue[] = items.slice(0, offset);
    let i = offset;
    while (i < items.length) {
      i += count; // remove
      for (let k = 0; k < repeat && i < items.length; k++, i++) out.push(items[i]!); // keep
    }
    return list(out);
  }));
}
