import { describe, expect, it } from "vitest";
import { asyncConnector, evaluate, evaluateSection, isMissingConnector, missingConnectorName, toJS, type MValue } from "./index.js";
import { MError, binary } from "./values.js";

describe("connectors", () => {
  it("an unimplemented connector raises the typed missing-connector error", async () => {
    try {
      await evaluate(`Web.Contents("https://example.com")`);
      throw new Error("should have thrown");
    } catch (e) {
      expect(isMissingConnector(e)).toBe(true);
      expect(missingConnectorName(e as MError)).toBe("Web.Contents");
    }
  });

  it("try...otherwise sees a connector error like any other", async () => {
    expect(toJS(await evaluate(`try File.Contents("x") otherwise "fallback"`))).toBe("fallback");
    const rec = (await evaluate(`try Sql.Database("s", "d")`)) as Extract<MValue, { kind: "record" }>;
    expect(toJS(rec.fields.get("HasError")!)).toBe(true);
  });

  it("a host binding overrides the stub and is usable in a query", async () => {
    // A host supplies File.Contents returning a binary; the query decodes and parses it -
    // exactly how sheetedit supplies Excel.CurrentWorkbook.
    const fileContents: MValue = {
      kind: "function",
      name: "File.Contents",
      params: [{ name: "path", optional: false }],
      call: () => ({ kind: "binary", bytes: new TextEncoder().encode("a,b\n1,2") }),
    };
    const m = `Table.PromoteHeaders(Csv.Document(File.Contents("data.csv")))`;
    const out = (await evaluate(m, { "File.Contents": fileContents })) as Extract<MValue, { kind: "table" }>;
    expect(out.columns).toEqual(["a", "b"]);
    expect(out.rows.map((r) => r.map((c) => toJS(c)))).toEqual([["1", "2"]]);
  });

  it("several connectors are registered", async () => {
    for (const c of ["Folder.Files", "OData.Feed", "Sql.Database", "SharePoint.Tables"]) {
      await expect(evaluate(`${c}("x")`)).rejects.toSatisfy((e) => isMissingConnector(e));
    }
  });
});

describe("async connectors (resolve-by-replay)", () => {
  const web = (payload: Record<string, string>) =>
    asyncConnector("Web.Contents", async (args) => {
      const url = (args[0] as { value: string }).value;
      if (!(url in payload)) throw new MError("DataSource.Error", `404 ${url}`);
      return binary(new TextEncoder().encode(payload[url]!));
    });

  it("a single async Web.Contents resolves and feeds Csv.Document", async () => {
    const host = { "Web.Contents": web({ "https://x/data.csv": "a,b\n1,2" }) };
    const out = toJS(await evaluate(`Table.PromoteHeaders(Csv.Document(Web.Contents("https://x/data.csv")))`, host)) as { columns: string[]; rows: unknown[][] };
    expect(out.columns).toEqual(["a", "b"]);
    expect(out.rows).toEqual([["1", "2"]]);
  });

  it("two distinct sources both resolve (multi-round replay)", async () => {
    const host = { "Web.Contents": web({ "u1": "10", "u2": "32" }) };
    const m = `Number.From(Text.FromBinary(Web.Contents("u1"))) + Number.From(Text.FromBinary(Web.Contents("u2")))`;
    expect(toJS(await evaluate(m, host))).toBe(42);
  });

  it("results are cached: the same URL fetches once", async () => {
    let calls = 0;
    const host = {
      "Web.Contents": asyncConnector("Web.Contents", async () => {
        calls++;
        return binary(new TextEncoder().encode("5"));
      }),
    };
    const m = `Number.From(Text.FromBinary(Web.Contents("u"))) + Number.From(Text.FromBinary(Web.Contents("u")))`;
    expect(toJS(await evaluate(m, host))).toBe(10);
    expect(calls).toBe(1);
  });

  it("a connector error propagates through try...otherwise", async () => {
    const host = { "Web.Contents": web({}) };
    expect(toJS(await evaluate(`try Text.FromBinary(Web.Contents("missing")) otherwise "fallback"`, host))).toBe("fallback");
  });

  it("works through evaluateSection.run", async () => {
    const host = { "Web.Contents": web({ "u": "hi" }) };
    const section = await evaluateSection(`section Section1;\nshared Q = Text.FromBinary(Web.Contents("u"));`, host);
    expect(toJS(await section.run("Q"))).toBe("hi");
  });
});
