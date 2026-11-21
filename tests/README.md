# Nexus Test Suite Inventory & Guide

This document describes the testing architecture in Nexus, test runner classifications, test inventories, execution commands, and guidelines for adding new tests.

---

## 🏗️ Test Suite Classifications

Nexus organizes its test infrastructure into three categories:

| Category | Runner | Scope / Location | Primary Command |
|---|---|---|---|
| **Group A: Unit Tests** | Vitest (`vitest run`) | `tests/unit/**/*.test.{ts,tsx}` | `npm test` |
| **Group B: Standalone Regression Tests** | Node built-in (`node:test`) | `tests/*.test.js` | `npm run test:regression` |
| **Group C: Special-Runtime Tests** | Node built-in (`node:test`) | `tests/*.test.js` (special mocks) | `node --test tests/<file>.test.js` |

---

## 📋 Test Inventory

### Group A — Vitest Unit Tests (`npm test`)
Configured in `vitest.config.ts` (`include: ["tests/unit/**/*.test.{ts,tsx}"]`). Tested in Node or JSDOM environments.
- `tests/unit/api-schema.test.ts`: Zod request schemas and boundary validation.
- `tests/unit/conversation-sidebar-accessibility.test.tsx`: Sidebar action buttons and accessibility attributes.
- `tests/unit/editor-autosave.test.tsx`: Independent per-file debounce timers, tab switching, and cleanup.
- `tests/unit/env-variables.test.ts`: Environment variable parsing and string formatting.
- `tests/unit/file-explorer-accessibility.test.tsx`: File explorer action buttons and tooltips.
- `tests/unit/file-explorer-inline-inputs.test.tsx`: Synchronous submission guards for inline creation and renaming.
- `tests/unit/file-tree.test.ts`: Tree construction and hierarchical file/folder navigation.
- `tests/unit/github-url.test.ts`: GitHub URL parser and owner/repository extractor.
- `tests/unit/language-extension.test.ts`: CodeMirror language extension resolution.
- `tests/unit/name-collision.test.ts`: File and folder name collision prevention.
- `tests/unit/navbar-accessibility.test.tsx`: Navbar navigation and accessibility attributes.
- `tests/unit/projects-view-shortcuts.test.tsx`: Global keyboard shortcuts (`Ctrl/Cmd+I`, `Ctrl/Cmd+K`, `Ctrl/Cmd+J`).
- `tests/unit/quick-edit-prompt.test.ts`: Quick edit prompt compilation and token estimation.
- `tests/unit/quick-edit-route.test.ts`: Route authorization and 401 status alignment.
- `tests/unit/top-navigation-accessibility.test.tsx`: Tab closing accessibility, roving tabindex, arrow navigation, and `Ctrl/Cmd+W` active tab closing.

### Group B — Standalone Regression Tests (`npm run test:regression`)
Subsystem contracts using Node's built-in `node:test` runner. Uses explicit file paths in `package.json` for guaranteed cross-platform portability across Windows, macOS, and Linux.
- `tests/cancellation-authorization.test.js`: Message cancellation authentication and ownership isolation.
- `tests/editor-dirty-tabs-conflict.test.js`: Buffer persistence, dirty tab state transitions, and external conflict detection.
- `tests/execution-progress-tracking.test.js`: Agent execution lifecycles and tool call streaming.
- `tests/frontend-project-deletion.test.js`: Project deletion contracts and dialog triggers.
- `tests/github-import-export-optimization.test.js`: GitHub export commit tree batching and exponential backoff retry logic.
- `tests/interactive-terminal.test.js`: WebContainer xterm integration, shell lifecycles, and `SIGINT` handling.
- `tests/tool-handlers-tracking.test.js`: Execution step wrapper and file modification tracking.
- `tests/tool-retry-idempotency.test.js`: Deterministic execution IDs for Inngest step retries.

### Group C — Special-Runtime Integration Tests
Stand-alone test files that mock complex external Convex server schema definitions or internal API functions.
- `tests/project-deletion-cascade.test.js`: Cascade deletion mock requiring Convex schema validators (`v.record`).
- `tests/security-resource-ownership.test.js`: Resource ownership mock requiring Convex system mutation signatures (`recordExecutionEnd`).

Run individually when working on those specific features:
```bash
node --test tests/project-deletion-cascade.test.js
node --test tests/security-resource-ownership.test.js
```

---

## 🚀 Recommended Contributor Verification Workflow

Before submitting a pull request, run the complete verification sequence:

```bash
# 1. Run all unit and regression tests
npm run test:all

# 2. Typecheck TypeScript sources
npm run typecheck

# 3. Lint project files
npm run lint

# 4. Verify production build
npm run build
```

---

## ✍️ Adding New Tests

1. **Unit Tests:** Place new unit tests in `tests/unit/<feature-name>.test.ts` (or `.tsx` for React components). They are automatically picked up by `npm test`.
2. **Regression Tests:** When authoring standalone subsystem tests using `node:test` in `tests/`, add the file path to the `"test:regression"` script in `package.json` so it is automatically included in contributor verification and `npm run test:all`.
