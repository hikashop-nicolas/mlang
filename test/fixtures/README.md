# Real-world fixtures

- `msft-simple-query.xlsx` - the SIMPLE_QUERY_WORKBOOK_TEMPLATE embedded in
  [microsoft/connected-workbooks](https://github.com/microsoft/connected-workbooks)
  (MIT license, Microsoft Corporation), decoded from src/workbookTemplate.ts. A real
  Excel-toolchain workbook whose DataMashup customXml item is UTF-16 LE encoded - the
  encoding detail our first synthetic fixtures missed.

- `pqnet-calendar.xlsx` - a real Power Query workbook from
  [gsimardnet/PowerQueryNet](https://github.com/gsimardnet/PowerQueryNet) (MIT). Its queries
  exercise real-world M: List.Dates over 10000 rows, a #table built from a deflate-compressed
  base64 blob (Binary.Decompress + Json.Document) with a `type table [...] meta` column spec,
  Int64.Type ascription, Date.DayOfWeekName, and a NestedJoin+Expand. Guards the engine
  against genuine authored queries, not just synthetic ones.
