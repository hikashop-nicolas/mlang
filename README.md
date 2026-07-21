# mlang

A **clean-room Power Query M evaluator** that runs entirely in the browser. Parse M with
[@microsoft/powerquery-parser](https://github.com/microsoft/powerquery-parser) (MIT), evaluate
a growing, documented subset of the language and standard library, and read workbook query
definitions (the MS-QDEFF `DataMashup` payload). Built so
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

Tier-0: language core (lazy recursive `let`, `each`, closures, three-valued logic, null
propagation, error handling) plus the everyday `Table.*`/`List.*`/`Text.*`/`Number.*`
functions needed by typical "Applied Steps" chains. Unsupported syntax or functions raise
`mlang: unsupported ...` errors rather than approximating. Fidelity is validated against
oracle fixtures generated with Microsoft's PQTest CLI (dev-side only; fixtures are committed,
the tool is never shipped). Known divergences are tracked in FIDELITY.md.
