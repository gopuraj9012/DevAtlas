import { useEffect, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { AlertTriangle, ChevronDown, GitCompare, Search } from "lucide-react";
import { api, type Category, type Translation } from "@/lib/api";
import { cn } from "@/lib/utils";
import { AppShell } from "@/components/shell/AppShell";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Chip, EmptyPanel, ErrorBanner, ListSkeleton, MicroLabel, PageHeader, Pill } from "@/components/kb/Bits";
import { SplitCompare } from "@/components/kb/SplitCompare";

const RISK_TONE = { low: "green", medium: "amber", high: "red" } as const;

export default function Translations() {
  const [params, setParams] = useSearchParams();
  const [text, setText] = useState("");
  const [category, setCategory] = useState("");
  const focus = params.get("code");
  const [open, setOpen] = useState<string | null>(focus);
  const [dq, setDq] = useState("");
  useEffect(() => { const t = setTimeout(() => setDq(text), 200); return () => clearTimeout(t); }, [text]);
  useEffect(() => { if (focus) { setOpen(focus); setTimeout(() => document.getElementById(`tr-${focus}`)?.scrollIntoView({ block: "start" }), 50); } }, [focus]);

  const cats = useQuery({ queryKey: ["translation-cats"], queryFn: () => api<Category[]>("/translations/categories") });
  const qs = new URLSearchParams({ q: dq, category }).toString();
  const list = useQuery({ queryKey: ["translations", qs], queryFn: () => api<Translation[]>(`/translations?${qs}`) });

  return (
    <AppShell>
      <PageHeader eyebrow="Translator" title="Legacy to modern patterns" description="How a familiar .NET Framework pattern is written in .NET 8, the steps to move it, and the traps people fall into." />
      <div className="space-y-3">
        <div className="relative">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" aria-hidden />
          <Input value={text} onChange={(e) => setText(e.target.value)} className="pl-9" placeholder="Search patterns: WCF, Session, DataTable…" aria-label="Search patterns" />
        </div>
        <div className="flex flex-wrap gap-2">
          <Chip active={!category} onClick={() => setCategory("")}>All</Chip>
          {cats.data?.map((c) => <Chip key={c.key} active={category === c.key} onClick={() => setCategory(category === c.key ? "" : c.key)} count={c.count}>{c.label}</Chip>)}
        </div>
      </div>
      <div className="mt-6 space-y-3">
        {list.isLoading && <ListSkeleton rows={5} />}
        {list.isError && <ErrorBanner error={list.error} onRetry={() => list.refetch()} />}
        {list.data?.length === 0 && <EmptyPanel icon={GitCompare} title="No patterns match" text="Try another term or category." />}
        {list.data?.map((t) => {
          const isOpen = open === t.code;
          return (
            <Card key={t.code} id={`tr-${t.code}`} className="scroll-mt-20 overflow-hidden">
              <button type="button" aria-expanded={isOpen} onClick={() => { setOpen(isOpen ? null : t.code); if (focus) setParams({}, { replace: true }); }} className="flex w-full items-start gap-3 p-5 text-left hover:bg-secondary/40">
                <span className="w-12 shrink-0 font-mono text-[12px] font-semibold text-primary">{t.code}</span>
                <div className="min-w-0 flex-1">
                  <div className="font-semibold">{t.pattern}</div>
                  <div className="mt-0.5 text-[13px] text-muted-foreground">{t.intent}</div>
                </div>
                <div className="hidden gap-1.5 sm:flex">
                  <Pill mono>effort {t.effort}</Pill>
                  <Pill tone={RISK_TONE[t.risk]}>{t.risk} risk</Pill>
                </div>
                <ChevronDown className={cn("h-4 w-4 shrink-0 text-muted-foreground transition-transform", isOpen && "rotate-180")} aria-hidden />
              </button>
              {isOpen && (
                <div className="space-y-5 border-t border-border p-5">
                  <SplitCompare legacy={t.legacy} modern={t.modern} />
                  <div className="grid gap-5 md:grid-cols-2">
                    <div>
                      <MicroLabel className="mb-2">What changes</MicroLabel>
                      <ol className="list-decimal space-y-1.5 pl-5 text-sm">{t.steps.map((s) => <li key={s}>{s}</li>)}</ol>
                    </div>
                    <div>
                      <MicroLabel className="mb-2">Migration traps</MicroLabel>
                      <ul className="space-y-2 text-sm">{t.gotchas.map((g) => <li key={g} className="flex gap-2"><AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-legacy" aria-hidden />{g}</li>)}</ul>
                    </div>
                  </div>
                  <div className="flex flex-wrap gap-1.5">{t.tags.map((g) => <Pill key={g} mono>#{g}</Pill>)}</div>
                </div>
              )}
            </Card>
          );
        })}
      </div>
    </AppShell>
  );
}
