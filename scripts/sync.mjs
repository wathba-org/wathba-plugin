#!/usr/bin/env node
// Builds the Wathba agent plugin marketplaces from plugin.config.json and src/,
// and enforces the packaging rules. No dependencies; Node 26.
//
//   node scripts/sync.mjs build --target dev|prod --out <dir> [--version <v>]
//   node scripts/sync.mjs check
//   node scripts/sync.mjs digest --target dev|prod
//   node scripts/sync.mjs version-rule --base <git-ref>
//
// `build` writes one complete marketplace tree. Writing into the repository
// root replaces only the generated paths. `check` builds both targets in
// memory, validates them, and (once config.rootTarget is set) requires the
// committed root output to equal a fresh build. The rules are unit tested in
// sync.test.mjs (`node --test scripts/*.test.mjs`).

import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import { existsSync, realpathSync } from "node:fs";
import { mkdir, readdir, readFile, rm, writeFile } from "node:fs/promises";
import { dirname, join, relative, resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = resolve(import.meta.dirname, "..");
const AGENT_PLUGIN_SCHEMA =
  "https://agent-plugins.org/schemas/1.0.0/plugin.schema.json";
const AGENT_MCP_SCHEMA =
  "https://agent-plugins.org/schemas/1.0.0/mcp.schema.json";
const REGISTRY_SCHEMA =
  "https://static.modelcontextprotocol.io/schemas/2025-12-11/server.schema.json";
const SKILL_NAME = "wathba";
// The skill is a router that never changes when Wathba adds a service: each
// service's guidance comes from the server (wathba_get_service's playbook).
// The cap keeps per-service text from creeping back in; it counts the built
// SKILL.md in UTF-8 bytes, so Arabic counts double.
export const SKILL_MAX_BYTES = 8000;
// The shape of a service code (payments.moyasar, domains.souq-t2): lowercase
// dotted words of at least two characters each, so "e.g." and "v1.2" pass. A
// dot, slash, @, hyphen or word character next to it means a file name, path,
// URL or e-mail address, which are allowed. A bare host name is refused like a
// code: some codes end in a top-level domain (calls.ai).
const SERVICE_CODE_SHAPE =
  /(?<![\w./@-])[a-z][a-z0-9]*(?:[_-][a-z0-9]+)*(?:\.[a-z0-9]+(?:[_-][a-z0-9]+)*)+(?![\w/@-]|\.[a-z0-9])/g;
const NAME_PATTERN = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
const SEMVER_PATTERN =
  /^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)(?:-([0-9A-Za-z-]+(?:\.[0-9A-Za-z-]+)*))?$/;
const SECRET_MARKERS = [
  "sk_live_",
  "sk_test_",
  "wtb_",
  "whsec_",
  "Bearer ",
  '"authorization"',
  '"Authorization"',
];
// Gemini CLI installs a whole repository (or its release's source tarball)
// as one extension: the manifest sits at the root and the skill in the root's
// skills/ folder, a copy of the plugin's.
const GEMINI_MANIFEST = "gemini-extension.json";
const ROOT_SKILLS = "skills";
// Cursor's own manifest and marketplace, in the shapes of its published
// schemas (github.com/cursor/plugins, schemas/*.schema.json), which refuse
// any key they don't list: author and owner hold only name and email, and a
// marketplace entry only name, source and description. The manifest carries
// the logo Cursor shows; Cursor finds the skill and the MCP config itself.
const CURSOR_MANIFEST = ".cursor-plugin/plugin.json";
const CURSOR_LOGO = "assets/wathba-icon-light.png";
const CURSOR_MARKETPLACE = ".cursor-plugin/marketplace.json";
const CURSOR_MANIFEST_KEYS = [
  "name", "displayName", "version", "description", "author", "homepage", "repository", "license", "keywords", "logo",
];
// Root paths Gemini CLI or Cursor would load from this repository besides
// the generated ones (a context file, commands, hooks, agents, policies, a
// root plugin). `check` refuses them, so nothing ships outside these rules.
const UNOWNED_HOST_PATHS = [
  "GEMINI.md", "commands", "hooks", "agents", "policies", "plugin.json", ".cursor-plugin/plugin.json",
];
// Paths the generator owns when it writes a marketplace tree.
const MARKETPLACE_FILES = [
  ".claude-plugin/marketplace.json",
  CURSOR_MARKETPLACE,
  ".agents/plugins/marketplace.json",
  "contract.json",
  GEMINI_MANIFEST,
];

export class RuleError extends Error {}

function fail(rule, message) {
  throw new RuleError(`[${rule}] ${message}`);
}

function json(value) {
  return `${JSON.stringify(value, null, 2)}\n`;
}

function sha256(data) {
  return createHash("sha256").update(data).digest("hex");
}

