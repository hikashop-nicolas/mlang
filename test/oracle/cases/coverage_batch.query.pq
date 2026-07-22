let
    Query = [
        Lines = Lines.FromBinary(Text.ToBinary("a" & Character.FromNumber(10) & "b")),
        Uri = Uri.BuildQueryString([a = "1", b = "x y"]),
        Escape = Uri.EscapeDataString("a b!"),
        Pi = Number.Round(Number.PI, 4),
        Even = Number.IsEven(4),
        Odd = Number.IsOdd(7),
        Byte = Byte.From("255"),
        Pct = Percentage.From("50%"),
        DateFrom = Date.FromText("2021-03-14"),
        Leap = Date.IsLeapYear(2020),
        NotLeap = Date.IsLeapYear(2021),
        ContainsAll = List.ContainsAll({1, 2, 3}, {1, 3}),
        ContainsAny = List.ContainsAny({1, 2}, {4, 2}),
        Split = List.Split({1, 2, 3, 4, 5}, 2),
        RemoveFirst = List.RemoveFirstN({1, 2, 3}, 2),
        RemoveLast = List.RemoveLastN({1, 2, 3}, 2),
        TableDistinct = Table.IsDistinct(#table({"A"}, {{1}, {2}})),
        TableDup = Table.IsDistinct(#table({"A"}, {{1}, {1}})),
        Single = Table.SingleRow(#table({"A"}, {{7}})),
        Add = Value.Add(2, 3),
        Div = Value.Divide(10, 4),
        DivNull = Value.Divide(1, null),
        Cmp = Value.Compare(1, 2),
        RepeatedLengths = Splitter.SplitTextByRepeatedLengths({2})("aabbcc")
    ]
in
    Query
