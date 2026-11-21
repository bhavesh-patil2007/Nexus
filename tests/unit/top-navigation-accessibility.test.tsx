// @vitest-environment jsdom
import { describe, expect, it, vi, beforeEach } from "vitest";
import React from "react";
import { render, screen, fireEvent, act, waitFor } from "@testing-library/react";

// Polyfill ResizeObserver and scrollIntoView for jsdom (needed by Radix / cmdk)
global.ResizeObserver = class ResizeObserver {
  observe() {}
  unobserve() {}
  disconnect() {}
};

if (typeof window !== "undefined") {
  window.HTMLElement.prototype.scrollIntoView = vi.fn();
}

// Mock convex file hooks
const mockFiles: Record<string, { _id: string; name: string }> = {
  file_1: { _id: "file_1", name: "App.tsx" },
  file_2: { _id: "file_2", name: "index.ts" },
  file_3: { _id: "file_3", name: "styles.css" },
};

let mockProjectFilesList: Array<{
  _id: string;
  name: string;
  type: "file" | "folder";
  parentId?: string;
  projectId: string;
}> | undefined = [];

vi.mock("@/features/projects/hooks/use-files", () => ({
  useFile: (fileId: string) => mockFiles[fileId] || undefined,
  useFiles: () => mockProjectFilesList,
}));

// Mock useEditor hook
const mockCloseTab = vi.fn();
const mockSetActiveTab = vi.fn();
const mockOpenFile = vi.fn();

let mockOpenTabs: string[] = ["file_1", "file_2"];
let mockActiveTabId: string | null = "file_1";

vi.mock("@/features/editor/hooks/use-editor", () => ({
  useEditor: () => ({
    openTabs: mockOpenTabs,
    activeTabId: mockActiveTabId,
    previewTabId: null,
    setActiveTab: mockSetActiveTab,
    openFile: mockOpenFile,
    closeTab: mockCloseTab,
    isFileDirty: () => false,
    getTabData: () => undefined,
  }),
}));

// Mock child views in ProjectIdView
vi.mock("@/features/projects/components/file-explorer", () => ({
  FileExplorer: () => <div data-testid="file-explorer" />,
}));
vi.mock("@/features/editor/components/editor-view", () => ({
  EditorView: () => <div data-testid="editor-view" />,
}));
vi.mock("@/features/projects/components/preview-view", () => ({
  PreviewView: () => <div data-testid="preview-view" />,
}));
vi.mock("@/features/projects/components/export-popover", () => ({
  ExportPopover: () => <div data-testid="export-popover" />,
}));
vi.mock("allotment", () => ({
  Allotment: Object.assign(
    ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
    { Pane: ({ children }: { children: React.ReactNode }) => <div>{children}</div> }
  ),
}));

import { TopNavigation } from "@/features/editor/components/top-navigation";
import { ProjectIdView } from "@/features/projects/components/project-id-view";
import { Id } from "@/../convex/_generated/dataModel";

