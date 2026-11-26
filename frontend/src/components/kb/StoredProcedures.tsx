import { useState } from "react";
import { Link } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { ChevronDown, Database } from "lucide-react";
import { api, type Procedure, type Procedures } from "@/lib/api";
import { cn } from "@/lib/utils";
import { Card } from "@/components/ui/card";
import { SplitCompare } from "./SplitCompare";
import { EmptyPanel, ErrorBanner, ListSkeleton, MicroLabel, Pill, ProgressMeter, Stat } from "./Bits";

const CRIT_TONE = { critical: "red", high: "amber", medium: "neutral" } as const;
const STATUS = { rewritten: { tone: "green", label: "Rewritten" }, partial: { tone: "amber", label: "Partly migrated" }, "not-started": { tone: "red", label: "Not started" } } as const;

function ProcCard({ p }: { p: Procedure }) {
  const [open, setOpen] = useState(false);
  return (
    <Card className="overflow-hidden">
      <button type="button" onClick={() => setOpen((o) => !o)} aria-expanded={open} className="flex w-full items-start gap-3 p-5 text-left hover:bg-secondary/40">
        <Database className="mt-0.5 h-4 w-4 shrink-0 text-legacy-foreground" aria-hidden />
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <span className="font-mono text-[14px] font-semibold">{p.name}</span>
            <Pill tone={CRIT_TONE[p.criticality]}>{p.criticality}</Pill>
            <Pill tone={STATUS[p.status].tone}>{STATUS[p.status].label}</Pill>
          </div>
          <p className="mt-1 text-sm text-muted-foreground">{p.purpose}</p>
          <div className="mt-2 text-[12px] text-muted-foreground">Called by {p.called_by.join(", ")} · Tables {p.tables.join(", ")}</div>
        </div>
        <ChevronDown className={cn("h-4 w-4 shrink-0 text-muted-foreground transition-transform", open && "rotate-180")} aria-hidden />
      </button>
      {open && (
        <div className="space-y-4 border-t border-border p-5">
          <div className="grid gap-4 md:grid-cols-2">
            <div>
              <MicroLabel className="mb-2">Parameters</MicroLabel>
              <ul className="space-y-1 font-mono text-[12.5px]">
                {p.parameters.map((x) => <li key={x.name}>{x.name} <span className="text-muted-foreground">{x.type} · {x.direction}</span></li>)}
              </ul>
              <div className="mt-2 text-[13px]"><span className="font-medium">Returns:</span> <span className="text-muted-foreground">{p.returns}</span></div>
            </div>
            <div>
              <MicroLabel className="mb-2">Modern path</MicroLabel>
              <div className="text-sm"><span className="font-medium">{p.modern.service}</span> · <span className="font-mono text-[12.5px]">{p.modern.entry}</span></div>
              <div className="mt-1 text-[13px] text-muted-foreground">{p.modern.flow}</div>
              <div className="mt-1 text-[13px] text-muted-foreground">{p.modern.note}</div>
              <Link to={`/contracts?code=${p.contract}`} className="mt-2 inline-block text-[13px] font-medium text-primary hover:underline">Contract {p.contract} →</Link>
            </div>
          </div>
          <SplitCompare legacy={{ filename: `${p.name}.sql`, lang: p.legacy_lang, code: p.legacy_code }} modern={{ filename: p.modern.service, lang: p.modern.lang, code: p.modern.code }} />
          {p.notes.length > 0 && <ul className="list-disc space-y-1 pl-5 text-[13px] text-muted-foreground">{p.notes.map((n) => <li key={n}>{n}</li>)}</ul>}
        </div>
      )}
    </Card>
  );
}

export function StoredProcedures({ slug }: { slug: string }) {
  const q = useQuery({ queryKey: ["procedures", slug], queryFn: () => api<Procedures>(`/projects/${slug}/procedures`) });
  if (q.isLoading) return <ListSkeleton />;
  if (q.isError) return <ErrorBanner error={q.error} onRetry={() => q.refetch()} />;
  const d = q.data!;
  if (!d.procedures.length) return <EmptyPanel icon={Database} title="No stored procedures" text={d.note} />;
  return (
    <div className="space-y-4">
      <div className="grid gap-3 sm:grid-cols-4">
        <Stat label="Procedures" value={d.summary.total} />
        <Stat label="Critical" value={d.summary.critical} />
        <Stat label="Rewritten" value={d.summary.rewritten} hint={`${d.summary.partial} partly`} />
        <div className="rounded-xl border border-border bg-card p-4 shadow-soft">
          <MicroLabel>Coverage</MicroLabel>
          <ProgressMeter value={d.summary.coverage_percent} className="mt-3" />
        </div>
      </div>
      <p className="text-[13px] text-muted-foreground">{d.note}</p>
      {d.procedures.map((p) => <ProcCard key={p.name} p={p} />)}
    </div>
  );
}
