# AGENTS.md

## What this is

OpenAlameda (openalameda.org) is a Next.js (App Router, TypeScript, Tailwind CSS) site that gathers and
shares civic data about Alameda, California, for residents who are curious but not data-savvy. Every view
is shareable by URL, and every URL carries its own server-rendered preview tags. Deployed on Vercel from
GitHub.

## Commands

Node 24 and pnpm are pinned (`.nvmrc`, `engines`, `packageManager`); run pnpm through Corepack.

- `pnpm dev`, `pnpm build`, `pnpm start`: run, build, serve.
- `pnpm lint`: ESLint (`eslint .`).
- `pnpm format`: Prettier.
- `pnpm test`: Vitest unit project (`src/**/*.test.ts`).
- `pnpm test:e2e`: Vitest e2e project (`test/e2e/**/*.test.ts`).
- `pnpm check-site <url>`: check a deployed site's meta tags and preview images.

## Layout

- `src/app`: routes, layout, global styles.
- `content/`: MDX prose for pages.
- `docs/specs`, `docs/plans`: specs and implementation plans.

## Conventions

- Run one command per tool call, so each stays individually grantable.
- Put scratch files in `./tmp` (gitignored).
- Use `git -C <path>`, work in worktrees, and cut branches from `origin/main` explicitly.
- Write imperative, type-prefixed commit messages (`feat: add page frame`).
- Never amend or force-push once a PR has been reviewed.
- Fix version mismatches at the pin, never around it.
- Report unknowns as unknown.
- Fix log noise where it is emitted.
- Write comments that say what and why, never history.
- Keep project facts in the repo; keep expiring status in issues and PRs.
- Record future work as GitHub issues.

## Prose

Page copy lives in `content/*.mdx`. Edit copy there, not in components.

## No runtime AI

Do not add AI SDKs or AI calls to the app. Every figure comes from a deterministic query over public data.
