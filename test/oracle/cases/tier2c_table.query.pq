[
    Dup = Table.DuplicateColumn(#table({"A", "B"}, {{1, 2}}), "A", "A2"),
    Reorder = Table.ReorderColumns(#table({"A", "B"}, {{1, 2}}), {"B", "A"}),
    Recs = Table.ToRecords(#table({"A"}, {{1}, {2}})),
    Inv = Function.Invoke((x, y) => x + y, {3, 4}),
    RT = Value.ReplaceType(42, type number)
]
