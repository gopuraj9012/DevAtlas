import { useEffect, useMemo, useState, type FormEvent } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Lock, Save } from "lucide-react";
import { toast } from "sonner";
import { api, type ArticleDetail, type ArticleSummary, type GlossaryEntry, type Project, type RuleEntry, type Scope } from "@/lib/api";
import { useAuth } from "@/lib/auth";
import { mdToBlocks } from "@/lib/markdown";
import { AppShell } from "@/components/shell/AppShell";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input, Label, Select, Textarea } from "@/components/ui/input";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { EmptyPanel, ErrorBanner, MicroLabel, PageHeader } from "@/components/kb/Bits";
import { BlockRenderer } from "@/components/kb/BlockRenderer";

const SECTIONS = ["onboarding", "architecture", "standards", "data", "integration", "deployment", "operations"];
const STARTER = `Start with one paragraph that says what this is and who needs it.

## How it works

- One point
- Another point

\`\`\`csharp Example.cs
var order = await sender.Send(new GetOrder(id), ct);
\`\`\`

> [warn] Watch out
> Anything a new hire is likely to get wrong.`;

function ArticleForm() {
  const [params] = useSearchParams();
  const editSlug = params.get("edit");
  const navigate = useNavigate();
  const qc = useQueryClient();
  const existing = useQuery({ queryKey: ["article", editSlug], queryFn: () => api<ArticleDetail>(`/articles/${editSlug}`), enabled: Boolean(editSlug) });
  const projects = useQuery({ queryKey: ["projects"], queryFn: () => api<Project[]>("/projects") });
  const [title, setTitle] = useState("");
  const [section, setSection] = useState(params.get("section") ?? "architecture");
  const [system, setSystem] = useState<Scope>((params.get("system") as Scope) ?? "both");
  const [project, setProject] = useState(params.get("project") ?? "");
  const [summary, setSummary] = useState("");
  const [tags, setTags] = useState("");
  const [md, setMd] = useState(editSlug ? "" : STARTER);
  const [dirty, setDirty] = useState(false);

  useEffect(() => {
    const a = existing.data;
    if (!a) return;
    setTitle(a.title); setSection(a.section); setSystem(a.system); setProject(a.project ?? ""); setSummary(a.summary); setTags(a.tags.join(", ")); setMd(a.source_md); setDirty(false);
  }, [existing.data]);

  useEffect(() => {
    if (!dirty) return;
    const warn = (e: BeforeUnloadEvent) => { e.preventDefault(); };
    window.addEventListener("beforeunload", warn);
    return () => window.removeEventListener("beforeunload", warn);
  }, [dirty]);

  const blocks = useMemo(() => mdToBlocks(md), [md]);
  const save = useMutation({
    mutationFn: () => {
      const tagList = tags.split(",").map((t) => t.trim()).filter(Boolean);
      return editSlug
        ? api<ArticleSummary>(`/articles/${editSlug}`, { method: "PUT", body: { title, summary, tags: tagList, blocks, source_md: md } })
        : api<ArticleSummary>("/articles", { body: { title, section, system, summary, tags: tagList, blocks, source_md: md, project: project || null } });
    },
    onSuccess: (a) => {
      setDirty(false);
      qc.invalidateQueries({ queryKey: ["article", a.slug] });
      qc.invalidateQueries({ queryKey: ["project"] });
      qc.invalidateQueries({ queryKey: ["overview"] });
      toast.success(editSlug ? "Doc updated" : "Doc published");
      navigate(`/article/${a.slug}`);
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : "Could not save"),
  });
  const change = <T,>(fn: (v: T) => void) => (v: T) => { fn(v); setDirty(true); };
  const submit = (e: FormEvent) => { e.preventDefault(); save.mutate(); };

  if (editSlug && existing.isError) return <ErrorBanner error={existing.error} onRetry={() => existing.refetch()} />;

  return (
    <form onSubmit={submit} className="space-y-5">
      <div className="grid gap-4 md:grid-cols-2">
        <div className="md:col-span-2"><Label htmlFor="a-title">Title</Label><Input id="a-title" required minLength={3} value={title} onChange={(e) => change(setTitle)(e.target.value)} placeholder="Atlas.Core: how sessions work" /></div>
        <div><Label htmlFor="a-section">Section</Label><Select id="a-section" value={section} disabled={Boolean(editSlug)} onChange={(e) => change(setSection)(e.target.value)}>{SECTIONS.map((s) => <option key={s} value={s}>{s}</option>)}</Select></div>
        <div><Label htmlFor="a-system">System</Label><Select id="a-system" value={system} disabled={Boolean(editSlug)} onChange={(e) => change(setSystem)(e.target.value as Scope)}><option value="both">Both systems</option><option value="legacy">Legacy .NET Framework</option><option value="modern">Modern .NET</option></Select></div>
        <div><Label htmlFor="a-project">Project (optional)</Label><Select id="a-project" value={project} disabled={Boolean(editSlug)} onChange={(e) => change(setProject)(e.target.value)}><option value="">Not tied to one project</option>{projects.data?.map((p) => <option key={p.slug} value={p.name}>{p.name}</option>)}</Select></div>
        <div><Label htmlFor="a-tags">Tags (comma separated)</Label><Input id="a-tags" value={tags} onChange={(e) => change(setTags)(e.target.value)} placeholder="architecture, sessions" /></div>
        <div className="md:col-span-2"><Label htmlFor="a-summary">One-line summary</Label><Input id="a-summary" value={summary} onChange={(e) => change(setSummary)(e.target.value)} maxLength={400} /></div>
      </div>
      <div className="grid gap-4 lg:grid-cols-2 [&>*]:min-w-0">
        <div>
          <Label htmlFor="a-body">Body (markdown)</Label>
          <Textarea id="a-body" value={md} onChange={(e) => change(setMd)(e.target.value)} className="min-h-[520px] font-mono text-[13px]" spellCheck={false} />
          <p className="mt-1.5 text-[12px] text-muted-foreground">Supports <code className="inline-code">##</code>, lists, code fences with a filename, <code className="inline-code">&gt; [info|warn|danger] Title</code>, pipe tables, <code className="inline-code">:::figure</code> and <code className="inline-code">:::compare</code> with two fences.</p>
        </div>
        <div>
          <MicroLabel className="mb-1.5">Preview</MicroLabel>
          <Card className="max-h-[560px] overflow-y-auto p-5">{blocks.length ? <BlockRenderer blocks={blocks} /> : <p className="text-sm text-muted-foreground">Nothing to preview yet.</p>}</Card>
        </div>
      </div>
      <div className="flex items-center justify-end gap-3">
        {dirty && <span className="text-[12px] text-muted-foreground">Unsaved changes</span>}
        <Button type="button" variant="secondary" onClick={() => navigate(-1)}>Cancel</Button>
        <Button type="submit" loading={save.isPending} disabled={title.trim().length < 3}><Save /> {editSlug ? "Save changes" : "Publish doc"}</Button>
      </div>
    </form>
  );
}

