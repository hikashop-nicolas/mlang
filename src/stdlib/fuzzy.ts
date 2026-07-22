// Table.Fuzzy* - approximate (fuzzy) matching for join/group/cluster.
//
// Power Query's real scorer is proprietary ("Jaccard similarity" per Microsoft, but it is
// order-sensitive, so not any published set-based Jaccard). This uses NORMALIZED LEVENSHTEIN
// similarity (1 - editDistance/maxLen), which reproduces every example in the reference
// (Grapes/Graes 0.833, Seattle/Seatle 0.857, Vancouver/vancover 0.889, Robert/Bob 0.33) and
// handles typo-style differences well. Borderline scores may differ from Excel's exact scorer;
// documented options (Threshold, IgnoreCase, IgnoreSpace, TransformationTable,
// SimilarityColumnName, NumberOfMatches) are all honoured. See SPEC_GAP.md.
import type { Env } from "../interpret.js";
import { NULL, err, number, text, type MValue } from "../values.js";
import { asTable, callFn, colIndex, fn, namesOf, pairList, subTable, textOf, type Table } from "./helpers.js";
import { textFrom } from "./convert.js";
import { table } from "../values.js";

function levenshtein(a: string, b: string): number {
  const m = a.length, n = b.length;
  if (m === 0) return n; if (n === 0) return m;
  let prev = Array.from({ length: n + 1 }, (_, i) => i);
  for (let i = 1; i <= m; i++) {
    const cur = [i];
    for (let j = 1; j <= n; j++) cur[j] = Math.min(prev[j]! + 1, cur[j - 1]! + 1, prev[j - 1]! + (a[i - 1] === b[j - 1] ? 0 : 1));
    prev = cur;
  }
  return prev[n]!;
}
const similarity = (a: string, b: string): number => { const L = Math.max(a.length, b.length); return L === 0 ? 1 : 1 - levenshtein(a, b) / L; };

interface Opts { threshold: number; ignoreCase: boolean; ignoreSpace: boolean; transform: [string, string][]; similarityColumn: string | null; numberOfMatches: number }
function parseOpts(v: MValue | undefined): Opts {
  const o = v && v.kind === "record" ? v.fields : new Map<string, MValue>();
  const num = (k: string, d: number): number => { const x = o.get(k); return x && x.kind === "number" ? x.value : d; };
  const bool = (k: string, d: boolean): boolean => { const x = o.get(k); return x && x.kind === "logical" ? x.value : d; };
  const tt = o.get("TransformationTable");
  const transform: [string, string][] = [];
  if (tt && tt.kind === "table") {
    const fi = tt.columns.indexOf("From"), ti = tt.columns.indexOf("To");
    if (fi >= 0 && ti >= 0) for (const r of tt.rows) transform.push([textFrom(r[fi] ?? NULL), textFrom(r[ti] ?? NULL)]);
  }
  const sc = o.get("SimilarityColumnName");
  return {
    threshold: num("Threshold", 0.8), ignoreCase: bool("IgnoreCase", true), ignoreSpace: bool("IgnoreSpace", true),
    transform, similarityColumn: sc && sc.kind === "text" ? sc.value : null, numberOfMatches: num("NumberOfMatches", Infinity),
  };
}
function normalize(s: string, o: Opts): string {
  let x = s;
  for (const [from, to] of o.transform) if (from) x = x.split(from).join(to);
  if (o.ignoreSpace) x = x.replace(/\s+/g, "");
  if (o.ignoreCase) x = x.toLowerCase();
  return x;
}
/** Concatenated normalized key text for a row's key columns. */
const keyText = (t: Table, i: number, cols: number[], o: Opts): string => cols.map((c) => normalize(textFrom(t.rows[i]![c] ?? NULL), o)).join("");

