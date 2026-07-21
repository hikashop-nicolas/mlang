import { describe, expect, it } from "vitest";
import { evaluate, isMissingConnector, missingConnectorName, toJS, type MValue } from "./index.js";
import { MError } from "./values.js";

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
