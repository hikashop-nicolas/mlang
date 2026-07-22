[
    Diff = List.Difference({1, 2, 3, 4}, {2, 4}),
    RemI = List.RemoveItems({1, 2, 2, 3}, {2}),
    Uni = List.Union({{1, 2}, {2, 3}}),
    Int = List.Intersect({{1, 2, 3}, {2, 3, 4}}),
    Rep = List.ReplaceMatchingItems({1, 2, 3}, {{2, 20}}),
    Alt1 = List.Alternate({1, 2, 3, 4, 5, 6}, 1),
    Alt2 = List.Alternate({1, 2, 3, 4, 5, 6}, 2, 1),
    Empty = List.IsEmpty({}),
    ToList = Text.ToList("abc"),
    SplitAny = Text.SplitAny("a,b;c", ",;")
]
