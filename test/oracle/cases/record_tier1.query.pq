[
    R1 = Record.FieldNames([A = 1, B = 2]), R2 = Record.FieldOrDefault([A = 1], "B", 9),
    R3 = Record.AddField([A = 1], "B", 2), R4 = Record.RemoveFields([A = 1, B = 2], "A"),
    R5 = Record.ToTable([A = 1])
]
