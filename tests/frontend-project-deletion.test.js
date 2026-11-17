import { test, describe } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";

describe("Issue #7 - Frontend Component Contracts & Logic Tests", () => {
  test("1. DeleteProjectDialog requires exact name match before enabling submit", () => {
    const dialogPath = path.resolve(
      process.cwd(),
      "src/features/projects/components/delete-project-dialog.tsx"
    );
    const content = fs.readFileSync(dialogPath, "utf-8");

    // Exact check verification
    assert.match(
      content,
      /const isMatching = confirmName === projectName;/,
      "Dialog must check for exact string equality"
    );
    // Button disabled when not matching or isDeleting
    assert.match(
      content,
      /disabled=\{!isMatching \|\| isDeleting\}/,
      "Confirmation button must be disabled until exact match and during deletion"
    );
    // Form submission guard
    assert.match(
      content,
      /if \(!isMatching \|\| isDeleting\) return;/,
      "Form submit handler must guard against execution without exact match"
    );
    // Modal cannot be dismissed while deleting
    assert.match(
      content,
      /if \(isDeleting\) return;/,
      "Dialog must prevent closing when deletion is in progress"
    );
  });

  test("2. ProjectsList integrates Delete Project action and confirmation dialog", () => {
    const listPath = path.resolve(
      process.cwd(),
      "src/features/projects/components/projects-list.tsx"
    );
    const content = fs.readFileSync(listPath, "utf-8");

    assert.match(content, /DeleteProjectDialog/, "Must render DeleteProjectDialog");
    assert.match(content, /useDeleteProject\(\)/, "Must hook up useDeleteProject");
    assert.match(content, /deleteProject\(\{ id: projectToDelete\._id \}\)/, "Must pass correct project ID");
    assert.match(content, /toast\.success\("Project deleted successfully"\)/, "Must show success toast");
    assert.match(content, /toast\.error\(/, "Must show error toast on failure");
    assert.match(content, /Delete Project/, "Must provide Delete Project menu item");
  });

  test("3. ProjectsCommandDialog integrates Delete Project action and confirmation dialog", () => {
    const cmdPath = path.resolve(
      process.cwd(),
      "src/features/projects/components/projects-command-dialog.tsx"
    );
    const content = fs.readFileSync(cmdPath, "utf-8");

    assert.match(content, /DeleteProjectDialog/, "Must render DeleteProjectDialog");
    assert.match(content, /useDeleteProject\(\)/, "Must hook up useDeleteProject");
    assert.match(content, /deleteProject\(\{ id: projectToDelete\._id \}\)/, "Must pass correct project ID");
    assert.match(content, /toast\.success\("Project deleted successfully"\)/, "Must show success toast");
    assert.match(content, /toast\.error\(/, "Must show error toast on failure");
  });

  test("4. Navbar and ProjectSettingsDialog provide workspace deletion with redirect", () => {
    const navbarPath = path.resolve(
      process.cwd(),
      "src/features/projects/components/navbar.tsx"
    );
    const navbarContent = fs.readFileSync(navbarPath, "utf-8");
    assert.match(navbarContent, /ProjectSettingsDialog/, "Navbar must render ProjectSettingsDialog");
    assert.match(navbarContent, /SettingsIcon/, "Navbar must have settings button");

    const settingsPath = path.resolve(
      process.cwd(),
      "src/features/projects/components/project-settings-dialog.tsx"
    );
    const settingsContent = fs.readFileSync(settingsPath, "utf-8");
    assert.match(settingsContent, /DeleteProjectDialog/, "Settings must render DeleteProjectDialog");
    assert.match(settingsContent, /useDeleteProject\(\)/, "Settings must hook up useDeleteProject");
    assert.match(settingsContent, /router\.push\("\/"\)/, "Must redirect to dashboard after deletion");
    assert.match(settingsContent, /toast\.success\("Project deleted successfully"\)/, "Must show success toast");
  });

  test("5. useDeleteProject provides optimistic update filtering out deleted project", () => {
    const hookPath = path.resolve(
      process.cwd(),
      "src/features/projects/hooks/use-projects.ts"
    );
    const hookContent = fs.readFileSync(hookPath, "utf-8");

    assert.match(hookContent, /export const useDeleteProject = \(\) =>/, "Must export useDeleteProject");
    assert.match(hookContent, /api\.projects\.deleteProject/, "Must invoke api.projects.deleteProject");
    assert.match(hookContent, /existingProjects\.filter\(\(project\) => project\._id !== args\.id\)/, "Must optimistically remove deleted project from localStore");
  });
});
