import { useEffect, useMemo, useRef, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import {
  Check,
  ChevronDown,
  ChevronRight,
  Loader2,
  Minus,
  Plus,
  Search,
  Trash2,
  X,
} from "lucide-react";

import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Kbd, KbdGroup } from "@/components/ui/kbd";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Textarea } from "@/components/ui/textarea";
import { cn } from "@/lib/utils";
import type { FileChange, StatusResult } from "@/lib/git";

interface Props {
  status: StatusResult | null;
  selected: FileChange | null;
  onSelect: (f: FileChange) => void;
  onStage: (f: FileChange) => Promise<void>;
  onUnstage: (f: FileChange) => Promise<void>;
  onDiscard: (f: FileChange) => Promise<void>;
  onStageMany: (files: FileChange[]) => Promise<void>;
  onUnstageMany: (files: FileChange[]) => Promise<void>;
  onDiscardMany: (files: FileChange[]) => Promise<void>;
  onCommit: (message: string) => Promise<void>;
  busy: boolean;
}

type GroupKind = "staged" | "unstaged" | "untracked";

function fileKey(f: FileChange): string {
  return `${f.staged ? "s" : "u"}:${f.path}`;
}

export function ChangesPanel({
  status,
  selected,
  onSelect,
  onStage,
  onUnstage,
  onDiscard,
  onStageMany,
  onUnstageMany,
  onDiscardMany,
  onCommit,
  busy,
}: Props) {
  const [message, setMessage] = useState("");
  const [committing, setCommitting] = useState(false);
  const [justCommitted, setJustCommitted] = useState(false);
  const [selection, setSelection] = useState<Set<string>>(new Set());
  const [pendingDiscard, setPendingDiscard] = useState<FileChange[] | null>(null);
  const [searchOpen, setSearchOpen] = useState(false);
  const [query, setQuery] = useState("");
  const searchRef = useRef<HTMLInputElement | null>(null);

  useEffect(() => {
    if (searchOpen) searchRef.current?.focus();
    else setQuery("");
  }, [searchOpen]);

  const q = query.trim().toLowerCase();
  const filterFiles = (files: FileChange[]) =>
    q ? files.filter((f) => f.path.toLowerCase().includes(q)) : files;

  const stagedFiles = filterFiles(status?.staged ?? []);
  const unstagedFiles = filterFiles(status?.unstaged ?? []);
  const untrackedFiles = filterFiles(status?.untracked ?? []);

  const stagedCount = status?.staged.length ?? 0;
  const unstagedCount = (status?.unstaged.length ?? 0) + (status?.untracked.length ?? 0);
  const total = stagedCount + unstagedCount;
  const filteredTotal = stagedFiles.length + unstagedFiles.length + untrackedFiles.length;

  const fileByKey = useMemo(() => {
    const m = new Map<string, FileChange>();
    if (status) {
      for (const f of status.staged) m.set(fileKey(f), f);
      for (const f of status.unstaged) m.set(fileKey(f), f);
      for (const f of status.untracked) m.set(fileKey(f), f);
    }
    return m;
  }, [status]);

  // Drop selections that no longer exist after refresh
  const validSelection = useMemo(() => {
    const next = new Set<string>();
    for (const k of selection) if (fileByKey.has(k)) next.add(k);
    return next;
  }, [selection, fileByKey]);

  const selectedFiles = useMemo(
    () => Array.from(validSelection).map((k) => fileByKey.get(k)!).filter(Boolean),
    [validSelection, fileByKey],
  );

  const selStaged = selectedFiles.filter((f) => f.staged);
  const selUnstaged = selectedFiles.filter((f) => !f.staged && f.status !== "untracked");
  const selUntracked = selectedFiles.filter((f) => f.status === "untracked");
  const selDiscardable = [...selUnstaged, ...selUntracked];

  function toggleSel(k: string) {
    setSelection((prev) => {
      const next = new Set(prev);
      if (next.has(k)) next.delete(k);
      else next.add(k);
      return next;
    });
  }

  function setGroupSel(files: FileChange[], all: boolean) {
    setSelection((prev) => {
      const next = new Set(prev);
      for (const f of files) {
        const k = fileKey(f);
        if (all) next.add(k);
        else next.delete(k);
      }
      return next;
    });
  }

  async function bulkStage() {
    const files = [...selUnstaged, ...selUntracked];
    if (files.length === 0) return;
    if (files.length === 1) await onStage(files[0]);
    else await onStageMany(files);
    setSelection(new Set());
  }
  async function bulkUnstage() {
    if (selStaged.length === 0) return;
    if (selStaged.length === 1) await onUnstage(selStaged[0]);
    else await onUnstageMany(selStaged);
    setSelection(new Set());
  }
  function requestBulkDiscard() {
    if (selDiscardable.length === 0) return;
    setPendingDiscard(selDiscardable);
  }

  async function stageAll(files: FileChange[]) {
    if (files.length === 0) return;
    if (files.length === 1) await onStage(files[0]);
    else await onStageMany(files);
    setGroupSel(files, false);
  }
  async function unstageAll(files: FileChange[]) {
    if (files.length === 0) return;
    if (files.length === 1) await onUnstage(files[0]);
    else await onUnstageMany(files);
    setGroupSel(files, false);
  }
  function requestDiscardAll(files: FileChange[]) {
    if (files.length === 0) return;
    setPendingDiscard(files);
  }

  async function confirmDiscard() {
    if (!pendingDiscard) return;
    if (pendingDiscard.length === 1) await onDiscard(pendingDiscard[0]);
    else await onDiscardMany(pendingDiscard);
    setGroupSel(pendingDiscard, false);
    setPendingDiscard(null);
  }

  async function submit() {
    if (!message.trim() || stagedCount === 0) return;
    setCommitting(true);
    try {
      await onCommit(message.trim());
      setMessage("");
      setJustCommitted(true);
      setTimeout(() => setJustCommitted(false), 900);
    } finally {
      setCommitting(false);
    }
  }

  return (
    <div className="flex h-full w-full flex-col border-r border-border">
      <div className="flex h-10 items-center gap-2 border-b border-border px-3 text-[11px] font-medium uppercase tracking-[0.1em]">
        Mudanças
        {busy && <Loader2 className="size-3 animate-spin text-muted-foreground" />}
        <span className="ml-auto flex items-center gap-2">
          <span className="text-muted-foreground tabular-nums">{total}</span>
          <button
            type="button"
            onClick={() => setSearchOpen((v) => !v)}
            className={cn(
              "flex size-5 items-center justify-center border border-border text-muted-foreground transition-colors hover:bg-accent hover:text-foreground",
              searchOpen && "bg-accent text-foreground",
            )}
            title="Pesquisar arquivo"
            aria-label="Pesquisar arquivo"
          >
            <Search className="size-3" />
          </button>
        </span>
      </div>

      {searchOpen && (
        <div className="border-b border-border px-2 py-1.5">
          <div className="relative flex items-center">
            <Search className="pointer-events-none absolute left-2 size-3 text-muted-foreground" />
            <Input
              ref={searchRef}
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Escape") {
                  e.preventDefault();
                  setSearchOpen(false);
                }
              }}
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
      )}

      <ScrollArea className="flex-1">
        <div>
          {stagedFiles.length > 0 && (
            <FileGroup
              label="Stage"
              kind="staged"
              files={stagedFiles}
              selected={selected}
              selection={validSelection}
              onSelect={onSelect}
              onToggleSel={toggleSel}
              onSetGroupSel={setGroupSel}
              onAction={onUnstage}
              onGroupAction={() => void unstageAll(stagedFiles)}
            />
          )}
          <FileGroup
            label="Unstaged"
            kind="unstaged"
            files={unstagedFiles}
            selected={selected}
            selection={validSelection}
            onSelect={onSelect}
            onToggleSel={toggleSel}
            onSetGroupSel={setGroupSel}
            onAction={onStage}
            onDiscard={(f) => setPendingDiscard([f])}
            onGroupAction={() => void stageAll(unstagedFiles)}
            onGroupDiscard={() => requestDiscardAll(unstagedFiles)}
          />
          <FileGroup
            label="Untracked"
            kind="untracked"
            files={untrackedFiles}
            selected={selected}
            selection={validSelection}
            onSelect={onSelect}
            onToggleSel={toggleSel}
            onSetGroupSel={setGroupSel}
            onAction={onStage}
            onDiscard={(f) => setPendingDiscard([f])}
            onGroupAction={() => void stageAll(untrackedFiles)}
            onGroupDiscard={() => requestDiscardAll(untrackedFiles)}
          />
          {total === 0 && status && (
            <p className="px-3 py-8 text-center text-[10px] uppercase tracking-[0.1em] text-muted-foreground">
              Working tree limpo
            </p>
          )}
          {total > 0 && filteredTotal === 0 && (
            <p className="px-3 py-8 text-center text-[10px] uppercase tracking-[0.1em] text-muted-foreground">
              Nenhum arquivo corresponde a “{q}”
            </p>
          )}
        </div>
      </ScrollArea>

      {validSelection.size > 0 && (
        <div className="flex items-center gap-2 border-t border-border bg-muted px-2 py-1.5 text-[11px]">
          <span className="text-muted-foreground">
            <span className="font-mono tabular-nums text-foreground">{validSelection.size}</span>{" "}
            selecionado{validSelection.size === 1 ? "" : "s"}
          </span>
          <button
            type="button"
            onClick={() => setSelection(new Set())}
            className="text-[10px] uppercase tracking-[0.1em] text-muted-foreground hover:text-foreground"
          >
            limpar
          </button>
          <div className="ml-auto flex items-center gap-1">
            {(selUnstaged.length > 0 || selUntracked.length > 0) && (
              <button
                type="button"
                onClick={() => void bulkStage()}
                className="flex items-center gap-1 border border-border px-2 py-1 text-[10px] uppercase tracking-[0.08em] transition-colors hover:bg-[color:var(--added)]/10 hover:text-[color:var(--added)]"
                title={`Stage ${selUnstaged.length + selUntracked.length}`}
              >
                <Plus className="size-3" />
                Stage
              </button>
            )}
            {selStaged.length > 0 && (
              <button
                type="button"
                onClick={() => void bulkUnstage()}
                className="flex items-center gap-1 border border-border px-2 py-1 text-[10px] uppercase tracking-[0.08em] hover:bg-background"
                title={`Unstage ${selStaged.length}`}
              >
                <Minus className="size-3" />
                Unstage
              </button>
            )}
            {selDiscardable.length > 0 && (
              <button
                type="button"
                onClick={requestBulkDiscard}
                className="flex items-center gap-1 border border-border px-2 py-1 text-[10px] uppercase tracking-[0.08em] text-[color:var(--destructive)] hover:bg-[color:var(--destructive)]/10"
                title={`Descartar ${selDiscardable.length}`}
              >
                <Trash2 className="size-3" />
                Descartar
              </button>
            )}
          </div>
        </div>
      )}

      <div className="border-t border-border p-2">
        <Textarea
          placeholder="Mensagem do commit"
          value={message}
          onChange={(e) => setMessage(e.target.value)}
          onKeyDown={(e) => {
            if ((e.metaKey || e.ctrlKey) && e.key === "Enter") {
              e.preventDefault();
              void submit();
            }
          }}
          rows={3}
          className="resize-none border-border text-[12px]"
        />
        <motion.button
          type="button"
          disabled={!message.trim() || stagedCount === 0 || committing}
          onClick={() => void submit()}
          title="Commit (⌘↵)"
          whileTap={{ scale: 0.96 }}
          animate={
            justCommitted
              ? { scale: [1, 1.04, 1], transition: { duration: 0.45, ease: "easeOut" } }
              : { scale: 1 }
          }
          transition={{ type: "spring", stiffness: 600, damping: 28 }}
          className="relative mt-2 flex h-11 w-full items-center justify-between overflow-hidden border border-border bg-foreground px-3 text-[11px] font-medium uppercase tracking-[0.1em] text-background transition-opacity hover:opacity-80 disabled:cursor-not-allowed disabled:opacity-30"
        >
          <AnimatePresence>
            {justCommitted && (
              <motion.span
                key="flash"
                initial={{ scale: 0, opacity: 0.6 }}
                animate={{ scale: 4, opacity: 0 }}
                exit={{ opacity: 0 }}
                transition={{ duration: 0.7, ease: "easeOut" }}
                className="pointer-events-none absolute left-1/2 top-1/2 size-16 -translate-x-1/2 -translate-y-1/2 rounded-full bg-[color:var(--added)]"
              />
            )}
          </AnimatePresence>
          <AnimatePresence mode="wait" initial={false}>
            {committing ? (
              <motion.span
                key="loading"
                initial={{ opacity: 0, y: 4 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -4 }}
                transition={{ duration: 0.16 }}
                className="mx-auto flex items-center"
              >
                <Loader2 className="size-3.5 animate-spin" />
              </motion.span>
            ) : justCommitted ? (
              <motion.span
                key="done"
                initial={{ opacity: 0, scale: 0.6 }}
                animate={{ opacity: 1, scale: 1 }}
                exit={{ opacity: 0, scale: 0.6 }}
                transition={{ type: "spring", stiffness: 500, damping: 20 }}
                className="relative z-10 mx-auto flex items-center gap-1.5"
              >
                <Check className="size-3.5" strokeWidth={3} />
                <span>Commited</span>
              </motion.span>
            ) : (
              <motion.span
                key="idle"
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                transition={{ duration: 0.14 }}
                className="relative z-10 flex w-full items-center justify-between"
              >
                <span>Commit</span>
                <KbdGroup className="opacity-70">
                  <Kbd className="bg-background/20 text-background">⌘</Kbd>
                  <Kbd className="bg-background/20 text-background">↵</Kbd>
                </KbdGroup>
              </motion.span>
            )}
          </AnimatePresence>
        </motion.button>
      </div>

      {pendingDiscard && (
        <DiscardConfirmDialog
          files={pendingDiscard}
          onCancel={() => setPendingDiscard(null)}
          onConfirm={() => void confirmDiscard()}
        />
      )}
    </div>
  );
}

