# Graphify, Foam, and Obsidian Guide

This project already has Graphify outputs in `graphify-out/`. This file is the
return-to-project guide for rebuilding them, viewing them, and using Foam notes
without tying the workflow to one API provider.

## What each tool does

- `Graphify`: builds the code knowledge graph and gives you query/path/explain
  commands.
- `Obsidian`: best way to visually browse the generated vault and open the graph
  or canvas views.
- `Foam`: VS Code note-taking workflow built around Markdown + wikilinks.

Practical rule:

- Use `Graphify` to generate and refresh the graph.
- Use `Obsidian` to inspect the generated graph visually.
- Use `Foam` to write linked architecture notes in VS Code and inspect note links with `Foam: Show Graph`.

## Current project outputs

These are already present in this repo:

- `graphify-out/graph.json`: main graph data
- `graphify-out/GRAPH_REPORT.md`: architecture/community summary
- `graphify-out/graph.html`: browser graph view
- `graphify-out/wiki/index.md`: markdown wiki entry point
- `graphify-out/obsidian/`: generated Obsidian vault
- `graphify-out/obsidian/graph.canvas`: structured canvas layout for Obsidian

Current build on this machine:

- `807` nodes
- `2356` edges
- `67` communities

## Fastest way to view the project graph

### Option 1: open the generated vault in Obsidian

This is the best visual workflow.

1. Open Obsidian.
2. Choose `Open folder as vault`.
3. Select `D:\Pi vibe code\piscrow\graphify-out\obsidian`.
4. In the left file tree, open `graph.canvas` for the grouped community layout.
5. Also use Obsidian `Graph view` for the full link graph.
6. Open any note such as `executeEscrowRelease().md` to inspect its connections.

What you will see:

- One note per graph node
- Community notes such as `_COMMUNITY_Community 0.md`
- A canvas file with grouped community layout
- Obsidian graph links based on wikilinks

### Option 2: open the HTML graph

If you just want a quick browser view:

1. Open `D:\Pi vibe code\piscrow\graphify-out\graph.html`
2. Pan and inspect the rendered graph in the browser

This is useful for a quick visual pass, but Obsidian is better for note-based
drill-down.

### Option 3: browse the markdown wiki

If you want a readable starting point:

1. Open `graphify-out/wiki/index.md`
2. Start from communities or god nodes
3. Follow links into generated notes

### Option 4: stay inside VS Code with Foam

If you want to write and inspect your own notes without leaving VS Code:

1. Open this repo in VS Code
2. Work inside `docs/notes/`
3. Create notes with wikilinks such as `[[admin-release-flow]]`
4. Run the VS Code command `Foam: Show Graph`

This is best for your handwritten knowledge base, not for the generated
Graphify vault.

## How Foam fits into this

Foam is not the graph generator. Foam is the note-authoring layer.

Use Foam when you want to write your own project notes in VS Code, for example:

- architecture summaries
- trade lifecycle notes
- admin release flow notes
- investigation notes
- bug deep-dives

Recommended pattern:

- Keep your manual notes in a stable folder you control, such as `docs/notes/`
- Use Foam wikilinks inside those notes
- Regenerate `graphify-out/obsidian/` when you want a fresh generated vault view

Important:

- `graphify-out/obsidian/` is generated output
- Do not treat it as your long-term handwritten notes folder
- Your handwritten notes should live outside generated output

## Recommended note location

Create and maintain your own Foam-friendly notes here:

- `docs/notes/`

Suggested note files:

- `docs/notes/index.md`
- `docs/notes/admin-release-flow.md`
- `docs/notes/trade-lifecycle.md`
- `docs/notes/telegram-linking.md`

## How to write Foam notes so they work well with Graphify

### Use wikilinks

Foam and Obsidian both understand wikilinks:

```md
[[admin-release-flow]]
[[trade-lifecycle]]
[[executeEscrowRelease()]]
[[trade-handoff.ts]]
```

### Name code entities exactly when possible

If a note references a function, file, or component, use the exact name:

- `executeEscrowRelease()`
- `trade-handoff.ts`
- `AdminDesk()`

That keeps your notes aligned with generated graph nodes.

### Prefer small notes

Better:

- one note for admin release flow
- one note for trade funding flow
- one note for Telegram linking

Worse:

- one huge file with everything mixed together

### Optional YAML frontmatter

Useful when you want structured note metadata:

```yaml
---
type: architecture
domain: escrow
related_components:
  - executeEscrowRelease()
  - trade-handoff.ts
---
```

