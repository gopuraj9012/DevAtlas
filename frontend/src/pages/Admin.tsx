import { useEffect, useMemo, useState, type FormEvent } from "react";
import { useSearchParams } from "react-router-dom";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Ban, Check, Copy, History, Lock, MailPlus, Search, Settings2, ShieldCheck, UserCheck, Users } from "lucide-react";
import { toast } from "sonner";
import {
  api, type AdminSummary, type AdminUser, type AppSettings, type AuditEntry, type ImportSource, type Invite, type Role, type SignupMode,
} from "@/lib/api";
import { useAuth } from "@/lib/auth";
import { cn, initials, timeAgo } from "@/lib/utils";
import { AppShell } from "@/components/shell/AppShell";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input, Label, Select } from "@/components/ui/input";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Chip, EmptyPanel, ErrorBanner, ListSkeleton, PageHeader, Pill, Stat } from "@/components/kb/Bits";

const ROLES: Role[] = ["engineer", "maintainer", "owner"];
const ROLE_HINT: Record<Role, string> = {
  engineer: "Read everything, tick their own checklists, give feedback",
  maintainer: "Also write docs and rules, create projects, import code, triage feedback",
  owner: "Also manage users, roles, invites and settings",
};
const ROLE_TONE = { engineer: "neutral", maintainer: "violet", owner: "orange" } as const;
const SOURCES: { key: ImportSource; label: string }[] = [
  { key: "folder", label: "Folder upload" },
  { key: "archive", label: "Zip upload" },
  { key: "github", label: "GitHub" },
  { key: "bitbucket", label: "Bitbucket" },
  { key: "git", label: "Any Git URL" },
];
const MODES: { key: SignupMode; label: string; hint: string }[] = [
  { key: "open", label: "Open", hint: "Anyone who can reach DevAtlas can create an engineer account." },
  { key: "domain", label: "Company domains", hint: "Only emails on the allowed domains, or someone with an invite." },
  { key: "invite", label: "Invite only", hint: "Nobody can sign up without an invite code from an owner." },
];

function useInvalidateAdmin() {
  const qc = useQueryClient();
  return () => {
    qc.invalidateQueries({ queryKey: ["admin"] });
    qc.invalidateQueries({ queryKey: ["auth-config"] });
  };
}

/* ------------------------------------------------------------------ users */

