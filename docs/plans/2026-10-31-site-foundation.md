# Site foundation implementation plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ship the openalameda.org frame to a public Vercel URL: four pages and a 404, a shared header and footer, and server-rendered share previews on every route.

**Architecture:** A Next.js App Router app, server-rendered, with no client-side data. Each route exports metadata built by a single helper and an `opengraph-image.tsx` that renders the shared default card through a fallback wrapper. A `checkSite(baseUrl)` function checks the raw HTML and preview images. It runs as a Vitest e2e test against `next start` locally and as a script against production.

**Tech Stack:**
- Runtime and package manager: Node 24.21.0, pnpm 12.16.1 (Corepack).
- Framework: Next 16.4.3, React 19.
- Styling: Tailwind 4.3.3 (`@tailwindcss/postcss`), `@tailwindcss/typography` 0.5.20.
- Content: `@next/mdx` 16.4.3, `@mdx-js/loader` 3.1.1, `@mdx-js/react`, `@types/mdx`.
- Tests: Vitest 5.0.5.
- Code quality: ESLint (`eslint-config-next`), Prettier 3.9.10.

**Spec:** `docs/specs/site-foundation.md`

## Global Constraints

- **Pins:**
  - `.nvmrc` is `24.21.0`.
  - `package.json` `engines.node` is `">=24 <25"`.
  - `packageManager` is `"pnpm@12.16.1"`.
  - Fix version mismatches at these pins, never around them.
- **Colours** (Tailwind v4 `@theme` tokens in `src/app/globals.css`):

  | Token | Value |
  | --- | --- |
  | `--color-navy` | `#05204E` |
  | `--color-teal` | `#0B6E6E` |
  | `--color-paper` | `#FAF7F2` |
  | `--color-ink` | `#1F2937` |

  `#0B6E6E` is 5.66:1 on paper and white text on it is 6.05:1. Do not substitute a lighter teal.
- **Fonts:** Poppins for headings and the wordmark, through `next/font/google`. Body text uses the system stack.
- **Mode and copy style:** light mode only. Headings are sentence case with no underline.
- **Contact and repo:** `info@openalameda.org`; the repo is `https://github.com/OpenAlameda/openalameda`.
- **Footer line, verbatim:** "OpenAlameda is an independent project, not affiliated with the City of Alameda."
- **Mission, verbatim:** "OpenAlameda gathers and shares data and visualizations so folks can explore, learn, create, and share interesting views of our island and its businesses, government, and people."
- **Preview images:** 1200×630 PNG.
- **Twitter card:** `twitter:card` is `summary_large_image`.
- **No runtime AI:** no AI SDKs or calls anywhere in the app.
- **Shell and scratch:** one command per shell call. Scratch files go in `./tmp`, which is gitignored.

## Review Focus

1. **A card fails to render**, for example because a font file is missing from the deployed bundle. Expected: the route still serves a valid 1200×630 PNG, the default card. Pinned in Task 4.
2. **URL base on preview and production deployments.**
   - Expected: canonical and `og:image` URLs are absolute and use the production host on production, never `localhost` and never a deployment-specific URL.
   - Why it matters: Vercel's Standard Protection blocks deployment-specific URLs, so crawlers would get 401s.
   - Pinned in Task 2.
3. **An unknown URL.** Expected: HTTP 404 with the site frame and a link home, not a bare error. Pinned in Task 3.
4. **A 320px-wide phone.** Expected: the header nav wraps under the wordmark and the page never scrolls sideways. Pinned in Task 3's browser check.
5. **The production URL is protected or not public.** Expected: an unauthenticated `checkSite` against production passes. A 401 there means crawlers can't unfurl links. Pinned in Task 5.

## Preflight (orchestrator, before Task 1)

These steps are outward-facing. Jim approved them in the spec.

- [ ] Ask Jim to run `! vercel login`, so the login doesn't block Task 5.
- [ ] Create the GitHub repo and push the spec and plan:
  `gh repo create OpenAlameda/openalameda --public --source /Users/jim/work/openalameda --remote origin --push`
