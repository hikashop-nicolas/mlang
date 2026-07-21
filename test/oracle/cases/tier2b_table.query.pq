[
    Col = Table.Column(#table({"A", "B"}, {{1, "x"}, {2, "y"}}), "A"),
    Ren = Table.TransformColumnNames(#table({"A", "B"}, {{1, 2}}), Text.Lower),
    Pre = Table.PrefixColumns(#table({"A"}, {{1}}), "T"),
    FromV = Table.FromValue({10, 20}),
    Exp = Table.ExpandRecordColumn(#table({"K", "R"}, {{1, [a = 10, b = 20]}}), "R", {"a", "b"}),
    Joined = Table.Join(#table({"K", "V"}, {{1, "a"}, {2, "b"}}), "K", #table({"K", "W"}, {{1, "x"}}), "K", JoinKind.LeftOuter)
]
