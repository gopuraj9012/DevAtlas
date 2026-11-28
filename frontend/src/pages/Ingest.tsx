import { useRef, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  AlertTriangle, ArrowRight, Cloud, FileArchive, FolderGit2, FolderOpen, FolderUp, GitBranch, Lock, Upload, type LucideIcon,
} from "lucide-react";
import { toast } from "sonner";
import { api, type AuthConfig, type ImportSource, type IngestResult as Result, type ProjectDetail } from "@/lib/api";
import { useAuth } from "@/lib/auth";
import { cn } from "@/lib/utils";
import { AppShell } from "@/components/shell/AppShell";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { EmptyPanel, ErrorBanner, FrameworkBadge, MicroLabel, PageHeader, SystemDot } from "@/components/kb/Bits";
import { RepoIngest, type RepoProvider } from "@/components/kb/RepoIngest";
import { IngestResult } from "@/components/kb/IngestResult";

type Source = "folder" | "zip" | RepoProvider;
const SOURCES: [Source, string, LucideIcon][] = [
  ["folder", "Upload a folder", FolderUp],
  ["zip", "Zip file", FileArchive],
  ["github", "GitHub", FolderGit2],
  ["bitbucket", "Bitbucket", Cloud],
  ["git", "Git URL", GitBranch],
];
const MAX_ZIP = 25 * 1024 * 1024;

const EXT = [".cs", ".csproj", ".sln", ".config", ".json", ".cshtml", ".vbhtml", ".razor", ".aspx", ".ascx", ".asax", ".master", ".asmx", ".ashx",
  ".sql", ".md", ".xml", ".vb", ".vbproj", ".props", ".targets", ".js"];
const VENDOR_JS = /(\.min\.js$|^(jquery|bootstrap|modernizr|respond|knockout|angular|react|vue|popper|moment|lodash|underscore|select2|datatables|kendo|globalize|_references|microsoft|webforms|webuivalidation|gridview|menustandards|smartnav|focus|treeview|detailsview)[\w.-]*\.js$)/i;
const VENDOR_DIRS = new Set(["lib", "vendor", "plugins"]);
const SKIP = new Set(["bin", "obj", "node_modules", ".git", "packages", "dist", "build", ".vs"]);
const MAX_FILES = 6000, MAX_FILE = 400 * 1024, MAX_TOTAL = 7.5 * 1024 * 1024;

interface FolderScan {
  folder: string;
  files: { path: string; content: string }[];
  skipped: number;
  tooBig: boolean;
  bytes: number;
  csFiles: number;
  solutions: string[];
  projects: string[];
}

async function readFolder(list: FileList): Promise<FolderScan> {
  const files: { path: string; content: string }[] = [];
  let bytes = 0, skipped = 0, tooBig = false;
  const all = Array.from(list);
  const first = (all[0] as File & { webkitRelativePath?: string })?.webkitRelativePath ?? "";
  for (const f of all) {
    const path = (f as File & { webkitRelativePath?: string }).webkitRelativePath || f.name;
    const parts = path.split("/");
    const ext = f.name.includes(".") ? f.name.slice(f.name.lastIndexOf(".")).toLowerCase() : "";
    const vendor = ext === ".js" && (VENDOR_JS.test(f.name) || parts.slice(0, -1).some((p) => VENDOR_DIRS.has(p.toLowerCase())));
    if (parts.slice(0, -1).some((p) => SKIP.has(p.toLowerCase())) || !EXT.includes(ext) || f.size > MAX_FILE || vendor) { skipped++; continue; }
    if (files.length >= MAX_FILES || bytes + f.size > MAX_TOTAL) { tooBig = true; skipped++; continue; }
    files.push({ path, content: await f.text() });
    bytes += f.size;
  }
  const lower = (p: string) => p.toLowerCase();
  return {
    folder: first.split("/")[0] || "Selected folder",
    files, skipped, tooBig, bytes,
    csFiles: files.filter((f) => lower(f.path).endsWith(".cs")).length,
    solutions: files.filter((f) => lower(f.path).endsWith(".sln")).map((f) => f.path),
    projects: files.filter((f) => /\.(cs|vb)proj$/.test(lower(f.path))).map((f) => f.path),
  };
}

