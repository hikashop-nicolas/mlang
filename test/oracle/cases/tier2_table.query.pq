[
    Num = #table(2, {{1, "a"}, {2, "b"}}),
    Dates = List.Dates(#date(2018, 1, 1), 3, #duration(1, 0, 0, 0)),
    DoW = Date.DayOfWeekName(#date(2018, 1, 1)),
    Mon = Date.MonthName(#date(2018, 3, 1)),
    Int64 = Table.TransformColumnTypes(#table({"N"}, {{"42"}}), {{"N", Int64.Type}}),
    Nothing = Table.FromList({"a", "b"}, Splitter.SplitByNothing(), null, null, ExtraValues.Error),
    Meta = 1 meta [note = "hi"]
]
