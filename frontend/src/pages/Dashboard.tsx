import { useState, type FormEvent } from "react";
import { Link, useNavigate } from "react-router-dom";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { ArrowRight, FileText, FolderPlus, MessageSquareWarning, Plus } from "lucide-react";
import { toast } from "sonner";
import { api, type Overview, type PathStep, type Progress, type Project, type System } from "@/lib/api";
import { useAuth } from "@/lib/auth";
import { AppShell } from "@/components/shell/AppShell";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Dialog, DialogContent } from "@/components/ui/dialog";
import { Input, Label, Select, Textarea } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { EmptyPanel, ErrorBanner, FrameworkBadge, MicroLabel, ProgressMeter, SystemDot } from "@/components/kb/Bits";

function ProjectCard({ p }: { p: Project }) {
  return (
    <Link to={`/projects/${p.slug}`} className="group block rounded-xl focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2">
      <Card className="flex h-full flex-col p-6 transition-shadow group-hover:shadow-lift">
        <div className="flex flex-wrap items-center justify-between gap-x-3 gap-y-1.5">
          <div className="flex min-w-0 items-center gap-2">
            <SystemDot system={p.system} label={false} />
            <span className="break-words text-base font-semibold">{p.name}</span>
          </div>
          <FrameworkBadge framework={p.framework} system={p.system} />
        </div>
        <p className="mt-2 line-clamp-2 flex-1 text-sm text-muted-foreground">{p.description || "No description yet."}</p>
        <div className="mt-5 flex items-center gap-4 text-[12px] text-muted-foreground">
          <span className="inline-flex items-center gap-1.5"><FileText className="h-3.5 w-3.5" aria-hidden />{p.doc_count} docs</span>
          <span className="flex flex-1 items-center gap-2">
            <span className="whitespace-nowrap">Onboarding {p.checklist.completed}/{p.checklist.total}</span>
            <ProgressMeter value={p.checklist.percent} label={false} className="flex-1" />
          </span>
        </div>
      </Card>
    </Link>
  );
}

function NewProjectDialog({ open, onOpenChange }: { open: boolean; onOpenChange: (o: boolean) => void }) {
  const qc = useQueryClient();
  const navigate = useNavigate();
  const [name, setName] = useState("");
  const [system, setSystem] = useState<System>("modern");
  const [description, setDescription] = useState("");
  const [repo, setRepo] = useState("");
  const create = useMutation({
    mutationFn: () => api<Project>("/projects", { body: { name, system, description, repo: repo || null } }),
    onSuccess: (p) => {
      qc.invalidateQueries({ queryKey: ["projects"] });
      qc.invalidateQueries({ queryKey: ["overview"] });
      toast.success(`${p.name} created. Now select its code folder.`);
      onOpenChange(false);
      setName(""); setDescription(""); setRepo("");
      navigate(`/ingest?project=${encodeURIComponent(p.slug)}&new=1`);
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : "Could not create the project"),
  });
  const submit = (e: FormEvent) => { e.preventDefault(); create.mutate(); };
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent title="New project" description="Step 1 of 2. Name the project; next you'll select its code folder so DevAtlas can analyse it.">
        <form onSubmit={submit} className="space-y-4">
          <div>
            <Label htmlFor="np-name">Name</Label>
            <Input id="np-name" required value={name} onChange={(e) => setName(e.target.value)} placeholder="Reporting.Service" />
          </div>
          <div>
            <Label htmlFor="np-system">System</Label>
            <Select id="np-system" value={system} onChange={(e) => setSystem(e.target.value as System)}>
              <option value="modern">Modern .NET (.NET 8)</option>
              <option value="legacy">Legacy .NET Framework (4.8)</option>
            </Select>
          </div>
          <div>
            <Label htmlFor="np-desc">Description</Label>
            <Textarea id="np-desc" value={description} onChange={(e) => setDescription(e.target.value)} placeholder="What does it do, and who calls it?" />
          </div>
          <div>
            <Label htmlFor="np-repo">Repository (optional)</Label>
            <Input id="np-repo" value={repo} onChange={(e) => setRepo(e.target.value)} placeholder="git.internal/team/repo" />
          </div>
          <div className="flex justify-end gap-2 pt-2">
            <Button type="button" variant="secondary" onClick={() => onOpenChange(false)}>Cancel</Button>
            <Button type="submit" loading={create.isPending} disabled={name.trim().length < 2}>Create and add code</Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}

