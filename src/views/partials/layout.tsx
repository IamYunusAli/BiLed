import { h, type Child, type Html } from '../jsx.js';
import type { PageContext } from '../context.js';
import { Document } from './common.js';
import { Header } from './header.js';

/** A signed-in app page: header plus <main>. */
export function AppPage({ ctx, title, mainClass, children }: { ctx: PageContext; title: string; mainClass: string; children?: Child }): Html {
  return (
    <Document title={title}>
      <div class="page">
        <Header ctx={ctx} />
        <main class={mainClass}>{children}</main>
      </div>
    </Document>
  );
}

export interface Crumb {
  label: string;
  href?: string;
}

/** "Organizations › Org › Page"; the last crumb is the current page. */
export function Breadcrumb({ items }: { items: Crumb[] }): Html {
  const last = items.length - 1;
  return (
    <nav class="breadcrumb" aria-label="Breadcrumb">
      <ol>
        {items.map((item, i) => [
          i === last ? <li aria-current="page">{item.label}</li> : <li><a href={item.href}>{item.label}</a></li>,
          i === last ? null : <li aria-hidden="true">›</li>,
        ])}
      </ol>
    </nav>
  );
}
