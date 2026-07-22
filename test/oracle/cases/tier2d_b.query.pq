[
    Trans = Table.Transpose(#table({"A", "B"}, {{1, 2}, {3, 4}})),
    ExpL = Table.ExpandListColumn(#table({"K", "L"}, {{1, {10, 20}}}), "L"),
    Comb = Table.CombineColumns(#table({"A", "B", "C"}, {{"x", "y", 1}}), {"A", "B"}, Combiner.CombineTextByDelimiter("-"), "AB"),
    TR = Table.TransformRows(#table({"A"}, {{1}, {2}}), each [A] * 10)
]
