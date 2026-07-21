let
    Orders = #table({"ID", "Cust"}, {{1, "a"}, {2, "b"}, {3, "c"}}),
    Names = #table({"Cust", "Name"}, {{"a", "Alice"}, {"b", "Bob"}}),
    J = Table.NestedJoin(Orders, "Cust", Names, "Cust", "N"),
    E = Table.ExpandTableColumn(J, "N", {"Name"})
in
    E
