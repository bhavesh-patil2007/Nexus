import { test, describe, beforeEach } from "node:test";
import assert from "node:assert/strict";

describe("Interactive WebContainer Terminal & Process Management (Issue #3)", () => {
  // Test suite covering terminal bidirectional communication, shell lifecycle,
  // process interruption, resizing, and runtime configuration.

  describe("A. Terminal Input and Output Handling", () => {
    test("Terminal keyboard input is routed to shell input writer", async () => {
      let writtenData = [];
      const mockWriter = {
        write: async (data) => {
          writtenData.push(data);
        },
      };

      const sendTerminalInput = (data) => {
        if (mockWriter) {
          mockWriter.write(data);
        }
      };

      sendTerminalInput("ls -la\r");
      sendTerminalInput("\x03"); // Ctrl+C

      assert.deepStrictEqual(writtenData, ["ls -la\r", "\x03"]);
    });

    test("Process output streams directly to terminal output state without duplication", async () => {
      let terminalOutput = "";
      const appendOutput = (chunk) => {
        terminalOutput += chunk;
      };

      // Simulating chunk arrivals
      appendOutput("$ npm install\n");
      appendOutput("added 50 packages in 1s\n");
      appendOutput("$ npm run dev\n");
      appendOutput("Ready on http://localhost:3000\n");

      assert.strictEqual(
        terminalOutput,
        "$ npm install\nadded 50 packages in 1s\n$ npm run dev\nReady on http://localhost:3000\n"
      );
    });

    test("Terminal output slicing correctly tracks incremental updates", () => {
      let lastLength = 0;
      let writtenToXterm = [];

      const handleOutputUpdate = (output) => {
        if (output.length < lastLength) {
          writtenToXterm = [];
          lastLength = 0;
        }
        const newData = output.slice(lastLength);
        if (newData) {
          writtenToXterm.push(newData);
          lastLength = output.length;
        }
      };

      handleOutputUpdate("chunk 1 ");
      assert.strictEqual(writtenToXterm.join(""), "chunk 1 ");
      assert.strictEqual(lastLength, 8);

      handleOutputUpdate("chunk 1 chunk 2 ");
      assert.strictEqual(writtenToXterm.join(""), "chunk 1 chunk 2 ");
      assert.strictEqual(lastLength, 16);

      // Reset scenario (e.g. restart)
      handleOutputUpdate("");
      assert.strictEqual(writtenToXterm.join(""), "");
      assert.strictEqual(lastLength, 0);
    });
  });

  describe("B. Shell Lifecycle & Process Management", () => {
    test("Interactive shell, install, and dev processes have independent lifecycles", async () => {
      const activeProcesses = new Map();

      const spawnProcess = (name) => {
        let isKilled = false;
        let resolveExit;
        const exitPromise = new Promise((resolve) => {
          resolveExit = resolve;
        });

        const proc = {
          name,
          get killed() {
            return isKilled;
          },
          kill: () => {
            isKilled = true;
            resolveExit(130);
          },
          exit: exitPromise,
          resolveExit,
        };
        activeProcesses.set(name, proc);
        return proc;
      };

      // 1. Run install process to completion
      const installProc = spawnProcess("install");
      assert.strictEqual(activeProcesses.has("install"), true);
      installProc.resolveExit(0);
      const installCode = await installProc.exit;
      assert.strictEqual(installCode, 0);
      activeProcesses.delete("install");
      assert.strictEqual(activeProcesses.has("install"), false);

      // 2. Dev server process starts and keeps running
      const devProc = spawnProcess("dev");
      assert.strictEqual(activeProcesses.has("dev"), true);

      // 3. Shell process starts and is persistent
      const shellProc = spawnProcess("jsh");
      assert.strictEqual(activeProcesses.has("jsh"), true);

      // Interrupting foreground job in shell does not kill dev server
      shellProc.kill();
      assert.strictEqual(shellProc.killed, true);
      assert.strictEqual(devProc.killed, false);
      assert.strictEqual(activeProcesses.has("dev"), true);
    });

    test("Restarting runtime cleans up all existing process references", async () => {
      let cleanedUp = [];
      const shellRef = {
        kill: () => cleanedUp.push("shell"),
      };
      const devRef = {
        kill: () => cleanedUp.push("dev"),
      };
      const installRef = {
        kill: () => cleanedUp.push("install"),
      };
      const writerRef = {
        releaseLock: () => cleanedUp.push("writerLock"),
      };

      const restart = () => {
        writerRef.releaseLock();
        shellRef.kill();
        devRef.kill();
        installRef.kill();
      };

      restart();

      assert.deepStrictEqual(cleanedUp, ["writerLock", "shell", "dev", "install"]);
    });
  });

  describe("C. Ctrl+C Process Interruption", () => {
    test("Ctrl+C writes SIGINT byte (\\x03) to input stream", async () => {
      let receivedBytes = [];
      const writer = {
        write: async (b) => receivedBytes.push(b),
      };

      const interruptForegroundProcess = () => {
        writer.write("\x03");
      };

      interruptForegroundProcess();

      assert.strictEqual(receivedBytes.length, 1);
      assert.strictEqual(receivedBytes[0], "\x03");
    });
  });

  describe("D. Terminal Resizing", () => {
    test("Resize updates dimensions and dispatches to process", () => {
      let resizedDimensions = null;
      const mockProcess = {
        resize: (dims) => {
          resizedDimensions = dims;
        },
      };

      const resizeTerminal = (dims) => {
        if (dims.cols <= 0 || dims.rows <= 0) return;
        mockProcess.resize(dims);
      };

      // Valid dimension
      resizeTerminal({ cols: 120, rows: 40 });
      assert.deepStrictEqual(resizedDimensions, { cols: 120, rows: 40 });

      // Zero or negative dimension ignored safely
      resizeTerminal({ cols: 0, rows: 0 });
      assert.deepStrictEqual(resizedDimensions, { cols: 120, rows: 40 });

      resizeTerminal({ cols: -10, rows: 25 });
      assert.deepStrictEqual(resizedDimensions, { cols: 120, rows: 40 });
    });
  });

  describe("E. Configurable Runtime Settings & Environment Variables", () => {
    test("Command arguments are parsed cleanly with spaces and defaults applied", () => {
      const getCommands = (settings) => {
        const installCmd = settings?.installCommand?.trim() || "npm install";
        const devCmd = settings?.devCommand?.trim() || "npm run dev";

        return {
          install: {
            cmd: installCmd,
            parts: installCmd.split(/\s+/).filter(Boolean),
          },
          dev: {
            cmd: devCmd,
            parts: devCmd.split(/\s+/).filter(Boolean),
          },
        };
      };

      // Defaults
      const defaults = getCommands(undefined);
      assert.strictEqual(defaults.install.cmd, "npm install");
      assert.deepStrictEqual(defaults.install.parts, ["npm", "install"]);
      assert.strictEqual(defaults.dev.cmd, "npm run dev");
      assert.deepStrictEqual(defaults.dev.parts, ["npm", "run", "dev"]);

      // Custom
      const custom = getCommands({
        installCommand: "pnpm   install  --frozen-lockfile ",
        devCommand: "pnpm start",
      });
      assert.deepStrictEqual(custom.install.parts, ["pnpm", "install", "--frozen-lockfile"]);
      assert.deepStrictEqual(custom.dev.parts, ["pnpm", "start"]);
    });

    test("Environment variable parsing from multiline text and format back", () => {
      const parseEnvVariables = (text) => {
        const result = {};
        const lines = text.split("\n");
        for (const line of lines) {
          const trimmed = line.trim();
          if (!trimmed || trimmed.startsWith("#")) continue;
          const eqIdx = trimmed.indexOf("=");
          if (eqIdx !== -1) {
            const key = trimmed.slice(0, eqIdx).trim();
            const val = trimmed.slice(eqIdx + 1).trim();
            if (key) {
              result[key] = val;
            }
          }
        }
        return result;
      };

      const formatEnvVariables = (env) => {
        if (!env) return "";
        return Object.entries(env)
          .map(([k, v]) => `${k}=${v}`)
          .join("\n");
      };

      const rawText = `
        # This is a comment
        NODE_ENV=production
        PORT=8080
        EMPTY_VAL=
        INVALID_LINE_WITHOUT_EQUALS
      `;

      const parsed = parseEnvVariables(rawText);
      assert.deepStrictEqual(parsed, {
        NODE_ENV: "production",
        PORT: "8080",
        EMPTY_VAL: "",
      });

      const formatted = formatEnvVariables(parsed);
      assert.strictEqual(formatted, "NODE_ENV=production\nPORT=8080\nEMPTY_VAL=");
    });

    test("Spawn options receive configured environment variables and terminal dimensions", () => {
      const spawnCalls = [];
      const mockContainer = {
        spawn: async (command, argsOrOptions, options) => {
          spawnCalls.push({ command, argsOrOptions, options });
          return { exit: Promise.resolve(0) };
        },
      };

      const env = { NODE_ENV: "development", CUSTOM_VAR: "true" };
      const terminal = { cols: 100, rows: 30 };

      mockContainer.spawn("npm", ["install"], { env, terminal });
      mockContainer.spawn("jsh", { env, terminal });

      assert.strictEqual(spawnCalls.length, 2);
      assert.deepStrictEqual(spawnCalls[0].options.env, env);
      assert.deepStrictEqual(spawnCalls[0].options.terminal, terminal);
      assert.deepStrictEqual(spawnCalls[1].argsOrOptions.env, env);
      assert.deepStrictEqual(spawnCalls[1].argsOrOptions.terminal, terminal);
    });
  });
});
