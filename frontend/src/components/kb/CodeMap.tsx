import { useEffect, useMemo, useState, type ReactNode } from "react";
import { useSearchParams } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import {
  ArrowRight, Box, Braces, ChevronDown, CornerDownRight, Download, FileCode2, FileText, Globe, Layers, LayoutTemplate,
  Link2, MousePointerClick, Network, PanelTop, Search, Send, Workflow, Zap, type LucideIcon,
} from "lucide-react";
import { toast } from "sonner";
import {
  api, download, ApiError, type CodeCall, type CodeCaller, type CodeLayer, type CodeMember, type CodeOverview, type CodeSearchHit,
  type CodeType, type CodeView, type Confidence,
} from "@/lib/api";
import { cn, timeAgo } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { Chip, EmptyPanel, ErrorBanner, MicroLabel, Pill, Stat } from "./Bits";

const LAYER_ORDER: CodeLayer[] = ["Controller", "Razor page", "Web Forms page", "Service", "BAL", "DAL", "Interface", "Model", "Validation", "Infrastructure", "Other"];
const LAYER_ICON: Record<CodeLayer, LucideIcon> = {
  Controller: Network, "Razor page": PanelTop, "Web Forms page": LayoutTemplate, Service: Workflow, BAL: Layers, DAL: Box,
  Interface: Braces, Model: FileText, Validation: Zap, Infrastructure: FileCode2, Other: FileCode2,
};
const CONF_TONE: Record<Confidence, "green" | "violet" | "amber" | "orange" | "neutral"> = { exact: "green", interface: "violet", likely: "amber", ambiguous: "orange", external: "neutral" };
const UI_LABEL: Record<string, [string, LucideIcon]> = {
  actionlink: ["Html.ActionLink", Link2], url_action: ["Url.Action", Link2], form: ["Form post", Send], child_action: ["Child action", CornerDownRight],
  ajax_actionlink: ["Ajax.ActionLink", Zap], tag_helper: ["Tag helper link", Link2], page_link: ["Razor Page link", Link2], href: ["Link", Link2],
  ajax: ["AJAX call", Zap], fetch: ["fetch()", Zap], page_method: ["PageMethods (AJAX)", Zap], event: ["Control event", MousePointerClick],
  lifecycle: ["Page lifecycle", PanelTop], page_handler: ["Razor Page request", Globe], postback: ["Cross-page postback", Send],
};

function shortId(id: string): string {
  const head = id.split("(")[0];
  const parts = head.split(".");
  return parts.length >= 2 ? `${parts[parts.length - 2]}.${parts[parts.length - 1]}` : head;
}

type Nav = { type?: string; member?: string; view?: string };

function useCodeNav() {
  const [params, setParams] = useSearchParams();
  const nav: Nav = { type: params.get("type") ?? undefined, member: params.get("member") ?? undefined, view: params.get("view") ?? undefined };
  const go = (n: Nav) =>
    setParams((p) => {
      p.set("tab", "code");
      ["type", "member", "view"].forEach((k) => p.delete(k));
      if (n.type) p.set("type", n.type);
      if (n.member) p.set("member", n.member);
      if (n.view) p.set("view", n.view);
      return p;
    });
  return { nav, go };
}

/** A clickable reference to a type, member or view anywhere in the map. */
function Ref({ id, typeIds, go, children, className }: { id: string; typeIds: Set<string>; go: (n: Nav) => void; children?: ReactNode; className?: string }) {
  const isType = typeIds.has(id);
  const owner = isType ? id : id.split("(")[0].split(".").slice(0, -1).join(".");
  const known = isType || typeIds.has(owner);
  if (!known) return <span className={cn("font-mono text-[12.5px] text-muted-foreground", className)}>{children ?? shortId(id)}</span>;
  return (
    <button type="button" onClick={() => go(isType ? { type: id } : { type: owner, member: id })} className={cn("text-left font-mono text-[12.5px] font-medium text-primary hover:underline", className)}>
      {children ?? (isType ? id.split(".").pop() : shortId(id))}
    </button>
  );
}

