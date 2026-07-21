[
    Obj = Json.Document("{""a"": 1, ""b"": [2, 3], ""c"": null}"),
    Arr = Json.Document("[true, false]"),
    Scalar = Json.Document("42"),
    Recs = Table.FromRecords(Json.Document("[{""n"": ""a"", ""v"": 1}, {""n"": ""b"", ""v"": 2}]"))
]
