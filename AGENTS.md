# AGENTS.md

## What this is

OpenAlameda (openalameda.org) is a Next.js (App Router, TypeScript, Tailwind CSS) site that gathers and shares civic data about Alameda, California, for residents who are curious but not data-savvy. Every view is shareable by URL, and every URL carries its own server-rendered preview tags. Deployed on Vercel from GitHub.

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
- `docs/adr/`, `GLOSSARY.md`: decisions and domain terms. Vendored skills (see `.claude/skills/VENDORED.md`) read and write them.

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
- Look for an existing helper before writing one; when two modules need the same helper, promote it to a shared module instead of copying it.
- Keep project facts in the repo; keep expiring status in issues and PRs.
- Record future work as GitHub issues.

## Work in the open

This repo is public. Everything committed is read by strangers.

- Commit the design (`docs/specs/`) and plan (`docs/plans/`) in the same branch and PR as the code they describe. Record architecture decisions as ADRs in `docs/adr/`. Agent working files (task ledgers, briefs, reports, review packages, mockups) stay out of git; `.superpowers/` is ignored for that.
- Before committing any doc, plan, commit message or PR text, keep out:
  - names of clients, employers or other private projects (write "conventions from other projects");
  - personal details beyond the public contact `info@openalameda.org`;
  - secrets and tokens;
  - absolute local paths (`/Users/...`), agent scratch or session paths, and session links.
- Write repo paths relative to the repo root (`--source .`, `docs/plans/...`), never as your local checkout. Before committing, run `git diff --cached -U0 -- . ':!AGENTS.md' | grep -E '^\+.*(/Users/|/home/|~/)'`; it must print nothing.
- If you find one of these already committed, remove it in your PR and tell the maintainer; rewriting published history is the maintainer's call.
- Docs are point-in-time; the code is the source of truth. When work diverges from a spec or plan, update the doc in the same PR, or add a dated note saying what changed.
- Data-source scraping details are fine to publish. The sources are public records, and a reproducible pipeline is the point.

## Prose

Prose pages (`/`, `/about`) live in `content/*.mdx`; edit that copy there, not in components. Short placeholder text on other pages may sit in the page component.

In Markdown and MDX, write each paragraph or list item on one line; don't hard-wrap.

## No runtime AI

Do not add AI SDKs or AI calls to the app. Every figure comes from a deterministic query over public data.

## Agent skills

### Issue tracker

GitHub Issues on `OpenAlameda/openalameda`, through `gh`. See `docs/agents/issue-tracker.md`.

### Domain docs

Single context: `GLOSSARY.md` at the root, ADRs in `docs/adr/`. See `docs/agents/domain.md`.