- [ ] Create a worktree for branch `site-foundation`, cut from `origin/main`. Tasks 1–4 commit there.

---

### Task 1: Scaffold, toolchain and repo conventions

**Files:**
- Create: `package.json`, `.nvmrc`, `next.config.ts`, `tsconfig.json`, `postcss.config.mjs`, `eslint.config.mjs`, `.prettierrc.json`, `.prettierignore`, `vitest.config.ts`, `.gitignore`, `LICENSE` (MIT, "Copyright (c) 2026 Jim Meyer"), `README.md`, `AGENTS.md`, `CLAUDE.md`
- Create: `src/app/layout.tsx`, `src/app/page.tsx` (placeholder), `src/app/globals.css`, `src/mdx-components.tsx`
- Test: `src/lib/smoke.test.ts` (deleted in Task 2)

**Interfaces:**
- Produces:
  - Scripts: `pnpm dev`, `pnpm build`, `pnpm start`, `pnpm lint`, `pnpm format`, `pnpm test` (unit; `src/**/*.test.ts`), `pnpm test:e2e` (`test/e2e/**/*.test.ts`, its own Vitest project), `pnpm check-site <url>` (= `node scripts/check-site.ts`, added in Task 3).
  - Tailwind tokens: `navy`, `teal`, `paper`, `ink`, plus the `font-heading` utility (CSS variable `--font-poppins`).
  - The `@/` alias maps to `src/`.

- [ ] **Step 1: Scaffold.** Run `pnpm create next-app@16.4.3` into `./tmp/scaffold` (TypeScript, App Router, `src/`, Tailwind, ESLint, `@/*` alias). Copy the generated files into the worktree, then set the pins from Global Constraints. Run `corepack pnpm --version`; expected output: `12.16.1`.
- [ ] **Step 2: Add MDX.**
  - Install `@next/mdx`, `@mdx-js/loader`, `@mdx-js/react`, `@types/mdx`.
  - Configure `next.config.ts` with `pageExtensions: ['ts','tsx','mdx']`.
  - In `src/mdx-components.tsx`, export `useMDXComponents` that returns its components unchanged.
- [ ] **Step 3: Theme.**
  - In `globals.css`: `@import "tailwindcss"; @plugin "@tailwindcss/typography";`.
  - Add a `@theme` block with the four colours and `--font-heading: var(--font-poppins)`.
  - Set `body` to `bg-paper text-ink`.
  - Load Poppins in `layout.tsx` with `next/font/google`: weights 500, 600, 700; `variable: '--font-poppins'`.
  - Set `<html lang="en">`.
- [ ] **Step 4: Prettier, Vitest, `.gitignore`.**
  - Add Prettier with `printWidth: 110`.
  - Add `vitest.config.ts` with two projects, `unit` and `e2e`. Both resolve `@/`.
  - Add `tmp/`, `.vercel`, `.env*.local` and `next-env.d.ts` to `.gitignore`.
- [ ] **Step 5: Write `AGENTS.md`.** Keep it under about 60 lines.
  - **What the project is:** one paragraph.
  - **Commands:** the scripts above.
  - **Layout:** `src/app`, `content/`, `docs/specs`, `docs/plans`.
  - **Conventions:** the spec's AGENTS.md list (spec §Stack and repository), each item as one imperative line.
  - **Prose:** copy lives in `content/*.mdx`.
  - **No runtime AI:** no AI calls in the app.

  `CLAUDE.md` contains exactly one line: `@AGENTS.md`.
- [ ] **Step 6: Smoke test.** `src/lib/smoke.test.ts` asserts `expect(1 + 1).toBe(2)`.
- [ ] **Step 7: Verify.** Run `pnpm lint`, `pnpm test`, then `pnpm build`. All three must exit 0, and the build must list route `/`.
- [ ] **Step 8: Commit.** `chore: scaffold Next.js app with pinned toolchain and AGENTS.md`

