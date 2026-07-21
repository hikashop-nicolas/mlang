let
    Raw = Csv.Document("Name,Qty#(lf)Apples,10#(lf)Pears,4"),
    H = Table.PromoteHeaders(Raw),
    T = Table.TransformColumnTypes(H, {{"Qty", type number}})
in
    T
