let
    T = Table.AddColumn(#table({"A"}, {{"1"}, {"x"}, {"3"}}), "N", each Number.FromText([A]))
in
    [
        RemoveN = Table.RowCount(Table.RemoveRowsWithErrors(T)),
        RemoveVals = Table.Column(Table.RemoveRowsWithErrors(T), "N"),
        SelectN = Table.RowCount(Table.SelectRowsWithErrors(T)),
        SelectA = Table.Column(Table.SelectRowsWithErrors(T), "A"),
        Replaced = Table.Column(Table.ReplaceErrorValues(T, {{"N", -1}}), "N"),
        Caught = try T{1}[N] otherwise "caught",
        Good = T{0}[N]
    ]
