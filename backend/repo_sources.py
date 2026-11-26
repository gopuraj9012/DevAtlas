"""More ways to read a codebase for /api/ingest/*: a zip archive, Bitbucket, or any Git URL.

Every source ends in the same `[{path, content}]` list that `analyze_upload`
already understands, so analysis and persistence stay shared with the folder
upload and the GitHub reader.

Safety:
- Zip archives are read in memory (nothing is extracted to disk), with caps on
  entry count, per-file size and total uncompressed size (zip-bomb guard).
- Git clones are https only (`GIT_ALLOW_PROTOCOL=https`), shallow, never prompt
  for credentials, time out, and land in a temp folder that is always removed.
  `GIT_ALLOWED_HOSTS` (comma separated) restricts which hosts may be cloned.
- Credentials come from the backend environment only and travel as an HTTP
  header, never in the URL, the response or the logs.
"""
from __future__ import annotations

import asyncio
import base64
import io
import os
import re
import shutil
import subprocess
import tempfile
import zipfile
from pathlib import Path
from urllib.parse import urlparse

from ingest import MAX_CHARS, MAX_FILE_BYTES, MAX_FILES, is_candidate

MAX_ARCHIVE_BYTES = 25 * 1024 * 1024          # uploaded zip
MAX_ARCHIVE_ENTRIES = 20_000
MAX_UNCOMPRESSED = 60 * 1024 * 1024            # sum of candidate files we read
CLONE_TIMEOUT = 120                            # seconds
REF_RX = re.compile(r"^[\w./-]{1,200}$")


class SourceError(Exception):
    def __init__(self, status: int, detail: str):
        super().__init__(detail)
        self.status = status
        self.detail = detail


# ---------------------------------------------------------------- zip

def _strip_common_root(paths: list[str]) -> str:
    """'MyRepo-main/src/x.cs' -> 'src/x.cs' when every entry shares one top folder."""
    tops = {p.split("/", 1)[0] for p in paths if "/" in p}
    if len(tops) == 1 and all("/" in p for p in paths):
        return tops.pop() + "/"
    return ""


def read_zip(data: bytes, filename: str = "upload.zip") -> tuple[list[dict], dict]:
    if not data:
        raise SourceError(400, "The uploaded file is empty.")
    if len(data) > MAX_ARCHIVE_BYTES:
        raise SourceError(413, f"Zip files are limited to {MAX_ARCHIVE_BYTES // (1024 * 1024)} MB. Zip a sub-folder instead.")
    try:
        zf = zipfile.ZipFile(io.BytesIO(data))
    except zipfile.BadZipFile:
        raise SourceError(400, "That file is not a valid .zip archive.")
    with zf:
        infos = [i for i in zf.infolist() if not i.is_dir()]
        if len(infos) > MAX_ARCHIVE_ENTRIES:
            raise SourceError(413, f"The archive has more than {MAX_ARCHIVE_ENTRIES:,} entries. Zip a sub-folder instead.")
        names = [i.filename.replace("\\", "/").lstrip("/") for i in infos]
        root = _strip_common_root(names)
        files, skipped, truncated, total, chars = [], 0, False, 0, 0
        for info, name in zip(infos, names):
            path = name[len(root):] if root and name.startswith(root) else name
            if not path or ".." in path.split("/") or not is_candidate(path):
                skipped += 1
                continue
            if info.flag_bits & 0x1:
                skipped += 1  # encrypted entry
                continue
            if info.file_size > MAX_FILE_BYTES:
                skipped += 1
                truncated = True
                continue
            if len(files) >= MAX_FILES or total + info.file_size > MAX_UNCOMPRESSED or chars > MAX_CHARS:
                truncated = True
                break
            with zf.open(info) as fh:
                raw = fh.read(MAX_FILE_BYTES + 1)  # never trust the declared size
            if len(raw) > MAX_FILE_BYTES:
                skipped += 1
                truncated = True
                continue
            text = raw.decode("utf-8", "replace")
            files.append({"path": path, "content": text})
            total += len(raw)
            chars += len(text)
    source = {"kind": "archive", "name": filename, "files_read": len(files), "files_skipped": skipped, "truncated": truncated}
    return files, source


# ---------------------------------------------------------------- git

def _allowed_hosts() -> set[str]:
    return {h.strip().lower() for h in os.environ.get("GIT_ALLOWED_HOSTS", "").split(",") if h.strip()}


