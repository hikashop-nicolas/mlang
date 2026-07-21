// Binary.* over a real binary value kind (Uint8Array). The in-memory constructors are here;
// binary-producing CONNECTORS (File.Contents, Web.Contents, ...) are in scope too and arrive
// through host bindings - a host hands back a binary value the same way sheetedit hands back
// Excel.CurrentWorkbook - so they compose with these functions unchanged.
import type { Env } from "../interpret.js";
import { binary, err, number, text, type MValue } from "../values.js";
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
