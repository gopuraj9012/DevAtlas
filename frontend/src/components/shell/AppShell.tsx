import { useState, type ReactNode } from "react";
import { Link, NavLink, useNavigate } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import * as Collapsible from "@radix-ui/react-collapsible";
import {
  BookMarked, Boxes, ChevronRight, FileCode2, FileUp, GitCompare, GraduationCap, LayoutDashboard, LogOut, MessageSquareWarning,
  Network, PanelLeft, PencilLine, PieChart, Plus, Rocket, Scale, Search, ShieldCheck, SpellCheck, Users, Workflow, type LucideIcon,
} from "lucide-react";
import { api, type Overview, type Project, type System } from "@/lib/api";
import { useAuth } from "@/lib/auth";
import { useShell } from "@/lib/store";
import { cn, initials } from "@/lib/utils";
import { Tip } from "@/components/ui/tooltip";
import { SearchDialog } from "@/components/kb/SearchDialog";

interface NavItem { to: string; label: string; icon: LucideIcon; editorOnly?: boolean }

const NAV: { group: string; items: NavItem[] }[] = [
  { group: "Workspace", items: [
    { to: "/dashboard", label: "Dashboard", icon: LayoutDashboard },
    { to: "/search", label: "Search", icon: Search },
    { to: "/learning-path", label: "Learning path", icon: GraduationCap },
  ] },
  { group: "Library", items: [
    { to: "/standards", label: "Standards", icon: Scale },
    { to: "/validation", label: "Validation rules", icon: ShieldCheck },
    { to: "/snippets", label: "Bad vs standard", icon: FileCode2 },
    { to: "/translations", label: "Translations", icon: GitCompare },
    { to: "/contracts", label: "Data contracts", icon: Boxes },
    { to: "/deployments", label: "Deployments", icon: Rocket },
    { to: "/glossary", label: "Glossary", icon: SpellCheck },
  ] },
  { group: "Insight", items: [
    { to: "/architecture", label: "Architecture", icon: Workflow },
    { to: "/service-map", label: "Service map", icon: Network },
    { to: "/coverage", label: "Migration coverage", icon: PieChart },
  ] },
  { group: "Team", items: [
    { to: "/team", label: "Team", icon: Users },
    { to: "/feedback", label: "Feedback", icon: MessageSquareWarning },
    { to: "/ingest", label: "Import codebase", icon: FileUp, editorOnly: true },
    { to: "/authoring", label: "Write a doc", icon: PencilLine, editorOnly: true },
  ] },
];

function NavRow({ item, collapsed }: { item: NavItem; collapsed: boolean }) {
  const Icon = item.icon;
  return (
    <Tip label={item.label} disabled={!collapsed}>
      <NavLink
        to={item.to}
        aria-label={collapsed ? item.label : undefined}
        className={({ isActive }) =>
          cn(
            "flex h-9 items-center gap-2.5 rounded-md px-2.5 text-sm font-medium transition-colors",
            collapsed && "justify-center px-0",
            isActive ? "bg-accent text-primary" : "text-sidebar-foreground/80 hover:bg-secondary hover:text-foreground",
          )
        }
      >
        <Icon className="h-4 w-4 shrink-0" aria-hidden />
        {!collapsed && <span className="truncate">{item.label}</span>}
      </NavLink>
    </Tip>
  );
}

