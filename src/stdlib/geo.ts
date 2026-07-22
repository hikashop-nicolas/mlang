// Geography.*/Geometry.* - Well-Known Text (WKT / OGC) spatial values as structured records.
// Record shapes confirmed against Microsoft docs + Chris Webb's reference examples:
//   POINT       -> [Kind="POINT", Longitude/Latitude (geo) | X/Y (geom)]  (Z/M/SRID only when present)
//   LINESTRING  -> [Kind="LINESTRING", Points = {point records}]
//   POLYGON     -> [Kind="POLYGON", Rings = {LINESTRING records}]
//   MULTIPOINT/MULTILINESTRING/MULTIPOLYGON/GEOMETRYCOLLECTION -> [Kind=..., Components = {records}]
// Z, M and SRID are omitted from the record when null / at the default SRID (4326 geo, 0 geom).
import type { Env } from "../interpret.js";
import { NULL, err, list, number, record, text, type MValue } from "../values.js";
import { fn, listOf, numOf, textOf } from "./helpers.js";

/** A POINT record. `geo` picks Longitude/Latitude (geography) vs X/Y (geometry). Z/M/SRID
    appear only when defined; `srid` is the value to include, or null to omit. */
function pointRecord(coords: number[], geo: boolean, srid: number | null): MValue {
  const entries: [string, MValue][] = [["Kind", text("POINT")]];
  if (geo) entries.push(["Longitude", number(coords[0] ?? 0)], ["Latitude", number(coords[1] ?? 0)]);
  else entries.push(["X", number(coords[0] ?? 0)], ["Y", number(coords[1] ?? 0)]);
  if (coords[2] !== undefined) entries.push(["Z", number(coords[2])]);
  if (coords[3] !== undefined) entries.push(["M", number(coords[3])]);
  if (srid !== null) entries.push(["SRID", number(srid)]);
  return record(entries);
}
const lineRecord = (rings: number[][], geo: boolean): MValue =>
  record([["Kind", text("LINESTRING")], ["Points", list(rings.map((c) => pointRecord(c, geo, null)))]]);

// --- WKT parsing -----------------------------------------------------------------------
/** Split by `sep` at parenthesis depth 0. */
function splitTop(s: string, sep = ","): string[] {
  const out: string[] = []; let depth = 0, cur = "";
  for (const ch of s) {
    if (ch === "(") depth++; else if (ch === ")") depth--;
    if (ch === sep && depth === 0) { out.push(cur); cur = ""; } else cur += ch;
  }
  out.push(cur);
  return out.map((x) => x.trim()).filter((x) => x.length > 0);
}
/** Strip one layer of outer parentheses. */
const inner = (s: string): string => { const t = s.trim(); return t.startsWith("(") && t.endsWith(")") ? t.slice(1, -1).trim() : t; };
const coordsOf = (s: string): number[] => s.trim().split(/\s+/).map(Number);
const coordList = (s: string): number[][] => splitTop(s).map(coordsOf);

/** `srid` is the SRID to attach to the top-level record (null = omit); nested records get null. */
function parseGeom(input: string, geo: boolean, srid: number | null): MValue {
  const s = input.trim();
  const m = s.match(/^([A-Za-z]+)\s*(ZM|Z|M)?\s*([\s\S]*)$/);
  if (!m) err("Expression.Error", `WKT: cannot parse "${input}".`);
  const kind = m[1]!.toUpperCase();
  const body = m[3]!.trim();
  const withSrid = (entries: [string, MValue][]): MValue => record(srid !== null ? [...entries, ["SRID", number(srid)]] : entries);
  switch (kind) {
    case "POINT": return pointRecord(coordsOf(inner(body)), geo, srid);
    case "LINESTRING": return withSrid([["Kind", text("LINESTRING")], ["Points", list(coordList(inner(body)).map((c) => pointRecord(c, geo, null)))]]);
    case "POLYGON": return withSrid([["Kind", text("POLYGON")], ["Rings", list(splitTop(inner(body)).map((ring) => lineRecord(coordList(inner(ring)), geo)))]]);
    case "MULTIPOINT": {
      const b = inner(body);
      const pts = b.includes("(") ? splitTop(b).map((p) => coordsOf(inner(p))) : coordList(b);
      return withSrid([["Kind", text("MULTIPOINT")], ["Components", list(pts.map((c) => pointRecord(c, geo, null)))]]);
    }
    case "MULTILINESTRING": return withSrid([["Kind", text("MULTILINESTRING")], ["Components", list(splitTop(inner(body)).map((ls) => parseGeom(`LINESTRING ${ls}`, geo, null)))]]);
    case "MULTIPOLYGON": return withSrid([["Kind", text("MULTIPOLYGON")], ["Components", list(splitTop(inner(body)).map((pg) => parseGeom(`POLYGON ${pg}`, geo, null)))]]);
    case "GEOMETRYCOLLECTION": return withSrid([["Kind", text("GEOMETRYCOLLECTION")], ["Components", list(splitTop(inner(body)).map((g) => parseGeom(g, geo, null)))]]);
    default: err("Expression.Error", `WKT: unsupported geometry kind "${kind}".`);
  }
}

