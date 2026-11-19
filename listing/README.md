# Directory listing package

Material for the public directories. Submissions happen through each
directory's own form; nothing here is secret, and reviewer credentials never go
in this repository.

| Directory | Submit | Status |
|---|---|---|
| Official MCP Registry | `server.json`, published by `release.yml` on each `v*` tag | Automated |
| Anthropic plugin directory (Claude Code) | This repository (`wathba@wathba` from the `wathba` marketplace) | Ready once the blockers below are cleared |
| Anthropic Connectors Directory (Claude web, Desktop, Cowork) | Remote MCP URL `https://api.wathba.sa/mcp` | Ready once the blockers below are cleared |
| OpenAI plugin directory (ChatGPT and Codex) | The `wathba-plugin-<version>.zip` attached to the GitHub release | Ready once the blockers below are cleared |

## Blockers before any directory submission

1. A dedicated reviewer member account with a sandbox project, shared only
   through each directory's form.
2. Recorded acceptance runs for the hosts being listed (`docs/acceptance/`).

## Legal pages

Enter these in each form. `scripts/sync.mjs` puts each environment's own
portal pages in the Codex manifest. The support contact, juriba@wathba.sa, is in
the generated metadata.

- Privacy policy: https://platform.wathba.sa/legal/privacy
- Terms of service: https://platform.wathba.sa/legal/terms

## Icons

`src/assets/wathba-icon-light.png` and `wathba-icon-dark.png`: square 512×512
PNGs (light and dark theme), used as the logo and composer icon. The generator
rejects any icon that is not a square PNG of 48 to 4096 pixels under 5 MiB.

## Listing text

**Name:** Wathba (وثبة)

**Tagline (en):** Saudi payments, OTP and domains for your app.

**Tagline (ar):** المدفوعات والتحقق برمز OTP والنطاقات لتطبيقك في السعودية.

**Description (en):** Wathba gives your app Saudi payments, OTP and domains
through one catalog. Connect
your coding agent and it reads your Wathba projects and notices, recommends
services for your repository, follows each service's integration docs,
creates sandbox projects, and updates an integration's API version after you
confirm the exact plan. You sign in through the browser; the agent never sees
an API key.

**Description (ar):** وثبة تمنح تطبيقك المدفوعات والتحقق برمز OTP والنطاقات عبر
كتالوج واحد. اربط
وكيلك البرمجي ليقرأ مشاريعك وتنبيهاتك في وثبة، ويقترح الخدمات المناسبة
لمستودعك، ويتبع وثائق التكامل لكل خدمة، وينشئ مشاريع اختبارية، ويحدّث
إصدار API للتكامل بعد تأكيدك للخطة بدقة. تسجّل الدخول عبر المتصفح، ولا يرى
الوكيل أي مفتاح API.

**Category:** Developer tools

**Authentication:** OAuth 2.1 with PKCE (dynamic client registration and
Client ID Metadata Documents supported). Every connection is granted
`mcp:read mcp:api-contracts:upgrade projects:create services:enable services:test`;
the member approves it on the Wathba consent page.

## What each tool does

| Tool | Reads or writes | Effect |
|---|---|---|
| `wathba_get_service` | Read | With no arguments, Wathba's home: the agent's rules, the member's unread notices and projects, Wathba's own operations and the service catalog. With `query`, the operations, flows and services that fit a task described in plain words, with their inputs. With `serviceCode`, one service: its state in each environment, operations, flows, requirements and next step |
| `wathba_open_flow` | Member step | Opens one step the member completes: a new project, API keys, webhooks, a wallet top-up, a .sa domain search or purchase, turning a service on, an Authentica live test, approving a Live operation. Shown as a Wathba card, the host's own form, questions in the chat, or a link to one signed-in Wathba page (`/agent/flow/<flowId>`) |
| `wathba_execute_read_operation` | Read | Runs one read operation that `wathba_get_service` describes, of a service or of Wathba itself; a service's reads default to the sandbox |
| `wathba_execute_write_operation` | Write | Runs one write operation that `wathba_get_service` describes, once per idempotency key. A service's writes default to the sandbox (simulated, free); in Live they run only after the member approves them on their signed-in Wathba page. Wathba's own writes, listed below, act at once |

Everything else the agent can do is an operation, run with one of the two
execute tools. Wathba's own operations:

| Operation | Reads or writes | Effect |
|---|---|---|
| `listNotices` | Read | The member's actionable notices across projects |
| `listProjects` | Read | The member's projects and environment readiness; where the member allowed it, their own wallet balance (read-only) |
| `getProjectSetup` | Read | Sandbox, production, portal and key-management guidance (no credentials) |
| `listProjectServices` | Read | Services in the project and on offer, 20 a page, searchable |
| `getServiceIntegrationDocs` | Read | A service's docs for its API version: runtime, operations, limits and troubleshooting |
| `recommendServicesForRepository` | Read | Recommendations from a bounded repository profile built locally; no source code is sent |
| `createProject` | Write | Creates one sandbox project (idempotent) |
| `reportIssue` | Write | Sends a problem report to Wathba's team, only after the member confirms it |
| `getDnsRecords` | Read | A registered domain's DNS records and name servers |
| `changeDnsRecord` | Write | Adds, updates or deletes one DNS record the member asked for |
| `changeNameServers` | Write | Replaces a domain's name servers |
| `inspectApiUpgrade` | Read | Pinned version and supported contracts |
| `previewApiUpgrade` | Write | Records sandbox contract evidence |
| `prepareApiUpgrade` | Write | A short-lived upgrade plan bound to tested releases |
| `applyApiUpgrade` | Write | Changes the API version pin, including production, only after the member confirms the exact plan in the conversation |
| `rollbackApiUpgrade` | Write | Restores the previous API version pin |

The DNS operations belong to the domain service and the API upgrade
operations to each service a project uses; the rest belong to Wathba itself.

Wathba's cards call a few more tools themselves, hidden from the model, to act
on what the member confirms inside the card. API keys and signing secrets are
shown to the member, never returned to the model, and approving a Live
operation happens only on the member's signed-in Wathba page. The tools never
fund the wallet, accept provider terms or deploy on their own. Where the
member allowed it on the consent page, `listProjects` can show them their own
wallet balance, read-only.

## Data handling

- Tool results carry project and integration facts only; a recursive output
  guard blocks credential-shaped values.
- `recommendServicesForRepository` accepts a bounded profile and rejects
  source code, file contents, environment values and credentials.
- OAuth tokens stay in the agent host, outside the model context.
