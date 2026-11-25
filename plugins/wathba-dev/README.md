# Wathba Dev

Connects Codex, Claude Code, Cursor, Gemini CLI and other Agent Plugins
clients to the Wathba development environment over MCP. The member signs in through the browser (OAuth); no API key or token
ever goes through the chat.

- MCP server: https://apidev.wathba.sa/mcp
- Guide: https://platformdev.wathba.sa/docs/mcp

## Claude Code

```text
/plugin marketplace add wathba-org/wathba-plugin#dev-marketplace
/plugin install wathba-dev@wathba-development
```

Run `/mcp`, choose `wathba-dev` and sign in. Where `/mcp` opens no
panel (Claude Code inside another app), run
`claude mcp login plugin:wathba-dev:wathba-dev` in a terminal
instead. To receive updates automatically, open `/plugin`, go to
Marketplaces, select `wathba-development` and choose Enable auto-update.

## Codex and the ChatGPT desktop app

```sh
codex plugin marketplace add wathba-org/wathba-plugin --ref dev-marketplace
codex plugin add wathba-dev@wathba-development
```

Installing from the app's Plugins page starts sign-in. In a terminal, run
`codex mcp login wathba-dev`. Codex checks the marketplace for
updates when it starts.

## Gemini CLI

```sh
git clone --branch dev-marketplace https://github.com/wathba-org/wathba-plugin wathba-dev-extension
gemini extensions install ./wathba-dev-extension
```

To update, pull the clone, then run `gemini extensions update wathba-dev`.
Install either this or the production extension, not both: Gemini CLI keeps
only one `wathba` skill.

Then run `/mcp auth wathba-dev` in Gemini CLI and sign in.

## Cursor

Copy
this folder (`plugins/wathba-dev` in
`wathba-org/wathba-plugin`, branch `dev-marketplace`) to
`~/.cursor/plugins/local/wathba-dev` and run **Developer: Reload
Window**. Then sign in to the `wathba-dev` server from Cursor's MCP
settings.

## One connection

Use either this plugin or a direct MCP connection to https://apidev.wathba.sa/mcp, not both,
or every Wathba tool appears twice.
