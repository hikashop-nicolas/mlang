// Temporal constructors (#date/#time/#datetime/#duration) and the Date.* / Time.* /
// DateTime.* / Duration.* Tier-1 subset. Semantics from the public reference; the date
// arithmetic edge cases are oracle-pinned.
import type { Env } from "../interpret.js";
import { NULL, date, datetime, datetimezone, duration, err, number, text, time, type MValue } from "../values.js";
import { END_OF_DAY_SECS, addMonths, civilFromDays, dateTimeToSerial, dayOfWeekSunday0, daysFromCivil, daysInMonth, parseDateTimeText, parseDateTimeZoneText, parseDateText, serialToDateTime, usDate, usDateTime, usTimeShort } from "../temporal.js";
import { cultureOf, parseDateCulture } from "../culture.js";
import { fn, numOf } from "./helpers.js";
import { formatCustom, standardDateTimePattern } from "../format.js";

type DateV = Extract<MValue, { kind: "date" }>;
type DateTimeV = Extract<MValue, { kind: "datetime" }>;

/** A ToText format argument: text, an options record with a Format field, or absent. */
function formatArg(v: MValue | undefined): string | null {
  if (!v || v.kind === "null") return null;
  if (v.kind === "text") return v.value;
  if (v.kind === "record") {
    const f = v.fields.get("Format");
    return f && f.kind === "text" ? f.value : null;
  }
  err("Expression.Error", "ToText: unsupported format argument.");
}

function applyDateTimeFormat(fmt: string, parts: { y: number; mo: number; d: number; secs: number }, has: { date: boolean; time: boolean }): string {
  const pattern = fmt.length === 1 ? standardDateTimePattern(fmt) : null;
  try {
    return formatCustom(pattern ?? fmt, parts, has);
  } catch (e) {
    err("Expression.Error", (e as Error).message);
  }
}

const nn = (name: string, params: { name: string; optional?: boolean }[], f: (args: MValue[]) => MValue) =>
  fn(name, params, (a) => (a[0] && a[0].kind === "null" ? NULL : f(a)));

