import { useState, type FormEvent } from "react";
import { FolderGit2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input, Label } from "@/components/ui/input";

export function GithubIngest({ busy, onSubmit }: { busy: boolean; onSubmit: (body: { repo: string; ref?: string; path?: string }) => void }) {
  const [repo, setRepo] = useState("");
  const [ref, setRef] = useState("");
  const [path, setPath] = useState("");
  const submit = (e: FormEvent) => {
    e.preventDefault();
    onSubmit({ repo: repo.trim(), ref: ref.trim() || undefined, path: path.trim() || undefined });
  };
  return (
    <form onSubmit={submit} className="space-y-4">
      <div>
        <Label htmlFor="gh-repo">Repository</Label>
        <Input id="gh-repo" required value={repo} onChange={(e) => setRepo(e.target.value)} placeholder="owner/repo or https://github.com/owner/repo/tree/main/src" className="font-mono" />
        <p className="mt-1 text-[12px] text-muted-foreground">Public repos need no credentials. Private repos need GITHUB_TOKEN set on the backend.</p>
      </div>
      <div className="grid gap-4 sm:grid-cols-2">
        <div><Label htmlFor="gh-ref">Branch or tag (optional)</Label><Input id="gh-ref" value={ref} onChange={(e) => setRef(e.target.value)} placeholder="default branch" /></div>
        <div><Label htmlFor="gh-path">Folder (optional)</Label><Input id="gh-path" value={path} onChange={(e) => setPath(e.target.value)} placeholder="src" /></div>
      </div>
      <Button type="submit" loading={busy} disabled={!repo.trim()}><FolderGit2 /> Read from GitHub</Button>
    </form>
  );
}