function fromWkt(input: MValue, geo: boolean, defaultSrid: number): MValue {
  if (input.kind === "null") return NULL;
  let s = textOf(input, "FromWellKnownText").trim();
  let srid = defaultSrid;
  const sm = s.match(/^SRID=(\d+)\s*;\s*/i);
  if (sm) { srid = Number(sm[1]); s = s.slice(sm[0].length); }
  return parseGeom(s, geo, srid === defaultSrid ? null : srid);
}

// --- WKT serialization -----------------------------------------------------------------
const fmt = (n: number): string => String(n);
const numVal = (v: MValue | undefined): number => (v && v.kind === "number" ? v.value : 0);
const recOf = (v: MValue, who: string): Map<string, MValue> => { if (v.kind !== "record") err("Expression.Error", `${who}: expected a record.`); return v.fields; };
function pointCoords(r: Map<string, MValue>, geo: boolean): string {
  const parts = [numVal(r.get(geo ? "Longitude" : "X")), numVal(r.get(geo ? "Latitude" : "Y"))];
  const z = r.get("Z"), mm = r.get("M");
  if (z && z.kind === "number") parts.push(z.value);
  if (mm && mm.kind === "number") parts.push(mm.value);
  return parts.map(fmt).join(" ");
}
function toWkt(rec: Map<string, MValue>, geo: boolean): string {
  const kind = (rec.get("Kind")?.kind === "text" ? (rec.get("Kind") as { value: string }).value : "").toUpperCase();
  const ptStr = (v: MValue) => pointCoords(recOf(v, "point"), geo);
  const ringStr = (v: MValue) => `(${listOf(recOf(v, "ring").get("Points") ?? list([]), "Points").map(ptStr).join(", ")})`;
  switch (kind) {
    case "POINT": return `POINT (${pointCoords(rec, geo)})`;
    case "LINESTRING": return `LINESTRING (${listOf(rec.get("Points") ?? list([]), "Points").map(ptStr).join(", ")})`;
    case "POLYGON": return `POLYGON (${listOf(rec.get("Rings") ?? list([]), "Rings").map(ringStr).join(", ")})`;
    case "MULTIPOINT": return `MULTIPOINT (${listOf(rec.get("Components") ?? list([]), "Components").map(ptStr).join(", ")})`;
    case "MULTILINESTRING": case "MULTIPOLYGON": case "GEOMETRYCOLLECTION": {
      const parts = listOf(rec.get("Components") ?? list([]), "Components").map((c) => {
        const w = toWkt(recOf(c, "component"), geo);
        return kind === "GEOMETRYCOLLECTION" ? w : w.replace(/^[A-Z]+ /, "");
      });
      return `${kind} (${parts.join(", ")})`;
    }
    default: err("Expression.Error", `ToWellKnownText: unsupported Kind "${kind}".`);
  }
}
function toWktText(input: MValue, geo: boolean, omitSrid: boolean): MValue {
  if (input.kind === "null") return NULL;
  const rec = recOf(input, "ToWellKnownText");
  const body = toWkt(rec, geo);
  const sridV = rec.get("SRID");
  return !omitSrid && sridV && sridV.kind === "number" ? text(`SRID=${sridV.value};${body}`) : text(body);
}

export function registerGeo(env: Env): void {
  const def = (name: string, v: MValue): void => env.defineValue(name, v);
  const pointFrom = (name: string, geo: boolean, defaultSrid: number) =>
    def(name, fn(name, [{ name: geo ? "longitude" : "x" }, { name: geo ? "latitude" : "y" }, { name: "z", optional: true }, { name: "m", optional: true }, { name: "srid", optional: true }], (a) => {
      const coords = [numOf(a[0]!, name), numOf(a[1]!, name)];
      if (a[2] && a[2].kind === "number") coords[2] = a[2].value;
      if (a[3] && a[3].kind === "number") coords[3] = a[3].value;
      const srid = a[4] && a[4].kind === "number" ? a[4].value : defaultSrid;
      return pointRecord(coords, geo, srid === defaultSrid ? null : srid);
    }));
  pointFrom("GeographyPoint.From", true, 4326);
  pointFrom("GeometryPoint.From", false, 0);

  def("Geography.FromWellKnownText", fn("Geography.FromWellKnownText", [{ name: "input" }], (a) => fromWkt(a[0]!, true, 4326)));
  def("Geometry.FromWellKnownText", fn("Geometry.FromWellKnownText", [{ name: "input" }], (a) => fromWkt(a[0]!, false, 0)));
  def("Geography.ToWellKnownText", fn("Geography.ToWellKnownText", [{ name: "input" }, { name: "omitSRID", optional: true }], (a) => toWktText(a[0]!, true, a[1]?.kind === "logical" && a[1].value)));
  def("Geometry.ToWellKnownText", fn("Geometry.ToWellKnownText", [{ name: "input" }, { name: "omitSRID", optional: true }], (a) => toWktText(a[0]!, false, a[1]?.kind === "logical" && a[1].value)));
}
