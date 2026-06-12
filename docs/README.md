# Docs

This folder holds project-facing documentation that does not belong in the product source tree.

## Files

- [ISSUE_BACKLOG_2026-06-10.md](ISSUE_BACKLOG_2026-06-10.md): tracked implementation backlog and product decisions
- [BUILD_LOG.md](BUILD_LOG.md): project notes, validation notes, and previous build-state summaries
- [GRAPHIFY.md](GRAPHIFY.md): local knowledge-graph, Foam, and Codex MCP workflow
- `notes/`: suggested location for handwritten Foam notes and architecture notes
- [screenshots/](screenshots/README.md): curated screenshots used in the root README and demos

## Usage

- Update the backlog when new product issues are discovered or a major decision is made.
- Keep handwritten project notes in `docs/notes/` instead of `graphify-out/obsidian/`, which is generated output.
- Rebuild Graphify outputs after meaningful code or markdown changes that affect architecture notes.
- Refresh screenshots after visible UI changes that affect the public README or demos.
- Keep long-lived architectural guidance in the root README or local folder READMEs, not only in backlog notes.
