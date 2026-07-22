[
    ZH = DateTimeZone.ZoneHours(#datetimezone(2020, 1, 2, 3, 4, 5, -8, 0)),
    ZM = DateTimeZone.ZoneMinutes(#datetimezone(2020, 1, 2, 3, 4, 5, 5, 30)),
    RZ = DateTimeZone.RemoveZone(#datetimezone(2020, 1, 2, 3, 4, 5, -8, 0)),
    UTC = DateTimeZone.ToUtc(#datetimezone(2020, 1, 2, 3, 0, 0, -8, 0)),
    SW = DateTimeZone.SwitchZone(#datetimezone(2020, 1, 2, 3, 0, 0, 0, 0), 2),
    Sub = #datetimezone(2020, 1, 2, 10, 0, 0, 0, 0) - #datetimezone(2020, 1, 2, 3, 0, 0, -8, 0),
    Eq = #datetimezone(2020, 1, 2, 3, 0, 0, 0, 0) = #datetimezone(2020, 1, 2, 11, 0, 0, 8, 0),
    Gt = #datetimezone(2020, 1, 2, 3, 0, 0, 0, 0) > #datetimezone(2020, 1, 2, 3, 0, 0, 8, 0),
    Yr = Date.Year(#datetimezone(2020, 5, 6, 1, 2, 3, 2, 0)),
    Txt = Text.From(#datetimezone(2021, 3, 7, 13, 5, 9, -8, 0)),
    Num = Number.From(#datetimezone(2021, 1, 1, 0, 0, 0, 5, 0)),
    From = DateTimeZone.From("2020-01-02T03:04:05-08:00")
]
