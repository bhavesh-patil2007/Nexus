import { test, describe, beforeEach } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import ts from "typescript";

// Helper to load and transpile TypeScript file into an isolated CommonJS module
function loadModule(relPath) {
  const fullPath = path.resolve(process.cwd(), relPath);
  const tsCode = fs.readFileSync(fullPath, "utf-8");
  const transpiled = ts.transpileModule(tsCode, {
    compilerOptions: {
      module: ts.ModuleKind.CommonJS,
      target: ts.ScriptTarget.ES2022,
      esModuleInterop: true,
    },
  }).outputText;

  const m = { exports: {} };
  const customRequire = (id) => {
    if (id === "zustand") {
      // Minimal zustand create implementation for tests
      return {
        create: () => (fn) => {
          let state = {};
          const listeners = new Set();
          const get = () => state;
          const set = (partial) => {
            const next = typeof partial === "function" ? partial(state) : partial;
            state = { ...state, ...next };
            listeners.forEach((listener) => listener(state));
          };
          const subscribe = (listener) => {
            listeners.add(listener);
            return () => listeners.delete(listener);
          };
          state = fn(set, get, { subscribe, getState: get, setState: set });
          const useStore = (selector) => (selector ? selector(state) : state);
          Object.assign(useStore, {
            getState: get,
            setState: set,
            subscribe,
          });
          return useStore;
        },
      };
    }
    // Return empty mock for convex dataModel
    return {};
  };

  const fn = new Function("require", "module", "exports", transpiled);
  fn(customRequire, m, m.exports);
  return m.exports;
}

const { useEditorStore } = loadModule("src/features/editor/store/use-editor-store.ts");

