// Temporal constructors (#date/#time/#datetime/#duration) and the Date.* / Time.* /
// DateTime.* / Duration.* Tier-1 subset. Semantics from the public reference; the date
// arithmetic edge cases are oracle-pinned.
import type { Env } from "../interpret.js";
import { NULL, date, datetime, duration, err, number, text, time, type MValue } from "../values.js";
import { addMonths, civilFromDays, dateTimeToSerial, dayOfWeekSunday0, daysFromCivil, daysInMonth, formatDate, formatTimeOfDay, parseDateTimeText, parseDateText, serialToDateTime } from "../temporal.js";
import { fn, numOf } from "./helpers.js";

type DateV = Extract<MValue, { kind: "date" }>;
type DateTimeV = Extract<MValue, { kind: "datetime" }>;

const nn = (name: string, params: { name: string; optional?: boolean }[], f: (args: MValue[]) => MValue) =>
  fn(name, params, (a) => (a[0] && a[0].kind === "null" ? NULL : f(a)));

const asDateish = (v: MValue, who: string): { y: number; m: number; d: number; secs: number } => {
  if (v.kind === "date") return { y: v.y, m: v.m, d: v.d, secs: 0 };
  if (v.kind === "datetime") return { y: v.y, m: v.m, d: v.d, secs: v.secs };
  err("Expression.Error", `${who}: expected a date or datetime, got ${v.kind}.`);
};

