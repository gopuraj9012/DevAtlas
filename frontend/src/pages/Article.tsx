import { useEffect, useMemo, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { ArrowLeft, ArrowRight, BookCheck, Clock, FileQuestion, Flag, ListTree, PencilLine, ThumbsDown, ThumbsUp } from "lucide-react";
import { toast } from "sonner";
import { api, ApiError, type ArticleDetail, type Progress } from "@/lib/api";
import { useAuth } from "@/lib/auth";
import { cn, initials, timeAgo } from "@/lib/utils";
import { AppShell } from "@/components/shell/AppShell";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent } from "@/components/ui/dialog";
import { Skeleton } from "@/components/ui/skeleton";
import { BlockRenderer, headingId } from "@/components/kb/BlockRenderer";
import { EmptyPanel, ErrorBanner, MetaRow, MicroLabel, OriginTag, SYSTEM_LABEL, SystemDot, SystemTag } from "@/components/kb/Bits";

function useScrollSpy(ids: string[]) {
  const [active, setActive] = useState<string | null>(ids[0] ?? null);
  useEffect(() => {
    if (!ids.length) return;
    const obs = new IntersectionObserver(
      (entries) => {
        const visible = entries.filter((e) => e.isIntersecting).sort((a, b) => a.boundingClientRect.top - b.boundingClientRect.top);
        if (visible[0]) setActive(visible[0].target.id);
      },
      { rootMargin: "-80px 0px -65% 0px" },
    );
    ids.forEach((id) => { const el = document.getElementById(id); if (el) obs.observe(el); });
    return () => obs.disconnect();
  }, [ids]);
  return active;
}

function Toc({ headings, active, onNavigate }: { headings: { id: string; text: string }[]; active: string | null; onNavigate?: () => void }) {
  if (!headings.length) return <p className="text-[12px] text-muted-foreground">No sections.</p>;
  return (
    <nav aria-label="On this page">
      <MicroLabel className="mb-3">On this page</MicroLabel>
      <ul className="space-y-1 border-l border-border">
        {headings.map((h) => (
          <li key={h.id}>
            <a
              href={`#${h.id}`}
              onClick={onNavigate}
              aria-current={active === h.id ? "location" : undefined}
              className={cn("-ml-px block border-l-2 py-1 pl-3 text-[12px] font-medium transition-colors", active === h.id ? "border-primary text-primary" : "border-transparent text-muted-foreground hover:text-foreground")}
            >
              {h.text}
            </a>
          </li>
        ))}
      </ul>
    </nav>
  );
}

