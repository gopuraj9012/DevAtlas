import { useState, type CSSProperties, type FormEvent } from "react";
import { Navigate, useLocation, useNavigate } from "react-router-dom";
import { AlertCircle, ArrowRight, BookOpen, Rocket, ShieldCheck } from "lucide-react";
import { useAuth } from "@/lib/auth";
import { Button } from "@/components/ui/button";
import { Input, Label } from "@/components/ui/input";
import { cn } from "@/lib/utils";

const FEATURES = [
  { icon: BookOpen, label: "Architecture & system design", hint: "Both systems, and the seam between them" },
  { icon: ShieldCheck, label: "Code standards & validation rules", hint: "What good looks like, side by side" },
  { icon: Rocket, label: "Setup guides & onboarding tracking", hint: "A checklist per project, ticked by you" },
];

const LEGACY = [
  "public DataTable GetOrders(int id)",
  "{",
  "    return SqlHelper",
  "        .ExecuteDataTable(",
  "            \"usp_GetOrders\", id);",
  "}",
];
const MODERN = [
  "public async Task<Order[]>",
  "    GetOrdersAsync(int id,",
  "        CancellationToken ct) =>",
  "    await _db.Orders",
  "        .Where(o => o.Id == id)",
  "        .ToArrayAsync(ct);",
];

/** Staggered entrance: each element fades up a little after the one before. */
const stagger = (i: number, base = 0): CSSProperties => ({ animationDelay: `${base + i * 90}ms` });

function CodeLines({ lines, delay, caret }: { lines: string[]; delay: number; caret?: boolean }) {
  return (
    <pre className="overflow-hidden font-mono text-[11.5px] leading-[1.65] lg:text-[10.5px] xl:text-[11px] 2xl:text-[12px]">
      <code>
        {lines.map((l, i) => (
          <span key={i} className="block animate-line-in whitespace-pre" style={{ animationDelay: `${delay + i * 110}ms` }}>
            {l}
            {caret && i === lines.length - 1 && <span aria-hidden className="ml-0.5 inline-block h-3 w-1.5 translate-y-0.5 animate-caret bg-primary" />}
          </span>
        ))}
      </code>
    </pre>
  );
}

