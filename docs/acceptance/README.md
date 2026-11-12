# Acceptance evidence

A host is listed as supported only after a recorded run here. Add one file per
run: `YYYY-MM-DD-<host>.md`.

Record the host and its version, the OS, the plugin version
(`plugins/<plugin>/release.json`), and the backend revision from
`<api origin>/healthz`. Use a dedicated DEV test member and its own projects
for anything that writes.

## Journeys

| Journey | Evidence required |
|---|---|
| Fresh install | Plugin listed with the right name and icon; skill listed; exactly one Wathba MCP server |
| OAuth | Browser consent shows full access; the host stores the token; granted scopes are `mcp:read mcp:api-contracts:upgrade projects:create` |
| Tool list | The host lists the fixed Wathba tools the skill names (20, or 19 while `report_issue` is off) and none of the old `open_*` card tools |
| Read | `list_notices`, `list_projects`, `list_project_services`, `get_service`, `get_service_integration_docs` each return a tool result, not only a transport success |
| Create project | `create_project`, or `open_flow` with flow `create_project`, creates exactly one sandbox project |
| Replay | The same `idempotencyKey` returns the same project and creates no duplicate |
| Flow | `open_flow` answers by host: `card_opened` with a card (card hosts), `form_done` from the host's form (Claude Code), or `open_link` (Codex CLI and others) whose `/agent/flow/<flowId>` page finishes the same step signed in |
| Live approval | A Live `execute_write_operation` returns `approval_required`; it runs only after the member approves on the signed-in flow page, and a repeat with the same `idempotencyKey` returns the stored result |
| Missing scope | A pre-full-access token gets a clear step-up, re-authorizes, and the call succeeds |
| Recovery | An expired access token refreshes silently; a revoked session leads to a reconnect prompt; a 5xx gives a clear error with no retry loop |
| Update | A new `dev` publish is picked up (Codex on restart; Claude Code via `/plugin marketplace update` or auto-update) |
| Rollback | Re-publishing the previous `main` commit returns the host to it |
| One connection | With the plugin and a direct MCP connection both present, the behavior matches the README warning |

## Automated coverage

Every pull request and every DEV publish runs `scripts/smoke-hosts.sh`, which
installs the built marketplace into throwaway Claude Code and Codex homes and
checks the loaded plugin version, skill and MCP server. The journeys above need
a signed-in member and are recorded by hand.