describe("Issue #4 - Editor Dirty Tracking & Conflict Detection Store", () => {
  const projectId = "proj_1";
  const file1 = "file_1";
  const file2 = "file_2";

  beforeEach(() => {
    useEditorStore.setState({ tabs: new Map() });
  });

  // Scenario 1: Editing a file marks its tab dirty immediately
  test("1. Editing a file marks its tab dirty immediately", () => {
    const store = useEditorStore.getState();
    store.openFile(projectId, file1, { pinned: true, initialContent: "hello" });
    assert.equal(store.isFileDirty(projectId, file1), false);

    store.updateBuffer(projectId, file1, "hello world");
    assert.equal(store.isFileDirty(projectId, file1), true);
    assert.equal(store.getTabData(projectId, file1)?.buffer, "hello world");
    assert.equal(store.getTabData(projectId, file1)?.savedContent, "hello");
  });

  // Scenario 2: Switching tabs preserves unsaved content
  test("2. Switching tabs preserves unsaved content", () => {
    const store = useEditorStore.getState();
    store.openFile(projectId, file1, { pinned: true, initialContent: "file 1 content" });
    store.openFile(projectId, file2, { pinned: true, initialContent: "file 2 content" });

    store.setActiveTab(projectId, file1);
    store.updateBuffer(projectId, file1, "file 1 edited");

    // Switch to file 2
    store.setActiveTab(projectId, file2);
    assert.equal(store.getTabState(projectId).activeTabId, file2);
    assert.equal(store.getTabData(projectId, file2)?.buffer, "file 2 content");

    // Switch back to file 1 - buffer and dirty state must be preserved
    store.setActiveTab(projectId, file1);
    assert.equal(store.getTabState(projectId).activeTabId, file1);
    assert.equal(store.getTabData(projectId, file1)?.buffer, "file 1 edited");
    assert.equal(store.isFileDirty(projectId, file1), true);
  });

  // Scenario 3: Editing multiple files tracks their dirty states independently
  test("3. Editing multiple files tracks their dirty states independently", () => {
    const store = useEditorStore.getState();
    store.openFile(projectId, file1, { pinned: true, initialContent: "original 1" });
    store.openFile(projectId, file2, { pinned: true, initialContent: "original 2" });

    store.updateBuffer(projectId, file1, "modified 1");
    assert.equal(store.isFileDirty(projectId, file1), true);
    assert.equal(store.isFileDirty(projectId, file2), false);

    store.updateBuffer(projectId, file2, "modified 2");
    assert.equal(store.isFileDirty(projectId, file1), true);
    assert.equal(store.isFileDirty(projectId, file2), true);
  });

  // Scenario 4: Successfully saving a file clears only that file's dirty state
  test("4. Successfully saving a file clears only that file's dirty state", () => {
    const store = useEditorStore.getState();
    store.openFile(projectId, file1, { pinned: true, initialContent: "original 1" });
    store.openFile(projectId, file2, { pinned: true, initialContent: "original 2" });

    store.updateBuffer(projectId, file1, "modified 1");
    store.updateBuffer(projectId, file2, "modified 2");

    const savedContent = store.markSavingStart(projectId, file1);
    assert.equal(savedContent, "modified 1");
    assert.equal(store.getTabData(projectId, file1)?.isSaving, true);

    store.markSavingSuccess(projectId, file1, savedContent, Date.now());
    assert.equal(store.isFileDirty(projectId, file1), false);
    assert.equal(store.getTabData(projectId, file1)?.isSaving, false);
    assert.equal(store.getTabData(projectId, file1)?.savedContent, "modified 1");

    // file2 should remain dirty and untouched
    assert.equal(store.isFileDirty(projectId, file2), true);
  });

  // Scenario 5: Failed saves preserve dirty state
  test("5. Failed saves preserve dirty state", () => {
    const store = useEditorStore.getState();
    store.openFile(projectId, file1, { pinned: true, initialContent: "original 1" });
    store.updateBuffer(projectId, file1, "modified 1");

    store.markSavingStart(projectId, file1);
    store.markSavingError(projectId, file1, "Network timeout");

    const tabData = store.getTabData(projectId, file1);
    assert.equal(tabData?.isDirty, true);
    assert.equal(tabData?.isSaving, false);
    assert.equal(tabData?.saveError, "Network timeout");
  });

  // Scenario 9 & 19: New edits made during save remain dirty & stale save responses do not clear newer dirty state
  test("9 & 19. New edits made during a save remain dirty", () => {
    const store = useEditorStore.getState();
    store.openFile(projectId, file1, { pinned: true, initialContent: "v1" });

    store.updateBuffer(projectId, file1, "v2");
    const contentToSave = store.markSavingStart(projectId, file1);
    assert.equal(contentToSave, "v2");

    // User types "v3" while save is in flight
    store.updateBuffer(projectId, file1, "v3");
    assert.equal(store.getTabData(projectId, file1)?.buffer, "v3");

    // Save for "v2" succeeds
    store.markSavingSuccess(projectId, file1, contentToSave, Date.now());

    // Because buffer is "v3" and saved was "v2", file must STILL be dirty
    assert.equal(store.isFileDirty(projectId, file1), true);
    assert.equal(store.getTabData(projectId, file1)?.buffer, "v3");
    assert.equal(store.getTabData(projectId, file1)?.savedContent, "v2");
  });

  // Scenario 10 & 11: hasDirtyTabs for browser beforeunload warnings
  test("10 & 11. hasDirtyTabs detects dirty state across open tabs", () => {
    const store = useEditorStore.getState();
    assert.equal(store.hasDirtyTabs(projectId), false);

    store.openFile(projectId, file1, { pinned: true, initialContent: "text" });
    assert.equal(store.hasDirtyTabs(projectId), false);

    store.updateBuffer(projectId, file1, "text changed");
    assert.equal(store.hasDirtyTabs(projectId), true);

    store.markSavingSuccess(projectId, file1, "text changed");
    assert.equal(store.hasDirtyTabs(projectId), false);
  });

  // Scenario 13: Clean tab accepts external updates
  test("13. Clean tab accepts external updates", () => {
    const store = useEditorStore.getState();
    store.openFile(projectId, file1, { pinned: true, initialContent: "initial code", updatedAt: 100 });

    const result = store.handleRemoteUpdate(projectId, file1, "remote updated code", 200);
    assert.equal(result.action, "updated");
    assert.equal(store.getTabData(projectId, file1)?.buffer, "remote updated code");
    assert.equal(store.getTabData(projectId, file1)?.savedContent, "remote updated code");
    assert.equal(store.isFileDirty(projectId, file1), false);
    assert.equal(store.getTabData(projectId, file1)?.hasConflict, false);
  });

  // Scenario 14 & 15: Dirty tab detects conflict when remote update arrives
  test("14 & 15. Dirty tab preserves local content and detects conflict on external update", () => {
    const store = useEditorStore.getState();
    store.openFile(projectId, file1, { pinned: true, initialContent: "base code", updatedAt: 100 });

    // User makes local changes
    store.updateBuffer(projectId, file1, "my local modifications");
    assert.equal(store.isFileDirty(projectId, file1), true);

    // AI agent updates file remotely
    const result = store.handleRemoteUpdate(projectId, file1, "ai agent remote modifications", 200);
    assert.equal(result.action, "conflict");

    // Local buffer must be PRESERVED
    assert.equal(store.getTabData(projectId, file1)?.buffer, "my local modifications");
    assert.equal(store.getTabData(projectId, file1)?.hasConflict, true);
    assert.equal(store.getTabData(projectId, file1)?.remoteContent, "ai agent remote modifications");
    assert.equal(store.getTabData(projectId, file1)?.remoteUpdatedAt, 200);
  });

  // Scenario 17: Accepting external changes replaces local content
  test("17. Accepting external changes replaces local content", () => {
    const store = useEditorStore.getState();
    store.openFile(projectId, file1, { pinned: true, initialContent: "base", updatedAt: 100 });
    store.updateBuffer(projectId, file1, "local edits");
    store.handleRemoteUpdate(projectId, file1, "remote edits", 200);

    assert.equal(store.getTabData(projectId, file1)?.hasConflict, true);

    store.resolveConflictAcceptRemote(projectId, file1);
    const tabData = store.getTabData(projectId, file1);
    assert.equal(tabData?.hasConflict, false);
    assert.equal(tabData?.buffer, "remote edits");
    assert.equal(tabData?.savedContent, "remote edits");
    assert.equal(tabData?.isDirty, false);
    assert.equal(tabData?.remoteContent, null);
  });

  // Scenario 18: Keeping local changes preserves local buffer and clears conflict
  test("18. Keeping local changes preserves local buffer and clears conflict", () => {
    const store = useEditorStore.getState();
    store.openFile(projectId, file1, { pinned: true, initialContent: "base", updatedAt: 100 });
    store.updateBuffer(projectId, file1, "local edits");
    store.handleRemoteUpdate(projectId, file1, "remote edits", 200);

    assert.equal(store.getTabData(projectId, file1)?.hasConflict, true);

    store.resolveConflictKeepLocal(projectId, file1);
    const tabData = store.getTabData(projectId, file1);
    assert.equal(tabData?.hasConflict, false);
    assert.equal(tabData?.buffer, "local edits");
    assert.equal(tabData?.isDirty, true);
    assert.equal(tabData?.remoteContent, null);
  });

  // Scenario 20: Outdated remote updates do not overwrite newer content
  test("20. Outdated remote updates do not overwrite newer content", () => {
    const store = useEditorStore.getState();
    store.openFile(projectId, file1, { pinned: true, initialContent: "v2 content", updatedAt: 500 });

    const result = store.handleRemoteUpdate(projectId, file1, "stale v1 content", 300);
    assert.equal(result.action, "ignored");
    assert.equal(store.getTabData(projectId, file1)?.buffer, "v2 content");
    assert.equal(store.getTabData(projectId, file1)?.hasConflict, false);
  });

  // Scenario 23 & 24: Closing and reopening tabs behaves correctly
  test("23 & 24. Closing tabs cleans up data, closing all resets state", () => {
    const store = useEditorStore.getState();
    store.openFile(projectId, file1, { pinned: true, initialContent: "content 1" });
    store.openFile(projectId, file2, { pinned: true, initialContent: "content 2" });

    store.closeTab(projectId, file1);
    assert.equal(store.getTabData(projectId, file1), undefined);
    assert.equal(store.getTabState(projectId).openTabs.includes(file1), false);
    assert.equal(store.getTabState(projectId).activeTabId, file2);

    store.closeAllTabs(projectId);
    assert.equal(store.getTabState(projectId).openTabs.length, 0);
    assert.equal(store.getTabState(projectId).activeTabId, null);
  });
});
