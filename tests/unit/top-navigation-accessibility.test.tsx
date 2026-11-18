// @vitest-environment jsdom
import { describe, expect, it, vi, beforeEach } from "vitest";
import React from "react";
import { render, screen, fireEvent } from "@testing-library/react";

// Mock convex file hooks
const mockFiles: Record<string, { _id: string; name: string }> = {
  file_1: { _id: "file_1", name: "App.tsx" },
  file_2: { _id: "file_2", name: "index.ts" },
};

vi.mock("@/features/projects/hooks/use-files", () => ({
  useFile: (fileId: string) => mockFiles[fileId] || undefined,
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

import { TopNavigation } from "@/features/editor/components/top-navigation";
import { Id } from "@/../convex/_generated/dataModel";

describe("TopNavigation close button accessibility & behavior", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockOpenTabs = ["file_1", "file_2"];
    mockActiveTabId = "file_1";
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
    // Verify stopPropagation prevented parent tab click
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
