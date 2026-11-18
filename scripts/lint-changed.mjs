import { execSync } from "node:child_process";
import fs from "node:fs";

let baseRef = process.env.BASE_REF || process.argv[2];
const ZERO_SHA = /^0+$/;

// If baseRef is missing, empty, or an all-zero SHA (e.g. initial push / tag), resolve to default
if (!baseRef || ZERO_SHA.test(baseRef.trim())) {
  // Check if HEAD~1 exists (meaning not an orphan initial commit)
  try {
    execSync("git rev-parse --verify HEAD~1", { stdio: "ignore" });
    baseRef = "HEAD~1";
  } catch {
    baseRef = "HEAD";
  }
}

const EXTENSIONS = new Set([".js", ".jsx", ".ts", ".tsx", ".mjs", ".cjs"]);

function getChangedFiles() {
  try {
    // 1. Files committed on feature branch vs baseRef
    let branchDiff = "";
    if (baseRef !== "HEAD") {
      try {
        branchDiff = execSync(`git diff --name-only --diff-filter=ACMR ${baseRef}...HEAD`, {
          encoding: "utf8",
          stdio: ["pipe", "pipe", "ignore"],
        });
      } catch {
        // If three-dot diff fails, fallback to two-dot diff
        try {
          branchDiff = execSync(`git diff --name-only --diff-filter=ACMR ${baseRef} HEAD`, {
            encoding: "utf8",
            stdio: ["pipe", "pipe", "ignore"],
          });
        } catch {
          branchDiff = "";
        }
      }
    }

    // 2. Uncommitted staged/unstaged tracked changes vs HEAD
    let workingDiff = "";
    try {
      workingDiff = execSync("git diff --name-only --diff-filter=ACMR HEAD", {
        encoding: "utf8",
        stdio: ["pipe", "pipe", "ignore"],
      });
    } catch {
      workingDiff = "";
    }

    // 3. Untracked files
    let untracked = "";
    try {
      untracked = execSync("git ls-files --others --exclude-standard", {
        encoding: "utf8",
        stdio: ["pipe", "pipe", "ignore"],
      });
    } catch {
      untracked = "";
    }

    const allFiles = new Set([
      ...branchDiff.split("\n"),
      ...workingDiff.split("\n"),
      ...untracked.split("\n"),
    ]);

    return Array.from(allFiles)
      .map((f) => f.trim())
      .filter((file) => {
        if (!file || !fs.existsSync(file)) return false;
        return Array.from(EXTENSIONS).some((ext) => file.endsWith(ext));
      });
  } catch (error) {
    console.error("Failed to determine changed files from git:", error);
    process.exit(1);
  }
}

const filesToLint = getChangedFiles();

if (filesToLint.length === 0) {
  console.log(`No changed JS/TS files to lint against base: ${baseRef}`);
  process.exit(0);
}

console.log(`Linting ${filesToLint.length} changed file(s) against base: ${baseRef}:`);
filesToLint.forEach((f) => console.log(` - ${f}`));

try {
  // Pass file list to eslint directly
  execSync(`npx eslint ${filesToLint.map((f) => `"${f}"`).join(" ")}`, {
    stdio: "inherit",
  });
  console.log("ESLint check passed for all changed files.");
} catch {
  process.exit(1);
}