function SystemGroup({ system, projects, collapsed, canEdit }: { system: System; projects: Project[]; collapsed: boolean; canEdit: boolean }) {
  const [open, setOpen] = useState(true);
  const navigate = useNavigate();
  const label = system === "legacy" ? "Legacy .NET Framework" : "Modern .NET";
  const dot = system === "legacy" ? "bg-legacy" : "bg-primary";
  if (collapsed) {
    return (
      <div className="flex flex-col items-center gap-1 py-1">
        {projects.map((p) => (
          <Tip key={p.slug} label={`${p.name} Â· ${label}`}>
            <NavLink to={`/projects/${p.slug}`} aria-label={`${p.name}, ${label}`} className={({ isActive }) => cn("flex h-8 w-8 items-center justify-center rounded-md hover:bg-secondary", isActive && "bg-accent")}>
              <span aria-hidden className={cn("h-2 w-2 rounded-full", dot)} />
            </NavLink>
          </Tip>
        ))}
      </div>
    );
  }
  return (
    <Collapsible.Root open={open} onOpenChange={setOpen} className="group/sys">
      <div className="flex h-8 items-center gap-1 pr-1">
        <Collapsible.Trigger className="flex h-8 flex-1 items-center gap-2 rounded-md px-2.5 text-left hover:bg-secondary" aria-label={`${label} projects`}>
          <ChevronRight aria-hidden className={cn("h-3 w-3 text-muted-foreground transition-transform duration-[180ms]", open && "rotate-90")} />
          <span aria-hidden className={cn("h-2 w-2 rounded-full", dot)} />
          <span className="micro-label truncate text-[10.5px] tracking-wider">{label}</span>
        </Collapsible.Trigger>
        {canEdit && (
          <button
            type="button"
            onClick={() => navigate(`/authoring?system=${system}`)}
            className="rounded-md p-1 text-muted-foreground opacity-0 transition-opacity hover:bg-secondary hover:text-foreground focus-visible:opacity-100 group-hover/sys:opacity-100 group-focus-within/sys:opacity-100"
            aria-label={`New doc in ${label}`}
          >
            <Plus className="h-3.5 w-3.5" />
          </button>
        )}
      </div>
      <Collapsible.Content className="overflow-hidden data-[state=closed]:animate-collapsible-up data-[state=open]:animate-collapsible-down">
        <div className="space-y-0.5 pb-1 pl-6">
          {projects.length === 0 && <div className="px-2 py-1.5 text-xs text-muted-foreground">No projects yet</div>}
          {projects.map((p) => (
            <NavLink
              key={p.slug}
              to={`/projects/${p.slug}`}
              className={({ isActive }) => cn("flex h-8 items-center rounded-md px-2 text-[13px] transition-colors", isActive ? "bg-accent font-medium text-primary" : "text-foreground/75 hover:bg-secondary hover:text-foreground")}
            >
              <span className="truncate">{p.name}</span>
            </NavLink>
          ))}
        </div>
      </Collapsible.Content>
    </Collapsible.Root>
  );
}

