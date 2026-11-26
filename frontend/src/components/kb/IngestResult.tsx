import { Link } from "react-router-dom";
import { AlertTriangle, FileText, FolderGit2 } from "lucide-react";
import type { IngestResult as Result } from "@/lib/api";
import { Card } from "@/components/ui/card";
import { FrameworkBadge, MicroLabel, Pill, Stat, SystemDot } from "./Bits";

export function IngestResult({ r }: { r: Result }) {
  return (
    <div className="space-y-6">
      {r.source && (
        <Card className="p-4 text-[13px]">
          Read <a href={r.source.url} target="_blank" rel="noreferrer" className="font-mono font-medium text-primary hover:underline">{r.source.repo}@{r.source.ref}{r.source.path ? `/${r.source.path}` : ""}</a>:{" "}
          {r.source.files_read} files read, {r.source.files_skipped} skipped{r.source.authenticated ? ", using the backend token" : ", anonymously"}.
        </Card>
      )}
      {(r.truncated || r.source?.truncated) && (
        <div className="flex items-start gap-2 rounded-xl border border-warning/30 bg-warning/5 px-4 py-3 text-[13px]"><AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-warning" />Some files were skipped because the import hit a size limit. The results cover what was read.</div>
      )}
      <div className="grid gap-3 sm:grid-cols-4">
        <Stat label="Files analysed" value={r.stats.source_files} hint={`${r.stats.files} sent`} />
        <Stat label="Lines" value={r.stats.lines.toLocaleString()} />
        <Stat label="Projects" value={r.stats.projects} hint={r.stats.solutions.join(", ") || "No .sln"} />
        <Stat label="Risk patterns" value={r.findings.filter((f) => f.risk).length} />
      </div>
      <section>
        <MicroLabel className="mb-2">Projects</MicroLabel>
        <div className="grid gap-3 md:grid-cols-2">
          {r.projects.map((p) => (
            <Link key={p.slug} to={`/projects/${p.slug}`} className="block rounded-xl focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">
              <Card className="p-4 hover:shadow-lift">
                <div className="flex items-center gap-2">
                  <FolderGit2 className="h-4 w-4 text-primary" aria-hidden />
                  <span className="flex-1 font-semibold">{p.name}</span>
                  <FrameworkBadge framework={p.framework} system={p.system} />
                  <Pill tone={p.created ? "green" : "neutral"}>{p.created ? "new" : "updated"}</Pill>
                </div>
                <div className="mt-1.5 flex flex-wrap gap-1.5"><SystemDot system={p.system} short className="text-[12px] text-muted-foreground" />{p.stack.slice(0, 5).map((s) => <Pill key={s}>{s}</Pill>)}</div>
              </Card>
            </Link>
          ))}
        </div>
      </section>
      <section>
        <MicroLabel className="mb-2">Signals found</MicroLabel>
        <div className="overflow-hidden rounded-xl border border-border bg-card">
          {r.findings.map((f) => (
            <div key={f.key} className="flex items-start gap-3 border-b border-border px-4 py-3 last:border-0">
              {f.risk ? <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-destructive" aria-label="Risk" /> : <span className="mt-1.5 h-2 w-2 shrink-0 rounded-full bg-primary" aria-hidden />}
              <div className="min-w-0 flex-1">
                <div className="text-sm font-medium">{f.label}</div>
                <div className="truncate font-mono text-[11.5px] text-muted-foreground">{f.examples.join(" · ")}</div>
              </div>
              <span className="font-mono text-[12px] font-semibold">{f.count}</span>
            </div>
          ))}
        </div>
      </section>
      <section>
        <MicroLabel className="mb-2">Generated docs (marked IMPORTED)</MicroLabel>
        <ul className="space-y-1">
          {r.articles.map((a) => (
            <li key={a.slug}><Link to={`/article/${a.slug}`} className="flex items-center gap-2 rounded-lg px-2 py-2 text-sm hover:bg-secondary"><FileText className="h-4 w-4 text-primary" aria-hidden /><span className="flex-1">{a.title}</span><span className="font-mono text-[11px] text-muted-foreground">{a.doc_id}</span></Link></li>
          ))}
        </ul>
      </section>
    </div>
  );
}
