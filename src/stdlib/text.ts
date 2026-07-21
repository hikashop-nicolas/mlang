// Text.* functions plus Splitter.*, Combiner-free Tier-1 subset, and Replacer.*.
import type { Env } from "../interpret.js";
import { NULL, err, list, logical, number, text, type MValue } from "../values.js";
import { fn, listOf, numOf, textOf } from "./helpers.js";
import { numberFrom, textFrom } from "./convert.js";

/** null-in null-out wrapper for the many Text functions that propagate null. */
const nn = (name: string, params: { name: string; optional?: boolean }[], f: (args: MValue[]) => MValue) =>
  fn(name, params, (a) => (a[0] && a[0].kind === "null" ? NULL : f(a)));

export function registerText(env: Env): void {
  const def = (name: string, v: MValue): void => env.defineValue(name, v);

  def("Text.From", fn("Text.From", [{ name: "value" }, { name: "culture", optional: true }], (a) =>
    a[0]!.kind === "null" ? NULL : text(textFrom(a[0]!))));
  def("Number.From", fn("Number.From", [{ name: "value" }, { name: "culture", optional: true }], (a) => numberFrom(a[0]!)));

  def("Text.Length", nn("Text.Length", [{ name: "text" }], (a) => number([...textOf(a[0]!, "Text.Length")].length)));
  def("Text.Upper", nn("Text.Upper", [{ name: "text" }], (a) => text(textOf(a[0]!, "Text.Upper").toUpperCase())));
  def("Text.Lower", nn("Text.Lower", [{ name: "text" }], (a) => text(textOf(a[0]!, "Text.Lower").toLowerCase())));
  def("Text.Proper", nn("Text.Proper", [{ name: "text" }], (a) =>
    text(textOf(a[0]!, "Text.Proper").replace(/\p{L}[\p{L}\p{N}]*/gu, (w) => w[0]!.toUpperCase() + w.slice(1).toLowerCase()))));

  const trimChars = (a: MValue[], name: string): string[] | null => {
    if (!a[1]) return null;
    if (a[1].kind === "text") return [...a[1].value];
    if (a[1].kind === "list") return a[1].items.map((v) => textOf(v, name));
    err("Expression.Error", `${name}: unsupported trim spec.`);
  };
  const trim = (s: string, chars: string[] | null, start: boolean, end: boolean): string => {
    const isTrim = (ch: string): boolean => (chars ? chars.includes(ch) : /\s/.test(ch));
    let i = 0;
    let j = s.length;
    if (start) while (i < j && isTrim(s[i]!)) i++;
    if (end) while (j > i && isTrim(s[j - 1]!)) j--;
    return s.slice(i, j);
  };
  def("Text.Trim", nn("Text.Trim", [{ name: "text" }, { name: "trim", optional: true }], (a) => text(trim(textOf(a[0]!, "Text.Trim"), trimChars(a, "Text.Trim"), true, true))));
  def("Text.TrimStart", nn("Text.TrimStart", [{ name: "text" }, { name: "trim", optional: true }], (a) => text(trim(textOf(a[0]!, "Text.TrimStart"), trimChars(a, "Text.TrimStart"), true, false))));
  def("Text.TrimEnd", nn("Text.TrimEnd", [{ name: "text" }, { name: "trim", optional: true }], (a) => text(trim(textOf(a[0]!, "Text.TrimEnd"), trimChars(a, "Text.TrimEnd"), false, true))));

  def("Text.Start", nn("Text.Start", [{ name: "text" }, { name: "count" }], (a) => text(textOf(a[0]!, "Text.Start").slice(0, numOf(a[1]!, "count")))));
  def("Text.End", nn("Text.End", [{ name: "text" }, { name: "count" }], (a) => {
    const s = textOf(a[0]!, "Text.End");
    return text(s.slice(Math.max(0, s.length - numOf(a[1]!, "count"))));
  }));
  def("Text.Middle", nn("Text.Middle", [{ name: "text" }, { name: "start" }, { name: "count", optional: true }], (a) => {
    const s = textOf(a[0]!, "Text.Middle");
    const start = numOf(a[1]!, "start");
    return text(a[2] ? s.slice(start, start + numOf(a[2], "count")) : s.slice(start));
  }));
  def("Text.Range", nn("Text.Range", [{ name: "text" }, { name: "offset" }, { name: "count", optional: true }], (a) => {
    const s = textOf(a[0]!, "Text.Range");
    const off = numOf(a[1]!, "offset");
    if (off < 0 || off > s.length) err("Expression.Error", "Text.Range: offset out of range.");
    if (!a[2]) return text(s.slice(off));
    const count = numOf(a[2], "count");
    if (off + count > s.length) err("Expression.Error", "Text.Range: count out of range.");
    return text(s.slice(off, off + count));
  }));
  def("Text.At", nn("Text.At", [{ name: "text" }, { name: "index" }], (a) => {
    const s = textOf(a[0]!, "Text.At");
    const i = numOf(a[1]!, "index");
    if (i < 0 || i >= s.length) err("Expression.Error", "Text.At: index out of range.");
    return text(s[i]!);
  }));

  // Comparer support: only the two ordinal comparers, recognized by name.
  const ci = (a: MValue[], idx: number): boolean => {
    const cmp = a[idx];
    if (!cmp || cmp.kind === "null") return false;
    if (cmp.kind === "function" && (cmp.name === "Comparer.OrdinalIgnoreCase")) return true;
    if (cmp.kind === "function" && (cmp.name === "Comparer.Ordinal")) return false;
    err("Expression.Error", "Only Comparer.Ordinal / Comparer.OrdinalIgnoreCase are supported.");
  };
  const norm = (s: string, ig: boolean): string => (ig ? s.toLowerCase() : s);
  def("Text.Contains", nn("Text.Contains", [{ name: "text" }, { name: "substring" }, { name: "comparer", optional: true }], (a) => {
    const ig = ci(a, 2);
    return logical(norm(textOf(a[0]!, "Text.Contains"), ig).includes(norm(textOf(a[1]!, "substring"), ig)));
  }));
  def("Text.StartsWith", nn("Text.StartsWith", [{ name: "text" }, { name: "substring" }, { name: "comparer", optional: true }], (a) => {
    const ig = ci(a, 2);
    return logical(norm(textOf(a[0]!, "Text.StartsWith"), ig).startsWith(norm(textOf(a[1]!, "substring"), ig)));
  }));
  def("Text.EndsWith", nn("Text.EndsWith", [{ name: "text" }, { name: "substring" }, { name: "comparer", optional: true }], (a) => {
    const ig = ci(a, 2);
    return logical(norm(textOf(a[0]!, "Text.EndsWith"), ig).endsWith(norm(textOf(a[1]!, "substring"), ig)));
  }));
  def("Text.PositionOf", nn("Text.PositionOf", [{ name: "text" }, { name: "substring" }, { name: "occurrence", optional: true }], (a) => {
    const s = textOf(a[0]!, "Text.PositionOf");
    const sub = textOf(a[1]!, "substring");
    const occ = a[2] && a[2].kind === "number" ? a[2].value : 0;
    if (occ === 2) {
      const out: MValue[] = [];
      let i = s.indexOf(sub);
      while (i >= 0) {
        out.push(number(i));
        i = s.indexOf(sub, i + 1);
      }
      return list(out);
    }
    return number(occ === 1 ? s.lastIndexOf(sub) : s.indexOf(sub));
  }));

  def("Text.Replace", nn("Text.Replace", [{ name: "text" }, { name: "old" }, { name: "new" }], (a) =>
    text(textOf(a[0]!, "Text.Replace").split(textOf(a[1]!, "old")).join(textOf(a[2]!, "new")))));
  def("Text.Split", nn("Text.Split", [{ name: "text" }, { name: "separator" }], (a) =>
    list(textOf(a[0]!, "Text.Split").split(textOf(a[1]!, "separator")).map(text))));
  def("Text.Combine", fn("Text.Combine", [{ name: "texts" }, { name: "separator", optional: true }], (a) => {
    const sep = a[1] ? textOf(a[1], "separator") : "";
    const parts = listOf(a[0]!, "Text.Combine").filter((v) => v.kind !== "null").map((v) => textOf(v, "Text.Combine"));
    return text(parts.join(sep));
  }));
  def("Text.PadStart", nn("Text.PadStart", [{ name: "text" }, { name: "count" }, { name: "character", optional: true }], (a) =>
    text(textOf(a[0]!, "Text.PadStart").padStart(numOf(a[1]!, "count"), a[2] ? textOf(a[2], "character") : " "))));
  def("Text.PadEnd", nn("Text.PadEnd", [{ name: "text" }, { name: "count" }, { name: "character", optional: true }], (a) =>
    text(textOf(a[0]!, "Text.PadEnd").padEnd(numOf(a[1]!, "count"), a[2] ? textOf(a[2], "character") : " "))));
  def("Text.Repeat", nn("Text.Repeat", [{ name: "text" }, { name: "count" }], (a) => text(textOf(a[0]!, "Text.Repeat").repeat(numOf(a[1]!, "count")))));
  def("Text.Reverse", nn("Text.Reverse", [{ name: "text" }], (a) => text([...textOf(a[0]!, "Text.Reverse")].reverse().join(""))));

  // Splitters (function factories used by Table.SplitColumn).
  def("Splitter.SplitTextByDelimiter", fn("Splitter.SplitTextByDelimiter", [{ name: "delimiter" }, { name: "quoteStyle", optional: true }], (a) => {
    const delim = textOf(a[0]!, "delimiter");
    const quoted = a[1] && a[1].kind === "number" && a[1].value === 1; // QuoteStyle.Csv
    return fn("splitter", [{ name: "text" }], (b) => {
      const s = textOf(b[0]!, "split input");
      if (!quoted) return list(s.split(delim).map(text));
      const parts: string[] = [];
      let cur = "";
      let inQ = false;
      for (let i = 0; i < s.length; i++) {
        const ch = s[i]!;
        if (inQ) {
          if (ch === '"') {
            if (s[i + 1] === '"') {
              cur += '"';
              i++;
            } else inQ = false;
          } else cur += ch;
        } else if (ch === '"') inQ = true;
        else if (s.startsWith(delim, i)) {
          parts.push(cur);
          cur = "";
          i += delim.length - 1;
        } else cur += ch;
      }
      parts.push(cur);
      return list(parts.map(text));
    });
  }));
  def("Splitter.SplitTextByPositions", fn("Splitter.SplitTextByPositions", [{ name: "positions" }], (a) => {
    const pos = listOf(a[0]!, "positions").map((v) => numOf(v, "position"));
    return fn("splitter", [{ name: "text" }], (b) => {
      const s = textOf(b[0]!, "split input");
      return list(pos.map((p, i) => text(s.slice(p, pos[i + 1] ?? s.length))));
    });
  }));

  // Replacers (used by Table.ReplaceValue).
  def("Replacer.ReplaceText", fn("Replacer.ReplaceText", [{ name: "value" }, { name: "old" }, { name: "new" }], (a) => {
    const v = a[0]!;
    if (v.kind === "null") return NULL;
    if (v.kind !== "text") return v;
    return text(v.value.split(textOf(a[1]!, "old")).join(textOf(a[2]!, "new")));
  }));
  def("Replacer.ReplaceValue", fn("Replacer.ReplaceValue", [{ name: "value" }, { name: "old" }, { name: "new" }], (a) => {
    const v = a[0]!;
    const oldV = a[1]!;
    const same = (v.kind === "null" && oldV.kind === "null") || (v.kind !== "null" && oldV.kind !== "null" && JSON.stringify(v) === JSON.stringify(oldV));
    return same ? a[2]! : v;
  }));

  // Comparers (recognized by name in the Text.* functions above).
  def("Comparer.Ordinal", fn("Comparer.Ordinal", [{ name: "a" }, { name: "b" }], (a) => {
    const x = textOf(a[0]!, "Comparer.Ordinal");
    const y = textOf(a[1]!, "Comparer.Ordinal");
    return number(x < y ? -1 : x > y ? 1 : 0);
  }));
  def("Comparer.OrdinalIgnoreCase", fn("Comparer.OrdinalIgnoreCase", [{ name: "a" }, { name: "b" }], (a) => {
    const x = textOf(a[0]!, "Comparer.OrdinalIgnoreCase").toLowerCase();
    const y = textOf(a[1]!, "Comparer.OrdinalIgnoreCase").toLowerCase();
    return number(x < y ? -1 : x > y ? 1 : 0);
  }));
}
