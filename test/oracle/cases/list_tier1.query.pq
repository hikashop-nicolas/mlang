[
    L1 = List.Average({1, 2, 3}), L2 = List.Sort({3, 1, 2}, Order.Descending),
    L3 = List.PositionOf({"a", "b"}, "z"), L4 = List.Zip({{1, 2}, {"a", "b"}}),
    L5 = List.Accumulate({1, 2, 3}, 0, (s, x) => s + x), L6 = List.Numbers(5, 3),
    L7 = List.Distinct({1, 2, 1}), L8 = List.RemoveNulls({1, null, 2})
]
