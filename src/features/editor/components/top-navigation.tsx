import { ScrollArea, ScrollBar } from "@/components/ui/scroll-area"

import { useFile } from "@/features/projects/hooks/use-files";

import { useEditor } from "../hooks/use-editor";
import { Id } from "../../../../convex/_generated/dataModel";
import { cn } from "@/lib/utils";
import { Spinner } from "@/components/ui/spinner";
import { FileIcon } from "@react-symbols/icons/utils";
import { XIcon } from "lucide-react";

const Tab = ({
  fileId,
  isFirst,
  projectId,
}: {
  fileId: Id<"files">;
  isFirst: boolean;
  projectId: Id<"projects">;
}) => {
  const file = useFile(fileId);
  const {
    activeTabId,
    previewTabId,
    setActiveTab,
    openFile,
    closeTab,
    isFileDirty,
    getTabData,
  } = useEditor(projectId);

  const isActive = activeTabId === fileId;
  const isPreview = previewTabId === fileId;
  const isDirty = isFileDirty(fileId);
  const tabData = getTabData(fileId);
  const hasConflict = tabData?.hasConflict ?? false;
  const isSaving = tabData?.isSaving ?? false;
  const fileName = file?.name ?? "Loading...";

  return (
    <div
      onClick={() => setActiveTab(fileId)}
      onDoubleClick={() => openFile(fileId, { pinned: true })}
      className={cn(
        "flex items-center gap-2 h-8.75 pl-2 pr-1.5 cursor-pointer text-muted-foreground group border-y border-x border-transparent hover:bg-accent/30",
        isActive &&
          "bg-background text-foreground border-x-border border-b-background -mb-px drop-shadow",
        isFirst && "border-l-transparent!"
      )}
    >
      {file === undefined ? (
        <Spinner className="text-ring" />
      ) : (
        <FileIcon fileName={fileName} autoAssign className="size-4" />
      )}
      <span className={cn(
        "text-sm whitespace-nowrap",
        isPreview && "italic"
      )}>
        {fileName}
      </span>
      {/* Dirty / Conflict / Saving indicator */}
      {hasConflict ? (
        <span
          className="size-2 rounded-full bg-red-500 shrink-0"
          title="External update conflict"
        />
      ) : isSaving ? (
        <span
          className="size-2 rounded-full bg-blue-500 animate-pulse shrink-0"
          title="Saving..."
        />
      ) : isDirty ? (
        <span
          className="size-2 rounded-full bg-amber-500 shrink-0"
          title="Unsaved changes"
        />
      ) : null}
      <button
        onClick={(e) => {
          e.preventDefault();
          e.stopPropagation();
          closeTab(fileId);
        }}
        onKeyDown={(e) => {
          if (e.key === "Enter" || e.key === " ") {
            e.preventDefault();
            e.stopPropagation();
            closeTab(fileId);
          }
        }}
        className={cn(
          "p-0.5 rounded-sm hover:bg-white/10 opacity-0 group-hover:opacity-100",
          isActive && "opacity-100"
        )}
      >
        <XIcon className="size-3.5" />
      </button>
    </div>
  );
};

export const TopNavigation = ({ 
  projectId
}: { 
  projectId: Id<"projects">
}) => {
  const { openTabs } = useEditor(projectId);

  return (
    <ScrollArea className="flex-1">
      <nav className="bg-sidebar flex items-center h-8.75 border-b">
        {openTabs.map((fileId, index) => (
          <Tab
            key={fileId}
            fileId={fileId}
            isFirst={index === 0}
            projectId={projectId}
          />
        ))}
      </nav>
      <ScrollBar orientation="horizontal" />
    </ScrollArea>
  );
};