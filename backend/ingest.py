"""Static analysis of an uploaded .NET codebase. Pure: no I/O, no Mongo.

Both import paths (folder upload and GitHub read) call `analyze_upload`, so
they can never drift apart. Output docs are tagged origin = "IMPORTED".
"""
from __future__ import annotations

import posixpath
import re
from collections import Counter

EXTENSIONS = {".cs", ".csproj", ".sln", ".config", ".json", ".cshtml", ".aspx", ".ascx", ".asax", ".sql", ".md", ".xml", ".vb", ".vbproj", ".props", ".targets"}
SKIP_DIRS = {"bin", "obj", "node_modules", "packages", ".git", ".vs", "dist", "build"}
MAX_FILE_BYTES = 400 * 1024
MAX_FILES = 6000
MAX_CHARS = 14_000_000

# key, label, regex, file glob suffixes, risk
DETECTORS = [
    ("webforms", "ASP.NET Web Forms pages", r"<%@\s*Page", (".aspx",), False),
    ("mvc5", "ASP.NET MVC 5 controllers", r"System\.Web\.Mvc", (".cs",), False),
    ("aspnetcore", "ASP.NET Core", r"WebApplication\.CreateBuilder|Microsoft\.AspNetCore", (".cs", ".csproj"), False),
    ("minimalapi", "Minimal API endpoints", r"\.Map(Get|Post|Put|Delete|Patch)\(", (".cs",), False),
    ("wcf", "WCF service contracts", r"\[ServiceContract\]|\[OperationContract\]", (".cs",), False),
    ("mediatr", "MediatR handlers", r"IRequestHandler<|MediatR", (".cs", ".csproj"), False),
    ("efcore", "EF Core", r"Microsoft\.EntityFrameworkCore|DbContext\b", (".cs", ".csproj"), False),
    ("ef6", "Entity Framework 6", r"System\.Data\.Entity\b", (".cs",), False),
    ("adonet", "ADO.NET (SqlCommand / SqlConnection)", r"\bSqlCommand\b|\bSqlConnection\b", (".cs",), False),
    ("storedproc", "Stored procedure calls", r"CommandType\.StoredProcedure|\busp_\w+", (".cs", ".sql"), False),
    ("formsauth", "Forms authentication", r"FormsAuthentication|<forms\s", (".cs", ".config"), False),
    ("jwt", "JWT bearer auth", r"AddJwtBearer|JwtSecurityToken", (".cs",), False),
    ("fluentvalidation", "FluentValidation", r"AbstractValidator<", (".cs",), False),
    ("httpcontext", "RISK · HttpContext.Current", r"HttpContext\.Current", (".cs",), True),
    ("viewstate", "RISK · ViewState coupling", r"\bViewState\[", (".cs",), True),
    ("blocking", "RISK · Blocking on async (.Result / .Wait())", r"\.Result\b(?!\s*=)|\.Wait\(\)|GetAwaiter\(\)\.GetResult\(\)", (".cs",), True),
    ("sqlconcat", "RISK · SQL built by string concatenation", r"\"\s*(SELECT|UPDATE|DELETE|INSERT)\b[^\"]*\"\s*\+", (".cs",), True),
    ("secrets", "RISK · Password in config", r"(?i)password\s*=\s*[^;\"<>\s]{3,}", (".config", ".json"), True),
]


def is_candidate(path: str) -> bool:
    parts = [p for p in path.replace("\\", "/").split("/") if p]
    if any(p.lower() in SKIP_DIRS for p in parts[:-1]):
        return False
    ext = posixpath.splitext(parts[-1].lower())[1] if parts else ""
    return ext in EXTENSIONS


def _framework(csproj: str, inherited: list[str] | None = None) -> tuple[str, str]:
    """Framework + system from the project file, falling back to Directory.Build.props
    files (nearest first) that SDK-style solutions use to set TargetFramework centrally."""
    for text in [csproj, *(inherited or [])]:
        found = _framework_in(text)
        if found:
            return found
    if re.search(r"<Project\s+Sdk=", csproj):
        return ".NET (SDK-style)", "modern"
    return "Unknown", "legacy"


def _build_props_chain(project_path: str, by_path: dict[str, str]) -> list[str]:
    folder = posixpath.dirname(project_path)
    chain = []
    while True:
        props = by_path.get(posixpath.join(folder, "Directory.Build.props").lower())
        if props:
            chain.append(props)
        if not folder:
            break
        folder = posixpath.dirname(folder)
    return chain


def _framework_in(text: str) -> tuple[str, str] | None:
    m = re.search(r"<TargetFrameworks?>([^<$]+)</TargetFrameworks?>", text)
    csproj = text
    if m:
        tfm = m.group(1).split(";")[0].strip()
        if tfm.startswith("net4"):
            v = tfm[3:]
            return f".NET Framework {v[0]}.{v[1:] or '0'}", "legacy"
        if tfm.startswith("netcoreapp"):
            return f".NET Core {tfm[10:]}", "modern"
        if tfm.startswith("netstandard"):
            return f".NET Standard {tfm[11:]}", "modern"
        m2 = re.match(r"net(\d+)(\.\d+)?", tfm)
        if m2:
            return f".NET {m2.group(1)}", "modern"
        return tfm, "modern"
    m = re.search(r"<TargetFrameworkVersion>v?([^<$]+)</TargetFrameworkVersion>", csproj)
    if m:
        return f".NET Framework {m.group(1)}", "legacy"
    return None


def _slug(name: str) -> str:
    return re.sub(r"[^a-z0-9]+", "-", name.lower()).strip("-")


