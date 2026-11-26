import { useEffect, useState, type FormEvent } from "react";
import { useSearchParams } from "react-router-dom";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { ChevronDown, Plus, Search, ShieldOff } from "lucide-react";
import { toast } from "sonner";
import { api, type Scope, type Severity, type Tier, type ValidationRule } from "@/lib/api";
import { useAuth } from "@/lib/auth";
import { cn } from "@/lib/utils";
import { AppShell } from "@/components/shell/AppShell";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Dialog, DialogContent } from "@/components/ui/dialog";
import { Input, Label, Select, Textarea } from "@/components/ui/input";
import { Chip, EmptyPanel, ErrorBanner, ListSkeleton, MicroLabel, OriginTag, PageHeader, Pill, SystemDot, SystemTag } from "@/components/kb/Bits";
import { CodeBlock } from "@/components/kb/CodeBlock";
import { SplitCompare } from "@/components/kb/SplitCompare";

const SEV_TONE = { error: "red", warn: "amber", info: "neutral" } as const;

function RuleCard({ r, open, onToggle }: { r: ValidationRule; open: boolean; onToggle: () => void }) {
  return (
    <Card className="overflow-hidden">
      <button type="button" onClick={onToggle} aria-expanded={open} className="flex w-full items-start gap-3 p-4 text-left hover:bg-secondary/40 sm:items-center">
        <span className="w-14 shrink-0 font-mono text-[12px] font-semibold text-primary">{r.rule_id}</span>
        <div className="min-w-0 flex-1">
          <div className="font-semibold">{r.name}</div>
          <div className="font-mono text-[12px] text-muted-foreground">{r.field}</div>
        </div>
        <div className="hidden flex-wrap justify-end gap-1.5 sm:flex">
          <Pill>{r.tier}</Pill>
          <Pill tone={SEV_TONE[r.severity]}>{r.severity}</Pill>
          {!r.enforced && <Pill tone="amber">not enforced</Pill>}
          <SystemTag system={r.system} />
          <OriginTag origin={r.origin} />
        </div>
        <ChevronDown className={cn("h-4 w-4 shrink-0 text-muted-foreground transition-transform", open && "rotate-180")} aria-hidden />
      </button>
      {open && (
        <div className="space-y-4 border-t border-border p-5">
          <dl className="grid gap-4 text-sm md:grid-cols-2">
            <div><MicroLabel className="mb-1">Constraint</MicroLabel><dd>{r.constraint || "Not documented"}</dd></div>
            {r.message && <div><MicroLabel className="mb-1">Message shown</MicroLabel><dd>“{r.message}”</dd></div>}
            {r.pattern && <div><MicroLabel className="mb-1">Pattern</MicroLabel><dd><code className="inline-code break-all">{r.pattern}</code></dd></div>}
            <div><MicroLabel className="mb-1">Projects</MicroLabel><dd>{r.projects.join(", ") || "Not linked"}</dd></div>
            {r.notes && <div className="md:col-span-2"><MicroLabel className="mb-1">Notes</MicroLabel><dd className="text-muted-foreground">{r.notes}</dd></div>}
          </dl>
          {r.legacy_impl && r.modern_impl && <SplitCompare legacy={r.legacy_impl} modern={r.modern_impl} title="Implementation in each system" />}
          {r.legacy_impl && !r.modern_impl && <CodeBlock code={r.legacy_impl.code} lang={r.legacy_impl.lang} filename={r.legacy_impl.filename} />}
          {!r.legacy_impl && r.modern_impl && <CodeBlock code={r.modern_impl.code} lang={r.modern_impl.lang} filename={r.modern_impl.filename} />}
          {r.tags.length > 0 && <div className="flex flex-wrap gap-1.5">{r.tags.map((t) => <Pill key={t} mono>#{t}</Pill>)}</div>}
        </div>
      )}
    </Card>
  );
}

function NewRuleDialog({ open, onOpenChange }: { open: boolean; onOpenChange: (o: boolean) => void }) {
  const qc = useQueryClient();
  const [f, setF] = useState({ name: "", field: "", tier: "shape", system: "both", severity: "error", constraint: "", message: "", projects: "", tags: "" });
  const set = (k: keyof typeof f) => (e: { target: { value: string } }) => setF({ ...f, [k]: e.target.value });
  const create = useMutation({
    mutationFn: () => api<ValidationRule>("/validation", { body: { ...f, projects: f.projects.split(",").map((s) => s.trim()).filter(Boolean), tags: f.tags.split(",").map((s) => s.trim()).filter(Boolean) } }),
    onSuccess: (r) => { qc.invalidateQueries({ queryKey: ["validation"] }); toast.success(`${r.rule_id} added`); onOpenChange(false); },
    onError: (e) => toast.error(e instanceof Error ? e.message : "Could not add the rule"),
  });
  const submit = (e: FormEvent) => { e.preventDefault(); create.mutate(); };
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent title="Add a validation rule" description="It gets the next VR id and is marked as written by the team.">
        <form onSubmit={submit} className="grid gap-4 sm:grid-cols-2">
          <div className="sm:col-span-2"><Label htmlFor="vr-name">Name</Label><Input id="vr-name" required value={f.name} onChange={set("name")} placeholder="SKU format" /></div>
          <div className="sm:col-span-2"><Label htmlFor="vr-field">Field</Label><Input id="vr-field" required value={f.field} onChange={set("field")} placeholder="OrderLine.Sku" className="font-mono" /></div>
          <div><Label htmlFor="vr-tier">Tier</Label><Select id="vr-tier" value={f.tier} onChange={set("tier")}><option value="shape">shape</option><option value="policy">policy</option><option value="invariant">invariant</option></Select></div>
          <div><Label htmlFor="vr-sev">Severity</Label><Select id="vr-sev" value={f.severity} onChange={set("severity")}><option value="error">error</option><option value="warn">warn</option><option value="info">info</option></Select></div>
          <div className="sm:col-span-2"><Label htmlFor="vr-sys">System</Label><Select id="vr-sys" value={f.system} onChange={set("system")}><option value="both">Both systems</option><option value="legacy">Legacy</option><option value="modern">Modern</option></Select></div>
          <div className="sm:col-span-2"><Label htmlFor="vr-con">Constraint</Label><Textarea id="vr-con" value={f.constraint} onChange={set("constraint")} className="min-h-[64px]" /></div>
          <div className="sm:col-span-2"><Label htmlFor="vr-msg">Message shown to the user</Label><Input id="vr-msg" value={f.message} onChange={set("message")} /></div>
          <div><Label htmlFor="vr-proj">Projects (comma separated)</Label><Input id="vr-proj" value={f.projects} onChange={set("projects")} /></div>
          <div><Label htmlFor="vr-tags">Tags</Label><Input id="vr-tags" value={f.tags} onChange={set("tags")} /></div>
          <div className="flex justify-end gap-2 sm:col-span-2">
            <Button type="button" variant="secondary" onClick={() => onOpenChange(false)}>Cancel</Button>
            <Button type="submit" loading={create.isPending} disabled={!f.name.trim() || !f.field.trim()}>Add rule</Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}

export default function Validation() {
  const { canEdit } = useAuth();
  const [params, setParams] = useSearchParams();
  const [text, setText] = useState(params.get("q") ?? "");
  const [system, setSystem] = useState<Scope | "">("");
  const [tier, setTier] = useState<Tier | "">("");
  const [severity, setSeverity] = useState<Severity | "">("");
  const project = params.get("project") ?? "";
  const q = params.get("q") ?? "";
  const [openId, setOpenId] = useState<string | null>(null);
  const [adding, setAdding] = useState(false);

  useEffect(() => {
    const t = setTimeout(() => setParams((p) => { if (text) p.set("q", text); else p.delete("q"); return p; }, { replace: true }), 200);
    return () => clearTimeout(t);
  }, [text, setParams]);

  const qs = new URLSearchParams({ q, system, tier, severity, project }).toString();
  const rules = useQuery({ queryKey: ["validation", qs], queryFn: () => api<ValidationRule[]>(`/validation?${qs}`) });
  useEffect(() => { if (rules.data?.length === 1) setOpenId(rules.data[0]!.rule_id); }, [rules.data]);

  return (
    <AppShell>
      <PageHeader
        eyebrow="Validation repository"
        title="Validation rules"
        description="Every rule, the tier it belongs to and how each system implements it. Shape rules check one field, policies encode decisions, invariants must always hold."
        actions={canEdit && <Button onClick={() => setAdding(true)}><Plus /> Add rule</Button>}
      />
      <div className="space-y-3">
        <div className="relative">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" aria-hidden />
          <Input value={text} onChange={(e) => setText(e.target.value)} className="pl-9" placeholder="Search by id, name, field, constraint, tag or project" aria-label="Search rules" />
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {(["", "legacy", "modern", "both"] as const).map((s) => <Chip key={s || "all"} active={system === s} onClick={() => setSystem(s)}>{s ? <SystemDot system={s} short /> : "All systems"}</Chip>)}
          <span className="mx-1 h-5 w-px bg-border" aria-hidden />
          {(["", "shape", "policy", "invariant"] as const).map((t) => <Chip key={t || "all-t"} active={tier === t} onClick={() => setTier(t)}>{t || "All tiers"}</Chip>)}
          <span className="mx-1 h-5 w-px bg-border" aria-hidden />
          {(["", "error", "warn", "info"] as const).map((s) => <Chip key={s || "all-s"} active={severity === s} onClick={() => setSeverity(s)}>{s || "Any severity"}</Chip>)}
          {project && <Chip active onClick={() => setParams((p) => { p.delete("project"); return p; })}>Project: {project} ✕</Chip>}
        </div>
      </div>
      <div className="mt-6 space-y-2">
        {rules.isLoading && <ListSkeleton rows={6} />}
        {rules.isError && <ErrorBanner error={rules.error} onRetry={() => rules.refetch()} />}
        {rules.data?.length === 0 && <EmptyPanel icon={ShieldOff} title="No rules match" text="Clear a filter, or add the rule if it is missing." action={canEdit ? <Button onClick={() => setAdding(true)}><Plus /> Add rule</Button> : undefined} />}
        {rules.data && rules.data.length > 0 && <p className="text-[13px] text-muted-foreground">{rules.data.length} rules</p>}
        {rules.data?.map((r) => <RuleCard key={r.rule_id} r={r} open={openId === r.rule_id} onToggle={() => setOpenId(openId === r.rule_id ? null : r.rule_id)} />)}
      </div>
      {canEdit && <NewRuleDialog open={adding} onOpenChange={setAdding} />}
    </AppShell>
  );
}
