import { useMemo, useState } from "react";
import {
  Check,
  ChevronsUpDown,
  CloudUpload,
  GitBranch,
  GitMerge,
  GitPullRequest,
  Loader2,
  Plus,
  Search,
} from "lucide-react";

import { CreatePullRequestDialog } from "@/components/CreatePullRequestDialog";
import { DirtyTreeDialog, isDirtyTreeError } from "@/components/DirtyTreeDialog";
import { MenuItem, MenuLabel, MenuSeparator, PopoverMenu } from "@/components/PopoverMenu";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { extractErrorMessage } from "@/lib/git";
import { useRepo } from "@/lib/repo-context";
import { cn } from "@/lib/utils";

type PendingOp =
  | { kind: "checkout"; branch: string }
  | { kind: "create"; branch: string };

export function BranchSelector() {
  const {
    activeRepo,
    branches,
    branchesBusy,
    remote,
    currentAheadBehind,
    checkoutBranch,
    createBranch,
    pushCurrent,
    stashChanges,
    discardChanges,
  } = useRepo();

  const [query, setQuery] = useState("");
  const [creating, setCreating] = useState(false);
  const [newName, setNewName] = useState("");
  const [pending, setPending] = useState(false);
  const [pushing, setPushing] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);
  const [prOpen, setPrOpen] = useState(false);
  const [dirtyOp, setDirtyOp] = useState<PendingOp | null>(null);

  const currentBranchName = activeRepo?.currentBranch ?? "";
  const currentBranch = useMemo(
    () => branches.find((b) => b.isCurrent) ?? null,
    [branches],
  );

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return branches;
    return branches.filter((b) => b.name.toLowerCase().includes(q));
  }, [branches, query]);

  if (!activeRepo) return null;

  const hasUpstream = Boolean(currentBranch?.upstream);
  const isDefaultBranch = currentBranchName === "main" || currentBranchName === "master";

  function resetMenu() {
    setQuery("");
    setCreating(false);
    setNewName("");
    setActionError(null);
    setPending(false);
  }

  async function handleSelect(name: string, close: () => void) {
    if (!activeRepo) return;
    if (name === currentBranchName) {
      close();
      return;
    }
    setPending(true);
    setActionError(null);
    try {
      await checkoutBranch(name);
      resetMenu();
      close();
    } catch (e) {
      if (isDirtyTreeError(e)) {
        setDirtyOp({ kind: "checkout", branch: name });
        close();
      } else {
        setActionError(extractErrorMessage(e));
      }
    } finally {
      setPending(false);
    }
  }

  async function handleCreate(close: () => void) {
    if (!activeRepo) return;
    const name = newName.trim();
    if (!name) return;
    setPending(true);
    setActionError(null);
    try {
      await createBranch(name, true);
      resetMenu();
      close();
    } catch (e) {
      if (isDirtyTreeError(e)) {
        setDirtyOp({ kind: "create", branch: name });
        close();
      } else {
        setActionError(extractErrorMessage(e));
      }
    } finally {
      setPending(false);
    }
  }

  async function retryPending(op: PendingOp) {
    if (op.kind === "checkout") {
      await checkoutBranch(op.branch);
    } else {
      await createBranch(op.branch, true);
    }
    resetMenu();
  }

  async function handleStashAndContinue() {
    if (!dirtyOp) return;
    await stashChanges(`stash auto antes de ${dirtyOp.kind === "checkout" ? "trocar" : "criar"} ${dirtyOp.branch}`);
    await retryPending(dirtyOp);
  }

  async function handleDiscardAndContinue() {
    if (!dirtyOp) return;
    await discardChanges();
    await retryPending(dirtyOp);
  }

  async function handlePush() {
    if (!activeRepo) return;
    setPushing(true);
    setActionError(null);
    try {
      await pushCurrent();
    } catch (e) {
      setActionError(extractErrorMessage(e));
    } finally {
      setPushing(false);
    }
  }

  return (
    <>
      <PopoverMenu
        align="left"
        className="w-[320px]"
        trigger={({ open, toggle }) => (
          <button
            type="button"
            onClick={() => {
              if (open) resetMenu();
              toggle();
            }}
            className={cn(
              "flex h-7 items-center gap-1.5 border border-transparent px-2 font-mono text-[11px] text-muted-foreground transition-colors hover:border-border hover:bg-accent hover:text-foreground",
              open && "border-border bg-accent text-foreground",
            )}
          >
            <GitBranch className="size-3" />
            <span>{currentBranchName || "—"}</span>
            <ChevronsUpDown className="size-3 opacity-60" />
          </button>
        )}
      >
        {(close) => (
          <BranchMenuContent
            query={query}
            setQuery={setQuery}
            creating={creating}
            setCreating={setCreating}
            newName={newName}
            setNewName={setNewName}
            pending={pending}
            actionError={actionError}
            branches={filtered}
            currentName={currentBranchName}
            branchesBusy={branchesBusy}
            onSelect={(name) => void handleSelect(name, close)}
            onCreate={() => void handleCreate(close)}
            onCancelCreate={() => {
              setCreating(false);
              setNewName("");
              setActionError(null);
            }}
          />
        )}
      </PopoverMenu>

      {hasUpstream ? (
        <>
          {currentAheadBehind && currentAheadBehind.ahead > 0 && (
            <Button
              type="button"
              size="sm"
              variant="ghost"
              className="h-7 gap-1.5 px-2 text-[11px]"
              onClick={() => void handlePush()}
              disabled={pushing}
              title={`Enviar ${currentAheadBehind.ahead} commit(s) para ${currentBranch?.upstream ?? "origin"}`}
            >
              {pushing ? (
                <Loader2 className="size-3 animate-spin" />
              ) : (
                <CloudUpload className="size-3" />
              )}
              {pushing ? "Enviando…" : `Push ${currentAheadBehind.ahead}`}
            </Button>
          )}
          {remote?.isGitHub && !isDefaultBranch && (
            <Button
              type="button"
              size="sm"
              variant="ghost"
              className="h-7 gap-1.5 px-2 text-[11px]"
              onClick={() => setPrOpen(true)}
              title="Criar pull request"
            >
              <GitPullRequest className="size-3" />
              Criar PR
            </Button>
          )}
        </>
      ) : (
        <Button
          type="button"
          size="sm"
          variant="ghost"
          className="h-7 gap-1.5 px-2 text-[11px]"
          onClick={() => void handlePush()}
          disabled={pushing}
          title="Publicar branch"
        >
          {pushing ? (
            <Loader2 className="size-3 animate-spin" />
          ) : (
            <CloudUpload className="size-3" />
          )}
          {pushing ? "Publicando…" : "Publicar"}
        </Button>
      )}

      {actionError && (
        <span className="truncate text-[11px] text-destructive" title={actionError}>
          {actionError}
        </span>
      )}

      <CreatePullRequestDialog open={prOpen} onClose={() => setPrOpen(false)} />

      <DirtyTreeDialog
        open={!!dirtyOp}
        onOpenChange={(open) => {
          if (!open) setDirtyOp(null);
        }}
        intent={
          dirtyOp?.kind === "create"
            ? `criar e trocar para \`${dirtyOp.branch}\``
            : dirtyOp
              ? `trocar para \`${dirtyOp.branch}\``
              : ""
        }
        onStash={handleStashAndContinue}
        onDiscard={handleDiscardAndContinue}
      />
    </>
  );
}