export async function loadConfig() {
  const config = JSON.parse(
    await readFile(join(ROOT, "plugin.config.json"), "utf8"),
  );
  if (!SEMVER_PATTERN.test(config.version ?? "") || config.version.includes("-"))
    fail("config", "version must be a release semver such as 2.0.0");
  for (const name of ["prod", "dev"]) {
    const target = config.targets?.[name];
    if (!target) fail("config", `missing target ${name}`);
    for (const key of ["marketplace", "plugin", "serverKey"])
      if (!NAME_PATTERN.test(target[key] ?? ""))
        fail("config", `${name}.${key} must be kebab-case`);
    for (const key of ["apiOrigin", "portalOrigin"])
      if (!/^https:\/\/[a-z0-9.-]+$/.test(target[key] ?? ""))
        fail("config", `${name}.${key} must be a bare https origin`);
  }
  if (config.codex.defaultPrompt.length > 3)
    fail("config", "Codex allows at most 3 default prompts");
  for (const prompt of config.codex.defaultPrompt)
    if (prompt.length > 128)
      fail("config", `default prompt over 128 characters: ${prompt}`);
  if (config.registryDescription.length > 100)
    fail("config", "registryDescription must be at most 100 characters");
  for (const name of ["prod", "dev"]) {
    if (shortDescriptionFor(config, name).length > 30)
      fail("config", `${name} shortDescription must be at most 30 characters (OpenAI listing subtitle)`);
    if (!["light", "dark"].includes(composerIconThemeFor(config, name)))
      fail("config", `${name}.composerIconTheme must be "light" or "dark"`);
  }
  // The production package is committed at the root; check and version-rule
  // must always compare against it, so the field cannot be dropped.
  if (config.rootTarget !== "prod")
    fail("config", 'rootTarget must be "prod"');
  return config;
}

// A target may override the subtitle and icons (DEV carries a DEV badge).
function shortDescriptionFor(config, targetName) {
  return config.targets[targetName].shortDescription ?? config.shortDescription;
}

function iconsFor(config, targetName) {
  return config.targets[targetName].icons ?? config.branding.icons;
}

// Codex shows one composer icon in both themes (it ignores composerIconDark).
function composerIconThemeFor(config, targetName) {
  return config.targets[targetName].composerIconTheme ?? "light";
}

export async function loadSources(config) {
  const icons = {};
  for (const name of ["prod", "dev"]) {
    icons[name] = {};
    for (const theme of ["light", "dark"]) {
      const { source, sha256: expected } = iconsFor(config, name)[theme];
      const bytes = await readFile(join(ROOT, source));
      if (sha256(bytes) !== expected)
        fail("icon", `${source} does not match its ${name} ${theme} sha256`);
      checkListingImage(source, bytes);
      icons[name][theme] = bytes;
    }
  }
  const skill = await readFile(join(ROOT, config.skill.source), "utf8");
  const devReadme = await readFile(join(ROOT, "src/dev-branch-README.md"), "utf8");
  const license = await readFile(join(ROOT, "LICENSE"), "utf8");
  return { icons, skill, devReadme, license };
}

// Listing images must be square PNGs, 48 to 4096 pixels, at most 5 MiB
// (OpenAI plugin submission requirements; hosts accept the same files).
function checkListingImage(path, bytes) {
  const signature = "89504e470d0a1a0a";
  if (bytes.subarray(0, 8).toString("hex") !== signature || bytes.toString("ascii", 12, 16) !== "IHDR")
    fail("icon", `${path} must be a PNG`);
  const width = bytes.readUInt32BE(16);
  const height = bytes.readUInt32BE(20);
  if (width !== height) fail("icon", `${path} must be square (is ${width}x${height})`);
  if (width < 48 || width > 4096)
    fail("icon", `${path} must be 48 to 4096 pixels wide (is ${width})`);
  if (bytes.length > 5 * 1024 * 1024) fail("icon", `${path} must be at most 5 MiB`);
}

// Production installs from the latest GitHub release (its source tarball,
// since a release carries more than one asset) and updates with
// `gemini extensions update`. DEV has no releases, and Gemini CLI's own
// git clone fails (0.71.1 sets GIT_CONFIG_SYSTEM, which its git library
// refuses), so DEV installs from a local clone of the branch.
function geminiInstall(targetName, target) {
  if (targetName === "prod")
    return (
      "```sh\ngemini extensions install https://github.com/wathba-org/wathba-plugin\n```\n\n" +
      "Gemini CLI installs the latest GitHub release, not `main`, and updates with\n" +
      "`gemini extensions update wathba`."
    );
  return (
    "```sh\n" +
    `git clone --branch ${target.branch} https://github.com/wathba-org/wathba-plugin wathba-dev-extension\n` +
    "gemini extensions install ./wathba-dev-extension\n```\n\n" +
    `To update, pull the clone, then run \`gemini extensions update ${target.plugin}\`.\n` +
    "Install either this or the production extension, not both: Gemini CLI keeps\n" +
    "only one `wathba` skill."
  );
}

