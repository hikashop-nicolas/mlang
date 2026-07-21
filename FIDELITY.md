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

## Open

- Numbers are IEEE doubles only (no decimal/precision mode); culture-aware parsing and
  formatting beyond the en-US defaults is not implemented.
- `as type` ascriptions are pass-throughs (no runtime conformance check yet).
- `Table.AddColumn` stores `null` where Excel stores a per-cell error value.
- Dates/times/durations/binary are not implemented yet (Tier 1).
- Table column types are tracked loosely; the oracle serializes untyped columns as `any`,
  which the comparator ignores (names + values are compared).
