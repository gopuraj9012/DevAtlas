import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { AlertTriangle, CheckCircle2 } from "lucide-react";
import { api, type DeployStage, type DeploymentFlow, type Deployments as DeploymentsT } from "@/lib/api";
import { AppShell } from "@/components/shell/AppShell";
import { Card } from "@/components/ui/card";
import { Chip, ErrorBanner, ListSkeleton, MicroLabel, PageHeader, SystemDot } from "@/components/kb/Bits";
import { CodeBlock } from "@/components/kb/CodeBlock";

function StageSteps({ stage }: { stage?: DeployStage }) {
  if (!stage || !stage.steps.length) return <p className="text-[13px] text-muted-foreground">No step for this stage.</p>;
  return (
    <ol className="space-y-4">
      {stage.steps.map((s) => (
        <li key={s.title}>
          <div className="text-sm font-semibold">{s.title}</div>
          <p className="text-[13px] text-muted-foreground">{s.detail}</p>
          {s.command && <CodeBlock className="mt-2" code={s.command} lang={s.lang} filename="terminal" />}
          {s.checkpoint && <p className="mt-2 flex gap-1.5 text-[13px] text-success"><CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0" aria-hidden /><span><span className="font-medium">Checkpoint:</span> {s.checkpoint}</span></p>}
          {s.warn && <p className="mt-2 flex gap-1.5 text-[13px] text-legacy-foreground"><AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" aria-hidden />{s.warn}</p>}
        </li>
      ))}
    </ol>
  );
}

function FlowFacts({ f }: { f: DeploymentFlow }) {
  return (
    <Card className="p-5">
      <div className="flex items-center gap-2"><SystemDot system={f.system} label={false} /><h2 className="font-semibold">{f.name}</h2></div>
      <p className="mt-1 text-[13px] text-muted-foreground">{f.summary}</p>
      <dl className="mt-4 grid grid-cols-2 gap-3 text-[13px]">
        {[["Cadence", f.cadence], ["Duration", f.duration], ["Rollback window", f.rollback_window], ["Downtime", f.downtime]].map(([k, v]) => (
          <div key={k}><MicroLabel className="mb-0.5">{k}</MicroLabel><dd>{v}</dd></div>
        ))}
        <div className="col-span-2"><MicroLabel className="mb-0.5">Stack</MicroLabel><dd className="font-mono text-[12px]">{f.stack}</dd></div>
      </dl>
    </Card>
  );
}

export default function Deployments() {
  const [mode, setMode] = useState<"compare" | "legacy" | "modern">("compare");
  const q = useQuery({ queryKey: ["deployments"], queryFn: () => api<DeploymentsT>("/deployments") });
  const legacy = q.data?.flows.find((f) => f.system === "legacy");
  const modern = q.data?.flows.find((f) => f.system === "modern");
  const flows = mode === "compare" ? [legacy, modern] : [mode === "legacy" ? legacy : modern];

  return (
    <AppShell wide={mode === "compare"}>
      <PageHeader eyebrow="Runbooks" title="Deploy flows" description="How each system reaches production, stage by stage, and how to roll it back." />
      <div className="mb-6 flex gap-2" role="group" aria-label="View">
        <Chip active={mode === "compare"} onClick={() => setMode("compare")}>Compare</Chip>
        <Chip active={mode === "legacy"} onClick={() => setMode("legacy")}><SystemDot system="legacy" short /></Chip>
        <Chip active={mode === "modern"} onClick={() => setMode("modern")}><SystemDot system="modern" short /></Chip>
      </div>
      {q.isLoading && <ListSkeleton rows={6} />}
      {q.isError && <ErrorBanner error={q.error} onRetry={() => q.refetch()} />}
      {q.data && (
        <>
          <div className={mode === "compare" ? "grid gap-4 md:grid-cols-2" : ""}>{flows.map((f) => f && <FlowFacts key={f.slug} f={f} />)}</div>
          <div className="mt-8 space-y-4">
            {q.data.stages.map((st, i) => (
              <section key={st.key} className="rounded-xl border border-border bg-card shadow-soft">
                <div className="flex items-center gap-3 border-b border-border px-5 py-3">
                  <span className="flex h-6 w-6 items-center justify-center rounded-full bg-accent font-mono text-[11px] font-semibold text-primary">{i + 1}</span>
                  <h3 className="font-semibold">{st.label}</h3>
                </div>
                <div className={mode === "compare" ? "grid divide-y divide-border md:grid-cols-2 md:divide-x md:divide-y-0" : ""}>
                  {flows.map((f) => f && (
                    <div key={f.slug} className="min-w-0 p-5">
                      {mode === "compare" && <SystemDot system={f.system} short className="micro-label mb-3" />}
                      <StageSteps stage={f.stages.find((s) => s.key === st.key)} />
                    </div>
                  ))}
                </div>
              </section>
            ))}
          </div>
        </>
      )}
    </AppShell>
  );
}
