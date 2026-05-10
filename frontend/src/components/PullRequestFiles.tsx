import { useEffect, useMemo, useState } from "react";
import { Check, FileDiff, Search, X } from "lucide-react";

import { DiffViewer, type DiffComment } from "@/components/DiffViewer";
import { ResizableX } from "@/components/ResizableX";
import { Input } from "@/components/ui/input";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Separator } from "@/components/ui/separator";
import type { DiffResult } from "@/lib/git";
import { github, type PullRequestFile, type ReviewComment } from "@/lib/github";
import { cn } from "@/lib/utils";

interface Props {
  owner: string;
  repo: string;
  number: number;
  files: PullRequestFile[];
  reviewComments: ReviewComment[];
  commitId: string;
  onChange: () => void;
}

export function PullRequestFiles({
  owner,
  repo,
  number,
  files,
  reviewComments,
  commitId,
  onChange,
}: Props) {
  const [selected, setSelected] = useState<string | null>(files[0]?.filename ?? null);
  const [query, setQuery] = useState("");
  const [reads, setReads] = useState<Set<string>>(() => loadReadSet(owner, repo, number));

  useEffect(() => {
    if (!selected && files.length > 0) setSelected(files[0].filename);
    if (selected && !files.some((f) => f.filename === selected)) {
      setSelected(files[0]?.filename ?? null);
    }
  }, [files, selected]);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return files;
    return files.filter((f) => f.filename.toLowerCase().includes(q));
  }, [files, query]);

  const selectedFile = useMemo(
    () => files.find((f) => f.filename === selected) ?? null,
    [files, selected],
  );

  const diff = useMemo<DiffResult | null>(() => {
    if (!selectedFile) return null;
    return patchToDiffResult(selectedFile);
  }, [selectedFile]);

  const fileComments = useMemo<DiffComment[]>(() => {
    if (!selectedFile) return [];
    return reviewComments
      .filter((c) => c.path === selectedFile.filename && c.line != null)
      .map((c) => ({
        id: c.id,
        side: c.side === "LEFT" ? "LEFT" : "RIGHT",
        line: c.line!,
        author: c.author,
        avatarUrl: c.avatarUrl,
        createdAt: c.createdAt,
        body: c.body,
      }));
  }, [reviewComments, selectedFile]);

  function toggleRead(path: string) {
    setReads((prev) => {
      const next = new Set(prev);
      if (next.has(path)) next.delete(path);
      else next.add(path);
      saveReadSet(owner, repo, number, next);
      return next;
    });
  }

  if (files.length === 0) {
    return (
      <div className="flex flex-1 items-center justify-center text-[12px] text-muted-foreground">
        Nenhum arquivo modificado.
      </div>
    );
  }

  return (
    <>
      <ResizableX
        storageKey="stash:sidebar-width:pr-files"
        defaultWidth={320}
        min={220}
        max={560}
      >
        <div className="flex h-full w-full flex-col border-r border-border">
          <div className="flex h-12 shrink-0 items-center gap-2 px-3 text-sm font-semibold">
            <FileDiff className="size-4 text-muted-foreground" />
            <span>Arquivos</span>
            <span className="ml-auto font-mono text-[11px] text-muted-foreground">
              {reads.size}/{files.length}
            </span>
          </div>
          <Separator />

          <div className="shrink-0 px-2 py-1.5">
            <div className="relative flex items-center">
              <Search className="pointer-events-none absolute left-2 size-3 text-muted-foreground" />
              <Input
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Buscar arquivo…"
                className="h-7 pl-7 pr-7 text-[11px]"
              />
              {query && (
                <button
                  type="button"
                  onClick={() => setQuery("")}
                  className="absolute right-1 flex size-5 items-center justify-center text-muted-foreground hover:text-foreground"
                  aria-label="Limpar busca"
                >
                  <X className="size-3" />
                </button>
              )}
            </div>
          </div>
          <Separator />

          <ScrollArea className="flex-1">
            {filtered.length === 0 && (
              <div className="px-3 py-6 text-center text-xs text-muted-foreground">
                Nenhum arquivo corresponde a "{query}".
              </div>
            )}
            <ul>
              {filtered.map((f) => {
                const isRead = reads.has(f.filename);
                return (
                  <li key={f.filename}>
                    <button
                      onClick={() => setSelected(f.filename)}
                      className={cn(
                        "flex w-full items-center justify-between gap-2 border-b border-border/50 px-3 py-1.5 text-left text-xs transition-colors hover:bg-accent",
                        selected === f.filename && "bg-accent",
                        isRead && "opacity-50",
                      )}
                    >
                      <span className="flex min-w-0 flex-1 items-center gap-2" title={f.filename}>
                        <FileDiff className="size-3 shrink-0 text-muted-foreground" />
                        <span
                          className={cn(
                            "min-w-0 flex-1 truncate font-mono",
                            isRead && "line-through",
                          )}
                        >
                          {f.filename}
                        </span>
                      </span>
                      <span className="flex shrink-0 items-center gap-2 font-mono text-[10px] tabular-nums">
                        <span className="text-[color:var(--added)]">+{f.additions}</span>
                        <span className="text-[color:var(--deleted)]">−{f.deletions}</span>
                        <span className="rounded bg-muted px-1.5 py-0.5 text-[9px] uppercase text-muted-foreground">
                          {shortStatus(f.status)}
                        </span>
                        <span
                          role="button"
                          tabIndex={0}
                          onClick={(e) => {
                            e.stopPropagation();
                            toggleRead(f.filename);
                          }}
                          onKeyDown={(e) => {
                            if (e.key === "Enter" || e.key === " ") {
                              e.preventDefault();
                              e.stopPropagation();
                              toggleRead(f.filename);
                            }
                          }}
                          className={cn(
                            "flex size-4 items-center justify-center border transition-colors",
                            isRead
                              ? "border-[color:var(--added)]/40 bg-[color:var(--added)]/10 text-[color:var(--added)]"
                              : "border-border text-muted-foreground hover:text-foreground",
                          )}
                          title={isRead ? "Marcar como não lido" : "Marcar como lido"}
                        >
                          <Check className="size-2.5" />
                        </span>
                      </span>
                    </button>
                  </li>
                );
              })}
            </ul>
          </ScrollArea>
        </div>
      </ResizableX>
      <div className="flex flex-1 overflow-hidden">
        <DiffViewer
          diff={diff}
          loading={false}
          comments={fileComments}
          commentsEnabled={!!selectedFile}
          marked={!!selectedFile && reads.has(selectedFile.filename)}
          onToggleMark={
            selectedFile ? () => toggleRead(selectedFile.filename) : undefined
          }
          onCreateComment={async ({ line, side, body }) => {
            if (!selectedFile) return;
            await github.createReviewComment(
              owner,
              repo,
              number,
              commitId,
              selectedFile.filename,
              line,
              side,
              body,
            );
            onChange();
          }}
        />
      </div>
    </>
  );
}

