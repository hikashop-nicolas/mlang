// Text.* functions plus Splitter.*, Combiner-free Tier-1 subset, and Replacer.*.
import type { Env } from "../interpret.js";
import { NULL, err, list, logical, number, text, type MValue } from "../values.js";
import { fn, listOf, numOf, textOf, truthy } from "./helpers.js";
import { numberFrom, textFrom } from "./convert.js";
import { cultureOf } from "../culture.js";

/** null-in null-out wrapper for the many Text functions that propagate null. */
const nn = (name: string, params: { name: string; optional?: boolean }[], f: (args: MValue[]) => MValue) =>
  fn(name, params, (a) => (a[0] && a[0].kind === "null" ? NULL : f(a)));

export function registerText(env: Env): void {
  const def = (name: string, v: MValue): void => env.defineValue(name, v);

  def("Text.From", fn("Text.From", [{ name: "value" }, { name: "culture", optional: true }], (a) =>
    a[0]!.kind === "null" ? NULL : text(textFrom(a[0]!))));
  def("Number.From", fn("Number.From", [{ name: "value" }, { name: "culture", optional: true }], (a) => numberFrom(a[0]!, cultureOf(a[1] && a[1].kind === "text" ? a[1].value : null))));

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
  def("Text.Clean", nn("Text.Clean", [{ name: "text" }], (a) => text(textOf(a[0]!, "Text.Clean").replace(/[\x00-\x1F\x7F-\x9F]/g, ""))));
  def("Text.Select", nn("Text.Select", [{ name: "text" }, { name: "selectChars" }], (a) => {
    const allow = new Set([...(a[1]!.kind === "list" ? a[1]!.items.map((v) => textOf(v, "Text.Select")) : [textOf(a[1]!, "Text.Select")])].flatMap((s) => [...s]));
    return text([...textOf(a[0]!, "Text.Select")].filter((c) => allow.has(c)).join(""));
  }));

  // Delimiter extraction. Index (number) picks the Nth occurrence; a {index, RelativePosition}
  // pair is accepted with the position ignored (Tier-2 approximation).
  const idxOf = (v: MValue | undefined): number => (v?.kind === "number" ? v.value : v?.kind === "list" && v.items[0]?.kind === "number" ? v.items[0].value : 0);
  def("Text.BeforeDelimiter", nn("Text.BeforeDelimiter", [{ name: "text" }, { name: "delimiter" }, { name: "index", optional: true }], (a) => {
    const s = textOf(a[0]!, "Text.BeforeDelimiter");
    const d = textOf(a[1]!, "delimiter");
    const parts = s.split(d);
    const i = idxOf(a[2]);
    return text(i < parts.length - 1 ? parts.slice(0, i + 1).join(d) : "");
  }));
  def("Text.AfterDelimiter", nn("Text.AfterDelimiter", [{ name: "text" }, { name: "delimiter" }, { name: "index", optional: true }], (a) => {
    const s = textOf(a[0]!, "Text.AfterDelimiter");
    const d = textOf(a[1]!, "delimiter");
    const parts = s.split(d);
    const i = idxOf(a[2]);
    return text(i < parts.length - 1 ? parts.slice(i + 1).join(d) : "");
  }));
  def("Text.BetweenDelimiters", nn("Text.BetweenDelimiters", [{ name: "text" }, { name: "start" }, { name: "end" }, { name: "startIndex", optional: true }, { name: "endIndex", optional: true }], (a) => {
    const s = textOf(a[0]!, "Text.BetweenDelimiters");
    const start = textOf(a[1]!, "start");
    const end = textOf(a[2]!, "end");
    const from = s.indexOf(start);
    if (from < 0) return text("");
    const rest = s.slice(from + start.length);
    const to = rest.indexOf(end);
    return text(to < 0 ? "" : rest.slice(0, to));
  }));

  def("Text.ToList", nn("Text.ToList", [{ name: "text" }], (a) => list([...textOf(a[0]!, "Text.ToList")].map(text))));
  def("Text.Remove", nn("Text.Remove", [{ name: "text" }, { name: "removeChars" }], (a) => {
    const drop = new Set((a[1]!.kind === "list" ? a[1]!.items.map((v) => textOf(v, "Text.Remove")) : [textOf(a[1]!, "Text.Remove")]).flatMap((s) => [...s]));
    return text([...textOf(a[0]!, "Text.Remove")].filter((c) => !drop.has(c)).join(""));
  }));

  // Combiners (the inverse of splitters; used by Table.CombineColumns).
  def("Combiner.CombineTextByDelimiter", fn("Combiner.CombineTextByDelimiter", [{ name: "delimiter" }, { name: "quoteStyle", optional: true }], (a) => {
    const d = textOf(a[0]!, "delimiter");
    return fn("combiner", [{ name: "parts" }], (b) => text(listOf(b[0]!, "combine").map((v) => (v.kind === "null" ? "" : textOf(v, "combine"))).join(d)));
  }));
  def("Combiner.CombineTextByEachDelimiter", fn("Combiner.CombineTextByEachDelimiter", [{ name: "delimiters" }, { name: "quoteStyle", optional: true }], (a) => {
    const ds = listOf(a[0]!, "delimiters").map((v) => textOf(v, "delimiter"));
    return fn("combiner", [{ name: "parts" }], (b) => {
      const parts = listOf(b[0]!, "combine").map((v) => (v.kind === "null" ? "" : textOf(v, "combine")));
      let out = parts[0] ?? "";
      for (let i = 1; i < parts.length; i++) out += (ds[i - 1] ?? "") + parts[i];
      return text(out);
    });
  }));
  // Split where the character class changes between two sets (e.g. letters<->digits).
  def("Splitter.SplitTextByCharacterTransition", fn("Splitter.SplitTextByCharacterTransition", [{ name: "before" }, { name: "after" }], (a) => {
    const inSet = (spec: MValue, ch: string): boolean => {
      if (spec.kind === "function") return truthy(spec.call([text(ch)]));
      if (spec.kind === "list") return spec.items.some((v) => textOf(v, "transition").includes(ch));
      return textOf(spec, "transition").includes(ch);
    };
    return fn("splitter", [{ name: "text" }], (b) => {
      const s = textOf(b[0]!, "split input");
      const out: string[] = [];
      let cur = "";
      for (let i = 0; i < s.length; i++) {
        cur += s[i]!;
        if (i + 1 < s.length && inSet(a[0]!, s[i]!) && inSet(a[1]!, s[i + 1]!)) {
          out.push(cur);
          cur = "";
        }
      }
      out.push(cur);
      return list(out.map(text));
    });
  }));
  def("Text.SplitAny", nn("Text.SplitAny", [{ name: "text" }, { name: "separators" }], (a) => {
    const seps = [...textOf(a[1]!, "Text.SplitAny")];
    const re = new RegExp(`[${seps.map((c) => c.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")).join("")}]`);
    return list(textOf(a[0]!, "Text.SplitAny").split(re).map(text));
  }));

  def("Text.Insert", nn("Text.Insert", [{ name: "text" }, { name: "offset" }, { name: "newText" }], (a) => {
    const s = textOf(a[0]!, "Text.Insert");
    const off = numOf(a[1]!, "offset");
    return text(s.slice(0, off) + textOf(a[2]!, "newText") + s.slice(off));
  }));
  def("Text.RemoveRange", nn("Text.RemoveRange", [{ name: "text" }, { name: "offset" }, { name: "count", optional: true }], (a) => {
    const s = textOf(a[0]!, "Text.RemoveRange");
    const off = numOf(a[1]!, "offset");
    const count = a[2] && a[2].kind === "number" ? a[2].value : 1;
    return text(s.slice(0, off) + s.slice(off + count));
  }));
  def("Text.ReplaceRange", nn("Text.ReplaceRange", [{ name: "text" }, { name: "offset" }, { name: "count" }, { name: "newText" }], (a) => {
    const s = textOf(a[0]!, "Text.ReplaceRange");
    const off = numOf(a[1]!, "offset");
    return text(s.slice(0, off) + textOf(a[3]!, "newText") + s.slice(off + numOf(a[2]!, "count")));
  }));
  // Text.Format: #{n} from a positional list, or #[name] from a record.
  def("Text.Format", fn("Text.Format", [{ name: "formatString" }, { name: "arguments" }, { name: "culture", optional: true }], (a) => {
    const fmt = textOf(a[0]!, "Text.Format");
    const args = a[1]!;
    const val = (key: string): string => {
      if (args.kind === "list") return textFrom(args.items[Number(key)] ?? NULL);
      if (args.kind === "record") return textFrom(args.fields.get(key) ?? NULL);
      return textFrom(args);
    };
    return text(fmt.replace(/#\{([^}]*)\}/g, (_, k) => val(k.trim())).replace(/#\[([^\]]*)\]/g, (_, k) => val(k.trim())));
  }));

  def("Character.FromNumber", fn("Character.FromNumber", [{ name: "number" }], (a) => text(String.fromCodePoint(numOf(a[0]!, "Character.FromNumber")))));
  def("Character.ToNumber", fn("Character.ToNumber", [{ name: "character" }], (a) => number(textOf(a[0]!, "Character.ToNumber").codePointAt(0) ?? 0)));

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
  // SplitByNothing: the whole value as a single field (used by Table.FromList to make 1 column).
  def("Splitter.SplitByNothing", fn("Splitter.SplitByNothing", [], () => fn("splitter", [{ name: "text" }], (b) => list([b[0] ?? NULL]))));

  // Split using each delimiter in the list once, in order (parts = delimiters + 1).
  def("Splitter.SplitTextByEachDelimiter", fn("Splitter.SplitTextByEachDelimiter", [{ name: "delimiters" }, { name: "quoteStyle", optional: true }, { name: "startAtEnd", optional: true }], (a) => {
    const delims = listOf(a[0]!, "delimiters").map((v) => textOf(v, "delimiter"));
    return fn("splitter", [{ name: "text" }], (b) => {
      let rest = textOf(b[0]!, "split input");
      const parts: MValue[] = [];
      for (const d of delims) {
        const i = rest.indexOf(d);
        if (i < 0) {
          parts.push(text(rest));
          rest = "";
          continue;
        }
        parts.push(text(rest.slice(0, i)));
        rest = rest.slice(i + d.length);
      }
      parts.push(text(rest));
      return list(parts);
    });
  }));

  def("Splitter.SplitTextByPositions", fn("Splitter.SplitTextByPositions", [{ name: "positions" }], (a) => {
    const pos = listOf(a[0]!, "positions").map((v) => numOf(v, "position"));
    return fn("splitter", [{ name: "text" }], (b) => {
      const s = textOf(b[0]!, "split input");
      return list(pos.map((p, i) => text(s.slice(p, pos[i + 1] ?? s.length))));
    });
  }));

  // Splitter.SplitTextByRepeatedLengths(lengths): cut the text into fixed-width fields,
  // repeating the length pattern until the text is consumed.
  def("Splitter.SplitTextByRepeatedLengths", fn("Splitter.SplitTextByRepeatedLengths", [{ name: "lengths" }, { name: "startAtEnd", optional: true }], (a) => {
    const lens = (a[0]!.kind === "list" ? a[0]!.items.map((v) => numOf(v, "length")) : [numOf(a[0]!, "length")]);
    return fn("splitter", [{ name: "text" }], (b) => {
      const s = textOf(b[0]!, "split input");
      const out: MValue[] = [];
      let i = 0, k = 0;
      while (i < s.length && lens.length) { const len = lens[k % lens.length]!; out.push(text(s.slice(i, i + len))); i += len; k++; }
      return list(out);
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
