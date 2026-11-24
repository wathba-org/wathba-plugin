# Directory listing package

Material for the public directories. Submissions happen through each
directory's own form; nothing here is secret, and reviewer credentials never go
in this repository.

| Directory | Submit | Status (2026-11-24) |
|---|---|---|
| Official MCP Registry | `server.json`, published by `release.yml` on each `v*` tag | Listed (2.7.1) |
| Anthropic plugin directory (Claude Code) | https://claude.ai/directory/manage, **Plugin bundle**: this repository, path `plugins/wathba`, branch `main` | Blocked: 1, 3, 4, 5, 7 |
| Anthropic Connectors Directory (Claude web, Desktop, Cowork) | Same portal, **MCP connector**: `https://api.wathba.sa/mcp`; pair it with the plugin | Blocked: 1, 3, 4, 5, 7 |
| OpenAI plugin directory (ChatGPT and Codex) | OpenAI's portal: the `wathba-plugin-<version>.zip` from the GitHub release | Blocked: 1–6 |
| Cursor Marketplace | https://cursor.com/marketplace/publish: this repository | Blocked: 1, 4, 5, 8 |
| Gemini CLI extensions gallery | Add the `gemini-cli-extension` topic to this repository; a daily crawl lists it | Blocked: 1, 5. Adding the topic is the submission: don't add it early |

Directories review what production serves at `https://api.wathba.sa/mcp`,
and Gemini CLI installs from the latest GitHub release. Nothing is submitted
until every blocker for that directory is cleared.

## Blockers

1. **Production serves an older surface.** On 2026-11-24 production ran
   `e598736` (2026-11-11): 32 tools to the model in every host (45 in card
   hosts), under their own names (`list_projects`, `open_wallet_top_up_card`,
   `confirm_domain_purchase`, ...). Twenty of the 45 are in no listing
   table.
   The four tools this listing describes are only on DEV. Submit once
   production serves them and `main` here carries this package (its release
   tarball is what Gemini CLI installs).
2. **OpenAI forbids generic executors.** Guideline 6.2b: "Expose each
   model-callable operation as a separate tool ... Do not use discovery,
   operation selection, or schema fetching with a generic executor to enable
   operations not individually exposed for review."
   `wathba_execute_read_operation` and `wathba_execute_write_operation` run
   operations found through `wathba_get_service`, which is that pattern.
   Anthropic accepts executors split by risk (read and write are separate
   tools here). Owner decision: leave OpenAI out for now, give its hosts one
   tool per allowed operation, or ask OpenAI for an exception.
