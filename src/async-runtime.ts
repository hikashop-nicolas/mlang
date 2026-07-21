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

const MAX_ROUNDS = 128;

/** Run a synchronous evaluation, resolving async connectors by replay until it completes. */
export async function runWithConnectors(build: () => MValue): Promise<MValue> {
  const cache = new Map<string, Cached>();
  const previous = currentCache;
  for (let round = 0; round < MAX_ROUNDS; round++) {
    currentCache = cache;
    let pending: PendingConnector | null = null;
    try {
      return build();
    } catch (e) {
      if (e instanceof PendingConnector) pending = e;
      else throw e;
    } finally {
      currentCache = previous;
    }
    // Resolve outside the try. A resolver MError is cached so the next pass re-throws it at
    // the call site (catchable by try...otherwise); anything else is a real failure.
    try {
      cache.set(pending.key, { ok: await pending.resolve() });
    } catch (err) {
      if (err instanceof MError) cache.set(pending.key, { failed: err });
      else throw err;
    }
  }
  throw new MError("Connector.TooMany", `exceeded ${MAX_ROUNDS} connector-resolution rounds (a connector's arguments may depend on its own result).`);
}