### Task 2: Site constants, `siteUrl()` and `pageMetadata()`

**Files:**
- Create: `src/lib/site.ts`, `src/lib/site-url.ts`, `src/lib/metadata.ts`
- Test: `src/lib/site-url.test.ts`, `src/lib/metadata.test.ts`
- Delete: `src/lib/smoke.test.ts`

**Interfaces:**
- Produces:
  - `src/lib/site.ts`: `SITE_NAME = 'OpenAlameda'`, `CONTACT_EMAIL = 'info@openalameda.org'`, `REPO_URL = 'https://github.com/OpenAlameda/openalameda'`, `SOURCE_URL = 'https://www.southtechhosting.com/AlamedaCity/CampaignDocsWebRetrieval/Search/SearchByElection.aspx'`.
  - `src/lib/site-url.ts`: `siteUrl(env: Record<string, string | undefined> = process.env): URL`.
  - `src/lib/metadata.ts`: `pageMetadata(page: { title: string; description: string; path: string }): Metadata`. A `title` equal to `SITE_NAME` is the home page.
  - `src/lib/metadata.ts`: `PAGES`, a record keyed `home | elections | meetings | about` of `{ title, description, path }`, with the copy below.

| key | path | title | description |
| --- | --- | --- | --- |
| home | `/` | OpenAlameda | Civic data about Alameda, California, gathered and shared so residents can explore it and talk about it. |
| elections | `/elections` | Elections | Campaign contributions in City of Alameda elections. The explorer is on its way. |
| meetings | `/meetings` | Meetings | City meeting agendas, minutes and votes. Coming eventually. |
| about | `/about` | About | Who runs OpenAlameda, why, and how the site and its data are made. |

- [ ] **Step 1: Write the failing `siteUrl` tests.** Rules are listed in precedence order:

  | Environment | Expected result |
  | --- | --- |
  | `SITE_URL='https://openalameda.org'` (also set alongside every Vercel variable) | `https://openalameda.org/` |
  | `VERCEL_ENV='production'`, `VERCEL_PROJECT_PRODUCTION_URL='openalameda.vercel.app'`, `VERCEL_URL='openalameda-abc123.vercel.app'` | `https://openalameda.vercel.app/` |
  | `VERCEL_ENV='preview'`, `VERCEL_URL='openalameda-abc123.vercel.app'` | `https://openalameda-abc123.vercel.app/` |
  | `{}` | `http://localhost:3000/` |
  | `SITE_URL='https://openalameda.org/'` (trailing slash) | `href` without a doubled slash |

- [ ] **Step 2: Write the failing `pageMetadata` tests.**
  - For `PAGES.about`:
    - `title` is `'About'`.
    - `alternates.canonical` is `'/about'`.
    - `openGraph` includes `{ title: 'About', description: PAGES.about.description, url: '/about', siteName: 'OpenAlameda', type: 'website' }`.
    - `twitter` includes `{ card: 'summary_large_image', title: 'About' }`.
  - For `PAGES.home`: `title` is `{ absolute: 'OpenAlameda' }`.
  - No result sets `openGraph.images`. Images come from the `opengraph-image.tsx` file convention.
- [ ] **Step 3: Run `pnpm test`.** It must FAIL because the modules don't exist.
- [ ] **Step 4: Implement.**
  - Root `layout.tsx` sets `metadataBase: siteUrl()` and `title: { template: '%s · OpenAlameda', default: 'OpenAlameda' }`.
  - Delete the smoke test.
- [ ] **Step 5: Run `pnpm test`.** Expected: PASS.
- [ ] **Step 6: Commit.** `feat: add site URL resolution and per-page metadata helper`

### Task 3: Page frame, pages, 404 and the `checkSite` e2e harness

