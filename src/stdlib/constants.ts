// Library enum constants (plain numbers, per the reference; values oracle-pinned by the
// constants.query.pq case).
import type { Env } from "../interpret.js";
import { number, type MValue } from "../values.js";

const N = (v: number): MValue => number(v);

export function registerConstants(env: Env): void {
  const def = (name: string, v: MValue): void => env.defineValue(name, v);
  def("Order.Ascending", N(0));
  def("Order.Descending", N(1));
  def("MissingField.Error", N(0));
  def("MissingField.Ignore", N(1));
  def("MissingField.UseNull", N(2));
  def("JoinKind.Inner", N(0));
  def("JoinKind.LeftOuter", N(1));
  def("JoinKind.RightOuter", N(2));
  def("JoinKind.FullOuter", N(3));
  def("JoinKind.LeftAnti", N(4));
  def("JoinKind.RightAnti", N(5));
  def("GroupKind.Local", N(0));
  def("GroupKind.Global", N(1));
  def("Occurrence.First", N(0));
  def("Occurrence.Last", N(1));
  def("Occurrence.All", N(2));
  def("QuoteStyle.None", N(0));
  def("QuoteStyle.Csv", N(1));
  def("RoundingMode.Up", N(0));
  def("RoundingMode.Down", N(1));
  def("RoundingMode.AwayFromZero", N(2));
  def("RoundingMode.TowardZero", N(3));
  def("RoundingMode.ToEven", N(4));
  def("ExtraValues.List", N(0));
  def("ExtraValues.Error", N(1));
  def("ExtraValues.Ignore", N(2));
}