describe("TopNavigation close button accessibility & behavior (Issue #22)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockOpenTabs = ["file_1", "file_2"];
    mockActiveTabId = "file_1";
    mockProjectFilesList = [];
  });

  it("Test 1 — Accessible name uses the file name for App.tsx", () => {
    render(<TopNavigation projectId={"proj_123" as Id<"projects">} />);

    const closeButton = screen.getByRole("button", { name: "Close App.tsx" });
    expect(closeButton).toBeDefined();
  });

  it("Test 2 — Correct aria-label attribute", () => {
    render(<TopNavigation projectId={"proj_123" as Id<"projects">} />);

    const closeButton = screen.getByRole("button", { name: "Close App.tsx" });
    expect(closeButton.getAttribute("aria-label")).toBe("Close App.tsx");
  });

  it("Test 3 — Correct title attribute", () => {
    render(<TopNavigation projectId={"proj_123" as Id<"projects">} />);

    const closeButton = screen.getByRole("button", { name: "Close App.tsx" });
    expect(closeButton.getAttribute("title")).toBe("Close App.tsx");
  });

  it("Test 4 — Different tabs have different accessible names", () => {
    render(<TopNavigation projectId={"proj_123" as Id<"projects">} />);

    const appCloseButton = screen.getByRole("button", { name: "Close App.tsx" });
    const indexCloseButton = screen.getByRole("button", { name: "Close index.ts" });

    expect(appCloseButton).toBeDefined();
    expect(indexCloseButton).toBeDefined();
    expect(appCloseButton.getAttribute("aria-label")).toBe("Close App.tsx");
    expect(indexCloseButton.getAttribute("aria-label")).toBe("Close index.ts");
  });

  it("Test 5 — Mouse click closes the correct tab without activating parent tab", () => {
    render(<TopNavigation projectId={"proj_123" as Id<"projects">} />);

    const indexCloseButton = screen.getByRole("button", { name: "Close index.ts" });
    fireEvent.click(indexCloseButton);

    expect(mockCloseTab).toHaveBeenCalledTimes(1);
    expect(mockCloseTab).toHaveBeenCalledWith("file_2");
    expect(mockSetActiveTab).not.toHaveBeenCalled();
  });

  it("Test 6 — Enter key closes the correct tab", () => {
    render(<TopNavigation projectId={"proj_123" as Id<"projects">} />);

    const appCloseButton = screen.getByRole("button", { name: "Close App.tsx" });
    fireEvent.keyDown(appCloseButton, { key: "Enter" });

    expect(mockCloseTab).toHaveBeenCalledTimes(1);
    expect(mockCloseTab).toHaveBeenCalledWith("file_1");
  });

  it("Test 7 — Space key closes the correct tab", () => {
    render(<TopNavigation projectId={"proj_123" as Id<"projects">} />);

    const indexCloseButton = screen.getByRole("button", { name: "Close index.ts" });
    fireEvent.keyDown(indexCloseButton, { key: " " });

    expect(mockCloseTab).toHaveBeenCalledTimes(1);
    expect(mockCloseTab).toHaveBeenCalledWith("file_2");
  });

  it("Test 8 — Other keys do not accidentally close the tab", () => {
    render(<TopNavigation projectId={"proj_123" as Id<"projects">} />);

    const appCloseButton = screen.getByRole("button", { name: "Close App.tsx" });
    fireEvent.keyDown(appCloseButton, { key: "Escape" });
    fireEvent.keyDown(appCloseButton, { key: "ArrowDown" });
    fireEvent.keyDown(appCloseButton, { key: "Tab" });

    expect(mockCloseTab).not.toHaveBeenCalled();
  });

  it("Test 9 — Event default and propagation prevention are invoked", () => {
    render(<TopNavigation projectId={"proj_123" as Id<"projects">} />);

    const appCloseButton = screen.getByRole("button", { name: "Close App.tsx" });

    const clickEvent = new MouseEvent("click", { cancelable: true, bubbles: true });
    const preventDefaultSpy = vi.spyOn(clickEvent, "preventDefault");
    const stopPropagationSpy = vi.spyOn(clickEvent, "stopPropagation");

    appCloseButton.dispatchEvent(clickEvent);

    expect(preventDefaultSpy).toHaveBeenCalled();
    expect(stopPropagationSpy).toHaveBeenCalled();
    expect(mockCloseTab).toHaveBeenCalledWith("file_1");
  });
});

