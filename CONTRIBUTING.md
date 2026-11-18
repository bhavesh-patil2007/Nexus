# Contributing to Nexus

Thanks for your interest in contributing to Nexus! This document outlines our conventions, coding standards, development workflows, and pull request procedures.

---

## 🚀 Development Setup

Before contributing, please read the [README.md](README.md) for full instructions on setting up your local development environment, configuring Convex, Clerk, Inngest, and creating your `.env.local`.

---

## 🌿 Branching Conventions

Always branch off the latest `main` branch. Use clear, descriptive branch prefixes matching the type of work being performed:

| Prefix | Purpose | Example |
| :--- | :--- | :--- |
| `feat/` | New features or functional additions | `feat/terminal-resize-handler` |
| `fix/` | Bug fixes or issue resolutions | `fix/file-rename-sync-conflict` |
| `docs/` | Documentation improvements or guides | `docs/architecture-diagram-update` |
| `refactor/` | Code structure refactoring with no behavioral change | `refactor/convex-queries-cleanup` |
| `test/` | Adding or updating tests | `test/file-tree-edge-cases` |
| `ci/` | CI/CD automation and pipeline improvements | `ci/vitest-github-actions` |
| `perf/` | Performance optimizations | `perf/github-export-batching` |

### Branch Commands

```bash
# Keep local main up to date
git checkout main
git pull upstream main

# Create and switch to your dedicated feature branch
git checkout -b feat/your-feature-name
```

---

## 💬 Commit Message Conventions

Nexus follows the [Conventional Commits](https://www.conventionalcommits.org/) specification:

```text
<type>(<scope>): <short description in present tense>
```

### Commit Types

- `feat`: A new feature for users or runtime.
- `fix`: A bug fix.
- `docs`: Documentation updates.
- `refactor`: Code changes that neither fix a bug nor add a feature.
- `perf`: A code change that improves performance.
- `test`: Adding missing tests or correcting existing tests.
- `ci`: Changes to CI configuration files and scripts.
- `chore`: Maintenance tasks, dependency updates, or internal tooling changes.

### Examples

```bash
git commit -m "feat(editor): add bracket auto-closing extension"
git commit -m "fix(sync): resolve dirty tab conflict detection on save"
git commit -m "docs(dx): update local setup instructions for Inngest"
git commit -m "ci(quality): establish Vitest and GitHub Actions pipeline"
```

---

## 🎨 Coding Standards

1. **TypeScript First:** Ensure strict type safety. Avoid `any` types; define explicit interfaces and Zod schemas for boundary validation.
2. **Component Architecture:** Use React 19 functional components with Tailwind CSS 4 and Radix UI / shadcn design tokens.
3. **Database Mutations:** All Convex mutations touching user data must enforce user ownership authentication via Clerk session checks or internal keys.
4. **Focused Changes:** Keep PRs narrowly focused on a single issue or objective. Avoid drive-by formatting or sweeping architectural rewrites.
5. **No Committed Secrets:** Never commit `.env`, `.env.local`, API keys, or private tokens.

---

## 🧪 Testing & Quality Requirements

Before submitting a pull request, run all quality checks locally:

```bash
# Run unit tests
npm test

# Run TypeScript compilation and type verification
npm run typecheck

# Run ESLint
npm run lint

# Verify production build
npm run build
```

Ensure all new functionality is accompanied by relevant unit or integration tests under `tests/`.

---

## 📬 Pull Request Process

1. **Push your branch to your fork:**
   ```bash
   git push -u origin feat/your-feature-name
   ```
2. **Open a Pull Request:** Target the upstream `main` branch.
3. **PR Description:**
   - Link the relevant issue (e.g., `Fixes #12` or `Closes #12`).
   - Clearly summarize the problem and the proposed solution.
   - List the verification steps you performed locally.
   - Include before/after screenshots or GIFs for user-facing UI changes.
4. **Code Review:** Participate constructively in code reviews. Respond to feedback and address requested modifications promptly.
5. **Merge Policy:** Merges are performed via pull request review and approval. Do not merge your own PRs without maintainer sign-off.

---

## 🔒 Security Guidelines

Security is critical to Nexus:

- **Secrets Handling:** Never commit credentials or expose backend keys (`CLERK_SECRET_KEY`, `NEXUS_CONVEX_INTERNAL_KEY`, `OPENAI_API_KEY`) to client-side code.
- **Resource Ownership:** Verify that database queries and mutations check that the caller owns the targeted `projectId` or `conversationId`.
- **Reporting Vulnerabilities:** If you discover a security vulnerability, please do NOT create a public GitHub issue. Reach out to the maintainers privately or use GitHub's private vulnerability reporting feature.

---

## 📜 Code of Conduct

All contributors are expected to uphold our [Code of Conduct](CODE_OF_CONDUCT.md). Be respectful, collaborative, and constructive.