function pluginReadme(config, target, mcpUrl, docsUrl, targetName) {
  const ref = targetName === "prod" ? "" : `#${target.branch}`;
  const codexRef = targetName === "prod" ? "" : ` --ref ${target.branch}`;
  const id = `${target.plugin}@${target.marketplace}`;
  const environment =
    targetName === "prod" ? "Wathba" : "the Wathba development environment";
  return `# ${target.displayName}

Connects Codex, Claude Code, Cursor, Gemini CLI and other Agent Plugins
clients to ${environment} over MCP. The member signs in through the browser (OAuth); no API key or token
ever goes through the chat.

- MCP server: ${mcpUrl}
- Guide: ${docsUrl}

## Claude Code

\`\`\`text
/plugin marketplace add wathba-org/wathba-plugin${ref}
/plugin install ${id}
\`\`\`

Run \`/mcp\`, choose \`${target.serverKey}\` and sign in. To receive updates
automatically, open \`/plugin\`, go to Marketplaces, select
\`${target.marketplace}\` and choose Enable auto-update.

## Codex and the ChatGPT desktop app

\`\`\`sh
codex plugin marketplace add wathba-org/wathba-plugin${codexRef}
codex plugin add ${id}
\`\`\`

Installing from the app's Plugins page starts sign-in. In a terminal, run
\`codex mcp login ${target.serverKey}\`. Codex checks the marketplace for
updates when it starts.

## Gemini CLI

${geminiInstall(targetName, target)}

Then run \`/mcp auth ${target.serverKey}\` in Gemini CLI and sign in.

## Cursor

${targetName === "prod" ? "Install Wathba from the Cursor Marketplace once it is listed there. Until then, copy" : "Copy"}
this folder (\`plugins/${target.plugin}\` in
\`wathba-org/wathba-plugin\`${targetName === "prod" ? "" : `, branch \`${target.branch}\``}) to
\`~/.cursor/plugins/local/${target.plugin}\` and run **Developer: Reload
Window**. Then sign in to the \`${target.serverKey}\` server from Cursor's MCP
settings.

## One connection

Use either this plugin or a direct MCP connection to ${mcpUrl}, not both,
or every Wathba tool appears twice.
`;
}

// Returns Map<relativePath, Buffer|string> for one marketplace tree.
/**
 * Parts of the skill for features only DEV has sit between
 * `<!-- dev-only... -->` and `<!-- /dev-only -->` lines: DEV keeps the text
 * without the markers, prod drops the whole block.
 */
const DEV_ONLY_BLOCK = /^[ \t]*<!-- dev-only[^\n]*-->\n([\s\S]*?)^[ \t]*<!-- \/dev-only -->\n/gm;

export function skillFor(skill, targetName) {
  return skill.replace(DEV_ONLY_BLOCK, (_, body) => (targetName === "prod" ? "" : body));
}

// Dotted names the skill may use that have a service code's shape: the app
// files an agent reads to learn the stack, and paths into the fields of a
// Wathba result. Both lists are closed on purpose: a list in the config, or
// "anything ending in a file extension", would let a service code through
// (domains.sh, or payments.moyasar added to an allowlist).
const APP_FILE_NAMES = new Set([
  "composer.json", "package.json", "pyproject.toml", "requirements.txt", "tsconfig.json",
]);
const RESULT_FIELD_ROOTS = new Set(["guidance", "notices", "operation", "playbook", "result"]);

/** Every service-code-shaped name in a text, in order. */
export function serviceCodesIn(text) {
  return [...text.matchAll(SERVICE_CODE_SHAPE)]
    .map(([match]) => match)
    .filter((match) => match.split(".").every((part) => part.length >= 2))
    .filter((match) => !APP_FILE_NAMES.has(match) && !RESULT_FIELD_ROOTS.has(match.split(".")[0]));
}

/**
 * The rules for one target's built SKILL.md. `config` needs only
 * `skill.tools` and `skill.nonToolTerms`.
 */
export function checkSkill(skill, config, targetName) {
  const bytes = Buffer.byteLength(skill, "utf8");
  if (bytes > SKILL_MAX_BYTES)
    fail(
      "skill",
      `the built ${targetName} SKILL.md is ${bytes} bytes, over the ${SKILL_MAX_BYTES}-byte cap: ` +
        "keep it a router, and put a service's guidance in its playbook on the server",
    );
  const frontmatter = /^---\n([\s\S]*?)\n---\n/.exec(skill);
  if (!frontmatter) fail("skill", "SKILL.md lacks YAML frontmatter");
  const nameLine = /^name:\s*(.+)$/m.exec(frontmatter[1]);
  if (nameLine?.[1].trim() !== SKILL_NAME)
    fail("skill", `skill name must be ${SKILL_NAME} to match its folder`);
  const descriptionLine = /^description:\s*"?(.+?)"?\s*$/m.exec(frontmatter[1]);
  if (!descriptionLine || descriptionLine[1].length > 1024)
    fail("skill", "skill description is missing or over 1024 characters");
  const [code] = serviceCodesIn(skill);
  if (code)
    fail(
      "skill",
      `SKILL.md names ${code}, which has the shape of a service code: the skill names no ` +
        "service (an agent reads each one from wathba_get_service); write a URL with its scheme",
    );
  const declared = new Set(config.skill.tools);
  const allowed = new Set([...declared, ...config.skill.nonToolTerms]);
  for (const [, token] of skill.matchAll(/`([a-z][a-z0-9]*(?:_[a-z0-9]+)+)`/g))
    if (!allowed.has(token))
      fail("skill", `\`${token}\` is not a declared tool in plugin.config.json`);
  for (const tool of declared)
    if (!skill.includes(`\`${tool}\``))
      fail("skill", `declared tool ${tool} does not appear in SKILL.md`);
  if (/\bwathba (login|skill|mcp|install|integrate)\b/i.test(skill) || /npm install/i.test(skill))
    fail("skill", "the shared skill must not depend on the Wathba CLI");
  if (skill.includes("dev-only"))
    fail("skill", "a dev-only marker is unbalanced, so it reached the package");
  if (targetName === "prod" && /\bAI calls?\b|ai_calls|calls\.ai/i.test(skill))
    fail("skill", "the prod skill mentions AI calls, which only DEV has");
}

