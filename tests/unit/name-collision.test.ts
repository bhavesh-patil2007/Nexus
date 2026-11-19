import { describe, expect, it } from "vitest";

interface Item {
  _id: string;
  name: string;
  type: "file" | "folder";
  parentId?: string;
}

// Emulates the collision check implemented in convex/files.ts and convex/system.ts
const checkCollisionOnCreate = (existingItems: Item[], name: string, parentId?: string) => {
  const siblings = existingItems.filter((item) => item.parentId === parentId);
  const existing = siblings.find((item) => item.name === name);
  if (existing) {
    throw new Error("An item with this name already exists in this location");
  }
};

const checkCollisionOnRename = (
  existingItems: Item[],
  itemId: string,
  newName: string,
  parentId?: string
) => {
  const siblings = existingItems.filter((item) => item.parentId === parentId);
  const existing = siblings.find(
    (sibling) => sibling.name === newName && sibling._id !== itemId
  );
  if (existing) {
    throw new Error("An item with this name already exists in this location");
  }
};

describe("File & Folder Name Collision Detection", () => {
  const items: Item[] = [
    { _id: "1", name: "src", type: "folder", parentId: undefined },
    { _id: "2", name: "package.json", type: "file", parentId: undefined },
    { _id: "3", name: "index.ts", type: "file", parentId: "1" },
    { _id: "4", name: "utils", type: "folder", parentId: "1" },
  ];

  describe("checkCollisionOnCreate", () => {
    it("should allow creating a file when no item with that name exists in parent", () => {
      expect(() => checkCollisionOnCreate(items, "README.md", undefined)).not.toThrow();
    });

    it("should reject creating a file if a file with the same name exists in same folder", () => {
      expect(() => checkCollisionOnCreate(items, "package.json", undefined)).toThrow(
        "An item with this name already exists in this location"
      );
    });

    it("should reject creating a file if a folder with the same name exists in same folder", () => {
      expect(() => checkCollisionOnCreate(items, "src", undefined)).toThrow(
        "An item with this name already exists in this location"
      );
    });

    it("should reject creating a folder if a file with the same name exists in same folder", () => {
      expect(() => checkCollisionOnCreate(items, "package.json", undefined)).toThrow(
        "An item with this name already exists in this location"
      );
    });

    it("should allow creating an item with the same name in a different folder", () => {
      // "index.ts" exists in "src" (parentId: "1"), creating in root (parentId: undefined) is allowed
      expect(() => checkCollisionOnCreate(items, "index.ts", undefined)).not.toThrow();
    });
  });

  describe("checkCollisionOnRename", () => {
    it("should allow renaming when new name is unique among siblings", () => {
      expect(() => checkCollisionOnRename(items, "2", "manifest.json", undefined)).not.toThrow();
    });

    it("should allow renaming to the same name on the same item", () => {
      expect(() => checkCollisionOnRename(items, "2", "package.json", undefined)).not.toThrow();
    });

    it("should reject renaming a file to match an existing sibling folder name", () => {
      expect(() => checkCollisionOnRename(items, "2", "src", undefined)).toThrow(
        "An item with this name already exists in this location"
      );
    });

    it("should reject renaming a folder to match an existing sibling file name", () => {
      expect(() => checkCollisionOnRename(items, "1", "package.json", undefined)).toThrow(
        "An item with this name already exists in this location"
      );
    });

    it("should reject renaming within a nested folder to match an existing sibling", () => {
      expect(() => checkCollisionOnRename(items, "3", "utils", "1")).toThrow(
        "An item with this name already exists in this location"
      );
    });
  });
});