export function registerDateTime(env: Env): void {
  const def = (name: string, v: MValue): void => env.defineValue(name, v);

  // Day.* constants (numbers; behaviour pinned via Date.DayOfWeek oracle cases).
  const days = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];
  days.forEach((d, i) => def(`Day.${d}`, number(i)));

  // --- constructors ---------------------------------------------------------
  def("#date", fn("#date", [{ name: "year" }, { name: "month" }, { name: "day" }], (a) => {
    const y = numOf(a[0]!, "year");
    const m = numOf(a[1]!, "month");
    const d = numOf(a[2]!, "day");
    if (m < 1 || m > 12 || d < 1 || d > daysInMonth(y, m) || y < 1 || y > 9999) err("Expression.Error", "#date: arguments out of range.");
    return date(y, m, d);
  }));
  def("#time", fn("#time", [{ name: "hour" }, { name: "minute" }, { name: "second" }], (a) => {
    const h = numOf(a[0]!, "hour");
    const mi = numOf(a[1]!, "minute");
    const s = numOf(a[2]!, "second");
    if (h < 0 || h > 24 || mi < 0 || mi > 59 || s < 0 || s >= 60) err("Expression.Error", "#time: arguments out of range.");
    return time(h * 3600 + mi * 60 + s);
  }));
  def("#datetime", fn("#datetime", [{ name: "year" }, { name: "month" }, { name: "day" }, { name: "hour" }, { name: "minute" }, { name: "second" }], (a) => {
    const y = numOf(a[0]!, "year");
    const m = numOf(a[1]!, "month");
    const d = numOf(a[2]!, "day");
    if (m < 1 || m > 12 || d < 1 || d > daysInMonth(y, m)) err("Expression.Error", "#datetime: arguments out of range.");
    return datetime(y, m, d, numOf(a[3]!, "hour") * 3600 + numOf(a[4]!, "minute") * 60 + numOf(a[5]!, "second"));
  }));
  def("#duration", fn("#duration", [{ name: "days" }, { name: "hours" }, { name: "minutes" }, { name: "seconds" }], (a) =>
    duration(numOf(a[0]!, "days") * 86400 + numOf(a[1]!, "hours") * 3600 + numOf(a[2]!, "minutes") * 60 + numOf(a[3]!, "seconds"))));

  // --- Date.* ----------------------------------------------------------------
  def("Date.From", nn("Date.From", [{ name: "value" }, { name: "culture", optional: true }], (a) => {
    const v = a[0]!;
    if (v.kind === "date") return v;
    if (v.kind === "datetime") return date(v.y, v.m, v.d);
    if (v.kind === "number") {
      const s = serialToDateTime(Math.floor(v.value));
      return date(s.y, s.m, s.d);
    }
    if (v.kind === "text") {
      const p = parseDateText(v.value.trim()) ?? (parseDateTimeText(v.value.trim()) as { y: number; m: number; d: number } | null);
      if (!p) err("Expression.Error", `Date.From: cannot convert "${v.value}" to a date.`);
      return date(p.y, p.m, p.d);
    }
    err("Expression.Error", `Date.From: cannot convert ${v.kind}.`);
  }));
  def("Date.Year", nn("Date.Year", [{ name: "date" }], (a) => number(asDateish(a[0]!, "Date.Year").y)));
  def("Date.Month", nn("Date.Month", [{ name: "date" }], (a) => number(asDateish(a[0]!, "Date.Month").m)));
  def("Date.Day", nn("Date.Day", [{ name: "date" }], (a) => number(asDateish(a[0]!, "Date.Day").d)));
  def("Date.AddDays", nn("Date.AddDays", [{ name: "date" }, { name: "numberOfDays" }], (a) => shift(a[0]!, numOf(a[1]!, "days"), 0, 0)));
  def("Date.AddMonths", nn("Date.AddMonths", [{ name: "date" }, { name: "numberOfMonths" }], (a) => shift(a[0]!, 0, numOf(a[1]!, "months"), 0)));
  def("Date.AddYears", nn("Date.AddYears", [{ name: "date" }, { name: "numberOfYears" }], (a) => shift(a[0]!, 0, 0, numOf(a[1]!, "years"))));
  def("Date.AddWeeks", nn("Date.AddWeeks", [{ name: "date" }, { name: "numberOfWeeks" }], (a) => shift(a[0]!, numOf(a[1]!, "weeks") * 7, 0, 0)));
  def("Date.DayOfWeek", nn("Date.DayOfWeek", [{ name: "date" }, { name: "firstDayOfWeek", optional: true }], (a) => {
    const d = asDateish(a[0]!, "Date.DayOfWeek");
    const first = a[1] && a[1].kind === "number" ? a[1].value : 0; // Day.Sunday default (oracle-checked)
    return number((dayOfWeekSunday0(daysFromCivil(d.y, d.m, d.d)) - first + 7) % 7);
  }));
  def("Date.DayOfYear", nn("Date.DayOfYear", [{ name: "date" }], (a) => {
    const d = asDateish(a[0]!, "Date.DayOfYear");
    return number(daysFromCivil(d.y, d.m, d.d) - daysFromCivil(d.y, 1, 1) + 1);
  }));
  def("Date.StartOfMonth", nn("Date.StartOfMonth", [{ name: "date" }], (a) => keepKind(a[0]!, (d) => ({ ...d, d: 1 }), true)));
  def("Date.EndOfMonth", nn("Date.EndOfMonth", [{ name: "date" }], (a) => keepKind(a[0]!, (d) => ({ ...d, d: daysInMonth(d.y, d.m) }), false)));
  def("Date.StartOfYear", nn("Date.StartOfYear", [{ name: "date" }], (a) => keepKind(a[0]!, (d) => ({ y: d.y, m: 1, d: 1 }), true)));
  def("Date.EndOfYear", nn("Date.EndOfYear", [{ name: "date" }], (a) => keepKind(a[0]!, (d) => ({ y: d.y, m: 12, d: 31 }), false)));
  def("Date.IsInCurrentMonth", nn("Date.IsInCurrentMonth", [{ name: "date" }], () => err("Expression.Error", "mlang: clock-dependent Date functions are not supported (deterministic engine).")));
  def("Date.ToText", nn("Date.ToText", [{ name: "date" }, { name: "format", optional: true }, { name: "culture", optional: true }], (a) => {
    if (a[1] && a[1].kind !== "null") err("Expression.Error", "Date.ToText: format strings are not supported yet.");
    const d = asDateish(a[0]!, "Date.ToText");
    return text(formatDate(d.y, d.m, d.d));
  }));

  // --- Time.* ------------------------------------------------------------------
  def("Time.From", nn("Time.From", [{ name: "value" }, { name: "culture", optional: true }], (a) => {
    const v = a[0]!;
    if (v.kind === "time") return v;
    if (v.kind === "datetime") return time(v.secs);
    if (v.kind === "number") {
      const frac = v.value - Math.floor(v.value);
      return time(Math.round(frac * 86400 * 1000) / 1000);
    }
    err("Expression.Error", `Time.From: cannot convert ${v.kind}.`);
  }));
  const timePart = (name: string, f: (secs: number) => number) =>
    nn(name, [{ name: "time" }], (a) => {
      const v = a[0]!;
      const secs = v.kind === "time" ? v.secs : v.kind === "datetime" ? v.secs : err("Expression.Error", `${name}: expected a time or datetime.`);
      return number(f(secs));
    });
  def("Time.Hour", timePart("Time.Hour", (s) => Math.floor(s / 3600)));
  def("Time.Minute", timePart("Time.Minute", (s) => Math.floor((s % 3600) / 60)));
  def("Time.Second", timePart("Time.Second", (s) => s % 60));
  def("Time.ToText", nn("Time.ToText", [{ name: "time" }, { name: "format", optional: true }], (a) => {
    if (a[1] && a[1].kind !== "null") err("Expression.Error", "Time.ToText: format strings are not supported yet.");
    const v = a[0]!;
    if (v.kind !== "time") err("Expression.Error", "Time.ToText: expected a time.");
    return text(formatTimeOfDay(v.secs));
  }));

  // --- DateTime.* -----------------------------------------------------------------
  def("DateTime.From", nn("DateTime.From", [{ name: "value" }, { name: "culture", optional: true }], (a) => {
    const v = a[0]!;
    if (v.kind === "datetime") return v;
    if (v.kind === "date") return datetime(v.y, v.m, v.d, 0);
    if (v.kind === "time") err("Expression.Error", "DateTime.From(time) needs a current date (not supported: deterministic engine).");
    if (v.kind === "number") {
      const s = serialToDateTime(v.value);
      return datetime(s.y, s.m, s.d, s.secs);
    }
    if (v.kind === "text") {
      const p = parseDateTimeText(v.value);
      if (!p) err("Expression.Error", `DateTime.From: cannot convert "${v.value}".`);
      return datetime(p.y, p.m, p.d, p.secs);
    }
    err("Expression.Error", `DateTime.From: cannot convert ${v.kind}.`);
  }));
  def("DateTime.Date", nn("DateTime.Date", [{ name: "dateTime" }], (a) => {
    const d = asDateish(a[0]!, "DateTime.Date");
    return date(d.y, d.m, d.d);
  }));
  def("DateTime.Time", nn("DateTime.Time", [{ name: "dateTime" }], (a) => {
    const v = a[0]!;
    if (v.kind !== "datetime") err("Expression.Error", "DateTime.Time: expected a datetime.");
    return time(v.secs);
  }));
  def("DateTime.ToText", nn("DateTime.ToText", [{ name: "dateTime" }, { name: "format", optional: true }, { name: "culture", optional: true }], (a) => {
    if (a[1] && a[1].kind !== "null") err("Expression.Error", "DateTime.ToText: format strings are not supported yet.");
    const v = a[0]!;
    if (v.kind !== "datetime") err("Expression.Error", "DateTime.ToText: expected a datetime.");
    return text(`${formatDate(v.y, v.m, v.d)} ${formatTimeOfDay(v.secs)}`);
  }));
  def("DateTime.LocalNow", fn("DateTime.LocalNow", [], () => err("Expression.Error", "mlang: DateTime.LocalNow is not supported (deterministic engine).")));
  def("DateTime.FixedLocalNow", fn("DateTime.FixedLocalNow", [], () => err("Expression.Error", "mlang: DateTime.FixedLocalNow is not supported (deterministic engine).")));

  // --- Duration.* --------------------------------------------------------------------
  def("Duration.From", nn("Duration.From", [{ name: "value" }], (a) => {
    const v = a[0]!;
    if (v.kind === "duration") return v;
    if (v.kind === "number") return duration(v.value * 86400); // days
    err("Expression.Error", `Duration.From: cannot convert ${v.kind}.`);
  }));
  const durPart = (name: string, f: (secs: number) => number) =>
    nn(name, [{ name: "duration" }], (a) => {
      const v = a[0]!;
      if (v.kind !== "duration") err("Expression.Error", `${name}: expected a duration.`);
      return number(f(v.secs));
    });
  def("Duration.Days", durPart("Duration.Days", (s) => Math.trunc(s / 86400)));
  def("Duration.Hours", durPart("Duration.Hours", (s) => Math.trunc((s % 86400) / 3600)));
  def("Duration.Minutes", durPart("Duration.Minutes", (s) => Math.trunc((s % 3600) / 60)));
  def("Duration.Seconds", durPart("Duration.Seconds", (s) => Math.trunc(s % 60)));
  def("Duration.TotalDays", durPart("Duration.TotalDays", (s) => s / 86400));
  def("Duration.TotalHours", durPart("Duration.TotalHours", (s) => s / 3600));
  def("Duration.TotalMinutes", durPart("Duration.TotalMinutes", (s) => s / 60));
  def("Duration.TotalSeconds", durPart("Duration.TotalSeconds", (s) => s));

  // Serial conversion for hosts (sheetedit turns date-formatted cells into datetimes).
  def("Number.FromDateTime", nn("Number.FromDateTime", [{ name: "value" }], (a) => {
    const d = asDateish(a[0]!, "Number.FromDateTime");
    return number(dateTimeToSerial(d.y, d.m, d.d, d.secs));
  }));
}

