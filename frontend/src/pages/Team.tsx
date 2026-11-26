import { useQuery } from "@tanstack/react-query";
import { Mail } from "lucide-react";
import { api, type TeamMember } from "@/lib/api";
import { initials } from "@/lib/utils";
import { AppShell } from "@/components/shell/AppShell";
import { Card } from "@/components/ui/card";
import { ErrorBanner, ListSkeleton, MicroLabel, PageHeader, Pill, SystemDot } from "@/components/kb/Bits";

export default function Team() {
  const team = useQuery({ queryKey: ["team"], queryFn: () => api<TeamMember[]>("/team") });
  return (
    <AppShell>
      <PageHeader eyebrow="Team" title="Who owns what" description="Owners and maintainers, and what to ask each of them. Anyone listed against the shared schema must sign off before you change a shared table." />
      {team.isLoading && <ListSkeleton rows={4} />}
      {team.isError && <ErrorBanner error={team.error} onRetry={() => team.refetch()} />}
      <div className="grid gap-4 md:grid-cols-2">
        {team.data?.map((m) => (
          <Card key={m.id} className="p-5">
            <div className="flex items-start gap-3">
              <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-accent text-sm font-bold text-primary" aria-hidden>{initials(m.name)}</span>
              <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="font-semibold">{m.name}</span>
                  <Pill tone={m.role === "owner" ? "violet" : "neutral"} className="uppercase tracking-wider">{m.role}</Pill>
                </div>
                <div className="text-[13px] text-muted-foreground">{m.title}</div>
              </div>
            </div>
            <div className="mt-4 space-y-2 text-[13px]">
              <div className="flex flex-wrap items-center gap-2"><MicroLabel>Systems</MicroLabel>{m.systems.map((s) => <SystemDot key={s} system={s} short />)}</div>
              <div><MicroLabel className="mb-0.5">Owns</MicroLabel>{m.owns.join(", ")}</div>
              <div><MicroLabel className="mb-0.5">Ask about</MicroLabel>{m.ask_about}</div>
              <div className="inline-flex items-center gap-1.5 font-mono text-[12px] text-muted-foreground"><Mail className="h-3.5 w-3.5" aria-hidden />{m.email}</div>
            </div>
          </Card>
        ))}
      </div>
    </AppShell>
  );
}
