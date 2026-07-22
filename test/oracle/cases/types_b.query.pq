let
    T = Table.TransformColumnTypes(#table({"N", "S"}, {{"1", "x"}}), {{"N", Int64.Type}, {"S", type text}})
in
    [
        CotI = Table.ColumnsOfType(T, {Int64.Type}),
        CotT = Table.ColumnsOfType(T, {type text}),
        CotN = Table.ColumnsOfType(T, {type number}),
        CotAny = Table.ColumnsOfType(T, {type any})
    ]
