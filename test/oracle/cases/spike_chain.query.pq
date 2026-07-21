let
    Source = #table({"Product", "Qty", "Price"}, {{"Apples", "10", "2.5"}, {"Pears", "4", "3"}, {"Cherries", "20", "5"}}),
    Typed = Table.TransformColumnTypes(Source, {{"Qty", type number}, {"Price", type number}}),
    Filtered = Table.SelectRows(Typed, each [Qty] > 5),
    Renamed = Table.RenameColumns(Filtered, {{"Qty", "Quantity"}}),
    WithTotal = Table.AddColumn(Renamed, "Total", each [Quantity] * [Price]),
    Sorted = Table.Sort(WithTotal, {{"Total", Order.Descending}})
in
    Sorted
