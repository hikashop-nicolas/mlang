// Reader for the workbook query-definition payload, per the documented MS-QDEFF format:
// a customXml item holds <DataMashup> whose base64 content is
//   UInt32 version, then four length-prefixed blocks:
//   Package Parts (an OPC zip holding Formulas/Section1.m), Permissions (XML),
//   Metadata (XML + content), Permission Bindings.
// Read-only here: refresh never rewrites this payload; editing M is a later phase.

import { strFromU8, unzipSync } from "fflate";

export interface DataMashup {
  version: number;
  /** The OPC package entries (path -> bytes). */
  parts: Record<string, Uint8Array>;
  permissionsXml: string;
  metadataBytes: Uint8Array;
  permissionBindings: Uint8Array;
  /** The M section document (Formulas/Section1.m), BOM-stripped. */
  sectionM: string;
}

/** Parse the decoded (binary) DataMashup payload. */
export function parseDataMashup(bytes: Uint8Array): DataMashup {
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  let off = 0;
  const u32 = (): number => {
    if (off + 4 > bytes.length) throw new Error("qdeff: truncated payload");
    const v = view.getUint32(off, true);
    off += 4;
    return v;
  };
  const block = (): Uint8Array => {
    const len = u32();
    if (off + len > bytes.length) throw new Error("qdeff: truncated block");
    const b = bytes.subarray(off, off + len);
    off += len;
    return b;
  };
  const version = u32();
  const packageParts = block();
  const permissions = block();
  const metadata = block();
  const permissionBindings = block();

  const parts = unzipSync(packageParts);
  const sectionEntry = Object.keys(parts).find((p) => p.replace(/^\//, "") === "Formulas/Section1.m") ?? Object.keys(parts).find((p) => p.endsWith("Section1.m"));
  if (!sectionEntry) throw new Error("qdeff: Formulas/Section1.m not found in the package");
  let sectionM = strFromU8(parts[sectionEntry]!);
  if (sectionM.charCodeAt(0) === 0xfeff) sectionM = sectionM.slice(1);

  return { version, parts, permissionsXml: strFromU8(permissions), metadataBytes: metadata, permissionBindings, sectionM };
}

const B64 = /^[A-Za-z0-9+/=\s]+$/;

function fromBase64(b64: string): Uint8Array {
  const clean = b64.replace(/\s+/g, "");
  const bin = atob(clean);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}

/** Find the DataMashup base64 inside a customXml item's text, or null. */
export function dataMashupFromItemXml(xml: string): Uint8Array | null {
  const m = xml.match(/<DataMashup[^>]*>([^<]*)<\/DataMashup>/);
  if (!m || !m[1] || !B64.test(m[1])) return null;
  return fromBase64(m[1]);
}

export interface WorkbookQueries {
  mashup: DataMashup;
  /** The customXml part path the payload came from (for a future write-back). */
  itemPath: string;
}

/** Extract the query definitions from an unzipped .xlsx (entry map path -> bytes). */
export function readWorkbookQueries(entries: Record<string, Uint8Array>): WorkbookQueries | null {
  for (const [path, data] of Object.entries(entries)) {
    if (!/^customXml\/item\d+\.xml$/i.test(path)) continue;
    const xml = strFromU8(data);
    if (!xml.includes("DataMashup")) continue;
    const payload = dataMashupFromItemXml(xml);
    if (payload) return { mashup: parseDataMashup(payload), itemPath: path };
  }
  return null;
}
