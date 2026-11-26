import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { Command } from "cmdk";
import * as D from "@radix-ui/react-dialog";
import { ArrowRight, BookOpen, Boxes, FileCode2, FolderGit2, GitCompare, Loader2, Rocket, Scale, Search, ShieldCheck, SpellCheck, type LucideIcon } from "lucide-react";
import { api, type SearchHit, type SearchResponse, type SearchType } from "@/lib/api";
import { useShell } from "@/lib/store";
import { SystemDot } from "./Bits";

export const TYPE_META: Record<SearchType, { label: string; icon: LucideIcon }> = {
  article: { label: "Doc", icon: BookOpen },
  rule: { label: "Standard", icon: Scale },
  validation: { label: "Validation", icon: ShieldCheck },
  snippet: { label: "Snippet", icon: FileCode2 },
  translation: { label: "Translation", icon: GitCompare },
  contract: { label: "Contract", icon: Boxes },
  deployment: { label: "Deployment", icon: Rocket },
  term: { label: "Term", icon: SpellCheck },
  project: { label: "Project", icon: FolderGit2 },
};

export function hitLink(h: SearchHit): string {
  const s = encodeURIComponent(h.slug);
  switch (h.type) {
    case "article": return `/article/${s}`;
    case "rule": return h.slug.startsWith("VR") ? `/validation?q=${s}` : `/standards?rule=${s}`;
    case "validation": return `/validation?q=${s}`;
    case "snippet": return `/snippets?q=${s}`;
    case "translation": return `/translations?code=${s}`;
    case "contract": return `/contracts?code=${s}`;
    case "deployment": return `/deployments`;
    case "term": return `/glossary?q=${s}`;
    case "project": return `/projects/${s}`;
  }
}

function useDebounced<T>(value: T, ms: number) {
  const [v, setV] = useState(value);
  useEffect(() => {
    const t = setTimeout(() => setV(value), ms);
    return () => clearTimeout(t);
  }, [value, ms]);
  return v;
}

export function SearchDialog() {
  const open = useShell((s) => s.searchOpen);
  const setOpen = useShell((s) => s.setSearchOpen);
  const [q, setQ] = useState("");
  const dq = useDebounced(q.trim(), 160);
  const navigate = useNavigate();

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        setOpen(!useShell.getState().searchOpen);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [setOpen]);

  const { data, isFetching } = useQuery({
    queryKey: ["search", dq, 12],
    queryFn: ({ signal }) => api<SearchResponse>(`/search?q=${encodeURIComponent(dq)}&limit=12`, { signal }),
    enabled: open && dq.length > 0,
    staleTime: 30_000,
  });

  const go = (to: string) => {
    setOpen(false);
    setQ("");
    navigate(to);
  };

  return (
    <D.Root open={open} onOpenChange={setOpen}>
      <D.Portal>
        <D.Overlay className="fixed inset-0 z-50 bg-foreground/30 data-[state=open]:animate-in data-[state=open]:fade-in-0" />
        <D.Content className="fixed left-1/2 top-[12vh] z-50 w-[min(94vw,640px)] -translate-x-1/2 overflow-hidden rounded-xl border border-border bg-card shadow-lift focus:outline-none">
          <D.Title className="sr-only">Search DevAtlas</D.Title>
          <D.Description className="sr-only">Search projects, docs, standards, contracts and more.</D.Description>
          <Command shouldFilter={false} label="Search DevAtlas">
            <div className="flex items-center gap-2 border-b border-border px-4">
              <Search className="h-4 w-4 text-muted-foreground" aria-hidden />
              <Command.Input
                value={q}
                onValueChange={setQ}
                placeholder="Search projects, docs, standards…"
                className="h-12 flex-1 bg-transparent text-[15px] outline-none placeholder:text-muted-foreground focus-visible:ring-0 focus-visible:ring-offset-0"
              />
              {isFetching && <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" aria-label="Searching" />}
            </div>
            <Command.List className="max-h-[60vh] overflow-y-auto p-2">
              {!dq && <div className="px-3 py-8 text-center text-sm text-muted-foreground">Type to search across every doc, standard, contract and project.</div>}
              {dq && data && data.count === 0 && <Command.Empty className="px-3 py-8 text-center text-sm text-muted-foreground">No matches for “{dq}”.</Command.Empty>}
              {data?.results.map((h, i) => {
                const meta = TYPE_META[h.type];
                const Icon = meta.icon;
                return (
                  <Command.Item
                    key={`${h.type}-${h.slug}-${i}`}
                    value={`${h.type}-${h.slug}-${i}`}
                    onSelect={() => go(hitLink(h))}
                    className="flex cursor-pointer items-start gap-3 rounded-lg px-3 py-2.5 data-[selected=true]:bg-accent"
                  >
                    <Icon className="mt-0.5 h-4 w-4 shrink-0 text-primary" aria-hidden />
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2">
                        <span className="truncate text-sm font-medium">{h.label}</span>
                        {h.system && <SystemDot system={h.system} label={false} />}
                      </div>
                      <div className="truncate text-xs text-muted-foreground">{meta.label} · {h.hint}</div>
                    </div>
                  </Command.Item>
                );
              })}
              {dq && data && data.total > data.count && (
                <Command.Item value="see-all" onSelect={() => go(`/search?q=${encodeURIComponent(dq)}`)} className="flex cursor-pointer items-center gap-2 rounded-lg px-3 py-2.5 text-sm font-medium text-primary data-[selected=true]:bg-accent">
                  See all {data.total} results <ArrowRight className="h-4 w-4" />
                </Command.Item>
              )}
              {dq && data && data.total <= data.count && data.count > 0 && (
                <Command.Item value="open-search" onSelect={() => go(`/search?q=${encodeURIComponent(dq)}`)} className="flex cursor-pointer items-center gap-2 rounded-lg px-3 py-2.5 text-sm text-muted-foreground data-[selected=true]:bg-accent">
                  Open the search page <ArrowRight className="h-4 w-4" />
                </Command.Item>
              )}
            </Command.List>
          </Command>
        </D.Content>
      </D.Portal>
    </D.Root>
  );
}
