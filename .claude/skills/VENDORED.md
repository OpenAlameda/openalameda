# Vendored skills

Copied unmodified from <https://github.com/mattpocock/skills>.

- Commit: `4ae2317ddb22b046e26455e4f9c9b3aaaf62212d` (2026-10-31, "software-factory: glossary skill for designing a factory (#1316)")
- License: MIT, copyright Matt Pocock. See `LICENSE-mattpocock-skills`.

| Skill                      | Upstream path                                 | Why it is here                                        |
| -------------------------- | --------------------------------------------- | ----------------------------------------------------- |
| `domain-modeling`          | `skills/engineering/domain-modeling`          | Glossary and ADR discipline; holds `ADR-FORMAT.md`.   |
| `grill-with-docs`          | `skills/engineering/grill-with-docs`          | Design interview that writes glossary terms and ADRs. |
| `grilling`                 | `skills/productivity/grilling`                | Called by `grill-with-docs`.                          |
| `setup-matt-pocock-skills` | `skills/engineering/setup-matt-pocock-skills` | Per-repo config (output is in `docs/agents/`).        |

## Notes

- Upstream's default glossary file is `GLOSSARY.md` (older releases used `CONTEXT.md`). This repo uses `GLOSSARY.md` at the root and ADRs in `docs/adr/`.
- The `triage` skill is not vendored, so no triage-label config exists. Add `docs/agents/triage-labels.md` if `triage` is vendored later.
- `setup-matt-pocock-skills` mentions other upstream skills (`to-tickets`, `to-spec`, `triage`, `improve-codebase-architecture`, `wayfinder`). None are vendored.

## Refresh

1. Clone upstream into `tmp/`, then replace each vendored directory and `LICENSE-mattpocock-skills` with the upstream copy.
2. Read each `SKILL.md` for new references and vendor anything they load.
3. Update the commit and date above, and check upstream renames (such as `CONTEXT.md` to `GLOSSARY.md`) against `docs/agents/`.
