// @vitest-environment jsdom
import { describe, expect, it, vi, beforeEach } from "vitest";
import React from "react";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";

// Polyfill ResizeObserver for jsdom
global.ResizeObserver = class ResizeObserver {
  observe() {}
  unobserve() {}
  disconnect() {}
};

// Mock hooks from use-conversations
const mockCreateConversation = vi.fn();
let mockConversations: Array<{ _id: string; title: string }> = [
  { _id: "conv_1", title: "First Conversation" },
];

vi.mock("@/features/conversations/hooks/use-conversations", () => ({
  useConversation: () => ({ _id: "conv_1", title: "Active Conversation" }),
  useConversations: () => mockConversations,
  useCreateConversation: () => mockCreateConversation,
  useMessages: () => [],
  useExecutionEvents: () => [],
}));

// Mock PastConversationsDialog to observe open prop directly
let mockPastDialogOpen = false;
vi.mock("@/features/conversations/components/past-conversations-dialog", () => ({
  PastConversationsDialog: ({
    open,
  }: {
    open: boolean;
    onOpenChange: (open: boolean) => void;
    onSelect: (id: string) => void;
  }) => {
    mockPastDialogOpen = open;
    return open ? <div data-testid="past-conversations-dialog">Past Dialog</div> : null;
  },
}));

// Mock toast
vi.mock("sonner", () => ({
  toast: {
    error: vi.fn(),
    success: vi.fn(),
  },
}));

import { ConversationSidebar } from "@/features/conversations/components/conversation-sidebar";
import { Id } from "@/../convex/_generated/dataModel";

describe("ConversationSidebar header action buttons accessibility", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockPastDialogOpen = false;
    mockConversations = [{ _id: "conv_1", title: "First Conversation" }];
  });

  it("Test 1 — Past Conversations accessible name", () => {
    render(<ConversationSidebar projectId={"proj_1" as Id<"projects">} />);

    const button = screen.getByRole("button", { name: "Past conversations" });
    expect(button).toBeDefined();
  });

  it("Test 2 — Past Conversations attributes (aria-label and title)", () => {
    render(<ConversationSidebar projectId={"proj_1" as Id<"projects">} />);

    const button = screen.getByRole("button", { name: "Past conversations" });
    expect(button.getAttribute("aria-label")).toBe("Past conversations");
    expect(button.getAttribute("title")).toBe("Past conversations");
  });

  it("Test 3 — New Conversation accessible name", () => {
    render(<ConversationSidebar projectId={"proj_1" as Id<"projects">} />);

    const button = screen.getByRole("button", { name: "New conversation" });
    expect(button).toBeDefined();
  });

  it("Test 4 — New Conversation attributes (aria-label and title)", () => {
    render(<ConversationSidebar projectId={"proj_1" as Id<"projects">} />);

    const button = screen.getByRole("button", { name: "New conversation" });
    expect(button.getAttribute("aria-label")).toBe("New conversation");
    expect(button.getAttribute("title")).toBe("New conversation");
  });

  it("Test 5 — Past Conversations click behavior opens dialog", () => {
    render(<ConversationSidebar projectId={"proj_1" as Id<"projects">} />);

    const button = screen.getByRole("button", { name: "Past conversations" });
    expect(mockPastDialogOpen).toBe(false);

    fireEvent.click(button);

    expect(mockPastDialogOpen).toBe(true);
    expect(screen.getByTestId("past-conversations-dialog")).toBeDefined();
  });

  it("Test 6 — New Conversation click behavior triggers createConversation", async () => {
    mockCreateConversation.mockResolvedValue("conv_new_123");

    render(<ConversationSidebar projectId={"proj_1" as Id<"projects">} />);

    const button = screen.getByRole("button", { name: "New conversation" });
    fireEvent.click(button);

    await waitFor(() => {
      expect(mockCreateConversation).toHaveBeenCalledTimes(1);
      expect(mockCreateConversation).toHaveBeenCalledWith({
        projectId: "proj_1",
        title: "New conversation",
      });
    });
  });

  it("Test 7 — Both buttons are independently discoverable without conflict", () => {
    render(<ConversationSidebar projectId={"proj_1" as Id<"projects">} />);

    const pastBtn = screen.getByRole("button", { name: "Past conversations" });
    const newBtn = screen.getByRole("button", { name: "New conversation" });

    expect(pastBtn).not.toBe(newBtn);
    expect(pastBtn.getAttribute("aria-label")).toBe("Past conversations");
    expect(newBtn.getAttribute("aria-label")).toBe("New conversation");
  });
});
