// .NET-style custom format strings for Date/Time/DateTime.ToText and Number.ToText.
// A practical subset of the custom specifiers PQ users actually reach for; unsupported
// specifiers raise so gaps stay visible. en-US month/day names (the default culture).

import { civilFromDays, dayOfWeekSunday0, daysFromCivil } from "./temporal.js";

const MONTHS = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];
const DAYS = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];
const p = (n: number, w: number): string => String(Math.abs(n)).padStart(w, "0");

interface DTParts { y: number; mo: number; d: number; secs: number }

function partsOf(secs: number): { h24: number; mi: number; s: number; frac: number } {
  const h24 = Math.floor(secs / 3600);
  const mi = Math.floor((secs % 3600) / 60);
  const sFull = secs % 60;
  const s = Math.floor(sFull);
  return { h24, mi, s, frac: sFull - s };
}

/** Format a date/time using a .NET custom format string. `has` gates date vs time tokens. */
export function formatCustom(fmt: string, dt: DTParts, has: { date: boolean; time: boolean }): string {
  const { y, mo, d, secs } = dt;
  const { h24, mi, s, frac } = partsOf(secs);
  const h12 = h24 % 12 === 0 ? 12 : h24 % 12;
  const dow = has.date ? dayOfWeekSunday0(daysFromCivil(y, mo, d)) : 0;
  let out = "";
  let i = 0;
  while (i < fmt.length) {
    const ch = fmt[i]!;
    // literals
    if (ch === "'" || ch === '"') {
      const end = fmt.indexOf(ch, i + 1);
      if (end < 0) throw new Error("format: unterminated quoted literal");
      out += fmt.slice(i + 1, end);
      i = end + 1;
      continue;
    }
    if (ch === "\\") {
      out += fmt[i + 1] ?? "";
      i += 2;
      continue;
    }
    let run = 1;
    while (fmt[i + run] === ch) run++;
    if (ch === "y" && has.date) out += run <= 2 ? p(y % 100, 2) : p(y, run);
    else if (ch === "M" && has.date) out += run === 1 ? String(mo) : run === 2 ? p(mo, 2) : run === 3 ? MONTHS[mo - 1]!.slice(0, 3) : MONTHS[mo - 1]!;
    else if (ch === "d" && has.date) out += run === 1 ? String(d) : run === 2 ? p(d, 2) : run === 3 ? DAYS[dow]!.slice(0, 3) : DAYS[dow]!;
    else if (ch === "H" && has.time) out += run === 1 ? String(h24) : p(h24, 2);
    else if (ch === "h" && has.time) out += run === 1 ? String(h12) : p(h12, 2);
    else if (ch === "m" && has.time) out += run === 1 ? String(mi) : p(mi, 2);
    else if (ch === "s" && has.time) out += run === 1 ? String(s) : p(s, 2);
    else if (ch === "t" && has.time) out += (h24 < 12 ? "AM" : "PM").slice(0, run === 1 ? 1 : 2);
    else if (ch === "f" && has.time) out += String(Math.floor(frac * Math.pow(10, run))).padStart(run, "0");
    else if (ch === "F" && has.time) {
      const digits = String(Math.floor(frac * Math.pow(10, run))).padStart(run, "0").replace(/0+$/, "");
      out += digits;
    } else if (/[A-Za-z]/.test(ch)) {
      throw new Error(`format: unsupported specifier '${ch.repeat(run)}'`);
    } else out += ch.repeat(run);
    i += run;
  }
  return out;
}

/** Expand a standard single-letter date/time format to its en-US custom pattern. */
export function standardDateTimePattern(fmt: string): string | null {
  switch (fmt) {
    case "d": return "M/d/yyyy";
    case "D": return "dddd, MMMM d, yyyy";
    case "t": return "h:mm tt";
    case "T": return "h:mm:ss tt";
    case "g": return "M/d/yyyy h:mm tt";
    case "G": return "M/d/yyyy h:mm:ss tt";
    case "s": return "yyyy-MM-dd'T'HH:mm:ss";
    default: return null;
  }
}

// --- number format strings --------------------------------------------------------------

/** Number.ToText custom/standard format subset (en-US separators). */
export function formatNumber(value: number, fmt: string): string {
  const std = /^([A-Za-z])(\d*)$/.exec(fmt);
  if (std) {
    const letter = std[1]!.toUpperCase();
    const prec = std[2] === "" ? undefined : Number(std[2]);
    switch (letter) {
      case "N": return groupThousands(fixed(value, prec ?? 2));
      case "F": return fixed(value, prec ?? 2);
      case "P": return `${groupThousands(fixed(value * 100, prec ?? 2))} %`;
      case "C": return `$${groupThousands(fixed(value, prec ?? 2))}`;
      case "D": return (value < 0 ? "-" : "") + String(Math.abs(Math.trunc(value))).padStart(prec ?? 0, "0");
      case "X": return Math.trunc(value).toString(16).toUpperCase().padStart(prec ?? 0, "0");
      case "E": return value.toExponential(prec ?? 6).toUpperCase();
      case "G": return String(value);
      default: throw new Error(`Number.ToText: unsupported format '${fmt}'.`);
    }
  }
  if (/^[0#.,%]+$/.test(fmt)) return formatPicture(value, fmt);
  throw new Error(`Number.ToText: unsupported format '${fmt}'.`);
}

const fixed = (v: number, digits: number): string => {
  const neg = v < 0 ? "-" : "";
  return neg + Math.abs(v).toFixed(digits);
};

function groupThousands(numStr: string): string {
  const neg = numStr.startsWith("-");
  const body = neg ? numStr.slice(1) : numStr;
  const [intPart, frac] = body.split(".");
  const grouped = intPart!.replace(/\B(?=(\d{3})+(?!\d))/g, ",");
  return (neg ? "-" : "") + grouped + (frac !== undefined ? `.${frac}` : "");
}

/** Custom picture: 0 (forced digit), # (optional), . decimal, , grouping, % scale-by-100. */
function formatPicture(value: number, fmt: string): string {
  let v = value;
  const percent = fmt.includes("%");
  if (percent) v *= 100;
  const grouping = /,(?=[0#].*\.)|,(?=[0#]+$)/.test(fmt);
  const [intFmt = "", fracFmt = ""] = fmt.replace(/,/g, "").replace(/%/g, "").split(".");
  const minFrac = (fracFmt.match(/0/g) ?? []).length;
  const maxFrac = fracFmt.length;
  const rounded = maxFrac > 0 ? Number(v.toFixed(maxFrac)) : Math.round(v);
  const neg = rounded < 0 ? "-" : "";
  const abs = Math.abs(rounded);
  let intStr = String(Math.trunc(abs));
  const minInt = (intFmt.match(/0/g) ?? []).length;
  if (intStr.length < minInt) intStr = intStr.padStart(minInt, "0");
  if (grouping) intStr = intStr.replace(/\B(?=(\d{3})+(?!\d))/g, ",");
  let fracStr = "";
  if (maxFrac > 0) {
    fracStr = abs.toFixed(maxFrac).split(".")[1] ?? "";
    fracStr = fracStr.replace(/0+$/, "");
    while (fracStr.length < minFrac) fracStr += "0";
  }
  return neg + intStr + (fracStr ? `.${fracStr}` : "") + (percent ? "%" : "");
}

export { civilFromDays };
