import { Link } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { api, type Coverage } from "@/lib/api";
import { AppShell } from "@/components/shell/AppShell";
import { Card } from "@/components/ui/card";
import { ErrorBanner, ListSkeleton, MicroLabel, PageHeader, Pill, ProgressMeter } from "@/components/kb/Bits";

const STATUS_TONE = { rewritten: "green", partial: "amber", "not-started": "red" } as const;

function Ring({ value }: { value: number }) {
  const r = 52, c = 2 * Math.PI * r;
  return (
    <svg viewBox="0 0 128 128" className="h-36 w-36" role="img" aria-label={`${value}% migrated`}>
      <circle cx="64" cy="64" r={r} fill="none" stroke="hsl(var(--secondary))" strokeWidth="12" />
      <circle cx="64" cy="64" r={r} fill="none" stroke="hsl(var(--primary))" strokeWidth="12" strokeLinecap="round" strokeDasharray={c} strokeDashoffset={c * (1 - value / 100)} transform="rotate(-90 64 64)" />
      <text x="64" y="70" textAnchor="middle" fontSize="26" fontWeight="700" fill="hsl(var(--foreground))">{value}%</text>
    </svg>
  );
}

export default function CoveragePage() {
  const q = useQuery({ queryKey: ["coverage"], queryFn: () => api<Coverage>("/coverage/migration") });
  const d = q.data;
  return (
    <AppShell>
      <PageHeader eyebrow="Insight" title="Migration coverage" description="How much of the legacy surface has a documented modern replacement. Built from documented status, so every number can be traced to a row below." />
      {q.isLoading && <ListSkeleton rows={4} />}
      {q.isError && <ErrorBanner error={q.error} onRetry={() => q.refetch()} />}
      {d && (
        <>
          <div className="grid gap-4 md:grid-cols-[auto_1fr]">
            <Card className="flex items-center gap-5 p-6">
              <Ring value={d.overall.percent} />
              <div className="text-sm">
                <div className="font-semibold">{d.overall.total} legacy assets</div>
                <div className="mt-1 text-muted-foreground">{d.overall.mapped} rewritten · {d.overall.partial} partly · {d.overall.not_started} not started</div>
                <div className="mt-1 font-mono text-[11px] text-muted-foreground">weighted {d.overall.weighted} / {d.overall.total}</div>
              </div>
            </Card>
            <Card className="space-y-5 p-6">
              {d.by_area.map((a) => (
                <div key={a.key}>
                  <div className="mb-1.5 flex justify-between text-sm"><span className="font-medium">{a.label}</span><span className="text-muted-foreground">{a.mapped} rewritten · {a.partial} partly · {a.not_started} not started</span></div>
                  <ProgressMeter value={a.percent} />
                </div>
              ))}
              <p className="text-[12px] text-muted-foreground">{d.note}</p>
            </Card>
          </div>

          <section className="mt-10">
            <h2 className="mb-3 text-xl font-bold tracking-tight">Still to migrate</h2>
            <div className="grid gap-3 md:grid-cols-2 [&>*]:min-w-0">
              {d.remaining.map((i) => (
                <Card key={`${i.area}-${i.name}`} className="p-4">
                  <div className="flex items-center gap-2"><span className="min-w-0 flex-1 break-all font-mono text-[13px] font-semibold">{i.name}</span><Pill tone={STATUS_TONE[i.status]}>{i.status_label}</Pill></div>
                  <div className="mt-1 text-[12px] text-muted-foreground">{i.area === "procedures" ? "Stored procedure" : "Legacy interface"} · {i.project}</div>
                  <p className="mt-2 text-[13px]">{i.note}</p>
                  <Link to={i.link} className="mt-2 inline-block text-[12px] font-medium text-primary hover:underline">Open →</Link>
                </Card>
              ))}
            </div>
          </section>

          <section className="mt-10">
            <MicroLabel className="mb-2">All assets</MicroLabel>
            <div className="overflow-x-auto rounded-xl border border-border bg-card shadow-soft">
              <table className="w-full text-left text-sm">
                <thead className="bg-secondary/60"><tr><th className="px-3 py-2 font-semibold">Asset</th><th className="px-3 py-2 font-semibold">Area</th><th className="px-3 py-2 font-semibold">Project</th><th className="px-3 py-2 font-semibold">Contract</th><th className="px-3 py-2 font-semibold">Status</th><th className="px-3 py-2 text-right font-semibold">Weight</th></tr></thead>
                <tbody>
                  {d.items.map((i) => (
                    <tr key={`${i.area}-${i.name}`} className="border-t border-border">
                      <td className="px-3 py-2 font-mono text-[12.5px]"><Link to={i.link} className="hover:text-primary hover:underline">{i.name}</Link></td>
                      <td className="px-3 py-2 text-muted-foreground">{i.area === "procedures" ? "Procedure" : "Interface"}</td>
                      <td className="px-3 py-2">{i.project}</td>
                      <td className="px-3 py-2 font-mono text-[12px]"><Link to={`/contracts?code=${i.contract}`} className="text-primary hover:underline">{i.contract}</Link></td>
                      <td className="px-3 py-2"><Pill tone={STATUS_TONE[i.status]}>{i.status_label}</Pill></td>
                      <td className="px-3 py-2 text-right font-mono text-[12px]">{i.weight}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>
        </>
      )}
    </AppShell>
  );
}
