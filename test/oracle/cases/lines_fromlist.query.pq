[
    L = Lines.FromText("a#(lf)b#(lf)"),
    FC = Table.FromColumns({{1, 2}, {"a", "b"}}, {"N", "L"}),
    FL = Table.FromList({"a-1", "b-2"}, Splitter.SplitTextByDelimiter("-"), {"K", "V"})
]