export default function Article() {
  const { slug = "" } = useParams();
  const { canEdit } = useAuth();
  const qc = useQueryClient();
  const [tocOpen, setTocOpen] = useState(false);
  const q = useQuery({ queryKey: ["article", slug], queryFn: () => api<ArticleDetail>(`/articles/${slug}`) });
  const progress = useQuery({ queryKey: ["progress"], queryFn: () => api<Progress>("/progress") });
  const read = progress.data?.articles.includes(slug) ?? false;
  const toggleRead = useMutation({
    mutationFn: () => api<Progress>("/progress/article", { body: { slug } }),
    onSuccess: (p) => { qc.setQueryData(["progress"], p); toast.success(p.articles.includes(slug) ? "Marked as read" : "Marked as unread"); },
    onError: (e) => toast.error(e instanceof Error ? e.message : "Could not update"),
  });

  const a = q.data;
  const headings = useMemo(() => (a?.blocks ?? []).filter((b) => b.type === "h2").map((b) => ({ id: headingId((b as { text: string }).text), text: (b as { text: string }).text })), [a]);
  const ids = useMemo(() => headings.map((h) => h.id), [headings]);
  const active = useScrollSpy(ids);

  useEffect(() => { window.scrollTo(0, 0); }, [slug]);

  if (q.isError && q.error instanceof ApiError && q.error.status === 404) {
    return (
      <AppShell>
        <EmptyPanel icon={FileQuestion} title="That doc does not exist" text="It may have been renamed or removed. Try search, or go back to the dashboard." action={<Link to="/dashboard"><Button>Back to dashboard</Button></Link>} />
      </AppShell>
    );
  }

  const flagUrl = a ? `/feedback?type=architecture&ref=${encodeURIComponent(a.slug)}&label=${encodeURIComponent(a.title)}` : "/feedback";

  const toc = (
    <aside className="sticky top-14 hidden h-[calc(100vh-84px)] w-[220px] shrink-0 overflow-y-auto py-8 pr-6 lg:block">
      {a ? <Toc headings={headings} active={active} /> : <Skeleton className="h-40" />}
    </aside>
  );

  return (
    <AppShell toc={toc}>
      {q.isError && <ErrorBanner error={q.error} onRetry={() => q.refetch()} />}
      {q.isLoading && (
        <div className="mx-auto max-w-[720px] space-y-4"><Skeleton className="h-4 w-48" /><Skeleton className="h-10 w-3/4" /><Skeleton className="h-4 w-64" /><Skeleton className="h-72" /></div>
      )}
      {a && (
        <article className="mx-auto max-w-[720px]">
          <nav aria-label="Breadcrumb" className="mb-4 flex flex-wrap items-center gap-1.5 text-[13px] text-muted-foreground">
            <SystemDot system={a.system} label={false} />
            <span>{a.project ?? SYSTEM_LABEL[a.system]}</span>
            <span>/</span>
            <span className="capitalize">{a.section}</span>
          </nav>
          <h1 className="text-[32px] font-bold leading-tight tracking-[-0.02em]">{a.title}</h1>
          {a.summary && <p className="mt-2 text-[17px] text-muted-foreground">{a.summary}</p>}
          <div className="mt-4 flex flex-wrap items-center justify-between gap-3">
            <MetaRow>
              <span className="inline-flex items-center gap-1.5">
                <span className="flex h-5 w-5 items-center justify-center rounded-full bg-accent text-[9px] font-bold text-primary" aria-hidden>{initials(a.edited_by ?? "DevAtlas")}</span>
                {a.edited_by ?? "DevAtlas"}
              </span>
              <span>Updated {timeAgo(a.updated)}</span>
              <span className="inline-flex items-center gap-1"><Clock className="h-3.5 w-3.5" aria-hidden />{a.read_minutes} min read</span>
              <span className="font-mono text-[11px]">{a.doc_id}</span>
              <SystemTag system={a.system} />
              <OriginTag origin={a.origin} />
            </MetaRow>
            <div className="flex gap-2">
              <Button variant="secondary" size="sm" className="lg:hidden" onClick={() => setTocOpen(true)}><ListTree /> Outline</Button>
              {canEdit && <Link to={`/authoring?edit=${a.slug}`}><Button variant="secondary" size="sm"><PencilLine /> Edit</Button></Link>}
              <Button variant={read ? "secondary" : "primary"} size="sm" onClick={() => toggleRead.mutate()} loading={toggleRead.isPending}>
                <BookCheck /> {read ? "Read" : "Mark read"}
              </Button>
            </div>
          </div>
          {a.origin === "IMPORTED" && (
            <div className="mt-6 rounded-xl border border-warning/30 bg-warning/5 px-4 py-3 text-[13px]">
              Generated from an imported codebase. It describes what the code contains, not what the team intended. Review before relying on it.
            </div>
          )}
          <div className="mt-6"><BlockRenderer blocks={a.blocks} /></div>

          <div className="mt-12 flex flex-col gap-3 rounded-xl border border-border bg-secondary/40 p-4 sm:flex-row sm:items-center">
            <span className="flex-1 text-sm font-medium">Was this accurate?</span>
            <div className="flex flex-wrap gap-2">
              <Button variant="secondary" size="sm" onClick={() => toast.success("Thanks. Glad it helped.")}><ThumbsUp /> Yes</Button>
              <Link to={flagUrl}><Button variant="secondary" size="sm"><ThumbsDown /> No, flag it</Button></Link>
              <Link to={flagUrl}><Button variant="ghost" size="sm"><Flag /> Flag as outdated</Button></Link>
            </div>
          </div>

          <nav aria-label="More docs" className="mt-6 grid gap-3 sm:grid-cols-2 [&>*]:min-w-0">
            {a.prev ? (
              <Link to={`/article/${a.prev.slug}`} className="rounded-xl border border-border p-4 hover:bg-secondary">
                <div className="flex items-center gap-1 text-[12px] text-muted-foreground"><ArrowLeft className="h-3.5 w-3.5" /> Previous</div>
                <div className="mt-1 text-sm font-semibold">{a.prev.title}</div>
              </Link>
            ) : <span />}
            {a.next && (
              <Link to={`/article/${a.next.slug}`} className="rounded-xl border border-border p-4 text-right hover:bg-secondary">
                <div className="flex items-center justify-end gap-1 text-[12px] text-muted-foreground">Next <ArrowRight className="h-3.5 w-3.5" /></div>
                <div className="mt-1 text-sm font-semibold">{a.next.title}</div>
              </Link>
            )}
          </nav>

          {a.sidebar.length > 1 && (
            <section className="mt-10">
              <MicroLabel className="mb-2">More in {a.section}</MicroLabel>
              <ul className="space-y-1">
                {a.sidebar.filter((s) => s.slug !== a.slug).map((s) => (
                  <li key={s.slug}><Link to={`/article/${s.slug}`} className="flex items-center gap-2 rounded-lg px-2 py-1.5 text-sm hover:bg-secondary">{s.system && <SystemDot system={s.system} label={false} />}{s.title}</Link></li>
                ))}
              </ul>
            </section>
          )}
        </article>
      )}
      <Dialog open={tocOpen} onOpenChange={setTocOpen}>
        <DialogContent title="Outline" side="right"><Toc headings={headings} active={active} onNavigate={() => setTocOpen(false)} /></DialogContent>
      </Dialog>
    </AppShell>
  );
}