export function AppShell({ children, toc, wide }: { children: ReactNode; toc?: ReactNode; wide?: boolean }) {
  const { user, canEdit, logout } = useAuth();
  const collapsed = useShell((s) => s.collapsed);
  const toggle = useShell((s) => s.toggle);
  const setSearchOpen = useShell((s) => s.setSearchOpen);
  const projects = useQuery({ queryKey: ["projects"], queryFn: () => api<Project[]>("/projects") });
  const overview = useQuery({ queryKey: ["overview"], queryFn: () => api<Overview>("/overview"), staleTime: 60_000 });
  const list = projects.data ?? [];

  return (
    <div className="flex min-h-screen flex-col">
      <div className="flex flex-1">
        <aside
          id="app-sidebar"
          className={cn(
            "sticky top-0 hidden h-[calc(100vh-28px)] shrink-0 flex-col border-r border-border bg-sidebar transition-[width] duration-[180ms] ease-out md:flex",
            collapsed ? "w-14" : "w-[260px]",
          )}
        >
          <Link to="/dashboard" className={cn("flex h-14 shrink-0 items-center gap-2.5 px-3", collapsed && "justify-center px-0")} aria-label="DevAtlas home">
            <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-[10px] bg-primary text-base font-bold text-primary-foreground shadow-sm">D</span>
            {!collapsed && (
              <span className="leading-tight">
                <span className="block text-base font-bold tracking-tight">DevAtlas</span>
                <span className="block text-[10px] font-semibold uppercase tracking-widest text-muted-foreground">Internal KB</span>
              </span>
            )}
          </Link>
          <nav className="flex-1 space-y-4 overflow-y-auto px-2 pb-4 pt-2" aria-label="Main">
            {NAV.map((g) => (
              <div key={g.group} className="space-y-0.5">
                {!collapsed && <div className="micro-label px-2.5 pb-1 text-[10.5px]">{g.group}</div>}
                {g.items.filter((i) => !i.editorOnly || canEdit).map((i) => <NavRow key={i.to} item={i} collapsed={collapsed} />)}
              </div>
            ))}
            <div className="space-y-1 border-t border-border pt-3">
              {!collapsed && <div className="micro-label px-2.5 pb-1 text-[10.5px]">Projects</div>}
              <SystemGroup system="legacy" projects={list.filter((p) => p.system === "legacy")} collapsed={collapsed} canEdit={canEdit} />
              <SystemGroup system="modern" projects={list.filter((p) => p.system === "modern")} collapsed={collapsed} canEdit={canEdit} />
            </div>
          </nav>
          {user && (
            <div className={cn("flex h-14 shrink-0 items-center gap-2.5 border-t border-border px-3", collapsed && "justify-center px-0")}>
              <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-accent text-[11px] font-bold text-primary" aria-hidden>{initials(user.name)}</span>
              {!collapsed && (
                <div className="min-w-0 flex-1">
                  <div className="truncate text-[13px] font-semibold">{user.name}</div>
                  <span className="inline-flex h-4 items-center rounded-full bg-secondary px-1.5 text-[9.5px] font-semibold uppercase tracking-wider text-muted-foreground">{user.role}</span>
                </div>
              )}
              {!collapsed && (
                <Tip label="Sign out" side="top">
                  <button type="button" onClick={logout} className="rounded-md p-1.5 text-muted-foreground hover:bg-secondary hover:text-foreground" aria-label="Sign out">
                    <LogOut className="h-4 w-4" />
                  </button>
                </Tip>
              )}
            </div>
          )}
        </aside>

        <div className="flex min-w-0 flex-1 flex-col">
          <header className="sticky top-0 z-30 flex h-14 items-center gap-3 border-b border-border bg-background/95 px-4 backdrop-blur sm:px-6">
            <button
              type="button"
              onClick={toggle}
              aria-expanded={!collapsed}
              aria-controls="app-sidebar"
              aria-label={collapsed ? "Expand sidebar" : "Collapse sidebar"}
              className="hidden rounded-md p-2 text-muted-foreground hover:bg-secondary hover:text-foreground md:inline-flex"
            >
              <PanelLeft className="h-4 w-4" />
            </button>
            <Link to="/dashboard" className="flex h-8 w-8 shrink-0 items-center justify-center rounded-[10px] bg-primary text-sm font-bold text-primary-foreground md:hidden" aria-label="DevAtlas home">D</Link>
            <button
              type="button"
              onClick={() => setSearchOpen(true)}
              className="flex h-9 min-w-0 flex-1 max-w-xl items-center gap-2 rounded-lg bg-secondary px-3 text-left text-sm text-muted-foreground transition-colors hover:bg-secondary/70"
              aria-label="Search projects, docs, standards"
            >
              <Search className="h-4 w-4 shrink-0" aria-hidden />
              <span className="flex-1 truncate">Search projects, docs, standardsâ€¦</span>
              <kbd className="hidden h-5 items-center rounded-md border border-border bg-card px-1.5 font-mono text-[11px] text-muted-foreground sm:inline-flex">Ctrl K</kbd>
            </button>
            <MobileNav />
          </header>

          <div className="flex flex-1">
            <main className={cn("mx-auto w-full min-w-0 px-4 py-8 sm:px-8", wide ? "max-w-[1400px]" : "max-w-[1200px]")}>{children}</main>
            {toc}
          </div>
        </div>
      </div>

      <footer className="sticky bottom-0 z-30 flex h-7 items-center gap-2 overflow-hidden whitespace-nowrap bg-foreground px-4 font-mono text-[11px] text-background/70">
        <span className="h-1.5 w-1.5 rounded-full bg-primary" aria-hidden />
        <span>
          DEVATLAS v2.4 Â· 2 systems Â· {overview.data?.counts.projects ?? list.length} projects Â· {overview.data?.counts.articles ?? "â€¦"} docs Â·{" "}
          {projects.isError ? "api unreachable" : "api connected"}
        </span>
      </footer>
      <SearchDialog />
    </div>
  );
}

function MobileNav() {
  const { canEdit, logout } = useAuth();
  const [open, setOpen] = useState(false);
  return (
    <div className="md:hidden">
      <button type="button" onClick={() => setOpen((o) => !o)} aria-expanded={open} aria-controls="mobile-nav" className="rounded-md p-2 text-muted-foreground hover:bg-secondary" aria-label="Menu">
        <BookMarked className="h-4 w-4" />
      </button>
      {open && (
        <nav id="mobile-nav" aria-label="Main" className="fixed inset-x-0 top-14 z-40 max-h-[calc(100vh-84px)] overflow-y-auto border-b border-border bg-card p-3 shadow-lift">
          {NAV.flatMap((g) => g.items).filter((i) => !i.editorOnly || canEdit).map((i) => (
            <NavLink key={i.to} to={i.to} onClick={() => setOpen(false)} className={({ isActive }) => cn("flex h-10 items-center gap-2.5 rounded-md px-3 text-sm font-medium", isActive ? "bg-accent text-primary" : "hover:bg-secondary")}>
              <i.icon className="h-4 w-4" aria-hidden /> {i.label}
            </NavLink>
          ))}
          <button type="button" onClick={logout} className="mt-2 flex h-10 w-full items-center gap-2.5 rounded-md px-3 text-sm font-medium text-muted-foreground hover:bg-secondary">
            <LogOut className="h-4 w-4" /> Sign out
          </button>
        </nav>
      )}
    </div>
  );
}
