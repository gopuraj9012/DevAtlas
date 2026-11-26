import { API_URL } from "@/config";

/* ------------------------------------------------------------------ client */

const TOKEN_KEY = "devatlas-token";

export function getToken(): string | null {
  return localStorage.getItem(TOKEN_KEY);
}
export function setToken(token: string | null) {
  if (token) localStorage.setItem(TOKEN_KEY, token);
  else localStorage.removeItem(TOKEN_KEY);
}

export class ApiError extends Error {
  status: number;
  detail: string;
  constructor(status: number, detail: string) {
    super(detail);
    this.status = status;
    this.detail = detail;
  }
}

type ApiOptions = { method?: "GET" | "POST" | "PUT" | "DELETE"; body?: unknown; signal?: AbortSignal };

function describe(detail: unknown, status: number): string {
  if (typeof detail === "string") return detail;
  if (Array.isArray(detail) && detail.length) {
    const first = detail[0] as { loc?: unknown[]; msg?: string };
    const field = Array.isArray(first.loc) ? first.loc[first.loc.length - 1] : "";
    return `${field ? `${String(field)}: ` : ""}${first.msg ?? "Invalid input"}`;
  }
  return `Request failed (${status})`;
}

export async function api<T>(path: string, opts: ApiOptions = {}): Promise<T> {
  const headers: Record<string, string> = { Accept: "application/json" };
  const token = getToken();
  if (token) headers.Authorization = `Bearer ${token}`;
  const isForm = opts.body instanceof FormData;
  if (opts.body !== undefined && !isForm) headers["Content-Type"] = "application/json";
  let res: Response;
  try {
    res = await fetch(`${API_URL}/api${path}`, {
      method: opts.method ?? (opts.body !== undefined ? "POST" : "GET"),
      headers,
      body: opts.body === undefined ? undefined : isForm ? (opts.body as FormData) : JSON.stringify(opts.body),
      signal: opts.signal,
    });
  } catch {
    throw new ApiError(0, "Can't reach the DevAtlas API. Is the backend running?");
  }
  const text = await res.text();
  const data = text ? safeJson(text) : null;
  if (!res.ok) {
    if (res.status === 401 && token) window.dispatchEvent(new Event("devatlas:unauthorized"));
    throw new ApiError(res.status, describe((data as { detail?: unknown } | null)?.detail, res.status));
  }
  return data as T;
}

function safeJson(text: string): unknown {
  try {
    return JSON.parse(text);
  } catch {
    return text;
  }
}

/** File download that needs the bearer token in a header. */
export async function download(path: string, fallbackName: string) {
  const token = getToken();
  const res = await fetch(`${API_URL}/api${path}`, { headers: token ? { Authorization: `Bearer ${token}` } : {} });
  if (!res.ok) {
    const data = safeJson(await res.text()) as { detail?: string } | string;
    throw new ApiError(res.status, typeof data === "string" ? data : data?.detail ?? "Download failed");
  }
  const disposition = res.headers.get("Content-Disposition") ?? "";
  const name = /filename="?([^";]+)"?/.exec(disposition)?.[1] ?? fallbackName;
  const url = URL.createObjectURL(await res.blob());
  const a = document.createElement("a");
  a.href = url;
  a.download = name;
  a.click();
  URL.revokeObjectURL(url);
}

/* ------------------------------------------------------------------ shapes (contracts.md) */

export type System = "legacy" | "modern";
export type Scope = System | "both";
export type Role = "engineer" | "maintainer" | "owner";
export type Origin = "SEED" | "TEAM" | "IMPORTED";

export interface User { id: string; email: string; name: string; role: Role }
export interface AuthResponse { token: string; user: User }

export interface CodeSample { filename: string; lang: string; code: string }

export type Block =
  | { type: "p"; text: string }
  | { type: "h2"; text: string }
  | { type: "ul"; items: string[] }
  | { type: "ol"; items: string[] }
  | { type: "code"; lang: string; filename: string; code: string }
  | { type: "callout"; tone: "info" | "warn" | "danger"; title: string; text: string }
  | { type: "table"; columns: string[]; rows: string[][] }
  | { type: "figure"; caption: string; nodes: string[] }
  | { type: "compare"; title: string; note?: string; legacy: CodeSample; modern: CodeSample };

export interface ArticleSummary {
  id: string; slug: string; doc_id: string; title: string; section: string; system: Scope;
  summary: string; tags: string[]; order: number; project?: string; origin: Origin;
  read_minutes: number; edited_by?: string; updated?: string; created_at?: string;
}
export interface NavLink { slug: string; title: string; doc_id?: string; system?: Scope }
export interface ArticleDetail extends ArticleSummary {
  blocks: Block[]; source_md: string; prev: NavLink | null; next: NavLink | null; sidebar: NavLink[];
}

