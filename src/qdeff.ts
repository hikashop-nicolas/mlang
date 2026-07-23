// Reader/writer for the workbook query-definition payload, per the documented MS-QDEFF
// format: a customXml item holds <DataMashup> whose base64 content is
//   UInt32 version, then four length-prefixed blocks:
//   Package Parts (an OPC zip holding Formulas/Section1.m), Permissions (XML),
//   Metadata (XML + content), Permission Bindings.
// READ powers listing/refresh (refresh never rewrites this payload). WRITE powers M editing:
// the Section1.m inside Package Parts is swapped, the other three blocks are kept byte-for-
// byte (so the Permissions/PermissionBindings signature and query metadata stay valid).

import { strFromU8, unzipSync, zipSync } from "fflate";

export interface DataMashup {
  version: number;
  /** The OPC package entries (path -> bytes). */
  parts: Record<string, Uint8Array>;
  permissionsXml: string;
  /** Raw permissions block, kept so a re-serialize is byte-identical. */
  permissionsBytes: Uint8Array;
  metadataBytes: Uint8Array;
  permissionBindings: Uint8Array;
  /** The M section document (Formulas/Section1.m), BOM-stripped. */
  sectionM: string;
}

const SECTION_PATH = "Formulas/Section1.m";
const sectionKey = (parts: Record<string, Uint8Array>): string =>
  Object.keys(parts).find((p) => p.replace(/^\//, "") === SECTION_PATH) ?? Object.keys(parts).find((p) => p.endsWith("Section1.m")) ?? SECTION_PATH;

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
  const sectionEntry = Object.keys(parts).find((p) => p.replace(/^\//, "") === SECTION_PATH) ?? Object.keys(parts).find((p) => p.endsWith("Section1.m"));
  if (!sectionEntry) throw new Error("qdeff: Formulas/Section1.m not found in the package");
  let sectionM = strFromU8(parts[sectionEntry]!);
  if (sectionM.charCodeAt(0) === 0xfeff) sectionM = sectionM.slice(1);

  // Copy the block slices out of the backing buffer so callers can hold them independently.
  return {
    version,
    parts,
    permissionsXml: strFromU8(permissions),
    permissionsBytes: permissions.slice(),
    metadataBytes: metadata.slice(),
    permissionBindings: permissionBindings.slice(),
    sectionM,
  };
}

/** Serialize a DataMashup back to its binary payload, optionally replacing Section1.m.
    Only Package Parts is rebuilt; the other three blocks are re-emitted verbatim. */
export function serializeDataMashup(mashup: DataMashup, newSectionM?: string): Uint8Array {
  const parts: Record<string, Uint8Array> = { ...mashup.parts };
  if (newSectionM !== undefined) parts[sectionKey(parts)] = withUtf8Bom(newSectionM);
  const packageParts = zipSync(parts);
  const blocks = [packageParts, mashup.permissionsBytes, mashup.metadataBytes, mashup.permissionBindings];
  const total = 4 + blocks.reduce((n, b) => n + 4 + b.length, 0);
  const out = new Uint8Array(total);
  const dv = new DataView(out.buffer);
  let off = 0;
  dv.setUint32(off, mashup.version, true);
  off += 4;
  for (const b of blocks) {
    dv.setUint32(off, b.length, true);
    off += 4;
    out.set(b, off);
    off += b.length;
  }
  return out;
}

/** Excel stores Formulas/Section1.m as UTF-8 with a BOM. */
function withUtf8Bom(s: string): Uint8Array {
  const body = new TextEncoder().encode(s);
  const out = new Uint8Array(body.length + 3);
  out.set([0xef, 0xbb, 0xbf], 0);
  out.set(body, 3);
  return out;
}

const B64 = /^[A-Za-z0-9+/=\s]+$/;

function fromBase64(b64: string): Uint8Array {
  const clean = b64.replace(/\s+/g, "");
  const bin = atob(clean);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}

function toBase64(bytes: Uint8Array): string {
  let bin = "";
  for (let i = 0; i < bytes.length; i += 0x8000) bin += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  return btoa(bin);
}

/** Find the DataMashup base64 inside a customXml item's text, or null. */
export function dataMashupFromItemXml(xml: string): Uint8Array | null {
  const m = xml.match(/<DataMashup[^>]*>([^<]*)<\/DataMashup>/);
  if (!m || !m[1] || !B64.test(m[1])) return null;
  return fromBase64(m[1]);
}

/** Replace the base64 body inside a customXml item's <DataMashup> element. */
export function replaceDataMashupInItemXml(xml: string, payload: Uint8Array): string {
  return xml.replace(/(<DataMashup[^>]*>)[^<]*(<\/DataMashup>)/, `$1${toBase64(payload)}$2`);
}

/** Re-encode item XML matching the original part's byte encoding (UTF-16 LE/BE BOM or UTF-8). */
export function encodeOoxmlText(xml: string, original: Uint8Array): Uint8Array {
  if (original.length >= 2 && original[0] === 0xff && original[1] === 0xfe) {
    const body = new Uint8Array(xml.length * 2 + 2);
    body[0] = 0xff;
    body[1] = 0xfe;
    for (let i = 0; i < xml.length; i++) {
      body[2 + i * 2] = xml.charCodeAt(i) & 0xff;
      body[2 + i * 2 + 1] = (xml.charCodeAt(i) >> 8) & 0xff;
    }
    return body;
  }
  return new TextEncoder().encode(xml);
}

export interface WorkbookQueries {
  mashup: DataMashup;
  /** The customXml part path the payload came from (for a future write-back). */
  itemPath: string;
}

/** Decode an OOXML text part honouring its BOM: real Excel writes the DataMashup
    customXml item as UTF-16 LE (FF FE), not UTF-8. */
export function decodeOoxmlText(data: Uint8Array): string {
  if (data.length >= 2 && data[0] === 0xff && data[1] === 0xfe) return new TextDecoder("utf-16le").decode(data.subarray(2));
  if (data.length >= 2 && data[0] === 0xfe && data[1] === 0xff) return new TextDecoder("utf-16be").decode(data.subarray(2));
  return strFromU8(data);
}

/** Extract the query definitions from an unzipped .xlsx (entry map path -> bytes). */
export function readWorkbookQueries(entries: Record<string, Uint8Array>): WorkbookQueries | null {
  for (const [path, data] of Object.entries(entries)) {
    if (!/^customXml\/item\d+\.xml$/i.test(path)) continue;
    const xml = decodeOoxmlText(data);
    if (!xml.includes("DataMashup")) continue;
    const payload = dataMashupFromItemXml(xml);
    if (payload) return { mashup: parseDataMashup(payload), itemPath: path };
  }
  return null;
}

/** Rewrite a workbook's Section1.m in place, returning updated entries. The DataMashup item
    part is re-encoded in its original byte encoding; all other parts are untouched. When the
    workbook has no query payload yet, a fresh one is bootstrapped (see createWorkbookQueries). */
export function writeWorkbookSectionM(entries: Record<string, Uint8Array>, newSectionM: string, guid?: string): Record<string, Uint8Array> {
  const found = readWorkbookQueries(entries);
  if (!found) return createWorkbookQueries(entries, newSectionM, guid);
  const payload = serializeDataMashup(found.mashup, newSectionM);
  const original = entries[found.itemPath]!;
  const newXml = replaceDataMashupInItemXml(decodeOoxmlText(original), payload);
  return { ...entries, [found.itemPath]: encodeOoxmlText(newXml, original) };
}

// ---- Bootstrapping a workbook that has no Power Query payload ----

const DS_NS = "http://schemas.openxmlformats.org/officeDocument/2006/customXml";
const REL_NS = "http://schemas.openxmlformats.org/package/2006/relationships";
const enc = (s: string): Uint8Array => new TextEncoder().encode(s);
const xmlEsc = (s: string): string => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

const PKG_CONTENT_TYPES = `<?xml version="1.0" encoding="utf-8"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="xml" ContentType="text/xml"/><Default Extension="m" ContentType="application/x-ms-m"/></Types>`;
const PKG_PACKAGE = `<?xml version="1.0" encoding="utf-8"?><Package xmlns="http://schemas.microsoft.com/DataMashup/Package"><Version>2.0</Version><MinVersion>1.0</MinVersion><Culture>en-US</Culture></Package>`;
const PERMISSIONS = `<?xml version="1.0" encoding="utf-8"?><PermissionList xmlns:xsd="http://www.w3.org/2001/XMLSchema"><CanEvaluateFuturePackages>false</CanEvaluateFuturePackages><FirewallEnabled>true</FirewallEnabled></PermissionList>`;

/** The query names (shared members) declared in a Section1.m document. */
export function queryNamesFromSectionM(sectionM: string): string[] {
  const names: string[] = [];
  const re = /\bshared\s+(?:#"([^"]+)"|([A-Za-z_][\w.]*))\s*=/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(sectionM))) names.push((m[1] ?? m[2])!);
  return names;
}

/** A minimal DataMashup wrapping the given Section1.m (empty metadata + permission bindings). */
export function buildDataMashup(sectionM: string): DataMashup {
  return {
    version: 0,
    parts: {
      "[Content_Types].xml": enc(PKG_CONTENT_TYPES),
      "Config/Package.xml": enc(PKG_PACKAGE),
      "Formulas/Section1.m": withUtf8Bom(sectionM),
    },
    permissionsXml: PERMISSIONS,
    permissionsBytes: enc(PERMISSIONS),
    metadataBytes: new Uint8Array(0),
    permissionBindings: new Uint8Array(0),
    sectionM,
  };
}

/** The xl/connections.xml body: one Mashup OLE DB connection (type 5) per query. */
export function connectionsXml(names: string[]): string {
  const conns = names.map((n, i) => {
    const e = xmlEsc(n);
    return `<connection id="${i + 1}" keepAlive="1" name="Query - ${e}" description="Connection to the '${e}' query in the workbook." type="5" refreshedVersion="0" background="1">` +
      `<dbPr connection="Provider=Microsoft.Mashup.OleDb.1;Data Source=$Workbook$;Location=${e};Extended Properties=&quot;&quot;" command="SELECT * FROM [${e}]"/></connection>`;
  }).join("");
  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\r\n<connections xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">${conns}</connections>`;
}

function addContentTypeOverride(entries: Record<string, Uint8Array>, partName: string, contentType: string): void {
  const path = "[Content_Types].xml";
  const bytes = entries[path];
  if (!bytes) return;
  let xml = decodeOoxmlText(bytes);
  if (xml.includes(`PartName="${partName}"`)) return;
  xml = xml.replace("</Types>", `<Override PartName="${partName}" ContentType="${contentType}"/></Types>`);
  entries[path] = enc(xml);
}

function addWorkbookRel(entries: Record<string, Uint8Array>, type: string, target: string): void {
  const path = "xl/_rels/workbook.xml.rels";
  let xml = entries[path] ? decodeOoxmlText(entries[path]!) : `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="${REL_NS}"></Relationships>`;
  if (xml.includes(`Target="${target}"`)) return;
  const ids = [...xml.matchAll(/Id="rId(\d+)"/g)].map((m) => Number(m[1]));
  const id = `rId${(ids.length ? Math.max(...ids) : 0) + 1}`;
  xml = xml.replace("</Relationships>", `<Relationship Id="${id}" Type="${type}" Target="${target}"/></Relationships>`);
  entries[path] = enc(xml);
}

/** Ensure xl/connections.xml (+ its content-type and workbook rel) lists exactly the current
    query names. A no-op key set when there are no queries. */
export function syncWorkbookQueryParts(entries: Record<string, Uint8Array>, sectionM: string): Record<string, Uint8Array> {
  const out = { ...entries };
  const names = queryNamesFromSectionM(sectionM);
  if (!names.length) return out;
  out["xl/connections.xml"] = enc(connectionsXml(names));
  addContentTypeOverride(out, "/xl/connections.xml", "application/vnd.openxmlformats-officedocument.spreadsheetml.connections+xml");
  addWorkbookRel(out, "http://schemas.openxmlformats.org/officeDocument/2006/relationships/connections", "connections.xml");
  return out;
}

/** Bootstrap a full Power Query payload into a workbook that has none: the DataMashup customXml
    item (+ itemProps + rels), the connections, and the content-type/rel registrations. `guid`
    is the datastore item id (mlang has no RNG; the caller supplies one). */
export function createWorkbookQueries(entries: Record<string, Uint8Array>, sectionM: string, guid?: string): Record<string, Uint8Array> {
  const payload = serializeDataMashup(buildDataMashup(sectionM));
  const itemXml = `<?xml version="1.0" encoding="utf-8"?><DataMashup xmlns="http://schemas.microsoft.com/DataMashup">${toBase64(payload)}</DataMashup>`;
  const g = guid ?? "{00000000-0000-0000-0000-000000000000}";
  const out = { ...entries };
  out["customXml/item1.xml"] = enc(itemXml);
  out["customXml/itemProps1.xml"] = enc(`<?xml version="1.0" encoding="UTF-8" standalone="no"?><ds:datastoreItem ds:itemID="${g}" xmlns:ds="${DS_NS}"><ds:schemaRefs><ds:schemaRef ds:uri="http://schemas.microsoft.com/DataMashup"/></ds:schemaRefs></ds:datastoreItem>`);
  out["customXml/_rels/item1.xml.rels"] = enc(`<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="${REL_NS}"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/customXmlProps" Target="itemProps1.xml"/></Relationships>`);
  addContentTypeOverride(out, "/customXml/itemProps1.xml", "application/vnd.openxmlformats-officedocument.customXmlProperties+xml");
  addWorkbookRel(out, "http://schemas.openxmlformats.org/officeDocument/2006/relationships/customXml", "../customXml/item1.xml");
  return syncWorkbookQueryParts(out, sectionM);
}