function shortStatus(s: string): string {
  if (s === "added") return "add";
  if (s === "removed") return "del";
  if (s === "modified") return "mod";
  if (s === "renamed") return "ren";
  if (s === "copied") return "cpy";
  return s.slice(0, 3);
}

function patchToDiffResult(file: PullRequestFile): DiffResult {
  const status = file.status === "added" ? "added" : file.status === "removed" ? "deleted" : "modified";
  if (!file.patch) {
    return {
      path: file.filename,
      oldText: "",
      newText: "",
      status,
      isBinary: true,
    };
  }
  const oldLines: string[] = [];
  const newLines: string[] = [];
  for (const raw of file.patch.split("\n")) {
    if (raw.startsWith("@@")) {
      const marker = raw;
      oldLines.push(marker);
      newLines.push(marker);
      continue;
    }
    if (raw.startsWith("+++") || raw.startsWith("---")) continue;
    if (raw.startsWith("+")) {
      newLines.push(raw.slice(1));
    } else if (raw.startsWith("-")) {
      oldLines.push(raw.slice(1));
    } else if (raw.startsWith("\\")) {
      continue;
    } else {
      const text = raw.startsWith(" ") ? raw.slice(1) : raw;
      oldLines.push(text);
      newLines.push(text);
    }
  }
  return {
    path: file.filename,
    oldText: oldLines.join("\n"),
    newText: newLines.join("\n"),
    status,
    isBinary: false,
  };
}

function readKey(owner: string, repo: string, number: number): string {
  return `stash:pr-read:${owner}/${repo}#${number}`;
}

function loadReadSet(owner: string, repo: string, number: number): Set<string> {
  try {
    const raw = localStorage.getItem(readKey(owner, repo, number));
    if (!raw) return new Set();
    const parsed = JSON.parse(raw);
    if (Array.isArray(parsed)) return new Set(parsed);
  } catch {
    // ignore
  }
  return new Set();
}

function saveReadSet(owner: string, repo: string, number: number, set: Set<string>) {
  try {
    localStorage.setItem(readKey(owner, repo, number), JSON.stringify(Array.from(set)));
  } catch {
    // ignore
  }
}
