import { useRef, useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { FolderOpen, FolderUp, FolderGit2, Lock } from "lucide-react";
import { toast } from "sonner";
import { api, type IngestResult as Result } from "@/lib/api";
import { useAuth } from "@/lib/auth";
import { cn } from "@/lib/utils";
import { AppShell } from "@/components/shell/AppShell";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { EmptyPanel, ErrorBanner, PageHeader } from "@/components/kb/Bits";
import { GithubIngest } from "@/components/kb/GithubIngest";
import { IngestResult } from "@/components/kb/IngestResult";

const EXT = [".cs", ".csproj", ".sln", ".config", ".json", ".cshtml", ".aspx", ".ascx", ".asax", ".sql", ".md", ".xml", ".vb", ".vbproj", ".props", ".targets"];
const SKIP = new Set(["bin", "obj", "node_modules", ".git", "packages", "dist", "build", ".vs"]);
const MAX_FILES = 6000, MAX_FILE = 400 * 1024, MAX_TOTAL = 7.5 * 1024 * 1024;

async function readFolder(list: FileList) {
  const files: { path: string; content: string }[] = [];
  let total = 0, skipped = 0, tooBig = false;
  for (const f of Array.from(list)) {
    const path = (f as File & { webkitRelativePath?: string }).webkitRelativePath || f.name;
    const parts = path.split("/");
    const ext = f.name.includes(".") ? f.name.slice(f.name.lastIndexOf(".")).toLowerCase() : "";
    if (parts.slice(0, -1).some((p) => SKIP.has(p.toLowerCase())) || !EXT.includes(ext)) { skipped++; continue; }
    if (f.size > MAX_FILE) { skipped++; continue; }
    if (files.length >= MAX_FILES || total + f.size > MAX_TOTAL) { tooBig = true; break; }
    files.push({ path, content: await f.text() });
    total += f.size;
  }
  return { files, skipped, tooBig, total };
}

export default function Ingest() {
  const { canEdit } = useAuth();
  const qc = useQueryClient();
  const input = useRef<HTMLInputElement>(null);
  const [source, setSource] = useState<"folder" | "github">("folder");
  const [reading, setReading] = useState(false);
  const [note, setNote] = useState<string | null>(null);

  const done = (r: Result) => {
    qc.invalidateQueries({ queryKey: ["projects"] });
    qc.invalidateQueries({ queryKey: ["overview"] });
    toast.success(`Imported ${r.projects.length} project${r.projects.length === 1 ? "" : "s"} and ${r.articles.length} docs`);
  };
  const upload = useMutation({ mutationFn: (files: { path: string; content: string }[]) => api<Result>("/ingest", { body: { files } }), onSuccess: done });
  const github = useMutation({ mutationFn: (body: { repo: string; ref?: string; path?: string }) => api<Result>("/ingest/github", { body }), onSuccess: done });
  const result = source === "folder" ? upload : github;

  async function onPick(list: FileList | null) {
    if (!list?.length) return;
    setReading(true);
    setNote(null);
    try {
      const { files, skipped, tooBig, total } = await readFolder(list);
      setNote(`${files.length} files read (${(total / 1024 / 1024).toFixed(1)} MB), ${skipped} skipped.${tooBig ? " The folder is larger than 6,000 files or 7.5 MB, so the rest was left out; pick a sub-folder for a complete scan." : ""}`);
      upload.mutate(files);
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

  return (
    <AppShell>
      <PageHeader eyebrow="Import" title="Import an existing codebase" description="DevAtlas reads the .sln and .csproj files and greps the source for stack and risk signals, then generates draft docs marked IMPORTED. Nothing leaves your machine except the text files you pick." />
      <div className="mb-6 flex rounded-lg border border-border bg-card p-1 sm:w-fit" role="group" aria-label="Source">
        {([["folder", "Upload a folder", FolderUp], ["github", "Read from GitHub", FolderGit2]] as const).map(([k, label, Icon]) => (
          <button key={k} type="button" aria-pressed={source === k} onClick={() => setSource(k)} className={cn("inline-flex h-8 flex-1 items-center justify-center gap-1.5 rounded-md px-3 text-[13px] font-medium", source === k ? "bg-accent text-primary" : "text-muted-foreground hover:text-foreground")}>
            <Icon className="h-4 w-4" aria-hidden />{label}
          </button>
        ))}
      </div>
      <Card className="p-6">
        {source === "folder" ? (
          <div className="flex flex-col items-start gap-3">
            <p className="text-sm text-muted-foreground">Pick the folder that contains your solution. Only text source files are read; <code className="inline-code">bin</code>, <code className="inline-code">obj</code>, <code className="inline-code">packages</code> and <code className="inline-code">.git</code> are skipped.</p>
            <input ref={input} type="file" className="sr-only" id="folder-input" onChange={(e) => onPick(e.target.files)} {...({ webkitdirectory: "", directory: "" } as Record<string, string>)} multiple />
            <Button onClick={() => input.current?.click()} loading={reading || upload.isPending}><FolderOpen /> {reading ? "Reading filesâ€¦" : upload.isPending ? "Analysingâ€¦" : "Choose a folder"}</Button>
            {note && <p className="text-[13px] text-muted-foreground">{note}</p>}
          </div>
        ) : (
          <GithubIngest busy={github.isPending} onSubmit={(b) => github.mutate(b)} />
        )}
      </Card>
      <div className="mt-8">
        {result.isError && <ErrorBanner error={result.error} />}
        {result.data && <IngestResult r={result.data} />}
      </div>
    </AppShell>
  );
}