function HeroCard() {
  return (
    <div className="hidden animate-fade-up sm:block" style={{ animationDelay: "250ms" }}>
      <div className="animate-float">
        <div className="relative overflow-hidden rounded-[14px] border border-border bg-card shadow-lift">
          <div className="flex h-9 items-center gap-2 border-b border-border px-4">
            <span className="h-2.5 w-2.5 rounded-full bg-destructive/60" aria-hidden />
            <span className="h-2.5 w-2.5 rounded-full bg-warning/60" aria-hidden />
            <span className="h-2.5 w-2.5 rounded-full bg-success/60" aria-hidden />
            <span className="ml-2 font-mono text-[12px] text-muted-foreground">OrderService.cs</span>
          </div>
          <div className="relative grid gap-px bg-white/10 sm:grid-cols-2">
            {[
              { side: "legacy", label: "Legacy .NET Framework", lines: LEGACY, fw: ".NET Framework 4.8", delay: 500 },
              { side: "modern", label: "Modern .NET", lines: MODERN, fw: ".NET 8", delay: 1250 },
            ].map((p) => (
              <div key={p.side} className="bg-code px-4 py-3.5 text-code-foreground">
                <div className="mb-2.5 flex items-center gap-2">
                  <span className="relative flex h-2 w-2" aria-hidden>
                    <span className={cn("absolute inline-flex h-full w-full animate-ping-soft rounded-full", p.side === "legacy" ? "bg-legacy" : "bg-primary")} />
                    <span className={cn("relative inline-flex h-2 w-2 rounded-full", p.side === "legacy" ? "bg-legacy" : "bg-primary")} />
                  </span>
                  <span className="text-[10px] font-semibold uppercase tracking-[0.1em]">{p.label}</span>
                </div>
                <CodeLines lines={p.lines} delay={p.delay} caret={p.side === "modern"} />
                <div className="mt-2.5 font-mono text-[11px] text-code-foreground/50">{p.fw}</div>
              </div>
            ))}
            <span
              aria-hidden
              className="absolute left-1/2 top-1/2 hidden h-7 w-7 -translate-x-1/2 -translate-y-1/2 animate-fade-in items-center justify-center rounded-full border border-white/15 bg-code text-primary shadow-lift xl:flex"
              style={{ animationDelay: "1100ms" }}
            >
              <ArrowRight className="h-3.5 w-3.5" />
            </span>
          </div>
        </div>
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
    <div className="relative isolate flex min-h-screen flex-col overflow-hidden lg:h-[100dvh] lg:min-h-0">
      {/* Ambient background: drifting violet glow over a slowly panning grid */}
      <div aria-hidden className="pointer-events-none absolute inset-0 -z-10">
        <div
          className="absolute inset-0 animate-grid-pan opacity-70"
          style={{
            backgroundImage:
              "repeating-linear-gradient(0deg, hsl(var(--foreground) / 0.045) 0 1px, transparent 1px 40px), repeating-linear-gradient(90deg, hsl(var(--foreground) / 0.045) 0 1px, transparent 1px 40px)",
            maskImage: "radial-gradient(ellipse 80% 70% at 60% 40%, black, transparent 75%)",
            WebkitMaskImage: "radial-gradient(ellipse 80% 70% at 60% 40%, black, transparent 75%)",
          }}
        />
        <div className="absolute -right-[10%] -top-[20%] h-[70vh] w-[60vw] animate-glow-drift rounded-full bg-accent blur-3xl" />
        <div className="absolute -bottom-[25%] -left-[10%] h-[50vh] w-[40vw] animate-glow-drift rounded-full bg-legacy-soft blur-3xl" style={{ animationDelay: "-7s" }} />
      </div>

      <header className="mx-auto flex w-full max-w-[1180px] shrink-0 items-center justify-between px-6 pt-5 animate-fade-in">
        <div className="flex items-center gap-2.5">
          <span className="flex h-9 w-9 items-center justify-center rounded-[10px] bg-primary text-base font-bold text-primary-foreground shadow-sm">D</span>
          <span className="text-base font-bold tracking-tight">DevAtlas</span>
        </div>
        <span className="hidden items-center gap-2 text-[12px] text-muted-foreground sm:flex">
          <span className="relative flex h-1.5 w-1.5" aria-hidden>
            <span className="absolute inline-flex h-full w-full animate-ping-soft rounded-full bg-success" />
            <span className="relative inline-flex h-1.5 w-1.5 rounded-full bg-success" />
          </span>
          Internal team only
        </span>
      </header>

      <main className="mx-auto grid w-full max-w-[1180px] flex-1 items-center gap-10 px-6 py-8 lg:min-h-0 lg:grid-cols-[1.05fr_1fr] lg:gap-14 lg:py-4">
        <div>
          <div className="animate-fade-up text-[12px] font-semibold uppercase tracking-widest text-primary" style={stagger(0)}>
            DevAtlas · Internal knowledge base
          </div>
          <h1 className="mt-3 animate-fade-up text-[38px] font-bold leading-[1.04] tracking-[-0.03em] sm:text-[46px] xl:text-[58px]" style={stagger(1)}>
            Learn our .NET codebases <br className="hidden sm:block" />
            <span className="bg-gradient-to-r from-primary to-primary-deep bg-clip-text text-transparent">in days, not months.</span>
          </h1>
          <p className="mt-4 max-w-xl animate-fade-up text-[15px] text-muted-foreground xl:text-[17px]" style={stagger(2)}>
            Architecture, standards, data contracts and setup guides for our legacy .NET Framework 4.8 platform and the modern .NET 8 platform, in one place, so you never have to ask who knows.
          </p>
          <ul className="mt-6 hidden space-y-3 sm:block">
            {FEATURES.map((f, i) => (
              <li key={f.label} className="group flex animate-fade-up items-center gap-3" style={stagger(i, 300)}>
                <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-[10px] bg-accent text-primary transition-transform duration-200 group-hover:-translate-y-0.5 group-hover:rotate-[-4deg]">
                  <f.icon className="h-4 w-4" aria-hidden />
                </span>
                <span>
                  <span className="block text-sm font-medium">{f.label}</span>
                  <span className="block text-[12.5px] text-muted-foreground">{f.hint}</span>
                </span>
              </li>
            ))}
          </ul>
        </div>

        <div className="space-y-4">
          <HeroCard />
          <form onSubmit={submit} className="animate-fade-up rounded-xl border border-border bg-card/90 p-4 shadow-soft backdrop-blur" style={{ animationDelay: "400ms" }} noValidate>
            <div className="mb-3 flex gap-1 rounded-lg bg-secondary p-1" role="tablist" aria-label="Account">
              {(["signin", "signup"] as const).map((m) => (
                <button
                  key={m}
                  type="button"
                  role="tab"
                  aria-selected={mode === m}
                  onClick={() => { setMode(m); setError(null); }}
                  className={cn("h-7 flex-1 rounded-md text-[13px] font-medium transition-all duration-200", mode === m ? "bg-card text-foreground shadow-sm" : "text-muted-foreground hover:text-foreground")}
                >
                  {m === "signin" ? "Sign in" : "Create account"}
                </button>
              ))}
            </div>
            <div className={cn("grid gap-3", mode === "signup" ? "sm:grid-cols-3" : "sm:grid-cols-2")}>
              {mode === "signup" && (
                <div className="animate-fade-in">
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
                <Input id="password" type="password" autoComplete={mode === "signin" ? "current-password" : "new-password"} required minLength={8} value={password} onChange={(e) => setPassword(e.target.value)} placeholder={mode === "signup" ? "8+ characters" : ""} />
              </div>
            </div>
            {error && (
              <div role="alert" className="mt-3 flex animate-fade-in items-start gap-2 text-[13px] text-destructive">
                <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" aria-hidden /> {error}
              </div>
            )}
            <Button type="submit" size="lg" className="group mt-3 w-full" loading={busy} disabled={!email || !password}>
              {mode === "signin" ? "Sign in to continue" : "Create account and continue"}
              {!busy && <ArrowRight className="transition-transform duration-200 group-hover:translate-x-0.5" />}
            </Button>
            <p className="mt-2 text-center text-[12px] text-muted-foreground">
              Email and password sign-in{mode === "signup" ? " · new accounts start as engineers" : ""}
            </p>
          </form>
        </div>
      </main>

      <footer className="flex h-7 shrink-0 items-center gap-2 overflow-hidden whitespace-nowrap bg-foreground px-4 font-mono text-[11px] text-background/70">
        <span className="h-1.5 w-1.5 rounded-full bg-primary" aria-hidden /> DEVATLAS v2.4 · 2 systems · legacy .NET Framework 4.8 + modern .NET 8
      </footer>
    </div>
  );
}
