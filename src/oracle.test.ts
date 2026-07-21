import { readdirSync, readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { evaluate, type MValue } from "./index.js";

// Oracle fixtures: every test/oracle/cases/*.query.pq with a committed .pqout (generated
// by Microsoft's PQTest on CI - see .github/workflows/oracle.yml) is evaluated by mlang
// and compared against the real engine's serialized output. Adding a case = add the
// .query.pq, run the Oracle workflow, commit the .pqout.

const CASES_DIR = new URL("../test/oracle/cases/", import.meta.url);

// --- .pqout parser (the M-flavoured value serialization PQTest emits) -----------------

type P = { s: string; i: number };
const ws = (p: P): void => {
  while (p.i < p.s.length && /\s/.test(p.s[p.i]!)) p.i++;
};
const lit = (p: P, t: string): boolean => {
  ws(p);
  if (p.s.startsWith(t, p.i)) {
    p.i += t.length;
    return true;
  }
  return false;
};
const expectLit = (p: P, t: string): void => {
  if (!lit(p, t)) throw new Error(`pqout: expected '${t}' at ${p.i}: ...${p.s.slice(p.i, p.i + 30)}`);
};

function parsePqout(text: string): unknown {
  const p: P = { s: text, i: 0 };
  const v = parseValue(p);
  ws(p);
  return v;
}

function parseValue(p: P): unknown {
  ws(p);
  const c = p.s[p.i];
  if (c === '"') return parseText(p);
  if (c === "[") return parseRecord(p);
  if (c === "{") return parseList(p);
  if (lit(p, "#table")) return parseTable(p);
  // Longest-prefix first: #datetimezone before #datetime before #date.
  if (lit(p, "#datetimezone")) throw new Error("pqout: datetimezone not supported yet");
  if (lit(p, "#datetime")) {
    const [y, mo, d, h, mi, s] = parseNumArgs(p, 6);
    return `#datetime(${y},${mo},${d},${h! * 3600 + mi! * 60 + s!})`;
  }
  if (lit(p, "#date")) {
    const [y, mo, d] = parseNumArgs(p, 3);
    return `#date(${y},${mo},${d})`;
  }
  if (lit(p, "#time")) {
    const [h, mi, s] = parseNumArgs(p, 3);
    return `#time(${h! * 3600 + mi! * 60 + s!})`;
  }
  if (lit(p, "#duration")) {
    const [d, h, mi, s] = parseNumArgs(p, 4);
    return `#duration(${d! * 86400 + h! * 3600 + mi! * 60 + s!})`;
  }
  if (lit(p, "#infinity")) return Infinity;
  if (lit(p, "-#infinity")) return -Infinity;
  if (lit(p, "#nan")) return NaN;
  if (lit(p, "null")) return null;
  if (lit(p, "true")) return true;
  if (lit(p, "false")) return false;
  const m = /^-?\d+(\.\d+)?([eE][+-]?\d+)?/.exec(p.s.slice(p.i));
  if (m) {
    p.i += m[0].length;
    return Number(m[0]);
  }
  throw new Error(`pqout: unexpected value at ${p.i}: ...${p.s.slice(p.i, p.i + 30)}`);
}

function parseNumArgs(p: P, n: number): number[] {
  expectLit(p, "(");
  const out: number[] = [];
  for (let i = 0; i < n; i++) {
    ws(p);
    const m = /^-?\d+(\.\d+)?/.exec(p.s.slice(p.i));
    if (!m) throw new Error(`pqout: expected number arg at ${p.i}`);
    out.push(Number(m[0]));
    p.i += m[0].length;
    if (i < n - 1) expectLit(p, ",");
  }
  expectLit(p, ")");
  return out;
}

function parseText(p: P): string {
  expectLit(p, '"');
  let out = "";
  while (p.i < p.s.length) {
    const ch = p.s[p.i]!;
    if (ch === '"') {
      if (p.s[p.i + 1] === '"') {
        out += '"';
        p.i += 2;
        continue;
      }
      p.i++;
      return out;
    }
    out += ch;
    p.i++;
  }
  throw new Error("pqout: unterminated text");
}

function parseRecord(p: P): Record<string, unknown> {
  expectLit(p, "[");
  const out: Record<string, unknown> = {};
  ws(p);
  if (lit(p, "]")) return out;
  for (;;) {
    ws(p);
    const m = /^#?"?[^=\]]+?"?\s*=/.exec(p.s.slice(p.i));
    if (!m) throw new Error(`pqout: bad record field at ${p.i}`);
    const key = m[0].slice(0, -1).trim().replace(/^#?"|"$/g, "");
    p.i += m[0].length;
    out[key] = parseValue(p);
    ws(p);
    if (lit(p, "]")) return out;
    expectLit(p, ",");
  }
}

function parseList(p: P): unknown[] {
  expectLit(p, "{");
  const out: unknown[] = [];
  ws(p);
  if (lit(p, "}")) return out;
  for (;;) {
    out.push(parseValue(p));
    ws(p);
    if (lit(p, "}")) return out;
    expectLit(p, ",");
  }
}

function parseTable(p: P): { table: true; columns: string[]; rows: unknown[][] } {
  expectLit(p, "(");
  // "type table [A = any, B = number]" - only the column NAMES matter for comparison.
  expectLit(p, "type table");
  expectLit(p, "[");
  const columns: string[] = [];
  for (;;) {
    ws(p);
    const m = /^#?"?([^=,\]]+?)"?\s*=\s*[\w.]+/.exec(p.s.slice(p.i));
    if (!m) throw new Error(`pqout: bad table column at ${p.i}`);
    columns.push(m[1]!.trim());
    p.i += m[0].length;
    ws(p);
    if (lit(p, "]")) break;
    expectLit(p, ",");
  }
  expectLit(p, ",");
  const rows = parseList(p) as unknown[][];
  expectLit(p, ")");
  return { table: true, columns, rows };
}

// --- canonical form for comparison ------------------------------------------------------

function canon(v: unknown): unknown {
  if (typeof v === "number") {
    if (Number.isNaN(v)) return "#nan";
    if (v === Infinity) return "#infinity";
    if (v === -Infinity) return "-#infinity";
    return v;
  }
  if (Array.isArray(v)) return v.map(canon);
  if (v && typeof v === "object") {
    const o = v as Record<string, unknown>;
    if (o.table === true || (Array.isArray(o.columns) && Array.isArray(o.rows))) {
      return { table: true, columns: o.columns, rows: (o.rows as unknown[][]).map((r) => r.map(canon)) };
    }
    return Object.fromEntries(Object.entries(o).map(([k, x]) => [k, canon(x)]));
  }
  return v;
}

function mvalueToPlain(v: MValue): unknown {
  switch (v.kind) {
    case "null": return null;
    case "logical": return v.value;
    case "number": return v.value;
    case "text": return v.value;
    case "date": return `#date(${v.y},${v.m},${v.d})`;
    case "time": return `#time(${v.secs})`;
    case "datetime": return `#datetime(${v.y},${v.m},${v.d},${v.secs})`;
    case "duration": return `#duration(${v.secs})`;
    case "list": return v.items.map(mvalueToPlain);
    case "record": return Object.fromEntries([...v.fields].map(([k, x]) => [k, mvalueToPlain(x)]));
    case "table": return { table: true, columns: v.columns, rows: v.rows.map((r) => r.map(mvalueToPlain)) };
    default: return `<${v.kind}>`;
  }
}

// --- the suite ---------------------------------------------------------------------------

// constants.query.pq: PQTest serializes enums SYMBOLICALLY (JoinKind.Inner, not 0), so a
// numeric comparison would be circular; the functional cases pin the behaviour instead.
const SKIP = new Set(["constants"]);
const caseNames = readdirSync(CASES_DIR)
  .filter((f) => f.endsWith(".query.pq"))
  .map((f) => f.slice(0, -".query.pq".length))
  .filter((n) => !SKIP.has(n))
  .filter((name) => {
    try {
      readFileSync(new URL(`${name}.query.pqout`, CASES_DIR));
      return true;
    } catch {
      return false;
    }
  });

describe("oracle fixtures (PQTest ground truth)", () => {
  it("has committed fixtures", () => {
    expect(caseNames.length).toBeGreaterThanOrEqual(10);
  });

  for (const name of caseNames) {
    it(name, async () => {
      const m = readFileSync(new URL(`${name}.query.pq`, CASES_DIR), "utf8");
      const pqout = readFileSync(new URL(`${name}.query.pqout`, CASES_DIR), "utf8");
      const ours = canon(mvalueToPlain(await evaluate(m)));
      const oracle = canon(parsePqout(pqout));
      expect(ours).toEqual(oracle);
    });
  }
});
