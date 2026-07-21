[
    T1 = Date.ToText(#date(2021, 1, 31)),
    T2 = Time.ToText(#time(6, 5, 4)),
    T3 = DateTime.ToText(#datetime(2021, 1, 31, 6, 5, 4)),
    T4 = Text.From(#date(2021, 1, 31)),
    N1 = Number.From(#date(2021, 1, 1)),
    N2 = Number.From(#duration(1, 12, 0, 0))
]