/** Frequency-seeded greedy clustering: returns a representative row-key value per row. */
function clusterReps(t: Table, cols: number[], o: Opts): MValue[] {
  const origKey = (i: number): string => cols.map((c) => textFrom(t.rows[i]![c] ?? NULL)).join("");
  const freq = new Map<string, number>(); const firstRow = new Map<string, number>();
  for (let i = 0; i < t.rows.length; i++) { const k = origKey(i); freq.set(k, (freq.get(k) ?? 0) + 1); if (!firstRow.has(k)) firstRow.set(k, i); }
  const seeds = [...freq.keys()].sort((a, b) => (freq.get(b)! - freq.get(a)!) || (firstRow.get(a)! - firstRow.get(b)!));
  const repOfKey = new Map<string, string>(); const normOf = new Map<string, string>();
  for (const k of seeds) normOf.set(k, keyText(t, firstRow.get(k)!, cols, o));
  for (const seed of seeds) {
    if (repOfKey.has(seed)) continue;
    repOfKey.set(seed, seed);
    for (const u of seeds) if (!repOfKey.has(u) && similarity(normOf.get(seed)!, normOf.get(u)!) >= o.threshold) repOfKey.set(u, seed);
  }
  // Representative value = the first cell(s) of the seed row (single-column keys are the common case).
  return t.rows.map((_, i) => { const rep = repOfKey.get(origKey(i))!; const ri = firstRow.get(rep)!; return cols.length === 1 ? (t.rows[ri]![cols[0]!] ?? NULL) : text(rep); });
}

