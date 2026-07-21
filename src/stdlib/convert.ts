// Value conversions shared by Text.From / Number.From / Table.TransformColumnTypes.
import { NULL, err, logical, number, text, type MValue } from "../values.js";

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
    default:
      err("Expression.Error", `Cannot convert a ${v.kind} to text.`);
  }
}

export function numberFrom(v: MValue): MValue {
  if (v.kind === "null") return NULL;
  if (v.kind === "number") return v;
  if (v.kind === "logical") return number(v.value ? 1 : 0);
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
    case "any":
      return v;
    default:
      err("Expression.Error", `mlang: column type '${ty}' not supported yet (column '${col}').`);
  }
  return v;
}