def parse_git_url(url: str) -> tuple[str, str]:
    """Validate an https clone URL. Returns (clean url, host)."""
    s = (url or "").strip()
    if not s:
        raise SourceError(400, "Enter the repository's https clone URL.")
    p = urlparse(s)
    if p.scheme != "https":
        raise SourceError(400, "Only https:// clone URLs are supported (not ssh, git:// or file paths).")
    if not p.hostname:
        raise SourceError(400, "That does not look like a repository URL.")
    if p.username or p.password:
        raise SourceError(400, "Don't put credentials in the URL. Set GIT_HTTP_USERNAME and GIT_HTTP_TOKEN on the backend instead.")
    host = p.hostname.lower()
    allowed = _allowed_hosts()
    if allowed and host not in allowed:
        raise SourceError(403, f"{host} is not in GIT_ALLOWED_HOSTS on the backend.")
    clean = f"https://{p.netloc}{p.path}".rstrip("/")
    return clean, host


def parse_bitbucket(repo: str, ref: str | None, path: str | None) -> tuple[str, str, str, str | None, str]:
    """workspace/repo, a bitbucket.org URL, or a /src/<ref>/<folder> link.
    Returns (clone url, workspace, repo, ref, folder)."""
    s = (repo or "").strip()
    if not s:
        raise SourceError(400, "Enter a repository as workspace/repo or a bitbucket.org URL.")
    if "://" in s or s.startswith(("bitbucket.org", "www.bitbucket.org")):
        p = urlparse(s if "://" in s else f"https://{s}")
        host = (p.hostname or "").lower()
        if host not in {"bitbucket.org", "www.bitbucket.org"}:
            raise SourceError(400, f"Use the Git URL option for {host or 'that host'}. This option is for bitbucket.org (Cloud).")
        parts = [x for x in p.path.split("/") if x]
    else:
        parts = [x for x in s.split("/") if x]
    if len(parts) < 2:
        raise SourceError(400, "Enter a repository as workspace/repo.")
    workspace, name = parts[0], re.sub(r"\.git$", "", parts[1])
    if len(parts) > 3 and parts[2] == "src":
        ref = ref or parts[3]
        path = path or "/".join(parts[4:]) or None
    if not re.fullmatch(r"[\w.-]+", workspace) or not re.fullmatch(r"[\w.-]+", name):
        raise SourceError(400, "That does not look like a valid workspace/repo.")
    return f"https://bitbucket.org/{workspace}/{name}.git", workspace, name, ref, (path or "").strip("/")


def _auth_header(user: str | None, token: str | None) -> str | None:
    if not token:
        return None
    if user:
        return "Authorization: Basic " + base64.b64encode(f"{user}:{token}".encode()).decode()
    return f"Authorization: Bearer {token}"


def _clean_err(text: str) -> str:
    return re.sub(r"https://[^\s'\"]+", "<repository>", text).strip().splitlines()[-1][:200] if text.strip() else ""


def _clone(url: str, ref: str | None, dest: Path, header: str | None) -> None:
    env = {
        **os.environ,
        "GIT_TERMINAL_PROMPT": "0",
        "GCM_INTERACTIVE": "never",
        "GIT_ASKPASS": "",
        "SSH_ASKPASS": "",
        "GIT_ALLOW_PROTOCOL": "https",
        "GIT_CONFIG_NOSYSTEM": "1",
    }
    cmd = ["git", "-c", "credential.helper=", "-c", "core.longpaths=true", "-c", "core.symlinks=false", "-c", "protocol.file.allow=never"]
    if header:
        cmd += ["-c", f"http.extraHeader={header}"]
    cmd += ["clone", "--depth", "1", "--single-branch", "--no-tags", "--filter=blob:limit=400k"]
    if ref:
        cmd += ["--branch", ref]
    cmd += ["--", url, str(dest)]
    try:
        res = subprocess.run(cmd, env=env, capture_output=True, text=True, timeout=CLONE_TIMEOUT)
    except FileNotFoundError:
        raise SourceError(500, "git is not installed on the backend machine.")
    except subprocess.TimeoutExpired:
        raise SourceError(504, f"Cloning took longer than {CLONE_TIMEOUT} seconds. Try a folder of a smaller repository.")
    if res.returncode != 0:
        err = res.stderr.lower()
        if "could not read username" in err or "401" in err:
            # Most hosts answer a missing repository the same way as a private one
            raise SourceError(404, "Repository not found, or it is private. For private repositories set the token on the backend (see .env.example).")
        if "authentication failed" in err or "403" in err:
            raise SourceError(403, "The host rejected the backend credentials for this repository. Check the token in backend/.env.")
        if "remote branch" in err and "not found" in err:
            raise SourceError(404, f"Branch or tag '{ref}' not found.")
        if "not found" in err or "does not exist" in err or "404" in err:
            raise SourceError(404, "Repository not found. If it is private, set the token on the backend (see .env.example).")
        raise SourceError(502, f"git clone failed: {_clean_err(res.stderr) or 'unknown error'}")


