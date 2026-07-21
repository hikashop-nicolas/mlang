Table.TransformColumnTypes(
    Xml.Tables("<data><row><n>a</n><v>1</v></row><row><n>b</n><v>2</v></row></data>"){0}[Table],
    {{"v", type number}}
)
