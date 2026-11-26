import { useState, type FormEvent } from "react";
import { FolderGit2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input, Label } from "@/components/ui/input";

export type RepoProvider = "github" | "bitbucket" | "git";

const COPY: Record<RepoProvider, { label: string; placeholder: string; hint: string; button: string }> = {
  github: {
    label: "Repository",
    placeholder: "owner/repo or https://github.com/owner/repo/tree/main/src",
    hint: "Public repos need no credentials. Private repos need GITHUB_TOKEN set on the backend.",
    button: "Read from GitHub",
  },
  bitbucket: {
    label: "Repository",
    placeholder: "workspace/repo or https://bitbucket.org/workspace/repo/src/main/src",
    hint: "Bitbucket Cloud. Private repos need BITBUCKET_USERNAME + BITBUCKET_APP_PASSWORD (or BITBUCKET_TOKEN) on the backend. For Bitbucket Server, use Git URL.",
    button: "Read from Bitbucket",
  },
  git: {
    label: "HTTPS clone URL",
    placeholder: "https://gitlab.com/team/app.git or https://dev.azure.com/org/project/_git/repo",
    hint: "Any Git host over https: GitLab, Azure DevOps, Bitbucket Server, self-hosted. Private repos need GIT_HTTP_TOKEN (and GIT_HTTP_USERNAME for Basic auth) on the backend. Never paste credentials into the URL.",
    button: "Clone and read",
  },
};

/** Repository import form shared by GitHub, Bitbucket and any-Git-URL sources. */
export function RepoIngest({ provider, busy, onSubmit }: { provider: RepoProvider; busy: boolean; onSubmit: (body: { repo: string; ref?: string; path?: string }) => void }) {
  const [repo, setRepo] = useState("");
  const [ref, setRef] = useState("");
  const [path, setPath] = useState("");
  const c = COPY[provider];
  const submit = (e: FormEvent) => {
    e.preventDefault();
    onSubmit({ repo: repo.trim(), ref: ref.trim() || undefined, path: path.trim() || undefined });
  };
  return (
    <form onSubmit={submit} className="space-y-4">
      <div>
        <Label htmlFor={`${provider}-repo`}>{c.label}</Label>
        <Input id={`${provider}-repo`} required value={repo} onChange={(e) => setRepo(e.target.value)} placeholder={c.placeholder} className="font-mono" autoComplete="off" spellCheck={false} />
        <p className="mt-1 text-[12px] text-muted-foreground">{c.hint}</p>
      </div>
      <div className="grid gap-4 sm:grid-cols-2">
        <div><Label htmlFor={`${provider}-ref`}>Branch or tag (optional)</Label><Input id={`${provider}-ref`} value={ref} onChange={(e) => setRef(e.target.value)} placeholder="default branch" /></div>
        <div><Label htmlFor={`${provider}-path`}>Folder (optional)</Label><Input id={`${provider}-path`} value={path} onChange={(e) => setPath(e.target.value)} placeholder="src" /></div>
      </div>
      <Button type="submit" loading={busy} disabled={!repo.trim()}><FolderGit2 /> {busy ? "Reading the repository…" : c.button}</Button>
    </form>
  );
}
