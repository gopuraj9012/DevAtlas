import { Link } from "react-router-dom";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { ArrowRight } from "lucide-react";
import { toast } from "sonner";
import { api, type PathStep, type Progress } from "@/lib/api";
import { cn } from "@/lib/utils";
import { AppShell } from "@/components/shell/AppShell";
import { Card } from "@/components/ui/card";
import { ErrorBanner, ListSkeleton, PageHeader, ProgressMeter, SystemTag } from "@/components/kb/Bits";
import { CheckCircle } from "@/components/kb/ProjectChecklist";

export default function LearningPath() {
  const qc = useQueryClient();
  const path = useQuery({ queryKey: ["path"], queryFn: () => api<PathStep[]>("/path") });
  const progress = useQuery({ queryKey: ["progress"], queryFn: () => api<Progress>("/progress") });
  const toggle = useMutation({
    mutationFn: (step: number) => api<Progress>("/progress/step", { body: { step } }),
    onMutate: async (step) => {
      const prev = qc.getQueryData<Progress>(["progress"]);
      if (prev) qc.setQueryData<Progress>(["progress"], { ...prev, steps: prev.steps.includes(step) ? prev.steps.filter((s) => s !== step) : [...prev.steps, step] });
      return { prev };
    },
    onError: (e, _s, ctx) => { if (ctx?.prev) qc.setQueryData(["progress"], ctx.prev); toast.error(e instanceof Error ? e.message : "Could not save"); },
    onSuccess: (p) => qc.setQueryData(["progress"], p),
  });
  const done = new Set(progress.data?.steps ?? []);
  const total = path.data?.length ?? 0;

  return (
    <AppShell>
      <PageHeader eyebrow="Onboarding" title="Learning path" description="The team-wide ramp across both systems. Each project also has its own checklist on its project page." />
      <Card className="mb-6 p-5">
        <div className="mb-2 text-sm font-semibold">{done.size} of {total} steps complete</div>
        <ProgressMeter value={total ? (done.size / total) * 100 : 0} />
      </Card>
      {(path.isLoading || progress.isLoading) && <ListSkeleton rows={8} />}
      {path.isError && <ErrorBanner error={path.error} onRetry={() => path.refetch()} />}
      <ol className="space-y-2">
        {path.data?.map((s) => {
          const isDone = done.has(s.step);
          return (
            <li key={s.step}>
              <Card className={cn("flex items-start gap-4 p-4", isDone && "bg-secondary/40")}>
                <CheckCircle done={isDone} label={`Mark step ${s.step} ${isDone ? "not done" : "done"}`} onClick={() => toggle.mutate(s.step)} />
                <span className="w-6 shrink-0 font-mono text-[12px] font-semibold text-muted-foreground">{String(s.step).padStart(2, "0")}</span>
                <div className="min-w-0 flex-1">
                  <div className={cn("font-semibold", isDone && "text-muted-foreground line-through decoration-1")}>{s.title}</div>
                  <div className="text-[13px] text-muted-foreground">{s.detail}</div>
                </div>
                <SystemTag system={s.system} />
                <Link to={`/article/${s.article}`} className="hidden items-center gap-1 text-[13px] font-medium text-primary hover:underline sm:inline-flex">Read <ArrowRight className="h-3.5 w-3.5" /></Link>
              </Card>
            </li>
          );
        })}
      </ol>
    </AppShell>
  );
}
