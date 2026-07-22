[
    FrShortDate = Date.ToText(#date(2026, 7, 22), "d", "fr-FR"),
    FrLongDate = Date.ToText(#date(2026, 7, 22), "D", "fr-FR"),
    FrCustom = Date.ToText(#date(2026, 7, 22), "dd MMMM yyyy", "fr-FR"),
    FrMonth = Date.MonthName(#date(2026, 7, 22), "fr-FR"),
    JaMonth = Date.MonthName(#date(2026, 7, 22), "ja-JP"),
    FrDay = Date.DayOfWeekName(#date(2026, 7, 22), "fr-FR"),
    DeNumber = Number.ToText(1234.5, "N2", "de-DE"),
    DePercent = Number.ToText(0.1265, "P2", "de-DE"),
    UsUnchanged = Date.ToText(#date(2026, 7, 22), "d", "en-US"),
    NoCultureUs = Number.ToText(1234.5, "N2")
]
