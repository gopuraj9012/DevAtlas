# Design guidelines

SOURCE OF TRUTH for this project's look. Implement every screen from this file and follow it over generic taste and template defaults; new screens reuse this shell, these components and this spacing. Change the look only through design_agent (a redesign), never by editing index.css tokens. Keep data and actions connected to the real backend.

## Visual signature
"Legacy vs Modern" split motif: DevAtlas's one signature element is a two-column code comparison card — dark JetBrains Mono panels side by side, an orange dot labeled LEGACY .NET FRAMEWORK over the left snippet and a violet dot labeled MODERN .NET over the right — used on the landing hero, the dashboard welcome card and as the empty-state illustration. Everything else is a bright white SaaS surface: white cards, 12–16px radius, 1px light-gray borders, soft diffuse shadows, deep violet primary for buttons, active nav rows and focus rings. Hierarchy rule: bold tight-tracked near-black Inter headlines, medium 500 UI labels, 11px uppercase letter-spaced micro-labels for group headers; mono only for code. Spatial rule: 260px collapsible sidebar + 56px top bar, content max 1200px, 8px spacing grid, 24px card padding. Signature interaction: sidebar system groups (orange LEGACY dot / violet MODERN dot) collapse/expand with a 180ms ease and the plus button on the group header opens a "new doc in this system" composer — the dot color carries the taxonomy everywhere (cards, badges, breadcrumbs).

