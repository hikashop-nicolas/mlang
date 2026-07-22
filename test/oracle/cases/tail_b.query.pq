[
    Rep = List.Repeat({1, 2}, 3), Pos = List.Positions({7, 8, 9}), Sing = List.Single({5}),
    RToL = Record.ToList([a = 1, b = 2]), RRen = Record.RenameFields([a = 1, b = 2], {{"a", "x"}}),
    RTr = Record.TransformFields([a = 1, b = 2], {{"a", each _ * 10}}),
    BToL = Binary.ToList(Binary.FromText("aGk=", BinaryEncoding.Base64)),
    TRep = Table.Repeat(#table({"A"}, {{1}}), 3),
    TSplit = List.Count(Table.Split(#table({"A"}, {{1}, {2}, {3}}), 2))
]
