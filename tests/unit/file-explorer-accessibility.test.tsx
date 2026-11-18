// @vitest-environment jsdom
import { describe, expect, it, vi } from "vitest";
import React from "react";
import { render, screen } from "@testing-library/react";

// Mock convex and project hooks to isolate header button rendering
vi.mock("@/features/projects/hooks/use-projects", () => ({
  useProject: () => ({ _id: "proj_123", name: "Nexus App" }),
}));

vi.mock("@/features/projects/hooks/use-files", () => ({
  useFolderContents: () => [],
  useCreateFile: () => vi.fn(),
  useCreateFolder: () => vi.fn(),
}));

// Mock sub-components
vi.mock("@/features/projects/components/file-explorer/tree", () => ({
  Tree: () => <div data-testid="tree-node" />,
}));

vi.mock("@/features/projects/components/file-explorer/loading-row", () => ({
  LoadingRow: () => <div data-testid="loading-row" />,
}));

vi.mock("@/features/projects/components/file-explorer/create-input", () => ({
  CreateInput: () => <div data-testid="create-input" />,
}));

import { FileExplorer } from "@/features/projects/components/file-explorer/index";
import { Id } from "@/../convex/_generated/dataModel";

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
