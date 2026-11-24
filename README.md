# Wathba agent plugin

The official [Wathba (وثبة)](https://wathba.sa) plugin for AI coding agents.
It connects Codex, the ChatGPT desktop app, Claude Code, Cursor, Gemini CLI and
other Agent Plugins clients to Wathba's hosted MCP server, and adds one short skill that tells the
agent how to use it. Payments, OTP and domains reach your app through Wathba; the plugin never handles API keys, and members
sign in through the browser (OAuth).

| Environment | Branch | Install id | MCP server |
|---|---|---|---|
| Production | `main` | `wathba@wathba` | `https://api.wathba.sa/mcp` |
| Development | `dev-marketplace` (built from `dev`) | `wathba-dev@wathba-development` | `https://apidev.wathba.sa/mcp` |

## Install

### Claude Code

```text
/plugin marketplace add wathba-org/wathba-plugin
/plugin install wathba@wathba
```

For the development environment, add `wathba-org/wathba-plugin#dev-marketplace` and
install `wathba-dev@wathba-development`. Then run `/mcp`, choose the Wathba
server and sign in. To get updates automatically, open `/plugin`, go to
Marketplaces, select the marketplace and choose Enable auto-update.

### Codex and the ChatGPT desktop app

```sh
codex plugin marketplace add wathba-org/wathba-plugin
codex plugin add wathba@wathba
```

For the development environment, add `--ref dev-marketplace` and install
`wathba-dev@wathba-development`. Installing from the app's Plugins page starts
sign-in; in a terminal, run `codex mcp login wathba` (or `wathba-dev`). Codex
checks the marketplace for updates when it starts.

### Gemini CLI

```sh
gemini extensions install https://github.com/wathba-org/wathba-plugin
```

Then run `/mcp auth wathba` in Gemini CLI and sign in. Gemini CLI installs the
latest GitHub release, so production support starts with the first release
that carries `gemini-extension.json`. Update with
`gemini extensions update wathba`. For the development environment, clone the
`dev-marketplace` branch and install the clone's folder
(`gemini extensions install ./<folder>`, extension `wathba-dev`). Gemini CLI
0.71.1's own `--ref` install failed when tried on 2026-11-24: its `git clone`
sets `GIT_CONFIG_SYSTEM`, which its git library refuses. Install either the
production or the DEV extension, not both: Gemini CLI keeps only one `wathba`
skill.

### Cursor

Install Wathba from the Cursor Marketplace once it is listed there. Until then,
copy `plugins/wathba` (or `plugins/wathba-dev` from the `dev-marketplace`
branch) to `~/.cursor/plugins/local/` and run **Developer: Reload Window**,
then sign in to the server from Cursor's MCP settings.

### Any other MCP client

Add the remote MCP server URL from the table above with the Streamable HTTP
transport; the client discovers Wathba's OAuth settings on its own. Claude
(web, Desktop and Cowork) and ChatGPT take it as a custom connector. Use either
the plugin or a direct connection, not both, or every Wathba tool appears
twice.

## How this repository works

Nothing under `plugins/`, `.claude-plugin/`, `.cursor-plugin/`, `.agents/`,
`skills/`, `gemini-extension.json` or `contract.json` is edited by hand. They are generated from two sources:

- `plugin.config.json`: identities, origins, version, branding and listing text.
- `src/`: the shared skill (`src/skills/wathba/SKILL.md`), the icon, and the
  README for the `dev` branch.

`scripts/sync.mjs` builds one marketplace per environment and enforces the
packaging rules: identities, paths, one MCP server per package with no headers
or scopes, environment isolation, no credentials, the skill's tool list, size
and service codes, and the icon hash. `scripts/sync.test.mjs` unit tests the
skill rules.

### The skill is a router

The skill never changes when Wathba adds a service, a flow, an operation or a
rule for a service. The server lists four tools (`wathba_get_service`,
`wathba_open_flow`, `wathba_execute_read_operation` and
`wathba_execute_write_operation`) and serves the rest: Wathba's rules,
notices, projects, own operations and catalog in `wathba_get_service` with no
arguments (the home), each service's playbook, flows and operations in
`wathba_get_service`, and its code in its integration docs. The skill keeps
only what never changes: how to connect, how to route a task through those
tools, what each `wathba_open_flow` outcome means, the go-live checklist and
the language rule. `check` holds it to that:

- The built `SKILL.md` is at most 8,000 bytes (UTF-8, so Arabic counts double).
- It names no service code: no lowercase dotted name such as
  `payments.moyasar`. Write a URL with its scheme; a bare host name looks like
  a code and fails. Two closed lists in `scripts/sync.mjs` pass: the app files
  an agent reads to learn the stack (`package.json` and a few more) and paths
  into a Wathba result's fields (`playbook.body`, `result.outcome`). Nothing
  in `plugin.config.json` can let a code through.
- It names only the tools in `skill.tools`, plus the other snake_case terms
  in `skill.nonToolTerms` (outcomes and flows). The unit tests hold
  `skill.tools` to the four tools and refuse every older tool name.

| Workflow | When | What it does |
|---|---|---|
| `validate` | Every PR, push to `main` or `dev`, weekly | Generator rules, version rule, then installs both builds into throwaway Claude Code, Codex and Gemini CLI homes, then checks the live OAuth metadata |
| `publish-dev` | Push to `dev` | Builds the development marketplace, verifies it, and publishes it to the `dev-marketplace` branch |
| `drift` | Daily | Checks both environments' live OAuth metadata and opens an issue when it stops matching |
| `release` | `v*` tag on `main` | GitHub release with the plugin ZIP, then the MCP Registry entry |

The packages carry no scopes. The Wathba server decides the grant: every
connection gets full agent access, and the consent page shows exactly what
that allows.

## Change the plugin

Changes reach DEV first and production later, like the platform.

1. Branch from `dev` and edit `plugin.config.json` or `src/`.
2. Run `node --test scripts/*.test.mjs` and `node scripts/sync.mjs check`.
3. Open a pull request into `dev`. When it merges, `publish-dev` publishes
   it to DEV agents as `<version>-dev.<run>`. No version bump is needed here.
   The owner's review is required: it reaches DEV members' agents.

`contract.json` lists the Wathba tools the skill names. The platform's CI reads
it and fails a backend change that would remove or rename one of them.

## Release production

Promote once the matching Wathba platform release is in production, so the
skill never relies on a tool or a field (such as a service's playbook) the
production server doesn't serve yet.

1. Open a pull request from `dev` into `main` that raises `version` in
   `plugin.config.json`. CI refuses a changed package with the same version,
   because Claude Code updates only when the version changes. Merge it:
   Claude Code, Codex and Cursor installs pick it up from `main`.
2. Tag the merge commit `v<version>` and push the tag. `release.yml` checks that
   the tag, config and package agree, attaches the plugin ZIP, `server.json` and
   checksums to a GitHub release, then publishes `server.json` to the official
   MCP Registry after the owner approves the `registry` environment. Gemini CLI
   installs and updates from this release (its source tarball, because the
   release has more than one asset), so Gemini users see a change only once it
   is tagged.

A production hotfix goes into `main` by its own pull request (with a higher
`version`); merge `main` back into `dev` right after.

`listing/` holds the material for the directories (Anthropic, OpenAI, Cursor,
Gemini CLI) and what still blocks each submission.

## Acceptance

`docs/acceptance/` records the real host journeys (sign-in, reads, project
creation, replay, recovery, update, rollback). A host is listed as supported
only after a recorded run.

## License

Apache-2.0
