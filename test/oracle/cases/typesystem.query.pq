let
    FT = type function (x as number, optional y as text) as text,
    RT = type [A = number, optional B = any],
    TT = type table [A = number, B = text]
in
    [
        ParamNames = Record.FieldNames(Type.FunctionParameters(FT)),
        ParamXIsNumber = Type.Is(Type.FunctionParameters(FT)[x], type number),
        ReturnIsText = Type.Is(Type.FunctionReturn(FT), type text),
        RequiredParams = Type.FunctionRequiredParameters(FT),
        ForFnRequired = Type.FunctionRequiredParameters(Type.ForFunction([ReturnType = type number, Parameters = [X = type number, Y = type text]], 1)),
        RecAOptional = Type.RecordFields(RT)[A][Optional],
        RecBOptional = Type.RecordFields(RT)[B][Optional],
        RecAIsNumber = Type.Is(Type.RecordFields(RT)[A][Type], type number),
        ClosedOpen = Type.IsOpenRecord(type [A = number]),
        MarkerOpen = Type.IsOpenRecord(type [A = number, ...]),
        OpenedOpen = Type.IsOpenRecord(Type.OpenRecord(type [A = number])),
        ForRecordNames = Record.FieldNames(Type.RecordFields(Type.ForRecord([Name = [Type = type text, Optional = false], Score = [Type = type number, Optional = false]], false))),
        SchemaNames = Table.Column(Type.TableSchema(TT), "Name"),
        SchemaTypes = Table.Column(Type.TableSchema(TT), "TypeName"),
        RowNames = Record.FieldNames(Type.RecordFields(Type.TableRow(TT))),
        KeyColumns = Type.TableKeys(Type.AddTableKey(TT, {"A"}, true)){0}[Columns],
        KeyPrimary = Type.TableKeys(Type.AddTableKey(TT, {"A"}, true)){0}[Primary],
        UnionSame = Type.Is(Type.Union({type number, type number}), type number),
        FacetNames = Record.FieldNames(Type.Facets(type number)),
        FacetsAllNull = List.MatchesAll(Record.FieldValues(Type.Facets(type number)), each _ = null),
        IsRecordOk = Value.Is([A = 1], type [A = number]),
        IsRecordWrongType = Value.Is([A = "x"], type [A = number]),
        IsRecordExtraClosed = Value.Is([A = 1, B = 2], type [A = number]),
        IsRecordOpen = Value.Is([A = 1, B = 2], type [A = number, ...]),
        IsRecordOptional = Value.Is([A = 1], type [A = number, optional B = text]),
        TypeIsOpenSuper = Type.Is(type [A = number, B = text], type [A = number, ...]),
        TypeIsMissingReq = Type.Is(type [A = number], type [A = number, B = text])
    ]
