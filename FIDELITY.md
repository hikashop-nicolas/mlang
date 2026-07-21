# Known divergences from Microsoft's engine

Tracked honestly; each item is either fixed or documented here with rationale.

- Numbers are IEEE doubles only (no decimal mode); `Number.From` text parsing is not yet
  culture-aware.
- `as type` ascriptions are pass-throughs (no runtime conformance check yet).
- `Table.AddColumn` stores `null` where Excel would store a per-cell error value.
- `Text.From(logical)` returns "TRUE"/"FALSE" pending oracle confirmation of casing.
- Null ordering inside `Table.Sort` (nulls-first ascending) pending oracle confirmation.
- Dates/times/durations/binary are not implemented yet (Tier 1).
