import { useEffect, useState, type FormEvent } from "react";
import { useSearchParams } from "react-router-dom";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { ChevronUp, MessageSquarePlus, MessagesSquare, Search } from "lucide-react";
import { toast } from "sonner";
import { api, type FeedbackItem, type FeedbackMeta, type FeedbackStatus, type FeedbackTargets } from "@/lib/api";
import { useAuth } from "@/lib/auth";
import { cn, timeAgo } from "@/lib/utils";
import { AppShell } from "@/components/shell/AppShell";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Dialog, DialogContent } from "@/components/ui/dialog";
import { Input, Label, Select, Textarea } from "@/components/ui/input";
import { Chip, EmptyPanel, ErrorBanner, ListSkeleton, PageHeader, Pill } from "@/components/kb/Bits";

const STATUS_TONE: Record<FeedbackStatus, "neutral" | "violet" | "green" | "red"> = { open: "neutral", triaged: "violet", accepted: "green", declined: "red" };
const STATUSES: FeedbackStatus[] = ["open", "triaged", "accepted", "declined"];

function NewFeedback({ open, onOpenChange, preset }: { open: boolean; onOpenChange: (o: boolean) => void; preset: { type?: string; ref?: string; label?: string } }) {
  const qc = useQueryClient();
  const targets = useQuery({ queryKey: ["feedback-targets"], queryFn: () => api<FeedbackTargets>("/feedback/targets"), enabled: open });
  const [kind, setKind] = useState<"outdated" | "improvement">("outdated");
  const [targetType, setTargetType] = useState<"standard" | "architecture">((preset.type as "standard") ?? "standard");
  const [ref, setRef] = useState(preset.ref ?? "");
  const [message, setMessage] = useState("");
  useEffect(() => { if (preset.type) setTargetType(preset.type as "standard"); if (preset.ref) setRef(preset.ref); }, [preset.type, preset.ref]);

  const options = targetType === "standard" ? targets.data?.standards : targets.data?.architecture;
  const label = options?.find((o) => o.ref === ref)?.label ?? preset.label ?? ref;
  const create = useMutation({
    mutationFn: () => api<FeedbackItem>("/feedback", { body: { kind, target_type: targetType, target_ref: ref, target_label: label, message } }),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["feedback"] }); qc.invalidateQueries({ queryKey: ["feedback-meta"] }); toast.success("Thanks. A maintainer will triage it."); setMessage(""); onOpenChange(false); },
    onError: (e) => toast.error(e instanceof Error ? e.message : "Could not send feedback"),
  });
  const submit = (e: FormEvent) => { e.preventDefault(); create.mutate(); };
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent title="Flag or suggest a change" description="Point at a real standard or doc, and say what should change.">
        <form onSubmit={submit} className="space-y-4">
          <div className="grid gap-4 sm:grid-cols-2">
            <div><Label htmlFor="fb-kind">Kind</Label><Select id="fb-kind" value={kind} onChange={(e) => setKind(e.target.value as "outdated")}><option value="outdated">Outdated</option><option value="improvement">Improvement</option></Select></div>
            <div><Label htmlFor="fb-type">About</Label><Select id="fb-type" value={targetType} onChange={(e) => { setTargetType(e.target.value as "standard"); setRef(""); }}><option value="standard">A coding standard</option><option value="architecture">A doc</option></Select></div>
          </div>
          <div>
            <Label htmlFor="fb-target">{targetType === "standard" ? "Standard" : "Doc"}</Label>
            <Select id="fb-target" value={ref} onChange={(e) => setRef(e.target.value)} required>
              <option value="">Choose…</option>
              {options?.map((o) => <option key={o.ref} value={o.ref}>{o.label} ({o.hint})</option>)}
              {ref && !options?.some((o) => o.ref === ref) && <option value={ref}>{label}</option>}
            </Select>
          </div>
          <div>
            <Label htmlFor="fb-msg">What should change?</Label>
            <Textarea id="fb-msg" value={message} onChange={(e) => setMessage(e.target.value)} placeholder="At least 10 characters. Be specific: what is wrong and what it should say." />
            <div className="mt-1 text-right font-mono text-[11px] text-muted-foreground">{message.trim().length}/10</div>
          </div>
          <div className="flex justify-end gap-2">
            <Button type="button" variant="secondary" onClick={() => onOpenChange(false)}>Cancel</Button>
            <Button type="submit" loading={create.isPending} disabled={!ref || message.trim().length < 10}>Send feedback</Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}

