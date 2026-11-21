// @vitest-environment jsdom
import { describe, expect, it, vi, beforeEach } from "vitest";
import React from "react";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";

// Track mock function calls
const mockToastSuccess = vi.fn();
const mockToastError = vi.fn();
vi.mock("sonner", () => ({
  toast: {
    success: (...args: unknown[]) => mockToastSuccess(...args),
    error: (...args: unknown[]) => mockToastError(...args),
  },
}));

// Mock convex and project hooks to isolate header button rendering and file tree
vi.mock("@/features/projects/hooks/use-projects", () => ({
  useProject: () => ({ _id: "proj_123", name: "Nexus App" }),
}));

let mockFilePathResult: { _id: string; name: string }[] | undefined = undefined;

vi.mock("@/features/projects/hooks/use-files", () => ({
  useFolderContents: () => [],
  useCreateFile: () => vi.fn(),
  useCreateFolder: () => vi.fn(),
  useRenameFile: () => vi.fn(),
  useDeleteFile: () => vi.fn(),
  useFilePath: () => mockFilePathResult,
}));

vi.mock("@/features/editor/hooks/use-editor", () => ({
  useEditor: () => ({
    openFile: vi.fn(),
    closeTab: vi.fn(),
    activeTabId: null,
  }),
}));

import { FileExplorer } from "@/features/projects/components/file-explorer/index";
import { Tree } from "@/features/projects/components/file-explorer/tree";
import { Doc, Id } from "@/../convex/_generated/dataModel";

describe("FileExplorer header action buttons accessibility", () => {
  it("Test 1 — New File button has accessible name, aria-label, and title", () => {
    render(<FileExplorer projectId={"proj_123" as Id<"projects">} />);

    const newFileButton = screen.getByRole("button", { name: "New file" });
    expect(newFileButton).toBeDefined();
    expect(newFileButton.getAttribute("aria-label")).toBe("New file");
    expect(newFileButton.getAttribute("title")).toBe("New file");
  });

  it("Test 2 — New Folder button has accessible name, aria-label, and title", () => {
    render(<FileExplorer projectId={"proj_123" as Id<"projects">} />);

    const newFolderButton = screen.getByRole("button", { name: "New folder" });
    expect(newFolderButton).toBeDefined();
    expect(newFolderButton.getAttribute("aria-label")).toBe("New folder");
    expect(newFolderButton.getAttribute("title")).toBe("New folder");
  });

  it("Test 3 — Collapse All button has accessible name, aria-label, and title", () => {
    render(<FileExplorer projectId={"proj_123" as Id<"projects">} />);

    const collapseButton = screen.getByRole("button", { name: "Collapse all folders" });
    expect(collapseButton).toBeDefined();
    expect(collapseButton.getAttribute("aria-label")).toBe("Collapse all folders");
    expect(collapseButton.getAttribute("title")).toBe("Collapse all folders");
  });
});

