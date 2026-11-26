import { Fragment, type ReactNode } from "react";
import { AlertOctagon, AlertTriangle, ArrowRight, Info } from "lucide-react";
import type { Block } from "@/lib/api";
import { slugify } from "@/lib/markdown";
import { cn } from "@/lib/utils";
import { CodeBlock } from "./CodeBlock";
import { SplitCompare } from "./SplitCompare";

/** Inline formatting: `code` and **bold** only. Article text is data, never HTML. */
export function Inline({ text }: { text: string }) {
  const parts: ReactNode[] = [];
  const rx = /(`[^`]+`|\*\*[^*]+\*\*)/g;
  let last = 0;
  let m: RegExpExecArray | null;
  let k = 0;
  while ((m = rx.exec(text))) {
    if (m.index > last) parts.push(text.slice(last, m.index));
    const tok = m[0];
    parts.push(tok.startsWith("`") ? <code key={k++} className="inline-code">{tok.slice(1, -1)}</code> : <strong key={k++} className="font-semibold">{tok.slice(2, -2)}</strong>);
    last = m.index + tok.length;
  }
  if (last < text.length) parts.push(text.slice(last));
  return <>{parts}</>;
}

const CALLOUT = {
  info: { icon: Info, cls: "border-primary/25 bg-accent/60", iconCls: "text-primary", label: "Standard" },
  warn: { icon: AlertTriangle, cls: "border-legacy/30 bg-legacy-soft/70", iconCls: "text-legacy-foreground", label: "Heads up" },
  danger: { icon: AlertOctagon, cls: "border-destructive/30 bg-destructive/5", iconCls: "text-destructive", label: "Risk" },
} as const;

export function headingId(text: string) {
  return `h-${slugify(text)}`;
}

export function BlockView({ block }: { block: Block }) {
  switch (block.type) {
    case "p":
      return <p><Inline text={block.text} /></p>;
    case "h2":
      return <h2 id={headingId(block.text)}>{block.text}</h2>;
    case "ul":
      return <ul>{block.items.map((it, i) => <li key={i}><Inline text={it} /></li>)}</ul>;
    case "ol":
      return <ol>{block.items.map((it, i) => <li key={i}><Inline text={it} /></li>)}</ol>;
    case "code":
      return <CodeBlock className="my-6" code={block.code} lang={block.lang} filename={block.filename} />;
    case "callout": {
      const c = CALLOUT[block.tone] ?? CALLOUT.info;
      const Icon = c.icon;
      return (
        <aside className={cn("my-6 flex gap-3 rounded-xl border px-4 py-3.5 text-[15px] leading-relaxed", c.cls)}>
          <Icon className={cn("mt-1 h-4 w-4 shrink-0", c.iconCls)} aria-label={c.label} />
          <div>
            {block.title && <div className="font-semibold">{block.title}</div>}
            {block.text && <div className="text-foreground/85"><Inline text={block.text} /></div>}
          </div>
        </aside>
      );
    }
    case "table":
      return (
        <div className="my-6 overflow-x-auto rounded-xl border border-border">
          <table className="w-full text-left text-sm">
            <thead className="bg-secondary/60">
              <tr>{block.columns.map((c, i) => <th key={i} scope="col" className="px-3 py-2 font-semibold">{c}</th>)}</tr>
            </thead>
            <tbody>
              {block.rows.map((r, i) => (
                <tr key={i} className="border-t border-border">
                  {r.map((c, j) => <td key={j} className="px-3 py-2 align-top text-foreground/85"><Inline text={c} /></td>)}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      );
    case "figure":
      return (
        <figure className="my-6 rounded-xl border border-border bg-secondary/40 p-4">
          <div className="flex flex-wrap items-center gap-2">
            {block.nodes.map((n, i) => (
              <Fragment key={i}>
                {i > 0 && <ArrowRight className="h-3.5 w-3.5 text-muted-foreground" aria-hidden />}
                <span className="rounded-lg border border-border bg-card px-2.5 py-1 font-mono text-[12px] shadow-sm">{n}</span>
              </Fragment>
            ))}
          </div>
          {block.caption && <figcaption className="mt-3 text-[13px] text-muted-foreground">{block.caption}</figcaption>}
        </figure>
      );
    case "compare":
      return <SplitCompare className="my-6" title={block.title} note={block.note} legacy={block.legacy} modern={block.modern} />;
    default:
      return null;
  }
}

export function BlockRenderer({ blocks }: { blocks: Block[] }) {
  return <div className="prose-doc">{blocks.map((b, i) => <BlockView key={i} block={b} />)}</div>;
}
