// Minimal culture table for the parse/format paths. Only the separators and date order
// that actually differ across the common cultures PQ users pass; unknown cultures fall
// back to en-US (the invariant default). Extend from oracle observations, not guesswork.

export interface Culture {
  /** The BCP-47 tag (e.g. "fr-FR"); "en-US" is the invariant default. Drives Intl output. */
  name: string;
  decimal: string;
  group: string;
  /** Date component order for numeric M/D/Y style dates. */
  dateOrder: "mdy" | "dmy" | "ymd";
}

const EN_US: Culture = { name: "en-US", decimal: ".", group: ",", dateOrder: "mdy" };

const TABLE: Record<string, Omit<Culture, "name">> = {
  "en-us": { decimal: ".", group: ",", dateOrder: "mdy" },
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
  const entry = TABLE[name.toLowerCase()];
  return entry ? { name, ...entry } : { ...EN_US, name };
}

// --- Intl-driven output localization (month/day names, separators, currency) --------------
// Intl ships full ICU locale data in Node and browsers, matching .NET/ICU closely. Results are
// memoized. Any failure (unknown locale) falls back to the invariant English behaviour.
const EN_MONTHS = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];
const EN_DAYS = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];
const nameCache = new Map<string, LocaleNames>();

export interface LocaleNames { months: string[]; monthsShort: string[]; days: string[]; daysShort: string[]; am: string; pm: string }

export function localeNames(c: Culture): LocaleNames {
  const tag = c.name;
  let n = nameCache.get(tag);
  if (n) return n;
  try {
    const monthOf = (style: "long" | "short"): string[] => Array.from({ length: 12 }, (_, i) =>
      new Intl.DateTimeFormat(tag, { month: style, timeZone: "UTC" }).format(new Date(Date.UTC(2021, i, 15))));
    // 2021-08-01 was a Sunday; take that week for Sun..Sat.
    const dayOf = (style: "long" | "short"): string[] => Array.from({ length: 7 }, (_, i) =>
      new Intl.DateTimeFormat(tag, { weekday: style, timeZone: "UTC" }).format(new Date(Date.UTC(2021, 7, 1 + i))));
    const parts = new Intl.DateTimeFormat(tag, { hour: "numeric", hour12: true, timeZone: "UTC" });
    const am = parts.formatToParts(new Date(Date.UTC(2021, 0, 1, 3))).find((p) => p.type === "dayPeriod")?.value ?? "AM";
    const pm = parts.formatToParts(new Date(Date.UTC(2021, 0, 1, 15))).find((p) => p.type === "dayPeriod")?.value ?? "PM";
    n = { months: monthOf("long"), monthsShort: monthOf("short"), days: dayOf("long"), daysShort: dayOf("short"), am, pm };
  } catch {
    n = { months: EN_MONTHS, monthsShort: EN_MONTHS.map((m) => m.slice(0, 3)), days: EN_DAYS, daysShort: EN_DAYS.map((d) => d.slice(0, 3)), am: "AM", pm: "PM" };
  }
  nameCache.set(tag, n);
  return n;
}

/** The culture's number separators (Intl-derived; falls back to the Culture table). */
export function numberSeparators(c: Culture): { decimal: string; group: string } {
  try {
    const parts = new Intl.NumberFormat(c.name).formatToParts(12345.6);
    return { decimal: parts.find((p) => p.type === "decimal")?.value ?? c.decimal, group: parts.find((p) => p.type === "group")?.value ?? c.group };
  } catch { return { decimal: c.decimal, group: c.group }; }
}

const CURRENCY: Record<string, string> = {
  "en-us": "USD", "en-gb": "GBP", "fr-fr": "EUR", "de-de": "EUR", "es-es": "EUR",
  "it-it": "EUR", "nl-nl": "EUR", "pt-br": "BRL", "ja-jp": "JPY",
};
/** Culture-formatted currency string (Intl); null if the culture's currency is unknown. */
export function formatCurrency(c: Culture, value: number, digits: number): string | null {
  const cur = CURRENCY[c.name.toLowerCase()];
  if (!cur) return null;
  try {
    return new Intl.NumberFormat(c.name, { style: "currency", currency: cur, minimumFractionDigits: digits, maximumFractionDigits: digits }).format(value);
  } catch { return null; }
}

export const isInvariant = (c: Culture): boolean => c.name.toLowerCase() === "en-us" || c.name === "";

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
