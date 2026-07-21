[
    I = Table.AddIndexColumn(#table({"A"}, {{10}, {20}}), "Idx", 1, 1),
    D = Table.DemoteHeaders(#table({"A", "B"}, {{1, 2}}))
]