function TermForm() {
  const qc = useQueryClient();
  const [f, setF] = useState({ term: "", system: "both", definition: "", legacy_definition: "", modern_definition: "", see_also: "" });
  const set = (k: keyof typeof f) => (e: { target: { value: string } }) => setF({ ...f, [k]: e.target.value });
  const save = useMutation({
    mutationFn: () => api<GlossaryEntry>("/glossary", { body: { ...f, legacy_definition: f.legacy_definition || null, modern_definition: f.modern_definition || null, see_also: f.see_also.split(",").map((s) => s.trim()).filter(Boolean) } }),
    onSuccess: (t) => { qc.invalidateQueries({ queryKey: ["glossary"] }); toast.success(`"${t.term}" added to the glossary`); setF({ term: "", system: "both", definition: "", legacy_definition: "", modern_definition: "", see_also: "" }); },
    onError: (e) => toast.error(e instanceof Error ? e.message : "Could not add the term"),
  });
  return (
    <form onSubmit={(e) => { e.preventDefault(); save.mutate(); }} className="grid max-w-2xl gap-4 sm:grid-cols-2">
      <div><Label htmlFor="g-term">Term</Label><Input id="g-term" required value={f.term} onChange={set("term")} /></div>
      <div><Label htmlFor="g-sys">System</Label><Select id="g-sys" value={f.system} onChange={set("system")}><option value="both">Both</option><option value="legacy">Legacy</option><option value="modern">Modern</option></Select></div>
      <div className="sm:col-span-2"><Label htmlFor="g-def">Definition</Label><Textarea id="g-def" required value={f.definition} onChange={set("definition")} /></div>
      <div><Label htmlFor="g-leg">Legacy meaning (optional)</Label><Textarea id="g-leg" value={f.legacy_definition} onChange={set("legacy_definition")} className="min-h-[64px]" /></div>
      <div><Label htmlFor="g-mod">Modern meaning (optional)</Label><Textarea id="g-mod" value={f.modern_definition} onChange={set("modern_definition")} className="min-h-[64px]" /></div>
      <div className="sm:col-span-2"><Label htmlFor="g-see">See also (comma separated)</Label><Input id="g-see" value={f.see_also} onChange={set("see_also")} /></div>
      <div className="sm:col-span-2"><Button type="submit" loading={save.isPending} disabled={f.term.trim().length < 2 || f.definition.trim().length < 5}>Add term</Button></div>
    </form>
  );
}

