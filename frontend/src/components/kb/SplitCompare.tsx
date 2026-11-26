import type { CodeSample } from "@/lib/api";
import { cn } from "@/lib/utils";
import { CopyButton } from "./CodeBlock";

function Pane({ side, sample, label }: { side: "legacy" | "modern"; sample: CodeSample; label?: string }) {
  return (
    <div className="min-w-0 bg-code text-code-foreground">
      <div className="flex h-9 items-center justify-between gap-2 border-b border-white/10 px-3">
        <div className="flex min-w-0 items-center gap-2">
          <span aria-hidden className={cn("h-2 w-2 shrink-0 rounded-full", side === "legacy" ? "bg-legacy" : "bg-primary")} />
          <span className="text-[10px] font-semibold uppercase tracking-[0.1em] text-code-foreground/80">{label ?? (side === "legacy" ? "Legacy .NET Framework" : "Modern .NET")}</span>
          {sample.filename && <span className="truncate font-mono text-[11px] text-code-foreground/50">{sample.filename}</span>}
        </div>
        <CopyButton text={sample.code} label={`Copy ${side} code`} />
      </div>
      <pre className="overflow-x-auto p-4 font-mono text-[12.5px] leading-[1.6]" tabIndex={0}>
        <code>{sample.code}</code>
      </pre>
    </div>
  );
}

/** The signature legacy-vs-modern two-column card. */
export function SplitCompare({ legacy, modern, title, note, labels, className }: {
  legacy: CodeSample; modern: CodeSample; title?: string; note?: string; labels?: [string, string]; className?: string;
}) {
  return (
    <figure className={cn("overflow-hidden rounded-xl border border-border shadow-soft", className)}>
      {(title || note) && (
        <figcaption className="border-b border-border bg-card px-4 py-3">
          {title && <div className="text-sm font-semibold">{title}</div>}
          {note && <div className="mt-0.5 text-[13px] text-muted-foreground">{note}</div>}
        </figcaption>
      )}
      <div className="grid gap-px bg-white/10 md:grid-cols-2">
        <Pane side="legacy" sample={legacy} label={labels?.[0]} />
        <Pane side="modern" sample={modern} label={labels?.[1]} />
      </div>
    </figure>
  );
}
