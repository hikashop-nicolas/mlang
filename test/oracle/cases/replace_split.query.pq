[
    R = Table.ReplaceValue(#table({"A"}, {{"cat"}, {"catalog"}}), "cat", "dog", Replacer.ReplaceText, {"A"}),
    S = Table.SplitColumn(#table({"N"}, {{"a-b"}, {"c"}}), "N", Splitter.SplitTextByDelimiter("-"), {"N.1", "N.2"})
]