/** Shift a date/datetime by days/months/years, preserving the input kind. */
function shift(v: MValue, days: number, months: number, years: number): MValue {
  const src = v.kind === "date" || v.kind === "datetime" ? v : err("Expression.Error", "Expected a date or datetime.");
  let { y, m, d } = src as DateV | DateTimeV;
  if (months || years) ({ y, m, d } = addMonths(y, m, d, months + years * 12));
  if (days) {
    const cc = civilFromDays(daysFromCivil(y, m, d) + days);
    y = cc.y;
    m = cc.m;
    d = cc.d;
  }
  return src.kind === "date" ? date(y, m, d) : datetime(y, m, d, (src as DateTimeV).secs);
}

/** Start/End helpers keep the input kind; datetimes get 00:00:00 at starts, keep time at ends? (oracle) */
function keepKind(v: MValue, f: (d: { y: number; m: number; d: number }) => { y: number; m: number; d: number }, zeroTime: boolean): MValue {
  if (v.kind === "date") {
    const r = f(v);
    return date(r.y, r.m, r.d);
  }
  if (v.kind === "datetime") {
    const r = f(v);
    return datetime(r.y, r.m, r.d, zeroTime ? 0 : v.secs);
  }
  err("Expression.Error", "Expected a date or datetime.");
}
