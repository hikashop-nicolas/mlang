Table.Group(#table({"Cat", "Val"}, {{"A", 10}, {"B", 3}, {"A", 7}}), "Cat", {{"Total", each List.Sum([Val])}, {"N", each Table.RowCount(_)}})
