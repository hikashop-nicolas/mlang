// Binary.* over a real binary value kind (Uint8Array). The in-memory constructors are here;
// binary-producing CONNECTORS (File.Contents, Web.Contents, ...) are in scope too and arrive
// through host bindings - a host hands back a binary value the same way sheetedit hands back
// Excel.CurrentWorkbook - so they compose with these functions unchanged.
import { deflateSync, gunzipSync, gzipSync, inflateSync } from "fflate";
import type { Env } from "../interpret.js";
import { binary, err, number, record, text, type MValue } from "../values.js";
import { fn, textOf } from "./helpers.js";

const b64ToBytes = (b64: string): Uint8Array => {
  const bin = atob(b64.replace(/\s+/g, ""));
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
};
const bytesToB64 = (bytes: Uint8Array): string => btoa(String.fromCharCode(...bytes));
const hexToBytes = (s: string): Uint8Array => {
  const clean = s.replace(/\s+/g, "");
  const out = new Uint8Array(clean.length / 2);
  for (let i = 0; i < out.length; i++) out[i] = parseInt(clean.substr(i * 2, 2), 16);
  return out;
};
const bytesToHex = (bytes: Uint8Array): string => Array.from(bytes, (b) => b.toString(16).padStart(2, "0")).join("");

/** Coerce a value to bytes: a binary passes through, text is UTF-8 encoded. */
export const toBytes = (v: MValue, who: string): Uint8Array => {
  if (v.kind === "binary") return v.bytes;
  if (v.kind === "text") return new TextEncoder().encode(v.value);
  err("Expression.Error", `${who}: expected a binary or text value.`);
};

