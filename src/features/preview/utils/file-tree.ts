import { FileSystemTree } from "@webcontainer/api";

import { Doc, Id } from "../../../../convex/_generated/dataModel";

type FileDoc = Doc<"files">;

/**
 * Convert flat Convex files to nested FileSystemTree for WebContainer
 */
export const buildFileTree = (files: FileDoc[]): FileSystemTree => {
  const tree: FileSystemTree = {};
  const filesMap = new Map(files.map((f) => [f._id, f]));

  const getPath = (file: FileDoc): string[] => {
    const parts: string[] = [file.name];
    let parentId = file.parentId;
    const visited = new Set<Id<"files">>([file._id]);

    while (parentId) {
      if (visited.has(parentId)) break;
      visited.add(parentId);
      const parent = filesMap.get(parentId);
      if (!parent) break;
      parts.unshift(parent.name);
      parentId = parent.parentId;
    }

    return parts;
  };

  for (const file of files) {
    const pathParts = getPath(file);
    let current = tree;

    for (let i = 0; i < pathParts.length; i++) {
      const part = pathParts[i];
      const isLast = i === pathParts.length - 1;

      if (isLast) {
        if (file.type === "folder") {
          // Preserve any existing children if folder node is traversed after its children
          if (!current[part] || !("directory" in current[part])) {
            current[part] = { directory: {} };
          }
        } else if (!file.storageId && file.content !== undefined) {
          current[part] = { file: { contents: file.content } };
        }
      } else {
        if (!current[part] || !("directory" in current[part])) {
          current[part] = { directory: {} };
        }
        const node = current[part];
        if ("directory" in node) {
          current = node.directory;
        }
      }
    }
  }

  return tree;
};

/**
 * Get full path for a file by traversing parent chain
 */
export const getFilePath = (
  file: FileDoc,
  filesMap: Map<Id<"files">, FileDoc>
): string => {
  const parts: string[] = [file.name];
  let parentId = file.parentId;
  const visited = new Set<Id<"files">>([file._id]);

  while (parentId) {
    if (visited.has(parentId)) break;
    visited.add(parentId);
    const parent = filesMap.get(parentId);
    if (!parent) break;
    parts.unshift(parent.name);
    parentId = parent.parentId;
  }

  return parts.join("/");
};

export interface FileTreeSnapshot {
  files: Map<string, string>;
  directories: Set<string>;
}

export interface FileTreeDiff {
  filesToWrite: { path: string; content: string }[];
  filesToDelete: string[];
  directoriesToCreate: string[];
  directoriesToDelete: string[];
}

/**
 * Extract snapshot of file contents and directory paths from flat Convex records
 */
export const extractFileTreeSnapshot = (
  files: FileDoc[]
): FileTreeSnapshot => {
  const filesMap = new Map(files.map((f) => [f._id, f]));
  const fileContentMap = new Map<string, string>();
  const dirSet = new Set<string>();

  for (const item of files) {
    if (item.type === "folder") {
      const dirPath = getFilePath(item, filesMap);
      if (dirPath) {
        dirSet.add(dirPath);
      }
    } else if (item.type === "file" && !item.storageId && item.content !== undefined) {
      const filePath = getFilePath(item, filesMap);
      fileContentMap.set(filePath, item.content);

      // Register all ancestor directories for this file
      const parts = filePath.split("/");
      parts.pop(); // remove file name
      while (parts.length > 0) {
        dirSet.add(parts.join("/"));
        parts.pop();
      }
    }
  }

  return {
    files: fileContentMap,
    directories: dirSet,
  };
};

/**
 * Compute differences between previous and current file-tree snapshots
 */
export const computeFileTreeDiff = (
  prev: FileTreeSnapshot,
  current: FileTreeSnapshot
): FileTreeDiff => {
  const filesToDelete: string[] = [];
  const filesToWrite: { path: string; content: string }[] = [];

  // Files deleted
  for (const [oldPath] of prev.files) {
    if (!current.files.has(oldPath)) {
      filesToDelete.push(oldPath);
    }
  }

  // Files added or modified
  for (const [newPath, content] of current.files) {
    if (prev.files.get(newPath) !== content) {
      filesToWrite.push({ path: newPath, content });
    }
  }

  // Directories to create (shallowest first)
  const directoriesToCreate = Array.from(current.directories)
    .filter((dir) => !prev.directories.has(dir))
    .sort((a, b) => a.split("/").length - b.split("/").length);

  // Directories to delete (deepest first to cleanly remove nested empty folders)
  const directoriesToDelete = Array.from(prev.directories)
    .filter((dir) => !current.directories.has(dir))
    .sort((a, b) => b.split("/").length - a.split("/").length);

  return {
    filesToWrite,
    filesToDelete,
    directoriesToCreate,
    directoriesToDelete,
  };
};