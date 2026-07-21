[
    Comb = List.Combine({{1, 2}, {3}, {4, 5}}),
    Med = List.Median({4, 1, 2, 3}),
    Stdev = List.StandardDeviation({2, 4, 4, 4, 5, 5, 7, 9}),
    Before = Text.BeforeDelimiter("a-b-c", "-"),
    After2 = Text.AfterDelimiter("a-b-c", "-", 1),
    Between = Text.BetweenDelimiters("[x] [y]", "[", "]"),
    Sel = Text.Select("a1b2c3", {"0".."9"}),
    Chr = Character.FromNumber(65),
    Cnum = Character.ToNumber("A"),
    RecFL = Record.FromList({1, 2}, {"a", "b"}),
    RecFV = Record.FieldValues([a = 1, b = 2])
]
