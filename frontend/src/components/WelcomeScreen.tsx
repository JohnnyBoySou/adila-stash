import { useState } from "react";
import { motion } from "framer-motion";
import { Cloud, FolderGit2, FolderOpen, FolderSearch, GitBranch, Loader2 } from "lucide-react";

import { AsciiGlitch } from "@/components/AsciiGlitch";
import { CloneRepoDialog } from "@/components/CloneRepoDialog";
import { Logo } from "@/components/Logo";
import { Kbd, KbdGroup } from "@/components/ui/kbd";
import { ScrollArea } from "@/components/ui/scroll-area";
import { git } from "@/lib/git";
import { useRepo } from "@/lib/repo-context";
import { useRepoOrgStore } from "@/lib/repo-org-store";

interface WelcomeScreenProps {
  targetCollectionId?: string | null;
}

export function WelcomeScreen({ targetCollectionId = null }: WelcomeScreenProps = {}) {
  const { repos, hydrated, setActivePath, addRepo } = useRepo();
  const collections = useRepoOrgStore((s) => s.collections);
  const assignToCollection = useRepoOrgStore((s) => s.assignToCollection);
  const targetCollection = targetCollectionId
    ? collections.find((c) => c.id === targetCollectionId) ?? null
    : null;
  const [error, setError] = useState<string | null>(null);
  const [cloneOpen, setCloneOpen] = useState(false);
  const [picking, setPicking] = useState(false);

  async function handlePick() {
    if (picking) return;
    setError(null);
    setPicking(true);
    try {
      const path = await git.pickRepoFolder();
      if (!path) return;
      await addRepo(path);
      if (targetCollection) assignToCollection(path, targetCollection.id);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setPicking(false);
    }
  }

  return (
    <div className="flex h-full w-full flex-1 items-start justify-center overflow-y-auto">
      <div className="w-full max-w-2xl px-8 py-12">
        <motion.header
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.24, ease: "easeOut" }}
          className="mb-8 flex flex-col items-center gap-3"
        >
          <Logo className="h-16 w-auto" />
          <AsciiGlitch />
          <p className="text-center text-[13px] text-muted-foreground">
            Escolha um repositório para continuar, ou adicione um novo.
          </p>
          {targetCollection && (
            <div className="flex items-center gap-2 border border-border bg-card px-3 py-1.5 text-[11px] text-muted-foreground">
              <span className="text-[10px] uppercase tracking-[0.12em]">
                Adicionando em
              </span>
              <span className="font-mono text-foreground">{targetCollection.name}</span>
            </div>
          )}
        </motion.header>

        <motion.section
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.24, ease: "easeOut", delay: 0.04 }}
          className="mb-8"
        >
          <div className="mb-2 flex items-center justify-between">
            <h2 className="text-[10px] font-medium uppercase tracking-[0.12em] text-muted-foreground">
              Repositórios salvos
            </h2>
            {repos.length > 0 && (
              <span className="text-[11px] tabular-nums text-muted-foreground">
                {repos.length}
              </span>
            )}
          </div>

          {!hydrated && (
            <div className="flex h-32 items-center justify-center border border-border bg-card text-[12px] text-muted-foreground">
              <Loader2 className="mr-2 size-3.5 animate-spin" />
              Reabrindo repositórios…
            </div>
          )}

          {hydrated && repos.length === 0 && (
            <div className="flex h-32 flex-col items-center justify-center gap-1 border border-dashed border-border bg-card text-[12px] text-muted-foreground">
              <FolderOpen className="size-5" />
              <span>Nenhum repositório salvo ainda.</span>
              <span className="text-[11px]">Adicione abaixo para começar.</span>
            </div>
          )}

          {hydrated && repos.length > 0 && (
            <ScrollArea className="max-h-[50vh]">
              <ul className="grid gap-2">
                {repos.map((r, i) => (
                  <motion.li
                    key={r.path}
                    initial={{ opacity: 0, y: 4 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{
                      duration: 0.18,
                      delay: Math.min(i * 0.025, 0.25),
                      ease: "easeOut",
                    }}
                  >
                    <button
                      type="button"
                      onClick={() => setActivePath(r.path)}
                      className="group flex w-full items-center gap-3 border border-border bg-card px-4 py-3 text-left transition-all hover:border-foreground hover:bg-accent"
                    >
                      <div className="flex size-9 shrink-0 items-center justify-center border border-border bg-background text-muted-foreground transition-colors group-hover:text-foreground">
                        <FolderGit2 className="size-4" />
                      </div>
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-2">
                          <span className="truncate text-[13px] font-medium">{r.name}</span>
                          {r.hasChanges && (
                            <span
                              className="size-1.5 shrink-0"
                              style={{ background: "var(--modified)" }}
                              title="Alterações pendentes"
                            />
                          )}
                        </div>
                        <div className="mt-0.5 flex items-center gap-2 truncate font-mono text-[10px] text-muted-foreground">
                          <span className="flex items-center gap-1">
                            <GitBranch className="size-2.5" />
                            {r.currentBranch || "—"}
                          </span>
                          <span>·</span>
                          <span className="truncate">{r.path}</span>
                        </div>
                      </div>
                      <span className="text-[10px] uppercase tracking-[0.1em] text-muted-foreground opacity-0 transition-opacity group-hover:opacity-100">
                        Abrir
                      </span>
                    </button>
                  </motion.li>
                ))}
              </ul>
            </ScrollArea>
          )}
        </motion.section>

        <motion.section
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.24, ease: "easeOut", delay: 0.08 }}
        >
          <h2 className="mb-2 text-[10px] font-medium uppercase tracking-[0.12em] text-muted-foreground">
            Adicionar novo
          </h2>
          <div className="space-y-2">
            <div className="grid grid-cols-2 gap-2">
              <button
                type="button"
                onClick={() => void handlePick()}
                disabled={picking}
                title="Selecionar pasta (⌘O)"
                className="flex h-9 w-full items-center justify-center gap-2 border border-border px-3 text-[11px] font-medium uppercase tracking-[0.08em] text-muted-foreground transition-colors hover:bg-accent hover:text-foreground disabled:opacity-40"
              >
                {picking ? (
                  <Loader2 className="size-3.5 animate-spin" />
                ) : (
                  <FolderSearch className="size-3.5" />
                )}
                Selecionar pasta
                <KbdGroup className="ml-1">
                  <Kbd>⌘</Kbd>
                  <Kbd>O</Kbd>
                </KbdGroup>
              </button>
              <button
                type="button"
                onClick={() => setCloneOpen(true)}
                className="flex h-9 w-full items-center justify-center gap-2 border border-border px-3 text-[11px] font-medium uppercase tracking-[0.08em] text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
              >
                <Cloud className="size-3.5" />
                Clonar do GitHub
              </button>
            </div>
            {error && <p className="font-mono text-[10px] text-destructive">{error}</p>}
          </div>
        </motion.section>

        <CloneRepoDialog
          open={cloneOpen}
          onClose={() => setCloneOpen(false)}
          onCloned={async (path) => {
            await addRepo(path);
            if (targetCollection) assignToCollection(path, targetCollection.id);
          }}
        />
      </div>
    </div>
  );
}
