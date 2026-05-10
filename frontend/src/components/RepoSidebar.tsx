import { useEffect, useMemo, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import {
  AlertTriangle,
  ChevronDown,
  ChevronRight,
  Cloud,
  Folder,
  FolderGit2,
  FolderPlus,
  FolderSearch,
  MoreHorizontal,
  PanelLeftClose,
  PanelLeftOpen,
  Pencil,
  Pin,
  PinOff,
  Plus,
  Trash2,
  X,
} from "lucide-react";

import { CloneRepoDialog } from "@/components/CloneRepoDialog";
import { MenuItem, MenuLabel, MenuSeparator, PopoverMenu } from "@/components/PopoverMenu";
import { Input } from "@/components/ui/input";
import { ScrollArea } from "@/components/ui/scroll-area";
import { useRepo } from "@/lib/repo-context";
import { useRepoOrgStore, type Collection } from "@/lib/repo-org-store";
import { cn } from "@/lib/utils";
import { extractErrorMessage, git, type RepoInfo } from "@/lib/git";

interface Props {
  repos: RepoInfo[];
  active: string | null;
  onSelect: (path: string) => void;
  onAdd: (path: string) => Promise<void>;
  onRemove: (path: string) => void;
}

interface Group {
  id: string | null;
  name: string;
  collapsed: boolean;
  repos: RepoInfo[];
}

function getInitials(name: string): string {
  const cleaned = name.trim();
  if (!cleaned) return "??";
  const parts = cleaned.split(/[\s\-_./]+/).filter(Boolean);
  if (parts.length >= 2) {
    return (parts[0][0] + parts[1][0]).toUpperCase();
  }
  return cleaned.slice(0, 2).toUpperCase();
}

export function RepoSidebar({ repos, active, onSelect, onAdd, onRemove }: Props) {
  const [picking, setPicking] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [cloneOpen, setCloneOpen] = useState(false);
  const [newCollectionOpen, setNewCollectionOpen] = useState(false);
  const [renamingId, setRenamingId] = useState<string | null>(null);
  const [addToCollectionId, setAddToCollectionId] = useState<string | null>(null);
  const [pendingCollectionId, setPendingCollectionId] = useState<string | null>(null);

  const { hydrated } = useRepo();
  const orgHydrated = useRepoOrgStore((s) => s.hydrated);
  const collections = useRepoOrgStore((s) => s.collections);
  const pinned = useRepoOrgStore((s) => s.pinned);
  const assignments = useRepoOrgStore((s) => s.assignments);
  const uncategorizedCollapsed = useRepoOrgStore((s) => s.uncategorizedCollapsed);
  const sidebarCollapsed = useRepoOrgStore((s) => s.sidebarCollapsed);
  const togglePin = useRepoOrgStore((s) => s.togglePin);
  const createCollection = useRepoOrgStore((s) => s.createCollection);
  const renameCollection = useRepoOrgStore((s) => s.renameCollection);
  const deleteCollection = useRepoOrgStore((s) => s.deleteCollection);
  const toggleCollapsed = useRepoOrgStore((s) => s.toggleCollapsed);
  const reorderCollection = useRepoOrgStore((s) => s.reorderCollection);
  const assignToCollection = useRepoOrgStore((s) => s.assignToCollection);
  const cleanupForPaths = useRepoOrgStore((s) => s.cleanupForPaths);
  const toggleSidebar = useRepoOrgStore((s) => s.toggleSidebar);

  useEffect(() => {
    if (!hydrated || !orgHydrated) return;
    cleanupForPaths(repos.map((r) => r.path));
  }, [repos, hydrated, orgHydrated, cleanupForPaths]);

  const groups = useMemo<Group[]>(() => {
    const sortedCollections = [...collections].sort((a, b) => a.order - b.order);
    const pinnedSet = new Set(pinned);
    const sortRepos = (rs: RepoInfo[]) =>
      [...rs].sort((a, b) => {
        const ap = pinnedSet.has(a.path);
        const bp = pinnedSet.has(b.path);
        if (ap !== bp) return ap ? -1 : 1;
        return a.name.localeCompare(b.name);
      });

    const out: Group[] = sortedCollections.map((c) => ({
      id: c.id,
      name: c.name,
      collapsed: c.collapsed,
      repos: sortRepos(repos.filter((r) => assignments[r.path] === c.id)),
    }));

    const uncategorized = sortRepos(
      repos.filter((r) => !assignments[r.path] || !collections.some((c) => c.id === assignments[r.path])),
    );
    if (uncategorized.length > 0 || sortedCollections.length === 0) {
      out.push({
        id: null,
        name: "Sem coleção",
        collapsed: uncategorizedCollapsed,
        repos: uncategorized,
      });
    }
    return out;
  }, [collections, assignments, pinned, repos, uncategorizedCollapsed]);


  async function handlePick() {
    if (picking) return;
    setError(null);
    setPicking(true);
    try {
      const path = await git.pickRepoFolder();
      if (!path) return;
      await onAdd(path);
    } catch (e) {
      setError(extractErrorMessage(e));
    } finally {
      setPicking(false);
    }
  }

  async function handlePickForCollection(collectionId: string) {
    if (picking) return;
    setError(null);
    setPicking(true);
    try {
      const path = await git.pickRepoFolder();
      if (!path) return;
      await onAdd(path);
      assignToCollection(path, collectionId);
      setAddToCollectionId(null);
    } catch (e) {
      setError(extractErrorMessage(e));
    } finally {
      setPicking(false);
    }
  }

  if (sidebarCollapsed) {
    const pinnedSet = new Set(pinned);
    const sortedRepos = [...repos].sort((a, b) => {
      const ap = pinnedSet.has(a.path);
      const bp = pinnedSet.has(b.path);
      if (ap !== bp) return ap ? -1 : 1;
      return a.name.localeCompare(b.name);
    });

    return (
      <aside className="flex h-full w-12 shrink-0 flex-col border-r border-border bg-card">
        <button
          type="button"
          onClick={toggleSidebar}
          title="Expandir sidebar"
          className="flex h-10 shrink-0 items-center justify-center border-b border-border text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
        >
          <PanelLeftOpen className="size-3.5" />
        </button>
        <ScrollArea className="flex-1">
          <ul className="flex flex-col items-center gap-1 p-1.5">
            {sortedRepos.map((r) => {
              const isActive = active === r.path;
              const isPinned = pinnedSet.has(r.path);
              return (
                <li key={r.path} className="relative w-full">
                  {isActive && (
                    <motion.span
                      layoutId="repo-active-indicator-collapsed"
                      className="absolute inset-y-0 left-0 w-0.5 bg-foreground"
                      transition={{ duration: 0.18 }}
                    />
                  )}
                  <button
                    type="button"
                    onClick={() => onSelect(r.path)}
                    title={`${r.name}${r.currentBranch ? ` · ${r.currentBranch}` : ""}`}
                    className={cn(
                      "relative mx-auto flex size-9 items-center justify-center border text-[11px] font-semibold uppercase tracking-wider transition-colors",
                      isActive
                        ? "border-foreground bg-accent text-foreground"
                        : "border-border text-muted-foreground hover:border-muted-foreground hover:bg-accent hover:text-foreground",
                    )}
                  >
                    {getInitials(r.name)}
                    {isPinned && (
                      <Pin className="absolute -right-0.5 -top-0.5 size-2.5 text-foreground" />
                    )}
                    {r.hasChanges && (
                      <span className="absolute -bottom-0.5 -right-0.5 size-1.5 rounded-full bg-[color:var(--modified)]" />
                    )}
                  </button>
                </li>
              );
            })}
          </ul>
        </ScrollArea>
      </aside>
    );
  }

  return (
    <aside className="flex h-full w-64 shrink-0 flex-col border-r border-border bg-card">
      <div className="flex h-10 items-center gap-2 border-b border-border px-3 text-[11px] font-medium uppercase tracking-[0.1em]">
        <FolderGit2 className="size-3.5" />
        Repositórios
        <span className="ml-auto text-muted-foreground tabular-nums">{repos.length}</span>
        <button
          type="button"
          onClick={toggleSidebar}
          title="Recolher sidebar"
          className="flex size-5 items-center justify-center text-muted-foreground transition-colors hover:text-foreground"
        >
          <PanelLeftClose className="size-3.5" />
        </button>
      </div>

      <div className="space-y-2 border-b border-border p-2">
        <div className="grid grid-cols-2 gap-1.5">
          <button
            type="button"
            onClick={() => void handlePick()}
            disabled={picking}
            className="flex h-7 w-full items-center justify-center gap-1.5 border border-border px-2 text-[10px] font-medium uppercase tracking-[0.08em] text-muted-foreground transition-colors hover:bg-accent hover:text-foreground disabled:opacity-40"
          >
            <FolderSearch className="size-3" />
            Pasta
          </button>
          <button
            type="button"
            onClick={() => setCloneOpen(true)}
            className="flex h-7 w-full items-center justify-center gap-1.5 border border-border px-2 text-[10px] font-medium uppercase tracking-[0.08em] text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
          >
            <Cloud className="size-3" />
            Clonar
          </button>
        </div>
        <AnimatePresence>
          {error && (
            <motion.div
              initial={{ opacity: 0, y: -4 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -4 }}
              transition={{ duration: 0.16, ease: "easeOut" }}
              className="flex items-start gap-2 border border-destructive/40 bg-destructive/10 p-2 text-[11px] text-destructive"
            >
              <AlertTriangle className="mt-0.5 size-3 shrink-0" />
              <div className="min-w-0 flex-1">
                <div className="font-medium uppercase tracking-[0.08em]">Não foi possível abrir</div>
                <div className="mt-0.5 break-words font-mono text-[10px] opacity-90">{error}</div>
              </div>
              <button
                type="button"
                onClick={() => setError(null)}
                className="-m-0.5 flex size-4 shrink-0 items-center justify-center text-destructive/70 hover:text-destructive"
                aria-label="Dispensar erro"
              >
                <X className="size-3" />
              </button>
            </motion.div>
          )}
        </AnimatePresence>
      </div>

      <AddRepoToCollectionDialog
        open={addToCollectionId !== null}
        collectionName={
          addToCollectionId
            ? collections.find((c) => c.id === addToCollectionId)?.name ?? ""
            : ""
        }
        picking={picking}
        onClose={() => setAddToCollectionId(null)}
        onPick={() => {
          if (addToCollectionId) void handlePickForCollection(addToCollectionId);
        }}
        onClone={() => {
          setPendingCollectionId(addToCollectionId);
          setAddToCollectionId(null);
          setCloneOpen(true);
        }}
      />

      <CloneRepoDialog
        open={cloneOpen}
        onClose={() => {
          setCloneOpen(false);
          setPendingCollectionId(null);
        }}
        onCloned={async (path) => {
          await onAdd(path);
          if (pendingCollectionId) {
            assignToCollection(path, pendingCollectionId);
            setPendingCollectionId(null);
          }
        }}
      />

      <ScrollArea className="flex-1">
        {repos.length === 0 ? (
          <div className="px-3 py-6 text-center text-[10px] uppercase tracking-[0.1em] text-muted-foreground">
            Nenhum repositório
          </div>
        ) : (
          <div>
            {groups.map((g) => (
              <CollectionSection
                key={g.id ?? "__none"}
                group={g}
                active={active}
                pinned={pinned}
                collections={collections}
                renamingId={renamingId}
                onSelect={onSelect}
                onRemove={onRemove}
                onTogglePin={togglePin}
                onAssign={assignToCollection}
                onToggleCollapsed={toggleCollapsed}
                onStartRename={(id) => setRenamingId(id)}
                onFinishRename={(id, name) => {
                  if (name.trim()) renameCollection(id, name);
                  setRenamingId(null);
                }}
                onDeleteCollection={deleteCollection}
                onReorderCollection={reorderCollection}
                onCreateCollectionForRepo={(path) => {
                  const id = createCollection("Nova coleção");
                  assignToCollection(path, id);
                  setRenamingId(id);
                }}
                onAddToCollection={(id) => setAddToCollectionId(id)}
              />
            ))}
          </div>
        )}
      </ScrollArea>

      <div className="border-t border-border p-2">
        {newCollectionOpen ? (
          <NewCollectionInput
            onSubmit={(name) => {
              if (name.trim()) createCollection(name);
              setNewCollectionOpen(false);
            }}
            onCancel={() => setNewCollectionOpen(false)}
          />
        ) : (
          <button
            type="button"
            onClick={() => setNewCollectionOpen(true)}
            className="flex h-7 w-full items-center justify-center gap-2 border border-border px-2 text-[11px] font-medium uppercase tracking-[0.08em] text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
          >
            <FolderPlus className="size-3.5" />
            Nova coleção
          </button>
        )}
      </div>
    </aside>
  );
}

function CollectionSection({
  group,
  active,
  pinned,
  collections,
  renamingId,
  onSelect,
  onRemove,
  onTogglePin,
  onAssign,
  onToggleCollapsed,
  onStartRename,
  onFinishRename,
  onDeleteCollection,
  onReorderCollection,
  onCreateCollectionForRepo,
  onAddToCollection,
}: {
  group: Group;
  active: string | null;
  pinned: string[];
  collections: Collection[];
  renamingId: string | null;
  onSelect: (path: string) => void;
  onRemove: (path: string) => void;
  onTogglePin: (path: string) => void;
  onAssign: (path: string, collectionId: string | null) => void;
  onToggleCollapsed: (id: string | null) => void;
  onStartRename: (id: string) => void;
  onFinishRename: (id: string, name: string) => void;
  onDeleteCollection: (id: string) => void;
  onReorderCollection: (id: string, dir: "up" | "down") => void;
  onAddToCollection: (id: string) => void;
  onCreateCollectionForRepo: (path: string) => void;
}) {
  const isRenaming = group.id !== null && renamingId === group.id;
  const pinnedSet = new Set(pinned);

  return (
    <section className="border-b border-border/60 last:border-b-0">
      <div className="group/header flex items-center gap-1 bg-card/50 px-2 py-1">
        <button
          type="button"
          onClick={() => onToggleCollapsed(group.id)}
          className="flex size-5 items-center justify-center text-muted-foreground hover:text-foreground"
        >
          {group.collapsed ? (
            <ChevronRight className="size-3" />
          ) : (
            <ChevronDown className="size-3" />
          )}
        </button>
        {isRenaming && group.id !== null ? (
          <RenameInput
            initial={group.name}
            onSubmit={(name) => onFinishRename(group.id!, name)}
            onCancel={() => onFinishRename(group.id!, group.name)}
          />
        ) : (
          <>
            <Folder className="size-3 text-muted-foreground" />
            <span className="flex-1 truncate text-[10px] font-medium uppercase tracking-[0.12em] text-muted-foreground">
              {group.name}
            </span>
            <span className="text-[10px] tabular-nums text-muted-foreground">
              {group.repos.length}
            </span>
            {group.id !== null && (
              <PopoverMenu
                trigger={({ toggle }) => (
                  <button
                    type="button"
                    onClick={toggle}
                    className="flex size-5 items-center justify-center text-muted-foreground opacity-0 transition-opacity hover:text-foreground group-hover/header:opacity-100"
                  >
                    <MoreHorizontal className="size-3" />
                  </button>
                )}
              >
                {(close) => (
                  <>
                    <MenuItem
                      onClick={() => {
                        onStartRename(group.id!);
                        close();
                      }}
                    >
                      <Pencil className="size-3" />
                      Renomear
                    </MenuItem>
                    <MenuItem
                      onClick={() => {
                        onReorderCollection(group.id!, "up");
                        close();
                      }}
                    >
                      <ChevronRight className="size-3 -rotate-90" />
                      Mover para cima
                    </MenuItem>
                    <MenuItem
                      onClick={() => {
                        onReorderCollection(group.id!, "down");
                        close();
                      }}
                    >
                      <ChevronRight className="size-3 rotate-90" />
                      Mover para baixo
                    </MenuItem>
                    <MenuSeparator />
                    <MenuItem
                      destructive
                      onClick={() => {
                        onDeleteCollection(group.id!);
                        close();
                      }}
                    >
                      <Trash2 className="size-3" />
                      Excluir coleção
                    </MenuItem>
                  </>
                )}
              </PopoverMenu>
            )}
          </>
        )}
      </div>

      <AnimatePresence initial={false}>
        {!group.collapsed && (
          <motion.ul
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: "auto", opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.18, ease: "easeOut" }}
            className="overflow-hidden"
          >
            {group.repos.length === 0 && (
              <li>
                {group.id ? (
                  <button
                    type="button"
                    onClick={() => onAddToCollection(group.id!)}
                    className="flex w-full items-center gap-1.5 px-3 py-2 text-left text-[10px] italic text-muted-foreground transition-colors hover:bg-accent hover:not-italic hover:text-foreground"
                  >
                    <Plus className="size-3" />
                    Adicionar repositório…
                  </button>
                ) : (
                  <span className="block px-3 py-2 text-[10px] italic text-muted-foreground">
                    Vazio
                  </span>
                )}
              </li>
            )}
            {group.repos.map((r) => (
              <RepoRow
                key={r.path}
                repo={r}
                active={active === r.path}
                pinned={pinnedSet.has(r.path)}
                currentCollection={group.id}
                collections={collections}
                onSelect={onSelect}
                onRemove={onRemove}
                onTogglePin={onTogglePin}
                onAssign={onAssign}
                onCreateCollectionForRepo={onCreateCollectionForRepo}
              />
            ))}
          </motion.ul>
        )}
      </AnimatePresence>
    </section>
  );
}

