let
    B = Binary.FromText("AQIDBA==", BinaryEncoding.Base64)
in
    [
        Byte = BinaryFormat.Byte(B),
        U16 = BinaryFormat.UnsignedInteger16(B),
        U32 = BinaryFormat.UnsignedInteger32(B),
        BE16 = BinaryFormat.ByteOrder(BinaryFormat.UnsignedInteger16, ByteOrder.BigEndian)(B),
        ListAll = BinaryFormat.List(BinaryFormat.Byte)(B),
        List2 = BinaryFormat.List(BinaryFormat.UnsignedInteger16, 2)(B),
        Rec = BinaryFormat.Record([a = BinaryFormat.Byte, b = BinaryFormat.UnsignedInteger16])(B),
        Trans = BinaryFormat.Transform(BinaryFormat.Byte, each _ * 10)(B),
        Choice = BinaryFormat.Choice(BinaryFormat.Byte, each if _ = 1 then BinaryFormat.UnsignedInteger16 else BinaryFormat.Byte)(B)
    ]
