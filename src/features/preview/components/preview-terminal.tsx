"use client";

import { useEffect, useRef } from "react";
import { Terminal } from "@xterm/xterm";
import { FitAddon } from "@xterm/addon-fit";

import "@xterm/xterm/css/xterm.css";

interface PreviewTerminalProps {
  output?: string;
  onData?: (data: string) => void;
  onResize?: (dimensions: { cols: number; rows: number }) => void;
  disabled?: boolean;
}

export const PreviewTerminal = ({
  output = "",
  onData,
  onResize,
  disabled = false,
}: PreviewTerminalProps) => {
  const containerRef = useRef<HTMLDivElement>(null);
  const terminalRef = useRef<Terminal | null>(null);
  const fitAddonRef = useRef<FitAddon | null>(null);
  const lastLengthRef = useRef(0);
  const onDataRef = useRef(onData);
  const onResizeRef = useRef(onResize);

  useEffect(() => {
    onDataRef.current = onData;
    onResizeRef.current = onResize;
  }, [onData, onResize]);

  // Initialize terminal
  useEffect(() => {
    if (!containerRef.current || terminalRef.current) return;

    const terminal = new Terminal({
      convertEol: true,
      cursorBlink: true,
      cursorStyle: "bar",
      disableStdin: disabled,
      fontSize: 12,
      fontFamily: "Menlo, Monaco, 'Courier New', monospace",
      theme: {
        background: "#1f2228",
        foreground: "#f0f6fc",
        cursor: "#58a6ff",
        selectionBackground: "#3b5070",
      },
    });

    const fitAddon = new FitAddon();
    terminal.loadAddon(fitAddon);
    terminal.open(containerRef.current);

    terminalRef.current = terminal;
    fitAddonRef.current = fitAddon;

    // Connect user input directly to onData callback
    const dataDisposable = terminal.onData((data) => {
      onDataRef.current?.(data);
    });

    // Helper to safely fit and notify parent of dimension changes
    const handleFit = () => {
      if (!containerRef.current || !terminalRef.current || !fitAddonRef.current) {
        return;
      }
      try {
        const { clientWidth, clientHeight } = containerRef.current;
        if (clientWidth <= 0 || clientHeight <= 0) return;

        fitAddon.fit();
        if (terminal.cols > 0 && terminal.rows > 0) {
          onResizeRef.current?.({ cols: terminal.cols, rows: terminal.rows });
        }
      } catch {
        // Ignore fit errors when container is momentarily invisible or detaching
      }
    };

    const rafId = requestAnimationFrame(handleFit);

    const resizeObserver = new ResizeObserver(() => {
      handleFit();
    });
    resizeObserver.observe(containerRef.current);

    window.addEventListener("resize", handleFit);

    return () => {
      cancelAnimationFrame(rafId);
      window.removeEventListener("resize", handleFit);
      resizeObserver.disconnect();
      dataDisposable.dispose();
      terminal.dispose();
      terminalRef.current = null;
      fitAddonRef.current = null;
    };
  }, [disabled]);

  // Handle output streaming
  useEffect(() => {
    if (!terminalRef.current) return;

    if (output.length < lastLengthRef.current) {
      terminalRef.current.clear();
      lastLengthRef.current = 0;
    }

    const newData = output.slice(lastLengthRef.current);
    if (newData) {
      terminalRef.current.write(newData);
      lastLengthRef.current = output.length;
    }
  }, [output]);

  return (
    <div
      ref={containerRef}
      className="flex-1 min-h-0 p-3 [&_.xterm]:h-full! [&_.xterm-viewport]:h-full! [&_.xterm-screen]:h-full! bg-sidebar focus:outline-none"
      onClick={() => {
        terminalRef.current?.focus();
      }}
    />
  );
};
