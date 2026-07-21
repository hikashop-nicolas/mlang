[
    T1 = Text.Trim("xxhixx", "x"), T2 = Text.Contains("Hello", "hello", Comparer.OrdinalIgnoreCase),
    T3 = Text.PositionOf("banana", "an"), T4 = Text.PositionOf("banana", "an", Occurrence.Last),
    T5 = Text.PositionOf("banana", "an", Occurrence.All), T6 = Text.Combine({"a", null, "b"}, "-"),
    T7 = Text.Proper("john von neumann"), T8 = Text.Middle("hello", 1, 3), T9 = Text.PadStart("7", 3, "0")
]
