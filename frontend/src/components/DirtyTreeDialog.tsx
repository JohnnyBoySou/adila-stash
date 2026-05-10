import { useState } from "react";
import { AlertTriangle, Archive, Loader2, Trash2 } from "lucide-react";

import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { extractErrorMessage } from "@/lib/git";

export const DIRTY_TREE_MESSAGE = "a árvore de trabalho tem alterações não commitadas";

export function isDirtyTreeError(e: unknown): boolean {
  return extractErrorMessage(e).toLowerCase().includes("alterações não commitadas");
}

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Descrição da ação que disparou o conflito (ex.: "trocar para `feature`"). */
  intent: string;
  onStash: () => Promise<void>;
  onDiscard: () => Promise<void>;
}

type Mode = "stash" | "discard" | null;

export function DirtyTreeDialog({ open, onOpenChange, intent, onStash, onDiscard }: Props) {
  const [busy, setBusy] = useState<Mode>(null);
  const [error, setError] = useState<string | null>(null);

  async function run(mode: "stash" | "discard", fn: () => Promise<void>) {
    setBusy(mode);
    setError(null);
    try {
      await fn();
      onOpenChange(false);
    } catch (e) {
      setError(extractErrorMessage(e));
    } finally {
      setBusy(null);
    }
  }

  function handleOpenChange(next: boolean) {
    if (busy) return;
    if (!next) setError(null);
    onOpenChange(next);
  }

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent className="sm:max-w-md" showCloseButton={!busy}>
        <DialogHeader>
          <div className="flex items-center gap-2">
            <AlertTriangle className="size-4 text-[color:var(--deleted)]" />
            <DialogTitle>Alterações não commitadas</DialogTitle>
          </div>
          <DialogDescription>
            Você tem alterações locais que impedem {intent}. Como deseja prosseguir?
          </DialogDescription>
        </DialogHeader>

        <div className="flex flex-col gap-2">
          <button
            type="button"
            disabled={!!busy}
            onClick={() => void run("stash", onStash)}
            className="group flex items-start gap-3 rounded-md border border-border bg-card px-3 py-2.5 text-left transition-colors hover:bg-accent disabled:opacity-50"
          >
            <span className="mt-0.5 flex size-7 shrink-0 items-center justify-center rounded-md bg-muted text-muted-foreground group-hover:text-foreground">
              {busy === "stash" ? (
                <Loader2 className="size-3.5 animate-spin" />
              ) : (
                <Archive className="size-3.5" />
              )}
            </span>
            <div className="flex-1">
              <p className="text-[12px] font-medium">Fazer stash e continuar</p>
              <p className="text-[11px] text-muted-foreground">
                Guarda suas alterações no stash. Depois você pode recuperá-las com pop.
              </p>
            </div>
          </button>

          <button
            type="button"
            disabled={!!busy}
            onClick={() => void run("discard", onDiscard)}
            className="group flex items-start gap-3 rounded-md border border-border bg-card px-3 py-2.5 text-left transition-colors hover:bg-[color:var(--deleted)]/10 disabled:opacity-50"
          >
            <span className="mt-0.5 flex size-7 shrink-0 items-center justify-center rounded-md bg-muted text-[color:var(--deleted)]">
              {busy === "discard" ? (
                <Loader2 className="size-3.5 animate-spin" />
              ) : (
                <Trash2 className="size-3.5" />
              )}
            </span>
            <div className="flex-1">
              <p className="text-[12px] font-medium text-[color:var(--deleted)]">
                Descartar alterações e continuar
              </p>
              <p className="text-[11px] text-muted-foreground">
                Reseta o working tree e remove arquivos não rastreados. Não pode ser desfeito.
              </p>
            </div>
          </button>
        </div>

        {error && (
          <p className="text-[11px] text-[color:var(--deleted)]">{error}</p>
        )}

        <DialogFooter>
          <Button
            variant="ghost"
            size="sm"
            onClick={() => handleOpenChange(false)}
            disabled={!!busy}
          >
            Cancelar
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
