# Journal Memory MCP

NitroStack-based MCP server for indexing and searching personal journal memory
dumps across local exports from tools like Obsidian, Notion, Apple Notes, and
Google Keep.

The first version is intentionally local-first: point it at exported folders or
vaults, keep the index on disk, and use MCP tools to search or recall memories.
Direct API sync can be added later once each provider's auth story is clear.

## Tools

- `register_journal_source` registers a local folder or vault.
- `index_journals` scans registered sources into `data/journal-index.json`.
- `search_journals` searches indexed entries by query, source, tags, or dates.
- `get_journal_entry` returns full content for a search result.
- `capture_memory_dump` saves one-off journal text directly into the index.
- `list_journal_sources` shows configured sources and index stats.

## Supported Local Inputs

- Obsidian vaults: `.md` and `.markdown`
- Notion exports: `.md`, `.html`, `.txt`, and `.json`
- Apple Notes exports: `.txt`, `.html`, `.md`
- Google Keep Takeout: `.json` and `.html`
- Generic memory dumps: direct tool input through `capture_memory_dump`

## Quick Start

```bash
npm install
npm run dev
```

Then connect the running MCP server from NitroStudio or another MCP-compatible
client.

## Example MCP Calls

Register an Obsidian vault:

```json
{
  "id": "obsidian-personal",
  "label": "Personal Obsidian Vault",
  "type": "obsidian",
  "path": "/Users/rudrakshkarpe/path/to/vault",
  "defaultTags": ["journal", "obsidian"]
}
```

Index everything:

```json
{
  "rebuild": true
}
```

Search:

```json
{
  "query": "career anxiety",
  "limit": 5
}
```

## Common Commands

```bash
npm run dev
npm run build
npm start
```

## NitroStudio

NitroStudio is the recommended way to test and debug NitroStack MCP servers
during development.

- Download: <https://nitrostack.ai/studio>
- Studio: <https://nitrostack.ai/studio>

## Links

- Docs: <https://docs.nitrostack.ai>
- Templates docs: <https://docs.nitrostack.ai/templates/01-starter-template>
- Main repository: <https://github.com/nitrocloudofficial/nitrostack>

## Community

- Discord: <https://discord.gg/uVWey6UhuD>
- X: <https://x.com/nitrostackai>
- YouTube: <https://www.youtube.com/@nitrostackai>
- LinkedIn: <https://linkedin.com/company/nitrostack-ai/>
- GitHub: <https://github.com/nitrostackai>
