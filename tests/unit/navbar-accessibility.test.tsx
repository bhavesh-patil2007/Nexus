// @vitest-environment jsdom
import { describe, expect, it, vi, beforeEach } from "vitest";
import React from "react";
import { render, screen, fireEvent } from "@testing-library/react";
import { TooltipProvider } from "@/components/ui/tooltip";

// Mock subcomponents and third-party modules that require providers
vi.mock("@clerk/nextjs", () => ({
  UserButton: () => <div data-testid="user-button">UserButton</div>,
}));

vi.mock("next/link", () => ({
  default: ({ children, href }: { children: React.ReactNode; href: string }) => (
    <a href={href}>{children}</a>
  ),
}));

vi.mock("next/image", () => ({
  default: (props: React.ImgHTMLAttributes<HTMLImageElement>) => (
    // eslint-disable-next-line @next/next/no-img-element
    <img {...props} alt={props.alt || ""} />
  ),
}));

vi.mock("next/font/google", () => ({
  Poppins: () => ({ className: "mock-poppins" }),
}));

let mockProjectSettingsOpen = false;
vi.mock("@/features/projects/components/project-settings-dialog", () => ({
  ProjectSettingsDialog: ({
    open,
  }: {
    projectId: string;
    open: boolean;
    onOpenChange: (open: boolean) => void;
  }) => {
    mockProjectSettingsOpen = open;
    return open ? <div data-testid="project-settings-dialog">Dialog Open</div> : null;
  },
}));

const mockProject = {
  _id: "proj_123",
  name: "Test Project",
  updatedAt: Date.now(),
  importStatus: undefined,
};

const mockRenameProject = vi.fn();

vi.mock("@/features/projects/hooks/use-projects", () => ({
  useProject: () => mockProject,
  useRenameProject: () => mockRenameProject,
}));

import { Navbar } from "@/features/projects/components/navbar";
import { Id } from "@/../convex/_generated/dataModel";

const renderNavbar = (projectId: string = "proj_123") => {
  return render(
    <TooltipProvider>
      <Navbar projectId={projectId as Id<"projects">} />
    </TooltipProvider>
  );
};

describe("Navbar - Project Settings button accessibility", () => {
  it("exposes the accessible name 'Project settings' on the settings button", () => {
    renderNavbar();

    const settingsButton = screen.getByRole("button", { name: "Project settings" });
    expect(settingsButton).toBeDefined();
    expect(settingsButton.getAttribute("aria-label")).toBe("Project settings");
  });

  it("retains the native title tooltip attribute 'Project settings'", () => {
    renderNavbar();

    const settingsButton = screen.getByRole("button", { name: "Project settings" });
    expect(settingsButton.getAttribute("title")).toBe("Project settings");
  });

  it("opens the project settings dialog when clicked", () => {
    renderNavbar();

    const settingsButton = screen.getByRole("button", { name: "Project settings" });
    fireEvent.click(settingsButton);

    expect(mockProjectSettingsOpen).toBe(true);
    expect(screen.getByTestId("project-settings-dialog")).toBeDefined();
  });
});