export function registerFuzzy(env: Env): void {
  const def = (name: string, v: MValue): void => env.defineValue(name, v);

  const bestMatches = (t1: Table, i: number, k1: number[], t2: Table, k2: number[], o: Opts): { j: number; sim: number }[] => {
    const s = keyText(t1, i, k1, o);
    const hits: { j: number; sim: number }[] = [];
    for (let j = 0; j < t2.rows.length; j++) { const sim = similarity(s, keyText(t2, j, k2, o)); if (sim >= o.threshold) hits.push({ j, sim }); }
    hits.sort((a, b) => b.sim - a.sim);
    return Number.isFinite(o.numberOfMatches) ? hits.slice(0, o.numberOfMatches) : hits;
  };

  def("Table.FuzzyJoin", fn("Table.FuzzyJoin", [{ name: "table1" }, { name: "key1" }, { name: "table2" }, { name: "key2" }, { name: "joinKind", optional: true }, { name: "joinOptions", optional: true }], (a) => {
    const t1 = asTable(a[0]!, "Table.FuzzyJoin"), t2 = asTable(a[2]!, "Table.FuzzyJoin");
    const k1 = namesOf(a[1]!, "join key").map((c) => colIndex(t1, c));
    const k2 = namesOf(a[3]!, "join key").map((c) => colIndex(t2, c));
    const kind = a[4] && a[4].kind === "number" ? a[4].value : 0; // Inner default
    const o = parseOpts(a[5]);
    for (const c of t2.columns) if (t1.columns.includes(c)) err("Expression.Error", `A join operation cannot result in a table with duplicate column names ("${c}").`);
    const columns = [...t1.columns, ...t2.columns, ...(o.similarityColumn ? [o.similarityColumn] : [])];
    const nullsT2 = t2.columns.map(() => NULL);
    const nullsT1 = t1.columns.map(() => NULL);
    const simCell = (v: number | null): MValue[] => (o.similarityColumn ? [v === null ? NULL : number(v)] : []);
    const rows: MValue[][] = []; const matchedT2 = new Set<number>();
    for (let i = 0; i < t1.rows.length; i++) {
      const hits = bestMatches(t1, i, k1, t2, k2, o);
      hits.forEach((h) => matchedT2.add(h.j));
      if (kind === 4) { if (!hits.length) rows.push([...t1.rows[i]!, ...nullsT2, ...simCell(null)]); continue; } // LeftAnti
      if (kind === 6) { if (hits.length) rows.push([...t1.rows[i]!, ...nullsT2, ...simCell(null)]); continue; } // LeftSemi
      if (!hits.length) { if (kind === 1 || kind === 3) rows.push([...t1.rows[i]!, ...nullsT2, ...simCell(null)]); continue; } // Left/Full outer miss
      for (const h of hits) rows.push([...t1.rows[i]!, ...t2.rows[h.j]!, ...simCell(h.sim)]);
    }
    if (kind === 5) return table(columns, t2.rows.filter((_, j) => !matchedT2.has(j)).map((r) => [...nullsT1, ...r, ...simCell(null)])); // RightAnti
    if (kind === 7) return table(columns, t2.rows.filter((_, j) => matchedT2.has(j)).map((r) => [...nullsT1, ...r, ...simCell(null)])); // RightSemi
    if (kind === 2 || kind === 3) for (let j = 0; j < t2.rows.length; j++) if (!matchedT2.has(j)) rows.push([...nullsT1, ...t2.rows[j]!, ...simCell(null)]); // Right/Full outer
    return table(columns, rows);
  }));

  def("Table.FuzzyNestedJoin", fn("Table.FuzzyNestedJoin", [{ name: "table1" }, { name: "key1" }, { name: "table2" }, { name: "key2" }, { name: "newColumnName" }, { name: "joinKind", optional: true }, { name: "joinOptions", optional: true }], (a) => {
    const t1 = asTable(a[0]!, "Table.FuzzyNestedJoin"), t2 = asTable(a[2]!, "Table.FuzzyNestedJoin");
    const k1 = namesOf(a[1]!, "join key").map((c) => colIndex(t1, c));
    const k2 = namesOf(a[3]!, "join key").map((c) => colIndex(t2, c));
    const newCol = textOf(a[4]!, "new column name");
    const kind = a[5] && a[5].kind === "number" ? a[5].value : 1; // LeftOuter default
    const o = parseOpts(a[6]);
    const columns = [...t1.columns, newCol];
    const rows: MValue[][] = [];
    for (let i = 0; i < t1.rows.length; i++) {
      const hits = bestMatches(t1, i, k1, t2, k2, o);
      if (!hits.length && kind === 0) continue; // Inner: drop unmatched
      rows.push([...t1.rows[i]!, subTable(t2, hits.map((h) => h.j))]);
    }
    return table(columns, rows);
  }));

  def("Table.FuzzyGroup", fn("Table.FuzzyGroup", [{ name: "table" }, { name: "key" }, { name: "aggregatedColumns" }, { name: "options", optional: true }], (a) => {
    const t = asTable(a[0]!, "Table.FuzzyGroup");
    const keyCols = namesOf(a[1]!, "group key").map((c) => colIndex(t, c));
    const aggs = pairList(a[2]!, "aggregatedColumns").map((pr) => ({ name: textOf(pr[0]!, "aggregate name"), f: pr[1]! }));
    const o = parseOpts(a[3]);
    const reps = clusterReps(t, keyCols, o);
    // One output row per distinct representative, in first-appearance order.
    const order: string[] = []; const rowsByRep = new Map<string, number[]>(); const repVal = new Map<string, MValue>();
    for (let i = 0; i < t.rows.length; i++) {
      const rk = (reps[i]!.kind === "text" ? (reps[i] as { value: string }).value : textFrom(reps[i]!));
      if (!rowsByRep.has(rk)) { rowsByRep.set(rk, []); order.push(rk); repVal.set(rk, reps[i]!); }
      rowsByRep.get(rk)!.push(i);
    }
    const columns = [...keyCols.map((c) => t.columns[c]!), ...aggs.map((g) => g.name)];
    const rows = order.map((rk) => { const sub = subTable(t, rowsByRep.get(rk)!); return [repVal.get(rk)!, ...aggs.map((g) => callFn(g.f, [sub]))]; });
    return table(columns, rows);
  }));

  def("Table.AddFuzzyClusterColumn", fn("Table.AddFuzzyClusterColumn", [{ name: "table" }, { name: "columnName" }, { name: "newColumnName" }, { name: "options", optional: true }], (a) => {
    const t = asTable(a[0]!, "Table.AddFuzzyClusterColumn");
    const col = colIndex(t, textOf(a[1]!, "columnName"));
    const newCol = textOf(a[2]!, "newColumnName");
    const o = parseOpts(a[3]);
    const reps = clusterReps(t, [col], o);
    return table([...t.columns, newCol], t.rows.map((r, i) => [...r, reps[i]!]));
  }));

}
