import { describe, expect, it } from "vitest";

import { Doc, Id } from "@/../convex/_generated/dataModel";
import {
  buildFileTree,
  getFilePath,
  extractFileTreeSnapshot,
  computeFileTreeDiff,
} from "@/features/preview/utils/file-tree";

type FileDoc = Doc<"files">;

const createMockFile = (overrides: Partial<FileDoc>): FileDoc => ({
  _id: "file_1" as Id<"files">,
  _creationTime: 123456789,
  projectId: "proj_1" as Id<"projects">,
  name: "index.ts",
  type: "file",
  parentId: undefined,
  content: "console.log('hello');",
  updatedAt: Date.now(),
  ...overrides,
});

describe("file-tree utils", () => {
  describe("getFilePath", () => {
    it("should return filename if there is no parent", () => {
      const file = createMockFile({ _id: "f1" as Id<"files">, name: "index.ts", parentId: undefined });
      const map = new Map<Id<"files">, FileDoc>([[file._id, file]]);

      expect(getFilePath(file, map)).toBe("index.ts");
    });

    it("should resolve full nested path when parentId chain exists", () => {
      const rootFolder = createMockFile({
        _id: "folder_src" as Id<"files">,
        name: "src",
        type: "folder",
        parentId: undefined,
      });
      const subFolder = createMockFile({
        _id: "folder_utils" as Id<"files">,
        name: "utils",
        type: "folder",
        parentId: "folder_src" as Id<"files">,
      });
      const file = createMockFile({
        _id: "file_tree" as Id<"files">,
        name: "file-tree.ts",
        type: "file",
        parentId: "folder_utils" as Id<"files">,
      });

      const map = new Map<Id<"files">, FileDoc>([
        [rootFolder._id, rootFolder],
        [subFolder._id, subFolder],
        [file._id, file],
      ]);

      expect(getFilePath(file, map)).toBe("src/utils/file-tree.ts");
    });

    it("should handle broken parent references gracefully", () => {
      const file = createMockFile({
        _id: "file_orphan" as Id<"files">,
        name: "orphan.ts",
        parentId: "missing_parent" as Id<"files">,
      });
      const map = new Map<Id<"files">, FileDoc>([[file._id, file]]);

      expect(getFilePath(file, map)).toBe("orphan.ts");
    });
  });

  describe("buildFileTree", () => {
    it("should return empty object when files array is empty", () => {
      expect(buildFileTree([])).toEqual({});
    });

    it("should construct tree for root files and folders", () => {
      const files: FileDoc[] = [
        createMockFile({
          _id: "f1" as Id<"files">,
          name: "package.json",
          type: "file",
          content: '{"name": "test"}',
        }),
        createMockFile({
          _id: "f2" as Id<"files">,
          name: "src",
          type: "folder",
        }),
      ];

      const result = buildFileTree(files);

      expect(result).toEqual({
        "package.json": {
          file: {
            contents: '{"name": "test"}',
          },
        },
        src: {
          directory: {},
        },
      });
    });

    it("should properly nest files inside parent directories", () => {
      const files: FileDoc[] = [
        createMockFile({
          _id: "f_src" as Id<"files">,
          name: "src",
          type: "folder",
          parentId: undefined,
        }),
        createMockFile({
          _id: "f_index" as Id<"files">,
          name: "index.ts",
          type: "file",
          parentId: "f_src" as Id<"files">,
          content: "export const x = 1;",
        }),
      ];

      const result = buildFileTree(files);

      expect(result).toEqual({
        src: {
          directory: {
            "index.ts": {
              file: {
                contents: "export const x = 1;",
              },
            },
          },
        },
      });
    });

    it("should ignore files with storageId or undefined content", () => {
      const files: FileDoc[] = [
        createMockFile({
          _id: "f_bin" as Id<"files">,
          name: "image.png",
          type: "file",
          storageId: "storage_123" as Id<"_storage">,
          content: undefined,
        }),
      ];

      const result = buildFileTree(files);
      expect(result).toEqual({});
    });

    it("should preserve children when folder appears after its child files in the array (prevent clobbering)", () => {
      // Child file appears FIRST in array, folder appears SECOND
      const files: FileDoc[] = [
        createMockFile({
          _id: "f_child" as Id<"files">,
          name: "button.tsx",
          type: "file",
          parentId: "folder_components" as Id<"files">,
          content: "export const Button = () => null;",
        }),
        createMockFile({
          _id: "folder_components" as Id<"files">,
          name: "components",
          type: "folder",
          parentId: undefined,
        }),
      ];

      const result = buildFileTree(files);

      expect(result).toEqual({
        components: {
          directory: {
            "button.tsx": {
              file: {
                contents: "export const Button = () => null;",
              },
            },
          },
        },
      });
    });

    it("should handle circular parentId references gracefully without infinite loops", () => {
      const f1 = createMockFile({
        _id: "loop_1" as Id<"files">,
        name: "folder_a",
        type: "folder",
        parentId: "loop_2" as Id<"files">,
      });
      const f2 = createMockFile({
        _id: "loop_2" as Id<"files">,
        name: "folder_b",
        type: "folder",
        parentId: "loop_1" as Id<"files">,
      });

      const map = new Map<Id<"files">, FileDoc>([
        [f1._id, f1],
        [f2._id, f2],
      ]);

      expect(() => getFilePath(f1, map)).not.toThrow();
      expect(() => buildFileTree([f1, f2])).not.toThrow();
    });
  });

  describe("File Tree Diffing and Directory Pruning", () => {
    it("should detect deleted files and empty folders to prune", () => {
      const srcFolder = createMockFile({
        _id: "folder_src" as Id<"files">,
        name: "src",
        type: "folder",
      });
      const componentsFolder = createMockFile({
        _id: "folder_components" as Id<"files">,
        name: "components",
        type: "folder",
        parentId: "folder_src" as Id<"files">,
      });
      const buttonFile = createMockFile({
        _id: "file_button" as Id<"files">,
        name: "button.tsx",
        type: "file",
        parentId: "folder_components" as Id<"files">,
        content: "export const Button = () => null;",
      });
      const emptyFolder = createMockFile({
        _id: "folder_empty" as Id<"files">,
        name: "empty_dir",
        type: "folder",
      });

      // Previous snapshot: src/components/button.tsx and empty_dir
      const prevSnapshot = extractFileTreeSnapshot([
        srcFolder,
        componentsFolder,
        buttonFile,
        emptyFolder,
      ]);

      expect(prevSnapshot.directories).toContain("src");
      expect(prevSnapshot.directories).toContain("src/components");
      expect(prevSnapshot.directories).toContain("empty_dir");
      expect(prevSnapshot.files.get("src/components/button.tsx")).toBe(
        "export const Button = () => null;"
      );

      // Current snapshot: button.tsx and empty_dir deleted; components folder deleted
      const currentSnapshot = extractFileTreeSnapshot([srcFolder]);

      const diff = computeFileTreeDiff(prevSnapshot, currentSnapshot);

      expect(diff.filesToDelete).toEqual(["src/components/button.tsx"]);
      expect(diff.directoriesToDelete).toContain("empty_dir");
      expect(diff.directoriesToDelete).toContain("src/components");
      expect(diff.directoriesToDelete).not.toContain("src");
      // Deepest directories should be deleted first
      expect(diff.directoriesToDelete.indexOf("src/components")).toBeLessThan(
        diff.directoriesToDelete.indexOf("empty_dir") === -1
          ? 999
          : diff.directoriesToDelete.length
      );
    });

    it("should detect newly created directories and modified files", () => {
      const prevSnapshot = {
        files: new Map([["index.ts", "console.log(1);"]]),
        directories: new Set<string>(),
      };

      const currentSnapshot = {
        files: new Map([["index.ts", "console.log(2);"], ["src/utils/math.ts", "export const add = () => {};"]]),
        directories: new Set(["src", "src/utils"]),
      };

      const diff = computeFileTreeDiff(prevSnapshot, currentSnapshot);

      expect(diff.filesToWrite).toEqual([
        { path: "index.ts", content: "console.log(2);" },
        { path: "src/utils/math.ts", content: "export const add = () => {};" },
      ]);
      expect(diff.directoriesToCreate).toEqual(["src", "src/utils"]);
      expect(diff.filesToDelete).toEqual([]);
      expect(diff.directoriesToDelete).toEqual([]);
    });
  });
});