function buildFiles(config, sources, targetName, version) {
  const target = config.targets[targetName];
  const pluginDir = `plugins/${target.plugin}`;
  const mcpUrl = `${target.apiOrigin}/mcp`;
  const docsUrl = `${target.portalOrigin}/docs/mcp`;
  const author = {
    name: config.publisher.name,
    email: config.publisher.email,
    url: config.publisher.url,
  };
  const description =
    targetName === "prod"
      ? config.description
      : config.description.replace(
          "Connect your coding agent to Wathba",
          "Connect your coding agent to the Wathba development environment",
        );
  const files = new Map();

  const marketplace = json({
    name: target.marketplace,
    owner: author,
    metadata: {
      description: `Official ${target.marketplaceDisplayName} plugin marketplace`,
    },
    plugins: [
      {
        name: target.plugin,
        source: `./${pluginDir}`,
        description,
        category: config.claude.category,
        keywords: config.keywords,
      },
    ],
  });
  files.set(".claude-plugin/marketplace.json", marketplace);
  files.set(
    CURSOR_MARKETPLACE,
    json({
      name: target.marketplace,
      owner: { name: config.publisher.name, email: config.publisher.email },
      metadata: {
        description: `Official ${target.marketplaceDisplayName} plugin marketplace`,
      },
      plugins: [{ name: target.plugin, source: `./${pluginDir}`, description }],
    }),
  );
  files.set(
    ".agents/plugins/marketplace.json",
    json({
      name: target.marketplace,
      interface: { displayName: target.marketplaceDisplayName },
      plugins: [
        {
          name: target.plugin,
          source: { source: "local", path: `./${pluginDir}` },
          policy: {
            installation: config.codex.installation,
            authentication: config.codex.authentication,
          },
          category: config.codex.category,
        },
      ],
    }),
  );
  files.set(
    "contract.json",
    json({
      schemaVersion: "wathba.agent-plugin-contract.v1",
      target: targetName,
      marketplace: target.marketplace,
      plugin: target.plugin,
      serverKey: target.serverKey,
      mcpEndpoint: mcpUrl,
      tools: [...config.skill.tools].sort(),
    }),
  );
  if (targetName === "dev") {
    // The dev branch is a whole marketplace on its own.
    files.set("README.md", sources.devReadme);
    files.set("LICENSE", sources.license);
  }
  if (targetName === "prod") {
    files.set(
      "server.json",
      json({
        $schema: REGISTRY_SCHEMA,
        name: config.registry.name,
        title: config.registry.title,
        description: config.registryDescription,
        version,
        websiteUrl: docsUrl,
        repository: { url: config.repository, source: "github" },
        remotes: [{ type: "streamable-http", url: mcpUrl }],
      }),
    );
  }

  files.set(
    `${pluginDir}/plugin.json`,
    json({
      $schema: AGENT_PLUGIN_SCHEMA,
      name: target.plugin,
      version,
      description,
      author,
      homepage: docsUrl,
      repository: config.repository,
      license: config.license,
      keywords: config.keywords,
      extensions: {
        "com.openai": {
          interface: {
            displayName: target.displayName,
            shortDescription: shortDescriptionFor(config, targetName),
            longDescription: description,
            developerName: config.publisher.name,
            category: config.codex.category,
            capabilities: config.codex.capabilities,
            websiteURL: docsUrl,
            privacyPolicyURL: `${target.portalOrigin}/legal/privacy`,
            termsOfServiceURL: `${target.portalOrigin}/legal/terms`,
            brandColor: config.branding.brandColor,
            composerIcon: `./assets/wathba-icon-${composerIconThemeFor(config, targetName)}.png`,
            composerIconDark: "./assets/wathba-icon-dark.png",
            logo: "./assets/wathba-icon-light.png",
            logoDark: "./assets/wathba-icon-dark.png",
            defaultPrompt: config.codex.defaultPrompt,
          },
        },
      },
    }),
  );
  files.set(
    `${pluginDir}/mcp.json`,
    json({
      $schema: AGENT_MCP_SCHEMA,
      mcpServers: {
        [target.serverKey]: { type: "streamable-http", url: mcpUrl },
      },
    }),
  );
  files.set(
    `${pluginDir}/.claude-plugin/plugin.json`,
    json({
      name: target.plugin,
      displayName: target.displayName,
      version,
      description,
      author,
      homepage: docsUrl,
      repository: config.repository,
      license: config.license,
      keywords: config.keywords,
    }),
  );
  files.set(
    `${pluginDir}/.mcp.json`,
    json({
      mcpServers: { [target.serverKey]: { type: "http", url: mcpUrl } },
    }),
  );
  // Cursor's docs name mcp.json (the Agent Plugins file above); its CLI
  // (2026.11.22) reads .mcp.json first. Both hold the same one server.
  files.set(
    `${pluginDir}/${CURSOR_MANIFEST}`,
    json({
      name: target.plugin,
      displayName: target.displayName,
      version,
      description,
      author: { name: config.publisher.name, email: config.publisher.email },
      homepage: docsUrl,
      repository: config.repository,
      license: config.license,
      keywords: config.keywords,
      logo: CURSOR_LOGO,
    }),
  );
  files.set(
    GEMINI_MANIFEST,
    json({
      name: target.plugin,
      version,
      description,
      // Gemini CLI 0.71.1's validator calls httpUrl deprecated, for this pair.
      mcpServers: { [target.serverKey]: { type: "http", url: mcpUrl } },
    }),
  );
  const skill = skillFor(sources.skill, targetName);
  files.set(`${pluginDir}/skills/${SKILL_NAME}/SKILL.md`, skill);
  files.set(`${ROOT_SKILLS}/${SKILL_NAME}/SKILL.md`, skill);
  files.set(`${pluginDir}/assets/wathba-icon-light.png`, sources.icons[targetName].light);
  files.set(`${pluginDir}/assets/wathba-icon-dark.png`, sources.icons[targetName].dark);
  files.set(
    `${pluginDir}/README.md`,
    pluginReadme(config, target, mcpUrl, docsUrl, targetName),
  );
  return files;
}