describe("Issue #45 — Open-File Tabs Accessibility & Keyboard Navigation", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockOpenTabs = ["file_1", "file_2", "file_3"];
    mockActiveTabId = "file_1";
    mockProjectFilesList = [];
  });

  // A. Open-file tab semantics
  it("A1. renders container with role='tablist' and accessible label", () => {
    render(<TopNavigation projectId={"proj_123" as Id<"projects">} />);
    const tablist = screen.getByRole("tablist", { name: "Open files" });
    expect(tablist).toBeDefined();
  });

  it("A2. renders each open file with role='tab' and correct aria-selected & roving tabindex", () => {
    render(<TopNavigation projectId={"proj_123" as Id<"projects">} />);
    const tabs = screen.getAllByRole("tab");
    expect(tabs.length).toBe(3);

    // Active tab (file_1)
    expect(tabs[0].getAttribute("aria-selected")).toBe("true");
    expect(tabs[0].getAttribute("tabindex")).toBe("0");

    // Inactive tabs (file_2, file_3)
    expect(tabs[1].getAttribute("aria-selected")).toBe("false");
    expect(tabs[1].getAttribute("tabindex")).toBe("-1");
    expect(tabs[2].getAttribute("aria-selected")).toBe("false");
    expect(tabs[2].getAttribute("tabindex")).toBe("-1");
  });

  // B. Keyboard navigation (ArrowRight, ArrowLeft, Home, End, wrapping)
  it("B1. moves focus to the next tab on ArrowRight and wraps around", () => {
    render(<TopNavigation projectId={"proj_123" as Id<"projects">} />);
    const tabs = screen.getAllByRole("tab");

    tabs[0].focus();
    expect(document.activeElement).toBe(tabs[0]);

    fireEvent.keyDown(tabs[0], { key: "ArrowRight" });
    expect(document.activeElement).toBe(tabs[1]);

    fireEvent.keyDown(tabs[1], { key: "ArrowRight" });
    expect(document.activeElement).toBe(tabs[2]);

    // Wrap around to first tab
    fireEvent.keyDown(tabs[2], { key: "ArrowRight" });
    expect(document.activeElement).toBe(tabs[0]);
  });

  it("B2. moves focus to the previous tab on ArrowLeft and wraps around", () => {
    render(<TopNavigation projectId={"proj_123" as Id<"projects">} />);
    const tabs = screen.getAllByRole("tab");

    tabs[0].focus();
    // Wrap backwards from first to last tab
    fireEvent.keyDown(tabs[0], { key: "ArrowLeft" });
    expect(document.activeElement).toBe(tabs[2]);

    fireEvent.keyDown(tabs[2], { key: "ArrowLeft" });
    expect(document.activeElement).toBe(tabs[1]);
  });

  it("B3. moves focus to first tab on Home and last tab on End", () => {
    render(<TopNavigation projectId={"proj_123" as Id<"projects">} />);
    const tabs = screen.getAllByRole("tab");

    tabs[1].focus();
    fireEvent.keyDown(tabs[1], { key: "End" });
    expect(document.activeElement).toBe(tabs[2]);

    fireEvent.keyDown(tabs[2], { key: "Home" });
    expect(document.activeElement).toBe(tabs[0]);
  });

  it("B4. activates focused tab on Enter or Space", () => {
    render(<TopNavigation projectId={"proj_123" as Id<"projects">} />);
    const tabs = screen.getAllByRole("tab");

    fireEvent.keyDown(tabs[1], { key: "Enter" });
    expect(mockSetActiveTab).toHaveBeenCalledWith("file_2");

    fireEvent.keyDown(tabs[2], { key: " " });
    expect(mockSetActiveTab).toHaveBeenCalledWith("file_3");
  });

  it("B5. handles single tab navigation gracefully without errors", () => {
    mockOpenTabs = ["file_1"];
    render(<TopNavigation projectId={"proj_123" as Id<"projects">} />);
    const tab = screen.getByRole("tab");

    tab.focus();
    fireEvent.keyDown(tab, { key: "ArrowRight" });
    expect(document.activeElement).toBe(tab);

    fireEvent.keyDown(tab, { key: "ArrowLeft" });
    expect(document.activeElement).toBe(tab);
  });

  it("B6. handles empty tablist without throwing errors", () => {
    mockOpenTabs = [];
    mockActiveTabId = null;
    render(<TopNavigation projectId={"proj_123" as Id<"projects">} />);
    const tablist = screen.getByRole("tablist", { name: "Open files" });
    expect(tablist).toBeDefined();
    expect(screen.queryAllByRole("tab").length).toBe(0);
  });

  // D. Ctrl+W / Cmd+W shortcut to close active tab
  it("D1. closes active tab on Ctrl+W", () => {
    render(<TopNavigation projectId={"proj_123" as Id<"projects">} />);

    act(() => {
      fireEvent.keyDown(window, { key: "w", ctrlKey: true });
    });

    expect(mockCloseTab).toHaveBeenCalledTimes(1);
    expect(mockCloseTab).toHaveBeenCalledWith("file_1");
  });

  it("D2. closes active tab on Cmd+W (metaKey)", () => {
    render(<TopNavigation projectId={"proj_123" as Id<"projects">} />);

    act(() => {
      fireEvent.keyDown(window, { key: "w", metaKey: true });
    });

    expect(mockCloseTab).toHaveBeenCalledTimes(1);
    expect(mockCloseTab).toHaveBeenCalledWith("file_1");
  });

  it("D3. does not close when no active tab exists", () => {
    mockActiveTabId = null;
    render(<TopNavigation projectId={"proj_123" as Id<"projects">} />);

    act(() => {
      fireEvent.keyDown(window, { key: "w", ctrlKey: true });
    });

    expect(mockCloseTab).not.toHaveBeenCalled();
  });

  // E. Editing context protection
  it("E1. protects input, textarea, and contenteditable elements from Ctrl+W / Cmd+W", () => {
    render(
      <div>
        <TopNavigation projectId={"proj_123" as Id<"projects">} />
        <input data-testid="test-input" />
        <textarea data-testid="test-textarea" />
        <div data-testid="test-contenteditable" contentEditable="true" />
      </div>
    );

    const input = screen.getByTestId("test-input");
    fireEvent.keyDown(input, { key: "w", ctrlKey: true });
    expect(mockCloseTab).not.toHaveBeenCalled();

    const textarea = screen.getByTestId("test-textarea");
    fireEvent.keyDown(textarea, { key: "w", metaKey: true });
    expect(mockCloseTab).not.toHaveBeenCalled();

    const editable = screen.getByTestId("test-contenteditable");
    fireEvent.keyDown(editable, { key: "w", ctrlKey: true });
    expect(mockCloseTab).not.toHaveBeenCalled();
  });

  it("E2. protects CodeMirror editor surfaces (.cm-editor, .cm-content) from Ctrl+W / Cmd+W", () => {
    render(
      <div>
        <TopNavigation projectId={"proj_123" as Id<"projects">} />
        <div className="cm-editor">
          <div className="cm-content" data-testid="cm-editor-surface">
            editor code
          </div>
        </div>
      </div>
    );

    const cmSurface = screen.getByTestId("cm-editor-surface");
    fireEvent.keyDown(cmSurface, { key: "w", ctrlKey: true });
    expect(mockCloseTab).not.toHaveBeenCalled();
  });

  // F. Preserving existing behavior
  it("F1. double clicking a tab pins the file", () => {
    render(<TopNavigation projectId={"proj_123" as Id<"projects">} />);
    const tabs = screen.getAllByRole("tab");

    fireEvent.doubleClick(tabs[1]);
    expect(mockOpenFile).toHaveBeenCalledWith("file_2", { pinned: true });
  });

  it("F2. clicking a tab activates the file", () => {
    render(<TopNavigation projectId={"proj_123" as Id<"projects">} />);
    const tabs = screen.getAllByRole("tab");

    fireEvent.click(tabs[2]);
    expect(mockSetActiveTab).toHaveBeenCalledWith("file_3");
  });
});