**Files:**
- Create: `src/check/check-site.ts`, `scripts/check-site.ts`, `test/e2e/global-setup.ts`, `test/e2e/site.test.ts`
- Create: `src/components/SiteHeader.tsx`, `src/components/SiteFooter.tsx`, `src/components/SectionCard.tsx`
- Create: `src/app/elections/page.tsx`, `src/app/meetings/page.tsx`, `src/app/about/page.tsx`, `src/app/not-found.tsx`
- Create: `content/home.mdx`, `content/about.mdx`
- Modify: `src/app/layout.tsx`, `src/app/page.tsx`

**Interfaces:**
- Consumes: `PAGES` and `pageMetadata` (Task 2), and the constants in `site.ts`.
- Produces:
  - `checkSite(baseUrl: string, opts?: { checkImages?: boolean }): Promise<{ route: string; problems: string[] }[]>`
  - `ROUTES: readonly ['/', '/elections', '/meetings', '/about']`
  - `findMeta(html: string, key: string): string | undefined`. It matches `<meta name=…>` or `<meta property=…>`, plus `<link rel="canonical">` when `key === 'canonical'`.
  - Task 4 sets `checkImages` to default `true`. Until then it defaults to `false`.

- [ ] **Step 1: Write the failing e2e test.**
  - `global-setup.ts` runs `pnpm build`, then `next start -p 3100`, setting `SITE_URL=http://localhost:3100` for both. The build needs it too, because static pages bake `metadataBase` in at build time. The setup waits until `/` returns 200 and kills the server in teardown.
  - `site.test.ts`:

    ```ts
    test('every route serves full share metadata in raw HTML', async () => {
      const results = await checkSite('http://localhost:3100')
      expect(results.filter((r) => r.problems.length)).toEqual([])
    })
    test('unknown URL returns 404 inside the site frame', async () => {
      const res = await fetch('http://localhost:3100/no-such-page')
      expect(res.status).toBe(404)
      const html = await res.text()
      expect(html).toContain('not affiliated with the City of Alameda')
      expect(html).toMatch(/href="\/"/)
    })
    ```

  - For each route, `checkSite` reports a problem for:
    - a non-200 status;
    - an empty or missing `<title>`, `description`, `og:title`, `og:description` or `og:image`;
    - a `twitter:card` other than `summary_large_image`;
    - a canonical that isn't the absolute `baseUrl + route` (with `/` for home);
    - an `og:image` that isn't an absolute URL on `baseUrl`'s host.

  Also add a unit test, `src/check/check-site.test.ts`, for `findMeta` on a fixture string that uses both `name=` and `property=` attributes.
- [ ] **Step 2: Run `pnpm test:e2e`.** Expected: FAIL, with problems on `/elections`, `/meetings` and `/about` (404) and missing tags on `/`.
- [ ] **Step 3: Build the frame.**
  - **Header:**
    - The wordmark "OpenAlameda" in `font-heading` navy links to `/`.
    - Nav links: Elections, Meetings, About.
    - Below `md`, the nav sits under the wordmark and wraps. At `md` and wider, it sits inline at the right.
    - The current page link carries `aria-current="page"` (`usePathname`, or pass the path from each page).
  - **Footer:**
    - `mailto:` link to `CONTACT_EMAIL`;
    - link to `REPO_URL`;
    - "Data comes from public City of Alameda records; see About.";
    - the non-affiliation line.
  - **Main column:** `px-4` on phones, `max-w-[65ch] mx-auto` on desktop.
  - **Links:** teal, underlined.
