// BinaryFormat.*: a small binary-reader DSL. A "binary format" is a callable value that reads
// a binary from offset 0 and returns the parsed value; the combinators compose these. Each
// format also carries an internal reader (bytes, offset) -> { value, offset } (via a WeakMap)
// so composites can chain while advancing position. Integer formats default to BIG-endian.
import type { Env } from "../interpret.js";
import { NULL, binary, err, list, number, record, text, type MFunction, type MValue } from "../values.js";
import { fn } from "./helpers.js";
import { toBytes } from "./binary.js";

interface ReadResult { value: MValue; offset: number }
type Reader = (bytes: Uint8Array, offset: number) => ReadResult;

const readers = new WeakMap<object, Reader>();
const intRebuild = new WeakMap<object, (little: boolean) => MFunction>(); // for ByteOrder

/** Wrap a reader as a callable binary-format value. */
function format(name: string, reader: Reader): MFunction {
  const f: MFunction = { kind: "function", name, params: [{ name: "binary", optional: false }], call: (a) => reader(toBytes(a[0]!, name), 0).value };
  readers.set(f, reader);
  return f;
}

function readerOf(v: MValue | undefined, who: string): Reader {
  if (v && v.kind === "function" && readers.has(v)) return readers.get(v)!;
  err("Expression.Error", `${who}: expected a binary format value.`);
}

const need = (bytes: Uint8Array, offset: number, n: number, who: string): void => {
  if (offset + n > bytes.length) err("Expression.Error", `${who}: unexpected end of binary.`);
};

function readUint(bytes: Uint8Array, offset: number, size: number, little: boolean): number {
  let v = 0n;
  for (let i = 0; i < size; i++) v += BigInt(bytes[offset + (little ? i : size - 1 - i)]!) << BigInt(8 * i);
  return Number(v);
}
function readInt(bytes: Uint8Array, offset: number, size: number, little: boolean): number {
  const u = readUint(bytes, offset, size, little);
  const max = 2 ** (size * 8);
  return u >= max / 2 ? u - max : u;
}

/** An integer format that can be re-oriented by BinaryFormat.ByteOrder. */
function intFormat(name: string, size: number, signed: boolean): MFunction {
  const build = (little: boolean): MFunction => {
    const reader: Reader = (bytes, offset) => {
      need(bytes, offset, size, name);
      return { value: number((signed ? readInt : readUint)(bytes, offset, size, little)), offset: offset + size };
    };
    const f = format(name, reader);
    intRebuild.set(f, build);
    return f;
  };
  return build(false); // big-endian by default (oracle-confirmed)
}

