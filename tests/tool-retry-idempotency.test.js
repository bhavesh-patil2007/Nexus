import { test, describe, beforeEach } from "node:test";
import assert from "node:assert/strict";

describe("Tool Lifecycle Retry Idempotency", () => {
  let mockEventsTable = [];

  const executionContext = {
    executionId: "exec_stable_msg123",
    conversationId: "conv_123",
    projectId: "proj_123",
    messageId: "msg_123",
    internalKey: "test_key",
  };

  beforeEach(() => {
    mockEventsTable = [];
  });

  // Simulator for tracked tool execution with deterministic toolExecutionId
  function createSimulator() {
    let currentIteration = 1;
    const callCounters = new Map();

    const context = {
      ...executionContext,
      getCurrentIteration: () => currentIteration,
      setIteration: (iter) => { currentIteration = iter; },
      getNextToolCallIndex: (toolName) => {
        const key = `iter${currentIteration}-${toolName}`;
        const count = callCounters.get(key) ?? 0;
        callCounters.set(key, count + 1);
        return count;
      },
    };

    const runTrackedTool = async (options, execute) => {
      const iteration = context.getCurrentIteration();
      const callIndex = context.getNextToolCallIndex(options.toolName);
      const toolExecutionId = `${context.executionId}-iter${iteration}-${options.toolName}-${callIndex}`;

      // Idempotent start: if event already exists, do not duplicate
      let event = mockEventsTable.find((e) => e.toolExecutionId === toolExecutionId);
      if (!event) {
        event = {
          _id: `evt_${mockEventsTable.length + 1}`,
          toolExecutionId,
          executionId: context.executionId,
          iteration,
          toolName: options.toolName,
          description: options.description,
          filePaths: options.filePaths,
          status: "running",
          startedAt: Date.now(),
        };
        mockEventsTable.push(event);
      }

      try {
        const { result, summary, filePaths } = await execute();

        // Terminal protection: do not overwrite cancelled
        if (event.status !== "cancelled") {
          event.status = "completed";
          event.summary = summary;
          if (filePaths) event.filePaths = filePaths;
          event.completedAt = Date.now();
        }

        return result;
      } catch (err) {
        if (event.status !== "cancelled") {
          event.status = "failed";
          event.error = err.message;
          event.completedAt = Date.now();
        }
        throw err;
      }
    };

    return { context, runTrackedTool };
  }

  test("1. Simulated Inngest retry produces identical toolExecutionId without duplicating event", async () => {
    // Attempt 1: Inngest execution step runs listFiles
    const sim1 = createSimulator();
    await sim1.runTrackedTool(
      { toolName: "listFiles", description: "Listing files..." },
      async () => ({ result: "fileListA", summary: "Found 3 files" })
    );

    assert.equal(mockEventsTable.length, 1);
    const initialId = mockEventsTable[0].toolExecutionId;
    assert.equal(initialId, "exec_stable_msg123-iter1-listFiles-0");
    assert.equal(mockEventsTable[0].status, "completed");

    // Attempt 2: Inngest retries the function due to a subsequent step error
    const sim2 = createSimulator();
    await sim2.runTrackedTool(
      { toolName: "listFiles", description: "Listing files..." },
      async () => ({ result: "fileListA", summary: "Found 3 files" })
    );

    // Event table should NOT contain duplicate record
    assert.equal(mockEventsTable.length, 1);
    assert.equal(mockEventsTable[0].toolExecutionId, initialId);
    assert.equal(mockEventsTable[0].status, "completed");
  });

  test("2. Concurrent calls to the same tool in the same iteration get unique deterministic indices", async () => {
    const sim = createSimulator();

    // Call 1: readFiles on file 1
    await sim.runTrackedTool(
      { toolName: "readFiles", description: "Reading file 1...", filePaths: ["f1.ts"] },
      async () => ({ result: "content1", summary: "Read f1.ts" })
    );

    // Call 2: readFiles on file 2 in same iteration
    await sim.runTrackedTool(
      { toolName: "readFiles", description: "Reading file 2...", filePaths: ["f2.ts"] },
      async () => ({ result: "content2", summary: "Read f2.ts" })
    );

    assert.equal(mockEventsTable.length, 2);
    assert.equal(mockEventsTable[0].toolExecutionId, "exec_stable_msg123-iter1-readFiles-0");
    assert.equal(mockEventsTable[1].toolExecutionId, "exec_stable_msg123-iter1-readFiles-1");
  });

  test("3. Multiple iterations maintain distinct deterministic IDs", async () => {
    const sim = createSimulator();

    // Iteration 1
    sim.context.setIteration(1);
    await sim.runTrackedTool(
      { toolName: "updateFile", description: "Updating iter 1...", filePaths: ["f.ts"] },
      async () => ({ result: "ok1", summary: "Updated iter 1" })
    );

    // Iteration 2
    sim.context.setIteration(2);
    await sim.runTrackedTool(
      { toolName: "updateFile", description: "Updating iter 2...", filePaths: ["f.ts"] },
      async () => ({ result: "ok2", summary: "Updated iter 2" })
    );

    assert.equal(mockEventsTable.length, 2);
    assert.equal(mockEventsTable[0].toolExecutionId, "exec_stable_msg123-iter1-updateFile-0");
    assert.equal(mockEventsTable[1].toolExecutionId, "exec_stable_msg123-iter2-updateFile-0");
  });

  test("4. A retried step cannot overwrite a cancelled event status", async () => {
    const sim1 = createSimulator();
    // Start tool
    let runningEvt;
    try {
      await sim1.runTrackedTool(
        { toolName: "createFiles", description: "Creating..." },
        async () => {
          runningEvt = mockEventsTable.find((e) => e.toolExecutionId === "exec_stable_msg123-iter1-createFiles-0");
          // User cancels while tool is executing
          runningEvt.status = "cancelled";
          throw new Error("Interrupted by cancellation");
        }
      );
    } catch {
      // expected
    }

    assert.equal(mockEventsTable[0].status, "cancelled");

    // Later retry attempted
    const sim2 = createSimulator();
    await sim2.runTrackedTool(
      { toolName: "createFiles", description: "Creating..." },
      async () => ({ result: "done", summary: "Created files" })
    );

    // Should remain cancelled
    assert.equal(mockEventsTable[0].status, "cancelled");
  });
});
