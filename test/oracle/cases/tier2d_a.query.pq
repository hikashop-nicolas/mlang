[
    I1 = Int64.From(2.7), I2 = Int64.From(2.5), I3 = Int64.From(3.5),
    NFT = Number.FromText("1,234"),
    Prod = List.Product({2, 3, 4}),
    MinN = List.MinN({5, 1, 3, 2}, 2), MaxN = List.MaxN({5, 1, 3, 2}, 2),
    AnyT = List.AnyTrue({false, true}),
    Rem = Text.Remove("a-b.c", {"-", "."}),
    RecC = Record.Combine({[a = 1], [b = 2], [a = 9]}),
    RecFT = Record.FromTable(#table({"Name", "Value"}, {{"a", 1}, {"b", 2}})),
    DIM = Date.DaysInMonth(#date(2020, 2, 1)),
    AQ = Date.AddQuarters(#date(2021, 1, 15), 2),
    VFT = Value.FromText("42"),
    TTT = Type.ToText(type number)
]
