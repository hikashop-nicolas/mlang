import { describe, expect, it } from "vitest";
import { evaluate, toJS } from "./index.js";

const js = async (m: string): Promise<unknown> => toJS(await evaluate(m));
type T = { columns: string[]; rows: unknown[][] };

describe("Xml.Tables", () => {
  it("turns a repeated element into a table of its children", async () => {
    const xml = `<data><row><n>a</n><v>1</v></row><row><n>b</n><v>2</v></row></data>`;
    const tables = (await js(`Xml.Tables("${xml}")`)) as T[];
    expect(tables.length).toBeGreaterThanOrEqual(1);
    const t = tables[0]!;
    expect(t.columns).toEqual(["n", "v"]);
    expect(t.rows).toEqual([["a", "1"], ["b", "2"]]);
  });

  it("handles entities and missing children", async () => {
    const xml = `<r><i><a>x &amp; y</a></i><i><a>z</a><b>2</b></i></r>`;
    const t = ((await js(`Xml.Tables("${xml}")`)) as T[])[0]!;
    expect(t.columns).toEqual(["a", "b"]);
    expect(t.rows).toEqual([["x & y", null], ["z", "2"]]);
  });
});

describe("Xml.Document", () => {
  it("returns the [Name, Namespace, Value, Attributes] shape", async () => {
    const t = (await js(`Xml.Document("<root><a id=""1"">hi</a></root>")`)) as T;
    expect(t.columns).toEqual(["Name", "Namespace", "Value", "Attributes"]);
    expect(t.rows[0]![0]).toBe("root");
  });
});

describe("Html.Table", () => {
  const html = `<html><body><table>
    <tr><th>Name</th><th>Qty</th></tr>
    <tr><td>Apples</td><td>10</td></tr>
    <tr><td>Pears</td><td>4</td></tr>
  </table></body></html>`;

  it("default: Column1..N over the first table", async () => {
    const t = (await js(`Html.Table("${html.replace(/\n/g, "")}")`)) as T;
    expect(t.columns).toEqual(["Column1", "Column2"]);
    expect(t.rows[0]).toEqual(["Name", "Qty"]);
    expect(t.rows[1]).toEqual(["Apples", "10"]);
  });

  it("with column/selector pairs and header promotion", async () => {
    const m = `let
      Raw = Html.Table("${html.replace(/\n/g, "")}", {{"Name", "TD:nth-child(1)"}, {"Qty", "TD:nth-child(2)"}}),
      NoHeader = Table.Skip(Raw, 1),
      Typed = Table.TransformColumnTypes(NoHeader, {{"Qty", type number}})
    in Typed`;
    const out = (await js(m)) as T;
    expect(out.columns).toEqual(["Name", "Qty"]);
    expect(out.rows).toEqual([["Apples", 10], ["Pears", 4]]);
  });

  it("tolerates unclosed <td>/<tr> (lenient HTML)", async () => {
    const t = (await js(`Html.Table("<table><tr><td>a<td>b<tr><td>c<td>d</table>")`)) as T;
    expect(t.rows).toEqual([["a", "b"], ["c", "d"]]);
  });
});
