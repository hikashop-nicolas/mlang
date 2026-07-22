import { describe, expect, it } from "vitest";
import { evaluate, toJS } from "./index.js";

const js = async (m: string): Promise<unknown> => toJS(await evaluate(m));

describe("DateTimeZone", () => {
  it("constructor + accessors", async () => {
    expect(await js(`DateTimeZone.ZoneHours(#datetimezone(2020, 1, 2, 3, 4, 5, -8, 0))`)).toBe(-8);
    expect(await js(`DateTimeZone.ZoneMinutes(#datetimezone(2020, 1, 2, 3, 4, 5, 5, 30))`)).toBe(30);
    expect(await js(`Date.Year(#datetimezone(2020, 5, 6, 1, 2, 3, 2, 0))`)).toBe(2020);
  });

  it("RemoveZone / ToUtc / SwitchZone", async () => {
    expect(await js(`DateTimeZone.RemoveZone(#datetimezone(2020, 1, 2, 3, 4, 5, -8, 0))`)).toBe(`#datetime(2020,1,2,${3 * 3600 + 4 * 60 + 5})`);
    expect(await js(`DateTimeZone.ToUtc(#datetimezone(2020, 1, 2, 3, 0, 0, -8, 0))`)).toBe(`#datetimezone(2020,1,2,${11 * 3600},0)`);
    expect(await js(`DateTimeZone.SwitchZone(#datetimezone(2020, 1, 2, 3, 0, 0, 0, 0), 2)`)).toBe(`#datetimezone(2020,1,2,${5 * 3600},120)`);
  });

  it("arithmetic + comparison by instant", async () => {
    expect(await js(`#datetimezone(2020, 1, 2, 10, 0, 0, 0, 0) - #datetimezone(2020, 1, 2, 3, 0, 0, -8, 0)`)).toBe(`#duration(${-3600})`);
    expect(await js(`#datetimezone(2020, 1, 2, 3, 0, 0, 0, 0) = #datetimezone(2020, 1, 2, 11, 0, 0, 8, 0)`)).toBe(true);
    expect(await js(`#datetimezone(2020, 1, 2, 3, 0, 0, 0, 0) > #datetimezone(2020, 1, 2, 3, 0, 0, 8, 0)`)).toBe(true);
  });

  it("From text (ISO with offset) + is-check", async () => {
    expect(await js(`DateTimeZone.From("2020-01-02T03:04:05-08:00")`)).toBe(`#datetimezone(2020,1,2,${3 * 3600 + 4 * 60 + 5},-480)`);
    expect(await js(`#datetimezone(2020, 1, 1, 0, 0, 0, 0, 0) is datetimezone`)).toBe(true);
    expect(await js(`1 is datetimezone`)).toBe(false);
  });
});
