import { useEffect } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import * as Accordion from "@radix-ui/react-accordion";
import { ChevronDown, Flag, ShieldCheck } from "lucide-react";
import { api, type RuleEntry, type ValidationRule } from "@/lib/api";
import { AppShell } from "@/components/shell/AppShell";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { ErrorBanner, ListSkeleton, PageHeader, Pill, Stat, SystemTag } from "@/components/kb/Bits";

export default function Standards() {
  const [params] = useSearchParams();
  const focus = params.get("rule");
  const rules = useQuery({ queryKey: ["rules", "coding"], queryFn: () => api<RuleEntry[]>("/rules?category=coding") });
  const validation = useQuery({ queryKey: ["validation", ""], queryFn: () => api<ValidationRule[]>("/validation") });

  useEffect(() => {
    if (focus && rules.data) document.getElementById(`rule-${focus}`)?.scrollIntoView({ block: "center" });
  }, [focus, rules.data]);

  const tiers = ["shape", "policy", "invariant"].map((t) => ({ t, n: validation.data?.filter((v) => v.tier === t).length ?? 0 }));

  return (
    <AppShell>
      <PageHeader eyebrow="Rulebook" title="Standards" description="The coding standards both systems follow, and a summary of the validation rules. Open a standard to see the good and the bad." />
      <Tabs defaultValue="coding">
        <TabsList>
          <TabsTrigger value="coding">Coding standards</TabsTrigger>
          <TabsTrigger value="validation">Validation rules</TabsTrigger>
        </TabsList>
        <TabsContent value="coding" className="pt-6">
          {rules.isLoading && <ListSkeleton rows={6} />}
          {rules.isError && <ErrorBanner error={rules.error} onRetry={() => rules.refetch()} />}
          {rules.data && (
            <Accordion.Root type="multiple" defaultValue={focus ? [focus] : []} className="space-y-2">
              {rules.data.map((r) => (
                <Accordion.Item key={r.rule_id} value={r.rule_id} id={`rule-${r.rule_id}`} className="overflow-hidden rounded-xl border border-border bg-card shadow-soft">
                  <Accordion.Header>
                    <Accordion.Trigger className="group flex w-full items-center gap-3 px-5 py-4 text-left hover:bg-secondary/40">
                      <span className="w-16 shrink-0 font-mono text-[12px] font-semibold text-primary">{r.rule_id}</span>
                      <span className="flex-1 font-semibold">{r.title}</span>
                      {r.enforced && <Pill tone="violet">Build-enforced</Pill>}
                      {r.topic && <Pill className="hidden sm:inline-flex">{r.topic}</Pill>}
                      <ChevronDown className="h-4 w-4 text-muted-foreground transition-transform group-data-[state=open]:rotate-180" aria-hidden />
                    </Accordion.Trigger>
                  </Accordion.Header>
                  <Accordion.Content className="overflow-hidden border-t border-border data-[state=closed]:animate-collapsible-up data-[state=open]:animate-collapsible-down" style={{ ["--radix-collapsible-content-height" as string]: "var(--radix-accordion-content-height)" }}>
                    <div className="space-y-3 px-5 py-4">
                      {r.rationale && <p className="text-sm">{r.rationale}</p>}
                      <div className="grid gap-3 md:grid-cols-2">
                        {r.bad && <div className="rounded-lg border border-destructive/25 bg-destructive/5 p-3"><div className="micro-label mb-1 text-destructive">Avoid</div><code className="font-mono text-[12.5px]">{r.bad}</code></div>}
                        {r.good && <div className="rounded-lg border border-success/25 bg-success/5 p-3"><div className="micro-label mb-1 text-success">Do</div><code className="font-mono text-[12.5px]">{r.good}</code></div>}
                      </div>
                      <div className="flex flex-wrap gap-2 pt-1">
                        <Link to={`/snippets?q=${r.rule_id}`}><Button variant="secondary" size="sm">See the example</Button></Link>
                        <Link to={`/feedback?type=standard&ref=${r.rule_id}&label=${encodeURIComponent(r.title)}`}><Button variant="ghost" size="sm"><Flag /> Flag this standard</Button></Link>
                      </div>
                    </div>
                  </Accordion.Content>
                </Accordion.Item>
              ))}
            </Accordion.Root>
          )}
        </TabsContent>
        <TabsContent value="validation" className="pt-6">
          {validation.isError && <ErrorBanner error={validation.error} onRetry={() => validation.refetch()} />}
          <div className="grid gap-3 sm:grid-cols-4">
            <Stat label="Rules" value={validation.data?.length ?? "…"} />
            {tiers.map(({ t, n }) => <Stat key={t} label={t} value={n} />)}
          </div>
          <Card className="mt-4 divide-y divide-border">
            {(validation.data ?? []).slice(0, 8).map((v) => (
              <Link key={v.rule_id} to={`/validation?q=${v.rule_id}`} className="flex items-center gap-3 px-5 py-3 hover:bg-secondary/40">
                <span className="w-16 font-mono text-[12px] font-semibold text-primary">{v.rule_id}</span>
                <span className="flex-1 text-sm font-medium">{v.name}</span>
                <Pill>{v.tier}</Pill>
                <SystemTag system={v.system} />
              </Link>
            ))}
          </Card>
          <Link to="/validation" className="mt-4 inline-block"><Button><ShieldCheck /> Open the validation repository</Button></Link>
        </TabsContent>
      </Tabs>
    </AppShell>
  );
}
