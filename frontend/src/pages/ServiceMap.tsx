import { useState } from "react";
import { Link } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { api, type GraphEdge, type GraphService, type ServiceGraph } from "@/lib/api";
import { cn } from "@/lib/utils";
import { AppShell } from "@/components/shell/AppShell";
import { Card } from "@/components/ui/card";
import { ErrorBanner, ListSkeleton, MicroLabel, PageHeader, Pill, Stat } from "@/components/kb/Bits";

const NW = 170, NH = 64, CW = 210, RH = 120, PAD = 20;

function pos(s: GraphService) {
  return { x: PAD + s.column * CW, y: PAD + s.row * RH };
}

function EdgeLine({ e, from, to, dim, idx }: { e: GraphEdge; from: GraphService; to: GraphService; dim: boolean; idx: number }) {
  const a = pos(from), b = pos(to);
  const offset = (idx % 2 === 0 ? -1 : 1) * (e.async ? 10 : 0);
  const forward = b.x >= a.x;
  const x1 = forward ? a.x + NW : a.x, x2 = forward ? b.x : b.x + NW;
  const y1 = a.y + NH / 2 + offset, y2 = b.y + NH / 2 + offset;
  const mx = (x1 + x2) / 2;
  const stroke = e.external ? "hsl(var(--muted-foreground))" : "hsl(var(--primary))";
  return (
    <path d={`M ${x1} ${y1} C ${mx} ${y1}, ${mx} ${y2}, ${x2} ${y2}`} fill="none" stroke={stroke} strokeWidth={dim ? 1 : 1.75}
      strokeDasharray={e.external ? "2 4" : e.async ? "6 4" : undefined} markerEnd={`url(#arrow-${e.external ? "ext" : "int"})`} opacity={dim ? 0.15 : 1} />
  );
}

