import { useCallback, useEffect, useRef } from "react";
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
  tabRef,
  onKeyDown,
}: {
  fileId: Id<"files">;
  isFirst: boolean;
  projectId: Id<"projects">;
  tabRef?: (el: HTMLDivElement | null) => void;
  onKeyDown: (e: React.KeyboardEvent<HTMLDivElement>, fileId: Id<"files">) => void;
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
      ref={tabRef}
      role="tab"
      aria-selected={isActive}
      tabIndex={isActive ? 0 : -1}
      onClick={() => setActiveTab(fileId)}
      onDoubleClick={() => openFile(fileId, { pinned: true })}
      onKeyDown={(e) => onKeyDown(e, fileId)}
      className={cn(
        "flex items-center gap-2 h-8.75 pl-2 pr-1.5 cursor-pointer text-muted-foreground group border-y border-x border-transparent hover:bg-accent/30 outline-none focus-visible:ring-1 focus-visible:ring-ring focus-visible:ring-inset",
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
        aria-label={`Close ${fileName}`}
        title={`Close ${fileName}`}
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
  const { openTabs, activeTabId, setActiveTab, closeTab } = useEditor(projectId);
  const tabElementsRef = useRef<Map<Id<"files">, HTMLDivElement | null>>(new Map());

  // Handle Ctrl+W / Cmd+W shortcut to close active tab
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "w") {
        // Protect input fields, textareas, contenteditable elements, and CodeMirror editors
        const target = e.target;
        if (target && target instanceof Element) {
          const tagName = target.tagName;
          if (
            tagName === "INPUT" ||
            tagName === "TEXTAREA" ||
            tagName === "SELECT" ||
            (target as HTMLElement).isContentEditable ||
            target.closest(".cm-editor") !== null ||
            target.closest(".cm-content") !== null ||
            target.closest("[contenteditable='true']") !== null
          ) {
            return;
          }
        }

        if (activeTabId && openTabs.includes(activeTabId)) {
          e.preventDefault();
          closeTab(activeTabId);
        }
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => {
      window.removeEventListener("keydown", handleKeyDown);
    };
  }, [activeTabId, openTabs, closeTab]);

  const handleTabKeyDown = useCallback(
    (e: React.KeyboardEvent<HTMLDivElement>, fileId: Id<"files">) => {
      const currentIndex = openTabs.indexOf(fileId);
      if (currentIndex === -1) return;

      let targetIndex = -1;

      switch (e.key) {
        case "ArrowRight":
          e.preventDefault();
          targetIndex = (currentIndex + 1) % openTabs.length;
          break;
        case "ArrowLeft":
          e.preventDefault();
          targetIndex = (currentIndex - 1 + openTabs.length) % openTabs.length;
          break;
        case "Home":
          e.preventDefault();
          targetIndex = 0;
          break;
        case "End":
          e.preventDefault();
          targetIndex = openTabs.length - 1;
          break;
        case "Enter":
        case " ":
          e.preventDefault();
          setActiveTab(fileId);
          return;
        default:
          return;
      }

      if (targetIndex >= 0 && targetIndex < openTabs.length) {
        const targetFileId = openTabs[targetIndex];
        const targetElement = tabElementsRef.current.get(targetFileId);
        if (targetElement) {
          targetElement.focus();
        }
      }
    },
    [openTabs, setActiveTab]
  );

  return (
    <ScrollArea className="flex-1">
      <nav role="tablist" aria-label="Open files" className="bg-sidebar flex items-center h-8.75 border-b">
        {openTabs.map((fileId, index) => (
          <Tab
            key={fileId}
            fileId={fileId}
            isFirst={index === 0}
            projectId={projectId}
            tabRef={(el) => {
              if (el) {
                tabElementsRef.current.set(fileId, el);
              } else {
                tabElementsRef.current.delete(fileId);
              }
            }}
            onKeyDown={handleTabKeyDown}
          />
        ))}
      </nav>
      <ScrollBar orientation="horizontal" />
    </ScrollArea>
  );
};