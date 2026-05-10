import { createFileRoute } from "@tanstack/react-router";
import { AnimatePresence, motion } from "framer-motion";

import { ChangesPanel } from "@/components/ChangesPanel";
import { DiffViewer } from "@/components/DiffViewer";
import { ResizableX } from "@/components/ResizableX";
import { useRepo } from "@/lib/repo-context";

export const Route = createFileRoute("/_layout/changes")({
  component: ChangesView,
});

function ChangesView() {
  const {
    status,
    statusBusy,
    selectedFile,
    setSelectedFile,
    diff,
    diffBusy,
    stage,
    unstage,
    discardFile,
    stageMany,
    unstageMany,
    discardMany,
    commit,
  } = useRepo();

  return (
    <>
      <ResizableX
        storageKey="stash:sidebar-width:changes"
        defaultWidth={320}
        min={220}
        max={560}
      >
        <ChangesPanel
          status={status}
          selected={selectedFile}
          onSelect={setSelectedFile}
          onStage={stage}
          onUnstage={unstage}
          onDiscard={discardFile}
          onStageMany={stageMany}
          onUnstageMany={unstageMany}
          onDiscardMany={discardMany}
          onCommit={commit}
          busy={statusBusy}
        />
      </ResizableX>
      <AnimatePresence mode="wait" initial={false}>
        <motion.div
          key={selectedFile?.path ?? "none"}
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.14, ease: "easeOut" }}
          className="flex flex-1 overflow-hidden"
        >
          <DiffViewer diff={diff} loading={diffBusy} />
        </motion.div>
      </AnimatePresence>
    </>
  );
}