describe("File and folder context menu Copy Path action", () => {
  const mockFileItem: Doc<"files"> = {
    _id: "file_btn" as Id<"files">,
    _creationTime: 1000,
    projectId: "proj_123" as Id<"projects">,
    name: "button.tsx",
    type: "file",
    content: "export const Button = () => null;",
    updatedAt: 1000,
  };

  const mockFolderItem: Doc<"files"> = {
    _id: "folder_components" as Id<"files">,
    _creationTime: 1000,
    projectId: "proj_123" as Id<"projects">,
    name: "components",
    type: "folder",
    updatedAt: 1000,
  };

  beforeEach(() => {
    vi.clearAllMocks();
    mockFilePathResult = undefined;
  });

  it("exposes Copy Path, Rename, and Delete actions in file context menu", () => {
    mockFilePathResult = [{ _id: "file_btn", name: "button.tsx" }];

    render(
      <Tree
        item={mockFileItem}
        projectId={"proj_123" as Id<"projects">}
      />
    );

    const trigger = screen.getByRole("button", { name: /button\.tsx/i });
    fireEvent.contextMenu(trigger);

    expect(screen.getByRole("menuitem", { name: /Copy Path/i })).toBeDefined();
    expect(screen.getByRole("menuitem", { name: /Rename/i })).toBeDefined();
    expect(screen.getByRole("menuitem", { name: /Delete Permanently/i })).toBeDefined();
  });

  it("exposes Copy Path, New File, New Folder, Rename, and Delete in folder context menu", () => {
    mockFilePathResult = [{ _id: "folder_components", name: "components" }];

    render(
      <Tree
        item={mockFolderItem}
        projectId={"proj_123" as Id<"projects">}
      />
    );

    const trigger = screen.getByRole("button", { name: /components/i });
    fireEvent.contextMenu(trigger);

    expect(screen.getByRole("menuitem", { name: /Copy Path/i })).toBeDefined();
    expect(screen.getByRole("menuitem", { name: /New File/i })).toBeDefined();
    expect(screen.getByRole("menuitem", { name: /New Folder/i })).toBeDefined();
    expect(screen.getByRole("menuitem", { name: /Rename/i })).toBeDefined();
    expect(screen.getByRole("menuitem", { name: /Delete Permanently/i })).toBeDefined();
  });

  it("copies root-level file path to clipboard on success without leading or trailing slash", async () => {
    mockFilePathResult = [{ _id: "file_readme", name: "README.md" }];
    const writeTextMock = vi.fn().mockResolvedValue(undefined);
    Object.assign(navigator, {
      clipboard: { writeText: writeTextMock },
    });

    const rootFile: Doc<"files"> = {
      ...mockFileItem,
      _id: "file_readme" as Id<"files">,
      name: "README.md",
    };

    render(<Tree item={rootFile} projectId={"proj_123" as Id<"projects">} />);

    const trigger = screen.getByRole("button", { name: /README\.md/i });
    fireEvent.contextMenu(trigger);

    const copyPathItem = screen.getByRole("menuitem", { name: /Copy Path/i });
    fireEvent.click(copyPathItem);

    await waitFor(() => {
      expect(writeTextMock).toHaveBeenCalledTimes(1);
      expect(writeTextMock).toHaveBeenCalledWith("README.md");
      expect(mockToastSuccess).toHaveBeenCalledWith("Path copied to clipboard");
      expect(mockToastError).not.toHaveBeenCalled();
    });
  });

  it("copies nested folder path to clipboard using / separator and without trailing slash", async () => {
    mockFilePathResult = [
      { _id: "folder_src", name: "src" },
      { _id: "folder_components", name: "components" },
    ];
    const writeTextMock = vi.fn().mockResolvedValue(undefined);
    Object.assign(navigator, {
      clipboard: { writeText: writeTextMock },
    });

    render(<Tree item={mockFolderItem} projectId={"proj_123" as Id<"projects">} />);

    const trigger = screen.getByRole("button", { name: /components/i });
    fireEvent.contextMenu(trigger);

    const copyPathItem = screen.getByRole("menuitem", { name: /Copy Path/i });
    fireEvent.click(copyPathItem);

    await waitFor(() => {
      expect(writeTextMock).toHaveBeenCalledTimes(1);
      expect(writeTextMock).toHaveBeenCalledWith("src/components");
      expect(mockToastSuccess).toHaveBeenCalledWith("Path copied to clipboard");
    });
  });

  it("preserves spaces in path segments when copying path", async () => {
    mockFilePathResult = [
      { _id: "folder_src", name: "src" },
      { _id: "folder_my_comp", name: "My Components" },
      { _id: "file_btn", name: "button.tsx" },
    ];
    const writeTextMock = vi.fn().mockResolvedValue(undefined);
    Object.assign(navigator, {
      clipboard: { writeText: writeTextMock },
    });

    render(<Tree item={mockFileItem} projectId={"proj_123" as Id<"projects">} />);

    const trigger = screen.getByRole("button", { name: /button\.tsx/i });
    fireEvent.contextMenu(trigger);

    const copyPathItem = screen.getByRole("menuitem", { name: /Copy Path/i });
    fireEvent.click(copyPathItem);

    await waitFor(() => {
      expect(writeTextMock).toHaveBeenCalledWith("src/My Components/button.tsx");
      expect(mockToastSuccess).toHaveBeenCalledWith("Path copied to clipboard");
    });
  });

  it("preserves Unicode characters in path segments", async () => {
    mockFilePathResult = [
      { _id: "folder_assets", name: "assets" },
      { _id: "file_icon", name: "图标.svg" },
    ];
    const writeTextMock = vi.fn().mockResolvedValue(undefined);
    Object.assign(navigator, {
      clipboard: { writeText: writeTextMock },
    });

    const unicodeFile: Doc<"files"> = {
      ...mockFileItem,
      _id: "file_icon" as Id<"files">,
      name: "图标.svg",
    };

    render(<Tree item={unicodeFile} projectId={"proj_123" as Id<"projects">} />);

    const trigger = screen.getByRole("button", { name: /图标\.svg/i });
    fireEvent.contextMenu(trigger);

    const copyPathItem = screen.getByRole("menuitem", { name: /Copy Path/i });
    fireEvent.click(copyPathItem);

    await waitFor(() => {
      expect(writeTextMock).toHaveBeenCalledWith("assets/图标.svg");
      expect(mockToastSuccess).toHaveBeenCalledWith("Path copied to clipboard");
    });
  });

  it("handles clipboard writeText rejection with error toast without crashing", async () => {
    mockFilePathResult = [{ _id: "file_btn", name: "button.tsx" }];
    const writeTextMock = vi.fn().mockRejectedValue(new Error("Permission denied"));
    Object.assign(navigator, {
      clipboard: { writeText: writeTextMock },
    });

    render(<Tree item={mockFileItem} projectId={"proj_123" as Id<"projects">} />);

    const trigger = screen.getByRole("button", { name: /button\.tsx/i });
    fireEvent.contextMenu(trigger);

    const copyPathItem = screen.getByRole("menuitem", { name: /Copy Path/i });
    fireEvent.click(copyPathItem);

    await waitFor(() => {
      expect(writeTextMock).toHaveBeenCalledTimes(1);
      expect(mockToastError).toHaveBeenCalledWith("Failed to copy path to clipboard");
      expect(mockToastSuccess).not.toHaveBeenCalled();
    });
  });

  it("handles clipboard API being unavailable gracefully", async () => {
    mockFilePathResult = [{ _id: "file_btn", name: "button.tsx" }];
    Object.assign(navigator, {
      clipboard: undefined,
    });

    render(<Tree item={mockFileItem} projectId={"proj_123" as Id<"projects">} />);

    const trigger = screen.getByRole("button", { name: /button\.tsx/i });
    fireEvent.contextMenu(trigger);

    const copyPathItem = screen.getByRole("menuitem", { name: /Copy Path/i });
    fireEvent.click(copyPathItem);

    await waitFor(() => {
      expect(mockToastError).toHaveBeenCalledWith("Failed to copy path to clipboard");
      expect(mockToastSuccess).not.toHaveBeenCalled();
    });
  });

  it("handles loading path state safely without copying", async () => {
    mockFilePathResult = undefined; // loading state
    const writeTextMock = vi.fn().mockResolvedValue(undefined);
    Object.assign(navigator, {
      clipboard: { writeText: writeTextMock },
    });

    render(<Tree item={mockFileItem} projectId={"proj_123" as Id<"projects">} />);

    const trigger = screen.getByRole("button", { name: /button\.tsx/i });
    fireEvent.contextMenu(trigger);

    const copyPathItem = screen.getByRole("menuitem", { name: /Copy Path/i });
    fireEvent.click(copyPathItem);

    await waitFor(() => {
      expect(writeTextMock).not.toHaveBeenCalled();
      expect(mockToastError).toHaveBeenCalledWith("Path is still loading");
      expect(mockToastSuccess).not.toHaveBeenCalled();
    });
  });

  it("handles missing or empty path result safely", async () => {
    mockFilePathResult = []; // empty or deleted item path
    const writeTextMock = vi.fn().mockResolvedValue(undefined);
    Object.assign(navigator, {
      clipboard: { writeText: writeTextMock },
    });

    render(<Tree item={mockFileItem} projectId={"proj_123" as Id<"projects">} />);

    const trigger = screen.getByRole("button", { name: /button\.tsx/i });
    fireEvent.contextMenu(trigger);

    const copyPathItem = screen.getByRole("menuitem", { name: /Copy Path/i });
    fireEvent.click(copyPathItem);

    await waitFor(() => {
      expect(writeTextMock).not.toHaveBeenCalled();
      expect(mockToastError).toHaveBeenCalledWith("Unable to resolve path");
      expect(mockToastSuccess).not.toHaveBeenCalled();
    });
  });
});
