# Known divergences from Microsoft's engine

Tracked honestly; each item is either fixed (with an oracle fixture) or documented here.
Oracle = PQTest (Microsoft.PowerQuery.SdkTools) run black-box on CI (see
.github/workflows/oracle.yml); fixtures live in test/oracle/cases and are compared by
src/oracle.test.ts.

**Status:** the standard-library function reference is fully covered (see SPEC_GAP.md - all
three tiers + fuzzy, ~640 functions). The language core is complete: let/in, records/lists/
tables, each/`_`, if/then/else, `try...otherwise` and `try...catch`, `is`/`as`, `&`, `@`
recursion, sections/`shared`, `#shared`, Expression.Evaluate, metadata. The items below are the
remaining behavioural divergences and the intentionally out-of-scope areas.

## Resolved (oracle-confirmed, fixtures committed)

- Division by zero: `1/0` = `#infinity` (IEEE754), NOT an error. Fixed - mlang originally
  raised "Division by zero".
- `Text.From(true)` = `"true"` (lowercase). Fixed - mlang originally returned "TRUE".
- `null = null` = true; `1 = null` = false. Confirmed.
- Three-valued and/or (`null and false` = false, `null and true` = null, ...). Confirmed.
- Nulls sort FIRST ascending in Table.Sort. Confirmed.
- `Number.From("1,234")` = 1234 under the default culture. Confirmed.
- Bare `try` wraps success as `{HasError = false, Value = ...}` (spec; also fixed).
- `try X catch (e) => h` runs the handler with the error record (nullary `catch ()` also works).
- Lazy `let`: unused bindings never evaluate. Confirmed.

- Default ToText/Text.From = en-US General format (date M/d/yyyy, time h:mm tt short,
  datetime M/d/yyyy h:mm:ss tt). Custom + standard format strings implemented.
- Number.ToText "P" percent format has NO space before % ("12.6%"). Confirmed.
- Culture-aware Number.From / Date.From (decimal/group separators, D-M-Y order) for the
  common cultures; fr-FR U+00A0 group tolerated as a plain space. Confirmed.

## Open (genuine remaining divergences)

- **Culture-aware OUTPUT formatting is en-US only.** `Date.ToText`/`Number.ToText` with a
  non-US culture still emit US format (e.g. `Date.ToText(#date(2026,7,22), "d", "fr-FR")` gives
  "7/22/2026", not "22/07/2026"), and `Date.MonthName`/`Date.DayOfWeekName` return English names
  for any culture. Culture-aware *input* parsing (`Number.From`/`Date.From` separators & D-M-Y
  order) IS implemented; only the output/localized-name direction is missing. This is the most
  user-visible gap for fr/ja workbooks.
- **Numbers are IEEE doubles only** (no Decimal/Currency 28-digit precision, and Int64 values
  above 2^53 lose precision, e.g. `9007199254740993` -> `...992`). Fine for typical
  spreadsheet data; a distinct decimal/precision mode is not implemented.
- **`as type` ascriptions are pass-throughs** (no runtime conformance check): `"x" as number`
  returns "x" rather than raising. `Value.As`/`Value.Is`/`is` DO check; only the `as` operator
  is lax.
- **Structured types are shallow**: subtyping is name + nullability (no deep record/table
  structural subtyping). Function parameter/return types, record field types, table keys, and
  facets ARE now modelled (Type.* Tier 2); but TransformColumnTypes marks columns nullable, so
  Table.ColumnsOfType matches only `type any` for transformed columns.
- **Async connectors resolve by REPLAY**: the evaluator stays synchronous and re-runs the pure
  computation once per distinct connector source (N sources => N+1 passes). Correct because
  evaluation is pure and connector results are cached per refresh; the cost is recomputation,
  not re-fetching. A fully async evaluator would avoid the re-runs but is not implemented.
- **Fuzzy matching approximates Excel's proprietary scorer** (normalized Levenshtein; see
  SPEC_GAP.md). Reproduces all documented examples; borderline scores may differ.

## Out of scope (architectural, not fidelity gaps)

- Database connectors and `Value.NativeQuery` (need a server-side proxy; browser JS can't speak
  TDS/etc.). HTTP/file/workbook connectors ARE provided by the host.
- Query folding (`Table.StopFolding`, `Value.Optimize`, ...) - nothing to fold into locally.
- Partition/relationship metadata (`Table.PartitionKey`, `Table.FromPartitions`, ...) - no model
  layer to act on.
- Functions the reference marks "intended for internal use only" (`Table.View*`, `Value.Firewall`,
  `RowExpression.*`, ...).