export interface SystemInfo { key: System; label: string; framework: string; summary: string; projects: number; articles: number }
export interface Overview {
  systems: SystemInfo[];
  start_here: ArticleSummary[];
  counts: { articles: number; terms: number; rules: number; validation: number; steps: number; projects: number };
}

export interface GlossaryEntry {
  id: string; term: string; system: Scope; definition: string;
  legacy_definition?: string | null; modern_definition?: string | null; see_also: string[]; origin: Origin;
}

export interface RuleEntry {
  id: string; rule_id: string; category: "coding" | "validation"; topic?: string; system: Scope;
  title: string; rationale?: string | null; good?: string | null; bad?: string | null; enforced: boolean; origin: Origin;
}

export interface PathStep { id: string; step: number; title: string; detail: string; article: string; system: Scope }
export interface Progress { user_id: string; steps: number[]; articles: string[] }

export interface ChecklistProgress { done: string[]; completed: number; total: number; percent: number }
export interface Project {
  id: string; slug: string; name: string; system: System; framework: string; description: string;
  stack: string[]; repo: string; owner: string; origin: Origin; doc_count: number; checklist: ChecklistProgress;
}
export interface TeamMember {
  id: string; name: string; title: string; role: Role; systems: System[]; owns: string[]; ask_about: string; email: string;
}
export interface ProjectDetail extends Omit<Project, "doc_count" | "checklist"> {
  docs: ArticleSummary[]; owner_profile: TeamMember | null;
}

export interface ChecklistStep {
  key: string; title: string; detail: string; est: string; verify: string; command: string | null;
  links: { label: string; to: string }[]; docs: { slug: string; title: string }[]; done: boolean;
}
export interface ChecklistPhase { key: string; title: string; steps: ChecklistStep[]; completed: number; total: number }
export interface Checklist {
  project: Pick<Project, "slug" | "name" | "system" | "framework" | "repo" | "stack">;
  phases: ChecklistPhase[]; progress: ChecklistProgress;
}

export type Tier = "shape" | "policy" | "invariant";
export type Severity = "error" | "warn" | "info";
export interface ValidationRule {
  id: string; rule_id: string; name: string; field: string; tier: Tier; system: Scope; constraint: string;
  pattern?: string | null; message?: string | null; severity: Severity; enforced: boolean; projects: string[];
  tags: string[]; notes?: string | null; version?: string; reviewed?: string; legacy_impl?: CodeSample; modern_impl?: CodeSample; origin: Origin;
}

export interface Category { key: string; label: string; count: number }

export interface LearnSnippet {
  id: string; code: string; rule: string; title: string; category: string; system: Scope;
  why_bad: string[]; instead: string; tags: string[]; bad: CodeSample; standard: CodeSample; origin: Origin;
}

export interface Translation {
  id: string; code: string; pattern: string; category: string; intent: string; effort: "S" | "M" | "L";
  risk: "low" | "medium" | "high"; tags: string[]; legacy: CodeSample; modern: CodeSample; steps: string[]; gotchas: string[]; origin: Origin;
}

export interface DeployStep { title: string; detail: string; command?: string; lang?: string; checkpoint?: string; warn?: string }
export interface DeployStage { key: string; label: string; steps: DeployStep[] }
export interface DeploymentFlow {
  id: string; slug: string; name: string; system: System; stack: string; cadence: string; duration: string;
  rollback_window: string; downtime: string; summary: string; stages: DeployStage[];
}
export interface Deployments { stages: { key: string; label: string }[]; flows: DeploymentFlow[] }

export type ContractKind = "table" | "view" | "endpoint" | "soap" | "event" | "file";
export type ContractStatus = "stable" | "draft" | "deprecated";
export type Direction = "legacy_to_modern" | "modern_to_legacy" | "bidirectional";
export interface ContractField { name: string; type: string; required: boolean; notes: string }
export interface DataContract {
  id: string; code: string; name: string; kind: ContractKind; direction: Direction; owner: string; owner_system: Scope;
  status: ContractStatus; version: string; updated: string; summary: string; producers: string[]; consumers: string[];
  fields: ContractField[]; rules: string[]; legacy: CodeSample; modern: CodeSample;
  changes: { version: string; date: string; summary: string; breaking: boolean }[]; origin: Origin;
}
export interface ContractsMeta {
  kinds: Category[]; statuses: { key: ContractStatus; count: number }[];
  directions: { key: Direction; label: string }[]; policy: { title: string; detail: string }[]; total: number;
}
export type Risk = "high" | "medium" | "low";
export interface GraphConsumer { name: string; system: System | "unknown"; slug: string | null }
export interface GraphInterface {
  code: string; name: string; kind: ContractKind; kind_label: string; status: ContractStatus; version: string; owner: string;
  direction: Direction; owner_system: Scope; producers: string[]; legacy_producers: string[]; consumers: GraphConsumer[];
  modern_consumers: number; legacy_consumers: number; unknown_consumers: number; breaking_changes: number; risk: Risk; updated: string;
}
export interface ImpactGraph {
  interfaces: GraphInterface[];
  services: { name: string; system: System | "unknown"; slug: string | null; interfaces: string[] }[];
  edges: { from: string; to: string; system: System | "unknown"; risk: Risk; breaking: boolean }[];
  summary: { interfaces: number; services: number; modern_services: number; unclassified_services: number; edges: number; high_risk: number; breaking_changes: number; sql: number; soap: number };
}

