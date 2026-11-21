// @vitest-environment jsdom
import { describe, expect, it, vi, beforeEach, afterEach } from "vitest";
import React from "react";
import { render, screen, fireEvent, act } from "@testing-library/react";

// Mock @xterm/xterm and @xterm/addon-fit
let mockClearFn = vi.fn();
let mockWriteFn = vi.fn();
let mockDisposeFn = vi.fn();
let mockFocusFn = vi.fn();
const mockOnDataFn = vi.fn(() => ({ dispose: vi.fn() }));

vi.mock("@xterm/xterm", () => {
  class MockTerminal {
    open = vi.fn();
    loadAddon = vi.fn();
    clear = mockClearFn;
    write = mockWriteFn;
    dispose = mockDisposeFn;
    focus = mockFocusFn;
    onData = mockOnDataFn;
    cols = 80;
    rows = 24;
  }
  return {
    Terminal: MockTerminal,
  };
});

vi.mock("@xterm/addon-fit", () => {
  return {
    FitAddon: vi.fn().mockImplementation(() => ({
      fit: vi.fn(),
    })),
  };
});

// Mock CSS import
vi.mock("@xterm/xterm/css/xterm.css", () => ({}));

// Mock allotment and popovers
vi.mock("allotment", () => ({
  Allotment: Object.assign(
    ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
    { Pane: ({ children }: { children: React.ReactNode }) => <div>{children}</div> }
  ),
}));

vi.mock("@/features/preview/components/preview-settings-popover", () => ({
  PreviewSettingsPopover: () => <div data-testid="settings-popover" />,
}));

// Mock useWebContainer
let mockRestart = vi.fn();
const mockSendTerminalInput = vi.fn();
const mockResizeTerminal = vi.fn();
const mockInterruptForegroundProcess = vi.fn();
let mockTerminalOutput = "";
let mockStatus = "ready";
let mockPreviewUrl: string | null = "http://localhost:3000";
let mockError: string | null = null;

vi.mock("@/features/preview/hooks/use-webcontainer", () => ({
  useWebContainer: () => ({
    status: mockStatus,
    previewUrl: mockPreviewUrl,
    error: mockError,
    restart: mockRestart,
    terminalOutput: mockTerminalOutput,
    sendTerminalInput: mockSendTerminalInput,
    resizeTerminal: mockResizeTerminal,
    interruptForegroundProcess: mockInterruptForegroundProcess,
  }),
}));

vi.mock("@/features/projects/hooks/use-projects", () => ({
  useProject: () => ({ _id: "proj_1", name: "Test Project", settings: {} }),
}));

import { PreviewTerminal } from "@/features/preview/components/preview-terminal";
import { PreviewView } from "@/features/projects/components/preview-view";
import { Id } from "@/../convex/_generated/dataModel";

