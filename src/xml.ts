// Minimal XML/HTML parsing for Xml.Document / Xml.Tables / Html.Table. A small recursive
// scanner (no DOM) sufficient for the data-oriented shapes these functions target. Pure.

export interface XmlNode {
  name: string;
  attrs: Record<string, string>;
  children: XmlNode[];
  text: string; // direct text content (concatenated text nodes)
}

const VOID_HTML = new Set(["area", "base", "br", "col", "embed", "hr", "img", "input", "link", "meta", "param", "source", "track", "wbr"]);

/** HTML implied end-tags: opening `open` auto-closes an open `top` element. */
function impliedClose(open: string, top: string): boolean {
  if ((open === "td" || open === "th") && (top === "td" || top === "th")) return true;
  if (open === "tr" && (top === "td" || top === "th" || top === "tr")) return true;
  if ((open === "thead" || open === "tbody" || open === "tfoot") && (top === "td" || top === "th" || top === "tr")) return true;
  if (open === "li" && top === "li") return true;
  if (open === "p" && top === "p") return true;
  if (open === "option" && top === "option") return true;
  return false;
}

function decodeEntities(s: string): string {
  return s
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&nbsp;/g, " ")
    .replace(/&#x([0-9A-Fa-f]+);/g, (_, h) => String.fromCodePoint(parseInt(h, 16)))
    .replace(/&#(\d+);/g, (_, d) => String.fromCodePoint(Number(d)))
    .replace(/&amp;/g, "&");
}

function parseAttrs(s: string): Record<string, string> {
  const out: Record<string, string> = {};
  const re = /([\w:.-]+)\s*=\s*("([^"]*)"|'([^']*)')/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(s))) out[m[1]!] = decodeEntities(m[3] ?? m[4] ?? "");
  return out;
}

/** Parse XML (or lenient HTML when `html`) into a node tree with a synthetic root. */
export function parseXml(input: string, html = false): XmlNode {
  let s = input.replace(/<\?[\s\S]*?\?>/g, "").replace(/<!--[\s\S]*?-->/g, "").replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, (_, c) => c.replace(/[<&]/g, (ch: string) => (ch === "<" ? "&lt;" : "&amp;")));
  if (html) s = s.replace(/<!DOCTYPE[^>]*>/gi, "");
  const root: XmlNode = { name: "#root", attrs: {}, children: [], text: "" };
  const stack: XmlNode[] = [root];
  const tagRe = /<(\/?)([\w:.-]+)((?:[^>"']|"[^"]*"|'[^']*')*?)(\/?)>|([^<]+)/g;
  let m: RegExpExecArray | null;
  while ((m = tagRe.exec(s))) {
    const top = stack[stack.length - 1]!;
    if (m[5] !== undefined) {
      top.text += decodeEntities(m[5]);
      continue;
    }
    const closing = m[1] === "/";
    const name = (html ? m[2]!.toLowerCase() : m[2]!);
    const selfClose = m[4] === "/" || (html && VOID_HTML.has(name));
    if (closing) {
      // Pop to the matching open tag (tolerant of unclosed HTML tags).
      for (let i = stack.length - 1; i > 0; i--) {
        if (stack[i]!.name === name) {
          stack.length = i;
          break;
        }
      }
    } else {
      if (html) while (stack.length > 1 && impliedClose(name, stack[stack.length - 1]!.name)) stack.pop();
      const parent = stack[stack.length - 1]!;
      const node: XmlNode = { name, attrs: parseAttrs(m[3]!), children: [], text: "" };
      parent.children.push(node);
      if (!selfClose) stack.push(node);
    }
  }
  return root;
}

/** Depth-first find of elements by tag name. */
export function findAll(node: XmlNode, name: string): XmlNode[] {
  const out: XmlNode[] = [];
  const walk = (n: XmlNode): void => {
    for (const c of n.children) {
      if (c.name === name) out.push(c);
      walk(c);
    }
  };
  walk(node);
  return out;
}

/** Full text content of a node including descendants (HTML cell text). */
export function innerText(node: XmlNode): string {
  let out = node.text;
  for (const c of node.children) out += innerText(c);
  return out.replace(/\s+/g, " ").trim();
}