3. **Money.** OpenAI allows commerce only for physical goods (5.1: no
   "tokens, or credits") and forbids "Execution of money transfers" (5.2b).
   Anthropic's review checklist does not accept connectors that "Transfer
   money"; its policy (4.A) allows financial transactions with human-in-the-loop
   safeguards. Today the surface can open a wallet top-up (the member buys
   Wathba credit by card on Wathba's page), buy a .sa domain charged to the
   wallet (`confirm_wathba_domain_purchase`, after an emailed code), and run
   Live payment operations such as captures and refunds through
   `wathba_execute_write_operation` (each after the member approves it on
   Wathba's page). Owner decision, per directory: hide these from that
   directory's clients, or declare them with their safeguards.
4. **Reviewer account (production).** Sign-up is invite-only and needs a code
   sent to a Saudi mobile, then email verification. After that, email and
   password sign-in asks for no second factor unless the member enrolls one,
   which meets OpenAI's "without MFA approval, email or SMS codes, magic
   links". Invite a shared mailbox Wathba controls from the back office,
   finish sign-up with a staff mobile, never enroll MFA, create a sandbox
   project with sample data, and keep the wallet at 0 SAR so no purchase can
   complete. A reviewer cannot finish an Authentica live test (it goes to the
   member's phone) or a domain purchase (emailed code); leave both out of the
   test cases. Credentials go only into each directory's form.
5. **Recorded acceptance runs** (`docs/acceptance/`), on production with the
   reviewer account, for each host a directory covers: Claude Code and Claude
   (web) for Anthropic, ChatGPT and Codex for OpenAI, Cursor, Gemini CLI.
   Each needs that host's account: a paid Claude plan, ChatGPT developer mode,
   a Cursor account, and Gemini CLI on a paid Google tier or an API key (its
   free tier moved to Antigravity CLI on 2026-06-18).
6. **OpenAI domain check.** OpenAI's portal gives a token to serve as plain
   text at `https://api.wathba.sa/.well-known/openai-apps-challenge` (or on
   a parent domain). The platform has no such route yet.
7. **Anthropic screenshots and hints.** Cards (MCP Apps) need 3–5 PNG
   screenshots at least 1000 px wide, from the Claude acceptance run.
   Anthropic asks for `destructiveHint: true` on tools that modify data; every
   tool here sets all three hints, but many writes (such as
   `create_wathba_project` and `wathba_open_flow`) set it to `false`, which a
   reviewer may question.
8. **Cursor lists few publishers so far.** Every plugin is reviewed by hand,
   and Cursor says it works with "a small group of trusted partners" for now,
   pointing others to cursor.directory.

## Hosts and packages

| Host | Package | Install before listing |
|---|---|---|
| Claude Code | `.claude-plugin/marketplace.json` → `plugins/wathba` | `/plugin marketplace add wathba-org/wathba-plugin` |
| Codex, ChatGPT desktop | `.agents/plugins/marketplace.json` → `plugins/wathba` | `codex plugin marketplace add wathba-org/wathba-plugin` |
| Cursor | `.cursor-plugin/marketplace.json` → `plugins/wathba` (`.cursor-plugin/plugin.json` adds the logo; Cursor finds the skill and `.mcp.json`) | Copy `plugins/wathba` to `~/.cursor/plugins/local/` |
| Gemini CLI | `gemini-extension.json` and `skills/wathba/` at the root | `gemini extensions install https://github.com/wathba-org/wathba-plugin` |

Google's Antigravity CLI replaced Gemini CLI for free and Google One users on
2026-06-18; its marketplace takes partners through an interest form
(https://antigravity.google/docs/marketplace/). Not started.

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

### Card-only tools

Hosts that draw Wathba's cards (MCP Apps: ChatGPT, Claude web and Desktop)
also list 26 tools with `_meta.ui.visibility: ["app"]` (24 where AI calls
are off, as in production). The model never sees
them; the cards call them to act on what the member confirms inside the card.
Directories review them too.

| Tool | Reads or writes | Effect |
|---|---|---|
| `open_wathba_flow` | Member step | `wathba_open_flow` by its older name |
| `wathba_card_action` | Write | Runs one action of the flow the card shows |
| `list_wathba_projects`, `get_wathba_project_setup` | Read | Projects and setup, as the top-up and key cards show them |
| `create_wathba_project` | Write | Creates the project the member named in the card |
| `revoke_wathba_api_key` | Write (destructive) | Revokes one key after the member confirms |
| `set_wathba_webhook_events` | Write | Sets an endpoint's event list |
| `disable_wathba_webhook_endpoint` | Write (destructive) | Disables an endpoint after the member confirms |
| `get_wathba_authentica_enablement`, `enable_authentica_on_wathba` | Read, write | What enabling Authentica needs; enables it (Live or sandbox simulation) |
| `send_wathba_authentica_free_test`, `verify_wathba_authentica_live_test` | Write | Sends one free test code to the member's own phone or inbox and checks it |
| `get_wathba_pay_enablement`, `enable_wathba_pay`, `check_wathba_pay_website`, `continue_wathba_pay_application` | Read, write | The member's Wathba Pay (Moyasar) application: read, save and submit, recheck the website, next step |
| `get_wathba_ai_calls`, `enable_wathba_ai_calls` | Read, write | AI calls in a project (DEV only) |
| `find_domains_on_wathba`, `list_eligible_domains_on_wathba` | Read | Domain names and the ones each identity may register |
| `price_domain_on_wathba` | Write | One name's one-year price beside the wallet balance |
| `prepare_wathba_domain_purchase` | Write | A quote and the registrar's identity check; charges nothing |
| `email_wathba_domain_purchase_code` | Write | Emails the member a code bound to the price |
| `confirm_wathba_domain_purchase` | Write (destructive) | Checks the code and the wallet, then buys the domain from the wallet |
| `get_wathba_domain_purchase`, `list_wathba_domain_purchases` | Read | One purchase, or the project's purchases |

API keys and signing secrets are shown to the member, never returned to the
model, and approving a Live operation happens only on the member's signed-in
Wathba page. The tools never
fund the wallet, accept provider terms or deploy on their own. Where the
member allowed it on the consent page, `listProjects` can show them their own
wallet balance, read-only.

## Data handling

- Tool results carry project and integration facts only; a recursive output
  guard blocks credential-shaped values.
- `recommendServicesForRepository` accepts a bounded profile and rejects
  source code, file contents, environment values and credentials.
- OAuth tokens stay in the agent host, outside the model context.
