# Power Query bootstrap: create queries in a workbook that has none

Goal: let a user author the first Power Query in an empty (or query-less) xlsx and save it, so the
query round-trips and (full version) shows up in Excel's Queries pane and refreshes natively.

Today `writeWorkbookSectionM(entries, m)` throws `"workbook has no Power Query payload to edit"`
when there is no existing DataMashup. It only patches an existing mashup. The editor UI already
has a "New query / Get Data" button; the block is just gated behind `workbookHasQueries` and the
save path can't create a payload. So this is a real feature, not a one-line ungate.

## What Excel actually stores (from mlang/real1.xlsx, a genuine Excel PQ workbook)

- `customXml/item1.xml` - `<DataMashup xmlns="http://schemas.microsoft.com/DataMashup">BASE64</DataMashup>`
- `customXml/itemProps1.xml` - `<ds:datastoreItem ds:itemID="{GUID}"><ds:schemaRefs><ds:schemaRef ds:uri="http://schemas.microsoft.com/DataMashup"/></ds:schemaRefs></ds:datastoreItem>`
- `customXml/_rels/item1.xml.rels` - item -> itemProps (customXmlProps rel)
- `xl/connections.xml` - one `<connection type="5" name="Query - NAME" ...><dbPr connection="Provider=Microsoft.Mashup.OleDb.1;Data Source=$Workbook$;Location=NAME;Extended Properties=&quot;&quot;" command="SELECT * FROM [NAME]"/></connection>` per query
- `xl/_rels/workbook.xml.rels` - add customXml + connections relationships
- `[Content_Types].xml` - overrides for `/customXml/item1.xml`, `/customXml/itemProps1.xml`, `/xl/connections.xml`

The DataMashup binary payload (little-endian): `version:u32`, then four length-prefixed blocks:
`packageParts (a zip)`, `permissions`, `metadata`, `permissionBindings`.
- `version` = 0.
- packageParts zip entries: `[Content_Types].xml` (`Default xml=text/xml`, `Default m=application/x-ms-m`), `Config/Package.xml` (`<Package><Version>2.0</Version><MinVersion>1.0</MinVersion><Culture>en-US</Culture></Package>`), `Formulas/Section1.m` (UTF-8 **with BOM**).
- permissions = `<PermissionList><CanEvaluateFuturePackages>false</CanEvaluateFuturePackages><FirewallEnabled>true</FirewallEnabled></PermissionList>`.
- metadata + permissionBindings: the mlang-authored demo uses **empty** blocks (len 0) and both
  mlang and sheetedit round-trip it. Real Excel writes a `LocalPackageMetadataFile` envelope
  (version:u32=0, len:u32, then a small header + XML with an `AllFormulas` item and one `Formula`
  item `Section1/NAME` per query) plus a non-empty permissionBindings signature block. Start with
  empty blocks (known-good for mlang + sheetedit); add the metadata envelope if Excel needs it.

Query names come from the section M: `shared NAME = ...;` (and `shared #"quoted name" = ...`).

## mlang API (qdeff.ts)

- `queryNamesFromSectionM(sectionM): string[]` - regex the `shared` members.
- `buildDataMashup(sectionM): DataMashup` - the minimal mashup object (parts + permissions, empty
  metadata/bindings).
- `connectionsXml(names): string` - the `xl/connections.xml` body.
- `syncWorkbookQueryParts(entries, sectionM): entries` - ensure connections.xml, its content-type
  override and workbook rel exist and list exactly the current query names (used by create + write).
- `createWorkbookQueries(entries, sectionM): entries` - full bootstrap: build the DataMashup ->
  base64 -> customXml/item1.xml (+ itemProps + _rels), register in [Content_Types] and workbook
  rels, then `syncWorkbookQueryParts`. A fresh GUID is passed in (mlang has no Date/random; take a
  `guid` argument or derive deterministically from the section text).
- `writeWorkbookSectionM`: if a payload exists, patch it then `syncWorkbookQueryParts`; else
  `createWorkbookQueries`. So it never throws and connections track the query set.

## sheetedit wiring (editor.ts)

- Split the `if (workbookHasQueries)` block: the quick-refresh **panel** + `runOnLoad` stay gated on
  having queries; the **editor** + a "Get Data" toolbar button become available for every xlsx.
- Get Data button: `readWorkbookQueries` -> open the editor with the existing section M, or with a
  default `section Section1;\n` when there is none. The editor's own New query / Get Data flow adds
  the first `shared` member; on save, sheetedit calls `writeWorkbookSectionM` (now bootstrap-capable).
- Loading results already works (`loadResultToNewSheet` / existing table).

## Phases (1-3 DONE)

Status: mlang bootstrap shipped (createWorkbookQueries + syncWorkbookQueryParts, round-trip tested); sheetedit always-on editor entry wired and browser-verified end to end (create query in a query-less xlsx -> save -> reopen finds it). Phase 4 (Excel-native metadata envelope) pending a Windows Excel check.

1. mlang: `queryNamesFromSectionM` + `buildDataMashup` + `createWorkbookQueries` + make
   `writeWorkbookSectionM` bootstrap. Round-trip tests: create from `{}` -> `readWorkbookQueries`
   returns the section + names; connections list matches; re-serialize is stable.
2. mlang: `connectionsXml` / `syncWorkbookQueryParts`, content-types + rels correctness; a test that
   the produced zip re-reads and that adding/removing a `shared` member updates connections.
3. sheetedit: always-on Get Data entry; bump mlang; browser-verify create-from-empty -> author a
   query -> save -> reload -> query persists and the panel now appears.
4. (fidelity) Excel-native metadata envelope if a Windows Excel check shows the Queries pane needs
   it. Cannot be validated here (no Excel; LibreOffice has no Power Query) - flag for the user.

## Constraints

- mlang stays clean-room: author every part from the MS-QDEFF / ECMA-376 public specs and the
  observable file structure; never decompile the Power Query engine.
- No `Date.now()` / `Math.random()` in mlang - GUIDs/timestamps come in as arguments.
