import { describe, expect, it } from "vitest";
import { evaluate, toJS } from "./index.js";

// bytes 01 02 03 04
const B = `Binary.FromText("${Buffer.from([1, 2, 3, 4]).toString("base64")}")`;
const js = async (m: string): Promise<unknown> => toJS(await evaluate(m));

describe("BinaryFormat.*", () => {
  it("integer formats (big-endian default)", async () => {
    expect(await js(`BinaryFormat.Byte(${B})`)).toBe(1);
    expect(await js(`BinaryFormat.UnsignedInteger16(${B})`)).toBe(258); // big-endian default
    expect(await js(`BinaryFormat.UnsignedInteger32(${B})`)).toBe(16909060);
  });

  it("ByteOrder.LittleEndian re-orients an integer format", async () => {
    expect(await js(`BinaryFormat.ByteOrder(BinaryFormat.UnsignedInteger16, ByteOrder.LittleEndian)(${B})`)).toBe(513); // 0x0201
    expect(await js(`BinaryFormat.ByteOrder(BinaryFormat.UnsignedInteger16, ByteOrder.BigEndian)(${B})`)).toBe(258); // 0x0102
  });

  it("List (full and counted)", async () => {
    expect(await js(`BinaryFormat.List(BinaryFormat.Byte)(${B})`)).toEqual([1, 2, 3, 4]);
    expect(await js(`BinaryFormat.List(BinaryFormat.UnsignedInteger16, 2)(${B})`)).toEqual([258, 772]);
  });

  it("Record reads fields in order", async () => {
    expect(await js(`BinaryFormat.Record([a = BinaryFormat.Byte, b = BinaryFormat.UnsignedInteger16])(${B})`)).toEqual({ a: 1, b: 515 });
  });

  it("Transform / Binary / Text", async () => {
    expect(await js(`BinaryFormat.Transform(BinaryFormat.Byte, each _ * 10)(${B})`)).toBe(10);
    expect(await js(`Binary.ToText(BinaryFormat.Binary(2)(${B}))`)).toBe(Buffer.from([1, 2]).toString("base64"));
    const txtB = `Binary.FromText("${Buffer.from("hi").toString("base64")}")`;
    expect(await js(`BinaryFormat.Text(2)(${txtB})`)).toBe("hi");
  });

  it("Choice reads a selector then the chosen format", async () => {
    // first byte 1 -> read a UInt16 next; the record wraps for clarity
    const m = `BinaryFormat.Choice(BinaryFormat.Byte, each if _ = 1 then BinaryFormat.UnsignedInteger16 else BinaryFormat.Byte)(${B})`;
    expect(await js(m)).toBe(515); // bytes 02 03 as big-endian UInt16
  });
});