export function registerBinaryFormat(env: Env): void {
  const def = (name: string, v: MValue): void => env.defineValue(name, v);

  // BinaryFormat.Null: consumes no bytes and yields null (used as a placeholder branch).
  def("BinaryFormat.Null", format("BinaryFormat.Null", (_bytes, offset) => ({ value: NULL, offset })));

  // Fixed-size integer formats (value formats, little-endian by default).
  def("BinaryFormat.Byte", intFormat("BinaryFormat.Byte", 1, false));
  def("BinaryFormat.UnsignedInteger8", intFormat("BinaryFormat.UnsignedInteger8", 1, false));
  def("BinaryFormat.SignedInteger8", intFormat("BinaryFormat.SignedInteger8", 1, true));
  def("BinaryFormat.UnsignedInteger16", intFormat("BinaryFormat.UnsignedInteger16", 2, false));
  def("BinaryFormat.SignedInteger16", intFormat("BinaryFormat.SignedInteger16", 2, true));
  def("BinaryFormat.UnsignedInteger32", intFormat("BinaryFormat.UnsignedInteger32", 4, false));
  def("BinaryFormat.SignedInteger32", intFormat("BinaryFormat.SignedInteger32", 4, true));
  def("BinaryFormat.UnsignedInteger64", intFormat("BinaryFormat.UnsignedInteger64", 8, false));
  def("BinaryFormat.SignedInteger64", intFormat("BinaryFormat.SignedInteger64", 8, true));

  // IEEE floats (little-endian, matching .NET BinaryReader) and .NET 16-byte decimal.
  def("BinaryFormat.Single", format("BinaryFormat.Single", (bytes, offset) => {
    need(bytes, offset, 4, "BinaryFormat.Single");
    return { value: number(new DataView(bytes.buffer, bytes.byteOffset + offset, 4).getFloat32(0, true)), offset: offset + 4 };
  }));
  def("BinaryFormat.Double", format("BinaryFormat.Double", (bytes, offset) => {
    need(bytes, offset, 8, "BinaryFormat.Double");
    return { value: number(new DataView(bytes.buffer, bytes.byteOffset + offset, 8).getFloat64(0, true)), offset: offset + 8 };
  }));
  def("BinaryFormat.Decimal", format("BinaryFormat.Decimal", (bytes, offset) => {
    need(bytes, offset, 16, "BinaryFormat.Decimal");
    const dv = new DataView(bytes.buffer, bytes.byteOffset + offset, 16);
    const lo = dv.getUint32(0, true), mid = dv.getUint32(4, true), hi = dv.getUint32(8, true), flags = dv.getUint32(12, true);
    const scale = (flags >> 16) & 0xff; const neg = (flags & 0x80000000) !== 0;
    const mant = Number((BigInt(hi) << 64n) | (BigInt(mid) << 32n) | BigInt(lo));
    return { value: number((neg ? -mant : mant) / 10 ** scale), offset: offset + 16 };
  }));
  // 7-bit variable-length ("LEB128"-style) integers.
  const read7bit = (signed: boolean): MFunction => format(signed ? "BinaryFormat.7BitEncodedSignedInteger" : "BinaryFormat.7BitEncodedUnsignedInteger", (bytes, offset) => {
    let result = 0n, shift = 0n, i = offset, byte: number;
    do { byte = bytes[i] ?? err("Expression.Error", "7BitEncodedInteger: unexpected end of binary") as never; result |= BigInt(byte & 0x7f) << shift; shift += 7n; i++; } while (byte & 0x80);
    let v = result;
    if (signed && (v & (1n << (shift - 1n)))) v -= 1n << shift; // sign-extend
    return { value: number(Number(v)), offset: i };
  });
  def("BinaryFormat.7BitEncodedUnsignedInteger", read7bit(false));
  def("BinaryFormat.7BitEncodedSignedInteger", read7bit(true));
  // Group: reads key-prefixed items until end of data, returns the list of item values.
  def("BinaryFormat.Group", fn("BinaryFormat.Group", [{ name: "keyFormat" }, { name: "itemFormat" }], (a) => {
    const keyR = readerOf(a[0]!, "BinaryFormat.Group key"); const itemR = readerOf(a[1]!, "BinaryFormat.Group item");
    return format("BinaryFormat.Group", (bytes, offset) => {
      const out: MValue[] = []; let o = offset;
      while (o < bytes.length) { const k = keyR(bytes, o); const it = itemR(bytes, k.offset); out.push(it.value); o = it.offset; }
      return { value: { kind: "list", items: out }, offset: o };
    });
  }));

  def("BinaryFormat.ByteOrder", fn("BinaryFormat.ByteOrder", [{ name: "binaryFormat" }, { name: "byteOrder" }], (a) => {
    const little = a[1]!.kind === "number" && a[1]!.value === 1; // ByteOrder.LittleEndian = 1
    const rebuild = a[0]!.kind === "function" ? intRebuild.get(a[0]!) : undefined;
    if (!rebuild) err("Expression.Error", "BinaryFormat.ByteOrder: only integer formats can be re-oriented.");
    return rebuild(little);
  }));

  def("BinaryFormat.Binary", fn("BinaryFormat.Binary", [{ name: "length", optional: true }], (a) =>
    format("BinaryFormat.Binary", (bytes, offset) => {
      const len = a[0] && a[0].kind === "number" ? a[0].value : bytes.length - offset;
      need(bytes, offset, len, "BinaryFormat.Binary");
      return { value: binary(bytes.slice(offset, offset + len)), offset: offset + len };
    })));

  def("BinaryFormat.Text", fn("BinaryFormat.Text", [{ name: "lengthOrDelimiter" }], (a) => {
    if (a[0]!.kind !== "number") err("Expression.Error", "BinaryFormat.Text: only a byte count is supported.");
    const len = a[0]!.value;
    return format("BinaryFormat.Text", (bytes, offset) => {
      need(bytes, offset, len, "BinaryFormat.Text");
      return { value: text(new TextDecoder("utf-8").decode(bytes.subarray(offset, offset + len))), offset: offset + len };
    });
  }));

  def("BinaryFormat.List", fn("BinaryFormat.List", [{ name: "binaryFormat" }, { name: "countOrCondition", optional: true }], (a) => {
    const elem = readerOf(a[0], "BinaryFormat.List");
    return format("BinaryFormat.List", (bytes, offset) => {
      const items: MValue[] = [];
      let off = offset;
      if (a[1] && a[1].kind === "number") {
        for (let i = 0; i < a[1].value; i++) {
          const r = elem(bytes, off);
          items.push(r.value);
          off = r.offset;
        }
      } else {
        while (off < bytes.length) {
          const r = elem(bytes, off);
          items.push(r.value);
          off = r.offset;
        }
      }
      return { value: list(items), offset: off };
    });
  }));

  def("BinaryFormat.Record", fn("BinaryFormat.Record", [{ name: "record" }], (a) => {
    if (a[0]!.kind !== "record") err("Expression.Error", "BinaryFormat.Record: expected a record of formats.");
    const fields = [...a[0]!.fields].map(([k, v]) => [k, readerOf(v, "BinaryFormat.Record")] as const);
    return format("BinaryFormat.Record", (bytes, offset) => {
      let off = offset;
      const out: [string, MValue][] = [];
      for (const [k, r] of fields) {
        const res = r(bytes, off);
        out.push([k, res.value]);
        off = res.offset;
      }
      return { value: record(out), offset: off };
    });
  }));

  def("BinaryFormat.Transform", fn("BinaryFormat.Transform", [{ name: "binaryFormat" }, { name: "function" }], (a) => {
    const r = readerOf(a[0], "BinaryFormat.Transform");
    if (a[1]!.kind !== "function") err("Expression.Error", "BinaryFormat.Transform: second argument must be a function.");
    const f = a[1]!;
    return format("BinaryFormat.Transform", (bytes, offset) => {
      const res = r(bytes, offset);
      return { value: f.call([res.value]), offset: res.offset };
    });
  }));

  def("BinaryFormat.Choice", fn("BinaryFormat.Choice", [{ name: "binaryFormat" }, { name: "chooseFunction" }, { name: "type", optional: true }, { name: "combineFn", optional: true }], (a) => {
    const selR = readerOf(a[0], "BinaryFormat.Choice");
    if (a[1]!.kind !== "function") err("Expression.Error", "BinaryFormat.Choice: chooseFunction must be a function.");
    const choose = a[1]!;
    return format("BinaryFormat.Choice", (bytes, offset) => {
      const sel = selR(bytes, offset);
      const chosen = readerOf(choose.call([sel.value]), "BinaryFormat.Choice");
      return chosen(bytes, sel.offset);
    });
  }));

  def("BinaryFormat.Length", fn("BinaryFormat.Length", [{ name: "binaryFormat" }, { name: "length" }], (a) => {
    const r = readerOf(a[0], "BinaryFormat.Length");
    return format("BinaryFormat.Length", (bytes, offset) => {
      const limit = a[1]!.kind === "number" ? offset + a[1]!.value : bytes.length;
      const res = r(bytes.subarray(0, Math.min(limit, bytes.length)), offset);
      return { value: res.value, offset: limit };
    });
  }));
}
