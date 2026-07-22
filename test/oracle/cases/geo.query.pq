[
    GeoPoint = GeographyPoint.From(10, 10),
    GeomPoint = GeometryPoint.From(1, 2),
    GeomPointZM = GeometryPoint.From(1, 2, 3, 4, 27700),
    HasSridDefault = Record.HasFields(GeographyPoint.From(10, 10), "SRID"),
    PointWkt = Geography.FromWellKnownText("POINT (30 10)"),
    LineFirst = Geometry.FromWellKnownText("LINESTRING (30 10, 10 30, 40 40)")[Points]{1},
    PolyRingKind = Geometry.FromWellKnownText("POLYGON ((30 10, 40 40, 20 40, 30 10))")[Rings]{0}[Kind],
    MultiPointFirst = Geometry.FromWellKnownText("MULTIPOINT (10 40, 40 30)")[Components]{0},
    CollectionSecondKind = Geometry.FromWellKnownText("GEOMETRYCOLLECTION (POINT (4 6), LINESTRING (4 6, 7 10))")[Components]{1}[Kind],
    Srid = Geometry.FromWellKnownText("SRID=27700;POINT (30 10)")[SRID],
    RoundTripPoint = Geography.ToWellKnownText(GeographyPoint.From(30, 10)),
    RoundTripLine = Geometry.ToWellKnownText(Geometry.FromWellKnownText("LINESTRING (30 10, 10 30)")),
    RoundTripPoly = Geometry.ToWellKnownText(Geometry.FromWellKnownText("POLYGON ((30 10, 40 40, 20 40, 30 10))")),
    NullIn = Geometry.FromWellKnownText(null)
]
