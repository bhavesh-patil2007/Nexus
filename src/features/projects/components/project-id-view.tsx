"use client";

import { useRef, useState } from "react";
import { Allotment } from "allotment";

import { cn } from "@/lib/utils";
import { EditorView } from "@/features/editor/components/editor-view";

import { FileExplorer } from "./file-explorer";
import { PreviewView } from "./preview-view";
import { Id } from "../../../../convex/_generated/dataModel";
import { ExportPopover } from "./export-popover";

const MIN_SIDEBAR_WIDTH = 200;
const MAX_SIDEBAR_WIDTH = 800;
const DEFAULT_SIDEBAR_WIDTH = 350;
const DEFAULT_MAIN_SIZE = 1000;

const Tab = ({
  label,
  isActive,
  onClick,
  onKeyDown,
  tabRef,
}: {
  label: string;
  isActive: boolean;
  onClick: () => void;
  onKeyDown?: (e: React.KeyboardEvent<HTMLDivElement>) => void;
  tabRef?: (el: HTMLDivElement | null) => void;
}) => {
  return (
    <div
      ref={tabRef}
      role="tab"
      aria-selected={isActive}
      tabIndex={isActive ? 0 : -1}
      onClick={onClick}
      onKeyDown={onKeyDown}
      className={cn(
        "flex items-center gap-2 h-full px-3 cursor-pointer text-muted-foreground border-r hover:bg-accent/30 outline-none focus-visible:ring-1 focus-visible:ring-ring focus-visible:ring-inset",
        isActive && "bg-background text-foreground",
      )}
    >
      <span className="text-sm">{label}</span>
    </div>
  );
};

export const ProjectIdView = ({ projectId }: { projectId: Id<"projects"> }) => {
  const [activeView, setActiveView] = useState<"editor" | "preview">("editor");
  const editorTabRef = useRef<HTMLDivElement | null>(null);
  const previewTabRef = useRef<HTMLDivElement | null>(null);

  const views: Array<"editor" | "preview"> = ["editor", "preview"];

  const handleKeyDown = (
    e: React.KeyboardEvent<HTMLDivElement>,
    currentView: "editor" | "preview"
  ) => {
    const currentIndex = views.indexOf(currentView);
    let targetIndex = -1;

    switch (e.key) {
      case "ArrowRight":
      case "ArrowDown":
        e.preventDefault();
        targetIndex = (currentIndex + 1) % views.length;
        break;
      case "ArrowLeft":
      case "ArrowUp":
        e.preventDefault();
        targetIndex = (currentIndex - 1 + views.length) % views.length;
        break;
      case "Home":
        e.preventDefault();
        targetIndex = 0;
        break;
      case "End":
        e.preventDefault();
        targetIndex = views.length - 1;
        break;
      case "Enter":
      case " ":
        e.preventDefault();
        setActiveView(currentView);
        return;
      default:
        return;
    }

    if (targetIndex >= 0 && targetIndex < views.length) {
      const targetView = views[targetIndex];
      const targetEl = targetView === "editor" ? editorTabRef.current : previewTabRef.current;
      if (targetEl) {
        targetEl.focus();
      }
    }
  };

  return (
    <div className="h-full flex flex-col">
      <nav role="tablist" aria-label="Project views" className="h-8.75 flex items-center bg-sidebar border-b">
        <Tab
          label="Code"
          isActive={activeView === "editor"}
          onClick={() => setActiveView("editor")}
          tabRef={(el) => {
            editorTabRef.current = el;
          }}
          onKeyDown={(e) => handleKeyDown(e, "editor")}
        />
        <Tab
          label="Preview"
          isActive={activeView === "preview"}
          onClick={() => setActiveView("preview")}
          tabRef={(el) => {
            previewTabRef.current = el;
          }}
          onKeyDown={(e) => handleKeyDown(e, "preview")}
        />
        <div className="flex-1 flex justify-end h-full">
          <ExportPopover projectId={projectId} />
        </div>
      </nav>
      <div className="flex-1 relative">
        <div
          className={cn(
            "absolute inset-0",
            activeView === "editor" ? "visible" : "invisible",
          )}
        >
          <Allotment defaultSizes={[DEFAULT_SIDEBAR_WIDTH, DEFAULT_MAIN_SIZE]}>
            <Allotment.Pane
              snap
              minSize={MIN_SIDEBAR_WIDTH}
              maxSize={MAX_SIDEBAR_WIDTH}
              preferredSize={DEFAULT_SIDEBAR_WIDTH}
            >
              <FileExplorer projectId={projectId} />
            </Allotment.Pane>
            <Allotment.Pane>
              <EditorView projectId={projectId} />
            </Allotment.Pane>
          </Allotment>
        </div>
        <div
          className={cn(
            "absolute inset-0",
            activeView === "preview" ? "visible" : "invisible",
          )}
        >
          <PreviewView projectId={projectId} />
        </div>
      </div>
    </div>
  );
};