- [ ] **Step 4: Build the pages.** Each page exports `metadata = pageMetadata(PAGES.<key>)`.
  - **`/`:**
    - Renders `content/home.mdx`: the mission statement verbatim, then a line linking to About.
    - Followed by two `SectionCard`s: `{ href, title, description }`, stacked, white background, navy heading, teal "→" link text. Their copy is the `PAGES` descriptions.
  - **`/elections`:**
    - Heading "Elections".
    - The text "The campaign contributions explorer is on its way."
  - **`/meetings`:**
    - Heading "Meetings", then "Coming eventually."
    - "We plan to gather city meeting agendas, minutes, and votes."
    - "Ideas or help: info@openalameda.org" (as a mailto link).
  - **`/about`:** renders `content/about.mdx` in `prose` styling.
    - It opens with an "About" heading and two lorem-ipsum paragraphs, preceded by `{/* Jim writes this */}`.
    - Then "Methodology & disclosures", with one short subsection per spec bullet (spec §Pages, `/about`):
      - built with AI coding agents under human pull-request review;
      - no AI at runtime;
      - data sources, linking `SOURCE_URL` as "City of Alameda campaign disclosure portal (Granicus CampaignDocs)";
      - exclusions: "Details arrive with the elections explorer.";
      - reporting errors, via email or the repo's issues page;
      - open code and data, with a repo link.
  - **`not-found.tsx`:** heading "Page not found" and a link home. Its metadata title is "Page not found".
- [ ] **Step 5: Run `pnpm test:e2e`.** Expected: PASS. Then run `pnpm test` and `pnpm lint`; both must pass.
- [ ] **Step 6: Phone-width check.**
  - Run `pnpm start` and open each route with `agent-browser` at a 320×640 viewport.
  - Evaluate `document.documentElement.scrollWidth <= window.innerWidth` on each route. Expected: `true` everywhere.
  - Also confirm by screenshot that the nav is below the wordmark. Save screenshots to `./tmp/`.
- [ ] **Step 7: Post-deploy script.**
  - `scripts/check-site.ts <baseUrl>` prints one line per route, `ok` or its problems, and exits 1 if any route has a problem.
  - It runs on Node 24's native type stripping, so its imports use `.ts` extensions and `tsconfig` sets `allowImportingTsExtensions`.
  - Run it against `http://localhost:3100` with `pnpm start -p 3100`. Expected: four `ok` lines, exit 0.
- [ ] **Step 8: Commit.** `feat: add page frame, static pages, 404 and checkSite e2e`

### Task 4: Share-preview cards with fallback

**Files:**
- Create: `src/og/card.tsx`, `src/og/fonts/Poppins-SemiBold.ttf`, `src/og/fonts/OFL.txt`
- Create: `src/app/opengraph-image.tsx`, `src/app/elections/opengraph-image.tsx`, `src/app/meetings/opengraph-image.tsx`, `src/app/about/opengraph-image.tsx`
- Modify: `src/check/check-site.ts` (`checkImages` defaults to `true`)
- Test: `src/og/card.test.ts`, `src/check/check-site.test.ts`

**Interfaces:**
- Consumes: `PAGES` (Task 2) and `checkSite` (Task 3).
- Produces:
  - `CARD_SIZE = { width: 1200, height: 630 }`
  - `defaultCard(title: string): Promise<ImageResponse>`: navy background, a teal bar, the white "OpenAlameda" wordmark, the page title in large paper-coloured Poppins, and "openalameda.org" small at the bottom.
  - `withFallback(render: () => Promise<Response> | Response, title: string): Promise<Response>`
  - `pngSize(bytes: Uint8Array): { width: number; height: number } | undefined`. It reads the IHDR chunk: the PNG signature check, then width and height as big-endian uint32 at byte offsets 16 and 20.
  - Spec 2 cards call `withFallback(() => chartCard(...), title)`.

