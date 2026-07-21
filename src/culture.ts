// Minimal culture table for the parse/format paths. Only the separators and date order
// that actually differ across the common cultures PQ users pass; unknown cultures fall
// back to en-US (the invariant default). Extend from oracle observations, not guesswork.

export interface Culture {
  decimal: string;
  group: string;
  /** Date component order for numeric M/D/Y style dates. */
  dateOrder: "mdy" | "dmy" | "ymd";
}

const EN_US: Culture = { decimal: ".", group: ",", dateOrder: "mdy" };

const TABLE: Record<string, Culture> = {
  "en-us": EN_US,
  "en-gb": { decimal: ".", group: ",", dateOrder: "dmy" },
  "fr-fr": { decimal: ",", group: " ", dateOrder: "dmy" },
  "de-de": { decimal: ",", group: ".", dateOrder: "dmy" },
  "es-es": { decimal: ",", group: ".", dateOrder: "dmy" },
  "it-it": { decimal: ",", group: ".", dateOrder: "dmy" },
  "nl-nl": { decimal: ",", group: ".", dateOrder: "dmy" },
  "pt-br": { decimal: ",", group: ".", dateOrder: "dmy" },
  "ja-jp": { decimal: ".", group: ",", dateOrder: "ymd" },
};

export function cultureOf(name: string | null | undefined): Culture {
  if (!name) return EN_US;
  return TABLE[name.toLowerCase()] ?? EN_US;
}

/** Parse a number under a culture (strips group separators, normalizes the decimal mark). */
export function parseNumberCulture(s: string, c: Culture): number {
  let t = s.trim();
  let percent = false;
  if (t.endsWith("%")) {
    percent = true;
    t = t.slice(0, -1).trim();
  }
  // Remove group separators, then swap the decimal mark to a JS-parsable ".". When the
  // culture groups with a space (fr-FR uses U+00A0), accept any space variant real data uses.
  const groupRe = /\s/.test(c.group) ? /[\s  ]/g : new RegExp(c.group.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), "g");
  t = t.replace(groupRe, "");
  if (c.decimal !== ".") t = t.split(c.decimal).join(".");
  const n = Number(t);
  return percent ? n / 100 : n;
}

/** Parse a numeric date "A/B/C" (or "A-B-C", "A.B.C") under a culture's component order. */
export function parseDateCulture(s: string, c: Culture): { y: number; m: number; d: number } | null {
  const m = /^(\d{1,4})[/.-](\d{1,2})[/.-](\d{1,4})$/.exec(s.trim());
  if (!m) return null;
  const a = Number(m[1]);
  const b = Number(m[2]);
  const cc = Number(m[3]);
  let y: number;
  let mo: number;
  let d: number;
  if (c.dateOrder === "ymd") {
    [y, mo, d] = [a, b, cc];
  } else if (c.dateOrder === "dmy") {
    [d, mo, y] = [a, b, cc];
  } else {
    [mo, d, y] = [a, b, cc];
  }
  if (mo < 1 || mo > 12 || d < 1 || d > 31) return null;
  return { y, m: mo, d };
}
