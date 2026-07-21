import { readFileSync } from "node:fs";
import { unzipSync } from "fflate";
import { describe, expect, it } from "vitest";
import { evaluateSection, toJS } from "./index.js";
import { readWorkbookQueries } from "./qdeff.js";

// A real Excel-authored Power Query workbook (PowerQueryNet, MIT - see test/fixtures/README).
// End-to-end proof the engine runs genuine authored M, not just synthetic fixtures.
const bytes = new Uint8Array(readFileSync(new URL("../test/fixtures/pqnet-calendar.xlsx", import.meta.url)));

describe("real PowerQueryNet workbook", () => {
  it("evaluates all three queries to the expected real data", async () => {
    const q = readWorkbookQueries(unzipSync(bytes))!;
    const section = await evaluateSection(q.mashup.sectionM, {});
    expect(section.names).toEqual(["Dates", "ChineseCalendar", "vChineseCalendar"]);

    const dates = (await section.run("Dates")) as Extract<Awaited<ReturnType<typeof section.run>>, { kind: "table" }>;
    expect(dates.kind).toBe("table");
    expect(dates.columns).toEqual(["Date", "WeekDayName", "WeekDay"]);
    expect(dates.rows.length).toBe(10000);
    expect(dates.rows[0]!.map(toJS)).toEqual(["#date(2018,1,1)", "Monday", 1]);

    const cal = toJS(await section.run("ChineseCalendar")) as { columns: string[]; rows: unknown[][] };
    expect(cal.columns).toEqual(["Year", "New Year Date", "Animal"]);
    expect(cal.rows[0]).toEqual([2019, "#date(2019,2,5)", "Pig"]);

    // The join adds the weekday name of each New Year date; 2019-02-05 was a Tuesday.
    const v = toJS(await section.run("vChineseCalendar")) as { columns: string[]; rows: unknown[][] };
    expect(v.columns).toContain("WeekDayName");
    expect(v.rows[0]![3]).toBe("Tuesday");
  });
});