- [ ] **Step 1: Write the failing tests** in `card.test.ts`:

  ```ts
  test('defaultCard renders a 1200x630 PNG', async () => {
    const res = await withFallback(() => defaultCard('Elections'), 'Elections')
    expect(res.headers.get('content-type')).toBe('image/png')
    expect(pngSize(new Uint8Array(await res.arrayBuffer()))).toEqual({ width: 1200, height: 630 })
  })
  test('a throwing render falls back to the default card', async () => {
    const res = await withFallback(() => { throw new Error('boom') }, 'About')
    expect(pngSize(new Uint8Array(await res.arrayBuffer()))).toEqual({ width: 1200, height: 630 })
  })
  test('a render whose body fails to stream falls back too', async () => {
    const broken = new Response(new ReadableStream({ start(c) { c.error(new Error('font')) } }),
      { headers: { 'content-type': 'image/png' } })
    const res = await withFallback(() => broken, 'About')
    expect(pngSize(new Uint8Array(await res.arrayBuffer()))).toEqual({ width: 1200, height: 630 })
  })
  ```

  Then add to `check-site.test.ts`:
  - `pngSize` returns `undefined` for non-PNG bytes;
  - a `checkSite` problem when the `og:image` responds with a non-PNG `content-type`. Use a stubbed `fetch`.
- [ ] **Step 2: Run `pnpm test`.** Expected: FAIL, because the modules are missing.
- [ ] **Step 3: Implement.**
  - **Font:** download `Poppins-SemiBold.ttf` and `OFL.txt` from `github.com/google/fonts/tree/main/ofl/poppins` into `src/og/fonts/`.
  - **Font loading:** load it with `readFile(new URL('./fonts/Poppins-SemiBold.ttf', import.meta.url))` so Next's file tracing bundles it on Vercel.
  - **`withFallback`:** awaits `arrayBuffer()` inside `try`, because `ImageResponse` renders lazily and its failures only surface while streaming. On success it returns `new Response(buf, { headers })`. On failure it logs one `console.error` line naming the title and returns the default card's buffer.
  - **Each `opengraph-image.tsx`:** exports `size = CARD_SIZE`, `contentType = 'image/png'` and `alt = '<title> · OpenAlameda'`. Its default export returns `withFallback(() => defaultCard(PAGES.<key>.title), PAGES.<key>.title)`.
- [ ] **Step 4: Run `pnpm test`.** Expected: PASS.
- [ ] **Step 5: Extend `checkSite`.** It now fetches each `og:image`. Each must return status 200, `content-type: image/png` and a `pngSize` of 1200×630.
- [ ] **Step 6: Run `pnpm test:e2e`.** Expected: PASS. Then open `http://localhost:3100/elections/opengraph-image` and look at it; save a copy to `./tmp/`.
- [ ] **Step 7: Commit.** `feat: add server-rendered share preview cards with fallback`

### Task 5: Publish, deploy, verify and file follow-ups (orchestrator)

**Interfaces:**
- Consumes: `pnpm check-site` (Task 3) and all branch commits.

- [ ] **Step 1: Link and connect Vercel.**
  - Run `vercel link --yes --project openalameda` in the worktree.
  - Connect the GitHub repo with `vercel git connect`.
  - **Confirm the build command:** `vercel project inspect` shows `pnpm build`.
  - **Confirm the Node version:** it shows Node 24.x.
- [ ] **Step 2: Push and open the PR.** Push `site-foundation` and open a PR into `main`. Wait for the preview deployment to show `Ready`.
- [ ] **Step 3: Check the preview.** Run `pnpm check-site <preview-url>`.
  - If it fails only with 401s from deployment protection, note that in the PR.
  - Any other failure is a bug: fix it on the branch.
- [ ] **Step 4: Merge after Jim's review.** Wait for the production deploy.
- [ ] **Step 5: Check production.** Run `pnpm check-site https://<project>.vercel.app`. Expected: four `ok` lines and exit 0, unauthenticated.
  - A 401 means production protection is on. Ask Jim before changing protection settings.
- [ ] **Step 6: Unfurl check.**
  - Paste the production `/` and `/about` URLs into a Slack DM to yourself, or use opengraph.xyz.
  - Confirm that the title, description and card image appear.
- [ ] **Step 7: File the follow-up issues.** File one issue per spec §Future work item with `gh issue create`:
  - daily pipeline runs;
  - DNS cutover and archiving `openalameda.github.io`;
  - dark mode;
  - logo and identity.

  Each body cites `docs/specs/site-foundation.md`.
