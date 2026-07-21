let
    _t = ((type text) meta [Serialized.Text = true]),
    T = #table(type table [Year = _t, #"NY Date" = _t], {{"2019", "2019-02-05"}})
in
    T