describe("Issue #45 — Code / Preview Tab Accessibility & Keyboard Navigation", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockProjectFilesList = [];
  });

  it("C1. exposes role='tablist' with Code and Preview tabs", () => {
    render(<ProjectIdView projectId={"proj_123" as Id<"projects">} />);
    const tablist = screen.getByRole("tablist", { name: "Project views" });
    expect(tablist).toBeDefined();

    const codeTab = screen.getByRole("tab", { name: "Code" });
    const previewTab = screen.getByRole("tab", { name: "Preview" });

    expect(codeTab).toBeDefined();
    expect(previewTab).toBeDefined();
    expect(codeTab.getAttribute("aria-selected")).toBe("true");
    expect(codeTab.getAttribute("tabindex")).toBe("0");
    expect(previewTab.getAttribute("aria-selected")).toBe("false");
    expect(previewTab.getAttribute("tabindex")).toBe("-1");
  });

  it("C2. supports keyboard navigation between Code and Preview tabs", () => {
    render(<ProjectIdView projectId={"proj_123" as Id<"projects">} />);
    const codeTab = screen.getByRole("tab", { name: "Code" });
    const previewTab = screen.getByRole("tab", { name: "Preview" });

    codeTab.focus();
    expect(document.activeElement).toBe(codeTab);

    // ArrowRight moves focus to Preview
    fireEvent.keyDown(codeTab, { key: "ArrowRight" });
    expect(document.activeElement).toBe(previewTab);

    // ArrowRight on Preview wraps to Code
    fireEvent.keyDown(previewTab, { key: "ArrowRight" });
    expect(document.activeElement).toBe(codeTab);

    // ArrowLeft on Code wraps to Preview
    fireEvent.keyDown(codeTab, { key: "ArrowLeft" });
    expect(document.activeElement).toBe(previewTab);

    // Home moves to Code, End moves to Preview
    fireEvent.keyDown(previewTab, { key: "Home" });
    expect(document.activeElement).toBe(codeTab);

    fireEvent.keyDown(codeTab, { key: "End" });
    expect(document.activeElement).toBe(previewTab);
  });

  it("C3. activates Preview view on Enter or Space or click", () => {
    render(<ProjectIdView projectId={"proj_123" as Id<"projects">} />);
    const codeTab = screen.getByRole("tab", { name: "Code" });
    const previewTab = screen.getByRole("tab", { name: "Preview" });

    // Activate Preview via Enter
    fireEvent.keyDown(previewTab, { key: "Enter" });
    expect(previewTab.getAttribute("aria-selected")).toBe("true");
    expect(previewTab.getAttribute("tabindex")).toBe("0");
    expect(codeTab.getAttribute("aria-selected")).toBe("false");
    expect(codeTab.getAttribute("tabindex")).toBe("-1");

    // Activate Code via Click
    fireEvent.click(codeTab);
    expect(codeTab.getAttribute("aria-selected")).toBe("true");
    expect(codeTab.getAttribute("tabindex")).toBe("0");
    expect(previewTab.getAttribute("aria-selected")).toBe("false");
  });
});

