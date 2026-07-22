[
    A = Expression.Evaluate("1 + 2 * 3"),
    B = Expression.Evaluate("Text.Upper(""hi"")"),
    C = Expression.Evaluate("x * 10", [x = 5]),
    D = Expression.Evaluate("let a = 2 in a + 3"),
    E = Expression.Evaluate("a + b", [a = 1, b = 2]) + Expression.Evaluate("10"),
    F = Expression.Evaluate("Table.RowCount(#table({""A""}, {{1}, {2}}))")
]
