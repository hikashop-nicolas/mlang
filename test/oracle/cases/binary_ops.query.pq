[
    T1 = Text.FromBinary(Binary.FromText("aGVsbG8=")),
    T2 = Binary.ToText(Text.ToBinary("hi")),
    T3 = Binary.ToText(Text.ToBinary("hi"), BinaryEncoding.Hex),
    Len = Binary.Length(Text.ToBinary("hello")),
    Csv = Csv.Document(Binary.FromText("YSxiCjEsMg=="))
]
