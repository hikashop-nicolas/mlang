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
- Culture-aware OUTPUT: `Date.ToText`/`DateTime.ToText`/`Number.ToText`/`Date.MonthName`/
  `Date.DayOfWeekName` localize via Intl (fr-FR `d` -> `22/07/2026`, `Date.MonthName ja-JP` ->
  `7月`, `Number.ToText N2 fr-FR` -> `1 234,50`). en-US/no-culture paths unchanged. (Intl uses a
  narrow no-break space U+202F as the fr group separator where .NET uses U+00A0 - a benign
  space variant.) Oracle case `culture` pending confirmation.
- `value as type` enforces conformance and raises on mismatch (spec), not a pass-through.
- Structural subtyping: `Value.Is`/`Type.Is` check record fields (open/closed, optional), table
  columns and list items - not just the kind name.

- Default ToText/Text.From = en-US General format (date M/d/yyyy, time h:mm tt short,
  datetime M/d/yyyy h:mm:ss tt). Custom + standard format strings implemented.
- Number.ToText "P" percent format has NO space before % ("12.6%"). Confirmed.
- Culture-aware Number.From / Date.From (decimal/group separators, D-M-Y order) for the
  common cultures; fr-FR U+00A0 group tolerated as a plain space. Confirmed.

## Open (genuine remaining divergences)

- **Numbers are IEEE doubles** (matching Excel's own storage and M's `Double`, so e.g.
  `0.1 + 0.2 = 0.30000000000000004` is correct, not a divergence). Exact integers beyond 2^53
  (64-bit IDs) DO carry a BigInt shadow so equality, compare, sort, dedup, `Number.FromText`/
  `Int64.From`, `+`/`-`/`*`, and text output stay exact. Remaining by design: `toJS` display and
  stdlib aggregations (`List.Sum`, ...) fold back to double, and Decimal/Currency fractional
  precision past a double isn't modelled (a full decimal tower is disproportionate here).
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