describe("Navbar - Project rename duplicate submission and cancellation guards (Issue #74)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockRenameProject.mockReset();
    mockRenameProject.mockReturnValue(Promise.resolve());
  });

  // Enter and Blur
  it("submits rename exactly once when pressing Enter with a valid changed name", () => {
    renderNavbar();

    const nameDisplay = screen.getByText("Test Project");
    fireEvent.click(nameDisplay);

    const input = screen.getByRole("textbox");
    fireEvent.change(input, { target: { value: "New Project Name" } });
    fireEvent.keyDown(input, { key: "Enter" });

    expect(mockRenameProject).toHaveBeenCalledTimes(1);
    expect(mockRenameProject).toHaveBeenCalledWith({
      id: "proj_123",
      name: "New Project Name",
    });
    // Should exit rename mode
    expect(screen.queryByRole("textbox")).toBeNull();
  });

  it("submits rename exactly once when pressing Enter followed by blur", () => {
    renderNavbar();

    const nameDisplay = screen.getByText("Test Project");
    fireEvent.click(nameDisplay);

    const input = screen.getByRole("textbox");
    fireEvent.change(input, { target: { value: "Renamed Project" } });
    fireEvent.keyDown(input, { key: "Enter" });
    fireEvent.blur(input);

    expect(mockRenameProject).toHaveBeenCalledTimes(1);
    expect(mockRenameProject).toHaveBeenCalledWith({
      id: "proj_123",
      name: "Renamed Project",
    });
  });

  it("submits rename exactly once when Enter is rapidly pressed multiple times", () => {
    renderNavbar();

    const nameDisplay = screen.getByText("Test Project");
    fireEvent.click(nameDisplay);

    const input = screen.getByRole("textbox");
    fireEvent.change(input, { target: { value: "Rapid Enter Project" } });
    fireEvent.keyDown(input, { key: "Enter" });
    fireEvent.keyDown(input, { key: "Enter" });
    fireEvent.keyDown(input, { key: "Enter" });

    expect(mockRenameProject).toHaveBeenCalledTimes(1);
    expect(mockRenameProject).toHaveBeenCalledWith({
      id: "proj_123",
      name: "Rapid Enter Project",
    });
  });

  it("submits rename on blur when no Enter was pressed", () => {
    renderNavbar();

    const nameDisplay = screen.getByText("Test Project");
    fireEvent.click(nameDisplay);

    const input = screen.getByRole("textbox");
    fireEvent.change(input, { target: { value: "Blur Only Project" } });
    fireEvent.blur(input);

    expect(mockRenameProject).toHaveBeenCalledTimes(1);
    expect(mockRenameProject).toHaveBeenCalledWith({
      id: "proj_123",
      name: "Blur Only Project",
    });
  });

  it("trims leading and trailing whitespace on submit", () => {
    renderNavbar();

    const nameDisplay = screen.getByText("Test Project");
    fireEvent.click(nameDisplay);

    const input = screen.getByRole("textbox");
    fireEvent.change(input, { target: { value: "   Trimmed Name   " } });
    fireEvent.keyDown(input, { key: "Enter" });

    expect(mockRenameProject).toHaveBeenCalledTimes(1);
    expect(mockRenameProject).toHaveBeenCalledWith({
      id: "proj_123",
      name: "Trimmed Name",
    });
  });

  // Escape and Cancellation
  it("exits rename mode on Escape without submitting", () => {
    renderNavbar();

    const nameDisplay = screen.getByText("Test Project");
    fireEvent.click(nameDisplay);

    const input = screen.getByRole("textbox");
    fireEvent.change(input, { target: { value: "Cancelled Name" } });
    fireEvent.keyDown(input, { key: "Escape" });

    expect(mockRenameProject).not.toHaveBeenCalled();
    expect(screen.queryByRole("textbox")).toBeNull();
    expect(screen.getByText("Test Project")).toBeDefined();
  });

  it("restores original project name on Escape and subsequent rename sees original name", () => {
    renderNavbar();

    const nameDisplay = screen.getByText("Test Project");
    fireEvent.click(nameDisplay);

    let input = screen.getByRole("textbox");
    fireEvent.change(input, { target: { value: "Temporary Name" } });
    fireEvent.keyDown(input, { key: "Escape" });

    expect(mockRenameProject).not.toHaveBeenCalled();

    // Re-enter rename mode
    const restoredDisplay = screen.getByText("Test Project");
    fireEvent.click(restoredDisplay);

    input = screen.getByRole("textbox");
    expect((input as HTMLInputElement).value).toBe("Test Project");
  });

  it("does not submit when Escape is followed by blur", () => {
    renderNavbar();

    const nameDisplay = screen.getByText("Test Project");
    fireEvent.click(nameDisplay);

    const input = screen.getByRole("textbox");
    fireEvent.change(input, { target: { value: "Should Not Submit" } });
    fireEvent.keyDown(input, { key: "Escape" });
    fireEvent.blur(input);

    expect(mockRenameProject).not.toHaveBeenCalled();
  });

  it("never submits modified value when Escape is pressed", () => {
    renderNavbar();

    const nameDisplay = screen.getByText("Test Project");
    fireEvent.click(nameDisplay);

    const input = screen.getByRole("textbox");
    fireEvent.change(input, { target: { value: "Unwanted Edit" } });
    fireEvent.keyDown(input, { key: "Escape" });

    expect(mockRenameProject).not.toHaveBeenCalled();
  });

  it("handles repeated Escape events safely", () => {
    renderNavbar();

    const nameDisplay = screen.getByText("Test Project");
    fireEvent.click(nameDisplay);

    const input = screen.getByRole("textbox");
    fireEvent.keyDown(input, { key: "Escape" });
    fireEvent.keyDown(input, { key: "Escape" });

    expect(mockRenameProject).not.toHaveBeenCalled();
    expect(screen.queryByRole("textbox")).toBeNull();
  });

  // Validation and No-Op
  it("does not invoke renameProject when input is empty", () => {
    renderNavbar();

    const nameDisplay = screen.getByText("Test Project");
    fireEvent.click(nameDisplay);

    const input = screen.getByRole("textbox");
    fireEvent.change(input, { target: { value: "" } });
    fireEvent.keyDown(input, { key: "Enter" });
    fireEvent.blur(input);

    expect(mockRenameProject).not.toHaveBeenCalled();
    expect(screen.queryByRole("textbox")).toBeNull();
  });

  it("does not invoke renameProject when input is whitespace-only", () => {
    renderNavbar();

    const nameDisplay = screen.getByText("Test Project");
    fireEvent.click(nameDisplay);

    const input = screen.getByRole("textbox");
    fireEvent.change(input, { target: { value: "    " } });
    fireEvent.keyDown(input, { key: "Enter" });
    fireEvent.blur(input);

    expect(mockRenameProject).not.toHaveBeenCalled();
    expect(screen.queryByRole("textbox")).toBeNull();
  });

  it("does not invoke renameProject when name is unchanged", () => {
    renderNavbar();

    const nameDisplay = screen.getByText("Test Project");
    fireEvent.click(nameDisplay);

    const input = screen.getByRole("textbox");
    fireEvent.keyDown(input, { key: "Enter" });
    fireEvent.blur(input);

    expect(mockRenameProject).not.toHaveBeenCalled();
    expect(screen.queryByRole("textbox")).toBeNull();
  });

  it("does not invoke renameProject when trimmed name matches original name", () => {
    renderNavbar();

    const nameDisplay = screen.getByText("Test Project");
    fireEvent.click(nameDisplay);

    const input = screen.getByRole("textbox");
    fireEvent.change(input, { target: { value: "  Test Project  " } });
    fireEvent.keyDown(input, { key: "Enter" });
    fireEvent.blur(input);

    expect(mockRenameProject).not.toHaveBeenCalled();
    expect(screen.queryByRole("textbox")).toBeNull();
  });

  // Mutation Lifecycle
  it("handles mutation rejection without unhandled promise rejections or stuck state", async () => {
    const consoleErrorSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    mockRenameProject.mockRejectedValue(new Error("Mutation failed"));

    renderNavbar();

    const nameDisplay = screen.getByText("Test Project");
    fireEvent.click(nameDisplay);

    const input = screen.getByRole("textbox");
    fireEvent.change(input, { target: { value: "Failed Rename" } });
    fireEvent.keyDown(input, { key: "Enter" });
    fireEvent.blur(input);

    expect(mockRenameProject).toHaveBeenCalledTimes(1);
    expect(screen.queryByRole("textbox")).toBeNull();

    consoleErrorSpy.mockRestore();
  });

  it("does not retry automatically on blur when submission previously executed", () => {
    const consoleErrorSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    mockRenameProject.mockRejectedValue(new Error("Mutation failed"));

    renderNavbar();

    const nameDisplay = screen.getByText("Test Project");
    fireEvent.click(nameDisplay);

    const input = screen.getByRole("textbox");
    fireEvent.change(input, { target: { value: "Failing Name" } });
    fireEvent.keyDown(input, { key: "Enter" });
    fireEvent.blur(input);

    expect(mockRenameProject).toHaveBeenCalledTimes(1);

    consoleErrorSpy.mockRestore();
  });

  it("allows a genuinely new rename interaction after the previous one completes", () => {
    renderNavbar();

    // First rename interaction
    let nameDisplay = screen.getByText("Test Project");
    fireEvent.click(nameDisplay);

    let input = screen.getByRole("textbox");
    fireEvent.change(input, { target: { value: "First Rename" } });
    fireEvent.keyDown(input, { key: "Enter" });

    expect(mockRenameProject).toHaveBeenCalledTimes(1);
    expect(mockRenameProject).toHaveBeenCalledWith({
      id: "proj_123",
      name: "First Rename",
    });

    // Second rename interaction
    nameDisplay = screen.getByText("Test Project");
    fireEvent.click(nameDisplay);

    input = screen.getByRole("textbox");
    fireEvent.change(input, { target: { value: "Second Rename" } });
    fireEvent.keyDown(input, { key: "Enter" });

    expect(mockRenameProject).toHaveBeenCalledTimes(2);
    expect(mockRenameProject).toHaveBeenLastCalledWith({
      id: "proj_123",
      name: "Second Rename",
    });
  });
});