## Graphify daily commands

Run these from the repo root:

```bash
graphify query "How is admin release and refund implemented?"
graphify path "executeEscrowRelease()" "POST()_11"
graphify explain "trade-handoff.ts"
```

Use them like this:

- `query`: broad architecture question
- `path`: relationship between two nodes
- `explain`: focused explanation of one file, symbol, or concept

## Refresh workflow

### After code-only changes

If you changed TypeScript, React, API routes, or server code:

```bash
graphify update .
```

This is the cheap refresh. No semantic rebuild required.

### After note or documentation changes

If you changed Markdown, Foam notes, or want fresh semantic edges:

```bash
graphify extract . --backend <backend> --model <model> --token-budget 12000 --max-concurrency 1 --out .
```

Then regenerate the exports:

```bash
graphify cluster-only . --graph graphify-out/graph.json --backend <backend>
graphify export obsidian --graph graphify-out/graph.json
graphify export wiki --graph graphify-out/graph.json
```

## Which backend to use

Do not hardcode `freemodel` unless that is specifically your environment.

Use a backend that matches the API access available on the machine. Graphify
supports these backends in this installation:

- `openai`
- `claude`
- `gemini`
- `deepseek`
- `ollama`
- `kimi`

Examples:

### If you have OpenAI

Set:

```bash
OPENAI_API_KEY=...
```

Run:

```bash
graphify extract . --backend openai --model <openai-model> --token-budget 12000 --max-concurrency 1 --out .
graphify cluster-only . --graph graphify-out/graph.json --backend openai
```

### If you have Anthropic / Claude

Set:

```bash
ANTHROPIC_API_KEY=...
```

Run:

```bash
graphify extract . --backend claude --model <claude-model> --token-budget 12000 --max-concurrency 1 --out .
graphify cluster-only . --graph graphify-out/graph.json --backend claude
```

### If you have Gemini

Set either:

```bash
GEMINI_API_KEY=...
```

or:

```bash
GOOGLE_API_KEY=...
```

Run:

```bash
graphify extract . --backend gemini --model <gemini-model> --token-budget 12000 --max-concurrency 1 --out .
graphify cluster-only . --graph graphify-out/graph.json --backend gemini
```

### If you use a local model with Ollama

Set:

```bash
OLLAMA_BASE_URL=http://localhost:11434/v1
OLLAMA_API_KEY=dummy
```

Run:

```bash
graphify extract . --backend ollama --model qwen2.5-coder:7b --token-budget 12000 --max-concurrency 1 --out .
graphify cluster-only . --graph graphify-out/graph.json --backend ollama
```

### If you use an OpenAI-compatible gateway

If your machine has a custom Graphify provider or wrapper gateway, use the
backend and model configured for that environment. On this machine that was a
custom `freemodel` setup, but that is local-machine-specific and should not be
assumed for other users.

## Good “come back later” workflow

When you return to this project:

1. Open `docs/GRAPHIFY.md`
2. Open `graphify-out/wiki/index.md`
3. Open `graphify-out/obsidian/` as an Obsidian vault if you want visual graph navigation
4. Run `graphify query "<your question>"`
5. Run `graphify update .` if code changed
6. Run full `extract + cluster-only + export` only when docs/notes changed or semantic refresh is needed

## Suggested first notes to keep by hand

These would make the project easier to resume later:

- `docs/notes/index.md`
- `docs/notes/admin-release-flow.md`
- `docs/notes/trade-funding-flow.md`
- `docs/notes/trade-chat-and-dispute-flow.md`
- `docs/notes/telegram-linking.md`

## Known repo behavior

- `graphify-out/` is local generated output and can become large
- `graphify update .` is the normal maintenance command after code edits
- `graphify export obsidian` and `graphify export wiki` are valid in this local install even though top-level help is abbreviated
- `graphify hook status` currently reports that git hooks are not installed in this repo

## Official references

- Foam wikilinks: `https://foambubble.github.io/foam/user/features/wikilinks.html`
- Obsidian Graph View: `https://obsidian.md/help/plugins/graph`

## Short version

If you forget everything else:

1. Open `graphify-out/obsidian/` in Obsidian
2. Open `graph.canvas`
3. Use Obsidian `Graph view`
4. Start from `graphify-out/wiki/index.md`
5. Ask Graphify questions with `graphify query`, `graphify path`, and `graphify explain`
6. Keep your real notes in `docs/notes/`, not inside generated output