describe("Issue #47 — Accessible Clear-Terminal Control", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockClearFn = vi.fn();
    mockWriteFn = vi.fn();
    mockDisposeFn = vi.fn();
    mockFocusFn = vi.fn();
    mockRestart = vi.fn();
    mockTerminalOutput = "";
    mockStatus = "ready";
    mockPreviewUrl = "http://localhost:3000";
    mockError = null;

    // Polyfill ResizeObserver for jsdom
    global.ResizeObserver = class ResizeObserver {
      observe() {}
      unobserve() {}
      disconnect() {}
    };
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  // Test 1 — Accessible clear control
  it("Test 1 — renders clear button with accessible name 'Clear terminal' and title 'Clear terminal'", () => {
    render(<PreviewView projectId={"proj_1" as Id<"projects">} />);

    const clearButton = screen.getByRole("button", { name: "Clear terminal" });
    expect(clearButton).toBeDefined();
    expect(clearButton.getAttribute("aria-label")).toBe("Clear terminal");
    expect(clearButton.getAttribute("title")).toBe("Clear terminal");
  });

  // Test 2 — Clear click handler invokes clear callback
  it("Test 2 — clicking clear button invokes clear action on xterm instance", () => {
    render(<PreviewView projectId={"proj_1" as Id<"projects">} />);

    const clearButton = screen.getByRole("button", { name: "Clear terminal" });
    act(() => {
      fireEvent.click(clearButton);
    });

    expect(mockClearFn).toHaveBeenCalledTimes(1);
  });

  // Test 3 — xterm buffer clearing does not recreate or dispose terminal
  it("Test 3 — xterm clear clears screen and scrollback on existing instance without disposing it", () => {
    const clearRef = { current: null as (() => void) | null };
    render(
      <PreviewTerminal
        output="initial log"
        onClearRef={clearRef}
      />
    );

    expect(clearRef.current).toBeTypeOf("function");
    expect(mockWriteFn.mock.calls[0][0]).toBe("initial log");

    act(() => {
      clearRef.current?.();
    });

    expect(mockClearFn).toHaveBeenCalledTimes(1);
    expect(mockDisposeFn).not.toHaveBeenCalled();
  });

  // Test 4 — Output after clearing
  it("Test 4 — writes subsequent incremental output correctly after clearing without replaying old output", () => {
    const clearRef = { current: null as (() => void) | null };
    const { rerender } = render(
      <PreviewTerminal
        output="chunk 1"
        onClearRef={clearRef}
      />
    );

    expect(mockWriteFn).toHaveBeenCalledTimes(1);
    expect(mockWriteFn.mock.calls[0][0]).toBe("chunk 1");

    // Clear terminal
    act(() => {
      clearRef.current?.();
    });
    expect(mockClearFn).toHaveBeenCalledTimes(1);

    // Provide new incremental output
    rerender(
      <PreviewTerminal
        output="chunk 1chunk 2"
        onClearRef={clearRef}
      />
    );

    // Only chunk 2 should be written, chunk 1 must not be replayed
    expect(mockWriteFn).toHaveBeenCalledTimes(2);
    expect(mockWriteFn.mock.calls[1][0]).toBe("chunk 2");
  });

  // Test 5 — Active processes and input handlers remain untouched
  it("Test 5 — clearing does not restart webcontainer or invoke kill handlers", () => {
    render(<PreviewView projectId={"proj_1" as Id<"projects">} />);

    const clearButton = screen.getByRole("button", { name: "Clear terminal" });
    act(() => {
      fireEvent.click(clearButton);
    });

    expect(mockClearFn).toHaveBeenCalledTimes(1);
    expect(mockRestart).not.toHaveBeenCalled();
  });

  // Test 6 — Empty terminal clear
  it("Test 6 — clearing an empty terminal is safe and does not throw", () => {
    const clearRef = { current: null as (() => void) | null };
    render(<PreviewTerminal output="" onClearRef={clearRef} />);

    expect(() => {
      act(() => {
        clearRef.current?.();
      });
    }).not.toThrow();

    expect(mockClearFn).toHaveBeenCalledTimes(1);
  });

  // Test 7 — Safe initialization/disposal
  it("Test 7 — clear request before initialization or after disposal does not throw errors", () => {
    const clearRef = { current: null as (() => void) | null };
    const { unmount } = render(<PreviewTerminal onClearRef={clearRef} />);

    // Before unmount, function is active
    expect(clearRef.current).toBeTypeOf("function");

    // Unmount terminal
    unmount();

    // After disposal, clearRef is cleaned up to null and calling it safely handles null
    expect(clearRef.current).toBeNull();
    expect(() => clearRef.current?.()).not.toThrow();
  });

  // Test 8 — Existing restart and toggle terminal behavior preserved
  it("Test 8 — preserves existing restart and toggle terminal functionality", () => {
    render(<PreviewView projectId={"proj_1" as Id<"projects">} />);

    const restartButton = screen.getByTitle("Restart container");
    fireEvent.click(restartButton);
    expect(mockRestart).toHaveBeenCalledTimes(1);

    const toggleButton = screen.getByTitle("Toggle terminal");
    // Initially clear and interrupt terminal controls are present
    expect(screen.getByRole("button", { name: "Clear terminal" })).toBeDefined();
    expect(screen.getByRole("button", { name: "Interrupt foreground process" })).toBeDefined();

    // Toggle off
    fireEvent.click(toggleButton);
    expect(screen.queryByRole("button", { name: "Clear terminal" })).toBeNull();
    expect(screen.queryByRole("button", { name: "Interrupt foreground process" })).toBeNull();

    // Toggle back on
    fireEvent.click(toggleButton);
    expect(screen.getByRole("button", { name: "Clear terminal" })).toBeDefined();
    expect(screen.getByRole("button", { name: "Interrupt foreground process" })).toBeDefined();
  });

  // Issue #53 tests
  it("Issue #53 — renders interrupt button with accessible name and title", () => {
    render(<PreviewView projectId={"proj_1" as Id<"projects">} />);

    const interruptButton = screen.getByRole("button", { name: "Interrupt foreground process" });
    expect(interruptButton).toBeDefined();
    expect(interruptButton.getAttribute("aria-label")).toBe("Interrupt foreground process");
    expect(interruptButton.getAttribute("title")).toBe("Interrupt foreground process");
  });

  it("Issue #53 — clicking interrupt button invokes interruptForegroundProcess callback", () => {
    render(<PreviewView projectId={"proj_1" as Id<"projects">} />);

    const interruptButton = screen.getByRole("button", { name: "Interrupt foreground process" });
    act(() => {
      fireEvent.click(interruptButton);
    });

    expect(mockInterruptForegroundProcess).toHaveBeenCalledTimes(1);
    expect(mockRestart).not.toHaveBeenCalled();
  });
});
