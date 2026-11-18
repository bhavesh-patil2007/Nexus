// @vitest-environment jsdom
import { describe, expect, it, vi } from "vitest";
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

vi.mock("@/features/projects/hooks/use-projects", () => ({
  useProject: () => mockProject,
  useRenameProject: () => vi.fn(),
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
