import { Link } from "react-router-dom";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Check, Clock, FileText } from "lucide-react";
import { toast } from "sonner";
import { api, type Checklist, type ChecklistProgress } from "@/lib/api";
import { cn } from "@/lib/utils";
import { Card } from "@/components/ui/card";
import { CodeBlock } from "./CodeBlock";
import { ErrorBanner, ListSkeleton, MicroLabel, ProgressMeter } from "./Bits";

export function useChecklist(slug: string) {
  return useQuery({ queryKey: ["checklist", slug], queryFn: () => api<Checklist>(`/projects/${slug}/checklist`) });
}

export function useTickStep(slug: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ step, done }: { step: string; done: boolean }) =>
      api<{ step: string; done: boolean; progress: ChecklistProgress }>(`/projects/${slug}/checklist/step`, { body: { step, done } }),
    onMutate: async ({ step, done }) => {
      await qc.cancelQueries({ queryKey: ["checklist", slug] });
      const prev = qc.getQueryData<Checklist>(["checklist", slug]);
      if (prev) {
        qc.setQueryData<Checklist>(["checklist", slug], {
          ...prev,
          phases: prev.phases.map((ph) => {
            const steps = ph.steps.map((s) => (s.key === step ? { ...s, done } : s));
            return { ...ph, steps, completed: steps.filter((s) => s.done).length };
          }),
        });
      }
      return { prev };
    },
    onError: (e, _v, ctx) => {
      if (ctx?.prev) qc.setQueryData(["checklist", slug], ctx.prev);
      toast.error(e instanceof Error ? e.message : "Could not save that step");
    },
    onSuccess: (res) => {
      qc.setQueryData<Checklist>(["checklist", slug], (c) => (c ? { ...c, progress: res.progress } : c));
      qc.invalidateQueries({ queryKey: ["projects"] });
      if (res.done) toast.success("Step saved");
    },
  });
}

export function CheckCircle({ done, onClick, label }: { done: boolean; onClick: () => void; label: string }) {
  return (
    <button
      type="button"
      role="checkbox"
      aria-checked={done}
      aria-label={label}
      onClick={onClick}
      className={cn(
        "flex h-5 w-5 shrink-0 items-center justify-center rounded-full border-[1.5px] transition-colors",
        done ? "border-primary bg-primary text-primary-foreground" : "border-input bg-card hover:border-primary",
      )}
    >
      {done && <Check className="h-3 w-3" strokeWidth={3} />}
    </button>
  );
}

export function ProjectChecklist({ slug }: { slug: string }) {
  const q = useChecklist(slug);
  const tick = useTickStep(slug);
  if (q.isLoading) return <ListSkeleton rows={5} />;
  if (q.isError) return <ErrorBanner error={q.error} onRetry={() => q.refetch()} />;
  const c = q.data!;
  return (
    <div className="space-y-6">
      <Card className="flex flex-col gap-3 p-5 sm:flex-row sm:items-center">
        <div className="flex-1">
          <div className="text-sm font-semibold">Your onboarding for {c.project.name}</div>
          <div className="text-[13px] text-muted-foreground">{c.progress.completed} of {c.progress.total} steps done. Only you see your ticks.</div>
        </div>
        <ProgressMeter value={c.progress.percent} className="sm:w-56" />
      </Card>
      {c.phases.map((ph, pi) => (
        <section key={ph.key}>
          <div className="mb-3 flex items-baseline justify-between">
            <MicroLabel>Phase {pi + 1} · {ph.title}</MicroLabel>
            <span className="font-mono text-[11px] text-muted-foreground">{ph.completed}/{ph.total}</span>
          </div>
          <div className="space-y-3">
            {ph.steps.map((s) => (
              <Card key={s.key} className={cn("p-5", s.done && "bg-secondary/40")}>
                <div className="flex gap-3">
                  <CheckCircle done={s.done} label={`Mark "${s.title}" ${s.done ? "not done" : "done"}`} onClick={() => tick.mutate({ step: s.key, done: !s.done })} />
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
                      <span className={cn("text-[15px] font-semibold", s.done && "text-muted-foreground line-through decoration-1")}>{s.title}</span>
                      <span className="inline-flex items-center gap-1 text-[12px] text-muted-foreground"><Clock className="h-3 w-3" aria-hidden />{s.est}</span>
                    </div>
                    <p className="mt-1 text-sm text-muted-foreground">{s.detail}</p>
                    <p className="mt-2 text-[13px]"><span className="font-medium">Done when:</span> <span className="text-muted-foreground">{s.verify}</span></p>
                    {s.command && <CodeBlock className="mt-3" code={s.command} lang="shell" filename="terminal" />}
                    {(s.docs.length > 0 || s.links.length > 0) && (
                      <div className="mt-3 flex flex-wrap gap-2">
                        {s.docs.map((d) => (
                          <Link key={d.slug} to={`/article/${d.slug}`} className="inline-flex h-7 items-center gap-1.5 rounded-full border border-border bg-card px-2.5 text-[12px] font-medium hover:bg-secondary">
                            <FileText className="h-3 w-3 text-primary" aria-hidden />{d.title}
                          </Link>
                        ))}
                        {s.links.map((l) => (
                          <Link key={l.to} to={l.to} className="inline-flex h-7 items-center rounded-full px-2.5 text-[12px] font-medium text-primary hover:bg-accent">{l.label} →</Link>
                        ))}
                      </div>
                    )}
                  </div>
                </div>
              </Card>
            ))}
          </div>
        </section>
      ))}
    </div>
  );
}