function ViewRef({ path, go }: { path: string; go: (n: Nav) => void }) {
  return (
    <button type="button" onClick={() => go({ view: path })} className="break-all text-left font-mono text-[12.5px] font-medium text-primary hover:underline">
      {path}
    </button>
  );
}

function Row({ icon: Icon, children, meta }: { icon?: LucideIcon; children: ReactNode; meta?: ReactNode }) {
  return (
    <li className="flex items-start gap-2 py-1.5">
      {Icon ? <Icon className="mt-0.5 h-3.5 w-3.5 shrink-0 text-muted-foreground" aria-hidden /> : <span className="mt-2 h-1 w-1 shrink-0 rounded-full bg-muted-foreground" aria-hidden />}
      <div className="min-w-0 flex-1">{children}</div>
      {meta && <div className="shrink-0 text-right text-[11px] text-muted-foreground">{meta}</div>}
    </li>
  );
}

function Section({ title, count, children, empty }: { title: string; count?: number; children: ReactNode; empty?: string }) {
  return (
    <div>
      <MicroLabel className="mb-1">{title}{count !== undefined && <span className="ml-1.5 font-mono normal-case tracking-normal">{count}</span>}</MicroLabel>
      {count === 0 && empty ? <p className="py-1 text-[13px] text-muted-foreground">{empty}</p> : <ul className="divide-y divide-border/60">{children}</ul>}
    </div>
  );
}

/* ------------------------------------------------------------------ member card */

function MemberCard({ m, open, onToggle, typeIds, go }: { m: CodeMember; open: boolean; onToggle: () => void; typeIds: Set<string>; go: (n: Nav) => void }) {
  const [showExternal, setShowExternal] = useState(false);
  const internal = (m.calls ?? []).filter((c) => c.targets.length > 0);
  const external = (m.calls ?? []).filter((c) => c.targets.length === 0);
  const callerCount = m.called_by.length + m.ui_callers.length;
  return (
    <Card id={`m-${m.id}`} className={cn("scroll-mt-24 overflow-hidden", open && "ring-1 ring-primary/30")}>
      <button type="button" onClick={onToggle} aria-expanded={open} className="flex w-full items-start gap-3 px-4 py-3 text-left hover:bg-secondary/40">
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <span className="font-mono text-[13.5px] font-semibold">{m.kind === "constructor" ? "constructor" : m.name}</span>
            {m.is_action && <Pill tone="violet">action</Pill>}
            {m.http?.verbs.map((v) => <Pill key={v} mono>{v}</Pill>)}
            {m.attributes.filter((a) => !/^Http(Get|Post|Put|Delete|Patch)$/.test(a.name)).slice(0, 4).map((a) => <Pill key={a.name} mono>[{a.name}]</Pill>)}
          </div>
          <div className="mt-0.5 truncate font-mono text-[12px] text-muted-foreground">{m.signature}</div>
        </div>
        <div className="hidden shrink-0 gap-3 text-[11.5px] text-muted-foreground sm:flex">
          <span title="Callers">{callerCount} in</span>
          <span title="Calls into this codebase">{internal.length} out</span>
          <span className="font-mono">L{m.line}</span>
        </div>
        <ChevronDown className={cn("mt-1 h-4 w-4 shrink-0 text-muted-foreground transition-transform", open && "rotate-180")} aria-hidden />
      </button>
      {open && (
        <div className="grid gap-5 border-t border-border px-4 py-4 lg:grid-cols-2">
          {m.http && m.http.routes.length > 0 && (
            <div className="lg:col-span-2">
              <MicroLabel className="mb-1">Routes</MicroLabel>
              <div className="flex flex-wrap gap-1.5">{m.http.routes.map((r) => <code key={r} className="inline-code">{(m.http!.verbs.join("|") || "ANY")} {r}</code>)}</div>
            </div>
          )}
          {(m.results?.length ?? 0) > 0 && (
            <Section title="Returns" count={m.results!.length}>
              {m.results!.map((r, i) => (
                <Row key={i} icon={r.kind === "view" || r.kind === "partial" ? LayoutTemplate : r.kind.startsWith("redirect") ? CornerDownRight : Send} meta={`L${r.line}`}>
                  <span className="text-[13px]">{r.kind.replace(/_/g, " ")}</span>{" "}
                  {r.view ? <ViewRef path={r.view} go={go} /> : r.targets && r.targets.length > 0
                    ? r.targets.map((t) => <Ref key={t} id={t} typeIds={typeIds} go={go} className="mr-2" />)
                    : r.target_label && <span className="font-mono text-[12.5px] text-muted-foreground">{r.target_label}{(r.kind === "view" || r.kind === "partial") && " (view file not found)"}</span>}
                </Row>
              ))}
            </Section>
          )}
          <Section title="Front-end callers" count={m.ui_callers.length} empty="No view, form, script or control reaches this directly.">
            {m.ui_callers.map((c, i) => {
              const [label, Icon] = UI_LABEL[c.ui_kind ?? ""] ?? [c.ui_kind ?? "UI", Globe];
              return (
                <Row key={i} icon={Icon} meta={`L${c.line}`}>
                  <span className="text-[13px]">{label}</span> in {c.view && <ViewRef path={c.view} go={go} />}
                </Row>
              );
            })}
          </Section>
          <Section title="Called by" count={m.called_by.length} empty="Nothing in this codebase calls it (it may be an entry point or called by the framework).">
            {m.called_by.map((c, i) => <CallerRow key={i} c={c} typeIds={typeIds} go={go} />)}
          </Section>
          <Section title="Calls" count={internal.length} empty="It calls nothing else in this codebase.">
            {internal.map((c, i) => <CallRow key={i} c={c} typeIds={typeIds} go={go} />)}
          </Section>
          {external.length > 0 && (
            <div className="lg:col-span-2">
              <button type="button" onClick={() => setShowExternal(!showExternal)} className="text-[12px] font-medium text-muted-foreground hover:text-foreground">
                {showExternal ? "Hide" : "Show"} {external.length} framework or library calls
              </button>
              {showExternal && <div className="mt-1 flex flex-wrap gap-1.5">{external.map((c, i) => <code key={i} className="rounded bg-secondary px-1.5 py-0.5 font-mono text-[11.5px]">{c.label}</code>)}</div>}
            </div>
          )}
        </div>
      )}
    </Card>
  );
}