export default function Dashboard() {
  const { user, canEdit } = useAuth();
  const [creating, setCreating] = useState(false);
  const projects = useQuery({ queryKey: ["projects"], queryFn: () => api<Project[]>("/projects") });
  const overview = useQuery({ queryKey: ["overview"], queryFn: () => api<Overview>("/overview") });
  const path = useQuery({ queryKey: ["path"], queryFn: () => api<PathStep[]>("/path") });
  const progress = useQuery({ queryKey: ["progress"], queryFn: () => api<Progress>("/progress") });

  const total = path.data?.length ?? 0;
  const done = progress.data?.steps.length ?? 0;
  const pct = total ? (done / total) * 100 : 0;
  const nextStep = path.data?.find((s) => !progress.data?.steps.includes(s.step));
  const first = user?.name.split(" ")[0] ?? "";

  return (
    <AppShell>
      <section className="rounded-2xl border border-border bg-gradient-to-br from-accent via-accent/40 to-card p-4 sm:p-6">
        <MicroLabel className="text-primary">Welcome, {first}</MicroLabel>
        <h1 className="mt-2 text-[28px] font-bold leading-tight tracking-tight">Pick up where the team left off.</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          {total ? `${total - done} of ${total} learning path steps left across both systems.` : "Loading your learning path…"}
          {nextStep && <> Next up: <Link className="font-medium text-primary hover:underline" to="/learning-path">{nextStep.title}</Link>.</>}
        </p>
        <div className="mt-4 flex flex-col gap-3 sm:flex-row sm:items-center">
          <ProgressMeter value={pct} className="max-w-xs flex-1" />
          <div className="flex gap-2">
            <Link to="/learning-path"><Button size="sm" variant="secondary">Learning path <ArrowRight /></Button></Link>
            {overview.data?.start_here[0] && <Link to={`/article/${overview.data.start_here[0].slug}`}><Button size="sm" variant="ghost">Start here</Button></Link>}
          </div>
        </div>
      </section>

      {overview.data && (
        <section className="mt-6 grid gap-4 md:grid-cols-2">
          {overview.data.systems.map((s) => (
            <Card key={s.key} className="p-5">
              <div className="flex items-center justify-between gap-2">
                <SystemDot system={s.key} className="text-sm font-semibold" />
                <FrameworkBadge framework={s.framework} system={s.key} />
              </div>
              <p className="mt-2 text-sm text-muted-foreground">{s.summary}</p>
              <div className="mt-3 font-mono text-[11px] text-muted-foreground">{s.projects} projects · {s.articles} docs</div>
            </Card>
          ))}
        </section>
      )}

      <section className="mt-12">
        <div className="mb-4 flex items-center justify-between gap-3">
          <h2 className="text-xl font-bold tracking-tight">Projects</h2>
          {canEdit ? (
            <Button onClick={() => setCreating(true)}><Plus /> New project</Button>
          ) : (
            <Link to="/feedback" className="inline-flex items-center gap-1.5 text-[13px] text-muted-foreground hover:text-foreground">
              <MessageSquareWarning className="h-4 w-4" aria-hidden /> read-only · suggest a change
            </Link>
          )}
        </div>
        {projects.isError && <ErrorBanner error={projects.error} onRetry={() => projects.refetch()} />}
        {projects.isLoading && (
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {Array.from({ length: 6 }, (_, i) => <Skeleton key={i} className="h-44 rounded-xl" />)}
          </div>
        )}
        {projects.data && projects.data.length === 0 && (
          <EmptyPanel icon={FolderPlus} title="No projects yet" text="Create the first project, or import an existing .NET codebase to generate docs."
            action={canEdit ? <Button onClick={() => setCreating(true)}><Plus /> New project</Button> : undefined} />
        )}
        {projects.data && projects.data.length > 0 && (["legacy", "modern"] as const).map((sys) => {
          const list = projects.data.filter((p) => p.system === sys);
          if (!list.length) return null;
          return (
            <div key={sys} className="mb-8">
              <MicroLabel className="mb-3"><SystemDot system={sys} /></MicroLabel>
              <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
                {list.map((p) => <ProjectCard key={p.slug} p={p} />)}
              </div>
            </div>
          );
        })}
      </section>
      {canEdit && <NewProjectDialog open={creating} onOpenChange={setCreating} />}
    </AppShell>
  );
}
