// Civil date/time math for the temporal value kinds. Pure integer algorithms (no JS Date,
// no timezones): M dates are proleptic-Gregorian civil dates. Durations are stored as
// fractional SECONDS (M uses 100ns ticks; we keep millisecond-ish precision - FIDELITY).

/** Days since 1970-01-01 for a civil date (Howard Hinnant's algorithm). */
export function daysFromCivil(y: number, m: number, d: number): number {
  y -= m <= 2 ? 1 : 0;
  const era = Math.floor(y / 400);
  const yoe = y - era * 400;
  const doy = Math.trunc((153 * (m + (m > 2 ? -3 : 9)) + 2) / 5) + d - 1;
  const doe = yoe * 365 + Math.floor(yoe / 4) - Math.floor(yoe / 100) + doy;
  return era * 146097 + doe - 719468;
}

/** Civil date from days since 1970-01-01. */
export function civilFromDays(z: number): { y: number; m: number; d: number } {
  z += 719468;
  const era = Math.floor(z / 146097);
  const doe = z - era * 146097;
  const yoe = Math.trunc((doe - Math.trunc(doe / 1460) + Math.trunc(doe / 36524) - Math.trunc(doe / 146096)) / 365);
  const y = yoe + era * 400;
  const doy = doe - (365 * yoe + Math.floor(yoe / 4) - Math.floor(yoe / 100));
  const mp = Math.trunc((5 * doy + 2) / 153);
  const d = doy - Math.trunc((153 * mp + 2) / 5) + 1;
  const m = mp + (mp < 10 ? 3 : -9);
  return { y: y + (m <= 2 ? 1 : 0), m, d };
}

export const daysInMonth = (y: number, m: number): number => {
  if (m === 2) return (y % 4 === 0 && y % 100 !== 0) || y % 400 === 0 ? 29 : 28;
  return [31, 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31][m - 1]!;
};

/** Add months, clamping the day to the target month's end (Jan 31 + 1mo = Feb 28/29). */
export function addMonths(y: number, m: number, d: number, n: number): { y: number; m: number; d: number } {
  const total = y * 12 + (m - 1) + n;
  const ny = Math.floor(total / 12);
  const nm = (total - ny * 12) + 1;
  return { y: ny, m: nm, d: Math.min(d, daysInMonth(ny, nm)) };
}

/** Day of week, 0 = Sunday (1970-01-01 was a Thursday). */
export const dayOfWeekSunday0 = (days: number): number => (((days + 4) % 7) + 7) % 7;

// OLE/Excel serial epoch: serial 0 = 1899-12-30.
const SERIAL_EPOCH_DAYS = daysFromCivil(1899, 12, 30);

export function serialToDateTime(serial: number): { y: number; m: number; d: number; secs: number } {
  const days = Math.floor(serial);
  const secs = Math.round((serial - days) * 86400 * 1000) / 1000;
  const { y, m, d } = civilFromDays(SERIAL_EPOCH_DAYS + days);
  return { y, m, d, secs };
}

export function dateTimeToSerial(y: number, m: number, d: number, secs: number): number {
  return daysFromCivil(y, m, d) - SERIAL_EPOCH_DAYS + secs / 86400;
}

const p2 = (n: number): string => String(n).padStart(2, "0");

/** Last instant of a civil day: 23:59:59.9999999 (matches the engine's EndOf* results). */
export const END_OF_DAY_SECS = 86399.9999999;

/** ISO date, used internally where a stable format is wanted (not the culture ToText). */
export const formatDate = (y: number, m: number, d: number): string => `${String(y).padStart(4, "0")}-${p2(m)}-${p2(d)}`;

export function formatTimeOfDay(secs: number): string {
  const h = Math.floor(secs / 3600);
  const mi = Math.floor((secs % 3600) / 60);
  const s = secs % 60;
  const sInt = Math.floor(s);
  const frac = s - sInt;
  const fracStr = frac > 1e-9 ? String(Math.round(frac * 1e7) / 1e7).slice(1) : "";
  return `${p2(h)}:${p2(mi)}:${p2(sInt)}${fracStr}`;
}

// en-US default ("General") formats, which the engine uses for X.ToText / Text.From with no
// format argument (oracle-confirmed).
export const usDate = (y: number, m: number, d: number): string => `${m}/${d}/${String(y).padStart(4, "0")}`;

const twelveHour = (secs: number): { h: number; mi: number; s: number; ap: string } => {
  const h24 = Math.floor(secs / 3600);
  return { h: h24 % 12 === 0 ? 12 : h24 % 12, mi: Math.floor((secs % 3600) / 60), s: Math.floor(secs % 60), ap: h24 < 12 ? "AM" : "PM" };
};
/** Short time "h:mm tt" (no seconds), as Time.ToText / Text.From(time). */
export const usTimeShort = (secs: number): string => {
  const t = twelveHour(secs);
  return `${t.h}:${p2(t.mi)} ${t.ap}`;
};
/** Long time "h:mm:ss tt", used in the datetime General format. */
export const usTimeLong = (secs: number): string => {
  const t = twelveHour(secs);
  return `${t.h}:${p2(t.mi)}:${p2(t.s)} ${t.ap}`;
};
export const usDateTime = (y: number, m: number, d: number, secs: number): string => `${usDate(y, m, d)} ${usTimeLong(secs)}`;

/** Parse "YYYY-MM-DD" (ISO) or "M/D/YYYY" (en-US default culture). Null if unparsable. */
export function parseDateText(s: string): { y: number; m: number; d: number } | null {
  let m = /^(\d{4})-(\d{1,2})-(\d{1,2})$/.exec(s);
  if (m) return check(Number(m[1]), Number(m[2]), Number(m[3]));
  m = /^(\d{1,2})\/(\d{1,2})\/(\d{4})$/.exec(s);
  if (m) return check(Number(m[3]), Number(m[1]), Number(m[2]));
  return null;
}

/** Parse a datetime: a date text, optionally followed by "T" or space and HH:MM[:SS[.fff]]. */
export function parseDateTimeText(s: string): { y: number; m: number; d: number; secs: number } | null {
  const m = /^(.+?)[T ](\d{1,2}):(\d{2})(?::(\d{2}(?:\.\d+)?))?$/.exec(s.trim());
  if (!m) {
    const d = parseDateText(s.trim());
    return d ? { ...d, secs: 0 } : null;
  }
  const date = parseDateText(m[1]!.trim());
  if (!date) return null;
  const h = Number(m[2]);
  const mi = Number(m[3]);
  const sec = m[4] ? Number(m[4]) : 0;
  if (h > 23 || mi > 59 || sec >= 60) return null;
  return { ...date, secs: h * 3600 + mi * 60 + sec };
}

function check(y: number, m: number, d: number): { y: number; m: number; d: number } | null {
  if (m < 1 || m > 12 || d < 1 || d > daysInMonth(y, m)) return null;
  return { y, m, d };
}