// Digest of the tree with the version normalized, so two builds that differ
// only in version share one digest (used to skip no-op DEV publishes).
function contentDigest(config, sources, targetName) {
  const files = buildFiles(config, sources, targetName, "0.0.0");
  const hash = createHash("sha256");
  for (const path of [...files.keys()].sort()) {
    hash.update(`${path}\0`);
    hash.update(files.get(path));
    hash.update("\0");
  }
  return `sha256:${hash.digest("hex")}`;
}

export function build(config, sources, targetName, version) {
  const target = config.targets[targetName];
  const files = buildFiles(config, sources, targetName, version);
  files.set(
    `plugins/${target.plugin}/release.json`,
    json({
      schemaVersion: "wathba.agent-plugin-release.v2",
      target: targetName,
      marketplace: target.marketplace,
      plugin: target.plugin,
      version,
      mcpEndpoint: `${target.apiOrigin}/mcp`,
      portalOrigin: target.portalOrigin,
      credentialMode: "oauth_pkce",
      contentDigest: contentDigest(config, sources, targetName),
    }),
  );
  validate(config, targetName, files, version);
  return files;
}

function text(files, path) {
  const value = files.get(path);
  if (value === undefined) fail("files", `missing ${path}`);
  return Buffer.isBuffer(value) ? value.toString("utf8") : value;
}

function parse(files, path) {
  try {
    return JSON.parse(text(files, path));
  } catch (error) {
    if (error instanceof RuleError) throw error;
    fail("json", `${path} is not valid JSON: ${error.message}`);
  }
}

function exactKeys(object, allowed, where) {
  for (const key of Object.keys(object))
    if (!allowed.includes(key)) fail("schema", `${where} has unexpected key ${key}`);
}

