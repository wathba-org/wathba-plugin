# Wathba agent plugin

The official [Wathba (وثبة)](https://wathba.sa) plugin for AI coding agents.
It connects Codex, the ChatGPT desktop app, Claude Code and other Agent Plugins
clients to Wathba's hosted MCP server, and adds one short skill that tells the
agent how to use it. Payments, OTP/SMS, KYC, ZATCA e-invoicing and shipping
reach your app through Wathba; the plugin never handles API keys, and members
sign in through the browser (OAuth).

| Environment | Branch | Install id | MCP server |
|---|---|---|---|
| Production | `main` | `wathba@wathba` | `https://api.wathba.sa/mcp` |
| Development | `dev` (built from `develop`) | `wathba-dev@wathba-development` | `https://apidev.wathba.sa/mcp` |

## Install

### Claude Code

```text
/plugin marketplace add wathba-org/wathba-plugin
/plugin install wathba@wathba
```

For the development environment, add `wathba-org/wathba-plugin#dev` and
install `wathba-dev@wathba-development`. Then run `/mcp`, choose the Wathba
server and sign in. To get updates automatically, open `/plugin`, go to
Marketplaces, select the marketplace and choose Enable auto-update.

### Codex and the ChatGPT desktop app

```sh
codex plugin marketplace add wathba-org/wathba-plugin
codex plugin add wathba@wathba
```

For the development environment, add `--ref dev` and install
`wathba-dev@wathba-development`. Installing from the app's Plugins page starts
sign-in; in a terminal, run `codex mcp login wathba` (or `wathba-dev`). Codex
checks the marketplace for updates when it starts.

### Any other MCP client

Add the remote MCP server URL from the table above with the Streamable HTTP
transport; the client discovers Wathba's OAuth settings on its own. Claude
(web, Desktop and Cowork) and ChatGPT take it as a custom connector. Use either
the plugin or a direct connection, not both, or every Wathba tool appears
twice.

## How this repository works

Nothing under `plugins/`, `.claude-plugin/`, `.agents/` or `contract.json` is
edited by hand. They are generated from two sources:

- `plugin.config.json`: identities, origins, version, branding and listing text.
- `src/`: the shared skill (`src/skills/wathba/SKILL.md`), the icon, and the
  README for the `dev` branch.

`scripts/sync.mjs` builds one marketplace per environment and enforces the
packaging rules: identities, paths, one MCP server per package with no headers
or scopes, environment isolation, no credentials, the skill's tool list, and the
icon hash.

| Workflow | When | What it does |
|---|---|---|
| `validate` | Every PR, push to `main` or `develop`, weekly | Generator rules, version rule, then installs both builds into throwaway Claude Code and Codex homes, then checks the live OAuth metadata |
| `publish-dev` | Push to `develop` | Builds the development marketplace, verifies it, and publishes it to the `dev` branch |
| `drift` | Daily | Checks both environments' live OAuth metadata and opens an issue when it stops matching |
| `release` | `v*` tag on `main` | GitHub release with the plugin ZIP, then the MCP Registry entry |

The packages carry no scopes. The Wathba server decides the grant: every
connection gets full agent access, and the consent page shows exactly what
that allows.

## Change the plugin

Changes reach DEV first and production later, like the platform.

1. Branch from `develop` and edit `plugin.config.json` or `src/`.
2. Run `node scripts/sync.mjs check`.
3. Open a pull request into `develop`. When it merges, `publish-dev` publishes
   it to DEV agents as `<version>-dev.<run>`. No version bump is needed here.
   The owner's review is required: it reaches DEV members' agents.

`contract.json` lists the Wathba tools the skill names. The platform's CI reads
it and fails a backend change that would remove or rename one of them.

## Release production

Promote once the matching Wathba platform release is in production, so the
skill never names tools the production server doesn't serve yet.

1. Open a pull request from `develop` into `main` that raises `version` in
   `plugin.config.json`. CI refuses a changed package with the same version,
   because Claude Code updates only when the version changes. Merge it:
   production installs pick it up from `main`.
2. Tag the merge commit `v<version>` and push the tag. `release.yml` checks that
   the tag, config and package agree, attaches the plugin ZIP, `server.json` and
   checksums to a GitHub release, then publishes `server.json` to the official
   MCP Registry after the owner approves the `registry` environment.

A production hotfix goes into `main` by its own pull request (with a higher
`version`); merge `main` back into `develop` right after.

`listing/` holds the material for the Anthropic and OpenAI directories.

## Acceptance

`docs/acceptance/` records the real host journeys (sign-in, reads, project
creation, replay, recovery, update, rollback). A host is listed as supported
only after a recorded run.

## License

Apache-2.0
