import { test, describe, beforeEach } from "node:test";
import assert from "node:assert/strict";

describe("Tool Handlers Tracking Wrapper", () => {
  let recordedEvents = [];
  let currentIteration = 1;

  const mockToolContext = {
    executionId: "exec_test",
    conversationId: "conv_123",
    projectId: "proj_123",
    messageId: "msg_123",
    internalKey: "test_key",
    getCurrentIteration: () => currentIteration,
  };

  beforeEach(() => {
    recordedEvents = [];
    currentIteration = 1;
  });

  // Test the runTrackedTool wrapper logic
  async function runTrackedTool(context, options, execute) {
    if (!context) {
      const executed = await execute();
      return executed.result;
    }

    const iteration = context.getCurrentIteration();

    recordedEvents.push({
      type: "start",
      toolName: options.toolName,
      description: options.description,
      filePaths: options.filePaths,
      iteration,
      status: "running",
    });

    try {
      const { result, summary, filePaths } = await execute();

      recordedEvents.push({
        type: "complete",
        toolName: options.toolName,
        summary,
        filePaths: filePaths ?? options.filePaths,
        status: "completed",
      });

      return result;
    } catch (err) {
      recordedEvents.push({
        type: "fail",
        toolName: options.toolName,
        error: err.message,
        status: "failed",
      });
      throw err;
    }
  }

  test("1. listFiles activity tracks start and completion with count", async () => {
    const result = await runTrackedTool(
      mockToolContext,
      {
        toolName: "listFiles",
        description: "Listing project files...",
      },
      async () => {
        const files = [{ name: "package.json" }, { name: "tsconfig.json" }];
        return {
          result: JSON.stringify(files),
          summary: `Found ${files.length} project items`,
        };
      }
    );

    assert.equal(recordedEvents.length, 2);
    assert.equal(recordedEvents[0].type, "start");
    assert.equal(recordedEvents[0].description, "Listing project files...");
    assert.equal(recordedEvents[1].type, "complete");
    assert.equal(recordedEvents[1].summary, "Found 2 project items");
    assert.ok(result.includes("package.json"));
  });

  test("2. readFiles activity tracks affected file paths", async () => {
    const fileIds = ["file_1", "file_2"];
    const fileNames = ["src/index.ts", "src/utils.ts"];

    const result = await runTrackedTool(
      mockToolContext,
      {
        toolName: "readFiles",
        description: `Reading ${fileIds.length} files...`,
      },
      async () => {
        return {
          result: JSON.stringify([{ name: "src/index.ts" }, { name: "src/utils.ts" }]),
          summary: `Read 2 files (${fileNames.join(", ")})`,
          filePaths: fileNames,
        };
      }
    );

    assert.ok(result);
    assert.equal(recordedEvents.length, 2);
    assert.deepEqual(recordedEvents[1].filePaths, ["src/index.ts", "src/utils.ts"]);
    assert.equal(recordedEvents[1].summary, "Read 2 files (src/index.ts, src/utils.ts)");
  });

  test("3. updateFile activity tracks target file and summary", async () => {
    const fileName = "src/app/page.tsx";

    const result = await runTrackedTool(
      mockToolContext,
      {
        toolName: "updateFile",
        description: `Updating ${fileName}...`,
        filePaths: [fileName],
      },
      async () => {
        return {
          result: `File "${fileName}" updated successfully`,
          summary: `Updated ${fileName}`,
          filePaths: [fileName],
        };
      }
    );

    assert.ok(result);
    assert.equal(recordedEvents.length, 2);
    assert.deepEqual(recordedEvents[0].filePaths, [fileName]);
    assert.equal(recordedEvents[1].summary, `Updated ${fileName}`);
  });

  test("4. createFiles activity tracks created file paths", async () => {
    const fileNames = ["src/components/button.tsx", "src/components/card.tsx"];

    const result = await runTrackedTool(
      mockToolContext,
      {
        toolName: "createFiles",
        description: `Creating ${fileNames.length} files...`,
        filePaths: fileNames,
      },
      async () => {
        return {
          result: "Created 2 file(s): button.tsx, card.tsx",
          summary: "Created 2 file(s): button.tsx, card.tsx",
          filePaths: fileNames,
        };
      }
    );

    assert.ok(result);
    assert.equal(recordedEvents.length, 2);
    assert.deepEqual(recordedEvents[1].filePaths, fileNames);
    assert.equal(recordedEvents[1].summary, "Created 2 file(s): button.tsx, card.tsx");
  });

  test("5. Tool failure records failed status with sanitized error", async () => {
    await assert.rejects(
      async () => {
        await runTrackedTool(
          mockToolContext,
          {
            toolName: "updateFile",
            description: "Updating missing.ts...",
            filePaths: ["missing.ts"],
          },
          async () => {
            throw new Error("File not found");
          }
        );
      },
      /File not found/
    );

    assert.equal(recordedEvents.length, 2);
    assert.equal(recordedEvents[1].type, "fail");
    assert.equal(recordedEvents[1].status, "failed");
    assert.equal(recordedEvents[1].error, "File not found");
  });
});
