# Site foundation

The first of two specs for openalameda.org. This one covers the repo, the page frame, the static pages,
share previews, and deployment. The second, *Contributions pipeline and elections views*, adds the
campaign-finance data and replaces the `/elections` placeholder.

## Purpose and audience

OpenAlameda gathers and shares civic data about Alameda, California so residents can explore it and
talk about it. The primary audience is residents and voters who are curious but not data-savvy.
Journalists and analysts are welcome but get nothing built specially for them yet.

Two requirements follow from that audience and shape every page:

- **Every view is shareable.** A page's full state lives in its URL, so any view can be pasted into a
  discussion.
- **Every URL previews well.** Text messages, Slack, Reddit and social sites unfurl links with crawlers
  that do not run JavaScript. Each URL's HTML therefore carries its own title, description and preview
  image, rendered on the server.

Layouts target phones first, with one wider desktop layout. There is no separate tablet layout.

## Scope

In scope: repo setup and conventions, the shared page frame, four routes, share-preview plumbing, the
404 page, visual style, and Vercel deployment from GitHub.

Out of scope here: all election data and views (spec 2), the custom domain cutover, and everything in
[Future work](#future-work).

## Pages

| Route | Content |
| --- | --- |
| `/` | The mission statement, two section cards (Elections, Meetings), and a line linking to About. |
| `/elections` | Placeholder: "The campaign contributions explorer is on its way." Spec 2 replaces it. |
| `/meetings` | "Coming eventually", one sentence on the plan (agendas, minutes, votes), and the contact address. |
| `/about` | One page in two parts, described below. |

The mission statement adapts the 2018 site's text: "OpenAlameda gathers and shares data and
visualizations so folks can explore, learn, create, and share interesting views of our island and its
businesses, government, and people."

`/about` opens with who runs the site and why it exists. That text is lorem ipsum until the maintainer replaces
it. The rest is **Methodology & Disclosures**:

- The site is built with agentic development tools (AI coding agents), under human review through
  ordinary pull requests.
- The site itself uses no AI at runtime: every figure comes from a deterministic query over public data.
- Data sources, with links. For now that is the City of Alameda's campaign disclosure portal (Granicus
  CampaignDocs at southtechhosting.com).
- What is excluded and why. Spec 2 supplies the details, such as filings available only as PDFs.
- How to report an error: email, or a GitHub issue.
- The code and data are open; link to the repo.

Prose for `/` and `/about` lives in MDX files under `content/`. Editing the copy never requires touching
code.

## Page frame

- **Header:** the "OpenAlameda" wordmark linking to `/`, then nav links Elections · Meetings · About.
  On phones the nav sits below the wordmark; on desktop it sits inline at the right.
- **Footer:** info@openalameda.org, a link to the GitHub repo, a one-line data-source note, and the
  line "OpenAlameda is an independent project, not affiliated with the City of Alameda."
- **Content column:** full width with 16px gutters on phones; about 65 characters wide on desktop.

## Share previews

Every page sets a title, description, canonical URL, and Open Graph and Twitter card tags
(`twitter:card` = `summary_large_image`). All of these appear in the server-rendered HTML.

Each route has a 1200×630 PNG preview image generated on the server with Next's `ImageResponse`
(`next/og`). The foundation provides one default card — wordmark, page title, accent colour — and every
route uses it. Spec 2's views supply their own card, with a chart, through the same mechanism. If a
route's card fails to render, the page falls back to the default card rather than a broken image.

## Look

The style should feel related to alamedaca.gov but be clearly different from it.

| | alamedaca.gov | OpenAlameda |
| --- | --- | --- |
| Heading font | Poppins | Poppins |
| Body font | Poppins | System font stack |
| Base text and headings | Navy (`#05204E`) | Same navy family |
| Accent | Red | Bay teal |
| Background | White | Warm off-white |
| Headings | ALL CAPS with a navy underline | Sentence case, no underline |
| Home page | Hero photo, search box, icon tiles | No hero; stacked text cards with descriptions |

The site is light mode only. There is no logo yet; the wordmark is set in Poppins. A future logo will
probably derive from the city's anchor-and-heart mark or flag.

## Stack and repository

- **Repo:** `OpenAlameda/openalameda`, public, cloned at `~/work/openalameda`. The 2018
  `OpenAlameda/openalameda.github.io` site stays untouched until the domain cutover.
- **Framework:** Next.js (App Router) with TypeScript.
- **Pins:** Node 24 and pnpm, pinned in `.nvmrc`, `engines` and `packageManager` (via Corepack).
- **Styling:** Tailwind CSS.
- **Quality:** ESLint (Next's config), Prettier and Vitest.
- **License:** MIT for the code. The data is public record, and `/about` names its source.
- **`AGENTS.md`:** a short file, with `CLAUDE.md` pointing to it, adapted from conventions used on other projects:
  - one command per tool call, kept individually grantable;
  - scratch files in `./tmp` (gitignored);
  - `git -C`, worktrees, and branches cut from `origin/main` explicitly;
  - imperative, type-prefixed commit messages, and no amend or force-push once a PR has been reviewed;
  - fix version mismatches at the pin;
  - report unknowns as unknown;
  - fix log noise where it is emitted;
  - comments say what and why, never history;
  - project facts go in the repo, and expiring status goes in issues and PRs;
  - future work is recorded as GitHub issues.
- **Docs:** specs in `docs/specs/`, plans in `docs/plans/`.

## Deployment

A Vercel project linked to the GitHub repo:

- Every pull request gets a preview deployment.
- Merging to `main` deploys production at a `*.vercel.app` URL.
- The work starts on branches with pull requests into `main`.
- The user runs `vercel login` once; the CLI could not confirm a session during exploration.

## Testing

- **Render test (Vitest):** every route renders and includes the full meta-tag set: title, description,
  canonical, `og:title`, `og:description`, `og:image`, and `twitter:card`.
- **Preview test (Vitest):** the default preview-image route returns a 1200×630 PNG.
- **After deploy:** `curl` each production URL and confirm the meta tags appear in the raw HTML, the view
  a link-preview crawler gets. Fetch each `og:image` URL and confirm it returns a PNG.

## Future work

These become GitHub issues once the repo exists:

1. Run the pipeline daily and automatically. Spec 2 starts with manual runs.
2. Point openalameda.org at Vercel (DNS is at DNSimple), then archive `openalameda.github.io`.
3. Add dark mode.
4. Design a logo and visual identity, probably derived from the city's mark or flag.