export default function ServiceMap() {
  const q = useQuery({ queryKey: ["service-graph"], queryFn: () => api<ServiceGraph>("/architecture/service-graph") });
  const [hover, setHover] = useState<string | null>(null);
  const [selected, setSelected] = useState<string | null>(null);
  const g = q.data;
  const byKey = new Map((g?.services ?? []).map((s) => [s.key, s]));
  const focus = hover ?? selected;
  const touches = (e: GraphEdge) => !focus || e.from === focus || e.to === focus;
  const sel = selected ? byKey.get(selected) : undefined;
  const cols = Math.max(...(g?.services.map((s) => s.column) ?? [0])) + 1;
  const rows = Math.max(...(g?.services.map((s) => s.row) ?? [0])) + 1;

  return (
    <AppShell wide>
      <PageHeader eyebrow="Architecture" title="Service map" description="How the modern services talk to each other and where they cross into the legacy estate. Hover or focus a service to trace its connections." />
      {q.isLoading && <ListSkeleton rows={4} />}
      {q.isError && <ErrorBanner error={q.error} onRetry={() => q.refetch()} />}
      {g && (
        <>
          <div className="mb-5 grid gap-3 sm:grid-cols-4">
            <Stat label="Services" value={g.summary.services} />
            <Stat label="HTTP edges" value={g.summary.sync} />
            <Stat label="Event edges" value={g.summary.async} />
            <Stat label="Cross to legacy" value={g.summary.external} />
          </div>
          <div className="grid gap-5 xl:grid-cols-[1fr_320px]">
            <Card className="hidden overflow-x-auto p-4 lg:block">
              <svg viewBox={`0 0 ${cols * CW + PAD} ${rows * RH + PAD}`} className="w-full" role="img" aria-label="Modern service topology">
                <defs>
                  {[["int", "hsl(var(--primary))"], ["ext", "hsl(var(--muted-foreground))"]].map(([id, c]) => (
                    <marker key={id} id={`arrow-${id}`} viewBox="0 0 10 10" refX="9" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse">
                      <path d="M 0 0 L 10 5 L 0 10 z" fill={c} />
                    </marker>
                  ))}
                </defs>
                {g.edges.map((e, i) => {
                  const f = byKey.get(e.from), t = byKey.get(e.to);
                  return f && t ? <EdgeLine key={`${e.from}-${e.to}-${e.channel}`} e={e} from={f} to={t} dim={!touches(e)} idx={i} /> : null;
                })}
                {g.services.map((s) => {
                  const p = pos(s);
                  const dim = focus && focus !== s.key && !g.edges.some((e) => (e.from === focus && e.to === s.key) || (e.to === focus && e.from === s.key));
                  return (
                    <g key={s.key} transform={`translate(${p.x}, ${p.y})`} opacity={dim ? 0.35 : 1} className="cursor-pointer" tabIndex={0} role="button" aria-label={`${s.name}, ${s.kind_label}`} aria-pressed={selected === s.key}
                      onMouseEnter={() => setHover(s.key)} onMouseLeave={() => setHover(null)} onFocus={() => setHover(s.key)} onBlur={() => setHover(null)}
                      onClick={() => setSelected(selected === s.key ? null : s.key)} onKeyDown={(ev) => { if (ev.key === "Enter" || ev.key === " ") setSelected(selected === s.key ? null : s.key); }}>
                      <rect width={NW} height={NH} rx={12} fill={selected === s.key ? "hsl(var(--accent))" : "hsl(var(--card))"} stroke={s.external ? "hsl(var(--legacy))" : selected === s.key ? "hsl(var(--primary))" : "hsl(var(--border))"} strokeWidth={selected === s.key ? 2 : 1} strokeDasharray={s.external ? "5 4" : undefined} />
                      <circle cx={16} cy={20} r={4} fill={s.external ? "hsl(var(--legacy))" : "hsl(var(--primary))"} />
                      <text x={28} y={24} fontSize={12.5} fontWeight={600} fill="hsl(var(--foreground))">{s.name}</text>
                      <text x={16} y={46} fontSize={10.5} fill="hsl(var(--muted-foreground))">{s.kind_label} · {s.stack.length > 22 ? s.stack.slice(0, 21) + "…" : s.stack}</text>
                    </g>
                  );
                })}
              </svg>
              <div className="mt-3 flex flex-wrap gap-4 text-[12px] text-muted-foreground">
                <span className="inline-flex items-center gap-1.5"><span className="h-0.5 w-6 bg-primary" />HTTP</span>
                <span className="inline-flex items-center gap-1.5"><span className="h-0.5 w-6 border-t-2 border-dashed border-primary" />Event</span>
                <span className="inline-flex items-center gap-1.5"><span className="h-0.5 w-6 border-t-2 border-dotted border-muted-foreground" />Crosses to legacy</span>
              </div>
            </Card>

            <div className="space-y-3">
              {sel ? (
                <Card className="p-5">
                  <div className="flex items-center justify-between"><h2 className="font-semibold">{sel.name}</h2><Pill>{sel.kind_label}</Pill></div>
                  <p className="mt-1 text-[13px] text-muted-foreground">{sel.description}</p>
                  <div className="mt-2 font-mono text-[11px] text-muted-foreground">{sel.stack}</div>
                  <MicroLabel className="mb-1 mt-4">Responsibilities</MicroLabel>
                  <ul className="list-disc space-y-0.5 pl-5 text-[13px]">{sel.responsibilities.map((r) => <li key={r}>{r}</li>)}</ul>
                  {(["Callers", "Calls out to"] as const).map((label) => {
                    const edges = g.edges.filter((e) => (label === "Callers" ? e.to === sel.key : e.from === sel.key));
                    return (
                      <div key={label} className="mt-4">
                        <MicroLabel className="mb-1">{label}</MicroLabel>
                        {edges.length === 0 && <p className="text-[13px] text-muted-foreground">None</p>}
                        <ul className="space-y-2">
                          {edges.map((e) => (
                            <li key={`${e.from}-${e.to}-${e.channel}`} className="text-[13px]">
                              <div className="font-medium">{label === "Callers" ? e.from_name : e.to_name} <span className="text-muted-foreground">· {e.channel === "event" ? "event" : "HTTP"}</span></div>
                              <div className="font-mono text-[11.5px] text-muted-foreground">{e.labels.join(", ")}</div>
                              {e.contract && <Link to={`/contracts?code=${e.contract}`} className="text-[12px] font-medium text-primary hover:underline">{e.contract} {e.contract_name}</Link>}
                            </li>
                          ))}
                        </ul>
                      </div>
                    );
                  })}
                </Card>
              ) : (
                <Card className="p-5 text-[13px] text-muted-foreground">Select a service to see its callers, outbound calls and the contract on each edge.</Card>
              )}
              <Card className="p-5">
                <MicroLabel className="mb-2">Shared libraries (not network hops)</MicroLabel>
                <ul className="space-y-2 text-[13px]">{g.libraries.map((l) => <li key={l.name}><span className="font-mono font-semibold">{l.name}</span> <span className="text-muted-foreground">used by {l.used_by.join(", ")}. {l.note}</span></li>)}</ul>
              </Card>
            </div>
          </div>

          <div className="mt-5 space-y-3 lg:hidden">
            {g.services.map((s) => (
              <Card key={s.key} className="p-4">
                <div className="flex items-center gap-2"><span className={cn("h-2 w-2 rounded-full", s.external ? "bg-legacy" : "bg-primary")} aria-hidden /><span className="font-semibold">{s.name}</span><Pill>{s.kind_label}</Pill></div>
                <ul className="mt-2 space-y-1 text-[13px]">
                  {g.edges.filter((e) => e.from === s.key).map((e) => <li key={`${e.to}-${e.channel}`}>→ {e.to_name} <span className="text-muted-foreground">({e.channel === "event" ? "event" : "HTTP"}: {e.labels.join(", ")})</span></li>)}
                </ul>
              </Card>
            ))}
          </div>
          <p className="mt-4 text-[12px] text-muted-foreground">{g.note}</p>
        </>
      )}
    </AppShell>
  );
}