function Tile({ value, label }: { value: number | string; label: string }) {
  return (
    <div className="rounded-xl border border-border bg-card px-4 py-3">
      <div className="font-mono text-xl font-semibold">{value}</div>
      <div className="micro-label mt-0.5">{label}</div>
    </div>
  );
}

function WhatGetsRead() {
  const rows: [string, string][] = [
    ["*.sln, *.csproj", "frameworks, packages, references"],
    ["*.cs", "patterns, handlers, data access, risks"],
    ["*.aspx, *.cshtml", "Web Forms and MVC surfaces"],
    ["*.sql", "stored procedures you keep in the repo"],
    ["*.config, appsettings.json", "configuration shape"],
    ["*.master, *.ascx, *.razor, *.js", "layouts, user controls, components and your own AJAX calls (vendor libraries skipped)"],
  ];
  return (
    <Card className="p-5 xl:sticky xl:top-20 xl:self-start">
      <MicroLabel className="mb-3">What gets read</MicroLabel>
      <ul className="space-y-2.5 text-[13.5px]">
        {rows.map(([globs, what]) => <li key={globs}><code className="font-mono text-[12.5px]">{globs}</code> <span className="text-muted-foreground">— {what}</span></li>)}
      </ul>
      <div className="mt-4 border-t border-border pt-4 text-[12.5px] text-muted-foreground">
        Files stay in memory for this scan only. The source itself is never stored: only the generated project entries and docs are saved. Nothing is written back to your repository.
      </div>
    </Card>
  );
}

