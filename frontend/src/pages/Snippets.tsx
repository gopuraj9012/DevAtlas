import { useEffect, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { Eye, EyeOff, FileX, Search, XCircle } from "lucide-react";
import { api, type Category, type LearnSnippet } from "@/lib/api";
import { AppShell } from "@/components/shell/AppShell";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Chip, EmptyPanel, ErrorBanner, ListSkeleton, PageHeader, ProgressMeter, SystemDot, SystemTag } from "@/components/kb/Bits";
import { CodeBlock } from "@/components/kb/CodeBlock";

export default function Snippets() {
  const [params, setParams] = useSearchParams();
  const [text, setText] = useState(params.get("q") ?? "");
  const [category, setCategory] = useState("");
  const system = params.get("system") ?? "";
  const q = params.get("q") ?? "";
  const [revealed, setRevealed] = useState<Set<string>>(new Set());

  useEffect(() => {
    const t = setTimeout(() => setParams((p) => { if (text) p.set("q", text); else p.delete("q"); return p; }, { replace: true }), 200);
    return () => clearTimeout(t);
  }, [text, setParams]);

  const cats = useQuery({ queryKey: ["snippet-cats"], queryFn: () => api<Category[]>("/snippets/categories") });
  const qs = new URLSearchParams({ q, category, system }).toString();
  const list = useQuery({ queryKey: ["snippets", qs], queryFn: () => api<LearnSnippet[]>(`/snippets?${qs}`) });
  const data = list.data ?? [];
  const shown = data.filter((s) => revealed.has(s.code)).length;
  const setSystem = (s: string) => setParams((p) => { if (s) p.set("system", s); else p.delete("system"); return p; });

  const toggle = (code: string) => setRevealed((r) => { const n = new Set(r); if (n.has(code)) n.delete(code); else n.add(code); return n; });
  const allRevealed = data.length > 0 && shown === data.length;

  return (
    <AppShell>
      <PageHeader
        eyebrow="Trainer"
        title="Bad vs standard"
        description="Each card shows code that breaks one of our standards. Work out what is wrong, then reveal how we write it instead."
        actions={<Button variant="secondary" onClick={() => setRevealed(allRevealed ? new Set() : new Set(data.map((s) => s.code)))}>{allRevealed ? <><EyeOff /> Hide all</> : <><Eye /> Reveal all</>}</Button>}
      />
      <Card className="mb-5 flex flex-col gap-2 p-4 sm:flex-row sm:items-center">
        <span className="text-sm font-medium">{shown} of {data.length} revealed</span>
        <ProgressMeter value={data.length ? (shown / data.length) * 100 : 0} className="sm:w-64" />
      </Card>
      <div className="space-y-3">
        <div className="relative">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" aria-hidden />
          <Input value={text} onChange={(e) => setText(e.target.value)} className="pl-9" placeholder="Search by standard, title, tag or code" aria-label="Search snippets" />
        </div>
        <div className="flex flex-wrap gap-2">
          <Chip active={!category} onClick={() => setCategory("")}>All</Chip>
          {cats.data?.map((c) => <Chip key={c.key} active={category === c.key} onClick={() => setCategory(category === c.key ? "" : c.key)} count={c.count}>{c.label}</Chip>)}
          <span className="mx-1 h-5 w-px self-center bg-border" aria-hidden />
          {(["", "legacy", "modern"] as const).map((s) => <Chip key={s || "any"} active={system === s} onClick={() => setSystem(s)}>{s ? <SystemDot system={s} short /> : "Both systems"}</Chip>)}
        </div>
      </div>
      <div className="mt-6 space-y-5">
        {list.isLoading && <ListSkeleton rows={3} />}
        {list.isError && <ErrorBanner error={list.error} onRetry={() => list.refetch()} />}
        {list.data?.length === 0 && <EmptyPanel icon={FileX} title="No snippets match" text="Clear the search or pick another category." />}
        {data.map((s) => {
          const open = revealed.has(s.code);
          return (
            <Card key={s.code} className="p-5">
              <div className="flex flex-wrap items-center gap-2">
                <span className="font-mono text-[12px] font-semibold text-primary">{s.code}</span>
                <Link to={`/standards?rule=${s.rule}`} className="font-mono text-[12px] text-muted-foreground hover:text-primary hover:underline">{s.rule}</Link>
                <h2 className="flex-1 font-semibold">{s.title}</h2>
                <SystemTag system={s.system} />
              </div>
              <div className="mt-4 grid gap-4 lg:grid-cols-2 [&>*]:min-w-0">
                <div>
                  <CodeBlock code={s.bad.code} lang={s.bad.lang} header={<span className="flex items-center gap-1.5 text-destructive"><XCircle className="h-3.5 w-3.5" /> Breaks {s.rule} Â· {s.bad.filename}</span>} />
                  <ul className="mt-3 list-disc space-y-1 pl-5 text-[13px] text-muted-foreground">{s.why_bad.map((w) => <li key={w}>{w}</li>)}</ul>
                </div>
                <div>
                  {open ? (
                    <>
                      <CodeBlock code={s.standard.code} lang={s.standard.lang} header={<span className="flex items-center gap-1.5 text-primary"><span className="h-2 w-2 rounded-full bg-primary" /> Our standard Â· {s.standard.filename}</span>} />
                      <p className="mt-3 text-[13px]"><span className="font-medium">Instead:</span> {s.instead}</p>
                    </>
                  ) : (
                    <button type="button" onClick={() => toggle(s.code)} className="flex h-full min-h-[160px] w-full flex-col items-center justify-center gap-2 rounded-xl border-[1.5px] border-dashed border-border text-sm font-medium text-muted-foreground transition-colors hover:border-primary hover:bg-accent/40 hover:text-primary">
                      <Eye className="h-5 w-5" aria-hidden /> Reveal the standard
                    </button>
                  )}
                  {open && <Button variant="ghost" size="sm" className="mt-2" onClick={() => toggle(s.code)}><EyeOff /> Hide</Button>}
                </div>
              </div>
            </Card>
          );
        })}
      </div>
    </AppShell>
  );
}