function UsersTab() {
  const { user: me } = useAuth();
  const refresh = useInvalidateAdmin();
  const [text, setText] = useState("");
  const [role, setRole] = useState<Role | "">("");
  const [showInactive, setShowInactive] = useState(true);
  const users = useQuery({ queryKey: ["admin", "users"], queryFn: () => api<AdminUser[]>("/admin/users") });
  const update = useMutation({
    mutationFn: ({ id, body }: { id: string; body: { role?: Role; active?: boolean } }) => api<AdminUser>(`/admin/users/${id}`, { method: "PUT", body }),
    onSuccess: (u, v) => {
      refresh();
      toast.success(v.body.role ? `${u.name} is now ${u.role}. They'll need to sign in again.` : u.active ? `${u.name} reactivated` : `${u.name} deactivated and signed out`);
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : "Could not update the user"),
  });

  const rows = useMemo(() => {
    const q = text.trim().toLowerCase();
    return (users.data ?? []).filter((u) =>
      (!q || u.name.toLowerCase().includes(q) || u.email.includes(q)) && (!role || u.role === role) && (showInactive || u.active));
  }, [users.data, text, role, showInactive]);

  return (
    <div className="space-y-4">
      <div className="flex flex-col gap-3 xl:flex-row xl:items-center">
        <div className="relative flex-1">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" aria-hidden />
          <Input value={text} onChange={(e) => setText(e.target.value)} className="pl-9" placeholder="Search by name or email" aria-label="Search users" />
        </div>
        <div className="flex flex-wrap gap-2">
          <Chip active={!role} onClick={() => setRole("")}>All roles</Chip>
          {ROLES.map((r) => <Chip key={r} active={role === r} onClick={() => setRole(role === r ? "" : r)}>{r}</Chip>)}
          <Chip active={!showInactive} onClick={() => setShowInactive(!showInactive)}>Hide deactivated</Chip>
        </div>
      </div>
      {users.isLoading && <ListSkeleton rows={5} />}
      {users.isError && <ErrorBanner error={users.error} onRetry={() => users.refetch()} />}
      {users.data && rows.length === 0 && <EmptyPanel icon={Users} title="No users match" text="Clear the search or a filter." />}
      {rows.length > 0 && (
        <div className="overflow-x-auto rounded-xl border border-border bg-card shadow-soft">
          <table className="w-full min-w-[720px] text-left text-sm">
            <thead className="bg-secondary/60">
              <tr>
                <th className="px-4 py-2.5 font-semibold">User</th>
                <th className="px-4 py-2.5 font-semibold">Role</th>
                <th className="px-4 py-2.5 font-semibold">Status</th>
                <th className="px-4 py-2.5 font-semibold">Last sign-in</th>
                <th className="px-4 py-2.5 text-right font-semibold">Access</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((u) => {
                const self = u.id === me?.id;
                return (
                  <tr key={u.id} className={cn("border-t border-border", !u.active && "bg-secondary/30 text-muted-foreground")}>
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-3">
                        <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-accent text-[11px] font-bold text-primary" aria-hidden>{initials(u.name)}</span>
                        <div className="min-w-0">
                          <div className="flex items-center gap-2 font-medium text-foreground">{u.name}{self && <Pill>you</Pill>}{u.origin === "SEED" && <Pill tone="amber" mono>DEMO</Pill>}</div>
                          <div className="truncate font-mono text-[12px] text-muted-foreground">{u.email}</div>
                        </div>
                      </div>
                    </td>
                    <td className="px-4 py-3">
                      <Select
                        aria-label={`Role for ${u.name}`}
                        value={u.role}
                        disabled={self || !u.active || update.isPending}
                        title={self ? "You can't change your own role" : ROLE_HINT[u.role]}
                        onChange={(e) => update.mutate({ id: u.id, body: { role: e.target.value as Role } })}
                        className="h-8 w-[132px] text-[13px]"
                      >
                        {ROLES.map((r) => <option key={r} value={r}>{r}</option>)}
                      </Select>
                    </td>
                    <td className="px-4 py-3">{u.active ? <Pill tone="green">active</Pill> : <Pill tone="red">deactivated</Pill>}</td>
                    <td className="px-4 py-3 text-[13px]">{u.last_login_at ? timeAgo(u.last_login_at) : "never"}</td>
                    <td className="px-4 py-3 text-right">
                      {!self && (
                        u.active
                          ? <Button size="sm" variant="ghost" onClick={() => { if (confirm(`Deactivate ${u.name}? They are signed out immediately.`)) update.mutate({ id: u.id, body: { active: false } }); }}><Ban /> Deactivate</Button>
                          : <Button size="sm" variant="secondary" onClick={() => update.mutate({ id: u.id, body: { active: true } })}><UserCheck /> Reactivate</Button>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
      <Card className="grid gap-3 p-4 text-[13px] sm:grid-cols-3">
        {ROLES.map((r) => <div key={r}><Pill tone={ROLE_TONE[r]} className="mb-1 uppercase tracking-wider">{r}</Pill><div className="text-muted-foreground">{ROLE_HINT[r]}</div></div>)}
      </Card>
    </div>
  );
}

/* ------------------------------------------------------------------ invites */

function InvitesTab() {
  const refresh = useInvalidateAdmin();
  const [email, setEmail] = useState("");
  const [role, setRole] = useState<Role>("engineer");
  const [days, setDays] = useState(7);
  const [copied, setCopied] = useState<string | null>(null);
  const invites = useQuery({ queryKey: ["admin", "invites"], queryFn: () => api<Invite[]>("/admin/invites") });
  const create = useMutation({
    mutationFn: () => api<Invite>("/admin/invites", { body: { email: email.trim() || null, role, days } }),
    onSuccess: (inv) => { refresh(); setEmail(""); toast.success("Invite created. Copy the link and send it."); copy(inv); },
    onError: (e) => toast.error(e instanceof Error ? e.message : "Could not create the invite"),
  });
  const revoke = useMutation({
    mutationFn: (id: string) => api<Invite>(`/admin/invites/${id}`, { method: "DELETE" }),
    onSuccess: () => { refresh(); toast.success("Invite revoked"); },
    onError: (e) => toast.error(e instanceof Error ? e.message : "Could not revoke"),
  });
  const link = (inv: Invite) => `${window.location.origin}/login?invite=${encodeURIComponent(inv.code)}`;
  async function copy(inv: Invite) {
    try { await navigator.clipboard.writeText(link(inv)); setCopied(inv.id); setTimeout(() => setCopied(null), 1500); } catch { /* clipboard blocked */ }
  }
  const submit = (e: FormEvent) => { e.preventDefault(); create.mutate(); };
  const tone = { pending: "violet", used: "green", revoked: "neutral", expired: "amber" } as const;

  return (
    <div className="space-y-5">
      <Card className="p-5">
        <form onSubmit={submit} className="grid gap-4 md:grid-cols-[1fr_160px_120px_auto] md:items-end">
          <div><Label htmlFor="inv-email">Email (optional)</Label><Input id="inv-email" type="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="Blank = anyone, once" /></div>
          <div><Label htmlFor="inv-role">Role</Label><Select id="inv-role" value={role} onChange={(e) => setRole(e.target.value as Role)}>{ROLES.map((r) => <option key={r} value={r}>{r}</option>)}</Select></div>
          <div><Label htmlFor="inv-days">Valid for</Label><Select id="inv-days" value={days} onChange={(e) => setDays(Number(e.target.value))}>{[1, 3, 7, 14, 30].map((d) => <option key={d} value={d}>{d} day{d > 1 ? "s" : ""}</option>)}</Select></div>
          <Button type="submit" loading={create.isPending}><MailPlus /> Create invite</Button>
        </form>
        <p className="mt-3 text-[12px] text-muted-foreground">An invite is single use. It sets the new account's role, and it works even when sign-up is limited to invites or company domains. DevAtlas doesn't send email: copy the link and share it yourself.</p>
      </Card>
      {invites.isLoading && <ListSkeleton rows={3} />}
      {invites.isError && <ErrorBanner error={invites.error} onRetry={() => invites.refetch()} />}
      {invites.data?.length === 0 && <EmptyPanel icon={MailPlus} title="No invites yet" text="Create one above to bring someone in with the right role from day one." />}
      <div className="space-y-2">
        {invites.data?.map((inv) => (
          <Card key={inv.id} className="flex flex-col gap-3 p-4 sm:flex-row sm:items-center">
            <div className="min-w-0 flex-1">
              <div className="flex flex-wrap items-center gap-2">
                <span className="font-medium">{inv.email ?? "Anyone with the link"}</span>
                <Pill tone={ROLE_TONE[inv.role]}>{inv.role}</Pill>
                <Pill tone={tone[inv.status]}>{inv.status}</Pill>
              </div>
              <div className="mt-0.5 text-[12px] text-muted-foreground">
                By {inv.created_by} · {timeAgo(inv.created_at)} · {inv.status === "used" ? `used by ${inv.used_by}` : `expires ${new Date(inv.expires_at).toLocaleDateString()}`}
              </div>
            </div>
            {inv.status === "pending" && (
              <div className="flex gap-2">
                <Button size="sm" variant="secondary" onClick={() => copy(inv)}>{copied === inv.id ? <Check /> : <Copy />} {copied === inv.id ? "Copied" : "Copy link"}</Button>
                <Button size="sm" variant="ghost" onClick={() => revoke.mutate(inv.id)}>Revoke</Button>
              </div>
            )}
          </Card>
        ))}
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ settings */

function SettingsTab() {
  const refresh = useInvalidateAdmin();
  const q = useQuery({ queryKey: ["admin", "settings"], queryFn: () => api<AppSettings>("/admin/settings") });
  const [mode, setMode] = useState<SignupMode>("open");
  const [domains, setDomains] = useState("");
  const [days, setDays] = useState(7);
  const [sources, setSources] = useState<ImportSource[]>([]);
  useEffect(() => {
    if (!q.data) return;
    setMode(q.data.signup_mode); setDomains(q.data.allowed_domains.join(", ")); setDays(q.data.session_days); setSources(q.data.import_sources);
  }, [q.data]);
  const save = useMutation({
    mutationFn: () => api<AppSettings>("/admin/settings", {
      method: "PUT",
      body: { signup_mode: mode, allowed_domains: domains.split(/[\s,]+/).filter(Boolean), session_days: days, import_sources: sources },
    }),
    onSuccess: () => { refresh(); toast.success("Settings saved"); },
    onError: (e) => toast.error(e instanceof Error ? e.message : "Could not save settings"),
  });
  const dirty = q.data && (mode !== q.data.signup_mode || domains.split(/[\s,]+/).filter(Boolean).join(",") !== q.data.allowed_domains.join(",") || days !== q.data.session_days || sources.join(",") !== q.data.import_sources.join(","));

  if (q.isLoading) return <ListSkeleton rows={4} />;
  if (q.isError) return <ErrorBanner error={q.error} onRetry={() => q.refetch()} />;
  return (
    <form onSubmit={(e) => { e.preventDefault(); save.mutate(); }} className="space-y-5">
      <Card className="p-5">
        <h2 className="font-semibold">Who can sign up</h2>
        <div className="mt-3 grid gap-2 md:grid-cols-3" role="radiogroup" aria-label="Sign-up mode">
          {MODES.map((m) => (
            <button key={m.key} type="button" role="radio" aria-checked={mode === m.key} onClick={() => setMode(m.key)}
              className={cn("rounded-xl border p-3.5 text-left transition-colors", mode === m.key ? "border-primary bg-accent/50" : "border-border hover:bg-secondary/50")}>
              <div className="flex items-center gap-2 text-sm font-semibold"><span className={cn("h-3.5 w-3.5 rounded-full border-2", mode === m.key ? "border-primary bg-primary" : "border-input")} aria-hidden />{m.label}</div>
              <div className="mt-1 text-[12.5px] text-muted-foreground">{m.hint}</div>
            </button>
          ))}
        </div>
        {mode === "domain" && (
          <div className="mt-4 max-w-xl">
            <Label htmlFor="set-domains">Allowed email domains</Label>
            <Input id="set-domains" value={domains} onChange={(e) => setDomains(e.target.value)} placeholder="company.com, company.co.uk" className="font-mono" />
          </div>
        )}
        <p className="mt-3 text-[12px] text-muted-foreground">New accounts always start as engineers unless an invite says otherwise. Existing users are not affected.</p>
      </Card>
      <Card className="p-5">
        <h2 className="font-semibold">Sessions</h2>
        <div className="mt-3 flex max-w-xs items-end gap-3">
          <div className="flex-1"><Label htmlFor="set-days">Stay signed in for</Label><Select id="set-days" value={days} onChange={(e) => setDays(Number(e.target.value))}>{[1, 3, 7, 14, 30].map((d) => <option key={d} value={d}>{d} day{d > 1 ? "s" : ""}</option>)}</Select></div>
        </div>
        <p className="mt-2 text-[12px] text-muted-foreground">Applies to new sign-ins. Changing someone's role or deactivating them signs them out straight away.</p>
      </Card>
      <Card className="p-5">
        <h2 className="font-semibold">Codebase import sources</h2>
        <div className="mt-3 flex flex-wrap gap-2">
          {SOURCES.map((s) => {
            const on = sources.includes(s.key);
            return (
              <button key={s.key} type="button" role="checkbox" aria-checked={on} onClick={() => setSources(on ? sources.filter((x) => x !== s.key) : [...sources, s.key])}
                className={cn("inline-flex h-9 items-center gap-2 rounded-lg border px-3 text-[13px] font-medium transition-colors", on ? "border-primary bg-accent text-primary" : "border-border text-muted-foreground hover:bg-secondary")}>
                <span className={cn("flex h-4 w-4 items-center justify-center rounded border", on ? "border-primary bg-primary text-primary-foreground" : "border-input")} aria-hidden>{on && <Check className="h-3 w-3" />}</span>
                {s.label}
              </button>
            );
          })}
        </div>
        <p className="mt-2 text-[12px] text-muted-foreground">Turned-off sources disappear from the Import screen and the API refuses them. Tokens for private repos stay in <code className="inline-code">backend/.env</code>.</p>
      </Card>
      <div className="flex flex-wrap items-center justify-end gap-3">
        {q.data?.updated_by && <span className="text-[12px] text-muted-foreground">Last changed by {q.data.updated_by} {timeAgo(q.data.updated_at)}</span>}
        <Button type="submit" loading={save.isPending} disabled={!dirty}><Settings2 /> Save settings</Button>
      </div>
    </form>
  );
}

/* ------------------------------------------------------------------ audit */

const ACTION_LABEL: Record<string, string> = {
  "user.role": "Changed role", "user.activate": "Reactivated user", "user.deactivate": "Deactivated user", "user.bootstrap_owner": "First owner set",
  "settings.update": "Changed settings", "invite.create": "Created invite", "invite.revoke": "Revoked invite", "invite.accept": "Joined with invite",
};

function describe(e: AuditEntry): string {
  if (e.action === "user.role") return `${e.detail.from} → ${e.detail.to}`;
  if (e.action.startsWith("import.")) return `${(e.detail.projects as string[] | undefined)?.length ?? 0} projects, ${e.detail.docs ?? 0} docs, ${e.detail.files ?? 0} files`;
  if (e.action === "settings.update") return Object.entries(e.detail).map(([k, v]) => `${k}: ${JSON.stringify((v as { to: unknown }).to)}`).join(" · ");
  if (e.action.startsWith("invite.")) return `role ${e.detail.role ?? ""}`;
  return "";
}

function AuditTab() {
  const [action, setAction] = useState("");
  const q = useQuery({ queryKey: ["admin", "audit", action], queryFn: () => api<AuditEntry[]>(`/admin/audit?limit=300${action ? `&action=${action}` : ""}`) });
  return (
    <div className="space-y-4">
      <div className="flex flex-wrap gap-2">
        {[["", "Everything"], ["user", "Users and roles"], ["invite", "Invites"], ["settings", "Settings"], ["import", "Imports"]].map(([k, l]) => (
          <Chip key={k || "all"} active={action === k} onClick={() => setAction(k)}>{l}</Chip>
        ))}
      </div>
      {q.isLoading && <ListSkeleton rows={5} />}
      {q.isError && <ErrorBanner error={q.error} onRetry={() => q.refetch()} />}
      {q.data?.length === 0 && <EmptyPanel icon={History} title="Nothing recorded yet" text="Role changes, invites, settings changes and codebase imports show up here." />}
      {q.data && q.data.length > 0 && (
        <div className="overflow-x-auto rounded-xl border border-border bg-card shadow-soft">
          <table className="w-full min-w-[720px] text-left text-sm">
            <thead className="bg-secondary/60"><tr><th className="px-4 py-2.5 font-semibold">When</th><th className="px-4 py-2.5 font-semibold">Who</th><th className="px-4 py-2.5 font-semibold">What</th><th className="px-4 py-2.5 font-semibold">Target</th><th className="px-4 py-2.5 font-semibold">Details</th></tr></thead>
            <tbody>
              {q.data.map((e) => (
                <tr key={e.id} className="border-t border-border align-top">
                  <td className="whitespace-nowrap px-4 py-2.5 text-[13px] text-muted-foreground" title={new Date(e.at).toLocaleString()}>{timeAgo(e.at)}</td>
                  <td className="px-4 py-2.5">{e.actor_name}</td>
                  <td className="px-4 py-2.5"><Pill tone={e.action.startsWith("import") ? "violet" : e.action.includes("deactivate") || e.action.includes("revoke") ? "red" : "neutral"}>{ACTION_LABEL[e.action] ?? e.action.replace("import.", "Imported via ")}</Pill></td>
                  <td className="break-all px-4 py-2.5 font-mono text-[12px]">{e.target}</td>
                  <td className="px-4 py-2.5 text-[13px] text-muted-foreground">{describe(e)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

/* ------------------------------------------------------------------ page */

export default function Admin() {
  const { isOwner } = useAuth();
  const [params, setParams] = useSearchParams();
  const tab = params.get("tab") ?? "users";
  const summary = useQuery({ queryKey: ["admin", "summary"], queryFn: () => api<AdminSummary>("/admin/summary"), enabled: isOwner });

  if (!isOwner) {
    return <AppShell><EmptyPanel icon={Lock} title="Owners only" text="User roles, invites and settings are managed by owners. Ask one on the Team page." /></AppShell>;
  }
  return (
    <AppShell>
      <PageHeader eyebrow="Admin" title="Users, roles and settings" description="Decide who can sign up, what each person can do, and which import sources are allowed. Every change is recorded in the audit log." />
      <div className="mb-6 grid gap-3 sm:grid-cols-4">
        <Stat label="Active users" value={summary.data?.active ?? "…"} hint={summary.data ? `${summary.data.users - summary.data.active} deactivated` : undefined} />
        <Stat label="Maintainers" value={summary.data?.by_role.maintainer ?? "…"} />
        <Stat label="Owners" value={summary.data?.by_role.owner ?? "…"} />
        <Stat label="Pending invites" value={summary.data?.pending_invites ?? "…"} />
      </div>
      <Tabs value={tab} onValueChange={(t) => setParams({ tab: t }, { replace: true })}>
        <TabsList className="mb-6">
          <TabsTrigger value="users"><span className="inline-flex items-center gap-1.5"><Users className="h-4 w-4" />Users</span></TabsTrigger>
          <TabsTrigger value="invites"><span className="inline-flex items-center gap-1.5"><MailPlus className="h-4 w-4" />Invites</span></TabsTrigger>
          <TabsTrigger value="settings"><span className="inline-flex items-center gap-1.5"><ShieldCheck className="h-4 w-4" />Settings</span></TabsTrigger>
          <TabsTrigger value="audit"><span className="inline-flex items-center gap-1.5"><History className="h-4 w-4" />Audit log</span></TabsTrigger>
        </TabsList>
        <TabsContent value="users"><UsersTab /></TabsContent>
        <TabsContent value="invites"><InvitesTab /></TabsContent>
        <TabsContent value="settings"><SettingsTab /></TabsContent>
        <TabsContent value="audit"><AuditTab /></TabsContent>
      </Tabs>
    </AppShell>
  );
}
