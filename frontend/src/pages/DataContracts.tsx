import { useEffect, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { Boxes, Download, FileJson, Search, ShieldAlert } from "lucide-react";
import { toast } from "sonner";
import { api, download, type ContractStatus, type ContractsMeta, type DataContract } from "@/lib/api";
import { cn } from "@/lib/utils";
import { AppShell } from "@/components/shell/AppShell";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { Chip, EmptyPanel, ErrorBanner, ListSkeleton, MicroLabel, PageHeader, Pill, SystemDot } from "@/components/kb/Bits";
import { SplitCompare } from "@/components/kb/SplitCompare";
import { ContractImpactGraph } from "@/components/kb/ContractImpactGraph";

const STATUS_TONE: Record<ContractStatus, "green" | "amber" | "red"> = { stable: "green", draft: "amber", deprecated: "red" };
const DIRECTION: Record<string, string> = { legacy_to_modern: "Legacy owns, modern reads", modern_to_legacy: "Modern owns, legacy reads", bidirectional: "Both write" };

function Detail({ c }: { c: DataContract }) {
  const save = async (ext: "json" | "sql") => {
    try {
      await download(`/contracts/${c.code}/schema.${ext}`, `${c.code}.${ext}`);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Download failed");
    }
  };
  return (
    <div className="space-y-6">
      <div>
        <div className="flex flex-wrap items-center gap-2">
          <span className="font-mono text-[13px] font-semibold text-primary">{c.code}</span>
          <Pill tone={STATUS_TONE[c.status]}>{c.status}</Pill>
          <Pill mono>v{c.version}</Pill>
          <Pill>{c.kind}</Pill>
        </div>
        <h2 className="mt-2 font-mono text-xl font-semibold">{c.name}</h2>
        <p className="mt-1 text-sm text-muted-foreground">{c.summary}</p>
        <div className="mt-3 flex flex-wrap gap-x-5 gap-y-1 text-[13px]">
          <span><span className="text-muted-foreground">Owner:</span> {c.owner}</span>
          <span className="inline-flex items-center gap-1.5"><SystemDot system={c.owner_system} label={false} />{DIRECTION[c.direction]}</span>
          <span className="text-muted-foreground">Updated {c.updated}</span>
        </div>
        <div className="mt-4 flex flex-wrap gap-2">
          <Button variant="secondary" size="sm" onClick={() => save("json")}><FileJson /> JSON Schema</Button>
          {(c.kind === "table" || c.kind === "view") && <Button variant="secondary" size="sm" onClick={() => save("sql")}><Download /> T-SQL DDL</Button>}
        </div>
      </div>
      <div className="grid gap-4 sm:grid-cols-2">
        <div><MicroLabel className="mb-1.5">Producers</MicroLabel><div className="flex flex-wrap gap-1.5">{c.producers.map((p) => <Pill key={p}>{p}</Pill>)}</div></div>
        <div><MicroLabel className="mb-1.5">Consumers</MicroLabel><div className="flex flex-wrap gap-1.5">{c.consumers.map((p) => <Pill key={p} tone="violet">{p}</Pill>)}</div></div>
      </div>
      <div>
        <MicroLabel className="mb-2">Fields</MicroLabel>
        <div className="overflow-x-auto rounded-xl border border-border">
          <table className="w-full text-left text-sm">
            <thead className="bg-secondary/60"><tr><th className="px-3 py-2 font-semibold">Name</th><th className="px-3 py-2 font-semibold">Type</th><th className="px-3 py-2 font-semibold">Required</th><th className="px-3 py-2 font-semibold">Notes</th></tr></thead>
            <tbody>
              {c.fields.map((f) => (
                <tr key={f.name} className="border-t border-border">
                  <td className="px-3 py-2 font-mono text-[12.5px] font-semibold">{f.name}</td>
                  <td className="px-3 py-2 font-mono text-[12.5px] text-muted-foreground">{f.type}</td>
                  <td className="px-3 py-2">{f.required ? "yes" : "no"}</td>
                  <td className="px-3 py-2 text-muted-foreground">{f.notes}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
      <div>
        <MicroLabel className="mb-2">Compatibility rules</MicroLabel>
        <ul className="list-disc space-y-1 pl-5 text-sm">{c.rules.map((r) => <li key={r}>{r}</li>)}</ul>
      </div>
      <SplitCompare legacy={c.legacy} modern={c.modern} title="Owner vs consumer code" />
      <div>
        <MicroLabel className="mb-2">Change history</MicroLabel>
        <ol className="space-y-2">
          {c.changes.map((ch) => (
            <li key={ch.version} className="flex gap-3 text-sm">
              <span className="w-12 shrink-0 font-mono text-[12px] font-semibold">v{ch.version}</span>
              <span className="w-24 shrink-0 text-[12px] text-muted-foreground">{ch.date}</span>
              <span className="flex-1">{ch.summary}</span>
              {ch.breaking && <Pill tone="red">breaking</Pill>}
            </li>
          ))}
        </ol>
      </div>
    </div>
  );
}

export default function DataContracts() {
  const [params, setParams] = useSearchParams();
  const view = params.get("view") === "graph" ? "graph" : "registry";
  const code = params.get("code");
  const [text, setText] = useState("");
  const [dq, setDq] = useState("");
  const [kind, setKind] = useState("");
  const [status, setStatus] = useState("");
  useEffect(() => { const t = setTimeout(() => setDq(text), 200); return () => clearTimeout(t); }, [text]);

  const meta = useQuery({ queryKey: ["contracts-meta"], queryFn: () => api<ContractsMeta>("/contracts/meta") });
  const qs = new URLSearchParams({ q: dq, kind, status }).toString();
  const list = useQuery({ queryKey: ["contracts", qs], queryFn: () => api<DataContract[]>(`/contracts?${qs}`) });
  const selectedCode = code ?? list.data?.[0]?.code;
  const detail = useQuery({ queryKey: ["contract", selectedCode], queryFn: () => api<DataContract>(`/contracts/${selectedCode}`), enabled: Boolean(selectedCode) });

  const setParam = (k: string, v: string | null) => setParams((p) => { if (v) p.set(k, v); else p.delete(k); return p; }, { replace: true });
  const open = (c: string) => setParams({ code: c }, { replace: false });

  return (
    <AppShell wide>
      <PageHeader eyebrow="Shared surface" title="Data contracts" description="Every shape both systems depend on: tables, views, endpoints, SOAP operations, events and file batches. Read-only here, reviewed in source control."
        actions={
          <div className="flex rounded-lg border border-border bg-card p-1" role="group" aria-label="View">
            {(["registry", "graph"] as const).map((v) => (
              <button key={v} type="button" aria-pressed={view === v} onClick={() => setParam("view", v === "graph" ? "graph" : null)} className={cn("h-8 rounded-md px-3 text-[13px] font-medium", view === v ? "bg-accent text-primary" : "text-muted-foreground hover:text-foreground")}>
                {v === "registry" ? "Registry" : "Impact graph"}
              </button>
            ))}
          </div>
        }
      />
      {meta.data && (
        <Card className="mb-6 border-legacy/30 bg-legacy-soft/40 p-4">
          <div className="mb-2 flex items-center gap-2 text-sm font-semibold"><ShieldAlert className="h-4 w-4 text-legacy-foreground" aria-hidden />Change policy</div>
          <ol className="grid gap-x-6 gap-y-1.5 text-[13px] md:grid-cols-2 lg:grid-cols-3">
            {meta.data.policy.map((p, i) => <li key={p.title}><span className="font-semibold">{i + 1}. {p.title}.</span> <span className="text-muted-foreground">{p.detail}</span></li>)}
          </ol>
        </Card>
      )}
      {view === "graph" ? (
        <ContractImpactGraph onOpen={(c) => setParams({ code: c })} />
      ) : (
        <div className="grid gap-6 lg:grid-cols-[340px_1fr]">
          <div className="min-w-0 space-y-3">
            <div className="relative">
              <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" aria-hidden />
              <Input value={text} onChange={(e) => setText(e.target.value)} className="pl-9" placeholder="Search contracts and fields" aria-label="Search contracts" />
            </div>
            <div className="flex flex-wrap gap-1.5">
              <Chip active={!kind} onClick={() => setKind("")}>All kinds</Chip>
              {meta.data?.kinds.filter((k) => k.count).map((k) => <Chip key={k.key} active={kind === k.key} onClick={() => setKind(kind === k.key ? "" : k.key)} count={k.count}>{k.label}</Chip>)}
            </div>
            <div className="flex flex-wrap gap-1.5">
              <Chip active={!status} onClick={() => setStatus("")}>Any status</Chip>
              {meta.data?.statuses.map((s) => <Chip key={s.key} active={status === s.key} onClick={() => setStatus(status === s.key ? "" : s.key)} count={s.count}>{s.key}</Chip>)}
            </div>
            {list.isLoading && <ListSkeleton rows={6} />}
            {list.isError && <ErrorBanner error={list.error} onRetry={() => list.refetch()} />}
            {list.data?.length === 0 && <EmptyPanel icon={Boxes} title="No contracts match" text="Clear a filter or search for a field name." />}
            <ul className="space-y-1.5">
              {list.data?.map((c) => (
                <li key={c.code}>
                  <button type="button" onClick={() => open(c.code)} aria-current={selectedCode === c.code}
                    className={cn("w-full rounded-xl border px-4 py-3 text-left transition-colors", selectedCode === c.code ? "border-primary bg-accent/50" : "border-border bg-card hover:bg-secondary/50")}>
                    <div className="flex items-center gap-2">
                      <span className="font-mono text-[12px] font-semibold text-primary">{c.code}</span>
                      <span className="flex-1 truncate font-mono text-[13px] font-semibold">{c.name}</span>
                      <Pill tone={STATUS_TONE[c.status]}>{c.status}</Pill>
                    </div>
                    <div className="mt-0.5 flex items-center gap-1.5 text-[12px] text-muted-foreground"><SystemDot system={c.owner_system} label={false} />{c.kind} · {c.owner}</div>
                  </button>
                </li>
              ))}
            </ul>
          </div>
          <Card className="min-w-0 p-6">
            {detail.isLoading && <div className="space-y-3"><Skeleton className="h-6 w-40" /><Skeleton className="h-8 w-72" /><Skeleton className="h-48" /></div>}
            {detail.isError && <ErrorBanner error={detail.error} onRetry={() => detail.refetch()} />}
            {detail.data && <Detail c={detail.data} />}
            {!selectedCode && !list.isLoading && <p className="text-sm text-muted-foreground">Pick a contract.</p>}
          </Card>
        </div>
      )}
    </AppShell>
  );
}
