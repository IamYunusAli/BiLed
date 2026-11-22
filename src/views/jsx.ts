// A minimal server-side JSX runtime: components are plain functions that return escaped HTML.
// - Every string child and attribute value is HTML-escaped (& < > " ' all become entities).
// - Trusted markup (the SVG icon set) must be wrapped in raw(); nothing else bypasses escaping.
// - No client-side framework: the browser receives plain HTML.
// tsconfig: "jsx": "react", "jsxFactory": "h", "jsxFragmentFactory": "Fragment".

const VOID_ELEMENTS = new Set(['area', 'base', 'br', 'col', 'embed', 'hr', 'img', 'input', 'link', 'meta', 'source', 'track', 'wbr']);

const ESCAPES: Record<string, string> = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&#34;', "'": '&#39;' };

export const escapeHtml = (text: string): string => text.replace(/[&<>"']/g, (c) => ESCAPES[c] ?? c);

/** Rendered, already-safe HTML. Only h() and raw() create it. */
export class Html {
  readonly value: string;
  constructor(value: string) {
    this.value = value;
  }
  toString(): string {
    return this.value;
  }
}

/** Marks a string as trusted HTML. Never pass user input. */
export const raw = (html: string): Html => new Html(html);

/** Renders nothing. */
export const nothing = raw('');

export type Child = Html | string | number | boolean | null | undefined | readonly Child[];
type AttributeValue = string | number | boolean | null | undefined;

function renderChildren(child: Child, out: string[]): void {
  if (child === null || child === undefined || typeof child === 'boolean') return;
  if (child instanceof Html) out.push(child.value);
  else if (Array.isArray(child)) for (const c of child as readonly Child[]) renderChildren(c, out);
  else out.push(escapeHtml(String(child)));
}

type ComponentFn = (props: Record<string, unknown>) => Html;

/** JSX factory. Attributes: true -> bare attribute, false/null/undefined -> omitted. */
export function h(tag: string | ((props: never) => Html), props: Record<string, unknown> | null, ...children: Child[]): Html {
  if (typeof tag === 'function') {
    return (tag as unknown as ComponentFn)({ ...props, children: children.length <= 1 ? children[0] : children });
  }
  let html = `<${tag}`;
  for (const [name, value] of Object.entries(props ?? {})) {
    if (name === 'children' || value === false || value === null || value === undefined) continue;
    html += value === true ? ` ${name}` : ` ${name}="${escapeHtml(String(value))}"`;
  }
  html += '>';
  if (VOID_ELEMENTS.has(tag)) return new Html(html);
  const out: string[] = [html];
  renderChildren(children, out);
  out.push(`</${tag}>`);
  return new Html(out.join(''));
}

export function Fragment({ children }: { children?: Child }): Html {
  const out: string[] = [];
  renderChildren(children, out);
  return new Html(out.join(''));
}

declare global {
  namespace JSX {
    interface Element extends Html {}
    interface ElementChildrenAttribute {
      children: unknown;
    }
    interface IntrinsicElements {
      [tag: string]: { [attribute: string]: AttributeValue | Child; children?: Child };
    }
  }
}
