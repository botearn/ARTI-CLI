# Codex CLI Instructions for ARTI

## Setup

Add to your Codex config (`~/.codex/config.yaml` or project `.codex/`):

```yaml
instructions:
  - file: /Users/nicolechen/ARTI-CLI/agents.md
```

Or set the environment variable:

```bash
export CODEX_AGENT_INSTRUCTIONS="/Users/nicolechen/ARTI-CLI/agents.md"
```

## How It Works

Codex CLI can call `arti` commands via shell. The `--json` flag ensures structured output that Codex can parse:

```
> What's Apple's current stock price and technical outlook?

Codex will run:
  arti quote AAPL --json
  arti scan AAPL --json

And synthesize the results into a natural language answer.
```

## Ensure arti is in PATH

```bash
# Option 1: npm link (development)
cd /Users/nicolechen/ARTI-CLI && npm run build && npm link

# Option 2: direct alias
alias arti="node /Users/nicolechen/ARTI-CLI/dist/index.js"
```

## Comparison: CLI vs MCP

| Aspect | CLI (Codex) | MCP Server (Claude Code) |
|---|---|---|
| Transport | Shell commands + JSON stdout | stdio MCP protocol |
| Setup | `arti` in PATH + agents.md | .mcp.json |
| Latency | New process per call | Persistent connection |
| Best for | Codex CLI, scripts, pipes | Claude Code, Claude Desktop |
