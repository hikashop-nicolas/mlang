[
    D = Table.Distinct(#table({"A", "B"}, {{1, "x"}, {1, "y"}, {1, "x"}}), "A"),
    C = Table.Combine({#table({"A"}, {{1}}), #table({"B"}, {{2}})})
]