def _refs(csproj: str) -> list[str]:
    pkgs = re.findall(r'<PackageReference\s+Include="([^"]+)"', csproj)
    pkgs += re.findall(r'<Reference\s+Include="([^",]+)', csproj)
    return sorted(set(pkgs))[:20]


def analyze_upload(files: list[dict]) -> dict:
    files = [f for f in files if isinstance(f, dict) and f.get("path") and isinstance(f.get("content"), str)]
    truncated = False
    kept, chars = [], 0
    for f in files:
        if not is_candidate(f["path"]):
            continue
        if len(f["content"].encode("utf-8", "ignore")) > MAX_FILE_BYTES:
            truncated = True
            continue
        if len(kept) >= MAX_FILES or chars + len(f["content"]) > MAX_CHARS:
            truncated = True
            break
        kept.append({"path": f["path"].replace("\\", "/"), "content": f["content"]})
        chars += len(f["content"])

    by_ext = Counter(posixpath.splitext(f["path"].lower())[1] for f in kept)
    solutions = sorted(posixpath.basename(f["path"]) for f in kept if f["path"].lower().endswith(".sln"))
    csprojs = [f for f in kept if f["path"].lower().endswith((".csproj", ".vbproj"))]
    props_by_path = {f["path"].lower(): f["content"] for f in kept if f["path"].lower().endswith("directory.build.props")}
    lines = sum(f["content"].count("\n") + 1 for f in kept)

    findings = []
    for key, label, pattern, exts, risk in DETECTORS:
        rx = re.compile(pattern)
        count, examples = 0, []
        for f in kept:
            if not f["path"].lower().endswith(exts):
                continue
            hits = len(rx.findall(f["content"]))
            if hits:
                count += hits
                if len(examples) < 5:
                    examples.append(f["path"])
        if count:
            findings.append({"key": key, "label": label, "count": count, "examples": examples, "risk": risk})
    findings.sort(key=lambda x: (not x["risk"], -x["count"]))

    projects, articles = [], []
    for proj in csprojs:
        name = posixpath.splitext(posixpath.basename(proj["path"]))[0]
        framework, system = _framework(proj["content"], _build_props_chain(proj["path"], props_by_path))
        folder = posixpath.dirname(proj["path"])
        members = [f for f in kept if posixpath.dirname(f["path"]).startswith(folder)] if folder else kept
        local = []
        for key, label, pattern, exts, risk in DETECTORS:
            rx = re.compile(pattern)
            n = sum(len(rx.findall(f["content"])) for f in members if f["path"].lower().endswith(exts))
            if n:
                local.append((label, n, risk))
        stack = [lbl for lbl, _, r in local if not r][:8]
        risks = [(lbl, n) for lbl, n, r in local if r]
        slug = _slug(name)
        projects.append({
            "slug": slug, "name": name, "system": system, "framework": framework,
            "description": f"Imported from {proj['path']}. {len(members)} analysable files.",
            "stack": stack, "repo": folder or "/", "owner": "Unassigned", "packages": _refs(proj["content"]),
        })
        arch_md = [f"Generated by DevAtlas from `{proj['path']}`. Review it before relying on it.", "", "## Detected stack", ""]
        arch_md += [f"- {lbl} ({n} matches)" for lbl, n, r in local if not r] or ["- Nothing recognisable detected."]
        if risks:
            arch_md += ["", "> [warn] Risk patterns found", "> " + "; ".join(f"{lbl.replace('RISK · ', '')} ({n})" for lbl, n in risks)]
        pk = _refs(proj["content"])
        if pk:
            arch_md += ["", "## References", ""] + [f"- `{p}`" for p in pk]
        setup_cmds = (
            f"nuget restore\nmsbuild {name}.csproj /p:Configuration=Debug" if system == "legacy" else f"dotnet restore\ndotnet build\ndotnet run --project {proj['path']}"
        )
        setup_md = [f"Generated setup notes for {name} ({framework}).", "", "## Build", "", f"```{'powershell' if system == 'legacy' else 'bash'} build", setup_cmds, "```"]
        articles.append({"slug": f"{slug}-architecture", "title": f"{name}: generated architecture notes", "section": "architecture", "system": system, "project": name,
                         "summary": f"Stack and risk signals detected in {name}.", "tags": ["imported", "architecture"], "source_md": "\n".join(arch_md)})
        articles.append({"slug": f"{slug}-setup", "title": f"{name}: generated setup", "section": "onboarding", "system": system, "project": name,
                         "summary": f"How to build {name} locally.", "tags": ["imported", "setup"], "source_md": "\n".join(setup_md)})

    if csprojs:
        scan_name = solutions[0].rsplit(".", 1)[0] if solutions else projects[0]["name"]
        scan = [f"Repository scan of {len(kept)} files across {len(csprojs)} projects.", "", "| Signal | Matches | Risk |", "|---|---|---|"]
        scan += [f"| {f['label']} | {f['count']} | {'yes' if f['risk'] else 'no'} |" for f in findings]
        systems = {p["system"] for p in projects}
        articles.append({"slug": f"{_slug(scan_name)}-repository-scan", "title": f"{scan_name}: repository scan", "section": "architecture",
                         "system": systems.pop() if len(systems) == 1 else "both", "project": projects[0]["name"],
                         "summary": "Signals and risk patterns found across the whole import.", "tags": ["imported", "scan"], "source_md": "\n".join(scan)})

    return {
        "stats": {"files": len(files), "source_files": len(kept), "lines": lines, "projects": len(csprojs), "solutions": solutions, "by_extension": dict(by_ext)},
        "findings": findings,
        "projects": projects,
        "articles": articles,
        "truncated": truncated,
    }