def _head(dest: Path) -> str | None:
    try:
        out = subprocess.run(["git", "-C", str(dest), "rev-parse", "--abbrev-ref", "HEAD"], capture_output=True, text=True, timeout=10)
        return out.stdout.strip() or None
    except Exception:  # pragma: no cover
        return None


def read_tree(root: Path, folder: str | None = None) -> tuple[list[dict], int, bool]:
    """Read candidate text files under root (optionally a sub-folder). Returns (files, skipped, truncated)."""
    root = root.resolve()
    base = (root / folder).resolve() if folder else root
    if folder and (not base.is_dir() or root not in base.parents):
        raise SourceError(404, f"Folder '{folder}' not found in the repository.")
    files, skipped, truncated, chars = [], 0, False, 0
    for p in sorted(base.rglob("*")):
        # never follow symlinks: a repo could point one at a file outside the clone
        if p.is_symlink() or not p.is_file() or ".git" in p.relative_to(root).parts:
            continue
        rel = p.relative_to(root).as_posix()
        if not is_candidate(rel):
            skipped += 1
            continue
        size = p.stat().st_size
        if size > MAX_FILE_BYTES:
            skipped += 1
            truncated = True
            continue
        if len(files) >= MAX_FILES or chars + size > MAX_CHARS:
            truncated = True
            break
        text = p.read_bytes().decode("utf-8", "replace")
        files.append({"path": rel, "content": text})
        chars += len(text)
    # A folder import still needs the build props above it (they set TargetFramework centrally).
    parent = base
    while folder and parent != root:
        parent = parent.parent
        props = parent / "Directory.Build.props"
        if props.is_file() and not props.is_symlink() and props.stat().st_size <= MAX_FILE_BYTES:
            files.append({"path": props.relative_to(root).as_posix(), "content": props.read_text("utf-8", "replace")})
    return files, skipped, truncated


def _clone_and_read(url: str, ref: str | None, folder: str | None, header: str | None) -> tuple[list[dict], int, bool, str | None]:
    tmp = Path(tempfile.mkdtemp(prefix="devatlas-ingest-"))
    try:
        dest = tmp / "repo"
        _clone(url, ref, dest, header)
        files, skipped, truncated = read_tree(dest, folder or None)
        return files, skipped, truncated, ref or _head(dest)
    finally:
        shutil.rmtree(tmp, ignore_errors=True)


def _check_ref(ref: str | None) -> str | None:
    ref = (ref or "").strip() or None
    if ref and (not REF_RX.match(ref) or ref.startswith("-") or ".." in ref):
        raise SourceError(400, "That branch or tag name is not valid.")
    return ref


def _check_folder(path: str | None) -> str:
    folder = (path or "").strip().strip("/")
    if folder and (".." in folder.split("/") or folder.startswith(("/", "\\")) or ":" in folder):
        raise SourceError(400, "The folder must be a relative path inside the repository.")
    return folder


async def fetch_git_files(url: str, ref: str | None = None, path: str | None = None) -> tuple[list[dict], dict]:
    clean, host = parse_git_url(url)
    ref, folder = _check_ref(ref), _check_folder(path)
    header = _auth_header(os.environ.get("GIT_HTTP_USERNAME") or None, os.environ.get("GIT_HTTP_TOKEN") or None)
    files, skipped, truncated, used_ref = await asyncio.to_thread(_clone_and_read, clean, ref, folder, header)
    return files, {
        "kind": "git", "repo": clean, "host": host, "ref": used_ref, "path": folder or None, "url": clean,
        "files_read": len(files), "files_skipped": skipped, "truncated": truncated, "authenticated": header is not None,
    }


async def fetch_bitbucket_files(repo: str, ref: str | None = None, path: str | None = None) -> tuple[list[dict], dict]:
    clone, workspace, name, ref, folder = parse_bitbucket(repo, ref, path)
    ref, folder = _check_ref(ref), _check_folder(folder)
    user = os.environ.get("BITBUCKET_USERNAME") or None
    token = os.environ.get("BITBUCKET_APP_PASSWORD") or os.environ.get("BITBUCKET_TOKEN") or None
    header = _auth_header(user if os.environ.get("BITBUCKET_APP_PASSWORD") else ("x-token-auth" if token else None), token)
    files, skipped, truncated, used_ref = await asyncio.to_thread(_clone_and_read, clone, ref, folder, header)
    web = f"https://bitbucket.org/{workspace}/{name}" + (f"/src/{used_ref}/{folder}" if used_ref and folder else "")
    return files, {
        "kind": "bitbucket", "repo": f"{workspace}/{name}", "ref": used_ref, "path": folder or None, "url": web,
        "files_read": len(files), "files_skipped": skipped, "truncated": truncated, "authenticated": header is not None,
    }