export function validate(config, targetName, files, version) {
  const target = config.targets[targetName];
  const other = config.targets[targetName === "prod" ? "dev" : "prod"];
  const pluginDir = `plugins/${target.plugin}`;
  const mcpUrl = `${target.apiOrigin}/mcp`;

  if (!SEMVER_PATTERN.test(version)) fail("version", `not semver: ${version}`);

  // Catalogs.
  const claudeCatalog = parse(files, ".claude-plugin/marketplace.json");
  if (claudeCatalog.name !== target.marketplace)
    fail("identity", "Claude marketplace name differs from target");
  if (claudeCatalog.plugins?.length !== 1)
    fail("identity", "Claude marketplace must list exactly one plugin");
  const claudeEntry = claudeCatalog.plugins[0];
  if (claudeEntry.name !== target.plugin || claudeEntry.source !== `./${pluginDir}`)
    fail("identity", "Claude marketplace entry name or source differs");
  if ("version" in claudeEntry)
    fail("version", "the Claude marketplace entry must not repeat the version");
  const cursorCatalog = parse(files, CURSOR_MARKETPLACE);
  exactKeys(cursorCatalog, ["name", "owner", "metadata", "plugins"], CURSOR_MARKETPLACE);
  exactKeys(cursorCatalog.owner ?? {}, ["name", "email"], `${CURSOR_MARKETPLACE} owner`);
  if (cursorCatalog.name !== target.marketplace || cursorCatalog.plugins?.length !== 1)
    fail("identity", "Cursor marketplace name or plugin count differs");
  exactKeys(cursorCatalog.plugins[0], ["name", "source", "description"], `${CURSOR_MARKETPLACE} entry`);
  if (cursorCatalog.plugins[0].name !== target.plugin || cursorCatalog.plugins[0].source !== `./${pluginDir}`)
    fail("identity", "Cursor marketplace entry name or source differs");

  const codexCatalog = parse(files, ".agents/plugins/marketplace.json");
  if (codexCatalog.name !== target.marketplace || codexCatalog.plugins?.length !== 1)
    fail("identity", "Codex marketplace name or plugin count differs");
  const codexEntry = codexCatalog.plugins[0];
  if (
    codexEntry.name !== target.plugin ||
    codexEntry.source?.source !== "local" ||
    codexEntry.source?.path !== `./${pluginDir}`
  )
    fail("identity", "Codex marketplace entry name or source differs");
  if (!["AVAILABLE", "INSTALLED_BY_DEFAULT", "NOT_AVAILABLE"].includes(codexEntry.policy?.installation))
    fail("schema", "Codex policy.installation is invalid");
  if (!["ON_INSTALL", "ON_USE"].includes(codexEntry.policy?.authentication))
    fail("schema", "Codex policy.authentication is invalid");

  // Portable manifest (Codex and Agent Plugins clients).
  const portable = parse(files, `${pluginDir}/plugin.json`);
  if (portable.$schema !== AGENT_PLUGIN_SCHEMA)
    fail("schema", "plugin.json must declare the Agent Plugins 1.0.0 schema");
  exactKeys(
    portable,
    ["$schema", "name", "version", "description", "author", "homepage", "repository", "license", "keywords", "extensions"],
    "plugin.json",
  );
  if (portable.name !== target.plugin) fail("identity", "plugin.json name differs");
  if (portable.version !== version) fail("version", "plugin.json version differs");
  const openai = portable.extensions?.["com.openai"]?.interface;
  if (!openai) fail("schema", "plugin.json lacks extensions.com.openai.interface");
  if (openai.displayName !== target.displayName)
    fail("identity", "Codex displayName differs from target");
  if ((openai.defaultPrompt ?? []).length > 3)
    fail("schema", "Codex allows at most 3 default prompts");
  for (const key of ["composerIcon", "composerIconDark", "logo", "logoDark"]) {
    const path = openai[key];
    if (!path?.startsWith("./") || !files.has(`${pluginDir}/${path.slice(2)}`))
      fail("paths", `Codex ${key} must be a ./ path inside the plugin`);
  }

  // Claude manifest.
  const claudeManifest = parse(files, `${pluginDir}/.claude-plugin/plugin.json`);
  if (claudeManifest.name !== target.plugin)
    fail("identity", "Claude plugin.json name differs");
  if (claudeManifest.version !== version)
    fail("version", "Claude plugin.json version differs");

  // Cursor manifest: same identity, a logo inside the plugin, and no
  // component paths, so Cursor discovers the plugin's skill and MCP config.
  const cursorManifest = parse(files, `${pluginDir}/${CURSOR_MANIFEST}`);
  exactKeys(cursorManifest, CURSOR_MANIFEST_KEYS, `Cursor ${CURSOR_MANIFEST}`);
  exactKeys(cursorManifest.author ?? {}, ["name", "email"], `Cursor ${CURSOR_MANIFEST} author`);
  if (cursorManifest.name !== target.plugin || cursorManifest.displayName !== target.displayName)
    fail("identity", "Cursor plugin.json name or displayName differs");
  if (cursorManifest.version !== version) fail("version", "Cursor plugin.json version differs");
  if (!files.has(`${pluginDir}/${cursorManifest.logo}`))
    fail("paths", "Cursor logo must be a path inside the plugin");

  // Gemini CLI extension at the root: one server by its key, nothing else.
  const gemini = parse(files, GEMINI_MANIFEST);
  exactKeys(gemini, ["name", "version", "description", "mcpServers"], GEMINI_MANIFEST);
  if (gemini.name !== target.plugin) fail("identity", `${GEMINI_MANIFEST} name differs`);
  if (gemini.version !== version) fail("version", `${GEMINI_MANIFEST} version differs`);
  const geminiServers = Object.entries(gemini.mcpServers ?? {});
  if (geminiServers.length !== 1 || geminiServers[0][0] !== target.serverKey)
    fail("mcp", `${GEMINI_MANIFEST} must hold exactly the ${target.serverKey} server`);
  exactKeys(geminiServers[0][1], ["type", "url"], `${GEMINI_MANIFEST} server`);
  if (geminiServers[0][1].type !== "http" || geminiServers[0][1].url !== mcpUrl)
    fail("mcp", `${GEMINI_MANIFEST} must point http at ${mcpUrl}`);
  if (
    text(files, `${ROOT_SKILLS}/${SKILL_NAME}/SKILL.md`) !==
    text(files, `${pluginDir}/skills/${SKILL_NAME}/SKILL.md`)
  )
    fail("skill", "the root skills/ copy (Gemini CLI) differs from the plugin's skill");

  // MCP configs: one server, the target URL, nothing else.
  const portableMcp = parse(files, `${pluginDir}/mcp.json`);
  exactKeys(portableMcp, ["$schema", "mcpServers"], "mcp.json");
  if (portableMcp.$schema !== AGENT_MCP_SCHEMA)
    fail("schema", "mcp.json must declare the Agent Plugins MCP schema");
  const claudeMcp = parse(files, `${pluginDir}/.mcp.json`);
  exactKeys(claudeMcp, ["mcpServers"], ".mcp.json");
  for (const [path, config_, type] of [
    ["mcp.json", portableMcp, "streamable-http"],
    [".mcp.json", claudeMcp, "http"],
  ]) {
    const servers = Object.entries(config_.mcpServers ?? {});
    if (servers.length !== 1 || servers[0][0] !== target.serverKey)
      fail("mcp", `${path} must hold exactly the ${target.serverKey} server`);
    exactKeys(servers[0][1], ["type", "url"], `${path} server`);
    if (servers[0][1].type !== type || servers[0][1].url !== mcpUrl)
      fail("mcp", `${path} must point ${type} at ${mcpUrl}`);
  }

  // Skill.
  checkSkill(text(files, `${pluginDir}/skills/${SKILL_NAME}/SKILL.md`), config, targetName);

  // Contract and icon.
  const contract = parse(files, "contract.json");
  if (contract.mcpEndpoint !== mcpUrl || contract.plugin !== target.plugin)
    fail("contract", "contract.json identity differs");
  for (const theme of ["light", "dark"]) {
    const icon = files.get(`${pluginDir}/assets/wathba-icon-${theme}.png`);
    if (!Buffer.isBuffer(icon) || sha256(icon) !== iconsFor(config, targetName)[theme].sha256)
      fail("icon", `packaged ${theme} icon does not match branding.icons.${theme}.sha256`);
  }

  // Registry entry (production only).
  if (targetName === "prod") {
    const server = parse(files, "server.json");
    if (server.version !== version || server.remotes?.[0]?.url !== mcpUrl)
      fail("registry", "server.json version or remote URL differs");
  } else if (files.has("server.json")) {
    fail("registry", "only the production build publishes server.json");
  }

  // Environment isolation and secrets, across every text file.
  const otherMarkers = [
    other.apiOrigin,
    other.portalOrigin,
    `${other.plugin}@${other.marketplace}`,
  ];
  // Quoted identities, except ones that are also shared keywords ("wathba").
  for (const name of [other.marketplace, other.plugin, other.serverKey])
    if (!config.keywords.includes(name)) otherMarkers.push(`"${name}"`);
  for (const [path, value] of files) {
    if (Buffer.isBuffer(value)) continue;
    for (const marker of otherMarkers)
      if (value.includes(marker))
        fail("isolation", `${path} contains ${marker} from the other environment`);
    for (const marker of SECRET_MARKERS)
      if (value.includes(marker))
        fail("secrets", `${path} contains the forbidden marker ${marker}`);
  }
}

