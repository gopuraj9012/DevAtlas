import { useEffect, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { BookX, Search } from "lucide-react";
import { api, type GlossaryEntry } from "@/lib/api";
import { AppShell } from "@/components/shell/AppShell";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Chip, EmptyPanel, ErrorBanner, ListSkeleton, OriginTag, PageHeader, SystemDot, SystemTag } from "@/components/kb/Bits";

export default function Glossary() {
  const [params, setParams] = useSearchParams();
  const [text, setText] = useState(params.get("q") ?? "");
  const [system, setSystem] = useState<"" | "legacy" | "modern">("");
  const q = params.get("q") ?? "";
  useEffect(() => {
    const t = setTimeout(() => setParams(text ? { q: text } : {}, { replace: true }), 200);
    return () => clearTimeout(t);
  }, [text, setParams]);
  const terms = useQuery({ queryKey: ["glossary", q, system], queryFn: () => api<GlossaryEntry[]>(`/glossary?q=${encodeURIComponent(q)}&system=${system}`) });

  return (
    <AppShell>
      <PageHeader eyebrow="Glossary" title="Terms we use" description="Words you will hear in standups, with what they mean on each side of the estate." />
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
        <div className="relative flex-1">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" aria-hidden />
          <Input value={text} onChange={(e) => setText(e.target.value)} className="pl-9" placeholder="Search terms" aria-label="Search terms" />
        </div>
        <div className="flex gap-2" role="group" aria-label="Filter by system">
          <Chip active={!system} onClick={() => setSystem("")}>All</Chip>
          <Chip active={system === "legacy"} onClick={() => setSystem("legacy")}><SystemDot system="legacy" short /></Chip>
          <Chip active={system === "modern"} onClick={() => setSystem("modern")}><SystemDot system="modern" short /></Chip>
        </div>
      </div>
      <div className="mt-6">
        {terms.isLoading && <ListSkeleton rows={6} />}
        {terms.isError && <ErrorBanner error={terms.error} onRetry={() => terms.refetch()} />}
        {terms.data?.length === 0 && <EmptyPanel icon={BookX} title="No matching terms" text="Try a different word. Maintainers can add terms from Write a doc." />}
        <div className="grid gap-3 md:grid-cols-2">
          {terms.data?.map((t) => (
            <Card key={t.id} className="p-5">
              <div className="flex items-center justify-between gap-2">
                <h2 className="font-semibold">{t.term}</h2>
                <div className="flex gap-1.5"><OriginTag origin={t.origin} /><SystemTag system={t.system} /></div>
              </div>
              <p className="mt-1.5 text-sm text-muted-foreground">{t.definition}</p>
              {(t.legacy_definition || t.modern_definition) && (
                <dl className="mt-3 grid gap-2 sm:grid-cols-2">
                  {t.legacy_definition && <div className="rounded-lg bg-legacy-soft/60 p-2.5 text-[13px]"><dt className="mb-0.5"><SystemDot system="legacy" short className="text-[11px] font-semibold" /></dt><dd>{t.legacy_definition}</dd></div>}
                  {t.modern_definition && <div className="rounded-lg bg-accent/60 p-2.5 text-[13px]"><dt className="mb-0.5"><SystemDot system="modern" short className="text-[11px] font-semibold" /></dt><dd>{t.modern_definition}</dd></div>}
                </dl>
              )}
              {t.see_also.length > 0 && (
                <div className="mt-3 flex flex-wrap gap-1.5 text-[12px] text-muted-foreground">
                  See also:
                  {t.see_also.map((s) => <button key={s} type="button" onClick={() => setText(s)} className="font-medium text-primary hover:underline">{s}</button>)}
                </div>
              )}
            </Card>
          ))}
        </div>
      </div>
    </AppShell>
  );
}
