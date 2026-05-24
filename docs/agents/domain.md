# Domain Docs

Layout: **single-context**

- `CONTEXT.md` at the repo root — domain language, bounded contexts, key entities.
- `docs/adr/` at the repo root — architectural decision records (ADRs).

## Consumer rules for agents

- Read `CONTEXT.md` before proposing any domain model changes or new terminology.
- Before creating a new ADR, check `docs/adr/` to avoid duplicating a past decision.
- If `CONTEXT.md` does not exist yet, proceed without it and suggest creating one when a domain decision is made.
- If `docs/adr/` does not exist yet, create it when the first ADR is written.
