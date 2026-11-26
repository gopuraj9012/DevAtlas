import type { ReactNode } from "react";
import { AlertTriangle, RotateCw, type LucideIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import type { Scope } from "@/lib/api";
import { cn } from "@/lib/utils";

export function MicroLabel({ children, className }: { children: ReactNode; className?: string }) {
  return <div className={cn("micro-label", className)}>{children}</div>;
}

export const SYSTEM_LABEL: Record<Scope, string> = { legacy: "Legacy .NET Framework", modern: "Modern .NET", both: "Both systems" };
export const SYSTEM_SHORT: Record<Scope, string> = { legacy: "Legacy", modern: "Modern", both: "Both" };

/** The dot always travels with a text label (pass `label` false only when a label sits next to it). */
export function SystemDot({ system, label = true, short, className }: { system: Scope; label?: boolean; short?: boolean; className?: string }) {
  const dot = (cls: string) => <span aria-hidden className={cn("inline-block h-2 w-2 shrink-0 rounded-full", cls)} />;
  return (
    <span className={cn("inline-flex items-center gap-1.5", className)}>
      {system === "both" ? (
        <span className="inline-flex -space-x-0.5">{dot("bg-legacy ring-1 ring-card")}{dot("bg-primary ring-1 ring-card")}</span>
      ) : (
        dot(system === "legacy" ? "bg-legacy" : "bg-primary")
      )}
      {label ? <span>{short ? SYSTEM_SHORT[system] : SYSTEM_LABEL[system]}</span> : <span className="sr-only">{SYSTEM_LABEL[system]}</span>}
    </span>
  );
}

export function FrameworkBadge({ framework, system }: { framework: string; system: Scope }) {
  return (
    <span
      className={cn(
        "inline-flex h-5 shrink-0 items-center whitespace-nowrap rounded-full px-2 font-mono text-[11px] font-semibold",
        system === "legacy" ? "bg-legacy-soft text-legacy-foreground" : "bg-accent text-accent-foreground",
      )}
    >
      {framework}
    </span>
  );
}

type Tone = "neutral" | "violet" | "orange" | "green" | "amber" | "red";
const TONE: Record<Tone, string> = {
  neutral: "bg-secondary text-secondary-foreground",
  violet: "bg-accent text-accent-foreground",
  orange: "bg-legacy-soft text-legacy-foreground",
  green: "bg-success/10 text-success",
  amber: "bg-warning/10 text-warning",
  red: "bg-destructive/10 text-destructive",
};

export function Pill({ children, tone = "neutral", mono, className }: { children: ReactNode; tone?: Tone; mono?: boolean; className?: string }) {
  return <span className={cn("inline-flex h-5 items-center whitespace-nowrap rounded-full px-2 text-[11px] font-semibold", mono && "font-mono", TONE[tone], className)}>{children}</span>;
}

export function SystemTag({ system }: { system: Scope }) {
  return (
    <Pill tone={system === "legacy" ? "orange" : system === "modern" ? "violet" : "neutral"}>
      <SystemDot system={system} short />
    </Pill>
  );
}

export function OriginTag({ origin }: { origin?: string }) {
  if (!origin || origin === "SEED") return null;
  return <Pill tone={origin === "IMPORTED" ? "amber" : "green"} mono>{origin}</Pill>;
}

export function ProgressMeter({ value, label = true, className }: { value: number; label?: boolean; className?: string }) {
  const v = Math.max(0, Math.min(100, Math.round(value)));
  return (
    <div className={cn("flex items-center gap-2.5", className)}>
      <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-secondary" role="progressbar" aria-valuenow={v} aria-valuemin={0} aria-valuemax={100}>
        <div className="h-full rounded-full bg-primary transition-[width] duration-300" style={{ width: `${v}%` }} />
      </div>
      {label && <span className="w-9 text-right font-mono text-[11px] font-semibold text-muted-foreground">{v}%</span>}
    </div>
  );
}

export function EmptyPanel({ icon: Icon, title, text, action }: { icon: LucideIcon; title: string; text: string; action?: ReactNode }) {
  return (
    <div className="flex flex-col items-center rounded-2xl border-[1.5px] border-dashed border-border px-6 py-12 text-center">
      <div className="mb-4 flex h-12 w-12 items-center justify-center rounded-[10px] bg-accent text-primary">
        <Icon className="h-6 w-6" aria-hidden />
      </div>
      <div className="text-base font-bold">{title}</div>
      <p className="mt-1 max-w-sm text-sm text-muted-foreground">{text}</p>
      {action && <div className="mt-5">{action}</div>}
    </div>
  );
}

export function ErrorBanner({ error, onRetry }: { error: unknown; onRetry?: () => void }) {
  const msg = error instanceof Error ? error.message : "Something went wrong.";
  return (
    <div role="alert" className="flex items-center gap-3 rounded-xl border border-destructive/30 bg-destructive/5 px-4 py-3 text-sm">
      <AlertTriangle className="h-4 w-4 shrink-0 text-destructive" aria-hidden />
      <span className="flex-1 text-foreground">{msg}</span>
      {onRetry && (
        <Button variant="secondary" size="sm" onClick={onRetry}>
          <RotateCw /> Retry
        </Button>
      )}
    </div>
  );
}

export function ListSkeleton({ rows = 4, className }: { rows?: number; className?: string }) {
  return (
    <div className={cn("space-y-3", className)} aria-busy="true" aria-label="Loading">
      {Array.from({ length: rows }, (_, i) => <Skeleton key={i} className="h-16" />)}
    </div>
  );
}

export function PageHeader({ eyebrow, title, description, actions }: { eyebrow?: ReactNode; title: ReactNode; description?: ReactNode; actions?: ReactNode }) {
  return (
    <div className="mb-8 flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
      <div className="min-w-0">
        {eyebrow && <MicroLabel className="mb-2">{eyebrow}</MicroLabel>}
        <h1 className="text-[28px] font-bold leading-tight tracking-[-0.02em] sm:text-[32px]">{title}</h1>
        {description && <p className="mt-2 max-w-2xl text-[15px] text-muted-foreground">{description}</p>}
      </div>
      {actions && <div className="flex shrink-0 flex-wrap gap-2">{actions}</div>}
    </div>
  );
}

export function MetaRow({ children }: { children: ReactNode }) {
  return <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-[13px] text-muted-foreground">{children}</div>;
}

export function DottedRule() {
  return <div aria-hidden className="my-8 border-t border-dashed border-border" />;
}

export function Chip({ active, children, onClick, count }: { active?: boolean; children: ReactNode; onClick: () => void; count?: number }) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={active}
      className={cn(
        "inline-flex h-8 items-center gap-1.5 whitespace-nowrap rounded-full border px-3 text-[13px] font-medium transition-colors",
        active ? "border-primary bg-accent text-primary" : "border-border bg-card text-muted-foreground hover:bg-secondary hover:text-foreground",
      )}
    >
      {children}
      {count !== undefined && <span className="font-mono text-[11px] opacity-70">{count}</span>}
    </button>
  );
}

export function Stat({ label, value, hint }: { label: string; value: ReactNode; hint?: string }) {
  return (
    <div className="rounded-xl border border-border bg-card p-4 shadow-soft">
      <MicroLabel>{label}</MicroLabel>
      <div className="mt-1.5 text-2xl font-bold tracking-tight">{value}</div>
      {hint && <div className="mt-0.5 text-xs text-muted-foreground">{hint}</div>}
    </div>
  );
}