async function writeTree(outDir, files, targetName, config) {
  const target = config.targets[targetName];
  const owned = [...MARKETPLACE_FILES, ROOT_SKILLS, `plugins/${target.plugin}`];
  if (targetName === "prod") owned.push("server.json");
  if (targetName === "dev") owned.push("README.md", "LICENSE");
  for (const path of owned) await rm(join(outDir, path), { recursive: true, force: true });
  for (const [path, value] of files) {
    const destination = join(outDir, path);
    await mkdir(dirname(destination), { recursive: true });
    await writeFile(destination, value);
  }
}

async function readTree(dir, prefix) {
  const files = new Map();
  async function walk(current) {
    if (!existsSync(current)) return;
    for (const entry of await readdir(current, { withFileTypes: true })) {
      const full = join(current, entry.name);
      if (entry.isDirectory()) await walk(full);
      else files.set(relative(dir, full).split(sep).join("/"), await readFile(full));
    }
  }
  await walk(join(dir, prefix));
  return files;
}

function sameBytes(a, b) {
  return Buffer.compare(Buffer.from(a), Buffer.from(b)) === 0;
}

async function compareRoot(config, files) {
  const target = config.targets[config.rootTarget];
  const trees = [`plugins/${target.plugin}`, ROOT_SKILLS];
  const committed = new Map();
  for (const tree of trees)
    for (const [path, value] of await readTree(ROOT, tree)) committed.set(path, value);
  const problems = [];
  for (const path of UNOWNED_HOST_PATHS)
    if (!files.has(path) && existsSync(join(ROOT, path)))
      problems.push(`unexpected ${path}: Gemini CLI or Cursor would load it from the repository root`);
  for (const path of [...MARKETPLACE_FILES, "server.json"]) {
    if (!files.has(path)) continue;
    const full = join(ROOT, path);
    if (!existsSync(full)) problems.push(`missing ${path}`);
    else if (!sameBytes(await readFile(full), files.get(path))) problems.push(`stale ${path}`);
  }
  for (const [path, value] of files) {
    if (!trees.some((tree) => path.startsWith(`${tree}/`))) continue;
    if (!committed.has(path)) problems.push(`missing ${path}`);
    else if (!sameBytes(committed.get(path), value)) problems.push(`stale ${path}`);
  }
  for (const path of committed.keys())
    if (!files.has(path)) problems.push(`unexpected ${path}`);
  if (problems.length > 0)
    fail(
      "root",
      `committed ${config.rootTarget} output differs from a fresh build; run ` +
        `\`node scripts/sync.mjs build --target ${config.rootTarget} --out .\`:\n  ${problems.join("\n  ")}`,
    );
}

