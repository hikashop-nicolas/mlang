// Value conversions shared by Text.From / Number.From / Table.TransformColumnTypes.
import { NULL, date, datetime, err, logical, number, text, time, type MValue } from "../values.js";
import { dateTimeToSerial, formatDate, formatTimeOfDay, parseDateTimeText, parseDateText, serialToDateTime } from "../temporal.js";

export const numToText = (n: number): string => {
  if (n === Infinity) return "Infinity";
  if (n === -Infinity) return "-Infinity";
  return String(n);
};

/** Text.From semantics (oracle: logicals are lowercase "true"/"false"). */
export function textFrom(v: MValue): string {
  switch (v.kind) {
    case "text": return v.value;
    case "number": return numToText(v.value);
    case "logical": return v.value ? "true" : "false";
    case "date": return formatDate(v.y, v.m, v.d);
    case "time": return formatTimeOfDay(v.secs);
    case "datetime": return `${formatDate(v.y, v.m, v.d)} ${formatTimeOfDay(v.secs)}`;
    default:
      err("Expression.Error", `Cannot convert a ${v.kind} to text.`);
  }
}

export function numberFrom(v: MValue): MValue {
  if (v.kind === "null") return NULL;
  if (v.kind === "number") return v;
  if (v.kind === "logical") return number(v.value ? 1 : 0);
  if (v.kind === "date") return number(dateTimeToSerial(v.y, v.m, v.d, 0));
  if (v.kind === "datetime") return number(dateTimeToSerial(v.y, v.m, v.d, v.secs));
  if (v.kind === "time") return number(v.secs / 86400);
  if (v.kind === "duration") return number(v.secs / 86400); // total days
  if (v.kind === "text") {
    const t = v.value.trim();
    const n = Number(t.replace(/,/g, "")); // FIDELITY: culture-aware parsing later
    if (t === "" || Number.isNaN(n)) err("Expression.Error", `Number.From: cannot convert "${v.value}" to a number.`);
    return number(n);
  }
  err("Expression.Error", `Number.From: cannot convert ${v.kind}.`);
}

export function convertTo(v: MValue, ty: string, col: string): MValue {
  if (v.kind === "null") return NULL;
  switch (ty) {
    case "number":
    case "Int64.Type":
      return numberFrom(v);
    case "text":
      return v.kind === "text" ? v : text(textFrom(v));
    case "logical":
      if (v.kind === "logical") return v;
      if (v.kind === "number") return logical(v.value !== 0);
      if (v.kind === "text") {
        const s = v.value.toLowerCase();
        if (s === "true") return logical(true);
        if (s === "false") return logical(false);
        err("Expression.Error", `Cannot convert '${v.value}' to logical.`);
      }
      err("Expression.Error", `Cannot convert column '${col}' to logical.`);
      break;
    case "date": {
      if (v.kind === "date") return v;
      if (v.kind === "datetime") return date(v.y, v.m, v.d);
      if (v.kind === "number") {
        const s = serialToDateTime(Math.floor(v.value));
        return date(s.y, s.m, s.d);
      }
      if (v.kind === "text") {
        const p = parseDateText(v.value.trim());
        if (p) return date(p.y, p.m, p.d);
      }
      err("Expression.Error", `Cannot convert column '${col}' to date.`);
      break;
    }
    case "datetime": {
      if (v.kind === "datetime") return v;
      if (v.kind === "date") return datetime(v.y, v.m, v.d, 0);
      if (v.kind === "number") {
        const s = serialToDateTime(v.value);
        return datetime(s.y, s.m, s.d, s.secs);
      }
      if (v.kind === "text") {
        const p = parseDateTimeText(v.value);
        if (p) return datetime(p.y, p.m, p.d, p.secs);
      }
      err("Expression.Error", `Cannot convert column '${col}' to datetime.`);
      break;
    }
    case "time": {
      if (v.kind === "time") return v;
      if (v.kind === "datetime") return time(v.secs);
      if (v.kind === "number") return time(Math.round((v.value - Math.floor(v.value)) * 86400 * 1000) / 1000);
      err("Expression.Error", `Cannot convert column '${col}' to time.`);
      break;
    }
    case "any":
      return v;
    default:
      err("Expression.Error", `mlang: column type '${ty}' not supported yet (column '${col}').`);
  }
  return v;
}
