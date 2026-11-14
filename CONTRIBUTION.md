# Contributing to Nexus

Thanks for your interest in contributing to Nexus as part of Winter of Code. Contributions of all sizes are welcome, including bug reports, documentation improvements, design feedback, and code.

## Before you start

- Read the [README](README.md) to understand the project and its setup.
- Check the repository's issues and discussions for existing work. If your change is substantial, open or comment on an issue first so we can agree on the approach.
- For Winter of Code participation, follow the program's own registration, issue-claiming, and submission rules as well.

## Set up the project

Nexus uses Next.js, React, TypeScript, and Convex. You will need Node.js 20 or later and npm.

1. Fork the repository and clone your fork.
2. Install dependencies with `npm install`.
3. Copy `.env.example` to `.env.local` and fill in the credentials needed for the feature you are working on. Never commit secrets or real credentials.
4. Start the services you need. The README describes running the Next.js app, Convex, and Inngest locally.

Some features require external Clerk, Convex, Inngest, or AI provider accounts. If you do not have credentials, prefer work that can be developed without them and document any setup limitations in your pull request.

## Make a change

- Create a focused branch from the current default branch.
- Keep each change scoped to one issue or improvement where possible.
- Follow the existing TypeScript, React, and project conventions; avoid unrelated formatting or refactoring.
- Update documentation when behavior or setup changes.
- Do not include secrets, personal data, generated build output, or unrelated dependency changes.
- If a change affects the interface, include a screenshot or a short description of how to see it.

## Check your work

Before opening a pull request, run the relevant checks:

```bash
npm run lint
npm run build
```

Also manually exercise the affected flow when practical. If a check cannot be run because a required service or credential is unavailable, mention that clearly in the pull request.

## Open a pull request

- Push your branch to your fork and open a pull request against the repository's default branch.
- Link the related issue and explain the problem, the approach, and any user-visible impact.
- Include clear steps to test the change and note which checks you ran.
- Keep the pull request focused and respond constructively to review feedback.

Maintainers may ask for changes, request clarification, or close work that is out of scope. Please be patient; this is a community project and review time can vary.

## Report bugs and suggest ideas

When reporting a bug, include what you expected, what happened, steps to reproduce it, and relevant browser or environment details. Remove private information, API keys, and other secrets before posting logs or screenshots. For security-sensitive issues, do not publish exploit details in a public issue; contact the maintainers privately through a channel listed in the repository profile.

By participating, you agree to follow the [Code of Conduct](CODE_OF_CONDUCT.md).
