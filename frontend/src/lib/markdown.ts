import type { Block, CodeSample } from "@/lib/api";

/* Markdown subset -> article blocks. Mirror of backend/md_blocks.py; keep them in step. */

const TONES = new Set(["info", "warn", "danger"]);

function fenceHeader(line: string): { lang: string; filename: string } {
  const rest = line.trim().slice(3).trim();
  const [lang, ...name] = rest.split(/\s+/);
  return { lang: lang || "text", filename: name.join(" ").trim() };
}

function readFence(lines: string[], i: number): [CodeSample, number] {
  const head = fenceHeader(lines[i]!);
  i += 1;
  const body: string[] = [];
  while (i < lines.length && !lines[i]!.trim().startsWith("```")) body.push(lines[i++]!);
  return [{ ...head, code: body.join("\n") }, i + 1];
}

function splitRow(line: string): string[] {
  let s = line.trim();
  if (s.startsWith("|")) s = s.slice(1);
  if (s.endsWith("|")) s = s.slice(0, -1);
  return s.split("|").map((c) => c.trim());
}

export function mdToBlocks(md: string): Block[] {
  const lines = (md ?? "").replace(/\r\n/g, "\n").split("\n");
  const blocks: Block[] = [];
  const para: string[] = [];
  const flush = () => {
    if (para.length) blocks.push({ type: "p", text: para.map((s) => s.trim()).join(" ") });
    para.length = 0;
  };
  let i = 0;
  while (i < lines.length) {
    const line = lines[i]!;
    const s = line.trim();
    if (!s) { flush(); i++; continue; }
    if (s.startsWith("## ")) { flush(); blocks.push({ type: "h2", text: s.slice(3).trim() }); i++; continue; }
    if (s.startsWith("```")) { flush(); const [f, n] = readFence(lines, i); blocks.push({ type: "code", ...f }); i = n; continue; }
    if (s.startsWith(":::figure")) {
      flush();
      const caption = s.slice(9).trim();
      const nodes: string[] = [];
      i++;
      while (i < lines.length && lines[i]!.trim() !== ":::") {
        if (lines[i]!.trim()) nodes.push(...lines[i]!.split("|").map((n) => n.trim()).filter(Boolean));
        i++;
      }
      blocks.push({ type: "figure", caption, nodes });
      i++;
      continue;
    }
    if (s.startsWith(":::compare")) {
      flush();
      const title = s.slice(10).trim();
      const note: string[] = [];
      const fences: CodeSample[] = [];
      i++;
      while (i < lines.length && lines[i]!.trim() !== ":::") {
        if (lines[i]!.trim().startsWith("```")) { const [f, n] = readFence(lines, i); fences.push(f); i = n; continue; }
        if (lines[i]!.trim()) note.push(lines[i]!.trim());
        i++;
      }
      i++;
      const empty = { lang: "csharp", filename: "", code: "" };
      const block: Block = { type: "compare", title, legacy: fences[0] ?? empty, modern: fences[1] ?? empty };
      if (note.length) block.note = note.join(" ");
      blocks.push(block);
      continue;
    }
    if (s.startsWith(">")) {
      flush();
      const head = s.slice(1).trim();
      const m = /^\[(\w+)\]\s*(.*)$/.exec(head);
      let tone: "info" | "warn" | "danger" = "info";
      let title = head;
      if (m && TONES.has(m[1]!)) { tone = m[1] as typeof tone; title = m[2]!; }
      const text: string[] = [];
      i++;
      while (i < lines.length && lines[i]!.trim().startsWith(">")) text.push(lines[i++]!.trim().slice(1).trim());
      blocks.push({ type: "callout", tone, title, text: text.join(" ") });
      continue;
    }
    if (s.startsWith("|")) {
      flush();
      const rows: string[][] = [];
      while (i < lines.length && lines[i]!.trim().startsWith("|")) rows.push(splitRow(lines[i++]!));
      const columns = rows[0] ?? [];
      const body = rows.slice(1).filter((r) => !r.every((c) => /^:?-{2,}:?$/.test(c)));
      blocks.push({ type: "table", columns, rows: body });
      continue;
    }
    if (/^[-*] /.test(s)) {
      flush();
      const items: string[] = [];
      while (i < lines.length && /^[-*] /.test(lines[i]!.trim())) items.push(lines[i++]!.trim().slice(2).trim());
      blocks.push({ type: "ul", items });
      continue;
    }
    if (/^\d+\. /.test(s)) {
      flush();
      const items: string[] = [];
      while (i < lines.length && /^\d+\. /.test(lines[i]!.trim())) items.push(lines[i++]!.trim().replace(/^\d+\.\s+/, ""));
      blocks.push({ type: "ol", items });
      continue;
    }
    para.push(line);
    i++;
  }
  flush();
  return blocks;
}

export function slugify(text: string): string {
  return text.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
}
