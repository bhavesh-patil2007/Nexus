import { describe, expect, it } from "vitest";

import { Doc, Id } from "@/../convex/_generated/dataModel";
import { buildFileTree, getFilePath } from "@/features/preview/utils/file-tree";

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
  });
});
