import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { api, type GraphInterface, type ImpactGraph, type Risk } from "@/lib/api";
import { cn } from "@/lib/utils";
import { Card } from "@/components/ui/card";
import { Chip, ErrorBanner, ListSkeleton, Pill, Stat, SystemDot } from "./Bits";

const RISK_TONE = { high: "red", medium: "amber", low: "green" } as const;
const RISK_STROKE: Record<Risk, string> = { high: "hsl(var(--destructive))", medium: "hsl(var(--warning))", low: "hsl(var(--border))" };

export function ContractImpactGraph({ onOpen }: { onOpen: (code: string) => void }) {
  const q = useQuery({ queryKey: ["contracts-graph"], queryFn: () => api<ImpactGraph>("/contracts/graph") });
  const [kind, setKind] = useState<"all" | "sql" | "soap">("all");
  const [hover, setHover] = useState<string | null>(null);

  const g = q.data;
  const interfaces = useMemo(
    () => (g?.interfaces ?? []).filter((i) => kind === "all" || (kind === "soap" ? i.kind === "soap" : i.kind !== "soap")),
    [g, kind],
  );
  const services = useMemo(() => {
    const used = new Set(interfaces.flatMap((i) => i.consumers.map((c) => c.name)));
    return (g?.services ?? []).filter((s) => used.has(s.name));
  }, [g, interfaces]);

  if (q.isLoading) return <ListSkeleton rows={5} />;
  if (q.isError) return <ErrorBanner error={q.error} onRetry={() => q.refetch()} />;
  if (!g) return null;

  const ROW = 64, TOP = 24, W = 900, LX = 20, LW = 300, RX = 600, RW = 280;
  const height = Math.max(interfaces.length, services.length) * ROW + TOP * 2;
  const iy = (i: number) => TOP + i * ROW + 24;
  const sy = (i: number) => TOP + i * ROW + 24;
  const sIndex = new Map(services.map((s, i) => [s.name, i]));
  const active = (i: GraphInterface) => !hover || hover === i.code || i.consumers.some((c) => c.name === hover);

  return (
    <div className="space-y-5">
      <div className="grid gap-3 sm:grid-cols-4">
        <Stat label="Legacy interfaces" value={g.summary.interfaces} hint={`${g.summary.sql} SQL · ${g.summary.soap} SOAP`} />
        <Stat label="Consuming services" value={g.summary.services} hint={`${g.summary.modern_services} modern · ${g.summary.unclassified_services} unclassified`} />
        <Stat label="High risk" value={g.summary.high_risk} hint="Deprecated, or draft and already consumed" />
        <Stat label="Breaking changes" value={g.summary.breaking_changes} hint="On record across these interfaces" />
      </div>
      <div className="flex flex-wrap gap-2">
        <Chip active={kind === "all"} onClick={() => setKind("all")}>All</Chip>
        <Chip active={kind === "sql"} onClick={() => setKind("sql")}>SQL tables and views</Chip>
        <Chip active={kind === "soap"} onClick={() => setKind("soap")}>SOAP</Chip>
      </div>

      <Card className="hidden overflow-x-auto p-4 lg:block">
        <svg viewBox={`0 0 ${W} ${height}`} className="w-full" role="img" aria-label="Legacy interfaces and the services that consume them">
          {interfaces.flatMap((itf, i) =>
            itf.consumers.map((c) => {
              const j = sIndex.get(c.name);
              if (j === undefined) return null;
              const y1 = iy(i), y2 = sy(j);
              const on = active(itf) && (!hover || hover === itf.code || hover === c.name);
              return (
                <path
                  key={`${itf.code}-${c.name}`}
                  d={`M ${LX + LW} ${y1} C ${(LX + LW + RX) / 2} ${y1}, ${(LX + LW + RX) / 2} ${y2}, ${RX} ${y2}`}
                  fill="none"
                  stroke={RISK_STROKE[itf.risk]}
                  strokeWidth={on ? 2 : 1}
                  strokeDasharray={itf.breaking_changes ? undefined : "4 4"}
                  opacity={on ? 1 : 0.15}
                />
              );
            }),
          )}
          {interfaces.map((itf, i) => (
            <g key={itf.code} transform={`translate(${LX}, ${iy(i) - 22})`} opacity={active(itf) ? 1 : 0.35} className="cursor-pointer"
              tabIndex={0} role="button" aria-label={`${itf.code} ${itf.name}, ${itf.risk} risk`}
              onMouseEnter={() => setHover(itf.code)} onMouseLeave={() => setHover(null)} onFocus={() => setHover(itf.code)} onBlur={() => setHover(null)}
              onClick={() => onOpen(itf.code)} onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") onOpen(itf.code); }}>
              <rect width={LW} height={44} rx={10} fill="hsl(var(--card))" stroke={itf.risk === "high" ? "hsl(var(--destructive))" : "hsl(var(--border))"} />
              <circle cx={16} cy={22} r={4} fill="hsl(var(--legacy))" />
              <text x={28} y={19} fontSize={12} fontWeight={600} fill="hsl(var(--foreground))" fontFamily="JetBrains Mono, monospace">{itf.code}</text>
              <text x={80} y={19} fontSize={12} fill="hsl(var(--foreground))">{itf.name.length > 28 ? itf.name.slice(0, 27) + "…" : itf.name}</text>
              <text x={28} y={34} fontSize={10.5} fill="hsl(var(--muted-foreground))">{itf.kind_label} · {itf.status} · {itf.risk} risk</text>
            </g>
          ))}
          {services.map((s, j) => (
            <g key={s.name} transform={`translate(${RX}, ${sy(j) - 18})`} opacity={!hover || hover === s.name || interfaces.some((i) => i.code === hover && i.consumers.some((c) => c.name === s.name)) ? 1 : 0.35}
              onMouseEnter={() => setHover(s.name)} onMouseLeave={() => setHover(null)} tabIndex={0} onFocus={() => setHover(s.name)} onBlur={() => setHover(null)} aria-label={`${s.name}, ${s.system}`} role="img">
              <rect width={RW} height={36} rx={10} fill="hsl(var(--card))" stroke="hsl(var(--border))" strokeDasharray={s.system === "unknown" ? "4 3" : undefined} />
              <circle cx={16} cy={18} r={4} fill={s.system === "legacy" ? "hsl(var(--legacy))" : s.system === "modern" ? "hsl(var(--primary))" : "hsl(var(--muted-foreground))"} />
              <text x={28} y={22} fontSize={12} fill="hsl(var(--foreground))">{s.name}</text>
              <text x={RW - 12} y={22} fontSize={10} textAnchor="end" fill="hsl(var(--muted-foreground))">{s.system}</text>
            </g>
          ))}
        </svg>
        <p className="mt-2 text-[12px] text-muted-foreground">Solid lines: the interface has a breaking change on record. Red: high risk, amber: medium. Dashed boxes are consumers we cannot match to a known project.</p>
      </Card>

      <div className="space-y-3 lg:hidden">
        {interfaces.map((itf) => (
          <Card key={itf.code} className="p-4">
            <button type="button" onClick={() => onOpen(itf.code)} className="flex w-full flex-wrap items-center gap-2 text-left">
              <span className="font-mono text-[12px] font-semibold text-primary">{itf.code}</span>
              <span className="flex-1 font-semibold">{itf.name}</span>
              <Pill tone={RISK_TONE[itf.risk]}>{itf.risk} risk</Pill>
            </button>
            <div className="mt-1 text-[12px] text-muted-foreground">{itf.kind_label} · {itf.status} · {itf.breaking_changes} breaking changes</div>
            <ul className="mt-2 space-y-1 text-[13px]">
              {itf.consumers.map((c) => <li key={c.name} className={cn(c.system === "unknown" && "text-muted-foreground")}>→ {c.system === "unknown" ? c.name : <SystemDot system={c.system} label={false} />} {c.system !== "unknown" && c.name}{c.system === "unknown" && " (unclassified)"}</li>)}
            </ul>
          </Card>
        ))}
      </div>
    </div>
  );
}
