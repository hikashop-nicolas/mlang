[
    Y = Date.Year(#date(2021, 5, 4)),
    AddM = Date.AddMonths(#date(2021, 1, 31), 1),
    AddML = Date.AddMonths(#date(2020, 1, 31), 1),
    AddY = Date.AddYears(#date(2020, 2, 29), 1),
    Dow = Date.DayOfWeek(#date(2026, 7, 21)),
    DowM = Date.DayOfWeek(#date(2026, 7, 21), Day.Monday),
    Doy = Date.DayOfYear(#date(2021, 2, 1)),
    Som = Date.StartOfMonth(#date(2021, 5, 20)),
    Eom = Date.EndOfMonth(#date(2021, 2, 5)),
    EomDT = Date.EndOfMonth(#datetime(2021, 2, 5, 6, 30, 0)),
    SomDT = Date.StartOfMonth(#datetime(2021, 5, 20, 6, 30, 0)),
    FromSerial = Date.From(44197),
    FromIso = Date.From("2021-01-31"),
    FromUs = Date.From("1/31/2021"),
    DTFrom = DateTime.From(44197.5)
]