function RepoRow({
  repo,
  active,
  pinned,
  currentCollection,
  collections,
  onSelect,
  onRemove,
  onTogglePin,
  onAssign,
  onCreateCollectionForRepo,
}: {
  repo: RepoInfo;
  active: boolean;
  pinned: boolean;
  currentCollection: string | null;
  collections: Collection[];
  onSelect: (path: string) => void;
  onRemove: (path: string) => void;
  onTogglePin: (path: string) => void;
  onAssign: (path: string, collectionId: string | null) => void;
  onCreateCollectionForRepo: (path: string) => void;
}) {
  return (
    <li className="border-t border-border/40">
      <div
        className={cn(
          "group/row relative flex items-center gap-2 px-3 py-2 text-left text-xs transition-colors hover:bg-accent",
          active && "bg-accent",
        )}
      >
        {active && (
          <motion.span
            layoutId="repo-active-indicator"
            className="absolute inset-y-0 left-0 w-0.5 bg-foreground"
            transition={{ duration: 0.18 }}
          />
        )}
        <button
          type="button"
          onClick={() => onSelect(repo.path)}
          className="min-w-0 flex-1 text-left"
        >
          <div className="flex items-center gap-1.5">
            {pinned && <Pin className="size-2.5 shrink-0 text-foreground" />}
            <span className="truncate text-[12px] font-medium">{repo.name}</span>
          </div>
          <div className="mt-0.5 flex items-center gap-1 truncate font-mono text-[10px] text-muted-foreground">
            <span>{repo.currentBranch || "—"}</span>
            {repo.hasChanges && (
              <>
                <span>·</span>
                <span className="text-[color:var(--modified)]">●</span>
              </>
            )}
          </div>
        </button>

        <PopoverMenu
          trigger={({ toggle }) => (
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                toggle();
              }}
              className="flex size-5 items-center justify-center text-muted-foreground opacity-0 hover:text-foreground group-hover/row:opacity-100"
            >
              <MoreHorizontal className="size-3" />
            </button>
          )}
        >
          {(close) => (
            <>
              <MenuItem
                onClick={() => {
                  onTogglePin(repo.path);
                  close();
                }}
              >
                {pinned ? <PinOff className="size-3" /> : <Pin className="size-3" />}
                {pinned ? "Desafixar" : "Fixar"}
              </MenuItem>
              <MenuSeparator />
              <MenuLabel>Mover para</MenuLabel>
              <MenuItem
                disabled={currentCollection === null}
                onClick={() => {
                  onAssign(repo.path, null);
                  close();
                }}
              >
                <Folder className="size-3" />
                Sem coleção
              </MenuItem>
              {collections
                .slice()
                .sort((a, b) => a.order - b.order)
                .map((c) => (
                  <MenuItem
                    key={c.id}
                    disabled={currentCollection === c.id}
                    onClick={() => {
                      onAssign(repo.path, c.id);
                      close();
                    }}
                  >
                    <Folder className="size-3" />
                    {c.name}
                  </MenuItem>
                ))}
              <MenuItem
                onClick={() => {
                  onCreateCollectionForRepo(repo.path);
                  close();
                }}
              >
                <FolderPlus className="size-3" />
                Nova coleção…
              </MenuItem>
              <MenuSeparator />
              <MenuItem
                destructive
                onClick={() => {
                  onRemove(repo.path);
                  close();
                }}
              >
                <X className="size-3" />
                Remover
              </MenuItem>
            </>
          )}
        </PopoverMenu>
      </div>
    </li>
  );
}

