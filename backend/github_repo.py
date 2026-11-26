"""Read a repository straight from GitHub for /api/ingest/github.

Public repos need no credentials: one tree call, then file text from
raw.githubusercontent.com. With GITHUB_TOKEN set, file text comes from the
contents API instead (private repos, higher rate limit).
"""
from __future__ import annotations

import asyncio
import base64
import os
import re
from urllib.parse import quote

import httpx

from ingest import MAX_CHARS, MAX_FILE_BYTES, is_candidate

MAX_REPO_FILES = 300
API = "https://api.github.com"
RAW = "https://raw.githubusercontent.com"


class GithubError(Exception):
    def __init__(self, status: int, detail: str):
        super().__init__(detail)
        self.status = status
        self.detail = detail


def parse_repo(repo: str, ref: str | None, path: str | None) -> tuple[str, str, str | None, str]:
    s = (repo or "").strip()
    if not s:
        raise GithubError(400, "Enter a repository as owner/repo or a GitHub URL.")
    m = re.match(r"^(?:https?://)?(?:www\.)?([^/]+)/(.+)$", s) if "://" in s or s.startswith(("github.com", "www.github.com")) else None
    if m:
        host, rest = m.group(1).lower(), m.group(2)
        if host != "github.com":
            raise GithubError(400, f"Only github.com repositories are supported, not {host}.")
        parts = [p for p in rest.split("/") if p]
    else:
        parts = [p for p in s.split("/") if p]
    if len(parts) < 2:
        raise GithubError(400, "Enter a repository as owner/repo.")
    owner, name = parts[0], re.sub(r"\.git$", "", parts[1])
    if len(parts) > 2:
        if parts[2] == "blob":
            raise GithubError(400, "That link points to a single file. Link to the repository or a folder instead.")
        if parts[2] == "tree" and len(parts) > 3:
            ref = ref or parts[3]
            path = path or "/".join(parts[4:]) or None
    if not re.fullmatch(r"[\w.-]+", owner) or not re.fullmatch(r"[\w.-]+", name):
        raise GithubError(400, "That does not look like a valid owner/repo.")
    return owner, name, ref, (path or "").strip("/")


def _headers(token: str | None) -> dict:
    h = {"Accept": "application/vnd.github+json", "User-Agent": "devatlas-ingest"}
    if token:
        h["Authorization"] = f"Bearer {token}"
    return h


def _raise_for(res: httpx.Response, what: str, token: str | None) -> None:
    if res.status_code == 200:
        return
    if res.status_code == 404:
        raise GithubError(404, f"{what} not found. If it is private, set GITHUB_TOKEN on the backend.")
    if res.status_code == 401 or (res.status_code == 403 and token and res.headers.get("x-ratelimit-remaining") != "0"):
        raise GithubError(403, "GitHub rejected the token in GITHUB_TOKEN.")
    if res.status_code in (403, 429):
        raise GithubError(429, "GitHub rate limit reached. Try again later or set GITHUB_TOKEN.")
    raise GithubError(502, f"GitHub returned an unexpected status {res.status_code}.")


async def fetch_repo_files(repo: str, ref: str | None = None, path: str | None = None) -> tuple[list[dict], dict]:
    owner, name, ref, folder = parse_repo(repo, ref, path)
    token = os.environ.get("GITHUB_TOKEN") or None
    async with httpx.AsyncClient(timeout=30, headers=_headers(token), follow_redirects=True) as client:
        if not ref:
            res = await client.get(f"{API}/repos/{owner}/{name}")
            _raise_for(res, "Repository", token)
            ref = res.json().get("default_branch", "main")
        res = await client.get(f"{API}/repos/{owner}/{name}/git/trees/{quote(ref, safe='')}", params={"recursive": "1"})
        _raise_for(res, "Branch or repository", token)
        tree = res.json()
        blobs = [t for t in tree.get("tree", []) if t.get("type") == "blob"]
        if folder:
            blobs = [b for b in blobs if b["path"] == folder or b["path"].startswith(folder + "/")]
            if not blobs:
                raise GithubError(404, f"Folder '{folder}' not found on {ref}.")
        candidates = [b for b in blobs if is_candidate(b["path"])]
        skipped = len(blobs) - len(candidates)
        truncated = bool(tree.get("truncated"))
        too_big = [b for b in candidates if b.get("size", 0) > MAX_FILE_BYTES]
        candidates = [b for b in candidates if b.get("size", 0) <= MAX_FILE_BYTES]
        if too_big:
            truncated = True
            skipped += len(too_big)
        if len(candidates) > MAX_REPO_FILES:
            truncated = True
            skipped += len(candidates) - MAX_REPO_FILES
            candidates = candidates[:MAX_REPO_FILES]
        sem = asyncio.Semaphore(12)

        async def get(b: dict) -> dict | None:
            async with sem:
                if token:
                    r = await client.get(f"{API}/repos/{owner}/{name}/contents/{quote(b['path'])}", params={"ref": ref})
                    if r.status_code != 200:
                        return None
                    body = r.json()
                    text = base64.b64decode(body.get("content", "")).decode("utf-8", "replace")
                else:
                    r = await client.get(f"{RAW}/{owner}/{name}/{quote(ref, safe='')}/{quote(b['path'])}")
                    if r.status_code != 200:
                        return None
                    text = r.text
                return {"path": b["path"], "content": text}

        results = await asyncio.gather(*(get(b) for b in candidates))
    files, chars = [], 0
    for f in results:
        if f is None:
            skipped += 1
            continue
        if chars + len(f["content"]) > MAX_CHARS:
            truncated = True
            break
        files.append(f)
        chars += len(f["content"])
    source = {
        "repo": f"{owner}/{name}", "ref": ref, "path": folder or None,
        "url": f"https://github.com/{owner}/{name}/tree/{ref}" + (f"/{folder}" if folder else ""),
        "files_read": len(files), "files_skipped": skipped, "truncated": truncated, "authenticated": bool(token),
    }
    return files, source
