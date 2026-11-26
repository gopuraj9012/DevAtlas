import { useState, type FormEvent } from "react";
import { Navigate, useLocation, useNavigate } from "react-router-dom";
import { AlertCircle, BookOpen, Rocket, ShieldCheck } from "lucide-react";
import { useAuth } from "@/lib/auth";
import { Button } from "@/components/ui/button";
import { Input, Label } from "@/components/ui/input";
import { cn } from "@/lib/utils";

const FEATURES = [
  { icon: BookOpen, label: "Architecture & system design" },
  { icon: ShieldCheck, label: "Code standards & validation rules" },
  { icon: Rocket, label: "Setup guides & onboarding tracking" },
];

function HeroCard() {
  return (
    <div className="overflow-hidden rounded-[14px] border border-border bg-card shadow-lift">
      <div className="flex h-10 items-center gap-2 border-b border-border px-4">
        <span className="h-2.5 w-2.5 rounded-full bg-destructive/60" aria-hidden />
        <span className="h-2.5 w-2.5 rounded-full bg-warning/60" aria-hidden />
        <span className="h-2.5 w-2.5 rounded-full bg-success/60" aria-hidden />
        <span className="ml-2 font-mono text-[12px] text-muted-foreground">OrderService.cs</span>
      </div>
      <div className="grid gap-px bg-white/10 sm:grid-cols-2">
        {[
          { side: "legacy", label: "Legacy .NET Framework", code: "public DataTable GetOrders(int id)\n{\n    return SqlHelper\n        .ExecuteDataTable(\n            \"usp_GetOrders\", id);\n}", fw: ".NET Framework 4.8" },
          { side: "modern", label: "Modern .NET", code: "public async Task<Order[]>\n    GetOrdersAsync(int id,\n        CancellationToken ct) =>\n    await _db.Orders\n        .Where(o => o.Id == id)\n        .ToArrayAsync(ct);", fw: ".NET 8" },
        ].map((p) => (
          <div key={p.side} className="bg-code p-4 text-code-foreground">
            <div className="mb-3 flex items-center gap-2">
              <span aria-hidden className={cn("h-2 w-2 rounded-full", p.side === "legacy" ? "bg-legacy" : "bg-primary")} />
              <span className="text-[10px] font-semibold uppercase tracking-[0.1em]">{p.label}</span>
            </div>
            <pre className="font-mono text-[12px] leading-[1.65]"><code>{p.code}</code></pre>
            <div className="mt-3 font-mono text-[11px] text-code-foreground/50">{p.fw}</div>
          </div>
        ))}
      </div>
    </div>
  );
}

export default function Landing() {
  const { user, loading, login, signup } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const [mode, setMode] = useState<"signin" | "signup">("signin");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [name, setName] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (loading) return <div className="min-h-screen" aria-busy="true" />;
  if (user) return <Navigate to="/dashboard" replace />;

  const from = (location.state as { from?: string } | null)?.from ?? "/dashboard";

  async function submit(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      if (mode === "signin") await login(email, password);
      else await signup(email, password, name);
      navigate(from, { replace: true });
    } catch (err) {
      setError(err instanceof Error ? err.message : "Sign in failed.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="flex min-h-screen flex-col">
      <div className="canvas-grid flex-1">
        <div className="mx-auto grid max-w-[1100px] items-center gap-12 px-6 py-16 lg:grid-cols-[1.1fr_1fr] lg:py-24">
          <div>
            <div className="mb-5 flex items-center gap-2.5">
              <span className="flex h-10 w-10 items-center justify-center rounded-[10px] bg-primary text-lg font-bold text-primary-foreground shadow-sm">D</span>
              <span className="text-lg font-bold tracking-tight">DevAtlas</span>
            </div>
            <div className="text-[12px] font-semibold uppercase tracking-widest text-primary">DevAtlas · Internal knowledge base</div>
            <h1 className="mt-4 text-[40px] font-bold leading-[1.05] tracking-[-0.03em] lg:text-[52px] xl:text-[64px]">
              Learn our .NET codebases <br className="hidden sm:block" />
              in days, not months.
            </h1>
            <p className="mt-5 max-w-xl text-lg text-muted-foreground">
              Architecture, standards, data contracts and setup guides for our legacy .NET Framework 4.8 platform and the modern .NET 8 platform, in one place, so you never have to ask who knows.
            </p>
            <ul className="mt-6 flex flex-col gap-3 sm:flex-row sm:flex-wrap sm:gap-6">
              {FEATURES.map((f) => (
                <li key={f.label} className="flex items-center gap-2 text-sm font-medium">
                  <f.icon className="h-4 w-4 text-primary" aria-hidden /> {f.label}
                </li>
              ))}
            </ul>

            <form onSubmit={submit} className="mt-8 max-w-md rounded-xl border border-border bg-card/90 p-5 shadow-soft backdrop-blur" noValidate>
              <div className="mb-4 flex gap-1 rounded-lg bg-secondary p-1" role="tablist" aria-label="Account">
                {(["signin", "signup"] as const).map((m) => (
                  <button
                    key={m}
                    type="button"
                    role="tab"
                    aria-selected={mode === m}
                    onClick={() => { setMode(m); setError(null); }}
                    className={cn("h-8 flex-1 rounded-md text-[13px] font-medium transition-colors", mode === m ? "bg-card text-foreground shadow-sm" : "text-muted-foreground hover:text-foreground")}
                  >
                    {m === "signin" ? "Sign in" : "Create account"}
                  </button>
                ))}
              </div>
              <div className="space-y-3">
                {mode === "signup" && (
                  <div>
                    <Label htmlFor="name">Name</Label>
                    <Input id="name" autoComplete="name" value={name} onChange={(e) => setName(e.target.value)} placeholder="Priya Shah" />
                  </div>
                )}
                <div>
                  <Label htmlFor="email">Work email</Label>
                  <Input id="email" type="email" autoComplete="email" required value={email} onChange={(e) => setEmail(e.target.value)} placeholder="you@company.com" />
                </div>
                <div>
                  <Label htmlFor="password">Password</Label>
                  <Input id="password" type="password" autoComplete={mode === "signin" ? "current-password" : "new-password"} required minLength={8} value={password} onChange={(e) => setPassword(e.target.value)} placeholder={mode === "signup" ? "At least 8 characters" : ""} />
                </div>
              </div>
              {error && (
                <div role="alert" className="mt-3 flex items-start gap-2 text-[13px] text-destructive">
                  <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" aria-hidden /> {error}
                </div>
              )}
              <Button type="submit" size="lg" className="mt-4 w-full" loading={busy} disabled={!email || !password}>
                {mode === "signin" ? "Sign in to continue" : "Create account and continue"}
              </Button>
              <p className="mt-2.5 text-center text-[12px] text-muted-foreground">
                Internal team only · email and password sign-in{mode === "signup" ? " · new accounts start as engineers" : ""}
              </p>
            </form>
          </div>
          <HeroCard />
        </div>
      </div>
      <footer className="flex h-7 items-center gap-2 bg-foreground px-4 font-mono text-[11px] text-background/70">
        <span className="h-1.5 w-1.5 rounded-full bg-primary" aria-hidden /> DEVATLAS v2.4 · 2 systems · legacy .NET Framework 4.8 + modern .NET 8
      </footer>
    </div>
  );
}
