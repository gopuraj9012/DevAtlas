import { useState } from "react";
import { Check, Copy } from "lucide-react";
import { cn } from "@/lib/utils";

export function CopyButton({ text, label = "Copy code" }: { text: string; label?: string }) {
  const [done, setDone] = useState(false);
  return (
    <button
      type="button"
      aria-label={done ? "Copied" : label}
      onClick={async () => {
        try {
          await navigator.clipboard.writeText(text);
          setDone(true);
          setTimeout(() => setDone(false), 1500);
        } catch {
          /* clipboard unavailable */
        }
      }}
      className="rounded-md p-1.5 text-code-foreground/60 transition-colors hover:bg-white/10 hover:text-code-foreground focus-visible:ring-offset-code"
    >
      {done ? <Check className="h-3.5 w-3.5" /> : <Copy className="h-3.5 w-3.5" />}
    </button>
  );
}

export function CodeBlock({ code, lang, filename, className, header }: { code: string; lang?: string; filename?: string; className?: string; header?: React.ReactNode }) {
  return (
    <figure className={cn("overflow-hidden rounded-xl bg-code text-code-foreground", className)}>
      <div className="flex h-9 items-center justify-between gap-2 border-b border-white/10 px-3">
        <div className="flex min-w-0 items-center gap-2 font-mono text-[11px] text-code-foreground/70">
          {header ?? <span className="truncate">{filename || lang || "code"}</span>}
        </div>
        <div className="flex items-center gap-1">
          {lang && <span className="font-mono text-[10px] uppercase tracking-wider text-code-foreground/40" aria-label={`Language: ${lang}`}>{lang}</span>}
          <CopyButton text={code} />
        </div>
      </div>
      <pre className="overflow-x-auto p-4 font-mono text-[13px] leading-[1.6]" tabIndex={0}>
        <code>{code}</code>
      </pre>
    </figure>
  );
}