function BranchMenuContent({
  query,
  setQuery,
  creating,
  setCreating,
  newName,
  setNewName,
  pending,
  actionError,
  branches,
  currentName,
  branchesBusy,
  onSelect,
  onCreate,
  onCancelCreate,
}: {
  query: string;
  setQuery: (v: string) => void;
  creating: boolean;
  setCreating: (v: boolean) => void;
  newName: string;
  setNewName: (v: string) => void;
  pending: boolean;
  actionError: string | null;
  branches: { name: string; hash: string; isCurrent: boolean; upstream?: string }[];
  currentName: string;
  branchesBusy: boolean;
  onSelect: (name: string) => void;
  onCreate: () => void;
  onCancelCreate: () => void;
}) {
  if (creating) {
    return (
      <div className="flex flex-col gap-2 p-2">
        <MenuLabel>Nova branch (a partir de {currentName || "HEAD"})</MenuLabel>
        <Input
          autoFocus
          value={newName}
          onChange={(e) => setNewName(e.target.value)}
          placeholder="feature/minha-branch"
          className="h-8 text-xs"
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              e.preventDefault();
              onCreate();
            } else if (e.key === "Escape") {
              e.preventDefault();
              onCancelCreate();
            }
          }}
        />
        {actionError && (
          <span className="text-[10px] text-destructive">{actionError}</span>
        )}
        <div className="flex justify-end gap-2">
          <Button
            type="button"
            size="sm"
            variant="ghost"
            className="h-7 text-[11px]"
            onClick={onCancelCreate}
            disabled={pending}
          >
            Cancelar
          </Button>
          <Button
            type="button"
            size="sm"
            className="h-7 text-[11px]"
            onClick={onCreate}
            disabled={pending || !newName.trim()}
          >
            {pending ? <Loader2 className="size-3 animate-spin" /> : <GitMerge className="size-3" />}
            Criar e checkout
          </Button>
        </div>
      </div>
    );
  }

  return (
    <div className="flex max-h-[360px] flex-col">
      <div className="border-b border-border p-2">
        <div className="relative">
          <Search className="absolute left-2 top-1/2 size-3 -translate-y-1/2 text-muted-foreground" />
          <Input
            autoFocus
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Buscar branch…"
            className="h-7 pl-7 text-xs"
          />
        </div>
      </div>

      <div className="flex-1 overflow-y-auto py-1">
        {branchesBusy && branches.length === 0 ? (
          <div className="flex items-center justify-center gap-2 py-4 text-[11px] text-muted-foreground">
            <Loader2 className="size-3 animate-spin" />
            Carregando…
          </div>
        ) : branches.length === 0 ? (
          <div className="px-3 py-3 text-[11px] text-muted-foreground">
            Nenhuma branch encontrada.
          </div>
        ) : (
          branches.map((b) => (
            <button
              key={b.name}
              type="button"
              onClick={() => onSelect(b.name)}
              disabled={pending}
              className={cn(
                "flex w-full items-center gap-2 px-3 py-1.5 text-left text-[11px] transition-colors",
                "hover:bg-accent hover:text-foreground",
                b.isCurrent && "text-foreground",
                pending && "cursor-not-allowed opacity-50",
              )}
            >
              <Check
                className={cn("size-3 shrink-0", b.isCurrent ? "opacity-100" : "opacity-0")}
              />
              <span className="flex-1 truncate font-mono">{b.name}</span>
              {b.upstream && (
                <span className="truncate text-[9px] text-muted-foreground">{b.upstream}</span>
              )}
            </button>
          ))
        )}
      </div>

      {actionError && (
        <div className="border-t border-destructive/40 bg-destructive/10 px-3 py-1.5 text-[10px] text-destructive">
          {actionError}
        </div>
      )}

      <MenuSeparator />
      <MenuItem onClick={() => setCreating(true)}>
        <Plus className="size-3" />
        Criar nova branch
      </MenuItem>
    </div>
  );
}
