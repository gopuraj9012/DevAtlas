"""Markdown subset <-> article blocks.

The article body is stored as structured blocks (never raw HTML) plus the
markdown it came from, so the editor can round-trip it. Supported subset:

    ## Heading                     -> h2
    - item / 1. item               -> ul / ol
    ```lang filename ... ```       -> code
    > [info|warn|danger] Title     -> callout (following "> " lines are the text)
    | a | b | + |---| + rows       -> table
    :::figure Caption              -> figure, one "A | B | C" line of nodes, closed by :::
    :::compare Title               -> compare, optional note line, two fences, closed by :::
    anything else                  -> p (consecutive lines are joined)

The frontend has the same parser in `src/lib/markdown.ts`; keep them in step.
"""
from __future__ import annotations

import re

TONES = {"info", "warn", "danger"}


def _fence_header(line: str) -> tuple[str, str]:
    rest = line.strip()[3:].strip()
    parts = rest.split(None, 1)
    lang = parts[0] if parts else "text"
    filename = parts[1].strip() if len(parts) > 1 else ""
    return lang, filename


def _read_fence(lines: list[str], i: int) -> tuple[dict, int]:
    lang, filename = _fence_header(lines[i])
    i += 1
    body: list[str] = []
    while i < len(lines) and not lines[i].strip().startswith("```"):
        body.append(lines[i])
        i += 1
    return {"lang": lang, "filename": filename, "code": "\n".join(body)}, i + 1


def _split_row(line: str) -> list[str]:
    s = line.strip()
    if s.startswith("|"):
        s = s[1:]
    if s.endswith("|"):
        s = s[:-1]
    return [c.strip() for c in s.split("|")]


def md_to_blocks(md: str) -> list[dict]:
    lines = (md or "").replace("\r\n", "\n").split("\n")
    blocks: list[dict] = []
    para: list[str] = []
    i = 0

    def flush() -> None:
        if para:
            blocks.append({"type": "p", "text": " ".join(s.strip() for s in para)})
            para.clear()

    while i < len(lines):
        line = lines[i]
        s = line.strip()
        if not s:
            flush()
            i += 1
            continue
        if s.startswith("## "):
            flush()
            blocks.append({"type": "h2", "text": s[3:].strip()})
            i += 1
            continue
        if s.startswith("```"):
            flush()
            fence, i = _read_fence(lines, i)
            blocks.append({"type": "code", **fence})
            continue
        if s.startswith(":::figure"):
            flush()
            caption = s[len(":::figure"):].strip()
            nodes: list[str] = []
            i += 1
            while i < len(lines) and lines[i].strip() != ":::":
                if lines[i].strip():
                    nodes.extend(n.strip() for n in lines[i].split("|") if n.strip())
                i += 1
            blocks.append({"type": "figure", "caption": caption, "nodes": nodes})
            i += 1
            continue
        if s.startswith(":::compare"):
            flush()
            title = s[len(":::compare"):].strip()
            note_lines: list[str] = []
            fences: list[dict] = []
            i += 1
            while i < len(lines) and lines[i].strip() != ":::":
                if lines[i].strip().startswith("```"):
                    fence, i = _read_fence(lines, i)
                    fences.append(fence)
                    continue
                if lines[i].strip():
                    note_lines.append(lines[i].strip())
                i += 1
            i += 1
            empty = {"lang": "csharp", "filename": "", "code": ""}
            block = {
                "type": "compare",
                "title": title,
                "legacy": fences[0] if fences else empty,
                "modern": fences[1] if len(fences) > 1 else empty,
            }
            if note_lines:
                block["note"] = " ".join(note_lines)
            blocks.append(block)
            continue
        if s.startswith(">"):
            flush()
            head = s[1:].strip()
            m = re.match(r"\[(\w+)\]\s*(.*)", head)
            tone, title = ("info", head)
            if m and m.group(1) in TONES:
                tone, title = m.group(1), m.group(2)
            text: list[str] = []
            i += 1
            while i < len(lines) and lines[i].strip().startswith(">"):
                text.append(lines[i].strip()[1:].strip())
                i += 1
            blocks.append({"type": "callout", "tone": tone, "title": title, "text": " ".join(text)})
            continue
        if s.startswith("|"):
            flush()
            rows: list[list[str]] = []
            while i < len(lines) and lines[i].strip().startswith("|"):
                rows.append(_split_row(lines[i]))
                i += 1
            columns = rows[0] if rows else []
            body = [r for r in rows[1:] if not all(re.fullmatch(r":?-{2,}:?", c or "") for c in r)]
            blocks.append({"type": "table", "columns": columns, "rows": body})
            continue
        if re.match(r"^[-*] ", s):
            flush()
            items: list[str] = []
            while i < len(lines) and re.match(r"^[-*] ", lines[i].strip()):
                items.append(lines[i].strip()[2:].strip())
                i += 1
            blocks.append({"type": "ul", "items": items})
            continue
        if re.match(r"^\d+\. ", s):
            flush()
            items = []
            while i < len(lines) and re.match(r"^\d+\. ", lines[i].strip()):
                items.append(re.sub(r"^\d+\.\s+", "", lines[i].strip()))
                i += 1
            blocks.append({"type": "ol", "items": items})
            continue
        para.append(line)
        i += 1
    flush()
    return blocks


def _fence(c: dict) -> str:
    head = f"```{c.get('lang') or 'text'}"
    if c.get("filename"):
        head += f" {c['filename']}"
    return f"{head}\n{c.get('code', '')}\n```"


def blocks_to_md(blocks: list[dict]) -> str:
    out: list[str] = []
    for b in blocks or []:
        t = b.get("type")
        if t == "p":
            out.append(b.get("text", ""))
        elif t == "h2":
            out.append(f"## {b.get('text', '')}")
        elif t == "ul":
            out.append("\n".join(f"- {x}" for x in b.get("items", [])))
        elif t == "ol":
            out.append("\n".join(f"{n}. {x}" for n, x in enumerate(b.get("items", []), 1)))
        elif t == "code":
            out.append(_fence(b))
        elif t == "callout":
            out.append(f"> [{b.get('tone', 'info')}] {b.get('title', '')}\n> {b.get('text', '')}")
        elif t == "table":
            cols = b.get("columns", [])
            lines = ["| " + " | ".join(cols) + " |", "|" + "---|" * len(cols)]
            lines += ["| " + " | ".join(r) + " |" for r in b.get("rows", [])]
            out.append("\n".join(lines))
        elif t == "figure":
            out.append(f":::figure {b.get('caption', '')}\n" + " | ".join(b.get("nodes", [])) + "\n:::")
        elif t == "compare":
            parts = [f":::compare {b.get('title', '')}"]
            if b.get("note"):
                parts.append(b["note"])
            parts += [_fence(b.get("legacy", {})), _fence(b.get("modern", {})), ":::"]
            out.append("\n".join(parts))
    return "\n\n".join(out)


def read_minutes(blocks: list[dict]) -> int:
    words = 0
    for b in blocks:
        for key in ("text", "title", "note", "caption"):
            words += len(str(b.get(key, "")).split())
        for item in b.get("items", []):
            words += len(item.split())
        for key in ("code",):
            words += len(str(b.get(key, "")).split()) // 2
    return max(1, round(words / 200))