export default function Feedback() {
  const { canEdit } = useAuth();
  const qc = useQueryClient();
  const [params, setParams] = useSearchParams();
  const preset = { type: params.get("type") ?? undefined, ref: params.get("ref") ?? undefined, label: params.get("label") ?? undefined };
  const [open, setOpen] = useState(Boolean(preset.ref));
  const [status, setStatus] = useState("");
  const [kind, setKind] = useState("");
  const [targetType, setTargetType] = useState("");
  const [text, setText] = useState("");
  const [dq, setDq] = useState("");
  useEffect(() => { const t = setTimeout(() => setDq(text), 200); return () => clearTimeout(t); }, [text]);

  const meta = useQuery({ queryKey: ["feedback-meta"], queryFn: () => api<FeedbackMeta>("/feedback/meta") });
  const qs = new URLSearchParams({ status, kind, target_type: targetType, q: dq }).toString();
  const list = useQuery({ queryKey: ["feedback", qs], queryFn: () => api<FeedbackItem[]>(`/feedback?${qs}`) });
  const refresh = () => { qc.invalidateQueries({ queryKey: ["feedback"] }); qc.invalidateQueries({ queryKey: ["feedback-meta"] }); };
  const vote = useMutation({ mutationFn: (id: string) => api<FeedbackItem>(`/feedback/${id}/vote`, { method: "POST" }), onSuccess: refresh, onError: (e) => toast.error(e instanceof Error ? e.message : "Vote failed") });
  const triage = useMutation({
    mutationFn: ({ id, s }: { id: string; s: FeedbackStatus }) => api<FeedbackItem>(`/feedback/${id}/status`, { body: { status: s } }),
    onSuccess: (i) => { refresh(); toast.success(`Marked ${i.status}`); },
    onError: (e) => toast.error(e instanceof Error ? e.message : "Could not update status"),
  });
  const count = (key: string) => meta.data?.statuses.find((s) => s.key === key)?.count;

  return (
    <AppShell>
      <PageHeader eyebrow="Feedback" title="Standards feedback" description="Flag a standard or doc that is out of date, or suggest an improvement. Vote on what matters; maintainers triage." actions={<Button onClick={() => setOpen(true)}><MessageSquarePlus /> Flag or suggest</Button>} />
      <div className="space-y-3">
        <div className="relative">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" aria-hidden />
          <Input value={text} onChange={(e) => setText(e.target.value)} className="pl-9" placeholder="Search feedback" aria-label="Search feedback" />
        </div>
        <div className="flex flex-wrap gap-2">
          <Chip active={!status} onClick={() => setStatus("")} count={meta.data?.total}>All</Chip>
          {STATUSES.map((s) => <Chip key={s} active={status === s} onClick={() => setStatus(status === s ? "" : s)} count={count(s)}>{s}</Chip>)}
          <span className="mx-1 h-5 w-px self-center bg-border" aria-hidden />
          <Chip active={kind === "outdated"} onClick={() => setKind(kind === "outdated" ? "" : "outdated")}>Outdated</Chip>
          <Chip active={kind === "improvement"} onClick={() => setKind(kind === "improvement" ? "" : "improvement")}>Improvement</Chip>
          <span className="mx-1 h-5 w-px self-center bg-border" aria-hidden />
          <Chip active={targetType === "standard"} onClick={() => setTargetType(targetType === "standard" ? "" : "standard")}>Standards</Chip>
          <Chip active={targetType === "architecture"} onClick={() => setTargetType(targetType === "architecture" ? "" : "architecture")}>Docs</Chip>
        </div>
      </div>
      <div className="mt-6 space-y-3">
        {list.isLoading && <ListSkeleton rows={4} />}
        {list.isError && <ErrorBanner error={list.error} onRetry={() => list.refetch()} />}
        {list.data?.length === 0 && <EmptyPanel icon={MessagesSquare} title="No feedback yet" text="Spotted something out of date? Flag it so the next new hire does not trip on it." action={<Button onClick={() => setOpen(true)}><MessageSquarePlus /> Flag or suggest</Button>} />}
        {list.data?.map((f) => (
          <Card key={f.id} className="flex gap-4 p-4">
            <button type="button" onClick={() => vote.mutate(f.id)} aria-pressed={f.voted} aria-label={`${f.voted ? "Remove vote" : "Vote"}, ${f.vote_count} votes`}
              className={cn("flex h-14 w-12 shrink-0 flex-col items-center justify-center rounded-lg border text-sm font-semibold transition-colors", f.voted ? "border-primary bg-accent text-primary" : "border-border hover:bg-secondary")}>
              <ChevronUp className="h-4 w-4" aria-hidden />{f.vote_count}
            </button>
            <div className="min-w-0 flex-1">
              <div className="flex flex-wrap items-center gap-2">
                <Pill tone={f.kind === "outdated" ? "orange" : "violet"}>{f.kind}</Pill>
                <span className="font-semibold">{f.target_label}</span>
                <span className="font-mono text-[11px] text-muted-foreground">{f.target_ref}</span>
              </div>
              <p className="mt-1.5 text-sm">{f.message}</p>
              <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1 text-[12px] text-muted-foreground">
                <span>{f.author_name} · {timeAgo(f.created_at)}</span>
                {f.status_note && <span>Note: {f.status_note}</span>}
                {f.triaged_by && <span>Triaged by {f.triaged_by}</span>}
              </div>
            </div>
            <div className="shrink-0">
              {canEdit ? (
                <Select aria-label="Triage status" value={f.status} onChange={(e) => triage.mutate({ id: f.id, s: e.target.value as FeedbackStatus })} className="h-8 w-[120px] text-[13px]">
                  {STATUSES.map((s) => <option key={s} value={s}>{s}</option>)}
                </Select>
              ) : <Pill tone={STATUS_TONE[f.status]}>{f.status}</Pill>}
            </div>
          </Card>
        ))}
      </div>
      <NewFeedback open={open} onOpenChange={(o) => { setOpen(o); if (!o && preset.ref) setParams({}, { replace: true }); }} preset={preset} />
    </AppShell>
  );
}
