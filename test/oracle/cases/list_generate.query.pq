[
    Simple = List.Generate(() => 1, each _ <= 5, each _ + 1),
    Rec = List.Generate(() => [i = 0, acc = 0], each [i] < 3, each [i = [i] + 1, acc = [acc] + [i]], each [acc]),
    IsNum = Value.Is(3, type number),
    IsNotNum = Value.Is("x", type number)
]
