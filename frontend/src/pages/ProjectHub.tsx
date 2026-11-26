import { Link, useParams, useSearchParams } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { ArrowRight, FileText, FolderX, GitBranch, Plus, UserRound } from "lucide-react";
import { api, ApiError, type ArticleSummary, type ProjectDetail } from "@/lib/api";
import { useAuth } from "@/lib/auth";
import { timeAgo } from "@/lib/utils";
import { AppShell } from "@/components/shell/AppShell";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Skeleton } from "@/components/ui/skeleton";
import { EmptyPanel, ErrorBanner, FrameworkBadge, MicroLabel, OriginTag, Pill, ProgressMeter, SystemDot } from "@/components/kb/Bits";
import { CheckCircle, ProjectChecklist, useChecklist, useTickStep } from "@/components/kb/ProjectChecklist";
import { StoredProcedures } from "@/components/kb/StoredProcedures";

const SECTION_LABEL: Record<string, string> = {
  onboarding: "Onboarding", architecture: "Architecture", standards: "Standards", data: "Data", integration: "Integration", deployment: "Deployment", operations: "Operations",
};

function DocRow({ d }: { d: ArticleSummary }) {
  return (
    <Link to={`/article/${d.slug}`} className="flex h-11 items-center gap-3 rounded-lg px-3 transition-colors hover:bg-secondary">
      <FileText className="h-4 w-4 shrink-0 text-primary" aria-hidden />
      <span className="min-w-0 flex-1 truncate text-sm font-medium">{d.title}</span>
      <OriginTag origin={d.origin} />
      <span className="hidden font-mono text-[11px] text-muted-foreground sm:inline">{d.doc_id}</span>
      <span className="hidden w-24 text-right text-[12px] text-muted-foreground md:inline">{timeAgo(d.updated)}</span>
    </Link>
  );
}

function DocGroups({ docs, sections, canEdit, system }: { docs: ArticleSummary[]; sections: string[]; canEdit: boolean; system: string }) {
  return (
    <div className="space-y-6">
      {sections.map((sec) => {
        const list = docs.filter((d) => d.section === sec);
        return (
          <section key={sec}>
            <MicroLabel className="mb-1 px-3">{SECTION_LABEL[sec] ?? sec}</MicroLabel>
            {list.length ? list.map((d) => <DocRow key={d.slug} d={d} />) : (
              <div className="px-3 py-2 text-[13px] text-muted-foreground">
                No docs in this section yet.{" "}
                {canEdit && <Link className="font-medium text-primary hover:underline" to={`/authoring?section=${sec}&system=${system}`}>Add one</Link>}
              </div>
            )}
          </section>
        );
      })}
    </div>
  );
}

function OnboardingCard({ slug, onOpen }: { slug: string; onOpen: () => void }) {
  const q = useChecklist(slug);
  const tick = useTickStep(slug);
  if (!q.data) return <Skeleton className="h-64 rounded-xl" />;
  const steps = q.data.phases.flatMap((p) => p.steps);
  const next = steps.filter((s) => !s.done).slice(0, 4);
  return (
    <Card className="p-5">
      <div className="text-sm font-semibold">Your onboarding</div>
      <ProgressMeter value={q.data.progress.percent} className="mt-3" />
      <ul className="mt-4 space-y-3">
        {(next.length ? next : steps.slice(-3)).map((s) => (
          <li key={s.key} className="flex items-start gap-2.5">
            <CheckCircle done={s.done} label={`Mark "${s.title}" ${s.done ? "not done" : "done"}`} onClick={() => tick.mutate({ step: s.key, done: !s.done })} />
            <span className="text-[13px] leading-5">{s.title}</span>
          </li>
        ))}
      </ul>
      <Button className="mt-5 w-full" onClick={onOpen}>{q.data.progress.completed === q.data.progress.total ? "Review checklist" : "Continue"} <ArrowRight /></Button>
    </Card>
  );
}