function CallerRow({ c, typeIds, go }: { c: CodeCaller; typeIds: Set<string>; go: (n: Nav) => void }) {
  return (
    <Row icon={c.kind === "redirect" ? CornerDownRight : ArrowRight} meta={<><Pill tone={CONF_TONE[c.confidence]}>{c.confidence}</Pill> L{c.line}</>}>
      <Ref id={c.id} typeIds={typeIds} go={go}>{c.label}</Ref>
      {c.kind === "redirect" && <span className="ml-1.5 text-[12px] text-muted-foreground">redirects here</span>}
      {c.kind === "new" && <span className="ml-1.5 text-[12px] text-muted-foreground">creates it</span>}
    </Row>
  );
}

function CallRow({ c, typeIds, go }: { c: CodeCall; typeIds: Set<string>; go: (n: Nav) => void }) {
  return (
    <Row icon={ArrowRight} meta={<><Pill tone={CONF_TONE[c.confidence]}>{c.confidence}</Pill> L{c.line}</>}>
      <div className="font-mono text-[12px] text-muted-foreground">{c.label}</div>
      <div className="flex flex-wrap gap-x-3">{c.targets.map((t) => <Ref key={t} id={t} typeIds={typeIds} go={go} />)}</div>
    </Row>
  );
}

/* ------------------------------------------------------------------ type + view panels */

