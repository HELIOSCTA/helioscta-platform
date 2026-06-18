# Local Context Workspace

This directory is for local-only working context that should stay beside the
production repo without being promoted into it.

Use `.local/obsidian/` for the private Obsidian vault or vault mirror used by
Codex during implementation work. The folder is ignored by Git and should hold
daily notes, logged research, reading sources, email summaries, and other
operator context that is useful locally but not part of the production code,
database contracts, deployment notes, or frontend.

The preferred local vault layout is:

- `inbox/` for unprocessed capture.
- `daily/` for daily operating notes.
- `logged/` for processed research, emails, trades, and lessons.
- `sources/` for original PDFs, raw emails, data files, and screenshots.
- `markets/` for durable market knowledge.
- `workflows/` for recurring operating workflows and tools.
- `templates/`, `attachments/`, and `archive/` for vault support material.

Production-bound work still belongs in the normal repo layout:

- `backend/` for promoted runtime code.
- `dbt/azure_postgres/` for read-only validation and operator SQL contracts.
- `frontend/` for promoted dashboard code.
- `docs/` and `infrastructure/` for deployment and operating notes.
