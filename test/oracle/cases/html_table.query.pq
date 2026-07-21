let
    Raw = Html.Table("<table><tr><th>Name</th><th>Qty</th></tr><tr><td>Apples</td><td>10</td></tr><tr><td>Pears</td><td>4</td></tr></table>", {{"Name", "TD:nth-child(1)"}, {"Qty", "TD:nth-child(2)"}}),
    NoHeader = Table.Skip(Raw, 1),
    Typed = Table.TransformColumnTypes(NoHeader, {{"Qty", type number}})
in
    Typed
