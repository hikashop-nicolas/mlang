let
    Emp = Table.FromRecords({
        [EmployeeID = 1, Location = "Seattle"],
        [EmployeeID = 2, Location = "seattl"],
        [EmployeeID = 3, Location = "Vancouver"],
        [EmployeeID = 4, Location = "Seatle"],
        [EmployeeID = 5, Location = "vancover"],
        [EmployeeID = 6, Location = "Seattle"],
        [EmployeeID = 7, Location = "Vancouver"]
    }),
    T1 = Table.FromRecords({
        [CustomerID = 1, FirstName1 = "Bob", Phone = "555-1234"],
        [CustomerID = 2, FirstName1 = "Robert", Phone = "555-4567"]
    }),
    T2 = Table.FromRecords({
        [CustomerStateID = 1, FirstName2 = "Bob", State = "TX"],
        [CustomerStateID = 2, FirstName2 = "bOB", State = "CA"]
    })
in
    [
        GroupCounts = Table.FuzzyGroup(Emp, "Location", {"Count", each Table.RowCount(_)}, [IgnoreCase = true, IgnoreSpace = true]),
        JoinRows = Table.RowCount(Table.FuzzyJoin(T1, {"FirstName1"}, T2, {"FirstName2"}, JoinKind.LeftOuter, [IgnoreCase = true, IgnoreSpace = false])),
        JoinStates = Table.Column(Table.FuzzyJoin(T1, {"FirstName1"}, T2, {"FirstName2"}, JoinKind.LeftOuter, [IgnoreCase = true, IgnoreSpace = false]), "State"),
        InnerRows = Table.RowCount(Table.FuzzyJoin(T1, {"FirstName1"}, T2, {"FirstName2"}, JoinKind.Inner)),
        Cluster = Table.Column(Table.AddFuzzyClusterColumn(Table.FromRecords({[L = "Seattle"], [L = "seattl"], [L = "Seatle"]}), "L", "C"), "C"),
        BelowThreshold = Table.RowCount(Table.FuzzyJoin(Table.FromRecords({[A = "Grapes"]}), {"A"}, Table.FromRecords({[B = "Graes"]}), {"B"}, JoinKind.Inner, [Threshold = 0.9]))
    ]
