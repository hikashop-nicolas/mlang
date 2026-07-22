// Async connectors without an async evaluator. The evaluator stays fully synchronous; an
// async connector (Web.Contents, File.Contents, ...) is resolved by REPLAY: on a cache miss
// it throws a PendingConnector, the async driver awaits the fetch, caches the bytes, and
// re-runs the (pure) evaluation. N distinct sources => N+1 passes. The re-run cost is the
// tradeoff for not turning every stdlib call into a Promise (see FIDELITY.md).
import { MError, toJS, type MFunction, type MValue } from "./values.js";

/** Thrown by an unresolved async connector; caught only by the replay driver. */
export class PendingConnector {
  constructor(
    public readonly key: string,
    public readonly resolve: () => Promise<MValue>,
  ) {}
}

/** Thrown by Expression.Evaluate for an M string not yet parsed (the parser is async). */
export class PendingParse {
  constructor(public readonly source: string) {}
}

// Parsed-document cache for the current pass (source -> AST, or the parse MError).
let currentParseCache: Map<string, { ast: unknown } | { err: MError }> | null = null;

/** Return the cached AST for an M source, re-throw its parse error, or request a parse. */
export function requestParse(source: string): unknown {
  const hit = currentParseCache?.get(source);
  if (hit === undefined) throw new PendingParse(source);
  if ("err" in hit) throw hit.err;
  return hit.ast;
}

// A resolved connector caches either its value or the MError it failed with (so the error
// can be re-thrown at the call site on the next pass, where try...otherwise can catch it).
type Cached = { readonly ok: MValue } | { readonly failed: MError };

// The current pass's resolved-connector cache. Safe as a module global: a pass is fully
// synchronous, and the driver saves/restores it around the awaited resolution.
let currentCache: Map<string, Cached> | null = null;

function stableKey(name: string, args: MValue[]): string {
  return `${name}(${JSON.stringify(args.map(toJS))})`;
}

/** Build a host connector from an async resolver. Returns a binary/table/record MValue. */
export function asyncConnector(name: string, resolve: (args: MValue[]) => Promise<MValue>): MFunction {
  return {
    kind: "function",
    name,
    params: [{ name: "argument", optional: true }],
    call: (args) => {
      const key = stableKey(name, args);
      const hit = currentCache?.get(key);
      if (hit === undefined) throw new PendingConnector(key, () => resolve(args));
      if ("failed" in hit) throw hit.failed; // re-thrown INSIDE eval -> try...otherwise catches
      return hit.ok;
    },
  };
}

// --- Per-evaluation clock and RNG ------------------------------------------------------
// Clock/random functions (DateTime.LocalNow, Number.Random, the relative-date family) are
// non-deterministic, but "now" is FIXED once per evaluation (Excel refresh semantics) and the
// RNG is reseeded to the same seed at the start of every replay round, so a query that also
// pulls a connector reproduces identical clock/random values across passes.
let clockMs: number | null = null;
let clockOffsetMin: number | null = null;
let rng: (() => number) | null = null;

/** The fixed wall-clock instant (ms since epoch) for the current run; live clock outside one. */
export function currentClockMs(): number {
  return clockMs ?? Date.now();
}
/** Local timezone offset in minutes (east-of-UTC positive), fixed for the current run. */
export function currentOffsetMinutes(): number {
  return clockOffsetMin ?? -new Date().getTimezoneOffset();
}
/** Next pseudo-random in [0,1); seeded per run for replay reproducibility, else Math.random. */
export function nextRandom(): number {
  return rng ? rng() : Math.random();
}
// mulberry32: a tiny, fast, well-distributed 32-bit PRNG (public-domain algorithm).
function makeRng(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const MAX_ROUNDS = 128;

/** Run a synchronous evaluation, resolving async connectors AND Expression.Evaluate parses by
    replay until it completes. `parse` (async) is used for the latter. */
export async function runWithConnectors(build: () => MValue, parse?: (source: string) => Promise<unknown>): Promise<MValue> {
  const cache = new Map<string, Cached>();
  const parseCache = new Map<string, { ast: unknown } | { err: MError }>();
  const prevC = currentCache;
  const prevP = currentParseCache;
  // Fix the clock once for this run (nested runs inherit the outer instant); reseed the RNG
  // to this seed at the start of every round so replay reproduces the same random sequence.
  const prevClock = clockMs;
  const prevOffset = clockOffsetMin;
  const prevRng = rng;
  if (clockMs === null) {
    clockMs = Date.now();
    clockOffsetMin = -new Date().getTimezoneOffset();
  }
  const seed = (clockMs ^ 0x9e3779b9) >>> 0;
  try {
  for (let round = 0; round < MAX_ROUNDS; round++) {
    currentCache = cache;
    currentParseCache = parseCache;
    rng = makeRng(seed);
    let pendingConn: PendingConnector | null = null;
    let pendingParse: PendingParse | null = null;
    try {
      return build();
    } catch (e) {
      if (e instanceof PendingConnector) pendingConn = e;
      else if (e instanceof PendingParse) pendingParse = e;
      else throw e;
    } finally {
      currentCache = prevC;
      currentParseCache = prevP;
    }
    // Resolve outside the try. A resolver/parse MError is cached so the next pass re-throws it
    // at the call site (catchable by try...otherwise); anything else is a real failure.
    if (pendingConn) {
      try {
        cache.set(pendingConn.key, { ok: await pendingConn.resolve() });
      } catch (err) {
        if (err instanceof MError) cache.set(pendingConn.key, { failed: err });
        else throw err;
      }
    } else {
      const src = pendingParse!.source;
      if (!parse) throw new MError("Expression.Error", "Expression.Evaluate is unavailable (no parser).");
      try {
        parseCache.set(src, { ast: await parse(src) });
      } catch (err) {
        if (err instanceof MError) parseCache.set(src, { err });
        else throw err;
      }
    }
  }
  throw new MError("Connector.TooMany", `exceeded ${MAX_ROUNDS} resolution rounds (a connector or Expression.Evaluate may be self-referential).`);
  } finally {
    clockMs = prevClock;
    clockOffsetMin = prevOffset;
    rng = prevRng;
  }
}