export default function ProjectHub() {
  const { slug = "" } = useParams();
  const { canEdit } = useAuth();
  const [params, setParams] = useSearchParams();
  const q = useQuery({ queryKey: ["project", slug], queryFn: () => api<ProjectDetail>(`/projects/${slug}`) });
  const p = q.data;
  const tab = params.get("tab") ?? "overview";
  const setTab = (t: string) => setParams((prev) => { prev.set("tab", t); return prev; }, { replace: true });

  if (q.isError && q.error instanceof ApiError && q.error.status === 404) {
    return (
      <AppShell>
        <EmptyPanel icon={FolderX} title="Project not found" text="It may have been renamed. Pick a project from the dashboard." action={<Link to="/dashboard"><Button>Back to dashboard</Button></Link>} />
      </AppShell>
    );
  }

  return (
    <AppShell>
      {q.isError && <ErrorBanner error={q.error} onRetry={() => q.refetch()} />}
      {q.isLoading && <div className="space-y-4"><Skeleton className="h-10 w-72" /><Skeleton className="h-9 w-full" /><Skeleton className="h-80" /></div>}
      {p && (
        <>
          <nav aria-label="Breadcrumb" className="mb-3 text-[13px] text-muted-foreground">
            <Link to="/dashboard" className="hover:text-foreground">Projects</Link> / <SystemDot system={p.system} short />
          </nav>
          <div className="mb-5 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <div className="flex flex-wrap items-center gap-3">
              <SystemDot system={p.system} label={false} className="[&>span]:h-2.5 [&>span]:w-2.5" />
              <h1 className="text-2xl font-bold tracking-tight">{p.name}</h1>
              <FrameworkBadge framework={p.framework} system={p.system} />
              <OriginTag origin={p.origin} />
            </div>
            {canEdit && <Link to={`/authoring?system=${p.system}&project=${encodeURIComponent(p.name)}`}><Button variant="secondary"><Plus /> New doc</Button></Link>}
          </div>
          <Tabs value={tab} onValueChange={setTab}>
            <TabsList>
              <TabsTrigger value="overview">Overview</TabsTrigger>
              <TabsTrigger value="checklist">Checklist</TabsTrigger>
              {p.system === "legacy" && <TabsTrigger value="procedures">Stored procs</TabsTrigger>}
              <TabsTrigger value="architecture">Architecture</TabsTrigger>
              <TabsTrigger value="standards">Standards</TabsTrigger>
              <TabsTrigger value="setup">Setup</TabsTrigger>
            </TabsList>

            <TabsContent value="overview" className="pt-6">
              <div className="grid gap-6 lg:grid-cols-[1fr_280px]">
                <div className="min-w-0 space-y-6">
                  <Card className="p-5">
                    <p className="text-[15px]">{p.description || "No description yet."}</p>
                    <div className="mt-4 flex flex-wrap gap-1.5">{p.stack.map((s) => <Pill key={s}>{s}</Pill>)}</div>
                    <div className="mt-4 flex flex-wrap gap-x-5 gap-y-2 text-[13px] text-muted-foreground">
                      {p.repo && <span className="inline-flex items-center gap-1.5"><GitBranch className="h-3.5 w-3.5" aria-hidden /><span className="font-mono">{p.repo}</span></span>}
                      <span className="inline-flex items-center gap-1.5"><UserRound className="h-3.5 w-3.5" aria-hidden />Owner: {p.owner}</span>
                    </div>
                    {p.owner_profile && <p className="mt-2 text-[13px] text-muted-foreground">Ask {p.owner_profile.name.split(" ")[0]} about: {p.owner_profile.ask_about}</p>}
                  </Card>
                  <DocGroups docs={p.docs} sections={["onboarding", "architecture", "standards", "data", "integration", "deployment", "operations"].filter((s) => p.docs.some((d) => d.section === s) || ["architecture", "standards", "onboarding"].includes(s))} canEdit={canEdit} system={p.system} />
                </div>
                <div className="lg:sticky lg:top-20 lg:self-start"><OnboardingCard slug={slug} onOpen={() => setTab("checklist")} /></div>
              </div>
            </TabsContent>
            <TabsContent value="checklist" className="pt-6"><ProjectChecklist slug={slug} /></TabsContent>
            {p.system === "legacy" && <TabsContent value="procedures" className="pt-6"><StoredProcedures slug={slug} /></TabsContent>}
            <TabsContent value="architecture" className="pt-6"><DocGroups docs={p.docs} sections={["architecture", "data", "integration"]} canEdit={canEdit} system={p.system} /></TabsContent>
            <TabsContent value="standards" className="pt-6">
              <DocGroups docs={p.docs} sections={["standards"]} canEdit={canEdit} system={p.system} />
              <div className="mt-6 flex flex-wrap gap-2">
                <Link to="/standards"><Button variant="secondary">Coding standards</Button></Link>
                <Link to={`/validation?project=${encodeURIComponent(p.name)}`}><Button variant="secondary">Validation rules for {p.name}</Button></Link>
                <Link to={`/snippets?system=${p.system}`}><Button variant="ghost">Bad vs standard trainer</Button></Link>
              </div>
            </TabsContent>
            <TabsContent value="setup" className="pt-6"><DocGroups docs={p.docs} sections={["onboarding", "deployment", "operations"]} canEdit={canEdit} system={p.system} /></TabsContent>
          </Tabs>
        </>
      )}
    </AppShell>
  );
}
