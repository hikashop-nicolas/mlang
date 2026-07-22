# Known divergences from Microsoft's engine

Tracked honestly; each item is either fixed (with an oracle fixture) or documented here.
Oracle = PQTest (Microsoft.PowerQuery.SdkTools) run black-box on CI (see
.github/workflows/oracle.yml); fixtures live in test/oracle/cases and are compared by
src/oracle.test.ts.

## Resolved (oracle-confirmed, fixtures committed)

- Division by zero: `1/0` = `#infinity` (IEEE754), NOT an error. Fixed - mlang originally
  raised "Division by zero".
- `Text.From(true)` = `"true"` (lowercase). Fixed - mlang originally returned "TRUE".
- `null = null` = true; `1 = null` = false. Confirmed.
- Three-valued and/or (`null and false` = false, `null and true` = null, ...). Confirmed.
- Nulls sort FIRST ascending in Table.Sort. Confirmed.
- `Number.From("1,234")` = 1234 under the default culture. Confirmed.
- Bare `try` wraps success as `{HasError = false, Value = ...}` (spec; also fixed).
- Lazy `let`: unused bindings never evaluate. Confirmed.

- Default ToText/Text.From = en-US General format (date M/d/yyyy, time h:mm tt short,
  datetime M/d/yyyy h:mm:ss tt). Custom + standard format strings implemented.
- Number.ToText "P" percent format has NO space before % ("12.6%"). Confirmed.
- Culture-aware Number.From / Date.From (decimal/group separators, D-M-Y order) for the
  common cultures; fr-FR U+00A0 group tolerated as a plain space. Confirmed.

## Open
- Structured types are shallow: subtyping is name+nullability (no deep record/table/function
  structural checks). TransformColumnTypes marks columns nullable (oracle), so Table.Columns
  OfType matches only type any for transformed columns. type table [...] literals type their
  columns as any (field-type expressions are not evaluated). Function param/return types and
  DateTimeZone VALUES are not modelled (the datetimezone TYPE exists).
- Async connectors resolve by REPLAY: the evaluator stays synchronous and re-runs the pure
  computation once per distinct connector source (N sources => N+1 passes). Correct because
  evaluation is pure and connector results are cached per refresh; the cost is recomputation,
  not re-fetching. A fully async evaluator would avoid the re-runs but is not implemented.

- Numbers are IEEE doubles only (no decimal/precision mode).
- `as type` ascriptions are pass-throughs (no runtime conformance check yet).
- `Table.AddColumn` stores `null` where Excel stores a per-cell error value.
- Dates/times/durations/binary are not implemented yet (Tier 1).
- Table column types are tracked loosely; the oracle serializes untyped columns as `any`,
  which the comparator ignores (names + values are compared).
