# Wathba

Connects Codex, Claude Code and other Agent Plugins clients to Wathba
over MCP. The member signs in through the browser (OAuth); no API key or token
ever goes through the chat.

- MCP server: https://api.wathba.sa/mcp
- Guide: https://platform.wathba.sa/docs/mcp

## Claude Code

```text
/plugin marketplace add wathba-org/wathba-plugin
/plugin install wathba@wathba
```

Run `/mcp`, choose `wathba` and sign in. To receive updates
automatically, open `/plugin`, go to Marketplaces, select
`wathba` and choose Enable auto-update.

## Codex and the ChatGPT desktop app

```sh
codex plugin marketplace add wathba-org/wathba-plugin
codex plugin add wathba@wathba
```

Installing from the app's Plugins page starts sign-in. In a terminal, run
`codex mcp login wathba`. Codex checks the marketplace for
updates when it starts.

## Gemini CLI

```sh
gemini extensions install https://github.com/wathba-org/wathba-plugin
```

Then run `/mcp auth wathba` in Gemini CLI and sign in.

## Cursor

Install Wathba from the Cursor Marketplace once it is listed there. Until then, copy
this folder (`plugins/wathba` in
`wathba-org/wathba-plugin`) to
`~/.cursor/plugins/local/wathba` and run **Developer: Reload
Window**. Then sign in to the `wathba` server from Cursor's MCP
settings.

## One connection

Use either this plugin or a direct MCP connection to https://api.wathba.sa/mcp, not both,
or every Wathba tool appears twice.
