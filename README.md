# mlang

A **clean-room Power Query M evaluator** that runs entirely in the browser. Parse M with
[@microsoft/powerquery-parser](https://github.com/microsoft/powerquery-parser) (MIT), evaluate
the language and the full documented standard library, and read workbook query definitions
(the MS-QDEFF `DataMashup` payload). Built so
[sheetedit](https://github.com/hikashop-nicolas/sheetedit) can list, read and refresh
workbook queries without any server.

## Clean-room policy

Implemented **only** from public sources: the M language specification, the Microsoft Learn
function reference, the MS-QDEFF format specification, and black-box input/output
observations. No Microsoft binaries are bundled, consulted via decompilation, or required at
runtime. External data sources are **not** fetched: hosts inject connectors (e.g.
`Excel.CurrentWorkbook`) as values; unknown functions raise precise errors.

## API

```ts
import { evaluate, evaluateSection, toJS, type HostBindings } from "mlang";
import { readWorkbookQueries } from "mlang/qdeff";

const host: HostBindings = { "Excel.CurrentWorkbook": /* function value backed by your data */ };
const value = await evaluate('let t = #table({"A"}, {{1}, {2}}) in Table.RowCount(t)');
const queries = await evaluateSection(sectionM, host); // Section1.m
const q = readWorkbookQueries(unzippedXlsxEntries);    // -> { mashup: { sectionM, ... } }
```

Values are a tagged union (`null/logical/number/text/list/record/table/function/type`);
`toJS()` projects them for display. Errors follow the spec (raise + `try ... otherwise`).

## Status

**Language core: complete.** Lazy recursive `let`, `each`/`_`, closures, `@` self-reference,
records/lists/tables, `if`/`then`/`else`, three-valued logic, null propagation, `is`/`as`, `&`,
`try...otherwise` and `try...catch`, sections/`shared`, `#shared`, `Expression.Evaluate`,
metadata.

**Standard library: the full Microsoft function reference is covered** (~640 functions) - every
`Table.*`/`List.*`/`Text.*`/`Number.*`/`Date.*`/`Time.*`/`DateTime*`/`Duration.*`/`Record.*`/
`Value.*`/`Type.*`/`Binary*`/`Splitter`/`Combiner`/`Comparer`/`Uri`/`Logical`/`Geography`/
`Geometry`/`Table.Fuzzy*` function in the reference, plus the clock/random non-deterministic
family. The gap analysis behind this lives in SPEC_GAP.md.

**Out of scope** (by architecture, not omission): database connectors / `Value.NativeQuery`
(need a server proxy), query folding, partition/relationship metadata, and functions the
reference marks "internal use only". HTTP/file/workbook connectors are injected by the host.

Fidelity is validated against oracle fixtures generated with Microsoft's PQTest CLI (dev-side
only; fixtures are committed, the tool is never shipped). Remaining behavioural divergences
(culture-aware output formatting, IEEE-double numbers, lax `as`, shallow structural subtyping)
are tracked in FIDELITY.md.