export default function Ingest() {
  const { canEdit } = useAuth();
  const qc = useQueryClient();
  const [params] = useSearchParams();
  const target = params.get("project") ?? undefined;
  const isNew = params.get("new") === "1";
  const input = useRef<HTMLInputElement>(null);
  const zipInput = useRef<HTMLInputElement>(null);
  const config = useQuery({ queryKey: ["auth-config"], queryFn: () => api<AuthConfig>("/auth/config"), staleTime: 60_000 });
  const project = useQuery({ queryKey: ["project", target], queryFn: () => api<ProjectDetail>(`/projects/${target}`), enabled: Boolean(target) });
  const allowed = SOURCES.filter(([k]) => !config.data || config.data.import_sources.includes((k === "zip" ? "archive" : k) as ImportSource));
  const [picked, setSource] = useState<Source>("folder");
  const source: Source = allowed.some(([k]) => k === picked) ? picked : (allowed[0]?.[0] ?? picked);
  const [reading, setReading] = useState(false);
  const [scan, setScan] = useState<FolderScan | null>(null);
  const [zip, setZip] = useState<File | null>(null);
  const [dragging, setDragging] = useState(false);

  const done = (r: Result) => {
    qc.invalidateQueries({ queryKey: ["projects"] });
    qc.invalidateQueries({ queryKey: ["project"] });
    qc.invalidateQueries({ queryKey: ["overview"] });
    toast.success(`Scan complete: ${r.projects.length} project ${r.projects.length === 1 ? "entry" : "entries"} and ${r.articles.length} documents`);
    setTimeout(() => document.getElementById("scan-result")?.scrollIntoView({ behavior: "smooth", block: "start" }), 50);
  };
  const upload = useMutation({ mutationFn: (files: { path: string; content: string }[]) => api<Result>("/ingest", { body: { files, project: target } }), onSuccess: done });
  const archive = useMutation({
    mutationFn: (file: File) => {
      const fd = new FormData();
      fd.append("file", file);
      if (target) fd.append("project", target);
      return api<Result>("/ingest/archive", { body: fd });
    },
    onSuccess: done,
  });
  const repo = useMutation({
    mutationFn: ({ provider, body }: { provider: RepoProvider; body: { repo: string; ref?: string; path?: string } }) =>
      provider === "git"
        ? api<Result>("/ingest/git", { body: { url: body.repo, ref: body.ref, path: body.path, project: target } })
        : api<Result>(`/ingest/${provider}`, { body: { ...body, project: target } }),
    onSuccess: done,
  });
  const result = source === "folder" ? upload : source === "zip" ? archive : repo;

  function clear() {
    setScan(null);
    setZip(null);
    upload.reset();
    archive.reset();
    if (input.current) input.current.value = "";
    if (zipInput.current) zipInput.current.value = "";
  }

  function onZip(file: File | undefined) {
    if (!file) return;
    if (!file.name.toLowerCase().endsWith(".zip")) { toast.error("Pick a .zip file"); return; }
    if (file.size > MAX_ZIP) { toast.error("Zip files are limited to 25 MB. Zip a sub-folder instead."); return; }
    archive.reset();
    setZip(file);
    if (zipInput.current) zipInput.current.value = "";
  }

  async function onPick(list: FileList | null) {
    if (!list?.length) return;
    setReading(true);
    upload.reset();
    try {
      setScan(await readFolder(list));
    } finally {
      setReading(false);
      if (input.current) input.current.value = "";
    }
  }

  if (!canEdit) {
    return (
      <AppShell>
        <EmptyPanel icon={Lock} title="Maintainers only" text="Importing a codebase writes projects and docs that everyone sees, so only maintainers can do it. Ask an owner on the Team page." />
      </AppShell>
    );
  }

  const p = project.data;
  return (
    <AppShell>
      {p ? (
        <PageHeader
          eyebrow={isNew ? "Project created · step 2 of 2" : "Bring your own codebase"}
          title={<span className="inline-flex flex-wrap items-center gap-3">Add code to {p.name} <FrameworkBadge framework={p.framework} system={p.system} /></span>}
          description="Select the folder that holds this project's solution. DevAtlas counts what it can read, then analyses it when you say so, filling in the framework, packages and docs for this project."
          actions={<Link to={`/projects/${p.slug}`}><Button variant="ghost">{isNew ? "Skip for now" : "Back to project"} <ArrowRight /></Button></Link>}
        />
      ) : (
        <PageHeader
          eyebrow="Bring your own codebase"
          title="Import an existing .NET project"
          description="Read the solution, the project files and the C# sources, from a folder on this machine, a zip, or a GitHub, Bitbucket or other Git repository. Then generate knowledge-base entries for what it finds: target frameworks, packages, architecture patterns and the risk patterns hidden in the code."
        />
      )}

      <div className="mb-6 grid grid-cols-2 gap-1 rounded-xl border border-border bg-card p-1 shadow-soft sm:flex sm:w-fit" role="group" aria-label="Source">
        {allowed.map(([k, label, Icon]) => (
          <button key={k} type="button" aria-pressed={source === k} onClick={() => setSource(k)}
            className={cn("inline-flex h-9 items-center justify-center gap-1.5 whitespace-nowrap rounded-lg px-4 text-[13.5px] font-medium transition-colors", source === k ? "bg-accent text-primary shadow-sm" : "text-muted-foreground hover:text-foreground")}>
            <Icon className="h-4 w-4" aria-hidden />{label}
          </button>
        ))}
      </div>

      <div className="grid gap-5 xl:grid-cols-[1fr_320px] [&>*]:min-w-0">
        <Card className="p-6">
          {source === "folder" && (
            <div className="space-y-5">
              <div className="flex flex-wrap items-center gap-4">
                <input ref={input} type="file" className="sr-only" id="folder-input" onChange={(e) => onPick(e.target.files)} {...({ webkitdirectory: "", directory: "" } as Record<string, string>)} multiple />
                <Button size="lg" onClick={() => input.current?.click()} loading={reading} disabled={upload.isPending}>
                  <FolderOpen /> {reading ? "Reading files…" : scan ? "Select another folder" : "Select project folder"}
                </Button>
                {scan && <span className="font-mono text-[13px] text-muted-foreground">{scan.folder}</span>}
              </div>
              {!scan && !reading && (
                <p className="text-sm text-muted-foreground">Pick the folder that contains your <code className="inline-code">.sln</code>. You'll see what was found before anything is analysed or saved. Your browser may ask you to confirm the upload; nothing leaves this machine except to the DevAtlas API.</p>
              )}
              {scan && (
                <div className="animate-fade-up space-y-4">
                  <div className="grid gap-3 sm:grid-cols-3">
                    <Tile value={scan.files.length} label="Files" />
                    <Tile value={scan.csFiles} label="C# files" />
                    <Tile value={scan.projects.length} label="Projects" />
                  </div>
                  <p className="text-[13px] text-muted-foreground">
                    {scan.skipped} files skipped (bin, obj, node_modules, binaries and non-.NET files).
                    {scan.tooBig && " The folder is larger than 6,000 files or 7.5 MB, so the rest was left out. Pick a sub-folder for a complete scan."}
                  </p>
                  {scan.solutions.length + scan.projects.length > 0 ? (
                    <div className="rounded-xl border border-border p-4">
                      <MicroLabel className="mb-2">Solution and project files found</MicroLabel>
                      <ul className="max-h-48 space-y-1 overflow-y-auto font-mono text-[12.5px]">
                        {[...scan.solutions, ...scan.projects].map((f) => <li key={f} className="break-all">{f}</li>)}
                      </ul>
                    </div>
                  ) : (
                    <div className="flex items-start gap-2 rounded-xl border border-warning/30 bg-warning/5 px-4 py-3 text-[13px]">
                      <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-warning" aria-hidden />
                      No .csproj or .vbproj was found in this folder, so there is nothing to analyse. Pick the folder that contains the solution.
                    </div>
                  )}
                  <div className="flex flex-wrap items-center gap-3 border-t border-border pt-5">
                    <Button size="lg" onClick={() => upload.mutate(scan.files)} loading={upload.isPending} disabled={scan.projects.length === 0}>
                      <Upload /> {upload.isPending ? "Analysing…" : "Analyse and generate docs"}
                    </Button>
                    <Button variant="ghost" onClick={clear} disabled={upload.isPending}>Clear</Button>
                  </div>
                </div>
              )}
            </div>
          )}

          {source === "zip" && (
            <div className="space-y-5">
              <div
                onDragOver={(e) => { e.preventDefault(); setDragging(true); }}
                onDragLeave={() => setDragging(false)}
                onDrop={(e) => { e.preventDefault(); setDragging(false); onZip(e.dataTransfer.files[0]); }}
                className={cn("flex flex-col items-center gap-3 rounded-xl border-[1.5px] border-dashed px-6 py-8 text-center transition-colors", dragging ? "border-primary bg-accent/50" : "border-border")}
              >
                <FileArchive className="h-8 w-8 text-primary" aria-hidden />
                <p className="max-w-md text-sm text-muted-foreground">Drop a <code className="inline-code">.zip</code> of the repository here, or choose one. A GitHub or Bitbucket “Download ZIP” works as is. Up to 25 MB.</p>
                <input ref={zipInput} type="file" accept=".zip,application/zip" className="sr-only" id="zip-input" onChange={(e) => onZip(e.target.files?.[0])} />
                <Button variant={zip ? "secondary" : "primary"} onClick={() => zipInput.current?.click()} disabled={archive.isPending}><FileArchive /> {zip ? "Choose another .zip" : "Choose a .zip file"}</Button>
              </div>
              {zip && (
                <div className="animate-fade-up space-y-4">
                  <div className="grid gap-3 sm:grid-cols-2">
                    <Tile value={zip.name} label="Archive" />
                    <Tile value={`${(zip.size / 1024 / 1024).toFixed(1)} MB`} label="Size" />
                  </div>
                  <div className="flex flex-wrap items-center gap-3 border-t border-border pt-5">
                    <Button size="lg" onClick={() => archive.mutate(zip)} loading={archive.isPending}><Upload /> {archive.isPending ? "Analysing…" : "Analyse and generate docs"}</Button>
                    <Button variant="ghost" onClick={clear} disabled={archive.isPending}>Clear</Button>
                  </div>
                </div>
              )}
            </div>
          )}

          {(source === "github" || source === "bitbucket" || source === "git") && (
            <RepoIngest key={source} provider={source} busy={repo.isPending} onSubmit={(body) => repo.mutate({ provider: source, body })} />
          )}
        </Card>
        <WhatGetsRead />
      </div>

      <div id="scan-result" className="mt-8 scroll-mt-20">
        {result.isError && <ErrorBanner error={result.error} />}
        {result.data && (
          <IngestResult
            r={result.data}
            footer={p && (
              <Link to={`/projects/${p.slug}`}><Button><SystemDot system={p.system} label={false} /> Open {p.name} <ArrowRight /></Button></Link>
            )}
          />
        )}
      </div>
    </AppShell>
  );
}
