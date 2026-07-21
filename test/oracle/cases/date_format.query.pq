[
    A = Date.ToText(#date(2021, 3, 7), "yyyy-MM-dd"),
    B = Date.ToText(#date(2021, 3, 7), "M/d/yy"),
    C = Date.ToText(#date(2021, 3, 7), "dddd, MMMM d, yyyy"),
    D = Date.ToText(#date(2021, 3, 7), "ddd MMM"),
    E = Time.ToText(#time(13, 5, 9), "HH:mm:ss"),
    F = Time.ToText(#time(13, 5, 9), "h:mm tt"),
    G = Time.ToText(#time(0, 30, 0), "h:mm tt"),
    H = DateTime.ToText(#datetime(2021, 3, 7, 13, 5, 9), "yyyy-MM-dd HH:mm:ss"),
    I = Date.ToText(#date(2021, 3, 7), "d"),
    J = DateTime.ToText(#datetime(2021, 3, 7, 13, 5, 9), "s")
]
