import { describe, expect, it } from "vitest";
import { evaluate, toJS } from "./index.js";

// SPEC_GAP Tier 3: Geography/Geometry WKT. Record shapes confirmed against Microsoft docs +
// Chris Webb's reference examples (POINT omits Z/M/SRID at defaults; POLYGON.Rings hold
// LINESTRING records; LINESTRING uses Points; Multi*/Collection use Components).
const js = async (m: string): Promise<unknown> => toJS(await evaluate(m));

describe("geo: point constructors", () => {
  it("GeographyPoint.From / GeometryPoint.From (matches the documented example)", async () => {
    expect(await js(`GeographyPoint.From(10, 10)`)).toEqual({ Kind: "POINT", Longitude: 10, Latitude: 10 });
    expect(await js(`GeometryPoint.From(1, 2)`)).toEqual({ Kind: "POINT", X: 1, Y: 2 });
    expect(await js(`GeometryPoint.From(1, 2, 3, 4, 27700)`)).toEqual({ Kind: "POINT", X: 1, Y: 2, Z: 3, M: 4, SRID: 27700 });
    // default SRID (4326 geo / 0 geom) is omitted
    expect(await js(`Record.HasFields(GeographyPoint.From(10, 10), "SRID")`)).toBe(false);
    expect(await js(`GeographyPoint.From(10, 10, null, null, 4326)`)).toEqual({ Kind: "POINT", Longitude: 10, Latitude: 10 });
  });
});

describe("geo: FromWellKnownText", () => {
  it("POINT / LINESTRING / POLYGON structure", async () => {
    expect(await js(`Geography.FromWellKnownText("POINT (30 10)")`)).toEqual({ Kind: "POINT", Longitude: 30, Latitude: 10 });
    expect(await js(`Geometry.FromWellKnownText("LINESTRING (30 10, 10 30, 40 40)")[Points]{1}`)).toEqual({ Kind: "POINT", X: 10, Y: 30 });
    // POLYGON.Rings hold LINESTRING records
    expect(await js(`Geometry.FromWellKnownText("POLYGON ((30 10, 40 40, 20 40, 30 10))")[Rings]{0}[Kind]`)).toBe("LINESTRING");
    expect(await js(`Geometry.FromWellKnownText("POLYGON ((30 10, 40 40, 20 40, 30 10))")[Rings]{0}[Points]{0}`)).toEqual({ Kind: "POINT", X: 30, Y: 10 });
  });
  it("Multi* / GeometryCollection use Components; EWKT SRID prefix", async () => {
    expect(await js(`Geometry.FromWellKnownText("MULTIPOINT (10 40, 40 30)")[Components]{0}`)).toEqual({ Kind: "POINT", X: 10, Y: 40 });
    expect(await js(`Geometry.FromWellKnownText("MULTILINESTRING ((10 10, 20 20), (40 40, 30 30))")[Components]{0}[Kind]`)).toBe("LINESTRING");
    expect(await js(`Geometry.FromWellKnownText("GEOMETRYCOLLECTION (POINT (4 6), LINESTRING (4 6, 7 10))")[Components]{1}[Kind]`)).toBe("LINESTRING");
    expect(await js(`Geometry.FromWellKnownText("SRID=27700;POINT (30 10)")[SRID]`)).toBe(27700);
  });
  it("null in -> null out", async () => {
    expect(await js(`Geometry.FromWellKnownText(null)`)).toBe(null);
  });
});

describe("geo: ToWellKnownText round-trips", () => {
  it("point / line / polygon", async () => {
    expect(await js(`Geography.ToWellKnownText(GeographyPoint.From(30, 10))`)).toBe("POINT (30 10)");
    expect(await js(`Geometry.ToWellKnownText(Geometry.FromWellKnownText("LINESTRING (30 10, 10 30)"))`)).toBe("LINESTRING (30 10, 10 30)");
    expect(await js(`Geometry.ToWellKnownText(Geometry.FromWellKnownText("POLYGON ((30 10, 40 40, 20 40, 30 10))"))`)).toBe("POLYGON ((30 10, 40 40, 20 40, 30 10))");
    // SRID round-trips as an EWKT prefix unless omitted
    expect(await js(`Geometry.ToWellKnownText(Geometry.FromWellKnownText("SRID=27700;POINT (30 10)"))`)).toBe("SRID=27700;POINT (30 10)");
    expect(await js(`Geometry.ToWellKnownText(Geometry.FromWellKnownText("SRID=27700;POINT (30 10)"), true)`)).toBe("POINT (30 10)");
  });
});