function NewCollectionInput({
  onSubmit,
  onCancel,
}: {
  onSubmit: (name: string) => void;
  onCancel: () => void;
}) {
  const [value, setValue] = useState("");
  return (
    <Input
      autoFocus
      value={value}
      onChange={(e) => setValue(e.target.value)}
      placeholder="Nome da coleção"
      onKeyDown={(e) => {
        if (e.key === "Enter") onSubmit(value);
        if (e.key === "Escape") onCancel();
      }}
      onBlur={() => (value.trim() ? onSubmit(value) : onCancel())}
      className="h-7 text-[11px]"
    />
  );
}

function RenameInput({
  initial,
  onSubmit,
  onCancel,
}: {
  initial: string;
  onSubmit: (name: string) => void;
  onCancel: () => void;
}) {
  const [value, setValue] = useState(initial);
  return (
    <Input
      autoFocus
      value={value}
      onChange={(e) => setValue(e.target.value)}
      onKeyDown={(e) => {
        if (e.key === "Enter") onSubmit(value);
        if (e.key === "Escape") onCancel();
      }}
      onBlur={() => onSubmit(value)}
      className="h-6 text-[11px]"
    />
  );
}

function AddRepoToCollectionDialog({
  open,
  collectionName,
  picking,
  onClose,
  onPick,
  onClone,
}: {
  open: boolean;
  collectionName: string;
  picking: boolean;
  onClose: () => void;
  onPick: () => void;
  onClone: () => void;
}) {
  if (!open) return null;
  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-background/80 backdrop-blur-sm"
      onClick={onClose}
    >
      <div
        className="flex w-[380px] flex-col border border-border bg-card shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between border-b border-border px-4 py-3">
          <div className="flex flex-col gap-0.5">
            <h2 className="text-[12px] font-semibold">Adicionar repositório</h2>
            {collectionName && (
              <span className="font-mono text-[10px] text-muted-foreground">
                em {collectionName}
              </span>
            )}
          </div>
          <button
            type="button"
            onClick={onClose}
            className="flex size-5 items-center justify-center text-muted-foreground hover:text-foreground"
            aria-label="Fechar"
          >
            <X className="size-3.5" />
          </button>
        </div>
        <div className="grid grid-cols-2 gap-2 p-4">
          <button
            type="button"
            onClick={onPick}
            disabled={picking}
            className="flex flex-col items-center justify-center gap-2 border border-border px-3 py-6 text-[11px] font-medium uppercase tracking-[0.08em] text-muted-foreground transition-colors hover:bg-accent hover:text-foreground disabled:opacity-40"
          >
            <FolderSearch className="size-5" />
            Selecionar pasta
          </button>
          <button
            type="button"
            onClick={onClone}
            className="flex flex-col items-center justify-center gap-2 border border-border px-3 py-6 text-[11px] font-medium uppercase tracking-[0.08em] text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
          >
            <Cloud className="size-5" />
            Clonar do GitHub
          </button>
        </div>
      </div>
    </div>
  );
}
