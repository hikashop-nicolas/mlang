import { evaluate, toJS, type HostBindings } from "../src/index";
import { number, table, text } from "../src/values";

const host: HostBindings = {
  "Excel.CurrentWorkbook": {
    kind: "function",
    name: "Excel.CurrentWorkbook",
    params: [],
    call: () =>
      table(["Name", "Content"], [[
        text("Sales"),
        table(["Product", "Qty", "Price"], [
          [text("Apples"), number(10), number(2.5)],
          [text("Pears"), number(4), number(3)],
          [text("Cherries"), number(20), number(5)],
        ]),
      ]]),
  },
};

const out = document.getElementById("out")!;
const src = document.getElementById("m") as HTMLTextAreaElement;

function render(v: unknown): string {
  const t = v as { columns?: string[]; rows?: unknown[][] };
  if (t && Array.isArray(t.columns) && Array.isArray(t.rows)) {
    const widths = t.columns.map((c, i) => Math.max(c.length, ...t.rows!.map((r) => String(r[i] ?? "").length)));
    const line = (cells: unknown[]) => cells.map((c, i) => String(c ?? "").padEnd(widths[i]!)).join("  ");
    return [line(t.columns), line(widths.map((w) => "-".repeat(w))), ...t.rows.map(line)].join("\n");
  }
  return JSON.stringify(v, null, 2);
}

document.getElementById("run")!.addEventListener("click", () => {
  out.classList.remove("err");
  out.textContent = "…";
  evaluate(src.value, host).then(
    (v) => (out.textContent = render(toJS(v))),
    (e) => {
      out.classList.add("err");
      out.textContent = String(e);
    },
  );
});