describe("Issue #65 — Ctrl/Cmd+P File Quick-Open Dialog", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockProjectFilesList = [
      {
        _id: "f_root",
        name: "README.md",
        type: "file",
        projectId: "proj_123",
      },
      {
        _id: "folder_src",
        name: "src",
        type: "folder",
        projectId: "proj_123",
      },
      {
        _id: "f_nested",
        name: "button.tsx",
        type: "file",
        parentId: "folder_src",
        projectId: "proj_123",
      },
      {
        _id: "folder_components",
        name: "components",
        type: "folder",
        parentId: "folder_src",
        projectId: "proj_123",
      },
      {
        _id: "f_deep_button",
        name: "button.tsx",
        type: "file",
        parentId: "folder_components",
        projectId: "proj_123",
      },
    ];
  });

  // A. Keyboard shortcut triggering
  it("opens quick-open dialog on Ctrl+P and prevents default browser action", () => {
    render(<ProjectIdView projectId={"proj_123" as Id<"projects">} />);

    expect(screen.queryByPlaceholderText("Search files by name or path...")).toBeNull();

    const event = new KeyboardEvent("keydown", {
      key: "p",
      ctrlKey: true,
      cancelable: true,
      bubbles: true,
    });
    const preventDefaultSpy = vi.spyOn(event, "preventDefault");

    act(() => {
      window.dispatchEvent(event);
    });

    expect(preventDefaultSpy).toHaveBeenCalled();
    expect(screen.getByPlaceholderText("Search files by name or path...")).toBeDefined();
  });

  it("opens quick-open dialog on Cmd+P (metaKey) on macOS", () => {
    render(<ProjectIdView projectId={"proj_123" as Id<"projects">} />);

    const event = new KeyboardEvent("keydown", {
      key: "p",
      metaKey: true,
      cancelable: true,
      bubbles: true,
    });

    act(() => {
      window.dispatchEvent(event);
    });

    expect(screen.getByPlaceholderText("Search files by name or path...")).toBeDefined();
  });

  it("does not open quick-open when typing in an input or textarea", () => {
    render(
      <div>
        <ProjectIdView projectId={"proj_123" as Id<"projects">} />
        <input data-testid="active-input" />
        <textarea data-testid="active-textarea" />
      </div>
    );

    const input = screen.getByTestId("active-input");
    fireEvent.keyDown(input, { key: "p", ctrlKey: true });
    expect(screen.queryByPlaceholderText("Search files by name or path...")).toBeNull();

    const textarea = screen.getByTestId("active-textarea");
    fireEvent.keyDown(textarea, { key: "p", metaKey: true });
    expect(screen.queryByPlaceholderText("Search files by name or path...")).toBeNull();
  });

  it("does not open quick-open when focus is inside a CodeMirror editor surface", () => {
    render(
      <div>
        <ProjectIdView projectId={"proj_123" as Id<"projects">} />
        <div className="cm-editor">
          <div className="cm-content" data-testid="editor-surface">
            code
          </div>
        </div>
      </div>
    );

    const surface = screen.getByTestId("editor-surface");
    fireEvent.keyDown(surface, { key: "p", ctrlKey: true });
    expect(screen.queryByPlaceholderText("Search files by name or path...")).toBeNull();
  });

  it("does not trigger for unrelated keys like Ctrl+O or plain 'p'", () => {
    render(<ProjectIdView projectId={"proj_123" as Id<"projects">} />);

    fireEvent.keyDown(window, { key: "p" });
    expect(screen.queryByPlaceholderText("Search files by name or path...")).toBeNull();

    fireEvent.keyDown(window, { key: "o", ctrlKey: true });
    expect(screen.queryByPlaceholderText("Search files by name or path...")).toBeNull();
  });

  // B. Dialog rendering and content
  it("renders files and excludes folders", () => {
    render(<ProjectIdView projectId={"proj_123" as Id<"projects">} />);

    act(() => {
      window.dispatchEvent(new KeyboardEvent("keydown", { key: "p", ctrlKey: true }));
    });

    // File names should be visible
    expect(screen.getAllByText("README.md").length).toBeGreaterThanOrEqual(1);
    // Folders ("src" or "components") should not be selectable command items on their own
    expect(screen.queryByRole("option", { name: /^src$/ })).toBeNull();
  });

  it("displays loading state when files are still loading (undefined)", () => {
    mockProjectFilesList = undefined;

    render(<ProjectIdView projectId={"proj_123" as Id<"projects">} />);

    act(() => {
      window.dispatchEvent(new KeyboardEvent("keydown", { key: "p", ctrlKey: true }));
    });

    expect(screen.getByText("Loading files...")).toBeDefined();
  });

  it("displays empty project state when project has no files", () => {
    mockProjectFilesList = [];

    render(<ProjectIdView projectId={"proj_123" as Id<"projects">} />);

    act(() => {
      window.dispatchEvent(new KeyboardEvent("keydown", { key: "p", ctrlKey: true }));
    });

    expect(screen.getByText("No files in project.")).toBeDefined();
  });

  // C. Search and duplicate file resolution
  it("distinguishes duplicate file names via workspace-relative paths", () => {
    render(<ProjectIdView projectId={"proj_123" as Id<"projects">} />);

    act(() => {
      window.dispatchEvent(new KeyboardEvent("keydown", { key: "p", ctrlKey: true }));
    });

    // Both button.tsx should be listed with their paths
    expect(screen.getByText("src/button.tsx")).toBeDefined();
    expect(screen.getByText("src/components/button.tsx")).toBeDefined();
  });

  // D. File selection and editor integration
  it("opens selected file as an unpinned preview tab and closes dialog", async () => {
    render(<ProjectIdView projectId={"proj_123" as Id<"projects">} />);

    act(() => {
      window.dispatchEvent(new KeyboardEvent("keydown", { key: "p", ctrlKey: true }));
    });

    const readmeItem = screen.getAllByText("README.md")[0].closest("[role='option']");
    expect(readmeItem).not.toBeNull();

    act(() => {
      fireEvent.click(readmeItem!);
    });

    expect(mockOpenFile).toHaveBeenCalledTimes(1);
    expect(mockOpenFile).toHaveBeenCalledWith("f_root", { pinned: false });

    // Dialog should close
    await waitFor(() => {
      expect(screen.queryByPlaceholderText("Search files by name or path...")).toBeNull();
    });
  });

  // E. Project switching lifecycle
  it("resets and closes quick-open when projectId prop changes", () => {
    const { rerender } = render(<ProjectIdView projectId={"proj_123" as Id<"projects">} />);

    act(() => {
      window.dispatchEvent(new KeyboardEvent("keydown", { key: "p", ctrlKey: true }));
    });

    expect(screen.getByPlaceholderText("Search files by name or path...")).toBeDefined();

    // Switch project
    rerender(<ProjectIdView projectId={"proj_456" as Id<"projects">} />);

    expect(screen.queryByPlaceholderText("Search files by name or path...")).toBeNull();
  });
});