function StandardForm() {
  const qc = useQueryClient();
  const [f, setF] = useState({ title: "", system: "both", topic: "", rationale: "", good: "", bad: "" });
  const set = (k: keyof typeof f) => (e: { target: { value: string } }) => setF({ ...f, [k]: e.target.value });
  const save = useMutation({
    mutationFn: () => api<RuleEntry>("/rules", { body: { ...f, category: "coding" } }),
    onSuccess: (r) => { qc.invalidateQueries({ queryKey: ["rules"] }); toast.success(`${r.rule_id} added`); setF({ title: "", system: "both", topic: "", rationale: "", good: "", bad: "" }); },
    onError: (e) => toast.error(e instanceof Error ? e.message : "Could not add the standard"),
  });
  return (
    <form onSubmit={(e) => { e.preventDefault(); save.mutate(); }} className="grid max-w-2xl gap-4 sm:grid-cols-2">
      <div className="sm:col-span-2"><Label htmlFor="s-title">Standard</Label><Input id="s-title" required value={f.title} onChange={set("title")} placeholder="Prefer records for DTOs" /></div>
      <div><Label htmlFor="s-sys">System</Label><Select id="s-sys" value={f.system} onChange={set("system")}><option value="both">Both</option><option value="legacy">Legacy</option><option value="modern">Modern</option></Select></div>
      <div><Label htmlFor="s-topic">Topic</Label><Input id="s-topic" value={f.topic} onChange={set("topic")} placeholder="api" /></div>
      <div className="sm:col-span-2"><Label htmlFor="s-why">Why</Label><Textarea id="s-why" value={f.rationale} onChange={set("rationale")} className="min-h-[64px]" /></div>
      <div><Label htmlFor="s-good">Do</Label><Input id="s-good" value={f.good} onChange={set("good")} className="font-mono" /></div>
      <div><Label htmlFor="s-bad">Avoid</Label><Input id="s-bad" value={f.bad} onChange={set("bad")} className="font-mono" /></div>
      <div className="sm:col-span-2"><Button type="submit" loading={save.isPending} disabled={f.title.trim().length < 3}>Add standard</Button></div>
    </form>
  );
}

export default function Authoring() {
  const { canEdit } = useAuth();
  const [params] = useSearchParams();
  const editing = Boolean(params.get("edit"));
  if (!canEdit) {
    return <AppShell><EmptyPanel icon={Lock} title="Maintainers only" text="Engineers can suggest changes on the Feedback page; a maintainer will make them." /></AppShell>;
  }
  return (
    <AppShell>
      <PageHeader eyebrow="Authoring" title={editing ? "Edit doc" : "Write for the knowledge base"} description="Write it for the person who joins next month and has nobody to ask." />
      <Tabs defaultValue="article">
        {!editing && (
          <TabsList className="mb-6">
            <TabsTrigger value="article">Doc</TabsTrigger>
            <TabsTrigger value="term">Glossary term</TabsTrigger>
            <TabsTrigger value="standard">Coding standard</TabsTrigger>
          </TabsList>
        )}
        <TabsContent value="article"><ArticleForm /></TabsContent>
        <TabsContent value="term"><TermForm /></TabsContent>
        <TabsContent value="standard"><StandardForm /></TabsContent>
      </Tabs>
    </AppShell>
  );
}
