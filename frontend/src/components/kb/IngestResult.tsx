import type { ReactNode } from "react";
import { Link } from "react-router-dom";
import { AlertTriangle, ArrowRight, CheckCircle2 } from "lucide-react";
import type { IngestResult as Result } from "@/lib/api";
import { cn } from "@/lib/utils";
import { Card } from "@/components/ui/card";
import { FrameworkBadge, SystemDot } from "./Bits";

function sourceLine(r: Result): ReactNode {
  const s = r.source;
  if (!s) return null;
  if (s.kind === "archive") return <>Read <span className="font-mono">{s.name}</span>: {s.files_read} files read, {s.files_skipped} skipped.</>;
  const host = s.kind === "bitbucket" ? "Bitbucket" : s.kind === "git" ? s.host : "GitHub";
  return (
    <>
      Read {host}{" "}
      <a href={s.url} target="_blank" rel="noreferrer" className="break-all font-mono text-primary hover:underline">{s.repo}{s.ref ? `@${s.ref}` : ""}{s.path ? `/${s.path}` : ""}</a>:{" "}
      {s.files_read} files read, {s.files_skipped} skipped{s.authenticated ? ", using the backend credentials" : ""}.
    </>
  );
}

export function IngestResult({ r, footer }: { r: Result; footer?: ReactNode }) {
  const truncated = r.truncated || r.source?.truncated;
  return (
    <div className="animate-fade-up space-y-5">
      <div className="flex items-center gap-2.5 rounded-xl border border-primary/20 bg-accent px-4 py-3 text-sm" role="status">
        <CheckCircle2 className="h-4 w-4 shrink-0 text-primary" aria-hidden />
        <span>
          Scan complete — {r.projects.length} project {r.projects.length === 1 ? "entry" : "entries"} and {r.articles.length} documents added.
          {r.source && <span className="text-muted-foreground"> {sourceLine(r)}</span>}
        </span>
      </div>
      {truncated && (
        <div className="flex items-start gap-2 rounded-xl border border-warning/30 bg-warning/5 px-4 py-3 text-[13px]">
          <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-warning" aria-hidden />
          Some files were skipped because the import hit a size limit. The results cover what was read.
        </div>
      )}

      <Card className="p-6">
        <h2 className="mb-3 text-base font-bold">Projects detected</h2>
        <ul className="divide-y divide-border">
          {r.projects.map((p) => (
            <li key={p.slug}>
              <Link to={`/projects/${p.slug}`} className="flex items-center gap-3 py-2.5 hover:text-primary">
                <SystemDot system={p.system} label={false} />
                <span className="flex-1 font-medium">{p.name}</span>
                <FrameworkBadge framework={p.framework} system={p.system} />
                <span className={cn("w-20 text-right font-mono text-[11px] font-semibold tracking-wider", p.created ? "text-success" : "text-muted-foreground")}>{p.created ? "NEW" : "UPDATED"}</span>
              </Link>
            </li>
          ))}
        </ul>
      </Card>

      <Card className="p-6">
        <h2 className="mb-3 text-base font-bold">Documents generated</h2>
        <ul className="divide-y divide-border">
          {[...r.articles].sort((a, b) => a.doc_id.localeCompare(b.doc_id)).map((a) => (
            <li key={a.slug}>
              <Link to={`/article/${a.slug}`} className="group flex items-center gap-4 py-3">
                <span className="w-16 shrink-0 font-mono text-[11.5px] text-muted-foreground">{a.doc_id}</span>
                <span className="flex-1 font-medium group-hover:text-primary">{a.title}</span>
                <ArrowRight className="h-4 w-4 text-muted-foreground/50 transition-transform group-hover:translate-x-0.5 group-hover:text-primary" aria-hidden />
              </Link>
            </li>
          ))}
        </ul>
      </Card>

      <Card className="p-6">
        <h2 className="mb-3 text-base font-bold">Signals found in the code</h2>
        <div className="overflow-x-auto">
          <table className="w-full min-w-[560px] text-left text-sm">
            <thead>
              <tr className="micro-label border-b border-border">
                <th className="py-2 pr-4 font-semibold">Signal</th>
                <th className="w-20 py-2 pr-4 font-semibold">Count</th>
                <th className="py-2 font-semibold">Example</th>
              </tr>
            </thead>
            <tbody>
              {r.stats.solutions.length > 0 && (
                <tr className="border-b border-border">
                  <td className="py-2.5 pr-4">Visual Studio solutions</td>
                  <td className="py-2.5 pr-4">{r.stats.solutions.length}</td>
                  <td className="py-2.5 font-mono text-[12px] text-muted-foreground">{r.stats.solutions[0]}</td>
                </tr>
              )}
              <tr className="border-b border-border">
                <td className="py-2.5 pr-4">Project files</td>
                <td className="py-2.5 pr-4">{r.stats.projects}</td>
                <td className="py-2.5 font-mono text-[12px] text-muted-foreground">{r.projects.map((p) => p.name).join(", ")}</td>
              </tr>
              {r.findings.map((f) => (
                <tr key={f.key} className="border-b border-border last:border-0">
                  <td className="py-2.5 pr-4">
                    <span className={cn("inline-flex items-center gap-1.5", f.risk && "text-destructive")}>
                      {f.risk && <AlertTriangle className="h-3.5 w-3.5" aria-label="Risk" />}
                      {f.label.replace("RISK · ", "")}
                    </span>
                  </td>
                  <td className="py-2.5 pr-4">{f.count}</td>
                  <td className="break-all py-2.5 font-mono text-[12px] text-muted-foreground">{f.examples[0]}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <p className="mt-3 text-[12px] text-muted-foreground">{r.stats.source_files} files and {r.stats.lines.toLocaleString()} lines analysed. Red rows are documented risk patterns.</p>
      </Card>
      {footer && <div className="flex justify-end">{footer}</div>}
    </div>
  );
}
