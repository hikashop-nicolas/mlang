let
    T = Table.TransformColumnTypes(#table({"D", "V"}, {{44256, 2}, {44197, 1}}), {{"D", type date}}),
    S = Table.Sort(T, {"D"}),
    G = Table.AddColumn(S, "Y", each Date.Year([D]))
in
    G
