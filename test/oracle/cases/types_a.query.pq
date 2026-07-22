[
    Is1 = 1 is number, Is2 = "x" is number, Is3 = null is number, Is4 = null is nullable number, Is5 = 1 is any,
    TI1 = Type.Is(type number, type any), TI2 = Type.Is(type number, type text), TI3 = Type.Is(type number, type number),
    TN1 = Type.IsNullable(type nullable number), TN2 = Type.IsNullable(type number),
    VI1 = Value.Is(3, type number), VI2 = Value.Is(3, Int64.Type), VI3 = Value.Is("x", type number)
]