function compareSemver(a, b) {
  const [, aMaj, aMin, aPat, aPre] = SEMVER_PATTERN.exec(a);
  const [, bMaj, bMin, bPat, bPre] = SEMVER_PATTERN.exec(b);
  for (const [x, y] of [[aMaj, bMaj], [aMin, bMin], [aPat, bPat]])
    if (Number(x) !== Number(y)) return Number(x) - Number(y);
  if (aPre === bPre) return 0;
  if (aPre === undefined) return 1;
  if (bPre === undefined) return -1;
  return aPre < bPre ? -1 : 1;
}

function git(...args) {
  return execFileSync("git", args, { cwd: ROOT, encoding: "utf8" }).trim();
}

async function versionRule(config, base) {
  if (!config.rootTarget) {
    console.log("version-rule: no generated root yet; nothing to check");
    return;
  }
  const target = config.targets[config.rootTarget];
  const paths = [...MARKETPLACE_FILES, "server.json", ROOT_SKILLS, `plugins/${target.plugin}`];
  let changed = true;
  try {
    git("diff", "--quiet", base, "--", ...paths);
    changed = false;
  } catch {
    changed = true;
  }
  if (!changed) {
    console.log("version-rule: published output unchanged");
    return;
  }
  // Compare with what the base actually publishes, not its config.
  const baseVersion = JSON.parse(
    git("show", `${base}:plugins/${target.plugin}/.claude-plugin/plugin.json`),
  ).version;
  if (compareSemver(config.version, baseVersion) <= 0)
    fail(
      "version",
      `the published plugin changed but version ${config.version} is not greater than ${baseVersion}; bump plugin.config.json`,
    );
  console.log(`version-rule: ${baseVersion} -> ${config.version}`);
}

function parseArgs(argv) {
  const [command, ...rest] = argv;
  const options = {};
  for (let i = 0; i < rest.length; i += 2) {
    if (!rest[i].startsWith("--") || rest[i + 1] === undefined)
      fail("usage", `bad argument ${rest[i]}`);
    options[rest[i].slice(2)] = rest[i + 1];
  }
  return { command, options };
}

async function main() {
  const { command, options } = parseArgs(process.argv.slice(2));
  const config = await loadConfig();
  const sources = await loadSources(config);
  const targetName = options.target;
  if (options.target !== undefined && !(targetName in config.targets))
    fail("usage", "--target must be dev or prod");

  switch (command) {
    case "build": {
      if (!targetName || !options.out) fail("usage", "build needs --target and --out");
      const version =
        options.version ?? (targetName === "prod" ? config.version : `${config.version}-dev.0`);
      const files = build(config, sources, targetName, version);
      await writeTree(resolve(options.out), files, targetName, config);
      console.log(
        JSON.stringify({ target: targetName, version, contentDigest: contentDigest(config, sources, targetName) }),
      );
      break;
    }
    case "check": {
      for (const name of ["prod", "dev"]) {
        const version = name === "prod" ? config.version : `${config.version}-dev.0`;
        const files = build(config, sources, name, version);
        if (config.rootTarget === name) await compareRoot(config, files);
      }
      console.log("check: prod and dev builds pass every rule");
      break;
    }
    case "digest": {
      if (!targetName) fail("usage", "digest needs --target");
      console.log(contentDigest(config, sources, targetName));
      break;
    }
    case "version-rule": {
      if (!options.base) fail("usage", "version-rule needs --base");
      await versionRule(config, options.base);
      break;
    }
    default:
      fail("usage", "command must be build, check, digest or version-rule");
  }
}

// Run only as a script, so sync.test.mjs can import the rules. Both sides are
// real paths: a symlinked checkout must still run (sync.test.mjs checks it).
if (process.argv[1] && realpathSync(process.argv[1]) === fileURLToPath(import.meta.url))
  main().catch((error) => {
    console.error(error instanceof RuleError ? error.message : error);
    process.exit(1);
  });