const asDateish = (v: MValue, who: string): { y: number; m: number; d: number; secs: number } => {
  if (v.kind === "date") return { y: v.y, m: v.m, d: v.d, secs: 0 };
  if (v.kind === "datetime" || v.kind === "datetimezone") return { y: v.y, m: v.m, d: v.d, secs: v.secs };
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
      const s = v.value.trim();
      const culture = cultureOf(a[1] && a[1].kind === "text" ? a[1].value : null);
      // Culture order first (it disambiguates D/M/Y slash dates), then ISO / datetime forms
      // which parseDateCulture rejects (a 4-digit leading field fails its month check).
      const p = parseDateCulture(s, culture) ?? parseDateText(s) ?? (parseDateTimeText(s) as { y: number; m: number; d: number } | null);
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
  const DAY_NAMES = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];
  const MONTH_NAMES = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];
  def("Date.DayOfWeekName", nn("Date.DayOfWeekName", [{ name: "date" }, { name: "culture", optional: true }], (a) => {
    const d = asDateish(a[0]!, "Date.DayOfWeekName");
    return text(DAY_NAMES[dayOfWeekSunday0(daysFromCivil(d.y, d.m, d.d))]!);
  }));
  def("Date.MonthName", nn("Date.MonthName", [{ name: "date" }, { name: "culture", optional: true }], (a) => text(MONTH_NAMES[asDateish(a[0]!, "Date.MonthName").m - 1]!)));

  // List.Dates(start, count, step): count dates starting at `start`, each `step` (a duration) apart.
  def("List.Dates", fn("List.Dates", [{ name: "start" }, { name: "count" }, { name: "step" }], (a) => {
    const s = a[0]!;
    if (s.kind !== "date") err("Expression.Error", "List.Dates: start must be a date.");
    const count = numOf(a[1]!, "count");
    const step = a[2]!;
    if (step.kind !== "duration") err("Expression.Error", "List.Dates: step must be a duration.");
    const stepDays = Math.round(step.secs / 86400);
    const base = daysFromCivil(s.y, s.m, s.d);
    const out: MValue[] = [];
    for (let i = 0; i < count; i++) {
      const c = civilFromDays(base + i * stepDays);
      out.push(date(c.y, c.m, c.d));
    }
    return { kind: "list", items: out };
  }));
  def("Date.DaysInMonth", nn("Date.DaysInMonth", [{ name: "date" }], (a) => { const d = asDateish(a[0]!, "Date.DaysInMonth"); return number(daysInMonth(d.y, d.m)); }));
  def("Date.AddQuarters", nn("Date.AddQuarters", [{ name: "date" }, { name: "numberOfQuarters" }], (a) => shift(a[0]!, 0, numOf(a[1]!, "quarters") * 3, 0)));
  def("Date.QuarterOfYear", nn("Date.QuarterOfYear", [{ name: "date" }], (a) => number(Math.floor((asDateish(a[0]!, "Date.QuarterOfYear").m - 1) / 3) + 1)));
  def("Date.StartOfQuarter", nn("Date.StartOfQuarter", [{ name: "date" }], (a) => keepKind(a[0]!, (d) => ({ ...d, m: Math.floor((d.m - 1) / 3) * 3 + 1, d: 1 }), true)));
  def("Date.EndOfQuarter", nn("Date.EndOfQuarter", [{ name: "date" }], (a) => keepKind(a[0]!, (d) => { const m = Math.floor((d.m - 1) / 3) * 3 + 3; return { y: d.y, m, d: daysInMonth(d.y, m) }; }, false)));
  const startOfWeek = (d: { y: number; m: number; d: number }, first: number): { y: number; m: number; d: number } => {
    const days = daysFromCivil(d.y, d.m, d.d);
    const back = (dayOfWeekSunday0(days) - first + 7) % 7;
    return civilFromDays(days - back);
  };
  def("Date.StartOfWeek", nn("Date.StartOfWeek", [{ name: "date" }, { name: "firstDayOfWeek", optional: true }], (a) =>
    keepKind(a[0]!, (d) => startOfWeek(d, a[1]?.kind === "number" ? a[1].value : 0), true)));
  def("Date.EndOfWeek", nn("Date.EndOfWeek", [{ name: "date" }, { name: "firstDayOfWeek", optional: true }], (a) =>
    keepKind(a[0]!, (d) => { const s = startOfWeek(d, a[1]?.kind === "number" ? a[1].value : 0); return civilFromDays(daysFromCivil(s.y, s.m, s.d) + 6); }, false)));
  def("Date.WeekOfYear", nn("Date.WeekOfYear", [{ name: "date" }, { name: "firstDayOfWeek", optional: true }], (a) => {
    const d = asDateish(a[0]!, "Date.WeekOfYear");
    const first = a[1]?.kind === "number" ? a[1].value : 0;
    const jan1 = daysFromCivil(d.y, 1, 1);
    const offset = (dayOfWeekSunday0(jan1) - first + 7) % 7; // days of week 1 before Jan 1's weekday
    return number(Math.floor((daysFromCivil(d.y, d.m, d.d) - jan1 + offset) / 7) + 1);
  }));
  def("Date.WeekOfMonth", nn("Date.WeekOfMonth", [{ name: "date" }, { name: "firstDayOfWeek", optional: true }], (a) => {
    const d = asDateish(a[0]!, "Date.WeekOfMonth");
    const first = a[1]?.kind === "number" ? a[1].value : 0;
    const first1 = daysFromCivil(d.y, d.m, 1);
    const offset = (dayOfWeekSunday0(first1) - first + 7) % 7;
    return number(Math.floor((daysFromCivil(d.y, d.m, d.d) - first1 + offset) / 7) + 1);
  }));
  def("Date.StartOfDay", nn("Date.StartOfDay", [{ name: "dateTime" }], (a) => keepKind(a[0]!, (d) => d, true)));
  def("Date.EndOfDay", nn("Date.EndOfDay", [{ name: "dateTime" }], (a) => keepKind(a[0]!, (d) => d, false)));

  def("Date.StartOfMonth", nn("Date.StartOfMonth", [{ name: "date" }], (a) => keepKind(a[0]!, (d) => ({ ...d, d: 1 }), true)));
  def("Date.EndOfMonth", nn("Date.EndOfMonth", [{ name: "date" }], (a) => keepKind(a[0]!, (d) => ({ ...d, d: daysInMonth(d.y, d.m) }), false)));
  def("Date.StartOfYear", nn("Date.StartOfYear", [{ name: "date" }], (a) => keepKind(a[0]!, (d) => ({ y: d.y, m: 1, d: 1 }), true)));
  def("Date.EndOfYear", nn("Date.EndOfYear", [{ name: "date" }], (a) => keepKind(a[0]!, (d) => ({ y: d.y, m: 12, d: 31 }), false)));
  def("Date.IsInCurrentMonth", nn("Date.IsInCurrentMonth", [{ name: "date" }], () => err("Expression.Error", "mlang: clock-dependent Date functions are not supported (deterministic engine).")));
  def("Date.ToText", nn("Date.ToText", [{ name: "date" }, { name: "format", optional: true }, { name: "culture", optional: true }], (a) => {
    const d = asDateish(a[0]!, "Date.ToText");
    const f = formatArg(a[1]);
    if (f !== null) return text(applyDateTimeFormat(f, { y: d.y, mo: d.m, d: d.d, secs: d.secs }, { date: true, time: false }));
    return text(usDate(d.y, d.m, d.d));
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
  def("Time.ToText", nn("Time.ToText", [{ name: "time" }, { name: "format", optional: true }, { name: "culture", optional: true }], (a) => {
    const v = a[0]!;
    if (v.kind !== "time") err("Expression.Error", "Time.ToText: expected a time.");
    const f = formatArg(a[1]);
    if (f !== null) return text(applyDateTimeFormat(f, { y: 1, mo: 1, d: 1, secs: v.secs }, { date: false, time: true }));
    return text(usTimeShort(v.secs));
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
    const v = a[0]!;
    if (v.kind !== "datetime") err("Expression.Error", "DateTime.ToText: expected a datetime.");
    const f = formatArg(a[1]);
    if (f !== null) return text(applyDateTimeFormat(f, { y: v.y, mo: v.m, d: v.d, secs: v.secs }, { date: true, time: true }));
    return text(usDateTime(v.y, v.m, v.d, v.secs));
  }));
  def("DateTime.LocalNow", fn("DateTime.LocalNow", [], () => err("Expression.Error", "mlang: DateTime.LocalNow is not supported (deterministic engine).")));
  def("DateTime.FixedLocalNow", fn("DateTime.FixedLocalNow", [], () => err("Expression.Error", "mlang: DateTime.FixedLocalNow is not supported (deterministic engine).")));

  // --- DateTimeZone.* ----------------------------------------------------------------
  def("#datetimezone", fn("#datetimezone", [{ name: "year" }, { name: "month" }, { name: "day" }, { name: "hour" }, { name: "minute" }, { name: "second" }, { name: "offsetHours" }, { name: "offsetMinutes" }], (a) => {
    const y = numOf(a[0]!, "year");
    const m = numOf(a[1]!, "month");
    const d = numOf(a[2]!, "day");
    if (m < 1 || m > 12 || d < 1 || d > daysInMonth(y, m)) err("Expression.Error", "#datetimezone: arguments out of range.");
    const oh = numOf(a[6]!, "offsetHours");
    const offset = oh * 60 + (oh < 0 ? -Math.abs(numOf(a[7]!, "offsetMinutes")) : numOf(a[7]!, "offsetMinutes"));
    return datetimezone(y, m, d, numOf(a[3]!, "hour") * 3600 + numOf(a[4]!, "minute") * 60 + numOf(a[5]!, "second"), offset);
  }));
  def("DateTimeZone.From", nn("DateTimeZone.From", [{ name: "value" }, { name: "culture", optional: true }], (a) => {
    const v = a[0]!;
    if (v.kind === "datetimezone") return v;
    if (v.kind === "datetime") return datetimezone(v.y, v.m, v.d, v.secs, 0);
    if (v.kind === "date") return datetimezone(v.y, v.m, v.d, 0, 0);
    if (v.kind === "number") { const s = serialToDateTime(v.value); return datetimezone(s.y, s.m, s.d, s.secs, 0); }
    if (v.kind === "text") {
      const p = parseDateTimeZoneText(v.value);
      if (!p) err("Expression.Error", `DateTimeZone.From: cannot convert "${v.value}".`);
      return datetimezone(p.y, p.m, p.d, p.secs, p.offset);
    }
    err("Expression.Error", `DateTimeZone.From: cannot convert ${v.kind}.`);
  }));
  const asDtz = (v: MValue, who: string): Extract<MValue, { kind: "datetimezone" }> => {
    if (v.kind !== "datetimezone") err("Expression.Error", `${who}: expected a datetimezone.`);
    return v;
  };
  def("DateTimeZone.ZoneHours", nn("DateTimeZone.ZoneHours", [{ name: "dateTimeZone" }], (a) => number(Math.trunc(asDtz(a[0]!, "DateTimeZone.ZoneHours").offset / 60))));
  def("DateTimeZone.ZoneMinutes", nn("DateTimeZone.ZoneMinutes", [{ name: "dateTimeZone" }], (a) => number(asDtz(a[0]!, "DateTimeZone.ZoneMinutes").offset % 60)));
  def("DateTimeZone.RemoveZone", nn("DateTimeZone.RemoveZone", [{ name: "dateTimeZone" }], (a) => { const v = asDtz(a[0]!, "DateTimeZone.RemoveZone"); return datetime(v.y, v.m, v.d, v.secs); }));
  def("DateTimeZone.ToUtc", nn("DateTimeZone.ToUtc", [{ name: "dateTimeZone" }], (a) => shiftZone(asDtz(a[0]!, "DateTimeZone.ToUtc"), 0)));
  def("DateTimeZone.SwitchZone", nn("DateTimeZone.SwitchZone", [{ name: "dateTimeZone" }, { name: "timezoneHours" }, { name: "timezoneMinutes", optional: true }], (a) => {
    const v = asDtz(a[0]!, "DateTimeZone.SwitchZone");
    const th = numOf(a[1]!, "timezoneHours");
    const target = th * 60 + (a[2] && a[2].kind === "number" ? (th < 0 ? -Math.abs(a[2].value) : a[2].value) : 0);
    return shiftZone(v, target);
  }));
  def("DateTimeZone.ToLocal", nn("DateTimeZone.ToLocal", [{ name: "dateTimeZone" }], () => err("Expression.Error", "mlang: DateTimeZone.ToLocal needs a local zone (deterministic engine).")));
  for (const now of ["DateTimeZone.UtcNow", "DateTimeZone.LocalNow", "DateTimeZone.FixedUtcNow", "DateTimeZone.FixedLocalNow"]) def(now, fn(now, [], () => err("Expression.Error", `mlang: ${now} is not supported (deterministic engine).`)));

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
/** Same UTC instant, expressed in a new zone offset (minutes). */
function shiftZone(v: Extract<MValue, { kind: "datetimezone" }>, targetOffset: number): MValue {
  const instant = daysFromCivil(v.y, v.m, v.d) * 86400 + v.secs - v.offset * 60;
  const local = instant + targetOffset * 60;
  const days = Math.floor(local / 86400);
  const c = civilFromDays(days);
  return datetimezone(c.y, c.m, c.d, local - days * 86400, targetOffset);
}

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

/** Start/End helpers keep the input kind. For datetimes, StartOf* zeroes the time and
    EndOf* moves to the last instant of the day (23:59:59.9999999) - oracle-confirmed. */
function keepKind(v: MValue, f: (d: { y: number; m: number; d: number }) => { y: number; m: number; d: number }, isStart: boolean): MValue {
  if (v.kind === "date") {
    const r = f(v);
    return date(r.y, r.m, r.d);
  }
  if (v.kind === "datetime") {
    const r = f(v);
    return datetime(r.y, r.m, r.d, isStart ? 0 : END_OF_DAY_SECS);
  }
  err("Expression.Error", "Expected a date or datetime.");
}