function TypePanel({ slug, id, member, typeIds, go }: { slug: string; id: string; member?: string; typeIds: Set<string>; go: (n: Nav) => void }) {
  const q = useQuery({ queryKey: ["code-type", slug, id], queryFn: () => api<CodeType>(`/projects/${slug}/code/type?id=${encodeURIComponent(id)}`) });
  const [open, setOpen] = useState<Set<string>>(new Set(member ? [member] : []));
  const [showPrivate, setShowPrivate] = useState(false);
  useEffect(() => {
    if (member) {
      setOpen((s) => new Set(s).add(member));
      setTimeout(() => document.getElementById(`m-${member}`)?.scrollIntoView({ block: "start", behavior: "smooth" }), 80);
    }
  }, [member, q.data]);
  if (q.isLoading) return <Skeleton className="h-96 rounded-xl" />;
  if (q.isError) return <ErrorBanner error={q.error} onRetry={() => q.refetch()} />;
  const t = q.data!;
  const methods = t.members.filter((m) => m.kind === "method" || m.kind === "constructor");
  const props = t.members.filter((m) => m.kind === "property");
  const fields = t.members.filter((m) => m.kind === "field" || m.kind === "event" || m.kind === "enum_value");
  const visible = methods.filter((m) => showPrivate || !m.modifiers.includes("private") || m.called_by.length || m.ui_callers.length);
  const Icon = LAYER_ICON[t.layer] ?? FileCode2;
  const toggle = (mid: string) => setOpen((s) => { const n = new Set(s); if (n.has(mid)) n.delete(mid); else n.add(mid); return n; });
  return (
    <div className="space-y-4">
      <Card className="p-5">
        <div className="flex flex-wrap items-center gap-2">
          <Icon className="h-5 w-5 text-primary" aria-hidden />
          <h2 className="font-mono text-lg font-bold">{t.name}</h2>
          <Pill>{t.kind}</Pill>
          <Pill tone="violet">{t.layer}</Pill>
          {t.attributes.slice(0, 4).map((a) => <Pill key={a.name} mono>[{a.name}{a.args[0] ? `("${a.args[0]}")` : ""}]</Pill>)}
        </div>
        <div className="mt-1 break-all font-mono text-[12px] text-muted-foreground">{t.namespace}</div>
        <div className="mt-1 break-all font-mono text-[12px] text-muted-foreground">{t.files.join(" · ")} · line {t.line}</div>
        {t.markup && <div className="mt-2 text-[13px]">Markup: <ViewRef path={t.markup} go={go} /></div>}
        <div className="mt-4 grid gap-4 md:grid-cols-2">
          {t.bases.length > 0 && (
            <div><MicroLabel className="mb-1">Inherits / implements</MicroLabel>
              <div className="flex flex-wrap gap-x-3 gap-y-1">{t.bases.map((b) => { const hit = t.base_types.find((x) => x.endsWith("." + b.split("<")[0].split(".").pop())); return hit ? <Ref key={b} id={hit} typeIds={typeIds} go={go}>{b}</Ref> : <span key={b} className="font-mono text-[12.5px] text-muted-foreground">{b}</span>; })}</div>
            </div>
          )}
          {t.implemented_by.length > 0 && (
            <div><MicroLabel className="mb-1">{t.kind === "interface" ? "Implemented by" : "Extended by"}</MicroLabel>
              <div className="flex flex-wrap gap-x-3 gap-y-1">{t.implemented_by.map((x) => <Ref key={x} id={x} typeIds={typeIds} go={go} />)}</div>
            </div>
          )}
          {t.dependencies.length > 0 && (
            <div><MicroLabel className="mb-1">Injected dependencies</MicroLabel>
              <div className="flex flex-wrap gap-x-3 gap-y-1">{t.dependencies.map((x) => <Ref key={x} id={x} typeIds={typeIds} go={go} />)}</div>
            </div>
          )}
          {t.used_by.length > 0 && (
            <div><MicroLabel className="mb-1">Used by</MicroLabel>
              <div className="flex flex-wrap gap-x-3 gap-y-1">{t.used_by.slice(0, 40).map((x) => <Ref key={x} id={x} typeIds={typeIds} go={go} />)}</div>
            </div>
          )}
        </div>
      </Card>

      {methods.length > 0 && (
        <div className="space-y-2">
          <div className="flex items-center justify-between">
            <MicroLabel>{t.layer === "Controller" ? "Actions and methods" : "Methods"} <span className="font-mono normal-case tracking-normal">{visible.length}</span></MicroLabel>
            <div className="flex gap-2">
              <button type="button" className="text-[12px] font-medium text-muted-foreground hover:text-foreground" onClick={() => setOpen(new Set(visible.map((m) => m.id)))}>Expand all</button>
              <button type="button" className="text-[12px] font-medium text-muted-foreground hover:text-foreground" onClick={() => setShowPrivate(!showPrivate)}>{showPrivate ? "Hide" : "Show"} unused private</button>
            </div>
          </div>
          {visible.map((m) => <MemberCard key={m.id} m={m} open={open.has(m.id)} onToggle={() => toggle(m.id)} typeIds={typeIds} go={go} />)}
        </div>
      )}
      {props.length > 0 && (
        <Card className="p-5">
          <MicroLabel className="mb-2">Properties <span className="font-mono normal-case tracking-normal">{props.length}</span></MicroLabel>
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead><tr className="micro-label border-b border-border"><th className="py-1.5 pr-3 font-semibold">Name</th><th className="py-1.5 pr-3 font-semibold">Type</th><th className="py-1.5 pr-3 font-semibold">Access</th><th className="py-1.5 font-semibold">Used by</th></tr></thead>
              <tbody>
                {props.map((p) => (
                  <tr key={p.id} id={`m-${p.id}`} className="border-b border-border/60 last:border-0">
                    <td className="py-1.5 pr-3 font-mono text-[12.5px] font-medium">{p.name}</td>
                    <td className="py-1.5 pr-3 font-mono text-[12px] text-muted-foreground">{p.type}</td>
                    <td className="py-1.5 pr-3 font-mono text-[12px] text-muted-foreground">{(p.accessors ?? []).join(" / ") || "-"}</td>
                    <td className="py-1.5 text-[12px]">{p.called_by.length ? p.called_by.slice(0, 3).map((c, i) => <Ref key={i} id={c.id} typeIds={typeIds} go={go} className="mr-2">{c.label}</Ref>) : <span className="text-muted-foreground">-</span>}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Card>
      )}
      {fields.length > 0 && (
        <Card className="p-5">
          <MicroLabel className="mb-2">{t.kind === "enum" ? "Values" : "Fields"} <span className="font-mono normal-case tracking-normal">{fields.length}</span></MicroLabel>
          <div className="flex flex-wrap gap-1.5">{fields.map((f) => <code key={f.id} className="rounded bg-secondary px-1.5 py-0.5 font-mono text-[12px]">{f.type ? `${f.type} ` : ""}{f.name}</code>)}</div>
        </Card>
      )}
    </div>
  );
}

function ViewPanel({ slug, path, typeIds, go }: { slug: string; path: string; typeIds: Set<string>; go: (n: Nav) => void }) {
  const q = useQuery({ queryKey: ["code-view", slug, path], queryFn: () => api<CodeView>(`/projects/${slug}/code/view?path=${encodeURIComponent(path)}`) });
  if (q.isLoading) return <Skeleton className="h-96 rounded-xl" />;
  if (q.isError) return <ErrorBanner error={q.error} onRetry={() => q.refetch()} />;
  const v = q.data!;
  return (
    <div className="space-y-4">
      <Card className="p-5">
        <div className="flex flex-wrap items-center gap-2">
          <LayoutTemplate className="h-5 w-5 text-primary" aria-hidden />
          <h2 className="font-mono text-lg font-bold">{v.name}</h2>
          <Pill tone="violet">{v.kind.replace(/_/g, " ")}</Pill>
          {v.route && <Pill mono>@page "{v.route}"</Pill>}
        </div>
        <div className="mt-1 break-all font-mono text-[12px] text-muted-foreground">{v.path}</div>
        <dl className="mt-4 grid gap-3 text-[13px] md:grid-cols-2">
          {v.model && <div><MicroLabel className="mb-0.5">Model</MicroLabel><dd className="font-mono text-[12.5px]">{v.model}</dd></div>}
          {v.layout && <div><MicroLabel className="mb-0.5">{v.kind.includes("web") || v.kind === "user_control" ? "Master page" : "Layout"}</MicroLabel><dd>{v.layout_resolved ? <ViewRef path={v.layout_resolved} go={go} /> : <span className="font-mono text-[12.5px]">{v.layout}</span>}{v.layout_source && v.layout_source !== "explicit" && <span className="ml-1 text-[12px] text-muted-foreground">({v.layout_source})</span>}</dd></div>}
          {v.code_behind_type && <div><MicroLabel className="mb-0.5">{v.kind === "razor_page" ? "Page model" : "Code-behind"}</MicroLabel><dd><Ref id={v.code_behind_type} typeIds={typeIds} go={go} /></dd></div>}
        </dl>
      </Card>
      <Card className="grid gap-5 p-5 lg:grid-cols-2">
        <Section title="Rendered by" count={v.rendered_by.length} empty={v.kind === "layout" || v.kind === "partial" || v.kind === "script" ? "Not returned by an action directly." : "No action returns this view by name."}>
          {v.rendered_by.map((r, i) => <Row key={i} icon={Network}><Ref id={r.id} typeIds={typeIds} go={go}>{r.label}</Ref> <span className="text-[12px] text-muted-foreground">{r.kind}</span></Row>)}
        </Section>
        {v.used_as_layout_by.length > 0 && (
          <Section title="Layout for" count={v.used_as_layout_by.length}>{v.used_as_layout_by.slice(0, 50).map((p) => <Row key={p}><ViewRef path={p} go={go} /></Row>)}</Section>
        )}
        {v.used_as_partial_by.length > 0 && (
          <Section title="Included by" count={v.used_as_partial_by.length}>{v.used_as_partial_by.map((p, i) => <Row key={i} meta={`L${p.line}`}><ViewRef path={p.path} go={go} /></Row>)}</Section>
        )}
        {(v.partials.length > 0 || v.controls.length > 0 || v.components.length > 0) && (
          <Section title="Includes" count={v.partials.length + v.controls.length + v.components.length}>
            {v.partials.map((p, i) => <Row key={`p${i}`} icon={LayoutTemplate} meta={`L${p.line}`}>{p.resolved ? <ViewRef path={p.resolved} go={go} /> : <span className="font-mono text-[12.5px] text-muted-foreground">{p.name} (not found)</span>}</Row>)}
            {v.controls.map((c, i) => <Row key={`c${i}`} icon={LayoutTemplate} meta={`L${c.line}`}>{c.resolved ? <ViewRef path={c.resolved} go={go} /> : <span className="font-mono text-[12.5px]">{c.src}</span>}</Row>)}
            {v.components.map((c, i) => <Row key={`v${i}`} icon={Box} meta={`L${c.line}`}><span className="font-mono text-[12.5px]">view component {c.name}</span></Row>)}
          </Section>
        )}
      </Card>
      <Card className="p-5">
        <Section title="Links, forms and AJAX calls" count={v.links.length} empty="No links, forms or AJAX calls found.">
          {v.links.map((ln, i) => {
            const [label, Icon] = UI_LABEL[ln.kind] ?? [ln.kind, Link2];
            const what = ln.url ?? (ln.action ? `${ln.controller ?? "(this controller)"}/${ln.action}` : ln.page ?? ln.method ?? "");
            return (
              <Row key={i} icon={Icon} meta={`L${ln.line}`}>
                <span className="text-[13px]">{label}</span> <code className="font-mono text-[12px] text-muted-foreground">{what}</code>
                <div className="flex flex-wrap gap-x-3">
                  {ln.targets.length > 0 ? ln.targets.map((t) => <Ref key={t} id={t} typeIds={typeIds} go={go} />)
                    : ln.view_target ? <ViewRef path={ln.view_target} go={go} /> : <span className="text-[12px] text-muted-foreground">not matched to code in this import</span>}
                </div>
              </Row>
            );
          })}
        </Section>
      </Card>
      {v.events.length > 0 && (
        <Card className="p-5">
          <Section title="Server control events" count={v.events.length}>
            {v.events.map((e, i) => (
              <Row key={i} icon={MousePointerClick} meta={`L${e.line}`}>
                <span className="font-mono text-[12.5px]">{e.control || e.control_type}</span> <span className="text-[12px] text-muted-foreground">{e.event}</span> →{" "}
                {e.targets && e.targets.length ? e.targets.map((t) => <Ref key={t} id={t} typeIds={typeIds} go={go} />) : <span className="font-mono text-[12.5px]">{e.handler}</span>}
              </Row>
            ))}
          </Section>
        </Card>
      )}
    </div>
  );
}

/* ------------------------------------------------------------------ explorer */

export function CodeMap({ slug }: { slug: string }) {
  const { nav, go } = useCodeNav();
  const q = useQuery({ queryKey: ["code", slug], queryFn: () => api<CodeOverview>(`/projects/${slug}/code`), retry: false });
  const [layer, setLayer] = useState<CodeLayer | "Views" | "">("");
  const [filter, setFilter] = useState("");
  const [search, setSearch] = useState("");
  const [dq, setDq] = useState("");
  useEffect(() => { const t = setTimeout(() => setDq(search.trim()), 200); return () => clearTimeout(t); }, [search]);
  const hits = useQuery({ queryKey: ["code-search", slug, dq], queryFn: () => api<CodeSearchHit[]>(`/projects/${slug}/code/search?q=${encodeURIComponent(dq)}`), enabled: dq.length > 1 });
  const typeIds = useMemo(() => new Set((q.data?.types ?? []).map((t) => t.id)), [q.data]);

  const groups = useMemo(() => {
    const f = filter.toLowerCase();
    const types = (q.data?.types ?? []).filter((t) => (!layer || t.layer === layer) && (!f || t.name.toLowerCase().includes(f)));
    return LAYER_ORDER.map((l) => ({ layer: l, items: types.filter((t) => t.layer === l).sort((a, b) => a.name.localeCompare(b.name)) })).filter((g) => g.items.length);
  }, [q.data, layer, filter]);
  const views = useMemo(() => (q.data?.views ?? []).filter((v) => v.kind !== "viewimports" && (!layer || layer === "Views") && (!filter || v.path.toLowerCase().includes(filter.toLowerCase()))), [q.data, layer, filter]);

  if (q.isLoading) return <div className="space-y-3"><Skeleton className="h-24" /><Skeleton className="h-96" /></div>;
  if (q.isError) {
    if (q.error instanceof ApiError && q.error.status === 404) {
      return <EmptyPanel icon={Network} title="No code map yet" text="Import this project's code (folder, zip or repository) and DevAtlas will map every class, method, caller, view and AJAX call." />;
    }
    return <ErrorBanner error={q.error} onRetry={() => q.refetch()} />;
  }
  const d = q.data!;
  const s = d.stats;
  const save = async () => {
    try { await download(`/projects/${slug}/code/export.md`, `${d.codebase}-code-map.md`); } catch (e) { toast.error(e instanceof Error ? e.message : "Download failed"); }
  };
  const selected = nav.view ? null : nav.type ?? (groups[0]?.items[0]?.id ?? null);

  return (
    <div className="space-y-5">
      <div className="grid gap-3 sm:grid-cols-3 lg:grid-cols-6">
        <Stat label="Types" value={s.types} />
        <Stat label="Methods" value={s.methods} />
        <Stat label="Actions" value={s.actions} />
        <Stat label="Views" value={s.view_files} hint={`${s.script_files} scripts`} />
        <Stat label="AJAX calls" value={s.ajax_calls} />
        <Stat label="Calls mapped" value={s.calls_resolved} hint={`${s.calls_external} framework`} />
      </div>
      <div className="flex flex-col gap-3 md:flex-row md:items-center">
        <div className="relative flex-1">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" aria-hidden />
          <Input value={search} onChange={(e) => setSearch(e.target.value)} className="pl-9" placeholder="Find a class, method, property or view: Contact, OrderService, _Layout…" aria-label="Search the code map" />
          {dq.length > 1 && hits.data && (
            <div className="absolute inset-x-0 top-10 z-20 max-h-80 overflow-y-auto rounded-xl border border-border bg-card p-1 shadow-lift">
              {hits.data.length === 0 && <div className="px-3 py-4 text-center text-sm text-muted-foreground">No matches</div>}
              {hits.data.map((h, i) => (
                <button key={i} type="button" onClick={() => { setSearch(""); go(h.view ? { view: h.view } : { type: h.type ?? undefined, member: h.member ?? undefined }); }}
                  className="flex w-full items-center gap-2 rounded-lg px-3 py-2 text-left hover:bg-accent">
                  <span className="flex-1 truncate font-mono text-[13px]">{h.label}</span><Pill>{h.layer}</Pill>
                </button>
              ))}
            </div>
          )}
        </div>
        <Button variant="secondary" onClick={save}><Download /> Download deep doc (.md)</Button>
      </div>
      <p className="text-[12px] text-muted-foreground">
        Mapped {timeAgo(d.generated_at)}{d.generated_by ? ` by ${d.generated_by}` : ""}. Static analysis: every link shows its confidence (exact, interface, likely, ambiguous). Only names, signatures and links are stored, never method bodies.
      </p>

      <div className="grid gap-5 xl:grid-cols-[300px_1fr] [&>*]:min-w-0">
        <Card className="h-fit p-3 xl:sticky xl:top-20 xl:max-h-[calc(100vh-120px)] xl:overflow-y-auto">
          <Input value={filter} onChange={(e) => setFilter(e.target.value)} placeholder="Filter by name" className="mb-2 h-8 text-[13px]" aria-label="Filter types" />
          <div className="mb-2 flex flex-wrap gap-1">
            <Chip active={!layer} onClick={() => setLayer("")}>All</Chip>
            {LAYER_ORDER.filter((l) => s.layers[l]).map((l) => <Chip key={l} active={layer === l} onClick={() => setLayer(layer === l ? "" : l)} count={s.layers[l]}>{l}</Chip>)}
            <Chip active={layer === "Views"} onClick={() => setLayer(layer === "Views" ? "" : "Views")} count={d.views.length}>Views</Chip>
          </div>
          {layer !== "Views" && groups.map((g) => {
            const Icon = LAYER_ICON[g.layer];
            return (
              <div key={g.layer} className="mb-2">
                <div className="micro-label flex items-center gap-1.5 px-2 py-1"><Icon className="h-3.5 w-3.5" aria-hidden />{g.layer}</div>
                {g.items.map((t) => (
                  <button key={t.id} type="button" onClick={() => go({ type: t.id })} aria-current={selected === t.id}
                    className={cn("flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left text-[13px] transition-colors", selected === t.id ? "bg-accent font-medium text-primary" : "hover:bg-secondary")}>
                    <span className="min-w-0 flex-1 truncate font-mono">{t.name}</span>
                    <span className="shrink-0 font-mono text-[10.5px] text-muted-foreground">{t.actions ? `${t.actions}a` : `${t.methods}m`}</span>
                  </button>
                ))}
              </div>
            );
          })}
          {(layer === "Views" || !layer) && views.length > 0 && (
            <div className="mb-2">
              <div className="micro-label flex items-center gap-1.5 px-2 py-1"><LayoutTemplate className="h-3.5 w-3.5" aria-hidden />Views and scripts</div>
              {views.map((v) => (
                <button key={v.path} type="button" onClick={() => go({ view: v.path })} aria-current={nav.view === v.path} title={v.path}
                  className={cn("flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left text-[13px] transition-colors", nav.view === v.path ? "bg-accent font-medium text-primary" : "hover:bg-secondary")}>
                  <span className="min-w-0 flex-1 truncate font-mono">{v.path.split("/").slice(-2).join("/")}</span>
                  <span className="shrink-0 text-[10.5px] text-muted-foreground">{v.kind.replace(/_/g, " ")}</span>
                </button>
              ))}
            </div>
          )}
        </Card>
        <div>
          {nav.view ? <ViewPanel slug={slug} path={nav.view} typeIds={typeIds} go={go} />
            : selected ? <TypePanel key={selected} slug={slug} id={selected} member={nav.member} typeIds={typeIds} go={go} />
            : <EmptyPanel icon={Network} title="Pick a type" text="Choose a class, interface or view on the left." />}
        </div>
      </div>
    </div>
  );
}