export function registerBinary(env: Env): void {
  const def = (name: string, v: MValue): void => env.defineValue(name, v);

  // BinaryEncoding.* selectors (recognized by name in the functions below).
  def("BinaryEncoding.Base64", text("Base64"));
  def("BinaryEncoding.Hex", text("Hex"));

  def("Binary.FromText", fn("Binary.FromText", [{ name: "text" }, { name: "encoding", optional: true }], (a) => {
    const s = textOf(a[0]!, "Binary.FromText");
    return binary(encName(a[1]) === "Hex" ? hexToBytes(s) : b64ToBytes(s));
  }));
  def("Binary.ToText", fn("Binary.ToText", [{ name: "binary" }, { name: "encoding", optional: true }], (a) => {
    const bytes = toBytes(a[0]!, "Binary.ToText");
    return text(encName(a[1]) === "Hex" ? bytesToHex(bytes) : bytesToB64(bytes));
  }));
  def("Binary.Length", fn("Binary.Length", [{ name: "binary" }], (a) => number(toBytes(a[0]!, "Binary.Length").length)));
  def("Binary.ApproximateLength", fn("Binary.ApproximateLength", [{ name: "binary" }], (a) => number(toBytes(a[0]!, "Binary.ApproximateLength").length)));
  def("Binary.From", fn("Binary.From", [{ name: "value" }, { name: "encoding", optional: true }], (a) => {
    const v = a[0]!;
    if (v.kind === "binary") return v;
    if (v.kind === "text") return binary(encName(a[1]) === "Hex" ? hexToBytes(v.value) : v.value.match(/^[A-Za-z0-9+/=\s]+$/) ? b64ToBytes(v.value) : new TextEncoder().encode(v.value));
    if (v.kind === "list") return binary(Uint8Array.from(v.items.map((x) => (x.kind === "number" ? x.value & 0xff : 0))));
    err("Expression.Error", `Binary.From: cannot convert ${v.kind}.`);
  }));
  def("Binary.Combine", fn("Binary.Combine", [{ name: "binaries" }], (a) => {
    if (a[0]!.kind !== "list") err("Expression.Error", "Binary.Combine: expected a list.");
    const parts = a[0]!.items.map((v) => toBytes(v, "Binary.Combine"));
    const out = new Uint8Array(parts.reduce((n, p) => n + p.length, 0));
    let off = 0; for (const p of parts) { out.set(p, off); off += p.length; }
    return binary(out);
  }));
  def("Binary.Range", fn("Binary.Range", [{ name: "binary" }, { name: "offset" }, { name: "count", optional: true }], (a) => {
    const bytes = toBytes(a[0]!, "Binary.Range"); const off = a[1]!.kind === "number" ? a[1]!.value : 0;
    const end = a[2] && a[2].kind === "number" ? off + a[2].value : bytes.length;
    return binary(bytes.slice(off, end));
  }));
  def("Binary.Split", fn("Binary.Split", [{ name: "binary" }, { name: "pageSize" }], (a) => {
    const bytes = toBytes(a[0]!, "Binary.Split"); const size = Math.max(1, a[1]!.kind === "number" ? a[1]!.value : 1);
    const out: MValue[] = [];
    for (let i = 0; i < bytes.length; i += size) out.push(binary(bytes.slice(i, i + size)));
    return { kind: "list", items: out };
  }));
  // Best-effort MIME sniff by magic bytes; text detection falls back to text/plain.
  def("Binary.InferContentType", fn("Binary.InferContentType", [{ name: "source" }], (a) => {
    const b = toBytes(a[0]!, "Binary.InferContentType");
    const starts = (sig: number[]) => sig.every((v, i) => b[i] === v);
    let mime = "application/octet-stream";
    if (starts([0x25, 0x50, 0x44, 0x46])) mime = "application/pdf";
    else if (starts([0x50, 0x4b, 0x03, 0x04])) mime = "application/zip";
    else if (starts([0x89, 0x50, 0x4e, 0x47])) mime = "image/png";
    else if (starts([0xff, 0xd8, 0xff])) mime = "image/jpeg";
    else if (starts([0x47, 0x49, 0x46, 0x38])) mime = "image/gif";
    else if (b.slice(0, 512).every((c) => c === 9 || c === 10 || c === 13 || (c >= 32 && c < 127))) mime = "text/plain";
    return record([["Content.Type", text(mime)]]);
  }));
  def("Binary.FromList", fn("Binary.FromList", [{ name: "list" }], (a) => {
    if (a[0]!.kind !== "list") err("Expression.Error", "Binary.FromList: expected a list of byte values.");
    return binary(Uint8Array.from(a[0]!.items.map((v) => (v.kind === "number" ? v.value & 0xff : 0))));
  }));
  def("Binary.ToList", fn("Binary.ToList", [{ name: "binary" }], (a) => ({ kind: "list", items: Array.from(toBytes(a[0]!, "Binary.ToList"), (b) => number(b)) })));

  // Binary.Decompress(binary, compression): Compression.None(0)/GZip(1)/Deflate(2). Excel's
  // "Deflate" is raw DEFLATE (no zlib header), which fflate's inflateSync expects.
  def("Binary.Decompress", fn("Binary.Decompress", [{ name: "binary" }, { name: "compressionType" }], (a) => {
    const bytes = toBytes(a[0]!, "Binary.Decompress");
    const c = a[1]!.kind === "number" ? a[1]!.value : 2;
    if (c === 0) return binary(bytes);
    if (c === 1) return binary(gunzipSync(bytes));
    if (c === 2) return binary(inflateSync(bytes));
    err("Expression.Error", `Binary.Decompress: unsupported compression ${c}.`);
  }));
  // Binary.Compress(binary, compression): inverse of Binary.Decompress. Deflate is raw
  // DEFLATE (fflate deflateSync, no zlib header), matching what inflateSync above consumes.
  def("Binary.Compress", fn("Binary.Compress", [{ name: "binary" }, { name: "compressionType" }], (a) => {
    const bytes = toBytes(a[0]!, "Binary.Compress");
    const c = a[1]!.kind === "number" ? a[1]!.value : 2;
    if (c === 0) return binary(bytes);
    if (c === 1) return binary(gzipSync(bytes));
    if (c === 2) return binary(deflateSync(bytes));
    err("Expression.Error", `Binary.Compress: unsupported compression ${c}.`);
  }));

  // Text <-> Binary treat the bytes as encoded text (UTF-8 by default).
  def("Text.FromBinary", fn("Text.FromBinary", [{ name: "binary" }, { name: "encoding", optional: true }], (a) =>
    text(new TextDecoder(textEncoding(a[1])).decode(toBytes(a[0]!, "Text.FromBinary")))));
  def("Text.ToBinary", fn("Text.ToBinary", [{ name: "text" }, { name: "encoding", optional: true }], (a) =>
    binary(new TextEncoder().encode(textOf(a[0]!, "Text.ToBinary")))));
}

function encName(v: MValue | undefined): "Base64" | "Hex" {
  if (!v || v.kind === "null") return "Base64";
  if (v.kind === "text") return v.value === "Hex" ? "Hex" : "Base64";
  err("Expression.Error", "Binary: unsupported encoding argument.");
}

// TextEncoding.* is passed as a number by the reference; Tier-1 supports UTF-8 only.
function textEncoding(v: MValue | undefined): string {
  if (!v || v.kind === "null") return "utf-8";
  err("Expression.Error", "Text.FromBinary: only UTF-8 (the default) is supported yet.");
}