export interface Procedure {
  project_slug: string; name: string; purpose: string; criticality: "critical" | "high" | "medium";
  status: "rewritten" | "partial" | "not-started"; called_by: string[]; tables: string[]; contract: string;
  parameters: { name: string; type: string; direction: string }[]; returns: string; legacy_lang: string; legacy_code: string;
  modern: { service: string; entry: string; flow: string; note: string; lang: string; code: string }; notes: string[];
}
export interface Procedures {
  project: { slug: string; name: string; system: System }; procedures: Procedure[]; note: string;
  summary: { total: number; critical: number; rewritten: number; partial: number; not_started: number; coverage_percent: number };
}

export type SearchType = "article" | "rule" | "validation" | "snippet" | "translation" | "contract" | "deployment" | "term" | "project";
export interface SearchHit { type: SearchType; label: string; hint: string; slug: string; system: Scope | null; excerpt: string; score: number }
export interface SearchResponse { query: string; took_ms: number; count: number; total: number; facets: Category[]; results: SearchHit[] }

export type FeedbackStatus = "open" | "triaged" | "accepted" | "declined";
export interface FeedbackItem {
  id: string; kind: "outdated" | "improvement"; target_type: "standard" | "architecture"; target_ref: string; target_label: string;
  category?: string | null; message: string; severity?: string | null; status: FeedbackStatus; status_note?: string | null;
  vote_count: number; voted: boolean; author_name: string; author_email: string; created_at: string; triaged_by?: string;
}
export interface FeedbackMeta { total: number; statuses: { key: FeedbackStatus; count: number }[]; kinds: { key: string; count: number }[]; target_types: { key: string; count: number }[] }
export interface FeedbackTarget { ref: string; label: string; hint: string }
export interface FeedbackTargets { standards: FeedbackTarget[]; architecture: FeedbackTarget[] }

export interface CoverageRow { total: number; mapped: number; partial: number; not_started: number; percent: number }
export interface CoverageItem {
  name: string; area: "procedures" | "interfaces"; project_slug: string | null; project: string; status: Procedure["status"];
  status_label: string; weight: number; percent: number; contract: string; note: string; link: string;
}
export interface Coverage {
  overall: CoverageRow & { weighted: number }; by_area: (CoverageRow & { key: string; label: string })[];
  items: CoverageItem[]; remaining: CoverageItem[]; note: string;
}

export interface GraphService {
  key: string; name: string; kind: "ui" | "api" | "worker" | "gateway" | "boundary"; kind_label: string; column: number; row: number;
  stack: string; description: string; responsibilities: string[]; external: boolean;
}
export interface GraphEdge {
  from: string; to: string; from_name: string; to_name: string; channel: "endpoint" | "event"; async: boolean;
  labels: string[]; contract: string | null; contract_name: string | null; note: string; external: boolean;
}
export interface ServiceGraph {
  services: GraphService[]; edges: GraphEdge[]; libraries: { name: string; used_by: string[]; note: string }[];
  summary: { services: number; edges: number; sync: number; async: number; external: number; contracts: { code: string; name: string }[] };
  note: string;
}

export interface IngestFinding { key: string; label: string; count: number; examples: string[]; risk: boolean }
export interface IngestResult {
  stats: { files: number; source_files: number; lines: number; projects: number; solutions: string[]; by_extension: Record<string, number> };
  findings: IngestFinding[];
  projects: { slug: string; name: string; system: System; framework: string; stack: string[]; created: boolean }[];
  articles: { slug: string; title: string; doc_id: string; section: string; project: string; created: boolean }[];
  truncated: boolean;
  source?: {
    kind: "github" | "bitbucket" | "git" | "archive"; repo?: string; host?: string; name?: string; ref?: string | null; path?: string | null;
    url?: string; files_read: number; files_skipped: number; truncated: boolean; authenticated?: boolean;
  };
}