## Applied theme
<theme>
The project theme is LOCKED in frontend/src/index.css (brand skill: Supabase, devtools-dark).
Never write --primary/--background/--font-* or Google-Fonts imports yourself and never pick a different color story or font pair — build on these tokens with semantic classes (bg-primary, text-muted-foreground, border-border, --shadow-md). To change the look, call design_agent instead of editing tokens.
Tokens (HSL): primary 263 70% 50% · background 0 0% 100% · foreground 240 6% 7% · accent 262 83% 96% · card 0 0% 100% · radius 0.375rem · dark background 0 0% 100%
Mode: DARK — `<html class="dark">` is already set (design_agent did it), so the `.dark` tokens are the live palette and `:root` is only the light fallback. Build for the dark canvas; do not add a light/dark toggle unless the user asks.
Fonts (already imported in index.css): sans Inter, sans-serif · serif Lora, serif (`font-serif`) · mono JetBrains Mono, monospace (`font-mono`).
Composition, components and spacing come from design_guidelines.md (this product's own design), not from the reference brand's stock layout.
</theme>

## Shell and navigation
App shell (signed-in): left sidebar 260px on bg-sidebar (very light neutral gray), 1px border-border right edge; collapses to 56px icon rail via top-bar toggle (labels hidden, tooltips on hover). Sidebar top: 40px violet rounded-square (10px radius) logo tile with white "D" glyph + "DevAtlas" 16px/700 wordmark + "INTERNAL KB" 10px uppercase tracking-widest muted subtitle. Nav rows 36px height, 8px radius, icon 16px + 14px/500 label; active row bg violet-100 tint with text-primary; hover bg-secondary. Below nav: collapsible system groups — header row with 8px colored dot (orange for LEGACY .NET FRAMEWORK, violet for MODERN .NET), 11px uppercase tracking-wider label, plus icon button on hover; children indented 24px, 32px rows. Pinned footer: 48px user block, 28px avatar circle with initial on violet tint, name 13px/600, role badge 10px uppercase pill, sign-out icon button right. Top bar 56px, bg-background, border-b: collapse toggle (PanelLeft icon), then wide search field (h-9, rounded-lg, bg-secondary, Search icon, placeholder "Search projects, docs, standards…", right-aligned "↵ Enter" kbd badge 11px mono in a bordered pill). Content area bg-background white, max-w-[1200px] px-8 py-8. Thin bottom status strip 28px, bg-foreground dark, mono 11px light text: "DEVATLAS v2.4 · 2 systems · 14 projects · synced 2m ago".

## Screens
### /login — Unauthenticated entry; explains the product and gates sign-in.
- Layout: Centered column max-w-[1100px]. Hero: faint violet grid/glow wash (radial violet-100/40 + 1px grid lines at 4% opacity). Eyebrow 12px uppercase tracking-widest text-primary "DEVATLAS · INTERNAL KNOWLEDGE BASE"; headline 64px/700 tracking -0.03em near-black, two lines: "Learn our .NET codebases" / "in days, not months."; muted 18px supporting line. Below: 3-item icon+text feature list (BookOpen "Architecture & system design", ShieldCheck "Code standards & validation rules", Rocket "Setup guides & onboarding tracking") in a row, 14px/500. Primary: violet "Sign in to continue" h-11 px-6; under it 12px muted "Internal team only · SSO enforced". Right of hero text (lg+): floating white code-card, 14px radius, soft shadow-lg, three-dot window chrome, header "OrderService.cs", two mono columns — left orange-dot LEGACY: `public DataTable GetOrders(int id)` / `.NET Framework 4.8`, right violet-dot MODERN: `public async Task<Order[]> GetOrdersAsync(...)` / `.NET 8`. Bottom: 28px dark console strip as in shell.
- States: Idle; submit → loading spinner in button; invalid SSO → inline destructive error line above button; already-authed → redirect to /dashboard.
- Responsive: Below 1024px the code card drops under the text full-width; feature list stacks vertically; headline scales to 40px.

### /dashboard — Signed-in home: welcome, onboarding status, project discovery.
- Layout: Top: welcome card — soft violet-to-white gradient (violet-100/60 → white, 16px radius, 1px border), eyebrow 11px uppercase "WELCOME, PRIYA", headline 28px/700 "Pick up where the team left off.", one muted line "3 onboarding steps due this week across 2 systems.", plus a small progress meter (violet fill, mono "62%"). Section "Projects" 20px/700 with violet "+ New project" button right. Grid of project cards (3-col): white, 14px radius, soft shadow, 24px padding — system dot + project name 16px/600, mono 11px framework badge (`.NET 8` violet tint / `.NET Framework 4.8` orange tint), 2-line muted description, footer row: doc count + "Onboarding 4/7" mini progress bar. Empty state: dashed 1.5px border panel, centered 48px violet icon tile (FolderPlus), bold "No projects yet", muted line, violet create button.
- States: Loading: skeleton cards with pulse; empty: dashed panel; error: inline retry banner.
- Responsive: 3-col → 2-col (1024px) → 1-col (640px); welcome card padding 24→16px.

### /projects/:projectId/docs/:docId — Primary reading surface for long-form documentation.
- Layout: Two-pane: sticky doc TOC right 220px (12px/500 links, active violet, scroll-spy); main column max-w-[720px]. Breadcrumb 13px muted with system dot: ● Atlas.Core / Architecture. H1 32px/700 tight; meta row 13px muted (author avatar, "Updated 3 days ago", 6 min read, framework badge). Body via prose styles: 16px/1.7, h2 22px/600, inline code JetBrains Mono 13px in violet-50 rounded chip, code blocks dark bg-foreground rounded-lg mono 13px with header bar. Callout components: violet-tint "Standard" and orange-tint "Legacy-only" notes. Bottom: "Was this accurate?" thumbs row + prev/next doc links.
- States: Loading skeleton for TOC+body; 404 → friendly not-found panel with back link; unsaved edit indicator in top bar.
- Responsive: TOC hides below 1024px (floating outline button opens it as a right sheet); code blocks scroll horizontally.

### /projects/:projectId — Working data screen: all docs for one project plus onboarding progress.
- Layout: Header: system dot + project name 24px/700, framework badge, tabs (Overview / Architecture / Standards / Validation / Setup) as 36px underline-style tabs, active text-primary with 2px violet underline. Overview tab: two-column — left doc list grouped by uppercase micro-label sections (ARCHITECTURE, STANDARDS…) as 44px rows with doc icon, title, updated timestamp; right 280px onboarding card: white, soft shadow, "Your onboarding" 14px/600, checklist rows with violet check circles, progress bar, "Continue" violet button.
- States: Empty doc group → muted "No docs in this section yet" + add link; saving checklist → optimistic check + toast.
- Responsive: Onboarding card moves below doc list; tabs scroll horizontally with fade edge.

## Components
- Button: h-9 px-4 rounded-lg (10px) 14px/500; primary bg-primary text-primary-foreground hover deepen to violet-700; secondary bg-card + border-border hover bg-secondary; ghost text-only. Focus ring 2px ring-primary offset 2px.
- Card: bg-card, 14px radius, 1px border-border, soft violet-tinted diffuse shadow; 24px padding.
- SidebarNavRow: 36px h, 8px radius, 16px lucide icon + 14px/500 label; active bg violet-100 tint text-primary; collapsed mode shows icon only with tooltip.
- SystemGroup: header 32px — 8px system dot (orange for legacy, primary violet for modern), 11px uppercase tracking-wider label, Plus button (visible on hover/focus-within); children 32px rows indented; Radix Collapsible, 180ms ease-out height.
- SearchField: h-9 rounded-lg bg-secondary, Search 16px icon, kbd badge "↵" mono 11px bordered pill right; opens cmdk palette on Enter/⌘K.
- CodeBlock: dark bg-foreground rounded-lg, mono 13px/1.6 light text, header bar with filename + copy button; inline code: mono 13px bg violet-50 text-primary rounded px-1.5 py-0.5.
- LegacyModernCompare: two mono columns with orange/violet dot headers — the reusable signature card.
- FrameworkBadge: 11px mono pill, `.NET 8` violet-tint, `.NET Framework 4.8` orange-tint.
- ProgressMeter: h-1.5 rounded-full bg-secondary, primary fill, mono % label.
- EmptyPanel: dashed 1.5px border-border rounded-2xl, centered 48px violet icon tile, 16px/700 label, 14px muted line, primary button.
- StatusStrip: 28px bg-foreground, mono 11px muted light text, live dot in primary.

## Typography and spacing
Inter everywhere (400/500/600/700), JetBrains Mono only for code, badges and the status strip. Scale: hero 64px/700/-0.03em; page H1 32px/700/-0.02em; section H2 20px/700; card title 16px/600; body 16px/400/1.7 (docs) and 14px/1.5 (UI); UI labels 14px/500; micro-labels 11px/600 uppercase tracking 0.08em text-muted-foreground; mono 13px/1.6. Spacing: 8px base grid — 8/12/16/24/32/48; card padding 24px; section rhythm 48px; sidebar rows 32–36px; top bar 56px; buttons/inputs h-9 (36px). Radii: controls 10px, cards 14px, code blocks 12px, avatar/logo tile 10px. Borders 1px border-border; shadows soft and violet-tinted, never harsh hairlines alone. Breakpoints: 1280 / 1024 / 640.

## Imagery
No stock photography — this is an internal developer tool; the code comparison card, real doc content and framework badges are the visual assets. All code snippets are drawn in JetBrains Mono on dark blocks; the landing glow/grid wash is pure CSS (radial violet gradient + repeating-linear-gradient grid at low opacity).
- No selected image assets.

## Accessibility and states
- Verify violet primary on white passes 4.5:1 for button text and link text before release.
- Focus states: 2px ring-primary offset 2px on every interactive element; never remove outlines.
- Sidebar collapse toggle exposes aria-expanded and aria-controls; collapsed rail rows get aria-labels.
- System group collapsibles are keyboard-operable (Enter/Space) and announce expanded state; plus buttons are reachable via Tab, not hover-only (visible on focus-within).
- Code blocks: language marked, copy button labeled; orange/violet dots always paired with text labels, never color alone.
- Search palette traps focus, closes on Esc, returns focus to the trigger.
- Respect prefers-reduced-motion: collapse/expand and card fade-ins become instant.

## Avoid
- No warm-cream/paper canvas — the redesign replaces it with pure white and light neutral gray.
- No serif or display fonts; Inter only, JetBrains Mono strictly for code.
- No dark app shell — dark surfaces are only code blocks and the 28px status strip.
- No green/emerald remnants from the base theme; violet is the sole brand color plus the orange legacy dot.
- No harsh flat hairline-only cards; borders always pair with soft shadows.
- No emoji icons; lucide-react only.
- No mock API — projects, docs and onboarding checklists read/write real FastAPI endpoints backed by MongoDB.

## Build order
- Apply violet palette tokens and Inter/JetBrains Mono font loading; lock CSS variables.
- Build app shell: Sidebar (collapsible 260↔56px, zustand state), TopBar with cmdk search palette, StatusStrip; route guard redirecting unauthenticated users to /login.
- Shared components: Button, Card, SystemGroup, FrameworkBadge, CodeBlock, LegacyModernCompare, ProgressMeter, EmptyPanel.
- Backend: FastAPI models + MongoDB collections for users, projects (name, system: legacy|modern, framework, description), docs (projectId, section, title, body markdown, updatedAt), onboardingSteps (userId, projectId, done); seed clearly-labeled demo data: 2 legacy + 3 modern projects with real-sounding docs (e.g. "Atlas.Core — layered architecture", "Validation pipeline rules").
- Login screen with SSO-style sign-in flow against /api/auth.
- Dashboard: welcome card, project grid from GET /api/projects, create-project dialog POSTing to /api/projects, empty state.
- Project detail: tabs, doc list, onboarding checklist with PATCH /api/onboarding/:id; doc reader with markdown rendering, TOC scroll-spy, GET /api/projects/:id/docs/:docId.
- Search palette wired to GET /api/search?q= across projects and docs.

## References studied
- cursor
- supabase
