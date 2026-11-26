import { useEffect, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { SearchX, Search as SearchIcon } from "lucide-react";
import { api, type SearchResponse } from "@/lib/api";
import { AppShell } from "@/components/shell/AppShell";
import { Input } from "@/components/ui/input";
import { Card } from "@/components/ui/card";
import { Chip, EmptyPanel, ErrorBanner, ListSkeleton, PageHeader, SystemDot } from "@/components/kb/Bits";
import { hitLink, TYPE_META } from "@/components/kb/SearchDialog";

export default function SearchPage() {
  const [params, setParams] = useSearchParams();
  const q = params.get("q") ?? "";
  const [text, setText] = useState(q);
  const [type, setType] = useState<string | null>(null);
  useEffect(() => setText(q), [q]);
  useEffect(() => {
    const t = setTimeout(() => { if (text !== q) setParams(text ? { q: text } : {}, { replace: true }); }, 250);
    return () => clearTimeout(t);
  }, [text, q, setParams]);

  const res = useQuery({
    queryKey: ["search", q, 60],
    queryFn: ({ signal }) => api<SearchResponse>(`/search?q=${encodeURIComponent(q)}&limit=60`, { signal }),
    enabled: q.trim().length > 0,
  });
  const results = (res.data?.results ?? []).filter((r) => !type || r.type === type);

  return (
    <AppShell>
      <PageHeader eyebrow="Search" title="Search everything" description="Docs, standards, validation rules, snippets, translations, contracts, deployments, glossary terms and projects, ranked together." />
      <div className="relative">
        <SearchIcon className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" aria-hidden />
        <Input autoFocus value={text} onChange={(e) => setText(e.target.value)} className="h-11 pl-9 text-[15px]" placeholder="Try: usp_SaveOrder, HttpContext, OrderPlaced, VR-010…" aria-label="Search" />
      </div>
      {res.data && res.data.facets.length > 0 && (
        <div className="mt-4 flex flex-wrap gap-2" role="group" aria-label="Filter by type">
          <Chip active={!type} onClick={() => setType(null)} count={res.data.total}>All</Chip>
          {res.data.facets.map((f) => <Chip key={f.key} active={type === f.key} onClick={() => setType(type === f.key ? null : f.key)} count={f.count}>{f.label}</Chip>)}
        </div>
      )}
      <div className="mt-6">
        {!q && <EmptyPanel icon={SearchIcon} title="Search the knowledge base" text="Results rank titles first, then identifiers, summaries, tags and code." />}
        {res.isLoading && <ListSkeleton rows={5} />}
        {res.isError && <ErrorBanner error={res.error} onRetry={() => res.refetch()} />}
        {res.data && res.data.count === 0 && <EmptyPanel icon={SearchX} title={`No matches for “${q}”`} text="Try a shorter term, an identifier such as CS-001, or a class name." />}
        {res.data && res.data.count > 0 && (
          <>
            <p className="mb-3 text-[13px] text-muted-foreground">{res.data.total} results in {res.data.took_ms} ms{res.data.total > res.data.count ? `, showing the top ${res.data.count}` : ""}</p>
            <div className="space-y-2">
              {results.map((h, i) => {
                const meta = TYPE_META[h.type];
                return (
                  <Link key={`${h.type}-${h.slug}-${i}`} to={hitLink(h)} className="block rounded-xl focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">
                    <Card className="flex gap-3 p-4 transition-shadow hover:shadow-lift">
                      <meta.icon className="mt-0.5 h-4 w-4 shrink-0 text-primary" aria-hidden />
                      <div className="min-w-0 flex-1">
                        <div className="flex flex-wrap items-center gap-2">
                          <span className="font-semibold">{h.label}</span>
                          <span className="text-[12px] text-muted-foreground">{meta.label} · {h.hint}</span>
                          {h.system && <SystemDot system={h.system} short className="text-[12px] text-muted-foreground" />}
                        </div>
                        <p className="mt-1 line-clamp-2 text-[13px] text-muted-foreground">{h.excerpt}</p>
                      </div>
                      <span className="hidden font-mono text-[11px] text-muted-foreground sm:block">{h.score}</span>
                    </Card>
                  </Link>
                );
              })}
            </div>
          </>
        )}
      </div>
    </AppShell>
  );
}