interface GroupProps {
  label: string;
  kind: GroupKind;
  files: FileChange[];
  selected: FileChange | null;
  selection: Set<string>;
  onSelect: (f: FileChange) => void;
  onToggleSel: (k: string) => void;
  onSetGroupSel: (files: FileChange[], all: boolean) => void;
  onAction: (f: FileChange) => Promise<void>;
  onDiscard?: (f: FileChange) => void;
  onGroupAction: () => void;
  onGroupDiscard?: () => void;
}

function FileGroup({
  label,
  kind,
  files,
  selected,
  selection,
  onSelect,
  onToggleSel,
  onSetGroupSel,
  onAction,
  onDiscard,
  onGroupAction,
  onGroupDiscard,
}: GroupProps) {
  const [collapsed, setCollapsed] = useState(false);
  if (files.length === 0) return null;

  const allSelected = files.every((f) => selection.has(fileKey(f)));
  const someSelected = !allSelected && files.some((f) => selection.has(fileKey(f)));

  return (
    <div>
      <div className="sticky top-0 z-10 flex items-center justify-between gap-2 border-b border-border bg-muted px-3 py-1.5 text-[10px] font-medium uppercase tracking-[0.1em] text-muted-foreground">
        <button
          type="button"
          onClick={() => setCollapsed((c) => !c)}
          className="flex items-center gap-1.5 transition-colors hover:text-foreground"
          title={collapsed ? "Expandir" : "Recolher"}
        >
          {collapsed ? (
            <ChevronRight className="size-3" />
          ) : (
            <ChevronDown className="size-3" />
          )}
          <span>{label}</span>
        </button>
        <span className="flex items-center gap-1">
          <span className="tabular-nums">{files.length}</span>
          <button
            type="button"
            onClick={onGroupAction}
            className={cn(
              "ml-1 flex size-5 items-center justify-center border border-border text-muted-foreground transition-colors",
              kind === "staged"
                ? "hover:bg-background hover:text-foreground"
                : "hover:bg-[color:var(--added)]/10 hover:text-[color:var(--added)]",
            )}
            title={kind === "staged" ? "Unstage todos" : "Stage todos"}
            aria-label={kind === "staged" ? "Unstage todos" : "Stage todos"}
          >
            {kind === "staged" ? <Minus className="size-3" /> : <Plus className="size-3" />}
          </button>
          {onGroupDiscard && (
            <button
              type="button"
              onClick={onGroupDiscard}
              className="flex size-5 items-center justify-center border border-border text-muted-foreground transition-colors hover:bg-[color:var(--destructive)]/10 hover:text-[color:var(--destructive)]"
              title="Descartar todos"
              aria-label="Descartar todos"
            >
              <Trash2 className="size-3" />
            </button>
          )}
          <Checkbox
            className="ml-1"
            checked={allSelected ? true : someSelected ? "indeterminate" : false}
            onCheckedChange={(v) => onSetGroupSel(files, v === true)}
            title="Selecionar todos"
            aria-label="Selecionar todos"
          />
        </span>
      </div>
      {!collapsed && (
        <ul>
          {files.map((f) => {
            const k = fileKey(f);
            const isSelected = selected?.path === f.path && selected.staged === f.staged;
            const isChecked = selection.has(k);
            return (
              <li key={k}>
                <div
                  className={cn(
                    "group relative flex w-full items-center gap-2 px-3 py-1.5 text-left text-[11px] transition-colors hover:bg-accent",
                    isSelected && "bg-accent",
                  )}
                >
                  {isSelected && (
                    <span className="absolute inset-y-0 left-0 w-0.5 bg-foreground" />
                  )}
                  <Checkbox
                    checked={isChecked}
                    onCheckedChange={() => onToggleSel(k)}
                    onClick={(e) => e.stopPropagation()}
                    aria-label="Selecionar arquivo"
                  />
                  <button
                    type="button"
                    onClick={() => onSelect(f)}
                    className="flex min-w-0 flex-1 items-center gap-2 text-left"
                    title={f.path}
                  >
                    <StatusBadge status={f.status} />
                    <span className="min-w-0 flex-1 truncate font-mono">{f.path}</span>
                  </button>
                  <span className="flex shrink-0 items-center gap-1">
                    <button
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation();
                        void onAction(f);
                      }}
                      className={cn(
                        "flex size-5 items-center justify-center border border-border text-muted-foreground transition-colors",
                        kind === "staged"
                          ? "hover:bg-background hover:text-foreground"
                          : "hover:bg-[color:var(--added)]/10 hover:text-[color:var(--added)]",
                      )}
                      title={kind === "staged" ? "Unstage" : "Stage"}
                      aria-label={kind === "staged" ? "Unstage" : "Stage"}
                    >
                      {kind === "staged" ? (
                        <Minus className="size-3" />
                      ) : (
                        <Plus className="size-3" />
                      )}
                    </button>
                    {onDiscard && (
                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation();
                          onDiscard(f);
                        }}
                        className="flex size-5 items-center justify-center border border-border text-muted-foreground transition-colors hover:bg-[color:var(--destructive)]/10 hover:text-[color:var(--destructive)]"
                        title="Descartar"
                        aria-label="Descartar"
                      >
                        <Trash2 className="size-3" />
                      </button>
                    )}
                  </span>
                </div>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}

function DiscardConfirmDialog({
  files,
  onCancel,
  onConfirm,
}: {
  files: FileChange[];
  onCancel: () => void;
  onConfirm: () => void;
}) {
  const hasUntracked = files.some((f) => f.status === "untracked");
  return (
    <div className="absolute inset-0 z-50 flex items-center justify-center bg-background/80 p-4">
      <div className="w-full max-w-sm border border-border bg-card p-4 shadow-lg">
        <h3 className="text-sm font-semibold uppercase tracking-[0.1em]">
          Descartar {files.length === 1 ? "arquivo" : `${files.length} arquivos`}?
        </h3>
        <p className="mt-2 text-[11px] text-muted-foreground">
          {hasUntracked
            ? "Arquivos untracked serão removidos do disco. Mudanças locais serão revertidas."
            : "As mudanças locais serão revertidas. Não há como desfazer."}
        </p>
        <ul className="mt-2 max-h-32 overflow-auto border border-border bg-background/40 p-2 font-mono text-[10px]">
          {files.map((f) => (
            <li key={fileKey(f)} className="truncate">
              {f.path}
            </li>
          ))}
        </ul>
        <div className="mt-3 flex justify-end gap-2">
          <button
            type="button"
            onClick={onCancel}
            className="border border-border px-3 py-1 text-[11px] uppercase tracking-[0.1em] hover:bg-accent"
          >
            Cancelar
          </button>
          <button
            type="button"
            onClick={onConfirm}
            className="border border-[color:var(--destructive)] bg-[color:var(--destructive)]/10 px-3 py-1 text-[11px] uppercase tracking-[0.1em] text-[color:var(--destructive)] hover:bg-[color:var(--destructive)]/20"
          >
            Descartar
          </button>
        </div>
      </div>
    </div>
  );
}

function StatusBadge({ status }: { status: string }) {
  const map: Record<string, { char: string; color: string }> = {
    added: { char: "A", color: "var(--added)" },
    modified: { char: "M", color: "var(--modified)" },
    deleted: { char: "D", color: "var(--deleted)" },
    untracked: { char: "?", color: "var(--untracked)" },
    conflict: { char: "!", color: "var(--destructive)" },
    renamed: { char: "R", color: "var(--modified)" },
  };
  const it = map[status] ?? { char: "·", color: "var(--muted-foreground)" };
  return (
    <span
      className="flex size-4 shrink-0 items-center justify-center text-[10px] font-bold tabular-nums"
      style={{ color: it.color }}
    >
      {it.char}
    </span>
  );
}
