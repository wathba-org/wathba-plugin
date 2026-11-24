# Acceptance evidence

A host is listed as supported only after a recorded run here. Add one file per
run: `YYYY-MM-DD-<host>.md`.

Record the host and its version, the OS, the plugin version
(`plugins/<plugin>/release.json`), and the backend revision from
`<api origin>/healthz`. Use a dedicated DEV test member and its own projects
for anything that writes. A run that backs a directory submission is on
production, with the reviewer account (`listing/README.md`, blocker 4), and
its revision must be the one the directory will review.

## Hosts

| Host | Install | Sign in | Expected `wathba_open_flow` outcome |
|---|---|---|---|
| Claude Code | `/plugin marketplace add`, `/plugin install` | `/mcp` | `form` |
| Claude (web, Desktop) | Connector or the directory listing | Connector settings | `card_opened` |
| Codex CLI | `codex plugin marketplace add`, `codex plugin add` | `codex mcp login <server>` | `open_link` |
| ChatGPT | Developer mode connector or the directory listing | Connector settings | `card_opened` |
| Cursor | `~/.cursor/plugins/local/` (Marketplace once listed) | Cursor's MCP settings | Record what it gets |
| Gemini CLI | `gemini extensions install` | `/mcp auth <server>` | Record what it gets |

For Cursor and Gemini CLI, record the outcome they actually get.

## Journeys

| Journey | Evidence required |
|---|---|
| Fresh install | Plugin listed with the right name and icon; skill listed; exactly one Wathba MCP server (Gemini CLI: `gemini extensions list` and `gemini mcp list`) |
| OAuth | Browser consent shows full access; the host stores the token; granted scopes are `mcp:read mcp:api-contracts:upgrade projects:create services:enable services:test`, plus `mcp:wallet:read` where the member allowed it |
| Tool list | The model sees exactly Wathba's four tools, the ones in `contract.json` (`wathba_get_service`, `wathba_open_flow`, `wathba_execute_read_operation`, `wathba_execute_write_operation`); a card host may also load the tools its cards call, hidden from the model |
| Read | `wathba_get_service` with no arguments (the home), with a `query` and with a `serviceCode`, and `wathba_execute_read_operation` running Wathba's `listNotices`, `listProjects`, `listProjectServices` and `getServiceIntegrationDocs`, each return a tool result, not only a transport success |
| Create project | `wathba_execute_write_operation` running Wathba's `createProject`, or `wathba_open_flow` with flow `create_project`, creates exactly one sandbox project |
| Replay | The same `idempotencyKey` returns the same project and creates no duplicate |
| Flow | `wathba_open_flow` answers by host: `card_opened` with a card (card hosts), `form` from the host's form (Claude Code), or `open_link` (Codex CLI and others) whose `/agent/flow/<flowId>` page finishes the same step signed in |
| Live approval | A Live `wathba_execute_write_operation` returns `approval_required`; it runs only after the member approves on the signed-in flow page, and a repeat with the same `idempotencyKey` returns the stored result |
| Missing scope | A pre-full-access token gets a clear step-up, re-authorizes, and the call succeeds |
| Recovery | An expired access token refreshes silently; a revoked session leads to a reconnect prompt; a 5xx gives a clear error with no retry loop |
| Update | A new `dev` publish is picked up (Codex on restart; Claude Code via `/plugin marketplace update` or auto-update; Gemini CLI via `gemini extensions update`) |
| Rollback | Re-publishing the previous `main` commit returns the host to it (Gemini CLI follows releases: it needs a new release tag) |
| One connection | With the plugin and a direct MCP connection both present, the behavior matches the README warning |

## Automated coverage

Every pull request and every DEV publish runs `scripts/smoke-hosts.sh`, which
installs the built marketplace into throwaway Claude Code, Codex and Gemini CLI
homes and checks the loaded plugin version, skill and MCP server. The Cursor
CLI runs an agent only for a signed-in account, so CI checks Cursor's files
with `sync.mjs` alone. The journeys above need a signed-in member and are recorded
by hand.

## Run file template

```markdown
# <host> acceptance, YYYY-MM-DD

- Host and version:
- OS:
- Plugin version (release.json):
- Backend revision (/healthz):
- Member: DEV test member | production reviewer account
- Recorded by:

| Journey | Result | Evidence |
|---|---|---|
| Fresh install | pass/fail/not run | screenshot or transcript path |
| ... | | |
```

Leave out tokens, keys, codes and the reviewer's password: describe them.
